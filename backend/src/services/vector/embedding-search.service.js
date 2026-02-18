// backend/src/services/vector/embedding-search.service.js
'use strict';

const { HfInference } = require('@huggingface/inference');
const { PrismaClient } = require('@prisma/client');
const config = require('../../config');
const { logger } = require('../../utils/logger');

const prisma = new PrismaClient();

class EmbeddingSearchService {
  constructor() {
    this.hf = config.HF_TOKEN ? new HfInference(config.HF_TOKEN) : null;
    this.model = config.HF_EMBEDDING_MODEL;
  }

  /**
   * Create embeddings for document chunks and store in PostgreSQL
   * @param {string} userId - User ID
   * @param {string} documentId - Document ID
   * @param {Array} chunks - Array of {text, chunkIndex, pageNumber, sourceType, sourceImageId}
   */
  async indexDocumentChunks(userId, documentId, chunks) {
    if (!this.hf) {
      logger.warn('HuggingFace token not configured, skipping embedding creation', {
        documentId,
        component: 'embedding-search'
      });
      return;
    }

    try {
      logger.info('Creating embeddings for document chunks', {
        userId,
        documentId,
        chunkCount: chunks.length,
        component: 'embedding-search'
      });

      const embeddingRecords = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          // Create embedding via HuggingFace API
          const embedding = await this._createEmbedding(chunk.text);

          embeddingRecords.push({
            userId,
            documentId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            sourceType: chunk.sourceType, // 'pdf_text' or 'image_ocr'
            sourceImageId: chunk.sourceImageId, // null for pdf_text, imageId for image_ocr
            embedding: embedding
          });

          // Log progress every 10 chunks
          if ((i + 1) % 10 === 0) {
            logger.info('Embedding progress', {
              documentId,
              processed: i + 1,
              total: chunks.length,
              component: 'embedding-search'
            });
          }

          // Small delay to avoid rate limits
          await this._sleep(100);

        } catch (error) {
          logger.error('Failed to create embedding for chunk', {
            documentId,
            chunkIndex: chunk.chunkIndex,
            error: error.message,
            component: 'embedding-search'
          });
          // Continue with other chunks
        }
      }

      // Batch insert all embeddings
      if (embeddingRecords.length > 0) {
        await prisma.embedding.createMany({
          data: embeddingRecords
        });

        logger.info('Embeddings created and stored', {
          documentId,
          totalEmbeddings: embeddingRecords.length,
          pdfTextEmbeddings: embeddingRecords.filter(e => e.sourceType === 'pdf_text').length,
          imageOcrEmbeddings: embeddingRecords.filter(e => e.sourceType === 'image_ocr').length,
          component: 'embedding-search'
        });
      }

    } catch (error) {
      logger.error('Embedding indexing failed', {
        documentId,
        error: error.message,
        stack: error.stack,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  /**
   * Search for relevant document chunks using vector similarity
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @returns {Array} - Array of {text, pageNumber, documentId, sourceType, sourceImageId, score}
   */
  async search(userId, query, topK = 10) {
    if (!this.hf) {
      logger.warn('HuggingFace token not configured, search unavailable', {
        component: 'embedding-search'
      });
      return [];
    }

    try {
      logger.info('Searching embeddings', {
        userId,
        query: query.substring(0, 50),
        topK,
        component: 'embedding-search'
      });

      // Create embedding for the query
      const queryEmbedding = await this._createEmbedding(query);

      // Get all embeddings for user
      const userEmbeddings = await prisma.embedding.findMany({
        where: { userId },
        select: {
          id: true,
          text: true,
          pageNumber: true,
          documentId: true,
          sourceType: true,
          sourceImageId: true,
          embedding: true
        }
      });

      if (userEmbeddings.length === 0) {
        logger.info('No embeddings found for user', {
          userId,
          component: 'embedding-search'
        });
        return [];
      }

      // Calculate cosine similarity for each embedding
      const results = userEmbeddings.map(emb => {
        const score = this._cosineSimilarity(queryEmbedding, emb.embedding);
        return {
          id: emb.id,
          text: emb.text,
          pageNumber: emb.pageNumber,
          documentId: emb.documentId,
          sourceType: emb.sourceType,
          sourceImageId: emb.sourceImageId,
          score
        };
      });

      // Sort by score (highest first) and take top K
      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, topK);

      logger.info('Search complete', {
        userId,
        totalEmbeddings: userEmbeddings.length,
        topScore: topResults[0]?.score.toFixed(3),
        resultsReturned: topResults.length,
        pdfTextResults: topResults.filter(r => r.sourceType === 'pdf_text').length,
        imageOcrResults: topResults.filter(r => r.sourceType === 'image_ocr').length,
        component: 'embedding-search'
      });

      return topResults;

    } catch (error) {
      logger.error('Search failed', {
        userId,
        query: query.substring(0, 50),
        error: error.message,
        stack: error.stack,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  /**
   * Delete all embeddings for a document
   */
  async deleteDocumentEmbeddings(documentId) {
    try {
      const result = await prisma.embedding.deleteMany({
        where: { documentId }
      });

      logger.info('Document embeddings deleted', {
        documentId,
        count: result.count,
        component: 'embedding-search'
      });

      return result;
    } catch (error) {
      logger.error('Failed to delete embeddings', {
        documentId,
        error: error.message,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  /**
   * Get embeddings count for a document
   */
  async getDocumentEmbeddingCount(documentId) {
    try {
      const count = await prisma.embedding.count({
        where: { documentId }
      });
      return count;
    } catch (error) {
      logger.error('Failed to count embeddings', {
        documentId,
        error: error.message,
        component: 'embedding-search'
      });
      return 0;
    }
  }

  /**
   * Create embedding vector using HuggingFace API
   * @private
   */
  async _createEmbedding(text) {
    try {
      const response = await this.hf.featureExtraction({
        model: this.model,
        inputs: text
      });

      // Response is already an array of floats
      return response;

    } catch (error) {
      logger.error('Embedding creation failed', {
        model: this.model,
        textLength: text.length,
        error: error.message,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  _cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      return 0;
    }

    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Sleep utility for rate limiting
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      configured: Boolean(this.hf),
      model: this.model,
      status: this.hf ? 'ready' : 'not_configured'
    };
  }
}

module.exports = new EmbeddingSearchService();