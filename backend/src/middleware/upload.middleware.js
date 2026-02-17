// backend/src/middleware/upload.middleware.js
'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { validateFileType, validateFileSize, sanitizeFilename } = require('../utils/validation');
const { logger } = require('../utils/logger');

// Ensure upload directories exist at startup
const dirs = [
  config.UPLOAD_DIR,
  path.join(config.UPLOAD_DIR, 'documents'),
  path.join(config.UPLOAD_DIR, 'images'),
  path.join(config.UPLOAD_DIR, 'temp')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created upload directory: ${dir}`, { component: 'upload-middleware' });
  }
});

// ----------------------------------------------------------------
// Multer storage — generates a secure unique filename
// ----------------------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(config.UPLOAD_DIR, 'temp'));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = sanitizeFilename(`${timestamp}_${random}${ext}`);
    cb(null, safe);
  }
});

// ----------------------------------------------------------------
// Multer file filter — MIME type check at upload time
// (magic bytes are checked after upload in validateUploadedFile)
// ----------------------------------------------------------------

const allowedMimeTypes = config.ALLOWED_MIME_TYPES.split(',').map(t => t.trim());

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" not allowed. Allowed: ${allowedMimeTypes.join(', ')}`), false);
  }
};

// ----------------------------------------------------------------
// Multer instance
// ----------------------------------------------------------------

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1 // one file at a time
  }
});

// ----------------------------------------------------------------
// Post-upload magic bytes validation middleware
// Call this AFTER multer processes the file
// ----------------------------------------------------------------

async function validateUploadedFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      code: 'NO_FILE'
    });
  }

  try {
    // Read only the first 8 bytes — enough for magic bytes
    const fd = fs.openSync(req.file.path, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    validateFileType(buffer, req.file.mimetype, req.file.originalname);
    validateFileSize(req.file.size, config.MAX_FILE_SIZE_MB);

    next();
  } catch (error) {
    // Delete the invalid file
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    logger.warn('File validation failed', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      error: error.message,
      component: 'upload-middleware'
    });

    return res.status(400).json({
      success: false,
      error: error.message,
      code: 'INVALID_FILE'
    });
  }
}

module.exports = {
  // Use as: router.post('/upload', uploadMiddleware.single, uploadMiddleware.validate, controller)
  single: upload.single('file'),
  validate: validateUploadedFile
};