#include <stdlib.h>
#include <emscripten/emscripten.h>
#include "../../include/gverb.h"

typedef struct {
  ty_gverb *engine;
  int sample_rate;
} GVerbHandle;

EMSCRIPTEN_KEEPALIVE
GVerbHandle* gverb_create(int sample_rate,
                          float roomsize,
                          float revtime,
                          float damping,
                          float spread,
                          float inputbandwidth,
                          float earlylevel,
                          float taillevel) {
  GVerbHandle *h = (GVerbHandle*)calloc(1, sizeof(GVerbHandle));
  if (!h) return NULL;

  h->sample_rate = sample_rate;
  h->engine = gverb_new(sample_rate,
                        300.0f,
                        roomsize,
                        revtime,
                        damping,
                        spread,
                        inputbandwidth,
                        earlylevel,
                        taillevel);
  if (!h->engine) {
    free(h);
    return NULL;
  }

  return h;
}

EMSCRIPTEN_KEEPALIVE
void gverb_destroy(GVerbHandle *h) {
  if (!h) return;
  if (h->engine) gverb_free(h->engine);
  free(h);
}

EMSCRIPTEN_KEEPALIVE
void gverb_reset(GVerbHandle *h) {
  if (!h || !h->engine) return;
  gverb_flush(h->engine);
}

EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_roomsize(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_roomsize(h->engine, v); }
EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_revtime(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_revtime(h->engine, v); }
EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_damping(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_damping(h->engine, v); }
EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_inputbandwidth(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_inputbandwidth(h->engine, v); }
EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_earlylevel(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_earlylevel(h->engine, v); }
EMSCRIPTEN_KEEPALIVE
void gverb_handle_set_taillevel(GVerbHandle *h, float v) { if (h && h->engine) gverb_set_taillevel(h->engine, v); }

EMSCRIPTEN_KEEPALIVE
void gverb_process(GVerbHandle *h,
                   const float *input,
                   float *out_l,
                   float *out_r,
                   int frames) {
  if (!h || !h->engine || !input || !out_l || !out_r || frames <= 0) return;

  for (int i = 0; i < frames; i++) {
    float yl = 0.0f;
    float yr = 0.0f;
    gverb_do(h->engine, input[i], &yl, &yr);
    out_l[i] = yl;
    out_r[i] = yr;
  }
}
