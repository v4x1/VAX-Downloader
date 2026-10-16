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
  resetYouTubeStrategyCache,
  youtubeAttemptPlan,
  youtubeFallbackExtractorArgs,
  youtubeRetryStrategies,
} = require('../lib/media');

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const STUB_FORMATS = [
  "    { format_id: 'v18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', tbr: 700, filesize: 9_000_000 },",
  "    { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },",
].join('\n');

// A stand-in for the yt-dlp binary. It labels every attempt from the arguments it was given, so
// a test can see which player clients were asked with, and it refuses the way YouTube refuses a
// data-center address: a bot wall on the default clients, a rejected player response on some
// alternates, and streams withheld behind a proof-of-origin token on the others.
const STUB_SOURCE = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
// The server places operator-configured flags before \`--proxy\` and the walk's own client
// strategies after it, so the label below reads only the walk arguments.
const proxyIndex = args.indexOf('--proxy');
const walkArgs = proxyIndex === -1 ? args : args.slice(proxyIndex + 2);
const walkText = walkArgs.join(' ');
const fallback = walkArgs.includes('--extractor-args') ? walkArgs[walkArgs.indexOf('--extractor-args') + 1] : '';
const clients = (fallback.match(/player_client=([^;]+)/) || [])[1] || '';
const label = walkText.includes('formats=missing_pot') ? 'permissive'
  : walkText.includes('player_skip=webpage') ? 'api-only'
  : clients ? 'players' : 'default';
const scenario = process.env.STUB_SCENARIO || 'blocked';
const outputIndex = args.indexOf('--output');
const outputDir = outputIndex === -1 ? null : path.dirname(args[outputIndex + 1]);

const log = (line) => { if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, line + '\\n'); };
const refuse = (message) => {
  if (outputDir) fs.writeFileSync(path.join(outputDir, 'media.f137.mp4.part'), 'partial');
  process.stderr.write('WARNING: [youtube] dQw4w9WgXcQ: padding to push the error to the last line\\n'.repeat(50));
  process.stderr.write(message + '\\n');
  process.exit(1);
};
const succeed = (info) => {
  if (outputDir) {
    log('leftovers:' + fs.readdirSync(outputDir).join(','));
    fs.writeFileSync(path.join(outputDir, 'media.mp4'), 'x'.repeat(2048));
    process.exit(0);
  }
  process.stdout.write(JSON.stringify(info));
  process.exit(0);
};

log('attempt:' + label);

const silentScenarios = new Set(['pot', 'pot-quiet', 'drm']);
if (label === 'default' && !silentScenarios.has(scenario)) {
  refuse("ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you\\u2019re not a bot. " +
    'Use --cookies-from-browser or --cookies for the authentication.');
}
if (label === 'players' && (scenario === 'blocked' || scenario === 'always-blocked')) {
  refuse('ERROR: [youtube] dQw4w9WgXcQ: All player responses are invalid. ' +
    'Your IP is likely being blocked by Youtube');
}
if (label === 'api-only' && scenario === 'always-blocked') {
  refuse('ERROR: [youtube] dQw4w9WgXcQ: Failed to extract any player response');
}
if (label === 'permissive' && scenario === 'always-blocked') {
  refuse('ERROR: [youtube] dQw4w9WgXcQ: No video formats found!');
}
if (silentScenarios.has(scenario) && label === 'default') {
  // Real yt-dlp answers a public video with only storyboards when every stream was withheld,
  // and the server runs it with --quiet --no-warnings: the words that explain the withholding
  // are debug output for the default clients and suppressed warnings for the rest. Only the
  // 'pot' scenario echoes them; 'pot-quiet' and 'drm' stay silent the way production sees it.
  if (scenario === 'pot') {
    process.stderr.write('WARNING: [youtube] dQw4w9WgXcQ: web client https formats require a GVS PO Token ' +
      'which was not provided. They will be skipped as they may yield HTTP Error 403.\\n');
  }
  succeed({
    id: 'dQw4w9WgXcQ',
    title: 'Stub video',
    extractor: 'youtube',
    _has_drm: scenario === 'drm' ? true : null,
    formats: [{ format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none' }],
  });
}

succeed({
  id: 'dQw4w9WgXcQ',
  title: 'Stub video',
  uploader: 'Stub channel',
  duration: 95,
  extractor: 'youtube',
  formats: [
${STUB_FORMATS}
  ],
});
`;

function withStub(options = {}) {
  if (process.platform === 'win32') return test.skip('the yt-dlp stub needs a POSIX shebang');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vax-stub-'));
  const stubPath = path.join(dir, 'yt-dlp');
  const logPath = path.join(dir, 'attempts.log');
  fs.writeFileSync(stubPath, STUB_SOURCE, { mode: 0o755 });
  fs.writeFileSync(logPath, '');

  const previous = {};
  for (const key of ['YTDLP_BIN', 'YTDLP_YOUTUBE_CLIENTS', 'YTDLP_YOUTUBE_STRATEGIES', 'YTDLP_EXTRACTOR_ARGS', 'STUB_LOG', 'STUB_SCENARIO']) {
    previous[key] = process.env[key];
  }
  process.env.YTDLP_BIN = stubPath;
  process.env.STUB_LOG = logPath;
  process.env.STUB_SCENARIO = options.scenario || 'blocked';
  delete process.env.YTDLP_YOUTUBE_CLIENTS;
  delete process.env.YTDLP_YOUTUBE_STRATEGIES;
  delete process.env.YTDLP_EXTRACTOR_ARGS;
  resetYouTubeStrategyCache();

  let markedAt = 0;
  const attempts = () => {
    const log = fs.readFileSync(logPath, 'utf8').trim();
    const lines = log ? log.split('\n') : [];
    return lines.map((line) => line.replace(/^attempt:/, ''));
  };

  return {
    attempts,
    // Only the attempts made after mark(), so a test can examine one request at a time.
    attemptsSince: () => attempts().slice(markedAt),
    mark: () => { markedAt = attempts().length; },
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

test('recognizes YouTube hosts and every wording of a refusal', () => {
  for (const url of [YOUTUBE_URL, 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=x']) {
    assert.equal(isYouTubeMediaUrl(url), true, url);
  }
  for (const url of ['https://vimeo.com/76979871', 'https://notyoutube.com/watch?v=x', 'not a url']) {
    assert.equal(isYouTubeMediaUrl(url), false, url);
  }

  const refusals = [
    'ERROR: [youtube] abc: Your IP is likely being blocked by Youtube',
    'ERROR: [youtube] abc: All player responses are invalid. Your IP is likely being blocked by Youtube',
    'ERROR: [youtube] abc: Failed to extract any player response',
    'ERROR: [youtube] abc: No video formats found!',
    'ERROR: [youtube] abc: HTTP Error 403: Forbidden',
    'WARNING: [youtube] abc: web client https formats require a GVS PO Token which was not provided',
    'ERROR: [youtube] abc: Video unavailable. YouTube is requiring a captcha challenge before playback',
    // Builds that still ask the visitor to prove they are not a bot.
    'ERROR: [youtube] abc: Sign in to confirm you\u2019re not a bot. Use --cookies-from-browser or --cookies',
  ];
  for (const message of refusals) assert.equal(isYouTubeBlockMessage(message), true, message);
  assert.equal(isYouTubeBlockMessage('ERROR: [youtube] abc: Private video.'), false);
  assert.equal(isYouTubeBlockMessage(''), false);
});

test('tries the clients YouTube challenges least, then the player API, then the withheld formats', () => {
  assert.deepEqual(youtubeRetryStrategies(), [
    { name: 'players', value: 'player_client=web_embedded,tv_downgraded' },
    { name: 'api-only', value: 'player_client=visionos,tv,web_embedded;player_skip=webpage' },
    { name: 'permissive', value: 'player_client=web_embedded,tv_downgraded;formats=missing_pot' },
  ]);
  assert.deepEqual(youtubeFallbackExtractorArgs(), [
    '--extractor-args',
    'youtube:player_client=web_embedded,tv_downgraded',
  ]);
});

test('honors operator overrides of the retry list', () => {
  const previous = {
    YTDLP_YOUTUBE_CLIENTS: process.env.YTDLP_YOUTUBE_CLIENTS,
    YTDLP_YOUTUBE_STRATEGIES: process.env.YTDLP_YOUTUBE_STRATEGIES,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    delete process.env.YTDLP_YOUTUBE_STRATEGIES;
    process.env.YTDLP_YOUTUBE_CLIENTS = 'tv, visionos';
    assert.deepEqual(youtubeRetryStrategies(), [{ name: 'configured', value: 'player_client=tv,visionos' }]);

    process.env.YTDLP_YOUTUBE_CLIENTS = 'off';
    assert.deepEqual(youtubeRetryStrategies(), []);
    assert.equal(youtubeFallbackExtractorArgs(), null);

    process.env.YTDLP_YOUTUBE_CLIENTS = 'tv;rm -rf /';
    assert.deepEqual(youtubeRetryStrategies(), []);

    delete process.env.YTDLP_YOUTUBE_CLIENTS;
    process.env.YTDLP_YOUTUBE_STRATEGIES = 'player_client=tv;player_skip=webpage|player_client=web_safari';
    assert.deepEqual(youtubeRetryStrategies(), [
      { name: 'custom-1', value: 'player_client=tv;player_skip=webpage' },
      { name: 'custom-2', value: 'player_client=web_safari' },
    ]);

    // Nothing that could add an option of its own may survive validation.
    for (const hostile of ['--exec=rm -rf /', 'player_client=web;player_skip=js --exec=id', 'no equal sign', 'x'.repeat(500)]) {
      process.env.YTDLP_YOUTUBE_STRATEGIES = hostile;
      assert.deepEqual(youtubeRetryStrategies(), [], hostile);
    }

    process.env.YTDLP_YOUTUBE_STRATEGIES = 'off';
    assert.deepEqual(youtubeRetryStrategies(), []);
  } finally {
    restore();
  }
});

test('plans yt-dlp defaults first, and skips the retries when they are switched off', () => {
  resetYouTubeStrategyCache();
  assert.deepEqual(
    youtubeAttemptPlan(YOUTUBE_URL).map((attempt) => attempt.name),
    [null, 'players', 'api-only', 'permissive'],
  );
  assert.deepEqual(youtubeAttemptPlan('https://vimeo.com/76979871'), [{ name: null }]);

  const previous = process.env.YTDLP_YOUTUBE_CLIENTS;
  process.env.YTDLP_YOUTUBE_CLIENTS = 'off';
  try {
    assert.deepEqual(youtubeAttemptPlan(YOUTUBE_URL), [{ name: null }]);
  } finally {
    if (previous === undefined) delete process.env.YTDLP_YOUTUBE_CLIENTS;
    else process.env.YTDLP_YOUTUBE_CLIENTS = previous;
  }
});

test('walks the client strategies until YouTube answers', async (t) => {
  const stub = withStub({ scenario: 'blocked' });
  t.after(stub.cleanup);

  const info = await analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 });
  assert.equal(info.title, 'Stub video');
  assert.deepEqual(stub.attempts(), ['default', 'players', 'api-only']);
});

test('retries when the answer describes a video but withholds every stream', async (t) => {
  const stub = withStub({ scenario: 'pot' });
  t.after(stub.cleanup);

  // The default clients exit successfully with storyboards only; the retry has to notice that no
  // stream came back rather than hand the visitor an empty result.
  const info = await analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 });
  assert.equal(info.formats.some((format) => format.vcodec === 'avc1'), true);
  assert.deepEqual(stub.attempts(), ['default', 'players']);
});

test('walks the strategies even when the withholding leaves no words on stderr', async (t) => {
  const stub = withStub({ scenario: 'pot-quiet' });
  t.after(stub.cleanup);

  // Production is the quiet case: yt-dlp runs with --quiet --no-warnings, and the reasons a
  // stream was withheld are debug output for the default clients. The answer alone — a video
  // described with nothing to play — has to start the walk, or every YouTube link on a
  // data-center address ends in an error while the strategy list sits unused.
  const info = await analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 });
  assert.equal(info.formats.some((format) => format.vcodec === 'avc1'), true);
  assert.deepEqual(stub.attempts(), ['default', 'players']);
});

test('reports a DRM-protected answer as private instead of a wall', async (t) => {
  const stub = withStub({ scenario: 'drm' });
  t.after(stub.cleanup);

  // A description that admits its formats are DRM-protected is not a refusal of this server:
  // every client answers the same way, so the walk must not spend the visitor's time on it.
  await assert.rejects(() => analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 }), (error) => {
    assert.equal(error.code, 'private_content');
    return true;
  });
  assert.deepEqual(stub.attempts(), ['default']);
});

test('an operator who configured extractor args has chosen the clients already', async (t) => {
  const stub = withStub({ scenario: 'blocked' });
  t.after(stub.cleanup);

  process.env.YTDLP_EXTRACTOR_ARGS = 'youtube:player_client=tv';
  await assert.rejects(() => analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 }), (error) => {
    assert.equal(error.code, 'source_blocked');
    return true;
  });
  // The wall is reported, but the automatic walk stays out of the way of the chosen clients.
  assert.deepEqual(stub.attempts(), ['default']);
});

test('reuses the strategy that worked for a later request for the same link', async (t) => {
  const stub = withStub({ scenario: 'blocked' });
  t.after(stub.cleanup);

  await analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 });
  assert.deepEqual(stub.attempts(), ['default', 'players', 'api-only']);

  stub.mark();
  // This is the shape of the download request that follows an analysis: the clients that
  // answered are asked first, so the format list the visitor picked from is the one the download
  // sees, without walking through the wall again.
  const download = await createDownload(YOUTUBE_URL, { type: 'video', format: 'mp4', quality: 360 }, {
    timeoutMs: 60_000,
    maxBytes: 10 * 1024 * 1024,
  });
  t.after(() => fs.rmSync(download.tempDir, { recursive: true, force: true }));
  assert.equal(download.size, 2048);
  assert.deepEqual(stub.attemptsSince(), ['api-only', 'leftovers:']);
});

test('reports the wall when every client is refused', async (t) => {
  const stub = withStub({ scenario: 'always-blocked' });
  t.after(stub.cleanup);

  await assert.rejects(() => analyzeUrl(YOUTUBE_URL, { timeoutMs: 60_000 }), (error) => {
    assert.equal(error.code, 'source_blocked');
    return true;
  });
  assert.deepEqual(stub.attempts(), ['default', 'players', 'api-only', 'permissive']);
});

test('does not retry other sites, and still reports the block', async (t) => {
  const stub = withStub({ scenario: 'blocked' });
  t.after(stub.cleanup);

  await assert.rejects(() => analyzeUrl('https://vimeo.com/76979871', { timeoutMs: 60_000 }), (error) => {
    assert.equal(error.code, 'source_blocked');
    return true;
  });
  assert.deepEqual(stub.attempts(), ['default']);
});

test('retries a bot-walled download from a clean temporary directory', async (t) => {
  const stub = withStub({ scenario: 'blocked' });
  t.after(stub.cleanup);

  const download = await createDownload(YOUTUBE_URL, { type: 'video', format: 'mp4', quality: 360 }, {
    timeoutMs: 120_000,
    maxBytes: 10 * 1024 * 1024,
  });
  t.after(() => fs.rmSync(download.tempDir, { recursive: true, force: true }));
  assert.equal(download.size, 2048);
  // A refused attempt leaves a partial file behind. The retry starts from an empty directory, so
  // --no-overwrites cannot fail on the leftover name, and the file that is served is the new one.
  assert.deepEqual(stub.attempts(), ['default', 'players', 'api-only', 'leftovers:']);
});
