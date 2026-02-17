const express = require('express');
const authRoutes = require('./auth.routes');
const documentsRoutes = require('./documents.routes');
const chatRoutes = require('./chat.routes');
const exportRoutes = require('./export.routes');
const config = require('../config');

const router = express.Router();

// API version and health check
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'PRISM API is running',
    version: config.apiVersion,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/auth',
      documents: '/documents',
      chat: '/chat',
      export: '/export'
    }
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: config.env
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/documents', documentsRoutes);
router.use('/chat', chatRoutes);
router.use('/export', exportRoutes);

// API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    success: true,
    message: 'PRISM API Documentation',
    version: config.apiVersion,
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    endpoints: {
      auth: {
        'POST /auth/register': 'Register a new user',
        'POST /auth/login': 'Login user',
        'POST /auth/logout': 'Logout user',
        'POST /auth/refresh': 'Refresh access token',
        'GET /auth/profile': 'Get user profile',
        'PUT /auth/profile': 'Update user profile',
        'PUT /auth/change-password': 'Change user password'
      },
      documents: {
        'GET /documents': 'List user documents',
        'POST /documents/upload': 'Upload document',
        'GET /documents/:id': 'Get document details',
        'PUT /documents/:id': 'Update document metadata',
        'DELETE /documents/:id': 'Delete document',
        'GET /documents/:id/download': 'Download document',
        'POST /documents/:id/reprocess': 'Reprocess document',
        'GET /documents/stats': 'Get document statistics'
      },
      chat: {
        'GET /chat/conversations': 'List conversations',
        'POST /chat/conversations': 'Create conversation',
        'GET /chat/conversations/:id': 'Get conversation',
        'PUT /chat/conversations/:id': 'Update conversation',
        'DELETE /chat/conversations/:id': 'Delete conversation',
        'GET /chat/conversations/:id/messages': 'Get messages',
        'POST /chat/conversations/:id/messages': 'Send message',
        'PUT /chat/messages/:id': 'Update message',
        'DELETE /chat/messages/:id': 'Delete message',
        'POST /chat/messages/:id/regenerate': 'Regenerate response'
      },
      export: {
        'POST /export': 'Create export job',
        'GET /export': 'List export jobs',
        'GET /export/:id': 'Get export job status',
        'GET /export/:id/download': 'Download export',
        'DELETE /export/:id': 'Cancel export job'
      }
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      obtain: 'POST /auth/login or POST /auth/register'
    },
    errors: {
      400: 'Bad Request - Invalid input',
      401: 'Unauthorized - Invalid or missing token',
      403: 'Forbidden - Insufficient permissions',
      404: 'Not Found - Resource not found',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error'
    }
  });
});

module.exports = router;