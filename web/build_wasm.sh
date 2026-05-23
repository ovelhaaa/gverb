#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/web/public"

mkdir -p "$OUT_DIR"

emcc \
  "$ROOT_DIR/web/src/gverb_wasm.c" \
  "$ROOT_DIR/src/gverb.c" \
  "$ROOT_DIR/src/gverbdsp.c" \
  -I"$ROOT_DIR/include" \
  -O3 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web,worker \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s SINGLE_FILE=1 \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_gverb_create","_gverb_destroy","_gverb_reset","_gverb_handle_set_roomsize","_gverb_handle_set_revtime","_gverb_handle_set_damping","_gverb_handle_set_inputbandwidth","_gverb_handle_set_earlylevel","_gverb_handle_set_taillevel","_gverb_process"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","HEAPF32"]' \
  -o "$OUT_DIR/gverb_wasm.js"

echo "WASM build concluído em $OUT_DIR"
