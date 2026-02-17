const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class PDFExportService {
  constructor() {
    this.browser = null;
    this.defaultOptions = {
      format: 'A4',
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size: 10px; margin: 0 auto; color: #666; width: 100%; text-align: center;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `
    };
  }

  /**
   * Initialize browser instance
   */
  async initializeBrowser() {
    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });

        logger.info('PDF browser initialized');
      }

      return this.browser;
    } catch (error) {
      logger.error('Browser initialization error:', error);
      throw new AppError('Failed to initialize PDF generation browser', 500);
    }
  }

  /**
   * Generate PDF from template data
   */
  async generatePDF(templateData, outputPath, options = {}) {
    let page = null;

    try {
      // Initialize browser
      const browser = await this.initializeBrowser();
      page = await browser.newPage();

      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 1600 });

      // Generate HTML content
      const htmlContent = await this.buildHTMLContent(templateData);

      // Set content
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // PDF generation options
      const pdfOptions = {
        ...this.defaultOptions,
        ...options,
        path: outputPath
      };

      // Generate PDF
      await page.pdf(pdfOptions);

      logger.info('PDF generated successfully', {
        outputPath,
        fileExists: await this.fileExists(outputPath)
      });

      return outputPath;

    } catch (error) {
      logger.error('PDF generation error:', error);
      throw new AppError('Failed to generate PDF', 500);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Build complete HTML content for PDF
   */
  async buildHTMLContent(templateData) {
    const { content, theme, metadata } = templateData;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${metadata?.title || 'PRISM Export'}</title>
        <style>
          ${await this.generatePDFStyles(theme)}
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Generate PDF-optimized CSS styles
   */
  async generatePDFStyles(theme = {}) {
    const {
      primaryColor = '#0066cc',
      secondaryColor = '#f5f5f5',
      textColor = '#333333',
      headerColor = '#ffffff',
      fontFamily = 'Arial, sans-serif'
    } = theme;

    return `
      * {
        box-sizing: border-box;
      }

      body {
        font-family: ${fontFamily};
        font-size: 12px;
        line-height: 1.6;
        color: ${textColor};
        margin: 0;
        padding: 0;
        background: white;
        -webkit-print-color-adjust: exact;
        color-adjust: exact;
      }

      .page-header {
        background: ${primaryColor};
        color: ${headerColor};
        padding: 20px;
        margin-bottom: 30px;
        text-align: center;
        border-radius: 8px;
      }

      .page-header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
      }

      .page-header .subtitle {
        margin: 5px 0 0 0;
        font-size: 14px;
        opacity: 0.9;
      }

      .content-section {
        margin-bottom: 30px;
        page-break-inside: avoid;
      }

      .section-title {
        font-size: 18px;
        font-weight: bold;
        color: ${primaryColor};
        border-bottom: 2px solid ${primaryColor};
        padding-bottom: 5px;
        margin-bottom: 15px;
      }

      .item-card {
        background: ${secondaryColor};
        border: 1px solid #ddd;
        border-left: 4px solid ${primaryColor};
        padding: 15px;
        margin-bottom: 20px;
        border-radius: 6px;
        page-break-inside: avoid;
      }

      .item-title {
        font-size: 16px;
        font-weight: bold;
        color: ${primaryColor};
        margin-bottom: 10px;
      }

      .item-meta {
        font-size: 11px;
        color: #666;
        margin-bottom: 10px;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
      }

      .message-container {
        margin: 10px 0;
      }

      .message {
        padding: 10px;
        margin: 8px 0;
        border-radius: 6px;
        page-break-inside: avoid;
      }

      .message.user {
        background: #e3f2fd;
        border-left: 3px solid #2196f3;
        margin-left: 20px;
      }

      .message.assistant {
        background: #f5f5f5;
        border-left: 3px solid ${primaryColor};
        margin-right: 20px;
      }

      .message-role {
        font-weight: bold;
        font-size: 11px;
        color: #666;
        margin-bottom: 5px;
        text-transform: uppercase;
      }

      .message-content {
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .message-time {
        font-size: 10px;
        color: #999;
        text-align: right;
        margin-top: 5px;
      }

      .tcode {
        background: ${primaryColor};
        color: ${headerColor};
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
      }

      .sap-module {
        background: #4caf50;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        margin: 0 2px;
      }

      .document-content {
        background: #fafafa;
        border: 1px solid #ddd;
        padding: 15px;
        margin: 10px 0;
        border-radius: 4px;
        font-size: 11px;
      }

      .statistics {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
        margin: 20px 0;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        padding: 5px 0;
        border-bottom: 1px solid #eee;
      }

      .stat-row:last-child {
        border-bottom: none;
      }

      .stat-label {
        font-weight: bold;
        color: #666;
      }

      .stat-value {
        color: ${primaryColor};
        font-weight: bold;
      }

      .metadata-section {
        background: #f8f9fa;
        border-radius: 6px;
        padding: 12px;
        margin: 10px 0;
        font-size: 11px;
      }

      .metadata-row {
        margin: 3px 0;
      }

      .metadata-label {
        font-weight: bold;
        color: #666;
        display: inline-block;
        width: 120px;
      }

      .table-container {
        margin: 15px 0;
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        margin: 10px 0;
      }

      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: ${primaryColor};
        color: ${headerColor};
        font-weight: bold;
      }

      tr:nth-child(even) {
        background: #f9f9f9;
      }

      .page-break {
        page-break-before: always;
      }

      .no-break {
        page-break-inside: avoid;
      }

      .text-center {
        text-align: center;
      }

      .text-right {
        text-align: right;
      }

      .footer-info {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #ddd;
        font-size: 10px;
        color: #666;
        text-align: center;
      }

      /* Code styling */
      code {
        background: #f4f4f4;
        border: 1px solid #ddd;
        border-radius: 3px;
        padding: 2px 4px;
        font-family: 'Courier New', monospace;
        font-size: 10px;
      }

      pre {
        background: #f4f4f4;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 10px;
        overflow-x: auto;
        font-size: 10px;
        page-break-inside: avoid;
      }

      /* Print-specific styles */
      @media print {
        body {
          font-size: 11px;
        }
        
        .page-header {
          margin-bottom: 20px;
        }
        
        .item-card {
          margin-bottom: 15px;
        }
        
        .no-print {
          display: none;
        }
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        body {
          font-size: 11px;
        }
        
        .page-header {
          padding: 15px;
        }
        
        .item-card {
          padding: 12px;
        }
      }
    `;
  }

  /**
   * Generate PDF with custom header and footer
   */
  async generatePDFWithCustomHeaderFooter(templateData, outputPath, options = {}) {
    const headerHTML = options.headerHTML || this.getDefaultHeader(templateData);
    const footerHTML = options.footerHTML || this.getDefaultFooter(templateData);

    return await this.generatePDF(templateData, outputPath, {
      ...options,
      displayHeaderFooter: true,
      headerTemplate: headerHTML,
      footerTemplate: footerHTML,
      margin: {
        top: '40mm',
        bottom: '30mm',
        left: '15mm',
        right: '15mm'
      }
    });
  }

  /**
   * Get default header HTML
   */
  getDefaultHeader(templateData) {
    const title = templateData.metadata?.title || 'PRISM Export';
    const date = new Date().toLocaleDateString();

    return `
      <div style="font-size: 12px; width: 100%; padding: 10px 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: bold; color: #0066cc;">${title}</div>
        <div style="color: #666;">${date}</div>
      </div>
    `;
  }

  /**
   * Get default footer HTML
   */
  getDefaultFooter(templateData) {
    const exportedBy = templateData.metadata?.exportedBy?.fullName || 'PRISM User';

    return `
      <div style="font-size: 10px; width: 100%; padding: 10px 20px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; color: #666;">
        <div>Exported by ${exportedBy} - PRISM Document Management</div>
        <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
      </div>
    `;
  }

  /**
   * Generate PDF from URL
   */
  async generatePDFFromURL(url, outputPath, options = {}) {
    let page = null;

    try {
      const browser = await this.initializeBrowser();
      page = await browser.newPage();

      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const pdfOptions = {
        ...this.defaultOptions,
        ...options,
        path: outputPath
      };

      await page.pdf(pdfOptions);

      logger.info('PDF generated from URL', { url, outputPath });
      return outputPath;

    } catch (error) {
      logger.error('PDF from URL error:', error);
      throw new AppError('Failed to generate PDF from URL', 500);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Generate PDF with page numbers and table of contents
   */
  async generatePDFWithTOC(templateData, outputPath, options = {}) {
    try {
      // Extract headings for TOC
      const toc = this.extractTableOfContents(templateData.content);
      
      // Build content with TOC
      const enhancedContent = this.buildContentWithTOC(templateData.content, toc);
      
      const enhancedTemplateData = {
        ...templateData,
        content: enhancedContent,
        tableOfContents: toc
      };

      return await this.generatePDF(enhancedTemplateData, outputPath, options);

    } catch (error) {
      logger.error('PDF with TOC error:', error);
      throw error;
    }
  }

  /**
   * Extract table of contents from HTML content
   */
  extractTableOfContents(htmlContent) {
    const toc = [];
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    let counter = 1;

    while ((match = headingRegex.exec(htmlContent)) !== null) {
      const level = parseInt(match[1]);
      const text = match[2].replace(/<[^>]*>/g, ''); // Strip HTML tags
      const anchor = `heading-${counter}`;

      toc.push({
        level,
        text,
        anchor,
        page: null // Would be filled by PDF processor
      });

      counter++;
    }

    return toc;
  }

  /**
   * Build content with table of contents
   */
  buildContentWithTOC(originalContent, toc) {
    let content = originalContent;
    
    // Add anchors to headings
    let counter = 1;
    content = content.replace(/<h([1-6])([^>]*)>/gi, (match, level, attributes) => {
      const anchor = `heading-${counter}`;
      counter++;
      return `<h${level}${attributes} id="${anchor}">`;
    });

    // Generate TOC HTML
    const tocHTML = this.generateTOCHTML(toc);
    
    // Insert TOC after the first header or at the beginning
    const insertPosition = content.indexOf('</div>') + 6; // After first header div
    content = content.slice(0, insertPosition) + tocHTML + content.slice(insertPosition);

    return content;
  }

  /**
   * Generate table of contents HTML
   */
  generateTOCHTML(toc) {
    if (toc.length === 0) return '';

    let tocHTML = `
      <div class="table-of-contents page-break">
        <h2 class="section-title">Table of Contents</h2>
        <ul class="toc-list">
    `;

    toc.forEach(item => {
      const indent = (item.level - 1) * 20;
      tocHTML += `
        <li style="margin-left: ${indent}px; margin-bottom: 5px;">
          <a href="#${item.anchor}" style="text-decoration: none; color: #0066cc;">
            ${item.text}
          </a>
        </li>
      `;
    });

    tocHTML += `
        </ul>
      </div>
    `;

    return tocHTML;
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        logger.info('PDF browser closed');
      }
    } catch (error) {
      logger.error('Error closing browser:', error);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get PDF generation statistics
   */
  getStats() {
    return {
      browserInitialized: !!this.browser,
      defaultFormat: this.defaultOptions.format,
      defaultMargins: this.defaultOptions.margin,
      features: {
        headerFooter: true,
        tableOfContents: true,
        customStyling: true,
        urlGeneration: true,
        backgroundGraphics: true
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const browser = await this.initializeBrowser();
      const page = await browser.newPage();
      
      await page.setContent('<html><body><h1>Test</h1></body></html>');
      await page.pdf({ format: 'A4' });
      
      await page.close();
      
      return {
        status: 'healthy',
        browserReady: true,
        puppeteerVersion: puppeteer.version || 'unknown'
      };

    } catch (error) {
      logger.error('PDF service health check failed:', error);
      return {
        status: 'error',
        message: error.message,
        browserReady: false
      };
    }
  }
}

module.exports = new PDFExportService();