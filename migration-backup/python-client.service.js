// backend/src/services/python-client.service.js
// Python microservice client with robust error handling and health checks

const axios = require('axios');
const FormData = require('form-data');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT = 300000; // 5 minutes for large documents
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

/**
 * PythonClientService - Interface to Python FastAPI microservice
 * Handles all communication with Python processing service
 */
class PythonClientService {
  constructor() {
    this.baseURL = PYTHON_SERVICE_URL;
    this.isHealthy = false;
    this.lastHealthCheck = null;
    
    // Initialize health check
    this.checkHealth();
    
    // Periodic health check every 30 seconds
    setInterval(() => this.checkHealth(), 30000);
  }

  /**
   * Check if Python service is healthy
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000
      });
      
      this.isHealthy = response.data.status === 'healthy';
      this.lastHealthCheck = new Date();
      
      if (this.isHealthy) {
        console.log('[PythonClient] ✓ Python service is healthy');
      } else {
        console.warn('[PythonClient] ⚠ Python service responded but not healthy:', response.data);
      }
      
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      console.error('[PythonClient] ✗ Python service health check failed:', error.message);
      return false;
    }
  }

  /**
   * Ensure service is healthy before making requests
   * @throws {Error} if service is not healthy
   */
  async ensureHealthy() {
    if (!this.isHealthy) {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error(
          'Python microservice is unavailable. Please ensure the service is running.'
        );
      }
    }
  }

  /**
   * Process document via Python service
   * @param {Buffer} fileBuffer - PDF file buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} - Processing results
   */
  async processDocument(fileBuffer, filename, mimeType) {
    await this.ensureHealthy();

    console.log('[PythonClient] Processing document:', {
      filename,
      size: fileBuffer.length,
      mimeType
    });

    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename,
        contentType: mimeType
      });

      const response = await this._makeRequest(
        'POST',
        '/api/process-document',
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      console.log('[PythonClient] Document processed successfully:', {
        textChunks: response.data.text_chunks?.length || 0,
        images: response.data.images?.length || 0,
        ocrChunks: response.data.ocr_chunks?.length || 0
      });

      return response.data;

    } catch (error) {
      console.error('[PythonClient] Document processing failed:', {
        filename,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(
        `Python microservice processing failed: ${this._extractErrorMessage(error)}`
      );
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<Array<number>>} - Embedding vector
   */
  async generateEmbedding(text) {
    await this.ensureHealthy();

    try {
      const response = await this._makeRequest(
        'POST',
        '/api/generate-embedding',
        { text },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!Array.isArray(response.data.embedding)) {
        throw new Error('Invalid embedding format received from Python service');
      }

      return response.data.embedding;

    } catch (error) {
      console.error('[PythonClient] Embedding generation failed:', error.message);
      throw new Error(
        `Embedding generation failed: ${this._extractErrorMessage(error)}`
      );
    }
  }

  /**
   * Perform OCR on image
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} pageNumber - Page number
   * @param {string} imageIndex - Image index
   * @returns {Promise<Object>} - OCR result
   */
  async performOCR(imageBuffer, pageNumber, imageIndex) {
    await this.ensureHealthy();

    try {
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: `page_${pageNumber}_img_${imageIndex}.png`,
        contentType: 'image/png'
      });
      formData.append('page_number', pageNumber.toString());
      formData.append('image_index', imageIndex.toString());

      const response = await this._makeRequest(
        'POST',
        '/api/ocr',
        formData,
        {
          headers: formData.getHeaders()
        }
      );

      return response.data;

    } catch (error) {
      console.error('[PythonClient] OCR failed:', error.message);
      throw new Error(
        `OCR processing failed: ${this._extractErrorMessage(error)}`
      );
    }
  }

  /**
   * Extract images from PDF
   * @param {Buffer} fileBuffer - PDF file buffer
   * @returns {Promise<Array>} - Extracted images
   */
  async extractImages(fileBuffer) {
    await this.ensureHealthy();

    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: 'document.pdf',
        contentType: 'application/pdf'
      });

      const response = await this._makeRequest(
        'POST',
        '/api/extract-images',
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      return response.data.images || [];

    } catch (error) {
      console.error('[PythonClient] Image extraction failed:', error.message);
      throw new Error(
        `Image extraction failed: ${this._extractErrorMessage(error)}`
      );
    }
  }

  /**
   * Make HTTP request with retry logic
   * @private
   */
  async _makeRequest(method, endpoint, data, config = {}) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios({
          method,
          url: `${this.baseURL}${endpoint}`,
          data,
          timeout: REQUEST_TIMEOUT,
          ...config
        });

        return response;

      } catch (error) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === MAX_RETRIES) {
          throw error;
        }

        console.warn(
          `[PythonClient] Request failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`,
          error.message
        );

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }

    throw lastError;
  }

  /**
   * Extract meaningful error message from error object
   * @private
   */
  _extractErrorMessage(error) {
    if (error.response?.data?.detail) {
      return typeof error.response.data.detail === 'string'
        ? error.response.data.detail
        : JSON.stringify(error.response.data.detail);
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.code === 'ECONNREFUSED') {
      return 'Could not connect to Python service';
    }

    if (error.code === 'ETIMEDOUT') {
      return 'Python service request timed out';
    }

    return error.message || 'Unknown error occurred';
  }

  /**
   * Get service status information
   * @returns {Object} - Service status
   */
  getStatus() {
    return {
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      serviceUrl: this.baseURL
    };
  }
}

module.exports = new PythonClientService();