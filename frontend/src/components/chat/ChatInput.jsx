import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useChat } from '@hooks/useChat';
import { Button } from '@components/ui/button';
import { Textarea } from '@components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';

export default function ChatInput() {
  const { conversationId } = useParams();
  const { sendStreamingMessage, streaming } = useChat();
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!input.trim() || streaming) return;

    const message = input.trim();
    
    // Clear input immediately
    setInput('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await sendStreamingMessage(message, conversationId);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Show error toast or notification here if needed
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  const handleInput = (e) => {
    setInput(e.target.value);
    
    // Reset height to recalculate
    e.target.style.height = 'auto';
    // Set height based on scrollHeight (max 200px)
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Input form */}
      <div className="flex gap-3">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your SAP documentation..."
          className="min-h-[60px] max-h-[200px] resize-none"
          disabled={streaming}
          rows={1}
        />

        {/* Send button */}
        <Button 
          type="submit" 
          disabled={!input.trim() || streaming} 
          size="icon" 
          className="h-[60px] w-[60px] shrink-0"
        >
          {streaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        {streaming 
          ? 'AI is responding...' 
          : 'Press Enter to send, Shift+Enter for new line'}
      </p>
    </form>
  );
}