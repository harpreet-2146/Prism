// backend/src/services/documents.service.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const prisma = require('../utils/prisma');
const pdfProcessor = require('./pdf/pdf-processor.service');
const imageExtractor = require('./pdf/image-extractor.service');
const embeddingSearch = require('./vector/embedding-search.service');
const { logger } = require('../utils/logger');
const config = require('../config');

class DocumentsService {
  // ----------------------------------------------------------------
  // UPLOAD & PROCESS
  // ----------------------------------------------------------------

  /**
   * Handle a newly uploaded PDF.
   * 1. Move from temp → permanent storage
   * 2. Create DB record
   * 3. Start async processing (text + images + embeddings)
   *
   * @param {Object} file   - Multer file object
   * @param {string} userId
   * @returns {Object} The created document record
   */
  async uploadDocument(file, userId) {
    // Move file from temp to permanent storage
    const permanentPath = path.join(config.UPLOAD_DIR, 'documents', file.filename);
    await fs.rename(file.path, permanentPath);

    // Create DB record immediately so the user gets a response fast
    const document = await prisma.document.create({
      data: {
        userId,
        filename: file.filename,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storagePath: permanentPath,
        status: 'pending'
      }
    });

    logger.info('Document record created', {
      documentId: document.id,
      userId,
      originalName: file.originalname,
      fileSize: file.size,
      component: 'documents-service'
    });

    // Process asynchronously — don't block the HTTP response
    this._processDocument(document.id, userId, permanentPath).catch(error => {
      logger.error('Background document processing failed', {
        documentId: document.id,
        error: error.message,
        component: 'documents-service'
      });
    });

    return document;
  }

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async getUserDocuments(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          originalName: true,
          fileSize: true,
          status: true,
          embeddingStatus: true,
          sapModule: true,
          tcodes: true,
          pageCount: true,
          imageCount: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.document.count({ where: { userId } })
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ----------------------------------------------------------------
  // GET SINGLE
  // ----------------------------------------------------------------

  async getDocument(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        images: {
          orderBy: { pageNumber: 'asc' },
          select: {
            id: true,
            pageNumber: true,
            imageIndex: true,
            width: true,
            height: true,
            format: true,
            fileSize: true,
            storagePath: true
          }
        }
      }
    });

    if (!document) throw new Error('Document not found');
    return document;
  }

  // ----------------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------------

  async deleteDocument(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) throw new Error('Document not found');

    // Delete all files — don't throw if already missing
    await this._deleteDocumentFiles(document.storagePath, documentId);

    // Delete embeddings from vector store
    await embeddingSearch.deleteDocumentEmbeddings(documentId);

    // Delete DB record (cascades to images + embeddings table)
    await prisma.document.delete({ where: { id: documentId } });

    logger.info('Document deleted', {
      documentId,
      userId,
      component: 'documents-service'
    });
  }

  // ----------------------------------------------------------------
  // GET IMAGES
  // ----------------------------------------------------------------

  async getDocumentImages(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true }
    });

    if (!document) throw new Error('Document not found');

    return prisma.documentImage.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' }
    });
  }

  /**
   * Get the absolute storage path for a single image.
   * Used by the route that serves image files.
   */
  async getImageFilePath(documentId, userId, filename) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true }
    });

    if (!document) throw new Error('Document not found');

    const filePath = path.join(config.UPLOAD_DIR, 'images', documentId, filename);

    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new Error('Image file not found');
    }
  }

  // ----------------------------------------------------------------
  // STATS
  // ----------------------------------------------------------------

  async getUserStats(userId) {
    const [totalDocs, statusCounts, totalEmbeddings] = await Promise.all([
      prisma.document.count({ where: { userId } }),
      prisma.document.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true }
      }),
      embeddingSearch.getIndexedChunkCount(userId)
    ]);

    const byStatus = {};
    statusCounts.forEach(s => { byStatus[s.status] = s._count.status; });

    return {
      totalDocuments: totalDocs,
      byStatus,
      indexedChunks: totalEmbeddings
    };
  }

  // ----------------------------------------------------------------
  // INTERNAL: Full processing pipeline
  // ----------------------------------------------------------------

  async _processDocument(documentId, userId, filePath) {
    try {
      // Mark as processing
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing' }
      });

      // ---- Step 1: Extract text ----
      const { textContent, pageCount, sapMetadata, textChunks } =
        await pdfProcessor.processText(filePath, documentId);

      // ---- Step 2: Extract images (render pages) ----
      const extractedImages = await imageExtractor.extractImages(filePath, documentId);

      // ---- Step 3: Save images to DB ----
      if (extractedImages.length > 0) {
        await prisma.documentImage.createMany({
          data: extractedImages.map(img => ({
            documentId,
            pageNumber: img.pageNumber,
            imageIndex: img.imageIndex,
            storagePath: img.storagePath,
            width: img.width,
            height: img.height,
            format: img.format,
            fileSize: img.fileSize
          }))
        });
      }

      // ---- Step 4: Update document record with extracted data ----
      await prisma.document.update({
        where: { id: documentId },
        data: {
          textContent,
          pageCount,
          imageCount: extractedImages.length,
          sapModule:  sapMetadata.sapModule,
          tcodes:     sapMetadata.tcodes,
          errorCodes: sapMetadata.errorCodes,
          noteNumber: sapMetadata.noteNumber,
          status: 'completed',
          embeddingStatus: 'processing'
        }
      });

      logger.info('Document processing completed', {
        documentId,
        pageCount,
        imageCount: extractedImages.length,
        chunkCount: textChunks.length,
        sapModule: sapMetadata.sapModule,
        component: 'documents-service'
      });

      // ---- Step 5: Generate and store embeddings (separate try — don't fail the whole doc) ----
      try {
        if (textChunks.length > 0 && config.HF_TOKEN) {
          await embeddingSearch.indexDocumentChunks(userId, documentId, textChunks);
          await prisma.document.update({
            where: { id: documentId },
            data: { embeddingStatus: 'completed' }
          });
        } else {
          await prisma.document.update({
            where: { id: documentId },
            data: { embeddingStatus: 'completed' }
          });
        }
      } catch (embeddingError) {
        logger.warn('Embedding generation failed — document still usable', {
          documentId,
          error: embeddingError.message,
          component: 'documents-service'
        });
        await prisma.document.update({
          where: { id: documentId },
          data: { embeddingStatus: 'failed' }
        });
      }

    } catch (error) {
      logger.error('Document processing pipeline failed', {
        documentId,
        error: error.message,
        stack: error.stack,
        component: 'documents-service'
      });

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          processingError: error.message
        }
      }).catch(() => {}); // Don't throw if this update also fails
    }
  }

  async _deleteDocumentFiles(storagePath, documentId) {
    // Delete the PDF
    try {
      await fs.unlink(storagePath);
    } catch {
      // Already gone — fine
    }

    // Delete the rendered page images folder
    await imageExtractor.deleteDocumentImages(documentId);
  }
}

module.exports = new DocumentsService();