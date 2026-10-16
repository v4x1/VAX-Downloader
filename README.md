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

YouTube answers requests from data-center IP addresses, including free hosting plans, with a "confirm you're not a bot" check, and the page reports that the source site is blocking the server. Other sites are usually unaffected. Nothing in this repository can fully hide a server's address, so a server on a home (residential) connection remains the most reliable option for YouTube.

The server already does what it can from code: every YouTube link that YouTube refuses is retried once with alternate player clients (`tv_downgraded`, `web_embedded`, `web_safari`, `android`, `ios`), which are the clients least likely to demand a proof-of-origin token. When that is not enough, work through the following in order — each step is a configuration change, not a code change.

1. **Update yt-dlp.** YouTube changes its checks weekly and yt-dlp ships workarounds within days. Rebuild the image (`docker build --no-cache …`) or run `yt-dlp -U`; distro packages are often too old to work at all. Check the version with `yt-dlp --version`.
2. **Confirm the JavaScript runtime.** Current yt-dlp needs Deno to solve YouTube's challenges, and without it only a reduced client set is used. Install with `pip install "yt-dlp[default,deno]"` (the Dockerfile already does) and look for the runtime line in `yt-dlp -v` output. `YTDLP_DEBUG=1` in the server environment logs yt-dlp's last error lines, which is the fastest way to tell a bot wall from a missing tool.
3. **Choose player clients.** YouTube scores each client separately, so a different list can succeed where the defaults are refused. Set `YTDLP_EXTRACTOR_ARGS=youtube:player_client=tv_downgraded,web_embedded` (comma-separated, no spaces needed). If the watch page itself is refused but the player API is not, add `player_skip=webpage`:
   `YTDLP_EXTRACTOR_ARGS=youtube:player_client=tv_downgraded;player_skip=webpage`.
   Setting this variable disables the automatic retry, so list every client you want to try.
4. **Slow down.** A burst of requests is the fastest way to turn a temporary challenge into a longer block. Set `YTDLP_SLEEP_REQUESTS=2` and, for downloads, `YTDLP_LIMIT_RATE=2M`.
5. **Use cookies, carefully.** Export a `cookies.txt` from a *throwaway* YouTube account in a private window (close the window without logging out) and point `YTDLP_COOKIES` at it. The file must be readable by the server's user — bake it into the image or mount it as a secret. Never use a personal account: sessions used by downloaders get flagged, and pairing cookies with the `tv` client tends to log the account out.
6. **Add a PO-token provider.** When the debug output says formats require a proof-of-origin token, install a provider plugin (for example `bgutil-ytdlp-pot-provider`) in the yt-dlp environment and load it with `YTDLP_PLUGIN_DIRS=default`.
7. **Change the address.** If a laptop on a home connection downloads the same video without cookies, the server's IP is the problem and no flag will fix it. Route yt-dlp through a residential proxy, or run the server somewhere with a cleaner address. Rotating cheap data-center proxies rarely helps — they are scored just like the current host.


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
- yt-dlp runs without user/system config, and without cookies or authentication options unless the operator configures them (see [YouTube on cloud servers](#youtube-on-cloud-servers)). YouTube's JavaScript challenges are solved by Deno, which yt-dlp runs without file system or network access. There are request-size limits, per-route rate limits, child-process timeouts, a concurrent-download cap, and a configurable file-size cap.
- Use HTTPS and a trusted reverse proxy in production. Set `TRUST_PROXY` only when the service is actually behind the configured proxy. The included in-memory rate limiter is per process; use a shared rate-limit store when horizontally scaling.
- Keep yt-dlp and FFmpeg updated. For sensitive deployments, add infrastructure-level outbound firewall rules as defense in depth and monitor temp-disk usage.
- Respect each source site's terms and copyright law. Private, paywalled, and DRM-protected content is not supported.

## Configuration

See `.env.example` for all supported environment variables, including ports, timeouts, concurrency and size limits, executable names, and rate limits. The Node server loads a local `.env` file when present.

## Future improvements

- Playlist and batch-download support with per-item progress.
- Download history, favorites, and resumable jobs.
- PWA installability and optional offline access to the app shell.
