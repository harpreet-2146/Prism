"""
PDF Processing API Routes
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import logging
from pathlib import Path
import shutil

from app.services.pdf_processor import pdf_processor
from app.services.image_service import image_service
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


class ProcessPDFRequest(BaseModel):
    """Process PDF request"""
    document_id: str
    pdf_path: str


class ExtractImagesRequest(BaseModel):
    """Extract images request"""
    document_id: str
    pdf_path: str


@router.post("/process")
async def process_pdf(request: ProcessPDFRequest):
    """
    Process PDF - extract text and metadata
    
    Returns text content AND word counts per page
    """
    try:
        result = pdf_processor.process_document(
            request.document_id, 
            request.pdf_path
        )
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        logger.error(f"PDF processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-images")
async def extract_images(request: ExtractImagesRequest):
    """
    Extract images from PDF:
    1. Render pages with minimal text as images (for OCR)
    2. Extract embedded images (diagrams, charts)
    
    NOTE: This endpoint needs word_counts from /process
    We'll get them by processing the PDF again (or from cache)
    """
    try:
        # First, get word counts by processing the PDF
        result = pdf_processor.process_document(
            request.document_id,
            request.pdf_path
        )
        
        word_counts = result.get('word_counts', {})
        
        # Now extract images using word counts
        images = image_service.extract_all_images(
            request.pdf_path,
            request.document_id,
            word_counts
        )
        
        return {
            "success": True,
            "data": {
                "document_id": request.document_id,
                "images": images,
                "count": len(images)
            }
        }
        
    except Exception as e:
        logger.error(f"Image extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload PDF file (temporary, for testing)
    """
    try:
        # Save to temp directory
        temp_path = Path(settings.TEMP_DIR) / file.filename
        
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get metadata
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