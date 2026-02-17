const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { AppError } = require('./error.middleware');
const { sanitizeFilename, generateUUID } = require('../utils/helpers');
const logger = require('../utils/logger');

// Ensure upload directory exists
const ensureUploadDir = () => {
  if (!fs.existsSync(config.uploads.directory)) {
    fs.mkdirSync(config.uploads.directory, { recursive: true });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureUploadDir();
      cb(null, config.uploads.directory);
    } catch (error) {
      cb(new AppError('Failed to create upload directory', 500));
    }
  },
  
  filename: (req, file, cb) => {
    try {
      // Generate unique filename to avoid conflicts
      const uniqueId = generateUUID();
      const sanitizedName = sanitizeFilename(file.originalname);
      const extension = path.extname(sanitizedName);
      const basename = path.basename(sanitizedName, extension);
      
      const filename = `${uniqueId}_${basename}${extension}`;
      cb(null, filename);
    } catch (error) {
      cb(new AppError('Failed to generate filename', 500));
    }
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  try {
    // Check MIME type
    if (!config.uploads.allowedMimeTypes.includes(file.mimetype)) {
      const allowedTypes = config.uploads.allowedMimeTypes.join(', ');
      return cb(new AppError(`Invalid file type. Allowed types: ${allowedTypes}`, 400));
    }

    // Additional security check - verify file extension matches MIME type
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeTypeMap = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    const expectedMimeType = mimeTypeMap[extension];
    if (expectedMimeType && expectedMimeType !== file.mimetype) {
      return cb(new AppError('File extension does not match file type', 400));
    }

    // Log file upload attempt
    logger.info('File upload initiated', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: req.user?.id
    });

    cb(null, true);
  } catch (error) {
    cb(new AppError('File validation failed', 400));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.uploads.maxFileSize,
    files: 5, // Maximum 5 files per request
    fields: 10 // Maximum 10 non-file fields
  }
});

// Error handling wrapper for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size is ${config.uploads.maxFileSize / (1024 * 1024)}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum 5 files allowed';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in request';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in multipart request';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
    }
    
    logger.warn('Multer error:', {
      code: err.code,
      message: err.message,
      userId: req.user?.id
    });
    
    return next(new AppError(message, 400));
  }
  
  next(err);
};

// Single file upload middleware
const uploadSingle = (fieldName = 'file') => {
  return [
    upload.single(fieldName),
    handleMulterError,
    (req, res, next) => {
      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }
      
      logger.info('File uploaded successfully', {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        userId: req.user?.id
      });
      
      next();
    }
  ];
};

// Multiple files upload middleware
const uploadMultiple = (fieldName = 'files', maxCount = 5) => {
  return [
    upload.array(fieldName, maxCount),
    handleMulterError,
    (req, res, next) => {
      if (!req.files || req.files.length === 0) {
        return next(new AppError('No files uploaded', 400));
      }
      
      logger.info('Multiple files uploaded successfully', {
        count: req.files.length,
        files: req.files.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          size: file.size
        })),
        userId: req.user?.id
      });
      
      next();
    }
  ];
};

// Mixed fields upload middleware
const uploadFields = (fields) => {
  return [
    upload.fields(fields),
    handleMulterError,
    (req, res, next) => {
      let totalFiles = 0;
      if (req.files) {
        Object.values(req.files).forEach(fileArray => {
          totalFiles += fileArray.length;
        });
      }
      
      if (totalFiles === 0) {
        return next(new AppError('No files uploaded', 400));
      }
      
      logger.info('Mixed fields uploaded successfully', {
        totalFiles,
        fields: Object.keys(req.files || {}),
        userId: req.user?.id
      });
      
      next();
    }
  ];
};

// Cleanup middleware to remove uploaded files on error
const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  const cleanup = () => {
    if (res.statusCode >= 400) {
      const filesToDelete = [];
      
      // Collect files to delete
      if (req.file) {
        filesToDelete.push(req.file.path);
      }
      if (req.files) {
        if (Array.isArray(req.files)) {
          req.files.forEach(file => filesToDelete.push(file.path));
        } else {
          Object.values(req.files).forEach(fileArray => {
            fileArray.forEach(file => filesToDelete.push(file.path));
          });
        }
      }
      
      // Delete files asynchronously
      filesToDelete.forEach(filePath => {
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            logger.error('Failed to cleanup uploaded file:', {
              filePath,
              error: err.message
            });
          }
        });
      });
      
      if (filesToDelete.length > 0) {
        logger.info('Cleaned up uploaded files due to error', {
          filesDeleted: filesToDelete.length,
          statusCode: res.statusCode
        });
      }
    }
  };
  
  res.send = function(...args) {
    cleanup();
    originalSend.apply(this, args);
  };
  
  res.json = function(...args) {
    cleanup();
    originalJson.apply(this, args);
  };
  
  next();
};

// Validate uploaded file integrity
const validateFileIntegrity = async (req, res, next) => {
  try {
    const filesToValidate = [];
    
    if (req.file) {
      filesToValidate.push(req.file);
    }
    if (req.files) {
      if (Array.isArray(req.files)) {
        filesToValidate.push(...req.files);
      } else {
        Object.values(req.files).forEach(fileArray => {
          filesToValidate.push(...fileArray);
        });
      }
    }
    
    for (const file of filesToValidate) {
      // Check if file exists and is readable
      try {
        await fs.promises.access(file.path, fs.constants.R_OK);
        const stats = await fs.promises.stat(file.path);
        
        if (stats.size === 0) {
          throw new Error('File is empty');
        }
        
        if (stats.size !== file.size) {
          throw new Error('File size mismatch');
        }
      } catch (error) {
        logger.error('File integrity check failed:', {
          filename: file.filename,
          error: error.message
        });
        return next(new AppError(`File integrity check failed: ${file.originalname}`, 400));
      }
    }
    
    next();
  } catch (error) {
    next(new AppError('File validation failed', 500));
  }
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  handleMulterError,
  cleanupOnError,
  validateFileIntegrity
};