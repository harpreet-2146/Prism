// frontend/src/components/chat/ChatMessage.jsx
// ARTICLE layout — not a chat. User query = document header. PRISM = full article body.

import { useMemo, useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import ArticleRenderer from './ArticleRenderer';

// ── Streaming cursor ──────────────────────────────────────────────────────────
function StreamCursor() {
  return (
    <span className="inline-block w-0.5 h-[1.15em] bg-slate-400 animate-pulse ml-0.5 translate-y-[2px] rounded-sm" />
  );
}

// ── Copy + vote bar (appears on hover) ───────────────────────────────────────
function ActionBar({ content }) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState(null);

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-8 pt-5 border-t border-slate-100">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        onClick={() => setVote(v => v === 'up' ? null : 'up')}
        className={cn(
          'rounded-lg p-1.5 transition-all',
          vote === 'up' ? 'text-emerald-500 bg-emerald-50' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setVote(v => v === 'down' ? null : 'down')}
        className={cn(
          'rounded-lg p-1.5 transition-all',
          vote === 'down' ? 'text-rose-500 bg-rose-50' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isStreaming = message.streaming;

  const images = useMemo(() => {
    if (!message.images) return [];
    try { return typeof message.images === 'string' ? JSON.parse(message.images) : message.images; }
    catch { return []; }
  }, [message.images]);

  // ── User turn: render as a document question header ──────────────────────
  if (isUser) {
    return (
      <div className="px-6 sm:px-10 lg:px-16 pt-10 pb-2">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center mt-0.5">
              <svg className="w-3 h-3 text-slate-500" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M1 11c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[1rem] font-semibold text-slate-800 leading-snug pt-0.5">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── PRISM turn: full-width article ───────────────────────────────────────
  return (
    <div className="group px-6 sm:px-10 lg:px-16 pt-6 pb-4">
      <div className="max-w-4xl mx-auto">
        {/* PRISM label — very small, out of the way */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-5 w-5 rounded-md bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <span className="text-[8px] font-bold text-white">P</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            PRISM
          </span>
          {isStreaming && (
            <span className="text-[10px] text-sky-400 animate-pulse font-mono ml-1">
              writing…
            </span>
          )}
        </div>

        {/* ── Article content ── */}
        {isStreaming ? (
          <div className="text-[1rem] leading-[1.9] text-slate-700 whitespace-pre-wrap font-[450] max-w-3xl">
            {message.content}
            <StreamCursor />
          </div>
        ) : (
          <>
            <ArticleRenderer content={message.content} images={images} />
            <ActionBar content={message.content} />
          </>
        )}
      </div>
    </div>
  );
}