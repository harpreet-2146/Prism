import { useEffect, useRef, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Mermaid (for LLM-generated decision branches only) ──────────────────────
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
            edgeLabelBackground: '#f8fafc', fontSize: '12px',
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
  return <div ref={ref} className="overflow-x-auto" />;
}

// ── Custom SVG Step Pipeline ─────────────────────────────────────────────────
function StepPipeline({ steps, currentIdx }) {
  const start = Math.max(0, currentIdx - 1);
  const end = Math.min(steps.length - 1, currentIdx + 3);
  const visible = steps.slice(start, end + 1);

  const getLabel = (s) =>
    s.clean
      .replace(/^\*\*Step\s+\d+[:\-–]?\s*/i, '')
      .replace(/\*\*/g, '')
      .split(/[.!\n]/)[0]
      .trim()
      .slice(0, 40);

  const nodeW = 150;
  const nodeH = 56;
  const arrowW = 24;
  const totalW = visible.length * nodeW + (visible.length - 1) * arrowW;
  const svgH = nodeH + 24;

  return (
    <div className="ml-10 mt-2 mb-1">
      <svg
        viewBox={`0 0 ${totalW} ${svgH}`}
        width="100%"
        style={{ maxWidth: totalW, height: 'auto', overflow: 'visible' }}
      >
        <defs>
          <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#6366f1" opacity="0.5" />
          </marker>
          <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.25" />
          </filter>
        </defs>

        {visible.map((s, i) => {
          const realIdx = start + i;
          const isActive = realIdx === currentIdx;
          const isPast = realIdx < currentIdx;
          const x = i * (nodeW + arrowW);
          const y = 12;
          const rx = 8;
          const label = getLabel(s);
          const stepNum = realIdx + 1;

          return (
            <g key={realIdx}>
              {/* Arrow between nodes */}
              {i < visible.length - 1 && (
                <line
                  x1={x + nodeW + 2}
                  y1={y + nodeH / 2}
                  x2={x + nodeW + arrowW - 2}
                  y2={y + nodeH / 2}
                  stroke={isPast || isActive ? '#6366f1' : '#cbd5e1'}
                  strokeWidth="1.5"
                  strokeOpacity={isPast || isActive ? '0.6' : '0.4'}
                  markerEnd="url(#arr)"
                  strokeDasharray={isActive ? '0' : isPast ? '0' : '4 3'}
                />
              )}

              {/* Node background */}
              <rect
                x={x} y={y}
                width={nodeW} height={nodeH}
                rx={rx}
                fill={isActive ? 'url(#activeGrad)' : isPast ? '#f1f5f9' : '#f8fafc'}
                stroke={isActive ? '#4338ca' : isPast ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={isActive ? '1.5' : '1'}
                filter={isActive ? 'url(#shadow)' : 'none'}
              />

              {/* Checkmark for past steps */}
              {isPast && (
                <text x={x + 10} y={y + 16} fontSize="9" fill="#6366f1" fontWeight="700">✓</text>
              )}

              {/* Step number pill */}
              <rect
                x={x + (isPast ? 18 : 8)} y={y + 6}
                width={18} height={14}
                rx={4}
                fill={isActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0'}
              />
              <text
                x={x + (isPast ? 27 : 17)} y={y + 17}
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill={isActive ? '#fff' : '#64748b'}
                fontFamily="monospace"
              >
                {stepNum}
              </text>

              {/* Label — wrap at ~14 chars */}
              {(() => {
                const words = label.split(' ');
                const lines = [];
                let line = '';
                for (const w of words) {
                  if ((line + " " + w).trim().length > 20 && line) {
                    lines.push(line.trim());
                    line = w;
                  } else {
                    line = (line + ' ' + w).trim();
                  }
                }
                if (line) lines.push(line.trim());
                const lineH = 10;
                const totalTextH = lines.length * lineH;
                const startY = y + nodeH / 2 - totalTextH / 2 + lineH * 0.7;
                const textX = x + (isPast ? 28 : 18) + (nodeW - (isPast ? 28 : 18) - 4) / 2;

                return lines.slice(0, 3).map((l, li) => (
                  <text
                    key={li}
                    x={textX}
                    y={startY + li * lineH}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight={isActive ? '600' : '400'}
                    fill={isActive ? '#fff' : isPast ? '#475569' : '#94a3b8'}
                    fontFamily="system-ui, sans-serif"
                  >
                    {l}{li === 2 && lines.length > 3 ? '…' : ''}
                  </text>
                ));
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
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

      {/* Lightbox */}
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
            >
              ✕ close
            </button>
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
      (m[1].match(/\d+/g) || []).forEach(n => pages.add(parseInt(n)));
    return Array.from(pages);
  }

  function imagesForPages(pages) {
    if (!pages.length || !parsedImages.length) return [];
    return parsedImages.filter(img => pages.includes(img.pageNumber));
  }

  function parseSteps(text) {
    const parts = text.split(/(?=\*\*Step\s+\d+)/gi).filter(Boolean);
    if (parts.length <= 1) return null;
    return parts.map(part => ({
      raw: part,
      clean: part.replace(/\[Ref:[^\]]+\]/gi, '').trim(),
      refs: part.match(/\[Ref:[^\]]+\]/gi) || [],
      pages: extractExactPages(part),
      hasMermaid: /```\s*mermaid/i.test(part)
    }));
  }

  const steps = parseSteps(content);

  const stepImages = useMemo(() => {
    if (!steps) return [];
    const used = new Set();
    return steps.map(step => {
      const result = [];
      for (const img of imagesForPages(step.pages)) {
        if (!used.has(img.url) && result.length < 2) { used.add(img.url); result.push(img); }
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
          const hasMermaid = step.hasMermaid;
          const showPipeline = !hasImg && !hasMermaid && steps.length > 1;
          const isLast = idx === steps.length - 1;

          return (
            <div key={idx} className="relative flex gap-0">
              {/* Left rail: number + line */}
              <div className="flex flex-col items-center" style={{ width: 36, minWidth: 36 }}>
                {/* Circle */}
                <div className={`
                  relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                  text-[11px] font-bold transition-all duration-200
                  ${hasImg
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900'
                    : 'bg-muted border-2 border-border text-muted-foreground'
                  }
                `}>
                  {hasImg ? (
                    <span className="text-[10px]">📷</span>
                  ) : (
                    idx + 1
                  )}
                </div>
                {/* Connector line */}
                {!isLast && (
                  <div className={`w-px flex-1 my-1 ${hasImg ? 'bg-indigo-200 dark:bg-indigo-900' : 'bg-border'}`}
                    style={{ minHeight: 20 }} />
                )}
              </div>

              {/* Right: content */}
              <div className="flex-1 min-w-0 pb-5 pt-0.5 pl-3">
                <RichContent text={step.clean} />

                {step.refs.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground/35 italic tracking-wide">
                    {step.refs.join(' ')}
                  </p>
                )}

                {/* Images with lightbox */}
                {hasImg && (
                  <div className={`mt-2 grid gap-2 ${imgs.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {imgs.map((img, i) => <StepImage key={i} img={img} />)}
                  </div>
                )}

                {/* SVG pipeline for image-less steps */}
                {showPipeline && <StepPipeline steps={steps} currentIdx={idx} />}
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
  const imgs = imagesForPages(extractExactPages(content)).slice(0, 4);
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