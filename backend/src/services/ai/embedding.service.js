// backend/src/services/vector/embedding-search.service.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../../utils/logger');
const pythonClient = require('../python-client.service');

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

class EmbeddingSearchService {
  constructor() {
    logger.info('EmbeddingSearchService initialized — using Voyage AI via Python', {
      component: 'embedding-search'
    });
  }

  /**
   * Search embeddings for a user query.
   * Generates query embedding via Voyage AI, cosine-compares against all user embeddings in DB.
   */
  async search(userId, query, topK = 10) {
    try {
      logger.info('Searching embeddings', {
        userId, query: query.substring(0, 50), topK, component: 'embedding-search'
      });

      // Generate query embedding via Voyage AI (fast — ~200ms)
      const [queryEmbedding] = await pythonClient.generateEmbeddings([query]);

      // Fetch all user embeddings with document + image info
      const userEmbeddings = await prisma.embedding.findMany({
        where: { userId },
        include: {
          document: { select: { originalName: true } },
          sourceImage: { select: { storagePath: true } }
        }
      });

      if (!userEmbeddings.length) {
        logger.info('No embeddings found for user', { userId, component: 'embedding-search' });
        return [];
      }

      // Cosine similarity scoring
      const scored = userEmbeddings.map(e => {
        const score = this._cosineSimilarity(queryEmbedding, e.embedding);

        let imageUrl = null;
        if (e.sourceImage?.storagePath) {
          const filename = e.sourceImage.storagePath.split(/[/\\]/).pop();
          imageUrl = `${BASE_URL}/outputs/${filename}`;
        }

        return {
          id: e.id,
          text: e.text,
          pageNumber: e.pageNumber,
          documentId: e.documentId,
          documentName: e.document?.originalName || 'Unknown',
          sourceType: e.sourceType,
          sourceImageId: e.sourceImageId,
          imageUrl,
          score
        };
      });

      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, topK);

      logger.info('Search complete', {
        userId,
        totalEmbeddings: userEmbeddings.length,
        returned: results.length,
        topScore: results[0]?.score?.toFixed(3),
        component: 'embedding-search'
      });

      return results;

    } catch (error) {
      logger.error('Search failed', {
        userId, query: query.substring(0, 50), error: error.message, component: 'embedding-search'
      });
      throw error;
    }
  }

  async deleteDocumentEmbeddings(documentId) {
    const result = await prisma.embedding.deleteMany({ where: { documentId } });
    logger.info('Document embeddings deleted', { documentId, count: result.count, component: 'embedding-search' });
    return result;
  }

  async getDocumentEmbeddingCount(documentId) {
    return prisma.embedding.count({ where: { documentId } });
  }

  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    return normA && normB ? dot / (normA * normB) : 0;
  }

  healthCheck() {
    return { configured: true, backend: 'Voyage AI via Python', status: 'ready' };
  }
}

module.exports = new EmbeddingSearchService();