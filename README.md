# VAX Downloader

VAX Downloader is a lightweight, bilingual (English / Arabic) media-link analyzer and downloader. It uses **yt-dlp** to inspect publicly accessible media and **FFmpeg** to prepare the available video or audio output. The interface is vanilla HTML, CSS, and JavaScript; the API is Node.js and Express.

## Project structure

```text
.
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
├── server.js                 # Express app, API routes, rate limits, streaming responses
├── lib/
│   ├── media.js              # yt-dlp execution, metadata normalization, output selection
│   └── security.js           # URL validation, DNS/IP checks, pinned outbound proxy
├── public/
│   ├── index.html            # Accessible app shell
│   ├── theme-init.js         # Applies saved/system theme and direction before first paint
│   ├── styles.css            # Responsive themes, RTL, glass UI, motion
│   └── app.js                # i18n, theme, analysis and streamed-download interactions
└── test/
    ├── media.test.js
    └── security.test.js
```

## Requirements

- Node.js 20 or later
- Python 3 (for the yt-dlp Python package)
- `yt-dlp`
- FFmpeg (including `ffprobe`)

### Local setup

```bash
# Install the Node dependencies
npm install

# Install yt-dlp in a virtual environment
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade yt-dlp

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
- yt-dlp runs without user/system config, cookies, or authentication options. There are request-size limits, per-route rate limits, child-process timeouts, a concurrent-download cap, and a configurable file-size cap.
- Use HTTPS and a trusted reverse proxy in production. Set `TRUST_PROXY` only when the service is actually behind the configured proxy. The included in-memory rate limiter is per process; use a shared rate-limit store when horizontally scaling.
- Keep yt-dlp and FFmpeg updated. For sensitive deployments, add infrastructure-level outbound firewall rules as defense in depth and monitor temp-disk usage.
- Respect each source site's terms and copyright law. Private, paywalled, and DRM-protected content is not supported.

## Configuration

See `.env.example` for all supported environment variables, including ports, timeouts, concurrency and size limits, executable names, and rate limits. The Node server loads a local `.env` file when present.

## Future improvements

- Playlist and batch-download support with per-item progress.
- Download history, favorites, and resumable jobs.
- PWA installability and optional offline access to the app shell.
