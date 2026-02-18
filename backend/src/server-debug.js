'use strict';

console.log('=== SERVER STARTUP DEBUG ===');
console.log('1. Loading dotenv...');
require('dotenv').config();
console.log('   ✓ dotenv loaded');

console.log('2. Loading dependencies...');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
console.log('   ✓ Express dependencies loaded');

console.log('3. Loading Prisma...');
const { PrismaClient } = require('@prisma/client');
console.log('   ✓ Prisma loaded');

console.log('4. Loading config...');
const config = require('./config');
console.log('   ✓ Config loaded');
console.log('   Database URL:', config.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('   Port:', config.PORT);

console.log('5. Loading logger...');
const { logger } = require('./utils/logger');
console.log('   ✓ Logger loaded');

console.log('6. Loading routes...');
const authRoutes = require('./routes/auth.routes');
console.log('   ✓ Auth routes loaded');
const documentsRoutes = require('./routes/documents.routes');
console.log('   ✓ Documents routes loaded');
const chatRoutes = require('./routes/chat.routes');
console.log('   ✓ Chat routes loaded');
const exportRoutes = require('./routes/export.routes');
console.log('   ✓ Export routes loaded');

console.log('7. Creating Express app...');
const app = express();
const prisma = new PrismaClient();
console.log('   ✓ App and Prisma client created');

console.log('8. Setting up middleware...');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
console.log('   ✓ Middleware configured');

console.log('9. Setting up routes...');
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/export', exportRoutes);
console.log('   ✓ Routes configured');

console.log('10. Setting up error handlers...');
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});
app.use((err, req, res, next) => {
  logger.error('Error:', { error: err.message });
  res.status(500).json({ success: false, error: err.message });
});
console.log('   ✓ Error handlers configured');

console.log('11. Starting server...');
async function startServer() {
  try {
    console.log('   Connecting to database...');
    await prisma.$connect();
    console.log('   ✓ Database connected');

    const PORT = config.PORT || 5000;
    console.log('   Starting HTTP server on port', PORT);
    
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 PRISM Backend Server');
      console.log('='.repeat(60));
      console.log('📡 Server running on port ' + PORT);
      console.log('🌍 Environment: ' + config.NODE_ENV);
      console.log('🔗 API: http://localhost:' + PORT + '/api');
      console.log('💾 Database: Connected');
      console.log('='.repeat(60) + '\n');

      if (!config.GROQ_API_KEY) console.warn('⚠️  GROQ_API_KEY not set');
      if (!config.HF_TOKEN) console.warn('⚠️  HF_TOKEN not set');
      if (!config.OCR_SPACE_API_KEY) console.warn('⚠️  OCR_SPACE_API_KEY not set');
    });
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

console.log('12. Calling startServer()...');
startServer();
