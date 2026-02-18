// backend/src/routes/chat.routes.js
'use strict';

const express = require('express');
const router = express.Router();

console.log('  → Loading chat controller...');
const chatController = require('../controllers/chat.controller');

console.log('  → Loading auth middleware...');
const { authenticate } = require('../middleware/auth.middleware');

console.log('  → Setting up chat routes...');

// Create conversation
router.post('/conversations', authenticate, (req, res) => {
  chatController.createConversation(req, res);
});

// Get all conversations
router.get('/conversations', authenticate, (req, res) => {
  chatController.getUserConversations(req, res);
});

// Get conversation by ID
router.get('/conversations/:id', authenticate, (req, res) => {
  chatController.getConversation(req, res);
});

// Delete conversation
router.delete('/conversations/:id', authenticate, (req, res) => {
  chatController.deleteConversation(req, res);
});

// Send message
router.post('/conversations/:id/messages', authenticate, (req, res) => {
  chatController.sendMessage(req, res);
});

console.log('  → Chat routes configured');

module.exports = router;