'use strict';

const prisma = require('../utils/prisma');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeMermaid(code) {
  return String(code || '')
    .replace(/\|([^|]+)\|>/g, '|$1|')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function parseMessageImages(images) {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter((i) => i?.url);
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed.filter((i) => i?.url) : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function renderImageGallery(images) {
  if (!images.length) return '';
  const items = images
    .slice(0, 8)
    .map((img) => `
      <figure class="shot">
        <img src="${escapeHtml(img.url)}" alt="Document screenshot page ${escapeHtml(img.pageNumber)}" />
        <figcaption>Page ${escapeHtml(img.pageNumber)}${img.imageIndex != null ? ` • Image ${escapeHtml(img.imageIndex)}` : ''}</figcaption>
      </figure>
    `)
    .join('\n');

  return `<div class="image-grid">${items}</div>`;
}

function renderStepContent(text) {
  let html = escapeHtml(text || '');

  html = html.replace(/```mermaid\s*([\s\S]*?)```/gi, (_, code) =>
    `<div class="mermaid">${escapeHtml(sanitizeMermaid(code.trim()))}</div>`
  );

  html = html.replace(/\*\*Step\s+(\d+)[:\s\-–]+([^\n*]+)\*\*/gi, (_, num, title) =>
    `<div class="step-header"><span class="step-num">${String(num).padStart(2, '0')}</span><h2>${escapeHtml(title.trim())}</h2></div>`
  );

  html = html.replace(/\bNavigation:\s*([^\n]+(?:\n(?!Action:|Result:|Watch Out:)[^\n]+)*)/gi, (_, nav) => {
    const parts = nav.trim().split(/\s*[>→]\s*/).filter(Boolean);
    const crumb = parts.map((p, i) =>
      i === parts.length - 1
        ? `<span class="nav-last">${escapeHtml(p.trim())}</span>`
        : `<span class="nav-part">${escapeHtml(p.trim())}</span>`
    ).join('<span class="nav-sep">›</span>');
    return `<div class="section-label">Navigation</div><div class="nav-path">${crumb}</div>`;
  });

  html = html.replace(/\bResult:\s*([^\n]+(?:\n(?!Watch Out:|Navigation:|Action:)[^\n]+)*)/gi, (_, body) =>
    `<div class="result-block"><div class="result-label">Result</div><div class="result-body">${escapeHtml(body.trim())}</div></div>`
  );

  html = html.replace(/\bWatch Out:\s*([^\n]+(?:\n(?!Result:|Navigation:|Action:|Step\s+\d+)[^\n]+)*)/gi, (_, body) =>
    `<div class="watchout-block"><div class="watchout-label">Watch Out</div><div class="watchout-body">${escapeHtml(body.trim())}</div></div>`
  );

  html = html.replace(/\bAction:\s*/gi, '<div class="section-label">Action</div>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ol>${m}</ol>`);
  html = html.replace(/^[*•-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/\[Ref:\s*Pages?\s*([\d,\s\-–]+)\]/gi, (m) =>
    `<span class="ref-tag">${escapeHtml(m)}</span>`
  );
  html = html.replace(/\n\n+/g, '</p><p>');
  if (!html.startsWith('<')) html = `<p>${html}</p>`;
  return html;
}

function buildHTML(conversation, messages) {
  const date = new Date(conversation.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const messagesHTML = messages.map((msg) => {
    if (msg.role === 'user') {
      return `<div class="user-message"><span class="user-label">Question</span>${escapeHtml(msg.content)}</div>`;
    }
    const msgImages = parseMessageImages(msg.images);
    return `<div class="assistant-message">${renderStepContent(msg.content)}${renderImageGallery(msgImages)}</div>`;
  }).join('\n<div class="message-divider"></div>\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PRISM Export</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.75; color: #1c1917; background: #fff; padding: 48px 56px; max-width: 860px; margin: 0 auto; }
    .cover { border-bottom: 2px solid #0f172a; padding-bottom: 24px; margin-bottom: 40px; }
    .cover-badge { display: inline-flex; align-items: center; gap: 6px; background: #0f172a; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px; }
    .cover-title { font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3; margin-bottom: 6px; }
    .cover-meta { font-size: 11px; color: #78716c; font-family: 'JetBrains Mono', monospace; }
    .user-message { margin: 32px 0 16px; padding: 12px 16px; background: #f8fafc; border-left: 3px solid #94a3b8; border-radius: 0 8px 8px 0; }
    .user-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
    .step-header { display: flex; align-items: flex-start; gap: 16px; margin: 36px 0 16px; padding-bottom: 12px; border-bottom: 1px solid #e7e5e4; page-break-inside: avoid; }
    .step-num { flex-shrink: 0; width: 40px; height: 40px; background: #0f172a; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
    .step-header h2 { font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.3; padding-top: 8px; }
    .section-label { font-size: 9px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #a8a29e; margin: 16px 0 6px; }
    .nav-path { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 12px; }
    .nav-part { color: #64748b; } .nav-sep { color: #cbd5e1; font-size: 13px; } .nav-last { color: #1d4ed8; font-weight: 600; background: #eff6ff; padding: 1px 5px; border-radius: 4px; }
    .result-block, .watchout-block { border-radius: 8px; padding: 10px 14px; margin: 12px 0; page-break-inside: avoid; }
    .result-block { background: #f0fdf4; border: 1px solid #bbf7d0; } .watchout-block { background: #fffbeb; border: 1px solid #fde68a; }
    .result-label, .watchout-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; margin-bottom: 4px; } .result-label { color: #16a34a; } .watchout-label { color: #b45309; }
    .result-body { color: #166534; font-size: 12.5px; } .watchout-body { color: #92400e; font-size: 12.5px; }
    p { margin: 6px 0; color: #44403c; } ol, ul { padding-left: 20px; margin: 8px 0; } li { margin: 3px 0; color: #44403c; }
    strong { font-weight: 600; color: #1c1917; } code { font-family: 'JetBrains Mono', monospace; font-size: 11px; background: #eff6ff; color: #1d4ed8; padding: 1px 5px; border-radius: 4px; }
    .ref-tag { font-family: 'JetBrains Mono', monospace; font-size: 10px; background: #f1f5f9; color: #64748b; padding: 1px 6px; border-radius: 4px; border: 1px solid #e2e8f0; }
    .mermaid { margin: 14px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; page-break-inside: avoid; }
    .image-grid { margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; page-break-inside: avoid; }
    .shot { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #f8fafc; page-break-inside: avoid; }
    .shot img { width: 100%; height: auto; display: block; object-fit: contain; background: #fff; }
    .shot figcaption { font-size: 10px; color: #64748b; font-family: 'JetBrains Mono', monospace; padding: 6px 8px; border-top: 1px solid #e2e8f0; }
    .message-divider { height: 1px; background: #f1f5f9; margin: 40px 0; }
    @page { margin: 40px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    window.__MERMAID_DONE = false;
    document.addEventListener('DOMContentLoaded', async () => {
      try {
        if (!window.mermaid) {
          window.__MERMAID_DONE = true;
          return;
        }
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'default',
          flowchart: { curve: 'linear' }
        });
        const nodes = document.querySelectorAll('.mermaid');
        if (nodes.length === 0) {
          window.__MERMAID_DONE = true;
          return;
        }
        await mermaid.run({ nodes });
        window.__MERMAID_DONE = true;
      } catch (e) {
        console.error('Mermaid render failed in export:', e);
        window.__MERMAID_DONE = true;
      }
    });
  </script>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">PRISM</div>
    <div class="cover-title">${escapeHtml(conversation.title || 'SAP Documentation Export')}</div>
    <div class="cover-meta">Exported ${escapeHtml(date)} • ${messages.length} messages</div>
  </div>
  <div class="content">${messagesHTML}</div>
</body>
</html>`;
}

const exportConversationPDF = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const html = buildHTML(conversation, conversation.messages);

    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 2200 });
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Wait for mermaid render markers and image load best effort.
      await page.waitForFunction(() => window.__MERMAID_DONE === true, { timeout: 15000 }).catch(() => {});
      await page.evaluate(async () => {
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:9px;color:#94a3b8;width:100%;display:flex;justify-content:space-between;padding:0 40px">
          <span>PRISM • SAP Documentation</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      });
      await browser.close();

      const filename = `PRISM-${(conversation.title || 'export').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch (puppeteerErr) {
      console.warn('Puppeteer not available, sending HTML fallback:', puppeteerErr.message);
      const filename = `PRISM-${(conversation.title || 'export').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(html);
    }
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ success: false, error: 'Export failed' });
  }
};

module.exports = { exportConversationPDF };
