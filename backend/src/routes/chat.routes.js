const express = require('express');
const router = express.Router();

// Import middleware
const authModule = require('../middleware/auth.middleware');
const authFlexibleModule = require('../middleware/auth-flexible.middleware');

// Import controllers
const chatController = require('../controllers/chat.controller');
const chatStreamModule = require('../controllers/chat-stream.controller');

// Extract functions
const authMiddleware = authModule.authenticate;
const authFlexible = authFlexibleModule.authFlexible || authFlexibleModule;
const streamChatResponse = chatStreamModule.streamChatResponse;

// Extract chat controller functions (CORRECT NAMES)
const sendMessage = chatController.sendMessage;
const getConversation = chatController.getConversation;
const getUserConversations = chatController.getUserConversations; // ✅ FIXED: was getAllConversations
const deleteConversation = chatController.deleteConversation;

// Verify all functions exist
if (typeof authMiddleware !== 'function') throw new Error('authMiddleware not a function');
if (typeof authFlexible !== 'function') throw new Error('authFlexible not a function');
if (typeof streamChatResponse !== 'function') throw new Error('streamChatResponse not a function');
if (typeof sendMessage !== 'function') throw new Error('sendMessage not a function');
if (typeof getConversation !== 'function') throw new Error('getConversation not a function');
if (typeof getUserConversations !== 'function') throw new Error('getUserConversations not a function');
if (typeof deleteConversation !== 'function') throw new Error('deleteConversation not a function');

console.log('✅ All functions validated');

// SSE streaming route
router.get('/conversations/:id/stream', authFlexible, streamChatResponse);

// Apply auth to remaining routes
router.use(authMiddleware);

// Regular chat routes
router.post('/conversations/:id/messages', sendMessage);
router.get('/conversations/:id', getConversation);
router.get('/conversations', getUserConversations); // ✅ FIXED
router.delete('/conversations/:id', deleteConversation);

module.exports = router;