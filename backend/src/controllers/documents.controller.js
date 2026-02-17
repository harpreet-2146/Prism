const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { 
  createResponse, 
  calculatePagination,
  formatFileSize,
  deleteFileIfExists 
} = require('../utils/helpers');
const documentsService = require('../services/documents.service');
const pdfProcessor = require('../services/pdf/pdf-processor.service');

const prisma = new PrismaClient();

/**
 * Get user documents with pagination and filtering
 */
const getDocuments = async (req, res, next) => {
  try {
    const { 
      page, 
      limit, 
      search, 
      status, 
      category,
      dateFrom,
      dateTo,
      minSize,
      maxSize,
      tcodes,
      modules,
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;
    
    const userId = req.user.id;

    // Build where clause
    const where = {
      userId,
      ...(search && {
        OR: [
          { originalName: { contains: search, mode: 'insensitive' } },
          { extractedText: { contains: search, mode: 'insensitive' } },
          { summary: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } }
        ]
      }),
      ...(status && { status }),
      ...(category && { category }),
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { lte: new Date(dateTo) } }),
      ...(minSize && { fileSize: { gte: parseInt(minSize) } }),
      ...(maxSize && { fileSize: { lte: parseInt(maxSize) } }),
      ...(tcodes && {
        sapMetadata: {
          tcodes: { hasSome: Array.isArray(tcodes) ? tcodes : [tcodes] }
        }
      }),
      ...(modules && {
        sapMetadata: {
          modules: { hasSome: Array.isArray(modules) ? modules : [modules] }
        }
      })
    };

    // Get total count
    const total = await prisma.document.count({ where });

    // Calculate pagination
    const pagination = calculatePagination(page, limit, total);

    // Get documents with metadata
    const documents = await prisma.document.findMany({
      where,
      include: {
        sapMetadata: true,
        images: {
          select: {
            id: true,
            filename: true,
            size: true,
            width: true,
            height: true
          }
        },
        _count: {
          select: {
            images: true
          }
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    // Transform response
    const transformedDocuments = documents.map(doc => ({
      id: doc.id,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      fileSizeFormatted: formatFileSize(doc.fileSize),
      status: doc.status,
      category: doc.category,
      tags: doc.tags,
      summary: doc.summary,
      imageCount: doc._count.images,
      sapMetadata: doc.sapMetadata,
      uploadedAt: doc.uploadedAt,
      processedAt: doc.processedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));

    res.json(createResponse(true, transformedDocuments, null, {
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
    logger.error('Get documents error:', error);
    next(error);
  }
};

/**
 * Search documents
 */
const searchDocuments = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const userId = req.user.id;

    if (!search || search.trim().length < 2) {
      return next(new AppError('Search query must be at least 2 characters', 400));
    }

    const result = await documentsService.searchDocuments(userId, search, { page, limit });

    res.json(createResponse(true, result.documents, null, {
      pagination: result.pagination
    }));

  } catch (error) {
    logger.error('Search documents error:', error);
    next(error);
  }
};

/**
 * Get document statistics
 */
const getStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const stats = await documentsService.getDocumentStats(userId);

    res.json(createResponse(true, stats));

  } catch (error) {
    logger.error('Get document stats error:', error);
    next(error);
  }
};

/**
 * Upload single document
 */
const uploadDocument = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    const metadata = req.body;

    if (!file) {
      return next(new AppError('No file uploaded', 400));
    }

    // Process the document
    const document = await documentsService.processUpload(userId, file, metadata);

    logger.audit('DOCUMENT_UPLOADED', userId, {
      documentId: document.id,
      filename: document.originalName,
      size: document.fileSize
    });

    res.status(201).json(createResponse(true, document, 'Document uploaded successfully'));

  } catch (error) {
    logger.error('Upload document error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      await deleteFileIfExists(req.file.path);
    }
    
    next(error);
  }
};

/**
 * Upload multiple documents
 */
const uploadMultipleDocuments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const files = req.files;
    const metadata = req.body;

    if (!files || files.length === 0) {
      return next(new AppError('No files uploaded', 400));
    }

    const results = await documentsService.processMultipleUploads(userId, files, metadata);

    logger.audit('MULTIPLE_DOCUMENTS_UPLOADED', userId, {
      count: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0)
    });

    res.status(201).json(createResponse(true, results, `${results.length} documents uploaded successfully`));

  } catch (error) {
    logger.error('Upload multiple documents error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await deleteFileIfExists(file.path);
      }
    }
    
    next(error);
  }
};

/**
 * Get specific document
 */
const getDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      include: {
        sapMetadata: true,
        images: true,
        _count: {
          select: {
            images: true,
            vectorEmbeddings: true
          }
        }
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    const transformedDocument = {
      ...document,
      fileSizeFormatted: formatFileSize(document.fileSize),
      imageCount: document._count.images,
      embeddingCount: document._count.vectorEmbeddings
    };

    res.json(createResponse(true, transformedDocument));

  } catch (error) {
    logger.error('Get document error:', error);
    next(error);
  }
};

/**
 * Update document metadata
 */
const updateDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, category, tags } = req.body;

    // Verify document ownership
    const existingDocument = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!existingDocument) {
      return next(new AppError('Document not found', 404));
    }

    // Update document
    const updateData = {};
    if (title !== undefined) updateData.originalName = title;
    if (description !== undefined) updateData.summary = description;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [tags];

    const updatedDocument = await prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        sapMetadata: true,
        _count: {
          select: { images: true }
        }
      }
    });

    logger.audit('DOCUMENT_UPDATED', userId, {
      documentId: id,
      changes: updateData
    });

    res.json(createResponse(true, {
      ...updatedDocument,
      fileSizeFormatted: formatFileSize(updatedDocument.fileSize),
      imageCount: updatedDocument._count.images
    }, 'Document updated successfully'));

  } catch (error) {
    logger.error('Update document error:', error);
    next(error);
  }
};

/**
 * Delete document
 */
const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await documentsService.deleteDocument(userId, id);

    logger.audit('DOCUMENT_DELETED', userId, {
      documentId: id,
      filename: result.filename
    });

    res.json(createResponse(true, null, 'Document deleted successfully'));

  } catch (error) {
    logger.error('Delete document error:', error);
    next(error);
  }
};

/**
 * Download document
 */
const downloadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      select: {
        originalName: true,
        filename: true,
        filepath: true,
        mimeType: true,
        fileSize: true
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    // Check if file exists
    try {
      await fs.access(document.filepath);
    } catch (error) {
      logger.error('Document file not found:', { 
        documentId: id, 
        filepath: document.filepath 
      });
      return next(new AppError('Document file not found', 404));
    }

    logger.audit('DOCUMENT_DOWNLOADED', userId, {
      documentId: id,
      filename: document.originalName
    });

    // Set appropriate headers
    res.set({
      'Content-Type': document.mimeType,
      'Content-Length': document.fileSize,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.originalName)}"`,
      'Cache-Control': 'no-cache'
    });

    // Stream the file
    const fileStream = require('fs').createReadStream(document.filepath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('File stream error:', error);
      if (!res.headersSent) {
        next(new AppError('Error reading file', 500));
      }
    });

  } catch (error) {
    logger.error('Download document error:', error);
    next(error);
  }
};

/**
 * Get document preview/thumbnail
 */
const getPreview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const preview = await documentsService.generatePreview(userId, id);

    if (!preview) {
      return next(new AppError('Preview not available', 404));
    }

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(preview);

  } catch (error) {
    logger.error('Get preview error:', error);
    next(error);
  }
};

/**
 * Get document text content
 */
const getContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      select: {
        extractedText: true,
        summary: true,
        status: true
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    if (document.status !== 'COMPLETED') {
      return next(new AppError('Document processing not completed', 400));
    }

    res.json(createResponse(true, {
      extractedText: document.extractedText,
      summary: document.summary
    }));

  } catch (error) {
    logger.error('Get content error:', error);
    next(error);
  }
};

/**
 * Get document images
 */
const getImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify document ownership
    const document = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    const images = await prisma.documentImage.findMany({
      where: { documentId: id },
      select: {
        id: true,
        filename: true,
        width: true,
        height: true,
        size: true,
        pageNumber: true,
        createdAt: true
      },
      orderBy: { pageNumber: 'asc' }
    });

    res.json(createResponse(true, images));

  } catch (error) {
    logger.error('Get images error:', error);
    next(error);
  }
};

/**
 * Get specific image from document
 */
const getImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    const userId = req.user.id;

    // Verify document ownership and get image
    const image = await prisma.documentImage.findFirst({
      where: {
        id: imageId,
        document: {
          id,
          userId
        }
      }
    });

    if (!image) {
      return next(new AppError('Image not found', 404));
    }

    // Check if image file exists
    try {
      await fs.access(image.filepath);
    } catch (error) {
      return next(new AppError('Image file not found', 404));
    }

    res.set({
      'Content-Type': image.mimeType,
      'Cache-Control': 'public, max-age=3600'
    });

    // Stream the image
    const imageStream = require('fs').createReadStream(image.filepath);
    imageStream.pipe(res);

    imageStream.on('error', (error) => {
      logger.error('Image stream error:', error);
      if (!res.headersSent) {
        next(new AppError('Error reading image', 500));
      }
    });

  } catch (error) {
    logger.error('Get image error:', error);
    next(error);
  }
};

/**
 * Get document metadata
 */
const getMetadata = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      select: {
        originalName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        category: true,
        tags: true,
        summary: true,
        sapMetadata: true,
        uploadedAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    res.json(createResponse(true, {
      ...document,
      fileSizeFormatted: formatFileSize(document.fileSize)
    }));

  } catch (error) {
    logger.error('Get metadata error:', error);
    next(error);
  }
};

/**
 * Reprocess document
 */
const reprocessDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await documentsService.reprocessDocument(userId, id);

    logger.audit('DOCUMENT_REPROCESSED', userId, {
      documentId: id
    });

    res.json(createResponse(true, result, 'Document reprocessing started'));

  } catch (error) {
    logger.error('Reprocess document error:', error);
    next(error);
  }
};

/**
 * Get processing status
 */
const getProcessingStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      select: {
        status: true,
        processingError: true,
        uploadedAt: true,
        processedAt: true
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    let progress = 0;
    switch (document.status) {
      case 'PENDING':
        progress = 0;
        break;
      case 'PROCESSING':
        progress = 50;
        break;
      case 'COMPLETED':
        progress = 100;
        break;
      case 'FAILED':
        progress = 0;
        break;
    }

    res.json(createResponse(true, {
      status: document.status,
      progress,
      error: document.processingError,
      uploadedAt: document.uploadedAt,
      processedAt: document.processedAt
    }));

  } catch (error) {
    logger.error('Get processing status error:', error);
    next(error);
  }
};

/**
 * Share document (placeholder)
 */
const shareDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify document ownership
    const document = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    // Generate share token (placeholder)
    const shareToken = require('crypto').randomBytes(32).toString('hex');
    const shareUrl = `${req.protocol}://${req.get('host')}/api/documents/shared/${shareToken}`;

    logger.audit('DOCUMENT_SHARED', userId, {
      documentId: id,
      shareToken
    });

    res.json(createResponse(true, { shareUrl, shareToken }, 'Document shared successfully'));

  } catch (error) {
    logger.error('Share document error:', error);
    next(error);
  }
};

/**
 * Get shared document (placeholder)
 */
const getSharedDocument = async (req, res, next) => {
  try {
    const { shareToken } = req.params;

    // In real implementation, look up document by share token
    res.json(createResponse(false, null, 'Shared documents not fully implemented'));

  } catch (error) {
    logger.error('Get shared document error:', error);
    next(error);
  }
};

/**
 * Batch delete documents
 */
const batchDelete = async (req, res, next) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return next(new AppError('Document IDs array is required', 400));
    }

    const result = await documentsService.batchDeleteDocuments(userId, documentIds);

    logger.audit('DOCUMENTS_BATCH_DELETED', userId, {
      documentIds,
      deletedCount: result.deletedCount
    });

    res.json(createResponse(true, result, `${result.deletedCount} documents deleted successfully`));

  } catch (error) {
    logger.error('Batch delete error:', error);
    next(error);
  }
};

/**
 * Batch reprocess documents
 */
const batchReprocess = async (req, res, next) => {
  try {
    const { documentIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return next(new AppError('Document IDs array is required', 400));
    }

    const result = await documentsService.batchReprocessDocuments(userId, documentIds);

    logger.audit('DOCUMENTS_BATCH_REPROCESSED', userId, {
      documentIds,
      processedCount: result.processedCount
    });

    res.json(createResponse(true, result, `${result.processedCount} documents queued for reprocessing`));

  } catch (error) {
    logger.error('Batch reprocess error:', error);
    next(error);
  }
};

/**
 * Batch update metadata
 */
const batchUpdateMetadata = async (req, res, next) => {
  try {
    const { documentIds, metadata } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return next(new AppError('Document IDs array is required', 400));
    }

    const result = await documentsService.batchUpdateMetadata(userId, documentIds, metadata);

    logger.audit('DOCUMENTS_BATCH_UPDATED', userId, {
      documentIds,
      updatedCount: result.updatedCount,
      metadata
    });

    res.json(createResponse(true, result, `${result.updatedCount} documents updated successfully`));

  } catch (error) {
    logger.error('Batch update metadata error:', error);
    next(error);
  }
};

/**
 * Get document analysis
 */
const getAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const analysis = await documentsService.getDocumentAnalysis(userId, id);

    if (!analysis) {
      return next(new AppError('Analysis not available', 404));
    }

    res.json(createResponse(true, analysis));

  } catch (error) {
    logger.error('Get analysis error:', error);
    next(error);
  }
};

/**
 * Analyze document
 */
const analyzeDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const analysis = await documentsService.analyzeDocument(userId, id);

    logger.audit('DOCUMENT_ANALYZED', userId, {
      documentId: id
    });

    res.json(createResponse(true, analysis, 'Document analysis completed'));

  } catch (error) {
    logger.error('Analyze document error:', error);
    next(error);
  }
};

/**
 * Get SAP metadata
 */
const getSAPMetadata = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findFirst({
      where: { id, userId },
      include: {
        sapMetadata: true
      }
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    res.json(createResponse(true, document.sapMetadata));

  } catch (error) {
    logger.error('Get SAP metadata error:', error);
    next(error);
  }
};

/**
 * Get all T-Codes from user's documents
 */
const getTCodes = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const tcodes = await documentsService.getUserTCodes(userId);

    res.json(createResponse(true, tcodes));

  } catch (error) {
    logger.error('Get T-Codes error:', error);
    next(error);
  }
};

/**
 * Get all SAP modules from user's documents
 */
const getModules = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const modules = await documentsService.getUserModules(userId);

    res.json(createResponse(true, modules));

  } catch (error) {
    logger.error('Get modules error:', error);
    next(error);
  }
};

module.exports = {
  getDocuments,
  searchDocuments,
  getStats,
  uploadDocument,
  uploadMultipleDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
  getPreview,
  getContent,
  getImages,
  getImage,
  getMetadata,
  reprocessDocument,
  getProcessingStatus,
  shareDocument,
  getSharedDocument,
  batchDelete,
  batchReprocess,
  batchUpdateMetadata,
  getAnalysis,
  analyzeDocument,
  getSAPMetadata,
  getTCodes,
  getModules
};