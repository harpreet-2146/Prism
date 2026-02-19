"""
Embedding Service - Batch processing with sentence-transformers
Processes up to 100 text chunks in parallel
"""

from sentence_transformers import SentenceTransformer
import numpy as np
import logging
from typing import List, Dict, Optional
import time
from pathlib import Path

from app.config import settings
from app.database import get_db, insert_embedding

logger = logging.getLogger(__name__)


class EmbeddingService:
    """High-performance embedding generation with batch processing"""
    
    def __init__(self):
        self.batch_size = settings.EMBEDDING_BATCH_SIZE
        self.model_name = settings.EMBEDDING_MODEL
        self.device = settings.EMBEDDING_DEVICE
        self.cache_dir = settings.MODEL_CACHE_DIR
        
        # Initialize model (lazy loading)
        self._model = None
        
        logger.info(
            f"Embedding Service initialized - Model: {self.model_name}, "
            f"Batch size: {self.batch_size}, Device: {self.device}"
        )
    
    @property
    def model(self):
        """Lazy load the model"""
        if self._model is None:
            logger.info(f"Loading embedding model: {self.model_name}")
            start = time.time()
            
            self._model = SentenceTransformer(
                self.model_name,
                cache_folder=self.cache_dir,
                device=self.device
            )
            
            duration = time.time() - start
            logger.info(f"✅ Model loaded in {duration:.2f}s")
        
        return self._model
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector as list
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        try:
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            
            return embedding.tolist()
            
        except Exception as e:
            logger.error(f"❌ Embedding generation failed: {e}")
            raise
    
    def generate_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batch (FAST)
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        start_time = time.time()
        
        try:
            logger.info(f"🔄 Generating embeddings for {len(texts)} texts in batch")
            
            # Batch encoding (this is where the magic happens - all at once!)
            embeddings = self.model.encode(
                texts,
                batch_size=self.batch_size,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            
            duration = time.time() - start_time
            
            logger.info(
                f"✅ Batch embeddings complete - {len(texts)} texts in {duration:.2f}s "
                f"({len(texts)/duration:.1f} texts/sec)"
            )
            
            return embeddings.tolist()
            
        except Exception as e:
            logger.error(f"❌ Batch embedding generation failed: {e}")
            raise
    
    def process_document_chunks(self, document_id: str, user_id: str, 
                                chunks: List[Dict]) -> Dict:
        """
        Process all chunks for a document and save embeddings
        
        Args:
            document_id: Document ID
            user_id: User ID
            chunks: List of chunk dicts with 'text', 'page_number', 'chunk_index', etc.
            
        Returns:
            Processing summary
        """
        doc_start = time.time()
        
        try:
            if not chunks:
                logger.warning(f"No chunks provided for document {document_id}")
                return {
                    "document_id": document_id,
                    "chunks_processed": 0,
                    "success": True
                }
            
            logger.info(f"📄 Processing {len(chunks)} chunks for document {document_id}")
            
            # Extract texts for batch processing
            texts = [chunk['text'] for chunk in chunks]
            
            # Generate all embeddings in batch (THIS IS THE PERFORMANCE WIN)
            embeddings = self.generate_batch_embeddings(texts)
            
            # Save to database
            logger.info(f"💾 Saving {len(embeddings)} embeddings to database...")
            
            with get_db() as db:
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    insert_embedding(
                        db,
                        document_id=document_id,
                        user_id=user_id,
                        chunk_index=chunk.get('chunk_index', i),
                        page_number=chunk['page_number'],
                        text=chunk['text'],
                        embedding=embedding,
                        source_type=chunk.get('source_type', 'text'),
                        source_image_id=chunk.get('source_image_id', None)
                    )
            
            doc_duration = time.time() - doc_start
            
            logger.info(
                f"✅ Document embeddings complete - {document_id} - "
                f"{len(embeddings)} chunks in {doc_duration:.2f}s "
                f"({len(embeddings)/doc_duration:.1f} chunks/sec)"
            )
            
            return {
                "document_id": document_id,
                "chunks_processed": len(embeddings),
                "embedding_dimension": len(embeddings[0]) if embeddings else 0,
                "duration": round(doc_duration, 2),
                "chunks_per_second": round(len(embeddings) / doc_duration, 2),
                "success": True
            }
            
        except Exception as e:
            logger.error(f"❌ Document embedding processing failed for {document_id}: {e}")
            return {
                "document_id": document_id,
                "chunks_processed": 0,
                "success": False,
                "error": str(e)
            }
    
    def search_similar(self, query: str, embeddings_list: List[Dict], 
                      top_k: int = 5) -> List[Dict]:
        """
        Search for similar embeddings using cosine similarity
        
        Args:
            query: Search query text
            embeddings_list: List of dicts with 'id', 'embedding', 'text', etc.
            top_k: Number of results to return
            
        Returns:
            Top-k most similar results with scores
        """
        try:
            # Generate query embedding
            query_embedding = self.generate_embedding(query)
            query_vector = np.array(query_embedding)
            
            # Calculate similarities
            results = []
            for item in embeddings_list:
                doc_vector = np.array(item['embedding'])
                
                # Cosine similarity
                similarity = np.dot(query_vector, doc_vector) / (
                    np.linalg.norm(query_vector) * np.linalg.norm(doc_vector)
                )
                
                results.append({
                    **item,
                    'similarity_score': float(similarity)
                })
            
            # Sort by similarity and return top-k
            results.sort(key=lambda x: x['similarity_score'], reverse=True)
            
            return results[:top_k]
            
        except Exception as e:
            logger.error(f"❌ Similarity search failed: {e}")
            raise
    
    def get_embedding_dimension(self) -> int:
        """Get the dimension of embeddings produced by this model"""
        try:
            # Generate a dummy embedding to get dimension
            dummy_embedding = self.generate_embedding("test")
            return len(dummy_embedding)
        except Exception as e:
            logger.error(f"Failed to get embedding dimension: {e}")
            return 384  # Default for all-MiniLM-L6-v2
    
    def health_check(self) -> Dict:
        """Check if embedding service is available"""
        try:
            # Try to load model
            _ = self.model
            
            # Test embedding generation
            test_text = "This is a test sentence."
            test_embedding = self.generate_embedding(test_text)
            
            return {
                "available": True,
                "model": self.model_name,
                "device": self.device,
                "embedding_dimension": len(test_embedding),
                "batch_size": self.batch_size
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }


# Global instance
embedding_service = EmbeddingService()