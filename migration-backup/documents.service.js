// backend/src/services/documents.service.js
// REFACTORED: Python-only processing, no Node.js fallbacks

const prisma = require('../config/database');
const pythonClient = require('./python-client.service');
const cloudinary = require('../config/cloudinary');

/**
 * DocumentsService - Handles document processing via Python microservice
 * Architecture: Python handles ALL heavy processing (PDF, OCR, embeddings)
 * Node.js handles: API routes, auth, database operations, business logic
 */
class DocumentsService {
  /**
   * Process uploaded document
   * @param {string} userId - User ID
   * @param {Buffer} fileBuffer - PDF file buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} - Processed document data
   */
  async processDocument(userId, fileBuffer, filename, mimeType) {
    console.log('[DocumentsService] Starting document processing:', {
      userId,
      filename,
      fileSize: fileBuffer.length,
      mimeType
    });

    try {
      // Step 1: Send to Python microservice for processing
      console.log('[DocumentsService] Sending to Python microservice...');
      const pythonResponse = await pythonClient.processDocument(
        fileBuffer,
        filename,
        mimeType
      );

      console.log('[DocumentsService] Python processing complete:', {
        textChunks: pythonResponse.text_chunks?.length || 0,
        images: pythonResponse.images?.length || 0,
        ocrChunks: pythonResponse.ocr_chunks?.length || 0
      });

      // Step 2: Upload images to Cloudinary
      const uploadedImages = await this._uploadImagesToCloudinary(
        pythonResponse.images || []
      );

      // Step 3: Save document to database
      const document = await this._saveDocumentToDatabase(
        userId,
        filename,
        pythonResponse,
        uploadedImages
      );

      console.log('[DocumentsService] Document processing complete:', {
        documentId: document.id,
        totalChunks: pythonResponse.text_chunks?.length + pythonResponse.ocr_chunks?.length || 0
      });

      return {
        id: document.id,
        filename: document.filename,
        pageCount: document.pageCount,
        chunkCount: pythonResponse.text_chunks?.length + pythonResponse.ocr_chunks?.length || 0,
        imageCount: uploadedImages.length,
        status: 'completed'
      };

    } catch (error) {
      console.error('[DocumentsService] Processing failed:', error);
      
      // Provide clear error messages based on failure point
      if (error.message?.includes('Python microservice')) {
        throw new Error(
          'Document processing service unavailable. Please try again later.'
        );
      }
      
      if (error.message?.includes('Cloudinary')) {
        throw new Error('Image upload failed. Please check your configuration.');
      }
      
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  /**
   * Upload images to Cloudinary
   * @param {Array} images - Array of image objects from Python
   * @returns {Promise<Array>} - Array of uploaded image data
   */
  async _uploadImagesToCloudinary(images) {
    if (!images || images.length === 0) {
      return [];
    }

    console.log(`[DocumentsService] Uploading ${images.length} images to Cloudinary...`);
    const uploadPromises = images.map(async (image) => {
      try {
        // Convert base64 to buffer if needed
        const imageBuffer = Buffer.isBuffer(image.data) 
          ? image.data 
          : Buffer.from(image.data, 'base64');

        const result = await cloudinary.uploader.upload(
          `data:image/png;base64,${imageBuffer.toString('base64')}`,
          {
            folder: 'prism-documents',
            resource_type: 'image',
            format: 'png'
          }
        );

        return {
          pageNumber: image.page_number,
          imageIndex: image.image_index,
          cloudinaryUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          width: result.width,
          height: result.height
        };
      } catch (error) {
        console.error('[DocumentsService] Image upload failed:', {
          pageNumber: image.page_number,
          imageIndex: image.image_index,
          error: error.message
        });
        return null;
      }
    });

    const uploadedImages = await Promise.all(uploadPromises);
    return uploadedImages.filter(img => img !== null);
  }

  /**
   * Save document and chunks to database
   * @param {string} userId - User ID
   * @param {string} filename - Document filename
   * @param {Object} pythonResponse - Response from Python microservice
   * @param {Array} uploadedImages - Uploaded image data
   * @returns {Promise<Object>} - Created document
   */
  async _saveDocumentToDatabase(userId, filename, pythonResponse, uploadedImages) {
    const { text_chunks = [], ocr_chunks = [], metadata = {} } = pythonResponse;

    // Create image lookup map
    const imageMap = new Map();
    uploadedImages.forEach(img => {
      const key = `${img.pageNumber}-${img.imageIndex}`;
      imageMap.set(key, img);
    });

    // Transform and prepare chunks
    const textChunks = this._transformTextChunks(text_chunks);
    const ocrChunks = this._transformOcrChunks(ocr_chunks, imageMap);
    const allChunks = [...textChunks, ...ocrChunks];

    // Save to database in transaction
    return await prisma.$transaction(async (tx) => {
      // Create document
      const document = await tx.document.create({
        data: {
          userId,
          filename,
          pageCount: metadata.page_count || 0,
          status: 'completed'
        }
      });

      // Create images
      if (uploadedImages.length > 0) {
        await tx.documentImage.createMany({
          data: uploadedImages.map(img => ({
            documentId: document.id,
            pageNumber: img.pageNumber,
            imageIndex: img.imageIndex,
            imageUrl: img.cloudinaryUrl,
            cloudinaryPublicId: img.cloudinaryPublicId,
            width: img.width,
            height: img.height
          }))
        });
      }

      // Create chunks
      if (allChunks.length > 0) {
        await tx.documentChunk.createMany({
          data: allChunks.map(chunk => ({
            documentId: document.id,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            embedding: chunk.embedding,
            sourceType: chunk.sourceType,
            sourceImageId: chunk.sourceImageId
          }))
        });
      }

      return document;
    });
  }

  /**
   * Transform text chunks from Python format (snake_case) to JS format (camelCase)
   * @param {Array} textChunks - Text chunks from Python
   * @returns {Array} - Transformed chunks
   */
  _transformTextChunks(textChunks) {
    return textChunks.map(chunk => ({
      content: chunk.content,
      chunkIndex: chunk.chunk_index,
      pageNumber: chunk.page_number,
      embedding: chunk.embedding,
      sourceType: 'pdf_text',
      sourceImageId: null
    }));
  }

  /**
   * Transform OCR chunks from Python format to JS format
   * @param {Array} ocrChunks - OCR chunks from Python
   * @param {Map} imageMap - Map of page-image to uploaded image data
   * @returns {Array} - Transformed chunks
   */
  _transformOcrChunks(ocrChunks, imageMap) {
    return ocrChunks.map(chunk => {
      const key = `${chunk.page_number}-${chunk.image_index}`;
      const imageData = imageMap.get(key);

      return {
        content: chunk.content,
        chunkIndex: chunk.chunk_index,
        pageNumber: chunk.page_number,
        embedding: chunk.embedding,
        sourceType: 'ocr',
        sourceImageId: imageData?.cloudinaryPublicId || null
      };
    });
  }

  /**
   * Search document chunks using embeddings
   * @param {string} documentId - Document ID
   * @param {string} query - Search query
   * @param {number} limit - Number of results
   * @returns {Promise<Array>} - Search results
   */
  async searchDocument(documentId, query, limit = 5) {
    try {
      // Generate query embedding via Python
      const queryEmbedding = await pythonClient.generateEmbedding(query);

      // Get document chunks
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId },
        include: {
          document: true
        }
      });

      if (chunks.length === 0) {
        return [];
      }

      // Calculate similarity scores
      const results = chunks.map(chunk => ({
        ...chunk,
        similarity: this._calculateCosineSimilarity(
          queryEmbedding,
          chunk.embedding
        )
      }));

      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    } catch (error) {
      console.error('[DocumentsService] Search failed:', error);
      throw new Error(`Document search failed: ${error.message}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array<number>} vecA - First vector
   * @param {Array<number>} vecB - Second vector
   * @returns {number} - Similarity score
   */
  _calculateCosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      return 0;
    }

    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Get document by ID
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Document with chunks and images
   */
  async getDocument(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      include: {
        chunks: {
          orderBy: [
            { pageNumber: 'asc' },
            { chunkIndex: 'asc' }
          ]
        },
        images: {
          orderBy: [
            { pageNumber: 'asc' },
            { imageIndex: 'asc' }
          ]
        }
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  /**
   * Delete document
   * @param {string} documentId - Document ID
   * @param {string} userId - User ID
   */
  async deleteDocument(documentId, userId) {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId
      },
      include: {
        images: true
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Delete images from Cloudinary
    if (document.images.length > 0) {
      await Promise.all(
        document.images.map(img => 
          cloudinary.uploader.destroy(img.cloudinaryPublicId)
        )
      );
    }

    // Delete from database (cascades to chunks and images)
    await prisma.document.delete({
      where: { id: documentId }
    });

    console.log('[DocumentsService] Document deleted:', documentId);
  }

  /**
   * List user documents
   * @param {string} userId - User ID
   * @param {number} page - Page number
   * @param {number} pageSize - Items per page
   * @returns {Promise<Object>} - Paginated documents
   */
  async listDocuments(userId, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: {
            select: {
              chunks: true,
              images: true
            }
          }
        }
      }),
      prisma.document.count({ where: { userId } })
    ]);

    return {
      documents,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }
}

module.exports = new DocumentsService();