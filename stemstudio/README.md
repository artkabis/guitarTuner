# 🎚 StemStudio

[![Deploy Backend](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy-backend.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy-backend.yml)
[![Deploy Frontend](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy-frontend.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy-frontend.yml)

> AI-powered audio stem separation — vocals, bass, drums & more.
> Built with [Demucs (htdemucs)](https://github.com/facebookresearch/demucs) and [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet).

---

## Features

- Upload audio (MP3, WAV, FLAC, OGG, M4A, AAC — max 100 MB) or record directly from the microphone
- Separate audio into up to 4 stems: **vocals**, **bass**, **drums**, **guitar\***
- Optional **voice enhancement** (DeepFilter noise reduction)
- Waveform visualisation and in-browser playback (WaveSurfer.js)
- Download individual stems as 16-bit WAV

> **\*Guitar note:** `htdemucs` produces exactly 4 stems: `vocals`, `bass`, `drums`, and `other`.
> The *guitar* stem is mapped to the `other` track, which contains guitar, synths, and all remaining instruments.
> There is no isolated guitar stem in this model.

---

## Server requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4 GB | **8 GB** (htdemucs is memory-hungry) |
| CPU | 4 cores | 8+ cores |
| Disk | 10 GB | 20 GB (Docker image ~2 GB, model ~1.5 GB) |
| GPU | — | CUDA-compatible (for faster inference) |

---

## Deployment

### 1. Configure GitHub Secrets & Variables

Go to **Settings > Secrets and variables > Actions** in your repository.

#### Secrets (sensitive)

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not your password) |
| `SERVER_HOST` | VPS IP / hostname *(optional, for SSH auto-deploy)* |
| `SERVER_USER` | VPS SSH username *(optional)* |
| `SSH_PRIVATE_KEY` | SSH private key *(optional)* |

#### Variables (non-sensitive)

| Variable | Example |
|----------|---------|
| `BACKEND_URL` | `https://your-vps.example.com:8000` |

---

### 2. Backend — Docker Hub + VPS

The backend workflow (`.github/workflows/deploy-backend.yml`) triggers on every push to `main` that touches `stemstudio/backend/**`.

It:
1. Builds the Docker image (with htdemucs model pre-cached, ~1.5 GB)
2. Pushes to Docker Hub as `{DOCKERHUB_USERNAME}/stemstudio-backend:latest`
3. *(Optional)* SSH-deploys to your VPS — uncomment the SSH step in the workflow

**Manual VPS deployment:**

```bash
# Pull and run the latest image on your VPS
docker pull YOUR_DOCKERHUB_USERNAME/stemstudio-backend:latest

docker stop stemstudio || true
docker rm stemstudio || true

docker run -d \
  --name stemstudio \
  -p 8000:8000 \
  -v /tmp/stemstudio:/tmp/stemstudio \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USERNAME/stemstudio-backend:latest
```

**Verify health:**

```bash
curl http://YOUR_VPS_IP:8000/health
# {"status":"ok","demucs":true,"deepfilter":true}
```

---

### 3. Frontend — GitHub Pages

The frontend workflow (`.github/workflows/deploy-frontend.yml`) triggers on every push to `main` that touches `stemstudio/frontend/**`.

It:
1. Replaces the `__API_BASE__` placeholder in `index.html` with your `BACKEND_URL` variable
2. Pushes the result to the `gh-pages` branch

Enable GitHub Pages:
**Settings > Pages > Source: Deploy from branch `gh-pages`**

Your app will be live at:
`https://YOUR_USERNAME.github.io/YOUR_REPO/`

---

## Local Development

### Prerequisites

- Docker & Docker Compose
- (Optional) Python 3.11+ for running the backend without Docker

### Quick start with Docker Compose

```bash
cd stemstudio
docker-compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

> **Note:** The first build downloads the htdemucs model (~1.5 GB). Subsequent builds use the Docker layer cache.

### Running the backend without Docker

```bash
cd stemstudio/backend

# Install system dependencies (Ubuntu/Debian)
sudo apt install -y ffmpeg sox libsox-dev

# Create a virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

# Pre-download the model (one-time, ~1.5 GB)
python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/separate` | Upload audio & start stem separation |
| `GET` | `/status/{job_id}` | Poll job progress |
| `POST` | `/enhance` | Apply DeepFilter to vocals |
| `GET` | `/download/{job_id}/{stem}` | Download a stem WAV |
| `DELETE` | `/job/{job_id}` | Delete job & temp files |
| `GET` | `/health` | Health check |

Full interactive docs: `http://localhost:8000/docs`

---

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `TMP_ROOT` | `/tmp/stemstudio` | Directory for temporary job files |
| `MAX_JOB_AGE_HOURS` | `1` | Auto-delete jobs older than this many hours |

---

## Architecture

```
stemstudio/
├── .github/
│   └── workflows/
│       ├── deploy-backend.yml   # Build & push Docker image
│       └── deploy-frontend.yml  # Push to gh-pages
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                  # FastAPI application
│   ├── processor.py             # Demucs + DeepFilter logic
│   └── .env.example
├── frontend/
│   └── index.html               # Pure HTML/CSS/JS app (WaveSurfer.js)
└── docker-compose.yml           # Local development
```

---

## Limitations

- **4-stem model:** htdemucs separates into `vocals`, `bass`, `drums`, `other`. Guitar is not isolated.
- **Processing time:** 2–5 minutes per track depending on length and hardware.
- **Memory:** ~4 GB RAM consumed during inference. Minimum 8 GB recommended on the server.
- **Concurrent jobs:** Default configuration runs 2 parallel jobs (ProcessPoolExecutor). Adjust `max_workers` in `main.py` based on available RAM.
- **Temporary storage:** Job files are auto-deleted after 1 hour. Download your stems promptly.

---

## License

MIT
