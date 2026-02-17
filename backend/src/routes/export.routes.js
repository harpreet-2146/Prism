const express = require('express');
const exportController = require('../controllers/export.controller');
const { 
  validateExportRequest,
  validatePagination,
  validateUUIDParam 
} = require('../middleware/validation.middleware');
const { 
  authenticateToken, 
  refreshTokenIfNeeded,
  checkOwnership,
  userRateLimit 
} = require('../middleware/auth.middleware');

const router = express.Router();

// All export routes require authentication
router.use(authenticateToken);
router.use(refreshTokenIfNeeded);

// Apply rate limiting for export operations
router.use(userRateLimit(50, 60 * 60 * 1000)); // 50 export requests per hour

// Create export job
router.post('/', 
  validateExportRequest,
  userRateLimit(20, 60 * 60 * 1000), // 20 export jobs per hour
  exportController.createExport
);

// List user's export jobs
router.get('/', 
  validatePagination,
  exportController.getExports
);

// Get specific export job
router.get('/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.getExport
);

// Download export file
router.get('/:id/download', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.downloadExport
);

// Cancel export job
router.delete('/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.cancelExport
);

// Retry failed export
router.post('/:id/retry', 
  validateUUIDParam,
  checkOwnership('userId'),
  userRateLimit(10, 60 * 60 * 1000), // 10 retry requests per hour
  exportController.retryExport
);

// Get export statistics
router.get('/stats/user', 
  exportController.getUserExportStats
);

// Get export history with filters
router.get('/history', 
  validatePagination,
  exportController.getExportHistory
);

// Batch export operations
router.post('/batch', 
  validateExportRequest,
  userRateLimit(5, 60 * 60 * 1000), // 5 batch exports per hour
  exportController.createBatchExport
);

// Get available export templates
router.get('/templates', 
  exportController.getTemplates
);

// Create custom template
router.post('/templates', 
  userRateLimit(10, 24 * 60 * 60 * 1000), // 10 template creations per day
  exportController.createTemplate
);

// Update custom template
router.put('/templates/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.updateTemplate
);

// Delete custom template
router.delete('/templates/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.deleteTemplate
);

// Preview export (without creating full export)
router.post('/preview', 
  validateExportRequest,
  userRateLimit(30, 60 * 60 * 1000), // 30 previews per hour
  exportController.previewExport
);

// Export formats and capabilities
router.get('/formats', 
  exportController.getFormats
);

// Bulk download multiple exports
router.post('/bulk-download', 
  userRateLimit(5, 60 * 60 * 1000), // 5 bulk downloads per hour
  exportController.bulkDownload
);

// Schedule export for later
router.post('/schedule', 
  validateExportRequest,
  userRateLimit(10, 24 * 60 * 60 * 1000), // 10 scheduled exports per day
  exportController.scheduleExport
);

// Get scheduled exports
router.get('/scheduled', 
  validatePagination,
  exportController.getScheduledExports
);

// Cancel scheduled export
router.delete('/scheduled/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  exportController.cancelScheduledExport
);

module.exports = router;