// backend/src/utils/validation.js
'use strict';

/**
 * File validation utilities.
 * Validates files by magic bytes (actual file content), NOT just extension.
 * Extension can be spoofed — magic bytes cannot.
 */

// Magic byte signatures for allowed file types
const MAGIC_BYTES = {
  'application/pdf': {
    signatures: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    extensions: ['.pdf']
  }
};

/**
 * Validate a file buffer against its declared MIME type using magic bytes.
 *
 * @param {Buffer} buffer       - File buffer (only first 8 bytes needed)
 * @param {string} mimeType     - Declared MIME type (e.g. 'application/pdf')
 * @param {string} originalName - Original filename for extension check
 * @throws {Error} If file type is not allowed or magic bytes don't match
 */
function validateFileType(buffer, mimeType, originalName) {
  const typeInfo = MAGIC_BYTES[mimeType];

  if (!typeInfo) {
    const allowed = Object.keys(MAGIC_BYTES).join(', ');
    throw new Error(`File type "${mimeType}" not allowed. Allowed: ${allowed}`);
  }

  // Check extension
  const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();
  if (!typeInfo.extensions.includes(ext)) {
    throw new Error(
      `File extension "${ext}" doesn't match type "${mimeType}". Expected: ${typeInfo.extensions.join(', ')}`
    );
  }

  // Check magic bytes
  const isValid = typeInfo.signatures.some(sig =>
    sig.every((byte, i) => buffer[i] === byte)
  );

  if (!isValid) {
    throw new Error(
      `File content doesn't match declared type "${mimeType}". File may be corrupted or misnamed.`
    );
  }
}

/**
 * Validate file size against configured limit.
 *
 * @param {number} sizeBytes   - File size in bytes
 * @param {number} maxMB       - Max allowed size in MB
 * @throws {Error} If file is too large
 */
function validateFileSize(sizeBytes, maxMB) {
  const maxBytes = maxMB * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    throw new Error(`File size ${sizeMB}MB exceeds the maximum allowed size of ${maxMB}MB`);
  }
}

/**
 * Sanitize a filename for safe storage.
 * Removes path traversal characters and limits length.
 *
 * @param {string} filename
 * @returns {string} Sanitised filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // allow only safe chars
    .replace(/\.{2,}/g, '_')           // no double dots
    .slice(0, 255);                    // max filename length
}

module.exports = { validateFileType, validateFileSize, sanitizeFilename };