FROM node:20-slim

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy app
COPY . .

# Persistent folders (mount these as volumes in production)
RUN mkdir -p /app/sessions /app/media
VOLUME ["/app/sessions", "/app/media", "/app/config.json"]

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Kolkata

EXPOSE 3000

# node-cron / Intl need full ICU
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
