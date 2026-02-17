// backend/src/controllers/documents.controller.js
'use strict';

const path = require('path');
const documentsService = require('../services/documents.service');
const { logger } = require('../utils/logger');

class DocumentsController {
  upload = async (req, res) => {
    try {
      const document = await documentsService.uploadDocument(req.file, req.user.id);

      res.status(202).json({
        success: true,
        message: 'Document uploaded. Processing started in background.',
        data: { document }
      });
    } catch (error) {
      logger.error('Document upload failed', {
        userId: req.user.id,
        error: error.message,
        component: 'documents-controller'
      });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  list = async (req, res) => {
    try {
      const { page, limit } = req.query;
      const result = await documentsService.getUserDocuments(req.user.id, page, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  getOne = async (req, res) => {
    try {
      const document = await documentsService.getDocument(req.params.id, req.user.id);
      res.json({ success: true, data: { document } });
    } catch (error) {
      const status = error.message === 'Document not found' ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  };

  remove = async (req, res) => {
    try {
      await documentsService.deleteDocument(req.params.id, req.user.id);
      res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
      const status = error.message === 'Document not found' ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  };

  getImages = async (req, res) => {
    try {
      const images = await documentsService.getDocumentImages(req.params.id, req.user.id);

      // Add public URLs to each image
      const imagesWithUrls = images.map(img => ({
        ...img,
        url: `/api/documents/${req.params.id}/images/${path.basename(img.storagePath)}`
      }));

      res.json({ success: true, data: { images: imagesWithUrls } });
    } catch (error) {
      const status = error.message === 'Document not found' ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
    }
  };

  serveImage = async (req, res) => {
    try {
      const filePath = await documentsService.getImageFilePath(
        req.params.id,
        req.user.id,
        req.params.filename
      );

      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ success: false, error: 'Image not found' });
    }
  };

  stats = async (req, res) => {
    try {
      const stats = await documentsService.getUserStats(req.user.id);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = new DocumentsController();