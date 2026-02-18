import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '@hooks/useChat';
import ChatMessage from '@components/chat/ChatMessage';
import ChatInput from '@components/chat/ChatInput';
import { Skeleton } from '@components/ui/skeleton';
import { WELCOME_MESSAGE } from '@lib/constants';
import { MessageSquare } from 'lucide-react';

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { messages, loading, fetchConversation, setMessages, setCurrentConversation } = useChat();
  const messagesEndRef = useRef(null);
  const isInitialLoad = useRef(true);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation when ID changes
  useEffect(() => {
    const loadConversation = async () => {
      if (conversationId) {
        // Load existing conversation
        await fetchConversation(conversationId);
      } else {
        // New conversation - clear state
        setCurrentConversation(null);
        setMessages([]);
      }
      isInitialLoad.current = false;
    };

    loadConversation();
  }, [conversationId, fetchConversation, setMessages, setCurrentConversation]);

  // Show loading skeleton only on initial load
  if (isInitialLoad.current && loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[80%]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {messages.length === 0 ? (
            // Welcome message
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-4 text-2xl font-bold">Welcome to PRISM</h2>
              <div className="prose prose-sm max-w-2xl text-muted-foreground">
                <p className="whitespace-pre-line">{WELCOME_MESSAGE}</p>
              </div>
            </div>
          ) : (
            // Chat messages
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t bg-card">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}