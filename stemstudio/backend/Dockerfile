FROM python:3.11-slim

# System dependencies required by demucs and deepfilternet
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libsox-dev \
        sox \
        git \
        build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Install Python dependencies (this layer is cached unless requirements change)
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the htdemucs model at build time (~1.5 GB)
# This avoids a slow download on first runtime request.
# The model is cached in ~/.cache/torch/hub/checkpoints/
RUN python -c "\
import demucs; \
from demucs.pretrained import get_model; \
get_model('htdemucs'); \
print('htdemucs model cached successfully.')"

# Copy application source
COPY . .

EXPOSE 8000

# Run with uvicorn (single worker; scale with --workers if needed)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
