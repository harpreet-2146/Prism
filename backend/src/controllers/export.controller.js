// backend/src/controllers/export.controller.js
'use strict';

const path = require('path');
const fs = require('fs');
const prisma = require('../utils/prisma');
const pdfExportService = require('../services/export/pdf-export.service');
const docxExportService = require('../services/export/docx-export.service');
const chatService = require('../services/chat.service');
const config = require('../config');
const { logger } = require('../utils/logger');

class ExportController {
  // ----------------------------------------------------------------
  // EXPORT AS PDF — POST /api/export/pdf
  // ----------------------------------------------------------------

  exportPDF = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user.id;

    try {
      const conversation = await chatService.getConversation(conversationId, userId);
      const messages = await chatService.getMessages(conversationId);

      if (messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot export an empty conversation'
        });
      }

      const { filename } = await pdfExportService.exportConversation(conversation, messages);

      logger.info('PDF exported', { userId, conversationId, filename, component: 'export-controller' });

      res.json({
        success: true,
        data: {
          filename,
          downloadUrl: `${config.BASE_URL}/api/export/download/${filename}`,
          expiresIn: '1 hour'
        }
      });

    } catch (error) {
      logger.error('PDF export failed', {
        userId, conversationId, error: error.message, component: 'export-controller'
      });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // EXPORT AS DOCX — POST /api/export/docx
  // ----------------------------------------------------------------

  exportDOCX = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user.id;

    try {
      const conversation = await chatService.getConversation(conversationId, userId);
      const messages = await chatService.getMessages(conversationId);

      if (messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot export an empty conversation'
        });
      }

      const { filename } = await docxExportService.exportConversation(conversation, messages);

      logger.info('DOCX exported', { userId, conversationId, filename, component: 'export-controller' });

      res.json({
        success: true,
        data: {
          filename,
          downloadUrl: `${config.BASE_URL}/api/export/download/${filename}`,
          expiresIn: '1 hour',
          tip: 'Upload this .docx file to Google Drive — it will automatically open as a Google Doc'
        }
      });

    } catch (error) {
      logger.error('DOCX export failed', {
        userId, conversationId, error: error.message, component: 'export-controller'
      });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // DOWNLOAD — GET /api/export/download/:filename
  // ----------------------------------------------------------------

  download = async (req, res) => {
    const { filename } = req.params;

    // Security: prevent path traversal
    const safe = path.basename(filename);
    if (safe !== filename || (!safe.endsWith('.pdf') && !safe.endsWith('.docx'))) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    const filePath = path.join(config.EXPORT_TEMP_DIR, safe);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Export file not found or has expired'
      });
    }

    const contentType = safe.endsWith('.pdf')
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.sendFile(filePath);
  };
}

module.exports = new ExportController();