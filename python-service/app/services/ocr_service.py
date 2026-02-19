# python-service/app/services/ocr_service.py

"""
OCR Service - Batch processing with EasyOCR (Pure Python, No System Dependencies)
Processes up to 20 images in parallel
"""

import easyocr
from PIL import Image
import logging
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from pathlib import Path
import numpy as np

from app.config import settings
from app.database import get_db, update_image_ocr, get_pending_ocr_images

logger = logging.getLogger(__name__)


class OCRService:
    """High-performance OCR service with batch processing using EasyOCR"""
    
    def __init__(self):
        self.batch_size = settings.OCR_BATCH_SIZE
        self.timeout = settings.OCR_TIMEOUT
        self.workers = settings.OCR_WORKERS
        self.languages = settings.OCR_LANGUAGES.split(',')
        self.gpu = settings.OCR_GPU
        
        # Initialize reader (lazy loading)
        self._reader = None
        
        logger.info(
            f"OCR Service initialized - Languages: {self.languages}, "
            f"Batch size: {self.batch_size}, Workers: {self.workers}, GPU: {self.gpu}"
        )
    
    @property
    def reader(self):
        """Lazy load the EasyOCR reader"""
        if self._reader is None:
            logger.info(f"Loading EasyOCR reader for languages: {self.languages}")
            start = time.time()
            
            self._reader = easyocr.Reader(
                self.languages,
                gpu=self.gpu,
                model_storage_directory=settings.MODEL_CACHE_DIR,
                download_enabled=True
            )
            
            duration = time.time() - start
            logger.info(f"✅ EasyOCR reader loaded in {duration:.2f}s")
        
        return self._reader
    
    def process_image(self, image_path: str, image_id: str) -> Dict:
        """
        Process a single image with OCR
        
        Args:
            image_path: Path to image file
            image_id: Database image ID
            
        Returns:
            Dict with OCR results
        """
        start_time = time.time()
        
        try:
            # Verify image exists
            if not Path(image_path).exists():
                raise FileNotFoundError(f"Image not found: {image_path}")
            
            # Open image
            image = Image.open(image_path)
            
            # Convert to numpy array (EasyOCR requirement)
            image_array = np.array(image)
            
            # Perform OCR
            results = self.reader.readtext(image_array)
            
            # Extract text and calculate confidence
            texts = []
            confidences = []
            
            for (bbox, text, confidence) in results:
                texts.append(text)
                confidences.append(confidence)
            
            # Combine all text
            full_text = ' '.join(texts)
            
            # Calculate average confidence
            avg_confidence = (sum(confidences) / len(confidences) * 100) if confidences else 0
            
            # Clean text
            cleaned_text = self._clean_text(full_text)
            
            duration = time.time() - start_time
            
            result = {
                "image_id": image_id,
                "image_path": image_path,
                "text": cleaned_text,
                "confidence": round(avg_confidence, 2),
                "status": "completed",
                "word_count": len(cleaned_text.split()),
                "duration": round(duration, 3),
                "error": None
            }
            
            logger.debug(
                f"✅ OCR completed for {image_id} - {duration:.2f}s, "
                f"confidence: {avg_confidence:.1f}%"
            )
            
            return result
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ OCR failed for {image_id}: {e}")
            
            return {
                "image_id": image_id,
                "image_path": image_path,
                "text": "",
                "confidence": 0,
                "status": "failed",
                "word_count": 0,
                "duration": round(duration, 3),
                "error": str(e)
            }
    
    def process_batch(self, images: List[Dict]) -> List[Dict]:
        """
        Process multiple images in parallel
        
        Args:
            images: List of dicts with 'id' and 'path' keys
            
        Returns:
            List of OCR results
        """
        if not images:
            return []
        
        batch_start = time.time()
        results = []
        
        logger.info(
            f"🔄 Starting OCR batch processing - {len(images)} images, "
            f"{self.workers} workers"
        )
        
        # Process in parallel using ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            # Submit all tasks
            future_to_image = {
                executor.submit(
                    self.process_image,
                    img['path'],
                    img['id']
                ): img for img in images
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_image):
                try:
                    result = future.result(timeout=self.timeout)
                    results.append(result)
                except Exception as e:
                    img = future_to_image[future]
                    logger.error(f"❌ OCR task failed for {img['id']}: {e}")
                    results.append({
                        "image_id": img['id'],
                        "image_path": img['path'],
                        "text": "",
                        "confidence": 0,
                        "status": "failed",
                        "word_count": 0,
                        "duration": 0,
                        "error": str(e)
                    })
        
        batch_duration = time.time() - batch_start
        
        # Calculate statistics
        successful = sum(1 for r in results if r['status'] == 'completed')
        failed = len(results) - successful
        total_words = sum(r['word_count'] for r in results)
        avg_confidence = (
            sum(r['confidence'] for r in results if r['status'] == 'completed') / successful 
            if successful > 0 else 0
        )
        
        logger.info(
            f"✅ OCR batch complete - {successful}/{len(images)} successful, "
            f"{total_words} words extracted, "
            f"avg confidence: {avg_confidence:.1f}%, "
            f"duration: {batch_duration:.2f}s"
        )
        
        return results
    
    def process_document_images(self, document_id: str) -> Dict:
        """
        Process all pending OCR images for a document
        
        Args:
            document_id: Document ID
            
        Returns:
            Summary of OCR results
        """
        doc_start = time.time()
        
        try:
            # Get pending images from database
            with get_db() as db:
                pending_images = get_pending_ocr_images(db, document_id)
            
            if not pending_images:
                logger.info(f"No pending OCR images for document {document_id}")
                return {
                    "document_id": document_id,
                    "images_processed": 0,
                    "success": True
                }
            
            logger.info(
                f"📄 Processing {len(pending_images)} images for document {document_id}"
            )
            
            # Prepare image list
            images = [
                {
                    "id": str(img[0]),
                    "path": img[1],
                    "page_number": img[2]
                }
                for img in pending_images
            ]
            
            # Process in batches
            all_results = []
            for i in range(0, len(images), self.batch_size):
                batch = images[i:i + self.batch_size]
                batch_results = self.process_batch(batch)
                all_results.extend(batch_results)
                
                # Save results to database after each batch
                with get_db() as db:
                    for result in batch_results:
                        update_image_ocr(
                            db,
                            result['image_id'],
                            result['text'],
                            result['confidence'],
                            result['status']
                        )
            
            # Calculate final statistics
            successful = sum(1 for r in all_results if r['status'] == 'completed')
            failed = len(all_results) - successful
            total_words = sum(r['word_count'] for r in all_results)
            avg_confidence = (
                sum(r['confidence'] for r in all_results if r['status'] == 'completed') / successful 
                if successful > 0 else 0
            )
            
            doc_duration = time.time() - doc_start
            
            logger.info(
                f"✅ Document OCR complete - {document_id} - "
                f"{successful}/{len(all_results)} successful, "
                f"{total_words} words, "
                f"duration: {doc_duration:.2f}s"
            )
            
            return {
                "document_id": document_id,
                "images_processed": len(all_results),
                "images_successful": successful,
                "images_failed": failed,
                "total_words": total_words,
                "average_confidence": round(avg_confidence, 2),
                "duration": round(doc_duration, 2),
                "success": True
            }
            
        except Exception as e:
            logger.error(f"❌ Document OCR failed for {document_id}: {e}")
            return {
                "document_id": document_id,
                "images_processed": 0,
                "success": False,
                "error": str(e)
            }
    
    def _clean_text(self, text: str) -> str:
        """Clean OCR text output"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = " ".join(text.split())
        
        return text.strip()
    
    def health_check(self) -> Dict:
        """Check if EasyOCR is available"""
        try:
            # Try to load reader
            _ = self.reader
            
            return {
                "available": True,
                "engine": "EasyOCR",
                "languages": self.languages,
                "batch_size": self.batch_size,
                "workers": self.workers,
                "gpu": self.gpu
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }


# Global instance
ocr_service = OCRService()