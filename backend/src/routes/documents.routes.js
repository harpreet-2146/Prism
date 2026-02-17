const express = require('express');
const documentsController = require('../controllers/documents.controller');
const { 
  uploadSingle, 
  uploadMultiple,
  cleanupOnError,
  validateFileIntegrity 
} = require('../middleware/upload.middleware');
const { 
  validateDocumentMetadata,
  validatePagination,
  validateDocumentFilter,
  validateUUIDParam 
} = require('../middleware/validation.middleware');
const { 
  authenticateToken, 
  refreshTokenIfNeeded,
  checkOwnership,
  userRateLimit 
} = require('../middleware/auth.middleware');

const router = express.Router();

// All document routes require authentication
router.use(authenticateToken);
router.use(refreshTokenIfNeeded);

// Apply cleanup on error for all routes
router.use(cleanupOnError);

// Document listing and search
router.get('/', 
  validatePagination,
  validateDocumentFilter,
  documentsController.getDocuments
);

router.get('/search', 
  validatePagination,
  documentsController.searchDocuments
);

// Document statistics
router.get('/stats', 
  documentsController.getStats
);

// Single document upload
router.post('/upload', 
  userRateLimit(20, 60 * 60 * 1000), // 20 uploads per hour
  uploadSingle('file'),
  validateFileIntegrity,
  validateDocumentMetadata,
  documentsController.uploadDocument
);

// Multiple document upload
router.post('/upload-multiple', 
  userRateLimit(5, 60 * 60 * 1000), // 5 batch uploads per hour
  uploadMultiple('files', 5),
  validateFileIntegrity,
  validateDocumentMetadata,
  documentsController.uploadMultipleDocuments
);

// Get specific document
router.get('/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getDocument
);

// Update document metadata
router.put('/:id', 
  validateUUIDParam,
  validateDocumentMetadata,
  checkOwnership('userId'),
  documentsController.updateDocument
);

// Delete document
router.delete('/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.deleteDocument
);

// Download document
router.get('/:id/download', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.downloadDocument
);

// Get document preview/thumbnail
router.get('/:id/preview', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getPreview
);

// Get document text content
router.get('/:id/content', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getContent
);

// Get document images
router.get('/:id/images', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getImages
);

// Get specific image from document
router.get('/:id/images/:imageId', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getImage
);

// Get document metadata
router.get('/:id/metadata', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getMetadata
);

// Reprocess document
router.post('/:id/reprocess', 
  validateUUIDParam,
  checkOwnership('userId'),
  userRateLimit(5, 60 * 60 * 1000), // 5 reprocessing requests per hour
  documentsController.reprocessDocument
);

// Get processing status
router.get('/:id/status', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getProcessingStatus
);

// Share document (generate public link)
router.post('/:id/share', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.shareDocument
);

// Get shared document (public route - no auth required)
router.get('/shared/:shareToken', 
  documentsController.getSharedDocument
);

// Batch operations
router.post('/batch/delete', 
  userRateLimit(10, 60 * 60 * 1000), // 10 batch operations per hour
  documentsController.batchDelete
);

router.post('/batch/reprocess', 
  userRateLimit(5, 60 * 60 * 1000), // 5 batch reprocessing per hour
  documentsController.batchReprocess
);

router.post('/batch/update-metadata', 
  validateDocumentMetadata,
  documentsController.batchUpdateMetadata
);

// Document analysis endpoints
router.get('/:id/analysis', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getAnalysis
);

router.post('/:id/analyze', 
  validateUUIDParam,
  checkOwnership('userId'),
  userRateLimit(10, 60 * 60 * 1000), // 10 analysis requests per hour
  documentsController.analyzeDocument
);

// SAP-specific endpoints
router.get('/:id/sap-metadata', 
  validateUUIDParam,
  checkOwnership('userId'),
  documentsController.getSAPMetadata
);

router.get('/sap/tcodes', 
  documentsController.getTCodes
);

router.get('/sap/modules', 
  documentsController.getModules
);

module.exports = router;