// backend/src/services/python-client.service.js
// Client for Python FastAPI microservice

const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT = 300000; // 5 minutes

/**
 * Python Client Service
 * Connects Node.js backend to Python FastAPI microservice
 */
class PythonClientService {
  constructor() {
    this.baseURL = PYTHON_SERVICE_URL;
    console.log(`[PythonClient] Initialized with URL: ${this.baseURL}`);
  }

  /**
   * Check Python service health
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[PythonClient] Health check failed:', error.message);
      throw new Error('Python service unavailable');
    }
  }

  /**
   * Process PDF - Extract text and metadata
   * @param {string} documentId - Document ID
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<Object>} - Processing results
   */
  async processPDF(documentId, pdfPath) {
    try {
      console.log('[PythonClient] Processing PDF:', { documentId, pdfPath });

      const response = await axios.post(
        `${this.baseURL}/api/pdf/process`,
        {
          document_id: documentId,
          pdf_path: pdfPath
        },
        {
          timeout: REQUEST_TIMEOUT,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data.success) {
        throw new Error('PDF processing failed');
      }

      console.log('[PythonClient] PDF processed successfully');
      return response.data.data;

    } catch (error) {
      console.error('[PythonClient] PDF processing failed:', error.message);
      throw new Error(`Python PDF processing failed: ${error.message}`);
    }
  }

  /**
   * Extract images from PDF
   * @param {string} documentId - Document ID
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<Array>} - Extracted images
   */
  async extractImages(documentId, pdfPath) {
    try {
      console.log('[PythonClient] Extracting images:', { documentId, pdfPath });

      const response = await axios.post(
        `${this.baseURL}/api/pdf/extract-images`,
        {
          document_id: documentId,
          pdf_path: pdfPath
        },
        {
          timeout: REQUEST_TIMEOUT,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data.success) {
        throw new Error('Image extraction failed');
      }

      console.log('[PythonClient] Images extracted:', response.data.data.count);
      return response.data.data.images;

    } catch (error) {
      console.error('[PythonClient] Image extraction failed:', error.message);
      throw new Error(`Python image extraction failed: ${error.message}`);
    }
  }

  /**
   * Perform OCR on image
   * @param {string} imagePath - Path to image file
   * @param {string} documentId - Document ID
   * @param {number} pageNumber - Page number
   * @param {number} imageIndex - Image index
   * @returns {Promise<Object>} - OCR result
   */
  async performOCR(imagePath, documentId, pageNumber, imageIndex) {
    try {
      console.log('[PythonClient] Performing OCR:', { imagePath, pageNumber, imageIndex });

      const response = await axios.post(
        `${this.baseURL}/api/ocr/process`,
        {
          image_path: imagePath,
          document_id: documentId,
          page_number: pageNumber,
          image_index: imageIndex
        },
        {
          timeout: REQUEST_TIMEOUT,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data.success) {
        throw new Error('OCR processing failed');
      }

      console.log('[PythonClient] OCR completed');
      // Python returns {success: true, text: "...", confidence: ...} directly
      return response.data;

    } catch (error) {
      console.error('[PythonClient] OCR failed:', error.message);
      throw new Error(`Python OCR failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text
   * @param {Array<string>} texts - Array of text chunks
   * @returns {Promise<Array>} - Embeddings
   */
  async generateEmbeddings(texts) {
    try {
      console.log('[PythonClient] Generating embeddings:', texts.length);

      const response = await axios.post(
        `${this.baseURL}/api/embeddings/generate`,
        texts, // Send as array directly
        {
          timeout: REQUEST_TIMEOUT,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Python returns array directly: [embedding1, embedding2, ...]
      console.log('[PythonClient] Embeddings generated');
      return response.data;

    } catch (error) {
      console.error('[PythonClient] Embedding generation failed:', error.message);
      throw new Error(`Python embedding generation failed: ${error.message}`);
    }
  }
}

module.exports = new PythonClientService();