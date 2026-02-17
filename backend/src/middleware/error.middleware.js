const logger = require('../utils/logger');
const config = require('../config');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true, stack = '') {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Handle Prisma/Database errors
 */
const handleDatabaseError = (error) => {
  let message = 'Database operation failed';
  let statusCode = 500;

  // Prisma specific errors
  if (error.code) {
    switch (error.code) {
      case 'P2002':
        message = 'A record with this information already exists';
        statusCode = 409; // Conflict
        break;
      case 'P2025':
        message = 'Record not found';
        statusCode = 404;
        break;
      case 'P2003':
        message = 'Foreign key constraint failed';
        statusCode = 400;
        break;
      case 'P2021':
        message = 'Table does not exist';
        statusCode = 500;
        break;
      default:
        message = 'Database error occurred';
    }
  }

  return new AppError(message, statusCode);
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token. Please log in again.', 401);
  } else if (error.name === 'TokenExpiredError') {
    return new AppError('Your token has expired. Please log in again.', 401);
  }
  return new AppError('Token verification failed', 401);
};

/**
 * Handle validation errors
 */
const handleValidationError = (error) => {
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return new AppError(`Invalid input data: ${errors.join('. ')}`, 400);
  }
  return new AppError('Validation failed', 400);
};

/**
 * Handle file upload errors
 */
const handleMulterError = (error) => {
  let message = 'File upload failed';
  let statusCode = 400;

  if (error.code === 'LIMIT_FILE_SIZE') {
    message = `File too large. Maximum size is ${config.uploads.maxFileSize / (1024 * 1024)}MB`;
  } else if (error.code === 'LIMIT_FILE_COUNT') {
    message = 'Too many files uploaded';
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    message = 'Unexpected field in file upload';
  }

  return new AppError(message, statusCode);
};

/**
 * Send error response for development
 */
const sendErrorDev = (err, req, res) => {
  // Log the full error in development
  logger.error('Error Details:', {
    error: err,
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    },
    stack: err.stack
  });

  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      status: err.status,
      message: err.message,
      stack: err.stack,
      error: err
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Send error response for production
 */
const sendErrorProd = (err, req, res) => {
  // Log error details (but not in response)
  logger.error('Production Error:', {
    message: err.message,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    stack: err.stack
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString()
    });
  } else {
    // Programming or unknown error: don't leak error details
    res.status(500).json({
      success: false,
      message: 'Something went wrong! Please try again later.',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Set default status code if not set
  if (!error.statusCode) {
    error.statusCode = 500;
  }

  // Handle specific error types
  if (err.code && err.code.startsWith('P20')) {
    error = handleDatabaseError(error);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(error);
  } else if (err.name === 'ValidationError') {
    error = handleValidationError(error);
  } else if (err.code && err.code.startsWith('LIMIT_')) {
    error = handleMulterError(error);
  } else if (err.type === 'entity.parse.failed') {
    error = new AppError('Invalid JSON in request body', 400);
  } else if (err.code === 'ENOENT') {
    error = new AppError('File not found', 404);
  } else if (err.code === 'EACCES') {
    error = new AppError('Permission denied', 403);
  }

  // Send error response
  if (config.env === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Handle 404 errors (unused routes)
 */
const handleNotFound = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Async error handler wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  handleNotFound,
  asyncHandler
};