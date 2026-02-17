const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create logs directory if it doesn't exist
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    if (Object.keys(meta).length > 0 && config.env === 'development') {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// Create transports array
const transports = [];

// Console transport
if (config.logging.console) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level
    })
  );
}

// File transport
transports.push(
  new winston.transports.File({
    filename: config.logging.file,
    format: logFormat,
    level: config.logging.level,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  })
);

// Error file transport
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    format: logFormat,
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 3,
    tailable: true
  })
);

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: logFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 2
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: logFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 2
    })
  ],
  exitOnError: false
});

// Add request logging helper
logger.logRequest = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  if (next) next();
};

// Add structured logging methods
logger.audit = (action, userId, details = {}) => {
  logger.info('AUDIT', {
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.security = (event, details = {}) => {
  logger.warn('SECURITY', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

logger.performance = (operation, duration, details = {}) => {
  logger.info('PERFORMANCE', {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = logger;