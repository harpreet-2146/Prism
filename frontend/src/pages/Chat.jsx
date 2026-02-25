// frontend/src/pages/Chat.jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useChat } from '@/hooks/useChat';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import { FileText, Layers, ChevronDown } from 'lucide-react';

// ── Suggestions for empty state ───────────────────────────────────────────────
const SUGGESTIONS = [
  { emoji: '📘', label: 'Full POSC overview', query: 'Give me a comprehensive overview of everything in my documents related to POSC — all steps, configurations, T-codes, and important notes.' },
  { emoji: '⚙️', label: 'All T-codes explained', query: 'List and explain every SAP T-code mentioned in my uploaded documents with their purpose and when to use each.' },
  { emoji: '🔍', label: 'Document index', query: 'Generate a detailed index of all the topics, sections, and concepts covered in my uploaded documents.' },
  { emoji: '🛠️', label: 'Error resolution guide', query: 'What error scenarios and their resolutions are documented in my uploaded SAP documents? Give me everything.' },
];

// ── Empty/welcome state ───────────────────────────────────────────────────────
function EmptyState({ onSuggestion }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-20 px-6">
      {/* Wordmark */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-blue-800 flex items-center justify-center shadow-xl shadow-sky-900/40">
            <span className="text-3xl font-bold text-white tracking-tighter">P</span>
          </div>
          {/* Prism refraction lines */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-[3px]">
            {['bg-sky-400','bg-blue-400','bg-violet-400'].map((c, i) => (
              <div key={i} className={`w-1 h-2 rounded-full ${c} opacity-80`} />
            ))}
          </div>
        </div>
        <div className="text-center mt-2">
          <h1 className="text-2xl font-semibold text-white tracking-tight">PRISM</h1>
          <p className="text-sm text-slate-500 mt-0.5">SAP Documentation Assistant</p>
        </div>
      </div>

      <p className="text-slate-400 text-[0.9375rem] text-center max-w-md mb-8 leading-relaxed">
        Ask anything about your uploaded SAP documentation. PRISM reads the full document context — not just snippets.
      </p>

      {/* Suggestion grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s.query)}
            className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700 px-4 py-3.5 text-left transition-all duration-150"
          >
            <span className="text-lg flex-shrink-0 group-hover:scale-110 transition-transform mt-0.5">
              {s.emoji}
            </span>
            <span className="text-sm text-slate-400 group-hover:text-slate-200 leading-snug transition-colors">
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {/* Doc nudge */}
      <div className="mt-8 flex items-center gap-2.5 rounded-xl bg-sky-950/40 border border-sky-900/50 px-4 py-3 text-sm text-sky-400/80">
        <FileText className="h-4 w-4 flex-shrink-0 text-sky-500" />
        <span>
          Upload SAP PDFs first for contextual answers.{' '}
          <Link to="/documents" className="text-sky-400 font-medium hover:underline underline-offset-2">
            Go to Documents →
          </Link>
        </span>
      </div>
    </div>
  );
}

// ── Scroll-to-bottom button ───────────────────────────────────────────────────
function ScrollButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-lg"
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}

// ── Main Chat page ────────────────────────────────────────────────────────────
export default function Chat() {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const { messages, loading, streaming, fetchConversation, setMessages, setCurrentConversation, sendStreamingMessage } = useChat();

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevConvIdRef = useRef(null);

  // Load conversation
  useEffect(() => {
    if (conversationId === prevConvIdRef.current) return;
    prevConvIdRef.current = conversationId;
    if (conversationId) {
      fetchConversation(conversationId);
    } else {
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [conversationId]);

  // Handle ?q= pre-fill from DocumentIndex "Ask about this" clicks
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && messages.length === 0 && !conversationId) {
      sendStreamingMessage(q, null);
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: messages.length <= 2 ? 'auto' : 'smooth' });
  }, [messages]);

  // Show scroll button if user scrolled up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 300);
  };

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleSuggestion = (query) => sendStreamingMessage(query, conversationId);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* ── Message area ──────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        {messages.length === 0 ? (
          <div className="max-w-3xl mx-auto w-full h-full">
            <EmptyState onSuggestion={handleSuggestion} />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-8 flex flex-col gap-7">
            {messages.map(msg => (
              <ChatMessage key={msg.id || msg.tempId} message={msg} />
            ))}
            <div ref={endRef} className="h-2" />
          </div>
        )}

        {showScrollBtn && <ScrollButton onClick={scrollToBottom} />}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-800/80 bg-slate-950">
        <div className="max-w-3xl mx-auto w-full px-4 pt-4 pb-5">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}