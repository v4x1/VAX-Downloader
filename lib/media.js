'use strict';

const { spawn } = require('node:child_process');
const { promises: fs, existsSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { URL } = require('node:url');
const {
  SecurityError,
  createOutboundProxy,
  resolvePublicAddresses,
  canonicalHost,
} = require('./security');

const activeChildren = new Set();

class MediaError extends Error {
  constructor(code, status = 422, internalMessage = '') {
    super(internalMessage || code);
    this.name = 'MediaError';
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, fallback, maxLength = 300) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function parseHeight(format) {
  const height = Number(format?.height);
  if (Number.isInteger(height) && height > 0 && height <= 8640) return height;
  const match = String(format?.resolution || '').match(/\d{2,5}\s*[x×]\s*(\d{2,5})/i);
  if (match) {
    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 8640 ? parsed : null;
  }
  return null;
}

function bitrateFor(format) {
  const values = [format?.tbr, format?.vbr, format?.abr]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function estimateFormatBytes(format, duration) {
  const exact = Number(format?.filesize);
  const approximate = Number(format?.filesize_approx);
  if (Number.isFinite(exact) && exact > 0) return exact;
  if (Number.isFinite(approximate) && approximate > 0) return approximate;
  const bitrate = bitrateFor(format);
  if (bitrate > 0 && Number.isFinite(duration) && duration > 0) {
    return (bitrate * 1000 * duration) / 8;
  }
  return null;
}

function formatExt(format) {
  return String(format?.ext || '').toLowerCase();
}

function hasVideo(format) {
  return Boolean(format && format.vcodec && format.vcodec !== 'none');
}

function hasAudio(format) {
  return Boolean(format && format.acodec && format.acodec !== 'none');
}

function qualitySize(formatsAtHeight, allFormats, height, target, duration) {
  const combined = formatsAtHeight
    .filter(hasAudio)
    .sort((a, b) => bitrateFor(b) - bitrateFor(a));
  if (combined.length) {
    const total = estimateFormatBytes(combined[0], duration);
    if (total !== null) return Math.round(total);
  }

  const sourceExts = target === 'mp4' ? new Set(['mp4', 'm4v', 'mov']) : new Set(['webm']);
  const videoCandidates = formatsAtHeight
    .filter(hasVideo)
    .sort((a, b) => {
      const extBias = Number(sourceExts.has(formatExt(b))) - Number(sourceExts.has(formatExt(a)));
      return extBias || bitrateFor(b) - bitrateFor(a);
    });
  const bestVideoSize = estimateFormatBytes(videoCandidates[0], duration);
  const audioCandidates = allFormats
    .filter(hasAudio)
    .sort((a, b) => bitrateFor(b) - bitrateFor(a));
  const bestAudioSize = estimateFormatBytes(audioCandidates[0], duration);
  if (bestVideoSize !== null && bestAudioSize !== null) return Math.round(bestVideoSize + bestAudioSize);
  if (bestVideoSize !== null) return Math.round(bestVideoSize);
  return null;
}

function hasCompatibleAudio(formatsAtHeight, allFormats, target) {
  if (formatsAtHeight.some(hasAudio)) return true;
  const audioFormats = allFormats.filter(hasAudio);
  if (!audioFormats.length) return true; // Silent source video is still a valid video download.
  if (target === 'mp4') {
    return audioFormats.some((format) =>
      ['m4a', 'mp4', 'm4v', 'mov'].includes(formatExt(format)) || /^(mp4a|aac|ac3|eac3)/i.test(format.acodec || '')
    );
  }
  return audioFormats.some((format) =>
    formatExt(format) === 'webm' || /^(opus|vorbis)/i.test(format.acodec || '')
  );
}

function normalizeVideoFormats(info, formats, duration) {
  const byHeight = new Map();
  for (const format of formats) {
    if (!hasVideo(format)) continue;
    const height = parseHeight(format);
    if (!height) continue;
    if (!byHeight.has(height)) byHeight.set(height, []);
    byHeight.get(height).push(format);
  }

  const result = [];
  for (const [height, formatsAtHeight] of byHeight) {
    const sourceExts = new Set(formatsAtHeight.map(formatExt));
    const targets = [];
    if (['mp4', 'm4v', 'mov'].some((extension) => sourceExts.has(extension)) && hasCompatibleAudio(formatsAtHeight, formats, 'mp4')) {
      targets.push('mp4');
    }
    if (sourceExts.has('webm') && hasCompatibleAudio(formatsAtHeight, formats, 'webm')) {
      targets.push('webm');
    }

    for (const format of targets) {
      result.push({
        height,
        format,
        sizeBytes: qualitySize(formatsAtHeight, formats, height, format, duration),
      });
    }
  }

  return result.sort((a, b) => b.height - a.height || a.format.localeCompare(b.format));
}

// X's progressive MP4 variants often omit codec fields entirely. Unlike an explicit
// acodec: 'none', that is unknown rather than proof that the video is silent. Only use
// this fallback for X's HTTP MP4 variants, not HLS/video-only tracks or other sites.
function possibleXAudio(format) {
  return formatExt(format) === 'mp4'
    && /^http(?:-|$)/.test(String(format.format_id || ''))
    && !format.acodec
    && !format.vcodec;
}

function normalizeAudioFormats(formats, duration, platformKey = '') {
  const candidates = formats.filter((format) => hasAudio(format)
    || (platformKey === 'twitter' && possibleXAudio(format)));
  if (!candidates.length) return [];
  const bestAudio = candidates
    .sort((a, b) => bitrateFor(b) - bitrateFor(a))[0];
  const sourceEstimate = estimateFormatBytes(bestAudio, duration);
  const sourceBitrate = bitrateFor(bestAudio);
  const audio = [
    { format: 'mp3', quality: 320, bitrate: 320 },
    { format: 'mp3', quality: 256, bitrate: 256 },
    { format: 'mp3', quality: 192, bitrate: 192 },
    { format: 'mp3', quality: 128, bitrate: 128 },
    { format: 'wav', quality: null, bitrate: 1411 },
    { format: 'm4a', quality: null, bitrate: 192 },
  ];

  return audio.map((item) => {
    let sizeBytes = null;
    if (Number.isFinite(duration) && duration > 0) {
      if (item.format === 'wav') {
        // Approximation: 44.1 kHz, 16-bit stereo PCM (about 1,411 kbps).
        sizeBytes = Math.round(duration * 44_100 * 2 * 2);
      } else {
        const kbps = item.bitrate || Math.max(64, Math.min(320, sourceBitrate || 192));
        sizeBytes = Math.round((kbps * 1000 * duration) / 8);
      }
    } else if (item.format === 'm4a' && sourceEstimate !== null) {
      sizeBytes = Math.round(sourceEstimate);
    }
    return { ...item, sizeBytes };
  });
}

function platformFor(info, hostname) {
  const extractor = String(info?.extractor_key || info?.extractor || '').toLowerCase();
  const host = canonicalHost(hostname || '');
  const aliases = [
    ['youtube', /youtube|youtu\.be/],
    ['tiktok', /tiktok/],
    ['instagram', /instagram/],
    ['telegram', /telegram|t\.me/],
    ['twitter', /twitter|x\.com/],
    ['facebook', /facebook|fb\.watch/],
    ['soundcloud', /soundcloud/],
    ['vimeo', /vimeo/],
    ['reddit', /reddit/],
  ];
  for (const [key, pattern] of aliases) {
    if (pattern.test(extractor) || pattern.test(host)) return key;
  }
  const display = cleanText(info?.extractor_key || info?.extractor || host, 'web', 48)
    .replace(/(?:Playlist|IE|API)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
  return { key: 'other', name: display || 'web' };
}

function safeDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 && duration <= 7 * 24 * 60 * 60 ? Math.round(duration) : null;
}

async function publicThumbnail(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = canonicalHost(url.hostname);
    if (!host || (net.isIP(host) && net.isIP(host) === 6 && host.startsWith('fe80'))) return null;
    await resolvePublicAddresses(host);
    return url.toString();
  } catch {
    return null;
  }
}

async function chooseThumbnail(info) {
  const candidates = [];
  if (typeof info?.thumbnail === 'string') candidates.push(info.thumbnail);
  if (Array.isArray(info?.thumbnails)) {
    const sorted = [...info.thumbnails].sort((a, b) => (Number(b?.width) || 0) - (Number(a?.width) || 0));
    for (const thumbnail of sorted) {
      if (typeof thumbnail?.url === 'string') candidates.push(thumbnail.url);
    }
  }
  for (const candidate of candidates.slice(0, 8)) {
    const safe = await publicThumbnail(candidate);
    if (safe) return safe;
  }
  return null;
}

function createPublicMetadata(info, originalUrl) {
  const rawFormats = Array.isArray(info?.formats) ? info.formats : [];
  if (!rawFormats.length && (info?.vcodec || info?.acodec)) rawFormats.push(info);
  const duration = safeDuration(info?.duration);
  let hostname = '';
  try { hostname = new URL(originalUrl).hostname; } catch { /* validated earlier */ }
  const platform = platformFor(info, hostname);
  return {
    title: cleanText(info?.title, 'Untitled media'),
    uploader: cleanText(info?.uploader || info?.channel || info?.creator, 'Unknown creator', 120),
    duration,
    thumbnail: null,
    platformKey: typeof platform === 'string' ? platform : platform.key,
    platformName: typeof platform === 'string' ? '' : platform.name,
    videoFormats: normalizeVideoFormats(info, rawFormats, duration),
    audioFormats: normalizeAudioFormats(rawFormats, duration, typeof platform === 'string' ? platform : platform.key),
  };
}

async function extractPublicMetadata(info, originalUrl) {
  const metadata = createPublicMetadata(info, originalUrl);
  metadata.thumbnail = await chooseThumbnail(info);
  return metadata;
}

function classifyExtractorError(stderr = '') {
  const text = String(stderr).toLowerCase();
  if (/ffmpeg.*(?:not found|not installed|not available)|ffprobe.*(?:not found|not installed)|you have requested.*ffmpeg/.test(text)) return 'tool_missing';
  if (/unsupported url|no suitable extractor|unsupported site|not a valid url/.test(text)) return 'unsupported_site';
  // Checked before private content: a wall answers a public video with a sign-in prompt, a
  // captcha, or a rate limit when the site distrusts the server's address (common on cloud
  // hosts). The YouTube-only wordings — a rejected player response, a refused address, or
  // streams withheld behind a PO token — count as a wall too, and only when the line actually
  // comes from the YouTube extractor.
  if (BLOCK_SIGNALS.test(text) || (/\[youtube\]/.test(text) && YOUTUBE_WALL_SIGNALS.test(text))) return 'source_blocked';
  if (/private|members.only|sign in|login required|age.restricted|subscriber.only|drm|paywall|requires authentication/.test(text)) return 'private_content';
  if (/video unavailable|not available|removed|deleted|does not exist|content is unavailable|unavailable for this account|geo.restricted/.test(text)) return 'unavailable_content';
  if (/timed out|timeout|temporary failure|network is unreachable|connection reset|connection refused|unable to download|http error 5\d\d|name or service not known|could not resolve/.test(text)) return 'network_error';
  return 'unavailable_content';
}

function boundedCapture(bufferList, currentBytes, chunk, limit) {
  if (currentBytes + chunk.length > limit) return { exceeded: true, bytes: currentBytes };
  bufferList.push(chunk);
  return { exceeded: false, bytes: currentBytes + chunk.length };
}

/**
 * Optional, operator-set yt-dlp flags read from the environment so a deployment can tune
 * extraction (YouTube player clients, cookies, PO-token plugins, request pacing) without
 * editing code. Only fixed, known-safe flags are ever emitted — nothing here can move
 * yt-dlp's traffic off the pinned loopback proxy — and the flags are placed before the
 * `--proxy` argument so they cannot replace it.
 */
function ytDlpEnvironmentArgs() {
  const args = [];

  const cookies = (process.env.YTDLP_COOKIES || '').trim();
  if (cookies) {
    // A path that cannot be read would fail every site, not just YouTube, so verify it first.
    if (existsSync(cookies)) args.push('--cookies', cookies);
    else console.warn('[VAX] YTDLP_COOKIES is set but the file cannot be read; ignoring it.');
  }

  const pluginDirs = (process.env.YTDLP_PLUGIN_DIRS || '').trim();
  if (pluginDirs) args.push('--plugin-dirs', pluginDirs);

  const extractorArgs = (process.env.YTDLP_EXTRACTOR_ARGS || '').trim();
  if (extractorArgs) args.push('--extractor-args', extractorArgs);

  const sleepRequests = Number(process.env.YTDLP_SLEEP_REQUESTS);
  if (Number.isFinite(sleepRequests) && sleepRequests > 0 && sleepRequests <= 600) {
    args.push('--sleep-requests', String(sleepRequests));
  }

  const limitRate = (process.env.YTDLP_LIMIT_RATE || '').trim();
  if (/^\d+(?:\.\d+)?[kmgt]?$/i.test(limitRate)) args.push('--limit-rate', limitRate);

  return args;
}

const YOUTUBE_MEDIA_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
// yt-dlp relays a site's refusals in several wordings. A 429, a captcha, a "not a bot" page, or a
// 403 on the request is the same wall seen from different sides, and every extractor can raise
// them.
const BLOCK_SIGNALS = /not a bot|captcha|rate.limited|too many requests|http error 429|http error 403|blocked by youtube|bot check|botguard/i;
// Wordings only YouTube's extractor produces: a player response it rejects, streams withheld
// behind a proof-of-origin (PO) token, or nothing left to download once those streams are
// skipped. They are answered the same way as the wall above — by asking again with other clients.
const YOUTUBE_WALL_SIGNALS = /player responses? (?:are|is) invalid|failed to extract any player response|no video formats found|po token|missing pot/i;
const YOUTUBE_BLOCK_SIGNALS = new RegExp(`${BLOCK_SIGNALS.source}|${YOUTUBE_WALL_SIGNALS.source}`, 'i');

function isYouTubeMediaUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return YOUTUBE_MEDIA_HOSTS.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isYouTubeBlockMessage(stderr) {
  return YOUTUBE_BLOCK_SIGNALS.test(String(stderr || ''));
}

/**
 * The player clients to ask with when YouTube refuses the ones yt-dlp picked itself. YouTube
 * scores every client separately, so a list that is refused on one server is often accepted on
 * another. These are ordered for a data-center address:
 *  - `players` is the pair YouTube challenges least and that needs no PO token at all, so the
 *    streams it returns can be downloaded unchanged.
 *  - `api-only` skips the watch page, the request YouTube usually challenges first, and keeps
 *    `visionos`, the only client that needs neither a PO token nor a JavaScript runtime.
 *  - `permissive` accepts the streams YouTube withholds without a PO token
 *    (`formats=missing_pot`). Those may answer 403 when downloaded, but a link that offers
 *    formats is more useful than an error, and the download step re-runs this walk on 403.
 */
const YOUTUBE_RETRY_STRATEGIES = [
  { name: 'players', value: 'player_client=web_embedded,tv_downgraded' },
  { name: 'api-only', value: 'player_client=visionos,tv,web_embedded;player_skip=webpage' },
  { name: 'permissive', value: 'player_client=web_embedded,tv_downgraded;formats=missing_pot' },
];

const MAX_YOUTUBE_STRATEGIES = 4;
const MIN_RETRY_BUDGET_MS = 5_000;

/**
 * Accepts only `key=value` pairs for the `youtube:` extractor, so an environment variable
 * cannot smuggle in an extra yt-dlp option (for example `--exec`). Arguments are spawned
 * without a shell, and this keeps them from meaning anything else to yt-dlp.
 */
function youtubeExtractorArgsValue(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 400) return null;
  if (!/^[a-z0-9_,;.=+-]+$/i.test(text)) return null;
  if (!text.split(';').every((part) => /^[a-z0-9_]+=.+$/i.test(part))) return null;
  return text;
}

/**
 * Every retry to run, in order. Set YTDLP_YOUTUBE_STRATEGIES to a `|`-separated list of
 * `youtube:` values to replace the list, YTDLP_YOUTUBE_CLIENTS to replace it with a single
 * retry that uses exactly those clients, or YTDLP_YOUTUBE_CLIENTS=off to disable retries.
 */
function youtubeRetryStrategies() {
  const configured = (process.env.YTDLP_YOUTUBE_STRATEGIES || '').trim();
  if (configured) {
    if (/^(off|none|false|0)$/i.test(configured)) return [];
    const strategies = [];
    for (const entry of configured.split('|').slice(0, MAX_YOUTUBE_STRATEGIES)) {
      const value = youtubeExtractorArgsValue(entry);
      if (!value) {
        console.warn('[VAX] YTDLP_YOUTUBE_STRATEGIES has an entry that is not a youtube: key=value list; ignoring it.');
        continue;
      }
      strategies.push({ name: `custom-${strategies.length + 1}`, value });
    }
    return strategies;
  }

  const clients = (process.env.YTDLP_YOUTUBE_CLIENTS || '').trim();
  if (clients) {
    if (/^(off|none|false|0)$/i.test(clients)) return [];
    const configuredClients = clients.split(',').map((client) => client.trim().toLowerCase()).filter(Boolean);
    if (!configuredClients.length || configuredClients.some((client) => !/^[a-z0-9_-]+$/.test(client))) {
      console.warn('[VAX] YTDLP_YOUTUBE_CLIENTS is not a comma-separated client list; ignoring it.');
      return [];
    }
    return [{ name: 'configured', value: `player_client=${configuredClients.join(',')}` }];
  }

  return YOUTUBE_RETRY_STRATEGIES;
}

/** The first retry as yt-dlp arguments, or null when retries are disabled. */
function youtubeFallbackExtractorArgs() {
  const [first] = youtubeRetryStrategies();
  return first ? ['--extractor-args', `youtube:${first.value}`] : null;
}

// Which strategy worked is remembered briefly so the download request that follows an analysis
// reuses the same player clients. That skips a second search through the walls, and it keeps
// the download looking at the same format list the visitor picked from.
const YOUTUBE_STRATEGY_TTL_MS = 15 * 60 * 1000;
const YOUTUBE_STRATEGY_CACHE_LIMIT = 200;
const youtubeStrategyCache = new Map();

function rememberYouTubeStrategy(url, name) {
  if (!name) return;
  youtubeStrategyCache.delete(url);
  youtubeStrategyCache.set(url, { name, expiresAt: Date.now() + YOUTUBE_STRATEGY_TTL_MS });
  while (youtubeStrategyCache.size > YOUTUBE_STRATEGY_CACHE_LIMIT) {
    youtubeStrategyCache.delete(youtubeStrategyCache.keys().next().value);
  }
}

function preferredYouTubeStrategy(url) {
  const remembered = youtubeStrategyCache.get(url);
  if (!remembered) return null;
  if (remembered.expiresAt <= Date.now()) {
    youtubeStrategyCache.delete(url);
    return null;
  }
  return remembered.name;
}

function resetYouTubeStrategyCache() {
  youtubeStrategyCache.clear();
}

/**
 * The attempts to run for one link: yt-dlp's own defaults first, then the alternate clients.
 * Once a strategy has succeeded for this link it is tried first instead, because the defaults
 * that were just refused are the least promising attempt left.
 */
function youtubeAttemptPlan(url) {
  if (!isYouTubeMediaUrl(url)) return [{ name: null }];
  const strategies = youtubeRetryStrategies();
  if (!strategies.length) return [{ name: null }];
  const preferred = preferredYouTubeStrategy(url);
  if (preferred) {
    const first = strategies.find((strategy) => strategy.name === preferred);
    if (first) return [first, ...strategies.filter((strategy) => strategy !== first), { name: null }];
  }
  return [{ name: null }, ...strategies];
}

/**
 * Only the wall is worth retrying: a private, deleted, or region-locked video gets the same
 * answer from every client, and a second attempt would only delay the error the visitor needs.
 * The decision rests on the error's code, not on yt-dlp's stderr: the words that describe a
 * refusal are debug output for the default clients and warnings for the rest, and the server
 * runs yt-dlp quiet, so the text this once depended on is usually not there at all. Every
 * refusal the classifier or the format inspection reports is `source_blocked`, so that code is
 * the signal. An operator who configured extractor args has already chosen the clients to use.
 */
function isRetryableYouTubeError(url, error) {
  return error instanceof MediaError
    && error.code === 'source_blocked'
    && isYouTubeMediaUrl(url)
    && !(process.env.YTDLP_EXTRACTOR_ARGS || '').trim();
}

/**
 * Runs yt-dlp, walking the attempt plan when YouTube refuses this server's address. Every
 * attempt after the first also runs the caller's cleanup, because a refused download can leave
 * partial files behind. The walk is bounded by the caller's overall timeout: the first attempt
 * may use the whole budget, and each retry receives whatever is left of it.
 */
async function runYtDlp(args, options = {}) {
  const url = args[args.length - 1];
  const startedAt = Date.now();
  const budgetMs = options.timeoutMs || 45_000;
  const plan = youtubeAttemptPlan(url);
  let lastError = null;
  let attemptsRun = 0;

  for (const [index, attempt] of plan.entries()) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (index > 0 && remainingMs < MIN_RETRY_BUDGET_MS) break;
    if (index > 0) await options.beforeRetry?.();
    attemptsRun += 1;

    try {
      const result = await executeYtDlp(
        attempt.value ? ['--extractor-args', `youtube:${attempt.value}`, ...args] : args,
        index === 0 ? options : { ...options, timeoutMs: Math.max(MIN_RETRY_BUDGET_MS, remainingMs) },
      );
      // A refusal is not always an exit code: YouTube can answer with a description of the video
      // and no streams. Inspecting here keeps that answer inside the walk, where another client
      // can still turn it into a result.
      options.inspectResult?.(result);
      rememberYouTubeStrategy(url, attempt.name);
      return result;
    } catch (error) {
      lastError = error;
      // The loop decides: only a wall is worth another client list, and the plan ends there.
      if (!isRetryableYouTubeError(url, error)) throw error;
    }
  }

  if (process.env.YTDLP_DEBUG) {
    // The names only: the submitted link and yt-dlp's own output stay out of the log.
    const tried = plan.slice(0, attemptsRun).map((attempt) => attempt.name ?? 'default').join(', ');
    console.warn(`[VAX] yt-dlp refused every YouTube player-client strategy (tried: ${tried}).`);
  }
  throw lastError ?? new MediaError('analysis_failed', 502);
}

async function executeYtDlp(args, options = {}) {
  const binary = process.env.YTDLP_BIN || 'yt-dlp';
  if (options.response && (options.response.destroyed || options.response.writableEnded)) {
    throw new MediaError('client_disconnected', 499);
  }
  const proxy = await createOutboundProxy();
  if (options.response && (options.response.destroyed || options.response.writableEnded)) {
    await proxy.close().catch(() => {});
    throw new MediaError('client_disconnected', 499);
  }
  const timeoutMs = options.timeoutMs || 45_000;
  const maxStdoutBytes = options.maxStdoutBytes || 24 * 1024 * 1024;
  const maxStderrBytes = options.maxStderrBytes || 96 * 1024;

  try {
    return await new Promise((resolve, reject) => {
      const ffmpegLocation = process.env.FFMPEG_BIN;
      const child = spawn(binary, [
        '--ignore-config',
        ...(ffmpegLocation ? ['--ffmpeg-location', ffmpegLocation] : []),
        '--no-cache-dir',
        '--no-warnings',
        '--no-progress',
        '--quiet',
        '--no-playlist',
        '--socket-timeout', '15',
        '--retries', '1',
        '--fragment-retries', '1',
        ...ytDlpEnvironmentArgs(),
        '--proxy', proxy.url,
        ...args,
      ], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          http_proxy: proxy.url,
          https_proxy: proxy.url,
          HTTP_PROXY: proxy.url,
          HTTPS_PROXY: proxy.url,
          ALL_PROXY: proxy.url,
          all_proxy: proxy.url,
          NO_PROXY: '',
          no_proxy: '',
        },
      });
      activeChildren.add(child);

      const stdoutChunks = [];
      const stderrChunks = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timeout;
      let killTimer;
      let sizeMonitor;
      let sizeScanRunning = false;
      let failure = null;
      let settled = false;
      const response = options.response;

      const cleanup = () => {
        clearTimeout(timeout);
        clearTimeout(killTimer);
        clearInterval(sizeMonitor);
        activeChildren.delete(child);
        response?.removeListener('close', onResponseClose);
      };
      const failAndStop = (error) => {
        if (failure) return;
        failure = error;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
        killTimer.unref?.();
      };
      const onResponseClose = () => {
        if (response && !response.writableEnded) failAndStop(new MediaError('client_disconnected', 499));
      };

      response?.once('close', onResponseClose);
      timeout = setTimeout(() => failAndStop(new MediaError('network_error', 422)), timeoutMs);
      timeout.unref?.();
      if (options.outputDir && Number.isFinite(options.maxOutputBytes)) {
        sizeMonitor = setInterval(async () => {
          if (sizeScanRunning || failure || settled) return;
          sizeScanRunning = true;
          try {
            const names = await fs.readdir(options.outputDir);
            const stats = await Promise.all(names.map((name) => fs.lstat(path.join(options.outputDir, name)).catch(() => null)));
            const total = stats.reduce((sum, stat) => sum + (stat?.isFile() ? stat.size : 0), 0);
            if (total > options.maxOutputBytes) failAndStop(new MediaError('file_too_large', 413));
          } catch {
            // A file may be renamed while yt-dlp is finishing; the post-download check remains authoritative.
          } finally {
            sizeScanRunning = false;
          }
        }, 1_000);
        sizeMonitor.unref?.();
      }

      child.stdout.on('data', (chunk) => {
        const result = boundedCapture(stdoutChunks, stdoutBytes, chunk, maxStdoutBytes);
        stdoutBytes = result.bytes;
        if (result.exceeded) failAndStop(new MediaError('analysis_failed', 502));
      });
      child.stderr.on('data', (chunk) => {
        const remaining = maxStderrBytes - stderrBytes;
        if (remaining > 0) {
          const kept = chunk.subarray(0, remaining);
          stderrChunks.push(kept);
          stderrBytes += kept.length;
        }
      });
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error.code === 'ENOENT') reject(new MediaError('tool_missing', 503));
        else reject(new MediaError('network_error', 422));
      });
      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (failure) {
          reject(failure);
        } else if (code !== 0) {
          const error = new MediaError(classifyExtractorError(stderr), 422, stderr.slice(-2_000));
          // The full text is kept off the message (which is logged) but stays available for
          // the YouTube client retry decision, whose signal yt-dlp prints on the last line.
          error.extractorStderr = stderr;
          if (process.env.YTDLP_DEBUG) console.warn(`[VAX] yt-dlp exited with code ${code}: ${stderr.slice(-2_000)}`);
          reject(error);
        } else {
          resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
        }
      });
    });
  } finally {
    await proxy.close().catch(() => {});
  }
}

// A storyboard or an image playlist is not a download: the app needs at least one stream that
// carries video or audio.
function hasUsableFormats(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  return formats.some((format) =>
    (format?.vcodec && format.vcodec !== 'none') || (format?.acodec && format.acodec !== 'none'));
}

function readExtraction(stdout) {
  let info;
  try {
    info = JSON.parse(stdout.toString('utf8'));
  } catch {
    throw new MediaError('analysis_failed', 502);
  }
  if (!info || typeof info !== 'object' || Array.isArray(info)) throw new MediaError('analysis_failed', 502);
  return info;
}

async function analyzeUrl(url, options = {}) {
  let info = null;
  const result = await runYtDlp([
    '--dump-single-json',
    '--skip-download',
    '--',
    url,
  ], {
    timeoutMs: options.timeoutMs,
    response: options.response,
    maxStdoutBytes: 24 * 1024 * 1024,
    inspectResult: ({ stdout, stderr }) => {
      info = readExtraction(stdout);
      if (info._type === 'playlist' && !info.entries?.length) throw new MediaError('unavailable_content', 422);
      if (isYouTubeMediaUrl(url) && !hasUsableFormats(info)) {
        // yt-dlp exits successfully while describing a video whose streams were all withheld,
        // which is how YouTube answers a server it distrusts without a proof-of-origin token.
        // The extractor's words for that are debug output for the default clients and warnings
        // for the rest — and the server runs yt-dlp quiet — so the answer itself is the signal:
        // a video described with no stream left to play is a wall, and the walk goes on with
        // other clients rather than showing an empty result. A description that admits the
        // formats are DRM-protected is private instead; every client answers those the same.
        const code = info._has_drm ? 'private_content' : 'source_blocked';
        const error = new MediaError(code, 422, 'no usable formats');
        error.extractorStderr = stderr;
        throw error;
      }
    },
  });
  return info ?? readExtraction(result.stdout);
}

function videoFormatSelector(height, format) {
  const sourceFormats = format === 'mp4' ? ['mp4', 'm4v', 'mov'] : ['webm'];
  const audioFilters = format === 'mp4'
    ? ['bestaudio[ext=m4a]', 'bestaudio[acodec^=mp4a]', 'bestaudio[acodec^=aac]']
    : ['bestaudio[ext=webm]', 'bestaudio[acodec^=opus]', 'bestaudio[acodec^=vorbis]'];

  const exact = sourceFormats.map((ext) => {
    const paired = audioFilters.map((audio) => `bestvideo[height=${height}][ext=${ext}]+${audio}`).join('/');
    return `${paired}/best[height=${height}][ext=${ext}]/bestvideo[height=${height}][ext=${ext}]`;
  }).join('/');

  // Last resort: the client that ends up serving the download sometimes offers the height in a
  // container the analysis did not list, or offers a lower height instead. Anything at or below
  // the ceiling the visitor chose still beats failing a download they are waiting for.
  return `${exact}/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
}

function audioFormatArgs(format, bitrate) {
  const args = ['--extract-audio', '--audio-format', format];
  if (format === 'mp3') args.push('--audio-quality', `${bitrate}K`);
  if (format === 'm4a') args.push('--audio-quality', '192K');
  return args;
}

async function createDownload(url, selection, options = {}) {
  const tempDir = await fs.mkdtemp(path.join(options.tempRoot || require('node:os').tmpdir(), 'vax-'));
  const outputTemplate = path.join(tempDir, 'media.%(ext)s');
  const maxBytes = options.maxBytes || 2 * 1024 * 1024 * 1024;
  const maxSizeArg = `${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))}M`;

  try {
    const args = [
      '--format', selection.type === 'video'
        ? videoFormatSelector(selection.quality, selection.format)
        : 'bestaudio/best',
      '--output', outputTemplate,
      '--max-filesize', maxSizeArg,
      '--no-continue',
      '--no-overwrites',
    ];

    if (selection.type === 'video') {
      args.push('--merge-output-format', selection.format, '--recode-video', selection.format);
    } else {
      args.push(...audioFormatArgs(selection.format, selection.quality));
    }
    args.push('--', url);

    await runYtDlp(args, {
      timeoutMs: options.timeoutMs || 900_000,
      response: options.response,
      maxStdoutBytes: 1_000_000,
      outputDir: tempDir,
      maxOutputBytes: maxBytes,
      // A blocked attempt can leave partial files behind; --no-overwrites would make the
      // retry fail on the same output name, so start the retry from a clean directory.
      beforeRetry: async () => {
        const names = await fs.readdir(tempDir).catch(() => []);
        await Promise.all(names.map((name) => fs.rm(path.join(tempDir, name), { force: true, recursive: true }).catch(() => {})));
      },
    });

    const names = await fs.readdir(tempDir);
    const files = [];
    for (const name of names) {
      const fullPath = path.join(tempDir, name);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isFile()) files.push({ path: fullPath, name, size: stat.size });
    }
    if (!files.length) throw new MediaError('download_failed', 502);
    files.sort((a, b) => b.size - a.size);
    const file = files.find((candidate) => path.extname(candidate.name).slice(1).toLowerCase() === selection.format) || files[0];
    if (file.size > maxBytes) throw new MediaError('file_too_large', 413);
    return { tempDir, filePath: file.path, fileName: file.name, size: file.size };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function safeFilename(title, extension) {
  const base = String(title || 'vax-download')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'vax-download';
  const safeExtension = /^[a-z0-9]{2,5}$/i.test(extension) ? extension.toLowerCase() : 'bin';
  return `${base}.${safeExtension}`;
}

function contentDisposition(filename) {
  const ascii = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function mediaMime(extension) {
  const map = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
  };
  return map[extension] || 'application/octet-stream';
}

function availableSelection(metadata, selection) {
  if (selection.type === 'video') {
    return metadata.videoFormats.some((item) => item.height === selection.quality && item.format === selection.format);
  }
  return metadata.audioFormats.some((item) => item.format === selection.format && (item.quality ?? null) === (selection.quality ?? null));
}

function stopMediaProcesses() {
  for (const child of activeChildren) child.kill('SIGTERM');
}

function isValidSelection(query) {
  if (!query || typeof query.url !== 'string') return null;
  const type = query.type;
  const format = String(query.format || '').toLowerCase();
  if (type === 'video') {
    const quality = Number(query.quality);
    if (!Number.isInteger(quality) || quality < 1 || quality > 8640) return null;
    if (!['mp4', 'webm'].includes(format)) return null;
    return { type, format, quality };
  }
  if (type === 'audio') {
    const quality = query.quality === undefined || query.quality === '' ? null : Number(query.quality);
    if (!['mp3', 'wav', 'm4a'].includes(format)) return null;
    if (format === 'mp3' && ![128, 192, 256, 320].includes(quality)) return null;
    if (format !== 'mp3' && quality !== null) return null;
    return { type, format, quality };
  }
  return null;
}

/**
 * The installed yt-dlp version, for the startup log. A stale binary explains most YouTube
 * failures long before any client list does, so the server prints what it is actually running.
 */
function ytDlpVersion(options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YTDLP_BIN || 'yt-dlp', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = (error, version) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(version);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new MediaError('tool_missing', 503));
    }, options.timeoutMs || 5_000);
    timer.unref?.();
    child.stdout.on('data', (chunk) => {
      if (output.length < 200) output += chunk.toString('utf8');
    });
    child.once('error', () => finish(new MediaError('tool_missing', 503)));
    child.once('close', (code) => {
      const version = output.trim().slice(0, 80);
      if (code === 0 && version) finish(null, version);
      else finish(new MediaError('tool_missing', 503));
    });
  });
}

module.exports = {
  MediaError,
  analyzeUrl,
  availableSelection,
  classifyExtractorError,
  contentDisposition,
  createDownload,
  createPublicMetadata,
  extractPublicMetadata,
  isYouTubeBlockMessage,
  isYouTubeMediaUrl,
  isValidSelection,
  mediaMime,
  normalizeAudioFormats,
  normalizeVideoFormats,
  safeFilename,
  stopMediaProcesses,
  videoFormatSelector,
  resetYouTubeStrategyCache,
  ytDlpEnvironmentArgs,
  ytDlpVersion,
  youtubeAttemptPlan,
  youtubeFallbackExtractorArgs,
  youtubeRetryStrategies,
};
