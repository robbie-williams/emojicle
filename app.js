'use strict';

// ── Part data ───────────────────────────────────────────────────────────────
// PARTS and PACK_ARMS come from parts-data.js (auto-generated from the
// face-components/ OpenMoji pack, viewBox 0 0 72 72). PARTS is keyed by layer:
//   { face:[{name,svg}], eyes:[…], eyebrows:[…], nose:[…], mouth:[…], extras:[…] }
// Optional layers (eyebrows, nose, extras) start with a "None" option.

// ── Layer rendering order (bottom → top) ──────────────────────────────────────
const LAYERS = ['face', 'eyebrows', 'eyes', 'nose', 'mouth', 'extras'];

const LAYER_LABELS = {
  face: 'Face',
  eyes: 'Eyes',
  eyebrows: 'Brows',
  nose: 'Nose',
  mouth: 'Mouth',
  extras: 'Extras',
};

// control row order (UI order, not render order)
const CONTROL_ORDER = ['face', 'eyes', 'eyebrows', 'nose', 'mouth', 'extras'];

// Layers the user can pick up and move on the canvas — everything except the
// face, which stays put as the anchor.
const MOVABLE = ['eyebrows', 'eyes', 'nose', 'mouth', 'extras'];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {};
LAYERS.forEach(l => { state[l] = 0; });

// per-layer drag offset (in viewBox units) and the currently-selected layer
const offsets = {};
MOVABLE.forEach(l => { offsets[l] = { x: 0, y: 0 }; });
let selectedLayer = null;

// optional layers carry a leading "None" entry (id '')
const OPTIONAL = new Set(['eyebrows', 'nose', 'extras']);

// id → index lookup per layer, so share links can address parts by stable id
const ID_INDEX = {};
LAYERS.forEach(l => {
  ID_INDEX[l] = {};
  PARTS[l].forEach((p, i) => { if (p.id) ID_INDEX[l][p.id] = i; });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderLayer(layer) {
  const part = PARTS[layer][state[layer]];
  const g = document.getElementById('layer-' + layer);
  if (g) g.innerHTML = part.svg;
  const nameEl = document.getElementById('name-' + layer);
  if (nameEl) nameEl.textContent = part.name;
  if (layer === selectedLayer) updateSelectBox();
}

function renderAll() {
  LAYERS.forEach(renderLayer);
}

// ── Randomise ─────────────────────────────────────────────────────────────────

function randomise() {
  LAYERS.forEach(layer => {
    state[layer] = Math.floor(Math.random() * PARTS[layer].length);
  });
  // fresh emoji → back to the default layout
  MOVABLE.forEach(l => { offsets[l] = { x: 0, y: 0 }; applyOffset(l); });
  deselect();
  renderAll();
  updateUrl();
  pulse('btn-random');
}

// ── Tap picker ──────────────────────────────────────────────────────────────
// A grid of every option for one layer — far friendlier than arrowing through
// 100+ parts. Each swatch shows the part on a faint face guide for context.

const GUIDE = '<circle cx="36" cy="36" r="23" fill="#EEF1F5"/>';

function swatchSvg(layer, part) {
  const guide = layer === 'face' ? '' : GUIDE;
  return '<svg viewBox="0 0 72 72" class="swatch-svg" aria-hidden="true">' +
         guide + part.svg + '</svg>';
}

function openPicker(layer) {
  const picker = document.getElementById('picker');
  const grid = document.getElementById('picker-grid');
  document.getElementById('picker-title').textContent = LAYER_LABELS[layer];

  grid.innerHTML = '';
  PARTS[layer].forEach((part, i) => {
    const cell = document.createElement('button');
    cell.className = 'swatch' + (i === state[layer] ? ' is-selected' : '');
    cell.setAttribute('aria-label', part.name);
    cell.innerHTML = swatchSvg(layer, part) +
      '<span class="swatch-name">' + part.name + '</span>';
    cell.addEventListener('click', () => {
      state[layer] = i;
      renderLayer(layer);
      closePicker();
      updateUrl();
    });
    grid.appendChild(cell);
  });

  picker.classList.add('show');
  picker.setAttribute('aria-hidden', 'false');
  const sel = grid.querySelector('.is-selected');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

function closePicker() {
  const picker = document.getElementById('picker');
  picker.classList.remove('show');
  picker.setAttribute('aria-hidden', 'true');
}

// ── Dance ─────────────────────────────────────────────────────────────────────
// Extensible move registry — add new dances here. Each move injects arm SVG into
// #layer-arms and applies a CSS class to #dance-group that drives the keyframes
// (defined in style.css). The Dance button picks a random available move.
// Arms are drawn for the 0 0 72 72 viewBox; shoulders sit at the sides of the
// face circle (cx36 cy36 r23) and the hands reach down past the chin.

const ARMS_SVG = `
  <g class="arm arm-left">
    <path d="M14,40 Q6,52 3,64" fill="none" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>
    <circle cx="3" cy="64" r="3.4" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="1.2"/>
  </g>
  <g class="arm arm-right">
    <path d="M58,40 Q66,52 69,64" fill="none" stroke="#2B2B2B" stroke-width="4" stroke-linecap="round"/>
    <circle cx="69" cy="64" r="3.4" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="1.2"/>
  </g>`;

// ── Dance sounds ──────────────────────────────────────────────────────────────
// Tiny synthesized soundbites (Web Audio) — no audio files, so the app stays
// fully static and offline. Each move schedules its whole 5s of notes up front;
// the rhythms are written to line up with that move's CSS keyframe cycle.

let audioCtx = null;

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try { audioCtx = new AC(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// one enveloped note; `glide` slides the pitch over the note for boings/wobbles
function note(ctx, at, freq, dur, opts) {
  const { type = 'triangle', vol = 0.1, glide } = opts || {};
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + dur);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

// Tango: a habanera bass line — DUM… da-DUM-DUM — one bar per 1.25s body sway
function soundTango(ctx, t0) {
  for (let bar = 0; bar < 4; bar++) {
    const t = t0 + bar * 1.25;
    note(ctx, t,          146.83, 0.4);            // D3
    note(ctx, t + 0.469,  146.83, 0.14);           // D3
    note(ctx, t + 0.625,  174.61, 0.25);           // F3
    note(ctx, t + 0.9375, 220.00, 0.25);           // A3
  }
  note(ctx, t0 + 4.7, 293.66, 0.28, { vol: 0.12 }); // D4 — ta-da!
}

// Bounce: a springy "boing" on every hop, a soft blip on each landing (0.6s cycle)
function soundBounce(ctx, t0) {
  for (let hop = 0; hop < 8; hop++) {
    const t = t0 + hop * 0.6;
    note(ctx, t,        130, 0.28, { type: 'sine', glide: 420, vol: 0.14 });
    note(ctx, t + 0.33, 523, 0.08, { type: 'square', vol: 0.04 });
  }
}

// Wiggle: fast happy chirps flip-flopping between two notes with the shimmy
function soundWiggle(ctx, t0) {
  for (let i = 0; i < 19; i++) {
    const t = t0 + i * 0.25;
    const hi = i % 2 === 0;
    note(ctx, t, hi ? 523.25 : 392.0, 0.14, { vol: 0.08, glide: hi ? 587.33 : 440.0 });
  }
  note(ctx, t0 + 4.75, 659.25, 0.22, { vol: 0.1 });  // E5 — finishing chirp
}

const DANCES = {
  tango:  { name: 'Tango',  emoji: '\u{1F483}', duration: 5000, cssClass: 'dance-tango',  arms: ARMS_SVG, sound: soundTango },
  bounce: { name: 'Bounce', emoji: '\u{1F57A}', duration: 5000, cssClass: 'dance-bounce', arms: ARMS_SVG, sound: soundBounce },
  wiggle: { name: 'Wiggle', emoji: '\u{1FAA9}', duration: 5000, cssClass: 'dance-wiggle', arms: ARMS_SVG, sound: soundWiggle },
  // add more moves here later…
};

let dancing = false;

function dance(key) {
  if (dancing) return;
  const keys = Object.keys(DANCES);
  const move = DANCES[key] || DANCES[keys[Math.floor(Math.random() * keys.length)]];

  dancing = true;
  deselect();
  const group = document.getElementById('dance-group');
  const arms = document.getElementById('layer-arms');
  arms.innerHTML = move.arms;
  group.classList.add('dancing', move.cssClass);
  pulse('btn-dance');
  showToast(move.emoji + ' ' + move.name + '!');

  const ctx = getAudioCtx();   // created inside the tap — autoplay-policy safe
  if (ctx && move.sound) move.sound(ctx, ctx.currentTime + 0.05);

  setTimeout(() => {
    group.classList.remove('dancing', move.cssClass);
    arms.innerHTML = '';
    dancing = false;
  }, move.duration);
}

// ── Dance picker ──────────────────────────────────────────────────────────────
// "Random dance" (checkbox under the Dance button) is on by default; unticking
// it makes the Dance button open this modal so the user picks the move instead.

function buildDancePicker() {
  const grid = document.getElementById('dance-grid');
  Object.keys(DANCES).forEach(key => {
    const move = DANCES[key];
    const btn = document.createElement('button');
    btn.className = 'dance-option';
    btn.setAttribute('aria-label', 'Dance the ' + move.name);
    btn.innerHTML = '<span class="dance-emoji" aria-hidden="true">' + move.emoji + '</span>' +
                    '<span class="dance-name">' + move.name + '</span>';
    btn.addEventListener('click', () => {
      closeDancePicker();
      dance(key);
    });
    grid.appendChild(btn);
  });
}

function openDancePicker() {
  const el = document.getElementById('dance-picker');
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
}

function closeDancePicker() {
  const el = document.getElementById('dance-picker');
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
}

function onDanceButton() {
  if (dancing) return;
  if (document.getElementById('opt-random-dance').checked) dance();
  else openDancePicker();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Button pulse ──────────────────────────────────────────────────────────────

function pulse(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 200);
}

// ── Build controls ────────────────────────────────────────────────────────────

function buildControls() {
  const container = document.getElementById('controls');

  CONTROL_ORDER.forEach(layer => {
    const row = document.createElement('div');
    row.className = 'layer-row';

    const label = document.createElement('span');
    label.className = 'layer-label';
    label.textContent = LAYER_LABELS[layer];

    const nameBtn = document.createElement('button');
    nameBtn.className = 'part-name';
    nameBtn.id = 'name-' + layer;
    nameBtn.setAttribute('aria-label', 'Browse all ' + LAYER_LABELS[layer]);
    nameBtn.addEventListener('click', () => openPicker(layer));

    row.appendChild(label);
    row.appendChild(nameBtn);
    container.appendChild(row);
  });
}

// ── Select & drag layers ──────────────────────────────────────────────────────
// Tap a part to select it (tap again to deselect); press-and-drag to move it
// anywhere on the canvas. The face layer is fixed — it's the anchor everything
// else sits on, so it is never selectable or movable. Positions are per-layer
// translate offsets in viewBox units; they survive part swaps and reset on
// Randomise. Disabled while dancing.

const DRAG_THRESHOLD = 2.5;   // viewBox units before a press becomes a drag
let drag = null;

function layerHasContent(layer) {
  const part = PARTS[layer] && PARTS[layer][state[layer]];
  return !!(part && part.svg);
}

function applyOffset(layer) {
  const g = document.getElementById('layer-' + layer);
  if (!g) return;
  const { x, y } = offsets[layer];
  if (x || y) g.setAttribute('transform', `translate(${x} ${y})`);
  else g.removeAttribute('transform');
}

// bbox of a layer's art in dance-group space (its own translate added in)
function layerBox(layer) {
  if (!layerHasContent(layer)) return null;
  const g = document.getElementById('layer-' + layer);
  let bb;
  try { bb = g.getBBox(); } catch (e) { return null; }
  if (!bb || bb.width === 0) return null;
  const { x, y } = offsets[layer];
  return { x: bb.x + x, y: bb.y + y, w: bb.width, h: bb.height };
}

function updateSelectBox() {
  const box = document.getElementById('select-box');
  const b = selectedLayer ? layerBox(selectedLayer) : null;
  if (!b) { box.setAttribute('visibility', 'hidden'); return; }
  const pad = 2.5;
  box.setAttribute('x', b.x - pad);
  box.setAttribute('y', b.y - pad);
  box.setAttribute('width', b.w + pad * 2);
  box.setAttribute('height', b.h + pad * 2);
  box.setAttribute('visibility', 'visible');
}

function selectLayer(layer) {
  if (selectedLayer) {
    const prev = document.getElementById('layer-' + selectedLayer);
    if (prev) prev.classList.remove('layer-selected');
  }
  selectedLayer = layer;
  if (layer) document.getElementById('layer-' + layer).classList.add('layer-selected');
  updateSelectBox();
}

function deselect() {
  if (selectedLayer) {
    const g = document.getElementById('layer-' + selectedLayer);
    if (g) g.classList.remove('layer-selected');
  }
  selectedLayer = null;
  const box = document.getElementById('select-box');
  if (box) box.setAttribute('visibility', 'hidden');
}

// client coords → viewBox units (identity with dance-group while not dancing)
function toSvg(evt) {
  const svg = document.getElementById('emoji-svg');
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(m.inverse());
}

// topmost movable layer whose box contains the point; prefers the already-
// selected layer so it stays grabbable when parts overlap.
function hitLayer(p) {
  const hits = [];
  for (const layer of MOVABLE) {
    const b = layerBox(layer);
    if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) hits.push(layer);
  }
  if (!hits.length) return null;
  if (selectedLayer && hits.includes(selectedLayer)) return selectedLayer;
  return hits.reduce((top, c) => LAYERS.indexOf(c) > LAYERS.indexOf(top) ? c : top, hits[0]);
}

function onPointerDown(e) {
  if (dancing) return;
  const p = toSvg(e);
  if (!p) return;
  const layer = hitLayer(p);
  drag = {
    layer, startX: p.x, startY: p.y, moved: false,
    baseX: layer ? offsets[layer].x : 0,
    baseY: layer ? offsets[layer].y : 0,
  };
  const svg = document.getElementById('emoji-svg');
  if (svg.setPointerCapture) try { svg.setPointerCapture(e.pointerId); } catch (err) {}
}

function onPointerMove(e) {
  if (!drag || dancing) return;
  const p = toSvg(e);
  if (!p) return;
  const dx = p.x - drag.startX;
  const dy = p.y - drag.startY;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    if (!drag.layer) { drag = null; return; }   // started on empty space
    if (selectedLayer !== drag.layer) selectLayer(drag.layer);
  }
  offsets[drag.layer].x = drag.baseX + dx;
  offsets[drag.layer].y = drag.baseY + dy;
  applyOffset(drag.layer);
  updateSelectBox();
  e.preventDefault();
}

function onPointerUp() {
  if (!drag || dancing) { drag = null; return; }
  const { layer, moved } = drag;
  drag = null;
  if (moved) { updateUrl(); return; }   // a drag — keep the layer selected where it landed
  // a tap — toggle selection
  if (!layer) deselect();
  else if (layer === selectedLayer) deselect();
  else selectLayer(layer);
}

function initDrag() {
  const svg = document.getElementById('emoji-svg');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', () => { drag = null; });
}

// ── Stateless share link ──────────────────────────────────────────────────────
// The whole emoji is encoded into the ?e= query param so a link rebuilds it
// exactly — no backend, no storage. Parts are referenced by their STABLE id
// (filename token), not array index, so links survive pack re-curation.
// Format (layers in render order, '.' between):  id[_x_y]
//   e.g.  yellow.1F47F_3_-2.1F600..1F602_-5_8.
//   empty segment = None; _x_y present only when a layer has been dragged.

function encodeState() {
  return LAYERS.map(layer => {
    let seg = PARTS[layer][state[layer]].id || '';
    if (seg && MOVABLE.includes(layer)) {
      const o = offsets[layer];
      const x = Math.round(o.x), y = Math.round(o.y);
      if (x || y) seg += '_' + x + '_' + y;
    }
    return seg;
  }).join('.');
}

function applyEncoded(str) {
  const segs = str.split('.');
  LAYERS.forEach((layer, i) => {
    const f = (segs[i] || '').split('_');
    const id = f[0];
    let idx = id ? ID_INDEX[layer][id] : 0;       // unknown / empty → default
    if (idx === undefined) idx = OPTIONAL.has(layer) ? 0 : 0;  // 0 is None on optional layers
    state[layer] = idx;
    if (MOVABLE.includes(layer)) {
      offsets[layer] = { x: parseFloat(f[1]) || 0, y: parseFloat(f[2]) || 0 };
    }
  });
}

function updateUrl() {
  const u = new URL(location.href);
  u.searchParams.set('e', encodeState());
  history.replaceState(null, '', u);
}

// ── Rasterise, share & save ───────────────────────────────────────────────────
// Serialise the current layers (with their drag offsets) into a self-contained
// SVG — the OpenMoji art has inline fills, so no CSS/fonts are needed — then
// draw it to a canvas and export a transparent PNG. All client-side / offline.

const EXPORT_SIZE = 600;

function buildExportSvg() {
  let inner = '';
  LAYERS.forEach(layer => {
    const part = PARTS[layer][state[layer]];
    if (!part.svg) return;
    const o = MOVABLE.includes(layer) ? offsets[layer] : { x: 0, y: 0 };
    const t = (o.x || o.y) ? ` transform="translate(${o.x} ${o.y})"` : '';
    inner += `<g${t}>${part.svg}</g>`;
  });
  // 72 box + an 8-unit margin so a part dragged slightly off-centre isn't clipped
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 88 88" ` +
         `width="${EXPORT_SIZE}" height="${EXPORT_SIZE}">${inner}</svg>`;
}

function rasterise() {
  return new Promise((resolve, reject) => {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildExportSvg());
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = EXPORT_SIZE;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);   // transparent background
      ctx.drawImage(img, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
      c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = () => reject(new Error('svg decode failed'));
    img.src = url;
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canShareFiles(file) {
  return !!(navigator.canShare && navigator.canShare({ files: [file] }));
}

// One action for both sharing and saving: on a phone the native share sheet
// offers Messages, "Save Image" (→ Photos), and everything else; on desktop
// (no Web Share for files) we download the PNG and copy the link instead.
async function shareEmoji() {
  pulse('btn-share');
  const withLink = document.getElementById('opt-link').checked;
  let blob;
  try { blob = await rasterise(); } catch (e) { showToast('Could not make image'); return; }
  const file = new File([blob], 'emojicle.png', { type: 'image/png' });
  if (canShareFiles(file)) {
    const data = { files: [file] };
    if (withLink) data.text = location.href;   // link only when opted in
    try { await navigator.share(data); } catch (e) { /* user cancelled — no-op */ }
  } else {
    downloadBlob(blob, 'emojicle.png');
    if (withLink) {
      try { await navigator.clipboard.writeText(location.href); } catch (e) {}
    }
    showToast(withLink ? 'Image saved · link copied' : 'Image saved');
  }
}

// ── Service Worker ────────────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  buildControls();
  buildDancePicker();
  initDrag();
  document.getElementById('btn-random').addEventListener('click', randomise);
  document.getElementById('btn-dance').addEventListener('click', onDanceButton);
  document.getElementById('btn-share').addEventListener('click', shareEmoji);

  document.getElementById('picker-close').addEventListener('click', closePicker);
  document.getElementById('picker').addEventListener('click', e => {
    if (e.target.id === 'picker') closePicker();
  });
  document.getElementById('dance-picker-close').addEventListener('click', closeDancePicker);
  document.getElementById('dance-picker').addEventListener('click', e => {
    if (e.target.id === 'dance-picker') closeDancePicker();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePicker(); closeDancePicker(); }
  });

  // rebuild from a share link if present, otherwise start random
  const e = new URLSearchParams(location.search).get('e');
  if (e) {
    applyEncoded(e);
    renderAll();
    MOVABLE.forEach(applyOffset);
    updateUrl();   // normalise the URL to the canonical encoding
  } else {
    randomise();
  }
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
