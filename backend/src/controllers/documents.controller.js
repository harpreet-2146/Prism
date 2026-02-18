// backend/src/controllers/documents.controller.js
'use strict';

const documentsService = require('../services/documents.service');
const { logger } = require('../utils/logger');

class DocumentsController {
  /**
   * Upload a new document
   * POST /api/documents/upload
   */
  async upload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const userId = req.user.id;
      const document = await documentsService.uploadDocument(req.file, userId);

      res.status(201).json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error('Document upload failed', {
        userId: req.user?.id,
        error: error.message,
        component: 'documents-controller'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get all user documents
   * GET /api/documents
   */
  async getUserDocuments(req, res) {
    try {
      const userId = req.user.id;
      const documents = await documentsService.getUserDocuments(userId);

      res.json({
        success: true,
        data: documents
      });

    } catch (error) {
      logger.error('Failed to fetch user documents', {
        userId: req.user?.id,
        error: error.message,
        component: 'documents-controller'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get document by ID
   * GET /api/documents/:id
   */
  async getDocumentById(req, res) {
    try {
      const userId = req.user.id;
      const documentId = req.params.id;

      const document = await documentsService.getDocumentById(documentId, userId);

      res.json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error('Failed to fetch document', {
        userId: req.user?.id,
        documentId: req.params.id,
        error: error.message,
        component: 'documents-controller'
      });

      const statusCode = error.message === 'Document not found' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete document
   * DELETE /api/documents/:id
   */
  async deleteDocument(req, res) {
    try {
      const userId = req.user.id;
      const documentId = req.params.id;

      const result = await documentsService.deleteDocument(documentId, userId);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Failed to delete document', {
        userId: req.user?.id,
        documentId: req.params.id,
        error: error.message,
        component: 'documents-controller'
      });

      const statusCode = error.message === 'Document not found' ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get document processing status with SSE (Server-Sent Events)
   * GET /api/documents/:id/status
   * 
   * Streams real-time processing progress to client
   */
  async getDocumentStatus(req, res) {
    const userId = req.user.id;
    const documentId = req.params.id;

    try {
      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });

      // Flush headers immediately
      res.flushHeaders();

      logger.info('SSE status stream started', {
        documentId,
        userId,
        component: 'documents-controller'
      });

      // Poll document status every 1 second
      const pollInterval = setInterval(async () => {
        try {
          const status = await documentsService.getDocumentStatus(documentId, userId);

          // Calculate overall progress percentage
          let progress = 0;
          let stage = 'pending';

          if (status.status === 'pending') {
            progress = 0;
            stage = 'pending';
          } else if (status.status === 'processing') {
            // Multi-stage progress calculation:
            // 0-20%: File uploaded
            // 20-40%: Images extracted
            // 40-80%: OCR processing
            // 80-100%: Creating embeddings

            if (status.imageCount === 0) {
              progress = 20;
              stage = 'extracting_images';
            } else if (status.ocrCompleted < status.ocrTotal) {
              // OCR stage: 40-80%
              const ocrProgress = status.ocrTotal > 0 
                ? status.ocrCompleted / status.ocrTotal 
                : 0;
              progress = 40 + (ocrProgress * 40);
              stage = 'ocr_processing';
            } else if (status.embeddingStatus === 'processing') {
              progress = 85;
              stage = 'creating_embeddings';
            } else {
              progress = 95;
              stage = 'finalizing';
            }
          } else if (status.status === 'completed') {
            progress = 100;
            stage = 'completed';
          } else if (status.status === 'failed') {
            progress = 0;
            stage = 'failed';
          }

          // Send SSE event
          const event = {
            type: 'progress',
            progress: Math.round(progress),
            stage,
            status: status.status,
            embeddingStatus: status.embeddingStatus,
            imageCount: status.imageCount,
            ocrCompleted: status.ocrCompleted,
            ocrTotal: status.ocrTotal,
            embeddingsCount: status._count?.embeddings || 0,
            error: status.processingError
          };

          res.write(`data: ${JSON.stringify(event)}\n\n`);
          res.flushHeaders();

          // Stop polling if processing complete or failed
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(pollInterval);

            // Send final event
            const finalEvent = {
              type: status.status === 'completed' ? 'done' : 'error',
              documentId,
              ...event
            };

            res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
            res.flushHeaders();

            // Close connection after 1 second
            setTimeout(() => {
              res.end();
            }, 1000);

            logger.info('SSE status stream completed', {
              documentId,
              userId,
              finalStatus: status.status,
              component: 'documents-controller'
            });
          }

        } catch (error) {
          logger.error('Error polling document status', {
            documentId,
            userId,
            error: error.message,
            component: 'documents-controller'
          });

          // Send error event
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
          })}\n\n`);
          res.flushHeaders();

          clearInterval(pollInterval);
          res.end();
        }
      }, 1000); // Poll every 1 second

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(pollInterval);
        logger.info('SSE status stream closed by client', {
          documentId,
          userId,
          component: 'documents-controller'
        });
      });

    } catch (error) {
      logger.error('SSE status stream failed', {
        documentId,
        userId,
        error: error.message,
        component: 'documents-controller'
      });

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  }

  /**
   * Serve document image
   * GET /api/documents/:documentId/images/:filename
   */
  async serveImage(req, res) {
    try {
      const { documentId, filename } = req.params;
      const userId = req.user.id;

      // Verify user owns this document
      const document = await documentsService.getDocumentById(documentId, userId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Serve the image file
      const path = require('path');
      const config = require('../config');
      const imagePath = path.join(config.UPLOAD_DIR, 'images', documentId, filename);

      res.sendFile(imagePath, (err) => {
        if (err) {
          logger.error('Failed to serve image', {
            documentId,
            filename,
            error: err.message,
            component: 'documents-controller'
          });

          if (!res.headersSent) {
            res.status(404).json({
              success: false,
              error: 'Image not found'
            });
          }
        }
      });

    } catch (error) {
      logger.error('Image serving failed', {
        documentId: req.params.documentId,
        filename: req.params.filename,
        error: error.message,
        component: 'documents-controller'
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DocumentsController();