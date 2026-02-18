// backend/src/services/ocr.service.js
'use strict';

const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const { logger } = require('../utils/logger');

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const RATE_LIMIT_DELAY_MS = 1200; // Free tier: ~1 request per second, adding buffer

class OCRService {
  constructor() {
    this.apiKey = config.OCR_SPACE_API_KEY;
    this.engine = config.OCR_SPACE_ENGINE;
    this.language = config.OCR_SPACE_LANGUAGE;
  }

  /**
   * Process a single image file with OCR.space API
   * @param {string} imagePath - Absolute path to image file
   * @returns {Promise<{text: string, confidence: number}>}
   */
  async processImage(imagePath) {
    if (!this.apiKey) {
      logger.warn('OCR_SPACE_API_KEY not configured, skipping OCR', {
        component: 'ocr-service'
      });
      return { text: '', confidence: 0 };
    }

    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(imagePath));
      form.append('apikey', this.apiKey);
      form.append('language', this.language);
      form.append('isOverlayRequired', 'false');
      form.append('detectOrientation', 'true');
      form.append('scale', 'true');
      form.append('OCREngine', this.engine.toString());

      logger.info('Starting OCR processing', {
        imagePath,
        language: this.language,
        engine: this.engine,
        component: 'ocr-service'
      });

      const response = await axios.post(OCR_API_URL, form, {
        headers: form.getHeaders(),
        timeout: 30000
      });

      if (response.data.IsErroredOnProcessing) {
        const errorMsg = response.data.ErrorMessage?.[0] || 'Unknown OCR error';
        throw new Error(errorMsg);
      }

      const parsedResult = response.data.ParsedResults?.[0];
      if (!parsedResult) {
        throw new Error('No OCR results returned');
      }

      const text = parsedResult.ParsedText || '';
      const exitCode = parsedResult.FileParseExitCode;
      
      // Exit code 1 = success, others = partial/failed
      const confidence = exitCode === 1 ? 0.95 : 0.5;

      logger.info('OCR processing complete', {
        imagePath,
        textLength: text.length,
        confidence,
        exitCode,
        component: 'ocr-service'
      });

      return {
        text: text.trim(),
        confidence
      };

    } catch (error) {
      logger.error('OCR processing failed', {
        imagePath,
        error: error.message,
        component: 'ocr-service'
      });

      // Return empty result instead of crashing
      return { text: '', confidence: 0 };
    }
  }

  /**
   * Process multiple images with rate limiting
   * @param {Array<{path: string, id: string}>} images - Array of image objects
   * @param {Function} onProgress - Progress callback (current, total, percent)
   * @returns {Promise<Array<{id: string, text: string, confidence: number}>>}
   */
  async processImages(images, onProgress) {
    if (!this.apiKey) {
      logger.warn('OCR_SPACE_API_KEY not configured, skipping all OCR', {
        component: 'ocr-service'
      });
      return images.map(img => ({ id: img.id, text: '', confidence: 0 }));
    }

    const results = [];
    const total = images.length;

    logger.info('Starting batch OCR processing', {
      totalImages: total,
      component: 'ocr-service'
    });

    for (let i = 0; i < total; i++) {
      const image = images[i];

      // Process image
      const result = await this.processImage(image.path);

      results.push({
        id: image.id,
        ...result
      });

      // Progress callback
      if (onProgress) {
        const current = i + 1;
        const percent = Math.round((current / total) * 100);
        onProgress({ current, total, percent });
      }

      // Rate limiting: Wait between requests (free tier = ~1 req/sec)
      if (i < total - 1) {
        await this._sleep(RATE_LIMIT_DELAY_MS);
      }
    }

    logger.info('Batch OCR processing complete', {
      totalProcessed: results.length,
      successful: results.filter(r => r.text.length > 0).length,
      component: 'ocr-service'
    });

    return results;
  }

  /**
   * Health check for OCR service
   */
  healthCheck() {
    return {
      configured: Boolean(this.apiKey),
      engine: this.engine,
      language: this.language,
      status: this.apiKey ? 'ready' : 'not_configured'
    };
  }

  /**
   * Sleep utility for rate limiting
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new OCRService();