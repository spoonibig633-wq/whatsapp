FROM node:20-slim

WORKDIR /app

# Install OS deps (tini for proper signal handling on Railway)
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*

# Install Node deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy app
COPY . .

# Ensure persistent folders exist — Railway mounts volumes here at runtime.
# Do NOT use the Dockerfile VOLUME directive; Railway rejects it.
# Add volumes via Railway UI: Settings → Volumes → mount at /app/sessions, /app/media
RUN mkdir -p /app/sessions /app/media

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Kolkata

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
