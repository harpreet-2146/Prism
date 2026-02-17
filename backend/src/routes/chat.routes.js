// backend/src/routes/chat.routes.js
'use strict';

const express = require('express');
const chatController = require('../controllers/chat.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { validateBody, validateParams, validateQuery, schemas } = require('../middleware/validation.middleware');

const router = express.Router();

// All chat routes require auth
router.use(verifyToken);

// Health
router.get('/health', chatController.healthCheck);

// Streaming chat (SSE)
router.post('/stream',
  validateBody(schemas.chatMessage),
  chatController.streamChat
);

// Non-streaming chat (fallback)
router.post('/message',
  validateBody(schemas.chatMessage),
  chatController.sendMessage
);

// Conversations
router.get('/conversations',
  validateQuery(schemas.pagination),
  chatController.getConversations
);

router.get('/conversations/:id',
  validateParams(schemas.uuidParam),
  chatController.getConversation
);

router.patch('/conversations/:id/title',
  validateParams(schemas.uuidParam),
  validateBody(schemas.updateTitle),
  chatController.updateTitle
);

router.delete('/conversations/:id',
  validateParams(schemas.uuidParam),
  chatController.deleteConversation
);

module.exports = router;