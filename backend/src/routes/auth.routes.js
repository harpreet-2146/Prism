// backend/src/routes/auth.routes.js
'use strict';

const express = require('express');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { validateBody, schemas } = require('../middleware/validation.middleware');
const { auth: authRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();

// Public routes (no auth required)
router.post('/register',
  authRateLimit,
  validateBody(schemas.register),
  authController.register
);

router.post('/login',
  authRateLimit,
  validateBody(schemas.login),
  authController.login
);

router.post('/refresh',
  validateBody(schemas.refreshToken),
  authController.refresh
);

// Protected routes
router.post('/logout',           verifyToken, authController.logout);
router.get('/me',                verifyToken, authController.getMe);
router.patch('/profile',         verifyToken, validateBody(schemas.updateProfile),  authController.updateProfile);
router.post('/change-password',  verifyToken, validateBody(schemas.changePassword), authController.changePassword);
router.delete('/account',        verifyToken, validateBody(schemas.deleteAccount),  authController.deleteAccount);

module.exports = router;