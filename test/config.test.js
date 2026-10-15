'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const configSource = fs.readFileSync(path.join(__dirname, '../public/config.js'), 'utf8');

function apiBaseFor(hostname) {
  const window = { location: { hostname } };
  vm.runInNewContext(configSource, { window });
  return window.VAX_API_BASE;
}

test('connects the Cloudflare Pages hostname to the Render API', () => {
  assert.equal(apiBaseFor('vaxdownloader.pages.dev'), 'https://vax-downloader.onrender.com');
});

test('keeps same-origin API for local and self-hosted pages', () => {
  assert.equal(apiBaseFor('localhost'), '');
  assert.equal(apiBaseFor('vax-downloader.onrender.com'), '');
});
