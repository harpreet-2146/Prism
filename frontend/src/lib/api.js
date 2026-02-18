import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken
        });

        const { accessToken } = response.data;
        localStorage.setItem('accessToken', accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/me'),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken })
};

// Documents API - PRESERVED YOUR WORKING CODE
export const documentsAPI = {
  list: (params) => api.get('/documents', { params }),
  
  upload: (formData, onUploadProgress) => {
    return api.post('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(progress);
        }
      },
      timeout: 300000 // 5 minutes for large files
    });
  },
  
  delete: (documentId) => api.delete(`/documents/${documentId}`),
  getById: (documentId) => api.get(`/documents/${documentId}`),
  getImages: (documentId) => api.get(`/documents/${documentId}/images`)
};

// Conversations API - ADDED getAll() ALIAS FOR ChatContext
export const conversationsAPI = {
  // Primary method for ChatContext
  getAll: (params) => api.get('/chat/conversations', { params }),
  // Kept for backward compatibility
  list: (params) => api.get('/chat/conversations', { params }),
  getById: (conversationId) => api.get(`/chat/conversations/${conversationId}`),
  create: () => api.post('/chat/conversations'),
  delete: (conversationId) => api.delete(`/chat/conversations/${conversationId}`),
  updateTitle: (conversationId, title) => 
    api.patch(`/chat/conversations/${conversationId}/title`, { title })
};

// Chat API - COMPLETELY REWRITTEN FOR PROPER SSE STREAMING
export const chatAPI = {
  /**
   * Send message with Server-Sent Events streaming
   * This properly handles the SSE stream from your backend's /chat/stream endpoint
   * 
   * @param {Object} payload - { message, conversationId }
   * @param {Function} onChunk - Called for each content chunk: (data) => {}
   * @param {Function} onComplete - Called when streaming completes: (data) => {}
   * @param {Function} onError - Called on error: (error) => {}
   */
  streamMessage: async (payload, onChunk, onComplete, onError) => {
    const token = localStorage.getItem('accessToken');
    
    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Split by newlines to handle multiple SSE events
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
          // SSE format: "data: {...}\n"
          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.slice(6); // Remove "data: " prefix
              
              // Skip heartbeat comments (": heartbeat")
              if (!jsonData.trim() || jsonData.startsWith(':')) continue;
              
              const data = JSON.parse(jsonData);
              
              // Handle different event types from backend
              if (data.type === 'chunk' && data.content) {
                onChunk(data);
              } else if (data.type === 'done') {
                onComplete(data);
              } else if (data.type === 'error') {
                onError(new Error(data.message || 'Stream error'));
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line.substring(0, 100), parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream connection error:', error);
      onError(error);
    }
  },

  /**
   * Send message without streaming (fallback)
   * @param {Object} payload - { message, conversationId }
   */
  sendMessage: (payload) => api.post('/chat/message', payload)
};

// Export API - FIXED TO RETURN BLOB FOR FILE DOWNLOADS
export const exportAPI = {
  exportPDF: (conversationId) => 
    api.post('/export/pdf', { conversationId }, { responseType: 'blob' }),
  
  exportDOCX: (conversationId) => 
    api.post('/export/docx', { conversationId }, { responseType: 'blob' }),
  
  download: (filename) => `${API_URL}/export/download/${filename}`
};

export default api;