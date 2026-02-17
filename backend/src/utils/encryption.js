const crypto = require('crypto');
const config = require('../config');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derive key from the configured encryption key
 */
const getKey = () => {
  const key = config.encryption.key;
  if (!key) {
    throw new Error('Encryption key not configured');
  }
  
  // Ensure key is exactly 32 bytes
  if (key.length === 32) {
    return Buffer.from(key, 'utf8');
  } else if (key.length > 32) {
    return Buffer.from(key.slice(0, 32), 'utf8');
  } else {
    // Pad with zeros if key is shorter
    return Buffer.concat([Buffer.from(key, 'utf8'), Buffer.alloc(32 - key.length)]);
  }
};

/**
 * Encrypt text using AES-256-GCM
 */
const encrypt = (text) => {
  try {
    if (!text) {
      throw new Error('Text to encrypt is required');
    }

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(Buffer.from('prism-encryption', 'utf8'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();

    // Combine IV, tag, and encrypted data
    const result = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted
    };

    // Return as base64 encoded JSON string
    return Buffer.from(JSON.stringify(result)).toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt text using AES-256-GCM
 */
const decrypt = (encryptedData) => {
  try {
    if (!encryptedData) {
      throw new Error('Encrypted data is required');
    }

    // Decode base64 and parse JSON
    const combined = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
    
    if (!combined.iv || !combined.tag || !combined.data) {
      throw new Error('Invalid encrypted data format');
    }

    const key = getKey();
    const iv = Buffer.from(combined.iv, 'hex');
    const tag = Buffer.from(combined.tag, 'hex');

    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(Buffer.from('prism-encryption', 'utf8'));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(combined.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
};

/**
 * Hash sensitive data using SHA-256
 */
const hash = (data) => {
  if (!data) {
    throw new Error('Data to hash is required');
  }

  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
};

/**
 * Generate secure random token
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate HMAC for data integrity
 */
const generateHMAC = (data, secret = null) => {
  const key = secret || config.encryption.key;
  if (!key) {
    throw new Error('HMAC secret not configured');
  }

  return crypto
    .createHmac('sha256', key)
    .update(data)
    .digest('hex');
};

/**
 * Verify HMAC
 */
const verifyHMAC = (data, expectedHmac, secret = null) => {
  const actualHmac = generateHMAC(data, secret);
  
  // Use crypto.timingSafeEqual to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  const actualBuffer = Buffer.from(actualHmac, 'hex');
  
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

/**
 * Encrypt file buffer
 */
const encryptBuffer = (buffer) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Input must be a buffer');
    }

    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Return combined buffer: IV (16) + Tag (16) + Encrypted data
    return Buffer.concat([iv, tag, encrypted]);
  } catch (error) {
    throw new Error(`Buffer encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt file buffer
 */
const decryptBuffer = (encryptedBuffer) => {
  try {
    if (!Buffer.isBuffer(encryptedBuffer)) {
      throw new Error('Input must be a buffer');
    }

    if (encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid encrypted buffer length');
    }

    const key = getKey();
    const iv = encryptedBuffer.slice(0, IV_LENGTH);
    const tag = encryptedBuffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedBuffer.slice(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted;
  } catch (error) {
    throw new Error(`Buffer decryption failed: ${error.message}`);
  }
};

/**
 * Create password hash with salt (for user passwords)
 */
const createPasswordHash = async (password) => {
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(config.security.bcryptRounds);
  return await bcrypt.hash(password, salt);
};

/**
 * Verify password against hash
 */
const verifyPassword = async (password, hash) => {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(password, hash);
};

module.exports = {
  encrypt,
  decrypt,
  hash,
  generateSecureToken,
  generateHMAC,
  verifyHMAC,
  encryptBuffer,
  decryptBuffer,
  createPasswordHash,
  verifyPassword
};