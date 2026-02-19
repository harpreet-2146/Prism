"""
PDF Processing Service
Extract text and metadata from PDFs using PyMuPDF
"""

import fitz  # PyMuPDF
import logging
from typing import Dict, List
from pathlib import Path
import re

from app.config import settings
from app.database import get_db, update_document_status, update_document_counts

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Process PDF documents - extract text, metadata, structure"""
    
    def __init__(self):
        self.max_pages = settings.PDF_MAX_PAGES
    
    def extract_text(self, pdf_path: str) -> List[Dict]:
        """
        Extract text from all pages
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            List of page data with text content
        """
        try:
            doc = fitz.open(pdf_path)
            
            if len(doc) > self.max_pages:
                raise ValueError(f"PDF has {len(doc)} pages, maximum is {self.max_pages}")
            
            pages_data = []
            
            logger.info(f"📄 Extracting text from {len(doc)} pages")
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Extract text
                text = page.get_text("text")
                
                # Get page dimensions
                rect = page.rect
                width = rect.width
                height = rect.height
                
                # Detect SAP module (heuristic)
                sap_module = self._detect_sap_module(text)
                
                # Count words
                word_count = len(text.split())
                
                pages_data.append({
                    "page_number": page_num + 1,
                    "text": text,
                    "word_count": word_count,
                    "width": width,
                    "height": height,
                    "sap_module": sap_module
                })
                
                logger.debug(f"Page {page_num + 1}: {word_count} words, module: {sap_module}")
            
            doc.close()
            
            total_words = sum(p['word_count'] for p in pages_data)
            logger.info(f"✅ Text extraction complete - {len(pages_data)} pages, {total_words} words")
            
            return pages_data
            
        except Exception as e:
            logger.error(f"❌ Text extraction failed: {e}")
            raise
    
    def get_metadata(self, pdf_path: str) -> Dict:
        """
        Extract PDF metadata
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            Metadata dictionary
        """
        try:
            doc = fitz.open(pdf_path)
            metadata = doc.metadata
            
            info = {
                "title": metadata.get("title", ""),
                "author": metadata.get("author", ""),
                "subject": metadata.get("subject", ""),
                "creator": metadata.get("creator", ""),
                "producer": metadata.get("producer", ""),
                "creation_date": metadata.get("creationDate", ""),
                "modification_date": metadata.get("modDate", ""),
                "page_count": len(doc),
                "file_size": Path(pdf_path).stat().st_size
            }
            
            doc.close()
            
            logger.info(f"📋 Metadata extracted: {info['page_count']} pages")
            
            return info
            
        except Exception as e:
            logger.error(f"❌ Metadata extraction failed: {e}")
            raise
    
    def process_document(self, document_id: str, pdf_path: str) -> Dict:
        """
        Full document processing pipeline
        
        Args:
            document_id: Database document ID
            pdf_path: Path to PDF file
            
        Returns:
            Processing results
        """
        try:
            logger.info(f"🚀 Starting full PDF processing - {document_id}")
            
            # Update status to processing
            with get_db() as db:
                update_document_status(db, document_id, "processing")
            
            # Extract metadata
            metadata = self.get_metadata(pdf_path)
            
            # Extract text from all pages
            pages_data = self.extract_text(pdf_path)
            
            # Update document counts
            with get_db() as db:
                update_document_counts(
                    db,
                    document_id,
                    metadata['page_count'],
                    0  # Image count will be updated by image service
                )
            
            result = {
                "document_id": document_id,
                "metadata": metadata,
                "pages": pages_data,
                "total_pages": len(pages_data),
                "total_words": sum(p['word_count'] for p in pages_data),
                "success": True
            }
            
            logger.info(
                f"✅ PDF processing complete - {document_id} - "
                f"{result['total_pages']} pages, {result['total_words']} words"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ PDF processing failed for {document_id}: {e}")
            
            # Update status to failed
            with get_db() as db:
                update_document_status(db, document_id, "failed", str(e))
            
            raise
    
    def _detect_sap_module(self, text: str) -> str:
        """
        Detect SAP module from text content (heuristic)
        
        Args:
            text: Page text content
            
        Returns:
            Detected SAP module or 'Unknown'
        """
        text_lower = text.lower()
        
        # SAP module keywords
        modules = {
            "MM": ["material management", "procurement", "purchasing", "mm transaction"],
            "SD": ["sales and distribution", "sales order", "delivery", "billing"],
            "FI": ["financial accounting", "general ledger", "accounts payable", "accounts receivable"],
            "CO": ["controlling", "cost center", "profit center", "internal order"],
            "PP": ["production planning", "manufacturing", "work order", "bom"],
            "QM": ["quality management", "inspection", "quality notification"],
            "PM": ["plant maintenance", "equipment", "work order", "maintenance"],
            "HR": ["human resources", "personnel", "payroll", "organizational management"],
            "WM": ["warehouse management", "storage location", "transfer order"],
            "PS": ["project system", "wbs", "project structure"],
        }
        
        for module, keywords in modules.items():
            if any(keyword in text_lower for keyword in keywords):
                return module
        
        return "Unknown"
    
    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """
        Split text into chunks for embedding
        
        Args:
            text: Text to chunk
            chunk_size: Target chunk size in words
            overlap: Overlap between chunks
            
        Returns:
            List of text chunks
        """
        words = text.split()
        
        if len(words) <= chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(words):
            end = start + chunk_size
            chunk_words = words[start:end]
            chunks.append(" ".join(chunk_words))
            start = end - overlap
        
        return chunks


# Global instance
pdf_processor = PDFProcessor()