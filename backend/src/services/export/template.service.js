const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class TemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../../templates');
    this.compiledTemplates = new Map();
    this.themes = {
      professional: {
        primaryColor: '#0066cc',
        secondaryColor: '#f5f5f5',
        textColor: '#333333',
        headerColor: '#ffffff',
        fontFamily: 'Arial, sans-serif'
      },
      minimal: {
        primaryColor: '#000000',
        secondaryColor: '#ffffff',
        textColor: '#333333',
        headerColor: '#f8f9fa',
        fontFamily: 'Helvetica, sans-serif'
      },
      technical: {
        primaryColor: '#2d3748',
        secondaryColor: '#e2e8f0',
        textColor: '#1a202c',
        headerColor: '#4a5568',
        fontFamily: 'Consolas, monospace'
      }
    };
    
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  registerHelpers() {
    // Date formatting helper
    handlebars.registerHelper('formatDate', (date, format = 'medium') => {
      if (!date) return '';
      
      const d = new Date(date);
      const options = {
        short: { year: '2-digit', month: 'short', day: 'numeric' },
        medium: { year: 'numeric', month: 'long', day: 'numeric' },
        long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit' },
        datetime: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      };
      
      return d.toLocaleDateString('en-US', options[format] || options.medium);
    });

    // Markdown to HTML helper
    handlebars.registerHelper('markdown', (text) => {
      if (!text) return '';
      
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    });

    // Truncate text helper
    handlebars.registerHelper('truncate', (text, length = 100) => {
      if (!text) return '';
      return text.length > length ? text.substring(0, length) + '...' : text;
    });

    // JSON stringify helper
    handlebars.registerHelper('json', (context) => {
      return JSON.stringify(context, null, 2);
    });

    // Loop with index helper
    handlebars.registerHelper('eachWithIndex', (array, options) => {
      if (!array || !Array.isArray(array)) return '';
      
      let result = '';
      for (let i = 0; i < array.length; i++) {
        result += options.fn({ ...array[i], index: i + 1 });
      }
      return result;
    });

    // Conditional helpers
    handlebars.registerHelper('ifEquals', (arg1, arg2, options) => {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    handlebars.registerHelper('ifGreater', (arg1, arg2, options) => {
      return arg1 > arg2 ? options.fn(this) : options.inverse(this);
    });

    // SAP-specific helpers
    handlebars.registerHelper('formatTCode', (tcode) => {
      return tcode ? `<span class="tcode">${tcode}</span>` : '';
    });

    handlebars.registerHelper('sapModuleName', (module) => {
      const moduleNames = {
        'FI': 'Financial Accounting',
        'CO': 'Controlling',
        'MM': 'Materials Management',
        'SD': 'Sales and Distribution',
        'PP': 'Production Planning',
        'QM': 'Quality Management',
        'PM': 'Plant Maintenance',
        'HR': 'Human Resources',
        'PS': 'Project System',
        'WM': 'Warehouse Management'
      };
      return moduleNames[module] || module;
    });
  }

  /**
   * Load and compile template
   */
  async loadTemplate(templateName) {
    try {
      if (this.compiledTemplates.has(templateName)) {
        return this.compiledTemplates.get(templateName);
      }

      const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
      const templateSource = await fs.readFile(templatePath, 'utf8');
      
      const compiledTemplate = handlebars.compile(templateSource);
      this.compiledTemplates.set(templateName, compiledTemplate);
      
      logger.info(`Template loaded and compiled: ${templateName}`);
      return compiledTemplate;

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new AppError(`Template not found: ${templateName}`, 404);
      }
      
      logger.error('Load template error:', error);
      throw new AppError('Failed to load template', 500);
    }
  }

  /**
   * Apply template to export data
   */
  async applyTemplate(exportData, options = {}) {
    try {
      const {
        format,
        theme = 'professional',
        includeMetadata = true,
        includeImages = true,
        includeSources = true,
        language = 'en'
      } = options;

      // Determine template name based on format and type
      const templateName = this.getTemplateName(exportData.type, format);
      
      // Load template
      const template = await this.loadTemplate(templateName);
      
      // Prepare template data
      const templateData = await this.prepareTemplateData(exportData, {
        theme,
        includeMetadata,
        includeImages,
        includeSources,
        language
      });

      // Apply template
      const rendered = template(templateData);

      logger.info('Template applied successfully', {
        template: templateName,
        theme,
        dataType: exportData.type,
        itemCount: exportData.items?.length || 0
      });

      return {
        content: rendered,
        template: templateName,
        theme,
        metadata: templateData.metadata
      };

    } catch (error) {
      logger.error('Apply template error:', error);
      throw error;
    }
  }

  /**
   * Get template name based on data type and format
   */
  getTemplateName(dataType, format) {
    const templateMap = {
      'conversations': {
        'pdf': 'conversation',
        'docx': 'conversation',
        'markdown': 'conversation-md',
        'json': 'conversation-json'
      },
      'documents': {
        'pdf': 'document',
        'docx': 'document',
        'markdown': 'document-md',
        'json': 'document-json'
      },
      'batch': {
        'pdf': 'batch',
        'docx': 'batch',
        'markdown': 'batch-md',
        'json': 'batch-json'
      }
    };

    const formatTemplates = templateMap[dataType];
    if (!formatTemplates) {
      throw new AppError(`Unsupported data type: ${dataType}`, 400);
    }

    const templateName = formatTemplates[format];
    if (!templateName) {
      throw new AppError(`Unsupported format for ${dataType}: ${format}`, 400);
    }

    return templateName;
  }

  /**
   * Prepare template data with theme and options
   */
  async prepareTemplateData(exportData, options = {}) {
    const {
      theme = 'professional',
      includeMetadata,
      includeImages,
      includeSources,
      language
    } = options;

    // Get theme configuration
    const themeConfig = this.themes[theme] || this.themes.professional;

    // Base template data
    const templateData = {
      ...exportData,
      theme: themeConfig,
      options: {
        includeMetadata,
        includeImages,
        includeSources,
        language
      },
      generated: {
        timestamp: new Date(),
        generator: 'PRISM Export System',
        version: '1.0.0'
      }
    };

    // Add title if not present
    if (!templateData.title) {
      templateData.title = this.generateTitle(exportData);
    }

    // Process items based on type
    if (exportData.items && Array.isArray(exportData.items)) {
      templateData.processedItems = await this.processItems(exportData.items, exportData.type, options);
    }

    // Add summary statistics
    templateData.statistics = this.generateStatistics(exportData);

    // Add styling
    templateData.styles = await this.generateStyles(themeConfig, exportData.type);

    return templateData;
  }

  /**
   * Generate appropriate title for export
   */
  generateTitle(exportData) {
    const { type, items, metadata } = exportData;
    
    if (metadata?.exportedBy?.fullName) {
      const userName = metadata.exportedBy.fullName;
      
      switch (type) {
        case 'conversations':
          return `Chat Conversations - ${userName}`;
        case 'documents':
          return `Document Export - ${userName}`;
        case 'batch':
          return `Batch Export - ${userName}`;
        default:
          return `PRISM Export - ${userName}`;
      }
    }

    const count = items?.length || 0;
    switch (type) {
      case 'conversations':
        return `${count} Chat Conversation${count !== 1 ? 's' : ''}`;
      case 'documents':
        return `${count} Document${count !== 1 ? 's' : ''}`;
      case 'batch':
        return `Batch Export (${count} Items)`;
      default:
        return 'PRISM Export';
    }
  }

  /**
   * Process items for template rendering
   */
  async processItems(items, type, options = {}) {
    const processedItems = [];

    for (const item of items) {
      let processedItem = { ...item };

      // Add processed timestamps
      if (item.createdAt) {
        processedItem.createdAtFormatted = this.formatDate(item.createdAt);
      }
      if (item.updatedAt) {
        processedItem.updatedAtFormatted = this.formatDate(item.updatedAt);
      }

      // Type-specific processing
      if (type === 'conversations') {
        processedItem = await this.processConversationItem(processedItem, options);
      } else if (type === 'documents') {
        processedItem = await this.processDocumentItem(processedItem, options);
      }

      // Filter content based on options
      if (!options.includeImages) {
        delete processedItem.images;
      }

      if (!options.includeMetadata) {
        delete processedItem.sapMetadata;
        delete processedItem.metadata;
      }

      processedItems.push(processedItem);
    }

    return processedItems;
  }

  /**
   * Process conversation item for template
   */
  async processConversationItem(conversation, options = {}) {
    const processed = { ...conversation };

    if (processed.messages && Array.isArray(processed.messages)) {
      processed.messages = processed.messages.map(message => ({
        ...message,
        createdAtFormatted: this.formatDate(message.createdAt),
        contentProcessed: options.language === 'html' 
          ? this.markdownToHtml(message.content)
          : message.content,
        roleDisplayName: message.role === 'user' ? 'You' : 'Assistant'
      }));

      // Add conversation statistics
      processed.stats = {
        totalMessages: processed.messages.length,
        userMessages: processed.messages.filter(m => m.role === 'user').length,
        assistantMessages: processed.messages.filter(m => m.role === 'assistant').length,
        avgMessageLength: Math.round(
          processed.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / processed.messages.length
        )
      };
    }

    return processed;
  }

  /**
   * Process document item for template
   */
  async processDocumentItem(document, options = {}) {
    const processed = { ...document };

    // Format file size
    if (processed.fileSize) {
      processed.fileSizeFormatted = this.formatFileSize(processed.fileSize);
    }

    // Process SAP metadata
    if (processed.sapMetadata) {
      processed.sapMetadata.tcodeCount = processed.sapMetadata.tcodes?.length || 0;
      processed.sapMetadata.moduleCount = processed.sapMetadata.modules?.length || 0;
      processed.sapMetadata.errorCodeCount = processed.sapMetadata.errorCodes?.length || 0;
    }

    // Truncate text content if too long
    if (processed.extractedText && processed.extractedText.length > 5000) {
      processed.extractedTextTruncated = processed.extractedText.substring(0, 5000) + '...';
      processed.textTruncated = true;
    }

    return processed;
  }

  /**
   * Generate statistics for export
   */
  generateStatistics(exportData) {
    const { type, items, metadata } = exportData;
    
    const stats = {
      itemCount: items?.length || 0,
      exportDate: new Date(),
      exportType: type
    };

    if (type === 'conversations' && items) {
      const totalMessages = items.reduce((sum, conv) => sum + (conv.messages?.length || 0), 0);
      stats.totalMessages = totalMessages;
      stats.avgMessagesPerConversation = Math.round(totalMessages / items.length);
    }

    if (type === 'documents' && items) {
      const totalSize = items.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);
      stats.totalSize = totalSize;
      stats.totalSizeFormatted = this.formatFileSize(totalSize);
      stats.avgDocumentSize = Math.round(totalSize / items.length);
    }

    if (metadata) {
      stats.exportedBy = metadata.exportedBy;
      stats.exportedAt = metadata.exportedAt;
    }

    return stats;
  }

  /**
   * Generate CSS styles for template
   */
  async generateStyles(themeConfig, dataType) {
    const baseStyles = `
      body {
        font-family: ${themeConfig.fontFamily};
        color: ${themeConfig.textColor};
        line-height: 1.6;
        margin: 0;
        padding: 20px;
      }
      
      .header {
        background-color: ${themeConfig.primaryColor};
        color: ${themeConfig.headerColor};
        padding: 20px;
        margin-bottom: 30px;
        border-radius: 8px;
      }
      
      .content {
        max-width: 800px;
        margin: 0 auto;
      }
      
      .item {
        background-color: ${themeConfig.secondaryColor};
        padding: 20px;
        margin-bottom: 20px;
        border-radius: 8px;
        border-left: 4px solid ${themeConfig.primaryColor};
      }
      
      .tcode {
        background-color: ${themeConfig.primaryColor};
        color: ${themeConfig.headerColor};
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.9em;
      }
      
      .metadata {
        font-size: 0.9em;
        color: #666;
        margin-top: 10px;
      }
      
      .message {
        margin-bottom: 15px;
        padding: 10px;
        border-radius: 6px;
      }
      
      .message.user {
        background-color: #e3f2fd;
        text-align: right;
      }
      
      .message.assistant {
        background-color: #f5f5f5;
      }
      
      @media print {
        body { margin: 0; padding: 10px; }
        .item { page-break-inside: avoid; }
      }
    `;

    return baseStyles;
  }

  /**
   * Utility: Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Utility: Format date
   */
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Utility: Convert markdown to HTML
   */
  markdownToHtml(text) {
    if (!text) return '';
    
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Get available themes
   */
  getAvailableThemes() {
    return Object.keys(this.themes).map(key => ({
      name: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      config: this.themes[key]
    }));
  }

  /**
   * Add custom theme
   */
  addCustomTheme(name, config) {
    this.themes[name] = {
      primaryColor: config.primaryColor || '#0066cc',
      secondaryColor: config.secondaryColor || '#f5f5f5',
      textColor: config.textColor || '#333333',
      headerColor: config.headerColor || '#ffffff',
      fontFamily: config.fontFamily || 'Arial, sans-serif'
    };

    logger.info(`Custom theme added: ${name}`);
    return this.themes[name];
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.compiledTemplates.clear();
    logger.info('Template cache cleared');
  }

  /**
   * Get template cache statistics
   */
  getCacheStats() {
    return {
      cachedTemplates: this.compiledTemplates.size,
      availableThemes: Object.keys(this.themes).length,
      templatesDirectory: this.templatesDir
    };
  }
}

module.exports = new TemplateService();