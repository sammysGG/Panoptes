# syntax=docker/dockerfile:1
#
# Panoptes backend — API + scan/hardening engine.
# Build context is the REPO ROOT (so modules/ and system-definitions/ are
# available): `docker build -f backend/Dockerfile .`

# ---- build stage: install deps (incl. native better-sqlite3) + compile TS ----
FROM node:20-bookworm-slim AS build
WORKDIR /app/backend
# Toolchain so better-sqlite3 / ssh2 can compile if no prebuilt binary applies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY backend/ ./
RUN yarn build

# ---- runtime stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    PANOPTES_MODULES_DIR=/app/modules \
    PANOPTES_DEFINITIONS_DIR=/app/system-definitions \
    PANOPTES_DB_PATH=/app/backend/data/panoptes.sqlite
# nmap for SYN/service scans (TCP-sweep fallback works without it too).
RUN apt-get update \
 && apt-get install -y --no-install-recommends nmap ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
# Compiled app + its node_modules (better-sqlite3 binary already built).
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/package.json ./package.json
# Read-only system definitions (seeded into the DB on boot).
COPY system-definitions /app/system-definitions
# Built-in modules are staged here; the entrypoint seeds them into the modules
# volume so user-uploaded modules persist alongside them.
COPY modules /app/modules-builtin
COPY backend/docker-entrypoint.sh /usr/local/bin/panoptes-entrypoint
RUN chmod +x /usr/local/bin/panoptes-entrypoint \
 && mkdir -p /app/backend/data /app/modules
EXPOSE 4000
ENTRYPOINT ["panoptes-entrypoint"]
CMD ["node", "dist/index.js"]
