const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('./error.middleware');

const prisma = new PrismaClient();

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return next(new AppError('Access token is required', 401));
    }

    // Verify the token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated', 401));
    }

    // Add user to request object
    req.user = user;
    req.token = token;

    // Log successful authentication
    logger.audit('USER_AUTHENTICATED', user.id, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      route: req.originalUrl
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    } else if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired', 401));
    } else {
      logger.error('Authentication error:', error);
      return next(new AppError('Authentication failed', 401));
    }
  }
};

/**
 * Middleware to check if user has required role
 */
const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const userRole = req.user.role;
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    if (!roles.includes(userRole)) {
      logger.security('UNAUTHORIZED_ACCESS_ATTEMPT', {
        userId: req.user.id,
        userRole: userRole,
        requiredRoles: roles,
        route: req.originalUrl,
        ip: req.ip
      });

      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

/**
 * Middleware for optional authentication (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // Continue without authentication
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (user && user.isActive) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just continue without user
    next();
  }
};

/**
 * Middleware to refresh JWT token if it's about to expire
 */
const refreshTokenIfNeeded = async (req, res, next) => {
  try {
    if (!req.user || !req.token) {
      return next();
    }

    const decoded = jwt.decode(req.token);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - currentTime;

    // Refresh if token expires in less than 1 hour
    if (timeUntilExpiry < 3600) {
      const newToken = jwt.sign(
        { 
          userId: req.user.id,
          email: req.user.email,
          role: req.user.role 
        },
        config.jwt.secret,
        { 
          expiresIn: config.jwt.expiresIn,
          issuer: 'prism-api',
          audience: 'prism-client'
        }
      );

      // Add new token to response headers
      res.set('X-New-Token', newToken);
    }

    next();
  } catch (error) {
    // Don't fail the request if token refresh fails
    logger.warn('Token refresh failed:', error);
    next();
  }
};

/**
 * Middleware to check if user owns the resource
 */
const checkOwnership = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Extract resource ID from params, body, or query
    const resourceUserId = req.body[resourceUserIdField] || 
                          req.params[resourceUserIdField] || 
                          req.query[resourceUserIdField];

    // Admin users can access any resource
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Check if user owns the resource
    if (!resourceUserId || resourceUserId !== req.user.id) {
      logger.security('UNAUTHORIZED_RESOURCE_ACCESS', {
        userId: req.user.id,
        attemptedResourceUserId: resourceUserId,
        route: req.originalUrl,
        ip: req.ip
      });

      return next(new AppError('You can only access your own resources', 403));
    }

    next();
  };
};

/**
 * Rate limiting per user
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const [id, requests] of userRequests.entries()) {
      const filteredRequests = requests.filter(time => time > windowStart);
      if (filteredRequests.length === 0) {
        userRequests.delete(id);
      } else {
        userRequests.set(id, filteredRequests);
      }
    }

    // Get user's requests in current window
    const userRequestTimes = userRequests.get(userId) || [];
    const recentRequests = userRequestTimes.filter(time => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      logger.security('RATE_LIMIT_EXCEEDED', {
        userId: userId,
        requestCount: recentRequests.length,
        maxRequests: maxRequests,
        windowMs: windowMs,
        ip: req.ip
      });

      return next(new AppError('Too many requests. Please try again later.', 429));
    }

    // Add current request
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
  refreshTokenIfNeeded,
  checkOwnership,
  userRateLimit
};