'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { PrismaClient } = require('@prisma/client');

const config = require('./config');
const { logger } = require('./utils/logger');

const authRoutes = require('./routes/auth.routes');
const documentsRoutes = require('./routes/documents.routes');
const chatRoutes = require('./routes/chat.routes');
const exportRoutes = require('./routes/export.routes');

// ================================================================
// INITIALIZE
// ================================================================

const app = express();
const prisma = new PrismaClient();

// ================================================================
// MIDDLEWARE
// ================================================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS - IMPORTANT for frontend
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
  app.use(morgan('dev'));
}

// ================================================================
// HEALTH CHECK
// ================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    version: '1.0.0'
  });
});

// ================================================================
// API ROUTES
// ================================================================

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/export', exportRoutes);

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

app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 PRISM Backend Server');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.NODE_ENV}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`🎨 Frontend: ${config.FRONTEND_URL || 'http://localhost:5173'}`);
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