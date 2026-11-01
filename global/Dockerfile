# Spotifood International — production image.
#   docker build -t spotifood-global .
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG NEXT_PUBLIC_EDITION=global
ENV NEXT_PUBLIC_EDITION=${NEXT_PUBLIC_EDITION} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    # Build-time placeholders only: real values are injected at run time.
    APP_SECRET=build-time-placeholder-not-used-at-runtime-000000 \
    DATABASE_URL=postgres://build:build@127.0.0.1:1/build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
 && node_modules/.bin/esbuild scripts/seed.ts --bundle --platform=node --format=esm --target=node22 \
      --conditions=react-server --external:pg --external:@node-rs/argon2 --external:sharp \
      --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
      --outfile=dist/seed.mjs --log-level=warning

# Production dependencies only (no build tooling in the final image).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# Runs `next start` (not `output: "standalone"`: with Next 16.4 the standalone server re-runs the
# proxy on rewritten URLs, which breaks the unprefixed default-locale routes).
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG NEXT_PUBLIC_EDITION=global
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_EDITION=${NEXT_PUBLIC_EDITION} \
    PORT=3000 \
    STORAGE_LOCAL_DIR=/app/.storage
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/messages ./messages
COPY --from=build --chown=node:node /app/dist/seed.mjs ./dist/seed.mjs
COPY --chown=node:node package.json next.config.ts ./
COPY --chown=node:node scripts/migrate.mjs ./scripts/migrate.mjs
RUN mkdir -p /app/.storage && chown node:node /app/.storage && rm -rf .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 1. migrations  2. platform data (plans, templates, admin if SEED_SUPERADMIN_PASSWORD)  3. server
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/seed.mjs && exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
