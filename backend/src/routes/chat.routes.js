const express = require('express');
const chatController = require('../controllers/chat.controller');
const { 
  validateSendMessage, 
  validateCreateConversation, 
  validateUpdateConversation,
  validatePagination,
  validateUUIDParam 
} = require('../middleware/validation.middleware');
const { 
  authenticateToken, 
  refreshTokenIfNeeded,
  checkOwnership,
  userRateLimit 
} = require('../middleware/auth.middleware');

const router = express.Router();

// All chat routes require authentication
router.use(authenticateToken);
router.use(refreshTokenIfNeeded);

// Apply rate limiting for chat operations
router.use(userRateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes

// Conversation routes
router.get('/conversations', 
  validatePagination,
  chatController.getConversations
);

router.post('/conversations', 
  validateCreateConversation,
  chatController.createConversation
);

router.get('/conversations/:id', 
  validateUUIDParam,
  checkOwnership('userId'), // Check if user owns the conversation
  chatController.getConversation
);

router.put('/conversations/:id', 
  validateUUIDParam,
  validateUpdateConversation,
  checkOwnership('userId'),
  chatController.updateConversation
);

router.delete('/conversations/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.deleteConversation
);

// Message routes
router.get('/conversations/:id/messages', 
  validateUUIDParam,
  validatePagination,
  checkOwnership('userId'),
  chatController.getMessages
);

router.post('/conversations/:id/messages', 
  validateUUIDParam,
  validateSendMessage,
  checkOwnership('userId'),
  userRateLimit(50, 15 * 60 * 1000), // 50 messages per 15 minutes
  chatController.sendMessage
);

router.put('/messages/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.updateMessage
);

router.delete('/messages/:id', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.deleteMessage
);

// Special message operations
router.post('/messages/:id/regenerate', 
  validateUUIDParam,
  checkOwnership('userId'),
  userRateLimit(20, 15 * 60 * 1000), // 20 regenerations per 15 minutes
  chatController.regenerateResponse
);

router.post('/messages/:id/react', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.reactToMessage
);

// Stream message endpoint (Server-Sent Events)
router.get('/conversations/:id/stream', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.streamMessages
);

// Search conversations and messages
router.get('/search', 
  validatePagination,
  chatController.searchConversations
);

// Get conversation statistics
router.get('/stats', chatController.getStats);

// Export conversation
router.post('/conversations/:id/export', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.exportConversation
);

// Get conversation summary
router.get('/conversations/:id/summary', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.getConversationSummary
);

// Share conversation (generate public link)
router.post('/conversations/:id/share', 
  validateUUIDParam,
  checkOwnership('userId'),
  chatController.shareConversation
);

// Get shared conversation (public route)
router.get('/shared/:shareToken', 
  chatController.getSharedConversation
);

module.exports = router;