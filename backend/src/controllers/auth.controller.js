const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');
const { 
  hashPassword, 
  comparePassword, 
  generateToken,
  verifyToken,
  isValidEmail,
  createResponse,
  generateUUID
} = require('../utils/helpers');
const { generateSecureToken } = require('../utils/encryption');

const prisma = new PrismaClient();

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return next(new AppError('User with this email already exists', 409));
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        fullName: fullName.trim(),
        role: 'USER',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    // Generate tokens
    const accessToken = generateToken({ 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    });

    const refreshToken = generateToken({ 
      userId: user.id, 
      type: 'refresh' 
    }, { 
      expiresIn: config.jwt.refreshExpiresIn,
      secret: config.jwt.refreshSecret 
    });

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        userAgent: req.get('User-Agent') || 'Unknown',
        ipAddress: req.ip
      }
    });

    // Log successful registration
    logger.audit('USER_REGISTERED', user.id, {
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(createResponse(true, {
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.expiresIn
      }
    }, 'Registration successful'));

  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        refreshTokens: {
          where: {
            expiresAt: { gt: new Date() }
          }
        }
      }
    });

    if (!user) {
      logger.security('LOGIN_ATTEMPT_INVALID_EMAIL', {
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return next(new AppError('Invalid email or password', 401));
    }

    if (!user.isActive) {
      logger.security('LOGIN_ATTEMPT_INACTIVE_USER', {
        userId: user.id,
        email: email,
        ip: req.ip
      });
      return next(new AppError('Account is deactivated', 401));
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      logger.security('LOGIN_ATTEMPT_INVALID_PASSWORD', {
        userId: user.id,
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return next(new AppError('Invalid email or password', 401));
    }

    // Generate new tokens
    const accessToken = generateToken({ 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    });

    const refreshToken = generateToken({ 
      userId: user.id, 
      type: 'refresh' 
    }, { 
      expiresIn: config.jwt.refreshExpiresIn,
      secret: config.jwt.refreshSecret 
    });

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        userAgent: req.get('User-Agent') || 'Unknown',
        ipAddress: req.ip
      }
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Remove password from response
    const { password: _, refreshTokens, ...userResponse } = user;

    logger.audit('USER_LOGIN', user.id, {
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(createResponse(true, {
      user: userResponse,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.expiresIn
      }
    }, 'Login successful'));

  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

/**
 * Refresh access token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return next(new AppError('Refresh token is required', 401));
    }

    // Verify refresh token
    const decoded = verifyToken(token, config.jwt.refreshSecret);
    
    if (!decoded.userId || decoded.type !== 'refresh') {
      return next(new AppError('Invalid refresh token', 401));
    }

    // Find refresh token in database
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: token,
        userId: decoded.userId,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true
          }
        }
      }
    });

    if (!storedToken || !storedToken.user.isActive) {
      return next(new AppError('Invalid or expired refresh token', 401));
    }

    // Generate new access token
    const accessToken = generateToken({ 
      userId: storedToken.user.id, 
      email: storedToken.user.email, 
      role: storedToken.user.role 
    });

    logger.audit('TOKEN_REFRESHED', storedToken.user.id, {
      ip: req.ip
    });

    res.json(createResponse(true, {
      accessToken,
      expiresIn: config.jwt.expiresIn
    }, 'Token refreshed successfully'));

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid refresh token', 401));
    }
    logger.error('Token refresh error:', error);
    next(error);
  }
};

/**
 * Logout user
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    
    // Remove refresh token from database
    if (token) {
      await prisma.refreshToken.deleteMany({
        where: {
          token: token,
          userId: req.user.id
        }
      });
    }

    logger.audit('USER_LOGOUT', req.user.id, {
      ip: req.ip
    });

    res.json(createResponse(true, null, 'Logout successful'));

  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

/**
 * Get user profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: true,
            conversations: true
          }
        }
      }
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.json(createResponse(true, user));

  } catch (error) {
    logger.error('Get profile error:', error);
    next(error);
  }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { fullName, email } = req.body;
    const updateData = {};

    if (fullName !== undefined) {
      updateData.fullName = fullName.trim();
    }

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      
      // Check if email is already taken by another user
      if (normalizedEmail !== req.user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        });

        if (existingUser) {
          return next(new AppError('Email is already taken', 409));
        }
        
        updateData.email = normalizedEmail;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return next(new AppError('No valid fields to update', 400));
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
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

    logger.audit('PROFILE_UPDATED', req.user.id, {
      changes: updateData,
      ip: req.ip
    });

    res.json(createResponse(true, updatedUser, 'Profile updated successfully'));

  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
};

/**
 * Change user password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        password: true
      }
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      return next(new AppError('Current password is incorrect', 401));
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    // Revoke all refresh tokens (force re-login on all devices)
    await prisma.refreshToken.deleteMany({
      where: { userId: req.user.id }
    });

    logger.audit('PASSWORD_CHANGED', req.user.id, {
      ip: req.ip
    });

    res.json(createResponse(true, null, 'Password changed successfully'));

  } catch (error) {
    logger.error('Change password error:', error);
    next(error);
  }
};

/**
 * Delete user account
 */
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Start transaction to delete user and all related data
    await prisma.$transaction(async (prisma) => {
      // Delete user's documents (files will be cleaned up by a background job)
      await prisma.document.deleteMany({
        where: { userId }
      });

      // Delete user's conversations and messages
      await prisma.message.deleteMany({
        where: { conversation: { userId } }
      });

      await prisma.conversation.deleteMany({
        where: { userId }
      });

      // Delete user's export jobs
      await prisma.exportJob.deleteMany({
        where: { userId }
      });

      // Delete refresh tokens
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });

      // Finally delete the user
      await prisma.user.delete({
        where: { id: userId }
      });
    });

    logger.audit('ACCOUNT_DELETED', userId, {
      ip: req.ip
    });

    res.json(createResponse(true, null, 'Account deleted successfully'));

  } catch (error) {
    logger.error('Delete account error:', error);
    next(error);
  }
};

/**
 * Get user's active sessions
 */
const getSessions = async (req, res, next) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId: req.user.id,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(createResponse(true, sessions));

  } catch (error) {
    logger.error('Get sessions error:', error);
    next(error);
  }
};

/**
 * Revoke specific session
 */
const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const result = await prisma.refreshToken.deleteMany({
      where: {
        id: sessionId,
        userId: req.user.id
      }
    });

    if (result.count === 0) {
      return next(new AppError('Session not found', 404));
    }

    logger.audit('SESSION_REVOKED', req.user.id, {
      sessionId,
      ip: req.ip
    });

    res.json(createResponse(true, null, 'Session revoked successfully'));

  } catch (error) {
    logger.error('Revoke session error:', error);
    next(error);
  }
};

/**
 * Revoke all other sessions (keep current)
 */
const revokeAllSessions = async (req, res, next) => {
  try {
    const currentToken = req.token;
    
    // Keep only the current session
    const result = await prisma.refreshToken.deleteMany({
      where: {
        userId: req.user.id,
        token: { not: currentToken }
      }
    });

    logger.audit('ALL_SESSIONS_REVOKED', req.user.id, {
      sessionsRevoked: result.count,
      ip: req.ip
    });

    res.json(createResponse(true, { sessionsRevoked: result.count }, 'All other sessions revoked'));

  } catch (error) {
    logger.error('Revoke all sessions error:', error);
    next(error);
  }
};

/**
 * Forgot password (placeholder - would send email in real implementation)
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return next(new AppError('Valid email is required', 400));
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to prevent email enumeration
    if (user) {
      // In real implementation, send password reset email here
      logger.audit('PASSWORD_RESET_REQUESTED', user.id, {
        email: user.email,
        ip: req.ip
      });
    }

    res.json(createResponse(true, null, 'If an account with that email exists, a password reset link has been sent'));

  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

/**
 * Reset password (placeholder - would verify token from email)
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return next(new AppError('Token and new password are required', 400));
    }

    // In real implementation, verify reset token here
    res.json(createResponse(true, null, 'Password reset functionality not implemented'));

  } catch (error) {
    logger.error('Reset password error:', error);
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getSessions,
  revokeSession,
  revokeAllSessions,
  forgotPassword,
  resetPassword
};