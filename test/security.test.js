'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchPublicImage, isPrivateAddress, parseMediaUrl } = require('../lib/security');

test('blocks private, loopback, link-local, and special-use IPv4 ranges', () => {
  for (const address of [
    '0.12.34.56', '10.20.30.40', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.254', '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
  ]) {
    assert.equal(isPrivateAddress(address), true, `${address} should be blocked`);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('1.1.1.1'), false);
});

test('blocks unsafe IPv6 ranges and IPv4-mapped private addresses', () => {
  for (const address of [
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '2001:db8::1', '2001:0::1', '2001:20::1', '2002::1', '64:ff9b::a9fe:a9fe',
    'fec0::1', '3fff::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
  ]) {
    assert.equal(isPrivateAddress(address), true, `${address} should be blocked`);
  }
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
  assert.equal(isPrivateAddress('2001:4860:4860::8888'), false);
});

test('accepts public http(s) URLs and removes fragments', () => {
  const url = parseMediaUrl('https://www.youtube.com/watch?v=abc#not-sent');
  assert.equal(url.hostname, 'www.youtube.com');
  assert.equal(url.hash, '');
  assert.equal(parseMediaUrl('http://8.8.8.8/video').protocol, 'http:');
});

test('thumbnail proxy rejects non-HTTPS and private destinations before fetching', async () => {
  await assert.rejects(fetchPublicImage('http://example.com/image.jpg'), (error) => error.code === 'invalid_url');
  await assert.rejects(fetchPublicImage('https://127.0.0.1/image.jpg'), (error) => error.code === 'invalid_url');
  await assert.rejects(fetchPublicImage('https://thumbnail.internal/image.jpg'), (error) => error.code === 'invalid_url');
});

test('rejects non-web schemes, local hosts, credentials, and nonstandard ports', () => {
  const unsafe = [
    'file:///etc/passwd',
    'ftp://example.com/media',
    'http://localhost/video',
    'http://metadata.google.internal/latest/meta-data',
    'http://127.0.0.1/video',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.0.2/video',
    'http://user:pass@example.com/video',
    'https://example.com:8443/video',
    'https://[::1]/video',
    'https://[::ffff:7f00:1]/video',
  ];
  for (const value of unsafe) assert.throws(() => parseMediaUrl(value), undefined, value);
});
