from fastapi import APIRouter
from datetime import datetime
import logging

from app.config import settings
from app.database import test_connection

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/health/detailed")
async def detailed_health_check():
    db_healthy = test_connection()
    
    tesseract_healthy = False
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        tesseract_healthy = True
    except Exception as e:
        logger.error(f"Tesseract check failed: {e}")
    
    embedding_healthy = False
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(settings.EMBEDDING_MODEL)
        embedding_healthy = True
    except Exception as e:
        logger.error(f"Embedding model check failed: {e}")
    
    overall_status = "healthy" if all([
        db_healthy,
        tesseract_healthy,
        embedding_healthy
    ]) else "unhealthy"
    
    return {
        "status": overall_status,
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "database": {
                "status": "healthy" if db_healthy else "unhealthy"
            },
            "tesseract": {
                "status": "healthy" if tesseract_healthy else "unhealthy",
                "version": pytesseract.get_tesseract_version() if tesseract_healthy else None
            },
            "embedding_model": {
                "status": "healthy" if embedding_healthy else "unhealthy",
                "model": settings.EMBEDDING_MODEL
            }
        }
    }