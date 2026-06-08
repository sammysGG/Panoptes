# syntax=docker/dockerfile:1
#
# Panoptes frontend — Next.js UI. Build context is the REPO ROOT:
# `docker build -f frontend/Dockerfile .`

# ---- build stage ------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
# The browser derives the API URL from the host it loads from + this port, so
# the same image works on any deploy host. Override at build time if needed.
ARG NEXT_PUBLIC_API_PORT=4000
ENV NEXT_PUBLIC_API_PORT=$NEXT_PUBLIC_API_PORT
RUN yarn build

# ---- runtime stage ----------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/frontend
COPY --from=build /app/frontend/.next ./.next
COPY --from=build /app/frontend/node_modules ./node_modules
COPY --from=build /app/frontend/public ./public
COPY --from=build /app/frontend/package.json ./package.json
COPY --from=build /app/frontend/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["yarn", "start", "-p", "3000"]
