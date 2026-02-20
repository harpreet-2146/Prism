// backend/src/services/documents.service.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { logger } = require('../utils/logger');

const pythonClient = require('./python-client.service');
const embeddingSearch = require('./vector/embedding-search.service');

const prisma = new PrismaClient();

class DocumentsService {
  async uploadDocument(file, userId) {
    let document = null;

    try {
      logger.info('Starting document upload', {
        userId,
        filename: file.originalname,
        size: file.size,
        component: 'documents-service'
      });

      try {
        await pythonClient.healthCheck();
        logger.info('Python service is healthy', { component: 'documents-service' });
      } catch (error) {
        throw new Error('Python processing service is unavailable. Please try again later.');
      }

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

  async _processDocument(documentId, userId, filePath) {
    try {
      logger.info('Starting document processing pipeline (PYTHON)', {
        documentId,
        userId,
        component: 'documents-service'
      });

      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing' }
      });

      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(process.cwd(), filePath);
      const normalizedPath = absolutePath.replace(/\\/g, '/');

      // STEP 1: Extract PDF text
      logger.info('Step 1: Extracting PDF text via Python', {
        documentId,
        component: 'documents-service'
      });

      const pdfResult = await pythonClient.processPDF(documentId, normalizedPath);

      await prisma.document.update({
        where: { id: documentId },
        data: {
          textContent: pdfResult.text_content || '',
          pageCount: pdfResult.page_count || 0,
          sapModule: pdfResult.metadata?.sap_module || null,
          tcodes: pdfResult.metadata?.tcodes || [],
          errorCodes: pdfResult.metadata?.error_codes || [],
          noteNumber: pdfResult.metadata?.note_number || null
        }
      });

      logger.info('PDF text extracted (Python)', {
        documentId,
        pageCount: pdfResult.page_count,
        textLength: pdfResult.text_content?.length || 0,
        component: 'documents-service'
      });

      // STEP 2: Extract images
      logger.info('Step 2: Extracting images via Python', {
        documentId,
        component: 'documents-service'
      });

      const extractedImages = await pythonClient.extractImages(documentId, normalizedPath);

      logger.info('Python extraction response:', {
        count: extractedImages.length,
        rawResponse: JSON.stringify(extractedImages[0]),
        component: 'documents-service'
      });

      // Query the images Python stored in its database
      const pythonImages = await prisma.documentImage.findMany({
        where: { documentId },
        orderBy: [
          { pageNumber: 'asc' },
          { imageIndex: 'asc' }
        ]
      });

      logger.info('Images found in database:', {
        count: pythonImages.length,
        sample: pythonImages[0],
        component: 'documents-service'
      });

      if (pythonImages.length === 0) {
        logger.warn('No images found! Python might have failed silently', {
          documentId,
          component: 'documents-service'
        });
      }

      // STEP 3: OCR on images
      logger.info('Step 3: Starting OCR via Python', {
        documentId,
        imageCount: pythonImages.length,
        component: 'documents-service'
      });

      const ocrEmbeddings = [];
      for (let i = 0; i < pythonImages.length; i++) {
        const img = pythonImages[i];
        
        try {
          logger.info('OCR progress', {
            documentId,
            current: i + 1,
            total: pythonImages.length,
            percent: Math.round(((i + 1) / pythonImages.length) * 100),
            component: 'documents-service'
          });

          const absoluteImagePath = path.isAbsolute(img.storagePath)
            ? img.storagePath
            : path.resolve(process.cwd(), img.storagePath);
          const normalizedImagePath = absoluteImagePath.replace(/\\/g, '/');

          const ocrResult = await pythonClient.performOCR(
            normalizedImagePath,
            documentId,
            img.pageNumber,
            img.imageIndex
          );

          if (ocrResult.text && ocrResult.text.trim().length > 0) {
            ocrEmbeddings.push({
              documentId,
              userId,
              text: ocrResult.text,
              pageNumber: img.pageNumber,
              chunkIndex: ocrEmbeddings.length,
              sourceType: 'ocr',
              sourceImageId: img.id,
              embedding: []
            });

            await prisma.documentImage.update({
              where: { id: img.id },
              data: {
                ocrText: ocrResult.text,
                ocrConfidence: ocrResult.confidence || 0,
                ocrStatus: 'completed'
              }
            });
          }

        } catch (error) {
          logger.error('OCR failed for image (Python)', {
            documentId,
            imageId: img.id,
            error: error.message,
            component: 'documents-service'
          });

          await prisma.documentImage.update({
            where: { id: img.id },
            data: { ocrStatus: 'failed' }
          });
        }
      }

      logger.info('OCR completed (Python)', {
        documentId,
        ocrEmbeddings: ocrEmbeddings.length,
        component: 'documents-service'
      });

      // STEP 4: Create embeddings
      logger.info('Step 4: Creating embeddings', {
        documentId,
        component: 'documents-service'
      });

      const allEmbeddings = [
        ...(pdfResult.chunks || []).map((chunk, idx) => ({
          documentId,
          userId,
          text: chunk.content,
          pageNumber: chunk.page_number,
          chunkIndex: idx,
          sourceType: 'pdf_text',
          sourceImageId: null,
          embedding: []
        })),
        ...ocrEmbeddings
      ];

      if (allEmbeddings.length > 0) {
        logger.info('Generating embeddings via Python', {
          documentId,
          count: allEmbeddings.length,
          component: 'documents-service'
        });

        const texts = allEmbeddings.map(e => e.text);
        const embeddings = await pythonClient.generateEmbeddings(texts);

        await Promise.all(
          allEmbeddings.map((emb, index) =>
            prisma.embedding.create({
              data: {
                ...emb,
                embedding: embeddings[index]
              }
            })
          )
        );

        logger.info('Embeddings generated (Python)', {
          documentId,
          count: embeddings.length,
          component: 'documents-service'
        });
      }

      // STEP 5: Mark as completed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'completed',
          embeddingStatus: 'completed',
          updatedAt: new Date()
        }
      });

      logger.info('Document processing completed (Python)', {
        documentId,
        totalEmbeddings: allEmbeddings.length,
        component: 'documents-service'
      });

    } catch (error) {
      logger.error('Document processing failed (Python)', {
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
      }).catch(() => {});

      throw error;
    }
  }

  async getDocumentById(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      include: {
        embeddings: {
          orderBy: [
            { pageNumber: 'asc' },
            { chunkIndex: 'asc' }
          ]
        },
        images: {
          orderBy: [
            { pageNumber: 'asc' },
            { imageIndex: 'asc' }
          ]
        }
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  async getDocument(documentId, userId) {
    return this.getDocumentById(documentId, userId);
  }

  async getUserDocuments(userId, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: {
            select: {
              embeddings: true,
              images: true
            }
          }
        }
      }),
      prisma.document.count({ where: { userId } })
    ]);

    return {
      documents,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async listDocuments(userId, page = 1, pageSize = 10) {
    return this.getUserDocuments(userId, page, pageSize);
  }

  async searchDocument(documentId, query, userId, limit = 5) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return embeddingSearch.search(documentId, query, limit);
  }

  async deleteDocument(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.storagePath) {
      await fs.unlink(document.storagePath).catch(() => {});
    }

    await prisma.document.delete({
      where: { id: documentId }
    });

    logger.info('Document deleted', {
      documentId,
      userId,
      component: 'documents-service'
    });
  }
}

module.exports = new DocumentsService();