const Joi = require('joi');
const { AppError } = require('./error.middleware');
const logger = require('../utils/logger');

/**
 * Generic validation middleware
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');
      
      logger.warn('Validation error:', {
        property,
        errors: error.details,
        data: req[property]
      });

      return next(new AppError(`Validation error: ${errorMessage}`, 400));
    }

    // Replace req[property] with validated value
    req[property] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // User authentication schemas
  register: Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string()
      .min(8)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d@$!%*?&]{8,}$'))
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
        'any.required': 'Password is required'
      }),
    
    fullName: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Full name must be at least 2 characters long',
        'string.max': 'Full name cannot exceed 100 characters',
        'any.required': 'Full name is required'
      })
  }),

  login: Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required'
      })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string()
      .required()
      .messages({
        'any.required': 'Current password is required'
      }),
    
    newPassword: Joi.string()
      .min(8)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d@$!%*?&]{8,}$'))
      .required()
      .messages({
        'string.min': 'New password must be at least 8 characters long',
        'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
        'any.required': 'New password is required'
      })
  }),

  // Document schemas
  documentMetadata: Joi.object({
    title: Joi.string().max(255).optional(),
    description: Joi.string().max(1000).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    category: Joi.string().max(100).optional()
  }),

  // Chat schemas
  sendMessage: Joi.object({
    message: Joi.string()
      .min(1)
      .max(4000)
      .required()
      .messages({
        'string.min': 'Message cannot be empty',
        'string.max': 'Message cannot exceed 4000 characters',
        'any.required': 'Message is required'
      }),
    
    conversationId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.uuid': 'Invalid conversation ID format'
      }),
    
    context: Joi.object({
      documentIds: Joi.array().items(Joi.string().uuid()).max(5).optional(),
      searchQuery: Joi.string().max(500).optional(),
      includeHistory: Joi.boolean().optional()
    }).optional()
  }),

  createConversation: Joi.object({
    title: Joi.string()
      .max(255)
      .optional()
      .messages({
        'string.max': 'Title cannot exceed 255 characters'
      })
  }),

  updateConversation: Joi.object({
    title: Joi.string()
      .max(255)
      .optional()
      .messages({
        'string.max': 'Title cannot exceed 255 characters'
      })
  }),

  // Export schemas
  exportRequest: Joi.object({
    type: Joi.string()
      .valid('conversation', 'document', 'batch')
      .required()
      .messages({
        'any.only': 'Export type must be conversation, document, or batch',
        'any.required': 'Export type is required'
      }),
    
    format: Joi.string()
      .valid('pdf', 'docx', 'markdown', 'json')
      .required()
      .messages({
        'any.only': 'Format must be pdf, docx, markdown, or json',
        'any.required': 'Export format is required'
      }),
    
    itemIds: Joi.array()
      .items(Joi.string().uuid())
      .min(1)
      .max(50)
      .required()
      .messages({
        'array.min': 'At least one item ID is required',
        'array.max': 'Cannot export more than 50 items at once',
        'any.required': 'Item IDs are required'
      }),
    
    options: Joi.object({
      includeMetadata: Joi.boolean().default(true),
      includeImages: Joi.boolean().default(true),
      includeSources: Joi.boolean().default(true),
      theme: Joi.string().valid('professional', 'minimal', 'default').default('professional'),
      language: Joi.string().valid('en', 'de').default('en')
    }).optional()
  }),

  // Pagination schema
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.min': 'Page must be at least 1',
        'number.integer': 'Page must be an integer'
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
        'number.integer': 'Limit must be an integer'
      }),
    
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'name', 'size', 'title')
      .optional(),
    
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .messages({
        'any.only': 'Sort order must be asc or desc'
      }),
    
    search: Joi.string()
      .max(255)
      .optional()
      .messages({
        'string.max': 'Search query cannot exceed 255 characters'
      })
  }),

  // File filter schema
  documentFilter: Joi.object({
    status: Joi.string()
      .valid('pending', 'processing', 'completed', 'failed')
      .optional(),
    
    category: Joi.string()
      .max(100)
      .optional(),
    
    dateFrom: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Date must be in ISO format'
      }),
    
    dateTo: Joi.date()
      .iso()
      .min(Joi.ref('dateFrom'))
      .optional()
      .messages({
        'date.format': 'Date must be in ISO format',
        'date.min': 'End date must be after start date'
      }),
    
    minSize: Joi.number()
      .integer()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Minimum size must be non-negative'
      }),
    
    maxSize: Joi.number()
      .integer()
      .min(Joi.ref('minSize'))
      .optional()
      .messages({
        'number.min': 'Maximum size must be greater than minimum size'
      }),

    tcodes: Joi.array()
      .items(Joi.string().max(20))
      .max(10)
      .optional(),

    modules: Joi.array()
      .items(Joi.string().max(20))
      .max(10)
      .optional()
  }),

  // UUID parameter validation
  uuidParam: Joi.object({
    id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.uuid': 'Invalid ID format',
        'any.required': 'ID is required'
      })
  })
};

// Specific validation middleware functions
const validateRegistration = validate(schemas.register);
const validateLogin = validate(schemas.login);
const validateChangePassword = validate(schemas.changePassword);
const validateSendMessage = validate(schemas.sendMessage);
const validateCreateConversation = validate(schemas.createConversation);
const validateUpdateConversation = validate(schemas.updateConversation);
const validateExportRequest = validate(schemas.exportRequest);
const validatePagination = validate(schemas.pagination, 'query');
const validateDocumentFilter = validate(schemas.documentFilter, 'query');
const validateDocumentMetadata = validate(schemas.documentMetadata);
const validateUUIDParam = validate(schemas.uuidParam, 'params');

// Custom validation functions
const validateFileUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next(new AppError('No file uploaded', 400));
  }

  const file = req.file || (req.files && req.files[0]);
  
  if (!file) {
    return next(new AppError('Invalid file upload', 400));
  }

  // Validate file size
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return next(new AppError(`File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`, 400));
  }

  // Validate file type
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return next(new AppError('Invalid file type. Only PDF, Word documents, and images are allowed', 400));
  }

  next();
};

module.exports = {
  validate,
  schemas,
  validateRegistration,
  validateLogin,
  validateChangePassword,
  validateSendMessage,
  validateCreateConversation,
  validateUpdateConversation,
  validateExportRequest,
  validatePagination,
  validateDocumentFilter,
  validateDocumentMetadata,
  validateUUIDParam,
  validateFileUpload
};