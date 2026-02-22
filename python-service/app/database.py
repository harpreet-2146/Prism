# python-service/app/database.py

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
import logging
import json

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False  # never echo in prod — kills performance
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
            db.execute(text("SELECT 1"))
            logger.info("✅ Database connection successful")
            return True
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        return False


def get_document_by_id(db, document_id: str):
    result = db.execute(text("""
        SELECT id, user_id, filename, original_name, storage_path,
               status, page_count, image_count, embedding_status
        FROM documents WHERE id = :document_id
    """), {"document_id": document_id})
    return result.fetchone()


def update_document_status(db, document_id: str, status: str, error: str = None):
    db.execute(text("""
        UPDATE documents SET status = :status, processing_error = :error, updated_at = NOW()
        WHERE id = :document_id
    """), {"document_id": document_id, "status": status, "error": error})
    db.commit()


def update_document_counts(db, document_id: str, page_count: int, image_count: int):
    db.execute(text("""
        UPDATE documents SET page_count = :page_count, image_count = :image_count, updated_at = NOW()
        WHERE id = :document_id
    """), {"document_id": document_id, "page_count": page_count, "image_count": image_count})
    db.commit()


def insert_document_image(db, document_id: str, page_number: int,
                          image_index: int, storage_path: str,
                          width: int, height: int, file_size: int):
    """Single image insert — used sparingly. Prefer insert_document_images_batch."""
    result = db.execute(text("""
        INSERT INTO document_images
        (id, document_id, page_number, image_index, storage_path,
         width, height, format, file_size, created_at, ocr_status)
        VALUES (gen_random_uuid(), :document_id, :page_number, :image_index,
                :storage_path, :width, :height, 'jpg', :file_size, NOW(), 'pending')
        RETURNING id
    """), {
        "document_id": document_id, "page_number": page_number,
        "image_index": image_index, "storage_path": storage_path,
        "width": width, "height": height, "file_size": file_size
    })
    db.commit()
    return result.fetchone()[0]


def insert_document_images_batch(db, images: list) -> list:
    """
    Insert ALL images for a document in a SINGLE transaction.
    images: list of dicts with keys:
      document_id, page_number, image_index, storage_path, width, height, file_size

    Returns list of inserted IDs in same order.
    Was: 300 individual BEGIN/INSERT/COMMIT = ~20 seconds
    Now: 1 BEGIN + 300 INSERTs + 1 COMMIT = ~0.3 seconds
    """
    if not images:
        return []

    ids = []
    for img in images:
        result = db.execute(text("""
            INSERT INTO document_images
            (id, document_id, page_number, image_index, storage_path,
             width, height, format, file_size, created_at, ocr_status)
            VALUES (gen_random_uuid(), :document_id, :page_number, :image_index,
                    :storage_path, :width, :height, 'jpg', :file_size, NOW(), 'pending')
            RETURNING id
        """), {
            "document_id": img["document_id"],
            "page_number": img["page_number"],
            "image_index": img["image_index"],
            "storage_path": img["storage_path"],
            "width": img["width"],
            "height": img["height"],
            "file_size": img["file_size"]
        })
        ids.append(result.fetchone()[0])

    db.commit()  # ONE commit for ALL images
    logger.info(f"✅ Batch inserted {len(ids)} images in single transaction")
    return ids


def update_image_ocr(db, image_id: str, ocr_text: str, confidence: float, status: str):
    db.execute(text("""
        UPDATE document_images
        SET ocr_text = :ocr_text, ocr_confidence = :confidence, ocr_status = :status
        WHERE id = :image_id
    """), {"image_id": image_id, "ocr_text": ocr_text, "confidence": confidence, "status": status})
    db.commit()


def get_pending_ocr_images(db, document_id: str):
    result = db.execute(text("""
        SELECT id, storage_path, page_number
        FROM document_images
        WHERE document_id = :document_id AND ocr_status = 'pending'
        ORDER BY page_number, image_index
    """), {"document_id": document_id})
    return result.fetchall()


def insert_embedding(db, document_id: str, user_id: str, chunk_index: int,
                     page_number: int, text: str, embedding: list,
                     source_type: str, source_image_id: str = None):
    """Single embedding insert — no commit, caller must commit."""
    db.execute(text("""
        INSERT INTO embeddings
        (id, document_id, user_id, chunk_index, page_number, text,
         embedding, created_at, source_type, source_image_id)
        VALUES (gen_random_uuid(), :document_id, :user_id, :chunk_index,
                :page_number, :text, :embedding, NOW(), :source_type, :source_image_id)
    """), {
        "document_id": document_id, "user_id": user_id,
        "chunk_index": chunk_index, "page_number": page_number,
        "text": text, "embedding": json.dumps(embedding),
        "source_type": source_type, "source_image_id": source_image_id
    })
    # NO commit here — caller uses get_db() context manager which commits once at end


def insert_embeddings_batch(db, embeddings: list):
    """
    Insert ALL embeddings in a single transaction.
    embeddings: list of dicts with all embedding fields + 'embedding' as list

    Was: 260 individual commits = slow
    Now: 1 commit for all = fast
    """
    if not embeddings:
        return

    for emb in embeddings:
        db.execute(text("""
            INSERT INTO embeddings
            (id, document_id, user_id, chunk_index, page_number, text,
             embedding, created_at, source_type, source_image_id)
            VALUES (gen_random_uuid(), :document_id, :user_id, :chunk_index,
                    :page_number, :text, :embedding, NOW(), :source_type, :source_image_id)
        """), {
            "document_id": emb["document_id"], "user_id": emb["user_id"],
            "chunk_index": emb["chunk_index"], "page_number": emb["page_number"],
            "text": emb["text"], "embedding": json.dumps(emb["embedding"]),
            "source_type": emb["source_type"], "source_image_id": emb.get("source_image_id")
        })

    db.commit()  # ONE commit for everything
    logger.info(f"✅ Batch inserted {len(embeddings)} embeddings in single transaction")