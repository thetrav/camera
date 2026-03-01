FROM node:22-alpine AS builder

WORKDIR /app

COPY camera-control-hub/package.json camera-control-hub/package-lock.json* camera-control-hub/
WORKDIR /app/camera-control-hub
RUN npm ci

COPY camera-control-hub/src ./src
COPY camera-control-hub/public ./public
COPY camera-control-hub/index.html camera-control-hub/vite.config.ts camera-control-hub/postcss.config.js camera-control-hub/tailwind.config.ts camera-control-hub/tsconfig*.json camera-control-hub/components.json ./
RUN npm run build

WORKDIR /app

COPY server/package.json server/package-lock.json* server/
WORKDIR /app/server
RUN npm ci

COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN adduser -D ftpuser && apk add --no-cache ffmpeg

COPY --from=builder /app/camera-control-hub/dist ./static
COPY --from=builder /app/server/dist ./server
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules

ENV STATIC_DIR=/app/static

WORKDIR /app/server

EXPOSE 8080

CMD ["node", "index.js"]
