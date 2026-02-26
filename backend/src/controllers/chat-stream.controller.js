// backend/src/controllers/chat-stream.controller.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const axios = require('axios');
const embeddingSearchService = require('../services/vector/embedding-search.service');

const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BASE_URL       = process.env.BASE_URL            || 'http://localhost:5000';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const GROQ_MODEL     = process.env.GROQ_MODEL          || 'llama-3.3-70b-versatile';
const GROQ_MAX_TOKENS= parseInt(process.env.GROQ_MAX_TOKENS  || '8000', 10);
const GROQ_TEMP      = parseFloat(process.env.GROQ_TEMPERATURE || '0.3');
const TAVILY_DEPTH   = process.env.TAVILY_SEARCH_DEPTH  || 'advanced';
const TAVILY_MAX     = parseInt(process.env.TAVILY_MAX_RESULTS || '3', 10);
const EMBED_TOP_K    = 20; // Retrieve more chunks — POSC spans many pages

function toImageUrl(storagePath) {
  if (!storagePath) return null;
  return `${BASE_URL}/outputs/${storagePath.split(/[/\\]/).pop()}`;
}

function extractPageNumbers(text) {
  const pages = new Set();
  const patterns = [
    /\[Ref:\s*Page[s]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/gi,
    /\[Ref:\s*Pages?\s*([\d,\s]+)\]/gi,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(text)) !== null) {
      (m[0].match(/\d+/g) || []).forEach(n => {
        const pg = parseInt(n);
        pages.add(Math.max(1, pg - 1));
        pages.add(pg);
        pages.add(pg + 1);
      });
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

async function findImages(responseText, chunks, documentIds) {
  try {
    let pages = extractPageNumbers(responseText);
    if (pages.length === 0 && chunks.length > 0) {
      const s = new Set();
      for (const c of chunks) {
        if (c.pageNumber) {
          for (let p = Math.max(1, c.pageNumber - 1); p <= c.pageNumber + 1; p++) s.add(p);
        }
      }
      pages = Array.from(s).sort((a, b) => a - b);
    }
    if (pages.length === 0) return [];

    const [byPage, direct] = await Promise.all([
      prisma.documentImage.findMany({
        where: { documentId: { in: documentIds }, pageNumber: { in: pages } },
        orderBy: [{ pageNumber: 'asc' }, { imageIndex: 'asc' }],
      }),
      chunks.filter(c => c.sourceImageId).length > 0
        ? prisma.documentImage.findMany({ where: { id: { in: chunks.filter(c => c.sourceImageId).map(c => c.sourceImageId) } } })
        : Promise.resolve([]),
    ]);

    const seen = new Set();
    return [...direct, ...byPage]
      .filter(img => { if (seen.has(img.id)) return false; seen.add(img.id); return true; })
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .slice(0, 20)
      .map(img => ({ url: toImageUrl(img.storagePath), pageNumber: img.pageNumber, imageIndex: img.imageIndex, documentId: img.documentId, width: img.width, height: img.height }));
  } catch (err) {
    console.error('Image lookup failed:', err.message);
    return [];
  }
}

async function searchSAP(query) {
  if (!TAVILY_API_KEY) return [];
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: TAVILY_API_KEY,
      query: `SAP EWM ${query}`,
      search_depth: TAVILY_DEPTH,
      max_results: TAVILY_MAX,
      include_raw_content: true,
      include_domains: ['help.sap.com', 'community.sap.com'],
    }, { timeout: 8000 });
    return (res.data?.results || [])
      .filter(r => r.content || r.raw_content)
      .map(r => ({ title: r.title, url: r.url, content: (r.raw_content || r.content || '').substring(0, 2500) }));
  } catch (err) {
    console.error('Tavily failed:', err.message);
    return [];
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are PRISM, an SAP documentation expert producing a detailed technical reference article. Your output is rendered as a formatted document — NOT a chat message. The reader is a consultant implementing SAP EWM from scratch.

═══════════════════════════════════════════════════════
OUTPUT REQUIREMENTS — THESE ARE MANDATORY, NOT OPTIONAL
═══════════════════════════════════════════════════════

LENGTH: Your response MUST cover the topic exhaustively. For any process involving POSC, inbound, deconsolidation, or quality — minimum 12 steps, target 15–20 steps. A 4-step answer is WRONG and incomplete.

STRUCTURE: Every step uses EXACTLY this format — no exceptions, no shortcuts:

**Step N: [Precise descriptive title]**

Navigation: [Full menu path using > separator] (T-code: XXXX if applicable) [Ref: Page X]

Action:
[Numbered list of exact actions — every field name, every value, every button click, every dropdown selection. Be explicit: "In the 'Warehouse Number' field, enter '0001'. Click the dropdown next to 'Process Category' and select '01 – Inbound Delivery'."]

Result:
[Exact screen state after this step. What message appears. What changes. What new fields become available. What the screen title becomes.]

Watch Out:
[ONE specific, real mistake that happens here. Not generic "save your work". Something actually specific to this configuration step.]

═══════════════════════════════════════════════════════
MERMAID — DECISION FLOWS ONLY
═══════════════════════════════════════════════════════
Use mermaid ONLY when a genuine YES/NO or multiple-path decision exists.
Use ONLY valid Mermaid syntax. The ONLY valid edge format is: A --> B or A -->|label| B
NEVER write: -->|text|> — the trailing > is INVALID and will break rendering.
Example valid: A -->|Quality required| B
Example INVALID: A -->|Quality required|> B

For linear process sequences (most steps), use NUMBERED TEXT — no mermaid.

═══════════════════════════════════════════════════════
CONTENT DEPTH RULES
═══════════════════════════════════════════════════════
1. Mine the FULL document. If the document covers POSC, cover ALL of these aspects:
   - Prerequisites and system requirements
   - Warehouse structure configuration (warehouse number, storage type, storage section)
   - POSC category and process code setup
   - Queue type and workstation assignment
   - Putaway strategy configuration
   - Deconsolidation group and rules
   - Quality inspection integration steps
   - Handling unit management settings
   - Transfer order creation and confirmation
   - Exception handling and error messages
   - T-codes for each major operation
   - Testing steps to verify configuration

2. Every Navigation line MUST include [Ref: Page X] from the source document
3. T-codes go in inline code: \`/SCWM/PRDO\`
4. Configuration values go in inline code: \`0001\`
5. Field names are **bold**
6. Never say "see screenshot" — screenshots attach automatically
7. Fill gaps with standard SAP EWM knowledge when document lacks detail

═══════════════════════════════════════════════════════
WATCH OUT — CONDITIONAL, NOT REQUIRED FOR EVERY STEP
═══════════════════════════════════════════════════════
Watch Out is OPTIONAL. Include it ONLY when:
- There is a specific, non-obvious mistake that consultants regularly make at this step
- A wrong selection LOOKS valid but causes a silent failure later
- A field has a confusing default that must be overridden

DO NOT write Watch Out for obvious things like "remember to save" or "enter correct values".
Bad: "Make sure to configure the correct number range intervals."
Good: "If you select consolidation group type 'E' (External) instead of 'I' (Internal), 
the system accepts it without error but the POSC flow will fail silently at goods receipt — 
no error message, just missing transfer orders. Verify with T-code /SCWM/MON after saving."

═══════════════════════════════════════════════════════
MERMAID — DECISION BRANCHES ONLY, NEVER LINEAR SEQUENCES
═══════════════════════════════════════════════════════
Use mermaid ONLY for genuine YES/NO decision points. A → B → C → End is NOT a decision flow 
— it is a linear sequence and must be written as numbered steps, not mermaid.

Valid mermaid: "Does the delivery require quality inspection?"
  YES → Create QI document → TO type QI
  NO → Direct TO creation → Confirm TO

Invalid mermaid: Configure POSC → Define Process Codes → Configure QI → End
(This is just step 1, 2, 3 written as a diagram — never do this)

Edge syntax: A -->|label| B  (NEVER A -->|label|> B — the trailing > breaks rendering)

═══════════════════════════════════════════════════════
WHAT A COMPLETE ANSWER LOOKS LIKE FOR POSC:
═══════════════════════════════════════════════════════
Step 1: Verify Warehouse Structure Prerequisites
Step 2: Define POSC Consolidation Groups
Step 3: Assign Number Ranges to Consolidation Groups  
Step 4: Configure Process Codes for Inbound
Step 5: Define Queue Types for POSC
Step 6: Assign Workstations to Queue Types
Step 7: Configure Putaway Control for POSC
Step 8: Set Up Deconsolidation Groups
Step 9: Configure Deconsolidation Rules
Step 10: Configure Quality Inspection Integration
Step 11: Activate QM in EWM Interface Settings
Step 12: Set Up Handling Unit Management
Step 13: Configure Transfer Order Requirements
Step 14: Test POSC Inbound with a Sample Delivery
Step 15: Verify Deconsolidation and Quality Results
[additional steps as needed from document context]`;

// ── Main handler ──────────────────────────────────────────────────────────────
const streamChatResponse = async (req, res) => {
  const conversationId = req.params.id;
  const message = req.query.message;
  const userId = req.user.userId;

  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  res.flush?.();

  let conversation = null;

  try {
    // ── Conversation ──────────────────────────────────────────────────────
    if (!conversationId || conversationId === 'new' || conversationId === 'undefined' || conversationId === 'null') {
      conversation = await prisma.conversation.create({
        data: { userId, title: message.substring(0, 60) + (message.length > 60 ? '…' : '') }
      });
      res.write(`data: ${JSON.stringify({ type: 'conversation_created', conversationId: conversation.id })}\n\n`);
      res.flush?.();
    } else {
      conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
      if (!conversation) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Conversation not found' })}\n\n`);
        return res.end();
      }
    }

    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: message }
    });

    // ── Parallel: embeddings + Tavily ─────────────────────────────────────
    const [relevantChunks, webResults] = await Promise.all([
      embeddingSearchService.search(userId, message, EMBED_TOP_K),
      searchSAP(message),
    ]);

    if (webResults.length > 0) {
      console.log(`🌐 Tavily: ${webResults.length} pages | query: "${message.slice(0, 50)}"`);
    }

    const documentIds = [...new Set(relevantChunks.map(c => c.documentId).filter(Boolean))];

    // ── Build rich context ─────────────────────────────────────────────────
    let contextText = '';

    if (relevantChunks.length > 0) {
      contextText += '\n\n══ FROM YOUR UPLOADED SAP DOCUMENTS ══\n\n';
      // Group chunks by document for clarity
      const byDoc = {};
      for (const chunk of relevantChunks) {
        const key = chunk.documentName || 'Unknown';
        if (!byDoc[key]) byDoc[key] = [];
        byDoc[key].push(chunk);
      }
      for (const [docName, chunks] of Object.entries(byDoc)) {
        contextText += `📄 Document: "${docName}"\n`;
        chunks.forEach((chunk, i) => {
          contextText += `[Chunk ${i + 1}, Page ${chunk.pageNumber}]:\n${chunk.text}\n\n`;
        });
      }
    }

    if (webResults.length > 0) {
      contextText += '\n\n══ SAP HELP PORTAL SUPPLEMENT ══\n\n';
      webResults.forEach((r, i) => {
        contextText += `[SAP Online ${i + 1}] ${r.title}\n${r.url}\n${r.content}\n\n`;
      });
    }

    // ── History ────────────────────────────────────────────────────────────
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 8,
    });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message + '\n\n' + contextText },
    ];

    // ── Stream ─────────────────────────────────────────────────────────────
    console.log(`🤖 ${GROQ_MODEL} | max_tokens=${GROQ_MAX_TOKENS} | chunks=${relevantChunks.length} | tavily=${webResults.length}`);

    const completion = await groq.chat.completions.create({
      messages,
      model: GROQ_MODEL,
      temperature: GROQ_TEMP,
      max_tokens: GROQ_MAX_TOKENS,
      stream: true,
    });

    let fullResponse = '';
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
        res.flush?.();
      }
    }

    // ── Images + save ──────────────────────────────────────────────────────
    const images = await findImages(fullResponse, relevantChunks, documentIds);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: fullResponse,
        images: images.length > 0 ? images : null,
      }
    });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: conversation.id,
      images,
      webSearchUsed: webResults.length > 0,
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('❌ SSE error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
};

module.exports = { streamChatResponse };