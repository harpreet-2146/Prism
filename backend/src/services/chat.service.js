// backend/src/services/chat.service.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const config = require('../config');
const { logger } = require('../utils/logger');
const embeddingSearch = require('./vector/embedding-search.service');
const imageExtractor = require('./pdf/image-extractor.service');

const prisma = new PrismaClient();

class ChatService {
  constructor() {
    this.groq = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;
    this.model = config.GROQ_MODEL;
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(conversationId, userId, message) {
    if (!this.groq) {
      throw new Error('GROQ_API_KEY not configured');
    }

    try {
      logger.info('Processing chat message', {
        conversationId,
        userId,
        messageLength: message.length,
        component: 'chat-service'
      });

      // Get conversation
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20 // Last 20 messages for context
          }
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Save user message
      await prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: message
        }
      });

      // Get relevant context from documents
      const { textContext, images, sources } = await this._getRelevantContext(userId, message);

      // Build messages for Groq
      const systemPrompt = this._buildSystemPrompt();
      const contextPrompt = this._buildContextPrompt(textContext, images);
      const conversationHistory = conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: contextPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      // Call Groq API
      logger.info('Calling Groq API', {
        conversationId,
        model: this.model,
        component: 'chat-service'
      });

      const completion = await this.groq.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: config.GROQ_MAX_TOKENS,
        temperature: config.GROQ_TEMPERATURE,
        stream: false
      });

      const assistantMessage = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;

      // Try to parse JSON response (if AI returned structured data)
      let parsedResponse = null;
      try {
        const jsonMatch = assistantMessage.match(/```json\n([\s\S]+?)\n```/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        }
      } catch {
        // Not JSON, use plain text
      }

      // Extract structured fields if available
      const steps = parsedResponse?.steps || null;
      const diagrams = parsedResponse?.diagrams || null;

      // Save assistant message
      const savedMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: assistantMessage,
          sources: sources.length > 0 ? sources : null,
          steps,
          diagrams,
          images: images.length > 0 ? images : null,
          tokensUsed
        }
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          totalMessages: { increment: 2 },
          updatedAt: new Date()
        }
      });

      logger.info('Chat message processed', {
        conversationId,
        tokensUsed,
        hasSteps: Boolean(steps),
        imagesReturned: images.length,
        component: 'chat-service'
      });

      return savedMessage;

    } catch (error) {
      logger.error('Chat message processing failed', {
        conversationId,
        userId,
        error: error.message,
        stack: error.stack,
        component: 'chat-service'
      });
      throw error;
    }
  }

  /**
   * Get relevant context from user's documents (REVISED WITH OCR)
   * @private
   */
  async _getRelevantContext(userId, message) {
    try {
      // Vector search returns chunks from BOTH pdf_text and image_ocr
      const searchResults = await embeddingSearch.search(userId, message, 10);

      if (searchResults.length === 0) {
        return {
          textContext: '',
          images: [],
          sources: []
        };
      }

      // Build text context from all chunks
      const textContext = searchResults
        .map((result, idx) => `[${idx + 1}] ${result.text}`)
        .join('\n\n');

      // Get unique image IDs from chunks that came from image OCR
      const imageIds = [...new Set(
        searchResults
          .filter(r => r.sourceImageId)
          .map(r => r.sourceImageId)
      )];

      // Fetch full image details
      const images = [];
      if (imageIds.length > 0) {
        const imageRecords = await prisma.documentImage.findMany({
          where: { id: { in: imageIds } },
          select: {
            id: true,
            documentId: true,
            pageNumber: true,
            ocrText: true,
            ocrConfidence: true
          },
          take: 10 // Limit to 10 images max
        });

        for (const img of imageRecords) {
          images.push({
            id: img.id,
            url: imageExtractor.getImageUrl(img.documentId, img.pageNumber),
            pageNumber: img.pageNumber,
            documentId: img.documentId,
            ocrText: img.ocrText?.substring(0, 200) + '...',
            ocrConfidence: img.ocrConfidence
          });
        }
      }

      // Build sources array
      const sources = searchResults.map(result => ({
        documentId: result.documentId,
        pageNumber: result.pageNumber,
        sourceType: result.sourceType,
        score: result.score
      }));

      logger.info('Context retrieved', {
        userId,
        chunksFound: searchResults.length,
        imagesFound: images.length,
        pdfTextChunks: searchResults.filter(r => r.sourceType === 'pdf_text').length,
        ocrChunks: searchResults.filter(r => r.sourceType === 'image_ocr').length,
        component: 'chat-service'
      });

      return { textContext, images, sources };

    } catch (error) {
      logger.error('Failed to get relevant context', {
        userId,
        error: error.message,
        component: 'chat-service'
      });
      return {
        textContext: '',
        images: [],
        sources: []
      };
    }
  }

  /**
   * Build system prompt
   * @private
   */
  _buildSystemPrompt() {
    return `You are PRISM, an intelligent SAP assistant. You help users understand SAP processes by providing clear, step-by-step instructions.

When answering:
1. Be concise and practical
2. Reference specific transaction codes (tcodes)
3. If images are available, mention which screenshots to look at
4. Provide step-by-step instructions when appropriate
5. Cite page numbers from source documents

If you don't know the answer, say so clearly. Never make up information about SAP.`;
  }

  /**
   * Build context prompt with available documents and images
   * @private
   */
  _buildContextPrompt(textContext, images) {
    let prompt = '';

    if (textContext) {
      prompt += `DOCUMENT CONTEXT:\n${textContext}\n\n`;
    }

    if (images.length > 0) {
      prompt += `AVAILABLE SCREENSHOTS (from SAP documents):\n`;
      images.forEach((img, idx) => {
        prompt += `[Image ${idx + 1}] Page ${img.pageNumber}\n`;
        prompt += `  OCR Text: ${img.ocrText}\n`;
        prompt += `  Confidence: ${(img.ocrConfidence * 100).toFixed(0)}%\n`;
        prompt += `  URL: ${img.url}\n\n`;
      });
      prompt += `You can reference these images in your response by their number [Image 1], [Image 2], etc.\n\n`;
    }

    if (!textContext && images.length === 0) {
      prompt = `No relevant documents found in the knowledge base. Answer based on general SAP knowledge or ask the user to upload relevant documents.`;
    }

    return prompt;
  }

  /**
   * Create a new conversation
   */
  async createConversation(userId, title = 'New Chat') {
    try {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title
        }
      });

      logger.info('Conversation created', {
        conversationId: conversation.id,
        userId,
        component: 'chat-service'
      });

      return conversation;
    } catch (error) {
      logger.error('Failed to create conversation', {
        userId,
        error: error.message,
        component: 'chat-service'
      });
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(userId) {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return conversations;
    } catch (error) {
      logger.error('Failed to fetch conversations', {
        userId,
        error: error.message,
        component: 'chat-service'
      });
      throw error;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId, userId) {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return conversation;
    } catch (error) {
      logger.error('Failed to fetch conversation', {
        conversationId,
        userId,
        error: error.message,
        component: 'chat-service'
      });
      throw error;
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId, userId) {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      await prisma.conversation.delete({
        where: { id: conversationId }
      });

      logger.info('Conversation deleted', {
        conversationId,
        userId,
        component: 'chat-service'
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete conversation', {
        conversationId,
        userId,
        error: error.message,
        component: 'chat-service'
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      configured: Boolean(this.groq),
      model: this.model,
      status: this.groq ? 'ready' : 'not_configured'
    };
  }
}

module.exports = new ChatService();