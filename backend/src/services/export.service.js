// backend/src/services/export.service.js
'use strict';

/**
 * Unified export service.
 * Handles both PDF (via Puppeteer) and DOCX (via docx npm package).
 *
 * Google Docs strategy: export as .docx → user uploads to Google Drive
 * → Drive auto-converts to Google Doc. Zero OAuth needed.
 */

const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const {
  Document,
  Paragraph,
  TextRun,
  BorderStyle,
  ShadingType,
  Packer
} = require('docx');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { logger } = require('../utils/logger');

// ----------------------------------------------------------------
// Handlebars helpers
// ----------------------------------------------------------------
Handlebars.registerHelper('inc',       (v)    => parseInt(v) + 1);
Handlebars.registerHelper('eq',        (a, b) => a === b);
Handlebars.registerHelper('hasSteps',  (s)    => Array.isArray(s) && s.length > 0);
Handlebars.registerHelper('formatTime',(date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
});

// ----------------------------------------------------------------
// PDF HTML template
// ----------------------------------------------------------------
const PDF_TEMPLATE = Handlebars.compile(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{title}} — PRISM Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: #1a1a2e;
      background: #fff;
      padding: 40px;
    }
    .header {
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 { font-size: 22px; color: #4f46e5; font-weight: 700; }
    .meta { font-size: 11px; color: #6b7280; text-align: right; }
    .conversation { display: flex; flex-direction: column; gap: 20px; }
    .message { border-radius: 8px; padding: 16px 20px; }
    .message.user {
      background: #f3f4f6;
      border-left: 4px solid #4f46e5;
      margin-left: 40px;
    }
    .message.assistant {
      background: #fafafa;
      border-left: 4px solid #10b981;
      margin-right: 40px;
    }
    .message-role {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }
    .message.user .message-role     { color: #4f46e5; }
    .message.assistant .message-role { color: #10b981; }
    .message-content { color: #374151; white-space: pre-wrap; word-break: break-word; }
    .summary { font-size: 14px; font-weight: 500; color: #111827; margin-bottom: 16px; }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      padding: 12px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .step-number {
      flex-shrink: 0;
      width: 26px; height: 26px;
      background: #4f46e5;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    .step-title  { font-weight: 600; color: #111827; margin-bottom: 4px; }
    .step-desc   { color: #4b5563; font-size: 12px; }
    .tcode {
      display: inline-block;
      background: #ede9fe;
      color: #5b21b6;
      font-family: monospace;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-top: 4px;
    }
    .sources {
      margin-top: 12px;
      padding: 8px 12px;
      background: #eff6ff;
      border-radius: 6px;
      font-size: 11px;
      color: #1d4ed8;
    }
    .timestamp { font-size: 11px; color: #9ca3af; margin-top: 6px; }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    @media print { .message { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>{{title}}</h1>
      <p style="font-size:12px;color:#6b7280;margin-top:4px;">PRISM SAP AI Assistant</p>
    </div>
    <div class="meta">
      <div>Exported: {{exportDate}}</div>
      <div>{{messageCount}} messages</div>
    </div>
  </div>

  <div class="conversation">
    {{#each messages}}
    <div class="message {{role}}">
      <div class="message-role">
        {{#if (eq role "user")}}You{{else}}PRISM Assistant{{/if}}
      </div>

      {{#if (eq role "assistant")}}
        {{#if parsed}}
          {{#if parsed.summary}}
            <div class="summary">{{parsed.summary}}</div>
          {{/if}}
          {{#if (hasSteps parsed.steps)}}
            <div class="steps">
              {{#each parsed.steps}}
              <div class="step">
                <div class="step-number">{{inc @index}}</div>
                <div class="step-content">
                  <div class="step-title">{{this.title}}</div>
                  {{#if this.description}}
                    <div class="step-desc">{{this.description}}</div>
                  {{/if}}
                  {{#if this.tcode}}
                    <div class="tcode">T-Code: {{this.tcode}}</div>
                  {{/if}}
                </div>
              </div>
              {{/each}}
            </div>
          {{/if}}
        {{else}}
          <div class="message-content">{{content}}</div>
        {{/if}}
        {{#if sources.length}}
          <div class="sources">
            📎 Sources: {{#each sources}}{{this.title}}{{#unless @last}}, {{/unless}}{{/each}}
          </div>
        {{/if}}
      {{else}}
        <div class="message-content">{{content}}</div>
      {{/if}}

      <div class="timestamp">{{formatTime createdAt}}</div>
    </div>
    {{/each}}
  </div>

  <div class="footer">Generated by PRISM — Intelligent Visual Assistant for SAP Software</div>
</body>
</html>
`);

// ----------------------------------------------------------------

class ExportService {
  constructor() {
    this._ensureExportDir();

    // Clean up old export files on startup
    this.cleanupOldExports().catch(() => {});
  }

  async _ensureExportDir() {
    try {
      await fs.mkdir(config.EXPORT_TEMP_DIR, { recursive: true });
    } catch {}
  }

  // ----------------------------------------------------------------
  // PDF EXPORT
  // ----------------------------------------------------------------

  /**
   * Export a conversation as PDF using Puppeteer.
   *
   * @param {Object} conversation
   * @param {Array}  messages
   * @returns {{ filename, filePath, downloadUrl }}
   */
  async exportPDF(conversation, messages) {
    const start = Date.now();

    logger.info('Starting PDF export', {
      conversationId: conversation.id,
      messageCount: messages.length,
      component: 'export-service'
    });

    const enriched = this._enrichMessages(messages);

    const html = PDF_TEMPLATE({
      title: conversation.title || 'SAP Assistant Conversation',
      exportDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      }),
      messageCount: messages.length,
      messages: enriched
    });

    const filename = `prism_${uuidv4()}.pdf`;
    const filePath = path.join(config.EXPORT_TEMP_DIR, filename);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });

      const page = await browser.newPage();
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: config.EXPORT_TIMEOUT_MS
      });

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
      });

    } finally {
      if (browser) await browser.close();
    }

    logger.info('PDF export complete', {
      conversationId: conversation.id,
      filename,
      ms: Date.now() - start,
      component: 'export-service'
    });

    return {
      filename,
      filePath,
      downloadUrl: `${config.BASE_URL}/api/export/download/${filename}`
    };
  }

  // ----------------------------------------------------------------
  // DOCX EXPORT
  // ----------------------------------------------------------------

  /**
   * Export a conversation as .docx (Word).
   * User uploads to Google Drive → auto-converts to Google Doc.
   *
   * @param {Object} conversation
   * @param {Array}  messages
   * @returns {{ filename, filePath, downloadUrl }}
   */
  async exportDOCX(conversation, messages) {
    const start = Date.now();

    logger.info('Starting DOCX export', {
      conversationId: conversation.id,
      messageCount: messages.length,
      component: 'export-service'
    });

    const children = [
      // Title
      new Paragraph({
        children: [new TextRun({ text: conversation.title || 'SAP Conversation', bold: true, size: 48, color: '4F46E5' })],
        spacing: { after: 200 }
      }),

      // Metadata
      new Paragraph({
        children: [new TextRun({
          text: `Exported: ${new Date().toLocaleString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}  •  ${messages.length} messages`,
          color: '6B7280',
          size: 20
        })],
        spacing: { after: 100 }
      }),

      // Google Docs tip
      new Paragraph({
        children: [new TextRun({
          text: '💡 Tip: Upload this file to Google Drive to open it as a Google Doc',
          color: '1D4ED8',
          size: 18,
          italics: true
        })],
        spacing: { after: 400 }
      }),

      // Divider
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '4F46E5' } },
        spacing: { after: 400 }
      }),

      // Messages
      ...this._buildDocxMessages(messages)
    ];

    const doc = new Document({
      creator: 'PRISM SAP AI Assistant',
      title: conversation.title || 'SAP Conversation Export',
      description: 'Exported from PRISM — Intelligent Visual Assistant for SAP Software',
      sections: [{
        properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children
      }]
    });

    const filename = `prism_${uuidv4()}.docx`;
    const filePath = path.join(config.EXPORT_TEMP_DIR, filename);

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    logger.info('DOCX export complete', {
      conversationId: conversation.id,
      filename,
      ms: Date.now() - start,
      component: 'export-service'
    });

    return {
      filename,
      filePath,
      downloadUrl: `${config.BASE_URL}/api/export/download/${filename}`
    };
  }

  // ----------------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------------

  /**
   * Delete export files older than maxAgeMs (default 1 hour).
   */
  async cleanupOldExports(maxAgeMs = 60 * 60 * 1000) {
    try {
      const files = await fs.readdir(config.EXPORT_TEMP_DIR);
      const now = Date.now();
      let deleted = 0;

      for (const file of files) {
        // Only clean files generated by us
        if (!file.startsWith('prism_')) continue;
        const filePath = path.join(config.EXPORT_TEMP_DIR, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            deleted++;
          }
        } catch {}
      }

      if (deleted > 0) {
        logger.info('Export cleanup', { deleted, component: 'export-service' });
      }
    } catch {}
  }

  // ----------------------------------------------------------------
  // INTERNAL HELPERS
  // ----------------------------------------------------------------

  _enrichMessages(messages) {
    return messages.map(msg => {
      if (msg.role !== 'assistant') return msg;
      return {
        ...msg,
        parsed:  this._tryParseJSON(msg.content),
        sources: msg.sources || []
      };
    });
  }

  _buildDocxMessages(messages) {
    const paragraphs = [];

    for (const msg of messages) {
      const time = this._formatTime(msg.createdAt);

      if (msg.role === 'user') {
        // Role header
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: 'You  ', bold: true, color: '4F46E5', size: 22 }),
            new TextRun({ text: time, color: '9CA3AF', size: 18 })
          ],
          spacing: { before: 300, after: 80 }
        }));

        // Content
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: msg.content, size: 22 })],
          indent: { left: 360 },
          shading: { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' },
          spacing: { after: 300 }
        }));

      } else {
        // Role header
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: 'PRISM Assistant  ', bold: true, color: '10B981', size: 22 }),
            new TextRun({ text: time, color: '9CA3AF', size: 18 })
          ],
          spacing: { before: 300, after: 80 }
        }));

        const parsed = this._tryParseJSON(msg.content);

        if (parsed && (parsed.summary || parsed.steps?.length > 0)) {
          // Summary
          if (parsed.summary) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: parsed.summary, size: 22, bold: true })],
              indent: { left: 360 },
              spacing: { after: 200 }
            }));
          }

          // Steps
          if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: 'Steps:', bold: true, size: 22 })],
              indent: { left: 360 },
              spacing: { before: 120, after: 120 }
            }));

            parsed.steps.forEach((step, i) => {
              paragraphs.push(new Paragraph({
                children: [
                  new TextRun({ text: `${i + 1}. `, bold: true, color: '4F46E5', size: 22 }),
                  new TextRun({ text: step.title || '', bold: true, size: 22 })
                ],
                indent: { left: 720 },
                spacing: { before: 100, after: 60 }
              }));

              if (step.description) {
                paragraphs.push(new Paragraph({
                  children: [new TextRun({ text: step.description, size: 20, color: '4B5563' })],
                  indent: { left: 1080 },
                  spacing: { after: 60 }
                }));
              }

              if (step.tcode) {
                paragraphs.push(new Paragraph({
                  children: [
                    new TextRun({ text: 'T-Code: ', bold: true, size: 20, color: '6D28D9' }),
                    new TextRun({ text: step.tcode, size: 20, color: '5B21B6', font: 'Courier New' })
                  ],
                  indent: { left: 1080 },
                  spacing: { after: 100 }
                }));
              }
            });
          }

          // Sources
          if (Array.isArray(msg.sources) && msg.sources.length > 0) {
            const sourceText = msg.sources.map(s => s.title).filter(Boolean).join(', ');
            if (sourceText) {
              paragraphs.push(new Paragraph({
                children: [
                  new TextRun({ text: '📎 Sources: ', bold: true, size: 20, color: '1D4ED8' }),
                  new TextRun({ text: sourceText, size: 20, color: '1D4ED8' })
                ],
                indent: { left: 360 },
                spacing: { before: 100, after: 200 }
              }));
            }
          }

        } else {
          // Plain text fallback
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: msg.content, size: 22 })],
            indent: { left: 360 },
            spacing: { after: 300 }
          }));
        }
      }
    }

    return paragraphs;
  }

  _tryParseJSON(content) {
    try {
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  _formatTime(date) {
    if (!date) return '';
    return new Date(date).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
}

module.exports = new ExportService();