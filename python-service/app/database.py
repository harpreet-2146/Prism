from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
import logging

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.DEBUG
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        db.close()


def test_connection():
    try:
        with get_db() as db:
            result = db.execute(text("SELECT 1"))
            logger.info("✅ Database connection successful")
            return True
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        return False


def get_document_by_id(db, document_id: str):
    query = text("""
        SELECT id, user_id, filename, original_name, storage_path,
               status, page_count, image_count, embedding_status
        FROM documents
        WHERE id = :document_id
    """)
    result = db.execute(query, {"document_id": document_id})
    return result.fetchone()


def update_document_status(db, document_id: str, status: str, error: str = None):
    query = text("""
        UPDATE documents
        SET status = :status,
            processing_error = :error,
            updated_at = NOW()
        WHERE id = :document_id
    """)
    db.execute(query, {
        "document_id": document_id,
        "status": status,
        "error": error
    })
    db.commit()


def update_document_counts(db, document_id: str, page_count: int, image_count: int):
    query = text("""
        UPDATE documents
        SET page_count = :page_count,
            image_count = :image_count,
            updated_at = NOW()
        WHERE id = :document_id
    """)
    db.execute(query, {
        "document_id": document_id,
        "page_count": page_count,
        "image_count": image_count
    })
    db.commit()


def insert_document_image(db, document_id: str, page_number: int, 
                          image_index: int, storage_path: str,
                          width: int, height: int, file_size: int):
    query = text("""
        INSERT INTO document_images 
        (id, document_id, page_number, image_index, storage_path,
         width, height, format, file_size, created_at, ocr_status)
        VALUES (gen_random_uuid(), :document_id, :page_number, :image_index,
                :storage_path, :width, :height, 'jpg', :file_size, NOW(), 'pending')
        RETURNING id
    """)
    result = db.execute(query, {
        "document_id": document_id,
        "page_number": page_number,
        "image_index": image_index,
        "storage_path": storage_path,
        "width": width,
        "height": height,
        "file_size": file_size
    })
    db.commit()
    return result.fetchone()[0]


def update_image_ocr(db, image_id: str, ocr_text: str, 
                     confidence: float, status: str):
    query = text("""
        UPDATE document_images
        SET ocr_text = :ocr_text,
            ocr_confidence = :confidence,
            ocr_status = :status
        WHERE id = :image_id
    """)
    db.execute(query, {
        "image_id": image_id,
        "ocr_text": ocr_text,
        "confidence": confidence,
        "status": status
    })
    db.commit()


def get_pending_ocr_images(db, document_id: str):
    query = text("""
        SELECT id, storage_path, page_number
        FROM document_images
        WHERE document_id = :document_id
        AND ocr_status = 'pending'
        ORDER BY page_number, image_index
    """)
    result = db.execute(query, {"document_id": document_id})
    return result.fetchall()


def insert_embedding(db, document_id: str, user_id: str, chunk_index: int,
                     page_number: int, text: str, embedding: list,
                     source_type: str, source_image_id: str = None):
    import json
    
    query = text("""
        INSERT INTO embeddings
        (id, document_id, user_id, chunk_index, page_number, text,
         embedding, created_at, source_type, source_image_id)
        VALUES (gen_random_uuid(), :document_id, :user_id, :chunk_index,
                :page_number, :text, :embedding, NOW(), :source_type, :source_image_id)
    """)
    db.execute(query, {
        "document_id": document_id,
        "user_id": user_id,
        "chunk_index": chunk_index,
        "page_number": page_number,
        "text": text,
        "embedding": json.dumps(embedding),
        "source_type": source_type,
        "source_image_id": source_image_id
    })
    db.commit()