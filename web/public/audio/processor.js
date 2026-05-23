import createModule from '../gverb_wasm.js';

class GverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.handle = 0;

    this.ptrIn = 0;
    this.ptrL = 0;
    this.ptrR = 0;
    this.allocatedFrames = 0;

    this.paramsState = {
      roomsize: 30,
      revtime: 3,
      damping: 0.5,
      inputbandwidth: 0.9,
      earlylevel: 0.3,
      taillevel: 0.5,
      bypass: 0,
    };

    this.port.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'param' && typeof msg.name === 'string') {
        this.paramsState[msg.name] = msg.value;
        this.applyParam(msg.name, msg.value);
      } else if (msg.type === 'batch' && msg.values && typeof msg.values === 'object') {
        Object.entries(msg.values).forEach(([name, value]) => {
          this.paramsState[name] = value;
          this.applyParam(name, value);
        });
      } else if (msg.type === 'reset' && this.module && this.handle) {
        this.module._gverb_reset(this.handle);
      }
    };

    this.initWasm();
  }

  async initWasm() {
    try {
      this.module = await createModule();
      this.handle = this.module._gverb_create(sampleRate, 30, 3, 0.5, 15, 0.9, 0.3, 0.5);
      if (!this.handle) throw new Error('gverb_create falhou');
      Object.entries(this.paramsState).forEach(([k, v]) => this.applyParam(k, v));
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: String(error) });
    }
  }

  ensureHeapForFrames(frameCount) {
    if (!this.module || frameCount <= this.allocatedFrames) return;
    if (this.ptrIn) this.module._free(this.ptrIn);
    if (this.ptrL) this.module._free(this.ptrL);
    if (this.ptrR) this.module._free(this.ptrR);

    this.ptrIn = this.module._malloc(frameCount * 4);
    this.ptrL = this.module._malloc(frameCount * 4);
    this.ptrR = this.module._malloc(frameCount * 4);
    this.allocatedFrames = frameCount;

    if (!this.ptrIn || !this.ptrL || !this.ptrR) {
      throw new Error('Falha ao alocar buffers WASM');
    }
  }

  applyParam(name, value) {
    if (!this.module || !this.handle || name === 'bypass') return;
    if (name === 'roomsize') this.module._gverb_handle_set_roomsize(this.handle, value);
    else if (name === 'revtime') this.module._gverb_handle_set_revtime(this.handle, value);
    else if (name === 'damping') this.module._gverb_handle_set_damping(this.handle, value);
    else if (name === 'inputbandwidth') this.module._gverb_handle_set_inputbandwidth(this.handle, value);
    else if (name === 'earlylevel') this.module._gverb_handle_set_earlylevel(this.handle, value);
    else if (name === 'taillevel') this.module._gverb_handle_set_taillevel(this.handle, value);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const outL = output[0];
    const outR = output[1] || output[0];
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    const frames = outL.length;

    if (!this.module || !this.handle || this.paramsState.bypass >= 0.5) {
      for (let i = 0; i < frames; i++) {
        outL[i] = inL ? inL[i] : 0;
        outR[i] = inR ? inR[i] : outL[i];
      }
      return true;
    }

    try {
      this.ensureHeapForFrames(frames);
    } catch (error) {
      this.port.postMessage({ type: 'error', message: String(error) });
      outL.fill(0);
      outR.fill(0);
      return true;
    }

    const heap = this.module.HEAPF32;
    const inIdx = this.ptrIn >> 2;
    const lIdx = this.ptrL >> 2;
    const rIdx = this.ptrR >> 2;

    for (let i = 0; i < frames; i++) {
      const left = inL ? inL[i] : 0;
      const right = inR ? inR[i] : left;
      heap[inIdx + i] = (left + right) * 0.5;
    }

    this.module._gverb_process(this.handle, this.ptrIn, this.ptrL, this.ptrR, frames);

    for (let i = 0; i < frames; i++) {
      outL[i] = heap[lIdx + i];
      outR[i] = heap[rIdx + i];
    }

    return true;
  }
}

registerProcessor('gverb-processor', GverbProcessor);
