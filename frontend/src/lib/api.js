import axios from 'axios';

// Get API URL from environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - Add auth token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        // Try to refresh the token
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken
        });

        // Save new tokens
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
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

// ================================================================
// AUTHENTICATION
// ================================================================
export const authAPI = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  refresh: refreshToken => api.post('/auth/refresh', { refreshToken }),
  getProfile: () => api.get('/auth/profile')
};

// ================================================================
// CONVERSATIONS
// ================================================================
export const conversationsAPI = {
  getAll: () => api.get('/conversations'),
  getById: id => api.get(`/conversations/${id}`),
  create: data => api.post('/conversations', data),
  update: (id, data) => api.put(`/conversations/${id}`, data),
  delete: id => api.delete(`/conversations/${id}`),
  getMessages: id => api.get(`/conversations/${id}/messages`)
};

// ================================================================
// CHAT (Streaming)
// ================================================================
export const chatAPI = {
  // Regular chat request
  sendMessage: data => api.post('/chat', data),

  // Streaming chat with Server-Sent Events
  streamMessage: async (data, onChunk, onComplete, onError) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(data)
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

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete?.();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              onChunk?.(parsed);
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }

      onComplete?.();
    } catch (error) {
      onError?.(error);
    }
  }
};

// ================================================================
// DOCUMENTS
// ================================================================
export const documentsAPI = {
  getAll: () => api.get('/documents'),
  getById: id => api.get(`/documents/${id}`),
  upload: formData =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  delete: id => api.delete(`/documents/${id}`),
  getPreview: id => api.get(`/documents/${id}/preview`)
};

// ================================================================
// EXPORT
// ================================================================
export const exportAPI = {
  exportToPDF: conversationId =>
    api.get(`/export/pdf/${conversationId}`, {
      responseType: 'blob'
    }),
  exportToDOCX: conversationId =>
    api.get(`/export/docx/${conversationId}`, {
      responseType: 'blob'
    })
};

export default api;