'use strict';

require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('node:path');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const {
  SecurityError,
  fetchPublicImage,
  validateMediaUrl,
} = require('./lib/security');
const {
  MediaError,
  analyzeUrl,
  availableSelection,
  contentDisposition,
  createDownload,
  createPublicMetadata,
  extractPublicMetadata,
  isValidSelection,
  mediaMime,
  safeFilename,
  stopMediaProcesses,
} = require('./lib/media');

const app = express();
const publicDir = path.join(__dirname, 'public');
const port = boundedInteger(process.env.PORT, 3000, 1, 65_535);
const analyzeTimeoutMs = boundedInteger(process.env.ANALYZE_TIMEOUT_MS, 45_000, 5_000, 120_000);
const downloadTimeoutMs = boundedInteger(process.env.DOWNLOAD_TIMEOUT_MS, 900_000, 30_000, 1_800_000);
const maxDownloadBytes = boundedInteger(process.env.MAX_DOWNLOAD_BYTES, 2 * 1024 * 1024 * 1024, 1_048_576, 20 * 1024 * 1024 * 1024);
const maxConcurrentDownloads = boundedInteger(process.env.MAX_CONCURRENT_DOWNLOADS, 2, 1, 20);
let activeDownloads = 0;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'", 'https://*.e2b.app', 'https://arena.ai', 'https://*.arena.ai'],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: false,
  strictTransportSecurity: process.env.NODE_ENV === 'production'
    ? { maxAge: 31_536_000, includeSubDomains: true }
    : false,
}));
app.use(express.json({ limit: '8kb', strict: true }));

function configuredLimiter(envName, fallback) {
  const limit = boundedInteger(process.env[envName], fallback, 1, 10_000);
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_request, response) {
      response.status(429).json({ ok: false, error: { code: 'rate_limited' } });
    },
  });
}

app.use('/api', configuredLimiter('API_RATE_LIMIT_PER_MINUTE', 60));

const analyzeLimiter = configuredLimiter('ANALYZE_RATE_LIMIT_PER_MINUTE', 12);
const downloadLimiter = configuredLimiter('DOWNLOAD_RATE_LIMIT_PER_MINUTE', 10);
const thumbnailLimiter = configuredLimiter('THUMBNAIL_RATE_LIMIT_PER_MINUTE', 120);

function errorCode(error) {
  if (error instanceof SecurityError || error instanceof MediaError) return error.code;
  return 'server_error';
}

function errorStatus(error) {
  if (error instanceof SecurityError || error instanceof MediaError) return error.status;
  return 500;
}

function sendApiError(response, error, request) {
  if (response.destroyed || response.headersSent || error?.code === 'client_disconnected') return;
  const code = errorCode(error);
  const status = errorStatus(error);
  // Do not log submitted URLs, child-process stderr, or filesystem paths.
  console.warn(`[VAX] ${request.method} ${request.path} failed: ${code}`);
  response.status(status).json({ ok: false, error: { code } });
}

async function readAndAnalyze(url, response) {
  const safeUrl = await validateMediaUrl(url);
  const info = await analyzeUrl(safeUrl, { timeoutMs: analyzeTimeoutMs, response });
  return { safeUrl, info };
}

app.get('/api/health', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json({ ok: true });
});

// Thumbnail previews are fetched server-side through a DNS-pinned HTTPS request so the
// visitor's browser never follows extractor-provided image redirects to a private address.
app.get('/api/thumbnail', thumbnailLimiter, async (request, response) => {
  try {
    if (typeof request.query.url !== 'string' || request.query.url.length > 12_288) {
      response.status(400).end();
      return;
    }
    const image = await fetchPublicImage(request.query.url, { maxBytes: 4 * 1024 * 1024, timeoutMs: 7_000 });
    response.status(200);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Content-Length', String(image.body.length));
    response.setHeader('Cache-Control', 'private, max-age=900');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(image.body);
  } catch (error) {
    if (error?.status === 413) response.status(413).end();
    else response.status(404).end();
  }
});

app.post('/api/analyze', analyzeLimiter, async (request, response) => {
  try {
    const { safeUrl, info } = await readAndAnalyze(request.body?.url, response);
    const media = await extractPublicMetadata(info, safeUrl);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ ok: true, media });
  } catch (error) {
    sendApiError(response, error, request);
  }
});

app.get('/api/download', downloadLimiter, async (request, response) => {
  if (activeDownloads >= maxConcurrentDownloads) {
    response.status(503).json({ ok: false, error: { code: 'server_busy' } });
    return;
  }

  const selection = isValidSelection(request.query);
  if (!selection) {
    response.status(400).json({ ok: false, error: { code: 'invalid_request' } });
    return;
  }

  activeDownloads += 1;
  let download = null;
  try {
    const { safeUrl, info } = await readAndAnalyze(selectionUrl(request.query.url), response);
    const media = createPublicMetadata(info, safeUrl);
    if (!availableSelection(media, selection)) {
      throw new MediaError('unavailable_content', 422);
    }

    download = await createDownload(safeUrl, selection, {
      timeoutMs: downloadTimeoutMs,
      maxBytes: maxDownloadBytes,
      response,
    });

    const extension = selection.format;
    const filename = safeFilename(media.title, extension);
    response.status(200);
    response.setHeader('Content-Type', mediaMime(extension));
    response.setHeader('Content-Length', String(download.size));
    response.setHeader('Content-Disposition', contentDisposition(filename));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    await pipeline(fs.createReadStream(download.filePath), response);
  } catch (error) {
    if (error?.code !== 'client_disconnected') sendApiError(response, error, request);
    if (response.headersSent && !response.writableEnded) response.destroy();
  } finally {
    if (download?.tempDir) {
      await fs.promises.rm(download.tempDir, { recursive: true, force: true }).catch(() => {});
    }
    activeDownloads = Math.max(0, activeDownloads - 1);
  }
});

// This helper intentionally does not alter the submitted URL. validateMediaUrl canonicalizes
// and rejects credentials, fragments, unsafe schemes, private hosts, and nonstandard ports.
function selectionUrl(value) {
  return typeof value === 'string' ? value : '';
}

app.use(express.static(publicDir, {
  extensions: ['html'],
  fallthrough: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(response, filePath) {
    if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use('/api', (_request, response) => {
  response.status(404).json({ ok: false, error: { code: 'not_found' } });
});

app.use((_request, response) => {
  response.status(404).send('Not found');
});

app.use((error, request, response, _next) => {
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ ok: false, error: { code: 'invalid_request' } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ ok: false, error: { code: 'invalid_request' } });
    return;
  }
  sendApiError(response, error, request);
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`VAX Downloader listening on 0.0.0.0:${port}`);
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal) {
  console.log(`VAX Downloader received ${signal}; shutting down.`);
  stopMediaProcesses();
  server.close(() => process.exit(0));
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
