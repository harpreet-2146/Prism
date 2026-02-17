// backend/src/utils/logger.js
'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, errors, json, colorize, printf } = format;

// Pretty format for development console
const devFormat = printf(({ level, message, timestamp, component, ...meta }) => {
  const comp = component ? `[${component}]` : '';
  const extras = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level} ${comp} ${message}${extras}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  transports: [
    // Console — pretty in dev, JSON in prod
    new transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat)
    }),
    // Error log file
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), json()),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    // Combined log file
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: combine(timestamp(), json()),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ],
  // Don't crash on unhandled exceptions — log them
  exceptionHandlers: [
    new transports.File({ filename: path.join(logsDir, 'exceptions.log') })
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(logsDir, 'rejections.log') })
  ]
});

module.exports = { logger };