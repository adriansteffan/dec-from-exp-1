#!/usr/bin/env python3
import csv
import os
import sys
import argparse


def find_participant_dirs(data_dir):
    """Return participant directories that contain .webm audio files."""
    dirs = []
    for entry in sorted(os.listdir(data_dir)):
        full = os.path.join(data_dir, entry)
        if not os.path.isdir(full):
            continue
        if any(f.endswith(".webm") for f in os.listdir(full)):
            dirs.append(full)
    return dirs


def find_audio_files(participant_dir):
    return sorted(
        os.path.join(participant_dir, f)
        for f in os.listdir(participant_dir)
        if f.endswith(".webm")
    )


def transcribe_faster_whisper(audio_files, model):
    results = []
    for path in audio_files:
        print(f"  transcribing: {os.path.basename(path)}")
        segments, _ = model.transcribe(path, language="en")
        text = " ".join(segment.text.strip() for segment in segments)
        results.append((os.path.basename(path), text))
    return results


def transcribe_qwen_asr(audio_files, model):
    print(f"  batching {len(audio_files)} file(s)")
    out = model.transcribe(audio=audio_files)
    results = []
    for path, result in zip(audio_files, out):
        results.append((os.path.basename(path), result.text.strip()))
    return results


def write_csv(participant_dir, rows):
    session_id = os.path.basename(participant_dir)
    csv_path = os.path.join(participant_dir, f"transcriptions.{session_id}.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["filename", "text"])
        writer.writerows(rows)
    print(f"  wrote: {csv_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe audio recordings from experiment data."
    )
    parser.add_argument(
        "--data-dir",
        default=os.environ.get("DATA_DIR", "/data"),
        help="Path to data directory (default: /data or $DATA_DIR)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Override the model name (default depends on backend)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-transcribe even if transcriptions.csv already exists",
    )
    parser.add_argument(
        "--backend",
        choices=["faster-whisper", "qwen-asr"],
        default=None,
        help="Force a specific backend (auto-detected if omitted)",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.data_dir):
        print(f"Error: data directory not found: {args.data_dir}", file=sys.stderr)
        sys.exit(1)

    participant_dirs = find_participant_dirs(args.data_dir)
    if not participant_dirs:
        print("No participant directories with audio files found.")
        sys.exit(0)

    backend = args.backend
    if backend is None:
        try:
            import faster_whisper  # noqa: F401

            backend = "faster-whisper"
        except ImportError:
            pass
    if backend is None:
        try:
            import qwen_asr  # noqa: F401

            backend = "qwen-asr"
        except ImportError:
            pass
    if backend is None:
        print(
            "Error: no backend available. Install faster-whisper or qwen-asr.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Load model
    if backend == "faster-whisper":
        from faster_whisper import WhisperModel

        model_name = args.model or "large-v3-turbo"
        print(f"Loading faster-whisper model: {model_name} (int8, cpu)")
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        transcribe_fn = transcribe_faster_whisper
    else:
        import torch
        from qwen_asr import Qwen3ASRModel

        model_name = args.model or "Qwen/Qwen3-ASR-1.7B"
        print(f"Loading Qwen3-ASR model: {model_name} (bfloat16, cuda)")
        model = Qwen3ASRModel.from_pretrained(
            model_name, dtype=torch.bfloat16, device_map="cuda:0"
        )
        transcribe_fn = transcribe_qwen_asr

    print(f"Backend: {backend}")
    print(f"Processing {len(participant_dirs)} participant(s)\n")

    for pdir in participant_dirs:
        participant_id = os.path.basename(pdir)

        has_transcription = any(
            f.startswith("transcriptions.") and f.endswith(".csv")
            for f in os.listdir(pdir)
        )
        if has_transcription and not args.overwrite:
            print(f"[{participant_id}] skip (transcription exists)")
            continue

        audio_files = find_audio_files(pdir)
        if not audio_files:
            print(f"[{participant_id}] no audio files")
            continue

        print(f"[{participant_id}] {len(audio_files)} file(s)")
        rows = transcribe_fn(audio_files, model)
        write_csv(pdir, rows)

    print("\nDone.")


if __name__ == "__main__":
    main()
