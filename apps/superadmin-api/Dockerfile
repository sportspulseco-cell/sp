# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps + build (full pnpm workspace) ----------
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace metadata first to maximise layer cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json ./

# Workspace packages the API depends on.
COPY packages ./packages
COPY apps/superadmin-api ./apps/superadmin-api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sportspulse/superadmin-api build

# Strip dev deps for the runtime stage.
RUN pnpm --filter @sportspulse/superadmin-api --prod deploy /out

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /out/package.json ./package.json

USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]
