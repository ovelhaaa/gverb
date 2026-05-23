import createModule from './gverb_wasm.js';

class GverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.module = null;
    this.handle = 0;

    this.blockSize = 128;
    this.ptrIn = 0;
    this.ptrL = 0;
    this.ptrR = 0;

    this.pendingParams = {
      roomsize: 30,
      revtime: 3,
      damping: 0.5,
      inputbandwidth: 0.9,
      earlylevel: 0.3,
      taillevel: 0.5,
    };

    this.port.onmessage = (ev) => {
      const { type, name, value } = ev.data;
      if (type === 'param' && typeof value === 'number') {
        this.pendingParams[name] = value;
        this.applyParam(name, value);
      }
      if (type === 'reset' && this.module && this.handle) {
        this.module._gverb_reset(this.handle);
      }
    };

    this.initPromise = this.init();
  }

  async init() {
    try {
      this.module = await createModule();
      this.handle = this.module._gverb_create(sampleRate, 30, 3, 0.5, 15, 0.9, 0.3, 0.5);
      this.ptrIn = this.module._malloc(this.blockSize * 4);
      this.ptrL = this.module._malloc(this.blockSize * 4);
      this.ptrR = this.module._malloc(this.blockSize * 4);

      if (!this.handle || !this.ptrIn || !this.ptrL || !this.ptrR) {
        throw new Error('Failed to allocate WASM resources');
      }

      Object.entries(this.pendingParams).forEach(([name, value]) => this.applyParam(name, value));
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: String(err) });
    }
  }

  applyParam(name, value) {
    if (!this.module || !this.handle) return;
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

    if (!this.module || !this.handle) {
      outL.fill(0);
      outR.fill(0);
      return true;
    }

    const inMono = input && input[0] ? input[0] : null;
    const heap = this.module.HEAPF32;
    const inIdx = this.ptrIn >> 2;
    const lIdx = this.ptrL >> 2;
    const rIdx = this.ptrR >> 2;

    for (let i = 0; i < outL.length; i++) heap[inIdx + i] = inMono ? inMono[i] : 0;

    this.module._gverb_process(this.handle, this.ptrIn, this.ptrL, this.ptrR, outL.length);

    for (let i = 0; i < outL.length; i++) {
      outL[i] = heap[lIdx + i];
      outR[i] = heap[rIdx + i];
    }

    return true;
  }
}

registerProcessor('gverb-processor', GverbProcessor);
