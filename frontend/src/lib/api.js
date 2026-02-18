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
  getProfile: () => api.get('/auth/profile'),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken })
};

// Documents API
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

// Conversations API
export const conversationsAPI = {
  getAll: (params) => api.get('/chat/conversations', { params }),
  getById: (conversationId) => api.get(`/chat/conversations/${conversationId}`),
  create: (data) => api.post('/chat/conversations', data),
  delete: (conversationId) => api.delete(`/chat/conversations/${conversationId}`),
  updateTitle: (conversationId, title) => 
    api.patch(`/chat/conversations/${conversationId}/title`, { title })
};

// Chat API
export const chatAPI = {
  sendMessage: (data) => api.post('/chat/messages', data),
  
  streamMessage: (data) => {
    const token = localStorage.getItem('accessToken');
    return fetch(`${API_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
  }
};

// Export API
export const exportAPI = {
  exportPDF: (conversationId) => api.post('/export/pdf', { conversationId }),
  exportDOCX: (conversationId) => api.post('/export/docx', { conversationId }),
  download: (filename) => `${API_URL}/export/download/${filename}`
};

export default api;