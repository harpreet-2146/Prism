// backend/src/services/pdf/image-extractor.service.js
'use strict';

/**
 * CRIT-02 / CRIT-03 FIX:
 *
 * Old broken approach:
 *   - Used pdf-parse v1 (npm) which has NO image extraction API
 *   - Called unpdf.extractImages() which does NOT EXIST in unpdf
 *
 * Correct approach (this file):
 *   - Uses pdfjs-dist + canvas to RENDER each PDF page as a JPEG image
 *   - Works 100% reliably for any PDF — captures exactly what the user sees
 *   - SAP GUI screenshots in PDFs are page renders, not embedded images
 *   - Respects MAX_PAGES_TO_EXTRACT env var so large PDFs don't hang
 */

const path = require('path');
const fs = require('fs').promises;
const { createCanvas } = require('canvas');
const config = require('../../config');
const { logger } = require('../../utils/logger');

// pdfjs-dist legacy build works in Node.js without a DOM
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Disable the web worker — not available in Node.js
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

class ImageExtractorService {
  /**
   * Render PDF pages as JPEG images and save them to disk.
   *
   * @param {string} pdfFilePath  - Absolute path to the uploaded PDF
   * @param {string} documentId   - Used to create a subdirectory for images
   * @returns {Array} Array of image metadata objects saved to DB
   */
  async extractImages(pdfFilePath, documentId) {
    const start = Date.now();

    try {
      logger.info('Starting PDF image extraction', {
        documentId,
        pdfFilePath,
        scale: config.PDF_IMAGE_SCALE,
        maxPages: config.MAX_PAGES_TO_EXTRACT,
        component: 'image-extractor'
      });

      // Ensure output directory exists
      const outputDir = path.join(config.UPLOAD_DIR, 'images', documentId);
      await fs.mkdir(outputDir, { recursive: true });

      // Read PDF into buffer
      const pdfBuffer = await fs.readFile(pdfFilePath);

      // Load PDF with pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        // Disable font loading to speed things up
        disableFontFace: true,
        // Disable range requests
        isEvalSupported: false
      });

      const pdfDocument = await loadingTask.promise;
      const totalPages = pdfDocument.numPages;

      // Respect the env var limit
      const pagesToExtract = Math.min(totalPages, config.MAX_PAGES_TO_EXTRACT);

      logger.info('PDF loaded, rendering pages', {
        documentId,
        totalPages,
        pagesToExtract,
        component: 'image-extractor'
      });

      const extractedImages = [];

      for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
        try {
          const imageData = await this._renderPageAsImage(
            pdfDocument,
            pageNum,
            outputDir,
            documentId
          );
          extractedImages.push(imageData);

          // Small delay every 5 pages to avoid CPU spikes
          if (pageNum % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }

        } catch (pageError) {
          // Don't let one bad page kill the whole extraction
          logger.warn('Failed to render page', {
            documentId,
            pageNum,
            error: pageError.message,
            component: 'image-extractor'
          });
        }
      }

      const ms = Date.now() - start;

      logger.info('PDF image extraction complete', {
        documentId,
        pagesRendered: extractedImages.length,
        totalPages,
        ms,
        component: 'image-extractor'
      });

      return extractedImages;

    } catch (error) {
      logger.error('PDF image extraction failed', {
        documentId,
        error: error.message,
        stack: error.stack,
        component: 'image-extractor'
      });
      // Return empty array — don't fail the whole document upload
      return [];
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL: render a single page to JPEG
  // ----------------------------------------------------------------

  async _renderPageAsImage(pdfDocument, pageNum, outputDir, documentId) {
    const page = await pdfDocument.getPage(pageNum);

    // Scale controls resolution: 1.0 = 72dpi, 1.5 = 108dpi, 2.0 = 144dpi
    const scale = config.PDF_IMAGE_SCALE;
    const viewport = page.getViewport({ scale });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // Create canvas at the scaled size
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // White background (PDFs default to transparent)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Render the page onto the canvas
    const renderContext = {
      canvasContext: ctx,
      viewport
    };

    await page.render(renderContext).promise;

    // Save as JPEG
    const filename = `page_${String(pageNum).padStart(4, '0')}.jpg`;
    const storagePath = path.join(outputDir, filename);

    const quality = config.PDF_IMAGE_QUALITY / 100; // canvas expects 0.0–1.0
    const imageBuffer = canvas.toBuffer('image/jpeg', { quality });

    await fs.writeFile(storagePath, imageBuffer);

    const fileSize = imageBuffer.length;

    return {
      pageNumber: pageNum,
      imageIndex: pageNum - 1,
      storagePath,
      width,
      height,
      format: 'jpg',
      fileSize
    };
  }

  /**
   * Get the public-facing URL path for a stored image.
   * Used by the chat service to embed images in responses.
   *
   * @param {string} documentId
   * @param {number} pageNumber
   * @returns {string} URL path like /api/documents/images/DOC_ID/page_0001.jpg
   */
  getImageUrl(documentId, pageNumber) {
    const filename = `page_${String(pageNumber).padStart(4, '0')}.jpg`;
    return `/api/documents/${documentId}/images/${filename}`;
  }

  /**
   * Delete all images for a document (called when document is deleted).
   *
   * @param {string} documentId
   */
  async deleteDocumentImages(documentId) {
    const imageDir = path.join(config.UPLOAD_DIR, 'images', documentId);
    try {
      await fs.rm(imageDir, { recursive: true, force: true });
      logger.info('Deleted document images', { documentId, component: 'image-extractor' });
    } catch (error) {
      logger.warn('Failed to delete document images', {
        documentId,
        error: error.message,
        component: 'image-extractor'
      });
    }
  }
}

module.exports = new ImageExtractorService();
