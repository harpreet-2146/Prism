# python-service/app/config.py

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import Union, List
import os


class Settings(BaseSettings):
    APP_NAME: str = "prism-python-service"
    ENVIRONMENT: str = Field("development", env="ENVIRONMENT")
    DEBUG: bool = Field(False, env="DEBUG")
    LOG_LEVEL: str = Field("INFO", env="LOG_LEVEL")

    HOST: str = Field("0.0.0.0", env="HOST")
    PORT: int = Field(8000, env="PORT")
    WORKERS: int = Field(4, env="WORKERS")

    DATABASE_URL: str = Field(..., env="DATABASE_URL")

    REDIS_URL: str = Field("redis://localhost:6379/0", env="REDIS_URL")
    REDIS_MAX_CONNECTIONS: int = Field(10, env="REDIS_MAX_CONNECTIONS")

    UPLOAD_DIR: str = Field("./data/uploads", env="UPLOAD_DIR")
    TEMP_DIR: str = Field("./data/temp", env="TEMP_DIR")
    OUTPUT_DIR: str = Field("./data/outputs", env="OUTPUT_DIR")

    PDF_MAX_PAGES: int = Field(1500, env="PDF_MAX_PAGES")
    PDF_DPI: int = Field(100, env="PDF_DPI")
    PDF_IMAGE_QUALITY: int = Field(85, env="PDF_IMAGE_QUALITY")

    OCR_LANGUAGES: str = Field("en", env="OCR_LANGUAGES")
    OCR_GPU: bool = Field(False, env="OCR_GPU")
    OCR_BATCH_SIZE: int = Field(20, env="OCR_BATCH_SIZE")
    OCR_TIMEOUT: int = Field(30, env="OCR_TIMEOUT")
    OCR_WORKERS: int = Field(4, env="OCR_WORKERS")

    # ── Tesseract OCR ─────────────────────────────────────────────────────────
    # Windows: set to full path in .env
    # Linux (deployment): leave as default "tesseract" — auto-detected
    TESSERACT_CMD: str = Field("tesseract", env="TESSERACT_CMD")

    # ── OCR Space API (optional cloud OCR) ────────────────────────────────────
    OCR_SPACE_API_KEY: str = Field("", env="OCR_SPACE_API_KEY")
    OCR_SPACE_ENGINE: int = Field(2, env="OCR_SPACE_ENGINE")
    OCR_SPACE_LANGUAGE: str = Field("eng", env="OCR_SPACE_LANGUAGE")

    # ── Voyage AI ─────────────────────────────────────────────────────────────
    VOYAGE_API_KEY: str = Field(..., env="VOYAGE_API_KEY")
    VOYAGE_MODEL: str = Field("voyage-large-2", env="VOYAGE_MODEL")
    VOYAGE_BATCH_SIZE: int = Field(128, env="VOYAGE_BATCH_SIZE")

    EMBEDDING_MODEL: str = Field("voyage-large-2", env="EMBEDDING_MODEL")
    EMBEDDING_BATCH_SIZE: int = Field(128, env="EMBEDDING_BATCH_SIZE")
    EMBEDDING_DEVICE: str = Field("cpu", env="EMBEDDING_DEVICE")
    MODEL_CACHE_DIR: str = Field("./data/models", env="MODEL_CACHE_DIR")

    EXPORT_TIMEOUT: int = Field(60, env="EXPORT_TIMEOUT")
    EXPORT_MAX_PAGE_SIZE: int = Field(50, env="EXPORT_MAX_PAGE_SIZE")

    WORKER_CONCURRENCY: int = Field(4, env="WORKER_CONCURRENCY")
    WORKER_QUEUE: str = Field("default", env="WORKER_QUEUE")
    WORKER_RESULT_TTL: int = Field(3600, env="WORKER_RESULT_TTL")

    CORS_ORIGINS: Union[str, List[str]] = Field(
        default="http://localhost:5173,http://localhost:5000",
        env="CORS_ORIGINS"
    )

    ENABLE_METRICS: bool = Field(True, env="ENABLE_METRICS")
    METRICS_PORT: int = Field(9090, env="METRICS_PORT")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        for directory in [
            self.UPLOAD_DIR, self.TEMP_DIR, self.OUTPUT_DIR,
            self.MODEL_CACHE_DIR, os.path.join(self.TEMP_DIR, "logs")
        ]:
            os.makedirs(directory, exist_ok=True)


settings = Settings()