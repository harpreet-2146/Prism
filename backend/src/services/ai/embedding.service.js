'use strict';

const { HfInference } = require('@huggingface/inference');
const config = require('../../config');
const { logger } = require('../../utils/logger');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

class EmbeddingService {
  constructor() {
    // ✅ NO baseUrl - let library handle it
    this.hf = config.HF_TOKEN ? new HfInference(config.HF_TOKEN) : null;
    this.model = config.HF_EMBEDDING_MODEL;
    this.dimension = 384;
  }

  async generateEmbedding(text) {
    if (!this.hf) {
      throw new Error('HF_TOKEN not configured');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot embed empty text');
    }

    const truncated = text.trim().slice(0, 2000);
    return await this._callWithRetry(truncated);
  }

  async generateBatchEmbeddings(texts, batchSize = 8) {
    if (!this.hf) {
      throw new Error('HF_TOKEN not configured');
    }

    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      results.push(...batchResults);

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

  async _callWithRetry(text, attempt = 1) {
    try {
      // ✅ Simple call - no custom options
      const result = await this.hf.featureExtraction({
        model: this.model,
        inputs: text
      });

      const embedding = this._flattenEmbedding(result);

      if (!embedding || embedding.length !== this.dimension) {
        throw new Error(
          `Unexpected embedding dimension: got ${embedding?.length}, expected ${this.dimension}`
        );
      }

      return embedding;

    } catch (error) {
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
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return Array.from(result[0]);
    }
    return Array.from(result);
  }
}

module.exports = new EmbeddingService();