// backend/src/services/tavily.service.js
'use strict';

const { tavily } = require('@tavily/core');
const config = require('../config');
const { logger } = require('../utils/logger');

class TavilyService {
  constructor() {
    this.client = config.TAVILY_API_KEY 
      ? tavily({ apiKey: config.TAVILY_API_KEY })
      : null;
    
    this.searchDepth = config.TAVILY_SEARCH_DEPTH;
    this.maxResults = config.TAVILY_MAX_RESULTS;

    if (!this.client) {
      logger.warn('TAVILY_API_KEY not set — web search disabled', { 
        component: 'tavily-service' 
      });
    }
  }

  /**
   * Check if Tavily is configured and available
   */
  isAvailable() {
    return Boolean(this.client);
  }

  /**
   * Determine if a user question needs web search
   * @param {string} message - User's question
   * @returns {boolean}
   */
  shouldSearchWeb(message) {
    if (!this.isAvailable()) {
      return false;
    }

    const lowerMessage = message.toLowerCase();
    
    // Triggers that indicate need for external help
    const webSearchTriggers = [
      'how to fix',
      'how do i fix',
      'how can i fix',
      'solution for',
      'solve',
      'what causes',
      'why does',
      'why is',
      'error',
      'problem with',
      'not working',
      'issue with',
      'help with',
      'troubleshoot',
      'resolve'
    ];

    // Check if message contains any trigger
    const needsWebSearch = webSearchTriggers.some(trigger => 
      lowerMessage.includes(trigger)
    );

    // Also check if message contains error codes (M7001, F5126, etc.)
    const hasErrorCode = /\b[A-Z]{1,2}\d{3,5}\b/.test(message);

    return needsWebSearch || hasErrorCode;
  }

  /**
   * Search the web for SAP-related information
   * @param {string} query - Search query
   * @param {Object} pdfContext - Context from PDF documents (optional)
   * @returns {Promise<Array>} Search results
   */
  async search(query, pdfContext = null) {
    if (!this.client) {
      logger.warn('Tavily search called but not configured', {
        component: 'tavily-service'
      });
      return [];
    }

    try {
      const start = Date.now();
      
      // Extract error codes from query or PDF context
      const errorCodes = this._extractErrorCodes(query, pdfContext);
      
      // Build optimized search query for SAP
      const searchQuery = this._buildSearchQuery(query, errorCodes, pdfContext);

      logger.info('Searching web with Tavily', {
        query: searchQuery,
        hasErrorCodes: errorCodes.length > 0,
        component: 'tavily-service'
      });

      // Call Tavily API
      const response = await this.client.search(searchQuery, {
        searchDepth: this.searchDepth,
        maxResults: this.maxResults,
        includeDomains: [
          'sap.com',
          'community.sap.com',
          'help.sap.com',
          'support.sap.com',
          'stackoverflow.com'
        ],
        excludeDomains: [
          'facebook.com',
          'twitter.com',
          'youtube.com'
        ]
      });

      const results = this._formatResults(response.results || []);
      
      const duration = Date.now() - start;
      logger.info('Tavily search complete', {
        resultsCount: results.length,
        duration,
        component: 'tavily-service'
      });

      return results;

    } catch (error) {
      logger.error('Tavily search failed', {
        error: error.message,
        query,
        component: 'tavily-service'
      });
      
      // Return empty results on error (graceful degradation)
      return [];
    }
  }

  /**
   * Extract SAP error codes from text
   * @private
   */
  _extractErrorCodes(query, pdfContext) {
    const codes = [];
    
    // Extract from query
    const queryMatches = query.match(/\b[A-Z]{1,2}\d{3,5}\b/g) || [];
    codes.push(...queryMatches);

    // Extract from PDF context if available
    if (pdfContext && Array.isArray(pdfContext)) {
      pdfContext.forEach(chunk => {
        if (chunk.text) {
          const contextMatches = chunk.text.match(/\b[A-Z]{1,2}\d{3,5}\b/g) || [];
          codes.push(...contextMatches);
        }
      });
    }

    // Remove duplicates and limit to first 3
    return [...new Set(codes)].slice(0, 3);
  }

  /**
   * Build optimized search query for SAP content
   * @private
   */
  _buildSearchQuery(originalQuery, errorCodes, pdfContext) {
    let searchQuery = '';

    // If we have error codes, prioritize them
    if (errorCodes.length > 0) {
      const primaryError = errorCodes[0];
      searchQuery = `SAP error ${primaryError} fix solution`;
      
      // Add context from PDF if available
      if (pdfContext && pdfContext.length > 0) {
        const firstChunk = pdfContext[0];
        if (firstChunk.sapModule) {
          searchQuery += ` ${firstChunk.sapModule}`;
        }
      }
    } else {
      // Generic SAP query
      searchQuery = `SAP ${originalQuery}`;
    }

    return searchQuery;
  }

  /**
   * Format Tavily results for LLM consumption
   * @private
   */
  _formatResults(results) {
    return results.map((result, index) => ({
      index: index + 1,
      title: result.title || 'Untitled',
      url: result.url || '',
      content: result.content || '',
      score: result.score || 0,
      // Clean and truncate content for LLM context
      snippet: this._cleanContent(result.content || '', 500)
    }));
  }

  /**
   * Clean and truncate content
   * @private
   */
  _cleanContent(content, maxLength = 500) {
    // Remove extra whitespace
    let cleaned = content.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '...';
    }
    
    return cleaned;
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      available: this.isAvailable(),
      searchDepth: this.searchDepth,
      maxResults: this.maxResults,
      status: this.isAvailable() ? 'ready' : 'not_configured'
    };
  }
}

module.exports = new TavilyService();