# python-service/app/services/ocr_service.py
"""
OCR Service - Tesseract (primary, fast, free, deployable) + EasyOCR (fallback)
"""

import pytesseract
from PIL import Image
import logging
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from pathlib import Path

from app.config import settings
from app.database import get_db, update_image_ocr, get_pending_ocr_images

logger = logging.getLogger(__name__)

# Set tesseract path from config
# Windows local: C:\Program Files\Tesseract-OCR\tesseract.exe
# Linux deploy: just "tesseract" (auto-detected)
pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD


class OCRService:
    def __init__(self):
        self.languages = settings.OCR_LANGUAGES.split(',')
        self.batch_size = settings.OCR_BATCH_SIZE
        self.workers = settings.OCR_WORKERS
        self._easyocr_reader = None

        try:
            version = pytesseract.get_tesseract_version()
            logger.info(f"✅ Tesseract OCR ready (v{version})")
        except Exception as e:
            logger.warning(f"⚠️ Tesseract not found: {e} — will use EasyOCR fallback")

    @property
    def easyocr_reader(self):
        if self._easyocr_reader is None:
            import easyocr
            logger.info("Loading EasyOCR fallback...")
            self._easyocr_reader = easyocr.Reader(
                self.languages, gpu=False,
                model_storage_directory=settings.MODEL_CACHE_DIR,
                download_enabled=True
            )
        return self._easyocr_reader

    # ── PUBLIC API ────────────────────────────────────────────────────────────

    def process_image(self, image_path: str, image_id: str) -> Dict:
        return self._tesseract_single(image_path, image_id)

    def process_batch(self, images: List[Dict]) -> List[Dict]:
        if not images:
            return []

        start = time.time()
        logger.info(f"🚀 Tesseract OCR batch: {len(images)} images, workers={self.workers}")

        results = []
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            future_to_img = {
                executor.submit(self._tesseract_single, img['path'], img['id']): img
                for img in images
            }
            for future in as_completed(future_to_img):
                try:
                    results.append(future.result(timeout=30))
                except Exception as e:
                    img = future_to_img[future]
                    logger.error(f"OCR failed for {img['id']}: {e}")
                    results.append({
                        'id': img['id'], 'text': '', 'confidence': 0,
                        'status': 'failed', 'error': str(e)
                    })

        duration = time.time() - start
        ok = sum(1 for r in results if r['status'] == 'completed' and r.get('text'))
        logger.info(f"✅ OCR batch done: {ok}/{len(images)} with text in {duration:.1f}s")
        return results

    def process_document_images(self, document_id: str) -> Dict:
        start = time.time()
        try:
            with get_db() as db:
                pending = get_pending_ocr_images(db, document_id)

            if not pending:
                return {"document_id": document_id, "images_processed": 0, "success": True}

            images = [{"id": str(r[0]), "path": r[1], "page_number": r[2]} for r in pending]
            all_results = []

            for i in range(0, len(images), self.batch_size):
                batch = images[i:i + self.batch_size]
                batch_results = self.process_batch(batch)
                all_results.extend(batch_results)

                with get_db() as db:
                    for r in batch_results:
                        update_image_ocr(db, r['id'], r.get('text', ''),
                                         r.get('confidence', 0), r['status'])

            ok = sum(1 for r in all_results if r['status'] == 'completed')
            return {
                "document_id": document_id,
                "images_processed": len(all_results),
                "images_successful": ok,
                "duration": round(time.time() - start, 2),
                "success": True
            }
        except Exception as e:
            logger.error(f"Document OCR failed: {e}")
            return {"document_id": document_id, "images_processed": 0, "success": False, "error": str(e)}

    def health_check(self) -> Dict:
        try:
            version = pytesseract.get_tesseract_version()
            return {
                "available": True,
                "engine": "tesseract",
                "version": str(version),
                "languages": self.languages,
                "cmd": settings.TESSERACT_CMD
            }
        except:
            return {"available": False, "engine": "tesseract", "error": "Tesseract not installed"}

    # ── TESSERACT ─────────────────────────────────────────────────────────────

    def _tesseract_single(self, image_path: str, image_id: str) -> Dict:
        start = time.time()
        try:
            if not Path(image_path).exists():
                raise FileNotFoundError(f"Image not found: {image_path}")

            image = Image.open(image_path)

            # --psm 6 = uniform block of text (best for SAP UI screenshots)
            # --oem 3 = default engine (LSTM)
            config = '--psm 6 --oem 3'
            text = pytesseract.image_to_string(image, config=config).strip()
            text = ' '.join(text.split())

            try:
                data = pytesseract.image_to_data(image, config=config,
                                                  output_type=pytesseract.Output.DICT)
                confs = [c for c in data['conf'] if c > 0]
                confidence = round(sum(confs) / len(confs), 2) if confs else 0
            except:
                confidence = 85.0 if text else 0.0

            return {
                'id': image_id,
                'text': text,
                'confidence': confidence,
                'status': 'completed',
                'duration': round(time.time() - start, 2),
                'engine': 'tesseract'
            }

        except Exception as e:
            logger.warning(f"Tesseract failed for {image_id}, trying EasyOCR: {e}")
            return self._easyocr_single(image_path, image_id)

    # ── EASYOCR FALLBACK ──────────────────────────────────────────────────────

    def _easyocr_single(self, image_path: str, image_id: str) -> Dict:
        start = time.time()
        try:
            import numpy as np
            image = Image.open(image_path)
            results = self.easyocr_reader.readtext(np.array(image))
            texts = [t for (_, t, c) in results if c > 0.3]
            confs = [c for (_, _, c) in results if c > 0.3]
            text = ' '.join(texts).strip()
            confidence = round(sum(confs) / len(confs) * 100, 2) if confs else 0

            return {
                'id': image_id, 'text': text, 'confidence': confidence,
                'status': 'completed', 'duration': round(time.time() - start, 2),
                'engine': 'easyocr'
            }
        except Exception as e:
            logger.error(f"EasyOCR also failed for {image_id}: {e}")
            return {
                'id': image_id, 'text': '', 'confidence': 0,
                'status': 'failed', 'duration': round(time.time() - start, 2),
                'engine': 'easyocr', 'error': str(e)
            }


# Global instance
ocr_service = OCRService()