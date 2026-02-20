'use strict';

const { PrismaClient } = require('@prisma/client');
const config = require('../../config');
const { logger } = require('../../utils/logger');
const pythonClient = require('../python-client.service');

const prisma = new PrismaClient();

class EmbeddingSearchService {
  constructor() {
    // Use Python embedding service instead of HuggingFace
    this.usePython = true;
    this.model = config.HF_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    logger.info('EmbeddingSearchService initialized with Python backend', {
      component: 'embedding-search'
    });
  }

  /* ================================================================
     INDEX DOCUMENT CHUNKS
  ================================================================= */

  async indexDocumentChunks(userId, documentId, chunks) {
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
          const embedding = await this._createEmbedding(chunk.text);

          embeddingRecords.push({
            userId,
            documentId,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            text: chunk.text,
            sourceType: chunk.sourceType,
            sourceImageId: chunk.sourceImageId,
            embedding
          });

          if ((i + 1) % 10 === 0) {
            logger.info('Embedding progress', {
              documentId,
              processed: i + 1,
              total: chunks.length,
              component: 'embedding-search'
            });
          }

          await this._sleep(100);

        } catch (err) {
          logger.error('Chunk embedding failed', {
            documentId,
            chunkIndex: chunk.chunkIndex,
            error: err.message,
            component: 'embedding-search'
          });
        }
      }

      if (embeddingRecords.length > 0) {
        await prisma.embedding.createMany({
          data: embeddingRecords
        });

        logger.info('Embeddings stored', {
          documentId,
          totalEmbeddings: embeddingRecords.length,
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

  /* ================================================================
     SEARCH (RAG CORE)
  ================================================================= */

  async search(userId, query, topK = 5) {
    try {
      logger.info('Searching embeddings', {
        userId,
        query: query.substring(0, 50),
        topK,
        component: 'embedding-search'
      });

      // Generate query embedding using Python
      const queryEmbedding = await this._createEmbedding(query);

      // Get all user embeddings
      const userEmbeddings = await prisma.embedding.findMany({
        where: { userId },
        include: {
          document: true,
          sourceImage: true
        }
      });

      if (!userEmbeddings.length) {
        logger.info('No embeddings found for user', {
          userId,
          component: 'embedding-search'
        });
        return [];
      }

      // Calculate similarity scores
      const scored = userEmbeddings.map(e => {
        const score = this._cosineSimilarity(queryEmbedding, e.embedding);

        // Build image URL if available
        let imageUrl = null;
        if (e.sourceImage?.storagePath) {
          const path = e.sourceImage.storagePath.replace(/\\/g, '/');
          imageUrl = `${config.BASE_URL}/${path}`;
        }

        return {
          id: e.id,
          text: e.text,
          pageNumber: e.pageNumber,
          documentId: e.documentId,
          documentName: e.document?.originalName || 'Unknown Document',
          sourceType: e.sourceType,
          sourceImageId: e.sourceImageId,
          imageUrl,
          score
        };
      });

      // Sort by score and return top K
      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, topK);

      logger.info('Search complete', {
        userId,
        totalEmbeddings: userEmbeddings.length,
        returned: topResults.length,
        topScore: topResults[0]?.score?.toFixed(3),
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

  /* ================================================================
     DELETE DOCUMENT EMBEDDINGS
  ================================================================= */

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
      logger.error('Delete embeddings failed', {
        documentId,
        error: error.message,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  async getDocumentEmbeddingCount(documentId) {
    try {
      return await prisma.embedding.count({
        where: { documentId }
      });
    } catch (error) {
      logger.error('Count embeddings failed', {
        documentId,
        error: error.message,
        component: 'embedding-search'
      });
      return 0;
    }
  }

  /* ================================================================
     INTERNAL UTILITIES
  ================================================================= */

  async _createEmbedding(text) {
    try {
      // Call Python embedding service
      const embeddings = await pythonClient.generateEmbeddings([text]);
      
      // Return first embedding (since we only sent one text)
      return embeddings[0];

    } catch (error) {
      logger.error('Embedding creation failed', {
        model: this.model,
        error: error.message,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (!normA || !normB) return 0;

    return dot / (normA * normB);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  healthCheck() {
    return {
      configured: true,
      backend: 'Python',
      model: this.model,
      status: 'ready'
    };
  }
}

module.exports = new EmbeddingSearchService();