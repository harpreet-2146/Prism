// backend/src/middleware/auth.middleware.js
'use strict';

const prisma = require('../utils/prisma');
const authService = require('../services/auth.service');
const { logger } = require('../utils/logger');
const config = require('../config');  // ← ADD THIS LINE


class AuthMiddleware {
  /**
   * Verify JWT access token from Authorization: Bearer <token>
   * Sets req.user = { id, email, fullName } on success.
   */
  verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header is required',
        code: 'MISSING_AUTH_HEADER'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header must be: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT'
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required',
        code: 'MISSING_TOKEN'
      });
    }

    // 🔍 DEBUG: Log token verification attempt
    logger.info('🔑 Verifying token', {
      tokenLength: token.length,
      tokenPreview: token.substring(0, 50) + '...',
      JWT_SECRET_length: config.JWT_SECRET?.length,
      component: 'auth-middleware'
    });

    // Verify the JWT signature and expiry
    const payload = authService.verifyAccessToken(token);

    // 🔍 DEBUG: Verification succeeded
    logger.info('✅ Token verified', {
      userId: payload.userId,
      component: 'auth-middleware'
    });

    // ... rest of the method
      // Fetch the user from DB to ensure the account still exists
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, fullName: true }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User account not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Attach to request — available in all subsequent middleware and controllers
      req.user = user;
      next();
    }catch(error){
      logger.error('token verification failed',{
        error:error.message,
        errorName:error.name,
        ip:req.ip,
        tokenRecieved:!!req.headers.authorization,
        component:'auth-middleware'
      });
      return res.status(401).json({
        success:false,
        error:'invalid or expired access token',
        code:'INVALID_TOKEN'
      });
    }
  };

  /**
   * Optional auth — sets req.user if token present, but doesn't block if missing.
   * Useful for endpoints that work both authenticated and unauthenticated.
   */
  optionalToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    try {
      const token = authHeader.slice(7).trim();
      const payload = authService.verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, fullName: true }
      });

      req.user = user || null;
    } catch {
      req.user = null;
    }

    next();
  };
}

module.exports = new AuthMiddleware();