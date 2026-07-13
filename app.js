'use strict';

// ── Part data ───────────────────────────────────────────────────────────────
// PARTS and STICKERS come from parts-data.js (auto-generated from the
// face-components/ OpenMoji pack, viewBox 0 0 72 72). PARTS is keyed by layer:
//   { face:[{name,svg}], eyes:[…], eyebrows:[…], nose:[…], mouth:[…], extras:[…] }
// Optional layers (eyebrows, nose, extras) start with a "None" option.
// STICKERS is the whole-emoji list (food, animals, objects…) that the pack /
// background features consume directly.

// Random only rolls the classic extras (accessories drawn for faces) — a
// random emoji sporting a surprise pizza every other tap gets old fast. The
// stickers appended below remain reachable through the picker.
const CLASSIC_EXTRAS = PARTS.extras.length;

// Every sticker also joins the Extras list scaled down and parked above the
// face, so kids can drag a pizza slice (or a T-Rex) anywhere on their emoji.
// The wrap keeps ids stable for share links without duplicating art data.
STICKERS.forEach(s => PARTS.extras.push({
  id: s.id,
  name: s.name,
  svg: '<g transform="translate(18 -2) scale(0.5)">' + s.svg + '</g>',
}));

// Up to three extras can be stacked: extras2/extras3 are additional layers
// that share the extras part list (aliased below), revealed one at a time by
// the + button on the last visible Extras row.
const EXTRA_SLOTS = ['extras', 'extras2', 'extras3'];
PARTS.extras2 = PARTS.extras;
PARTS.extras3 = PARTS.extras;

// ── Layer rendering order (bottom → top) ──────────────────────────────────────
const LAYERS = ['face', 'eyebrows', 'eyes', 'nose', 'mouth', 'extras', 'extras2', 'extras3'];

const LAYER_LABELS = {
  face: 'Face',
  eyes: 'Eyes',
  eyebrows: 'Brows',
  nose: 'Nose',
  mouth: 'Mouth',
  extras: 'Extras',
  extras2: 'Extras',
  extras3: 'Extras',
};

// control row order (UI order, not render order)
const CONTROL_ORDER = ['face', 'eyes', 'eyebrows', 'nose', 'mouth', 'extras', 'extras2', 'extras3'];

// Layers the user can pick up and move on the canvas — everything except the
// face, which stays put as the anchor.
const MOVABLE = ['eyebrows', 'eyes', 'nose', 'mouth', 'extras', 'extras2', 'extras3'];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {};
LAYERS.forEach(l => { state[l] = 0; });

// per-layer drag offset (in viewBox units) and the currently-selected layer
const offsets = {};
MOVABLE.forEach(l => { offsets[l] = { x: 0, y: 0 }; });
let selectedLayer = null;

// optional layers carry a leading "None" entry (id '')
const OPTIONAL = new Set(['eyebrows', 'nose', 'extras', 'extras2', 'extras3']);

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

let booted = false;   // set once init has produced the first emoji

function randomise() {
  // a stray tap of Random shouldn't destroy a ten-minute masterpiece — keep
  // the outgoing emoji and offer an Undo on the toast
  const prev = booted ? encodeState() : null;
  const prevActive = packActive;

  // Random makes a NEW emoji — the member being edited stays safe in the rail
  detachFromPack();

  LAYERS.forEach(layer => {
    const n = layer.startsWith('extras') ? CLASSIC_EXTRAS : PARTS[layer].length;
    state[layer] = Math.floor(Math.random() * n);
  });
  // fresh emoji → one extras slot again (a random roll shouldn't pile on hats)
  state.extras2 = 0;
  state.extras3 = 0;
  extrasShown = 1;
  syncExtraSlots();
  resetZOrder();
  // fresh emoji → back to the default layout
  MOVABLE.forEach(l => { offsets[l] = { x: 0, y: 0 }; applyOffset(l); });
  deselect();
  renderAll();
  updateUrl();
  pulse('btn-random');
  if (prev !== null) {
    showToast('\u{1F3B2} New emoji!', 'Undo', () => {
      packActive = prevActive;   // reattach if a pack member was being edited
      renderPackRail();
      restoreEncoded(prev);
    });
  }
}

// rebuild the whole builder from an encoded string (undo, gallery loads)
function restoreEncoded(encoded) {
  applyEncoded(encoded);
  extrasShown = 1;
  deselect();
  renderAll();
  MOVABLE.forEach(applyOffset);
  syncExtraSlots();
  updateUrl();
}

// ── Overlay / dialog stack ────────────────────────────────────────────────────
// One stack for every overlay in the app (pickers, restack modal, the four
// game screens) plus lightweight "Escape layers" for panels inside a game.
// Opening an overlay records the previously-focused element, focuses the
// dialog's first control and marks the rest of the page inert (which also
// traps Tab); closing restores both. A single document-level Escape handler
// pops only the topmost layer, so Escape in a song picker closes the panel,
// not the whole game.

const OVERLAY_STACK = [];   // top last: { el|null, close, prevFocus }

function openOverlay(el, close) {
  if (OVERLAY_STACK.some(o => o.el === el)) return;
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
  OVERLAY_STACK.push({ el, close, prevFocus: document.activeElement });
  syncOverlayState();
  const first = el.querySelector(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (first) first.focus({ preventScroll: true });
}

function closeOverlay(el) {
  const i = OVERLAY_STACK.findIndex(o => o.el === el);
  if (i < 0) return;
  const [o] = OVERLAY_STACK.splice(i, 1);
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
  syncOverlayState();
  if (o.prevFocus && document.contains(o.prevFocus)) {
    try { o.prevFocus.focus({ preventScroll: true }); } catch (e) {}
  }
}

// a panel inside an overlay that Escape should dismiss first (no el of its own)
function pushEscLayer(close) {
  const layer = { el: null, close, prevFocus: null };
  OVERLAY_STACK.push(layer);
  return layer;
}

function removeEscLayer(layer) {
  const i = OVERLAY_STACK.indexOf(layer);
  if (i >= 0) OVERLAY_STACK.splice(i, 1);
}

function syncOverlayState() {
  const els = OVERLAY_STACK.filter(o => o.el).map(o => o.el);
  const top = els[els.length - 1] || null;
  [...document.body.children].forEach(c => {
    if (c.tagName === 'SCRIPT' || c.id === 'toast') return;
    if (top && c !== top) c.setAttribute('inert', '');
    else c.removeAttribute('inert');
  });
  document.body.classList.toggle('overlay-open', !!top);
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !OVERLAY_STACK.length) return;
  e.preventDefault();
  OVERLAY_STACK[OVERLAY_STACK.length - 1].close();
});

// ── Tap picker ──────────────────────────────────────────────────────────────
// A grid of every option for one layer — far friendlier than arrowing through
// 100+ parts. Each swatch shows the part on a faint face guide for context.

const GUIDE = '<circle cx="36" cy="36" r="23" fill="#EEF1F5"/>';

function swatchSvg(layer, part) {
  const guide = layer === 'face' ? '' : GUIDE;
  return '<svg viewBox="0 0 72 72" class="swatch-svg" aria-hidden="true">' +
         guide + part.svg + '</svg>';
}

let pickerLayer = null;

function openPicker(layer) {
  pickerLayer = layer;
  const picker = document.getElementById('picker');
  const grid = document.getElementById('picker-grid');
  document.getElementById('picker-title').textContent = LAYER_LABELS[layer];
  // extras slots get a red − in the header that removes the extra entirely
  document.getElementById('picker-remove').style.display =
    EXTRA_SLOTS.includes(layer) ? '' : 'none';

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

  openOverlay(picker, closePicker);
  const sel = grid.querySelector('.is-selected');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

function closePicker() {
  closeOverlay(document.getElementById('picker'));
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
let masterGain = null;   // app-wide output bus — the header mute flips its gain
let muted = false;

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try { audioCtx = new AC(); } catch (e) { return null; }
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Every sound in the app (builder AND games) connects here instead of
// ctx.destination, so the 🔊/🔇 toggle is instant and total.
function audioBus(ctx) {
  return masterGain || ctx.destination;
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
  gain.connect(audioBus(ctx));
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

// Spin: a rising swirl on every turn (one rotation per 1.25s)
function soundSpin(ctx, t0) {
  for (let turn = 0; turn < 4; turn++) {
    const t = t0 + turn * 1.25;
    note(ctx, t, 220, 1.0, { type: 'sine', glide: 880, vol: 0.07 });
    note(ctx, t + 1.0, 880, 0.2, { type: 'triangle', vol: 0.06 });
  }
  note(ctx, t0 + 4.75, 1046.5, 0.25, { vol: 0.1 });
}

// Moonwalk: a smooth funky bass slide on each glide (1s cycle)
function soundMoonwalk(ctx, t0) {
  for (let i = 0; i < 5; i++) {
    const t = t0 + i * 1.0;
    note(ctx, t,        98,     0.35, { type: 'triangle', glide: 73.42, vol: 0.12 });
    note(ctx, t + 0.5,  130.81, 0.18, { type: 'triangle', vol: 0.09 });
    note(ctx, t + 0.75, 146.83, 0.15, { type: 'triangle', vol: 0.08 });
  }
}

// Disco: four-on-the-floor thump with off-beat stabs (0.5s beat)
function soundDisco(ctx, t0) {
  for (let i = 0; i < 9; i++) {
    const t = t0 + i * 0.5;
    note(ctx, t, 120, 0.18, { type: 'sine', glide: 50, vol: 0.13 });
    if (i % 2 === 1) note(ctx, t, 523.25, 0.12, { type: 'square', vol: 0.035 });
    if (i % 4 === 2) note(ctx, t + 0.25, 783.99, 0.1, { type: 'square', vol: 0.03 });
  }
  note(ctx, t0 + 4.6, 1046.5, 0.3, { vol: 0.1 });
}

// Every move uses the hand-drawn ARMS_SVG — its .arm-left/.arm-right groups
// are what the arm keyframes animate. (The OpenMoji pack's "arms" art turned
// out to be tiny hand fragments, not usable arms, so it isn't shipped.)
const DANCES = {
  tango:    { name: 'Tango',    emoji: '\u{1F483}', duration: 5000, cssClass: 'dance-tango',    arms: ARMS_SVG, sound: soundTango },
  bounce:   { name: 'Bounce',   emoji: '\u{1F57A}', duration: 5000, cssClass: 'dance-bounce',   arms: ARMS_SVG, sound: soundBounce },
  wiggle:   { name: 'Wiggle',   emoji: '\u{1FAA9}', duration: 5000, cssClass: 'dance-wiggle',   arms: ARMS_SVG, sound: soundWiggle },
  spin:     { name: 'Spin',     emoji: '\u{1F300}', duration: 5000, cssClass: 'dance-spin',     arms: ARMS_SVG, sound: soundSpin },
  moonwalk: { name: 'Moonwalk', emoji: '\u{1F576}\u{FE0F}', duration: 5000, cssClass: 'dance-moonwalk', arms: ARMS_SVG, sound: soundMoonwalk },
  disco:    { name: 'Disco',    emoji: '\u{2728}', duration: 5000, cssClass: 'dance-disco', arms: ARMS_SVG, sound: soundDisco },
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
  arms.innerHTML = typeof move.arms === 'function' ? move.arms() : move.arms;
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

// ── Tap vs long-press on action buttons ───────────────────────────────────────
// Dance and Send both hide a power move behind a hold (issues #32/#33): tap is
// the ordinary action, holding for a beat fires the alternate one. Pointer
// events drive the gesture; the click that trails pointerup is swallowed except
// when it came from the keyboard (e.detail === 0), where it's the only signal
// and always means "tap".

const LONG_PRESS_MS = 500;

function addLongPress(btn, onTap, onHold) {
  let timer = null;
  let held = false;
  let tracking = false;
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    tracking = true;
    held = false;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; onHold(); }, LONG_PRESS_MS);
  });
  const abandon = () => { tracking = false; clearTimeout(timer); };
  btn.addEventListener('pointerup', () => {
    if (!tracking) return;
    abandon();
    if (!held) onTap();
  });
  btn.addEventListener('pointerleave', abandon);
  btn.addEventListener('pointercancel', abandon);
  btn.addEventListener('click', e => { if (e.detail === 0) onTap(); });
  // the hold must reach our timer, not the browser's context menu
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

// ── Dance picker ──────────────────────────────────────────────────────────────
// Tapping Dance opens this modal to pick a move; holding the button skips it
// and fires a random dance (the picker's footer hint teaches the shortcut).

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
  openOverlay(document.getElementById('dance-picker'), closeDancePicker);
}

function closeDancePicker() {
  closeOverlay(document.getElementById('dance-picker'));
}

function onDanceButton() {
  if (dancing) return;
  openDancePicker();
}

function onDanceHold() {
  if (dancing) return;
  pulse('btn-dance');
  dance();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

// Optional action button (e.g. Undo after Random) — the toast then accepts
// taps and hangs around a little longer.
function showToast(msg, actionLabel, onAction) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('has-action', !!actionLabel);
  if (actionLabel) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = actionLabel;
    b.addEventListener('click', () => {
      el.classList.remove('show');
      onAction();
    });
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), actionLabel ? 5000 : 2500);
}

// ── Action hint ───────────────────────────────────────────────────────────────
// Transient one-liner in the slot under the action buttons — used to teach the
// hold-Send shortcut without a modal or a toast fighting the "Image saved" one.

let actionHintTimer = null;

function showActionHint(msg) {
  const el = document.getElementById('action-hint');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(actionHintTimer);
  actionHintTimer = setTimeout(() => el.classList.remove('show'), 2500);
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
    // extras2/3 live inside the single Extras row, not rows of their own
    if (layer === 'extras2' || layer === 'extras3') return;

    const row = document.createElement('div');
    row.className = 'layer-row';

    const label = document.createElement('span');
    label.className = 'layer-label';
    label.textContent = LAYER_LABELS[layer];
    row.appendChild(label);

    if (layer === 'extras') {
      // one row, up to three slot buttons side by side, plus the +
      const slots = document.createElement('div');
      slots.className = 'extra-slots';
      EXTRA_SLOTS.forEach(l => {
        const b = document.createElement('button');
        b.className = 'part-name';
        b.id = 'name-' + l;
        b.setAttribute('aria-label', 'Browse all Extras');
        b.addEventListener('click', () => openPicker(l));
        slots.appendChild(b);
      });
      const add = document.createElement('button');
      add.className = 'add-extra';
      add.id = 'add-extra';
      add.textContent = '+';
      add.setAttribute('aria-label', 'Add another extra');
      add.addEventListener('click', addExtraSlot);
      slots.appendChild(add);
      row.appendChild(slots);
    } else {
      const nameBtn = document.createElement('button');
      nameBtn.className = 'part-name';
      nameBtn.id = 'name-' + layer;
      nameBtn.setAttribute('aria-label', 'Browse all ' + LAYER_LABELS[layer]);
      nameBtn.addEventListener('click', () => openPicker(layer));
      row.appendChild(nameBtn);
    }

    container.appendChild(row);
  });
}

// ── Extra slots ───────────────────────────────────────────────────────────────
// One slot button shows by default; the + reveals the next (up to 3) in the
// same row and drops straight into its picker. Slots collapse again on
// Randomise; a share link with parts in a slot re-reveals it on load.

let extrasShown = 1;

function syncExtraSlots() {
  EXTRA_SLOTS.forEach((l, i) => { if (state[l] > 0) extrasShown = Math.max(extrasShown, i + 1); });
  EXTRA_SLOTS.forEach((l, i) => {
    const btn = document.getElementById('name-' + l);
    if (btn) btn.style.display = i < extrasShown ? '' : 'none';
  });
  const add = document.getElementById('add-extra');
  if (add) add.style.display = extrasShown < EXTRA_SLOTS.length ? '' : 'none';
}

function addExtraSlot() {
  if (extrasShown >= EXTRA_SLOTS.length) return;
  extrasShown++;
  syncExtraSlots();
  openPicker(EXTRA_SLOTS[extrasShown - 1]);
}

// Remove an extra (the red − in its picker): later slots shift down so the
// filled extras stay contiguous, and the row shrinks back.
function removeExtra(slot) {
  for (let i = EXTRA_SLOTS.indexOf(slot); i < EXTRA_SLOTS.length - 1; i++) {
    state[EXTRA_SLOTS[i]] = state[EXTRA_SLOTS[i + 1]];
    offsets[EXTRA_SLOTS[i]] = offsets[EXTRA_SLOTS[i + 1]];
  }
  const last = EXTRA_SLOTS[EXTRA_SLOTS.length - 1];
  state[last] = 0;
  offsets[last] = { x: 0, y: 0 };

  if (EXTRA_SLOTS.includes(selectedLayer)) deselect();   // content shifted under it
  extrasShown = 1;
  EXTRA_SLOTS.forEach(l => { renderLayer(l); applyOffset(l); });
  syncExtraSlots();
  updateUrl();
}

// ── Select & drag layers ──────────────────────────────────────────────────────
// Tap a part to select it (tap again to deselect); press-and-drag to move it
// anywhere on the canvas. The face layer is fixed — it's the anchor everything
// else sits on, so it is never selectable or movable. Positions are per-layer
// translate offsets in viewBox units; they survive part swaps and reset on
// Randomise. Disabled while dancing.

const DRAG_THRESHOLD = 2.5;   // viewBox units before a press becomes a drag
let drag = null;

// ── Layer z-order ─────────────────────────────────────────────────────────────
// LAYERS stays the canonical (positional) list — share links depend on it —
// while zOrder is the current stacking, mutable via "Move to top". The DOM
// group order inside #dance-group is kept in sync; select-box stays last.
// Not encoded in share links; resets on Randomise.

let zOrder = LAYERS.slice();

function moveLayerToTop(layer) {
  zOrder.splice(zOrder.indexOf(layer), 1);
  zOrder.push(layer);
  const g = document.getElementById('layer-' + layer);
  g.parentNode.insertBefore(g, document.getElementById('select-box'));
  updateSelectBox();
}

function moveLayerToBack(layer) {
  zOrder.splice(zOrder.indexOf(layer), 1);
  const g = document.getElementById('layer-' + layer);
  g.parentNode.insertBefore(g, document.getElementById('layer-' + zOrder[0]));
  zOrder.unshift(layer);
  updateSelectBox();
}

function resetZOrder() {
  applyZOrder(LAYERS);
}

// set the stacking wholesale and sync the DOM group order (share links, undo)
function applyZOrder(order) {
  zOrder = order.slice();
  const box = document.getElementById('select-box');
  if (!box) return;   // headless (tests) — the state is what matters
  zOrder.forEach(l => box.parentNode.insertBefore(document.getElementById('layer-' + l), box));
}

// ── Layer-order modal ─────────────────────────────────────────────────────────
// Long-press (or double-tap / double-click) a part on the canvas to offer
// moving its layer above everything else or behind everything else.
// (LONG_PRESS_MS is shared with the action-button hold gesture, declared there.)

let pressTimer = null;
let lastTap = { layer: null, t: 0 };
let moveTopLayer = null;

function openMoveTop(layer) {
  moveTopLayer = layer;
  selectLayer(layer);
  document.getElementById('move-top-name').textContent = PARTS[layer][state[layer]].name;
  openOverlay(document.getElementById('move-top'), closeMoveTop);
}

function closeMoveTop() {
  moveTopLayer = null;
  closeOverlay(document.getElementById('move-top'));
}

function confirmMoveTop() {
  if (moveTopLayer) {
    const layer = moveTopLayer;
    moveLayerToTop(layer);
    updateUrl();   // stacking is part of the share link now
    showToast('⬆️ ' + PARTS[layer][state[layer]].name + ' is on top!');
  }
  closeMoveTop();
}

function confirmMoveBack() {
  if (moveTopLayer) {
    const layer = moveTopLayer;
    moveLayerToBack(layer);
    updateUrl();
    showToast('⬇️ ' + PARTS[layer][state[layer]].name + ' went to the back!');
  }
  closeMoveTop();
}

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
  if (layer) announce(PARTS[layer][state[layer]].name + ' selected');
}

function deselect() {
  if (selectedLayer) {
    const g = document.getElementById('layer-' + selectedLayer);
    if (g) g.classList.remove('layer-selected');
  }
  selectedLayer = null;
  const box = document.getElementById('select-box');
  if (box) box.setAttribute('visibility', 'hidden');
  announce('');
}

// ── Canvas keyboard support & announcements ───────────────────────────────────
// Drag moves a part and double-tap/long-press restacks it — the keyboard path
// mirrors both on the focusable canvas (←/→ pick a part, ↑/↓ and Shift+←/→
// nudge it, Enter restacks), and selection is announced to screen readers via
// the visually-hidden live region. There's deliberately no on-screen button
// row for any of this: it would only duplicate the gestures and cost space.

function announce(txt) {
  const el = document.getElementById('sr-status');
  if (el) el.textContent = txt;
}

function nudgeSelected(dx, dy) {
  if (!selectedLayer) return;
  const o = offsets[selectedLayer];
  o.x = Math.max(-38, Math.min(38, o.x + dx));
  o.y = Math.max(-38, Math.min(38, o.y + dy));
  applyOffset(selectedLayer);
  updateSelectBox();
  updateUrl();
}

// ←/→ on the (focusable) canvas cycles through the movable parts, Enter opens
// the restack modal — selection itself no longer needs a pointer.
function cycleSelection(dir) {
  const avail = MOVABLE.filter(layerHasContent);
  if (!avail.length) return;
  const i = avail.indexOf(selectedLayer);
  const next = i < 0
    ? avail[dir > 0 ? 0 : avail.length - 1]
    : avail[(i + dir + avail.length) % avail.length];
  selectLayer(next);
}

function initCanvasKeys() {
  const svg = document.getElementById('emoji-svg');
  svg.addEventListener('keydown', e => {
    if (dancing) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey && selectedLayer) nudgeSelected(dir * 2, 0);
      else cycleSelection(dir);
      e.preventDefault();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selectedLayer) {
      nudgeSelected(0, e.key === 'ArrowUp' ? -2 : 2);
      e.preventDefault();
    } else if (e.key === 'Enter' && selectedLayer) {
      openMoveTop(selectedLayer);
      e.preventDefault();
    }
  });
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
  return hits.reduce((top, c) => zOrder.indexOf(c) > zOrder.indexOf(top) ? c : top, hits[0]);
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
  // held still on a part long enough → offer to restack it instead of dragging
  clearTimeout(pressTimer);
  if (layer) {
    pressTimer = setTimeout(() => {
      if (drag && drag.layer === layer && !drag.moved) {
        drag = null;
        openMoveTop(layer);
      }
    }, LONG_PRESS_MS);
  }
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
    clearTimeout(pressTimer);   // it's a drag, not a long-press
    if (!drag.layer) { drag = null; return; }   // started on empty space
    if (selectedLayer !== drag.layer) selectLayer(drag.layer);
  }
  // offsets are bounded so a part can never be flung out of reach entirely
  offsets[drag.layer].x = Math.max(-38, Math.min(38, drag.baseX + dx));
  offsets[drag.layer].y = Math.max(-38, Math.min(38, drag.baseY + dy));
  applyOffset(drag.layer);
  updateSelectBox();
  e.preventDefault();
}

// If a drag left the part's art entirely outside the canvas, pull it back in
// so a sliver stays tappable — the alternative is a part that can only be
// recovered by Randomise, which destroys the whole creation.
function keepInReach(layer) {
  const b = layerBox(layer);
  if (!b) return;
  const o = offsets[layer];
  const MIN = 5;   // at least this many viewBox units stay inside the canvas
  if (b.x + b.w < MIN) o.x += MIN - (b.x + b.w);
  if (b.x > 72 - MIN) o.x -= b.x - (72 - MIN);
  if (b.y + b.h < MIN) o.y += MIN - (b.y + b.h);
  if (b.y > 72 - MIN) o.y -= b.y - (72 - MIN);
  applyOffset(layer);
  updateSelectBox();
}

function onPointerUp() {
  clearTimeout(pressTimer);
  if (!drag || dancing) { drag = null; return; }
  const { layer, moved } = drag;
  drag = null;
  if (moved) { keepInReach(layer); updateUrl(); return; }   // a drag — keep the layer selected where it landed
  // a second tap on the same part in quick succession → restack modal
  if (layer) {
    const now = Date.now();
    if (lastTap.layer === layer && now - lastTap.t < 350) {
      lastTap = { layer: null, t: 0 };
      openMoveTop(layer);
      return;
    }
    lastTap = { layer, t: now };
  }
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
  svg.addEventListener('pointercancel', () => { clearTimeout(pressTimer); drag = null; });
  // long-press must reach the restack timer, not the browser's context menu
  svg.addEventListener('contextmenu', e => e.preventDefault());
}

// ── Stateless share link ──────────────────────────────────────────────────────
// The whole emoji is encoded into the ?e= query param so a link rebuilds it
// exactly — no backend, no storage. Parts are referenced by their STABLE id
// (filename token), not array index, so links survive pack re-curation.
// Format (layers in render order, '.' between):  id[_x_y]
//   e.g.  yellow.1F47F_3_-2.1F600..1F60A_-5_8.
//   empty segment = None; _x_y present only when a layer has been dragged.

// Ids retired by pack curation AFTER share links launched (the 2026-06-19
// dedupe passes), mapped to their surviving visual twin so those links still
// rebuild the same-looking emoji. Twins were verified by rasterising the
// deleted art from git history beside the survivors. Extend this map whenever
// a future curation deletes a part.
const ID_ALIASES = {
  eyes: {
    '1F614': '1F634', '1F624': '1F634', '1F61D': '1F606', '1F62A': '1F605',
    '1F479': '1F600', '1F47F': '1F600', '1F60F': '1F600', '1F612': '1F600',
    '1F974': '1F600', '1F9D0': '1F600', '1FAE1': '1F600',
  },
  mouth: {
    '1F607': '1F60A', '1F61C': '1F61B', '1F621': '1F622', '1F62F': '1F62E',
    '1F929': '1F600', '1F47E': '1F614',
  },
};

// A still-unknown id on a mandatory layer falls back to a neutral part, not
// whatever happens to sort first in the pack (which is how old links grew
// surprise Ogre mouths).
const DEFAULT_IDS = { face: 'yellow', eyes: '1F600', mouth: '1F60A' };

function encodeState() {
  const segs = LAYERS.map(layer => {
    let seg = PARTS[layer][state[layer]].id || '';
    if (seg && MOVABLE.includes(layer)) {
      const o = offsets[layer];
      const x = Math.round(o.x), y = Math.round(o.y);
      if (x || y) seg += '_' + x + '_' + y;
    }
    return seg;
  });
  // restacked layers ride along as a 9th "~z" segment of layer indices; when
  // stacking is default it's omitted (and trailing empty slots dropped) so
  // old links — and old apps opening new links — stay valid
  if (zOrder.join() !== LAYERS.join()) {
    return segs.join('.') + '.~z' + zOrder.map(l => LAYERS.indexOf(l)).join('');
  }
  return segs.join('.').replace(/\.+$/, '');
}

// pure decode — no DOM, no globals mutated (unit tests and gallery thumbnails
// use it too); applyEncoded() below writes the result into the builder state
function decodeState(str) {
  const segs = str.split('.');
  const st = {}, off = {};
  LAYERS.forEach((layer, i) => {
    let seg = segs[i] || '';
    if (seg.startsWith('~')) seg = '';   // a misplaced control segment, not an id
    const f = seg.split('_');
    let id = f[0];
    if (id && ID_INDEX[layer][id] === undefined && ID_ALIASES[layer]) {
      id = ID_ALIASES[layer][id] || id;           // retired id → surviving twin
    }
    let idx = id ? ID_INDEX[layer][id] : 0;       // empty → None/default
    if (idx === undefined) {
      // unknown id: None on optional layers, a neutral part on mandatory ones
      idx = OPTIONAL.has(layer) ? 0 : (ID_INDEX[layer][DEFAULT_IDS[layer]] || 0);
    }
    st[layer] = idx;
    if (MOVABLE.includes(layer)) {
      off[layer] = { x: parseFloat(f[1]) || 0, y: parseFloat(f[2]) || 0 };
    }
  });
  // the optional ~z segment restores the stacking order (must be a complete
  // permutation, otherwise it's ignored and the default order stands)
  let z = LAYERS.slice();
  const zseg = segs.find(s => s.startsWith('~z'));
  if (zseg) {
    const idx = zseg.slice(2).split('').map(c => parseInt(c, 10));
    if (idx.length === LAYERS.length && new Set(idx).size === LAYERS.length &&
        idx.every(i => i >= 0 && i < LAYERS.length)) {
      z = idx.map(i => LAYERS[i]);
    }
  }
  return { state: st, offsets: off, zOrder: z };
}

function applyEncoded(str) {
  const d = decodeState(str);
  LAYERS.forEach(layer => { state[layer] = d.state[layer]; });
  MOVABLE.forEach(layer => { offsets[layer] = d.offsets[layer]; });
  applyZOrder(d.zOrder);
}

function updateUrl() {
  // editing a pack member → every change flows straight into its slot
  if (packActive >= 0) {
    pack[packActive] = encodeState();
    persistPack();
  }
  const u = new URL(location.href);
  u.searchParams.set('e', encodeState());
  if (pack.length) {
    u.searchParams.set('p', packToParam(pack));
    if (packActive >= 0) u.searchParams.set('pi', String(packActive));
    else u.searchParams.delete('pi');
  } else {
    u.searchParams.delete('p');
    u.searchParams.delete('pi');
  }
  history.replaceState(null, '', u);
}

// ── Rasterise, share & save ───────────────────────────────────────────────────
// Serialise the current layers (with their drag offsets) into a self-contained
// SVG — the OpenMoji art has inline fills, so no CSS/fonts are needed — then
// draw it to a canvas and export a transparent PNG. All client-side / offline.

const EXPORT_SIZE = 600;

function buildExportSvg() {
  let inner = '';
  zOrder.forEach(layer => {   // current stacking, so the PNG matches the canvas
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
// Tap sends just the picture; holding Send adds the magic link (issue #33).
async function shareEmoji(withLink) {
  pulse('btn-share');
  if (!withLink) showActionHint('Hold Send to add a magic link ✨');
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

// ── My Emojis gallery ─────────────────────────────────────────────────────────
// The ?e= encoding is already a complete serialization of an emoji, so the
// gallery is just a localStorage list of encoded strings with thumbnails
// rendered from the same decode used by share links. 💾 saves the current
// creation; tapping a thumbnail rebuilds it; ✕ forgets it.

const GALLERY_KEY = 'emojicle-gallery';
const GALLERY_MAX = 24;

function loadGallery() {
  try { return JSON.parse(localStorage.getItem(GALLERY_KEY)) || []; } catch (e) { return []; }
}

function saveGallery(list) {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(list)); } catch (e) {}
}

// inner markup (layers stacked in z-order, offsets applied) for any encoded
// emoji, drawn for the 0 0 72 72 box — thumbnails and the scene designer both
// build on this
function encodedInnerSvg(encoded) {
  const d = decodeState(encoded);
  let inner = '';
  d.zOrder.forEach(layer => {
    const part = PARTS[layer][d.state[layer]];
    if (!part || !part.svg) return;
    const o = d.offsets[layer] || { x: 0, y: 0 };
    const t = (o.x || o.y) ? ` transform="translate(${o.x} ${o.y})"` : '';
    inner += `<g${t}>${part.svg}</g>`;
  });
  return inner;
}

function galleryThumbSvg(encoded) {
  return '<svg viewBox="-8 -8 88 88" class="swatch-svg" aria-hidden="true">' +
         encodedInnerSvg(encoded) + '</svg>';
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';
  const list = loadGallery();
  // saved scenes (scene.js) share this gallery as a shelf below the emojis
  const sceneCount = typeof savedScenesCount === 'function' ? savedScenesCount() : 0;
  if (!list.length && !sceneCount) {
    const p = document.createElement('p');
    p.className = 'gallery-empty';
    p.textContent = 'No saved emojis yet — press 💾 Save to keep this one!';
    grid.appendChild(p);
  }
  list.forEach((encoded, i) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const open = document.createElement('button');
    open.className = 'swatch';
    open.setAttribute('aria-label', 'Load saved emoji ' + (i + 1));
    open.innerHTML = galleryThumbSvg(encoded);
    open.addEventListener('click', () => {
      detachFromPack();   // a gallery load is a standalone emoji, not a member edit
      restoreEncoded(encoded);
      closeGallery();
      showToast('\u{1F60A} Welcome back!');
    });
    const del = document.createElement('button');
    del.className = 'gallery-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Forget saved emoji ' + (i + 1));
    del.addEventListener('click', () => {
      const l = loadGallery();
      l.splice(i, 1);
      saveGallery(l);
      renderGallery();
    });
    item.appendChild(open);
    item.appendChild(del);
    grid.appendChild(item);
  });
  if (sceneCount) renderSceneShelf(grid);
  renderPresetShelf(grid);
}

// ── Starter packs ─────────────────────────────────────────────────────────────
// Curated theme packs (issue #25 pilots the Traveller pack). A preset is just
// a maintained list of ?e= encodings, so loading one goes through the same
// replace-the-pack-with-Undo shape as opening a ?p= link.

const PRESET_PACKS = [{
  id: 'traveller',
  name: 'Traveller pack',
  emoji: '\u{1F9F3}',
  members: [
    'yellow..1F601..1F60A.1F9E2-cap.2708_16_-6',          // pilot, plane flying by
    'orange..1F60C..1F60A.1F452-sun-hat.1F3DD_18_34',     // beach day
    'dotted..1F600..1F62E.1F4F7_0_30',                    // say cheese!
    'green..1F606..1F60B.1F97D-goggles.1F392_-20_32',     // backpacker
    'blue..1F600..1F615.1F9ED_18_32',                     // which way?
    'red..1F601..1F60D.1F576-shades.1F9F3_-20_34',        // jetsetter
    'white..1F60D..1F60C.1F3A7-headphones',               // in-flight playlist
  ],
}];

function loadPresetPack(preset) {
  const prev = { members: pack.slice(), active: packActive };
  pack = preset.members.slice(0, PACK_MAX);
  packActive = -1;
  persistPack();
  renderPackRail();
  updateUrl();
  closeGallery();
  showToast(preset.emoji + ' ' + preset.name + ' loaded!', 'Undo', () => {
    pack = prev.members;
    packActive = prev.active;
    persistPack();
    renderPackRail();
    updateUrl();
  });
}

function renderPresetShelf(grid) {
  const head = document.createElement('h3');
  head.className = 'gallery-sect';
  head.textContent = '✨ Starter packs';
  grid.appendChild(head);
  PRESET_PACKS.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'preset-pack';
    btn.setAttribute('aria-label', 'Load the ' + preset.name);
    btn.innerHTML =
      '<span class="preset-thumbs">' +
      preset.members.map(galleryThumbSvg).join('') +
      '</span><span class="preset-name">' + preset.emoji + ' ' + preset.name + '</span>';
    btn.addEventListener('click', () => loadPresetPack(preset));
    grid.appendChild(btn);
  });
}

function saveCurrentToGallery() {
  const list = loadGallery();
  const enc = encodeState();
  if (!list.includes(enc)) {
    list.unshift(enc);
    if (list.length > GALLERY_MAX) list.pop();
    saveGallery(list);
  }
  renderGallery();
  showToast('\u{1F4BE} Saved to My Emojis!');
}

function openGallery() {
  renderGallery();
  openOverlay(document.getElementById('gallery'), closeGallery);
}

function closeGallery() {
  closeOverlay(document.getElementById('gallery'));
}

// ── Emoji pack ────────────────────────────────────────────────────────────────
// A pack is a little cast of up to 7 emojis that lives around the canvas:
// thumbnails 3-down-the-left / 3-down-the-right (collapsing to a row under the
// canvas on phones) with the active member in the centre being edited. Each
// member is one ?e= encoding, so a whole pack shares as ?p= — the encodings
// joined by '*' (URL-safe, and never appears inside the codec's charset) —
// plus ?pi= for which member is on the canvas. Persisted like the gallery.
//
// packActive is the member the canvas is editing; -1 means the canvas is a
// standalone emoji (fresh Random, a plain ?e= link, a gallery load) and every
// pack member shows in the rail.

const PACK_KEY = 'emojicle-pack';
const PACK_MAX = 7;

let pack = [];        // encoded members, oldest first
let packActive = -1;

const packToParam = members => members.join('*');

function packFromParam(str) {
  if (!str) return [];
  return str.split('*').map(s => s.trim()).filter(Boolean).slice(0, PACK_MAX);
}

function persistPack() {
  try {
    localStorage.setItem(PACK_KEY, JSON.stringify({ members: pack, active: packActive }));
  } catch (e) {}
}

function loadStoredPack() {
  try {
    const d = JSON.parse(localStorage.getItem(PACK_KEY));
    if (d && Array.isArray(d.members)) {
      const members = d.members.filter(m => typeof m === 'string' && m).slice(0, PACK_MAX);
      const active = Number.isInteger(d.active) && d.active >= 0 && d.active < members.length
        ? d.active : -1;
      return { members, active };
    }
  } catch (e) {}
  return null;
}

function renderPackRail() {
  const L = document.getElementById('pack-rail-l');
  const R = document.getElementById('pack-rail-r');
  if (!L || !R) return;
  L.innerHTML = '';
  R.innerHTML = '';

  const shown = pack.map((_, i) => i).filter(i => i !== packActive);
  // balance the two rails (3+3 when full; the odd one goes left)
  const leftCount = Math.min(Math.max(Math.ceil(shown.length / 2), shown.length - 3), 4);
  shown.forEach((mi, pos) => {
    const item = document.createElement('div');
    item.className = 'pack-item';
    const thumb = document.createElement('button');
    thumb.className = 'pack-thumb';
    thumb.setAttribute('aria-label', 'Switch to pack emoji ' + (mi + 1));
    thumb.innerHTML = galleryThumbSvg(pack[mi]);
    thumb.addEventListener('click', () => selectPackMember(mi));
    const del = document.createElement('button');
    del.className = 'pack-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove pack emoji ' + (mi + 1));
    del.addEventListener('click', () => removePackMember(mi));
    item.appendChild(thumb);
    item.appendChild(del);
    (pos < leftCount ? L : R).appendChild(item);
  });

  if (pack.length < PACK_MAX) R.appendChild(packAddButton());
}

// One persistent "+" node, re-appended on every rail render. Rebuilding it
// from scratch each time (like the thumbs) made taps flaky: a render landing
// between a finger's pointerdown and its click replaced the node mid-gesture,
// and the click dispatched to a button that was no longer in the DOM.
let packAddBtn = null;
function packAddButton() {
  if (!packAddBtn) {
    packAddBtn = document.createElement('button');
    packAddBtn.className = 'pack-add';
    packAddBtn.id = 'pack-add';
    packAddBtn.textContent = '+';
    packAddBtn.setAttribute('aria-label', 'Add this emoji to your pack');
    packAddBtn.addEventListener('click', addCurrentToPack);
  }
  return packAddBtn;
}

function addCurrentToPack() {
  if (pack.length >= PACK_MAX) {
    showToast('\u{1F4E6} Pack is full — remove one first!');
    return;
  }
  pack.push(encodeState());
  packActive = pack.length - 1;
  persistPack();
  renderPackRail();
  updateUrl();
  showToast('\u{1F4E6} Added to your pack!');
}

function removePackMember(i) {
  pack.splice(i, 1);
  if (packActive === i) packActive = -1;        // canvas keeps the art, detached
  else if (packActive > i) packActive--;
  persistPack();
  renderPackRail();
  updateUrl();
}

function selectPackMember(i) {
  if (i === packActive || !pack[i]) return;
  packActive = i;
  restoreEncoded(pack[i]);
  renderPackRail();
}

// the canvas stops tracking a member (Random, gallery load, plain ?e= link)
function detachFromPack() {
  if (packActive === -1) return;
  packActive = -1;
  persistPack();
  renderPackRail();
}

// ── Header menu (☰: sound, theme, about) ─────────────────────────────────────
// Sound and dark mode live in a small popover under the header's ☰ button,
// alongside "About Emojicle" — a modal that also carries the OpenMoji credit
// (issue #26 moved it off the always-visible footer).

function initMenu() {
  const menu = document.getElementById('menu');
  const close = () => closeOverlay(menu);
  document.getElementById('btn-menu').addEventListener('click', () =>
    openOverlay(menu, close));
  menu.addEventListener('click', e => {
    if (e.target.id === 'menu') close();   // tap outside the popover
  });
  const about = document.getElementById('about');
  const closeAbout = () => closeOverlay(about);
  document.getElementById('menu-about').addEventListener('click', () => {
    close();
    openOverlay(about, closeAbout);
  });
  document.getElementById('about-close').addEventListener('click', closeAbout);
  about.addEventListener('click', e => {
    if (e.target.id === 'about') closeAbout();
  });
}

// ── Sound toggle (mute) ───────────────────────────────────────────────────────
// A kids app that always makes noise is a parents problem — the menu's 🔊/🔇
// row flips the master GainNode every sound routes through, persisted like
// the theme choice.

function applyMuted() {
  const btn = document.getElementById('menu-sound');
  btn.textContent = muted ? '\u{1F507} Sound is off' : '\u{1F50A} Sound is on';
  btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
}

function initSound() {
  try { muted = localStorage.getItem('emojicle-muted') === '1'; } catch (e) {}
  applyMuted();
  document.getElementById('menu-sound').addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('emojicle-muted', muted ? '1' : '0'); } catch (e) {}
    applyMuted();
  });
}

// ── Theme (dark mode) ─────────────────────────────────────────────────────────
// The head script in index.html stamps data-theme before first paint (saved
// choice, else system preference). The menu's moon/sun row flips and saves
// it; while the user hasn't chosen, we keep following the system live.

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  // show the mode the row switches TO
  document.getElementById('menu-theme').textContent =
    t === 'dark' ? '☀️ Light mode' : '\u{1F319} Dark mode';
}

function initTheme() {
  applyTheme(document.documentElement.dataset.theme || 'light');
  document.getElementById('menu-theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('emojicle-theme', t); } catch (e) {}
    applyTheme(t);
  });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const follow = e => {
    let saved = null;
    try { saved = localStorage.getItem('emojicle-theme'); } catch (err) {}
    if (!saved) applyTheme(e.matches ? 'dark' : 'light');
  };
  if (mq.addEventListener) mq.addEventListener('change', follow);
  else if (mq.addListener) mq.addListener(follow);   // older iOS Safari
}

// ── Service Worker ────────────────────────────────────────────────────────────

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // a new version installing behind an existing one → offer a reload, so
    // "where did this new game come from?" has an answer
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('✨ New stuff!', 'Reload', () => location.reload());
        }
      });
    });
  }).catch(() => {});
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  buildControls();
  buildDancePicker();
  initDrag();
  initMenu();
  initTheme();
  initSound();
  initCanvasKeys();
  document.getElementById('btn-random').addEventListener('click', randomise);
  addLongPress(document.getElementById('btn-dance'), onDanceButton, onDanceHold);
  addLongPress(document.getElementById('btn-share'),
               () => shareEmoji(false), () => shareEmoji(true));
  document.getElementById('btn-gallery').addEventListener('click', openGallery);
  document.getElementById('gallery-save').addEventListener('click', saveCurrentToGallery);
  document.getElementById('gallery-close').addEventListener('click', closeGallery);
  document.getElementById('gallery').addEventListener('click', e => {
    if (e.target.id === 'gallery') closeGallery();
  });

  document.getElementById('picker-close').addEventListener('click', closePicker);
  document.getElementById('picker-remove').addEventListener('click', () => {
    if (pickerLayer) removeExtra(pickerLayer);
    closePicker();
  });
  document.getElementById('picker').addEventListener('click', e => {
    if (e.target.id === 'picker') closePicker();
  });
  document.getElementById('dance-picker-close').addEventListener('click', closeDancePicker);
  document.getElementById('dance-picker').addEventListener('click', e => {
    if (e.target.id === 'dance-picker') closeDancePicker();
  });
  document.getElementById('move-top-yes').addEventListener('click', confirmMoveTop);
  document.getElementById('move-top-back').addEventListener('click', confirmMoveBack);
  document.getElementById('move-top-cancel').addEventListener('click', closeMoveTop);
  document.getElementById('move-top').addEventListener('click', e => {
    if (e.target.id === 'move-top') closeMoveTop();
  });

  // Pack first: a ?p= link brings a whole pack (replacing the stored one,
  // with an Undo); otherwise the on-device pack comes back. Then the canvas:
  // an explicit ?e= wins, else the pack's active member, else random.
  const q = new URLSearchParams(location.search);
  const linkPack = packFromParam(q.get('p'));
  const stored = loadStoredPack();
  if (linkPack.length) {
    pack = linkPack;
    const pi = parseInt(q.get('pi'), 10);
    packActive = Number.isInteger(pi) && pi >= 0 && pi < pack.length ? pi : -1;
    const replaced = stored && stored.members.length &&
      packToParam(stored.members) !== packToParam(linkPack);
    persistPack();
    if (replaced) {
      showToast('\u{1F4E6} New pack loaded!', 'Undo', () => {
        pack = stored.members;
        packActive = stored.active;
        persistPack();
        renderPackRail();
        if (packActive >= 0) restoreEncoded(pack[packActive]);
        else updateUrl();
      });
    }
  } else if (stored) {
    pack = stored.members;
    packActive = stored.active;
  }

  const e = q.get('e');
  if (e && !linkPack.length) packActive = -1;   // a plain emoji link is standalone
  const enc = e || (packActive >= 0 ? pack[packActive] : null);
  // Nothing to restore lands on the plain smiley, not a random face —
  // randomise() stays reserved for the explicit Random button.
  applyEncoded(enc || LAYERS.map(l => DEFAULT_IDS[l] || '').join('.'));
  renderAll();
  MOVABLE.forEach(applyOffset);
  updateUrl();   // normalise the URL to the canonical encoding
  renderPackRail();
  syncExtraSlots();   // reveal any extras slots a share link populated
  booted = true;      // from here on, Random offers an Undo
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
