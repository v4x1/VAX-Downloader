'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  analyzeUrl,
  createDownload,
  isYouTubeBlockMessage,
  isYouTubeMediaUrl,
  youtubeFallbackExtractorArgs,
} = require('../lib/media');

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// A stand-in for the yt-dlp binary: it refuses the default player clients exactly the way
// YouTube's anti-bot wall does, then succeeds once the fallback clients are requested.
const STUB_SOURCE = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const fallback = args.join(' ').includes('player_client=tv_downgraded');
const outputIndex = args.indexOf('--output');
const outputDir = outputIndex === -1 ? null : path.dirname(args[outputIndex + 1]);

if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, fallback ? 'fallback\\n' : 'default\\n');

if (!fallback) {
  if (outputDir) fs.writeFileSync(path.join(outputDir, 'media.f137.mp4.part'), 'partial');
  process.stderr.write('WARNING: [youtube] dQw4w9WgXcQ: padding to push the error to the last line\\n'.repeat(50));
  process.stderr.write('ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you\\u2019re not a bot. Use --cookies-from-browser or --cookies for the authentication.\\n');
  process.exit(1);
}

if (outputDir) {
  const leftovers = fs.readdirSync(outputDir);
  if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, 'leftovers:' + leftovers.join(',') + '\\n');
  fs.writeFileSync(path.join(outputDir, 'media.mp4'), 'x'.repeat(2048));
}

process.stdout.write(JSON.stringify({
  id: 'dQw4w9WgXcQ',
  title: 'Stub video',
  uploader: 'Stub channel',
  duration: 95,
  extractor: 'youtube',
  formats: [
    { format_id: 'v18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', tbr: 700, filesize: 9_000_000 },
    { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
  ],
}));
process.exit(0);
`;

function withStub(body) {
  if (process.platform === 'win32') return test.skip('the yt-dlp stub needs a POSIX shebang');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vax-stub-'));
  const stubPath = path.join(dir, 'yt-dlp');
  const logPath = path.join(dir, 'attempts.log');
  fs.writeFileSync(stubPath, STUB_SOURCE, { mode: 0o755 });
  const previous = {
    YTDLP_BIN: process.env.YTDLP_BIN,
    YTDLP_YOUTUBE_CLIENTS: process.env.YTDLP_YOUTUBE_CLIENTS,
    YTDLP_EXTRACTOR_ARGS: process.env.YTDLP_EXTRACTOR_ARGS,
    STUB_LOG: process.env.STUB_LOG,
  };
  process.env.YTDLP_BIN = stubPath;
  process.env.STUB_LOG = logPath;
  delete process.env.YTDLP_YOUTUBE_CLIENTS;
  delete process.env.YTDLP_EXTRACTOR_ARGS;

  const attempts = () => {
    const log = fs.readFileSync(logPath, 'utf8').trim();
    return log ? log.split('\n') : [];
  };

  return { attempts, cleanup: () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  } };
}

test('recognizes YouTube hosts and anti-bot refusals', () => {
  for (const url of [YOUTUBE_URL, 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=x']) {
    assert.equal(isYouTubeMediaUrl(url), true, url);
  }
  for (const url of ['https://vimeo.com/76979871', 'https://notyoutube.com/watch?v=x', 'not a url']) {
    assert.equal(isYouTubeMediaUrl(url), false, url);
  }
  assert.equal(isYouTubeBlockMessage('ERROR: [youtube] abc: Your IP is likely being blocked by Youtube'), true);
  assert.equal(isYouTubeBlockMessage('ERROR: [youtube] abc: HTTP Error 403: Forbidden'), true);
  assert.equal(isYouTubeBlockMessage('ERROR: [youtube] abc: Private video.'), false);
});

test('fallback client list is configurable and can be disabled', () => {
  assert.deepEqual(youtubeFallbackExtractorArgs(), [
    '--extractor-args',
    'youtube:player_client=tv_downgraded,web_embedded,web_safari,android,ios',
  ]);

  const previous = process.env.YTDLP_YOUTUBE_CLIENTS;
  process.env.YTDLP_YOUTUBE_CLIENTS = 'tv, android';
  assert.deepEqual(youtubeFallbackExtractorArgs(), ['--extractor-args', 'youtube:player_client=tv,android']);
  process.env.YTDLP_YOUTUBE_CLIENTS = 'off';
  assert.equal(youtubeFallbackExtractorArgs(), null);
  process.env.YTDLP_YOUTUBE_CLIENTS = 'tv;rm -rf';
  assert.equal(youtubeFallbackExtractorArgs(), null);
  if (previous === undefined) delete process.env.YTDLP_YOUTUBE_CLIENTS;
  else process.env.YTDLP_YOUTUBE_CLIENTS = previous;
});

test('retries a bot-walled YouTube analysis once with the fallback player clients', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  const info = await analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 });
  assert.equal(info.title, 'Stub video');
  assert.deepEqual(stub.attempts(), ['default', 'fallback']);
});

test('does not retry other sites, and still reports the block', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  await assert.rejects(() => analyzeUrl('https://vimeo.com/76979871', { timeoutMs: 60_000 }), (error) => {
    assert.equal(error.code, 'source_blocked');
    return true;
  });
  assert.deepEqual(stub.attempts(), ['default']);
});

test('retries a bot-walled download from a clean temporary directory', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  const download = await createDownload(YOUTUBE_URL, { type: 'video', format: 'mp4', quality: 360 }, {
    timeoutMs: 120_000,
    maxBytes: 10 * 1024 * 1024,
  });
  t.after(() => fs.rmSync(download.tempDir, { recursive: true, force: true }));
  assert.equal(download.size, 2048);
  assert.deepEqual(stub.attempts(), ['default', 'fallback', 'leftovers:']);
});
