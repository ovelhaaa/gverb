import createModule from './gverb_wasm.js';

const els = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));
const params = [...document.querySelectorAll('[data-param]')];

const state = { ctx: null, srcNode: null, gain: null, worklet: null, buffer: null, startedAt: 0, pausedAt: 0, raf: 0 };

const fmt = (s) => `${String((s/60)|0).padStart(2,'0')}:${String((s%60)|0).padStart(2,'0')}`;

async function ensureAudio() {
  if (state.ctx) return;
  const module = await createModule();
  state.ctx = new AudioContext();
  state.gain = state.ctx.createGain();
  await state.ctx.audioWorklet.addModule('./gverb-worklet.js');
  state.worklet = new AudioWorkletNode(state.ctx, 'gverb-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module } });
  state.worklet.connect(state.gain).connect(state.ctx.destination);

  params.forEach((p) => p.addEventListener('input', () => {
    state.worklet.port.postMessage({ type: 'param', name: p.dataset.param, value: Number(p.value) });
  }));
}

function stopSource() { if (state.srcNode) { try { state.srcNode.stop(); } catch {} state.srcNode.disconnect(); state.srcNode = null; } }

function playFrom(offset = state.pausedAt || 0) {
  if (!state.buffer) return;
  stopSource();
  const src = state.ctx.createBufferSource();
  src.buffer = state.buffer;
  src.loop = els.loop.checked;
  src.playbackRate.value = Number(els.rate.value);
  src.connect(state.worklet);
  src.start(0, offset);
  state.startedAt = state.ctx.currentTime - offset / src.playbackRate.value;
  state.srcNode = src;
  src.onended = () => { if (!src.loop) state.pausedAt = 0; };
}

function currentPos() {
  if (!state.srcNode) return state.pausedAt;
  return Math.min(state.buffer.duration, (state.ctx.currentTime - state.startedAt) * state.srcNode.playbackRate.value);
}

function updateTime() {
  if (state.buffer) {
    const now = currentPos();
    els.seek.value = now / state.buffer.duration;
    els.time.textContent = `${fmt(now)} / ${fmt(state.buffer.duration)}`;
  }
  state.raf = requestAnimationFrame(updateTime);
}

els.file.addEventListener('change', async (e) => {
  await ensureAudio();
  const file = e.target.files?.[0];
  if (!file) return;
  const arr = await file.arrayBuffer();
  state.buffer = await state.ctx.decodeAudioData(arr.slice(0));
  state.pausedAt = 0;
  updateTime();
});
els.play.addEventListener('click', async () => { await ensureAudio(); await state.ctx.resume(); playFrom(state.pausedAt); });
els.pause.addEventListener('click', () => { if (!state.ctx || !state.srcNode) return; state.pausedAt = currentPos(); stopSource(); });
els.stop.addEventListener('click', () => { if (!state.ctx) return; state.pausedAt = 0; stopSource(); state.worklet?.port.postMessage({ type: 'reset' }); });
els.seek.addEventListener('input', () => { if (!state.buffer) return; state.pausedAt = Number(els.seek.value) * state.buffer.duration; if (state.srcNode) playFrom(state.pausedAt); });
els.rate.addEventListener('input', () => { if (state.srcNode) playFrom(currentPos()); });
els.volume.addEventListener('input', () => { if (state.gain) state.gain.gain.value = Number(els.volume.value); });

els.export.addEventListener('click', async () => {
  if (!state.buffer) return;
  const sr = state.buffer.sampleRate;
  const len = state.buffer.length;
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: sr });
  const module = await createModule();
  await off.audioWorklet.addModule('./gverb-worklet.js');
  const node = new AudioWorkletNode(off, 'gverb-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module } });
  params.forEach((p) => node.port.postMessage({ type: 'param', name: p.dataset.param, value: Number(p.value) }));
  const src = off.createBufferSource(); src.buffer = state.buffer; src.connect(node).connect(off.destination); src.start();
  const rendered = await off.startRendering();

  const wav = toWav(rendered);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gverb-processed.wav'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});

function toWav(buffer) {
  const ch0 = buffer.getChannelData(0), ch1 = buffer.getChannelData(1);
  const interleaved = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) { interleaved[i*2] = ch0[i]; interleaved[i*2+1] = ch1[i]; }
  const data = new DataView(new ArrayBuffer(44 + interleaved.length * 2));
  let o = 0; const w = (s) => { for (let i=0;i<s.length;i++) data.setUint8(o++, s.charCodeAt(i)); };
  w('RIFF'); data.setUint32(o, 36 + interleaved.length*2, true); o+=4; w('WAVEfmt ');
  data.setUint32(o, 16, true); o+=4; data.setUint16(o, 1, true); o+=2; data.setUint16(o, 2, true); o+=2;
  data.setUint32(o, buffer.sampleRate, true); o+=4; data.setUint32(o, buffer.sampleRate*4, true); o+=4; data.setUint16(o, 4, true); o+=2; data.setUint16(o, 16, true); o+=2;
  w('data'); data.setUint32(o, interleaved.length*2, true); o+=4;
  for (let i=0;i<interleaved.length;i++) { const s = Math.max(-1, Math.min(1, interleaved[i])); data.setInt16(o, s<0?s*0x8000:s*0x7fff, true); o+=2; }
  return data.buffer;
}
