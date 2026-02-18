// frontend/src/lib/constants.js

// ================================================================
// APPLICATION CONSTANTS
// ================================================================
export const WELCOME_MESSAGE = "Welcome to PRISM - Your Intelligent SAP Assistant";
export const APP_NAME = 'PRISM';
export const APP_TAGLINE = 'Intelligent Visual Assistant for SAP Software';

// ================================================================
// API CONSTANTS
// ================================================================

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ================================================================
// FILE UPLOAD CONSTANTS
// ================================================================

export const MAX_FILE_SIZE_MB = 50;
export const ALLOWED_FILE_TYPES = ['application/pdf'];
export const ALLOWED_FILE_EXTENSIONS = ['.pdf'];

// ================================================================
// DOCUMENT PROCESSING STAGES
// ================================================================

export const PROCESSING_STAGES = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  EXTRACTING_IMAGES: 'extracting_images',
  OCR_PROCESSING: 'ocr_processing',
  CREATING_EMBEDDINGS: 'creating_embeddings',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const STAGE_LABELS = {
  [PROCESSING_STAGES.PENDING]: 'Pending',
  [PROCESSING_STAGES.UPLOADING]: 'Uploading',
  [PROCESSING_STAGES.EXTRACTING_IMAGES]: 'Extracting Images',
  [PROCESSING_STAGES.OCR_PROCESSING]: 'Running OCR',
  [PROCESSING_STAGES.CREATING_EMBEDDINGS]: 'Creating Embeddings',
  [PROCESSING_STAGES.FINALIZING]: 'Finalizing',
  [PROCESSING_STAGES.COMPLETED]: 'Complete',
  [PROCESSING_STAGES.FAILED]: 'Failed'
};

export const STAGE_DESCRIPTIONS = {
  [PROCESSING_STAGES.PENDING]: 'Waiting to start',
  [PROCESSING_STAGES.UPLOADING]: 'Transferring file to server',
  [PROCESSING_STAGES.EXTRACTING_IMAGES]: 'Rendering PDF pages as images',
  [PROCESSING_STAGES.OCR_PROCESSING]: 'Extracting text from images',
  [PROCESSING_STAGES.CREATING_EMBEDDINGS]: 'Making content searchable',
  [PROCESSING_STAGES.FINALIZING]: 'Almost done',
  [PROCESSING_STAGES.COMPLETED]: 'Document ready',
  [PROCESSING_STAGES.FAILED]: 'Processing failed'
};

// ================================================================
// DOCUMENT STATUS
// ================================================================

export const DOCUMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const EMBEDDING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const OCR_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// ================================================================
// SAP MODULES
// ================================================================

export const SAP_MODULES = [
  { code: 'FI', name: 'Financial Accounting' },
  { code: 'CO', name: 'Controlling' },
  { code: 'MM', name: 'Materials Management' },
  { code: 'SD', name: 'Sales & Distribution' },
  { code: 'PP', name: 'Production Planning' },
  { code: 'QM', name: 'Quality Management' },
  { code: 'PM', name: 'Plant Maintenance' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'PS', name: 'Project System' },
  { code: 'WM', name: 'Warehouse Management' },
  { code: 'LE', name: 'Logistics Execution' },
  { code: 'SM', name: 'Service Management' },
  { code: 'CRM', name: 'Customer Relationship Management' },
  { code: 'SRM', name: 'Supplier Relationship Management' },
  { code: 'BW', name: 'Business Warehouse' },
  { code: 'BI', name: 'Business Intelligence' }
];

// ================================================================
// CHAT CONSTANTS
// ================================================================

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CONVERSATION_TITLE_LENGTH = 100;

// ================================================================
// EXPORT FORMATS
// ================================================================

export const EXPORT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx'
};

// ================================================================
// PAGINATION
// ================================================================

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ================================================================
// DATE FORMATS
// ================================================================

export const DATE_FORMAT = 'MMM d, yyyy';
export const DATETIME_FORMAT = 'MMM d, yyyy HH:mm';
export const TIME_FORMAT = 'HH:mm';

// ================================================================
// LOCAL STORAGE KEYS
// ================================================================

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
  THEME: 'theme'
};

// ================================================================
// ROUTES
// ================================================================

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DOCUMENTS: '/documents',
  DOCUMENT_DETAIL: '/documents/:id',
  CHAT: '/chat',
  CONVERSATION: '/chat/:id',
  PROFILE: '/profile',
  SETTINGS: '/settings'
};

export default {
  APP_NAME,
  APP_TAGLINE,
  API_BASE_URL,
  MAX_FILE_SIZE_MB,
  ALLOWED_FILE_TYPES,
  PROCESSING_STAGES,
  STAGE_LABELS,
  STAGE_DESCRIPTIONS,
  DOCUMENT_STATUS,
  EMBEDDING_STATUS,
  OCR_STATUS,
  SAP_MODULES,
  EXPORT_FORMATS,
  ROUTES,
  STORAGE_KEYS
};