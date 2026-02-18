// backend/src/routes/auth.routes.js
'use strict';

const express = require('express');
const router = express.Router();

console.log('  → Loading auth controller...');
const authController = require('../controllers/auth.controller');

console.log('  → Loading auth middleware...');
const { authenticate } = require('../middleware/auth.middleware');

console.log('  → Setting up auth routes...');

// Public routes
router.post('/register', (req, res) => {
  authController.register(req, res);
});

router.post('/login', (req, res) => {
  authController.login(req, res);
});

router.post('/refresh', (req, res) => {
  authController.refresh(req, res);
});

// Protected routes
router.post('/logout', authenticate, (req, res) => {
  authController.logout(req, res);
});

router.get('/me', authenticate, (req, res) => {
  authController.getMe(req, res);  // ← Changed from .me to .getMe
});

router.put('/profile', authenticate, (req, res) => {
  authController.updateProfile(req, res);
});

router.post('/change-password', authenticate, (req, res) => {
  authController.changePassword(req, res);
});

router.delete('/account', authenticate, (req, res) => {
  authController.deleteAccount(req, res);
});

console.log('  → Auth routes configured');

module.exports = router;