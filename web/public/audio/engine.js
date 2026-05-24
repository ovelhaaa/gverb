export class Dimension5Engine {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.ctx = null;
    this.outputGain = null;
    this.worklet = null;
    this.buffer = null;
    this.source = null;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.loop = true;
    this.workletReady = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.outputGain = this.ctx.createGain();
      await this.ctx.audioWorklet.addModule('./audio/processor.js');
      this.worklet = new AudioWorkletNode(this.ctx, 'gverb-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCountMode: 'explicit',
        channelCount: 2,
        outputChannelCount: [2],
      });

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout aguardando inicialização do AudioWorklet'));
        }, 3000);

        const cleanup = () => {
          clearTimeout(timeoutId);
          this.worklet.port.onmessage = null;
        };

        this.worklet.port.onmessage = (ev) => {
          if (ev.data?.type === 'error') {
            this.onStatus(`Erro no worklet: ${ev.data.message}`);
            cleanup();
            reject(new Error(ev.data.message || 'Erro desconhecido no worklet'));
          }
          if (ev.data?.type === 'ready') {
            this.workletReady = true;
            this.onStatus('Motor de áudio pronto');
            cleanup();
            resolve();
          }
        };
      });

      this.worklet.connect(this.outputGain).connect(this.ctx.destination);
    })();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  stopSource() {
    if (!this.source) return;
    try { this.source.stop(); } catch {}
    try { this.source.disconnect(); } catch {}
    this.source = null;
  }

  async loadFile(file) {
    await this.init();
    this.stopSource();
    this.pausedAt = 0;

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
      this.pausedAt = 0;
    } catch (error) {
      this.stopSource();
      this.buffer = null;
      this.pausedAt = 0;
      throw error;
    }
  }

  setLoop(enabled) {
    this.loop = Boolean(enabled);
    if (this.source) this.source.loop = this.loop;
  }

  setVolume(value) { if (this.outputGain) this.outputGain.gain.value = Number(value); }
  setParam(name, value) { this.worklet?.port.postMessage({ type: 'param', name, value: Number(value) }); }
  setParams(values) { this.worklet?.port.postMessage({ type: 'batch', values }); }
  resetFx() { this.worklet?.port.postMessage({ type: 'reset' }); }

  currentPosition() {
    if (!this.source || !this.buffer) return this.pausedAt;
    return Math.min(this.buffer.duration, this.ctx.currentTime - this.startedAt);
  }

  play(offset = this.pausedAt) {
    if (!this.buffer || !this.worklet || !this.workletReady) return;
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.connect(this.worklet);
    src.start(0, Math.max(0, Math.min(offset, Math.max(0.00001, this.buffer.duration - 0.00001))));
    this.startedAt = this.ctx.currentTime - offset;
    this.source = src;
    src.onended = () => {
      if (this.source !== src || src.loop) return;
      this.pausedAt = 0;
      this.source = null;
    };
  }

  pause() {
    this.pausedAt = this.currentPosition();
    this.stopSource();
  }

  stop() {
    this.pausedAt = 0;
    this.stopSource();
    this.resetFx();
  }

  seek(seconds) {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(seconds, this.buffer.duration));
    const playing = Boolean(this.source);
    this.pausedAt = clamped;
    if (playing) this.play(clamped);
  }
}
