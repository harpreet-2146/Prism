// backend/src/controllers/chat.controller.js
'use strict';

/**
 * CRIT-05 FIX:
 * Added res.flushHeaders() immediately after setting SSE headers.
 * Without this, Railway's nginx proxy buffers the entire response
 * and the user sees nothing until the AI finishes — defeating streaming.
 *
 * Also added a heartbeat comment every 15s to keep the connection alive
 * through proxies that close idle connections.
 */

const chatService = require('../services/chat.service');
const groqService = require('../services/ai/groq.service');
const embeddingSearch = require('../services/vector/embedding-search.service');
const { logger } = require('../utils/logger');

class ChatController {
  // ----------------------------------------------------------------
  // STREAM CHAT — POST /api/chat/stream
  // ----------------------------------------------------------------

  streamChat = async (req, res) => {
    const { message, conversationId } = req.body;
    const userId = req.user.id;

    // --- SSE Setup (CRIT-05 fix) ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // CRITICAL: flush headers immediately so the client connection opens
    // before we do any async work. Without this, Railway/nginx buffers everything.
    res.flushHeaders();

    // Heartbeat — sends a SSE comment every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    const cleanup = () => clearInterval(heartbeat);
    req.on('close', cleanup);

    const sendEvent = (type, payload) => {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    };

    try {
      // 1. Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await chatService.getConversation(conversationId, userId);
      } else {
        conversation = await chatService.createConversation(userId, message);
      }

      // 2. Save user message
      await chatService.saveMessage(conversation.id, 'user', message);

      // 3. Get conversation history for context
      const history = await chatService.getMessages(conversation.id);

      // 4. Retrieve relevant document context (semantic search)
      const context = await chatService.getRelevantContext(userId, message);

      // 5. Prepare messages array for Groq
      const llmMessages = chatService.prepareMessagesForLLM(history, message);

      // 6. Stream response from Groq
      let fullContent = '';

      for await (const token of groqService.streamResponse(llmMessages, context)) {
        fullContent += token;
        sendEvent('chunk', { content: token });
      }

      // 7. Parse the JSON response from Groq
      const parsed = chatService.parseAIResponse(fullContent);

      // Find this section around line 70-90 and replace:

      // 8. Build sources from context chunks
      const sources = context.map(c => ({
        type: 'document',
        documentId: c.documentId,
        title: c.documentName,
        pageNumber: c.pageNumber
      }));

      // ✅ FIXED: Get actual images instead of hardcoding null
      const images = await chatService.getRelevantImages(context);

      // 9. Save assistant message with structured data
      const savedMessage = await chatService.saveMessage(
        conversation.id,
        'assistant',
        fullContent,
        {
          sources,
          steps: parsed.steps,
          images // ✅ FIXED: Use actual images from PDFs
        }
      );

      // 10. Update conversation with documents used
      if (context.length > 0) {
        const docIds = [...new Set(context.map(c => c.documentId))];
        await require('../utils/prisma').conversation.update({
          where: { id: conversation.id },
          data: { documentsUsed: docIds }
        });
      }

      // 11. Send completion event
      sendEvent('done', {
        messageId: savedMessage.id,
        conversationId: conversation.id,
        parsed,
        sources
      });

    } catch (error) {
      logger.error('Stream chat error', {
        userId,
        error: error.message,
        stack: error.stack,
        component: 'chat-controller'
      });

      sendEvent('error', { message: error.message });

    } finally {
      cleanup();
      res.end();
    }
  };

  // ----------------------------------------------------------------
  // SEND MESSAGE (non-streaming) — POST /api/chat/message
  // ----------------------------------------------------------------

  sendMessage = async (req, res) => {
    const { message, conversationId } = req.body;
    const userId = req.user.id;

    try {
      let conversation;
      if (conversationId) {
        conversation = await chatService.getConversation(conversationId, userId);
      } else {
        conversation = await chatService.createConversation(userId, message);
      }

      await chatService.saveMessage(conversation.id, 'user', message);

      const history = await chatService.getMessages(conversation.id);
      const context = await chatService.getRelevantContext(userId, message);
      const llmMessages = chatService.prepareMessagesForLLM(history, message);

      const { content, tokensUsed } = await groqService.generateResponse(llmMessages, context);
      const parsed = chatService.parseAIResponse(content);

      const sources = context.map(c => ({
        type: 'document',
        documentId: c.documentId,
        title: c.documentName,
        pageNumber: c.pageNumber
      }));

      const savedMessage = await chatService.saveMessage(
        conversation.id,
        'assistant',
        content,
        { sources, steps: parsed.steps, tokensUsed }
      );

      res.json({
        success: true,
        data: {
          message: savedMessage,
          conversationId: conversation.id,
          parsed,
          sources
        }
      });

    } catch (error) {
      logger.error('Send message error', {
        userId,
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // GET CONVERSATIONS — GET /api/chat/conversations
  // ----------------------------------------------------------------

  getConversations = async (req, res) => {
    const userId = req.user.id;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    try {
      const result = await chatService.getUserConversations(userId, page, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get conversations error', { userId, error: error.message, component: 'chat-controller' });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // GET CONVERSATION — GET /api/chat/conversations/:id
  // ----------------------------------------------------------------

  getConversation = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const conversation = await chatService.getConversation(id, userId);
      const messages = await chatService.getMessages(id);

      res.json({ success: true, data: { conversation, messages } });
    } catch (error) {
      logger.error('Get conversation error', { userId, id, error: error.message, component: 'chat-controller' });
      res.status(404).json({ success: false, error: 'Conversation not found' });
    }
  };

  // ----------------------------------------------------------------
  // DELETE CONVERSATION — DELETE /api/chat/conversations/:id
  // ----------------------------------------------------------------

  deleteConversation = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      await chatService.deleteConversation(id, userId);
      res.json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
      logger.error('Delete conversation error', { userId, id, error: error.message, component: 'chat-controller' });
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // UPDATE TITLE — PATCH /api/chat/conversations/:id/title
  // ----------------------------------------------------------------

  updateTitle = async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user.id;

    try {
      const conversation = await chatService.updateConversationTitle(id, userId, title);
      res.json({ success: true, data: conversation });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // ----------------------------------------------------------------
  // HEALTH CHECK — GET /api/chat/health
  // ----------------------------------------------------------------

  healthCheck = async (req, res) => {
    const [groqHealth, searchHealth] = await Promise.all([
      groqService.healthCheck(),
      embeddingSearch.healthCheck()
    ]);

    res.json({
      success: true,
      data: {
        status: groqHealth.status === 'healthy' ? 'healthy' : 'degraded',
        services: { groq: groqHealth, embeddingSearch: searchHealth }
      }
    });
  };
}

module.exports = new ChatController();