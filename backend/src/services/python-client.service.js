// backend/src/services/python-client.service.js
'use strict';

const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const TIMEOUT = {
  HEALTH:     5_000,
  PDF_TEXT:   300_000,   // 5 min
  IMAGES:     900_000,   // 15 min
  OCR:        120_000,   // 2 min per batch
  EMBEDDINGS: 900_000,   // 15 min
};

class PythonClientService {
  constructor() {
    this.baseURL = PYTHON_SERVICE_URL;
    console.log(`[PythonClient] Initialized: ${this.baseURL}`);
  }

  async healthCheck() {
    const response = await axios.get(`${this.baseURL}/health`, { timeout: TIMEOUT.HEALTH });
    return response.data;
  }

  async processPDF(documentId, pdfPath) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/pdf/process`,
        { document_id: documentId, pdf_path: pdfPath },
        { timeout: TIMEOUT.PDF_TEXT, headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.data.success) throw new Error('PDF processing returned failure');
      return response.data.data;
    } catch (error) {
      throw new Error(`Python PDF processing failed: ${error.message}`);
    }
  }

  async extractImages(documentId, pdfPath) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/pdf/extract-images`,
        { document_id: documentId, pdf_path: pdfPath },
        { timeout: TIMEOUT.IMAGES, headers: { 'Content-Type': 'application/json' }, maxContentLength: Infinity, maxBodyLength: Infinity }
      );
      if (!response.data.success) throw new Error('Image extraction returned failure');
      console.log(`[PythonClient] Images extracted: ${response.data.data.count}`);
      return response.data.data.images;
    } catch (error) {
      throw new Error(`Python image extraction failed: ${error.message}`);
    }
  }

  /**
   * OCR a single image — kept for compatibility but prefer performOCRBatch
   */
  async performOCR(imagePath, documentId, pageNumber, imageIndex) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/ocr/process`,
        { image_path: imagePath, document_id: documentId, page_number: pageNumber, image_index: imageIndex },
        { timeout: TIMEOUT.OCR, headers: { 'Content-Type': 'application/json' } }
      );
      if (!response.data.success) throw new Error('OCR returned failure');
      return response.data;
    } catch (error) {
      throw new Error(`Python OCR failed: ${error.message}`);
    }
  }

  /**
   * BATCH OCR — send up to 20 images at once to Python's /process-batch endpoint.
   * This is the fast path used by _runOCROnImages.
   *
   * @param {Array<{id: string, path: string}>} images
   * @returns {Promise<Array<{id, status, text, confidence}>>}
   */
  async performOCRBatch(images) {
    try {
      console.log(`[PythonClient] OCR batch: ${images.length} images`);

      const response = await axios.post(
        `${this.baseURL}/api/ocr/process-batch`,
        { images },
        { timeout: TIMEOUT.OCR, headers: { 'Content-Type': 'application/json' } }
      );

      const results = response.data?.data?.results || [];
      console.log(`[PythonClient] OCR batch done: ${results.filter(r => r.status === 'completed').length}/${results.length} succeeded`);
      return results;

    } catch (error) {
      console.error('[PythonClient] OCR batch failed:', error.message);
      // Return all as failed so caller can continue
      return images.map(img => ({ id: img.id, status: 'failed', text: '', confidence: 0 }));
    }
  }

  /**
   * Generate embeddings in batches of 500 — never times out regardless of doc size.
   */
  async generateEmbeddings(texts) {
    if (!texts?.length) return [];

    const CHUNK = 500;
    const all = [];
    const total = Math.ceil(texts.length / CHUNK);

    console.log(`[PythonClient] Generating embeddings: ${texts.length} texts in ${total} batches`);

    for (let i = 0; i < texts.length; i += CHUNK) {
      const batch = texts.slice(i, i + CHUNK);
      const batchNum = Math.floor(i / CHUNK) + 1;
      console.log(`[PythonClient] Embedding batch ${batchNum}/${total} (${batch.length} texts)`);

      const response = await axios.post(
        `${this.baseURL}/api/embeddings/generate`,
        batch,
        { timeout: TIMEOUT.EMBEDDINGS, headers: { 'Content-Type': 'application/json' } }
      );

      const vectors = Array.isArray(response.data) ? response.data : response.data?.data?.embeddings;
      if (!vectors?.length) throw new Error(`Bad embedding response in batch ${batchNum}`);

      all.push(...vectors);
      console.log(`[PythonClient] Batch ${batchNum}/${total} done — ${all.length}/${texts.length} total`);
    }

    console.log(`[PythonClient] All embeddings done: ${all.length} vectors`);
    return all;
  }
}

module.exports = new PythonClientService();