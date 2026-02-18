// backend/src/services/auth.service.js
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const config = require('../config');
const { logger } = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

class AuthService {
  // ----------------------------------------------------------------
  // REGISTER
  // ----------------------------------------------------------------

  /**
   * Register a new user.
   *
   * @param {string} email
   * @param {string} password - Plain text (will be hashed)
   * @param {string} fullName
   * @returns {{ user, accessToken, refreshToken }}
   */
  async register(email, password, fullName) {
    try {
      const normalised = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email: normalised } });
      if (existing) {
        throw new Error('An account with this email already exists');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email: normalised,
          passwordHash,
          fullName: fullName?.trim() || null
        }
      });

      const tokens = await this._generateTokens(user.id);

      logger.info('User registered', { userId: user.id, component: 'auth-service' });

      return {
        user: this._safeUser(user),
        ...tokens
      };

    } catch (error) {
      logger.error('Registration failed', {
        error: error.message,
        component: 'auth-service'
      });
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------------

  /**
   * Authenticate user credentials.
   *
   * @param {string} email
   * @param {string} password
   * @returns {{ user, accessToken, refreshToken }}
   */
  async login(email, password) {
    try {
      const normalised = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({ where: { email: normalised } });

      // Use a constant-time comparison path regardless of whether user exists
      // to prevent user enumeration via timing attacks
      const hash = user ? user.passwordHash : '$2a$12$invalidhashtopreventtimingattack';
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid) {
        throw new Error('Invalid email or password');
      }

      const tokens = await this._generateTokens(user.id);

      logger.info('User logged in', { userId: user.id, component: 'auth-service' });

      return {
        user: this._safeUser(user),
        ...tokens
      };

    } catch (error) {
      logger.error('Login failed', {
        error: error.message,
        component: 'auth-service'
      });
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // TOKEN REFRESH
  // ----------------------------------------------------------------

  /**
   * Issue a new access token from a valid refresh token.
   *
   * @param {string} refreshToken
   * @returns {{ accessToken, user }}
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify JWT signature + expiry
      let payload;
      try {
        payload = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET, {
          issuer: 'prism-api',
          audience: 'prism-app'
        });
      } catch (jwtError) {
        throw new Error('Invalid or expired refresh token');
      }

      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Verify it exists in DB (not revoked)
      const record = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      });

      if (!record) {
        throw new Error('Refresh token not found — please log in again');
      }

      if (record.expiresAt < new Date()) {
        await prisma.refreshToken.delete({ where: { token: refreshToken } });
        throw new Error('Refresh token has expired — please log in again');
      }

      // Issue new access token
      const accessToken = jwt.sign(
        { userId: payload.userId, type: 'access' },
        config.JWT_SECRET,
        {
          expiresIn: config.JWT_ACCESS_EXPIRES_IN,
          issuer: 'prism-api',
          audience: 'prism-app'
        }
      );

      logger.info('Access token refreshed', {
        userId: payload.userId,
        component: 'auth-service'
      });

      return { accessToken, user: record.user };

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message,
        component: 'auth-service'
      });
      throw error;
    }
  }

  // ----------------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------------

  /**
   * Revoke a refresh token.
   * Fails silently — logout should always succeed from the user's perspective.
   *
   * @param {string} refreshToken
   */
  async logout(refreshToken) {
    if (!refreshToken) return;

    try {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      logger.info('User logged out', { component: 'auth-service' });
    } catch (error) {
      // Log but don't throw — logout must not fail
      logger.warn('Logout token cleanup failed', {
        error: error.message,
        component: 'auth-service'
      });
    }
  }

  // ----------------------------------------------------------------
  // VERIFY ACCESS TOKEN (used by auth middleware)
  // ----------------------------------------------------------------

  /**
   * Verify an access token and return its payload.
   *
   * @param {string} token
   * @returns {{ userId: string }}
   */
  verifyAccessToken(token) {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'prism-api',
        audience: 'prism-app'
      });

      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return payload;

    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  // ----------------------------------------------------------------
  // UPDATE PROFILE
  // ----------------------------------------------------------------

  /**
   * Update user's full name.
   *
   * @param {string} userId
   * @param {string} fullName
   * @returns {Object} Updated safe user object
   */
  async updateProfile(userId, fullName) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName: fullName?.trim() || null }
    });
    return this._safeUser(user);
  }

  // ----------------------------------------------------------------
  // CHANGE PASSWORD
  // ----------------------------------------------------------------

  /**
   * Change user's password and revoke all refresh tokens.
   *
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect');

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password + revoke all tokens in a transaction
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    logger.info('Password changed', { userId, component: 'auth-service' });
  }

  // ----------------------------------------------------------------
  // DELETE ACCOUNT
  // ----------------------------------------------------------------

  /**
   * Permanently delete a user account (requires password confirmation).
   *
   * @param {string} userId
   * @param {string} password
   */
  async deleteAccount(userId, password) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Password is incorrect');

    // Cascade deletes everything via DB relations
    await prisma.user.delete({ where: { id: userId } });

    logger.info('Account deleted', { userId, component: 'auth-service' });
  }

  // ----------------------------------------------------------------
  // MAINTENANCE
  // ----------------------------------------------------------------

  /**
   * Remove expired refresh tokens from the DB.
   * Call this on a cron or at startup.
   */
  async cleanupExpiredTokens() {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    logger.info('Expired tokens cleaned up', { count, component: 'auth-service' });
    return count;
  }

  // ----------------------------------------------------------------
  // INTERNAL HELPERS
  // ----------------------------------------------------------------

  async _generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      issuer: 'prism-api',
      audience: 'prism-app'
    }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    config.JWT_REFRESH_SECRET,
    {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
      issuer: 'prism-api',
      audience: 'prism-app'
    }
  );

  // 🔍 DEBUG: Log token details
  logger.info('✅ Tokens generated', {
    userId,
    accessTokenLength: accessToken.length,
    refreshTokenLength: refreshToken.length,
    accessTokenPreview: accessToken.substring(0, 50) + '...',
    JWT_SECRET_length: config.JWT_SECRET?.length,
    JWT_REFRESH_SECRET_length: config.JWT_REFRESH_SECRET?.length,
    component: 'auth-service'
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { userId, token: refreshToken, expiresAt }
  });

  return { accessToken, refreshToken };
}

  /** Strip sensitive fields before sending to client */
  _safeUser(user) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt
    };
  }
}

module.exports = new AuthService();