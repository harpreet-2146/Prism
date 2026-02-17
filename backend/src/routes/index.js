// backend/src/routes/index.js
'use strict';

const express = require('express');
const authRoutes      = require('./auth.routes');
const documentsRoutes = require('./documents.routes');
const chatRoutes      = require('./chat.routes');
const exportRoutes    = require('./export.routes');

const router = express.Router();

// Health check — no auth required
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'PRISM API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to PRISM API',
    version: '1.0.0',
    description: 'Intelligent Visual Assistant for SAP Software',
    endpoints: {
      auth:      '/api/auth',
      documents: '/api/documents',
      chat:      '/api/chat',
      export:    '/api/export'
    }
  });
});

router.use('/auth',      authRoutes);
router.use('/documents', documentsRoutes);
router.use('/chat',      chatRoutes);
router.use('/export',    exportRoutes);

module.exports = router;