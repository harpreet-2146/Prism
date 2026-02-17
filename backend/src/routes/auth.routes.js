const express = require('express');
const authController = require('../controllers/auth.controller');
const { 
  validateRegistration, 
  validateLogin, 
  validateChangePassword 
} = require('../middleware/validation.middleware');
const { 
  authenticateToken, 
  refreshTokenIfNeeded,
  userRateLimit 
} = require('../middleware/auth.middleware');

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', 
  userRateLimit(5, 15 * 60 * 1000), // 5 registration attempts per 15 minutes
  validateRegistration, 
  authController.register
);

router.post('/login', 
  userRateLimit(10, 15 * 60 * 1000), // 10 login attempts per 15 minutes
  validateLogin, 
  authController.login
);

router.post('/refresh', 
  userRateLimit(20, 15 * 60 * 1000), // 20 refresh attempts per 15 minutes
  authController.refreshToken
);

router.post('/forgot-password', 
  userRateLimit(3, 60 * 60 * 1000), // 3 attempts per hour
  authController.forgotPassword
);

router.post('/reset-password', 
  userRateLimit(5, 60 * 60 * 1000), // 5 attempts per hour
  authController.resetPassword
);

// Protected routes (authentication required)
router.use(authenticateToken);
router.use(refreshTokenIfNeeded);

router.post('/logout', authController.logout);

router.get('/profile', authController.getProfile);

router.put('/profile', authController.updateProfile);

router.put('/change-password', 
  validateChangePassword, 
  authController.changePassword
);

router.delete('/account', 
  userRateLimit(2, 24 * 60 * 60 * 1000), // 2 attempts per day
  authController.deleteAccount
);

// Get user's active sessions
router.get('/sessions', authController.getSessions);

// Revoke specific session
router.delete('/sessions/:sessionId', authController.revokeSession);

// Revoke all other sessions (keep current)
router.delete('/sessions', authController.revokeAllSessions);

module.exports = router;