# ---- Runtime Base ----
# Shared base with system dependencies
FROM node:22-slim AS runtime-base
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

# ---- Dependencies (all) ----
FROM runtime-base AS deps
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---- Development ----
# Source code mounted as volume at runtime
FROM deps AS dev
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
EXPOSE 3000 5173 9229
CMD ["npm", "run", "start", "-w", "api"]

# ---- Build ----
FROM deps AS build
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/ui ./packages/ui
RUN npm run build --workspaces --if-present

# ---- Production Dependencies ----
FROM runtime-base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev

# ---- Production ----
FROM runtime-base AS prod
COPY --from=prod-deps /app/node_modules/ ./node_modules/
COPY --from=build /app/packages/ ./packages/
COPY package.json .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=3s --retries=3 \
  CMD curl -f http://localhost:3000/api/healthcheck || exit 1
CMD ["node", "--experimental-strip-types", "packages/api/src/main.ts"]
