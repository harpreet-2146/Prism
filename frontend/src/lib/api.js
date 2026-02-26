// frontend/src/lib/api.js
// Fixed: streamMessage chatId always extracted as string (prevents [object Object] in URL)

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  error => Promise.reject(error)
);

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }
      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  logout: refreshToken => api.post('/auth/logout', { refreshToken }),
  refresh: refreshToken => api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
};

export const documentsAPI = {
  upload: (file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  getAll: () => api.get('/documents'),
  getById: id => api.get(`/documents/${id}`),
  delete: id => api.delete(`/documents/${id}`),
};

export const chatAPI = {
  create: title => api.post('/chat/conversations', { title }),
  getAll: () => api.get('/chat/conversations'),
  getById: id => api.get(`/chat/conversations/${id}`),
  delete: id => api.delete(`/chat/conversations/${id}`),
  sendMessage: (conversationId, message) =>
    api.post(`/chat/conversations/${conversationId}/messages`, { message }),

  streamMessage: (conversationId, message, onChunk, onComplete, onError) => {
    const token = localStorage.getItem('accessToken');
    if (!token) { onError({ error: 'Not authenticated' }); return null; }

    // ── FIX: always resolve to a plain string ID, never pass objects ──────
    let chatId = 'new';
    if (conversationId) {
      // Handle both string IDs and accidental object refs like { id: '...' }
      chatId = typeof conversationId === 'object'
        ? (conversationId?.id || 'new')
        : String(conversationId);
    }

    const url = `${API_BASE_URL}/chat/conversations/${chatId}/stream?message=${encodeURIComponent(message)}&token=${encodeURIComponent(token)}`;
    console.log('🌐 SSE stream → conversationId:', chatId);

    const eventSource = new EventSource(url);

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'token') onChunk(data);
        else if (data.type === 'done') { onComplete(data); eventSource.close(); }
        else if (data.type === 'error') { onError(data); eventSource.close(); }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = error => {
      console.error('SSE connection error:', error);
      onError({ error: 'Connection lost' });
      eventSource.close();
    };

    return eventSource;
  },
};

export const exportAPI = {
  exportPDF: conversationId =>
    api.get(`/export/conversation/${conversationId}/pdf`, { responseType: 'blob' }),
  exportDOCX: conversationId =>
    api.get(`/export/conversation/${conversationId}/docx`, { responseType: 'blob' }),
};

export const conversationsAPI = chatAPI;

export default api;