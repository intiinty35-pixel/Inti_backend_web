# ---- Base: Node 22 + pnpm (la versión sale del campo packageManager de package.json) ----
FROM node:22-alpine AS base
# openssl lo necesita el motor de Prisma en Alpine.
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable
WORKDIR /app

# ---- Etapa 1: dependencias y compilación ----
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# El cliente de Prisma se genera con el esquema; no necesita conectarse a la base.
COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build

# Deja solo las dependencias de producción (Prisma incluido, para aplicar migraciones al arrancar).
RUN pnpm prune --prod

# ---- Etapa 2: imagen final ----
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3001

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./

RUN mkdir -p /app/data/private/payment-receipts && chown -R node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1

# Aplica las migraciones pendientes y luego inicia la API. Las imágenes no se guardan aquí: van a Cloudinary.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node dist/main.js"]
