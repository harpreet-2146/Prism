'use strict';

/**
 * PDF Image Extraction Service
 * Renders PDF pages as JPEG images using @napi-rs/canvas
 */

const path = require('path');
const fs = require('fs').promises;
const config = require('../../config');
const { logger } = require('../../utils/logger');

// Import canvas BEFORE pdfjs to avoid polyfill issues
let createCanvas;
try {
  const canvasModule = require('canvas');
  createCanvas = canvasModule.createCanvas;
  logger.info('Canvas module loaded successfully', { component: 'image-extractor' });
} catch (error) {
  logger.error('Failed to load canvas module', { 
    error: error.message, 
    component: 'image-extractor' 
  });
  throw new Error('Canvas module not available');
}

// Set up canvas polyfills for pdfjs
global.DOMMatrix = class DOMMatrix {};
global.Path2D = class Path2D {};

// Load pdfjs-dist
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

class ImageExtractorService {
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

      // Read PDF
      const pdfBuffer = await fs.readFile(pdfFilePath);
      if (pdfBuffer.length === 0) {
        throw new Error('PDF file is empty');
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true,
        isEvalSupported: false
      });

      const pdfDocument = await loadingTask.promise;
      const totalPages = pdfDocument.numPages;
      const pagesToExtract = Math.min(totalPages, config.MAX_PAGES_TO_EXTRACT);

      logger.info('PDF loaded, rendering pages', {
        documentId,
        totalPages,
        pagesToExtract,
        component: 'image-extractor'
      });

      const extractedImages = [];

      // Render pages sequentially with error handling
      for (let pageNum = 1; pageNum <= pagesToExtract; pageNum++) {
        try {
          const imageData = await this._renderPageAsImage(
            pdfDocument,
            pageNum,
            outputDir,
            documentId
          );
          
          if (imageData) {
            extractedImages.push(imageData);
          }

          // Small delay every 5 pages
          if (pageNum % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (pageError) {
          logger.warn('Failed to render page', {
            documentId,
            pageNum,
            error: pageError.message,
            component: 'image-extractor'
          });
          // Continue with next page
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
      // Return empty array instead of crashing
      return [];
    }
  }

  async _renderPageAsImage(pdfDocument, pageNum, outputDir, documentId) {
    try {
      // Get page
      const page = await pdfDocument.getPage(pageNum);
      
      // Calculate viewport
      const scale = config.PDF_IMAGE_SCALE;
      const viewport = page.getViewport({ scale });

      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      // Validate dimensions
      if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
        throw new Error(`Invalid dimensions: ${width}x${height}`);
      }

      // Create canvas
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Render PDF page
      const renderContext = {
        canvasContext: ctx,
        viewport
      };

      await page.render(renderContext).promise;

      // Generate filename
      const filename = `page_${String(pageNum).padStart(4, '0')}.jpg`;
      const storagePath = path.join(outputDir, filename);

      // Convert to JPEG
      const quality = config.PDF_IMAGE_QUALITY / 100;
      const imageBuffer = canvas.toBuffer('image/jpeg', { quality });

      // Save to disk
      await fs.writeFile(storagePath, imageBuffer);

      const fileSize = imageBuffer.length;

      logger.info('Page rendered', {
        documentId,
        pageNum,
        width,
        height,
        fileSize,
        component: 'image-extractor'
      });

      return {
        pageNumber: pageNum,
        imageIndex: pageNum - 1,
        storagePath,
        width,
        height,
        format: 'jpg',
        fileSize
      };

    } catch (error) {
      logger.error('Page rendering failed', {
        documentId,
        pageNum,
        error: error.message,
        stack: error.stack,
        component: 'image-extractor'
      });
      throw error;
    }
  }

  getImageUrl(documentId, pageNumber) {
    const filename = `page_${String(pageNumber).padStart(4, '0')}.jpg`;
    return `/api/documents/${documentId}/images/${filename}`;
  }

  async deleteDocumentImages(documentId) {
    const imageDir = path.join(config.UPLOAD_DIR, 'images', documentId);
    try {
      await fs.rm(imageDir, { recursive: true, force: true });
      logger.info('Deleted document images', { 
        documentId, 
        component: 'image-extractor' 
      });
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