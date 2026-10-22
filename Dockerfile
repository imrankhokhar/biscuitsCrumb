# —— Frontend build ——
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
RUN npm run build

# —— Server build ——
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/prisma ./prisma
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx prisma generate && npm run build

# —— Runtime ——
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/db/app.db \
    PUBLIC_DIR=/app/public \
    CLIENT_ORIGIN=true

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
COPY server/src ./src
COPY --from=frontend /app/dist ./public
COPY server/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /data/db /data/uploads /data/private/receipts \
  && npx prisma generate

VOLUME ["/data"]
EXPOSE 4000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
