const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class EmbeddingService {
  constructor() {
    this.apiKey = config.ai.google.apiKey;
    this.model = 'text-embedding-004';
    this.batchSize = 100; // Maximum number of texts to process in one batch
    this.dimensionality = 768; // Default embedding dimensions
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text) {
    if (!this.apiKey) {
      logger.warn('Google AI API key not configured - embedding features disabled');
      return null;
    }

    if (!text || typeof text !== 'string') {
      throw new AppError('Text is required for embedding generation', 400);
    }

    // Truncate text if too long (model has limits)
    const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

    try {
      const response = await this.makeEmbeddingRequest([truncatedText]);
      
      if (response.embeddings && response.embeddings.length > 0) {
        return response.embeddings[0].values;
      }

      return null;

    } catch (error) {
      logger.error('Embedding generation error:', error);
      
      if (error.status === 429) {
        throw new AppError('Embedding service rate limit exceeded', 429);
      } else if (error.status === 401) {
        throw new AppError('Embedding service authentication failed', 503);
      }
      
      // Don't throw error for embeddings - they're optional
      logger.warn('Failed to generate embedding, continuing without it');
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts) {
    if (!this.apiKey) {
      logger.warn('Google AI API key not configured - embedding features disabled');
      return [];
    }

    if (!Array.isArray(texts) || texts