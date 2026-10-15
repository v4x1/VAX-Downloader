# Production image: Node serves the app/API; yt-dlp and FFmpeg perform extraction.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PATH=/opt/yt-dlp-venv/bin:$PATH \
    YTDLP_BIN=/opt/yt-dlp-venv/bin/yt-dlp \
    PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
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
