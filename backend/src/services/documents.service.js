// backend/src/services/documents.service.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const pythonClient = require('./python-client.service');
const embeddingSearch = require('./vector/embedding-search.service');

const prisma = new PrismaClient();

const OUTPUTS_DIR = path.resolve(__dirname, '../../../python-service/data/outputs');

class DocumentsService {
  async uploadDocument(file, userId) {
    try {
      logger.info('Starting document upload', {
        userId, filename: file.originalname, size: file.size, component: 'documents-service'
      });

      try { await pythonClient.healthCheck(); } catch {
        throw new Error('Python processing service is unavailable. Please try again later.');
      }

      const document = await prisma.document.create({
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

      this._processDocument(document.id, userId, file.path).catch(error => {
        logger.error('Document processing failed', {
          documentId: document.id, error: error.message, stack: error.stack, component: 'documents-service'
        });
      });

      return document;

    } catch (error) {
      if (file.path) await fs.unlink(file.path).catch(() => {});
      throw new Error(`Document upload failed: ${error.message}`);
    }
  }

  async _processDocument(documentId, userId, filePath) {
    try {
      await prisma.document.update({ where: { id: documentId }, data: { status: 'processing' } });

      const normalizedPath = (path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath)
      ).replace(/\\/g, '/');

      // STEP 1: Extract PDF text
      logger.info('Step 1: Extracting PDF text', { documentId, component: 'documents-service' });
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

      // Word counts per page — used to decide which images need OCR
      const wordCounts = pdfResult.word_counts || {};

      // STEP 2: Image extraction + smart OCR — fire and forget
      pythonClient.extractImages(documentId, normalizedPath)
        .then(async () => {
          try {
            const images = await prisma.documentImage.findMany({
              where: { documentId },
              orderBy: [{ pageNumber: 'asc' }, { imageIndex: 'asc' }]
            });

            await prisma.document.update({
              where: { id: documentId },
              data: { imageCount: images.length }
            });

            if (images.length > 0) {
              // Smart OCR filter:
              // - Page renders (_full.jpg): ALWAYS OCR — the whole page is an image
              // - Embedded images (_img): only OCR if their page has < 100 words
              //   (meaning the image IS the content, not just decoration)
              // - Skip tiny images < 200x150 (icons, logos, bullets)
              const imagesToOCR = images.filter(img => {
                const storagePath = img.storagePath || '';
                const isPageRender = storagePath.includes('_full.jpg');

                if (isPageRender) return true;

                // Embedded image — check if its page had real text
                const pageWordCount = wordCounts[img.pageNumber] || 0;
                if (pageWordCount > 100) return false; // text-heavy page, skip

                // Skip tiny images
                if ((img.width || 0) < 200 || (img.height || 0) < 150) return false;

                return true;
              });

              logger.info('Smart OCR filter applied', {
                documentId,
                totalImages: images.length,
                toOCR: imagesToOCR.length,
                skipped: images.length - imagesToOCR.length,
                component: 'documents-service'
              });

              if (imagesToOCR.length > 0) {
                await this._runOCROnImages(documentId, userId, imagesToOCR);
              }
            }
          } catch (err) {
            logger.warn('Post-extraction steps failed', { documentId, error: err.message, component: 'documents-service' });
          }
        })
        .catch(err => logger.warn('Image extraction failed', { documentId, error: err.message, component: 'documents-service' }));

      // STEP 3: Text embeddings
      logger.info('Step 3: Creating text embeddings', { documentId, component: 'documents-service' });

      const textEmbeddings = (pdfResult.chunks || []).map((chunk, idx) => ({
        documentId, userId,
        text: chunk.content,
        pageNumber: chunk.page_number,
        chunkIndex: idx,
        sourceType: 'pdf_text',
        sourceImageId: null,
        embedding: []
      }));

      if (textEmbeddings.length > 0) {
        const vectors = await pythonClient.generateEmbeddings(textEmbeddings.map(e => e.text));
        await Promise.all(
          textEmbeddings.map((emb, i) => prisma.embedding.create({ data: { ...emb, embedding: vectors[i] } }))
        );
        logger.info('Text embeddings saved', { documentId, count: vectors.length, component: 'documents-service' });
      }

      // STEP 4: Complete
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'completed', embeddingStatus: 'completed', updatedAt: new Date() }
      });

      logger.info('Document processing complete — OCR running in background', { documentId, component: 'documents-service' });

    } catch (error) {
      logger.error('Document processing failed', { documentId, error: error.message, stack: error.stack, component: 'documents-service' });
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed', processingError: error.message }
      }).catch(() => {});
      throw error;
    }
  }

  async _runOCROnImages(documentId, userId, images) {
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(images.length / BATCH_SIZE);

    logger.info('Parallel batch OCR started', {
      documentId, imageCount: images.length, batchSize: BATCH_SIZE,
      totalBatches, component: 'documents-service'
    });

    const allOCRResults = [];

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batch = images.slice(batchIdx * BATCH_SIZE, (batchIdx + 1) * BATCH_SIZE);

      logger.info(`OCR batch ${batchIdx + 1}/${totalBatches} — ${batch.length} images`, {
        documentId, component: 'documents-service'
      });

      const batchPayload = batch.map(img => ({
        id: img.id,
        path: path.join(OUTPUTS_DIR, path.basename(img.storagePath)).replace(/\\/g, '/')
      }));

      try {
        const batchResults = await pythonClient.performOCRBatch(batchPayload);

        for (const img of batch) {
          const result = batchResults.find(r => r.id === img.id);
          if (result?.status === 'completed' && result.text?.trim()) {
            allOCRResults.push({ img, text: result.text, confidence: result.confidence || 0 });
            await prisma.documentImage.update({
              where: { id: img.id },
              data: { ocrText: result.text, ocrConfidence: result.confidence || 0, ocrStatus: 'completed' }
            });
          } else {
            await prisma.documentImage.update({
              where: { id: img.id },
              data: { ocrStatus: 'completed', ocrText: '' }
            }).catch(() => {});
          }
        }

        logger.info(`OCR batch ${batchIdx + 1}/${totalBatches} done`, {
          documentId,
          successful: batchResults.filter(r => r.status === 'completed').length,
          component: 'documents-service'
        });

      } catch (err) {
        logger.error(`OCR batch ${batchIdx + 1} failed`, { documentId, error: err.message, component: 'documents-service' });
        await Promise.all(batch.map(img =>
          prisma.documentImage.update({ where: { id: img.id }, data: { ocrStatus: 'failed' } }).catch(() => {})
        ));
      }
    }

    // Generate embeddings for OCR text
    if (allOCRResults.length > 0) {
      logger.info('Generating OCR embeddings', { documentId, count: allOCRResults.length, component: 'documents-service' });

      const ocrEmbeddings = allOCRResults.map((r, idx) => ({
        documentId, userId,
        text: r.text,
        pageNumber: r.img.pageNumber,
        chunkIndex: idx,
        sourceType: 'ocr',
        sourceImageId: r.img.id,
        embedding: []
      }));

      const ocrVectors = await pythonClient.generateEmbeddings(ocrEmbeddings.map(e => e.text));
      await Promise.all(
        ocrEmbeddings.map((emb, i) => prisma.embedding.create({ data: { ...emb, embedding: ocrVectors[i] } }))
      );

      logger.info('OCR embeddings saved', { documentId, count: ocrEmbeddings.length, component: 'documents-service' });
    }

    logger.info('All OCR complete', { documentId, ocrWithText: allOCRResults.length, total: images.length, component: 'documents-service' });
  }

  async getDocumentById(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        embeddings: { orderBy: [{ pageNumber: 'asc' }, { chunkIndex: 'asc' }] },
        images: { orderBy: [{ pageNumber: 'asc' }, { imageIndex: 'asc' }] }
      }
    });
    if (!document) throw new Error('Document not found');
    return document;
  }

  async getDocument(documentId, userId) { return this.getDocumentById(documentId, userId); }

  async getUserDocuments(userId, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip, take: pageSize,
        include: { _count: { select: { embeddings: true, images: true } } }
      }),
      prisma.document.count({ where: { userId } })
    ]);
    return { documents, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async listDocuments(userId, page = 1, pageSize = 10) { return this.getUserDocuments(userId, page, pageSize); }

  async searchDocument(documentId, query, userId, limit = 5) {
    const document = await prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) throw new Error('Document not found');
    return embeddingSearch.search(documentId, query, limit);
  }

  async deleteDocument(documentId, userId) {
    const document = await prisma.document.findFirst({ where: { id: documentId, userId } });
    if (!document) throw new Error('Document not found');
    if (document.storagePath) await fs.unlink(document.storagePath).catch(() => {});
    await prisma.document.delete({ where: { id: documentId } });
  }
}

module.exports = new DocumentsService();