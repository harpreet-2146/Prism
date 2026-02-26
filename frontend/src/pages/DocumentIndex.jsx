// frontend/src/pages/DocumentIndex.jsx
// Home page: doc gallery → click → split view (TOC + chat)

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, BookOpen, ChevronRight, ChevronDown, Clock,
  CheckCircle2, AlertTriangle, Loader2, RefreshCw,
  Hash, Tag, Layers, Search, ArrowLeft, Zap, MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Uses the project's axios instance — no double /api prefix
import api from '@/lib/api';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'READY' || s === 'DONE') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
      <CheckCircle2 className="h-3 w-3" /> Ready
    </span>
  );
  if (s === 'PROCESSING' || s === 'PENDING' || s === 'QUEUED') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
      <Loader2 className="h-3 w-3 animate-spin" /> Processing
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-50 border border-stone-200 rounded-full px-2 py-0.5">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

// ─── Document card (gallery) ──────────────────────────────────────────────────
function DocCard({ doc, onOpen }) {
  const ready = ['COMPLETED', 'READY', 'DONE'].includes((doc.status || '').toUpperCase());
  return (
    <button
      onClick={() => ready && onOpen(doc)}
      disabled={!ready}
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border bg-white p-5 text-left transition-all duration-200',
        ready
          ? 'border-stone-200 hover:border-stone-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] cursor-pointer'
          : 'border-stone-100 opacity-60 cursor-not-allowed',
      )}
    >
      {/* Icon */}
      <div className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
        ready ? 'bg-blue-50 group-hover:bg-blue-100' : 'bg-stone-100',
      )}>
        <FileText className={cn('h-5 w-5', ready ? 'text-blue-500' : 'text-stone-400')} />
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-stone-800 leading-snug line-clamp-2">
          {doc.originalName}
        </h3>
        {doc.pageCount && (
          <p className="mt-1 text-xs text-stone-400">{doc.pageCount} pages</p>
        )}
      </div>

      {/* Status + arrow */}
      <div className="flex items-center justify-between">
        <StatusBadge status={doc.status} />
        {ready && (
          <ChevronRight className="h-4 w-4 text-stone-300 group-hover:text-stone-500 group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
    </button>
  );
}

// ─── TOC leaf chip ────────────────────────────────────────────────────────────
function TCodeChip({ code, onClick }) {
  return (
    <button onClick={onClick}
      className="font-mono text-[11px] px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 transition-colors">
      {code}
    </button>
  );
}
function ConceptChip({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors">
      {label}
    </button>
  );
}

// ─── Section row ─────────────────────────────────────────────────────────────
function SectionRow({ section, index, docName, onSelect }) {
  const [open, setOpen] = useState(false);
  const hasChildren = section.subtopics?.length || section.concepts?.length || section.tcodes?.length;

  const ask = (query) => onSelect({ label: section.title, query });
  const askTopic = (t) => onSelect({ label: t, query: `In the "${section.title}" section of ${docName}, explain: ${t}` });
  const askConcept = (c) => onSelect({ label: c, query: `Explain the SAP concept "${c}" as described in the "${section.title}" section of ${docName}` });
  const askTCode = (tc) => onSelect({ label: tc, query: `What is T-code ${tc} used for in ${docName}? Explain its purpose and usage from the "${section.title}" section.` });

  return (
    <div>
      <div className={cn('group flex items-start rounded-xl transition-colors', open && 'bg-stone-50')}>
        {/* Toggle */}
        <button onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 mt-0.5 text-stone-300 hover:text-stone-600 transition-colors">
          {hasChildren
            ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
            : <div className="w-1 h-1 rounded-full bg-stone-300" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 py-2 pr-2">
          <button onClick={() => ask(`Give me a complete explanation of the "${section.title}" section in ${docName}, including all steps, configurations, and T-codes.`)}
            className="flex items-start gap-2.5 w-full text-left group/title">
            <span className="text-base leading-none mt-0.5 flex-shrink-0">{section.icon || '📄'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-stone-700 group-hover/title:text-stone-900 leading-snug transition-colors">
                  {index + 1}. {section.title}
                </span>
                {section.pages && (
                  <span className="flex-shrink-0 text-[10px] font-mono text-stone-400">p.{section.pages}</span>
                )}
              </div>
              {section.summary && (
                <p className="mt-0.5 text-[12px] text-stone-400 leading-snug">{section.summary}</p>
              )}
              {!open && section.tcodes?.slice(0, 3).map(tc => (
                <TCodeChip key={tc} code={tc} onClick={(e) => { e.stopPropagation(); askTCode(tc); }} />
              ))}
            </div>
          </button>
        </div>
      </div>

      {open && (
        <div className="ml-8 pl-4 border-l-2 border-stone-100 mb-1">
          {section.subtopics?.length > 0 && (
            <div className="py-1">
              {section.subtopics.map((t, i) => (
                <button key={i} onClick={() => askTopic(t)}
                  className="group flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                  <div className="w-1 h-1 rounded-full bg-stone-300 group-hover:bg-blue-400 transition-colors flex-shrink-0 mt-0.5" />
                  <span className="text-[12px] text-stone-500 group-hover:text-stone-800 leading-snug transition-colors">{t}</span>
                  <MessageSquare className="h-3 w-3 text-stone-300 group-hover:text-blue-400 flex-shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </div>
          )}

          {section.concepts?.length > 0 && (
            <div className="py-1.5 px-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1.5">Key Concepts</p>
              <div className="flex flex-wrap gap-1">
                {section.concepts.map(c => <ConceptChip key={c} label={c} onClick={() => askConcept(c)} />)}
              </div>
            </div>
          )}

          {section.tcodes?.length > 0 && (
            <div className="py-1.5 px-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1.5">T-Codes</p>
              <div className="flex flex-wrap gap-1">
                {section.tcodes.map(tc => <TCodeChip key={tc} code={tc} onClick={() => askTCode(tc)} />)}
              </div>
            </div>
          )}

          {section.warnings?.length > 0 && (
            <div className="py-1.5 px-2">
              <p className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold mb-1.5">⚠ Watch Out</p>
              <div className="space-y-1">
                {section.warnings.map((w, i) => (
                  <p key={i} className="text-[12px] text-amber-600 leading-snug">{w}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TOC panel ────────────────────────────────────────────────────────────────
function TOCPanel({ doc, indexData, loading, error, onGenerate, onSelect }) {
  const [search, setSearch] = useState('');
  const sections = indexData?.sections || [];
  const filtered = search.trim()
    ? sections.filter(s => {
        const q = search.toLowerCase();
        return s.title?.toLowerCase().includes(q)
          || s.summary?.toLowerCase().includes(q)
          || s.subtopics?.some(t => t.toLowerCase().includes(q))
          || s.tcodes?.some(t => t.toLowerCase().includes(q));
      })
    : sections;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-5 pb-3 border-b border-stone-100">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-stone-800 leading-snug line-clamp-2">{doc.originalName}</h2>
            {indexData?.overview && (
              <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{indexData.overview.description || indexData.overview.summary}</p>
            )}
          </div>
          <button onClick={onGenerate} title="Regenerate"
            className="flex-shrink-0 p-1.5 rounded-lg text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-all">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Stats */}
        {indexData && (
          <div className="flex flex-wrap gap-3 text-[11px] text-stone-400 mb-3">
            <span><strong className="text-stone-600">{sections.length}</strong> sections</span>
            {indexData.allTcodes?.length > 0 && <span><strong className="text-stone-600">{indexData.allTcodes.length}</strong> T-codes</span>}
            {doc.pageCount && <span><strong className="text-stone-600">{doc.pageCount}</strong> pages</span>}
          </div>
        )}

        {/* Search */}
        {indexData && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-300 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search topics, T-codes…"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-2 text-[12px] text-stone-600 placeholder-stone-300 focus:outline-none focus:border-blue-300 focus:bg-white transition-all" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
        {loading && (
          <div className="flex flex-col items-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
            <p className="text-xs text-stone-400">Generating index…</p>
            <p className="text-[11px] text-stone-300">This takes 10–20s for large docs</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <p className="text-xs text-stone-500">{error}</p>
            <button onClick={onGenerate} className="text-xs text-blue-500 hover:text-blue-600 underline">Retry</button>
          </div>
        )}

        {!loading && !error && !indexData && (
          <div className="flex flex-col items-center py-16 gap-4">
            <BookOpen className="h-8 w-8 text-stone-200" />
            <p className="text-xs text-stone-400 text-center">No index yet for this document</p>
            <button onClick={onGenerate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors shadow-sm shadow-blue-100">
              <Zap className="h-3.5 w-3.5" /> Generate Index
            </button>
          </div>
        )}

        {!loading && !error && indexData && filtered.length === 0 && (
          <div className="flex flex-col items-center py-12 text-stone-300">
            <Search className="h-5 w-5 mb-2" />
            <p className="text-xs">No results for "{search}"</p>
          </div>
        )}

        {!loading && !error && indexData && (
          <div>
            {/* Quick: entire doc */}
            <button onClick={() => onSelect({ label: doc.originalName, query: `Give me a comprehensive overview of the entire "${doc.originalName}" document — all main sections, key T-codes, configurations, and important concepts.` })}
              className="group flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl hover:bg-stone-50 transition-colors mb-1">
              <Layers className="h-3.5 w-3.5 text-stone-300 group-hover:text-blue-400 transition-colors" />
              <span className="text-[12px] font-medium text-stone-500 group-hover:text-stone-800 transition-colors">Entire document overview</span>
              <MessageSquare className="h-3 w-3 text-stone-200 group-hover:text-blue-400 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
            </button>

            <div className="h-px bg-stone-100 mx-2 my-2" />

            {filtered.map((section, i) => (
              <SectionRow key={i} section={section} index={i} docName={doc.originalName} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat hint panel ──────────────────────────────────────────────────────────
function ChatHint({ selection, doc, onClear }) {
  const navigate = useNavigate();

  if (!selection) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
          <BookOpen className="h-6 w-6 text-stone-300" />
        </div>
        <h3 className="text-sm font-semibold text-stone-600 mb-1">Select a topic</h3>
        <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
          Pick any section, subtopic, concept, or T-code from the table of contents to start a focused conversation.
        </p>
      </div>
    );
  }

  const handleAsk = () => {
    navigate(`/chat?q=${encodeURIComponent(selection.query)}`);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-white border border-stone-200 shadow-[0_4px_24px_rgba(0,0,0,0.05)] p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">Selected topic</span>
          </div>
          <h3 className="text-base font-semibold text-stone-800 leading-snug mb-3">{selection.label}</h3>
          <p className="text-sm text-stone-400 leading-relaxed">
            How can I help you with <span className="text-stone-600 font-medium">{selection.label}</span>?
          </p>
        </div>

        <button onClick={handleAsk}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium transition-colors shadow-sm">
          <MessageSquare className="h-4 w-4" />
          Open in Chat
        </button>

        <button onClick={onClear} className="mt-2 text-xs text-stone-400 hover:text-stone-600 transition-colors">
          Clear selection
        </button>
      </div>
    </div>
  );
}

// ─── Document workspace (TOC + chat hint) ─────────────────────────────────────
function DocWorkspace({ doc, onBack }) {
  const [indexData, setIndexData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try load existing first
      const existingRes = await api.get(`/documents/${doc.id}`);
      const existing = existingRes.data?.data || existingRes.data || {};
      const existIdx = existing.indexData || existing.index;
      if (existIdx) {
        setIndexData(typeof existIdx === 'string' ? JSON.parse(existIdx) : existIdx);
        return;
      }
      // Generate
      const genRes = await api.post(`/documents/${doc.id}/generate-index`);
      const result = genRes.data?.data || genRes.data || {};
      const idx = result.indexData || result.index || result;
      setIndexData(typeof idx === 'string' ? JSON.parse(idx) : idx);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  useEffect(() => { generate(); }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Workspace header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 h-13 border-b border-stone-100 bg-white">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          All documents
        </button>
        <div className="w-px h-4 bg-stone-200" />
        <span className="text-xs font-medium text-stone-600 truncate">{doc.originalName}</span>
      </div>

      {/* Split: TOC left + Chat hint right */}
      <div className="flex flex-1 min-h-0">
        {/* TOC — wider */}
        <div className="w-80 flex-shrink-0 border-r border-stone-100 overflow-hidden bg-white">
          <TOCPanel
            doc={doc}
            indexData={indexData}
            loading={loading}
            error={error}
            onGenerate={generate}
            onSelect={setSelection}
          />
        </div>

        {/* Chat hint / context launcher */}
        <div className="flex-1 min-w-0 bg-stone-50/50">
          <ChatHint selection={selection} doc={doc} onClear={() => setSelection(null)} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DocumentIndex() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get('/documents')
      .then(r => {
        const d = r.data?.data || r.data || {};
        return Array.isArray(d) ? d : (d.documents || []);
      })
      .then(docs => setDocuments(docs))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex h-full items-center justify-center bg-stone-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
        <p className="text-sm text-stone-400">Loading documents…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex h-full items-center justify-center bg-stone-50">
      <p className="text-sm text-stone-500">{error}</p>
    </div>
  );

  // Show workspace for selected doc
  if (selected) return (
    <div className="h-full bg-white">
      <DocWorkspace doc={selected} onBack={() => setSelected(null)} />
    </div>
  );

  // Gallery
  return (
    <div className="h-full bg-stone-50 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-stone-400">
            Select a document to explore its table of contents and ask focused questions.
          </p>
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-stone-200 flex items-center justify-center shadow-sm">
              <FileText className="h-7 w-7 text-stone-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-600 mb-1">No documents yet</h2>
              <p className="text-sm text-stone-400">Upload SAP PDF files to get started.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => (
              <DocCard key={doc.id} doc={doc} onOpen={setSelected} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}