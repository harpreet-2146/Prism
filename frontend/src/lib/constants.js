/**
 * Application Constants
 */

// App info
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'PRISM';
export const APP_TAGLINE =
  import.meta.env.VITE_APP_TAGLINE || 'Intelligent Visual Assistant for SAP Software';

// API
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// File upload
export const MAX_FILE_SIZE_MB = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '50', 10);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ['.pdf'];
export const ACCEPTED_MIME_TYPES = ['application/pdf'];

// Features
export const ENABLE_DOCX_EXPORT =
  import.meta.env.VITE_ENABLE_DOCX_EXPORT === 'true' || true;

// Debug
export const DEBUG = import.meta.env.VITE_DEBUG === 'true' || false;

// Chat
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const STREAMING_ENABLED = true;
export const MAX_CONTEXT_MESSAGES = 10;

// Messages
export const WELCOME_MESSAGE = `Welcome to ${APP_NAME}! 👋

I'm your intelligent assistant for SAP documentation. Here's how I can help:

📄 **Upload SAP Notes PDFs** - I'll analyze the content and extract screenshots
💬 **Ask Questions** - Get step-by-step guides with visual references
📊 **Export Conversations** - Save your guides as PDF or DOCX

**To get started:**
1. Upload a SAP Note PDF using the Documents page
2. Ask me questions about the content
3. I'll provide detailed guides with screenshots from the document

Try asking: *"Show me the configuration steps"* or *"What are the prerequisites?"*`;

// Error messages
export const ERROR_MESSAGES = {
  FILE_TOO_LARGE: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`,
  INVALID_FILE_TYPE: 'Only PDF files are supported',
  UPLOAD_FAILED: 'Failed to upload file. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'Session expired. Please login again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  GENERIC: 'An unexpected error occurred'
};

// Success messages
export const SUCCESS_MESSAGES = {
  FILE_UPLOADED: 'Document uploaded successfully',
  MESSAGE_SENT: 'Message sent',
  CONVERSATION_DELETED: 'Conversation deleted',
  COPIED: 'Copied to clipboard',
  EXPORTED: 'Exported successfully'
};

// Local storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
  THEME: 'theme',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed'
};

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CHAT: '/chat',
  DOCUMENTS: '/documents',
  SETTINGS: '/settings'
};

// Date formats
export const DATE_FORMATS = {
  FULL: 'MMMM d, yyyy h:mm a',
  SHORT: 'MMM d, yyyy',
  TIME: 'h:mm a',
  RELATIVE: 'relative'
};