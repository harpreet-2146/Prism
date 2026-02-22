# python-service/app/api/embedding_routes.py
"""
Embedding Generation API Routes — backed by Voyage AI
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import logging

from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateEmbeddingRequest(BaseModel):
    text: str


class BatchEmbeddingRequest(BaseModel):
    texts: List[str]


class DocumentChunk(BaseModel):
    text: str
    page_number: int
    chunk_index: int
    source_type: str = "text"
    source_image_id: Optional[str] = None


class ProcessDocumentRequest(BaseModel):
    document_id: str
    user_id: str
    chunks: List[DocumentChunk]


class SearchRequest(BaseModel):
    query: str
    embeddings: List[dict]
    top_k: int = 5


@router.post("/generate")
async def generate_embeddings(request: Request):
    """
    Generate embeddings — accepts array or object format.
    Backend sends: POST /api/embeddings/generate with array of strings.
    Returns array of vectors (matches backend expectation).
    """
    try:
        body = await request.json()

        if isinstance(body, list):
            texts = body
        elif isinstance(body, dict) and 'texts' in body:
            texts = body['texts']
        elif isinstance(body, dict) and 'text' in body:
            texts = [body['text']]
        else:
            raise HTTPException(status_code=400, detail=f"Invalid format. Expected array or {{texts: []}}.")

        if not texts:
            raise HTTPException(status_code=400, detail="No texts provided")

        if len(texts) > 500:
            raise HTTPException(status_code=400, detail=f"Batch too large: {len(texts)} (max 500)")

        embeddings = embedding_service.generate_batch_embeddings(texts)
        logger.info(f"✅ Generated {len(embeddings)} embeddings via Voyage AI")

        # Return raw array — matches what Node backend expects
        return embeddings

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-single")
async def generate_single_embedding(request: GenerateEmbeddingRequest):
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        embedding = embedding_service.generate_embedding(request.text)
        return {"success": True, "data": {"embedding": embedding, "dimension": len(embedding)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-batch")
async def generate_batch_embeddings(request: BatchEmbeddingRequest):
    try:
        if not request.texts:
            raise HTTPException(status_code=400, detail="No texts provided")
        embeddings = embedding_service.generate_batch_embeddings(request.texts)
        return {
            "success": True,
            "data": {"embeddings": embeddings, "count": len(embeddings), "dimension": len(embeddings[0]) if embeddings else 0}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-query")
async def generate_query_embedding(request: GenerateEmbeddingRequest):
    """
    Generate a QUERY embedding (optimized for search, not document storage).
    Use this for chat search queries for better retrieval accuracy.
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        embedding = embedding_service.generate_query_embedding(request.text)
        return {"success": True, "data": {"embedding": embedding, "dimension": len(embedding)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-document")
async def process_document_embeddings(request: ProcessDocumentRequest):
    try:
        if not request.chunks:
            raise HTTPException(status_code=400, detail="No chunks provided")
        chunks_data = [chunk.dict() for chunk in request.chunks]
        result = embedding_service.process_document_chunks(request.document_id, request.user_id, chunks_data)
        if not result['success']:
            raise HTTPException(status_code=500, detail=result.get('error'))
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_similar_embeddings(request: SearchRequest):
    try:
        if not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        results = embedding_service.search_similar(request.query, request.embeddings, request.top_k)
        return {"success": True, "data": {"results": results, "count": len(results)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dimension")
async def get_embedding_dimension():
    try:
        dimension = embedding_service.get_embedding_dimension()
        return {"success": True, "data": {"dimension": dimension, "model": embedding_service.model, "provider": "voyage-ai"}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def embedding_health():
    health = embedding_service.health_check()
    if not health['available']:
        raise HTTPException(status_code=503, detail="Embedding service unavailable")
    return {"success": True, "data": health}