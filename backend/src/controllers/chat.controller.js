// backend/src/controllers/chat.controller.js
'use strict';

const chatService = require('../services/chat.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { logger } = require('../utils/logger');

class ChatController {
  /**
   * Create a new conversation
   * POST /api/chat/conversations
   */
  createConversation = async (req, res) => {
    try {
      const userId = req.user.userId; // ✅ Fixed from req.user.id
      const { title } = req.body;

      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: title || 'New Chat',
          totalMessages: 0
        }
      });

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      logger.error('Create conversation failed', {
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create conversation'
      });
    }
  };

  /**
   * Get all conversations for user
   * GET /api/chat/conversations
   */
  getUserConversations = async (req, res) => {
    try {
      const userId = req.user.userId; // ✅ Fixed from req.user.id

      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true }
          }
        }
      });

      res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      logger.error('Get conversations failed', {
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversations'
      });
    }
  };

  /**
   * Get conversation by ID
   * GET /api/chat/conversations/:id
   */
  getConversation = async (req, res) => {
    try {
      const userId = req.user.userId; // ✅ Fixed from req.user.id
      const conversationId = req.params.id;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      logger.error('Get conversation failed', {
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get conversation'
      });
    }
  };

  /**
   * Delete conversation
   * DELETE /api/chat/conversations/:id
   */
  deleteConversation = async (req, res) => {
    try {
      const userId = req.user.userId; // ✅ Fixed from req.user.id
      const conversationId = req.params.id;

      // Verify ownership
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      // Delete (cascades to messages)
      await prisma.conversation.delete({
        where: { id: conversationId }
      });

      res.json({
        success: true,
        message: 'Conversation deleted'
      });
    } catch (error) {
      logger.error('Delete conversation failed', {
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete conversation'
      });
    }
  };

  /**
   * Send message in conversation
   * POST /api/chat/conversations/:id/messages
   */
  sendMessage = async (req, res) => {
    try {
      const userId = req.user.userId; // ✅ Fixed from req.user.id
      const conversationId = req.params.id;
      const { message } = req.body;

      // Verify conversation ownership
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }

      // For now, just save the user message and return a placeholder response
      // TODO: Integrate with chatService when AI features are ready
      const userMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: message
        }
      });

      // Placeholder assistant response
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: 'AI response will be available once GROQ_API_KEY is configured.'
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

      res.json({
        success: true,
        data: {
          userMessage,
          assistantMessage
        }
      });
    } catch (error) {
      logger.error('Send message failed', {
        error: error.message,
        component: 'chat-controller'
      });
      res.status(500).json({
        success: false,
        error: 'Failed to send message'
      });
    }
  };
}

module.exports = new ChatController();