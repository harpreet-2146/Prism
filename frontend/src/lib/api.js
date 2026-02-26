import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest?._retry) {
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
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
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
  getById: (id) => api.get(`/documents/${id}`),
  delete: (id) => api.delete(`/documents/${id}`),
};

export const chatAPI = {
  create: (title) => api.post('/chat/conversations', { title }),
  getAll: () => api.get('/chat/conversations'),
  getById: (id) => api.get(`/chat/conversations/${id}`),
  delete: (id) => api.delete(`/chat/conversations/${id}`),
  sendMessage: (conversationId, message) =>
    api.post(`/chat/conversations/${conversationId}/messages`, { message }),

  // Uses fetch streaming with Authorization header to avoid exposing token in URL query.
  streamMessage: (conversationId, message, onChunk, onComplete, onError) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      onError({ error: 'Not authenticated' });
      return null;
    }

    let chatId = 'new';
    if (conversationId) {
      chatId = typeof conversationId === 'object'
        ? (conversationId?.id || 'new')
        : String(conversationId);
    }

    const url = `${API_BASE_URL}/chat/conversations/${chatId}/stream?message=${encodeURIComponent(message)}`;
    const abortController = new AbortController();
    let finished = false;

    const processSSEBlock = (block) => {
      const lines = block.split('\n');
      const dataLines = lines
        .map((l) => l.trim())
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());

      if (dataLines.length === 0) return;

      try {
        const payload = JSON.parse(dataLines.join('\n'));
        if (payload.type === 'token') onChunk(payload);
        else if (payload.type === 'info') onChunk({ content: '' });
        else if (payload.type === 'done') {
          finished = true;
          onComplete(payload);
        } else if (payload.type === 'error') {
          finished = true;
          onError(payload);
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    (async () => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          let bodyText = '';
          try { bodyText = await response.text(); } catch (_) { bodyText = ''; }
          onError({ error: bodyText || `Stream request failed (${response.status})` });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';
          for (const chunk of chunks) {
            processSSEBlock(chunk);
            if (finished) break;
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        if (!finished) onError({ error: 'Connection lost' });
      }
    })();

    return { close: () => abortController.abort() };
  },
};

export const exportAPI = {
  exportPDF: (conversationId) =>
    api.get(`/export/conversation/${conversationId}/pdf`, { responseType: 'blob' }),
  exportDOCX: (conversationId) =>
    api.get(`/export/conversation/${conversationId}/docx`, { responseType: 'blob' }),
};

export const conversationsAPI = chatAPI;

export default api;
