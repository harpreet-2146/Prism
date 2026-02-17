import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useChat } from '@hooks/useChat';
import { useDocuments } from '@hooks/useDocuments';
import { Button } from '@components/ui/button';
import { Textarea } from '@components/ui/textarea';
import { Send, Paperclip, X } from 'lucide-react';
import { STREAMING_ENABLED } from '@lib/constants';

export default function ChatInput() {
  const { conversationId } = useParams();
  const { sendMessage, sendStreamingMessage, streaming } = useChat();
  const { documents } = useDocuments();
  const [input, setInput] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const textareaRef = useRef(null);

  const handleSubmit = async e => {
    e.preventDefault();

    if (!input.trim() || streaming) return;

    const message = input.trim();
    const documentIds = selectedDocuments.map(doc => doc.id);

    // Clear input
    setInput('');
    setSelectedDocuments([]);

    try {
      if (STREAMING_ENABLED) {
        await sendStreamingMessage(message, documentIds);
      } else {
        await sendMessage(message, documentIds);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleDocument = doc => {
    setSelectedDocuments(prev => {
      const exists = prev.find(d => d.id === doc.id);
      if (exists) {
        return prev.filter(d => d.id !== doc.id);
      }
      return [...prev, doc];
    });
  };

  return (
    <div className="space-y-3">
      {/* Selected documents */}
      {selectedDocuments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDocuments.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              <span>{doc.filename}</span>
              <button
                onClick={() => toggleDocument(doc)}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Document picker */}
      {showDocumentPicker && documents.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
          {documents.map(doc => (
            <button
              key={doc.id}
              onClick={() => toggleDocument(doc)}
              className={cn(
                'w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                selectedDocuments.find(d => d.id === doc.id) && 'bg-accent'
              )}
            >
              {doc.filename}
            </button>
          ))}
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your SAP documentation..."
            className="min-h-[60px] resize-none pr-12"
            disabled={streaming}
          />

          {/* Attach button */}
          {documents.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute bottom-2 right-2"
              onClick={() => setShowDocumentPicker(!showDocumentPicker)}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Send button */}
        <Button type="submit" disabled={!input.trim() || streaming} size="icon" className="h-[60px] w-[60px]">
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}