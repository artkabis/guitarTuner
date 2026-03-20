"""
StemStudio — FastAPI backend
Endpoints:
  POST   /separate
  GET    /status/{job_id}
  POST   /enhance
  GET    /download/{job_id}/{stem}
  DELETE /job/{job_id}
  GET    /health
"""

import asyncio
import json
import logging
import os
import shutil
import uuid
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import aiofiles
from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
TMP_ROOT = Path(os.getenv("TMP_ROOT", "/tmp/stemstudio"))
MAX_JOB_AGE_HOURS = int(os.getenv("MAX_JOB_AGE_HOURS", "1"))
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100 MB
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stemstudio")

# ---------------------------------------------------------------------------
# In-memory job store  { job_id: JobRecord }
# ---------------------------------------------------------------------------
jobs: dict[str, dict] = {}

# ProcessPoolExecutor so demucs doesn't block the event loop
_executor = ProcessPoolExecutor(max_workers=2)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="StemStudio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class EnhanceRequest(BaseModel):
    job_id: str
    denoise: float = 0.8
    reverb: str = "none"


# ---------------------------------------------------------------------------
# Background cleanup task
# ---------------------------------------------------------------------------
async def _cleanup_old_jobs() -> None:
    """Remove jobs older than MAX_JOB_AGE_HOURS every 15 minutes."""
    while True:
        await asyncio.sleep(15 * 60)
        cutoff = datetime.utcnow() - timedelta(hours=MAX_JOB_AGE_HOURS)
        stale = [
            jid
            for jid, job in list(jobs.items())
            if datetime.fromisoformat(job["created_at"]) < cutoff
        ]
        for jid in stale:
            _delete_job(jid)
            logger.info("Auto-cleaned job %s", jid)


def _delete_job(job_id: str) -> None:
    job_dir = TMP_ROOT / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    jobs.pop(job_id, None)


@app.on_event("startup")
async def startup() -> None:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    asyncio.create_task(_cleanup_old_jobs())


# ---------------------------------------------------------------------------
# Helper: run demucs in process pool
# ---------------------------------------------------------------------------
def _run_separate(
    input_path: str,
    output_dir: str,
    stems: list[str],
    model: str,
) -> dict[str, str]:
    """Executed in a separate process to avoid blocking the event loop."""
    from processor import separate_stems  # noqa: PLC0415

    return separate_stems(input_path, output_dir, stems, model)


def _run_enhance(
    vocals_path: str,
    output_path: str,
    denoise: float,
) -> str:
    from processor import enhance_vocals  # noqa: PLC0415

    return enhance_vocals(vocals_path, output_path, denoise)


# ---------------------------------------------------------------------------
# Background processing coroutine
# ---------------------------------------------------------------------------
async def _process_job(
    job_id: str,
    input_path: str,
    stems: list[str],
    quality: int,
) -> None:
    loop = asyncio.get_running_loop()
    output_dir = str(TMP_ROOT / job_id / "stems")
    model = "htdemucs"  # quality mapping could swap models in the future

    jobs[job_id]["status"] = "processing"
    jobs[job_id]["progress"] = 5

    try:
        stem_paths: dict[str, str] = await loop.run_in_executor(
            _executor,
            _run_separate,
            input_path,
            output_dir,
            stems,
            model,
        )

        jobs[job_id]["stems"] = list(stem_paths.keys())
        jobs[job_id]["stem_paths"] = stem_paths
        jobs[job_id]["status"] = "done"
        jobs[job_id]["progress"] = 100
        logger.info("Job %s done, stems: %s", job_id, list(stem_paths.keys()))

    except Exception as exc:  # noqa: BLE001
        logger.exception("Job %s failed: %s", job_id, exc)
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(exc)
        jobs[job_id]["progress"] = 0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/separate")
async def separate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    stems: str = Form('["vocals","guitar","bass","drums"]'),
    quality: int = Form(2),
) -> dict:
    """
    Upload an audio file and start stem separation.

    - **file**: audio file (mp3, wav, flac, ogg, m4a, aac) — max 100 MB
    - **stems**: JSON array of stems to extract
    - **quality**: 1=fast, 2=normal, 3=high (currently all use htdemucs)

    Returns a `job_id` to poll `/status/{job_id}`.

    **Note on guitar**: htdemucs does not produce an isolated guitar stem.
    'guitar' is mapped to the 'other' stem (guitar + synths + misc instruments).
    """
    # Validate extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    # Parse stems
    try:
        stem_list: list[str] = json.loads(stems)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="stems must be a valid JSON array")

    valid_stems = {"vocals", "guitar", "bass", "drums", "other"}
    invalid = set(stem_list) - valid_stems
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown stems: {invalid}. Valid: {valid_stems}",
        )

    # Read & size-check
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )

    job_id = str(uuid.uuid4())
    job_dir = TMP_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    input_path = job_dir / f"input{suffix}"
    async with aiofiles.open(input_path, "wb") as f:
        await f.write(content)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "stems": [],
        "stem_paths": {},
        "created_at": datetime.utcnow().isoformat(),
        "input_path": str(input_path),
        "enhanced_stems": {},
    }

    background_tasks.add_task(
        _process_job, job_id, str(input_path), stem_list, quality
    )

    return {"job_id": job_id, "status": "processing"}


@app.get("/status/{job_id}")
async def get_status(job_id: str) -> dict:
    """Poll processing status for a job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job.get("progress", 0),
        "stems": job.get("stems", []),
        "error": job.get("error"),
    }


@app.post("/enhance")
async def enhance(req: EnhanceRequest, background_tasks: BackgroundTasks) -> dict:
    """
    Apply DeepFilterNet noise reduction to the vocals stem of a completed job.

    - **job_id**: ID of a completed separation job that includes 'vocals'
    - **denoise**: noise reduction strength (0.0 = none, 1.0 = maximum)
    - **reverb**: reserved for future reverb removal (currently unused)
    """
    if req.job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[req.job_id]
    if job["status"] != "done":
        raise HTTPException(
            status_code=400,
            detail=f"Job is not done yet (status={job['status']})",
        )

    vocals_path = job["stem_paths"].get("vocals")
    if not vocals_path or not Path(vocals_path).exists():
        raise HTTPException(
            status_code=400,
            detail="No vocals stem available for this job",
        )

    enhanced_path = str(TMP_ROOT / req.job_id / "stems" / "vocals_enhanced.wav")

    loop = asyncio.get_running_loop()

    async def _do_enhance() -> None:
        try:
            await loop.run_in_executor(
                _executor, _run_enhance, vocals_path, enhanced_path, req.denoise
            )
            jobs[req.job_id]["enhanced_stems"]["vocals"] = enhanced_path
            jobs[req.job_id]["stems_enhanced"] = True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Enhancement failed for job %s: %s", req.job_id, exc)

    background_tasks.add_task(_do_enhance)

    enhanced_url = f"/download/{req.job_id}/vocals_enhanced"
    return {"job_id": req.job_id, "enhanced_url": enhanced_url}


@app.get("/download/{job_id}/{stem}")
async def download(job_id: str, stem: str) -> FileResponse:
    """
    Download a separated (or enhanced) stem WAV file.

    **stem** can be: vocals, guitar, bass, drums, other, vocals_enhanced
    """
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    # Check enhanced stems first
    if stem == "vocals_enhanced":
        path = job.get("enhanced_stems", {}).get("vocals")
        if not path or not Path(path).exists():
            raise HTTPException(
                status_code=404, detail="Enhanced vocals not ready yet"
            )
        return FileResponse(
            path,
            media_type="audio/wav",
            filename=f"{job_id}_vocals_enhanced.wav",
        )

    path = job.get("stem_paths", {}).get(stem)
    if not path or not Path(path).exists():
        raise HTTPException(
            status_code=404,
            detail=f"Stem '{stem}' not found. Available: {list(job.get('stems', []))}",
        )

    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"{job_id}_{stem}.wav",
    )


@app.delete("/job/{job_id}")
async def delete_job(job_id: str) -> dict:
    """Delete a job and all its temporary files."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    _delete_job(job_id)
    return {"deleted": True}


@app.get("/health")
async def health() -> dict:
    """Health check — verifies demucs and deepfilter are importable."""
    demucs_ok = False
    deepfilter_ok = False

    try:
        import demucs  # noqa: F401

        demucs_ok = True
    except ImportError:
        pass

    try:
        import df  # noqa: F401

        deepfilter_ok = True
    except ImportError:
        pass

    return {
        "status": "ok",
        "demucs": demucs_ok,
        "deepfilter": deepfilter_ok,
    }
