// frontend/src/lib/api.js

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ================================================================
// AXIOS INSTANCE
// ================================================================

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ================================================================
// REQUEST INTERCEPTOR - Attach access token
// ================================================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ================================================================
// RESPONSE INTERCEPTOR - Handle token refresh
// ================================================================

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        // No refresh token, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ================================================================
// AUTH API
// ================================================================

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
};

// ================================================================
// DOCUMENTS API
// ================================================================

export const documentsAPI = {
  // Upload document with progress tracking
  upload: (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
  },

  // Get all user documents
  getAll: () => api.get('/documents'),

  // Get document by ID
  getById: (id) => api.get(`/documents/${id}`),

  // Delete document
  delete: (id) => api.delete(`/documents/${id}`),

  // Get document processing status with SSE (Server-Sent Events)
  streamStatus: (documentId, onProgress, onComplete, onError) => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_BASE_URL}/documents/${documentId}/status`;

    const eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
          onProgress(data);
        } else if (data.type === 'done') {
          onComplete(data);
          eventSource.close();
        } else if (data.type === 'error') {
          onError(data);
          eventSource.close();
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      onError({ error: 'Connection lost' });
      eventSource.close();
    };

    return eventSource; // Return for manual cleanup if needed
  },

  // Get image URL
  getImageUrl: (documentId, pageNumber) => {
    const paddedPage = String(pageNumber).padStart(4, '0');
    return `${API_BASE_URL}/documents/${documentId}/images/page_${paddedPage}.jpg`;
  },
};

// ================================================================
// CHAT API
// ================================================================

export const chatAPI = {
  // Create new conversation
  create: (title) => api.post('/chat/conversations', { title }),

  // Get all conversations
  getAll: () => api.get('/chat/conversations'),

  // Get conversation by ID
  getById: (id) => api.get(`/chat/conversations/${id}`),

  // Delete conversation
  delete: (id) => api.delete(`/chat/conversations/${id}`),

  // Send message
  sendMessage: (conversationId, message) =>
    api.post(`/chat/conversations/${conversationId}/messages`, { message }),

  // ✅ FIXED: Stream message with SSE using GET + query params
  streamMessage: (conversationId, message, onChunk, onComplete, onError) => {
    const token = localStorage.getItem('accessToken');
    
    if (!token) {
      onError({ error: 'Not authenticated' });
      return null;
    }
    
    // ✅ FIX: Handle null/undefined conversationId for new chats
    const chatId = conversationId || 'new';
    
    // ✅ FIX: Send message and token as query parameters (EventSource limitation)
    const encodedMessage = encodeURIComponent(message);
    const encodedToken = encodeURIComponent(token);
    const url = `${API_BASE_URL}/chat/conversations/${chatId}/stream?message=${encodedMessage}&token=${encodedToken}`;

    console.log('🌐 Opening SSE stream:', { conversationId: chatId });

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📩 SSE event received:', data.type);

        if (data.type === 'token') {
          onChunk(data);
        } else if (data.type === 'done') {
          console.log('✅ SSE stream complete:', data);
          onComplete(data);
          eventSource.close();
        } else if (data.type === 'error') {
          console.error('❌ SSE error:', data);
          onError(data);
          eventSource.close();
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      onError({ error: 'Connection lost' });
      eventSource.close();
    };

    return eventSource;
  },
};

// ================================================================
// EXPORT API
// ================================================================

export const exportAPI = {
  // Export chat as PDF
  exportPDF: (conversationId) =>
    api.get(`/export/conversation/${conversationId}/pdf`, {
      responseType: 'blob',
    }),

  // Export chat as DOCX
  exportDOCX: (conversationId) =>
    api.get(`/export/conversation/${conversationId}/docx`, {
      responseType: 'blob',
    }),
};

export const conversationsAPI = chatAPI; 

export default api;