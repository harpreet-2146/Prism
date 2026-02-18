// backend/src/controllers/export.controller.js
'use strict';

const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pdfExportService = require('../services/export/pdf-export.service');
const docxExportService = require('../services/export/docx-export.service');
const chatService = require('../services/chat.service');
const config = require('../config');
const { logger } = require('../utils/logger');

class ExportController {
  exportPDF = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user.id;

    try {
      const conversation = await chatService.getConversation(conversationId, userId);
      
      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      const messages = conversation.messages || [];

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

  exportDOCX = async (req, res) => {
    const { conversationId } = req.body;
    const userId = req.user.id;

    try {
      const conversation = await chatService.getConversation(conversationId, userId);

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      const messages = conversation.messages || [];

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

  download = async (req, res) => {
    const { filename } = req.params;

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