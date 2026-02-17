const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { createResponse, calculatePagination } = require('../utils/helpers');
const chatService = require('../services/chat.service');
const exportService = require('../services/export.service');

const prisma = new PrismaClient();

/**
 * Get user conversations with pagination
 */
const getConversations = async (req, res, next) => {
  try {
    const { page, limit, search, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;
    const userId = req.user.id;

    // Build where clause
    const where = {
      userId,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { messages: { some: { content: { contains: search, mode: 'insensitive' } } } }
        ]
      })
    };

    // Get total count
    const total = await prisma.conversation.count({ where });

    // Calculate pagination
    const pagination = calculatePagination(page, limit, total);

    // Get conversations
    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            createdAt: true
          }
        }
      },
      orderBy: { [sortBy]: sortOrder },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    // Transform response
    const transformedConversations = conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      messageCount: conv._count.messages,
      lastMessage: conv.messages[0] || null,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    }));

    res.json(createResponse(true, transformedConversations, null, {
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }));

  } catch (error) {
    logger.error('Get conversations error:', error);
    next(error);
  }
};

/**
 * Create new conversation
 */
const createConversation = async (req, res, next) => {
  try {
    const { title } = req.body;
    const userId = req.user.id;

    const conversation = await prisma.conversation.create({
      data: {
        title: title || 'New Conversation',
        userId
      },
      include: {
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    logger.audit('CONVERSATION_CREATED', userId, {
      conversationId: conversation.id,
      title: conversation.title
    });

    res.status(201).json(createResponse(true, {
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation._count.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }, 'Conversation created successfully'));

  } catch (error) {
    logger.error('Create conversation error:', error);
    next(error);
  }
};

/**
 * Get specific conversation with messages
 */
const getConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            images: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    res.json(createResponse(true, {
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation._count.messages,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }));

  } catch (error) {
    logger.error('Get conversation error:', error);
    next(error);
  }
};

/**
 * Update conversation
 */
const updateConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id },
      data: { title },
      include: {
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    logger.audit('CONVERSATION_UPDATED', userId, {
      conversationId: id,
      oldTitle: conversation.title,
      newTitle: title
    });

    res.json(createResponse(true, {
      id: updatedConversation.id,
      title: updatedConversation.title,
      messageCount: updatedConversation._count.messages,
      createdAt: updatedConversation.createdAt,
      updatedAt: updatedConversation.updatedAt
    }, 'Conversation updated successfully'));

  } catch (error) {
    logger.error('Update conversation error:', error);
    next(error);
  }
};

/**
 * Delete conversation
 */
const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Delete in transaction to maintain consistency
    await prisma.$transaction(async (prisma) => {
      // Delete associated images
      await prisma.messageImage.deleteMany({
        where: {
          message: {
            conversationId: id
          }
        }
      });

      // Delete messages
      await prisma.message.deleteMany({
        where: { conversationId: id }
      });

      // Delete conversation
      await prisma.conversation.delete({
        where: { id }
      });
    });

    logger.audit('CONVERSATION_DELETED', userId, {
      conversationId: id,
      title: conversation.title
    });

    res.json(createResponse(true, null, 'Conversation deleted successfully'));

  } catch (error) {
    logger.error('Delete conversation error:', error);
    next(error);
  }
};

/**
 * Get messages from conversation
 */
const getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Get total message count
    const total = await prisma.message.count({
      where: { conversationId: id }
    });

    const pagination = calculatePagination(page, limit, total);

    // Get messages with images
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: {
        images: true
      },
      orderBy: { createdAt: 'asc' },
      skip: pagination.offset,
      take: pagination.pageSize
    });

    res.json(createResponse(true, messages, null, {
      pagination: {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalItems: total,
        itemsPerPage: pagination.pageSize,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev
      }
    }));

  } catch (error) {
    logger.error('Get messages error:', error);
    next(error);
  }
};

/**
 * Send message and get AI response
 */
const sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, context } = req.body;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Use chat service to handle message processing
    const result = await chatService.processMessage({
      conversationId: id,
      userId,
      message,
      context
    });

    logger.audit('MESSAGE_SENT', userId, {
      conversationId: id,
      messageLength: message.length,
      hasContext: !!context
    });

    res.json(createResponse(true, result, 'Message sent successfully'));

  } catch (error) {
    logger.error('Send message error:', error);
    next(error);
  }
};

/**
 * Update message
 */
const updateMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    // Find message and verify ownership
    const message = await prisma.message.findFirst({
      where: {
        id,
        conversation: {
          userId
        }
      }
    });

    if (!message) {
      return next(new AppError('Message not found', 404));
    }

    // Only allow editing user messages
    if (message.role !== 'user') {
      return next(new AppError('Cannot edit AI messages', 403));
    }

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: { content },
      include: {
        images: true
      }
    });

    logger.audit('MESSAGE_UPDATED', userId, {
      messageId: id,
      conversationId: message.conversationId
    });

    res.json(createResponse(true, updatedMessage, 'Message updated successfully'));

  } catch (error) {
    logger.error('Update message error:', error);
    next(error);
  }
};

/**
 * Delete message
 */
const deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find message and verify ownership
    const message = await prisma.message.findFirst({
      where: {
        id,
        conversation: {
          userId
        }
      }
    });

    if (!message) {
      return next(new AppError('Message not found', 404));
    }

    // Delete message and associated images
    await prisma.$transaction(async (prisma) => {
      await prisma.messageImage.deleteMany({
        where: { messageId: id }
      });

      await prisma.message.delete({
        where: { id }
      });
    });

    logger.audit('MESSAGE_DELETED', userId, {
      messageId: id,
      conversationId: message.conversationId
    });

    res.json(createResponse(true, null, 'Message deleted successfully'));

  } catch (error) {
    logger.error('Delete message error:', error);
    next(error);
  }
};

/**
 * Regenerate AI response
 */
const regenerateResponse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the AI message to regenerate
    const aiMessage = await prisma.message.findFirst({
      where: {
        id,
        role: 'assistant',
        conversation: {
          userId
        }
      },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' }
            }
          }
        }
      }
    });

    if (!aiMessage) {
      return next(new AppError('AI message not found', 404));
    }

    // Get the user message that triggered this AI response
    const messageIndex = aiMessage.conversation.messages.findIndex(msg => msg.id === id);
    const userMessage = aiMessage.conversation.messages[messageIndex - 1];

    if (!userMessage || userMessage.role !== 'user') {
      return next(new AppError('Cannot find associated user message', 400));
    }

    // Regenerate response using chat service
    const result = await chatService.regenerateResponse({
      conversationId: aiMessage.conversationId,
      messageId: id,
      userMessage: userMessage.content,
      userId
    });

    logger.audit('RESPONSE_REGENERATED', userId, {
      messageId: id,
      conversationId: aiMessage.conversationId
    });

    res.json(createResponse(true, result, 'Response regenerated successfully'));

  } catch (error) {
    logger.error('Regenerate response error:', error);
    next(error);
  }
};

/**
 * React to message (like/dislike)
 */
const reactToMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reaction } = req.body; // 'like', 'dislike', or null to remove
    const userId = req.user.id;

    // Verify message exists and user has access
    const message = await prisma.message.findFirst({
      where: {
        id,
        conversation: {
          userId
        }
      }
    });

    if (!message) {
      return next(new AppError('Message not found', 404));
    }

    // Update or create reaction
    if (reaction) {
      await prisma.messageReaction.upsert({
        where: {
          messageId_userId: {
            messageId: id,
            userId
          }
        },
        update: { reaction },
        create: {
          messageId: id,
          userId,
          reaction
        }
      });
    } else {
      // Remove reaction
      await prisma.messageReaction.deleteMany({
        where: {
          messageId: id,
          userId
        }
      });
    }

    logger.audit('MESSAGE_REACTION', userId, {
      messageId: id,
      reaction
    });

    res.json(createResponse(true, { reaction }, 'Reaction updated successfully'));

  } catch (error) {
    logger.error('React to message error:', error);
    next(error);
  }
};

/**
 * Stream messages (Server-Sent Events)
 */
const streamMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: id })}\n\n`);

    // Set up cleanup on client disconnect
    const cleanup = () => {
      res.end();
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });

  } catch (error) {
    logger.error('Stream messages error:', error);
    next(error);
  }
};

/**
 * Search conversations and messages
 */
const searchConversations = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const userId = req.user.id;

    if (!search || search.trim().length < 2) {
      return next(new AppError('Search query must be at least 2 characters', 400));
    }

    const searchTerm = search.trim();

    // Search in conversations and messages
    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { messages: { some: { content: { contains: searchTerm, mode: 'insensitive' } } } }
        ]
      },
      include: {
        _count: {
          select: { messages: true }
        },
        messages: {
          where: {
            content: { contains: searchTerm, mode: 'insensitive' }
          },
          take: 3,
          select: {
            id: true,
            content: true,
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit) || 20
    });

    res.json(createResponse(true, conversations));

  } catch (error) {
    logger.error('Search conversations error:', error);
    next(error);
  }
};

/**
 * Get conversation statistics
 */
const getStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const stats = await Promise.all([
      prisma.conversation.count({ where: { userId } }),
      prisma.message.count({ where: { conversation: { userId } } }),
      prisma.message.count({ where: { conversation: { userId }, role: 'user' } }),
      prisma.message.count({ where: { conversation: { userId }, role: 'assistant' } })
    ]);

    const [totalConversations, totalMessages, userMessages, assistantMessages] = stats;

    res.json(createResponse(true, {
      totalConversations,
      totalMessages,
      userMessages,
      assistantMessages,
      averageMessagesPerConversation: totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0
    }));

  } catch (error) {
    logger.error('Get stats error:', error);
    next(error);
  }
};

/**
 * Export conversation
 */
const exportConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { format = 'pdf', options = {} } = req.body;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Create export job
    const exportJob = await exportService.createExport({
      type: 'conversation',
      format,
      itemIds: [id],
      userId,
      options
    });

    res.json(createResponse(true, exportJob, 'Export job created successfully'));

  } catch (error) {
    logger.error('Export conversation error:', error);
    next(error);
  }
};

/**
 * Get conversation summary
 */
const getConversationSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Generate summary using chat service
    const summary = await chatService.generateSummary(conversation);

    res.json(createResponse(true, summary));

  } catch (error) {
    logger.error('Get conversation summary error:', error);
    next(error);
  }
};

/**
 * Share conversation (generate public link)
 */
const shareConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId }
    });

    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }

    // Generate share token (placeholder implementation)
    const shareToken = require('crypto').randomBytes(32).toString('hex');

    // In real implementation, store share token in database
    // For now, just return the token
    const shareUrl = `${req.protocol}://${req.get('host')}/api/chat/shared/${shareToken}`;

    logger.audit('CONVERSATION_SHARED', userId, {
      conversationId: id,
      shareToken
    });

    res.json(createResponse(true, { shareUrl, shareToken }, 'Conversation shared successfully'));

  } catch (error) {
    logger.error('Share conversation error:', error);
    next(error);
  }
};

/**
 * Get shared conversation (public access)
 */
const getSharedConversation = async (req, res, next) => {
  try {
    const { shareToken } = req.params;

    // In real implementation, look up conversation by share token
    // For now, return placeholder
    res.json(createResponse(false, null, 'Shared conversations not fully implemented'));

  } catch (error) {
    logger.error('Get shared conversation error:', error);
    next(error);
  }
};

module.exports = {
  getConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  regenerateResponse,
  reactToMessage,
  streamMessages,
  searchConversations,
  getStats,
  exportConversation,
  getConversationSummary,
  shareConversation,
  getSharedConversation
};