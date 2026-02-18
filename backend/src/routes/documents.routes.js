'use strict';

const express = require('express');
const documentsController = require('../controllers/documents.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { single, validate } = require('../middleware/upload.middleware');
const { upload: uploadRateLimit } = require('../middleware/rate-limit.middleware');
const { validateParams, validateQuery, schemas } = require('../middleware/validation.middleware');

const router = express.Router();

router.use(verifyToken);

// ✅ Upload route
router.post('/',
  uploadRateLimit,
  single,
  validate,
  documentsController.upload
);

router.get('/', validateQuery(schemas.pagination), documentsController.list);
router.get('/stats', documentsController.stats);
router.get('/:id', validateParams(schemas.uuidParam), documentsController.getOne);
router.delete('/:id', validateParams(schemas.uuidParam), documentsController.remove);
router.get('/:id/images', validateParams(schemas.uuidParam), documentsController.getImages);
router.get('/:id/images/:filename', documentsController.serveImage);

module.exports = router;