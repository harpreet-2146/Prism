// backend/src/server.js
'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression = require('compression');
const path       = require('path');

const config  = require('./config');
const routes  = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const { standard: standardRateLimit }   = require('./middleware/rate-limit.middleware');
const { logger } = require('./utils/logger');

const app = express();

// ----------------------------------------------------------------
// Trust proxy — required for Railway / any reverse proxy
// ----------------------------------------------------------------
app.set('trust proxy', 1);

// ----------------------------------------------------------------
// Security headers
// ----------------------------------------------------------------
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:']
    }
  }
}));

// ----------------------------------------------------------------
// CORS
// ----------------------------------------------------------------
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const allowed = config.FRONTEND_URL.split(',').map(u => u.trim());
    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow localhost on any port
    if (config.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ----------------------------------------------------------------
// Request parsing & compression
// ----------------------------------------------------------------
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ----------------------------------------------------------------
// HTTP request logging
// ----------------------------------------------------------------
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: msg => logger.http(msg.trim()) }
}));

// ----------------------------------------------------------------
// Rate limiting — all API routes
// ----------------------------------------------------------------
app.use('/api', standardRateLimit);

// ----------------------------------------------------------------
// Static file serving — uploaded document images
// ----------------------------------------------------------------
app.use('/uploads', express.static(path.resolve(config.UPLOAD_DIR), {
  maxAge: config.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// ----------------------------------------------------------------
// API routes
// ----------------------------------------------------------------
app.use('/api', routes);

// ----------------------------------------------------------------
// 404 + Global error handler (must be last)
// ----------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ----------------------------------------------------------------
// Start server
// ----------------------------------------------------------------
async function start() {
  try {
    // Ensure export temp directory exists
    const fs = require('fs');
    if (!fs.existsSync(config.EXPORT_TEMP_DIR)) {
      fs.mkdirSync(config.EXPORT_TEMP_DIR, { recursive: true });
    }

    app.listen(config.PORT, () => {
      logger.info(`PRISM backend running`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        component: 'server'
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();

module.exports = app; // exported for testing