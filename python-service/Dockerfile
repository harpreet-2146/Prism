# python-service/Dockerfile

FROM python:3.11-slim

# ✅ REMOVED: Tesseract installation (not needed anymore!)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    g++ \
    wget \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download models (EasyOCR + Embeddings)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
RUN python -c "import easyocr; easyocr.Reader(['en'], download_enabled=True)"

COPY . .

RUN mkdir -p \
    /app/data/uploads \
    /app/data/temp \
    /app/data/outputs \
    /app/data/models \
    /app/data/logs

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]