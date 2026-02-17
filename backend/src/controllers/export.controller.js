const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { createResponse, calculatePagination } = require('../utils/helpers');
const exportService = require('../services/export.service');

const prisma = new PrismaClient();

/**
 * Create export job
 */
const createExport = async (req, res, next) => {
  try {
    const { type, format, itemIds, options = {} } = req.body;
    const userId = req.user.id;

    // Validate item ownership based on type
    await validateItemOwnership(userId, type, itemIds);

    // Create export job
    const exportJob = await exportService.createExport({
      userId,
      type,
      format,
      itemIds,
      options
    });

    logger.audit('EXPORT_CREATED', userId, {
      exportId: exportJob.id,
      type,
      format,
      itemCount: itemIds.length
    });

    res.status(201).json(createResponse(true, exportJob, 'Export job created successfully'));

  } catch (error) {
    logger.error('Create export error:', error);
    next(error);
  }
};

/**
 * Get user's export jobs
 */
const getExports = async (req, res, next) => {
  try {
    const { page, limit, status, type, format, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const userId = req.user.id;

    // Build where clause
    const where = {
      userId,
      ...(status && { status }),
      ...(type && { type }),
      ...(format && { format })
    };

    // Get total count
    const total = await prisma.exportJob.count({ where });

    // Calculate pagination
    const pagination = calculatePagination(page, limit, total);

    // Get export jobs
    const exports = await prisma.exportJob.findMany({
      where,
      select: {
        id: true,
        type: true,
        format: true,
        status: true,
        progress: true,
        filename: true,
        fileSize: true,
        error: true,
        estimatedTime: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        itemIds: true,
        options: true
      },
      orderBy: { [sortBy]: sortOrder },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    res.json(createResponse(true, exports, null, {
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }));

  } catch (error) {
    logger.error('Get exports error:', error);
    next(error);
  }
};

/**
 * Get specific export job
 */
const getExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const exportJob = await prisma.exportJob.findFirst({
      where: { id, userId }
    });

    if (!exportJob) {
      return next(new AppError('Export job not found', 404));
    }

    res.json(createResponse(true, exportJob));

  } catch (error) {
    logger.error('Get export error:', error);
    next(error);
  }
};

/**
 * Download export file
 */
const downloadExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const exportJob = await prisma.exportJob.findFirst({
      where: { id, userId }
    });

    if (!exportJob) {
      return next(new AppError('Export job not found', 404));
    }

    if (exportJob.status !== 'COMPLETED') {
      return next(new AppError('Export is not ready for download', 400));
    }

    if (!exportJob.filepath) {
      return next(new AppError('Export file not found', 404));
    }

    // Check if export has expired
    if (exportJob.expiresAt && new Date() > exportJob.expiresAt) {
      return next(new AppError('Export has expired', 410));
    }

    // Check if file exists
    const fs = require('fs').promises;
    try {
      await fs.access(exportJob.filepath);
    } catch (error) {
      logger.error('Export file not found:', { 
        exportId: id, 
        filepath: exportJob.filepath 
      });
      return next(new AppError('Export file not found', 404));
    }

    logger.audit('EXPORT_DOWNLOADED', userId, {
      exportId: id,
      filename: exportJob.filename
    });

    // Get MIME type based on format
    const mimeTypes = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'markdown': 'text/markdown',
      'json': 'application/json',
      'zip': 'application/zip'
    };

    const mimeType = mimeTypes[exportJob.format] || 'application/octet-stream';

    // Set appropriate headers
    res.set({
      'Content-Type': mimeType,
      'Content-Length': exportJob.fileSize || 0,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(exportJob.filename)}"`,
      'Cache-Control': 'no-cache'
    });

    // Stream the file
    const fileStream = require('fs').createReadStream(exportJob.filepath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('Export file stream error:', error);
      if (!res.headersSent) {
        next(new AppError('Error reading export file', 500));
      }
    });

  } catch (error) {
    logger.error('Download export error:', error);
    next(error);
  }
};

/**
 * Cancel export job
 */
const cancelExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await exportService.cancelExport(userId, id);

    logger.audit('EXPORT_CANCELLED', userId, {
      exportId: id
    });

    res.json(createResponse(true, result, 'Export job cancelled successfully'));

  } catch (error) {
    logger.error('Cancel export error:', error);
    next(error);
  }
};

/**
 * Retry failed export
 */
const retryExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await exportService.retryExport(userId, id);

    logger.audit('EXPORT_RETRIED', userId, {
      exportId: id
    });

    res.json(createResponse(true, result, 'Export job retried successfully'));

  } catch (error) {
    logger.error('Retry export error:', error);
    next(error);
  }
};

/**
 * Get user export statistics
 */
const getUserExportStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const stats = await exportService.getUserExportStats(userId);

    res.json(createResponse(true, stats));

  } catch (error) {
    logger.error('Get user export stats error:', error);
    next(error);
  }
};

/**
 * Get export history with filters
 */
const getExportHistory = async (req, res, next) => {
  try {
    const { page, limit, dateFrom, dateTo, format, status } = req.query;
    const userId = req.user.id;

    const where = {
      userId,
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { lte: new Date(dateTo) } }),
      ...(format && { format }),
      ...(status && { status })
    };

    const total = await prisma.exportJob.count({ where });
    const pagination = calculatePagination(page, limit, total);

    const exports = await prisma.exportJob.findMany({
      where,
      select: {
        id: true,
        type: true,
        format: true,
        status: true,
        filename: true,
        fileSize: true,
        createdAt: true,
        completedAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    res.json(createResponse(true, exports, null, {
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }));

  } catch (error) {
    logger.error('Get export history error:', error);
    next(error);
  }
};

/**
 * Create batch export
 */
const createBatchExport = async (req, res, next) => {
  try {
    const { type, format, itemIds, options = {} } = req.body;
    const userId = req.user.id;

    // Batch exports have stricter limits
    if (itemIds.length > 50) {
      return next(new AppError('Batch export limited to 50 items', 400));
    }

    // Validate all items
    await validateItemOwnership(userId, type, itemIds);

    // Create batch export job
    const exportJob = await exportService.createExport({
      userId,
      type: 'BATCH',
      format,
      itemIds,
      options: {
        ...options,
        originalType: type,
        batchSize: itemIds.length
      }
    });

    logger.audit('BATCH_EXPORT_CREATED', userId, {
      exportId: exportJob.id,
      type,
      format,
      itemCount: itemIds.length
    });

    res.status(201).json(createResponse(true, exportJob, 'Batch export job created successfully'));

  } catch (error) {
    logger.error('Create batch export error:', error);
    next(error);
  }
};

/**
 * Get available export templates
 */
const getTemplates = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const templates = await prisma.exportTemplate.findMany({
      where: {
        OR: [
          { isPublic: true },
          { userId }
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        format: true,
        isDefault: true,
        isPublic: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    res.json(createResponse(true, templates));

  } catch (error) {
    logger.error('Get templates error:', error);
    next(error);
  }
};

/**
 * Create custom template
 */
const createTemplate = async (req, res, next) => {
  try {
    const { name, description, format, template } = req.body;
    const userId = req.user.id;

    const newTemplate = await prisma.exportTemplate.create({
      data: {
        name,
        description,
        format,
        template,
        userId,
        isDefault: false,
        isPublic: false
      }
    });

    logger.audit('EXPORT_TEMPLATE_CREATED', userId, {
      templateId: newTemplate.id,
      name
    });

    res.status(201).json(createResponse(true, newTemplate, 'Template created successfully'));

  } catch (error) {
    logger.error('Create template error:', error);
    next(error);
  }
};

/**
 * Update custom template
 */
const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, template } = req.body;
    const userId = req.user.id;

    const existingTemplate = await prisma.exportTemplate.findFirst({
      where: { id, userId }
    });

    if (!existingTemplate) {
      return next(new AppError('Template not found', 404));
    }

    const updatedTemplate = await prisma.exportTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
        ...(template && { template })
      }
    });

    logger.audit('EXPORT_TEMPLATE_UPDATED', userId, {
      templateId: id
    });

    res.json(createResponse(true, updatedTemplate, 'Template updated successfully'));

  } catch (error) {
    logger.error('Update template error:', error);
    next(error);
  }
};

/**
 * Delete custom template
 */
const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await prisma.exportTemplate.findFirst({
      where: { id, userId }
    });

    if (!template) {
      return next(new AppError('Template not found', 404));
    }

    await prisma.exportTemplate.delete({
      where: { id }
    });

    logger.audit('EXPORT_TEMPLATE_DELETED', userId, {
      templateId: id,
      name: template.name
    });

    res.json(createResponse(true, null, 'Template deleted successfully'));

  } catch (error) {
    logger.error('Delete template error:', error);
    next(error);
  }
};

/**
 * Preview export without creating full export
 */
const previewExport = async (req, res, next) => {
  try {
    const { type, format, itemIds, options = {} } = req.body;
    const userId = req.user.id;

    // Limit preview to first few items for performance
    const previewItemIds = itemIds.slice(0, 3);

    await validateItemOwnership(userId, type, previewItemIds);

    const preview = await exportService.generatePreview({
      userId,
      type,
      format,
      itemIds: previewItemIds,
      options
    });

    res.json(createResponse(true, preview));

  } catch (error) {
    logger.error('Preview export error:', error);
    next(error);
  }
};

/**
 * Get available export formats
 */
const getFormats = async (req, res, next) => {
  try {
    const formats = [
      {
        format: 'pdf',
        name: 'PDF Document',
        description: 'Portable Document Format - ideal for sharing and printing',
        extensions: ['.pdf'],
        features: ['formatting', 'images', 'metadata', 'pagination']
      },
      {
        format: 'docx',
        name: 'Word Document',
        description: 'Microsoft Word format - editable and collaborative',
        extensions: ['.docx'],
        features: ['formatting', 'images', 'metadata', 'comments']
      },
      {
        format: 'markdown',
        name: 'Markdown',
        description: 'Plain text format with markup - developer friendly',
        extensions: ['.md'],
        features: ['text', 'basic_formatting', 'code_blocks']
      },
      {
        format: 'json',
        name: 'JSON Data',
        description: 'Structured data format - machine readable',
        extensions: ['.json'],
        features: ['metadata', 'structured_data', 'api_friendly']
      }
    ];

    res.json(createResponse(true, formats));

  } catch (error) {
    logger.error('Get formats error:', error);
    next(error);
  }
};

/**
 * Bulk download multiple exports
 */
const bulkDownload = async (req, res, next) => {
  try {
    const { exportIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(exportIds) || exportIds.length === 0) {
      return next(new AppError('Export IDs array is required', 400));
    }

    if (exportIds.length > 10) {
      return next(new AppError('Bulk download limited to 10 exports', 400));
    }

    const zipFile = await exportService.createBulkDownload(userId, exportIds);

    logger.audit('BULK_DOWNLOAD_CREATED', userId, {
      exportIds,
      filename: zipFile.filename
    });

    res.json(createResponse(true, zipFile, 'Bulk download created successfully'));

  } catch (error) {
    logger.error('Bulk download error:', error);
    next(error);
  }
};

/**
 * Schedule export for later
 */
const scheduleExport = async (req, res, next) => {
  try {
    const { type, format, itemIds, options = {}, scheduledFor } = req.body;
    const userId = req.user.id;

    if (!scheduledFor) {
      return next(new AppError('Scheduled time is required', 400));
    }

    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      return next(new AppError('Scheduled time must be in the future', 400));
    }

    await validateItemOwnership(userId, type, itemIds);

    const exportJob = await exportService.scheduleExport({
      userId,
      type,
      format,
      itemIds,
      options,
      scheduledFor: scheduledDate
    });

    logger.audit('EXPORT_SCHEDULED', userId, {
      exportId: exportJob.id,
      scheduledFor
    });

    res.status(201).json(createResponse(true, exportJob, 'Export scheduled successfully'));

  } catch (error) {
    logger.error('Schedule export error:', error);
    next(error);
  }
};

/**
 * Get scheduled exports
 */
const getScheduledExports = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const userId = req.user.id;

    const where = {
      userId,
      status: 'PENDING',
      startedAt: { gt: new Date() } // Scheduled for future
    };

    const total = await prisma.exportJob.count({ where });
    const pagination = calculatePagination(page, limit, total);

    const scheduledExports = await prisma.exportJob.findMany({
      where,
      select: {
        id: true,
        type: true,
        format: true,
        itemIds: true,
        options: true,
        startedAt: true,
        createdAt: true
      },
      orderBy: { startedAt: 'asc' },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    res.json(createResponse(true, scheduledExports, null, {
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }));

  } catch (error) {
    logger.error('Get scheduled exports error:', error);
    next(error);
  }
};

/**
 * Cancel scheduled export
 */
const cancelScheduledExport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const exportJob = await prisma.exportJob.findFirst({
      where: { 
        id, 
        userId,
        status: 'PENDING',
        startedAt: { gt: new Date() }
      }
    });

    if (!exportJob) {
      return next(new AppError('Scheduled export not found', 404));
    }

    await prisma.exportJob.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    logger.audit('SCHEDULED_EXPORT_CANCELLED', userId, {
      exportId: id
    });

    res.json(createResponse(true, null, 'Scheduled export cancelled successfully'));

  } catch (error) {
    logger.error('Cancel scheduled export error:', error);
    next(error);
  }
};

/**
 * Validate item ownership based on export type
 */
const validateItemOwnership = async (userId, type, itemIds) => {
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
      // Batch exports can contain mixed types - validate individually
      // This would require more complex validation logic
      break;

    default:
      throw new AppError('Invalid export type', 400);
  }
};

module.exports = {
  createExport,
  getExports,
  getExport,
  downloadExport,
  cancelExport,
  retryExport,
  getUserExportStats,
  getExportHistory,
  createBatchExport,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewExport,
  getFormats,
  bulkDownload,
  scheduleExport,
  getScheduledExports,
  cancelScheduledExport
};