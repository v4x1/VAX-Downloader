# Production image: Node serves the app/API; yt-dlp and FFmpeg perform extraction.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PATH=/opt/yt-dlp-venv/bin:$PATH \
    YTDLP_BIN=/opt/yt-dlp-venv/bin/yt-dlp \
    PORT=3000

# yt-dlp needs its EJS challenge scripts (the "default" extra) and a JavaScript runtime to read
# YouTube formats. The "deno" extra installs Deno, which yt-dlp enables by default and runs
# sandboxed without file system or network access. https://github.com/yt-dlp/yt-dlp/wiki/EJS
#
# This is also the one layer that must not be served from the build cache for months: YouTube
# changes its checks weekly, and a yt-dlp build that has fallen behind is the most common reason
# a link stops working. Bump YTDLP_BUILD (any new value) to invalidate the cache and install the
# current release, then check the version the server prints at startup.
ARG YTDLP_BUILD=2026-10-16
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir --upgrade pip "yt-dlp[default,deno]" \
    && echo "yt-dlp build ${YTDLP_BUILD}" \
    && /opt/yt-dlp-venv/bin/yt-dlp --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
