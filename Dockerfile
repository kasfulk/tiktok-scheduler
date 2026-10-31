# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencies (cached on the manifests alone) ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/media/package.json packages/media/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/tiktok/package.json packages/tiktok/
RUN npm ci

# --- Build (Prisma client + Next.js production build) ---
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# --- Shared runtime ---
FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /app/data /app/storage/videos /app/storage/thumbnails /app/storage/tmp
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@tiktok-scheduler/web"]

# --- Worker (needs FFmpeg/FFprobe for metadata + thumbnails) ---
FROM runtime AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
CMD ["npm", "run", "start:worker"]