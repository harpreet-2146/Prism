"""
Embedding Generation API Routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging

from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateEmbeddingRequest(BaseModel):
    """Single text embedding request"""
    text: str


class BatchEmbeddingRequest(BaseModel):
    """Batch embedding request"""
    texts: List[str]


class DocumentChunk(BaseModel):
    """Document chunk for embedding"""
    text: str
    page_number: int
    chunk_index: int
    source_type: str = "text"
    source_image_id: Optional[str] = None


class ProcessDocumentRequest(BaseModel):
    """Process all chunks for a document"""
    document_id: str
    user_id: str
    chunks: List[DocumentChunk]


class SearchRequest(BaseModel):
    """Similarity search request"""
    query: str
    embeddings: List[dict]
    top_k: int = 5


@router.post("/generate")
async def generate_single_embedding(request: GenerateEmbeddingRequest):
    """
    Generate embedding for a single text
    """
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        embedding = embedding_service.generate_embedding(request.text)
        
        return {
            "success": True,
            "data": {
                "embedding": embedding,
                "dimension": len(embedding)
            }
        }
        
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-batch")
async def generate_batch_embeddings(request: BatchEmbeddingRequest):
    """
    Generate embeddings for multiple texts in batch (FAST)
    """
    try:
        if not request.texts:
            raise HTTPException(status_code=400, detail="No texts provided")
        
        if len(request.texts) > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Batch too large: {len(request.texts)} texts (max 200)"
            )
        
        embeddings = embedding_service.generate_batch_embeddings(request.texts)
        
        return {
            "success": True,
            "data": {
                "embeddings": embeddings,
                "count": len(embeddings),
                "dimension": len(embeddings[0]) if embeddings else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Batch embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-document")
async def process_document_embeddings(request: ProcessDocumentRequest):
    """
    Process all chunks for a document and save embeddings
    """
    try:
        if not request.chunks:
            raise HTTPException(status_code=400, detail="No chunks provided")
        
        # Convert Pydantic models to dicts
        chunks_data = [chunk.dict() for chunk in request.chunks]
        
        result = embedding_service.process_document_chunks(
            request.document_id,
            request.user_id,
            chunks_data
        )
        
        if not result['success']:
            raise HTTPException(status_code=500, detail=result.get('error'))
        
        return {
            "success": True,
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document embedding processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_similar_embeddings(request: SearchRequest):
    """
    Search for similar embeddings using cosine similarity
    """
    try:
        if not request.query or not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        if not request.embeddings:
            raise HTTPException(status_code=400, detail="No embeddings provided")
        
        results = embedding_service.search_similar(
            request.query,
            request.embeddings,
            request.top_k
        )
        
        return {
            "success": True,
            "data": {
                "results": results,
                "count": len(results)
            }
        }
        
    except Exception as e:
        logger.error(f"Similarity search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dimension")
async def get_embedding_dimension():
    """
    Get the dimension of embeddings produced by this model
    """
    try:
        dimension = embedding_service.get_embedding_dimension()
        
        return {
            "success": True,
            "data": {
                "dimension": dimension,
                "model": embedding_service.model_name
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get dimension: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def embedding_health():
    """Check embedding service health"""
    health = embedding_service.health_check()
    
    if not health['available']:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")
    
    return {
        "success": True,
        "data": health
    }