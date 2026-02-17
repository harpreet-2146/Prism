// backend/src/routes/export.routes.js
'use strict';

const express = require('express');
const exportController = require('../controllers/export.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { validateParams, schemas } = require('../middleware/validation.middleware');
const { exportLimit } = require('../middleware/rate-limit.middleware');
const { z } = require('zod');
const { validateBody } = require('../middleware/validation.middleware');

const router = express.Router();

// All export routes require auth
router.use(verifyToken);
router.use(exportLimit);

const exportSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID')
});

// Export a conversation as PDF
router.post('/pdf',
  validateBody(exportSchema),
  exportController.exportPDF
);

// Export a conversation as .docx (Word — importable into Google Docs)
router.post('/docx',
  validateBody(exportSchema),
  exportController.exportDOCX
);

// Download a previously generated export file
router.get('/download/:filename',
  exportController.download
);

module.exports = router;