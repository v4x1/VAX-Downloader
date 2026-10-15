// Local/self-hosted pages served by the Node server use the same-origin API.
// GitHub Pages generates this file at deploy time; Cloudflare Pages uses the hostname mapping below.
// For another static host or a renamed API, set VAX_API_BASE to the API origin (without /api).
const apiBaseByFrontendHost = {
  'vaxdownloader.pages.dev': 'https://vax-downloader.onrender.com',
};
window.VAX_API_BASE = apiBaseByFrontendHost[window.location.hostname.toLowerCase()] || '';
