# ---- Build Stage ----
FROM node:22-slim AS build
WORKDIR /app

# Copy all package manifests and lock file
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/

# Install all dependencies for all workspaces
# This is done before copying source to leverage layer caching
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build all workspaces that have a build script
RUN npm run build --workspaces --if-present

# ---- Install Stage ----
FROM node:22-slim AS install
WORKDIR /app

# Copy all package manifests and lock file for production dependencies
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/

# Install only production dependencies
RUN npm ci --omit=dev

# ---- Production Stage ----
FROM node:22-slim AS prod
WORKDIR /app

# Install ffmpeg for video processing (if needed by the API)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy production node_modules from the install stage
COPY --from=install /app/node_modules/ ./node_modules/

# Copy all built packages from the build stage. This includes the source code for the API
# and the built static assets for the UI.
COPY --from=build /app/packages/ ./packages/

# Copy the root package.json for the entrypoint command to work
COPY package.json .

USER node

# Expose API port (adjust if needed)
EXPOSE 3000

# Healthcheck for Fastify API
HEALTHCHECK --interval=30s --timeout=5s --start-period=3s --retries=3 \
  CMD curl -f http://localhost:3000/api/healthcheck || exit 1

# Entrypoint: run Fastify API with native TypeScript
CMD ["node", "--experimental-strip-types", "packages/api/src/main.ts"]
