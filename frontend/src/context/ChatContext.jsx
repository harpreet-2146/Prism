// frontend/src/context/ChatContext.jsx
// Fixed: conversationId is always extracted as string before passing to API
// Prevents [object Object] appearing in SSE URLs

import { createContext, useState, useCallback, useRef } from 'react';
import { conversationsAPI, chatAPI } from '@lib/api';

export const ChatContext = createContext(null);

// ── Helper: always get a plain string ID or null ──────────────────────────────
function resolveId(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val?.id || null;
  return String(val);
}

export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamController, setStreamController] = useState(null);
  const streamingRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await conversationsAPI.getAll();
      setConversations(data.data?.conversations || data.data || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setConversations([]);
    }
  }, []);

  const fetchConversation = useCallback(async (conversationId) => {
    const id = resolveId(conversationId);
    if (!id) return;
    try {
      setLoading(true);
      const { data } = await conversationsAPI.getById(id);
      const conversation = data.data?.conversation || data.data;
      const messagesData = data.data?.messages || [];
      setCurrentConversation(conversation);
      setMessages(messagesData);
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
      setCurrentConversation(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(async () => {
    setCurrentConversation(null);
    setMessages([]);
    return { id: null };
  }, []);

  const deleteConversation = useCallback(async (conversationId) => {
    const id = resolveId(conversationId);
    if (!id) return;
    try {
      await conversationsAPI.delete(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (resolveId(currentConversation) === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }, [currentConversation]);

  const stopStreaming = useCallback(() => {
    if (streamController) {
      streamController.close();
      setStreamController(null);
    }
    streamingRef.current = false;
    setStreaming(false);
    // Mark last streaming message as done
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, [streamController]);

  const sendStreamingMessage = useCallback(async (content, conversationId = null) => {
    if (streamingRef.current) {
      return resolveId(conversationId) || resolveId(currentConversation);
    }

    // ── Always resolve to a plain string ──────────────────────────────────
    const actualId = resolveId(conversationId) || resolveId(currentConversation);

    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    const assistantId = `temp-assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      images: [],
      createdAt: new Date().toISOString(),
    }]);
    streamingRef.current = true;
    setStreaming(true);

    return new Promise((resolve, reject) => {
      const es = chatAPI.streamMessage(
        actualId,
        content,
        // onChunk
        chunk => {
          if (chunk.content) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk.content }
                : m
            ));
          }
        },
        // onComplete
        data => {
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId) return m;
            return {
              ...m,
              id: data.messageId || m.id,
              streaming: false,
              images: data.images || [],
            };
          }));

          // Update current conversation if newly created
          if (data.conversationId) {
            const newId = resolveId(data.conversationId);
            if (!currentConversation) {
              setCurrentConversation({ id: newId });
              window.history.replaceState(null, '', `/chat/${newId}`);
            }
          }

          fetchConversations();
          streamingRef.current = false;
          setStreaming(false);
          setStreamController(null);
          resolve(data.conversationId ? resolveId(data.conversationId) : actualId);
        },
        // onError
        error => {
          console.error('Streaming error:', error);
          const raw = error?.error || error?.message || 'Request failed';
          const msg = /rate limit|429|try again/i.test(raw)
            ? `Groq rate limit reached. Please wait and retry, or reduce response size. ${raw}`
            : `Response failed: ${raw}`;
          setMessages(prev => prev.map(m => (
            m.id === assistantId ? { ...m, streaming: false, content: msg } : m
          )));
          streamingRef.current = false;
          setStreaming(false);
          setStreamController(null);
          reject(error);
        }
      );
      setStreamController(es);
    });
  }, [currentConversation, fetchConversations]);

  const sendMessage = useCallback(async (content, conversationId = null) => {
    const actualId = resolveId(conversationId) || resolveId(currentConversation);
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    try {
      const { data } = await chatAPI.sendMessage(actualId, content);
      setMessages(prev => [
        ...prev.filter(m => m.id !== userMessage.id),
        data.data.userMessage,
        data.data.assistantMessage,
      ]);
      if (data.data.conversationId && !currentConversation) {
        setCurrentConversation({ id: data.data.conversationId });
        window.history.replaceState(null, '', `/chat/${data.data.conversationId}`);
      }
      fetchConversations();
      return data;
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentConversation, fetchConversations]);

  return (
    <ChatContext.Provider value={{
      conversations,
      currentConversation,
      messages,
      loading,
      streaming,
      fetchConversations,
      fetchConversation,
      createConversation,
      deleteConversation,
      sendMessage,
      sendStreamingMessage,
      stopStreaming,
      setCurrentConversation,
      setMessages,
    }}>
      {children}
    </ChatContext.Provider>
  );
}
