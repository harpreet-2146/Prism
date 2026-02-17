const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { generateUUID, ensureDirectory } = require('../utils/helpers');
const pdfExportService = require('./export/pdf-export.service');
const templateService = require('./export/template.service');

const prisma = new PrismaClient();

class ExportService {
  constructor() {
    this.ensureExportDirectory();
  }

  /**
   * Ensure export directory exists
   */
  async ensureExportDirectory() {
    try {
      await ensureDirectory(config.exports.directory);
      logger.info('Export directory ready:', config.exports.directory);
    } catch (error) {
      logger.error('Failed to create export directory:', error);
    }
  }

  /**
   * Create new export job
   */
  async createExport({ userId, type, format, itemIds, options = {} }) {
    try {
      // Validate format
      if (!config.exports.formats.includes(format)) {
        throw new AppError(`Unsupported export format: ${format}`, 400);
      }

      // Validate items exist and belong to user
      await this.validateExportItems(userId, type, itemIds);

      // Create export job
      const exportJob = await prisma.exportJob.create({
        data: {
          userId,
          type,
          format,
          itemIds,
          status: 'PENDING',
          options,
          estimatedTime: this.estimateExportTime(type, format, itemIds.length),
          expiresAt: new Date(Date.now() + config.exports.maxRetentionDays * 24 * 60 * 60 * 1000)
        }
      });

      // Start export processing asynchronously
      this.processExportAsync(exportJob.id);

      return exportJob;

    } catch (error) {
      logger.error('Create export error:', error);
      throw error;
    }
  }

  /**
   * Validate export items belong to user
   */
  async validateExportItems(userId, type, itemIds) {
    switch (type) {
      case 'CONVERSATION':
        const conversationCount = await prisma.conversation.count({
          where: {
            id: { in: itemIds },
            userId
          }
        });
        if (conversationCount !== itemIds.length) {
          throw new AppError('Some conversations not found or not accessible', 404);
        }
        break;

      case 'DOCUMENT':
        const documentCount = await prisma.document.count({
          where: {
            id: { in: itemIds },
            userId
          }
        });
        if (documentCount !== itemIds.length) {
          throw new AppError('Some documents not found or not accessible', 404);
        }
        break;

      case 'BATCH':
        // For batch exports, validate each item type separately
        // This would require more complex logic based on options.originalType
        break;

      default:
        throw new AppError('Invalid export type', 400);
    }
  }

  /**
   * Estimate export processing time
   */
  estimateExportTime(type, format, itemCount) {
    const baseTime = {
      'CONVERSATION': 30, // 30 seconds per conversation
      'DOCUMENT': 20,     // 20 seconds per document
      'BATCH': 45         // 45 seconds per batch item
    };

    const formatMultiplier = {
      'pdf': 1.5,
      'docx': 1.2,
      'markdown': 0.8,
      'json': 0.5
    };

    const base = baseTime[type] || 30;
    const multiplier = formatMultiplier[format] || 1;
    
    return Math.ceil(base * itemCount * multiplier);
  }

  /**
   * Process export job asynchronously
   */
  async processExportAsync(exportJobId) {
    let exportJob;
    
    try {
      // Update status to processing
      exportJob = await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
          progress: 0
        }
      });

      logger.info('Starting export processing', { exportJobId, type: exportJob.type, format: exportJob.format });

      // Get the data to export
      const exportData = await this.gatherExportData(exportJob);

      // Update progress
      await this.updateExportProgress(exportJobId, 25);

      // Apply template/formatting
      const templateData = await this.applyTemplate(exportData, exportJob);

      // Update progress
      await this.updateExportProgress(exportJobId, 50);

      // Generate the export file
      const filePath = await this.generateExportFile(templateData, exportJob);

      // Update progress
      await this.updateExportProgress(exportJobId, 75);

      // Get file stats
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);

      // Complete the export
      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          filename,
          filepath: filePath,
          fileSize: stats.size,
          completedAt: new Date()
        }
      });

      logger.info('Export completed successfully', { 
        exportJobId, 
        filename, 
        fileSize: stats.size 
      });

    } catch (error) {
      logger.error('Export processing failed:', error);

      // Update export job with error
      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'FAILED',
          error: error.message,
          completedAt: new Date()
        }
      });

      // Clean up partial files
      if (exportJob?.filepath) {
        await this.cleanupFile(exportJob.filepath);
      }
    }
  }

  /**
   * Update export progress
   */
  async updateExportProgress(exportJobId, progress) {
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { progress }
    });
  }

  /**
   * Gather data for export
   */
  async gatherExportData(exportJob) {
    const { type, itemIds, userId, options } = exportJob;

    switch (type) {
      case 'CONVERSATION':
        return await this.gatherConversationData(userId, itemIds, options);
      
      case 'DOCUMENT':
        return await this.gatherDocumentData(userId, itemIds, options);
      
      case 'BATCH':
        return await this.gatherBatchData(userId, itemIds, options);
      
      default:
        throw new AppError('Unsupported export type', 400);
    }
  }

  /**
   * Gather conversation data for export
   */
  async gatherConversationData(userId, conversationIds, options = {}) {
    const conversations = await prisma.conversation.findMany({
      where: {
        id: { in: conversationIds },
        userId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          ...(options.includeImages && {
            include: {
              images: true
            }
          })
        },
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      type: 'conversations',
      items: conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        summary: conv.summary,
        messageCount: conv.messages.length,
        messages: conv.messages,
        user: conv.user,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      })),
      metadata: {
        totalConversations: conversations.length,
        totalMessages: conversations.reduce((sum, conv) => sum + conv.messages.length, 0),
        exportedAt: new Date(),
        exportedBy: conversations[0]?.user
      }
    };
  }

  /**
   * Gather document data for export
   */
  async gatherDocumentData(userId, documentIds, options = {}) {
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId
      },
      include: {
        sapMetadata: options.includeMetadata,
        images: options.includeImages,
        user: {
          select: {
            fullName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      type: 'documents',
      items: documents.map(doc => ({
        id: doc.id,
        originalName: doc.originalName,
        summary: doc.summary,
        extractedText: doc.extractedText,
        category: doc.category,
        tags: doc.tags,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        sapMetadata: doc.sapMetadata,
        images: doc.images,
        status: doc.status,
        createdAt: doc.createdAt,
        processedAt: doc.processedAt
      })),
      metadata: {
        totalDocuments: documents.length,
        totalSize: documents.reduce((sum, doc) => sum + doc.fileSize, 0),
        exportedAt: new Date(),
        exportedBy: documents[0]?.user
      }
    };
  }

  /**
   * Gather batch data for export
   */
  async gatherBatchData(userId, itemIds, options = {}) {
    // Batch export combines multiple types
    const { originalType } = options;

    if (originalType === 'CONVERSATION') {
      return await this.gatherConversationData(userId, itemIds, options);
    } else if (originalType === 'DOCUMENT') {
      return await this.gatherDocumentData(userId, itemIds, options);
    } else {
      // Mixed batch - would require more complex logic
      throw new AppError('Mixed batch exports not yet supported', 400);
    }
  }

  /**
   * Apply template to export data
   */
  async applyTemplate(exportData, exportJob) {
    const { format, options } = exportJob;
    const theme = options.theme || 'professional';

    return await templateService.applyTemplate(exportData, {
      format,
      theme,
      includeMetadata: options.includeMetadata !== false,
      includeImages: options.includeImages !== false,
      includeSources: options.includeSources !== false,
      language: options.language || 'en'
    });
  }

  /**
   * Generate export file
   */
  async generateExportFile(templateData, exportJob) {
    const { format, id: exportJobId } = exportJob;
    const filename = `export_${exportJobId}_${Date.now()}.${format}`;
    const filepath = path.join(config.exports.directory, filename);

    switch (format) {
      case 'pdf':
        return await pdfExportService.generatePDF(templateData, filepath);
      
      case 'docx':
        return await this.generateDocx(templateData, filepath);
      
      case 'markdown':
        return await this.generateMarkdown(templateData, filepath);
      
      case 'json':
        return await this.generateJSON(templateData, filepath);
      
      default:
        throw new AppError('Unsupported export format', 400);
    }
  }

  /**
   * Generate DOCX file
   */
  async generateDocx(templateData, filepath) {
    // Placeholder - would use a library like docx
    const content = JSON.stringify(templateData, null, 2);
    await fs.writeFile(filepath, content);
    return filepath;
  }

  /**
   * Generate Markdown file
   */
  async generateMarkdown(templateData, filepath) {
    let markdown = `# ${templateData.title}\n\n`;
    
    if (templateData.metadata) {
      markdown += `**Exported:** ${templateData.metadata.exportedAt}\n`;
      markdown += `**Total Items:** ${templateData.items.length}\n\n`;
    }

    // Convert items to markdown
    templateData.items.forEach((item, index) => {
      if (templateData.type === 'conversations') {
        markdown += `## Conversation ${index + 1}: ${item.title}\n\n`;
        item.messages.forEach(msg => {
          markdown += `**${msg.role === 'user' ? 'User' : 'Assistant'}:** ${msg.content}\n\n`;
        });
      } else if (templateData.type === 'documents') {
        markdown += `## Document ${index + 1}: ${item.originalName}\n\n`;
        if (item.summary) markdown += `**Summary:** ${item.summary}\n\n`;
        if (item.extractedText) markdown += `**Content:**\n${item.extractedText}\n\n`;
      }
    });

    await fs.writeFile(filepath, markdown);
    return filepath;
  }

  /**
   * Generate JSON file
   */
  async generateJSON(templateData, filepath) {
    const jsonContent = JSON.stringify(templateData, null, 2);
    await fs.writeFile(filepath, jsonContent);
    return filepath;
  }

  /**
   * Cancel export job
   */
  async cancelExport(userId, exportJobId) {
    const exportJob = await prisma.exportJob.findFirst({
      where: { id: exportJobId, userId }
    });

    if (!exportJob) {
      throw new AppError('Export job not found', 404);
    }

    if (exportJob.status === 'COMPLETED') {
      throw new AppError('Cannot cancel completed export', 400);
    }

    if (exportJob.status === 'CANCELLED') {
      throw new AppError('Export already cancelled', 400);
    }

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date()
      }
    });

    // Clean up partial files
    if (exportJob.filepath) {
      await this.cleanupFile(exportJob.filepath);
    }

    return { cancelled: true };
  }

  /**
   * Retry failed export
   */
  async retryExport(userId, exportJobId) {
    const exportJob = await prisma.exportJob.findFirst({
      where: { id: exportJobId, userId }
    });

    if (!exportJob) {
      throw new AppError('Export job not found', 404);
    }

    if (exportJob.status !== 'FAILED') {
      throw new AppError('Can only retry failed exports', 400);
    }

    // Reset export job
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'PENDING',
        progress: 0,
        error: null,
        startedAt: null,
        completedAt: null,
        filename: null,
        filepath: null,
        fileSize: null
      }
    });

    // Start processing again
    this.processExportAsync(exportJobId);

    return { retried: true };
  }

  /**
   * Get user export statistics
   */
  async getUserExportStats(userId) {
    const stats = await prisma.exportJob.groupBy({
      by: ['status', 'format'],
      where: { userId },
      _count: { id: true },
      _sum: { fileSize: true }
    });

    const totalExports = await prisma.exportJob.count({ where: { userId } });
    const recentExports = await prisma.exportJob.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    const byStatus = {};
    const byFormat = {};
    let totalSize = 0;

    stats.forEach(stat => {
      const key = `${stat.status}_${stat.format}`;
      byStatus[stat.status] = (byStatus[stat.status] || 0) + stat._count.id;
      byFormat[stat.format] = (byFormat[stat.format] || 0) + stat._count.id;
      totalSize += stat._sum.fileSize || 0;
    });

    return {
      totalExports,
      recentExports,
      byStatus,
      byFormat,
      totalSize,
      averageSize: totalExports > 0 ? Math.round(totalSize / totalExports) : 0
    };
  }

  /**
   * Generate preview of export
   */
  async generatePreview({ userId, type, itemIds, format, options = {} }) {
    // Limit preview to first item
    const previewItemIds = itemIds.slice(0, 1);
    
    const exportData = await this.gatherExportData({
      type,
      itemIds: previewItemIds,
      userId,
      options
    });

    const templateData = await this.applyTemplate(exportData, {
      format,
      options: { ...options, preview: true }
    });

    // Generate preview content (first 1000 characters)
    let preview = '';
    
    if (format === 'markdown') {
      preview = await this.generateMarkdownPreview(templateData);
    } else if (format === 'json') {
      preview = JSON.stringify(templateData, null, 2).substring(0, 1000);
    } else {
      preview = 'Preview not available for this format';
    }

    return {
      format,
      itemCount: previewItemIds.length,
      estimatedSize: preview.length * itemIds.length,
      preview: preview.substring(0, 1000),
      fullItemCount: itemIds.length
    };
  }

  /**
   * Generate markdown preview
   */
  async generateMarkdownPreview(templateData) {
    let preview = `# ${templateData.title}\n\n`;
    
    if (templateData.items.length > 0) {
      const item = templateData.items[0];
      if (templateData.type === 'conversations') {
        preview += `## ${item.title}\n\n`;
        if (item.messages.length > 0) {
          preview += `**${item.messages[0].role}:** ${item.messages[0].content.substring(0, 200)}...\n\n`;
        }
      } else if (templateData.type === 'documents') {
        preview += `## ${item.originalName}\n\n`;
        preview += `**Summary:** ${item.summary || 'No summary available'}\n\n`;
      }
    }

    preview += `*... and ${templateData.items.length - 1} more items*`;
    
    return preview;
  }

  /**
   * Create bulk download ZIP file
   */
  async createBulkDownload(userId, exportIds) {
    const exports = await prisma.exportJob.findMany({
      where: {
        id: { in: exportIds },
        userId,
        status: 'COMPLETED'
      }
    });

    if (exports.length === 0) {
      throw new AppError('No completed exports found', 404);
    }

    const archiver = require('archiver');
    const zipFilename = `bulk_export_${Date.now()}.zip`;
    const zipPath = path.join(config.exports.directory, zipFilename);

    // Create ZIP file
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (const exportJob of exports) {
      if (exportJob.filepath && await this.fileExists(exportJob.filepath)) {
        archive.file(exportJob.filepath, { name: exportJob.filename });
      }
    }

    await archive.finalize();

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve({
          filename: zipFilename,
          filepath: zipPath,
          size: archive.pointer(),
          itemCount: exports.length
        });
      });

      output.on('error', reject);
    });
  }

  /**
   * Schedule export for later
   */
  async scheduleExport({ userId, type, format, itemIds, options, scheduledFor }) {
    const exportJob = await prisma.exportJob.create({
      data: {
        userId,
        type,
        format,
        itemIds,
        status: 'PENDING',
        options,
        startedAt: scheduledFor,
        estimatedTime: this.estimateExportTime(type, format, itemIds.length),
        expiresAt: new Date(scheduledFor.getTime() + config.exports.maxRetentionDays * 24 * 60 * 60 * 1000)
      }
    });

    // Schedule the export job (would use a job queue in production)
    logger.info('Export scheduled', { 
      exportJobId: exportJob.id, 
      scheduledFor: scheduledFor.toISOString() 
    });

    return exportJob;
  }

  /**
   * Clean up expired exports
   */
  async cleanupExpiredExports() {
    const expiredExports = await prisma.exportJob.findMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { 
            status: 'COMPLETED',
            completedAt: { lt: new Date(Date.now() - config.exports.maxRetentionDays * 24 * 60 * 60 * 1000) }
          }
        ]
      }
    });

    let cleanedCount = 0;

    for (const exportJob of expiredExports) {
      try {
        // Delete file
        if (exportJob.filepath) {
          await this.cleanupFile(exportJob.filepath);
        }

        // Delete database record
        await prisma.exportJob.delete({
          where: { id: exportJob.id }
        });

        cleanedCount++;
      } catch (error) {
        logger.error('Failed to cleanup export:', error);
      }
    }

    logger.info('Cleanup completed', { cleanedCount });
    return cleanedCount;
  }

  /**
   * Utility: Check if file exists
   */
  async fileExists(filepath) {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility: Clean up file
   */
  async cleanupFile(filepath) {
    try {
      await fs.unlink(filepath);
      logger.info('File cleaned up:', filepath);
    } catch (error) {
      logger.error('Failed to cleanup file:', error);
    }
  }
}

module.exports = new ExportService();