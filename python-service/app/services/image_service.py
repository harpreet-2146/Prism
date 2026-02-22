# python-service/app/services/image_service.py
"""
Image Processing Service — parallel page rendering + batch DB inserts
"""

import fitz  # PyMuPDF
from PIL import Image
import io
import logging
from typing import List, Dict, Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import threading

from app.config import settings
from app.database import get_db, insert_document_images_batch

logger = logging.getLogger(__name__)


class ImageService:
    def __init__(self):
        self.dpi = settings.PDF_DPI
        self.quality = settings.PDF_IMAGE_QUALITY
        self.output_dir = Path(settings.OUTPUT_DIR)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.text_threshold = 50
        # PyMuPDF is not thread-safe for the same document object,
        # so we use a lock when accessing the doc
        self._doc_lock = threading.Lock()

    def extract_all_images(self, pdf_path: str, document_id: str,
                           pages_with_text_count: Dict[int, int]) -> List[Dict]:
        try:
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            image_hashes = set()

            logger.info(f"Extracting images from {pdf_path} ({total_pages} pages) — parallel rendering enabled")

            # ── STEP 1: Render low-text pages IN PARALLEL ─────────────────────
            # Identify which pages need rendering first
            pages_to_render = [
                pn for pn in range(total_pages)
                if pages_with_text_count.get(pn + 1, 0) < self.text_threshold
            ]

            logger.info(f"Pages to render: {len(pages_to_render)}/{total_pages}")

            page_renders = []

            if pages_to_render:
                # Render up to 8 pages simultaneously
                with ThreadPoolExecutor(max_workers=8) as executor:
                    future_to_page = {
                        executor.submit(
                            self._render_page_to_file_threadsafe,
                            pdf_path,  # each thread opens its own doc handle
                            pn,
                            document_id
                        ): pn
                        for pn in pages_to_render
                    }

                    for future in as_completed(future_to_page):
                        result = future.result()
                        if result:
                            page_renders.append(result)

                # Sort by page number so DB order is consistent
                page_renders.sort(key=lambda x: x['page_number'])
                logger.info(f"✅ Parallel rendering done: {len(page_renders)} page images")

            # ── STEP 2: Extract embedded images ───────────────────────────────
            embedded_images = []
            for page_num in range(total_pages):
                page = doc[page_num]
                for img_index, img_info in enumerate(page.get_images(full=True)):
                    try:
                        xref = img_info[0]
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]

                        img_hash = hashlib.md5(image_bytes).hexdigest()
                        if img_hash in image_hashes:
                            continue
                        image_hashes.add(img_hash)

                        image = Image.open(io.BytesIO(image_bytes))
                        width, height = image.size
                        if width < 100 or height < 100:
                            continue

                        filename = f"{document_id}_p{page_num + 1}_img{img_index + 1}.jpg"
                        image_path = self.output_dir / filename

                        if image.mode not in ('RGB', 'L'):
                            image = image.convert('RGB')
                        image.save(image_path, format='JPEG', quality=self.quality, optimize=True)

                        embedded_images.append({
                            "document_id": document_id,
                            "page_number": page_num + 1,
                            "image_index": img_index + 1,
                            "storage_path": filename,
                            "width": width,
                            "height": height,
                            "file_size": image_path.stat().st_size,
                            "type": "embedded"
                        })
                    except Exception as e:
                        logger.error(f"Failed embedded image p{page_num+1} img{img_index}: {e}")

            doc.close()

            all_image_data = page_renders + embedded_images

            if not all_image_data:
                logger.info("No images extracted")
                return []

            # ── STEP 3: Single batch DB insert ────────────────────────────────
            logger.info(f"Batch inserting {len(all_image_data)} images into DB...")
            with get_db() as db:
                ids = insert_document_images_batch(db, all_image_data)

            for i, img in enumerate(all_image_data):
                img["id"] = str(ids[i])

            logger.info(
                f"✅ Done: {len(all_image_data)} images "
                f"({len(page_renders)} page renders, {len(embedded_images)} embedded)"
            )

            return all_image_data

        except Exception as e:
            logger.error(f"Image extraction failed: {e}")
            raise

    def _render_page_to_file_threadsafe(self, pdf_path: str, page_num: int,
                                         document_id: str) -> Optional[Dict]:
        """
        Each thread opens its OWN fitz document handle.
        PyMuPDF is not thread-safe when sharing a single doc object,
        but opening separate handles per thread is safe and fast.
        """
        try:
            doc = fitz.open(pdf_path)
            page = doc[page_num]
            mat = fitz.Matrix(self.dpi / 72, self.dpi / 72)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()

            filename = f"{document_id}_p{page_num + 1}_full.jpg"
            image_path = self.output_dir / filename
            img.save(image_path, format='JPEG', quality=self.quality, optimize=True)

            return {
                "document_id": document_id,
                "page_number": page_num + 1,
                "image_index": 0,
                "storage_path": filename,
                "width": pix.width,
                "height": pix.height,
                "file_size": image_path.stat().st_size,
                "type": "page_render"
            }
        except Exception as e:
            logger.error(f"Failed to render page {page_num + 1}: {e}")
            return None

    def _render_page_to_file(self, doc: fitz.Document, page_num: int,
                              document_id: str) -> Optional[Dict]:
        """Single-threaded version kept for compatibility."""
        return self._render_page_to_file_threadsafe(
            doc.name, page_num, document_id
        )


# Global instance
image_service = ImageService()