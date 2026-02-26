// backend/src/controllers/export-pdf.controller.js
// Generates a clean PDF of an entire conversation using Puppeteer
// Route: GET /api/export/conversation/:id/pdf
//
// SETUP: npm install puppeteer-core @sparticuz/chromium
// OR (simpler): npm install puppeteer
// Then add to documents.routes.js or create export.routes.js:
//   const { exportConversationPDF } = require('../controllers/export-pdf.controller');
//   router.get('/export/conversation/:id/pdf', authMiddleware, exportConversationPDF);

'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = require('../utils/prisma');

// ── HTML builder — renders messages into article-style HTML ──────────────────
function buildHTML(conversation, messages) {
  const date = new Date(conversation.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // Parse **Step N: Title** blocks into formatted HTML
  function renderStepContent(text) {
    let html = text;

    // Step headers
    html = html.replace(/\*\*Step\s+(\d+)[:\s\-–]+([^\n*]+)\*\*/gi, (_, num, title) =>
      `<div class="step-header"><span class="step-num">${String(num).padStart(2,'0')}</span><h2>${title.trim()}</h2></div>`
    );

    // Navigation section
    html = html.replace(/\bNavigation:\s*([^\n]+(?:\n(?!Action:|Result:|Watch Out:)[^\n]+)*)/gi, (_, nav) => {
      const parts = nav.trim().split(/\s*[>→]\s*/);
      const breadcrumb = parts.map((p, i) =>
        i === parts.length - 1
          ? `<span class="nav-last">${p.trim()}</span>`
          : `<span class="nav-part">${p.trim()}</span>`
      ).join('<span class="nav-sep">›</span>');
      return `<div class="section-label">Navigation</div><div class="nav-path">${breadcrumb}</div>`;
    });

    // Result block
    html = html.replace(/\bResult:\s*([^\n]+(?:\n(?!Watch Out:|Navigation:|Action:)[^\n]+)*)/gi, (_, body) =>
      `<div class="result-block"><div class="result-label">✓ Result</div><div class="result-body">${body.trim()}</div></div>`
    );

    // Watch Out block
    html = html.replace(/\bWatch Out:\s*([^\n]+(?:\n(?!Result:|Navigation:|Action:|Step\s+\d+)[^\n]+)*)/gi, (_, body) =>
      `<div class="watchout-block"><div class="watchout-label">⚠ Watch Out</div><div class="watchout-body">${body.trim()}</div></div>`
    );

    // Action section
    html = html.replace(/\bAction:\s*/gi, '<div class="section-label">Action</div>');

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Inline code `text`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Numbered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ol>${m}</ol>`);

    // Bullet lists
    html = html.replace(/^[*•-]\s+(.+)$/gm, '<li>$1</li>');

    // Ref pages
    html = html.replace(/\[Ref:\s*Pages?\s*([\d,\s\-–]+)\]/gi, m =>
      `<span class="ref-tag">${m}</span>`
    );

    // Paragraphs from blank lines
    html = html.replace(/\n\n+/g, '</p><p>');
    if (!html.startsWith('<')) html = '<p>' + html + '</p>';

    return html;
  }

  const messagesHTML = messages.map(msg => {
    if (msg.role === 'user') {
      return `<div class="user-message"><span class="user-label">Question</span>${msg.content}</div>`;
    }
    return `<div class="assistant-message">${renderStepContent(msg.content)}</div>`;
  }).join('\n<div class="message-divider"></div>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    line-height: 1.75;
    color: #1c1917;
    background: white;
    padding: 48px 56px;
    max-width: 860px;
    margin: 0 auto;
  }

  /* Cover header */
  .cover {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 24px;
    margin-bottom: 40px;
  }
  .cover-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0f172a;
    color: white;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
    padding: 4px 10px;
    border-radius: 6px;
    margin-bottom: 16px;
  }
  .cover-title {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
    margin-bottom: 6px;
  }
  .cover-meta {
    font-size: 11px;
    color: #78716c;
    font-family: 'JetBrains Mono', monospace;
  }

  /* User question */
  .user-message {
    margin: 32px 0 16px;
    padding: 12px 16px;
    background: #f8fafc;
    border-left: 3px solid #94a3b8;
    border-radius: 0 8px 8px 0;
  }
  .user-label {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  /* Step blocks */
  .step-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin: 36px 0 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e7e5e4;
  }
  .step-num {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    background: #0f172a;
    color: white;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
  .step-header h2 {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
    padding-top: 8px;
  }

  /* Section labels */
  .section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #a8a29e;
    margin: 16px 0 6px;
  }

  /* Navigation */
  .nav-path {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-bottom: 12px;
  }
  .nav-part { color: #64748b; }
  .nav-sep { color: #cbd5e1; font-size: 13px; }
  .nav-last { color: #1d4ed8; font-weight: 600; background: #eff6ff; padding: 1px 5px; border-radius: 4px; }

  /* Result */
  .result-block {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 12px 0;
  }
  .result-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #16a34a; margin-bottom: 4px; }
  .result-body { color: #166534; font-size: 12.5px; }

  /* Watch Out */
  .watchout-block {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 12px 0;
  }
  .watchout-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #b45309; margin-bottom: 4px; }
  .watchout-body { color: #92400e; font-size: 12.5px; }

  /* Body text */
  p { margin: 6px 0; color: #44403c; }
  ol, ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 3px 0; color: #44403c; }
  strong { font-weight: 600; color: #1c1917; }
  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    background: #eff6ff;
    color: #1d4ed8;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .ref-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    background: #f1f5f9;
    color: #64748b;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }

  .message-divider { height: 1px; background: #f1f5f9; margin: 40px 0; }

  /* Page breaks */
  .step-header { page-break-before: auto; page-break-inside: avoid; }
  .result-block, .watchout-block { page-break-inside: avoid; }

  /* Footer */
  @page {
    margin: 40px;
    @bottom-right { content: counter(page) " / " counter(pages); font-size: 10px; color: #94a3b8; }
    @bottom-left { content: "PRISM — SAP Documentation"; font-size: 10px; color: #94a3b8; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-badge">▸ PRISM</div>
    <div class="cover-title">${escapeHtml(conversation.title || 'SAP Documentation Export')}</div>
    <div class="cover-meta">Exported ${date} · ${messages.length} messages</div>
  </div>
  <div class="content">
    ${messagesHTML}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Controller ────────────────────────────────────────────────────────────────
const exportConversationPDF = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId; // ← correct field name

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const html = buildHTML(conversation, conversation.messages);

    // Try puppeteer for proper PDF, fallback to HTML download
    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:9px;color:#94a3b8;width:100%;display:flex;justify-content:space-between;padding:0 40px">
          <span>PRISM — SAP Documentation</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      });
      await browser.close();

      const filename = `PRISM-${(conversation.title || 'export').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

    } catch (puppeteerErr) {
      // Fallback: send HTML file (opens in browser, user can print to PDF)
      console.warn('Puppeteer not available, sending HTML fallback:', puppeteerErr.message);
      const filename = `PRISM-${(conversation.title || 'export').slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(html);
    }

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
};

module.exports = { exportConversationPDF };