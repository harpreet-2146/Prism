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
      setConversations(data.data?.conversations || data.data || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setConversations([]);
    }
  }, []);

  // Fetch single conversation with messages
  const fetchConversation = useCallback(async (conversationId) => {
    try {
      setLoading(true);
      const { data } = await conversationsAPI.getById(conversationId);
      
      console.log('📥 Loaded conversation:', data.data); // DEBUG
      
      // ✅ Handle nested data structure
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

  // Create new conversation (backend creates it on first message)
  const createConversation = useCallback(async () => {
    console.log('🆕 Creating new conversation'); // DEBUG
    // Just set empty state - backend will create conversation on first message
    setCurrentConversation(null);
    setMessages([]);
    return { id: null }; // null ID means "new conversation"
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      await conversationsAPI.delete(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }, [currentConversation]);

  // Send message with streaming
  const sendStreamingMessage = useCallback(async (content, conversationId = null) => {
    console.log('📤 Sending message:', { content, conversationId }); // DEBUG
    
    // Add user message immediately
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);

    // Add placeholder for assistant message
    const assistantMessageId = `temp-assistant-${Date.now()}`;
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      streaming: true,
      images: [],
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setStreaming(true);

    // ✅ FIX: Get the actual conversation ID (can be null for new conversations)
    const actualConversationId = conversationId || currentConversation?.id;

    return new Promise((resolve, reject) => {
      chatAPI.streamMessage(
        actualConversationId, // ✅ Can be null, backend will create new conversation
        content,              // ✅ Message string
        // onChunk - append content as it streams
        (chunk) => {
          if (chunk.content) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: msg.content + chunk.content }
                  : msg
              )
            );
          }
        },
        // onComplete - finalize the message
        (data) => {
          console.log('🎯 SSE Complete - Full response data:', data);
          console.log('🖼️  Images in response:', data.images);
          
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                // ✅ CRITICAL FIX: Extract images from the correct location
                const images = data.images || [];
                
                console.log('✅ Setting message images:', images);
                
                return {
                  ...msg,
                  id: data.messageId || msg.id,
                  streaming: false,
                  sources: data.sources || [],
                  images: images // ✅ PASS IMAGES TO MESSAGE
                };
              }
              return msg;
            })
          );

          // Update conversation if it was just created
          if (data.conversationId && !currentConversation) {
            console.log('📝 Created new conversation:', data.conversationId);
            setCurrentConversation({ id: data.conversationId });
            window.history.replaceState(null, '', `/chat/${data.conversationId}`);
          }

          fetchConversations();
          
          setStreaming(false);
          resolve(data);
        },
        // onError
        (error) => {
          console.error('❌ Streaming error:', error);
          
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
          
          setStreaming(false);
          reject(error);
        }
      );
    });
  }, [currentConversation, fetchConversations]);

  // Send message without streaming (fallback)
  const sendMessage = useCallback(async (content, conversationId = null) => {
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const { data } = await chatAPI.sendMessage({
        message: content,
        conversationId: conversationId || currentConversation?.id || undefined
      });

      // Replace temp message with real ones
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        data.data.userMessage,
        data.data.assistantMessage
      ]);

      // Update conversation if it was just created
      if (data.data.conversationId && !currentConversation) {
        setCurrentConversation({ id: data.data.conversationId });
        window.history.replaceState(null, '', `/chat/${data.data.conversationId}`);
      }

      fetchConversations();
      return data;
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove the failed user message
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentConversation, fetchConversations]);

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