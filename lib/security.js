'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const net = require('node:net');
const { URL } = require('node:url');

const DNS_TIMEOUT_MS = 5_000;
const DNS_CACHE_MS = 30_000;
const dnsCache = new Map();

class SecurityError extends Error {
  constructor(code = 'invalid_url', status = 400) {
    super(code);
    this.name = 'SecurityError';
    this.code = code;
    this.status = status;
  }
}

function ipv4ToNumber(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return octets.reduce((value, octet) => (value * 256) + octet, 0);
}

const IPV4_BLOCKED_RANGES = [
  ['0.0.0.0', '0.255.255.255'],       // Current network
  ['10.0.0.0', '10.255.255.255'],     // RFC 1918
  ['100.64.0.0', '100.127.255.255'],  // Carrier-grade NAT
  ['127.0.0.0', '127.255.255.255'],   // Loopback
  ['169.254.0.0', '169.254.255.255'], // Link-local / cloud metadata
  ['172.16.0.0', '172.31.255.255'],   // RFC 1918
  ['192.0.0.0', '192.0.0.255'],       // IETF protocol assignments
  ['192.0.2.0', '192.0.2.255'],       // Documentation
  ['192.88.99.0', '192.88.99.255'],   // Deprecated 6to4 relay anycast
  ['192.168.0.0', '192.168.255.255'], // RFC 1918
  ['198.18.0.0', '198.19.255.255'],   // Benchmarking
  ['198.51.100.0', '198.51.100.255'], // Documentation
  ['203.0.113.0', '203.0.113.255'],   // Documentation
  ['224.0.0.0', '255.255.255.255'],   // Multicast and reserved
].map(([start, end]) => [ipv4ToNumber(start), ipv4ToNumber(end)]);

function ipv6Words(address) {
  let input = address.toLowerCase().split('%')[0];
  if (!input || net.isIP(input) !== 6) return null;

  // Convert an IPv4-embedded tail into its two hexadecimal words first.
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':');
    const ipv4 = input.slice(lastColon + 1);
    const number = ipv4ToNumber(ipv4);
    if (number === null) return null;
    const high = ((number >>> 16) & 0xffff).toString(16);
    const low = (number & 0xffff).toString(16);
    input = `${input.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const all = [...left, ...Array(missing).fill('0'), ...right];
  if (all.length !== 8 || all.some((word) => !/^[\da-f]{1,4}$/i.test(word))) return null;
  return all.map((word) => Number.parseInt(word, 16));
}

function isPrivateAddress(address) {
  const unbracketed = String(address).replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(unbracketed);

  if (family === 4) {
    const number = ipv4ToNumber(unbracketed);
    if (number === null) return true;
    return IPV4_BLOCKED_RANGES.some(([start, end]) => number >= start && number <= end);
  }

  if (family === 6) {
    const words = ipv6Words(unbracketed);
    if (!words) return true;

    // IPv4-mapped IPv6 addresses must be evaluated using the embedded IPv4.
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      const embedded = `${words[6] >>> 8}.${words[6] & 0xff}.${words[7] >>> 8}.${words[7] & 0xff}`;
      return isPrivateAddress(embedded);
    }

    const first = words[0];
    const second = words[1];
    return first === 0x0000                         // Unspecified, compatible, and reserved ::/8
      || (first & 0xe000) !== 0x2000                // Not global-unicast 2000::/3
      || (first & 0xfe00) === 0xfc00                // Unique local fc00::/7
      || (first & 0xffc0) === 0xfe80                // Link-local fe80::/10
      || (first & 0xffc0) === 0xfec0                // Deprecated site-local fec0::/10
      || (first & 0xff00) === 0xff00                // Multicast ff00::/8
      || (first === 0x2001 && second === 0x0db8)    // Documentation 2001:db8::/32
      || (first === 0x2001 && second === 0x0000)    // Teredo tunneling
      || (first === 0x2001 && (second & 0xfff0) === 0x0010) // ORCHID special-use space
      || (first === 0x2001 && (second & 0xfff0) === 0x0020) // ORCHIDv2
      || (first === 0x0064 && second === 0xff9b)    // NAT64 can embed non-public IPv4 targets
      || first === 0x2002                        // 6to4 tunneling
      || first === 0x3fff;                          // Documentation 3fff::/20
  }

  // Non-IP strings are handled as hostnames by the caller.
  return false;
}

function canonicalHost(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function isDisallowedHostname(host) {
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.test', '.invalid', '.onion'];
  if (!host || !host.includes('.') || host.length > 253 || host === 'localhost' || host.includes('..')) return true;
  if (blockedSuffixes.some((suffix) => host.endsWith(suffix))) return true;
  const labels = host.split('.');
  return labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function parseMediaUrl(raw) {
  if (typeof raw !== 'string') throw new SecurityError('invalid_url');
  const value = raw.trim();
  if (!value || value.length > 4096) throw new SecurityError('invalid_url');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SecurityError('invalid_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SecurityError('invalid_url');
  }
  if (url.username || url.password) throw new SecurityError('invalid_url');

  const host = canonicalHost(url.hostname);
  if (!host || host.includes('..')) throw new SecurityError('invalid_url');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new SecurityError('invalid_url');
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SecurityError('invalid_url');
  } else if (isDisallowedHostname(host) || /[\s\/@]/.test(host)) {
    throw new SecurityError('invalid_url');
  }

  // Strip URL fragments because they are never sent to a server and can carry misleading text.
  url.hash = '';
  return url;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new SecurityError('network_error', 422)), milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolvePublicAddresses(hostname) {
  const host = canonicalHost(hostname);
  if (!net.isIP(host) && isDisallowedHostname(host)) throw new SecurityError('invalid_url');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new SecurityError('invalid_url');
    return [{ address: host, family: net.isIP(host) }];
  }

  const cached = dnsCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;

  let addresses;
  try {
    addresses = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), DNS_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError('network_error', 422);
  }

  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new SecurityError('invalid_url');
  }

  // Keep the checked addresses briefly and connect to those literal IPs in the proxy. This
  // avoids a second, unchecked DNS lookup (including DNS-rebinding between validation and use).
  const normalized = addresses.map(({ address, family }) => ({ address, family: family || net.isIP(address) }));
  dnsCache.set(host, { addresses: normalized, expiresAt: Date.now() + DNS_CACHE_MS });
  if (dnsCache.size > 500) {
    for (const [key, entry] of dnsCache) {
      if (entry.expiresAt <= Date.now()) dnsCache.delete(key);
    }
  }
  return normalized;
}

async function validateMediaUrl(raw) {
  const url = parseMediaUrl(raw);
  const host = canonicalHost(url.hostname);
  await resolvePublicAddresses(host);
  return url.toString();
}

function pinnedHttpsGet(url, address, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request({
      protocol: 'https:',
      hostname: address.address,
      family: address.family,
      port: 443,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: canonicalHost(url.hostname),
      headers: {
        host: url.host,
        accept: 'image/avif,image/webp,image/apng,image/*;q=0.8',
        'user-agent': 'VAXDownloader/1.0 (thumbnail preview)',
        connection: 'close',
      },
      agent: false,
      // Preserve certificate verification against the requested hostname while the TCP
      // connection itself is pinned to the already-validated IP address.
      checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(canonicalHost(url.hostname), certificate),
    }, (response) => {
      const status = response.statusCode || 502;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        settled = true;
        resolve({ redirect: typeof location === 'string' ? location : null });
        return;
      }
      if (status !== 200) {
        response.resume();
        fail(new SecurityError('network_error', 422));
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
      if (!allowedTypes.has(contentType)) {
        response.resume();
        fail(new SecurityError('network_error', 422));
        return;
      }
      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.resume();
        fail(new SecurityError('invalid_url', 413));
        return;
      }

      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          response.destroy();
          fail(new SecurityError('invalid_url', 413));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        if (settled) return;
        settled = true;
        resolve({ body: Buffer.concat(chunks), contentType });
      });
      response.once('error', fail);
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error('thumbnail timeout')));
    request.once('error', fail);
    request.end();
  });
}

async function fetchPublicImage(raw, options = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SecurityError('invalid_url');
  }
  const maxBytes = options.maxBytes || 4 * 1024 * 1024;
  const timeoutMs = options.timeoutMs || 7_000;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new SecurityError('invalid_url');
    }
    const host = canonicalHost(url.hostname);
    if (!host || (net.isIP(host) && isPrivateAddress(host)) || (!net.isIP(host) && isDisallowedHostname(host))) {
      throw new SecurityError('invalid_url');
    }
    const addresses = await resolvePublicAddresses(host);
    const result = await pinnedHttpsGet(url, addresses[0], maxBytes, timeoutMs);
    if (!result.redirect) return result;
    if (redirects === 3 || !result.redirect || result.redirect.length > 4096) throw new SecurityError('network_error', 422);
    try {
      url = new URL(result.redirect, url);
    } catch {
      throw new SecurityError('network_error', 422);
    }
  }
  throw new SecurityError('network_error', 422);
}

function proxyResponse(socket, status, message) {
  if (socket.destroyed) return;
  const body = `${message}\n`;
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function proxyHttpError(response, status, message) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
  response.end(`${message}\n`);
}

/**
 * Make a loopback-only HTTP CONNECT proxy for yt-dlp/FFmpeg. Every outbound host is
 * resolved, checked against private/special-use ranges, and pinned to the checked IP.
 * Redirects and media-segment hosts pass through the same check, preventing a URL that
 * redirects to localhost or a cloud metadata endpoint from bypassing the initial check.
 */
async function createOutboundProxy() {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    void (async () => {
      let target;
      try {
        const rawTarget = request.url || '/';
        target = /^https?:\/\//i.test(rawTarget)
          ? new URL(rawTarget)
          : new URL(rawTarget, `http://${request.headers.host || ''}`);
        if (target.protocol !== 'http:' || target.username || target.password || (target.port && target.port !== '80')) {
          throw new SecurityError('invalid_url');
        }
        const host = canonicalHost(target.hostname);
        if (!host || (net.isIP(host) && isPrivateAddress(host))) throw new SecurityError('invalid_url');
        const addresses = await resolvePublicAddresses(host);
        const address = addresses[0];
        const headers = { ...request.headers, host: target.host, connection: 'close' };
        delete headers['proxy-connection'];
        delete headers['proxy-authorization'];

        const upstream = http.request({
          protocol: 'http:',
          hostname: address.address,
          family: address.family,
          port: 80,
          method: request.method,
          path: `${target.pathname}${target.search}`,
          headers,
          agent: false,
        }, (upstreamResponse) => {
          const upstreamHeaders = { ...upstreamResponse.headers };
          delete upstreamHeaders['proxy-authenticate'];
          response.writeHead(upstreamResponse.statusCode || 502, upstreamHeaders);
          upstreamResponse.pipe(response);
        });
        upstream.setTimeout(120_000, () => upstream.destroy(new Error('upstream timeout')));
        upstream.on('error', () => proxyHttpError(response, 502, 'Upstream connection failed'));
        request.on('error', () => upstream.destroy());
        response.on('close', () => upstream.destroy());
        request.pipe(upstream);
      } catch (error) {
        const status = error instanceof SecurityError ? 403 : 502;
        proxyHttpError(response, status, status === 403 ? 'Outbound destination blocked' : 'Outbound connection failed');
      }
    })();
  });

  server.on('connect', (request, clientSocket, head) => {
    void (async () => {
      let target;
      try {
        target = new URL(`https://${request.url}`);
        if (target.username || target.password || (target.port && target.port !== '443')) {
          throw new SecurityError('invalid_url');
        }
        const host = canonicalHost(target.hostname);
        if (!host || (net.isIP(host) && isPrivateAddress(host))) throw new SecurityError('invalid_url');
        const addresses = await resolvePublicAddresses(host);
        const address = addresses[0];
        const upstream = net.connect({
          host: address.address,
          family: address.family,
          port: 443,
        });

        upstream.once('connect', () => {
          if (clientSocket.destroyed) {
            upstream.destroy();
            return;
          }
          clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: VAX Downloader\r\n\r\n');
          if (head.length) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        upstream.setTimeout(120_000, () => upstream.destroy(new Error('tunnel timeout')));
        upstream.on('error', () => proxyResponse(clientSocket, '502 Bad Gateway', 'Outbound tunnel failed'));
        clientSocket.on('error', () => upstream.destroy());
        clientSocket.on('close', () => upstream.destroy());
      } catch (error) {
        const status = error instanceof SecurityError ? '403 Forbidden' : '502 Bad Gateway';
        proxyResponse(clientSocket, status, status.startsWith('403') ? 'Outbound destination blocked' : 'Outbound tunnel failed');
      }
    })();
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 20_000;
  server.maxHeadersCount = 100;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = {
  SecurityError,
  canonicalHost,
  createOutboundProxy,
  fetchPublicImage,
  isPrivateAddress,
  parseMediaUrl,
  resolvePublicAddresses,
  validateMediaUrl,
};
