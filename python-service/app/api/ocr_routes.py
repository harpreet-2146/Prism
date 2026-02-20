"""
OCR API Routes
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import logging

from app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter()


class OCRRequest(BaseModel):
    """Single image OCR request - matches backend format"""
    image_path: str
    document_id: str
    page_number: int
    image_index: int


class OCRRequestAlt(BaseModel):
    """Alternative OCR request format"""
    image_path: str
    image_id: str


class BatchOCRRequest(BaseModel):
    """Batch OCR request"""
    images: List[dict]  # List of {id, path}


class DocumentOCRRequest(BaseModel):
    """Process all images for a document"""
    document_id: str


@router.post("/process")
async def process_ocr(request: OCRRequest):
    """
    Process a single image with OCR (matches backend expectations)
    Backend calls: POST /api/ocr/process with image_path, document_id, page_number, image_index
    """
    try:
        logger.info(f"📷 OCR request: {request.image_path}, page {request.page_number}")
        
        # Process with OCR service
        result = ocr_service.process_image(
            request.image_path, 
            f"{request.document_id}_p{request.page_number}_i{request.image_index}"
        )
        
        if result['status'] == 'failed':
            raise HTTPException(status_code=500, detail=result['error'])
        
        return {
            "success": True,
            "text": result.get('text', ''),
            "confidence": result.get('confidence', 0),
            "language": result.get('language', 'eng'),
            "processing_time": result.get('processing_time', 0)
        }
        
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-image")
async def process_single_image(request: OCRRequestAlt):
    """
    Process a single image with OCR (alternative format)
    """
    try:
        result = ocr_service.process_image(request.image_path, request.image_id)
        
        if result['status'] == 'failed':
            raise HTTPException(status_code=500, detail=result['error'])
        
        return {
            "success": True,
            "data": result
        }
        
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch")
async def process_batch_images(request: BatchOCRRequest):
    """
    Process multiple images in parallel
    """
    try:
        if not request.images:
            raise HTTPException(status_code=400, detail="No images provided")
        
        if len(request.images) > 50:
            raise HTTPException(
                status_code=400,
                detail=f"Batch too large: {len(request.images)} images (max 50)"
            )
        
        results = ocr_service.process_batch(request.images)
        
        successful = sum(1 for r in results if r['status'] == 'completed')
        
        return {
            "success": True,
            "data": {
                "results": results,
                "total": len(results),
                "successful": successful,
                "failed": len(results) - successful
            }
        }
        
    except Exception as e:
        logger.error(f"Batch OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-document")
async def process_document_ocr(request: DocumentOCRRequest, background_tasks: BackgroundTasks):
    """
    Process all pending OCR images for a document
    Can be run in background for large documents
    """
    try:
        # For small documents, process immediately
        # For large documents, run in background
        result = ocr_service.process_document_images(request.document_id)
        
        return {
            "success": result['success'],
            "data": result
        }
        
    except Exception as e:
        logger.error(f"Document OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def ocr_health():
    """Check OCR service health"""
    health = ocr_service.health_check()
    
    if not health['available']:
        raise HTTPException(status_code=503, detail="OCR service unavailable")
    
    return {
        "success": True,
        "data": health
    }