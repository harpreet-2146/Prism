// backend/src/middleware/error.middleware.js
'use strict';

const { logger } = require('../utils/logger');

/**
 * Global Express error handler.
 * Must be registered LAST with app.use() — after all routes.
 * Express recognises it as an error handler because it has 4 parameters.
 */
function errorHandler(err, req, res, next) {
  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Log the error with context
  const logData = {
    status,
    method: req.method,
    path: req.path,
    userId: req.user?.id || null,
    error: err.message,
    component: 'error-middleware'
  };

  if (status >= 500) {
    // Server errors — log full stack
    logData.stack = err.stack;
    logger.error('Unhandled server error', logData);
  } else {
    // Client errors (4xx) — just a warning
    logger.warn('Client error', logData);
  }

  // Don't leak stack traces in production
  const response = {
    success: false,
    error: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    code: err.code || 'INTERNAL_ERROR'
  };

  // Validation errors from Zod have extra details
  if (err.code === 'VALIDATION_ERROR' && err.details) {
    response.details = err.details;
  }

  res.status(status).json(response);
}

/**
 * Wrap an async route handler to catch promise rejections
 * and pass them to the error handler above.
 *
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler — register this AFTER all routes but BEFORE errorHandler.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND'
  });
}

module.exports = { errorHandler, asyncHandler, notFoundHandler };