const Groq = require('groq-sdk');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class GroqService {
  constructor() {
    if (!config.ai.groq.apiKey) {
      logger.warn('Groq API key not configured - AI features will be disabled');
      this.client = null;
    } else {
      this.client = new Groq({
        apiKey: config.ai.groq.apiKey
      });
    }
  }

  /**
   * Generate AI response to user message
   */
  async generateResponse({ message, conversationHistory = [], context = {}, userId, regenerate = false }) {
    if (!this.client) {
      throw new AppError('AI service not configured', 503);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const messages = this.buildMessageHistory(systemPrompt, conversationHistory, message);

      logger.info('Generating AI response', {
        userId,
        messageLength: message.length,
        historyLength: conversationHistory.length,
        hasContext: Object.keys(context).length > 0,
        regenerate
      });

      const startTime = Date.now();

      const chatCompletion = await this.client.chat.completions.create({
        messages,
        model: config.ai.groq.model,
        max_tokens: config.ai.groq.maxTokens,
        temperature: 0.7,
        top_p: 0.9,
        stop: null,
        stream: false
      });

      const processingTime = Date.now() - startTime;
      const response = chatCompletion.choices[0]?.message?.content || '';
      const tokenCount = chatCompletion.usage?.total_tokens || 0;

      logger.info('AI response generated', {
        userId,
        responseLength: response.length,
        tokenCount,
        processingTime
      });

      // Extract metadata from response
      const metadata = this.extractMetadata(response, context);

      return {
        content: response,
        tokenCount,
        processingTime,
        metadata,
        model: config.ai.groq.model
      };

    } catch (error) {
      logger.error('Groq API error:', error);
      
      if (error.status === 429) {
        throw new AppError('AI service rate limit exceeded. Please try again later.', 429);
      } else if (error.status === 401) {
        throw new AppError('AI service authentication failed', 503);
      } else if (error.status >= 500) {
        throw new AppError('AI service temporarily unavailable', 503);
      } else {
        throw new AppError('Failed to generate AI response', 500);
      }
    }
  }

  /**
   * Build system prompt based on context
   */
  buildSystemPrompt(context) {
    let systemPrompt = `You are PRISM, an intelligent SAP assistant. You help users with SAP-related questions, document analysis, and provide step-by-step guidance.

Key guidelines:
- Be helpful, accurate, and professional
- Focus on SAP-specific knowledge and best practices
- Provide step-by-step instructions when applicable
- Use proper SAP terminology and transaction codes
- If you're unsure about something, acknowledge it
- Format responses clearly with proper structure`;

    // Add context-specific instructions
    if (context.userDocuments && context.userDocuments.length > 0) {
      systemPrompt += `\n\nUser Documents Context:
The user has uploaded ${context.userDocuments.length} document(s) that may be relevant:`;
      
      context.userDocuments.forEach((doc, index) => {
        systemPrompt += `\n${index + 1}. ${doc.name}`;
        if (doc.summary) systemPrompt += `: ${doc.summary}`;
      });
      
      systemPrompt += '\nRefer to these documents when relevant to answer the user\'s questions.';
    }

    if (context.sapMetadata && (context.sapMetadata.tcodes.length > 0 || context.sapMetadata.modules.length > 0)) {
      systemPrompt += `\n\nUser's SAP Environment:`;
      
      if (context.sapMetadata.modules.length > 0) {
        systemPrompt += `\nModules: ${context.sapMetadata.modules.join(', ')}`;
      }
      
      if (context.sapMetadata.tcodes.length > 0) {
        systemPrompt += `\nTransaction Codes: ${context.sapMetadata.tcodes.slice(0, 10).join(', ')}`;
        if (context.sapMetadata.tcodes.length > 10) {
          systemPrompt += ` and ${context.sapMetadata.tcodes.length - 10} more`;
        }
      }
    }

    if (context.relevantContent && context.relevantContent.length > 0) {
      systemPrompt += `\n\nRelevant Document Content:`;
      context.relevantContent.forEach((content, index) => {
        systemPrompt += `\n${index + 1}. From "${content.name}": ${content.relevantText}`;
      });
    }

    return systemPrompt;
  }

  /**
   * Build message history for API call
   */
  buildMessageHistory(systemPrompt, conversationHistory, currentMessage) {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (limit to recent messages)
    const recentHistory = conversationHistory.slice(-8); // Last 8 messages
    
    recentHistory.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });

    return messages;
  }

  /**
   * Extract metadata from AI response
   */
  extractMetadata(response, context) {
    const metadata = {
      sapElements: {
        tcodes: [],
        modules: [],
        processes: []
      },
      responseType: 'general',
      confidence: 0.8
    };

    // Extract T-Codes mentioned in response
    const tcodePattern = /\b[A-Z]{2,4}\d{0,3}[A-Z]?\b/g;
    const foundTCodes = response.match(tcodePattern) || [];
    metadata.sapElements.tcodes = [...new Set(foundTCodes)];

    // Extract SAP modules
    const sapModules = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'PM', 'HR', 'PS', 'WM'];
    metadata.sapElements.modules = sapModules.filter(module => 
      response.includes(module)
    );

    // Determine response type
    if (response.includes('Step') || response.includes('1.') || response.includes('First')) {
      metadata.responseType = 'step-by-step';
    } else if (foundTCodes.length > 0) {
      metadata.responseType = 'sap-technical';
    } else if (response.includes('error') || response.includes('issue')) {
      metadata.responseType = 'troubleshooting';
    }

    // Adjust confidence based on context
    if (context.userDocuments && context.userDocuments.length > 0) {
      metadata.confidence = Math.min(0.95, metadata.confidence + 0.1);
    }

    return metadata;
  }

  /**
   * Stream AI response for real-time updates
   */
  async streamResponse({ message, conversationHistory = [], context = {}, onToken, onComplete }) {
    if (!this.client) {
      throw new AppError('AI service not configured', 503);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const messages = this.buildMessageHistory(systemPrompt, conversationHistory, message);

      const stream = await this.client.chat.completions.create({
        messages,
        model: config.ai.groq.model,
        max_tokens: config.ai.groq.maxTokens,
        temperature: 0.7,
        top_p: 0.9,
        stream: true
      });

      let fullContent = '';
      let tokenCount = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          tokenCount++;
          onToken(content);
        }
      }

      const metadata = this.extractMetadata(fullContent, context);
      onComplete(fullContent, metadata);

    } catch (error) {
      logger.error('Groq streaming error:', error);
      throw new AppError('Failed to stream AI response', 500);
    }
  }

  /**
   * Generate summary of text
   */
  async generateSummary(text, maxLength = 200) {
    if (!this.client) {
      throw new AppError('AI service not configured', 503);
    }

    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise summaries. Focus on the main points and key information.'
        },
        {
          role: 'user',
          content: `Please provide a concise summary of the following text in no more than ${maxLength} words:\n\n${text}`
        }
      ];

      const chatCompletion = await this.client.chat.completions.create({
        messages,
        model: config.ai.groq.model,
        max_tokens: Math.ceil(maxLength * 1.5),
        temperature: 0.5
      });

      const summary = chatCompletion.choices[0]?.message?.content || '';

      return {
        content: summary.trim(),
        originalLength: text.length,
        summaryLength: summary.length,
        compressionRatio: text.length > 0 ? Math.round((summary.length / text.length) * 100) : 0
      };

    } catch (error) {
      logger.error('Summary generation error:', error);
      throw new AppError('Failed to generate summary', 500);
    }
  }

  /**
   * Analyze document content for insights
   */
  async analyzeDocument(content, documentType = 'sap') {
    if (!this.client) {
      throw new AppError('AI service not configured', 503);
    }

    try {
      const analysisPrompt = documentType === 'sap' 
        ? 'Analyze this SAP document and extract key information including transaction codes, modules, processes, and any issues or recommendations. Provide a structured analysis.'
        : 'Analyze this document and provide key insights, main topics, and important information.';

      const messages = [
        {
          role: 'system',
          content: `You are an expert document analyst. ${analysisPrompt}`
        },
        {
          role: 'user',
          content: `Please analyze the following document content:\n\n${content.substring(0, 4000)}`
        }
      ];

      const chatCompletion = await this.client.chat.completions.create({
        messages,
        model: config.ai.groq.model,
        max_tokens: 1000,
        temperature: 0.3
      });

      const analysis = chatCompletion.choices[0]?.message?.content || '';

      return {
        analysis: analysis.trim(),
        documentType,
        analyzedLength: content.length,
        confidence: 0.8
      };

    } catch (error) {
      logger.error('Document analysis error:', error);
      throw new AppError('Failed to analyze document', 500);
    }
  }

  /**
   * Generate step-by-step guide
   */
  async generateGuide(topic, context = {}) {
    if (!this.client) {
      throw new AppError('AI service not configured', 503);
    }

    try {
      let prompt = `Create a detailed step-by-step guide for: ${topic}

Please provide:
1. Clear, numbered steps
2. Any relevant SAP transaction codes
3. Prerequisites if needed
4. Tips and best practices
5. Common issues and solutions`;

      if (context.sapModule) {
        prompt += `\nFocus on the ${context.sapModule} module.`;
      }

      const messages = [
        {
          role: 'system',
          content: 'You are an expert SAP consultant. Create detailed, actionable step-by-step guides that are easy to follow.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const chatCompletion = await this.client.chat.completions.create({
        messages,
        model: config.ai.groq.model,
        max_tokens: 2000,
        temperature: 0.4
      });

      const guide = chatCompletion.choices[0]?.message?.content || '';
      const steps = this.extractSteps(guide);

      return {
        topic,
        guide: guide.trim(),
        steps,
        metadata: this.extractMetadata(guide, context)
      };

    } catch (error) {
      logger.error('Guide generation error:', error);
      throw new AppError('Failed to generate guide', 500);
    }
  }

  /**
   * Extract structured steps from guide text
   */
  extractSteps(guideText) {
    const steps = [];
    const stepPattern = /^\d+\.\s+(.+?)(?=\n\d+\.|$)/gm;
    let match;

    while ((match = stepPattern.exec(guideText)) !== null) {
      const stepText = match[1].trim();
      const tcodes = stepText.match(/\b[A-Z]{2,4}\d{0,3}[A-Z]?\b/g) || [];
      
      steps.push({
        number: steps.length + 1,
        description: stepText,
        tcodes: [...new Set(tcodes)]
      });
    }

    return steps;
  }

  /**
   * Check service health
   */
  async healthCheck() {
    if (!this.client) {
      return {
        status: 'disabled',
        message: 'Groq API key not configured'
      };
    }

    try {
      const testCompletion = await this.client.chat.completions.create({
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        model: config.ai.groq.model,
        max_tokens: 10
      });

      return {
        status: 'healthy',
        model: config.ai.groq.model,
        response: testCompletion.choices[0]?.message?.content || 'No response'
      };

    } catch (error) {
      logger.error('Groq health check failed:', error);
      return {
        status: 'error',
        message: error.message,
        code: error.status
      };
    }
  }
}

module.exports = new GroqService();