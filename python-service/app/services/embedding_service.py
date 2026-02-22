# python-service/app/services/embedding_service.py
"""
Embedding Service - Voyage AI cloud API + batch DB inserts
"""

import voyageai
import numpy as np
import logging
import time
from typing import List, Dict, Optional

from app.config import settings
from app.database import get_db, insert_embeddings_batch

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        self.model = settings.VOYAGE_MODEL
        self.batch_size = settings.VOYAGE_BATCH_SIZE
        self.client = voyageai.Client(api_key=settings.VOYAGE_API_KEY)
        logger.info(f"✅ Voyage AI embedding service initialized — model: {self.model}")

    def generate_embedding(self, text: str) -> List[float]:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        return self.generate_batch_embeddings([text])[0]

    def generate_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        cleaned = [t.strip() if t and t.strip() else "empty" for t in texts]
        start = time.time()
        logger.info(f"🚀 Voyage AI: embedding {len(cleaned)} texts...")

        all_embeddings = []
        total_batches = (len(cleaned) + self.batch_size - 1) // self.batch_size

        for i in range(0, len(cleaned), self.batch_size):
            batch = cleaned[i:i + self.batch_size]
            batch_num = i // self.batch_size + 1
            result = self.client.embed(batch, model=self.model, input_type="document")
            all_embeddings.extend(result.embeddings)
            logger.info(f"  Voyage batch {batch_num}/{total_batches} done ({len(batch)} texts)")

        duration = time.time() - start
        logger.info(f"✅ Voyage AI done: {len(all_embeddings)} embeddings in {duration:.2f}s ({len(all_embeddings)/duration:.0f} texts/sec)")
        return all_embeddings

    def generate_query_embedding(self, query: str) -> List[float]:
        if not query or not query.strip():
            raise ValueError("Query cannot be empty")
        result = self.client.embed([query], model=self.model, input_type="query")
        return result.embeddings[0]

    def process_document_chunks(self, document_id: str, user_id: str, chunks: List[Dict]) -> Dict:
        """Generate embeddings + save ALL in one transaction."""
        start = time.time()
        if not chunks:
            return {"document_id": document_id, "chunks_processed": 0, "success": True}

        try:
            texts = [chunk['text'] for chunk in chunks]
            embeddings = self.generate_batch_embeddings(texts)

            # Build batch payload
            batch = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                batch.append({
                    "document_id": document_id,
                    "user_id": user_id,
                    "chunk_index": chunk.get('chunk_index', i),
                    "page_number": chunk['page_number'],
                    "text": chunk['text'],
                    "embedding": embedding,
                    "source_type": chunk.get('source_type', 'text'),
                    "source_image_id": chunk.get('source_image_id')
                })

            # Single transaction for all embeddings
            with get_db() as db:
                insert_embeddings_batch(db, batch)

            duration = time.time() - start
            return {
                "document_id": document_id,
                "chunks_processed": len(embeddings),
                "embedding_dimension": len(embeddings[0]) if embeddings else 0,
                "duration": round(duration, 2),
                "success": True
            }

        except Exception as e:
            logger.error(f"Document embedding processing failed: {e}")
            return {"document_id": document_id, "chunks_processed": 0, "success": False, "error": str(e)}

    def search_similar(self, query: str, embeddings_list: List[Dict], top_k: int = 5) -> List[Dict]:
        query_vector = np.array(self.generate_query_embedding(query))
        results = []
        for item in embeddings_list:
            doc_vector = np.array(item['embedding'])
            sim = np.dot(query_vector, doc_vector) / (np.linalg.norm(query_vector) * np.linalg.norm(doc_vector))
            results.append({**item, 'similarity_score': float(sim)})
        results.sort(key=lambda x: x['similarity_score'], reverse=True)
        return results[:top_k]

    def get_embedding_dimension(self) -> int:
        return 1536

    def health_check(self) -> Dict:
        try:
            test = self.generate_embedding("health check")
            return {"available": True, "model": self.model, "provider": "voyage-ai", "embedding_dimension": len(test)}
        except Exception as e:
            return {"available": False, "error": str(e)}


# Global instance
embedding_service = EmbeddingService()