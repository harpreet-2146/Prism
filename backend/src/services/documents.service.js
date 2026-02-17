const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { 
  extractTCodes, 
  extractSAPModules, 
  normalizeText,
  deleteFileIfExists,
  calculatePagination
} = require('../utils/helpers');
const pdfProcessor = require('./pdf/pdf-processor.service');
const imageExtractor = require('./pdf/image-extractor.service');

const prisma = new PrismaClient();

class DocumentsService {
  /**
   * Process single document upload
   */
  async processUpload(userId, file, metadata = {}) {
    try {
      // Create document record
      const document = await prisma.document.create({
        data: {
          userId,
          originalName: file.originalname,
          filename: file.filename,
          filepath: file.path,
          mimeType: file.mimetype,
          fileSize: file.size,
          status: 'PENDING',
          category: metadata.category || null,
          tags: metadata.tags ? (Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags]) : []
        }
      });

      // Start background processing
      this.processDocumentAsync(document.id);

      return {
        id: document.id,
        originalName: document.originalName,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        status: document.status,
        category: document.category,
        tags: document.tags,
        createdAt: document.createdAt
      };

    } catch (error) {
      logger.error('Process upload error:', error);
      throw error;
    }
  }

  /**
   * Process multiple document uploads
   */
  async processMultipleUploads(userId, files, metadata = {}) {
    const results = [];

    for (const file of files) {
      try {
        const document = await this.processUpload(userId, file, metadata);
        results.push(document);
      } catch (error) {
        logger.error('Process multiple upload error for file:', file.originalname, error);
        // Continue processing other files
        results.push({
          originalName: file.originalname,
          error: error.message,
          status: 'FAILED'
        });
      }
    }

    return results;
  }

  /**
   * Process document asynchronously
   */
  async processDocumentAsync(documentId) {
    try {
      // Update status to processing
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'PROCESSING' }
      });

      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      let extractedText = '';
      let summary = '';
      const images = [];

      // Process based on file type
      if (document.mimeType === 'application/pdf') {
        // Extract text from PDF
        extractedText = await pdfProcessor.extractText(document.filepath);
        
        // Extract images from PDF
        const pdfImages = await imageExtractor.extractImages(document.filepath);
        
        // Save images and create records
        for (const imageBuffer of pdfImages) {
          const imagePath = await this.saveExtractedImage(documentId, imageBuffer);
          images.push(imagePath);
        }
      } else if (document.mimeType.startsWith('image/')) {
        // For images, use OCR if available
        extractedText = await this.extractTextFromImage(document.filepath);
      }

      // Normalize extracted text
      extractedText = normalizeText(extractedText);

      // Extract SAP-specific metadata
      const sapMetadata = await this.extractSAPMetadata(extractedText);

      // Generate summary
      if (extractedText) {
        summary = await this.generateSummary(extractedText);
      }

      // Update document with processed data
      await prisma.$transaction(async (prisma) => {
        // Update document
        await prisma.document.update({
          where: { id: documentId },
          data: {
            status: 'COMPLETED',
            extractedText,
            summary,
            processedAt: new Date()
          }
        });

        // Create SAP metadata if found
        if (sapMetadata.tcodes.length > 0 || sapMetadata.modules.length > 0) {
          await prisma.sAPMetadata.create({
            data: {
              documentId,
              tcodes: sapMetadata.tcodes,
              modules: sapMetadata.modules,
              errorCodes: sapMetadata.errorCodes,
              processes: sapMetadata.processes
            }
          });
        }

        // Create image records
        for (const imagePath of images) {
          await prisma.documentImage.create({
            data: {
              documentId,
              filename: path.basename(imagePath),
              filepath: imagePath,
              mimeType: 'image/jpeg',
              size: (await fs.stat(imagePath)).size,
              width: null, // Could extract with image processing library
              height: null
            }
          });
        }
      });

      logger.info('Document processed successfully', { documentId });

    } catch (error) {
      logger.error('Document processing failed:', error);

      // Update document status to failed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          processingError: error.message
        }
      });
    }
  }

  /**
   * Extract SAP metadata from text
   */
  async extractSAPMetadata(text) {
    const tcodes = extractTCodes(text);
    const modules = extractSAPModules(text);
    
    // Extract SAP error codes (pattern: E XXXXX)
    const errorCodePattern = /E\s+[A-Z0-9]{5}/g;
    const errorCodes = [...new Set((text.match(errorCodePattern) || []).map(code => code.replace(/\s+/g, ' ').trim()))];

    // Extract business processes (simple keyword matching)
    const processes = [];
    const processKeywords = {
      'Purchase Order': ['purchase order', 'PO creation', 'procurement'],
      'Invoice Processing': ['invoice', 'billing', 'payment'],
      'Financial Posting': ['journal entry', 'GL posting', 'accounting'],
      'Material Management': ['goods receipt', 'inventory', 'material master']
    };

    const lowerText = text.toLowerCase();
    for (const [process, keywords] of Object.entries(processKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        processes.push(process);
      }
    }

    return {
      tcodes,
      modules,
      errorCodes,
      processes
    };
  }

  /**
   * Generate document summary
   */
  async generateSummary(text) {
    // Simple extractive summary - take first few sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const summary = sentences.slice(0, 3).join('. ').trim();
    
    return summary.length > 500 ? summary.substring(0, 497) + '...' : summary;
  }

  /**
   * Save extracted image
   */
  async saveExtractedImage(documentId, imageBuffer) {
    const imagesDir = path.join(config.uploads.directory, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const filename = `${documentId}_${Date.now()}.jpg`;
    const filepath = path.join(imagesDir, filename);

    await fs.writeFile(filepath, imageBuffer);
    return filepath;
  }

  /**
   * Extract text from image using OCR (placeholder)
   */
  async extractTextFromImage(imagePath) {
    // Placeholder - would use OCR library like Tesseract
    return '';
  }

  /**
   * Search documents
   */
  async searchDocuments(userId, searchTerm, options = {}) {
    const { page = 1, limit = 10 } = options;
    
    const where = {
      userId,
      OR: [
        { originalName: { contains: searchTerm, mode: 'insensitive' } },
        { extractedText: { contains: searchTerm, mode: 'insensitive' } },
        { summary: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { hasSome: [searchTerm] } },
        {
          sapMetadata: {
            OR: [
              { tcodes: { hasSome: [searchTerm.toUpperCase()] } },
              { modules: { hasSome: [searchTerm.toUpperCase()] } }
            ]
          }
        }
      ]
    };

    const total = await prisma.document.count({ where });
    const pagination = calculatePagination(page, limit, total);

    const documents = await prisma.document.findMany({
      where,
      include: {
        sapMetadata: true,
        _count: {
          select: { images: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    return {
      documents,
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    };
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(userId) {
    const stats = await prisma.document.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
      _sum: { fileSize: true }
    });

    const totalDocuments = await prisma.document.count({ where: { userId } });
    const totalSize = await prisma.document.aggregate({
      where: { userId },
      _sum: { fileSize: true }
    });

    // Get recent activity
    const recentUploads = await prisma.document.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    const byStatus = {};
    stats.forEach(stat => {
      byStatus[stat.status.toLowerCase()] = stat._count.status;
    });

    return {
      total: totalDocuments,
      byStatus: {
        pending: byStatus.pending || 0,
        processing: byStatus.processing || 0,
        completed: byStatus.completed || 0,
        failed: byStatus.failed || 0
      },
      totalSize: totalSize._sum.fileSize || 0,
      recentUploads
    };
  }

  /**
   * Delete document and associated files
   */
  async deleteDocument(userId, documentId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        images: true,
        sapMetadata: true
      }
    });

    if (!document) {
      throw new AppError('Document not found', 404);
    }

    // Delete in transaction
    await prisma.$transaction(async (prisma) => {
      // Delete SAP metadata
      if (document.sapMetadata) {
        await prisma.sAPMetadata.delete({
          where: { documentId }
        });
      }

      // Delete document images records
      await prisma.documentImage.deleteMany({
        where: { documentId }
      });

      // Delete vector embeddings
      await prisma.vectorEmbedding.deleteMany({
        where: { documentId }
      });

      // Delete document
      await prisma.document.delete({
        where: { id: documentId }
      });
    });

    // Delete physical files asynchronously
    setTimeout(async () => {
      try {
        // Delete main document file
        await deleteFileIfExists(document.filepath);

        // Delete image files
        for (const image of document.images) {
          await deleteFileIfExists(image.filepath);
        }
      } catch (error) {
        logger.error('Error deleting document files:', error);
      }
    }, 0);

    return {
      filename: document.originalName
    };
  }

  /**
   * Reprocess document
   */
  async reprocessDocument(userId, documentId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) {
      throw new AppError('Document not found', 404);
    }

    if (document.status === 'PROCESSING') {
      throw new AppError('Document is already being processed', 400);
    }

    // Reset document status and clear previous data
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PENDING',
        extractedText: null,
        summary: null,
        processingError: null,
        processedAt: null
      }
    });

    // Start processing
    this.processDocumentAsync(documentId);

    return {
      status: 'PENDING',
      message: 'Document reprocessing started'
    };
  }

  /**
   * Batch delete documents
   */
  async batchDeleteDocuments(userId, documentIds) {
    // Verify all documents belong to user
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId
      },
      include: {
        images: true
      }
    });

    if (documents.length !== documentIds.length) {
      throw new AppError('Some documents not found or not accessible', 404);
    }

    // Delete in transaction
    await prisma.$transaction(async (prisma) => {
      // Delete related data
      await prisma.sAPMetadata.deleteMany({
        where: { documentId: { in: documentIds } }
      });

      await prisma.documentImage.deleteMany({
        where: { documentId: { in: documentIds } }
      });

      await prisma.vectorEmbedding.deleteMany({
        where: { documentId: { in: documentIds } }
      });

      // Delete documents
      await prisma.document.deleteMany({
        where: { id: { in: documentIds } }
      });
    });

    // Delete physical files asynchronously
    setTimeout(async () => {
      for (const document of documents) {
        try {
          await deleteFileIfExists(document.filepath);
          for (const image of document.images) {
            await deleteFileIfExists(image.filepath);
          }
        } catch (error) {
          logger.error('Error deleting document files:', error);
        }
      }
    }, 0);

    return {
      deletedCount: documents.length
    };
  }

  /**
   * Batch reprocess documents
   */
  async batchReprocessDocuments(userId, documentIds) {
    // Verify all documents belong to user
    const count = await prisma.document.count({
      where: {
        id: { in: documentIds },
        userId
      }
    });

    if (count !== documentIds.length) {
      throw new AppError('Some documents not found or not accessible', 404);
    }

    // Update all to pending
    await prisma.document.updateMany({
      where: { id: { in: documentIds } },
      data: {
        status: 'PENDING',
        extractedText: null,
        summary: null,
        processingError: null,
        processedAt: null
      }
    });

    // Start processing each document
    for (const documentId of documentIds) {
      this.processDocumentAsync(documentId);
    }

    return {
      processedCount: count
    };
  }

  /**
   * Batch update metadata
   */
  async batchUpdateMetadata(userId, documentIds, metadata) {
    // Verify all documents belong to user
    const count = await prisma.document.count({
      where: {
        id: { in: documentIds },
        userId
      }
    });

    if (count !== documentIds.length) {
      throw new AppError('Some documents not found or not accessible', 404);
    }

    const updateData = {};
    if (metadata.category !== undefined) updateData.category = metadata.category;
    if (metadata.tags !== undefined) {
      updateData.tags = Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags];
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    await prisma.document.updateMany({
      where: { id: { in: documentIds } },
      data: updateData
    });

    return {
      updatedCount: count
    };
  }

  /**
   * Generate document preview
   */
  async generatePreview(userId, documentId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) {
      throw new AppError('Document not found', 404);
    }

    // For now, return null - would implement thumbnail generation
    return null;
  }

  /**
   * Get document analysis
   */
  async getDocumentAnalysis(userId, documentId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        sapMetadata: true,
        images: true
      }
    });

    if (!document) {
      throw new AppError('Document not found', 404);
    }

    if (document.status !== 'COMPLETED') {
      return null;
    }

    // Basic analysis
    const analysis = {
      textLength: document.extractedText?.length || 0,
      wordCount: document.extractedText ? document.extractedText.split(/\s+/).length : 0,
      imageCount: document.images.length,
      sapElements: {
        tcodes: document.sapMetadata?.tcodes || [],
        modules: document.sapMetadata?.modules || [],
        errorCodes: document.sapMetadata?.errorCodes || [],
        processes: document.sapMetadata?.processes || []
      },
      readingTime: Math.ceil((document.extractedText?.split(/\s+/).length || 0) / 200), // minutes
      complexity: this.calculateComplexity(document.extractedText || ''),
      lastAnalyzed: document.processedAt
    };

    return analysis;
  }

  /**
   * Analyze document (re-run analysis)
   */
  async analyzeDocument(userId, documentId) {
    // For now, just return the existing analysis
    return await this.getDocumentAnalysis(userId, documentId);
  }

  /**
   * Calculate text complexity score
   */
  calculateComplexity(text) {
    if (!text) return 0;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    const avgWordsPerSentence = words.length / sentences.length;

    // Simple complexity based on average sentence length
    if (avgWordsPerSentence > 20) return 'high';
    if (avgWordsPerSentence > 12) return 'medium';
    return 'low';
  }

  /**
   * Get user's T-Codes
   */
  async getUserTCodes(userId) {
    const metadata = await prisma.sAPMetadata.findMany({
      where: {
        document: { userId }
      },
      select: {
        tcodes: true
      }
    });

    const tcodes = new Set();
    metadata.forEach(m => {
      m.tcodes.forEach(tcode => tcodes.add(tcode));
    });

    return Array.from(tcodes).sort();
  }

  /**
   * Get user's SAP modules
   */
  async getUserModules(userId) {
    const metadata = await prisma.sAPMetadata.findMany({
      where: {
        document: { userId }
      },
      select: {
        modules: true
      }
    });

    const modules = new Set();
    metadata.forEach(m => {
      m.modules.forEach(module => modules.add(module));
    });

    return Array.from(modules).sort();
  }
}

module.exports = new DocumentsService();