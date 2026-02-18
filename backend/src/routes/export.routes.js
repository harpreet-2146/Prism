// backend/src/routes/export.routes.js
'use strict';

const express = require('express');
const router = express.Router();

console.log('  → Loading export controller...');
const exportController = require('../controllers/export.controller');

console.log('  → Loading auth middleware...');
const { authenticate } = require('../middleware/auth.middleware');

console.log('  → Setting up export routes...');

// Export conversation as PDF (POST with conversationId in body)
router.post('/pdf', authenticate, (req, res) => {
  exportController.exportPDF(req, res);
});

// Export conversation as DOCX (POST with conversationId in body)
router.post('/docx', authenticate, (req, res) => {
  exportController.exportDOCX(req, res);
});

// Download exported file
router.get('/download/:filename', (req, res) => {
  exportController.download(req, res);
});

console.log('  → Export routes configured');

module.exports = router;