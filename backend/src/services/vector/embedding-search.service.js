// backend/src/services/vector/embedding-search.service.js
'use strict';

/**
 * CRIT-01 FIX:
 *
 * Old broken approach:
 *   - Used @zilliz/milvus2-sdk-node connecting to localhost:19530
 *   - Milvus Lite is Python-only — no embedded Node.js version exists
 *   - On Railway there is no Milvus server, so every call crashed
 *
 * Correct approach (this file):
 *   - Embeddings stored as JSON arrays in the PostgreSQL `embeddings` table
 *   - Cosine similarity computed in JavaScript
 *   - Zero extra infrastructure — works with the existing Railway PostgreSQL
 *   - Scales fine for PRISM's target use case (hundreds of documents per user)
 *   - Can migrate to pgvector later if needed — same API surface
 */

const prisma = require('../../utils/prisma');
const embeddingService = require('../ai/embedding.service');
const config = require('../../config');
const { logger } = require('../../utils/logger');

class EmbeddingSearchService {
  /**
   * Store text chunks + their embeddings for a document.
   * Called after PDF text extraction completes.
   *
   * @param {string} userId
   * @param {string} documentId
   * @param {Array}  chunks - [{ text, chunkIndex, pageNumber }]
   */
  async indexDocumentChunks(userId, documentId, chunks) {
    if (!chunks || chunks.length === 0) {
      logger.warn('No chunks to index', { documentId, userId, component: 'embedding-search' });
      return { indexed: 0 };
    }

    const start = Date.now();

    logger.info('Starting chunk indexing', {
      documentId,
      userId,
      chunkCount: chunks.length,
      component: 'embedding-search'
    });

    try {
      // Generate embeddings in batches
      const texts = chunks.map(c => c.text);
      const embeddings = await embeddingService.generateBatchEmbeddings(texts);

      // Build Prisma create payloads
      const records = chunks.map((chunk, i) => ({
        documentId,
        userId,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber || 1,
        text: chunk.text,
        embedding: embeddings[i] // stored as JSON array
      }));

      // Delete existing embeddings for this document first (re-processing case)
      await prisma.embedding.deleteMany({ where: { documentId } });

      // Batch insert — createMany is much faster than individual creates
      await prisma.embedding.createMany({ data: records });

      logger.info('Chunk indexing complete', {
        documentId,
        userId,
        indexed: records.length,
        ms: Date.now() - start,
        component: 'embedding-search'
      });

      return { indexed: records.length };

    } catch (error) {
      logger.error('Chunk indexing failed', {
        documentId,
        userId,
        error: error.message,
        stack: error.stack,
        component: 'embedding-search'
      });
      throw error;
    }
  }

  /**
   * Semantic search: find the top-K most relevant chunks for a query.
   * Searches only within the given user's documents.
   *
   * @param {string} userId
   * @param {string} queryText
   * @param {Object} options
   * @param {number} options.topK          - Number of results (default 5)
   * @param {string} [options.documentId]  - Limit to one document if provided
   * @param {number} options.minScore      - Min cosine similarity 0–1 (default 0.3)
   * @returns {Array} [{text, documentId, pageNumber, score, chunkIndex}]
   */
  async search(userId, queryText, options = {}) {
    const { topK = 5, documentId = null, minScore = 0.3 } = options;

    if (!queryText || queryText.trim().length === 0) return [];

    try {
      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);

      // Fetch stored embeddings (filter by user, optionally by document)
      const where = { userId };
      if (documentId) where.documentId = documentId;

      const stored = await prisma.embedding.findMany({
        where,
        select: {
          id: true,
          documentId: true,
          chunkIndex: true,
          pageNumber: true,
          text: true,
          embedding: true,
          document: { select: { originalName: true } }
        }
      });

      if (stored.length === 0) return [];

      // Compute cosine similarity for each stored embedding
      const scored = stored
        .map(row => {
          const storedVec = row.embedding; // JSON array from DB
          const score = this._cosineSimilarity(queryEmbedding, storedVec);
          return {
            text: row.text,
            documentId: row.documentId,
            documentName: row.document?.originalName || 'Unknown',
            pageNumber: row.pageNumber,
            chunkIndex: row.chunkIndex,
            score
          };
        })
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.info('Semantic search complete', {
        userId,
        queryLength: queryText.length,
        candidatesEvaluated: stored.length,
        resultsReturned: scored.length,
        topScore: scored[0]?.score?.toFixed(3),
        component: 'embedding-search'
      });

      return scored;

    } catch (error) {
      logger.error('Semantic search failed', {
        userId,
        error: error.message,
        component: 'embedding-search'
      });
      // Graceful degradation — return empty array so chat still works
      return [];
    }
  }

  /**
   * Delete all embeddings for a document.
   * Called when a document is deleted.
   *
   * @param {string} documentId
   */
  async deleteDocumentEmbeddings(documentId) {
    try {
      const { count } = await prisma.embedding.deleteMany({ where: { documentId } });
      logger.info('Deleted document embeddings', {
        documentId,
        count,
        component: 'embedding-search'
      });
    } catch (error) {
      logger.warn('Failed to delete embeddings', {
        documentId,
        error: error.message,
        component: 'embedding-search'
      });
    }
  }

  /**
   * Count how many chunks are indexed for a user.
   * @param {string} userId
   * @returns {number}
   */
  async getIndexedChunkCount(userId) {
    return prisma.embedding.count({ where: { userId } });
  }

  /**
   * Health check.
   */
  async healthCheck() {
    try {
      const count = await prisma.embedding.count();
      return { status: 'healthy', totalEmbeddings: count };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL: Cosine Similarity
  // ----------------------------------------------------------------

  /**
   * Compute cosine similarity between two float arrays.
   * Returns a value between -1.0 and 1.0 (higher = more similar).
   * For all-MiniLM-L6-v2 embeddings, relevant matches are typically > 0.3.
   */
  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;

    return dot / denom;
  }
}

module.exports = new EmbeddingSearchService();