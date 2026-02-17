const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const groqService = require('./ai/groq.service');
const embeddingService = require('./ai/embedding.service');

const prisma = new PrismaClient();

class ChatService {
  /**
   * Process incoming message and generate AI response
   */
  async processMessage({ conversationId, userId, message, context = {} }) {
    const startTime = Date.now();

    try {
      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId,
          userId,
          role: 'user',
          content: message
        }
      });

      // Get conversation history for context
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 10 // Last 10 messages for context
          }
        }
      });

      if (!conversation) {
        throw new AppError('Conversation not found', 404);
      }

      // Build context for AI
      const aiContext = await this.buildAIContext(userId, message, context);

      // Generate AI response
      const aiResponse = await groqService.generateResponse({
        message,
        conversationHistory: conversation.messages.slice(-10), // Recent history
        context: aiContext,
        userId
      });

      // Save AI message
      const aiMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: aiResponse.content,
          metadata: aiResponse.metadata,
          tokenCount: aiResponse.tokenCount,
          processingTime: Date.now() - startTime
        }
      });

      // Update conversation timestamp and title if needed
      await this.updateConversation(conversationId, message, conversation);

      // Generate embeddings for semantic search (async)
      this.generateEmbeddingsAsync(userMessage, aiMessage);

      return {
        userMessage: {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: userMessage.createdAt
        },
        aiMessage: {
          id: aiMessage.id,
          role: aiMessage.role,
          content: aiMessage.content,
          metadata: aiMessage.metadata,
          tokenCount: aiMessage.tokenCount,
          processingTime: aiMessage.processingTime,
          createdAt: aiMessage.createdAt
        }
      };

    } catch (error) {
      logger.error('Process message error:', error);
      throw error;
    }
  }

  /**
   * Build AI context from documents and conversation history
   */
  async buildAIContext(userId, message, context = {}) {
    const aiContext = {
      userDocuments: [],
      relevantContent: [],
      sapMetadata: {
        tcodes: [],
        modules: [],
        errorCodes: []
      }
    };

    try {
      // If specific document IDs provided in context
      if (context.documentIds && context.documentIds.length > 0) {
        const documents = await prisma.document.findMany({
          where: {
            id: { in: context.documentIds },
            userId,
            status: 'COMPLETED'
          },
          include: {
            sapMetadata: true
          },
          take: 5 // Limit for performance
        });

        aiContext.userDocuments = documents.map(doc => ({
          id: doc.id,
          name: doc.originalName,
          summary: doc.summary,
          extractedText: doc.extractedText?.substring(0, 2000), // Limit text length
          sapMetadata: doc.sapMetadata
        }));
      }

      // Search for relevant documents based on message content
      const relevantDocs = await this.findRelevantDocuments(userId, message);
      aiContext.relevantContent = relevantDocs;

      // Aggregate SAP metadata from user's documents
      const sapMetadata = await this.getUserSAPMetadata(userId);
      aiContext.sapMetadata = sapMetadata;

      return aiContext;

    } catch (error) {
      logger.error('Build AI context error:', error);
      return aiContext; // Return empty context on error
    }
  }

  /**
   * Find relevant documents based on message content
   */
  async findRelevantDocuments(userId, message, limit = 3) {
    try {
      // Simple keyword search for now
      const documents = await prisma.document.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          OR: [
            { extractedText: { contains: message, mode: 'insensitive' } },
            { summary: { contains: message, mode: 'insensitive' } },
            { sapMetadata: { tcodes: { hasSome: this.extractTCodesFromMessage(message) } } }
          ]
        },
        include: {
          sapMetadata: true
        },
        take: limit,
        orderBy: { updatedAt: 'desc' }
      });

      return documents.map(doc => ({
        id: doc.id,
        name: doc.originalName,
        relevantText: this.extractRelevantText(doc.extractedText || '', message),
        sapMetadata: doc.sapMetadata
      }));

    } catch (error) {
      logger.error('Find relevant documents error:', error);
      return [];
    }
  }

  /**
   * Extract T-Codes mentioned in message
   */
  extractTCodesFromMessage(message) {
    const tcodePattern = /\b[A-Z]{2,4}\d{0,3}[A-Z]?\b/g;
    return message.match(tcodePattern) || [];
  }

  /**
   * Extract relevant text snippet from document
   */
  extractRelevantText(text, searchTerm, maxLength = 500) {
    if (!text) return '';

    const lowerText = text.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase();
    const index = lowerText.indexOf(lowerSearchTerm);

    if (index === -1) {
      return text.substring(0, maxLength);
    }

    // Extract text around the found term
    const start = Math.max(0, index - 100);
    const end = Math.min(text.length, index + 400);
    
    return '...' + text.substring(start, end) + '...';
  }

  /**
   * Get aggregated SAP metadata for user
   */
  async getUserSAPMetadata(userId) {
    try {
      const metadata = await prisma.sAPMetadata.findMany({
        where: {
          document: { userId }
        },
        select: {
          tcodes: true,
          modules: true,
          errorCodes: true
        }
      });

      const aggregated = {
        tcodes: new Set(),
        modules: new Set(),
        errorCodes: new Set()
      };

      metadata.forEach(m => {
        m.tcodes?.forEach(t => aggregated.tcodes.add(t));
        m.modules?.forEach(mod => aggregated.modules.add(mod));
        m.errorCodes?.forEach(e => aggregated.errorCodes.add(e));
      });

      return {
        tcodes: Array.from(aggregated.tcodes),
        modules: Array.from(aggregated.modules),
        errorCodes: Array.from(aggregated.errorCodes)
      };

    } catch (error) {
      logger.error('Get user SAP metadata error:', error);
      return { tcodes: [], modules: [], errorCodes: [] };
    }
  }

  /**
   * Update conversation title and metadata
   */
  async updateConversation(conversationId, message, conversation) {
    try {
      const updates = { updatedAt: new Date() };

      // Auto-generate title if conversation is new (less than 3 messages)
      if (conversation.messages.length <= 2 && conversation.title === 'New Conversation') {
        updates.title = this.generateConversationTitle(message);
      }

      await prisma.conversation.update({
        where: { id: conversationId },
        data: updates
      });

    } catch (error) {
      logger.error('Update conversation error:', error);
    }
  }

  /**
   * Generate conversation title from first message
   */
  generateConversationTitle(message) {
    // Simple title generation - take first few words
    const words = message.split(' ').slice(0, 6);
    let title = words.join(' ');
    
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }
    
    return title || 'SAP Discussion';
  }

  /**
   * Generate embeddings for messages (async)
   */
  async generateEmbeddingsAsync(userMessage, aiMessage) {
    try {
      // Generate embedding for user message
      const userEmbedding = await embeddingService.generateEmbedding(userMessage.content);
      
      if (userEmbedding) {
        await prisma.vectorEmbedding.create({
          data: {
            messageId: userMessage.id,
            content: userMessage.content,
            embedding: userEmbedding,
            type: 'MESSAGE'
          }
        });
      }

      // Generate embedding for AI response
      const aiEmbedding = await embeddingService.generateEmbedding(aiMessage.content);
      
      if (aiEmbedding) {
        await prisma.vectorEmbedding.create({
          data: {
            messageId: aiMessage.id,
            content: aiMessage.content,
            embedding: aiEmbedding,
            type: 'MESSAGE'
          }
        });
      }

    } catch (error) {
      logger.error('Generate embeddings error:', error);
    }
  }

  /**
   * Regenerate AI response for a message
   */
  async regenerateResponse({ conversationId, messageId, userMessage, userId }) {
    const startTime = Date.now();

    try {
      // Get conversation history
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            where: {
              createdAt: { lt: new Date() } // All messages before now
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        throw new AppError('Conversation not found', 404);
      }

      // Build context
      const aiContext = await this.buildAIContext(userId, userMessage);

      // Generate new AI response
      const aiResponse = await groqService.generateResponse({
        message: userMessage,
        conversationHistory: conversation.messages.slice(-10),
        context: aiContext,
        userId,
        regenerate: true
      });

      // Update existing AI message
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: aiResponse.content,
          metadata: aiResponse.metadata,
          tokenCount: aiResponse.tokenCount,
          processingTime: Date.now() - startTime,
          updatedAt: new Date()
        }
      });

      return {
        id: updatedMessage.id,
        role: updatedMessage.role,
        content: updatedMessage.content,
        metadata: updatedMessage.metadata,
        tokenCount: updatedMessage.tokenCount,
        processingTime: updatedMessage.processingTime,
        createdAt: updatedMessage.createdAt,
        updatedAt: updatedMessage.updatedAt
      };

    } catch (error) {
      logger.error('Regenerate response error:', error);
      throw error;
    }
  }

  /**
   * Generate conversation summary
   */
  async generateSummary(conversation) {
    try {
      if (!conversation.messages || conversation.messages.length === 0) {
        return null;
      }

      // Extract key points from conversation
      const messages = conversation.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-20); // Last 20 messages

      const conversationText = messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      // Generate summary using AI
      const summary = await groqService.generateSummary(conversationText);

      return {
        summary: summary.content,
        messageCount: messages.length,
        topics: this.extractTopics(conversationText),
        keyTCodes: this.extractTCodesFromMessage(conversationText),
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Generate summary error:', error);
      return null;
    }
  }

  /**
   * Extract topics from conversation text
   */
  extractTopics(text) {
    const topics = new Set();
    const topicKeywords = {
      'Financial Accounting': ['fi', 'financial', 'accounting', 'general ledger', 'gl'],
      'Controlling': ['co', 'controlling', 'cost', 'profit center'],
      'Materials Management': ['mm', 'materials', 'procurement', 'purchase'],
      'Sales & Distribution': ['sd', 'sales', 'distribution', 'customer'],
      'Production Planning': ['pp', 'production', 'manufacturing', 'bom'],
      'Human Resources': ['hr', 'personnel', 'payroll', 'employee']
    };

    const lowerText = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.add(topic);
      }
    }

    return Array.from(topics);
  }

  /**
   * Stream message response (for real-time updates)
   */
  async streamMessage(conversationId, userId, message, responseCallback) {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 10
          }
        }
      });

      if (!conversation) {
        throw new AppError('Conversation not found', 404);
      }

      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId,
          userId,
          role: 'user',
          content: message
        }
      });

      // Build context
      const aiContext = await this.buildAIContext(userId, message);

      // Stream AI response
      const aiMessageId = require('crypto').randomUUID();
      let aiContent = '';
      let tokenCount = 0;

      await groqService.streamResponse({
        message,
        conversationHistory: conversation.messages,
        context: aiContext,
        onToken: (token) => {
          aiContent += token;
          tokenCount++;
          responseCallback({
            type: 'token',
            messageId: aiMessageId,
            token,
            content: aiContent
          });
        },
        onComplete: async (finalContent, metadata) => {
          // Save complete AI message
          const aiMessage = await prisma.message.create({
            data: {
              id: aiMessageId,
              conversationId,
              role: 'assistant',
              content: finalContent,
              metadata,
              tokenCount
            }
          });

          responseCallback({
            type: 'complete',
            message: aiMessage
          });
        }
      });

      return { userMessage, aiMessageId };

    } catch (error) {
      logger.error('Stream message error:', error);
      throw error;
    }
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(userId, timeframe = '30d') {
    try {
      const date = new Date();
      if (timeframe === '7d') {
        date.setDate(date.getDate() - 7);
      } else if (timeframe === '30d') {
        date.setDate(date.getDate() - 30);
      } else {
        date.setDate(date.getDate() - 1);
      }

      const stats = await prisma.conversation.aggregate({
        where: {
          userId,
          createdAt: { gte: date }
        },
        _count: { id: true }
      });

      const messageStats = await prisma.message.aggregate({
        where: {
          userId,
          createdAt: { gte: date }
        },
        _count: { id: true },
        _avg: { tokenCount: true }
      });

      return {
        conversationCount: stats._count.id,
        messageCount: messageStats._count.id,
        averageTokens: Math.round(messageStats._avg.tokenCount || 0),
        timeframe
      };

    } catch (error) {
      logger.error('Get conversation analytics error:', error);
      return {
        conversationCount: 0,
        messageCount: 0,
        averageTokens: 0,
        timeframe
      };
    }
  }
}

module.exports = new ChatService();