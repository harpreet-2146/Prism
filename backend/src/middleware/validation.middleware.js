// backend/src/middleware/validation.middleware.js
'use strict';

const { z } = require('zod');

/**
 * Validate req.body against a Zod schema.
 * Returns 400 with field-level errors if validation fails.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    req.body = result.data; // use the parsed/transformed data
    next();
  };
}

/**
 * Validate req.params against a Zod schema.
 */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL parameters',
        code: 'INVALID_PARAMS',
        details: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    req.params = result.data;
    next();
  };
}

/**
 * Validate req.query against a Zod schema.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY',
        details: result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    req.query = result.data;
    next();
  };
}

// ----------------------------------------------------------------
// Reusable schemas
// ----------------------------------------------------------------

const schemas = {
  uuidParam: z.object({
    id: z.string().uuid('Invalid ID format')
  }),

  // NEW - Accept BOTH "name" and "fullName" for compatibility
register: z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().min(1, 'Name is required').max(100)
    .transform(v => v.trim())  // Clean whitespace
    .optional(),
  fullName: z.string().min(1).max(100).optional()
}).refine(
  // At least one name field must be provided
  (data) => data.name || data.fullName,
  { message: 'Name is required', path: ['name'] }
),

  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
  }),

  refreshToken: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required')
  }),

  chatMessage: z.object({
    message: z.string()
      .min(1, 'Message cannot be empty')
      .max(10000, 'Message too long (max 10,000 characters)')
      .transform(v => v.trim()),
    conversationId: z.string().uuid().optional()
  }),

  updateTitle: z.object({
    title: z.string()
      .min(1, 'Title cannot be empty')
      .max(100, 'Title too long')
      .transform(v => v.trim())
  }),

  updateProfile: z.object({
    fullName: z.string().min(1).max(100).optional()
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128)
  }),

  deleteAccount: z.object({
    password: z.string().min(1, 'Password is required to delete account')
  }),

  pagination: z.object({
    page:  z.string().optional().transform(v => Math.max(1, parseInt(v) || 1)),
    limit: z.string().optional().transform(v => Math.min(50, Math.max(1, parseInt(v) || 20)))
  })
};

module.exports = { validateBody, validateParams, validateQuery, schemas };