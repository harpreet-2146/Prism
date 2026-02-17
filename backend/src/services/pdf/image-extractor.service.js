const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class ImageExtractorService {
  constructor() {
    this.supportedFormats = ['jpg', 'jpeg', 'png', 'webp'];
    this.maxImageSize = 10 * 1024 * 1024; // 10MB per image
  }

  /**
   * Extract images from PDF (placeholder implementation)
   * Note: This is a basic implementation. For full PDF image extraction,
   * you would need libraries like pdf-poppler or pdf2pic
   */
  async extractImages(pdfPath) {
    try {
      logger.info('Starting PDF image extraction', { pdfPath });

      // Check if PDF exists
      await fs.access(pdfPath);

      // This is a placeholder implementation
      // In a real scenario, you would use libraries like:
      // - pdf-poppler: Convert PDF pages to images
      // - pdf2pic: Extract images from PDF
      // - node-poppler: Wrapper for poppler utils

      const images = await this.extractWithPlaceholder(pdfPath);
      
      logger.info('PDF image extraction completed', { 
        pdfPath, 
        imageCount: images.length 
      });

      return images;

    } catch (error) {
      logger.error('PDF image extraction error:', error);
      
      if (error.code === 'ENOENT') {
        throw new AppError('PDF file not found', 404);
      }
      
      throw new AppError('Failed to extract images from PDF', 500);
    }
  }

  /**
   * Placeholder image extraction (returns empty array)
   * Replace this with actual image extraction logic
   */
  async extractWithPlaceholder(pdfPath) {
    // Placeholder implementation - would be replaced with actual extraction
    logger.warn('Using placeholder image extraction - no actual images extracted');
    return [];
  }

  /**
   * Extract images using pdf-poppler (if available)
   */
  async extractWithPoppler(pdfPath, options = {}) {
    try {
      // This would require pdf-poppler package
      // npm install pdf-poppler
      
      const poppler = require('pdf-poppler');
      
      const pdfOptions = {
        format: 'jpeg',
        out_dir: options.outputDir || path.dirname(pdfPath),
        out_prefix: options.prefix || 'page',
        page: null, // All pages
        scale: options.scale || 1.0
      };

      const pages = await poppler.convert(pdfPath, pdfOptions);
      
      const imageBuffers = [];
      for (const pagePath of pages) {
        const buffer = await fs.readFile(pagePath);
        imageBuffers.push(buffer);
        
        // Clean up temporary file
        await fs.unlink(pagePath).catch(() => {});
      }

      return imageBuffers;

    } catch (error) {
      logger.error('Poppler extraction error:', error);
      throw new AppError('PDF image extraction with poppler failed', 500);
    }
  }

  /**
   * Extract images using pdf2pic (if available)
   */
  async extractWithPdf2Pic(pdfPath, options = {}) {
    try {
      // This would require pdf2pic package
      // npm install pdf2pic
      
      const pdf2pic = require('pdf2pic');
      
      const convert = pdf2pic.fromPath(pdfPath, {
        density: options.density || 100,
        saveFilename: options.filename || 'untitled',
        savePath: options.outputDir || './images',
        format: options.format || 'png',
        width: options.width || 600,
        height: options.height || 800
      });

      const results = await convert.bulk(-1); // All pages
      
      const imageBuffers = [];
      for (const result of results) {
        if (result.base64) {
          const buffer = Buffer.from(result.base64, 'base64');
          imageBuffers.push(buffer);
        }
      }

      return imageBuffers;

    } catch (error) {
      logger.error('pdf2pic extraction error:', error);
      throw new AppError('PDF image extraction with pdf2pic failed', 500);
    }
  }

  /**
   * Process and optimize extracted images
   */
  async processImages(imageBuffers, options = {}) {
    const processedImages = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      
      try {
        // Validate image size
        if (buffer.length > this.maxImageSize) {
          logger.warn(`Image ${i} too large (${buffer.length} bytes), skipping`);
          continue;
        }

        // Process image (resize, compress, etc.)
        const processedBuffer = await this.optimizeImage(buffer, options);
        
        // Generate metadata
        const metadata = await this.extractImageMetadata(processedBuffer);
        
        processedImages.push({
          buffer: processedBuffer,
          metadata: {
            ...metadata,
            originalSize: buffer.length,
            processedSize: processedBuffer.length,
            pageNumber: i + 1,
            extracted: new Date()
          }
        });

      } catch (error) {
        logger.error(`Error processing image ${i}:`, error);
        continue;
      }
    }

    return processedImages;
  }

  /**
   * Optimize image (placeholder - would use sharp or similar)
   */
  async optimizeImage(imageBuffer, options = {}) {
    // Placeholder implementation
    // In real scenario, you would use Sharp for image processing:
    
    // const sharp = require('sharp');
    // return await sharp(imageBuffer)
    //   .resize(options.width || 800, options.height || 600, { 
    //     fit: 'inside', 
    //     withoutEnlargement: true 
    //   })
    //   .jpeg({ quality: options.quality || 80 })
    //   .toBuffer();

    return imageBuffer; // Return unchanged for now
  }

  /**
   * Extract image metadata (placeholder)
   */
  async extractImageMetadata(imageBuffer) {
    // Placeholder implementation
    // In real scenario, you would extract actual metadata:
    
    // const sharp = require('sharp');
    // const metadata = await sharp(imageBuffer).metadata();
    // return {
    //   width: metadata.width,
    //   height: metadata.height,
    //   format: metadata.format,
    //   channels: metadata.channels,
    //   hasAlpha: metadata.hasAlpha
    // };

    return {
      width: null,
      height: null,
      format: 'unknown',
      size: imageBuffer.length,
      channels: null,
      hasAlpha: null
    };
  }

  /**
   * Save extracted images to disk
   */
  async saveImages(processedImages, outputDir, baseFilename = 'extracted') {
    const savedImages = [];

    await fs.mkdir(outputDir, { recursive: true });

    for (let i = 0; i < processedImages.length; i++) {
      const image = processedImages[i];
      const filename = `${baseFilename}_${i + 1}.jpg`;
      const filepath = path.join(outputDir, filename);

      try {
        await fs.writeFile(filepath, image.buffer);
        
        savedImages.push({
          filename,
          filepath,
          metadata: image.metadata,
          saved: true
        });

        logger.info(`Image saved: ${filepath}`);

      } catch (error) {
        logger.error(`Failed to save image ${filename}:`, error);
        
        savedImages.push({
          filename,
          filepath: null,
          metadata: image.metadata,
          saved: false,
          error: error.message
        });
      }
    }

    return savedImages;
  }

  /**
   * Convert PDF pages to images
   */
  async convertPagesToImages(pdfPath, options = {}) {
    const {
      outputDir = path.dirname(pdfPath),
      format = 'jpeg',
      quality = 80,
      density = 150,
      pages = null // null for all pages, or array of page numbers
    } = options;

    try {
      // This would be the main method combining extraction and processing
      const imageBuffers = await this.extractImages(pdfPath);
      
      if (imageBuffers.length === 0) {
        logger.info('No images extracted from PDF');
        return [];
      }

      const processedImages = await this.processImages(imageBuffers, {
        quality,
        format
      });

      const savedImages = await this.saveImages(
        processedImages, 
        outputDir, 
        path.basename(pdfPath, '.pdf')
      );

      return savedImages;

    } catch (error) {
      logger.error('Convert pages to images error:', error);
      throw error;
    }
  }

  /**
   * Extract specific pages as images
   */
  async extractPageImages(pdfPath, pageNumbers, options = {}) {
    try {
      if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
        throw new AppError('Page numbers array is required', 400);
      }

      const allImages = await this.extractImages(pdfPath);
      
      // Filter images for requested pages
      const requestedImages = pageNumbers.map(pageNum => {
        const index = pageNum - 1; // Convert to 0-based index
        if (index < 0 || index >= allImages.length) {
          logger.warn(`Page ${pageNum} not found in PDF`);
          return null;
        }
        return allImages[index];
      }).filter(img => img !== null);

      if (requestedImages.length === 0) {
        return [];
      }

      const processedImages = await this.processImages(requestedImages, options);

      return processedImages.map((img, index) => ({
        pageNumber: pageNumbers[index],
        ...img
      }));

    } catch (error) {
      logger.error('Extract page images error:', error);
      throw error;
    }
  }

  /**
   * Get image extraction statistics
   */
  async getExtractionStats(pdfPath) {
    try {
      const images = await this.extractImages(pdfPath);
      
      if (images.length === 0) {
        return {
          totalImages: 0,
          totalSize: 0,
          averageSize: 0,
          formats: [],
          extractable: false,
          message: 'No images found in PDF'
        };
      }

      const totalSize = images.reduce((sum, img) => sum + img.length, 0);
      const averageSize = totalSize / images.length;

      return {
        totalImages: images.length,
        totalSize,
        averageSize: Math.round(averageSize),
        estimatedFormats: ['jpeg'], // Would detect actual formats
        extractable: true,
        message: `${images.length} images found`
      };

    } catch (error) {
      logger.error('Get extraction stats error:', error);
      return {
        totalImages: 0,
        totalSize: 0,
        averageSize: 0,
        formats: [],
        extractable: false,
        error: error.message
      };
    }
  }

  /**
   * Check if PDF contains images
   */
  async hasImages(pdfPath) {
    try {
      const stats = await this.getExtractionStats(pdfPath);
      return {
        hasImages: stats.extractable && stats.totalImages > 0,
        imageCount: stats.totalImages,
        message: stats.message
      };
    } catch (error) {
      logger.error('Check images error:', error);
      return {
        hasImages: false,
        imageCount: 0,
        message: 'Could not check for images',
        error: error.message
      };
    }
  }

  /**
   * Clean up temporary image files
   */
  async cleanupImages(filepaths) {
    const results = {
      cleaned: 0,
      failed: 0,
      errors: []
    };

    for (const filepath of filepaths) {
      try {
        await fs.unlink(filepath);
        results.cleaned++;
        logger.info(`Cleaned up image: ${filepath}`);
      } catch (error) {
        results.failed++;
        results.errors.push({ filepath, error: error.message });
        logger.error(`Failed to cleanup image ${filepath}:`, error);
      }
    }

    return results;
  }

  /**
   * Get service capabilities
   */
  getCapabilities() {
    return {
      supportedInputFormats: ['pdf'],
      supportedOutputFormats: this.supportedFormats,
      maxImageSize: this.maxImageSize,
      features: {
        extraction: true,
        optimization: false, // Would be true with Sharp
        formatConversion: false, // Would be true with Sharp
        metadataExtraction: false, // Would be true with Sharp
        pageSelection: true,
        batchProcessing: true
      },
      limitations: [
        'Requires additional libraries for full functionality',
        'Currently returns placeholder results',
        'Image optimization requires Sharp library',
        'Format detection requires image processing library'
      ],
      recommendedLibraries: [
        'pdf-poppler - for PDF to image conversion',
        'pdf2pic - alternative PDF to image conversion',
        'sharp - for image processing and optimization',
        'node-poppler - poppler utilities wrapper'
      ]
    };
  }
}

module.exports = new ImageExtractorService();