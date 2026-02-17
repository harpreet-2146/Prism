// backend/src/services/export/pdf-export.service.js
'use strict';

const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const { logger } = require('../../utils/logger');

// Register Handlebars helpers
Handlebars.registerHelper('inc', (value) => parseInt(value) + 1);
Handlebars.registerHelper('hasSteps', (steps) => Array.isArray(steps) && steps.length > 0);

// ----------------------------------------------------------------
// HTML template for PDF export
// Inline to avoid file path issues across environments
// ----------------------------------------------------------------
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}} — PRISM Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      color: #1a1a2e;
      background: #ffffff;
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
    .header .meta { font-size: 11px; color: #6b7280; text-align: right; }
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
    .message.user .message-role { color: #4f46e5; }
    .message.assistant .message-role { color: #10b981; }
    .message-content { color: #374151; white-space: pre-wrap; word-break: break-word; }
    .summary { font-size: 14px; font-weight: 500; color: #111827; margin-bottom: 16px; }
    .steps { margin-top: 12px; }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .step-number {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      background: #4f46e5;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    .step-content { flex: 1; }
    .step-title { font-weight: 600; color: #111827; margin-bottom: 4px; }
    .step-desc { color: #4b5563; font-size: 12px; }
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
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
    .timestamp { font-size: 11px; color: #9ca3af; margin-top: 6px; }
    @media print {
      body { padding: 20px; }
      .message { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>{{title}}</h1>
      <p class="meta">PRISM SAP AI Assistant Export</p>
    </div>
    <div class="meta">
      <div>Exported: {{exportDate}}</div>
      <div>{{messageCount}} messages</div>
    </div>
  </div>

  <div class="conversation">
    {{#each messages}}
    <div class="message {{role}}">
      <div class="message-role">{{#if (eq role "user")}}You{{else}}PRISM Assistant{{/if}}</div>

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
                <div class="step-desc">{{this.description}}</div>
                {{#if this.tcode}}<div class="tcode">T-Code: {{this.tcode}}</div>{{/if}}
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

  <div class="footer">
    Generated by PRISM — Intelligent Visual Assistant for SAP Software
  </div>
</body>
</html>
`;

// Register eq helper for Handlebars
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('formatTime', (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
});

class PDFExportService {
  constructor() {
    this.template = Handlebars.compile(HTML_TEMPLATE);
    this._ensureExportDir();
  }

  async _ensureExportDir() {
    try {
      await fs.mkdir(config.EXPORT_TEMP_DIR, { recursive: true });
    } catch {}
  }

  /**
   * Export a conversation to PDF.
   *
   * @param {Object} conversation  - Conversation record from DB
   * @param {Array}  messages      - Message records from DB
   * @returns {string} Absolute path to the generated PDF file
   */
  async exportConversation(conversation, messages) {
    const start = Date.now();

    logger.info('Starting PDF export', {
      conversationId: conversation.id,
      messageCount: messages.length,
      component: 'pdf-export'
    });

    // Parse assistant message content
    const enrichedMessages = messages.map(msg => {
      if (msg.role === 'assistant') {
        return {
          ...msg,
          parsed: this._tryParseJSON(msg.content),
          sources: msg.sources || []
        };
      }
      return msg;
    });

    const html = this.template({
      title: conversation.title || 'SAP Assistant Conversation',
      exportDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      }),
      messageCount: messages.length,
      messages: enrichedMessages
    });

    const filename = `prism_export_${uuidv4()}.pdf`;
    const outputPath = path.join(config.EXPORT_TEMP_DIR, filename);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: config.EXPORT_TIMEOUT_MS });

      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
      });

      logger.info('PDF export complete', {
        conversationId: conversation.id,
        filename,
        ms: Date.now() - start,
        component: 'pdf-export'
      });

      return { filename, filePath: outputPath };

    } finally {
      if (browser) await browser.close();
    }
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

  /**
   * Delete old export files (call periodically to clean up).
   * Removes files older than maxAgeMs.
   */
  async cleanupOldExports(maxAgeMs = 60 * 60 * 1000) {
    try {
      const files = await fs.readdir(config.EXPORT_TEMP_DIR);
      const now = Date.now();
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(config.EXPORT_TEMP_DIR, file);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          deleted++;
        }
      }

      if (deleted > 0) {
        logger.info('Export cleanup complete', { deleted, component: 'pdf-export' });
      }
    } catch (error) {
      logger.warn('Export cleanup failed', { error: error.message, component: 'pdf-export' });
    }
  }
}

module.exports = new PDFExportService();