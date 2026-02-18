'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { logger } = require('../utils/logger');

// Ensure upload directories exist
const TEMP_DIR = path.join(config.UPLOAD_DIR, 'temp');
const DOCS_DIR = path.join(config.UPLOAD_DIR, 'documents');

[TEMP_DIR, DOCS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`, { component: 'upload-middleware' });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error(`Only PDF files allowed. Got: ${file.mimetype}`), false);
  }
};

// Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024
  }
});

// Validation middleware (runs after multer)
async function validateUploadedFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      code: 'NO_FILE'
    });
  }

  // Basic validation
  if (req.file.size === 0) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({
      success: false,
      error: 'Uploaded file is empty',
      code: 'EMPTY_FILE'
    });
  }

  next();
}

// ✅ FIXED: Export with field name 'document'
module.exports = {
  single: upload.single('document'),
  validate: validateUploadedFile
};