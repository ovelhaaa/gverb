const els = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));
const params = [...document.querySelectorAll('[data-param]')];
const paramValues = Object.fromEntries([...document.querySelectorAll('[data-param-value]')].map((el) => [el.dataset.paramValue, el]));

const state = { ctx: null, srcNode: null, gain: null, worklet: null, buffer: null, startedAt: 0, pausedAt: 0, raf: 0, isPlaying: false };
const fmt = (s) => `${String((s / 60) | 0).padStart(2, '0')}:${String((s % 60) | 0).padStart(2, '0')}`;

function setStatus(text) { els.status.textContent = text; }

async function ensureAudio() {
  if (state.ctx) return;
  state.ctx = new AudioContext();
  state.gain = state.ctx.createGain();
  await state.ctx.audioWorklet.addModule('./gverb-worklet.js');
  state.worklet = new AudioWorkletNode(state.ctx, 'gverb-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  state.worklet.connect(state.gain).connect(state.ctx.destination);
  params.forEach((p) => p.dispatchEvent(new Event('input')));
}

function stopSource() {
  if (!state.srcNode) return;
  try { state.srcNode.stop(); } catch {}
  state.srcNode.disconnect();
  state.srcNode = null;
  state.isPlaying = false;
  els.playpause.textContent = '▶️ Play';
}

function playFrom(offset = state.pausedAt || 0) {
  if (!state.buffer) return;
  stopSource();
  const src = state.ctx.createBufferSource();
  src.buffer = state.buffer;
  src.loop = els.repeat.checked;
  src.playbackRate.value = Number(els.rate.value);
  src.connect(state.worklet);
  src.start(0, Math.max(0, Math.min(offset, state.buffer.duration - 0.0001)));
  state.startedAt = state.ctx.currentTime - offset / src.playbackRate.value;
  state.srcNode = src;
  state.isPlaying = true;
  els.playpause.textContent = '⏸ Pause';
  setStatus('Reproduzindo');
  src.onended = () => {
    if (state.srcNode !== src) return;
    if (!src.loop) {
      state.pausedAt = 0;
      state.srcNode = null;
      state.isPlaying = false;
      els.playpause.textContent = '▶️ Play';
      setStatus('Finalizado');
    }
  };
}

function currentPos() {
  if (!state.srcNode) return state.pausedAt;
  return Math.min(state.buffer.duration, (state.ctx.currentTime - state.startedAt) * state.srcNode.playbackRate.value);
}

function seekTo(seconds, restart = true) {
  if (!state.buffer) return;
  state.pausedAt = Math.max(0, Math.min(seconds, state.buffer.duration));
  if (restart && state.isPlaying) playFrom(state.pausedAt);
  els.seek.value = state.pausedAt / state.buffer.duration;
}

function updateTime() {
  if (state.buffer) {
    const now = currentPos();
    els.seek.value = now / state.buffer.duration;
    els.time.textContent = `${fmt(now)} / ${fmt(state.buffer.duration)}`;
  }
  state.raf = requestAnimationFrame(updateTime);
}

requestAnimationFrame(updateTime);

els.file.addEventListener('change', async (e) => {
  await ensureAudio();
  const file = e.target.files?.[0];
  if (!file) return;
  els.filename.textContent = file.name;
  setStatus('Carregando...');
  const arr = await file.arrayBuffer();
  state.buffer = await state.ctx.decodeAudioData(arr.slice(0));
  state.pausedAt = 0;
  els.time.textContent = `00:00 / ${fmt(state.buffer.duration)}`;
  setStatus('Arquivo carregado');
});

els.playpause.addEventListener('click', async () => {
  if (!state.buffer) return;
  await ensureAudio();
  await state.ctx.resume();
  if (state.isPlaying) {
    state.pausedAt = currentPos();
    stopSource();
    setStatus('Pausado');
  } else {
    playFrom(state.pausedAt);
  }
});

els.stop.addEventListener('click', () => {
  if (!state.buffer) return;
  state.pausedAt = 0;
  stopSource();
  state.worklet?.port.postMessage({ type: 'reset' });
  els.seek.value = 0;
  setStatus('Parado');
});

els.seek.addEventListener('input', () => {
  if (!state.buffer) return;
  const previewPos = Number(els.seek.value) * state.buffer.duration;
  els.time.textContent = `${fmt(previewPos)} / ${fmt(state.buffer.duration)}`;
});

els.seek.addEventListener('change', () => {
  if (!state.buffer) return;
  seekTo(Number(els.seek.value) * state.buffer.duration);
});

els.rewind.addEventListener('click', () => seekTo(currentPos() - 10));
els.forward.addEventListener('click', () => seekTo(currentPos() + 10));

els.rate.addEventListener('input', () => {
  const val = Number(els.rate.value);
  els.rateValue.textContent = `${val.toFixed(2)}x`;
  if (state.srcNode) {
    const pos = currentPos();
    state.srcNode.playbackRate.value = val;
    state.startedAt = state.ctx.currentTime - pos / val;
  }
});

els.volume.addEventListener('input', () => {
  const vol = Number(els.volume.value);
  els.volumeValue.textContent = `${Math.round(vol * 100)}%`;
  if (state.gain) state.gain.gain.value = vol;
});

els.repeat.addEventListener('change', () => {
  if (state.srcNode) state.srcNode.loop = els.repeat.checked;
  setStatus(els.repeat.checked ? 'Repeat ativo' : 'Repeat inativo');
});

params.forEach((p) => p.addEventListener('input', () => {
  const value = Number(p.value);
  const out = paramValues[p.dataset.param];
  if (out) out.textContent = value.toFixed(3).replace(/\.0+$/, '.0').replace(/(\.\d*[1-9])0+$/, '$1');
  state.worklet?.port.postMessage({ type: 'param', name: p.dataset.param, value });
}));

els.export.addEventListener('click', async () => {
  if (!state.buffer) return;
  setStatus('Renderizando exportação...');
  const sr = state.buffer.sampleRate;
  const len = state.buffer.length;
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: sr });
  await off.audioWorklet.addModule('./gverb-worklet.js');
  const node = new AudioWorkletNode(off, 'gverb-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  params.forEach((p) => node.port.postMessage({ type: 'param', name: p.dataset.param, value: Number(p.value) }));
  const src = off.createBufferSource();
  src.buffer = state.buffer;
  src.connect(node).connect(off.destination);
  src.start();
  const rendered = await off.startRendering();

  const wav = toWav(rendered);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(els.filename.textContent || 'gverb-audio').replace(/\.[^/.]+$/, '')}-processed.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  setStatus('Exportado com sucesso');
});

function toWav(buffer) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const interleaved = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) {
    interleaved[i * 2] = ch0[i];
    interleaved[i * 2 + 1] = ch1[i];
  }
  const data = new DataView(new ArrayBuffer(44 + interleaved.length * 2));
  let o = 0;
  const w = (s) => { for (let i = 0; i < s.length; i++) data.setUint8(o++, s.charCodeAt(i)); };
  w('RIFF'); data.setUint32(o, 36 + interleaved.length * 2, true); o += 4; w('WAVEfmt ');
  data.setUint32(o, 16, true); o += 4; data.setUint16(o, 1, true); o += 2; data.setUint16(o, 2, true); o += 2;
  data.setUint32(o, buffer.sampleRate, true); o += 4; data.setUint32(o, buffer.sampleRate * 4, true); o += 4; data.setUint16(o, 4, true); o += 2; data.setUint16(o, 16, true); o += 2;
  w('data'); data.setUint32(o, interleaved.length * 2, true); o += 4;
  for (let i = 0; i < interleaved.length; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return data.buffer;
}
