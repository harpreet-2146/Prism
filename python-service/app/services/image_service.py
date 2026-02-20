"""
Image Processing Service
Render PDF pages as images when text content is minimal
Extract embedded images from PDFs
"""

import fitz  # PyMuPDF
from PIL import Image
import io
import logging
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import hashlib

from app.config import settings
from app.database import get_db, insert_document_image

logger = logging.getLogger(__name__)


class ImageService:
    """Extract images from PDFs - both page renders and embedded images"""
    
    def __init__(self):
        self.dpi = settings.PDF_DPI
        self.quality = settings.PDF_IMAGE_QUALITY
        self.output_dir = Path(settings.OUTPUT_DIR)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # If page has fewer than this many words, render it as image
        self.text_threshold = 50
    
    def extract_all_images(
        self, 
        pdf_path: str, 
        document_id: str,
        pages_with_text_count: Dict[int, int]
    ) -> List[Dict]:
        """
        Extract ALL images from PDF:
        1. Render pages with minimal text as images (for OCR)
        2. Extract embedded images
        
        Args:
            pdf_path: Path to PDF file
            document_id: Database document ID
            pages_with_text_count: Dict mapping page_num -> word_count
            
        Returns:
            List of all extracted images
        """
        try:
            doc = fitz.open(pdf_path)
            all_images = []
            image_hashes = set()
            
            logger.info(f"📷 Extracting images from {pdf_path}")
            logger.info(f"   Pages with minimal text will be rendered as images")
            
            # STEP 1: Render pages with minimal text as images
            for page_num in range(len(doc)):
                word_count = pages_with_text_count.get(page_num + 1, 0)
                
                # If page has very little text, render it as an image for OCR
                if word_count < self.text_threshold:
                    logger.info(
                        f"📄 Page {page_num + 1}: Only {word_count} words - "
                        f"rendering as image for OCR"
                    )
                    
                    try:
                        page_image = self._render_page_as_image(
                            doc, 
                            page_num, 
                            document_id
                        )
                        
                        if page_image:
                            all_images.append(page_image)
                            
                    except Exception as e:
                        logger.error(
                            f"Failed to render page {page_num + 1}: {e}"
                        )
                        continue
            
            # STEP 2: Extract embedded images (diagrams, charts, etc.)
            embedded = self._extract_embedded_images(
                doc, 
                document_id, 
                image_hashes
            )
            all_images.extend(embedded)
            
            doc.close()
            
            logger.info(
                f"✅ Extracted {len(all_images)} total images "
                f"({len(all_images) - len(embedded)} page renders, "
                f"{len(embedded)} embedded)"
            )
            
            return all_images
            
        except Exception as e:
            logger.error(f"❌ Image extraction failed: {e}")
            raise
    
    def _render_page_as_image(
        self, 
        doc: fitz.Document, 
        page_num: int,
        document_id: str
    ) -> Optional[Dict]:
        """
        Render a PDF page as an image
        
        Args:
            doc: PyMuPDF document
            page_num: Page number (0-indexed)
            document_id: Database document ID
            
        Returns:
            Image info dict or None
        """
        try:
            page = doc[page_num]
            
            # Render page at specified DPI
            mat = fitz.Matrix(self.dpi / 72, self.dpi / 72)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            
            # Convert to PIL Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Save image
            image_filename = f"{document_id}_p{page_num + 1}_full.jpg"
            image_path = self.output_dir / image_filename
            
            img.save(
                image_path,
                format='JPEG',
                quality=self.quality,
                optimize=True
            )
            
            file_size = image_path.stat().st_size
            
            # Save to database with ABSOLUTE path
            with get_db() as db:
                image_id = insert_document_image(
                    db,
                    document_id,
                    page_num + 1,
                    0,  # image_index 0 for full page renders
                    str(image_path.resolve()),  # ABSOLUTE PATH
                    pix.width,
                    pix.height,
                    file_size
                )
            
            logger.debug(
                f"✅ Rendered page {page_num + 1}: "
                f"{pix.width}x{pix.height}, {file_size // 1024}KB, "
                f"saved to {image_path.resolve()}"
            )
            
            return {
                "id": image_id,
                "page_number": page_num + 1,
                "image_index": 0,
                "storage_path": str(image_path.resolve()),  # ABSOLUTE PATH
                "width": pix.width,
                "height": pix.height,
                "file_size": file_size,
                "type": "page_render"
            }
            
        except Exception as e:
            logger.error(f"Failed to render page {page_num + 1}: {e}")
            return None
    
    def _extract_embedded_images(
        self,
        doc: fitz.Document,
        document_id: str,
        image_hashes: set
    ) -> List[Dict]:
        """
        Extract embedded images (diagrams, charts, etc.)
        
        Args:
            doc: PyMuPDF document
            document_id: Database document ID
            image_hashes: Set to track duplicates
            
        Returns:
            List of embedded image info
        """
        embedded_images = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)
            
            if not image_list:
                continue
            
            for img_index, img_info in enumerate(image_list):
                try:
                    # Get image XREF
                    xref = img_info[0]
                    
                    # Extract image data
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    
                    # Check for duplicates
                    image_hash = hashlib.md5(image_bytes).hexdigest()
                    
                    if image_hash in image_hashes:
                        continue
                    
                    image_hashes.add(image_hash)
                    
                    # Open image
                    image = Image.open(io.BytesIO(image_bytes))
                    width, height = image.size
                    
                    # Skip small images (logos/icons)
                    if width < 100 or height < 100:
                        continue
                    
                    # Save image
                    image_filename = (
                        f"{document_id}_p{page_num + 1}_img{img_index + 1}.jpg"
                    )
                    image_path = self.output_dir / image_filename
                    
                    # Convert to RGB
                    if image.mode not in ('RGB', 'L'):
                        image = image.convert('RGB')
                    
                    image.save(
                        image_path,
                        format='JPEG',
                        quality=self.quality,
                        optimize=True
                    )
                    
                    file_size = image_path.stat().st_size
                    
                    # Save to database with ABSOLUTE path
                    with get_db() as db:
                        image_id = insert_document_image(
                            db,
                            document_id,
                            page_num + 1,
                            img_index + 1,
                            str(image_path.resolve()),  # ABSOLUTE PATH
                            width,
                            height,
                            file_size
                        )
                    
                    embedded_images.append({
                        "id": image_id,
                        "page_number": page_num + 1,
                        "image_index": img_index + 1,
                        "storage_path": str(image_path.resolve()),  # ABSOLUTE PATH
                        "width": width,
                        "height": height,
                        "file_size": file_size,
                        "type": "embedded"
                    })
                    
                    logger.debug(
                        f"✅ Embedded image: Page {page_num + 1}, "
                        f"{width}x{height}, {file_size // 1024}KB, "
                        f"saved to {image_path.resolve()}"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"Failed to extract embedded image "
                        f"{img_index} from page {page_num + 1}: {e}"
                    )
                    continue
        
        return embedded_images


# Global instance
image_service = ImageService()