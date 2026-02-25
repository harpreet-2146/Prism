import { useEffect, useRef, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Mermaid (decision branches only) ────────────────────────────────────────
function MermaidDiagram({ chart }) {
  const ref = useRef(null);
  const id = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false, theme: 'base',
          themeVariables: {
            primaryColor: '#6366f1', primaryTextColor: '#fff',
            primaryBorderColor: '#4338ca', lineColor: '#6366f1',
            fontSize: '12px',
          },
          flowchart: { curve: 'linear', padding: 20, nodeSpacing: 60, rankSpacing: 50 }
        });
        const { svg } = await mermaid.render(id.current, chart.trim());
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled && ref.current) ref.current.style.display = 'none';
      }
    }
    render();
    return () => { cancelled = true; };
  }, [chart]);
  return <div ref={ref} className="overflow-x-auto my-3 rounded-xl border bg-muted/10 p-3" />;
}

// ── Split mermaid blocks ──────────────────────────────────────────────────────
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

function RichContent({ text }) {
  const segs = useMemo(() => splitMermaidBlocks(text), [text]);
  return (
    <>
      {segs.map((seg, i) =>
        seg.type === 'mermaid' ? (
          <MermaidDiagram key={i} chart={seg.content} />
        ) : seg.content.trim() ? (
          <div key={i} className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-li:my-0.5">
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
        className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-border/40 bg-muted/10 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-primary/30"
      >
        <img
          src={img.url}
          alt={`p.${img.pageNumber}`}
          className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.015]"
          loading="lazy"
          onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
        />
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="rounded-md bg-black/60 px-2 py-0.5 text-[9px] text-white backdrop-blur-sm">
            🔍 p.{img.pageNumber}
          </span>
        </div>
      </div>
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-xl shadow-2xl">
            <img src={img.url} alt={`p.${img.pageNumber}`} className="h-auto w-auto max-h-[88vh]" />
            <button
              onClick={() => setZoomed(false)}
              className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
            >✕</button>
            <p className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white">
              p.{img.pageNumber}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StepByStepGuide({ content, images = [] }) {
  let parsedImages = [];
  try {
    if (typeof images === 'string') parsedImages = JSON.parse(images);
    else if (Array.isArray(images)) parsedImages = images;
  } catch (e) { parsedImages = []; }

  function extractExactPages(text) {
    const pages = new Set();
    const pat = /\[Ref:\s*Pages?\s*([\d,\s\-–]+)\]/gi;
    let m;
    while ((m = pat.exec(text)) !== null)
      (m[1].match(/\d+/g) || []).forEach(n => {
        const p = parseInt(n);
        // ±1 page expansion for better image coverage
        pages.add(p - 1); pages.add(p); pages.add(p + 1);
      });
    return Array.from(pages).filter(p => p > 0);
  }

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
      hasMermaid: /```\s*mermaid/i.test(part)
    }));
  }

  const steps = parseSteps(content);

  // Assign images per step — up to 4 per step, track globally to avoid dupes
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

  if (steps) {
    return (
      <div className="space-y-0">
        {steps.map((step, idx) => {
          const imgs = stepImages[idx] || [];
          const hasImg = imgs.length > 0;
          const isLast = idx === steps.length - 1;

          return (
            <div key={idx} className="relative flex gap-0">
              {/* Timeline rail */}
              <div className="flex flex-col items-center" style={{ width: 36, minWidth: 36 }}>
                <div className={`
                  relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                  text-[11px] font-bold transition-all duration-200
                  ${hasImg
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900'
                    : 'bg-muted border-2 border-border text-muted-foreground'
                  }
                `}>
                  {hasImg ? <span className="text-[10px]">📷</span> : idx + 1}
                </div>
                {!isLast && (
                  <div
                    className={`w-px flex-1 my-1 ${hasImg ? 'bg-indigo-200 dark:bg-indigo-900' : 'bg-border'}`}
                    style={{ minHeight: 20 }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-6 pt-0.5 pl-3">
                <RichContent text={step.clean} />

                {step.refs.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground/35 italic tracking-wide">
                    {step.refs.join(' ')}
                  </p>
                )}

                {/* Images — up to 4, 2-column grid */}
                {hasImg && (
                  <div className={`mt-2 grid gap-2 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
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

  // Fallback
  const refs = content.match(/\[Ref:[^\]]+\]/gi) || [];
  const clean = content.replace(/\[Ref:[^\]]+\]/gi, '').trim();
  const imgs = imagesForPages(extractExactPages(content)).slice(0, 6);
  return (
    <div className="space-y-4">
      <RichContent text={clean} />
      {refs.length > 0 && <p className="text-[10px] text-muted-foreground/35 italic">{refs.join(' ')}</p>}
      {imgs.length > 0 && (
        <div className={`grid gap-2 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {imgs.map((img, i) => <StepImage key={i} img={img} />)}
        </div>
      )}
    </div>
  );
}