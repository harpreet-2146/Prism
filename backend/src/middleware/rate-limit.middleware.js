// backend/src/middleware/rate-limit.middleware.js
'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Standard rate limiter — applies to all API routes.
 * Window and max are fully env-driven (no hardcoding).
 */
const standard = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,  // Return RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests — please slow down',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  // Skip rate limiting in test environment
  skip: () => config.NODE_ENV === 'test'
});

/**
 * Stricter limiter for auth endpoints (login, register).
 * 10 attempts per 15 minutes to prevent brute force.
 */
const auth = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts — please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  skip: () => config.NODE_ENV === 'test'
});

/**
 * Limiter for file uploads — heavier operations get lower limits.
 * 20 uploads per 15 minutes per IP.
 */
const upload = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many upload requests — please slow down',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  skip: () => config.NODE_ENV === 'test'
});

/**
 * Limiter for export endpoints — Puppeteer is expensive.
 * 10 exports per 15 minutes per IP.
 */
const exportLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many export requests — please slow down',
    code: 'EXPORT_RATE_LIMIT_EXCEEDED'
  },
  skip: () => config.NODE_ENV === 'test'
});

module.exports = { standard, auth, upload, exportLimit };