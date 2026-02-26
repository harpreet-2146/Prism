// frontend/src/pages/Chat.jsx
// Article-style layout. White background, generous width, document feel.

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useChat } from '@/hooks/useChat';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import ExportButton from '@/components/chat/ExportButton';
import { FileText, ChevronDown } from 'lucide-react';

const SUGGESTIONS = [
  { emoji: '📘', label: 'Inbound process with POSC — full guide', query: 'Give me a comprehensive, detailed step-by-step guide for the inbound process with POSC in SAP EWM — every step, every configuration, all T-codes, prerequisites, navigation paths, expected results, and watch-out points. Be thorough.' },
  { emoji: '⚙️', label: 'All T-codes with full explanation', query: 'List and fully explain every SAP T-code documented across all my uploaded documents. For each T-code: navigation path, what it does, when to use it, configuration steps, and any important notes from the source document.' },
  { emoji: '🛠️', label: 'Error resolution — complete guide', query: 'Give me a complete guide of all error scenarios and resolutions in my SAP documents. For each error: what causes it, step-by-step resolution, and how to prevent it.' },
  { emoji: '🔗', label: 'Integration dependencies', query: 'Document all system integrations, dependencies, and cross-module connections in my uploaded SAP materials. Explain how each component connects to others with full configuration detail.' },
];

function EmptyState({ onSuggestion }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-20 px-6">
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-blue-800 flex items-center justify-center shadow-xl shadow-sky-900/30">
          <span className="text-3xl font-bold text-white tracking-tighter">P</span>
        </div>
        <div className="text-center mt-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">PRISM</h1>
          <p className="text-sm text-slate-500 mt-0.5">SAP Documentation Assistant</p>
        </div>
      </div>

      <p className="text-slate-500 text-[0.9375rem] text-center max-w-md mb-8 leading-relaxed">
        Ask anything about your SAP documentation. Answers are generated as full technical articles — not chat snippets.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} onClick={() => onSuggestion(s.query)}
            className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_2px_16px_rgba(0,0,0,0.06)] px-4 py-3.5 text-left transition-all duration-150">
            <span className="text-xl flex-shrink-0 group-hover:scale-105 transition-transform mt-0.5">{s.emoji}</span>
            <span className="text-sm text-slate-500 group-hover:text-slate-800 leading-snug transition-colors font-medium">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
        <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span>
          Upload SAP PDFs first for contextual answers.{' '}
          <Link to="/documents" className="text-blue-500 hover:text-blue-600 font-medium">
            Go to Documents →
          </Link>
        </span>
      </div>
    </div>
  );
}

export default function Chat() {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const {
    messages, loading, streaming, currentConversation,
    fetchConversation, setMessages, setCurrentConversation, sendStreamingMessage
  } = useChat();

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevConvIdRef = useRef(null);

  useEffect(() => {
    if (conversationId === prevConvIdRef.current) return;
    prevConvIdRef.current = conversationId;
    if (conversationId) fetchConversation(conversationId);
    else { setCurrentConversation(null); setMessages([]); }
  }, [conversationId]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && messages.length === 0 && !conversationId) sendStreamingMessage(q, null);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: messages.length <= 2 ? 'auto' : 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Document area ── */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
        }}
        className="relative flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <EmptyState onSuggestion={q => sendStreamingMessage(q, conversationId || null)} />
        ) : (
          <div>
          {/* Conversation toolbar */}
          <div className="sticky top-0 z-10 flex items-center justify-end gap-2 px-6 sm:px-10 lg:px-16 py-2 bg-white/90 backdrop-blur-sm border-b border-slate-100">
            <ExportButton conversationId={conversationId} title={currentConversation?.title} />
          </div>
          <div className="divide-y divide-slate-100">
            {messages.map(msg => (
              <ChatMessage key={msg.id || msg.tempId} message={msg} />
            ))}
            <div ref={endRef} className="h-10" />
          </div>
          </div>
        )}

        {showScrollBtn && (
          <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-4 right-5 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm">
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Input strip — minimal ── */}
      <div className="flex-shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 lg:px-16 pt-3 pb-4">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}