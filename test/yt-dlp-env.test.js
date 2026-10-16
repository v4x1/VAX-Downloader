'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { analyzeUrl, resetYouTubeStrategyCache } = require('../lib/media');

// A stand-in for yt-dlp that records the arguments it was spawned with and answers with a
// minimal video description, so a test can see exactly which operator flags reach the process
// and where the server places them.
const STUB_SOURCE = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + '\\n');
process.stdout.write(JSON.stringify({
  id: 'stub',
  title: 'Stub video',
  extractor: 'Vimeo',
  formats: [
    { format_id: 'v', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', tbr: 700, filesize: 9000000 },
    { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
  ],
}));
process.exit(0);
`;

const MANAGED_KEYS = [
  'YTDLP_BIN', 'STUB_LOG', 'YTDLP_COOKIES', 'YTDLP_PLUGIN_DIRS', 'YTDLP_EXTRACTOR_ARGS',
  'YTDLP_SLEEP_REQUESTS', 'YTDLP_LIMIT_RATE', 'YTDLP_YOUTUBE_CLIENTS', 'YTDLP_YOUTUBE_STRATEGIES',
];

function withStub() {
  if (process.platform === 'win32') return test.skip('the yt-dlp stub needs a POSIX shebang');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vax-env-'));
  const stubPath = path.join(dir, 'yt-dlp');
  const logPath = path.join(dir, 'calls.log');
  fs.writeFileSync(stubPath, STUB_SOURCE, { mode: 0o755 });
  fs.writeFileSync(logPath, '');

  const previous = {};
  for (const key of MANAGED_KEYS) previous[key] = process.env[key];
  process.env.YTDLP_BIN = stubPath;
  process.env.STUB_LOG = logPath;
  for (const key of MANAGED_KEYS) {
    if (!['YTDLP_BIN', 'STUB_LOG'].includes(key)) delete process.env[key];
  }
  resetYouTubeStrategyCache();

  return {
    dir,
    // Every spawned invocation as the argv list yt-dlp received.
    calls: () => {
      const text = fs.readFileSync(logPath, 'utf8').trim();
      return text ? text.split('\n').map((line) => JSON.parse(line)) : [];
    },
    cleanup: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetYouTubeStrategyCache();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('passes operator tuning flags to yt-dlp, before the proxy they may not replace', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  const cookiesPath = path.join(stub.dir, 'cookies.txt');
  fs.writeFileSync(cookiesPath, '# Netscape HTTP Cookie File\n');
  process.env.YTDLP_COOKIES = cookiesPath;
  process.env.YTDLP_PLUGIN_DIRS = 'default';
  process.env.YTDLP_EXTRACTOR_ARGS = 'youtube:player_client=tv';
  process.env.YTDLP_SLEEP_REQUESTS = '2';
  process.env.YTDLP_LIMIT_RATE = '2M';

  const info = await analyzeUrl('https://vimeo.com/76979871', { timeoutMs: 15_000 });
  assert.equal(info.title, 'Stub video');

  const calls = stub.calls();
  assert.equal(calls.length, 1);
  const [argv] = calls;
  const proxyAt = argv.indexOf('--proxy');
  assert.equal(proxyAt >= 0, true, 'the pinned proxy argument is missing');
  for (const [flag, value] of [
    ['--cookies', cookiesPath],
    ['--plugin-dirs', 'default'],
    ['--extractor-args', 'youtube:player_client=tv'],
    ['--sleep-requests', '2'],
    ['--limit-rate', '2M'],
  ]) {
    const at = argv.indexOf(flag);
    assert.equal(at >= 0, true, `${flag} never reached yt-dlp: ${JSON.stringify(argv)}`);
    assert.equal(argv[at + 1], value, `${flag} carried the wrong value`);
    assert.equal(at < proxyAt, true, `${flag} must sit before --proxy so it cannot replace it`);
  }
});

test('drops a cookies file that cannot be read instead of failing every site', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  process.env.YTDLP_COOKIES = path.join(stub.dir, 'missing-cookies.txt');

  const info = await analyzeUrl('https://vimeo.com/76979871', { timeoutMs: 15_000 });
  assert.equal(info.title, 'Stub video');

  const [argv] = stub.calls();
  assert.equal(argv.includes('--cookies'), false, JSON.stringify(argv));
});

test('keeps malformed tuning values out of the spawned arguments', async (t) => {
  const stub = withStub();
  t.after(stub.cleanup);
  process.env.YTDLP_LIMIT_RATE = '--exec=rm -rf /';
  process.env.YTDLP_SLEEP_REQUESTS = '-5';

  const info = await analyzeUrl('https://vimeo.com/76979871', { timeoutMs: 15_000 });
  assert.equal(info.title, 'Stub video');

  const [argv] = stub.calls();
  assert.equal(argv.includes('--limit-rate'), false, JSON.stringify(argv));
  assert.equal(argv.includes('--sleep-requests'), false, JSON.stringify(argv));
  assert.equal(argv.includes('--exec=rm -rf /'), false, JSON.stringify(argv));
});
