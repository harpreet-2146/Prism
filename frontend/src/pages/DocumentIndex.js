// frontend/src/pages/DocumentIndex.jsx
//
// This page shows a deep, context-aware index for each uploaded document.
// Each document gets: overview, detected SAP module, all T-codes, topics,
// config sections, integration points — all extracted by Groq from the full doc.
// Each item is clickable → routes to chat with a pre-filled comprehensive query.

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments } from '@/hooks/useDocuments';
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText, ChevronDown, ChevronRight, Sparkles, Loader2,
  Hash, Code2, Network, BookOpen, AlertCircle, RefreshCw,
  ArrowUpRight, Search, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const styles = {
    completed: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
    processing: 'bg-sky-950/60 text-sky-400 border-sky-800/50',
    pending: 'bg-amber-950/60 text-amber-400 border-amber-800/50',
    failed: 'bg-red-950/60 text-red-400 border-red-800/50',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider',
      styles[status] || styles.pending
    )}>
      {status === 'processing' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {status}
    </span>
  );
}

// ─── Clickable tag ────────────────────────────────────────────────────────────
function Tag({ label, variant = 'default', onClick }) {
  const variants = {
    default: 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700/60 hover:text-white',
    tcode: 'bg-violet-950/60 border-violet-800/40 text-violet-300 font-mono hover:bg-violet-900/40 hover:text-violet-100',
    concept: 'bg-sky-950/60 border-sky-800/40 text-sky-300 hover:bg-sky-900/40 hover:text-sky-100',
    warning: 'bg-amber-950/60 border-amber-800/40 text-amber-300 hover:bg-amber-900/40',
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs transition-all duration-100 cursor-pointer',
        variants[variant]
      )}
    >
      {label}
    </button>
  );
}

// ─── Section accordion ────────────────────────────────────────────────────────
function IndexSection({ section, onAsk }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg flex-shrink-0">{section.icon || '📄'}</span>
          <div className="min-w-0">
            <p className="font-medium text-sm text-slate-100 truncate">{section.title}</p>
            {section.summary && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{section.summary}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {section.pages && (
            <span className="text-[10px] font-mono text-slate-600 bg-slate-800 rounded px-1.5 py-0.5">
              p.{section.pages}
            </span>
          )}
          {open
            ? <ChevronDown className="h-4 w-4 text-slate-600" />
            : <ChevronRight className="h-4 w-4 text-slate-600" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800/50 px-5 pb-5">
          {/* T-codes in this section */}
          {section.tcodes?.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mb-2">T-Codes</p>
              <div className="flex flex-wrap gap-1.5">
                {section.tcodes.map((t, i) => (
                  <Tag
                    key={i}
                    label={t}
                    variant="tcode"
                    onClick={() => onAsk(`Explain SAP T-Code ${t} in detail — what it does, when to use it, and how it relates to ${section.title}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Key concepts */}
          {section.concepts?.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mb-2">Key Concepts</p>
              <div className="flex flex-wrap gap-1.5">
                {section.concepts.map((c, i) => (
                  <Tag
                    key={i}
                    label={c}
                    variant="concept"
                    onClick={() => onAsk(`Give me a comprehensive explanation of "${c}" from my SAP documents — cover everything including configuration, usage, and important notes.`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sub-topics as list */}
          {section.subtopics?.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mb-2">Topics Covered</p>
              <ul className="space-y-1.5">
                {section.subtopics.map((t, i) => (
                  <li key={i} className="flex items-center gap-2.5 group">
                    <div className="w-1 h-1 rounded-full bg-slate-700 flex-shrink-0" />
                    <button
                      onClick={() => onAsk(`Tell me everything about "${t}" from my SAP documents — give me a full, comprehensive explanation with all details.`)}
                      className="text-sm text-slate-400 hover:text-slate-100 text-left transition-colors group-hover:underline underline-offset-2"
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings/notes */}
          {section.warnings?.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-600 mb-2">⚠ Notes & Warnings</p>
              <div className="space-y-1.5">
                {section.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-400/80 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ask button */}
          <button
            onClick={() => onAsk(`Give me a complete, detailed explanation of the "${section.title}" section from my SAP documents. Include every step, configuration, T-code, and important note.`)}
            className="mt-4 flex items-center gap-1.5 text-xs text-sky-500/80 hover:text-sky-400 transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            Ask PRISM to explain this section fully
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Generating state ─────────────────────────────────────────────────────────
function Generating() {
  const steps = [
    'Reading full document content…',
    'Identifying SAP modules and T-codes…',
    'Mapping configuration sections…',
    'Extracting integration points…',
    'Building context-aware index…',
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-600 to-blue-800 flex items-center justify-center mb-4 shadow-lg shadow-sky-900/30">
        <Sparkles className="h-5 w-5 text-white animate-pulse" />
      </div>
      <p className="text-sm font-medium text-slate-200 mb-1">Building Index</p>
      <p className="text-xs text-sky-400/70 font-mono mt-1 h-4 transition-all">{steps[step]}</p>
      <div className="flex gap-1 mt-4">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Per-document card ────────────────────────────────────────────────────────
function DocIndexCard({ doc, onAsk }) {
  const [index, setIndex] = useState(doc.indexData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const res = await api.post(`/documents/${doc.id}/generate-index`);
      setIndex(res.data.data.index);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate index. Try again.');
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  const hasIndex = !!index;

  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 overflow-hidden shadow-sm hover:border-slate-700/70 transition-colors">
      {/* Header row */}
      <div
        className={cn(
          'flex items-center gap-4 px-5 py-4',
          hasIndex && 'cursor-pointer hover:bg-slate-800/20 transition-colors'
        )}
        onClick={() => hasIndex && setOpen(o => !o)}
      >
        {/* File icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/50 flex items-center justify-center">
          <FileText className="h-5 w-5 text-slate-400" />
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-medium text-sm text-slate-100 truncate">{doc.originalName}</h3>
            <StatusPill status={doc.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600 font-mono">
            {doc.pageCount > 0 && <span>{doc.pageCount}pp</span>}
            {doc.sapModule && (
              <span className="text-violet-400">{doc.sapModule}</span>
            )}
            {doc.tcodes?.length > 0 && (
              <span className="text-sky-500">{doc.tcodes.length} T-codes</span>
            )}
            <span>{formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {doc.status === 'completed' && !hasIndex && !loading && (
            <button
              onClick={e => { e.stopPropagation(); generate(); }}
              className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition-colors shadow-md shadow-sky-900/30"
            >
              <Sparkles className="h-3 w-3" />
              Generate Index
            </button>
          )}
          {loading && !hasIndex && <Loader2 className="h-4 w-4 animate-spin text-sky-500" />}
          {hasIndex && (
            open
              ? <ChevronDown className="h-4 w-4 text-slate-600" />
              : <ChevronRight className="h-4 w-4 text-slate-600" />
          )}
        </div>
      </div>

      {/* Index body */}
      {open && (
        <div className="border-t border-slate-800/60 px-5 py-5">
          {loading && !hasIndex ? <Generating /> : error ? (
            <div className="flex items-center gap-2 text-sm text-red-400 py-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : hasIndex && (
            <div className="space-y-5">
              {/* Overview banner */}
              {index.overview && (
                <div className="rounded-xl bg-gradient-to-br from-sky-950/50 to-blue-950/30 border border-sky-900/40 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-sky-500">Overview</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{index.overview}</p>

                  {/* Stats row */}
                  {index.stats && (
                    <div className="mt-3 flex gap-4 border-t border-sky-900/30 pt-3">
                      {Object.entries(index.stats).map(([k, v]) => (
                        <div key={k} className="text-center">
                          <div className="text-lg font-bold text-sky-300 font-mono">{v}</div>
                          <div className="text-[10px] text-slate-600 uppercase tracking-wider">{k}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* All T-codes quick view */}
              {index.allTcodes?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Code2 className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
                      All T-Codes ({index.allTcodes.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {index.allTcodes.map((t, i) => (
                      <Tag
                        key={i}
                        label={t}
                        variant="tcode"
                        onClick={() => onAsk(`Explain SAP T-Code ${t} in full detail — its purpose, navigation path, configuration steps, and any important notes from my document.`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Integration points */}
              {index.integrations?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Network className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">Integration Points</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {index.integrations.map((item, i) => (
                      <Tag
                        key={i}
                        label={item}
                        onClick={() => onAsk(`Explain the integration between ${item} and the main SAP module in my document — all configuration steps and dependencies.`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              {index.sections?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
                      Content Structure ({index.sections.length} sections)
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {index.sections.map((sec, i) => (
                      <IndexSection key={i} section={sec} onAsk={onAsk} />
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <button
                onClick={generate}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors mt-2"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate index
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DocumentIndex() {
  const navigate = useNavigate();
  const { documents, loading } = useDocuments();
  const [search, setSearch] = useState('');

  const handleAsk = useCallback((query) => {
    navigate(`/chat?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const filtered = documents.filter(d =>
    !search || d.originalName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
      <div className="max-w-4xl mx-auto px-5 py-10">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-blue-800 flex items-center justify-center shadow-lg shadow-sky-900/30">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Document Index</h1>
          </div>
          <p className="text-sm text-slate-500 ml-12">
            PRISM reads your full documents — not just chunks — to build a complete context map.
          </p>
        </div>

        {/* ── Search ────────────────────────────────────────────────────── */}
        {documents.length > 1 && (
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
            <input
              type="text"
              placeholder="Search documents…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-700/60 transition-colors"
            />
          </div>
        )}

        {/* ── States ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-800 rounded w-52 mb-2" />
                    <div className="h-3 bg-slate-800 rounded w-28" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-5">
              <FileText className="h-7 w-7 text-slate-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-300 mb-2">No documents uploaded yet</h2>
            <p className="text-sm text-slate-600 mb-6 max-w-xs">
              Upload SAP PDFs to get a deep, context-aware index of their contents.
            </p>
            <Link
              to="/documents"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2.5 text-sm font-medium text-white transition-colors shadow-md shadow-sky-900/30"
            >
              <FileText className="h-4 w-4" />
              Upload documents
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-600 py-16 text-sm">No match for "{search}"</p>
        ) : (
          <div className="space-y-4">
            {filtered.map(doc => (
              <DocIndexCard key={doc.id} doc={doc} onAsk={handleAsk} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}