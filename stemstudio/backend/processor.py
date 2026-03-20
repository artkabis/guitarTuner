"""
StemStudio audio processor.

Stem mapping for htdemucs (4-stem model):
  - vocals  → vocals
  - guitar  → other  (htdemucs has no dedicated guitar stem)
  - bass    → bass
  - drums   → drums

The 'other' stem contains all non-vocal, non-bass, non-drum content
(guitar, synths, etc.). This is a limitation of the htdemucs model.
"""

import os
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# htdemucs produces these 4 stems
DEMUCS_STEMS = {"vocals", "bass", "drums", "other"}

# Map requested stems to demucs output stems
STEM_MAP = {
    "vocals": "vocals",
    "guitar": "other",   # guitar is bundled in 'other'
    "bass": "bass",
    "drums": "drums",
    "other": "other",
}


def separate_stems(
    input_path: str,
    output_dir: str,
    stems: list[str],
    model: str = "htdemucs",
) -> dict[str, str]:
    """
    Run demucs separation in a subprocess.

    Args:
        input_path: Path to the input audio file.
        output_dir: Directory where separated stems will be placed.
        stems: List of requested stem names (vocals, guitar, bass, drums).
        model: Demucs model name (default: htdemucs).

    Returns:
        dict mapping stem_name → absolute path to WAV file.

    Note:
        'guitar' is mapped to the 'other' demucs stem because htdemucs
        does not produce an isolated guitar track.
    """
    input_path = str(input_path)
    output_dir = str(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    # Determine which demucs stems we actually need
    needed_demucs_stems = set()
    for stem in stems:
        mapped = STEM_MAP.get(stem)
        if mapped:
            needed_demucs_stems.add(mapped)

    logger.info(
        "Running demucs model=%s on %s, stems=%s",
        model,
        input_path,
        needed_demucs_stems,
    )

    cmd = [
        "python",
        "-m",
        "demucs",
        "--name",
        model,
        "--out",
        output_dir,
        "--filename",
        "{stem}.wav",
        input_path,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 min max
    )

    if result.returncode != 0:
        logger.error("demucs stderr: %s", result.stderr)
        raise RuntimeError(f"demucs failed: {result.stderr[-500:]}")

    logger.info("demucs stdout: %s", result.stdout[-200:])

    # demucs writes to output_dir/<model>/<track_name>/{stem}.wav
    # Find the output directory
    track_name = Path(input_path).stem
    demucs_out = Path(output_dir) / model / track_name

    if not demucs_out.exists():
        # Fallback: search recursively
        candidates = list(Path(output_dir).rglob("vocals.wav"))
        if candidates:
            demucs_out = candidates[0].parent
        else:
            raise RuntimeError(
                f"demucs output not found under {output_dir}"
            )

    # Build result mapping requested_stem → file path
    result_paths: dict[str, str] = {}
    for stem in stems:
        demucs_stem = STEM_MAP.get(stem, stem)
        wav_path = demucs_out / f"{demucs_stem}.wav"
        if wav_path.exists():
            result_paths[stem] = str(wav_path)
        else:
            logger.warning("Expected stem file not found: %s", wav_path)

    return result_paths


def enhance_vocals(
    vocals_path: str,
    output_path: str,
    denoise_strength: float = 0.8,
) -> str:
    """
    Apply DeepFilterNet noise reduction to a vocals track.

    Args:
        vocals_path: Path to the input vocals WAV.
        output_path: Path to write the enhanced WAV.
        denoise_strength: Noise reduction aggressiveness (0.0–1.0).

    Returns:
        Path to the enhanced WAV file.
    """
    from df.enhance import enhance, init_df, load_audio, save_audio  # type: ignore

    logger.info(
        "Enhancing vocals: %s → %s (strength=%.2f)",
        vocals_path,
        output_path,
        denoise_strength,
    )

    model, df_state, _ = init_df()
    audio, _ = load_audio(vocals_path, sr=df_state.sr())

    enhanced = enhance(model, df_state, audio, atten_lim_db=denoise_strength * 40)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    save_audio(output_path, enhanced, df_state.sr())

    logger.info("Enhancement complete: %s", output_path)
    return output_path
