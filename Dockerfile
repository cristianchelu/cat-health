# ---- Build Stage ----
FROM node:22-slim AS build
WORKDIR /app

# Copy root and workspace package files
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/ui/package.json packages/ui/package.json

# Install dependencies (including dev for build)
RUN npm ci

# Build UI (Vite SPA)
COPY packages/ui packages/ui
RUN npm --workspace=packages/ui run build

# Copy API source (no build needed)
COPY packages/api packages/api

# ---- Production Stage ----
FROM node:22-slim AS prod
WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy only production dependencies
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci --omit=dev

# Copy built UI assets
COPY --from=build /app/packages/ui/dist packages/ui/dist

# Copy API source code
COPY --from=build /app/packages/api packages/api

USER node

# Expose API port (adjust if needed)
EXPOSE 3000

# Healthcheck for Fastify API
HEALTHCHECK --interval=30s --timeout=5s --start-period=3s --retries=3 \
  CMD curl -f http://localhost:3000/api/healthcheck || exit 1

# Entrypoint: run Fastify API with native TypeScript
CMD ["node", "--experimental-strip-types", "packages/api/src/main.ts"]