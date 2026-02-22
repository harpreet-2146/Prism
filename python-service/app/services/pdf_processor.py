"""
PDF Processing Service
Extract text and metadata from PDFs using PyMuPDF
"""

import fitz  # PyMuPDF
import logging
from typing import Dict, List, Tuple
from pathlib import Path
import re

from app.config import settings
from app.database import get_db, update_document_status, update_document_counts

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Process PDF documents - extract text, metadata, structure"""

    def __init__(self):
        self.max_pages = settings.PDF_MAX_PAGES

    def get_word_counts(self, pdf_path: str) -> Dict[int, int]:
        """
        Fast pass — only count words per page, no chunking or metadata.
        Used by image extraction to avoid re-running full process_document.

        Args:
            pdf_path: Path to PDF file

        Returns:
            Dict mapping page_num (1-indexed) -> word_count
        """
        try:
            doc = fitz.open(pdf_path)
            word_counts = {}
            for page_num in range(len(doc)):
                text = doc[page_num].get_text("text")
                word_counts[page_num + 1] = len(text.split())
            doc.close()
            logger.info(f"Word counts extracted for {len(word_counts)} pages")
            return word_counts
        except Exception as e:
            logger.error(f"get_word_counts failed: {e}")
            return {}

    def extract_text(self, pdf_path: str) -> Tuple[List[Dict], Dict[int, int]]:
        """
        Extract text from all pages and return word counts.

        Args:
            pdf_path: Path to PDF file

        Returns:
            Tuple of (pages_data, word_counts_dict)
            - pages_data: List of page data with text content
            - word_counts_dict: Dict mapping page_num -> word_count
        """
        try:
            doc = fitz.open(pdf_path)

            if len(doc) > self.max_pages:
                raise ValueError(
                    f"PDF has {len(doc)} pages, maximum is {self.max_pages}"
                )

            pages_data = []
            word_counts = {}

            logger.info(f"Extracting text from {len(doc)} pages")

            for page_num in range(len(doc)):
                page = doc[page_num]

                # Extract text
                text = page.get_text("text")

                # Get page dimensions
                rect = page.rect
                width = rect.width
                height = rect.height

                # Count words
                word_count = len(text.split())
                word_counts[page_num + 1] = word_count

                # Detect SAP module (heuristic)
                sap_module = self._detect_sap_module(text)

                pages_data.append({
                    "page_number": page_num + 1,
                    "text": text,
                    "word_count": word_count,
                    "width": width,
                    "height": height,
                    "sap_module": sap_module
                })

                logger.debug(
                    f"Page {page_num + 1}: {word_count} words, module: {sap_module}"
                )

            doc.close()

            total_words = sum(p['word_count'] for p in pages_data)
            logger.info(
                f"Text extraction complete - {len(pages_data)} pages, {total_words} words"
            )

            return pages_data, word_counts

        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            raise

    def get_metadata(self, pdf_path: str) -> Dict:
        """
        Extract PDF metadata.

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
            logger.info(f"Metadata extracted: {info['page_count']} pages")
            return info

        except Exception as e:
            logger.error(f"Metadata extraction failed: {e}")
            raise

    def process_document(self, document_id: str, pdf_path: str) -> Dict:
        """
        Full document processing pipeline.

        Args:
            document_id: Database document ID
            pdf_path: Path to PDF file

        Returns:
            Processing results including word counts per page
        """
        try:
            logger.info(f"Starting full PDF processing - {document_id}")

            # Update status to processing
            with get_db() as db:
                update_document_status(db, document_id, "processing")

            # Extract metadata
            metadata = self.get_metadata(pdf_path)

            # Extract text from all pages
            pages_data, word_counts = self.extract_text(pdf_path)

            # Create text chunks for embedding
            chunks = []
            for page in pages_data:
                if page['word_count'] > 0:
                    page_chunks = self.chunk_text(page['text'])
                    for i, chunk_text in enumerate(page_chunks):
                        chunks.append({
                            "content": chunk_text,
                            "page_number": page['page_number'],
                            "chunk_index": i
                        })

            # Update document counts
            with get_db() as db:
                update_document_counts(
                    db,
                    document_id,
                    metadata['page_count'],
                    0  # Image count updated by image service later
                )

            result = {
                "document_id": document_id,
                "metadata": metadata,
                "text_content": "\n\n".join(p['text'] for p in pages_data),
                "page_count": len(pages_data),
                "word_counts": word_counts,
                "chunks": chunks,
                "total_words": sum(p['word_count'] for p in pages_data),
                "success": True
            }

            logger.info(
                f"PDF processing complete - {document_id} - "
                f"{result['page_count']} pages, "
                f"{result['total_words']} words, "
                f"{len(chunks)} chunks"
            )

            return result

        except Exception as e:
            logger.error(f"PDF processing failed for {document_id}: {e}")

            with get_db() as db:
                update_document_status(db, document_id, "failed", str(e))

            raise

    def _detect_sap_module(self, text: str) -> str:
        """
        Detect SAP module from text content (heuristic).

        Args:
            text: Page text content

        Returns:
            Detected SAP module or 'Unknown'
        """
        text_lower = text.lower()

        modules = {
            "MM": [
                "material management", "procurement", "purchasing",
                "mm transaction"
            ],
            "SD": [
                "sales and distribution", "sales order", "delivery",
                "billing"
            ],
            "FI": [
                "financial accounting", "general ledger",
                "accounts payable", "accounts receivable"
            ],
            "CO": [
                "controlling", "cost center", "profit center",
                "internal order"
            ],
            "PP": [
                "production planning", "manufacturing", "work order",
                "bom"
            ],
            "QM": [
                "quality management", "inspection",
                "quality notification"
            ],
            "PM": [
                "plant maintenance", "equipment", "work order",
                "maintenance"
            ],
            "HR": [
                "human resources", "personnel", "payroll",
                "organizational management"
            ],
            "WM": [
                "warehouse management", "storage location",
                "transfer order"
            ],
            "PS": [
                "project system", "wbs", "project structure"
            ],
        }

        for module, keywords in modules.items():
            if any(keyword in text_lower for keyword in keywords):
                return module

        return "Unknown"

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        overlap: int = 50
    ) -> List[str]:
        """
        Split text into chunks for embedding.

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