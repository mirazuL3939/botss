FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production \
    PORT=10000 \
    TZ=Europe/Moscow \
    DATA_DIR=/data \
    CONFIG_PATH=/data/config.json \
    LOGS_DIR=/data/logs

RUN mkdir -p /data/logs

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:10000/health || exit 1

CMD ["node", "bot.js"]