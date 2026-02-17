// backend/src/services/ai/groq.service.js
'use strict';

const Groq = require('groq-sdk');
const config = require('../../config');
const { logger } = require('../../utils/logger');

class GroqService {
  constructor() {
    this.client = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;
    this.model = config.GROQ_MODEL;
    this.maxTokens = config.GROQ_MAX_TOKENS;
    this.temperature = config.GROQ_TEMPERATURE;

    if (!this.client) {
      logger.warn('GROQ_API_KEY not set — AI chat unavailable', { component: 'groq-service' });
    }
  }

  // ----------------------------------------------------------------
  // STREAMING (used by chat controller SSE endpoint)
  // ----------------------------------------------------------------

  /**
   * Stream a response token by token.
   * Yields string chunks as they arrive from Groq.
   *
   * @param {Array}  messages - [{role, content}] conversation history
   * @param {Array}  context  - Semantic search results from embedding-search.service
   * @yields {string} token chunks
   */
  async *streamResponse(messages, context = []) {
    if (!this.client) throw new Error('Groq API key not configured');

    const systemPrompt = this._buildSystemPrompt(context);

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      top_p: 0.9,
      stream: true
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) yield token;
    }
  }

  // ----------------------------------------------------------------
  // NON-STREAMING (used for title generation etc.)
  // ----------------------------------------------------------------

  /**
   * Get a complete response without streaming.
   *
   * @param {Array}  messages
   * @param {Array}  context
   * @returns {string} Full response text
   */
  async generateResponse(messages, context = []) {
    if (!this.client) throw new Error('Groq API key not configured');

    const systemPrompt = this._buildSystemPrompt(context);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      tokensUsed: completion.usage?.total_tokens || null
    };
  }

  /**
   * Generate a short conversation title from the first user message.
   * Separate method so it doesn't use the full SAP system prompt.
   *
   * @param {string} firstMessage
   * @returns {string} Title (max 60 chars)
   */
  async generateTitle(firstMessage) {
    if (!this.client) return this._fallbackTitle(firstMessage);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Generate a short, descriptive title (max 6 words, no quotes) for a chat that starts with the following user message. Reply with ONLY the title.'
          },
          { role: 'user', content: firstMessage.slice(0, 200) }
        ],
        temperature: 0.3,
        max_tokens: 20,
        stream: false
      });

      const raw = completion.choices[0]?.message?.content?.trim() || '';
      return raw.slice(0, 60) || this._fallbackTitle(firstMessage);

    } catch {
      return this._fallbackTitle(firstMessage);
    }
  }

  // ----------------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------------

  async healthCheck() {
    if (!this.client) {
      return { status: 'unavailable', reason: 'GROQ_API_KEY not configured' };
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 5,
        temperature: 0,
        stream: false
      });

      return {
        status: 'healthy',
        model: this.model,
        testResponse: completion.choices[0]?.message?.content?.trim()
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, model: this.model };
    }
  }

  // ----------------------------------------------------------------
  // INTERNAL
  // ----------------------------------------------------------------

  _buildSystemPrompt(context = []) {
    let prompt = `You are PRISM, an expert SAP consultant AI assistant with deep knowledge of SAP ERP systems (FI, CO, MM, SD, PP, HR, and all other modules).

Your goal is to provide clear, accurate, step-by-step guidance for SAP configuration, troubleshooting, and implementation.

When answering:
1. Start with a brief 2–3 sentence summary
2. Provide numbered steps with clear descriptions
3. Include SAP transaction codes (T-Codes) where relevant, formatted as: T-Code: FB01
4. Mention where screenshots would help (the frontend will attach them automatically)
5. If the process flow is complex, describe it clearly in text
6. Always be practical and specific

Format your response as valid JSON with this exact structure:
{
  "summary": "Brief overview of the answer",
  "steps": [
    {
      "title": "Step title",
      "description": "Detailed explanation of this step",
      "tcode": "FB01",
      "screenshotDescription": "What the user will see on screen at this step"
    }
  ],
  "sources": [],
  "hasDiagram": false
}

If no steps are needed (e.g. a simple factual answer), use an empty steps array and put the answer in summary.
Always respond with valid JSON. Do not include markdown code fences.`;

    if (context.length > 0) {
      prompt += `\n\n# Context from user's uploaded SAP documents:\n\n`;
      context.forEach((chunk, i) => {
        prompt += `## Excerpt ${i + 1} (${chunk.documentName}, page ${chunk.pageNumber})\n${chunk.text}\n\n`;
      });
      prompt += `Use this context to answer accurately. Cite the document name in the sources array.`;
    }

    return prompt;
  }

  _fallbackTitle(message) {
    return message.trim().slice(0, 50) || 'New Chat';
  }
}

module.exports = new GroqService();