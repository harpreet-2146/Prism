// backend/src/services/ai/embedding.service.js
'use strict';

/**
 * HIGH-05 FIX:
 *
 * Old broken approach:
 *   - Used @xenova/transformers which downloads a 90MB ONNX model on first call
 *   - Caused OOM crashes on Railway's 512MB Hobby plan
 *   - Model had to re-download on every deployment restart
 *
 * Correct approach (this file):
 *   - Calls HuggingFace Inference API (HTTP request)
 *   - Zero local RAM for the model — HuggingFace runs it on their servers
 *   - Works instantly on Railway with no cold-start download
 *   - Free tier: generous rate limits for sentence-transformers
 */

const { HfInference } = require('@huggingface/inference');
const config = require('../../config');
const { logger } = require('../../utils/logger');

// Retry config
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

class EmbeddingService {
  constructor() {
    this.hf = config.HF_TOKEN ? new HfInference(config.HF_TOKEN) : null;
    this.model = config.HF_EMBEDDING_MODEL;
    this.dimension = 384; // all-MiniLM-L6-v2 output dimension
  }

  /**
   * Generate a single embedding vector for the given text.
   *
   * @param {string} text - Input text (will be truncated to ~512 tokens)
   * @returns {number[]} 384-dimensional float array
   */
  async generateEmbedding(text) {
    if (!this.hf) {
      throw new Error('HF_TOKEN not configured — embeddings unavailable');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    // Truncate to avoid token limit issues (rough char limit)
    const truncated = text.trim().slice(0, 2000);

    return await this._callWithRetry(truncated);
  }

  /**
   * Generate embeddings for multiple texts.
   * Processes in batches to avoid rate limits.
   *
   * @param {string[]} texts
   * @param {number} batchSize
   * @returns {number[][]} Array of 384-dimensional float arrays
   */
  async generateBatchEmbeddings(texts, batchSize = 8) {
    if (!this.hf) {
      throw new Error('HF_TOKEN not configured — embeddings unavailable');
    }

    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );

      results.push(...batchResults);

      // Small delay between batches to respect rate limits
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info('Embedding batch progress', {
        processed: Math.min(i + batchSize, texts.length),
        total: texts.length,
        component: 'embedding-service'
      });
    }

    return results;
  }

  /**
   * Check if embedding service is available.
   * @returns {Object} Health status
   */
  async healthCheck() {
    if (!this.hf) {
      return {
        status: 'unavailable',
        reason: 'HF_TOKEN not configured',
        configured: false
      };
    }

    try {
      const testEmbedding = await this.generateEmbedding('health check');
      const isValid = Array.isArray(testEmbedding) && testEmbedding.length === this.dimension;

      return {
        status: isValid ? 'healthy' : 'degraded',
        model: this.model,
        dimension: this.dimension,
        configured: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        model: this.model,
        configured: true
      };
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL
  // ----------------------------------------------------------------

  async _callWithRetry(text, attempt = 1) {
    try {
      const result = await this.hf.featureExtraction({
        model: this.model,
        inputs: text
      });

      // HuggingFace returns nested arrays for sentence-transformers
      // Shape is either [384] or [[384]] depending on model/input
      const embedding = this._flattenEmbedding(result);

      if (!embedding || embedding.length !== this.dimension) {
        throw new Error(
          `Unexpected embedding dimension: got ${embedding?.length}, expected ${this.dimension}`
        );
      }

      return embedding;

    } catch (error) {
      // Retry on rate limit or transient errors
      const isRetryable =
        error.message?.includes('rate limit') ||
        error.message?.includes('loading') ||
        error.message?.includes('503') ||
        error.message?.includes('504') ||
        error.status === 503 ||
        error.status === 504;

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn('Embedding API retry', {
          attempt,
          delay,
          error: error.message,
          component: 'embedding-service'
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._callWithRetry(text, attempt + 1);
      }

      logger.error('Embedding generation failed', {
        error: error.message,
        model: this.model,
        attempt,
        component: 'embedding-service'
      });
      throw error;
    }
  }

  _flattenEmbedding(result) {
    // Handle both [384] and [[384]] shapes
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return Array.from(result[0]);
    }
    return Array.from(result);
  }
}

module.exports = new EmbeddingService();