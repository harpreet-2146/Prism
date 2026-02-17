const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { hashPassword, comparePassword, generateToken } = require('../utils/helpers');
const { AppError } = require('../middleware/error.middleware');

const prisma = new PrismaClient();

class AuthService {
  /**
   * Register a new user
   */
  async register(userData) {
    const { email, password, fullName } = userData;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
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
    const tokens = await this.generateTokens(user);

    return {
      user,
      tokens
    };
  }

  /**
   * Authenticate user login
   */
  async login(credentials, sessionInfo = {}) {
    const { email, password } = credentials;
    const { userAgent, ipAddress } = sessionInfo;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user, sessionInfo);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Remove password from response
    const { password: _, ...userResponse } = user;

    return {
      user: userResponse,
      tokens
    };
  }

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user, sessionInfo = {}) {
    const { userAgent = 'Unknown', ipAddress = 'Unknown' } = sessionInfo;

    // Generate access token
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Generate refresh token
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
        userAgent,
        ipAddress
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new AppError('Refresh token is required', 401);
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (!decoded.userId || decoded.type !== 'refresh') {
      throw new AppError('Invalid refresh token', 401);
    }

    // Find refresh token in database
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
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
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Generate new access token
    const accessToken = generateToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role
    });

    return {
      accessToken,
      expiresIn: config.jwt.expiresIn
    };
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(userId, refreshToken = null) {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: {
          token: refreshToken,
          userId
        }
      });
    } else {
      // Logout from all sessions
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });
    }

    return true;
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      // Check if user still exists and is active
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

      if (!user || !user.isActive) {
        throw new AppError('Invalid token or user not found', 401);
      }

      return user;
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Invalid token', 401);
      } else if (error.name === 'TokenExpiredError') {
        throw new AppError('Token has expired', 401);
      }
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    // Revoke all refresh tokens (force re-login on all devices)
    await prisma.refreshToken.deleteMany({
      where: { userId }
    });

    return true;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    const { fullName, email } = updateData;
    const updates = {};

    if (fullName !== undefined) {
      updates.fullName = fullName.trim();
    }

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: userId }
        }
      });

      if (existingUser) {
        throw new AppError('Email is already taken', 409);
      }
      
      updates.email = normalizedEmail;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updates,
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

    return updatedUser;
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId) {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
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

    return sessions;
  }

  /**
   * Revoke user session
   */
  async revokeSession(userId, sessionId) {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        id: sessionId,
        userId
      }
    });

    if (result.count === 0) {
      throw new AppError('Session not found', 404);
    }

    return true;
  }

  /**
   * Revoke all user sessions except current
   */
  async revokeAllOtherSessions(userId, currentRefreshToken) {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: { not: currentRefreshToken }
      }
    });

    return result.count;
  }

  /**
   * Delete user account and all data
   */
  async deleteAccount(userId) {
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

    return true;
  }

  /**
   * Check if user has permission to access resource
   */
  async hasPermission(userId, resource, action) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return false;
    }

    // Admin has all permissions
    if (user.role === 'ADMIN') {
      return true;
    }

    // Define permission matrix
    const permissions = {
      USER: {
        documents: ['read', 'create', 'update', 'delete'],
        conversations: ['read', 'create', 'update', 'delete'],
        exports: ['read', 'create', 'update', 'delete'],
        profile: ['read', 'update']
      }
    };

    const userPermissions = permissions[user.role];
    if (!userPermissions || !userPermissions[resource]) {
      return false;
    }

    return userPermissions[resource].includes(action);
  }

  /**
   * Generate password reset token (placeholder)
   */
  async generatePasswordResetToken(email) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      // Don't reveal if email exists
      return { success: true };
    }

    // In real implementation:
    // 1. Generate secure token
    // 2. Store token with expiration
    // 3. Send email with reset link
    
    logger.info('Password reset requested', { userId: user.id, email });
    
    return { success: true };
  }

  /**
   * Reset password with token (placeholder)
   */
  async resetPasswordWithToken(token, newPassword) {
    // In real implementation:
    // 1. Verify token exists and hasn't expired
    // 2. Get associated user
    // 3. Hash new password
    // 4. Update user password
    // 5. Invalidate token
    // 6. Revoke all refresh tokens

    throw new AppError('Password reset not implemented', 501);
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens() {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    logger.info('Cleaned up expired refresh tokens', { count: result.count });
    return result.count;
  }
}

module.exports = new AuthService();