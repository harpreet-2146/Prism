// frontend/src/components/chat/ChatInput.jsx
// Light theme to match article-style Chat page

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '@/hooks/useChat';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatInput({ className }) {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { sendStreamingMessage, streaming, stopStreaming } = useChat();

  const [value, setValue] = useState('');
  const taRef = useRef(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [value]);

  const submit = useCallback(async () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    const newConvId = await sendStreamingMessage(text, conversationId || null);
    if (newConvId && !conversationId) navigate(`/chat/${newConvId}`);
  }, [value, streaming, conversationId, sendStreamingMessage, navigate]);

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const canSend = value.trim().length > 0;

  return (
    <div className={cn('relative', className)}>
      <div className={cn(
        'flex items-end gap-2 rounded-2xl border transition-all duration-150 bg-white',
        streaming
          ? 'border-blue-200 shadow-sm shadow-blue-50'
          : 'border-slate-200 focus-within:border-slate-300 focus-within:shadow-sm',
      )}>
        <textarea
          ref={taRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={streaming ? '' : 'Ask anything about your SAP documents…'}
          rows={1}
          className="flex-1 resize-none bg-transparent px-4 py-3.5 text-[0.9375rem] leading-[1.7] text-slate-800 placeholder:text-slate-400 focus:outline-none min-h-[52px] max-h-[220px] scrollbar-thin scrollbar-thumb-slate-200"
        />
        <div className="flex items-end pb-2.5 pr-2.5">
          <button
            onClick={streaming ? stopStreaming : submit}
            disabled={!streaming && !canSend}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150',
              streaming
                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                : canSend
                  ? 'bg-slate-900 text-white hover:bg-slate-700 shadow-sm active:scale-95'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed',
            )}
          >
            {streaming
              ? <Square className="h-3.5 w-3.5 fill-current" />
              : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {streaming && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
          <span className="text-xs text-blue-400 font-mono">PRISM is writing</span>
        </div>
      )}

      <div className="flex justify-between mt-1.5 px-1">
        <p className="text-[11px] text-slate-400">
          <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
        </p>
        {value.length > 0 && (
          <p className="text-[11px] text-slate-400">{value.length}</p>
        )}
      </div>
    </div>
  );
}