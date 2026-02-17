// backend/src/routes/documents.routes.js
'use strict';

const express = require('express');
const documentsController = require('../controllers/documents.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { single, validate } = require('../middleware/upload.middleware');
const { upload: uploadRateLimit } = require('../middleware/rate-limit.middleware');
const { validateParams, validateQuery, schemas } = require('../middleware/validation.middleware');

const router = express.Router();

// All document routes require auth
router.use(verifyToken);

// Upload
router.post('/',
  uploadRateLimit,
  single,
  validate,
  documentsController.upload
);

// List
router.get('/',
  validateQuery(schemas.pagination),
  documentsController.list
);

// Stats
router.get('/stats', documentsController.stats);

// Single document
router.get('/:id',
  validateParams(schemas.uuidParam),
  documentsController.getOne
);

// Delete
router.delete('/:id',
  validateParams(schemas.uuidParam),
  documentsController.remove
);

// Get document images list
router.get('/:id/images',
  validateParams(schemas.uuidParam),
  documentsController.getImages
);

// Serve a specific image file
router.get('/:id/images/:filename',
  documentsController.serveImage
);

module.exports = router;