// backend/src/config/index.js

'use strict';

require('dotenv').config();

// ================================================================
// HELPERS
// ================================================================

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`\nFATAL: Missing required environment variable: ${name}`);
    console.error('Copy .env.example to .env and fill in all required values.\n');
    process.exit(1);
  }
  return value.trim();
}

function optionalEnv(name, defaultValue = undefined) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return defaultValue;
  return value.trim();
}

function optionalBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return defaultValue;
  const lower = value.trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

function optionalInt(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = parseInt(value.trim(), 10);
  if (isNaN(parsed)) {
    console.warn(`WARNING: Invalid integer for ${name}: "${value}". Using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

function optionalFloat(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = parseFloat(value.trim());
  if (isNaN(parsed)) {
    console.warn(`WARNING: Invalid float for ${name}: "${value}". Using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

// ================================================================
// REQUIRED VARIABLES
// ================================================================

const DATABASE_URL       = requireEnv('DATABASE_URL');
const JWT_SECRET         = requireEnv('JWT_SECRET');
const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');

// ================================================================
// FULL CONFIG OBJECT
// ================================================================

const PORT = optionalInt('PORT', 5000);

const config = {
  // ---- Application ----
  NODE_ENV:     optionalEnv('NODE_ENV', 'development'),
  PORT,
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  BASE_URL:     optionalEnv('BASE_URL', `http://localhost:${PORT}`),

  // ---- Database ----
  DATABASE_URL,

  // ---- JWT / Auth ----
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN:  optionalEnv('JWT_ACCESS_EXPIRES_IN', '1h'),    // Extended from 15m
  JWT_REFRESH_EXPIRES_IN: optionalEnv('JWT_REFRESH_EXPIRES_IN', '30d'),  // Extended from 7d

  // ---- Rate Limiting ----
  RATE_LIMIT_WINDOW_MS:    optionalInt('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX_REQUESTS: optionalInt('RATE_LIMIT_MAX_REQUESTS', 100),

  // ---- Groq LLM ----
  GROQ_API_KEY:     optionalEnv('GROQ_API_KEY'),
  GROQ_MODEL:       optionalEnv('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  GROQ_MAX_TOKENS:  optionalInt('GROQ_MAX_TOKENS', 3000),
  GROQ_TEMPERATURE: optionalFloat('GROQ_TEMPERATURE', 0.7),

  // ---- HuggingFace ----
  HF_TOKEN:                   optionalEnv('HF_TOKEN'),
  HF_EMBEDDING_MODEL:         optionalEnv('HF_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2'),
  HF_IMAGE_MODEL:             optionalEnv('HF_IMAGE_MODEL', 'stabilityai/stable-diffusion-2-1'),
  ENABLE_AI_IMAGE_GENERATION: optionalBool('ENABLE_AI_IMAGE_GENERATION', false),

  // ---- Tavily AI (Web Search) ----
  TAVILY_API_KEY:      optionalEnv('TAVILY_API_KEY'),
  TAVILY_SEARCH_DEPTH: optionalEnv('TAVILY_SEARCH_DEPTH', 'advanced'),
  TAVILY_MAX_RESULTS:  optionalInt('TAVILY_MAX_RESULTS', 3),

  // ---- Python Microservice ----
  PYTHON_SERVICE_URL:     optionalEnv('PYTHON_SERVICE_URL'),
  PYTHON_SERVICE_API_KEY: optionalEnv('PYTHON_SERVICE_API_KEY'),
  PYTHON_SERVICE_TIMEOUT: optionalInt('PYTHON_SERVICE_TIMEOUT', 60000),

  // ---- OCR.space API ----
  OCR_SPACE_API_KEY:  optionalEnv('OCR_SPACE_API_KEY'),
  OCR_SPACE_ENGINE:   optionalInt('OCR_SPACE_ENGINE', 2),
  OCR_SPACE_LANGUAGE: optionalEnv('OCR_SPACE_LANGUAGE', 'eng'),

  // ---- Image Fallbacks ----
  UNSPLASH_ACCESS_KEY: optionalEnv('UNSPLASH_ACCESS_KEY'),
  PEXELS_API_KEY:      optionalEnv('PEXELS_API_KEY'),

  // ---- File Uploads ----
  UPLOAD_DIR:           optionalEnv('UPLOAD_DIR', './uploads'),
  MAX_FILE_SIZE_MB:     optionalInt('MAX_FILE_SIZE_MB', 50),
  ALLOWED_MIME_TYPES:   optionalEnv('ALLOWED_MIME_TYPES', 'application/pdf'),
  MAX_PAGES_TO_EXTRACT: optionalInt('MAX_PAGES_TO_EXTRACT', 500),
  PDF_IMAGE_SCALE:      optionalFloat('PDF_IMAGE_SCALE', 1.5),
  PDF_IMAGE_QUALITY:    optionalInt('PDF_IMAGE_QUALITY', 85),

  // ---- Exports (Puppeteer PDF) ----
  EXPORT_TEMP_DIR:       optionalEnv('EXPORT_TEMP_DIR', './exports'),
  EXPORT_TIMEOUT_MS:     optionalInt('EXPORT_TIMEOUT_MS', 30000),
  EXPORT_MAX_CONCURRENT: optionalInt('EXPORT_MAX_CONCURRENT', 3),

  // ---- Logging ----
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
};

// ================================================================
// FEATURE AVAILABILITY WARNINGS
// ================================================================

const warnings = [];

// Critical features
if (!config.GROQ_API_KEY) {
  warnings.push('GROQ_API_KEY not set — AI chat features will not work');
}
if (!config.HF_TOKEN) {
  warnings.push('HF_TOKEN not set — document embeddings and semantic search will not work');
}
if (!config.OCR_SPACE_API_KEY) {
  warnings.push('OCR_SPACE_API_KEY not set — image text extraction will not work (may reduce search accuracy)');
}

// Optional enhancements
if (!config.TAVILY_API_KEY) {
  warnings.push('TAVILY_API_KEY not set — web search enhancement disabled (chat will still work with PDF only)');
}
if (!config.PYTHON_SERVICE_URL) {
  warnings.push('PYTHON_SERVICE_URL not set — using Node.js processing (Python service recommended for faster batch processing)');
}

// Image features
if (!config.UNSPLASH_ACCESS_KEY && !config.PEXELS_API_KEY) {
  warnings.push('UNSPLASH_ACCESS_KEY and PEXELS_API_KEY not set — image fallbacks disabled');
}
if (config.ENABLE_AI_IMAGE_GENERATION && !config.HF_TOKEN) {
  warnings.push('ENABLE_AI_IMAGE_GENERATION=true but HF_TOKEN not set — AI image generation will fail');
}

if (warnings.length > 0 && config.NODE_ENV !== 'test') {
  console.warn('\n⚠️  PRISM configuration warnings:');
  warnings.forEach(w => console.warn(`   • ${w}`));
  console.warn('');
}

module.exports = config;