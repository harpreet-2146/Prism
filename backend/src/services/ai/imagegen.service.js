// backend/src/services/ai/imagegen.service.js
'use strict';

/**
 * HIGH-01 FIX:
 * FLUX.1-schnell requires HuggingFace Pro (~$9/month).
 * This service now:
 *   - Skips AI image generation by default (ENABLE_AI_IMAGE_GENERATION=false)
 *   - Uses free stable-diffusion-2-1 if enabled
 *   - Falls back to Unsplash then Pexels for stock photos
 *   - Returns null gracefully if everything fails (app keeps working)
 */

const { HfInference } = require('@huggingface/inference');
const axios = require('axios');
const config = require('../../config');
const { logger } = require('../../utils/logger');

const AXIOS_TIMEOUT_MS = 10000;

class ImageGenService {
  constructor() {
    this.hf = config.HF_TOKEN ? new HfInference(config.HF_TOKEN) : null;
  }

  /**
   * Get the best available image for a given SAP screenshot description.
   * Priority: (1) AI generated, (2) Unsplash, (3) Pexels, (4) null
   *
   * @param {string} description - What the screenshot should show
   * @returns {Object|null} { type, source, url, attribution? } or null
   */
  async getImage(description) {
    // Try AI generation only if explicitly enabled
    if (config.ENABLE_AI_IMAGE_GENERATION && this.hf) {
      const aiResult = await this._generateAIImage(description);
      if (aiResult) return aiResult;
    }

    // Try stock photo fallbacks
    if (config.UNSPLASH_ACCESS_KEY) {
      const unsplashResult = await this._searchUnsplash(description);
      if (unsplashResult) return unsplashResult;
    }

    if (config.PEXELS_API_KEY) {
      const pexelsResult = await this._searchPexels(description);
      if (pexelsResult) return pexelsResult;
    }

    // Graceful degradation — no image is fine
    logger.info('No image source available, skipping image', {
      description: description.slice(0, 80),
      component: 'imagegen-service'
    });
    return null;
  }

  // ----------------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------------

  healthCheck() {
    return {
      aiGenerationEnabled: config.ENABLE_AI_IMAGE_GENERATION,
      aiModel: config.HF_IMAGE_MODEL,
      hfConfigured: Boolean(config.HF_TOKEN),
      unsplashConfigured: Boolean(config.UNSPLASH_ACCESS_KEY),
      pexelsConfigured: Boolean(config.PEXELS_API_KEY)
    };
  }

  // ----------------------------------------------------------------
  // INTERNAL: AI Image Generation
  // ----------------------------------------------------------------

  async _generateAIImage(description) {
    try {
      const blob = await this.hf.textToImage({
        model: config.HF_IMAGE_MODEL,
        inputs: `Professional enterprise software interface screenshot: ${description}. Clean UI, business application, high quality`,
        parameters: { width: 1024, height: 768 }
      });

      const buffer = Buffer.from(await blob.arrayBuffer());
      const base64 = buffer.toString('base64');

      logger.info('AI image generated', {
        model: config.HF_IMAGE_MODEL,
        component: 'imagegen-service'
      });

      return {
        type: 'generated',
        source: 'huggingface',
        url: `data:image/png;base64,${base64}`
      };

    } catch (error) {
      logger.warn('AI image generation failed, trying fallbacks', {
        error: error.message,
        model: config.HF_IMAGE_MODEL,
        component: 'imagegen-service'
      });
      return null;
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL: Unsplash
  // ----------------------------------------------------------------

  async _searchUnsplash(description) {
    try {
      // Build a clean search query from the description
      const query = this._buildSearchQuery(description);

      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: { query, per_page: 1, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${config.UNSPLASH_ACCESS_KEY}` },
        timeout: AXIOS_TIMEOUT_MS
      });

      const photo = response.data?.results?.[0];
      if (!photo) return null;

      return {
        type: 'stock',
        source: 'unsplash',
        url: photo.urls.regular,
        attribution: {
          photographer: photo.user.name,
          photographerUrl: photo.user.links.html,
          photoUrl: photo.links.html,
          credit: `Photo by ${photo.user.name} on Unsplash`
        }
      };

    } catch (error) {
      logger.warn('Unsplash search failed', {
        error: error.message,
        component: 'imagegen-service'
      });
      return null;
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL: Pexels
  // ----------------------------------------------------------------

  async _searchPexels(description) {
    try {
      const query = this._buildSearchQuery(description);

      const response = await axios.get('https://api.pexels.com/v1/search', {
        params: { query, per_page: 1, orientation: 'landscape' },
        headers: { Authorization: config.PEXELS_API_KEY },
        timeout: AXIOS_TIMEOUT_MS
      });

      const photo = response.data?.photos?.[0];
      if (!photo) return null;

      return {
        type: 'stock',
        source: 'pexels',
        url: photo.src.large,
        attribution: {
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          photoUrl: photo.url,
          credit: `Photo by ${photo.photographer} on Pexels`
        }
      };

    } catch (error) {
      logger.warn('Pexels search failed', {
        error: error.message,
        component: 'imagegen-service'
      });
      return null;
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL: build a short clean search query from a description
  // ----------------------------------------------------------------

  _buildSearchQuery(description) {
    // Strip SAP jargon that won't help stock photo search
    const cleaned = description
      .replace(/T-Code:?\s*\w+/gi, '')
      .replace(/transaction\s+code/gi, '')
      .replace(/SAP\s+(GUI|ERP|system)/gi, 'enterprise software')
      .trim();

    // Take first ~50 chars to keep query clean
    return `${cleaned.slice(0, 50)} business software interface`.trim();
  }
}

module.exports = new ImageGenService();