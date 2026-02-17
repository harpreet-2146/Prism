const path = require('path');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  apiVersion: process.env.API_VERSION || 'v1',

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-fallback-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-fallback-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // AI Services configuration
  ai: {
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.1-8b-instant',
      maxTokens: 8192
    },
    google: {
      apiKey: process.env.GOOGLE_AI_API_KEY,
      model: 'gemini-pro'
    }
  },

  // File upload configuration
  uploads: {
    directory: path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  },

  // Export configuration
  exports: {
    directory: path.join(__dirname, '../../', process.env.EXPORT_DIR || 'exports'),
    maxRetentionDays: 30,
    formats: ['pdf', 'docx', 'markdown', 'json']
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',')
  },

  // Rate limiting configuration
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },

  // Email configuration
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    secure: process.env.EMAIL_SECURE === 'true'
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Encryption configuration
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    console: process.env.NODE_ENV !== 'production'
  },

  // Vector database configuration
  vectorDB: {
    milvus: {
      address: process.env.MILVUS_ADDRESS || 'localhost:19530',
      username: process.env.MILVUS_USERNAME || '',
      password: process.env.MILVUS_PASSWORD || ''
    }
  },

  // Security configuration
  security: {
    bcryptRounds: 12,
    secureCookies: process.env.SECURE_COOKIES === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret'
  },

  // OCR and document processing
  ocr: {
    enabled: true,
    languages: ['eng', 'deu'], // English and German for SAP
    confidence: 80
  },

  // SAP-specific configuration
  sap: {
    modules: [
      'FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'PM', 'HR', 'PS', 'WM',
      'FI-CA', 'IS-U', 'RE-FX', 'IM', 'TR', 'EC', 'SEM', 'BW'
    ],
    tcodePatterns: [
      /^[A-Z]{2,4}\d{0,3}[A-Z]?$/,  // Standard T-Code patterns
      /^\/[A-Z0-9_]+\/[A-Z0-9_]+$/, // Custom T-Code patterns
      /^Y[A-Z0-9_]+$/,              // Customer Y* T-Codes
      /^Z[A-Z0-9_]+$/               // Customer Z* T-Codes
    ]
  }
};

module.exports = config;