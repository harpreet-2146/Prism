const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class FileStorageService {
  constructor() {
    this.storageTypes = {
      local: this.localStorage.bind(this),
      s3: this.s3Storage.bind(this), // Placeholder
      azure: this.azureStorage.bind(this), // Placeholder
      gcs: this.gcsStorage.bind(this) // Placeholder
    };

    this.currentStorage = config.storage?.type || 'local';
    this.baseDirectory = config.uploads?.directory || './uploads';
    
    this.directories = {
      documents: 'documents',
      images: 'images', 
      exports: 'exports',
      temp: 'temp',
      thumbnails: 'thumbnails'
    };

    this.ensureDirectories();
  }

  /**
   * Ensure all required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.baseDirectory, { recursive: true });
      
      for (const [name, subDir] of Object.entries(this.directories)) {
        const fullPath = path.join(this.baseDirectory, subDir);
        await fs.mkdir(fullPath, { recursive: true });
        logger.debug(`Storage directory ensured: ${fullPath}`);
      }

    } catch (error) {
      logger.error('Ensure directories error:', error);
    }
  }

  /**
   * Store file using configured storage method
   */
  async storeFile(buffer, options = {}) {
    const {
      filename,
      directory = 'documents',
      contentType = 'application/octet-stream',
      metadata = {},
      generateThumbnail = false
    } = options;

    try {
      // Generate unique filename if not provided
      const finalFilename = filename || this.generateUniqueFilename(contentType);
      
      // Get storage handler
      const storageHandler = this.storageTypes[this.currentStorage];
      if (!storageHandler) {
        throw new AppError(`Unsupported storage type: ${this.currentStorage}`, 500);
      }

      // Store file
      const result = await storageHandler('store', {
        buffer,
        filename: finalFilename,
        directory,
        contentType,
        metadata
      });

      // Generate thumbnail if requested and file is an image
      if (generateThumbnail && this.isImageFile(contentType)) {
        try {
          const thumbnailResult = await this.generateThumbnail(buffer, {
            originalFilename: finalFilename,
            directory: 'thumbnails'
          });
          result.thumbnail = thumbnailResult;
        } catch (error) {
          logger.warn('Thumbnail generation failed:', error.message);
        }
      }

      logger.info('File stored successfully', {
        filename: finalFilename,
        size: buffer.length,
        storage: this.currentStorage,
        directory
      });

      return {
        ...result,
        filename: finalFilename,
        size: buffer.length,
        contentType,
        directory,
        storedAt: new Date()
      };

    } catch (error) {
      logger.error('Store file error:', error);
      throw error;
    }
  }

  /**
   * Retrieve file from storage
   */
  async retrieveFile(filename, directory = 'documents') {
    try {
      const storageHandler = this.storageTypes[this.currentStorage];
      if (!storageHandler) {
        throw new AppError(`Unsupported storage type: ${this.currentStorage}`, 500);
      }

      const result = await storageHandler('retrieve', {
        filename,
        directory
      });

      return result;

    } catch (error) {
      logger.error('Retrieve file error:', error);
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(filename, directory = 'documents') {
    try {
      const storageHandler = this.storageTypes[this.currentStorage];
      if (!storageHandler) {
        throw new AppError(`Unsupported storage type: ${this.currentStorage}`, 500);
      }

      const result = await storageHandler('delete', {
        filename,
        directory
      });

      logger.info('File deleted successfully', {
        filename,
        directory,
        storage: this.currentStorage
      });

      return result;

    } catch (error) {
      logger.error('Delete file error:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename, directory = 'documents') {
    try {
      const storageHandler = this.storageTypes[this.currentStorage];
      const result = await storageHandler('exists', {
        filename,
        directory
      });

      return result.exists;

    } catch (error) {
      logger.error('File exists check error:', error);
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filename, directory = 'documents') {
    try {
      const storageHandler = this.storageTypes[this.currentStorage];
      const result = await storageHandler('metadata', {
        filename,
        directory
      });

      return result.metadata;

    } catch (error) {
      logger.error('Get file metadata error:', error);
      throw error;
    }
  }

  /**
   * Local filesystem storage handler
   */
  async localStorage(operation, options) {
    const { filename, directory, buffer, contentType, metadata } = options;
    const dirPath = path.join(this.baseDirectory, this.directories[directory] || directory);
    const filePath = path.join(dirPath, filename);

    switch (operation) {
      case 'store':
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(filePath, buffer);
        
        // Store metadata as sidecar file if provided
        if (metadata && Object.keys(metadata).length > 0) {
          const metadataPath = filePath + '.meta';
          await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        }

        return {
          path: filePath,
          url: this.getLocalFileUrl(filename, directory),
          storage: 'local'
        };

      case 'retrieve':
        const fileBuffer = await fs.readFile(filePath);
        let fileMetadata = {};

        // Try to read metadata file
        try {
          const metadataPath = filePath + '.meta';
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          fileMetadata = JSON.parse(metadataContent);
        } catch (error) {
          // Metadata file doesn't exist or is invalid
        }

        return {
          buffer: fileBuffer,
          metadata: fileMetadata,
          path: filePath
        };

      case 'delete':
        await fs.unlink(filePath);
        
        // Also delete metadata file if it exists
        try {
          await fs.unlink(filePath + '.meta');
        } catch (error) {
          // Metadata file might not exist
        }

        return { deleted: true };

      case 'exists':
        try {
          await fs.access(filePath);
          return { exists: true };
        } catch (error) {
          return { exists: false };
        }

      case 'metadata':
        const stats = await fs.stat(filePath);
        let storedMetadata = {};

        try {
          const metadataPath = filePath + '.meta';
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          storedMetadata = JSON.parse(metadataContent);
        } catch (error) {
          // No metadata file
        }

        return {
          metadata: {
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            ...storedMetadata
          }
        };

      default:
        throw new AppError(`Unsupported local storage operation: ${operation}`, 400);
    }
  }

  /**
   * S3 storage handler (placeholder)
   */
  async s3Storage(operation, options) {
    // Placeholder for AWS S3 integration
    // Would use AWS SDK to interact with S3
    throw new AppError('S3 storage not implemented', 501);
  }

  /**
   * Azure Blob storage handler (placeholder)
   */
  async azureStorage(operation, options) {
    // Placeholder for Azure Blob Storage integration
    throw new AppError('Azure storage not implemented', 501);
  }

  /**
   * Google Cloud Storage handler (placeholder)
   */
  async gcsStorage(operation, options) {
    // Placeholder for Google Cloud Storage integration
    throw new AppError('Google Cloud Storage not implemented', 501);
  }

  /**
   * Generate unique filename
   */
  generateUniqueFilename(contentType = 'application/octet-stream') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = this.getExtensionFromMimeType(contentType);
    
    return `${timestamp}_${random}${extension}`;
  }

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'application/json': '.json',
      'application/zip': '.zip'
    };

    return mimeToExt[mimeType] || '';
  }

  /**
   * Check if file is an image
   */
  isImageFile(contentType) {
    return contentType.startsWith('image/');
  }

  /**
   * Generate thumbnail for image
   */
  async generateThumbnail(buffer, options = {}) {
    try {
      // Placeholder thumbnail generation
      // In production, use Sharp or similar library
      
      const { originalFilename, directory } = options;
      const thumbnailFilename = `thumb_${originalFilename}`;
      
      // For now, just store the original image as thumbnail
      const result = await this.storeFile(buffer, {
        filename: thumbnailFilename,
        directory,
        contentType: 'image/jpeg'
      });

      return result;

    } catch (error) {
      logger.error('Generate thumbnail error:', error);
      throw error;
    }
  }

  /**
   * Get local file URL
   */
  getLocalFileUrl(filename, directory) {
    return `/uploads/${this.directories[directory] || directory}/${filename}`;
  }

  /**
   * Move file between directories
   */
  async moveFile(filename, fromDirectory, toDirectory) {
    try {
      // Retrieve file from source
      const fileData = await this.retrieveFile(filename, fromDirectory);
      
      // Store in destination
      const result = await this.storeFile(fileData.buffer, {
        filename,
        directory: toDirectory,
        metadata: fileData.metadata
      });

      // Delete from source
      await this.deleteFile(filename, fromDirectory);

      logger.info('File moved successfully', {
        filename,
        from: fromDirectory,
        to: toDirectory
      });

      return result;

    } catch (error) {
      logger.error('Move file error:', error);
      throw error;
    }
  }

  /**
   * Copy file
   */
  async copyFile(filename, fromDirectory, toDirectory, newFilename = null) {
    try {
      const fileData = await this.retrieveFile(filename, fromDirectory);
      
      const result = await this.storeFile(fileData.buffer, {
        filename: newFilename || filename,
        directory: toDirectory,
        metadata: fileData.metadata
      });

      logger.info('File copied successfully', {
        from: `${fromDirectory}/${filename}`,
        to: `${toDirectory}/${newFilename || filename}`
      });

      return result;

    } catch (error) {
      logger.error('Copy file error:', error);
      throw error;
    }
  }

  /**
   * List files in directory
   */
  async listFiles(directory = 'documents', options = {}) {
    try {
      const { limit = 100, offset = 0, pattern = null } = options;

      if (this.currentStorage === 'local') {
        const dirPath = path.join(this.baseDirectory, this.directories[directory] || directory);
        
        try {
          const files = await fs.readdir(dirPath);
          let filteredFiles = files.filter(file => !file.endsWith('.meta'));

          if (pattern) {
            const regex = new RegExp(pattern);
            filteredFiles = filteredFiles.filter(file => regex.test(file));
          }

          const paginatedFiles = filteredFiles.slice(offset, offset + limit);
          
          const fileList = await Promise.all(paginatedFiles.map(async (filename) => {
            try {
              const filePath = path.join(dirPath, filename);
              const stats = await fs.stat(filePath);
              
              return {
                filename,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                url: this.getLocalFileUrl(filename, directory)
              };
            } catch (error) {
              return {
                filename,
                error: error.message
              };
            }
          }));

          return {
            files: fileList,
            total: filteredFiles.length,
            directory,
            offset,
            limit
          };

        } catch (error) {
          if (error.code === 'ENOENT') {
            return {
              files: [],
              total: 0,
              directory,
              offset,
              limit
            };
          }
          throw error;
        }
      }

      throw new AppError(`List files not implemented for storage type: ${this.currentStorage}`, 501);

    } catch (error) {
      logger.error('List files error:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      const stats = {
        storage: this.currentStorage,
        baseDirectory: this.baseDirectory,
        directories: {}
      };

      if (this.currentStorage === 'local') {
        for (const [name, subDir] of Object.entries(this.directories)) {
          const dirPath = path.join(this.baseDirectory, subDir);
          
          try {
            const files = await fs.readdir(dirPath);
            const fileStats = await Promise.all(
              files
                .filter(file => !file.endsWith('.meta'))
                .map(async (file) => {
                  try {
                    const filePath = path.join(dirPath, file);
                    const stat = await fs.stat(filePath);
                    return stat.size;
                  } catch {
                    return 0;
                  }
                })
            );

            stats.directories[name] = {
              fileCount: fileStats.length,
              totalSize: fileStats.reduce((sum, size) => sum + size, 0)
            };
          } catch (error) {
            stats.directories[name] = {
              fileCount: 0,
              totalSize: 0,
              error: error.message
            };
          }
        }
      }

      return stats;

    } catch (error) {
      logger.error('Get storage stats error:', error);
      throw error;
    }
  }

  /**
   * Cleanup old temporary files
   */
  async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) {
    try {
      const tempDir = path.join(this.baseDirectory, this.directories.temp);
      const cutoffTime = Date.now() - maxAge;
      
      let cleanedCount = 0;

      try {
        const files = await fs.readdir(tempDir);
        
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      } catch (error) {
        // Directory might not exist
        logger.debug('Temp cleanup skipped:', error.message);
      }

      if (cleanedCount > 0) {
        logger.info('Temp files cleaned up', { count: cleanedCount });
      }

      return cleanedCount;

    } catch (error) {
      logger.error('Cleanup temp files error:', error);
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test storage by creating and deleting a test file
      const testData = Buffer.from('health-check-test');
      const testFilename = `health-check-${Date.now()}.txt`;

      const storeResult = await this.storeFile(testData, {
        filename: testFilename,
        directory: 'temp',
        contentType: 'text/plain'
      });

      const exists = await this.fileExists(testFilename, 'temp');
      await this.deleteFile(testFilename, 'temp');

      const stats = await this.getStorageStats();

      return {
        status: 'healthy',
        storage: this.currentStorage,
        testPassed: exists,
        stats
      };

    } catch (error) {
      logger.error('Storage health check failed:', error);
      return {
        status: 'error',
        storage: this.currentStorage,
        error: error.message
      };
    }
  }
}

module.exports = new FileStorageService();