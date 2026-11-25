#!/usr/bin/env bash
# Converts raw phone/laptop recordings (wav, m4a, mp3, ogg, ...) into the same format the browser's
# MediaRecorder produces (WebM/Opus, mono, 48 kHz), so the evaluation exercises the real input path.
#
# Usage: bash scripts/eval/prepare_audio.sh <raw_dir> <out_dir>
#   e.g. bash scripts/eval/prepare_audio.sh scripts/eval/raw scripts/eval/clips
# Each raw file keeps its base name: raw/c001.m4a -> clips/c001.webm
set -euo pipefail
RAW="${1:?raw dir}"; OUT="${2:?out dir}"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required"; exit 1; }
mkdir -p "$OUT"
shopt -s nullglob nocaseglob
for f in "$RAW"/*.{wav,m4a,mp3,ogg,opus,aac,webm,3gp}; do
  base="$(basename "${f%.*}")"
  ffmpeg -hide_banner -loglevel error -y -i "$f" -ac 1 -ar 48000 -c:a libopus -b:a 32k "$OUT/$base.webm"
  bytes=$(wc -c < "$OUT/$base.webm")
  if [ "$bytes" -lt 1000 ]; then echo "WARNING: $base.webm is only $bytes bytes (below MIN_AUDIO_BYTES)"; fi
  echo "ok  $base.webm ($bytes bytes)"
done
