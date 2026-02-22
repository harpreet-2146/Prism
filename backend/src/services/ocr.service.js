# python-service/app/services/ocr_service.py
"""
OCR Service - OCR Space API (primary) + EasyOCR (fallback)
Concurrent processing: 10 images simultaneously
"""

import aiohttp
import asyncio
import concurrent.futures
import easyocr
from PIL import Image
import base64
import logging
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor
import time
from pathlib import Path
import numpy as np

from app.config import settings
from app.database import get_db, update_image_ocr, get_pending_ocr_images

logger = logging.getLogger(__name__)

OCR_SPACE_CONCURRENCY = 10


class OCRService:
    def __init__(self):
        self.languages = settings.OCR_LANGUAGES.split(',')
        self.gpu = settings.OCR_GPU
        self.batch_size = settings.OCR_BATCH_SIZE
        self.workers = settings.OCR_WORKERS

        self.ocr_space_key = getattr(settings, 'OCR_SPACE_API_KEY', None)
        self.ocr_space_engine = getattr(settings, 'OCR_SPACE_ENGINE', 2)
        self.ocr_space_language = getattr(settings, 'OCR_SPACE_LANGUAGE', 'eng')

        self._easyocr_reader = None

        if self.ocr_space_key:
            logger.info(f"✅ OCR Space API configured (engine {self.ocr_space_engine}) — primary OCR")
        else:
            logger.warning("⚠️  OCR_SPACE_API_KEY not set — using EasyOCR only")

    @property
    def easyocr_reader(self):
        if self._easyocr_reader is None:
            logger.info("Loading EasyOCR (fallback)...")
            self._easyocr_reader = easyocr.Reader(
                self.languages, gpu=self.gpu,
                model_storage_directory=settings.MODEL_CACHE_DIR,
                download_enabled=True
            )
        return self._easyocr_reader

    def _run_async(self, coro):
        """
        Safely run async coroutine from sync context even inside FastAPI's event loop.
        Spawns a new thread with its own event loop to avoid 'cannot be called from
        a running event loop' error.
        """
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────────

    def process_image(self, image_path: str, image_id: str) -> Dict:
        if self.ocr_space_key:
            return self._run_async(self._ocr_space_single(image_path, image_id))
        return self._easyocr_single(image_path, image_id)

    def process_batch(self, images: List[Dict]) -> List[Dict]:
        if not images:
            return []

        start = time.time()
        logger.info(f"🚀 OCR batch: {len(images)} images, concurrency={OCR_SPACE_CONCURRENCY}")

        if self.ocr_space_key:
            results = self._run_async(self._ocr_space_batch_concurrent(images))
        else:
            results = self._easyocr_batch(images)

        duration = time.time() - start
        ok = sum(1 for r in results if r['status'] == 'completed')
        logger.info(f"✅ OCR batch done: {ok}/{len(images)} succeeded in {duration:.1f}s")
        return results

    def process_document_images(self, document_id: str) -> Dict:
        start = time.time()
        try:
            with get_db() as db:
                pending = get_pending_ocr_images(db, document_id)

            if not pending:
                return {"document_id": document_id, "images_processed": 0, "success": True}

            images = [{"id": str(r[0]), "path": r[1], "page_number": r[2]} for r in pending]
            logger.info(f"Processing {len(images)} OCR images for doc {document_id}")

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
        return {
            "available": True,
            "engine": "OCR Space" if self.ocr_space_key else "EasyOCR",
            "ocr_space_configured": bool(self.ocr_space_key),
            "languages": self.languages,
            "concurrency": OCR_SPACE_CONCURRENCY
        }

    # ─────────────────────────────────────────────────────────────────────────
    # OCR SPACE — ASYNC CONCURRENT
    # ─────────────────────────────────────────────────────────────────────────

    async def _ocr_space_batch_concurrent(self, images: List[Dict]) -> List[Dict]:
        semaphore = asyncio.Semaphore(OCR_SPACE_CONCURRENCY)

        async def process_one(img):
            async with semaphore:
                try:
                    return await self._ocr_space_call(img['path'], img['id'])
                except Exception as e:
                    logger.warning(f"OCR Space failed for {img['id']}, trying EasyOCR: {e}")
                    return self._easyocr_single(img['path'], img['id'])

        async with aiohttp.ClientSession() as session:
            self._session = session
            tasks = [process_one(img) for img in images]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        final = []
        for img, result in zip(images, results):
            if isinstance(result, Exception):
                final.append(self._easyocr_single(img['path'], img['id']))
            elif not result.get('text', '').strip():
                fallback = self._easyocr_single(img['path'], img['id'])
                final.append(fallback if fallback.get('text', '').strip() else result)
            else:
                final.append(result)

        return final

    async def _ocr_space_call(self, image_path: str, image_id: str) -> Dict:
        start = time.time()

        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')

        ext = Path(image_path).suffix.lower().lstrip('.')
        mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else f'image/{ext}'

        payload = {
            'base64Image': f'data:{mime};base64,{image_data}',
            'language': self.ocr_space_language,
            'isOverlayRequired': False,
            'isTable': True,
            'scale': True,
            'ocrengine': self.ocr_space_engine,
        }

        async with self._session.post(
            'https://api.ocr.space/parse/image',
            data=payload,
            headers={'apikey': self.ocr_space_key},
            timeout=aiohttp.ClientTimeout(total=30)
        ) as resp:
            data = await resp.json()

        if data.get('IsErroredOnProcessing'):
            raise Exception(data.get('ErrorMessage', 'OCR Space error'))

        parsed = data.get('ParsedResults', [])
        text = self._clean_text(' '.join(r.get('ParsedText', '') for r in parsed))

        return {
            'id': image_id,
            'text': text,
            'confidence': 95.0 if text else 0.0,
            'status': 'completed',
            'duration': round(time.time() - start, 2),
            'engine': 'ocr_space'
        }

    async def _ocr_space_single(self, image_path: str, image_id: str) -> Dict:
        async with aiohttp.ClientSession() as session:
            self._session = session
            try:
                return await self._ocr_space_call(image_path, image_id)
            except Exception as e:
                logger.warning(f"OCR Space failed, using EasyOCR: {e}")
                return self._easyocr_single(image_path, image_id)

    # ─────────────────────────────────────────────────────────────────────────
    # EASYOCR FALLBACK
    # ─────────────────────────────────────────────────────────────────────────

    def _easyocr_single(self, image_path: str, image_id: str) -> Dict:
        start = time.time()
        try:
            if not Path(image_path).exists():
                raise FileNotFoundError(f"Image not found: {image_path}")

            image = Image.open(image_path)
            results = self.easyocr_reader.readtext(np.array(image))
            texts = [t for (_, t, c) in results if c > 0.3]
            confidences = [c for (_, _, c) in results if c > 0.3]
            full_text = self._clean_text(' '.join(texts))
            avg_conf = (sum(confidences) / len(confidences) * 100) if confidences else 0

            return {
                'id': image_id, 'text': full_text,
                'confidence': round(avg_conf, 2), 'status': 'completed',
                'duration': round(time.time() - start, 2), 'engine': 'easyocr'
            }
        except Exception as e:
            logger.error(f"EasyOCR failed for {image_id}: {e}")
            return {
                'id': image_id, 'text': '', 'confidence': 0,
                'status': 'failed', 'duration': round(time.time() - start, 2),
                'engine': 'easyocr', 'error': str(e)
            }

    def _easyocr_batch(self, images: List[Dict]) -> List[Dict]:
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = {executor.submit(self._easyocr_single, img['path'], img['id']): img for img in images}
            results = []
            for future in futures:
                try:
                    results.append(future.result(timeout=60))
                except Exception as e:
                    img = futures[future]
                    results.append({'id': img['id'], 'text': '', 'confidence': 0,
                                    'status': 'failed', 'error': str(e)})
        return results

    def _clean_text(self, text: str) -> str:
        return " ".join(text.split()).strip() if text else ""


# Global instance
ocr_service = OCRService()