const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/error.middleware');

class PDFProcessorService {
  /**
   * Extract text from PDF file
   */
  async extractText(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read PDF buffer
      const dataBuffer = await fs.readFile(filePath);
      
      // Parse PDF
      const pdfData = await pdfParse(dataBuffer, {
        // PDF parsing options
        max: 0, // No limit on pages
        version: 'v1.10.100',
        normalize: true,
        disableCombineTextItems: false
      });

      logger.info('PDF text extracted successfully', {
        filePath,
        pages: pdfData.numpages,
        textLength: pdfData.text.length
      });

      return {
        text: pdfData.text,
        pages: pdfData.numpages,
        info: pdfData.info,
        metadata: pdfData.metadata
      };

    } catch (error) {
      logger.error('PDF text extraction error:', error);
      
      if (error.code === 'ENOENT') {
        throw new AppError('PDF file not found', 404);
      }
      
      throw new AppError('Failed to extract text from PDF', 500);
    }
  }

  /**
   * Extract metadata from PDF
   */
  async extractMetadata(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);

      const metadata = {
        title: pdfData.info?.Title || null,
        author: pdfData.info?.Author || null,
        subject: pdfData.info?.Subject || null,
        creator: pdfData.info?.Creator || null,
        producer: pdfData.info?.Producer || null,
        creationDate: pdfData.info?.CreationDate || null,
        modificationDate: pdfData.info?.ModDate || null,
        pages: pdfData.numpages,
        version: pdfData.version || null,
        encrypted: false, // pdf-parse can't read encrypted PDFs anyway
        textLength: pdfData.text.length,
        wordCount: pdfData.text.split(/\s+/).filter(word => word.length > 0).length
      };

      return metadata;

    } catch (error) {
      logger.error('PDF metadata extraction error:', error);
      throw new AppError('Failed to extract PDF metadata', 500);
    }
  }

  /**
   * Validate PDF file
   */
  async validatePDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      
      // Check PDF magic number
      if (!dataBuffer.slice(0, 4).toString() === '%PDF') {
        throw new Error('Invalid PDF format');
      }

      // Try to parse basic structure
      const pdfData = await pdfParse(dataBuffer);
      
      if (!pdfData || pdfData.numpages === 0) {
        throw new Error('PDF appears to be empty or corrupt');
      }

      return {
        valid: true,
        pages: pdfData.numpages,
        hasText: pdfData.text && pdfData.text.length > 0,
        textLength: pdfData.text ? pdfData.text.length : 0,
        encrypted: false
      };

    } catch (error) {
      logger.error('PDF validation error:', error);
      
      return {
        valid: false,
        error: error.message,
        pages: 0,
        hasText: false,
        textLength: 0,
        encrypted: false
      };
    }
  }

  /**
   * Extract text from specific pages
   */
  async extractTextFromPages(filePath, pageNumbers) {
    try {
      // Note: pdf-parse doesn't support page-specific extraction
      // This is a simplified implementation
      const { text, pages } = await this.extractText(filePath);
      
      if (pageNumbers.some(page => page > pages || page < 1)) {
        throw new AppError('Invalid page number specified', 400);
      }

      // Simple text splitting by pages (not accurate but functional)
      const avgTextPerPage = Math.ceil(text.length / pages);
      const extractedPages = {};
      
      pageNumbers.forEach(pageNum => {
        const start = (pageNum - 1) * avgTextPerPage;
        const end = pageNum * avgTextPerPage;
        extractedPages[pageNum] = text.slice(start, end);
      });

      return extractedPages;

    } catch (error) {
      logger.error('PDF page extraction error:', error);
      throw error;
    }
  }

  /**
   * Check if PDF is searchable (has text layer)
   */
  async isSearchable(filePath) {
    try {
      const { text, pages } = await this.extractText(filePath);
      
      if (!text || text.trim().length === 0) {
        return {
          searchable: false,
          reason: 'No text content found',
          pages,
          textLength: 0
        };
      }

      // Check text density
      const textDensity = text.length / pages;
      const minDensity = 50; // Minimum characters per page for searchable PDF

      return {
        searchable: textDensity >= minDensity,
        reason: textDensity < minDensity ? 'Low text density - likely scanned document' : 'Good text density',
        pages,
        textLength: text.length,
        textDensity
      };

    } catch (error) {
      logger.error('PDF searchability check error:', error);
      return {
        searchable: false,
        reason: 'Error checking PDF',
        pages: 0,
        textLength: 0,
        error: error.message
      };
    }
  }

  /**
   * Extract tables from PDF text (simple implementation)
   */
  extractTables(text) {
    const tables = [];
    const lines = text.split('\n');
    let currentTable = [];
    let inTable = false;

    for (const line of lines) {
      // Simple heuristic: lines with multiple tabs or spaces might be table rows
      const hasMultipleColumns = line.split(/\s{2,}|\t/).length > 2;
      
      if (hasMultipleColumns) {
        if (!inTable) {
          inTable = true;
          currentTable = [];
        }
        currentTable.push(line.split(/\s{2,}|\t/).map(cell => cell.trim()).filter(cell => cell));
      } else {
        if (inTable && currentTable.length > 1) {
          tables.push(currentTable);
          currentTable = [];
        }
        inTable = false;
      }
    }

    // Add final table if exists
    if (inTable && currentTable.length > 1) {
      tables.push(currentTable);
    }

    return tables.filter(table => table.length > 1); // Only return tables with multiple rows
  }

  /**
   * Extract SAP-specific elements from PDF text
   */
  extractSAPElements(text) {
    const sapElements = {
      tcodes: [],
      tables: [],
      programs: [],
      users: [],
      dates: [],
      errorCodes: []
    };

    // T-Code patterns
    const tcodePatterns = [
      /\b[A-Z]{2,4}\d{0,3}[A-Z]?\b/g,  // Standard T-Codes like FB01, MM01
      /\/[A-Z0-9_]+\/[A-Z0-9_]+/g,     // Custom T-Codes like /CUSTOM/TCODE
      /[YZ][A-Z0-9_]+/g                 // Customer T-Codes starting with Y or Z
    ];

    tcodePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      sapElements.tcodes.push(...matches);
    });

    // SAP table names (usually 3-5 uppercase letters/numbers)
    const tablePattern = /\b[A-Z]{3,5}[0-9A-Z]{0,3}\b/g;
    const potentialTables = text.match(tablePattern) || [];
    sapElements.tables = potentialTables.filter(table => 
      !sapElements.tcodes.includes(table) && // Not a T-Code
      table.length >= 3 && table.length <= 8
    );

    // SAP program names
    const programPattern = /\b(?:RPORT|SAPF|SAPLF|Y|Z)[A-Z0-9_]+\b/g;
    sapElements.programs = text.match(programPattern) || [];

    // SAP user names (pattern: usually uppercase, 3-12 chars)
    const userPattern = /\bUser(?:\s+ID)?[\s:]+([A-Z0-9_]{3,12})\b/gi;
    const userMatches = [...text.matchAll(userPattern)];
    sapElements.users = userMatches.map(match => match[1]);

    // SAP dates (various formats)
    const datePatterns = [
      /\d{2}\.\d{2}\.\d{4}/g,  // DD.MM.YYYY
      /\d{4}-\d{2}-\d{2}/g,    // YYYY-MM-DD
      /\d{2}\/\d{2}\/\d{4}/g   // DD/MM/YYYY or MM/DD/YYYY
    ];

    datePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      sapElements.dates.push(...matches);
    });

    // SAP error codes (E XXXXX pattern)
    const errorPattern = /\bE\s+[A-Z0-9]{3,6}\b/g;
    sapElements.errorCodes = text.match(errorPattern) || [];

    // Remove duplicates and clean up
    Object.keys(sapElements).forEach(key => {
      sapElements[key] = [...new Set(sapElements[key])].filter(item => item && item.trim());
    });

    return sapElements;
  }

  /**
   * Analyze PDF structure
   */
  async analyzePDFStructure(filePath) {
    try {
      const { text, pages, info } = await this.extractText(filePath);
      const sapElements = this.extractSAPElements(text);
      const tables = this.extractTables(text);
      const searchability = await this.isSearchable(filePath);

      const analysis = {
        basic: {
          pages,
          textLength: text.length,
          wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
          lineCount: text.split('\n').length,
          paragraphs: text.split(/\n\s*\n/).length
        },
        content: {
          hasImages: !searchability.searchable && pages > 0, // Heuristic
          hasTables: tables.length > 0,
          tableCount: tables.length,
          isEmpty: text.trim().length === 0,
          language: this.detectLanguage(text)
        },
        sap: {
          isSAPDocument: sapElements.tcodes.length > 0 || sapElements.tables.length > 5,
          tcodeCount: sapElements.tcodes.length,
          tableCount: sapElements.tables.length,
          programCount: sapElements.programs.length,
          elements: sapElements
        },
        quality: {
          searchable: searchability.searchable,
          textDensity: searchability.textDensity || 0,
          readability: this.calculateReadability(text)
        },
        metadata: {
          title: info?.Title,
          author: info?.Author,
          creator: info?.Creator,
          creationDate: info?.CreationDate,
          modificationDate: info?.ModDate
        }
      };

      return analysis;

    } catch (error) {
      logger.error('PDF structure analysis error:', error);
      throw new AppError('Failed to analyze PDF structure', 500);
    }
  }

  /**
   * Simple language detection
   */
  detectLanguage(text) {
    if (!text || text.length < 50) return 'unknown';

    const sample = text.substring(0, 1000).toLowerCase();
    
    // Simple language detection based on common words
    const germanWords = ['der', 'die', 'das', 'und', 'ist', 'mit', 'zu', 'auf', 'für', 'von'];
    const englishWords = ['the', 'and', 'is', 'with', 'to', 'on', 'for', 'of', 'in', 'a'];
    
    const germanCount = germanWords.reduce((count, word) => 
      count + (sample.split(new RegExp(`\\b${word}\\b`, 'g')).length - 1), 0
    );
    
    const englishCount = englishWords.reduce((count, word) => 
      count + (sample.split(new RegExp(`\\b${word}\\b`, 'g')).length - 1), 0
    );

    if (germanCount > englishCount && germanCount > 2) return 'german';
    if (englishCount > germanCount && englishCount > 2) return 'english';
    
    return 'unknown';
  }

  /**
   * Calculate basic readability score
   */
  calculateReadability(text) {
    if (!text || text.length < 100) return 0;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 0;

    // Flesch Reading Ease approximation
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Count syllables in a word (approximate)
   */
  countSyllables(word) {
    if (!word || word.length <= 3) return 1;
    
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    const vowels = 'aeiouy';
    let count = 0;
    let previousWasVowel = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    // Adjust for silent e
    if (word.endsWith('e') && count > 1) {
      count--;
    }

    return Math.max(1, count);
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats() {
    return {
      supportedFormats: ['pdf'],
      maxFileSize: '50MB',
      features: {
        textExtraction: true,
        metadataExtraction: true,
        tableExtraction: true,
        imageExtraction: false, // Would require additional libraries
        ocrSupport: false,      // Would require OCR integration
        encryptedPDFs: false    // pdf-parse doesn't handle encrypted PDFs
      },
      limitations: [
        'Encrypted PDFs are not supported',
        'Image-only PDFs require OCR',
        'Complex table extraction is basic',
        'Page-specific extraction is approximate'
      ]
    };
  }
}

module.exports = new PDFProcessorService();