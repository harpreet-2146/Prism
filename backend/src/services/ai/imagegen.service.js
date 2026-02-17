const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class ImageGenService {
  constructor() {
    this.apiKey = config.ai.google.apiKey;
    this.model = 'imagen-3.0-generate-001';
    this.maxPromptLength = 1000;
  }

  /**
   * Generate step-by-step guide images
   */
  async generateStepGuideImages(steps, context = {}) {
    if (!this.apiKey) {
      logger.warn('Google AI API key not configured - image generation disabled');
      return [];
    }

    try {
      const images = [];

      for (let i = 0; i < Math.min(steps.length, 10); i++) {
        const step = steps[i];
        const prompt = this.buildStepPrompt(step, context);
        
        const imageUrl = await this.generateSingleImage(prompt, {
          style: 'technical_diagram',
          size: '1024x768',
          stepNumber: i + 1
        });

        if (imageUrl) {
          images.push({
            stepNumber: i + 1,
            stepTitle: step.title || `Step ${i + 1}`,
            imageUrl,
            prompt: prompt.substring(0, 200),
            generated: new Date()
          });
        }

        // Rate limiting delay
        await this.sleep(1000);
      }

      logger.info('Step guide images generated', {
        totalSteps: steps.length,
        imagesGenerated: images.length
      });

      return images;

    } catch (error) {
      logger.error('Generate step guide images error:', error);
      throw new AppError('Failed to generate step guide images', 500);
    }
  }

  /**
   * Build prompt for step image generation
   */
  buildStepPrompt(step, context = {}) {
    let prompt = `Technical illustration showing step ${step.number}: ${step.description}. `;
    
    // Add SAP context if available
    if (context.sapModule) {
      prompt += `Focus on SAP ${context.sapModule} module interface. `;
    }
    
    if (step.tcodes && step.tcodes.length > 0) {
      prompt += `Show SAP transaction ${step.tcodes[0]} screen. `;
    }

    prompt += `Style: Clean technical diagram, SAP GUI interface, professional business software, `;
    prompt += `blue and white color scheme, clear labels, step-by-step visual guide, `;
    prompt += `screenshot-like appearance, software interface, business application`;

    return prompt.substring(0, this.maxPromptLength);
  }

  /**
   * Generate single image using Google AI
   */
  async generateSingleImage(prompt, options = {}) {
    try {
      const requestBody = {
        instances: [{
          prompt: prompt,
          negative_prompt: 'blurry, low quality, distorted, unprofessional, cartoon, artistic',
          guidance_scale: options.guidanceScale || 7,
          steps: options.steps || 20,
          width: options.width || 1024,
          height: options.height || 768,
          seed: options.seed || Math.floor(Math.random() * 1000000)
        }],
        parameters: {
          sampleCount: 1
        }
      };

      const response = await fetch(
        `https://us-central1-aiplatform.googleapis.com/v1/projects/${config.ai.google.projectId}/locations/us-central1/publishers/google/models/${this.model}:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        throw new Error(`Image generation failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.predictions && data.predictions[0]) {
        return data.predictions[0].bytesBase64Encoded;
      }

      return null;

    } catch (error) {
      logger.error('Single image generation error:', error);
      return null; // Don't fail the whole process for one image
    }
  }

  /**
   * Get Google Cloud access token
   */
  async getAccessToken() {
    // Placeholder - would implement proper Google Cloud authentication
    // In production, use Google Cloud SDK or service account
    return 'placeholder-access-token';
  }

  /**
   * Generate SAP screenshot mockups
   */
  async generateSAPScreenshots(tcodes, options = {}) {
    if (!this.apiKey) {
      return [];
    }

    try {
      const screenshots = [];

      for (const tcode of tcodes.slice(0, 5)) {
        const prompt = this.buildSAPScreenPrompt(tcode, options);
        
        const imageUrl = await this.generateSingleImage(prompt, {
          style: 'sap_interface',
          width: 1200,
          height: 900
        });

        if (imageUrl) {
          screenshots.push({
            tcode,
            imageUrl,
            description: `SAP ${tcode} transaction screen`,
            generated: new Date()
          });
        }

        await this.sleep(1500);
      }

      return screenshots;

    } catch (error) {
      logger.error('Generate SAP screenshots error:', error);
      return [];
    }
  }

  /**
   * Build SAP screen prompt
   */
  buildSAPScreenPrompt(tcode, options = {}) {
    let prompt = `Professional SAP GUI screenshot showing transaction ${tcode}. `;
    prompt += `Realistic SAP interface with blue header bar, menu structure, form fields, `;
    prompt += `buttons, status bar. Clean business application interface, `;
    prompt += `typical SAP R/3 or S/4HANA look and feel. Professional, corporate style, `;
    prompt += `clear readable text, proper SAP branding colors`;

    if (options.module) {
      prompt += `. Focus on ${options.module} module functionality`;
    }

    return prompt.substring(0, this.maxPromptLength);
  }

  /**
   * Generate diagram for process flow
   */
  async generateProcessDiagram(processSteps, title = 'Process Flow') {
    if (!this.apiKey) {
      return null;
    }

    try {
      const prompt = `Professional business process diagram titled "${title}". `;
      prompt += `Show ${processSteps.length} connected steps: ${processSteps.slice(0, 5).join(' -> ')}. `;
      prompt += `Clean flowchart style, professional business diagram, arrows connecting steps, `;
      prompt += `blue and white color scheme, clear labels, corporate presentation style`;

      const imageUrl = await this.generateSingleImage(prompt, {
        style: 'business_diagram',
        width: 1200,
        height: 600
      });

      if (imageUrl) {
        return {
          title,
          imageUrl,
          steps: processSteps.length,
          generated: new Date()
        };
      }

      return null;

    } catch (error) {
      logger.error('Generate process diagram error:', error);
      return null;
    }
  }

  /**
   * Generate error resolution visual
   */
  async generateErrorGuideImage(errorCode, solution) {
    if (!this.apiKey) {
      return null;
    }

    try {
      const prompt = `Technical troubleshooting diagram for SAP error ${errorCode}. `;
      prompt += `Show problem identification and solution steps: ${solution.substring(0, 200)}. `;
      prompt += `Professional technical diagram, problem-solution format, `;
      prompt += `clear visual indicators, red for problems, green for solutions, `;
      prompt += `business software interface style`;

      const imageUrl = await this.generateSingleImage(prompt, {
        style: 'technical_guide',
        width: 1024,
        height: 768
      });

      if (imageUrl) {
        return {
          errorCode,
          imageUrl,
          solution: solution.substring(0, 100),
          generated: new Date()
        };
      }

      return null;

    } catch (error) {
      logger.error('Generate error guide image error:', error);
      return null;
    }
  }

  /**
   * Convert base64 image to file
   */
  async saveImageFromBase64(base64Data, filename, outputDir) {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      await fs.mkdir(outputDir, { recursive: true });
      
      const buffer = Buffer.from(base64Data, 'base64');
      const filepath = path.join(outputDir, filename);
      
      await fs.writeFile(filepath, buffer);
      
      return {
        filename,
        filepath,
        size: buffer.length,
        saved: true
      };

    } catch (error) {
      logger.error('Save image error:', error);
      return {
        filename,
        filepath: null,
        size: 0,
        saved: false,
        error: error.message
      };
    }
  }

  /**
   * Generate image variations
   */
  async generateVariations(basePrompt, count = 3) {
    if (!this.apiKey || count > 5) {
      return [];
    }

    try {
      const variations = [];
      const styleVariants = [
        'clean minimalist',
        'detailed professional',
        'modern flat design',
        'technical blueprint',
        'corporate presentation'
      ];

      for (let i = 0; i < Math.min(count, styleVariants.length); i++) {
        const styledPrompt = `${basePrompt}. Style: ${styleVariants[i]}`;
        
        const imageUrl = await this.generateSingleImage(styledPrompt, {
          seed: Math.floor(Math.random() * 1000000),
          guidanceScale: 8
        });

        if (imageUrl) {
          variations.push({
            variation: i + 1,
            style: styleVariants[i],
            imageUrl,
            prompt: styledPrompt.substring(0, 200)
          });
        }

        await this.sleep(1200);
      }

      return variations;

    } catch (error) {
      logger.error('Generate variations error:', error);
      return [];
    }
  }

  /**
   * Check service health
   */
  async healthCheck() {
    if (!this.apiKey) {
      return {
        status: 'disabled',
        message: 'Google AI API key not configured'
      };
    }

    try {
      // Simple test generation
      const testPrompt = 'Simple blue square on white background';
      const result = await this.generateSingleImage(testPrompt, {
        width: 256,
        height: 256,
        steps: 10
      });

      return {
        status: result ? 'healthy' : 'warning',
        model: this.model,
        message: result ? 'Image generation working' : 'Image generation returning null'
      };

    } catch (error) {
      logger.error('Image generation health check failed:', error);
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Get generation statistics
   */
  getStats() {
    return {
      model: this.model,
      maxPromptLength: this.maxPromptLength,
      supportedStyles: [
        'technical_diagram',
        'sap_interface', 
        'business_diagram',
        'technical_guide'
      ],
      defaultSizes: ['1024x768', '1200x900', '1200x600'],
      rateLimit: '1 request per second',
      features: {
        stepGuides: true,
        sapScreenshots: true,
        processDiagrams: true,
        errorGuides: true,
        variations: true
      }
    };
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ImageGenService();