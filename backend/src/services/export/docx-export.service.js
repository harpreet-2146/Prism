// backend/src/services/export/docx-export.service.js
'use strict';

/**
 * Export conversations as .docx (Word) files.
 *
 * HIGH-02 FIX / Google Docs replacement:
 * Instead of OAuth + Google Docs API (complex setup, "app not verified" warnings),
 * we generate a proper .docx file the user downloads and uploads to Google Drive.
 * Google Drive auto-converts .docx → Google Doc on upload. Same end result,
 * zero OAuth setup required.
 */

const {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Packer
} = require('docx');

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const { logger } = require('../../utils/logger');

class DocxExportService {
  constructor() {
    this._ensureExportDir();
  }

  async _ensureExportDir() {
    try {
      await fs.mkdir(config.EXPORT_TEMP_DIR, { recursive: true });
    } catch {}
  }

  /**
   * Export a conversation to .docx
   *
   * @param {Object} conversation
   * @param {Array}  messages
   * @returns {{ filename, filePath }}
   */
  async exportConversation(conversation, messages) {
    const start = Date.now();

    logger.info('Starting DOCX export', {
      conversationId: conversation.id,
      messageCount: messages.length,
      component: 'docx-export'
    });

    const children = [
      // Title
      new Paragraph({
        text: conversation.title || 'SAP Assistant Conversation',
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 }
      }),

      // Metadata
      new Paragraph({
        children: [
          new TextRun({
            text: `Exported: ${new Date().toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}`,
            color: '6B7280',
            size: 20
          })
        ],
        spacing: { after: 400 }
      }),

      // Divider
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '4F46E5' } },
        spacing: { after: 400 }
      }),

      // Messages
      ...this._buildMessages(messages)
    ];

    const doc = new Document({
      creator: 'PRISM SAP AI Assistant',
      title: conversation.title || 'SAP Conversation Export',
      description: 'Exported from PRISM — Intelligent Visual Assistant for SAP Software',
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        children
      }]
    });

    const filename = `prism_export_${uuidv4()}.docx`;
    const outputPath = path.join(config.EXPORT_TEMP_DIR, filename);

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);

    logger.info('DOCX export complete', {
      conversationId: conversation.id,
      filename,
      ms: Date.now() - start,
      component: 'docx-export'
    });

    return { filename, filePath: outputPath };
  }

  // ----------------------------------------------------------------
  // INTERNAL: build paragraphs for all messages
  // ----------------------------------------------------------------

  _buildMessages(messages) {
    const paragraphs = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        paragraphs.push(...this._buildUserMessage(msg));
      } else {
        paragraphs.push(...this._buildAssistantMessage(msg));
      }
    }

    return paragraphs;
  }

  _buildUserMessage(msg) {
    const time = this._formatTime(msg.createdAt);
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `You  `, bold: true, color: '4F46E5', size: 22 }),
          new TextRun({ text: time, color: '9CA3AF', size: 18 })
        ],
        spacing: { before: 300, after: 80 }
      }),
      new Paragraph({
        children: [new TextRun({ text: msg.content, size: 22 })],
        indent: { left: 360 },
        shading: { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' },
        spacing: { after: 300 }
      })
    ];
  }

  _buildAssistantMessage(msg) {
    const time = this._formatTime(msg.createdAt);
    const paragraphs = [];

    // Role header
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `PRISM Assistant  `, bold: true, color: '10B981', size: 22 }),
        new TextRun({ text: time, color: '9CA3AF', size: 18 })
      ],
      spacing: { before: 300, after: 80 }
    }));

    // Try to parse structured JSON response
    const parsed = this._tryParseJSON(msg.content);

    if (parsed && (parsed.summary || (parsed.steps && parsed.steps.length > 0))) {
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
          children: [new TextRun({ text: 'Steps:', bold: true, size: 22, color: '374151' })],
          indent: { left: 360 },
          spacing: { before: 120, after: 120 }
        }));

        parsed.steps.forEach((step, i) => {
          // Step title
          paragraphs.push(new Paragraph({
            children: [
              new TextRun({ text: `${i + 1}. `, bold: true, color: '4F46E5', size: 22 }),
              new TextRun({ text: step.title, bold: true, size: 22 })
            ],
            indent: { left: 720 },
            spacing: { before: 100, after: 60 }
          }));

          // Step description
          if (step.description) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: step.description, size: 20, color: '4B5563' })],
              indent: { left: 1080 },
              spacing: { after: 60 }
            }));
          }

          // T-Code
          if (step.tcode) {
            paragraphs.push(new Paragraph({
              children: [
                new TextRun({ text: 'T-Code: ', size: 20, color: '6D28D9', bold: true }),
                new TextRun({ text: step.tcode, size: 20, color: '5B21B6', font: 'Courier New' })
              ],
              indent: { left: 1080 },
              spacing: { after: 100 }
            }));
          }
        });
      }

      // Sources
      if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
        const sourceText = parsed.sources.map(s => s.title || s).filter(Boolean).join(', ');
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

module.exports = new DocxExportService();