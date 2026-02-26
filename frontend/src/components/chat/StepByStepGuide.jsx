// frontend/src/components/chat/StepByStepGuide.jsx
// Restored from original logic, updated to light theme (Notion-style)

import { useEffect, useRef, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Mermaid ───────────────────────────────────────────────────────────────────
function MermaidDiagram({ chart }) {
  const ref = useRef(null);
  const id = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#3b82f6',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#bfdbfe',
            lineColor: '#94a3b8',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#f8fafc',
            fontSize: '12px',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          },
          flowchart: { curve: 'linear', padding: 20, nodeSpacing: 50, rankSpacing: 44 },
        });
        const { svg } = await mermaid.render(id.current, chart.trim());
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          const svgEl = ref.current.querySelector('svg');
          if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
        }
      } catch (e) {
        // Silently hide on parse error — backend sometimes sends malformed mermaid
        if (!cancelled && ref.current) ref.current.style.display = 'none';
      }
    }
    render();
    return () => { cancelled = true; };
  }, [chart]);

  return (
    <div ref={ref}
      className="overflow-x-auto my-4 rounded-2xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm" />
  );
}

// ── Split mermaid out of markdown ─────────────────────────────────────────────
function splitMermaidBlocks(text) {
  const segs = [];
  const regex = /```\s*mermaid\s*\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'md', content: text.slice(last, m.index) });
    segs.push({ type: 'mermaid', content: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'md', content: text.slice(last) });
  return segs.length ? segs : [{ type: 'md', content: text }];
}

// ── Markdown renderer — generous typography ───────────────────────────────────
function RichContent({ text }) {
  const segs = useMemo(() => splitMermaidBlocks(text), [text]);
  return (
    <>
      {segs.map((seg, i) =>
        seg.type === 'mermaid' ? (
          <MermaidDiagram key={i} chart={seg.content} />
        ) : seg.content.trim() ? (
          <div key={i} className="
            prose prose-stone max-w-none
            prose-p:text-[0.9375rem] prose-p:leading-[1.85] prose-p:text-stone-700 prose-p:my-3
            prose-h1:text-xl prose-h1:font-semibold prose-h1:text-stone-900 prose-h1:mt-6 prose-h1:mb-3
            prose-h2:text-lg prose-h2:font-semibold prose-h2:text-stone-900 prose-h2:mt-5 prose-h2:mb-2
            prose-h3:text-base prose-h3:font-semibold prose-h3:text-stone-800 prose-h3:mt-4 prose-h3:mb-1.5
            prose-strong:text-stone-900 prose-strong:font-semibold
            prose-li:text-[0.9375rem] prose-li:leading-[1.8] prose-li:text-stone-700 prose-li:my-1
            prose-ul:my-2 prose-ol:my-2
            prose-code:text-[0.82em] prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:border prose-code:border-blue-100
            prose-blockquote:border-l-blue-300 prose-blockquote:text-stone-500 prose-blockquote:bg-blue-50/40 prose-blockquote:py-2 prose-blockquote:rounded-r-lg
            prose-table:text-sm
            prose-th:text-stone-600 prose-th:font-semibold prose-th:bg-stone-50
            prose-td:text-stone-600
            prose-hr:border-stone-200
            prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
          </div>
        ) : null
      )}
    </>
  );
}

// ── Zoomable screenshot ───────────────────────────────────────────────────────
function StepImage({ img }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div
        onClick={() => setZoomed(true)}
        className="group relative cursor-zoom-in overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-sm transition-all duration-200 hover:shadow-md hover:border-stone-300"
      >
        <img
          src={img.url}
          alt={`p.${img.pageNumber}`}
          className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.012]"
          loading="lazy"
          onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
        />
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="rounded-lg bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm font-mono">
            p.{img.pageNumber}
          </span>
        </div>
      </div>
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw] overflow-auto rounded-2xl shadow-2xl">
            <img src={img.url} alt={`p.${img.pageNumber}`} className="h-auto w-auto max-h-[88vh] rounded-2xl" />
            <button onClick={() => setZoomed(false)}
              className="absolute top-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white hover:bg-black/70 font-mono">
              esc
            </button>
            <p className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2 py-0.5 text-[11px] text-white font-mono">
              p.{img.pageNumber}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ref extraction ───────────────────────────────────────────────────────
function extractExactPages(text) {
  const pages = new Set();
  const pat = /\[Ref:\s*Pages?\s*([\d,\s\-–]+)\]/gi;
  let m;
  while ((m = pat.exec(text)) !== null) {
    (m[1].match(/\d+/g) || []).forEach(n => {
      const p = parseInt(n);
      pages.add(p - 1); pages.add(p); pages.add(p + 1);
    });
  }
  return Array.from(pages).filter(p => p > 0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StepByStepGuide({ content, images = [] }) {
  let parsedImages = [];
  try {
    if (typeof images === 'string') parsedImages = JSON.parse(images);
    else if (Array.isArray(images)) parsedImages = images;
  } catch { parsedImages = []; }

  function imagesForPages(pages) {
    if (!pages.length || !parsedImages.length) return [];
    return parsedImages.filter(img => pages.includes(img.pageNumber));
  }

  function parseSteps(text) {
    const parts = text.split(/(?=\*\*Step\s+\d+)/gi).filter(Boolean);
    if (parts.length <= 1) return null;
    return parts.map(part => ({
      clean: part.replace(/\[Ref:[^\]]+\]/gi, '').trim(),
      refs: part.match(/\[Ref:[^\]]+\]/gi) || [],
      pages: extractExactPages(part),
      hasMermaid: /```\s*mermaid/i.test(part),
    }));
  }

  const steps = parseSteps(content);

  const stepImages = useMemo(() => {
    if (!steps) return [];
    const used = new Set();
    return steps.map(step => {
      const result = [];
      for (const img of imagesForPages(step.pages)) {
        if (!used.has(img.url) && result.length < 4) {
          used.add(img.url);
          result.push(img);
        }
      }
      return result;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, parsedImages.length]);

  // ── Step-by-step layout ───────────────────────────────────────────────────
  if (steps) {
    return (
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const imgs = stepImages[idx] || [];
          const hasImg = imgs.length > 0;
          const isLast = idx === steps.length - 1;

          return (
            <div key={idx} className="relative flex gap-0">
              {/* Timeline */}
              <div className="flex flex-col items-center" style={{ width: 36, minWidth: 36 }}>
                <div className={`
                  relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                  text-[11px] font-bold transition-all duration-200
                  ${hasImg
                    ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                    : 'bg-white border-2 border-stone-200 text-stone-400'
                  }
                `}>
                  {idx + 1}
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 my-1 ${hasImg ? 'bg-blue-100' : 'bg-stone-100'}`}
                    style={{ minHeight: 20 }} />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 pb-7 pt-0.5 pl-4">
                <RichContent text={step.clean} />

                {step.refs.length > 0 && (
                  <p className="mt-1 text-[10px] text-stone-300 italic">
                    {step.refs.join(' ')}
                  </p>
                )}

                {hasImg && (
                  <div className={`mt-3 grid gap-3 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {imgs.map((img, i) => <StepImage key={i} img={img} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Fallback (no step structure) ──────────────────────────────────────────
  const refs = content.match(/\[Ref:[^\]]+\]/gi) || [];
  const clean = content.replace(/\[Ref:[^\]]+\]/gi, '').trim();
  const allPages = extractExactPages(content);
  const imgs = imagesForPages(allPages).slice(0, 6);

  return (
    <div className="space-y-4">
      <RichContent text={clean} />
      {refs.length > 0 && <p className="text-[10px] text-stone-300 italic">{refs.join(' ')}</p>}
      {imgs.length > 0 && (
        <div className={`grid gap-3 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {imgs.map((img, i) => <StepImage key={i} img={img} />)}
        </div>
      )}
    </div>
  );
}