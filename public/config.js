// Address of the VAX Downloader API server, e.g. 'https://vax-downloader.onrender.com' (no /api suffix).
// Required when this page is hosted separately from the server, such as on GitHub Pages; static hosts
// cannot run the API, so analysis and downloads fail until this points to a running server.
// Leave it empty when the Node server itself serves this page (same origin).
// On GitHub Pages, the VAX_API_BASE repository variable (Settings → Secrets and variables → Actions →
// Variables) overrides this value at deploy time.
window.VAX_API_BASE = '';
