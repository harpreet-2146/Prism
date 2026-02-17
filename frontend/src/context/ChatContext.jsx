import { createContext, useState, useCallback } from 'react';
import { conversationsAPI, chatAPI } from '@lib/api';

export const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await conversationsAPI.getAll();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }, []);

  // Fetch single conversation with messages
  const fetchConversation = useCallback(async conversationId => {
    try {
      setLoading(true);
      const { data } = await conversationsAPI.getById(conversationId);
      setCurrentConversation(data.conversation);
      setMessages(data.conversation.messages || []);
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new conversation
  const createConversation = useCallback(
    async title => {
      try {
        const { data } = await conversationsAPI.create({ title });
        setConversations(prev => [data.conversation, ...prev]);
        setCurrentConversation(data.conversation);
        setMessages([]);
        return data.conversation;
      } catch (error) {
        console.error('Failed to create conversation:', error);
        throw error;
      }
    },
    []
  );

  // Delete conversation
  const deleteConversation = useCallback(
    async conversationId => {
      try {
        await conversationsAPI.delete(conversationId);
        setConversations(prev => prev.filter(c => c.id !== conversationId));

        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null);
          setMessages([]);
        }
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        throw error;
      }
    },
    [currentConversation]
  );

  // Send message (non-streaming)
  const sendMessage = useCallback(
    async (content, documentIds = []) => {
      if (!currentConversation) {
        throw new Error('No active conversation');
      }

      try {
        setLoading(true);

        // Add user message optimistically
        const userMessage = {
          id: Date.now(),
          role: 'user',
          content,
          createdAt: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);

        // Send to API
        const { data } = await chatAPI.sendMessage({
          conversationId: currentConversation.id,
          message: content,
          documentIds
        });

        // Replace optimistic message and add AI response
        setMessages(prev => [
          ...prev.filter(m => m.id !== userMessage.id),
          data.userMessage,
          data.assistantMessage
        ]);

        return data;
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [currentConversation]
  );

  // Send message with streaming
  const sendStreamingMessage = useCallback(
    async (content, documentIds = []) => {
      if (!currentConversation) {
        throw new Error('No active conversation');
      }

      // Add user message
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Add placeholder for assistant message
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        streaming: true
      };
      setMessages(prev => [...prev, assistantMessage]);
      setStreaming(true);

      return new Promise((resolve, reject) => {
        chatAPI.streamMessage(
          {
            conversationId: currentConversation.id,
            message: content,
            documentIds
          },
          // onChunk
          chunk => {
            if (chunk.content) {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + chunk.content }
                    : msg
                )
              );
            }
          },
          // onComplete
          () => {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId ? { ...msg, streaming: false } : msg
              )
            );
            setStreaming(false);
            resolve();
          },
          // onError
          error => {
            console.error('Streaming error:', error);
            setStreaming(false);
            reject(error);
          }
        );
      });
    },
    [currentConversation]
  );

  const value = {
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
    setCurrentConversation,
    setMessages
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}