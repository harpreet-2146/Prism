// backend/src/controllers/chat-stream.controller.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const axios = require('axios');
const embeddingSearchService = require('../services/vector/embedding-search.service');
const tavilyService = require('../services/tavily.service');

const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

function toImageUrl(storagePath) {
  if (!storagePath) return null;
  const filename = storagePath.split(/[/\\]/).pop();
  return `${BASE_URL}/outputs/${filename}`;
}

function extractPageNumbersFromText(text) {
  const pages = new Set();
  const patterns = [
    /\[Ref:\s*Page[s]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/gi,
    /\[Ref:\s*Pages?\s*([\d,\s]+)\]/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const nums = match[0].match(/\d+/g) || [];
      nums.forEach(n => {
        const p = parseInt(n);
        pages.add(Math.max(1, p - 1));
        pages.add(p);
        pages.add(p + 1);
      });
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

async function findImagesForResponse(responseText, relevantChunks, documentIds) {
  try {
    let pageNumbers = extractPageNumbersFromText(responseText);

    if (pageNumbers.length === 0 && relevantChunks.length > 0) {
      const chunkPages = new Set();
      for (const chunk of relevantChunks) {
        if (chunk.pageNumber) {
          for (let p = Math.max(1, chunk.pageNumber - 1); p <= chunk.pageNumber + 1; p++) {
            chunkPages.add(p);
          }
        }
      }
      pageNumbers = Array.from(chunkPages).sort((a, b) => a - b);
    }

    if (pageNumbers.length === 0) return [];

    const images = await prisma.documentImage.findMany({
      where: { documentId: { in: documentIds }, pageNumber: { in: pageNumbers } },
      orderBy: [{ pageNumber: 'asc' }, { imageIndex: 'asc' }]
    });

    const sourceImageIds = relevantChunks.filter(c => c.sourceImageId).map(c => c.sourceImageId);
    let directImages = [];
    if (sourceImageIds.length > 0) {
      directImages = await prisma.documentImage.findMany({ where: { id: { in: sourceImageIds } } });
    }

    const seen = new Set();
    const merged = [];
    for (const img of [...directImages, ...images]) {
      if (!seen.has(img.id)) { seen.add(img.id); merged.push(img); }
    }
    merged.sort((a, b) => a.pageNumber - b.pageNumber);

    return merged.slice(0, 20).map(img => ({
      url: toImageUrl(img.storagePath),
      pageNumber: img.pageNumber,
      imageIndex: img.imageIndex,
      documentId: img.documentId,
      width: img.width,
      height: img.height
    }));
  } catch (err) {
    console.error('Failed to fetch images:', err.message);
    return [];
  }
}

/**
 * Search Tavily and fetch actual page content from top SAP results.
 * Returns enriched results with real content, not just snippets.
 */
async function searchAndFetchSAP(query) {
  if (!TAVILY_API_KEY) return [];

  try {
    // Step 1: Search Tavily focused on SAP help portal
    const searchRes = await axios.post('https://api.tavily.com/search', {
      api_key: TAVILY_API_KEY,
      query: `site:help.sap.com ${query}`,
      search_depth: 'advanced',
      max_results: 3,
      include_raw_content: true,  // get full page content, not just snippet
      include_domains: ['help.sap.com', 'community.sap.com', 'launchpad.support.sap.com']
    }, { timeout: 8000 });

    const results = searchRes.data?.results || [];

    return results
      .filter(r => r.content || r.raw_content)
      .map(r => ({
        title: r.title,
        url: r.url,
        // Use raw_content if available (full page), fall back to snippet
        content: (r.raw_content || r.content || '').substring(0, 2000)
      }));

  } catch (err) {
    console.error('Tavily search failed:', err.message);
    return [];
  }
}

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
    // ─── Conversation ──────────────────────────────────────────────────────
    if (conversationId === 'new' || conversationId === 'undefined') {
      conversation = await prisma.conversation.create({
        data: { userId, title: message.substring(0, 50) + (message.length > 50 ? '...' : '') }
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

    // ─── Search embeddings ─────────────────────────────────────────────────
    const relevantChunks = await embeddingSearchService.search(userId, message, 10);
    const documentIds = [...new Set(relevantChunks.map(c => c.documentId).filter(Boolean))];

    // ─── Tavily: fetch real SAP content ───────────────────────────────────
    // Run in parallel with no blocking — only if doc context seems thin
    const docWordCount = relevantChunks.reduce((sum, c) => sum + (c.text?.split(' ').length || 0), 0);
    const needsWebContext = docWordCount < 300; // doc context is thin, supplement with web

    let webResults = [];
    if (needsWebContext && TAVILY_API_KEY) {
      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Fetching SAP documentation...' })}\n\n`);
      res.flush?.();
      webResults = await searchAndFetchSAP(message);
      console.log(`🌐 Tavily: ${webResults.length} SAP pages fetched`);
    }

    // ─── Build context ─────────────────────────────────────────────────────
    let contextText = '';

    if (relevantChunks.length > 0) {
      contextText += '\n\n📄 FROM YOUR UPLOADED DOCUMENTS:\n\n';
      contextText += relevantChunks.map((chunk, i) =>
        `[${i + 1}] "${chunk.documentName}" (Page ${chunk.pageNumber}):\n${chunk.text}`
      ).join('\n\n');
    }

    if (webResults.length > 0) {
      contextText += '\n\n🌐 FROM SAP HELP PORTAL:\n\n';
      webResults.forEach((r, i) => {
        contextText += `[SAP ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}\n\n`;
      });
    }

    // ─── History ───────────────────────────────────────────────────────────
    const previousMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10
    });

    // ─── System prompt ─────────────────────────────────────────────────────
    const systemPrompt = [
      "You are PRISM, a senior SAP implementation consultant writing a detailed training guide.",
      "Your responses must be thorough — a junior consultant should follow with zero prior SAP knowledge.",
      "",
      "MANDATORY STRUCTURE FOR EVERY STEP:",
      "Each **Step N: [Name]** must contain ALL of these sub-sections:",
      "",
      "Navigation: Exact menu path (e.g. SAP Easy Access > Tools > Customizing > IMG > ...). Include T-code if applicable. Cite [Ref: Page X] here.",
      "",
      "Action: Exactly what to click, type, select, or press. Name every field. Name every button. If dropdown, list the options. If table, describe the row. Use arrow notation for sequences.",
      "",
      "Result: What the screen looks like AFTER this step. What confirmation message appears. What changes in the UI. What new fields become available.",
      "",
      "Watch Out: One common mistake for this step. What goes wrong if done incorrectly.",
      "",
      "RULES:",
      "- NEVER skip a sub-section. If document lacks info, use standard SAP behavior knowledge.",
      "- Cite [Ref: Page X] after every step navigation line.",
      "- Use ONLY the provided document context as primary source.",
      "- For YES/NO decision branches ONLY, add a mermaid flowchart block. Linear steps get no mermaid.",
      "- Minimum 150 words per step. More detail is always better.",
      "- Screenshots attach automatically from referenced pages — never say see screenshot."
    ].join("\n")

    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousMessages.slice(0, -1).map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message + contextText }
    ];

    // ─── Stream from Groq ──────────────────────────────────────────────────
    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 4000,
      stream: true
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

    // ─── Find images ───────────────────────────────────────────────────────
    const images = await findImagesForResponse(fullResponse, relevantChunks, documentIds);

    // ─── Save ──────────────────────────────────────────────────────────────
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: fullResponse,
        images: images.length > 0 ? images : null
      }
    });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: conversation.id,
      images,
      webSearchUsed: webResults.length > 0
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('❌ SSE stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
};

module.exports = { streamChatResponse };