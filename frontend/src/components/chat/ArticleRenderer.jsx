// frontend/src/components/chat/ArticleRenderer.jsx
// Renders SAP step responses as a proper technical document, not a chat message.
// Parses **Step N: Title** structure into sections with Navigation/Action/Result/Watch Out.

import { useEffect, useRef, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Mermaid ───────────────────────────────────────────────────────────────────
function MermaidDiagram({ chart }) {
  const ref = useRef(null);
  const id = useRef(`mmd-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let dead = false;
    import('mermaid').then(m => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false, theme: 'base',
        themeVariables: {
          primaryColor: '#1e40af', primaryTextColor: '#fff',
          primaryBorderColor: '#93c5fd', lineColor: '#64748b',
          fontSize: '13px', fontFamily: 'ui-mono, monospace',
        },
        flowchart: { curve: 'linear', padding: 20, nodeSpacing: 50, rankSpacing: 40 }
      });
      // Auto-fix common invalid syntax: -->|label|> → -->|label|
      const fixedChart = chart.trim()
        .replace(/\|([^|]*)\|>/g, '|$1|')
        .replace(/-->/g, ' --> '); // ensure spacing
      mermaid.render(id.current, fixedChart).then(({ svg }) => {
        if (!dead && ref.current) {
          ref.current.innerHTML = svg;
          const el = ref.current.querySelector('svg');
          if (el) { el.style.maxWidth = '100%'; el.style.height = 'auto'; }
        }
      }).catch(() => { if (!dead && ref.current) ref.current.style.display = 'none'; });
    });
    return () => { dead = true; };
  }, [chart]);
  return (
    <div ref={ref}
      className="my-6 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm" />
  );
}

function splitMermaid(text) {
  const segs = [];
  const re = /```\s*mermaid\s*\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'md', content: text.slice(last, m.index) });
    segs.push({ type: 'mermaid', content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'md', content: text.slice(last) });
  return segs.length ? segs : [{ type: 'md', content: text }];
}

// ── Prose renderer ────────────────────────────────────────────────────────────
function Prose({ text }) {
  const segs = useMemo(() => splitMermaid(text), [text]);
  return (
    <div>
      {segs.map((seg, i) =>
        seg.type === 'mermaid' ? (
          <MermaidDiagram key={i} chart={seg.content} />
        ) : seg.content.trim() ? (
          <div key={i} className="
            prose prose-slate max-w-none
            prose-p:text-[1rem] prose-p:leading-[1.9] prose-p:text-slate-700 prose-p:my-3
            prose-h1:text-2xl prose-h1:font-bold prose-h1:text-slate-900 prose-h1:mt-8 prose-h1:mb-4 prose-h1:tracking-tight
            prose-h2:text-xl prose-h2:font-bold prose-h2:text-slate-900 prose-h2:mt-7 prose-h2:mb-3
            prose-h3:text-base prose-h3:font-bold prose-h3:text-slate-800 prose-h3:mt-5 prose-h3:mb-2 prose-h3:uppercase prose-h3:tracking-wide prose-h3:text-xs
            prose-strong:font-semibold prose-strong:text-slate-900
            prose-li:text-[1rem] prose-li:leading-[1.85] prose-li:text-slate-700
            prose-ul:my-3 prose-ol:my-3
            prose-code:text-[0.83em] prose-code:text-blue-700 prose-code:bg-blue-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:border prose-code:border-blue-100
            prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:bg-blue-50/50 prose-blockquote:text-slate-600 prose-blockquote:py-2 prose-blockquote:not-italic
            prose-table:text-sm prose-th:bg-slate-100 prose-th:text-slate-600 prose-th:font-semibold prose-td:text-slate-600
            prose-hr:border-slate-200
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
          </div>
        ) : null
      )}
    </div>
  );
}

// ── Zoomable screenshot ───────────────────────────────────────────────────────
function Screenshot({ img }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure
        onClick={() => setOpen(true)}
        className="group cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 m-0"
      >
        <img
          src={img.url}
          alt={`Screenshot — page ${img.pageNumber}`}
          className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.01]"
          loading="lazy"
          onError={e => e.currentTarget.closest('figure').style.display = 'none'}
        />
        <figcaption className="px-3 py-1.5 text-[11px] text-slate-400 font-mono border-t border-slate-100">
          p.{img.pageNumber}
        </figcaption>
      </figure>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="relative max-h-[92vh] max-w-[92vw] overflow-auto rounded-2xl shadow-2xl">
            <img src={img.url} alt="" className="h-auto w-auto max-h-[88vh] rounded-2xl" />
            <button onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white font-mono hover:bg-black/70">
              esc
            </button>
            <span className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-0.5 text-[11px] text-white font-mono">
              p.{img.pageNumber}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ── Nav path renderer ─────────────────────────────────────────────────────────
function NavPath({ text }) {
  // Split on > or → and render as breadcrumb path
  const parts = text.split(/\s*[>→]\s*/).filter(Boolean);
  if (parts.length <= 1) {
    return <span className="text-[0.9375rem] text-slate-700 leading-relaxed">{text}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[0.8125rem]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300 select-none">›</span>}
          <span className={i === parts.length - 1
            ? 'text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100'
            : 'text-slate-500'
          }>{part.trim()}</span>
        </span>
      ))}
    </div>
  );
}

// ── Parse step content into labelled sub-sections ─────────────────────────────
function parseSubsections(text) {
  // Labels we recognise (case insensitive)
  const labels = ['Navigation', 'Action', 'Result', 'Watch Out', 'Note', 'Warning'];
  const re = new RegExp(`(${labels.join('|')})\\s*:`, 'gi');

  const sections = [];
  let lastIndex = 0;
  let lastLabel = null;
  let match;
  const matches = [];

  // Collect all label positions
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    matches.push({ label: match[1], index: match.index, end: match.index + match[0].length });
  }

  if (matches.length === 0) return null; // No structured content found

  // Preamble before first label
  if (matches[0].index > 0) {
    const preamble = text.slice(0, matches[0].index).trim();
    if (preamble) sections.push({ label: null, content: preamble });
  }

  matches.forEach((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(m.end, end).replace(/\[Ref:[^\]]+\]/gi, '').trim();
    const refs = text.slice(m.end, end).match(/\[Ref:[^\]]+\]/gi) || [];
    sections.push({ label: m.label, content, refs });
  });

  return sections;
}

// ── Subsection block ──────────────────────────────────────────────────────────
function SubSection({ label, content }) {
  if (!content.trim()) return null;

  const lowerLabel = label?.toLowerCase();

  if (lowerLabel === 'navigation') {
    return (
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Navigation</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <NavPath text={content} />
        </div>
      </div>
    );
  }

  if (lowerLabel === 'action') {
    return (
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Action</p>
        <div className="space-y-0">
          <Prose text={content} />
        </div>
      </div>
    );
  }

  if (lowerLabel === 'result') {
    return (
      <div className="mb-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Result</p>
          </div>
          <div className="text-[0.9375rem] text-emerald-800 leading-relaxed">{content}</div>
        </div>
      </div>
    );
  }

  if (lowerLabel === 'watch out' || lowerLabel === 'warning' || lowerLabel === 'note') {
    return (
      <div className="mb-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">⚠</span>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
              {label}
            </p>
          </div>
          <div className="text-[0.9375rem] text-amber-800 leading-relaxed">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {label && <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">{label}</p>}
      <Prose text={content} />
    </div>
  );
}

// ── Page ref extractor ────────────────────────────────────────────────────────
function extractPages(text) {
  const pages = new Set();
  const pat = /\[Ref:\s*Pages?\s*([\d,\s\-–]+)\]/gi;
  let m;
  while ((m = pat.exec(text)) !== null) {
    (m[1].match(/\d+/g) || []).forEach(n => {
      const p = parseInt(n);
      // Exact match only — backend already does ±1 expansion. Frontend ±1 causes duplicate images.
      pages.add(p);
    });
  }
  return Array.from(pages).filter(p => p > 0);
}

// ── Single article step section ───────────────────────────────────────────────
function StepSection({ stepNum, title, body, images, isLast }) {
  const subsections = parseSubsections(body);
  const refs = body.match(/\[Ref:[^\]]+\]/gi) || [];

  return (
    <section className="mb-0">
      {/* Step header */}
      <div className="flex items-start gap-5 mb-6">
        <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white shadow-sm shadow-slate-900/20 mt-0.5">
          <span className="text-[11px] font-bold font-mono tracking-widest leading-none">
            {String(stepNum).padStart(2, '0')}
          </span>
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h2 className="text-[1.1875rem] font-bold text-slate-900 leading-tight tracking-tight">
            {title}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="pl-[68px]">
        {subsections
          ? subsections.map((sub, i) => (
              <SubSection key={i} label={sub.label} content={sub.content} />
            ))
          : <Prose text={body.replace(/\[Ref:[^\]]+\]/gi, '').trim()} />
        }

        {/* Page refs */}
        {refs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {refs.map((r, i) => (
              <span key={i} className="inline-flex items-center text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Screenshots */}
        {images.length > 0 && (
          <div className={`grid gap-3 mb-6 ${images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1 max-w-xl'}`}>
            {images.map((img, i) => <Screenshot key={i} img={img} />)}
          </div>
        )}
      </div>

      {/* Section divider */}
      {!isLast && <hr className="border-slate-100 mb-10" />}
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ArticleRenderer({ content, images = [] }) {
  let parsedImages = [];
  try {
    parsedImages = typeof images === 'string' ? JSON.parse(images) : (Array.isArray(images) ? images : []);
  } catch { parsedImages = []; }

  // ── Parse steps ─────────────────────────────────────────────────────────
  const steps = useMemo(() => {
    const parts = content.split(/(?=\*\*Step\s+\d+)/gi).filter(Boolean);
    if (parts.length <= 1) return null;

    return parts.map(part => {
      // Extract step number and title from **Step N: Title** or **Step N - Title**
      const headerMatch = part.match(/^\*\*Step\s+(\d+)[:\s\-–]+([^*\n]+)\*\*/i);
      const stepNum = headerMatch ? parseInt(headerMatch[1]) : null;
      const title = headerMatch ? headerMatch[2].trim() : part.slice(0, 80).replace(/\*\*/g, '');
      const body = headerMatch
        ? part.slice(headerMatch[0].length).trim()
        : part;

      const pages = extractPages(body);
      return { stepNum, title, body, pages };
    });
  }, [content]);

  // ── Assign images to steps (deduplicated) ────────────────────────────────
  const stepImages = useMemo(() => {
    if (!steps) return [];
    const used = new Set();
    return steps.map(step => {
      const candidates = parsedImages.filter(img => step.pages.includes(img.pageNumber));
      const result = [];
      for (const img of candidates) {
        if (!used.has(img.url) && result.length < 3) {
          used.add(img.url);
          result.push(img);
        }
      }
      return result;
    });
  }, [content, parsedImages.length]);

  // ── Extract doc-level title from first step or content ───────────────────
  const docTitle = useMemo(() => {
    if (steps && steps.length > 0) {
      // Try to find an H1 before the first step
      const beforeFirstStep = content.split(/\*\*Step\s+\d+/i)[0];
      const h1 = beforeFirstStep.match(/^#+\s+(.+)$/m);
      if (h1) return h1[1].trim();
    }
    return null;
  }, [content]);

  // ── Fallback: no step structure ──────────────────────────────────────────
  if (!steps) {
    const refs = content.match(/\[Ref:[^\]]+\]/gi) || [];
    const clean = content.replace(/\[Ref:[^\]]+\]/gi, '').trim();
    const pages = extractPages(content);
    const imgs = parsedImages.filter(img => pages.includes(img.pageNumber)).slice(0, 8);

    return (
      <article className="article-body">
        <Prose text={clean} />
        {refs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {refs.map((r, i) => (
              <span key={i} className="text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">{r}</span>
            ))}
          </div>
        )}
        {imgs.length > 0 && (
          <div className={`mt-5 grid gap-3 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1 max-w-xl'}`}>
            {imgs.map((img, i) => <Screenshot key={i} img={img} />)}
          </div>
        )}
      </article>
    );
  }

  // ── Step article ─────────────────────────────────────────────────────────
  return (
    <article className="article-body">
      {docTitle && (
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-8 pb-6 border-b border-slate-200">
          {docTitle}
        </h1>
      )}
      {steps.map((step, idx) => (
        <StepSection
          key={idx}
          stepNum={step.stepNum ?? idx + 1}
          title={step.title}
          body={step.body}
          images={stepImages[idx] || []}
          isLast={idx === steps.length - 1}
        />
      ))}
    </article>
  );
}