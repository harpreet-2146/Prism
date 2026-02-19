// backend/src/controllers/chat-stream.controller.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const embeddingSearchService = require('../services/vector/embedding-search.service');
const tavilyService = require('../services/tavily.service'); // 🆕 NEW

const prisma = new PrismaClient();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * SSE Stream chat response
 * GET /api/chat/conversations/:id/stream?message=...&token=...
 */
const streamChatResponse = async (req, res) => {
  const conversationId = req.params.id;
  const message = req.query.message;
  const userId = req.user.userId;

  console.log('🔥 SSE chat stream started', {
    conversationId,
    userId,
    messagePreview: message?.substring(0, 50)
  });

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  res.flush?.();

  let conversation = null;

  try {
    // Create or load conversation
    if (conversationId === 'new' || conversationId === 'undefined') {
      console.log('📝 Creating new conversation');

      conversation = await prisma.conversation.create({
        data: {
          userId,
          title:
            message.substring(0, 50) +
            (message.length > 50 ? '...' : '')
        }
      });

      console.log('✅ Conversation created:', conversation.id);

      res.write(`data: ${JSON.stringify({
        type: 'conversation_created',
        conversationId: conversation.id
      })}\n\n`);
      res.flush?.();

    } else {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId }
      });

      if (!conversation) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Conversation not found'
        })}\n\n`);
        return res.end();
      }
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message
      }
    });

    // 🆕 STEP 1: Search PDFs (ALWAYS)
    console.log('🔍 Searching PDF documents...');
    const relevantChunks = await embeddingSearchService.search(userId, message, 10);
    console.log(`📚 PDF Context: ${relevantChunks.length} chunks`);

    // 🆕 STEP 2: Check if web search needed
    const needsWebSearch = tavilyService.shouldSearchWeb(message);
    let webResults = [];

    if (needsWebSearch) {
      console.log('🌐 Web search triggered');
      
      res.write(`data: ${JSON.stringify({
        type: 'status',
        message: 'Searching SAP community and documentation...'
      })}\n\n`);
      res.flush?.();

      const pdfContext = relevantChunks.map(chunk => ({
        text: chunk.text,
        sapModule: chunk.sapModule
      }));

      webResults = await tavilyService.search(message, pdfContext);
      console.log(`🌐 Web results: ${webResults.length} found`);
    }

    // Extract images from PDF context
    const images = relevantChunks
      .filter(chunk => chunk.imageUrl)
      .map(chunk => ({
        url: chunk.imageUrl,
        pageNumber: chunk.pageNumber,
        documentId: chunk.documentId,
        documentName: chunk.documentName
      }));

    console.log(`🖼️ Images found: ${images.length}`);

    // 🆕 Build enhanced context
    let contextText = '';

    // PDF context
    if (relevantChunks.length > 0) {
      contextText += '\n\n📄 INFORMATION FROM YOUR UPLOADED DOCUMENTS:\n\n';
      contextText += relevantChunks.map((chunk, i) =>
        `[${i + 1}] From "${chunk.documentName}" (Page ${chunk.pageNumber}):\n${chunk.text}`
      ).join('\n\n');
    }

    // Web context
    if (webResults.length > 0) {
      contextText += '\n\n🌐 ADDITIONAL INFORMATION FROM SAP COMMUNITY:\n\n';
      webResults.forEach((result, idx) => {
        contextText += `[Web ${idx + 1}] ${result.title}\n`;
        contextText += `${result.snippet}\n`;
        contextText += `Source: ${result.url}\n\n`;
      });
    }

    // Get conversation history
    const previousMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10
    });

    // 🆕 Enhanced system prompt
    const systemPrompt = `You are PRISM, an expert SAP assistant${webResults.length > 0 ? ' with access to SAP community knowledge' : ''}.

RESPONSE STYLE:
- Provide detailed, step-by-step explanations
- Include brief citations (e.g., "according to page 14..." or "based on SAP Community...")
- Reference screenshots naturally when available
- Balance technical accuracy with clarity

${webResults.length > 0 ? '- Clearly distinguish between user documents vs. external sources\n- Prioritize official SAP documentation\n' : ''}
FORMAT:
1. **Step Name**: Explanation [Reference: Source]
2. **Next Step**: Instructions [Reference: Source]

Integrate citations naturally.`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...previousMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: message + contextText
      }
    ];

    console.log('🤖 Streaming response from Groq...');

    const completion = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2048,
      stream: true
    });

    let fullResponse = '';

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({
          type: 'token',
          content
        })}\n\n`);
        res.flush?.();
      }
    }

    console.log('✅ Streaming complete');

    // Save assistant message with metadata
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: fullResponse,
        images: images.length > 0 ? JSON.stringify(images) : null,
        metadata: webResults.length > 0 ? {
          webSearchUsed: true,
          webResultsCount: webResults.length
        } : null
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

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);

    res.end();
  }
};

module.exports = { streamChatResponse };