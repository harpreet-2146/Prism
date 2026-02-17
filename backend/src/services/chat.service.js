// backend/src/services/chat.service.js
'use strict';

const prisma = require('../utils/prisma');
const groqService = require('./ai/groq.service');
const embeddingSearch = require('./vector/embedding-search.service');
const { logger } = require('../utils/logger');

class ChatService {
  // ----------------------------------------------------------------
  // CONVERSATIONS
  // ----------------------------------------------------------------

  async createConversation(userId, firstMessage = null) {
    let title = 'New Chat';

    if (firstMessage) {
      try {
        title = await groqService.generateTitle(firstMessage);
      } catch {
        title = firstMessage.slice(0, 50) || 'New Chat';
      }
    }

    const conversation = await prisma.conversation.create({
      data: { userId, title }
    });

    logger.info('Conversation created', {
      conversationId: conversation.id,
      userId,
      component: 'chat-service'
    });

    return conversation;
  }

  async getConversation(conversationId, userId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conversation) throw new Error('Conversation not found');
    return conversation;
  }

  async getUserConversations(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          totalMessages: true,
          documentsUsed: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.conversation.count({ where: { userId } })
    ]);

    return {
      conversations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }

  async deleteConversation(conversationId, userId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conversation) throw new Error('Conversation not found');

    await prisma.conversation.delete({ where: { id: conversationId } });

    logger.info('Conversation deleted', { conversationId, userId, component: 'chat-service' });
  }

  async updateConversationTitle(conversationId, userId, title) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId }
    });

    if (!conversation) throw new Error('Conversation not found');

    return prisma.conversation.update({
      where: { id: conversationId },
      data: { title: title.trim() }
    });
  }

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------

  async getMessages(conversationId, limit = 50, offset = 0) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset
    });
  }

  async saveMessage(conversationId, role, content, extras = {}) {
    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        sources:   extras.sources   || null,
        steps:     extras.steps     || null,
        diagrams:  extras.diagrams  || null,
        images:    extras.images    || null,
        tokensUsed: extras.tokensUsed || null
      }
    });

    // Keep totalMessages count in sync
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        totalMessages: { increment: 1 },
        updatedAt: new Date()
      }
    });

    return message;
  }

  // ----------------------------------------------------------------
  // CONTEXT RETRIEVAL (semantic search over user's documents)
  // ----------------------------------------------------------------

  /**
   * Get the most relevant document chunks for a user's query.
   * Returns empty array gracefully if embeddings aren't available.
   *
   * @param {string} userId
   * @param {string} query
   * @returns {Array} context chunks
   */
  async getRelevantContext(userId, query) {
    try {
      const results = await embeddingSearch.search(userId, query, {
        topK: 5,
        minScore: 0.3
      });

      return results;
    } catch (error) {
      logger.warn('Context retrieval failed, proceeding without context', {
        userId,
        error: error.message,
        component: 'chat-service'
      });
      return [];
    }
  }

  // ----------------------------------------------------------------
  // PREPARE MESSAGES FOR GROQ
  // (strip DB fields, keep only role + content)
  // ----------------------------------------------------------------

  prepareMessagesForLLM(dbMessages, newUserMessage) {
    const history = dbMessages
      .slice(-10) // last 10 messages for context window management
      .map(m => ({ role: m.role, content: m.content }));

    history.push({ role: 'user', content: newUserMessage });

    return history;
  }

  // ----------------------------------------------------------------
  // PARSE AI RESPONSE
  // Groq returns JSON per our system prompt — parse it safely
  // ----------------------------------------------------------------

  parseAIResponse(rawContent) {
    try {
      // Strip markdown code fences if the model added them anyway
      const cleaned = rawContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      return {
        summary: parsed.summary || '',
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        hasDiagram: Boolean(parsed.hasDiagram)
      };
    } catch {
      // If JSON parsing fails, treat the whole response as plain text summary
      return {
        summary: rawContent,
        steps: [],
        sources: [],
        hasDiagram: false
      };
    }
  }
}

module.exports = new ChatService();