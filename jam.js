'use strict';

// ── Jam Session — a musical-instruments minigame (issue #8) ──────────────────
// The emoji from the builder becomes a musician: it sits on a stool on a
// little curtained stage while the player taps one of three instruments —
// Drums, Xylophone or Piano — filling the bottom of the screen. Every hit is
// synthesized (Web Audio, no samples) and swings the emoji's arms up on stage.
//
// Record (●) captures one take — every note tagged with its instrument and
// timestamp — persisted to localStorage; Play (▶) replays it through the
// synth on a loop (the recorded length, trailing silence included, is the
// loop period) until Stop is pressed, switching the visible instrument to
// follow the take. Share (📤) turns the take into a stateless ?j= link (same
// trick as the builder's ?e=) so kids can send songs to grandparents; opening
// such a link opens the Jam with the song loaded and ready to play.
//
// Challenge (🎯) opens a song picker: simple public-domain kids' tunes plus
// rhythm-only drum patterns. Each is taught phrase by phrase — the game
// demonstrates, the player echoes with a glowing guide — then the whole song
// is performed with subtle guides and scored out of 100 (notes hit + timing).
// Best score per song persists.
//
// Keyboard play: 1–9/0/-/= strike the current instrument's keys in order
// (piano white keys), and Q–I reach the piano's black keys.
//
// Reads the builder's globals plus GameKit from games-common.js, and registers
// in window.MINIGAMES.

(function () {

const { el, clamp, sfx } = GameKit;

// ── Pitch helpers ─────────────────────────────────────────────────────────────

const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function freqOf(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  const midi = (Number(m[2]) + 1) * 12 + SEMI[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Synth (Web Audio, per-instrument timbres — no audio files) ───────────────

let noiseBuf = null;

function noiseSrc(ctx) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function env(ctx, t, peak, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(audioBus(ctx));   // the app-wide master bus, so mute is total
  return g;
}

// piano: triangle fundamental + a quiet sine an octave up, ~1s ring
function pianoNote(ctx, t, freq, vol) {
  const g = env(ctx, t, 0.15 * vol, 1.0);
  [[freq, 'triangle', 1], [freq * 2, 'sine', 0.3]].forEach(([f, type, mix]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = mix;
    o.connect(og);
    og.connect(g);
    o.start(t);
    o.stop(t + 1.05);
  });
}

// xylophone: bright bell — sine + a fast-dying inharmonic partial
function xyloNote(ctx, t, freq, vol) {
  const g = env(ctx, t, 0.2 * vol, 0.5);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  o.connect(g);
  o.start(t);
  o.stop(t + 0.55);
  const p = ctx.createOscillator();
  p.type = 'sine';
  p.frequency.value = freq * 2.76;   // first bar overtone — the "wooden" ping
  const pg = env(ctx, t, 0.07 * vol, 0.12);
  p.connect(pg);
  p.start(t);
  p.stop(t + 0.17);
}

function drumNote(ctx, t, pad, vol) {
  if (pad === 'kick') {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    o.connect(env(ctx, t, 0.5 * vol, 0.3));
    o.start(t);
    o.stop(t + 0.35);
  } else if (pad === 'tom') {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(105, t + 0.2);
    o.connect(env(ctx, t, 0.35 * vol, 0.25));
    o.start(t);
    o.stop(t + 0.3);
  } else if (pad === 'snare') {
    const n = noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    n.connect(f);
    f.connect(env(ctx, t, 0.25 * vol, 0.18));
    n.start(t);
    n.stop(t + 0.2);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    o.connect(env(ctx, t, 0.18 * vol, 0.1));
    o.start(t);
    o.stop(t + 0.12);
  } else {   // hihat / cymbal — filtered noise, short vs long shimmer
    const long = pad === 'cymbal';
    const n = noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = long ? 5000 : 7000;
    n.connect(f);
    f.connect(env(ctx, t, (long ? 0.2 : 0.15) * vol, long ? 0.8 : 0.07));
    n.start(t);
    n.stop(t + (long ? 0.85 : 0.1));
  }
}

// every note — live, playback or demo — goes through here
function playKey(instId, key, vol) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime + 0.015;
  const v = vol || 1;
  if (instId === 'drums') drumNote(ctx, t, key, v);
  else if (instId === 'xylo') xyloNote(ctx, t, freqOf(key), v);
  else pianoNote(ctx, t, freqOf(key), v);
}

const SFX = {
  praise: () => sfx((c, t) => [659.25, 880].forEach((f, i) => note(c, t + i * 0.1, f, 0.15, { vol: 0.08 }))),
  win:    () => sfx((c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, t + i * 0.13, f, 0.18, { vol: 0.09 }))),
  oops:   () => sfx((c, t) => note(c, t, 160, 0.12, { type: 'sine', vol: 0.05 })),
};

// ── Instruments ───────────────────────────────────────────────────────────────
// All three surfaces live in a 0 0 72 88 viewBox. Each builder paints the art,
// registers a transparent "glow" overlay per key (flash/guide highlights sit
// on top of the art, uniform across instruments) and returns a hit-tester.

const INSTRUMENTS = {
  drums: { name: 'Drums', emoji: '\u{1F941}' },
  xylo:  { name: 'Xylophone', emoji: '\u{1F3B6}' },
  piano: { name: 'Piano', emoji: '\u{1F3B9}' },
};
const INST_ORDER = ['drums', 'xylo', 'piano'];

const PIANO_WHITES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'];
// black key after white index i (i.e. between whites i and i+1)
const PIANO_BLACKS = [
  { k: 'C#4', i: 0 }, { k: 'D#4', i: 1 }, { k: 'F#4', i: 3 }, { k: 'G#4', i: 4 },
  { k: 'A#4', i: 5 }, { k: 'C#5', i: 7 }, { k: 'D#5', i: 8 }, { k: 'F#5', i: 10 },
];
const BLACK_H = 52;

function buildPiano(svg, keys) {
  el('rect', { x: 0, y: 0, width: 72, height: 88, rx: 3, fill: '#3B3B3B' }, svg);
  const glows = [];
  PIANO_WHITES.forEach((k, i) => {
    el('rect', { x: i * 6 + 0.35, y: 0.8, width: 5.3, height: 86.4, rx: 1.4,
      fill: '#FFFFFF', stroke: '#B9C4CE', 'stroke-width': 0.3 }, svg);
    // glow only on the wide tail so it never paints over the black keys
    glows.push([k, { x: i * 6 + 0.35, y: BLACK_H + 1.5, width: 5.3, height: 86.4 - BLACK_H - 1.2, rx: 1.4 }]);
  });
  PIANO_BLACKS.forEach(({ k, i }) => {
    el('rect', { x: (i + 1) * 6 - 1.9, y: 0.8, width: 3.8, height: BLACK_H, rx: 1, fill: '#2B2B2B' }, svg);
    glows.push([k, { x: (i + 1) * 6 - 1.9, y: 0.8, width: 3.8, height: BLACK_H, rx: 1 }]);
  });
  const glowG = el('g', {}, svg);
  glows.forEach(([k, attrs]) => { keys[k] = el('rect', { ...attrs, class: 'jam-glow' }, glowG); });
  return p => {
    if (p.x < 0 || p.x > 72 || p.y < 0 || p.y > 88) return null;
    if (p.y < BLACK_H + 0.8) {
      const b = PIANO_BLACKS.find(({ i }) => Math.abs(p.x - ((i + 1) * 6)) <= 1.9);
      if (b) return b.k;
    }
    return PIANO_WHITES[clamp(Math.floor(p.x / 6), 0, 11)];
  };
}

const XYLO_NOTES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];
const XYLO_COLORS = ['#E53E3E', '#F97316', '#F6C026', '#9ACD32', '#2BB673',
                     '#26C6DA', '#4A90E2', '#7E57C2', '#C2185B', '#FF6F91'];
const XYLO_X = i => 0.95 + i * 7.1;
const XYLO_H = i => 78 - i * 3.8;   // longest bar = lowest note, like the real thing

function buildXylo(svg, keys) {
  el('rect', { x: 0, y: 0, width: 72, height: 88, rx: 3, fill: '#F4E9D8' }, svg);
  [28, 57].forEach(y => el('rect', { x: 0.5, y, width: 71, height: 3, rx: 1.5, fill: '#8B5A2B' }, svg));
  const glowG = el('g', {}, svg);
  XYLO_NOTES.forEach((k, i) => {
    const h = XYLO_H(i), x = XYLO_X(i), y = (88 - h) / 2;
    el('rect', { x, y, width: 6.2, height: h, rx: 2.6, fill: XYLO_COLORS[i],
      stroke: 'rgba(43,43,43,0.25)', 'stroke-width': 0.4 }, svg);
    [y + 3.6, y + h - 3.6].forEach(cy =>
      el('circle', { cx: x + 3.1, cy, r: 0.9, fill: 'rgba(43,43,43,0.3)' }, svg));
    keys[k] = el('rect', { x, y, width: 6.2, height: h, rx: 2.6, class: 'jam-glow' }, glowG);
  });
  return p => {
    const i = clamp(Math.floor((p.x - 0.95) / 7.1), 0, 9);
    const h = XYLO_H(i), y = (88 - h) / 2;
    return (p.y > y - 4 && p.y < y + h + 4) ? XYLO_NOTES[i] : null;
  };
}

const DRUM_PADS = [
  { k: 'hihat',  x: 14, y: 19, r: 10.5 },
  { k: 'cymbal', x: 57, y: 16, r: 12 },
  { k: 'snare',  x: 17, y: 47, r: 11.5 },
  { k: 'tom',    x: 54, y: 45, r: 11 },
  { k: 'kick',   x: 36, y: 70, r: 15 },
];

function buildDrums(svg, keys) {
  el('rect', { x: 0, y: 0, width: 72, height: 88, rx: 3, fill: '#EFE7F7' }, svg);
  el('ellipse', { cx: 36, cy: 46, rx: 34, ry: 40, fill: '#E3D6F0' }, svg);
  const glowG = el('g', {}, svg);
  DRUM_PADS.forEach(({ k, x, y, r }) => {
    const g = el('g', {}, svg);
    if (k === 'hihat' || k === 'cymbal') {
      el('circle', { cx: x, cy: y, r, fill: k === 'cymbal' ? '#FFD93B' : '#F6C026',
        stroke: '#DBA800', 'stroke-width': 0.8 }, g);
      el('circle', { cx: x, cy: y, r: r * 0.55, fill: 'none', stroke: '#DBA800',
        'stroke-width': 0.5, opacity: 0.6 }, g);
      el('circle', { cx: x, cy: y, r: 1.6, fill: '#B98A00' }, g);
    } else if (k === 'kick') {
      el('circle', { cx: x, cy: y, r, fill: '#E53E3E' }, g);
      el('circle', { cx: x, cy: y, r: r - 3, fill: '#FFF7EE', stroke: '#D9C9B4', 'stroke-width': 0.5 }, g);
      const star = el('text', { x, y: y + 2.4, 'font-size': 7, 'text-anchor': 'middle' }, g);
      star.textContent = '⭐';
    } else {
      el('circle', { cx: x, cy: y, r, fill: k === 'snare' ? '#F7F7F7' : '#9BC4F2',
        stroke: k === 'snare' ? '#E53E3E' : '#3A6FB0', 'stroke-width': 1.6 }, g);
      el('circle', { cx: x, cy: y, r: r - 3.4, fill: 'none',
        stroke: 'rgba(43,43,43,0.12)', 'stroke-width': 0.5 }, g);
    }
    keys[k] = el('circle', { cx: x, cy: y, r, class: 'jam-glow' }, glowG);
  });
  return p => {
    let hit = null, hd = Infinity;
    DRUM_PADS.forEach(({ k, x, y, r }) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r + 2.5 && d < hd) { hd = d; hit = k; }
    });
    return hit;
  };
}

const BUILDERS = { piano: buildPiano, xylo: buildXylo, drums: buildDrums };

// keyboard rows: digits strike the instrument's keys in order (piano white
// keys); QWERTY's top row reaches the piano's black keys
const KEY_LISTS = {
  drums: DRUM_PADS.map(p => p.k),
  xylo: XYLO_NOTES,
  piano: PIANO_WHITES,
};
const DIGIT_ROW = '1234567890-=';
const BLACK_ROW = 'qwertyui';

// ── Songs ─────────────────────────────────────────────────────────────────────
// Simple public-domain kids' tunes for the melodic instruments (piano C4–G5
// white keys, xylophone C5–E6) plus rhythm-only patterns for the drums.
// `score` is a compact string: notes/pads separated by spaces, `:n` = length
// in beats (default 1), `|` splits the teaching phrases.

const SONG_DEFS = [
  { id: 'hotcross', name: 'Hot Cross Buns', icon: '\u{1F950}', inst: 'xylo', beat: 500,
    score: 'E5 D5 C5:2 E5 D5 C5:2 | C5:0.5 C5:0.5 C5:0.5 C5:0.5 D5:0.5 D5:0.5 D5:0.5 D5:0.5 | E5 D5 C5:2' },
  { id: 'stomp', name: 'Stomp Stomp Clap', icon: '\u{1F4A5}', inst: 'drums', beat: 520,
    score: 'kick kick snare:2 kick kick snare:2 | kick kick snare:2 kick kick snare:2 | kick kick snare kick kick snare cymbal:2' },
  { id: 'twinkle', name: 'Twinkle Twinkle', icon: '⭐', inst: 'piano', beat: 480,
    score: 'C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2 | G4 G4 F4 F4 E4 E4 D4:2 | G4 G4 F4 F4 E4 E4 D4:2 | C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2' },
  { id: 'mary', name: 'Mary Had a Little Lamb', icon: '\u{1F411}', inst: 'xylo', beat: 450,
    score: 'E5 D5 C5 D5 E5 E5 E5:2 | D5 D5 D5:2 E5 G5 G5:2 | E5 D5 C5 D5 E5 E5 E5 E5 | D5 D5 E5 D5 C5:2' },
  { id: 'march', name: 'Marching Band', icon: '\u{1F3BA}', inst: 'drums', beat: 450,
    score: 'kick snare kick snare | kick kick snare:2 kick kick snare:2 | kick snare kick snare hihat hihat snare:2 | kick kick snare hihat kick kick cymbal:2' },
  { id: 'row', name: 'Row Your Boat', icon: '\u{1F6A3}', inst: 'xylo', beat: 420,
    score: 'C5 C5 C5 D5 E5:2 | E5 D5 E5 F5 G5:2 | C6 C6 C6 G5 G5 G5 E5 E5 E5 C5 C5 C5 | G5 F5 E5 D5 C5:2' },
  { id: 'oldmac', name: 'Old MacDonald', icon: '\u{1F69C}', inst: 'piano', beat: 430,
    score: 'F4 F4 F4 C4 D4 D4 C4:2 | A4 A4 G4 G4 F4:2 | C4 F4 F4 F4 C4 D4 D4 C4:2 | A4 A4 G4 G4 F4:2' },
  { id: 'heartbeat', name: 'Heartbeat Drum', icon: '\u{1F493}', inst: 'drums', beat: 400,
    score: 'kick:0.5 kick:1.5 kick:0.5 kick:1.5 | tom:0.5 tom:1.5 tom:0.5 tom:1.5 | kick:0.5 kick:1.5 tom:0.5 tom:1.5 kick:0.5 kick:1.5 cymbal:2' },
  { id: 'london', name: 'London Bridge', icon: '\u{1F309}', inst: 'xylo', beat: 430,
    score: 'G5 A5 G5 F5 E5 F5 G5:2 | D5 E5 F5:2 E5 F5 G5:2 | G5 A5 G5 F5 E5 F5 G5:2 | D5:2 G5:2 E5 C5:2' },
  { id: 'frere', name: 'Frère Jacques', icon: '\u{1F514}', inst: 'piano', beat: 430,
    score: 'G4 A4 B4 G4 G4 A4 B4 G4 | B4 C5 D5:2 B4 C5 D5:2 | D5:0.5 E5:0.5 D5:0.5 C5:0.5 B4 G4 D5:0.5 E5:0.5 D5:0.5 C5:0.5 B4 G4 | G4 D4 G4:2 G4 D4 G4:2' },
  { id: 'itsy', name: 'Itsy Bitsy Spider', icon: '\u{1F577}️', inst: 'xylo', beat: 430,
    score: 'C5 C5 C5 D5 E5:2 | E5 D5 C5 D5 E5 C5:2 | E5 E5 F5 G5:2 G5 F5 E5 F5 G5 E5:2 | C5 C5 D5 E5:2 E5 D5 C5 D5 E5 C5:2' },
  { id: 'ode', name: 'Ode to Joy', icon: '\u{1F3BC}', inst: 'piano', beat: 400,
    score: 'E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
  { id: 'birthday', name: 'Happy Birthday', icon: '\u{1F382}', inst: 'piano', beat: 440,
    score: 'G4 G4 A4:2 G4:2 C5:2 B4:3 | G4 G4 A4:2 G4:2 D5:2 C5:3 | G4 G4 G5:2 E5:2 C5:2 B4:2 A4:2 | F5 F5 E5:2 C5:2 D5:2 C5:3' },
];

function parseSong(def) {
  const notes = [], sections = [];
  let at = 0;
  def.score.split('|').forEach(part => {
    const start = notes.length;
    part.trim().split(/\s+/).forEach(tok => {
      const [k, b] = tok.split(':');
      const beats = b ? parseFloat(b) : 1;
      notes.push({ k, beats, at });
      at += beats;
    });
    sections.push([start, notes.length]);
  });
  return { ...def, notes, sections };
}

const SONGS = SONG_DEFS.map(parseSong);

// ── State ─────────────────────────────────────────────────────────────────────

const TAKE_KEY = 'emojicle-jam-take';
const BEST_KEY = 'emojicle-jam-best';
const REC_CAP_MS = 30000;

let open = false;
let inst = 'drums';
let take = null;        // [{i, k, t}] — the one persisted recording
let takeDur = 0;        // the take's length in ms (records the trailing silence too)
let recording = null;   // {start, notes} while capturing
let playback = null;    // {start, idx, loop} while replaying the take on repeat
let ch = null;          // challenge state
let bests = {};         // songId → best score
let raf = 0;
let armSide = 0;
let guided = null;      // the key currently wearing a guide glow
let keyEls = {};        // key id → glow element (current instrument only)
let hitTest = null;
let msgTimer = null;
const activePtrs = new Map();   // pointerId → last key (glissando + multi-touch)

// DOM refs, resolved once in initJam
let overlay, stageSvg, surfSvg, msgEl, instRow, btnRec, btnPlay, btnShare, btnChal,
    songsPanel, songListEl, resultsPanel, arms;

const PRAISE = ['Nice! \u{1F31F}', 'Lovely! \u{1F3B6}', 'You got it! \u{1F44F}', 'Sounding great! \u{1F3A7}'];

// ── The stage (top quarter): curtains, spotlight, stool, emoji + arms ─────────

function armGroup(side, prop) {
  // side −1 = left, +1 = right; shoulder at the face's edge, hand over the
  // instrument in front. The .hit class swings it from the shoulder.
  const sx = 36 + side * 4.5, hx = 36 + side * 6.5;
  const g = el('g', { class: 'jam-arm ' + (side < 0 ? 'arm-l' : 'arm-r') }, stageSvg);
  el('path', { d: `M${sx} 15 Q${sx + side * 4.5} 20 ${hx} 24.5`,
    fill: 'none', stroke: '#2B2B2B', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
  if (prop === 'stick') {
    el('line', { x1: hx, y1: 24.5, x2: hx - side * 5.5, y2: 27.5,
      stroke: '#C98A4B', 'stroke-width': 1, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: hx - side * 5.5, cy: 27.5, r: 0.8, fill: '#8B5A2B' }, g);
  } else if (prop === 'mallet') {
    el('line', { x1: hx, y1: 24.5, x2: hx - side * 2, y2: 28.5,
      stroke: '#C98A4B', 'stroke-width': 0.9, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: hx - side * 2, cy: 28.5, r: 1.4, fill: side < 0 ? '#E53E3E' : '#4A90E2' }, g);
  }
  el('circle', { cx: hx, cy: 24.5, r: 1.7, fill: '#FFFFFF', stroke: '#2B2B2B', 'stroke-width': 0.7 }, g);
  return g;
}

function miniDrums(s) {
  el('line', { x1: 20, y1: 26, x2: 20, y2: 31, stroke: '#6E6E6E', 'stroke-width': 0.7 }, s);
  el('ellipse', { cx: 20, cy: 25.6, rx: 2.6, ry: 0.9, fill: '#F6C026', stroke: '#DBA800', 'stroke-width': 0.3 }, s);
  el('line', { x1: 52, y1: 25, x2: 52, y2: 31, stroke: '#6E6E6E', 'stroke-width': 0.7 }, s);
  el('ellipse', { cx: 52, cy: 24.6, rx: 3, ry: 1, fill: '#FFD93B', stroke: '#DBA800', 'stroke-width': 0.3 }, s);
  [[27.5, '#F7F7F7', '#E53E3E'], [44.5, '#9BC4F2', '#3A6FB0']].forEach(([cx, fill, rim]) => {
    el('rect', { x: cx - 3.2, y: 26, width: 6.4, height: 3.6, rx: 0.8, fill: rim }, s);
    el('ellipse', { cx, cy: 26, rx: 3.2, ry: 1.2, fill, stroke: rim, 'stroke-width': 0.4 }, s);
  });
  el('circle', { cx: 36, cy: 28.6, r: 4.6, fill: '#E53E3E' }, s);
  el('circle', { cx: 36, cy: 28.6, r: 3.2, fill: '#FFF7EE' }, s);
}

function miniXylo(s) {
  el('path', { d: 'M25 24.5 L47 24.5 L44.5 31 L27.5 31 Z', fill: '#8B5A2B' }, s);
  for (let i = 0; i < 6; i++) {
    const h = 5.6 - i * 0.55;
    el('rect', { x: 27.2 + i * 3, y: 27.75 - h / 2, width: 2.2, height: h, rx: 0.8,
      fill: XYLO_COLORS[i * 2] }, s);
  }
}

function miniPiano(s) {
  el('rect', { x: 24, y: 22.5, width: 24, height: 9, rx: 1, fill: '#6B4226' }, s);
  el('rect', { x: 25.2, y: 27.2, width: 21.6, height: 3.2, rx: 0.5, fill: '#FFFFFF' }, s);
  for (let i = 1; i < 9; i++)
    el('line', { x1: 25.2 + i * 2.4, y1: 27.2, x2: 25.2 + i * 2.4, y2: 30.4,
      stroke: '#B9C4CE', 'stroke-width': 0.3 }, s);
  for (let i = 0; i < 8; i++) {
    if (i % 7 === 2 || i % 7 === 6) continue;
    el('rect', { x: 26.9 + i * 2.4, y: 27.2, width: 1.1, height: 1.9, fill: '#2B2B2B' }, s);
  }
}

const MINI = { drums: miniDrums, xylo: miniXylo, piano: miniPiano };
const PROPS = { drums: 'stick', xylo: 'mallet', piano: null };

function drawStage() {
  const s = stageSvg;
  s.innerHTML = '';
  el('rect', { x: 0, y: 0, width: 72, height: 34, fill: '#4A3B63' }, s);
  el('polygon', { points: '29,0 43,0 58,21 14,21', fill: 'rgba(255,240,190,0.18)' }, s);
  el('rect', { x: 0, y: 20, width: 72, height: 14, fill: '#8B5A2B' }, s);
  el('rect', { x: 0, y: 20, width: 72, height: 1.1, fill: '#A9713B' }, s);
  el('ellipse', { cx: 36, cy: 21.5, rx: 23, ry: 2.6, fill: 'rgba(255,240,190,0.22)' }, s);
  for (let x = 9; x < 72; x += 13)
    el('line', { x1: x, y1: 21.2, x2: x - 2, y2: 34, stroke: 'rgba(43,43,43,0.18)', 'stroke-width': 0.5 }, s);
  // curtains: scalloped valance + side drapes
  el('rect', { x: 0, y: 0, width: 72, height: 2.6, fill: '#C0392B' }, s);
  for (let cx = 3.5; cx < 72; cx += 7)
    el('circle', { cx, cy: 2.6, r: 3.5, fill: '#C0392B' }, s);
  el('path', { d: 'M0 0 Q7 9 4 22 L0 22 Z', fill: '#A93226' }, s);
  el('path', { d: 'M72 0 Q65 9 68 22 L72 22 Z', fill: '#A93226' }, s);
  // stool
  el('line', { x1: 33, y1: 21, x2: 31, y2: 27.5, stroke: '#6B4226', 'stroke-width': 1.1 }, s);
  el('line', { x1: 39, y1: 21, x2: 41, y2: 27.5, stroke: '#6B4226', 'stroke-width': 1.1 }, s);
  el('ellipse', { cx: 36, cy: 20.6, rx: 5.2, ry: 1.7, fill: '#C98A4B', stroke: '#8B5A2B', 'stroke-width': 0.5 }, s);
  // the musician (face centred at 36,13 → scale 0.24 of the 72-box snapshot)
  const head = el('g', { transform: 'translate(27.36 4.36) scale(0.24)' }, s);
  head.innerHTML = GameKit.emojiSnapshotSvg();
  // instrument in front, then arms on top so the hands hold it
  MINI[inst](s);
  arms = [armGroup(-1, PROPS[inst]), armGroup(1, PROPS[inst])];
}

// one quick swing per note; alternating hands, restartable mid-swing
function bopArm() {
  if (!arms) return;
  armSide = 1 - armSide;
  const a = arms[armSide];
  a.classList.remove('hit');
  void a.getBoundingClientRect();   // restart the transition if mid-swing
  a.classList.add('hit');
  clearTimeout(a._bop);
  a._bop = setTimeout(() => a.classList.remove('hit'), 120);
}

// ── Surface, highlights & guides ──────────────────────────────────────────────

function buildSurface() {
  surfSvg.innerHTML = '';
  keyEls = {};
  hitTest = BUILDERS[inst](surfSvg, keyEls);
  guided = null;
  activePtrs.clear();
}

function flashKey(k, cls, ms) {
  const g = keyEls[k];
  if (!g) return;
  const c = cls || 'jam-on';
  g.classList.add(c);
  clearTimeout(g['_t' + c]);
  g['_t' + c] = setTimeout(() => g.classList.remove(c), ms || 180);
}

function setGuide(k, soft) {
  if (guided && keyEls[guided]) keyEls[guided].classList.remove('jam-guide', 'jam-guide-soft');
  guided = k;
  if (k && keyEls[k]) keyEls[k].classList.add(soft ? 'jam-guide-soft' : 'jam-guide');
}

// ── Messages ──────────────────────────────────────────────────────────────────

function setMsg(txt, cls) {
  msgEl.textContent = txt;
  msgEl.className = 'clinic-msg jam-msg' + (cls ? ' ' + cls : '');
}

function freeMsg() {
  if (playback) setMsg('\u{1F501} Playing on a loop — press ■ to stop');
  else setMsg(take ? 'Jam away — press ▶ to hear your song!' : 'Tap away — or press ● to record a song!');
}

function flashMsg(txt, cls) {
  setMsg(txt, cls || 'praise');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    if (!open) return;
    if (ch) chMsg();
    else freeMsg();
  }, 1500);
}

// ── Live input ────────────────────────────────────────────────────────────────

function onKey(k) {
  playKey(inst, k);
  flashKey(k);
  bopArm();
  if (recording) recording.notes.push({ i: inst, k, t: Math.round(performance.now() - recording.start) });
  if (ch) challengeInput(k);
}

function onDown(e) {
  if (!open) return;
  const p = GameKit.svgPoint(surfSvg, e);
  if (!p) return;
  const k = hitTest(p);
  if (k) {
    activePtrs.set(e.pointerId, k);
    onKey(k);
  }
  if (surfSvg.setPointerCapture) try { surfSvg.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}

function onMove(e) {
  if (!open || !activePtrs.has(e.pointerId)) return;
  const p = GameKit.svgPoint(surfSvg, e);
  if (!p) return;
  const k = hitTest(p);
  if (k && k !== activePtrs.get(e.pointerId)) {   // glissando!
    activePtrs.set(e.pointerId, k);
    onKey(k);
  }
  e.preventDefault();
}

function onUp(e) {
  activePtrs.delete(e.pointerId);
}

// digits (and QWERTY for piano black keys) play the current instrument
function onKeyboard(e) {
  if (!open || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  let k = null;
  const di = DIGIT_ROW.indexOf(e.key);
  if (di >= 0) {
    const list = KEY_LISTS[inst];
    if (di < list.length) k = list[di];
  } else if (inst === 'piano') {
    const bi = BLACK_ROW.indexOf(e.key.toLowerCase());
    if (bi >= 0) k = PIANO_BLACKS[bi].k;
  }
  if (k) {
    onKey(k);
    e.preventDefault();
  }
}

// ── Recording & playback ──────────────────────────────────────────────────────

function saveTake() {
  try {
    if (take) localStorage.setItem(TAKE_KEY, JSON.stringify({ v: 1, notes: take, dur: takeDur }));
    else localStorage.removeItem(TAKE_KEY);
  } catch (e) {}
}

function loadTake() {
  try {
    const d = JSON.parse(localStorage.getItem(TAKE_KEY));
    if (d && Array.isArray(d.notes) && d.notes.length) {
      take = d.notes;
      takeDur = d.dur || take[take.length - 1].t + 800;   // pre-dur takes: pad the tail
    }
  } catch (e) {}
}

function startRecord() {
  if (playback) stopPlayback();
  take = null;            // the old take is gone once a new recording starts
  saveTake();
  recording = { start: performance.now(), notes: [] };
  setMsg('Recording! Play your song \u{1F399}️', 'flash');
  updateButtons();
}

function stopRecord() {
  const got = recording.notes.length > 0;
  take = got ? recording.notes : null;
  if (got) {
    takeDur = Math.min(Math.round(performance.now() - recording.start), REC_CAP_MS);
    takeDur = Math.max(takeDur, take[take.length - 1].t + 50);
  }
  recording = null;
  saveTake();
  flashMsg(got ? 'Saved! Press ▶ to hear it \u{1F4BE}' : 'All quiet! Press ● and play something');
  updateButtons();
}

function onRecordBtn() {
  if (ch) return;
  if (recording) stopRecord();
  else startRecord();
}

function startPlayback() {
  // loop period: the recorded length, but never a machine-gun for tiny takes
  const loop = Math.max(takeDur, take[take.length - 1].t + 600, 900);
  playback = { start: performance.now(), idx: 0, loop };
  clearTimeout(msgTimer);
  freeMsg();   // shows the "playing on a loop" line while playback is live
  updateButtons();
}

function stopPlayback() {
  playback = null;
  updateButtons();
  if (open && !ch) freeMsg();
}

function onPlayBtn() {
  if (ch) return;
  if (playback) { stopPlayback(); return; }
  if (recording) stopRecord();
  if (take) startPlayback();
}

// ── Share a take as a stateless ?j= link ──────────────────────────────────────
// Same trick as the builder's ?e=: the whole recording is encoded into the
// URL, no backend. Format: 1~<dur36>~<note>-<note>-…  where each note is
// <instrument letter><key index base36>.<delta ms/10 base36>. Keys are
// addressed by index into the instrument's stable key list.

const INST_CHAR = { drums: 'd', xylo: 'x', piano: 'p' };
const CHAR_INST = { d: 'drums', x: 'xylo', p: 'piano' };
const SHARE_KEYS = {
  drums: KEY_LISTS.drums,
  xylo: XYLO_NOTES,
  piano: PIANO_WHITES.concat(PIANO_BLACKS.map(b => b.k)),
};

function encodeTake() {
  let prev = 0;
  const toks = take.map(n => {
    const ki = SHARE_KEYS[n.i].indexOf(n.k);
    const dt = Math.max(0, Math.round((n.t - prev) / 10));
    prev = n.t;
    return INST_CHAR[n.i] + ki.toString(36) + '.' + dt.toString(36);
  });
  return '1~' + Math.round(takeDur / 10).toString(36) + '~' + toks.join('-');
}

function decodeTake(str) {
  const m = /^1~([0-9a-z]+)~(.+)$/.exec(str || '');
  if (!m) return null;
  const notes = [];
  let t = 0;
  for (const tok of m[2].split('-')) {
    const f = /^([dxp])([0-9a-z])\.([0-9a-z]+)$/.exec(tok);
    if (!f) return null;
    const i = CHAR_INST[f[1]];
    const k = SHARE_KEYS[i][parseInt(f[2], 36)];
    if (!k) return null;
    t += parseInt(f[3], 36) * 10;
    notes.push({ i, k, t });
  }
  return notes.length ? { notes, dur: parseInt(m[1], 36) * 10 } : null;
}

async function onShareBtn() {
  if (!take || ch) return;
  const u = new URL(location.href);
  u.searchParams.set('j', encodeTake());
  const url = u.toString();
  if (navigator.share) {
    try { await navigator.share({ title: 'A song for you!', url }); } catch (e) {}
  } else {
    try {
      await navigator.clipboard.writeText(url);
      flashMsg('Song link copied! \u{1F4E4}');
    } catch (e) {
      flashMsg('Could not copy the link');
    }
  }
}

// ── Challenge mode ────────────────────────────────────────────────────────────

function chMsg() {
  if (!ch) return;
  if (ch.mode === 'demo') setMsg('\u{1F442} Listen: part ' + (ch.sec + 1) + ' of ' + ch.song.sections.length + '…');
  else if (ch.mode === 'echo') setMsg('⭐ Your turn! Follow the glow');
  else if (ch.mode === 'perform') setMsg('\u{1F3A4} The whole song now — off you go!');
}

function startChallenge(song) {
  if (recording) stopRecord();
  if (playback) stopPlayback();
  hidePanel(songsPanel);
  hidePanel(resultsPanel);
  setInst(song.inst);
  ch = { song, sec: 0 };
  updateButtons();
  startDemo();
}

function startDemo() {
  const [s, e] = ch.song.sections[ch.sec];
  const base = ch.song.notes[s].at;
  ch.mode = 'demo';
  ch.queue = ch.song.notes.slice(s, e).map(n => ({ k: n.k, t: (n.at - base) * ch.song.beat }));
  ch.qi = 0;
  ch.t0 = performance.now() + 900;
  setGuide(null);
  chMsg();
}

function enterEcho() {
  ch.mode = 'echo';
  ch.pos = ch.song.sections[ch.sec][0];
  chMsg();
  setGuide(ch.song.notes[ch.pos].k);
}

function enterPerform() {
  ch.mode = 'perform';
  ch.pos = 0;
  ch.hits = 0;
  ch.wrong = 0;
  ch.times = [];
  chMsg();
  setGuide(ch.song.notes[0].k, true);
}

function sectionDone() {
  SFX.praise();
  setGuide(null);
  if (ch.sec + 1 < ch.song.sections.length) {
    ch.sec++;
    setMsg(PRAISE[Math.floor(Math.random() * PRAISE.length)], 'praise');
    ch.mode = 'gap';
    ch.gapUntil = performance.now() + 1100;
  } else {
    setMsg('You know all the parts! \u{1F389}', 'praise');
    ch.mode = 'gap';
    ch.gapUntil = performance.now() + 1300;
    ch.performNext = true;
  }
}

function challengeInput(k) {
  const notes = ch.song.notes;
  if (ch.mode === 'echo') {
    if (k === notes[ch.pos].k) {
      flashKey(k, 'jam-good', 260);
      ch.pos++;
      if (ch.pos >= ch.song.sections[ch.sec][1]) sectionDone();
      else setGuide(notes[ch.pos].k);
    } else {
      flashKey(k, 'jam-bad', 260);
      SFX.oops();
      surfSvg.classList.remove('jam-shake');
      void surfSvg.getBoundingClientRect();
      surfSvg.classList.add('jam-shake');
    }
  } else if (ch.mode === 'perform') {
    const t = performance.now();
    if (k === notes[ch.pos].k) {
      flashKey(k, 'jam-good', 200);
      ch.hits++;
      ch.times.push({ t, beat: notes[ch.pos].at });
      ch.pos++;
    } else if (ch.pos + 1 < notes.length && k === notes[ch.pos + 1].k) {
      // they skipped a note — count this one, mark the skipped one missed
      flashKey(k, 'jam-good', 200);
      ch.hits++;
      ch.times.push({ t, beat: notes[ch.pos + 1].at });
      ch.pos += 2;
    } else {
      ch.wrong++;
      flashKey(k, 'jam-bad', 200);
    }
    if (ch.pos >= notes.length) finishChallenge();
    else setGuide(notes[ch.pos].k, true);
  }
}

// Score: mostly notes hit, partly rhythm. Rhythm compares each gap between
// correct notes to the score's beat gaps, normalised by the player's own
// median tempo — so playing slow-but-steady still scores well.
function computeScore() {
  const N = ch.song.notes.length;
  const noteScore = ch.hits / N;
  let rhythm = 1;
  const ratios = [];
  for (let i = 1; i < ch.times.length; i++) {
    const db = ch.times[i].beat - ch.times[i - 1].beat;
    const dt = ch.times[i].t - ch.times[i - 1].t;
    if (db > 0 && dt > 0) ratios.push(dt / db);
  }
  if (ratios.length >= 2) {
    const med = ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
    rhythm = ratios.reduce((s, r) => s + Math.max(0, 1 - Math.abs(Math.log2(r / med))), 0) / ratios.length;
  }
  const penalty = Math.min(0.15, ch.wrong * 0.01);
  return Math.round(100 * clamp(0.7 * noteScore + 0.3 * rhythm - penalty, 0, 1));
}

function finishChallenge() {
  setGuide(null);
  const score = computeScore();
  const song = ch.song;
  ch.mode = 'done';
  const prev = bests[song.id] || 0;
  if (score > prev) {
    bests[song.id] = score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) {}
  }
  SFX.win();
  document.getElementById('jam-score').textContent = score + '/100';
  document.getElementById('jam-result-title').textContent =
    score >= 90 ? 'Superstar! \u{1F31F}' :
    score >= 75 ? 'Amazing! \u{1F3B6}' :
    score >= 50 ? 'Great jamming! \u{1F3B5}' : 'Good practice! \u{1F3A7}';
  const learnedAll = Object.keys(bests).length >= SONGS.length;
  document.getElementById('jam-result-note').textContent =
    song.name + (score > prev
      ? (prev ? ` — a new best (was ${prev})!` : ' — your first score, nice!')
      : ` — best so far: ${Math.max(prev, score)}.`) +
    (learnedAll ? ' \u{1F3C6} You’ve played every song in the book!' : '');
  setMsg('What a performance! \u{1F389}', 'praise');
  showPanel(resultsPanel, quitChallenge);
}

function quitChallenge() {
  ch = null;
  setGuide(null);
  hidePanel(resultsPanel);
  hidePanel(songsPanel);
  updateButtons();
  freeMsg();
}

function onChallengeBtn() {
  if (ch) { quitChallenge(); return; }
  if (recording) stopRecord();
  if (playback) stopPlayback();
  openSongs();
}

// ── Song picker ───────────────────────────────────────────────────────────────

function openSongs() {
  songListEl.innerHTML = '';
  SONGS.forEach(song => {
    const b = document.createElement('button');
    b.className = 'jam-song';
    b.setAttribute('aria-label', 'Learn ' + song.name);
    const best = bests[song.id];
    b.innerHTML =
      `<span class="jam-song-icon" aria-hidden="true">${song.icon}</span>` +
      `<span class="jam-song-name">${song.name}</span>` +
      `<span class="jam-song-meta">${INSTRUMENTS[song.inst].emoji}${best ? ' · ⭐' + best : ''}</span>`;
    b.addEventListener('click', () => startChallenge(song));
    songListEl.appendChild(b);
  });
  showPanel(songsPanel, () => {
    hidePanel(songsPanel);
    if (!ch) freeMsg();
  });
}

// Panels register an Escape layer so Escape closes the panel, not the Jam.
function showPanel(p, esc) {
  if (!p._layer) p._layer = pushEscLayer(esc || (() => hidePanel(p)));
  p.classList.add('show');
}

function hidePanel(p) {
  if (p._layer) { removeEscLayer(p._layer); p._layer = null; }
  p.classList.remove('show');
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function setInst(id) {
  inst = id;
  instRow.querySelectorAll('.jam-inst').forEach(b =>
    b.classList.toggle('is-active', b.id === 'jam-inst-' + id));
  buildSurface();
  drawStage();
}

function updateButtons() {
  const busy = !!ch;
  instRow.querySelectorAll('.jam-inst').forEach(b => b.classList.toggle('is-disabled', busy));
  btnRec.classList.toggle('is-disabled', busy);
  btnRec.classList.toggle('is-rec', !!recording);
  btnRec.querySelector('.tool-emoji').textContent = recording ? '■' : '●';
  btnRec.querySelector('.tool-name').textContent = recording ? 'Stop' : 'Record';
  btnPlay.classList.toggle('is-disabled', busy || (!take && !playback));
  btnPlay.querySelector('.tool-emoji').textContent = playback ? '■' : '▶';
  btnPlay.querySelector('.tool-name').textContent = playback ? 'Stop' : 'Play';
  btnShare.classList.toggle('is-disabled', busy || !take);
  btnChal.querySelector('.tool-emoji').textContent = busy ? '✕' : '\u{1F3AF}';
  btnChal.querySelector('.tool-name').textContent = busy ? 'Quit' : 'Challenge';
}

function makeBtn(id, emoji, name, extraCls, onClick) {
  const b = document.createElement('button');
  b.className = 'tool-btn ' + extraCls;
  b.id = id;
  b.setAttribute('aria-label', name);
  b.innerHTML = `<span class="tool-emoji" aria-hidden="true">${emoji}</span>` +
                `<span class="tool-name">${name}</span>`;
  b.addEventListener('click', onClick);
  instRow.appendChild(b);
  return b;
}

// ── Main loop (playback, demo scheduling, record cap) ────────────────────────

function tickLoop() {
  if (!open) return;
  const now = performance.now();

  if (playback && take) {
    const t = now - playback.start;
    while (playback && playback.idx < take.length && take[playback.idx].t <= t) {
      const ev = take[playback.idx++];
      if (ev.i !== inst) setInst(ev.i);   // replay feels like a performance
      playKey(ev.i, ev.k);
      bopArm();
      flashKey(ev.k);
    }
    // loop until the player presses Stop, keeping the recorded tail silence
    if (playback && playback.idx >= take.length && t >= playback.loop) {
      playback.start += playback.loop;
      playback.idx = 0;
    }
  }

  if (recording && now - recording.start > REC_CAP_MS) stopRecord();

  if (ch && ch.mode === 'demo') {
    const t = now - ch.t0;
    while (ch.qi < ch.queue.length && ch.queue[ch.qi].t <= t) {
      const n = ch.queue[ch.qi++];
      playKey(inst, n.k);
      flashKey(n.k, 'jam-on', 250);
      bopArm();
    }
    if (ch.qi >= ch.queue.length && t > ch.queue[ch.queue.length - 1].t + 700) enterEcho();
  } else if (ch && ch.mode === 'gap' && now >= ch.gapUntil) {
    if (ch.performNext) { ch.performNext = false; enterPerform(); }
    else startDemo();
  }

  raf = requestAnimationFrame(tickLoop);
}

// ── Open / close ──────────────────────────────────────────────────────────────

function openJam() {
  open = true;
  setInst(inst);
  updateButtons();
  freeMsg();
  hidePanel(songsPanel);
  hidePanel(resultsPanel);
  openOverlay(overlay, closeJam);
  raf = requestAnimationFrame(tickLoop);
}

function closeJam() {
  if (!open) return;
  open = false;
  if (recording) stopRecord();
  playback = null;
  ch = null;
  hidePanel(songsPanel);
  hidePanel(resultsPanel);
  cancelAnimationFrame(raf);
  clearTimeout(msgTimer);
  activePtrs.clear();
  closeOverlay(overlay);
}

// ── Init & registry ───────────────────────────────────────────────────────────

function initJam() {
  overlay = document.getElementById('jam');
  stageSvg = document.getElementById('jam-stage');
  surfSvg = document.getElementById('jam-surface');
  msgEl = document.getElementById('jam-msg');
  instRow = document.getElementById('jam-controls');
  songsPanel = document.getElementById('jam-songs');
  songListEl = document.getElementById('jam-song-list');
  resultsPanel = document.getElementById('jam-results');

  INST_ORDER.forEach(id => makeBtn('jam-inst-' + id, INSTRUMENTS[id].emoji,
    INSTRUMENTS[id].name, 'jam-inst', () => { if (!ch) setInst(id); }));
  btnRec = makeBtn('jam-rec', '●', 'Record', 'jam-ctl jam-rec', onRecordBtn);
  btnPlay = makeBtn('jam-playbtn', '▶', 'Play', 'jam-ctl', onPlayBtn);
  btnShare = makeBtn('jam-share', '\u{1F4E4}', 'Share', 'jam-ctl', onShareBtn);
  btnChal = makeBtn('jam-challenge', '\u{1F3AF}', 'Challenge', 'jam-ctl', onChallengeBtn);

  loadTake();
  try { bests = JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { bests = {}; }

  document.getElementById('jam-close').addEventListener('click', closeJam);
  document.getElementById('jam-songs-close').addEventListener('click', () => {
    hidePanel(songsPanel);
    if (!ch) freeMsg();
  });
  document.getElementById('jam-retry').addEventListener('click', () => startChallenge(ch.song));
  document.getElementById('jam-pick').addEventListener('click', () => {
    hidePanel(resultsPanel);
    ch = null;
    updateButtons();
    openSongs();
  });
  document.getElementById('jam-results-close').addEventListener('click', quitChallenge);

  surfSvg.addEventListener('pointerdown', onDown);
  surfSvg.addEventListener('pointermove', onMove);
  surfSvg.addEventListener('pointerup', onUp);
  surfSvg.addEventListener('pointercancel', onUp);
  surfSvg.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', onKeyboard);

  // tiny hook for automated tests: tap keys and peek at the state
  window.__jam = {
    tap: k => { if (open) onKey(k); },
    song: id => {
      const s = SONGS.find(q => q.id === id);
      if (open && s) startChallenge(s);
    },
    state: () => open && {
      inst,
      recording: !!recording,
      playing: !!playback,
      takeLen: take ? take.length : 0,
      ch: ch && { mode: ch.mode, sec: ch.sec, pos: ch.pos, hits: ch.hits, wrong: ch.wrong },
    },
  };

  // a ?j= link opens the Jam with the sender's song loaded, ready to play
  const shared = decodeTake(new URLSearchParams(location.search).get('j'));
  if (shared) {
    take = shared.notes;
    takeDur = shared.dur;
    openJam();
    setMsg('\u{1F381} Someone sent you a song! Press ▶ to hear it', 'praise');
  }
}

// register before games.js builds the Games picker on DOMContentLoaded
window.MINIGAMES = window.MINIGAMES || {};
window.MINIGAMES.jam = {
  name: 'Jam Session', emoji: '\u{1F3B5}', start: openJam,
  best: () => {
    const n = Object.keys(bests).length;
    return n ? n + '/' + SONGS.length + ' songs' : '';
  },
};

document.addEventListener('DOMContentLoaded', initJam);

})();
