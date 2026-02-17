// backend/src/controllers/auth.controller.js
'use strict';

const authService = require('../services/auth.service');
const { logger } = require('../utils/logger');

class AuthController {
  register = async (req, res) => {
    try {
      const { email, password, name, fullName } = req.body;
      // Use whichever field the client sent
      const userName = name || fullName || null;
      const result = await authService.register(email, password, userName);
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: result
      });
    } catch (error) {
      logger.warn('Register failed', { error: error.message, component: 'auth-controller' });
      const status = error.message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, error: error.message });
    }
  };

  login = async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      logger.warn('Login failed', { error: error.message, component: 'auth-controller' });
      res.status(401).json({ success: false, error: error.message });
    }
  };

  refresh = async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshAccessToken(refreshToken);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(401).json({ success: false, error: error.message });
    }
  };

  logout = async (req, res) => {
    try {
      // Get refresh token from body if provided — logout works even without it
      const { refreshToken } = req.body || {};
      await authService.logout(refreshToken);

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      // Logout should always succeed from user perspective
      res.json({ success: true, message: 'Logged out' });
    }
  };

  getMe = async (req, res) => {
    // req.user is already set by auth middleware
    res.json({ success: true, data: { user: req.user } });
  };

  updateProfile = async (req, res) => {
    try {
      const { fullName } = req.body;
      const user = await authService.updateProfile(req.user.id, fullName);
      res.json({ success: true, data: { user } });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  changePassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  deleteAccount = async (req, res) => {
    try {
      const { password } = req.body;
      await authService.deleteAccount(req.user.id, password);
      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };
}

module.exports = new AuthController();