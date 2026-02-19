// backend/src/controllers/chat-stream.controller.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const Groq = require('groq-sdk');
const embeddingSearchService = require('../services/vector/embedding-search.service');

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

    // 🔥 Corrected embedding search call
    console.log('🔍 Searching for relevant context...');
    const relevantChunks =
      await embeddingSearchService.search(userId, message, 5);

    console.log(`📚 Context retrieved: ${relevantChunks.length} chunks`);

    const images = relevantChunks
      .filter(chunk => chunk.imageUrl)
      .map(chunk => ({
        url: chunk.imageUrl,
        pageNumber: chunk.pageNumber,
        documentId: chunk.documentId,
        documentName: chunk.documentName
      }));

    console.log(`🖼️ Images found: ${images.length}`);

    // Build context
    let contextText = '';
    if (relevantChunks.length > 0) {
      contextText =
        '\n\n📚 Relevant Information:\n\n' +
        relevantChunks.map((chunk, i) =>
          `[${i + 1}] From "${chunk.documentName}" (Page ${chunk.pageNumber}):\n${chunk.text}`
        ).join('\n\n');
    }

    const previousMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10
    });

    const messages = [
  {
    role: 'system',
    content: `You are an expert SAP assistant with access to technical documentation and screenshots.

RESPONSE STYLE:
- Provide detailed, step-by-step explanations in your own words
- Include brief citations for credibility (e.g., "according to page 14..." or "as outlined in the Operations Guide...")
- When screenshots are available, reference them naturally within the relevant step
- Balance technical accuracy with clear, practical guidance

FORMAT FOR STEP-BY-STEP INSTRUCTIONS:
1. **Step Name**: Detailed explanation of what to do and why. [Reference: Page X, screenshot available]
2. **Next Step**: Clear instructions with context. [Reference: Page Y]

Example:
1. **Configure User Management**: SAP S/4HANA uses the ABAP Platform's authentication system. Navigate to the security settings and configure role-based access control according to your organization's needs. [Reference: Page 13, Administration Guide. See screenshot below for the interface.]

Always integrate citations naturally without disrupting the flow of explanation.`
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

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: fullResponse,
        images: images.length > 0
          ? JSON.stringify(images)
          : null
      }
    });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: conversation.id,
      images
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
