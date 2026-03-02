FROM node:20-bookworm-slim

# Runtime + build deps for puppeteer/canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcairo2-dev \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgif-dev \
    libglib2.0-0 \
    libgtk-3-0 \
    libjpeg62-turbo-dev \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpango1.0-dev \
    libpangocairo-1.0-0 \
    librsvg2-dev \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    python3 \
    g++ \
    make \
    pkg-config \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY .env.example ./
COPY debug.js ./

RUN mkdir -p /app/uploads /app/exports /app/logs

ENV NODE_ENV=production

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
