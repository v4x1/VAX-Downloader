'use strict';

const { spawn } = require('node:child_process');
const { promises: fs } = require('node:fs');
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

function normalizeAudioFormats(formats, duration) {
  if (!formats.some(hasAudio)) return [];
  const bestAudio = formats
    .filter(hasAudio)
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
    audioFormats: normalizeAudioFormats(rawFormats, duration),
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
          reject(new MediaError(classifyExtractorError(stderr), 422, stderr.slice(0, 2_000)));
        } else {
          resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
        }
      });
    });
  } finally {
    await proxy.close().catch(() => {});
  }
}

async function analyzeUrl(url, options = {}) {
  const { stdout } = await executeYtDlp([
    '--dump-single-json',
    '--skip-download',
    '--',
    url,
  ], {
    timeoutMs: options.timeoutMs,
    response: options.response,
    maxStdoutBytes: 24 * 1024 * 1024,
  });

  let info;
  try {
    info = JSON.parse(stdout.toString('utf8'));
  } catch {
    throw new MediaError('analysis_failed', 502);
  }
  if (!info || typeof info !== 'object' || Array.isArray(info)) throw new MediaError('analysis_failed', 502);
  if (info._type === 'playlist' && !info.entries?.length) throw new MediaError('unavailable_content', 422);
  return info;
}

function videoFormatSelector(height, format) {
  const sourceFormats = format === 'mp4' ? ['mp4', 'm4v', 'mov'] : ['webm'];
  const audioFilters = format === 'mp4'
    ? ['bestaudio[ext=m4a]', 'bestaudio[acodec^=mp4a]', 'bestaudio[acodec^=aac]']
    : ['bestaudio[ext=webm]', 'bestaudio[acodec^=opus]', 'bestaudio[acodec^=vorbis]'];

  return sourceFormats.map((ext) => {
    const paired = audioFilters.map((audio) => `bestvideo[height=${height}][ext=${ext}]+${audio}`).join('/');
    return `${paired}/best[height=${height}][ext=${ext}]/bestvideo[height=${height}][ext=${ext}]`;
  }).join('/');
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

    await executeYtDlp(args, {
      timeoutMs: options.timeoutMs || 900_000,
      response: options.response,
      maxStdoutBytes: 1_000_000,
      outputDir: tempDir,
      maxOutputBytes: maxBytes,
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

module.exports = {
  MediaError,
  analyzeUrl,
  availableSelection,
  classifyExtractorError,
  contentDisposition,
  createDownload,
  createPublicMetadata,
  extractPublicMetadata,
  isValidSelection,
  mediaMime,
  normalizeAudioFormats,
  normalizeVideoFormats,
  safeFilename,
  stopMediaProcesses,
  videoFormatSelector,
};
