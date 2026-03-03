"""
PDF Processing API Routes
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
import logging
from pathlib import Path
import shutil
from uuid import uuid4

from app.services.pdf_processor import pdf_processor
from app.services.image_service import image_service
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/process")
async def process_pdf(
    document_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Process PDF from multipart upload.
    Returns text content, chunks, word counts per page.
    """
    temp_path = None
    try:
        suffix = Path(file.filename or "").suffix or ".pdf"
        temp_path = Path(settings.TEMP_DIR) / f"{document_id}_{uuid4().hex}{suffix}"

        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = pdf_processor.process_document(document_id, str(temp_path))

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        logger.error(f"PDF processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


@router.post("/extract-images")
async def extract_images(
    document_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Extract images from multipart PDF upload:
    1. Render pages with minimal text as images (for OCR)
    2. Extract embedded images (diagrams, charts)
    """
    temp_path = None
    try:
        suffix = Path(file.filename or "").suffix or ".pdf"
        temp_path = Path(settings.TEMP_DIR) / f"{document_id}_{uuid4().hex}{suffix}"

        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        word_counts = pdf_processor.get_word_counts(str(temp_path))

        images = image_service.extract_all_images(
            str(temp_path),
            document_id,
            word_counts
        )

        return {
            "success": True,
            "data": {
                "document_id": document_id,
                "images": images,
                "count": len(images)
            }
        }

    except Exception as e:
        logger.error(f"Image extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload PDF file (temporary, for testing)
    """
    try:
        temp_path = Path(settings.TEMP_DIR) / file.filename

        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        metadata = pdf_processor.get_metadata(str(temp_path))

        return {
            "success": True,
            "data": {
                "filename": file.filename,
                "path": str(temp_path),
                "metadata": metadata
            }
        }

    except Exception as e:
        logger.error(f"PDF upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def pdf_health():
    """Check PDF service health"""
    return {
        "success": True,
        "data": {
            "available": True,
            "max_pages": settings.PDF_MAX_PAGES
        }
    }
