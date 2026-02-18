// backend/src/routes/documents.routes.js
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { authenticate } = require('../middleware/auth.middleware');
const documentsController = require('../controllers/documents.controller');

const router = express.Router();

// ================================================================
// MULTER CONFIGURATION
// ================================================================

const uploadDir = config.UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = config.ALLOWED_MIME_TYPES.split(',');
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} allowed.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024
  }
});

// ================================================================
// ROUTES
// ================================================================

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  documentsController.upload(req, res);
});

router.get('/', authenticate, (req, res) => {
  documentsController.getUserDocuments(req, res);
});

router.get('/:id', authenticate, (req, res) => {
  documentsController.getDocumentById(req, res);
});

router.get('/:id/status', authenticate, (req, res) => {
  documentsController.getDocumentStatus(req, res);
});

router.delete('/:id', authenticate, (req, res) => {
  documentsController.deleteDocument(req, res);
});

router.get('/:documentId/images/:filename', authenticate, (req, res) => {
  documentsController.serveImage(req, res);
});

// ================================================================
// ERROR HANDLING
// ================================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${config.MAX_FILE_SIZE_MB}MB`
      });
    }
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next();
});

module.exports = router;