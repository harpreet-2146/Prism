// frontend/src/components/chat/ChatInput.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '@/hooks/useChat';
import { ArrowUp, Square, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatInput({ className }) {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { sendStreamingMessage, streaming, stopStreaming } = useChat();

  const [value, setValue] = useState('');
  const taRef = useRef(null);

  // Auto-resize
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [value]);

  const submit = useCallback(async () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');

    // If no conversationId, sendStreamingMessage will create one and redirect
    const newConvId = await sendStreamingMessage(text, conversationId);
    if (newConvId && !conversationId) {
      navigate(`/chat/${newConvId}`);
    }
  }, [value, streaming, conversationId, sendStreamingMessage, navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = value.trim().length > 0;

  return (
    <div className={cn('relative', className)}>
      {/* Main input container */}
      <div className={cn(
        'flex items-end gap-3 rounded-2xl border transition-all duration-150',
        'bg-slate-900 border-slate-700/70',
        'focus-within:border-sky-500/50 focus-within:shadow-lg focus-within:shadow-sky-900/20',
        streaming && 'border-sky-600/40 shadow-md shadow-sky-900/10'
      )}>
        {/* Textarea */}
        <textarea
          ref={taRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={false} // allow typing while streaming (queue)
          placeholder={streaming ? '' : 'Ask anything about your SAP documents…'}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent px-5 py-4 text-[0.9375rem] leading-[1.7]',
            'text-slate-100 placeholder:text-slate-600',
            'focus:outline-none min-h-[56px] max-h-[240px]',
            'scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent'
          )}
        />

        {/* Action buttons */}
        <div className="flex items-end gap-1 pb-3 pr-3">
          {/* Stop / Send */}
          <button
            onClick={streaming ? stopStreaming : submit}
            disabled={!streaming && !canSend}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150',
              streaming
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                : canSend
                  ? 'bg-sky-600 text-white hover:bg-sky-500 shadow-md shadow-sky-900/40 active:scale-95'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            )}
          >
            {streaming ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Streaming indicator */}
      {streaming && (
        <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-sky-500 animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <span className="text-xs text-sky-500/80 font-mono">PRISM is writing</span>
        </div>
      )}

      {/* Hint */}
      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-[11px] text-slate-600">
          <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
        </p>
        <p className="text-[11px] text-slate-600">
          {value.length > 0 && `${value.length} chars`}
        </p>
      </div>
    </div>
  );
}