const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

/**
 * Generate a random string of specified length
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate UUID v4
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Hash a password using bcrypt
 */
const hashPassword = async (password) => {
  const bcrypt = require('bcryptjs');
  return await bcrypt.hash(password, config.security.bcryptRounds);
};

/**
 * Compare a password with its hash
 */
const comparePassword = async (password, hash) => {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 */
const generateToken = (payload, options = {}) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: options.expiresIn || config.jwt.expiresIn,
    issuer: 'prism-api',
    audience: 'prism-client',
    ...options
  });
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  const jwt = require('jsonwebtoken');
  return jwt.verify(token, config.jwt.secret, {
    issuer: 'prism-api',
    audience: 'prism-client'
  });
};

/**
 * Sanitize filename for safe file storage
 */
const sanitizeFilename = (filename) => {
  // Remove or replace dangerous characters
  const sanitized = filename
    .replace(/[^\w\-_.]/g, '_')  // Replace non-word chars with underscore
    .replace(/_{2,}/g, '_')      // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '');    // Remove leading/trailing underscores

  // Ensure filename is not empty and has reasonable length
  const name = sanitized || 'unnamed_file';
  return name.length > 255 ? name.substring(0, 255) : name;
};

/**
 * Get file extension from filename
 */
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filename) => {
  const ext = getFileExtension(filename);
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.json': 'application/json'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Format file size in human readable format
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Validate email address
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Extract SAP T-Codes from text
 */
const extractTCodes = (text) => {
  const tcodes = new Set();
  
  // Try each T-Code pattern from config
  config.sap.tcodePatterns.forEach(pattern => {
    const matches = text.match(new RegExp(pattern.source, 'g'));
    if (matches) {
      matches.forEach(match => tcodes.add(match.toUpperCase()));
    }
  });

  return Array.from(tcodes);
};

/**
 * Extract SAP modules from text
 */
const extractSAPModules = (text) => {
  const modules = new Set();
  const upperText = text.toUpperCase();
  
  config.sap.modules.forEach(module => {
    if (upperText.includes(module)) {
      modules.add(module);
    }
  });

  return Array.from(modules);
};

/**
 * Clean and normalize text
 */
const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
    .replace(/\n+/g, '\n')     // Replace multiple newlines with single newline
    .trim();                   // Remove leading/trailing whitespace
};

/**
 * Ensure directory exists
 */
const ensureDirectory = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
};

/**
 * Delete file if exists
 */
const deleteFileIfExists = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // File didn't exist
    }
    throw error;
  }
};

/**
 * Calculate pagination values
 */
const calculatePagination = (page, limit, total) => {
  const currentPage = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset = (currentPage - 1) * pageSize;
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    currentPage,
    pageSize,
    offset,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1
  };
};

/**
 * Create API response format
 */
const createResponse = (success, data = null, message = null, meta = null) => {
  const response = {
    success,
    timestamp: new Date().toISOString()
  };

  if (data !== null) response.data = data;
  if (message !== null) response.message = message;
  if (meta !== null) response.meta = meta;

  return response;
};

/**
 * Sleep/delay function
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

module.exports = {
  generateRandomString,
  generateUUID,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  sanitizeFilename,
  getFileExtension,
  getMimeType,
  formatFileSize,
  isValidEmail,
  isValidPassword,
  extractTCodes,
  extractSAPModules,
  normalizeText,
  ensureDirectory,
  deleteFileIfExists,
  calculatePagination,
  createResponse,
  sleep,
  retryWithBackoff
};