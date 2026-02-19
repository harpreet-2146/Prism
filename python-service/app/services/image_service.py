"""
Image Processing Utilities
Extract embedded images from PDFs (not full page renders)
"""

import fitz  # PyMuPDF
from PIL import Image
import io
import logging
from typing import List, Dict, Optional
from pathlib import Path
import hashlib

from app.config import settings
from app.database import get_db, insert_document_image

logger = logging.getLogger(__name__)


class ImageService:
    """Extract embedded images from PDFs"""
    
    def __init__(self):
        self.dpi = settings.PDF_DPI
        self.quality = settings.PDF_IMAGE_QUALITY
        self.output_dir = Path(settings.OUTPUT_DIR)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def extract_embedded_images(self, pdf_path: str, document_id: str) -> List[Dict]:
        """
        Extract ONLY embedded images from PDF (not page screenshots)
        
        Args:
            pdf_path: Path to PDF file
            document_id: Database document ID
            
        Returns:
            List of extracted image info
        """
        try:
            doc = fitz.open(pdf_path)
            extracted_images = []
            image_hashes = set()  # Avoid duplicates
            
            logger.info(f"📷 Extracting embedded images from {pdf_path}")
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                
                # Get list of images on this page
                image_list = page.get_images(full=True)
                
                if not image_list:
                    continue
                
                logger.debug(f"Page {page_num + 1}: {len(image_list)} embedded images found")
                
                for img_index, img_info in enumerate(image_list):
                    try:
                        # Get image XREF
                        xref = img_info[0]
                        
                        # Extract image data
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]
                        
                        # Calculate hash to avoid duplicates
                        image_hash = hashlib.md5(image_bytes).hexdigest()
                        
                        if image_hash in image_hashes:
                            logger.debug(f"Skipping duplicate image: {image_hash[:8]}")
                            continue
                        
                        image_hashes.add(image_hash)
                        
                        # Open image to get dimensions
                        image = Image.open(io.BytesIO(image_bytes))
                        width, height = image.size
                        
                        # Skip very small images (likely logos/icons)
                        if width < 100 or height < 100:
                            logger.debug(f"Skipping small image: {width}x{height}")
                            continue
                        
                        # Save image
                        image_filename = f"{document_id}_p{page_num + 1}_img{img_index}.jpg"
                        image_path = self.output_dir / image_filename
                        
                        # Convert to RGB if necessary
                        if image.mode not in ('RGB', 'L'):
                            image = image.convert('RGB')
                        
                        # Save with compression
                        image.save(
                            image_path,
                            format='JPEG',
                            quality=self.quality,
                            optimize=True
                        )
                        
                        file_size = image_path.stat().st_size
                        
                        # Save to database
                        with get_db() as db:
                            image_id = insert_document_image(
                                db,
                                document_id,
                                page_num + 1,
                                img_index,
                                str(image_path),
                                width,
                                height,
                                file_size
                            )
                        
                        extracted_images.append({
                            "id": image_id,
                            "page_number": page_num + 1,
                            "image_index": img_index,
                            "path": str(image_path),
                            "width": width,
                            "height": height,
                            "size": file_size
                        })
                        
                        logger.debug(
                            f"✅ Extracted: Page {page_num + 1}, "
                            f"Image {img_index}, {width}x{height}, "
                            f"{file_size // 1024}KB"
                        )
                        
                    except Exception as e:
                        logger.error(f"Failed to extract image {img_index} from page {page_num + 1}: {e}")
                        continue
            
            doc.close()
            
            logger.info(f"✅ Extracted {len(extracted_images)} unique embedded images")
            
            return extracted_images
            
        except Exception as e:
            logger.error(f"❌ Image extraction failed: {e}")
            raise
    
    def extract_page_as_image(self, pdf_path: str, page_number: int,
                              output_path: Optional[str] = None) -> str:
        """
        Render a specific PDF page as an image
        (Used only when specifically requested)
        
        Args:
            pdf_path: Path to PDF file
            page_number: Page number (1-indexed)
            output_path: Optional output path
            
        Returns:
            Path to saved image
        """
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_number - 1]
            
            # Render page at specified DPI
            mat = fitz.Matrix(self.dpi / 72, self.dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Save
            if not output_path:
                output_path = self.output_dir / f"page_{page_number}.jpg"
            
            img.save(output_path, format='JPEG', quality=self.quality)
            
            doc.close()
            
            logger.info(f"✅ Page {page_number} rendered to {output_path}")
            
            return str(output_path)
            
        except Exception as e:
            logger.error(f"❌ Page rendering failed: {e}")
            raise


# Global instance
image_service = ImageService()