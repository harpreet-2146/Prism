// backend/src/utils/helpers.js
'use strict';

/**
 * Miscellaneous utility functions used across the app.
 */

/**
 * Build a standard pagination response object.
 */
function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1
  };
}

/**
 * Sleep for a given number of milliseconds.
 * Use with await in async functions.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely parse a JSON string without throwing.
 * Returns null if parsing fails.
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Truncate a string to a max length, appending '...' if cut.
 */
function truncate(str, maxLength = 100) {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Remove duplicate values from an array.
 */
function unique(arr) {
  return [...new Set(arr)];
}

/**
 * Format bytes to a human-readable string.
 * e.g. 1024 → "1.0 KB"
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a string is a valid UUID v4.
 */
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

module.exports = {
  paginationMeta,
  sleep,
  safeJsonParse,
  truncate,
  unique,
  formatBytes,
  isUUID
};