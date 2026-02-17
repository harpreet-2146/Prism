// backend/src/services/pdf/pdf-processor.service.js
'use strict';

const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const config = require('../../config');
const { logger } = require('../../utils/logger');

class PDFProcessorService {
  /**
   * Main entry point. Extracts text + SAP metadata from a PDF.
   * Image rendering is handled separately by ImageExtractorService.
   *
   * @param {string} filePath - Absolute path to the uploaded PDF
   * @param {string} documentId - Document ID from DB (used for logging)
   * @returns {Object} { textContent, pageCount, sapMetadata, textChunks }
   */
  async processText(filePath, documentId) {
    const start = Date.now();

    try {
      logger.info('Starting PDF text extraction', { documentId, filePath, component: 'pdf-processor' });

      const buffer = await fs.readFile(filePath);

      if (buffer.length === 0) {
        throw new Error('PDF file is empty');
      }

      // pdf-parse extracts text from all pages
      const parsed = await pdfParse(buffer, {
        // Render each page's text in reading order
        pagerender: this._renderPageText.bind(this)
      });

      const textContent = parsed.text || '';
      const pageCount = parsed.numpages || 0;

      logger.info('PDF text extracted', {
        documentId,
        pageCount,
        textLength: textContent.length,
        ms: Date.now() - start,
        component: 'pdf-processor'
      });

      const sapMetadata = this._detectSAPMetadata(textContent);
      const textChunks = this._chunkText(textContent, pageCount);

      return {
        textContent,
        pageCount,
        sapMetadata,
        textChunks
      };

    } catch (error) {
      logger.error('PDF text extraction failed', {
        documentId,
        error: error.message,
        stack: error.stack,
        component: 'pdf-processor'
      });
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  // ----------------------------------------------------------------
  // SAP METADATA DETECTION
  // ----------------------------------------------------------------

  /**
   * Detect SAP-specific patterns from extracted text.
   * All patterns are deliberately broad to catch common SAP notation.
   */
  _detectSAPMetadata(text) {
    const metadata = {
      sapModule: null,
      tcodes: [],
      errorCodes: [],
      noteNumber: null
    };

    if (!text || text.trim().length === 0) return metadata;

    // SAP module detection — pick the most frequently mentioned one
    const modulePattern = /\b(FI|CO|MM|SD|PP|QM|PM|HR|PS|WM|LE|SM|CRM|SRM|BW|BI)\b/g;
    const moduleMatches = text.match(modulePattern) || [];
    if (moduleMatches.length > 0) {
      // Most frequently occurring module wins
      const freq = {};
      moduleMatches.forEach(m => { freq[m] = (freq[m] || 0) + 1; });
      metadata.sapModule = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
    }

    // Transaction codes — letters followed by digits, optionally ending in N
    // Examples: FB01, ME21N, VA01, MIGO, SM30
    const tcodePattern = /\b([A-Z]{2,4}\d{1,3}N?)\b/g;
    const tcodeMatches = text.match(tcodePattern) || [];
    // Deduplicate, limit to 20
    metadata.tcodes = [...new Set(tcodeMatches)].slice(0, 20);

    // Error codes — letter prefix + 3-4 digits
    // Examples: F5126, M7001, VL123
    const errorPattern = /\b([A-Z]{1,2}\d{3,4})\b/g;
    const errorMatches = text.match(errorPattern) || [];
    metadata.errorCodes = [...new Set(errorMatches)].slice(0, 20);

    // SAP Note number
    const notePattern = /SAP\s*Note\s*[#:]?\s*(\d{6,10})/i;
    const noteMatch = text.match(notePattern);
    if (noteMatch) {
      metadata.noteNumber = noteMatch[1];
    }

    return metadata;
  }

  // ----------------------------------------------------------------
  // TEXT CHUNKING (for embeddings)
  // ----------------------------------------------------------------

  /**
   * Split text into overlapping chunks suitable for embedding.
   * Chunks are ~500 chars with 50-char overlap so context isn't lost at boundaries.
   */
  _chunkText(text, pageCount) {
    if (!text || text.trim().length === 0) return [];

    const chunkSize = 500;
    const overlap = 50;
    const chunks = [];

    // Clean up whitespace
    const cleaned = text.replace(/\s+/g, ' ').trim();

    let start = 0;
    let chunkIndex = 0;

    while (start < cleaned.length) {
      const end = Math.min(start + chunkSize, cleaned.length);
      const chunkText = cleaned.slice(start, end).trim();

      if (chunkText.length > 20) { // Skip tiny chunks
        // Rough page number estimate
        const pageNumber = Math.ceil((start / cleaned.length) * pageCount) || 1;

        chunks.push({
          text: chunkText,
          chunkIndex,
          pageNumber,
          startIndex: start,
          endIndex: end
        });

        chunkIndex++;
      }

      start += chunkSize - overlap;
    }

    logger.info('Text chunked', {
      totalChunks: chunks.length,
      textLength: cleaned.length,
      component: 'pdf-processor'
    });

    return chunks;
  }

  // ----------------------------------------------------------------
  // INTERNAL: page renderer for pdf-parse
  // ----------------------------------------------------------------

  async _renderPageText(pageData) {
    // Default text renderer — preserves reading order
    const renderOptions = {
      normalizeWhitespace: true,
      disableCombineTextItems: false
    };

    try {
      const textContent = await pageData.getTextContent(renderOptions);
      let text = '';
      let lastY = null;

      for (const item of textContent.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          text += '\n';
        }
        text += item.str + ' ';
        lastY = item.transform[5];
      }

      return text;
    } catch {
      // If custom renderer fails, fall back to pdf-parse default
      return null;
    }
  }
}

module.exports = new PDFProcessorService();
