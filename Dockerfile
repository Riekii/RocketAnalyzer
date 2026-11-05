# syntax=docker/dockerfile:1
FROM rust:1-bookworm AS parser
# rrrocket v0.11.8, built natively with its locked dependencies.
RUN cargo install --git https://github.com/nickbabcock/rrrocket.git \
    --rev c2152bdb46dceff779a02c19616b9135d83dd41d \
    --locked --jobs 1 --root /parser rrrocket

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
COPY --from=parser /parser/bin/rrrocket ./.local/rrrocket/rrrocket
RUN ./.local/rrrocket/rrrocket --help && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/.local ./.local
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
