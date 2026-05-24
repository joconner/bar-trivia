# Multi-stage build: three Vite frontends → single nginx image
# Each frontend is built independently to keep layers cacheable.

FROM node:22-alpine AS base
WORKDIR /app

# Install all workspace dependencies once; reused across build stages
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/tv/package.json ./packages/tv/
COPY packages/player/package.json ./packages/player/
COPY packages/host/package.json ./packages/host/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/tv/ ./packages/tv/
COPY packages/player/ ./packages/player/
COPY packages/host/ ./packages/host/

# TV build — VITE_SERVER_URL="" → same-origin socket.io via nginx proxy on 8081
# VITE_PLAYER_URL → QR code target; baked at build time. For multi-device demos
# (phone scanning TV's QR), rebuild with VITE_PLAYER_URL=http://<LAN-IP>:5174
FROM base AS tv-build
RUN cd packages/tv && VITE_SERVER_URL="" VITE_PLAYER_URL=http://localhost:5174 npx vite build

# Player build — already uses io("/") for same-origin; no env overrides needed
FROM base AS player-build
RUN cd packages/player && npx vite build

# Host build — VITE_API_URL="" → same-origin API/socket.io via nginx proxy on 80.
# Host code reads VITE_API_URL (api.ts, socket.ts); VITE_SERVER_URL is unread.
FROM base AS host-build
RUN cd packages/host && VITE_API_URL="" npx vite build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=tv-build    /app/packages/tv/dist     /usr/share/nginx/html/tv
COPY --from=player-build /app/packages/player/dist /usr/share/nginx/html/player
COPY --from=host-build  /app/packages/host/dist   /usr/share/nginx/html/host
