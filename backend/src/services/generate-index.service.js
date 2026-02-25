// backend/src/services/generate-index.service.js
//
// Generates a deep, structured content index for a processed document.
// Reads the FULL stored text_content (not just chunks), runs a multi-pass
// Groq analysis, and produces a rich JSON index with sections, T-codes,
// concepts, warnings, and integration points.

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');

const prisma = require('../utils/prisma'); // use singleton
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Constants ────────────────────────────────────────────────────────────────
const MODEL = 'llama-3.3-70b-versatile';
const GROQ_CONTEXT_LIMIT = 100_000; // chars — Groq's effective limit

// Truncate text but preserve structure (don't cut mid-sentence)
function safeSlice(text, maxChars) {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > maxChars * 0.8 ? truncated.slice(0, lastPeriod + 1) : truncated;
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function generateDocumentIndex(documentId, userId) {
  // 1. Load document — must belong to user
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: {
      id: true,
      originalName: true,
      pageCount: true,
      sapModule: true,
      tcodes: true,
      textContent: true,    // full extracted text stored post-processing
      status: true,
    },
  });

  if (!doc) throw new Error('Document not found');
  if (doc.status !== 'completed') throw new Error('Document has not finished processing');
  if (!doc.textContent) throw new Error('No text content available for this document');

  const fullText = safeSlice(doc.textContent, GROQ_CONTEXT_LIMIT);

  // 2. First pass — structural analysis + T-code extraction
  const structuralPrompt = `You are an expert SAP technical documentation analyst. Analyze this SAP documentation and produce a comprehensive structural index.

Document: "${doc.originalName}"
Pages: ${doc.pageCount || 'unknown'}
Known SAP module: ${doc.sapModule || 'to be determined'}

FULL DOCUMENT TEXT:
---
${fullText}
---

Return ONLY a valid JSON object (no markdown, no backticks) with this exact structure:
{
  "sapModule": "detected SAP module name e.g. MM, SD, FI, CO, PP, WM, HCM",
  "overview": "2-3 sentence summary of what this document covers and who it is for",
  "stats": {
    "Sections": <count of major sections>,
    "T-Codes": <count of unique T-codes found>,
    "Pages": ${doc.pageCount || 0}
  },
  "allTcodes": ["T-CODE-1", "T-CODE-2"],
  "integrations": ["SAP module or system it integrates with", ...],
  "sections": [
    {
      "icon": "emoji that fits this section topic",
      "title": "Section title as it appears in the document",
      "summary": "One sentence: what this section covers",
      "pages": "page range e.g. 1-12 or null if unknown",
      "tcodes": ["T-codes used specifically in this section"],
      "concepts": ["key SAP concepts or config objects introduced here, max 8"],
      "subtopics": ["specific topics, procedures, or configuration steps covered, max 10"],
      "warnings": ["important warnings, prerequisites, or gotchas if any, max 3"]
    }
  ]
}

Rules:
- Include ALL major sections you find (aim for 5-15 sections for a real SAP doc)
- Extract EVERY T-code you find (format: 2-4 uppercase letters/numbers, e.g. MM01, SPRO, SM30)
- Concepts should be SAP-specific terms people would search for
- Subtopics should be specific enough that clicking one would form a useful search query
- Warnings should be real gotchas from the text, not generic advice
- If the doc is short or simple, fewer sections is fine — don't invent content`;

  let rawIndex;
  try {
    const response = await groqClient.chat.completions.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.1, // low temp for consistent structured output
      messages: [
        {
          role: 'system',
          content: 'You are a precise SAP documentation analyst. Return only valid JSON, nothing else. No markdown, no explanation, no backticks.',
        },
        { role: 'user', content: structuralPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('Empty response from Groq');

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    rawIndex = JSON.parse(cleaned);
  } catch (err) {
    console.error('[generate-index] Groq or parse error:', err.message);
    // Build minimal fallback from known metadata
    rawIndex = buildFallbackIndex(doc);
  }

  // 3. Validate and normalise the index
  const index = normaliseIndex(rawIndex, doc);

  // 4. Persist to document record
  await prisma.document.update({
    where: { id: documentId },
    data: {
      indexData: index,
      sapModule: index.sapModule || doc.sapModule,
      // If Groq found T-codes and we didn't have them before, update
      tcodes: index.allTcodes?.length > 0 ? index.allTcodes : doc.tcodes,
    },
  });

  return index;
}

// ─── Fallback when Groq fails ────────────────────────────────────────────────
function buildFallbackIndex(doc) {
  return {
    sapModule: doc.sapModule || 'SAP',
    overview: `${doc.originalName} — ${doc.pageCount || 0} page SAP documentation. Generate index to see full content breakdown.`,
    stats: { Pages: doc.pageCount || 0, 'T-Codes': doc.tcodes?.length || 0, Sections: 0 },
    allTcodes: doc.tcodes || [],
    integrations: [],
    sections: [
      {
        icon: '📄',
        title: 'Document Content',
        summary: 'Content index generation failed. Try regenerating.',
        pages: null,
        tcodes: doc.tcodes || [],
        concepts: [],
        subtopics: [],
        warnings: [],
      },
    ],
  };
}

// ─── Normalise / defensively parse index from Groq ───────────────────────────
function normaliseIndex(raw, doc) {
  return {
    sapModule: raw.sapModule || doc.sapModule || 'SAP',
    overview: raw.overview || '',
    stats: raw.stats || { Pages: doc.pageCount || 0, 'T-Codes': 0, Sections: 0 },
    allTcodes: Array.isArray(raw.allTcodes) ? raw.allTcodes.map(t => String(t).toUpperCase()) : [],
    integrations: Array.isArray(raw.integrations) ? raw.integrations : [],
    sections: Array.isArray(raw.sections)
      ? raw.sections.map(s => ({
          icon: s.icon || '📄',
          title: s.title || 'Untitled Section',
          summary: s.summary || '',
          pages: s.pages || null,
          tcodes: Array.isArray(s.tcodes) ? s.tcodes.map(t => String(t).toUpperCase()) : [],
          concepts: Array.isArray(s.concepts) ? s.concepts.slice(0, 10) : [],
          subtopics: Array.isArray(s.subtopics) ? s.subtopics.slice(0, 12) : [],
          warnings: Array.isArray(s.warnings) ? s.warnings.slice(0, 4) : [],
        }))
      : [],
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateDocumentIndex };