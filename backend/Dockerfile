# -------- Base Image --------
FROM node:20-bookworm-slim

# -------- Install system deps (Chromium + Puppeteer runtime) --------
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libasound2 \
    libxss1 \
    libx11-xcb1 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxfixes3 \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# -------- Environment --------
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# -------- App directory --------
WORKDIR /app

# -------- Install dependencies first (better caching) --------
COPY package*.json ./
RUN npm ci --omit=dev

# -------- Prisma setup --------
COPY prisma ./prisma
RUN npx prisma generate

# -------- Copy application --------
COPY src ./src
COPY debug.js ./
COPY .env.example ./

# -------- Required runtime folders --------
RUN mkdir -p /app/uploads /app/exports /app/logs

# -------- Expose Render port --------
EXPOSE 5000

# -------- Start application --------
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
