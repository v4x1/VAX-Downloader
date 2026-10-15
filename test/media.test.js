'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  availableSelection,
  contentDisposition,
  createPublicMetadata,
  isValidSelection,
  normalizeAudioFormats,
  normalizeVideoFormats,
  safeFilename,
  videoFormatSelector,
} = require('../lib/media');

const sourceFormats = [
  { format_id: 'v1080', ext: 'mp4', height: 1080, vcodec: 'avc1.640028', acodec: 'none', tbr: 3600, filesize_approx: 18_000_000 },
  { format_id: 'v720', ext: 'webm', height: 720, vcodec: 'vp9', acodec: 'none', tbr: 1700, filesize_approx: 8_500_000 },
  { format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize_approx: 650_000 },
  { format_id: 'awebm', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160, filesize_approx: 800_000 },
];

test('normalizes only source video heights and exposes supported output containers', () => {
  const result = normalizeVideoFormats({}, sourceFormats, 40);
  assert.deepEqual(result.map(({ height, format }) => `${height}:${format}`), [
    '1080:mp4',
    '720:webm',
  ]);
  assert.equal(result.find((item) => item.height === 1080 && item.format === 'mp4').sizeBytes > 0, true);
  assert.equal(result.some((item) => item.height === 2160), false);
});

test('offers audio conversions only when the source has audio and estimates output size', () => {
  const audioFormats = normalizeAudioFormats(sourceFormats, 60);
  assert.deepEqual(audioFormats.map((item) => `${item.format}:${item.quality ?? 'default'}`), [
    'mp3:320', 'mp3:256', 'mp3:192', 'mp3:128', 'wav:default', 'm4a:default',
  ]);
  assert.equal(audioFormats.find((item) => item.format === 'wav').bitrate, 1411);
  assert.equal(audioFormats.find((item) => item.format === 'm4a').bitrate, 192);
  assert.equal(audioFormats.every((item) => item.sizeBytes > 0), true);
  assert.deepEqual(normalizeAudioFormats(sourceFormats.slice(0, 2), 60), []);
});

test('validates a download selection against normalized source availability', () => {
  const metadata = createPublicMetadata({ formats: sourceFormats, title: 'A video', duration: 40 }, 'https://example.com/watch');
  assert.equal(availableSelection(metadata, { type: 'video', format: 'mp4', quality: 1080 }), true);
  assert.equal(availableSelection(metadata, { type: 'video', format: 'mp4', quality: 2160 }), false);
  assert.equal(availableSelection(metadata, { type: 'audio', format: 'mp3', quality: 192 }), true);
  assert.equal(availableSelection(metadata, { type: 'audio', format: 'm4a', quality: null }), true);
  assert.equal(availableSelection(metadata, { type: 'audio', format: 'wav', quality: 320 }), false);
});

test('accepts only enumerated download formats and bounded integer qualities', () => {
  assert.deepEqual(isValidSelection({ type: 'video', format: 'mp4', quality: '1080', url: 'https://example.com' }), {
    type: 'video', format: 'mp4', quality: 1080,
  });
  assert.deepEqual(isValidSelection({ type: 'audio', format: 'mp3', quality: '320', url: 'https://example.com' }), {
    type: 'audio', format: 'mp3', quality: 320,
  });
  assert.deepEqual(isValidSelection({ type: 'audio', format: 'wav', quality: '', url: 'https://example.com' }), {
    type: 'audio', format: 'wav', quality: null,
  });
  assert.equal(isValidSelection({ type: 'video', format: 'mp4;--exec', quality: '1080', url: 'https://example.com' }), null);
  assert.equal(isValidSelection({ type: 'audio', format: 'mp3', quality: '9999', url: 'https://example.com' }), null);
});

test('keeps format selectors constrained to supported heights and extensions', () => {
  assert.match(videoFormatSelector(1080, 'mp4'), /height=1080/);
  assert.match(videoFormatSelector(720, 'webm'), /ext=webm/);
  assert.doesNotMatch(videoFormatSelector(1080, 'mp4'), /\$\(|;|\|/);
});

test('creates a safe Unicode filename and RFC 5987 content disposition', () => {
  const filename = safeFilename('  عائلتي / Video: 2026?  ', 'MP4');
  assert.equal(filename, 'عائلتي Video 2026.mp4');
  const header = contentDisposition(filename);
  assert.match(header, /^attachment; filename=".*"; filename\*=UTF-8''/);
  assert.equal(/[\r\n]/.test(header), false);
});
