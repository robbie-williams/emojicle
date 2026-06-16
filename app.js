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

// ── State ─────────────────────────────────────────────────────────────────────
const state = {};
LAYERS.forEach(l => { state[l] = 0; });

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderLayer(layer) {
  const part = PARTS[layer][state[layer]];
  const g = document.getElementById('layer-' + layer);
  if (g) g.innerHTML = part.svg;
  const nameEl = document.getElementById('name-' + layer);
  if (nameEl) nameEl.textContent = part.name;
}

function renderAll() {
  LAYERS.forEach(renderLayer);
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(layer, dir) {
  const len = PARTS[layer].length;
  state[layer] = ((state[layer] + dir) % len + len) % len;
  renderLayer(layer);
}

// ── Randomise ─────────────────────────────────────────────────────────────────

function randomise() {
  LAYERS.forEach(layer => {
    state[layer] = Math.floor(Math.random() * PARTS[layer].length);
  });
  renderAll();
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

const DANCES = {
  tango: { name: 'Tango', emoji: '\u{1F483}', duration: 5000, cssClass: 'dance-tango', arms: ARMS_SVG },
  // add more moves here later…
};

let dancing = false;

function dance(key) {
  if (dancing) return;
  const keys = Object.keys(DANCES);
  const move = DANCES[key] || DANCES[keys[Math.floor(Math.random() * keys.length)]];

  dancing = true;
  const group = document.getElementById('dance-group');
  const arms = document.getElementById('layer-arms');
  arms.innerHTML = move.arms;
  group.classList.add('dancing', move.cssClass);
  pulse('btn-dance');
  showToast(move.emoji + ' ' + move.name + '!');

  setTimeout(() => {
    group.classList.remove('dancing', move.cssClass);
    arms.innerHTML = '';
    dancing = false;
  }, move.duration);
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

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-nav';
    prevBtn.setAttribute('aria-label', 'Previous ' + LAYER_LABELS[layer]);
    prevBtn.innerHTML = '&#8592;';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'part-name';
    nameBtn.id = 'name-' + layer;
    nameBtn.setAttribute('aria-label', 'Browse all ' + LAYER_LABELS[layer]);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-nav';
    nextBtn.setAttribute('aria-label', 'Next ' + LAYER_LABELS[layer]);
    nextBtn.innerHTML = '&#8594;';

    prevBtn.addEventListener('click', () => navigate(layer, -1));
    nextBtn.addEventListener('click', () => navigate(layer, 1));
    nameBtn.addEventListener('click', () => openPicker(layer));

    row.appendChild(label);
    row.appendChild(prevBtn);
    row.appendChild(nameBtn);
    row.appendChild(nextBtn);
    container.appendChild(row);
  });
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
  document.getElementById('btn-random').addEventListener('click', randomise);
  document.getElementById('btn-dance').addEventListener('click', () => dance());

  document.getElementById('picker-close').addEventListener('click', closePicker);
  document.getElementById('picker').addEventListener('click', e => {
    if (e.target.id === 'picker') closePicker();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePicker();
  });

  randomise();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
