# PlagLens Frontend — multi-stage build
# 1) Build stage with node
# 2) Serve stage with nginx (SPA fallback + reverse proxy /api → gateway)

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (lockfile-aware)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy sources
COPY frontend/. .

# Build (Vite production)
ENV NODE_ENV=production
RUN npm run build

# ---------- Serve stage ----------
FROM nginx:alpine AS serve

# Custom nginx config (SPA fallback + /api proxy)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Static assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx default CMD is fine
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
