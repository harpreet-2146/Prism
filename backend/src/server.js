'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const axios = require('axios');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const config = require('./config');
const { logger } = require('./utils/logger');

// ================================================================
// INITIALIZE
// ================================================================

const app = express();
const prisma = new PrismaClient();

console.log('\n🔧 Initializing PRISM Backend...\n');

// ================================================================
// MIDDLEWARE
// ================================================================

console.log('→ Setting up middleware...');

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS
app.use(cors({
  origin: config.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development only)
if (config.NODE_ENV === 'development') {
  app.use(morgan((tokens, req, res) => {
    const pathOnly = req.originalUrl ? req.originalUrl.split('?')[0] : req.url;
    return [
      tokens.method(req, res),
      pathOnly,
      tokens.status(req, res),
      tokens['response-time'](req, res), 'ms',
      '-',
      tokens.res(req, res, 'content-length') || '-',
    ].join(' ');
  }));
}

console.log('✅ Middleware configured\n');

// ================================================================
// HEALTH CHECK
// ================================================================

console.log('→ Setting up health check...');

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: '1.0.0'
  });
});

console.log('✅ Health check configured\n');

// ================================================================
// STATIC FILE SERVING
// ================================================================

console.log('→ Setting up static file serving...');

// Serve uploaded PDFs
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));
console.log('✅ Static uploads folder:', uploadsPath);

// Serve extracted PDF images:
// - local path when services run together
// - proxy to Python service when deployed separately (e.g. Render)
const outputsPath = path.resolve(__dirname, '../../python-service/data/outputs');
app.get('/outputs/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }

  const localFile = path.join(outputsPath, filename);
  return res.sendFile(localFile, async (err) => {
    if (!err) return;

    if (!config.PYTHON_SERVICE_URL) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    try {
      const base = config.PYTHON_SERVICE_URL.replace(/\/+$/, '');
      const targetUrl = `${base}/outputs/${encodeURIComponent(filename)}`;
      const proxy = await axios.get(targetUrl, {
        responseType: 'stream',
        timeout: 20000,
        validateStatus: () => true
      });

      if (proxy.status >= 400) {
        return res.status(proxy.status).json({ success: false, error: 'Image not found' });
      }

      if (proxy.headers['content-type']) {
        res.setHeader('Content-Type', proxy.headers['content-type']);
      }

      return proxy.data.pipe(res);
    } catch (proxyError) {
      logger.warn('Failed to proxy output image', {
        filename,
        error: proxyError.message
      });
      return res.status(502).json({ success: false, error: 'Failed to fetch image' });
    }
  });
});
console.log('✅ Outputs route configured (local + Python proxy fallback):', outputsPath);

// ================================================================
// API ROUTES
// ================================================================

console.log('→ Loading routes...\n');

// AUTH ROUTES
try {
  console.log('  1️⃣ Loading auth routes...');
  const authRoutes = require('./routes/auth.routes');
  app.use('/api/auth', authRoutes);
  console.log('  ✅ Auth routes mounted at /api/auth\n');
} catch (error) {
  console.error('  ❌ FATAL: Auth routes failed to load!');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  process.exit(1);
}

// DOCUMENTS ROUTES
try {
  console.log('  2️⃣ Loading documents routes...');
  const documentsRoutes = require('./routes/documents.routes');
  app.use('/api/documents', documentsRoutes);
  console.log('  ✅ Documents routes mounted at /api/documents\n');
} catch (error) {
  console.error('  ❌ FATAL: Documents routes failed to load!');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  process.exit(1);
}

// CHAT ROUTES
try {
  console.log('  3️⃣ Loading chat routes...');
  const chatRoutes = require('./routes/chat.routes');
  console.log('  📦 Chat routes loaded, attempting to mount...');
  app.use('/api/chat', chatRoutes);
  console.log('  ✅ Chat routes mounted at /api/chat\n');
} catch (error) {
  console.error('  ❌ FATAL: Chat routes failed to load!');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  process.exit(1);
}

// EXPORT ROUTES
try {
  console.log('  4️⃣ Loading export routes...');
  const exportRoutes = require('./routes/export.routes');
  app.use('/api/export', exportRoutes);
  console.log('  ✅ Export routes mounted at /api/export\n');
} catch (error) {
  console.error('  ❌ FATAL: Export routes failed to load!');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  process.exit(1);
}

console.log('✅ All routes loaded successfully!\n');

// ================================================================
// 404 HANDLER
// ================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// ================================================================
// ERROR HANDLER
// ================================================================

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ================================================================
// START SERVER
// ================================================================

const PORT = config.PORT || 5000;

console.log('→ Starting server...\n');

app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 PRISM Backend Server');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.NODE_ENV}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`🎨 Frontend: ${config.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🖼️  Images: http://localhost:${PORT}/outputs/<filename>`);
  console.log('='.repeat(60) + '\n');

  // Connect to database
  try {
    await prisma.$connect();
    console.log('✅ Database connected\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }

  // Configuration warnings
  if (!config.GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY not set - AI chat will not work');
  }
  if (!config.HF_TOKEN) {
    console.warn('⚠️  HF_TOKEN not set - embeddings will not work');
  }
  if (!config.OCR_SPACE_API_KEY) {
    console.warn('⚠️  OCR_SPACE_API_KEY not set - image OCR will not work');
  }
  console.log('');
});

// ================================================================
// GRACEFUL SHUTDOWN
// ================================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// ================================================================
// UNCAUGHT EXCEPTIONS
// ================================================================

process.on('uncaughtException', (error) => {
  console.error('\n❌ UNCAUGHT EXCEPTION!');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED PROMISE REJECTION!');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});
