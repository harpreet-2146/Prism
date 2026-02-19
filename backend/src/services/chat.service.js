// backend/src/services/chat.service.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const config = require('../config');
const { logger } = require('../utils/logger');
const embeddingSearch = require('./vector/embedding-search.service');
const imageExtractor = require('./pdf/image-extractor.service');
const tavilyService = require('./tavily.service'); // 🆕 NEW

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
            take: 20
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

      // 🆕 STEP 1: Get context from PDFs (ALWAYS)
      const { textContext, images, sources } = await this._getRelevantContext(userId, message);

      // 🆕 STEP 2: Decide if web search is needed
      const needsWebSearch = tavilyService.shouldSearchWeb(message);
      let webResults = [];

      if (needsWebSearch) {
        logger.info('Web search triggered for query', {
          message: message.substring(0, 50),
          component: 'chat-service'
        });
        
        // Parse PDF context for web search
        const pdfContext = sources.map(s => ({
          text: s.text || '',
          sapModule: s.sapModule || null
        }));

        webResults = await tavilyService.search(message, pdfContext);
      }

      // 🆕 STEP 3: Build enhanced system prompt
      const systemPrompt = this._buildEnhancedSystemPrompt(webResults.length > 0);
      
      // 🆕 STEP 4: Build combined context
      const contextPrompt = this._buildCombinedContext(textContext, images, webResults);

      // Build messages for Groq
      const previousMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 10
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: contextPrompt },
        ...previousMessages.slice(0, -1).map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      // Call Groq API
      logger.info('Calling Groq API', {
        conversationId,
        model: this.model,
        hasWebResults: webResults.length > 0,
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

      // Save assistant message with metadata
      const savedMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: assistantMessage,
          sources: sources.length > 0 ? sources : null,
          images: images.length > 0 ? JSON.stringify(images) : null,
          tokensUsed,
          // 🆕 Store web search metadata
          metadata: webResults.length > 0 ? {
            webSearchUsed: true,
            webResultsCount: webResults.length,
            webSources: webResults.map(r => ({
              title: r.title,
              url: r.url
            }))
          } : null
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
        webSearchUsed: webResults.length > 0,
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
   * Get relevant context from user's documents
   * @private
   */
  async _getRelevantContext(userId, message) {
    try {
      const searchResults = await embeddingSearch.search(userId, message, 10);

      if (searchResults.length === 0) {
        return {
          textContext: '',
          images: [],
          sources: []
        };
      }

      const textContext = searchResults
        .map((result, idx) =>
          `[${idx + 1}] From "${result.documentName}" (Page ${result.pageNumber}):\n${result.text}`
        )
        .join('\n\n');

      const imageIds = [...new Set(
        searchResults
          .filter(r => r.sourceImageId)
          .map(r => r.sourceImageId)
      )];

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
          take: 10
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

      const sources = searchResults.map(result => ({
        documentId: result.documentId,
        documentName: result.documentName,
        pageNumber: result.pageNumber,
        sourceType: result.sourceType,
        score: result.score,
        text: result.text
      }));

      logger.info('PDF context retrieved', {
        userId,
        chunksFound: searchResults.length,
        imagesFound: images.length,
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
   * 🆕 Build enhanced system prompt (with or without web search)
   * @private
   */
  _buildEnhancedSystemPrompt(hasWebResults) {
    let prompt = `You are PRISM, an expert SAP assistant with access to technical documentation`;
    
    if (hasWebResults) {
      prompt += ` and web search results from SAP community forums and official documentation`;
    }
    
    prompt += `.

RESPONSE STYLE:
- Provide detailed, step-by-step explanations in your own words
- Include brief citations for credibility (e.g., "according to page 14..." or "based on SAP Community discussion...")
- When screenshots are available, reference them naturally within the relevant step
- Balance technical accuracy with clear, practical guidance`;

    if (hasWebResults) {
      prompt += `
- When using web results, clearly distinguish between information from user's documents vs. external sources
- Prioritize official SAP documentation over community forums`;
    }

    prompt += `

FORMAT FOR STEP-BY-STEP INSTRUCTIONS:
1. **Step Name**: Detailed explanation of what to do and why. [Reference: Source]
2. **Next Step**: Clear instructions with context. [Reference: Source]

Always integrate citations naturally without disrupting the flow of explanation.`;

    return prompt;
  }

  /**
   * 🆕 Build combined context from PDF + web results
   * @private
   */
  _buildCombinedContext(textContext, images, webResults) {
    let context = '';

    // Add PDF context
    if (textContext) {
      context += `📄 INFORMATION FROM YOUR UPLOADED DOCUMENTS:\n\n${textContext}\n\n`;
    }

    // Add web results
    if (webResults && webResults.length > 0) {
      context += `🌐 ADDITIONAL INFORMATION FROM SAP COMMUNITY & DOCUMENTATION:\n\n`;
      webResults.forEach((result, idx) => {
        context += `[Web Source ${idx + 1}] ${result.title}\n`;
        context += `${result.snippet}\n`;
        context += `URL: ${result.url}\n\n`;
      });
    }

    // Add image context
    if (images && images.length > 0) {
      context += `📸 AVAILABLE SCREENSHOTS (${images.length}):\n\n`;
      images.forEach((img, idx) => {
        context += `[Image ${idx + 1}] Page ${img.pageNumber}\n`;
        if (img.ocrText) {
          context += `  OCR Text: ${img.ocrText}\n`;
        }
        context += `  URL: ${img.url}\n\n`;
      });
      context += `You can reference these images in your response by their number [Image 1], [Image 2], etc.\n\n`;
    }

    if (!textContext && webResults.length === 0) {
      context = `No relevant documents found in the knowledge base. Answer based on general SAP knowledge or ask the user to upload relevant documents.`;
    }

    return context;
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
      groq: {
        configured: Boolean(this.groq),
        model: this.model
      },
      tavily: tavilyService.healthCheck(),
      status: this.groq ? 'ready' : 'not_configured'
    };
  }
}

module.exports = new ChatService();