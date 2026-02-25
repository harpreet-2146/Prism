// frontend/src/components/chat/ChatMessage.jsx
import { useMemo, useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ThumbsUp, ThumbsDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Inline code & fenced code blocks ────────────────────────────────────────
function CodeBlock({ inline, className, children }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className || '')?.[1];

  if (inline) {
    return (
      <code className="rounded px-1.5 py-0.5 font-mono text-[0.82em] bg-slate-800/80 text-sky-300 border border-slate-700/60">
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(String(children));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-slate-700/50 shadow-lg">
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2.5">
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-slate-900 px-5 py-4 text-[0.84rem] font-mono leading-relaxed text-slate-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ─── Markdown component map ───────────────────────────────────────────────────
const mdComponents = {
  code: CodeBlock,
  h1: ({ children }) => (
    <h1 className="mt-8 mb-4 text-2xl font-semibold tracking-tight text-white border-b border-slate-700/50 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-3 text-xl font-semibold tracking-tight text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-base font-semibold text-slate-100">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-3 leading-[1.85] text-slate-200 text-[0.9375rem]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 ml-5 space-y-1.5 list-disc marker:text-sky-500">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-5 space-y-1.5 list-decimal marker:text-sky-500 marker:font-semibold">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-[1.8] text-slate-200 text-[0.9375rem] pl-1">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-300">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-[3px] border-sky-500/60 pl-5 text-slate-400 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-slate-700/50">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-800/80">{children}</thead>,
  th: ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-slate-300 border-b border-slate-800/50 text-[0.875rem]">{children}</td>
  ),
  hr: () => <hr className="my-7 border-slate-700/50" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300 transition-colors">
      {children}
    </a>
  ),
};

// ─── Streaming cursor ─────────────────────────────────────────────────────────
function StreamCursor() {
  return (
    <span className="inline-block w-0.5 h-[1.1em] bg-sky-400 animate-pulse ml-0.5 translate-y-[2px] rounded-sm" />
  );
}

// ─── Message action bar ───────────────────────────────────────────────────────
function ActionBar({ content }) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState(null);

  return (
    <div className="flex items-center gap-0.5 mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        onClick={() => setVote(v => v === 'up' ? null : 'up')}
        className={cn(
          'rounded-lg p-1.5 transition-all text-xs',
          vote === 'up' ? 'text-emerald-400 bg-emerald-900/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setVote(v => v === 'down' ? null : 'down')}
        className={cn(
          'rounded-lg p-1.5 transition-all text-xs',
          vote === 'down' ? 'text-rose-400 bg-rose-900/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Zoomable image ───────────────────────────────────────────────────────────
function DocImage({ src, pageNumber }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure
        onClick={() => setOpen(true)}
        className="my-5 cursor-zoom-in group overflow-hidden rounded-xl border border-slate-700/40 bg-slate-800/30"
      >
        <img
          src={src}
          alt={`Page ${pageNumber}`}
          className="w-full h-auto transition-transform duration-200 group-hover:scale-[1.005]"
          loading="lazy"
          onError={e => e.currentTarget.closest('figure').style.display = 'none'}
        />
        {pageNumber && (
          <figcaption className="px-3 py-1.5 text-xs text-slate-500 font-mono border-t border-slate-700/40">
            page {pageNumber}
          </figcaption>
        )}
      </figure>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto">
            <img src={src} alt="" className="h-auto w-auto max-h-[88vh] rounded-xl shadow-2xl" />
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white hover:bg-black/80"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── PRISM logo mark ──────────────────────────────────────────────────────────
function PrismMark() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-md shadow-sky-900/40 mt-0.5">
      <span className="text-[11px] font-bold text-white tracking-tight">P</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isStreaming = message.streaming;

  // Parse attached images
  const images = useMemo(() => {
    if (!message.images) return [];
    try {
      return typeof message.images === 'string' ? JSON.parse(message.images) : message.images;
    } catch { return []; }
  }, [message.images]);

  // ── User message ─────────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end px-4 sm:px-8 lg:px-12 py-1">
        <div className="flex items-end gap-3 max-w-[78%]">
          <div className="bg-slate-800 border border-slate-700/60 rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
            <p className="text-slate-100 text-[0.9375rem] leading-[1.75] whitespace-pre-wrap">
              {message.content}
            </p>
          </div>
          <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-700 border border-slate-600/50 flex items-center justify-center mb-0.5">
            <User className="h-3.5 w-3.5 text-slate-300" />
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ────────────────────────────────────────────────────
  return (
    <div className="group flex gap-4 px-4 sm:px-8 lg:px-12 py-1">
      <PrismMark />

      <div className="flex-1 min-w-0 pb-1">
        {/* Label row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-400 tracking-widest uppercase">PRISM</span>
          {isStreaming && (
            <span className="text-[10px] text-sky-400 animate-pulse font-mono">processing</span>
          )}
        </div>

        {/* Content */}
        {isStreaming ? (
          <div className="text-slate-200 text-[0.9375rem] leading-[1.85] whitespace-pre-wrap">
            {message.content}
            <StreamCursor />
          </div>
        ) : (
          <>
            <div className="prism-md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
            </div>

            {images.length > 0 && (
              <div className={cn('mt-4 grid gap-3', images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
                {images.map((img, i) => (
                  <DocImage key={i} src={img.url} pageNumber={img.pageNumber} />
                ))}
              </div>
            )}

            <ActionBar content={message.content} />
          </>
        )}
      </div>
    </div>
  );
}