// backend/src/routes/export.routes.js
// Handles conversation export to PDF and DOCX
//
// Routes:
//   GET /api/export/conversation/:id/pdf   → download PDF
//   GET /api/export/conversation/:id/docx  → download DOCX (future)
//
// Usage in app.js / index.js:
//   const exportRoutes = require('./routes/export.routes');
//   app.use('/api/export', exportRoutes);

'use strict';

const express = require('express');
const router = express.Router();
const { exportConversationPDF } = require('../controllers/export-pdf.controller');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/export/conversation/:id/pdf
router.get('/conversation/:id/pdf', authenticate, exportConversationPDF);

// Placeholder for DOCX export — add controller later
// router.get('/conversation/:id/docx', authMiddleware, exportConversationDOCX);

module.exports = router;
