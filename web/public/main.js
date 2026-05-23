import { Dimension5Engine } from './audio/engine.js';

const $ = (s) => document.querySelector(s);
const controls = [...document.querySelectorAll('[data-param]')];
const statusEl = $('#status');
const fileNameEl = $('#fileName');
const playEl = $('#play');
const timeEl = $('#time');
const seekEl = $('#seek');

const engine = new Dimension5Engine({ onStatus: (m) => (statusEl.textContent = m) });

let isDragging = false;

function fmt(sec) {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function syncParamUI() {
  controls.forEach((el) => {
    const out = document.querySelector(`[data-value='${el.dataset.param}']`);
    if (out) out.textContent = Number(el.value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  });
}

async function handleFile(file) {
  if (!file) return;
  await engine.loadFile(file);
  fileNameEl.textContent = file.name;
  statusEl.textContent = 'Arquivo pronto para reprodução';
  seekEl.value = 0;
}

$('#fileInput').addEventListener('change', (e) => handleFile(e.target.files?.[0]));

const drop = $('#dropZone');
['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => {
  e.preventDefault();
  if (!isDragging) {
    drop.classList.add('dragging');
    isDragging = true;
  }
}));
['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => {
  e.preventDefault();
  drop.classList.remove('dragging');
  isDragging = false;
}));
drop.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));

$('#play').addEventListener('click', async () => {
  await engine.init();
  await engine.ctx.resume();
  if (engine.source) {
    engine.pause();
    playEl.textContent = '▶ Play';
    statusEl.textContent = 'Pausado';
  } else {
    engine.play();
    playEl.textContent = '⏸ Pause';
    statusEl.textContent = 'Reproduzindo em loop';
  }
});

$('#stop').addEventListener('click', () => {
  engine.stop();
  playEl.textContent = '▶ Play';
  statusEl.textContent = 'Parado';
  seekEl.value = 0;
});

$('#loop').addEventListener('change', (e) => engine.setLoop(e.target.checked));
$('#bypass').addEventListener('change', (e) => engine.setParam('bypass', e.target.checked ? 1 : 0));
$('#output').addEventListener('input', (e) => engine.setVolume(e.target.value));

controls.forEach((el) => el.addEventListener('input', () => {
  syncParamUI();
  engine.setParam(el.dataset.param, el.value);
}));

seekEl.addEventListener('change', () => {
  if (!engine.buffer) return;
  engine.seek(Number(seekEl.value) * engine.buffer.duration);
});

async function offlineRender() {
  if (!engine.buffer) return;
  statusEl.textContent = 'Render offline em andamento...';
  const srcBuffer = engine.buffer;
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: srcBuffer.length, sampleRate: srcBuffer.sampleRate });
  await off.audioWorklet.addModule('./audio/processor.js');
  const node = new AudioWorkletNode(off, 'gverb-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  const values = Object.fromEntries(controls.map((el) => [el.dataset.param, Number(el.value)]));
  values.bypass = $('#bypass').checked ? 1 : 0;
  node.port.postMessage({ type: 'batch', values });

  const src = off.createBufferSource();
  src.buffer = srcBuffer;
  src.connect(node).connect(off.destination);
  src.start();
  const rendered = await off.startRendering();

  const wav = toWav(rendered);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${(fileNameEl.textContent || 'dimension5').replace(/\.[^.]+$/, '')}-dimension5.wav`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  statusEl.textContent = 'Exportação finalizada';
}

$('#export').addEventListener('click', offlineRender);

function toWav(buffer) { const ch0 = buffer.getChannelData(0); const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0; const n = ch0.length; const inter = new Float32Array(n * 2); for (let i = 0; i < n; i++) { inter[i * 2] = ch0[i]; inter[i * 2 + 1] = ch1[i]; } const view = new DataView(new ArrayBuffer(44 + inter.length * 2)); let o = 0; const w = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); }; w('RIFF'); view.setUint32(o, 36 + inter.length * 2, true); o += 4; w('WAVEfmt '); view.setUint32(o, 16, true); o += 4; view.setUint16(o, 1, true); o += 2; view.setUint16(o, 2, true); o += 2; view.setUint32(o, buffer.sampleRate, true); o += 4; view.setUint32(o, buffer.sampleRate * 4, true); o += 4; view.setUint16(o, 4, true); o += 2; view.setUint16(o, 16, true); o += 2; w('data'); view.setUint32(o, inter.length * 2, true); o += 4; for (let i = 0; i < inter.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, inter[i])); view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); } return view.buffer; }

function tick() {
  if (engine.buffer) {
    const now = engine.currentPosition();
    seekEl.value = engine.buffer.duration ? now / engine.buffer.duration : 0;
    timeEl.textContent = `${fmt(now)} / ${fmt(engine.buffer.duration)}`;
  }
  requestAnimationFrame(tick);
}

syncParamUI();
requestAnimationFrame(tick);
