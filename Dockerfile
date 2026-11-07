# syntax=docker/dockerfile:1





FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build


FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/
COPY --from=build /app/package-lock.json /app/



RUN npm install --no-save --no-package-lock prisma@6.19.0
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=build /app/prisma ./prisma


RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

ENV DATABASE_URL=file:/app/data/dev.db

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
