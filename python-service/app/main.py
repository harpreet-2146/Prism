# python-service/app/main.py

"""
PRISM Python Microservice - Main Application
FastAPI entry point for PDF processing, OCR, and embeddings
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app
import time
import logging

from app.config import settings
from app.utils.logger import setup_logging, get_logger
from app.database import test_connection
from app.api import health
from app.api import ocr_routes, pdf_routes, embedding_routes

# Setup logging
setup_logging(settings.LOG_LEVEL)
logger = get_logger(__name__)

# Create FastAPI app
app = FastAPI(
    title="PRISM Python Service",
    description="High-performance PDF processing, OCR, and embedding generation",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.3f}"
    
    # Log slow requests
    if process_time > 1.0:
        logger.warning(
            f"Slow request: {request.method} {request.url.path} - {process_time:.3f}s"
        )
    
    return response

# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else None
        }
    )

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF"])
app.include_router(ocr_routes.router, prefix="/api/ocr", tags=["OCR"])
app.include_router(embedding_routes.router, prefix="/api/embeddings", tags=["Embeddings"])

# Prometheus metrics
if settings.ENABLE_METRICS:
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("PRISM Python Service Starting")
    logger.info("=" * 60)
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Port: {settings.PORT}")
    
    # Test database connection
    if test_connection():
        logger.info("[OK] Database connection established")
    else:
        logger.error("[FAIL] Database connection failed")
    
    # Test EasyOCR
    from app.services.ocr_service import ocr_service
    ocr_health = ocr_service.health_check()
    if ocr_health['available']:
        logger.info(f"[OK] EasyOCR available - Engine: {ocr_health.get('engine', 'EasyOCR')}, Languages: {ocr_health.get('languages', 'en')}")
    else:
        logger.error("[FAIL] EasyOCR not available")
    
    # Pre-load embedding model
    try:
        from app.services.embedding_service import embedding_service
        health = embedding_service.health_check()
        if health['available']:
            logger.info(f"[OK] Embedding model loaded: {health['model']} (dim: {health['embedding_dimension']})")
        else:
            logger.error(f"[FAIL] Failed to load embedding model: {health.get('error')}")
    except Exception as e:
        logger.error(f"[FAIL] Embedding service initialization failed: {e}")
    
    logger.info("=" * 60)

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("PRISM Python Service shutting down...")

# Root endpoint
@app.get("/")
async def root():
    return {
        "service": "PRISM Python Microservice",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT,
        "endpoints": {
            "health": "/health",
            "detailed_health": "/health/detailed",
            "pdf": "/api/pdf",
            "ocr": "/api/ocr",
            "embeddings": "/api/embeddings",
            "docs": "/docs" if settings.DEBUG else None
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )