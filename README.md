# VAX Downloader

VAX Downloader is a lightweight, bilingual (English / Arabic) media-link analyzer and downloader. It uses **yt-dlp** to inspect publicly accessible media and **FFmpeg** to prepare the available video or audio output. The interface is vanilla HTML, CSS, and JavaScript; the API is Node.js and Express.

## Project structure

```text
.
├── Dockerfile
├── .dockerignore
├── .env.example
├── render.yaml               # Render Blueprint: one-click free deployment of the server
├── package.json
├── server.js                 # Express app, API routes, rate limits, streaming responses
├── lib/
│   ├── media.js              # yt-dlp execution, metadata normalization, output selection
│   └── security.js           # URL validation, DNS/IP checks, pinned outbound proxy
├── public/
│   ├── index.html            # Accessible app shell
│   ├── config.js             # API server address when the page is hosted separately (GitHub Pages)
│   ├── theme-init.js         # Applies saved/system theme and direction before first paint
│   ├── styles.css            # Responsive themes, RTL, glass UI, motion
│   └── app.js                # i18n, theme, analysis and streamed-download interactions
└── test/
    ├── media.test.js
    └── security.test.js
```

## Requirements

- Node.js 20 or later
- Python 3.10 or later (for the yt-dlp Python package)
- `yt-dlp` with its `default` and `deno` extras: YouTube requires the EJS challenge scripts and the Deno JavaScript runtime ([details](https://github.com/yt-dlp/yt-dlp/wiki/EJS))
- FFmpeg (including `ffprobe`)

### Local setup

```bash
# Install the Node dependencies
npm install

# Install yt-dlp, its YouTube challenge scripts, and Deno in a virtual environment
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade "yt-dlp[default,deno]"

# Install FFmpeg with your OS package manager, then confirm both tools are available
ffmpeg -version
.venv/bin/yt-dlp --version

# Configure the app
cp .env.example .env
```

Edit `.env` and set `YTDLP_BIN` to the virtual-environment executable if it is not on `PATH`:

```dotenv
YTDLP_BIN=/absolute/path/to/VAX-Downloader/.venv/bin/yt-dlp
FFMPEG_BIN=ffmpeg
```

Then start the app:

```bash
npm run dev       # development; restarts on server.js changes
# or
npm start         # normal server
```

Open <http://localhost:3000>. Run the unit tests with `npm test`.

### Docker

The supplied image installs Node, yt-dlp, and FFmpeg together:

```bash
docker build -t vax-downloader .
docker run --rm -p 3000:3000 --env-file .env vax-downloader
```

Open <http://localhost:3000>.

## Deploying online

The app has two parts:

- **The page** (`public/`) is static HTML, CSS, and JavaScript. GitHub Pages or Cloudflare Pages can host it.
- **The server** (`server.js` with yt-dlp and FFmpeg) does the analysis and downloads. Static hosts cannot run it. The GitHub Pages workflow and the `vaxdownloader.pages.dev` Cloudflare Pages hostname connect to the Render service declared in `render.yaml` by default; that service still needs to be deployed and running or the page shows *"We couldn't reach the VAX download server…"*.

### 1. Deploy the server (Render, free plan)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/v4x1/VAX-Downloader)

`render.yaml` builds the `Dockerfile` on Render's free plan in Frankfurt and allows the exact GitHub Pages and Cloudflare Pages origins. When the deploy finishes, open `https://<service>.onrender.com/api/health`; it should return `{"ok":true}`. The server's own address also serves the complete app, so it works without a separate static host too.

Free instances sleep after 15 idle minutes. The first request after that waits about a minute while the server starts; the page sends a wake-up request as soon as it loads.

Any Docker host works the same way (see [Docker](#docker)). Set `CORS_ORIGINS` to the page's exact origin (scheme and host, no path), and set `TRUST_PROXY` when the server runs behind a reverse proxy.

### 2. Connect the static frontend to the server

The GitHub Pages workflow defaults to `https://vax-downloader.onrender.com`, matching the service name in `render.yaml`. The `vaxdownloader.pages.dev` Cloudflare Pages hostname is also mapped to that API in `public/config.js`. Deploy the Render service first. If you renamed it or use another host, set **Settings → Secrets and variables → Actions → Variables** → `VAX_API_BASE` for GitHub Pages, or update `public/config.js` for Cloudflare Pages.

The Render `CORS_ORIGINS` setting must include the exact static site origin (scheme + hostname, no path). The supplied Blueprint allows both `https://v4x1.github.io` and `https://vaxdownloader.pages.dev`. If you use a different domain, add it there too. Leave `window.VAX_API_BASE` empty when the Node server itself serves the page, so the API remains same-origin.

### 3. Publish the page with GitHub Actions

In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. `.github/workflows/pages.yml` then publishes `public/` at the site root (`https://v4x1.github.io/VAX-Downloader/`) on every push to `main`, and the old `/public/` address redirects there. With **Deploy from a branch** instead, GitHub shows this README at the root and an unconfigured copy of the app under `/public/`.

Never enable wildcard CORS for this API.

### YouTube on cloud servers

YouTube often answers requests from data-center IP addresses, including free hosting plans, with a "confirm you're not a bot" check. The page then reports that the source site is blocking the server. Other sites are usually unaffected. A server on a home (residential) connection is the most reliable option for YouTube.

## API

### `POST /api/analyze`

Request JSON:

```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

Successful response:

```json
{
  "ok": true,
  "media": {
    "title": "Example video",
    "uploader": "Creator",
    "duration": 182,
    "thumbnail": "https://…",
    "platformKey": "youtube",
    "platformName": "",
    "videoFormats": [
      { "height": 1080, "format": "mp4", "sizeBytes": 48200000 }
    ],
    "audioFormats": [
      { "format": "mp3", "quality": 192, "bitrate": 192, "sizeBytes": 4368000 }
    ]
  }
}
```

Only video heights found in the extractor's format list are returned. Audio conversions are listed only when an audio stream exists. File sizes are estimates and can differ from the final output.

### `GET /api/download`

Query parameters: `url`, `type=video|audio`, `format`, and `quality` (video height or MP3 bitrate). WAV/M4A use an empty `quality` value. The endpoint re-analyzes the source, verifies the requested option is still available, prepares the output in a temporary directory, then streams it with an attachment filename. Temporary files are removed after the response ends or fails.

## Security and operation notes

- Only `http` and `https` source URLs on public hosts and standard web ports are accepted. Credentials, private/loopback/link-local IPs, localhost names, and special-use address ranges are rejected.
- yt-dlp and FFmpeg traffic is routed through a loopback-only outbound proxy. The proxy validates and pins resolved public IP addresses for each HTTP request and HTTPS tunnel, including redirects and media segments.
- yt-dlp runs without user/system config, cookies, or authentication options. YouTube's JavaScript challenges are solved by Deno, which yt-dlp runs without file system or network access. There are request-size limits, per-route rate limits, child-process timeouts, a concurrent-download cap, and a configurable file-size cap.
- Use HTTPS and a trusted reverse proxy in production. Set `TRUST_PROXY` only when the service is actually behind the configured proxy. The included in-memory rate limiter is per process; use a shared rate-limit store when horizontally scaling.
- Keep yt-dlp and FFmpeg updated. For sensitive deployments, add infrastructure-level outbound firewall rules as defense in depth and monitor temp-disk usage.
- Respect each source site's terms and copyright law. Private, paywalled, and DRM-protected content is not supported.

## Configuration

See `.env.example` for all supported environment variables, including ports, timeouts, concurrency and size limits, executable names, and rate limits. The Node server loads a local `.env` file when present.

## Future improvements

- Playlist and batch-download support with per-item progress.
- Download history, favorites, and resumable jobs.
- PWA installability and optional offline access to the app shell.
