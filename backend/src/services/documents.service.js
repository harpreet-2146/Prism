// backend/src/services/documents.service.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { logger } = require('../utils/logger');
const pdfProcessor = require('./pdf/pdf-processor.service');
const imageExtractor = require('./pdf/image-extractor.service');
const ocrService = require('./ocr.service');
const embeddingSearch = require('./vector/embedding-search.service');

const prisma = new PrismaClient();

class DocumentsService {
  /**
   * Upload and process a PDF document
   * @param {Object} file - Multer file object
   * @param {string} userId - User ID from JWT
   * @returns {Promise<Object>} Created document
   */
  async uploadDocument(file, userId) {
    let document = null;

    try {
      logger.info('Starting document upload', {
        userId,
        filename: file.originalname,
        size: file.size,
        component: 'documents-service'
      });

      // Create document record
      document = await prisma.document.create({
        data: {
          userId,
          filename: file.filename,
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          storagePath: file.path,
          status: 'pending',
          embeddingStatus: 'pending'
        }
      });

      logger.info('Document record created', {
        documentId: document.id,
        userId,
        component: 'documents-service'
      });

      // Start async processing (don't await)
      this._processDocument(document.id, userId, file.path).catch(error => {
        logger.error('Document processing failed', {
          documentId: document.id,
          error: error.message,
          stack: error.stack,
          component: 'documents-service'
        });
      });

      return document;

    } catch (error) {
      // Cleanup if document creation failed
      if (file.path) {
        await fs.unlink(file.path).catch(() => {});
      }

      logger.error('Document upload failed', {
        userId,
        filename: file.originalname,
        error: error.message,
        component: 'documents-service'
      });

      throw new Error(`Document upload failed: ${error.message}`);
    }
  }

  /**
   * Background processing pipeline (REVISED WITH OCR)
   * @private
   */
  async _processDocument(documentId, userId, filePath) {
    try {
      logger.info('Starting document processing pipeline', {
        documentId,
        userId,
        component: 'documents-service'
      });

      // Mark as processing
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing' }
      });

      // ============================================================
      // STEP 1: Extract PDF text (EXISTING - KEEP)
      // ============================================================
      logger.info('Step 1: Extracting PDF text', {
        documentId,
        component: 'documents-service'
      });

      const { textContent, pageCount, sapMetadata, textChunks } = 
        await pdfProcessor.processText(filePath, documentId);

      // Update document with PDF text and metadata
      await prisma.document.update({
        where: { id: documentId },
        data: {
          textContent,
          pageCount,
          sapModule: sapMetadata.sapModule,
          tcodes: sapMetadata.tcodes,
          errorCodes: sapMetadata.errorCodes,
          noteNumber: sapMetadata.noteNumber
        }
      });

      logger.info('PDF text extracted', {
        documentId,
        pageCount,
        textLength: textContent.length,
        pdfTextChunks: textChunks.length,
        component: 'documents-service'
      });

      // ============================================================
      // STEP 2: Extract images from PDF (EXISTING - KEEP)
      // ============================================================
      logger.info('Step 2: Extracting images', {
        documentId,
        component: 'documents-service'
      });

      const extractedImages = await imageExtractor.extractImages(filePath, documentId);

      // Create image records (status: pending for OCR)
      const imageRecords = await Promise.all(
        extractedImages.map(img =>
          prisma.documentImage.create({
            data: {
              documentId,
              pageNumber: img.pageNumber,
              imageIndex: img.imageIndex,
              storagePath: img.storagePath,
              width: img.width,
              height: img.height,
              format: img.format,
              fileSize: img.fileSize,
              ocrStatus: 'pending'
            }
          })
        )
      );

      await prisma.document.update({
        where: { id: documentId },
        data: { imageCount: imageRecords.length }
      });

      logger.info('Images extracted', {
        documentId,
        imageCount: imageRecords.length,
        component: 'documents-service'
      });

      // ============================================================
      // STEP 3: Run OCR on all images (NEW)
      // ============================================================
      logger.info('Step 3: Running OCR on images', {
        documentId,
        imageCount: imageRecords.length,
        component: 'documents-service'
      });

      const imagesToProcess = imageRecords.map(img => ({
        id: img.id,
        path: img.storagePath
      }));

      let ocrResults = [];
      if (imagesToProcess.length > 0) {
        ocrResults = await ocrService.processImages(
          imagesToProcess,
          (progress) => {
            logger.info('OCR progress', {
              documentId,
              ...progress,
              component: 'documents-service'
            });
          }
        );
      }

      // Update images with OCR results
      for (const result of ocrResults) {
        await prisma.documentImage.update({
          where: { id: result.id },
          data: {
            ocrText: result.text,
            ocrConfidence: result.confidence,
            ocrStatus: result.text.length > 0 ? 'completed' : 'failed'
          }
        });
      }

      const successfulOCR = ocrResults.filter(r => r.text.length > 0).length;

      logger.info('OCR processing complete', {
        documentId,
        totalImages: imageRecords.length,
        successfulOCR,
        failedOCR: imageRecords.length - successfulOCR,
        component: 'documents-service'
      });

      // ============================================================
      // STEP 4: Create embeddings from BOTH sources (REVISED)
      // ============================================================
      logger.info('Step 4: Creating embeddings', {
        documentId,
        component: 'documents-service'
      });

      await prisma.document.update({
        where: { id: documentId },
        data: { embeddingStatus: 'processing' }
      });

      // Prepare chunks from PDF text
      const pdfTextEmbeddings = textChunks.map(chunk => ({
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        sourceType: 'pdf_text',
        sourceImageId: null
      }));

      // Prepare chunks from image OCR
      const ocrEmbeddings = [];
      for (const result of ocrResults) {
        if (result.text.length > 50) {
          // Find the image record to get page number
          const imageRecord = imageRecords.find(img => img.id === result.id);
          
          // Chunk the OCR text
          const chunks = this._chunkText(result.text, 500);
          
          chunks.forEach((chunkText, idx) => {
            ocrEmbeddings.push({
              text: chunkText,
              chunkIndex: idx,
              pageNumber: imageRecord.pageNumber,
              sourceType: 'image_ocr',
              sourceImageId: result.id
            });
          });
        }
      }

      // Combine both sources
      const allChunks = [...pdfTextEmbeddings, ...ocrEmbeddings];

      logger.info('Embedding chunks prepared', {
        documentId,
        pdfTextChunks: pdfTextEmbeddings.length,
        ocrChunks: ocrEmbeddings.length,
        totalChunks: allChunks.length,
        component: 'documents-service'
      });

      // Create embeddings for all chunks
      if (allChunks.length > 0) {
        await embeddingSearch.indexDocumentChunks(userId, documentId, allChunks);
      }

      await prisma.document.update({
        where: { id: documentId },
        data: { embeddingStatus: 'completed' }
      });

      // ============================================================
      // STEP 5: Mark as completed
      // ============================================================
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'completed' }
      });

      logger.info('Document processing complete', {
        documentId,
        pageCount,
        imageCount: imageRecords.length,
        successfulOCR,
        totalEmbeddings: allChunks.length,
        component: 'documents-service'
      });

    } catch (error) {
      logger.error('Document processing failed', {
        documentId,
        error: error.message,
        stack: error.stack,
        component: 'documents-service'
      });

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          processingError: error.message,
          embeddingStatus: 'failed'
        }
      });
    }
  }

  /**
   * Chunk text into smaller pieces for embeddings
   * @private
   */
  _chunkText(text, maxChunkSize = 500) {
    if (!text || text.trim().length === 0) return [];

    const overlap = 50;
    const chunks = [];
    const cleaned = text.replace(/\s+/g, ' ').trim();

    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(start + maxChunkSize, cleaned.length);
      const chunkText = cleaned.slice(start, end).trim();

      if (chunkText.length > 20) {
        chunks.push(chunkText);
      }

      start += maxChunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId) {
    try {
      const documents = await prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              images: true,
              embeddings: true
            }
          }
        }
      });

      return documents;
    } catch (error) {
      logger.error('Failed to fetch user documents', {
        userId,
        error: error.message,
        component: 'documents-service'
      });
      throw error;
    }
  }

  /**
   * Get document by ID (user must own it)
   */
  async getDocumentById(documentId, userId) {
    try {
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          userId
        },
        include: {
          images: {
            orderBy: { pageNumber: 'asc' }
          },
          _count: {
            select: { embeddings: true }
          }
        }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Add image URLs
      document.images = document.images.map(img => ({
        ...img,
        url: imageExtractor.getImageUrl(documentId, img.pageNumber)
      }));

      return document;
    } catch (error) {
      logger.error('Failed to fetch document', {
        documentId,
        userId,
        error: error.message,
        component: 'documents-service'
      });
      throw error;
    }
  }

  /**
   * Delete a document (user must own it)
   */
  async deleteDocument(documentId, userId) {
    try {
      const document = await prisma.document.findFirst({
        where: { id: documentId, userId }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Delete files
      await fs.unlink(document.storagePath).catch(() => {});
      await imageExtractor.deleteDocumentImages(documentId);

      // Delete from database (cascades to images, embeddings)
      await prisma.document.delete({
        where: { id: documentId }
      });

      logger.info('Document deleted', {
        documentId,
        userId,
        component: 'documents-service'
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete document', {
        documentId,
        userId,
        error: error.message,
        component: 'documents-service'
      });
      throw error;
    }
  }

  /**
   * Get document processing status
   */
  async getDocumentStatus(documentId, userId) {
    try {
      const document = await prisma.document.findFirst({
        where: { id: documentId, userId },
        select: {
          id: true,
          status: true,
          embeddingStatus: true,
          processingError: true,
          pageCount: true,
          imageCount: true,
          _count: {
            select: {
              images: true,
              embeddings: true
            }
          }
        }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Count OCR completed images
      const ocrCompleted = await prisma.documentImage.count({
        where: {
          documentId,
          ocrStatus: 'completed'
        }
      });

      return {
        ...document,
        ocrCompleted,
        ocrTotal: document._count.images
      };
    } catch (error) {
      logger.error('Failed to get document status', {
        documentId,
        userId,
        error: error.message,
        component: 'documents-service'
      });
      throw error;
    }
  }
}

module.exports = new DocumentsService();