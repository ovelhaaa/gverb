class GverbProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const state = options.processorOptions;
    this.module = state.module;
    this.handle = this.module._gverb_create(sampleRate, 30, 3, 0.5, 15, 0.9, 0.3, 0.5);

    this.blockSize = 128;
    this.ptrIn = this.module._malloc(this.blockSize * 4);
    this.ptrL = this.module._malloc(this.blockSize * 4);
    this.ptrR = this.module._malloc(this.blockSize * 4);

    this.paramMap = {
      roomsize: this.module._gverb_set_roomsize,
      revtime: this.module._gverb_set_revtime,
      damping: this.module._gverb_set_damping,
      inputbandwidth: this.module._gverb_set_inputbandwidth,
      earlylevel: this.module._gverb_set_earlylevel,
      taillevel: this.module._gverb_set_taillevel,
    };

    this.port.onmessage = (ev) => {
      const { type, name, value } = ev.data;
      if (type === 'param' && this.paramMap[name]) this.paramMap[name](this.handle, value);
      if (type === 'reset') this.module._gverb_reset(this.handle);
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const inMono = input && input[0] ? input[0] : null;
    const outL = output[0];
    const outR = output[1] || output[0];

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
