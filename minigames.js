'use strict';

// ── Emojicle Clinic — a pocket-surgery minigame ───────────────────────────────
// Trauma Center-style operations, kid-sized: the emoji currently on the canvas
// becomes the patient. A case is a short sequence of steps (spray, tweeze,
// suture, rub, ice…), each needing the right tool from the tray. Using the
// wrong tool dents the happy meter, which decides the star rating at the end.
//
// Levels: each case is one level, played against a countdown. Difficulty
// climbs with the level — the time limit shrinks (case base time × a
// multiplier that floors at 50%) and cases get more work via prep(level):
// more/faster germs, extra prickles, extra stitches, longer ice holds.
// Beating the clock advances a level; running out offers a retry of the same
// case. Clearing level 12 earns the doctor diploma (play continues endlessly
// after). "Relax mode" on the intro card turns the timer off entirely.
// The best level reached is kept in localStorage (timed runs only).
//
// Reads the builder's globals (PARTS, state, offsets, zOrder, note,
// getAudioCtx, pulse) plus GameKit from games-common.js; registers itself in
// the window.MINIGAMES registry that games.js turns into the Games picker.

(function () {

const { el, rnd, dist, sfx } = GameKit;

// distance from point m to segment a→b (used to detect suture crossings)
function segDist(m, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(m.x - a.x, m.y - a.y);
  const t = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / l2));
  return Math.hypot(m.x - (a.x + dx * t), m.y - (a.y + dy * t));
}

// ── Sounds (synthesized via note() from app.js — no audio files) ─────────────

const SFX = {
  pick:   () => sfx((c, t) => note(c, t, 520, 0.07, { vol: 0.06 })),
  spray:  () => sfx((c, t) => note(c, t, 900 + Math.random() * 300, 0.04, { type: 'sine', vol: 0.02 })),
  pop:    () => sfx((c, t) => note(c, t, 260, 0.13, { type: 'sine', glide: 760, vol: 0.12 })),
  squish: () => sfx((c, t) => note(c, t, 520, 0.12, { type: 'sine', glide: 140, vol: 0.1 })),
  stitch: () => sfx((c, t) => note(c, t, 660, 0.05, { type: 'square', vol: 0.035 })),
  buzz:   () => sfx((c, t) => note(c, t, 110, 0.25, { type: 'square', vol: 0.05 })),
  step:   () => sfx((c, t) => { note(c, t, 523.25, 0.1, { vol: 0.08 }); note(c, t + 0.11, 659.25, 0.16, { vol: 0.08 }); }),
  win:    () => sfx((c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, t + i * 0.13, f, 0.18, { vol: 0.09 }))),
  tick:   () => sfx((c, t) => note(c, t, 1050, 0.05, { type: 'square', vol: 0.03 })),
  fail:   () => sfx((c, t) => { note(c, t, 392, 0.25, { vol: 0.09 }); note(c, t + 0.28, 261.63, 0.45, { vol: 0.09 }); }),
};

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  { id: 'spray',    emoji: '\u{1F9F4}', name: 'Spray' },
  { id: 'tweezers', emoji: '\u{1F90F}', name: 'Tweezers' },
  { id: 'suture',   emoji: '\u{1FAA1}', name: 'Stitches' },
  { id: 'bandage',  emoji: '\u{1FA79}', name: 'Bandage' },
  { id: 'thermo',   emoji: '\u{1F321}\u{FE0F}', name: 'Thermo' },
  { id: 'ice',      emoji: '\u{1F9CA}', name: 'Ice' },
  { id: 'syringe',  emoji: '\u{1F489}', name: 'Vitamins' },
];

const toolById = id => TOOLS.find(t => t.id === id);

// ── Game state ────────────────────────────────────────────────────────────────

const MAX_LEVEL = 12;   // the diploma level; play continues endlessly after

let game = null;        // null when the clinic is closed
let lastCase = null;    // avoid dealing the same case twice in a row
let level = 1;          // current level; resets to 1 when opened from the builder
let best = 0;           // highest level ever cleared (persisted, timed runs only)
const BEST_KEY = 'emojicle-clinic-best';
const RELAX_KEY = 'emojicle-clinic-relax';
let relax = false;      // "no timer" mode, toggled on the intro card
let fx = null;          // GameKit particle system, bound to #op-fx in init
let ring = null;        // hold-progress ring
let ghost = null;       // dashed "put it here" target circle
let msgTimer = null;

// DOM refs, resolved once in initClinic
let overlay, opSvg, patientG, woundsG, fxG, cursorG, cursorText,
    titleEl, msgEl, moodFace, moodFill, tray, stageEl,
    introPanel, donePanel, failPanel;

const PRAISE = ['Great job! \u{1F31F}', 'Nice work! \u{1F496}', 'You did it! \u{1F44F}', 'Super doctor! \u{1FA7A}'];

// ── Wound / dressing art (all in the 72×72 face space) ───────────────────────

function jaggedLine(g, x1, y1, x2, y2, color, w) {
  const n = 6, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const px = -dy / len, py = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = (i === 0 || i === n) ? 0 : (i % 2 ? 1 : -1) * rnd(0.7, 1.3);
    pts.push((x1 + dx * t + px * j).toFixed(1) + ',' + (y1 + dy * t + py * j).toFixed(1));
  }
  return el('polyline', {
    points: pts.join(' '), fill: 'none', stroke: color,
    'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, g);
}

function drawSplinter(g, it) {
  const grp = el('g', { transform: `translate(${it.x} ${it.y}) rotate(${it.a})` }, g);
  el('rect', { x: -0.7, y: -7, width: 1.4, height: 8.5, rx: 0.7, fill: '#8B5A2B', stroke: '#6B421C', 'stroke-width': 0.3 }, grp);
  return grp;
}

function drawTooth(g, it) {
  const grp = el('g', { transform: `translate(${it.x} ${it.y}) rotate(${it.a})` }, g);
  el('path', {
    d: 'M-2 -3.2 Q-2 -5.6 0 -5.6 Q2 -5.6 2 -3.2 L1.6 1.4 Q1.2 2.6 0.6 1.2 L0 -0.6 L-0.6 1.2 Q-1.2 2.6 -1.6 1.4 Z',
    fill: '#FFFFFF', stroke: '#C9CFD6', 'stroke-width': 0.4,
  }, grp);
  return grp;
}

function drawBandage(g, x, y, rot) {
  const grp = el('g', { transform: `translate(${x} ${y}) rotate(${rot})` }, g);
  el('rect', { x: -7, y: -3, width: 14, height: 6, rx: 3, fill: '#F6C99F', stroke: '#DFA36E', 'stroke-width': 0.5 }, grp);
  el('rect', { x: -2.6, y: -2.1, width: 5.2, height: 4.2, rx: 1, fill: '#FBE3C9' }, grp);
  [[-1.3, -0.7], [1.3, -0.7], [0, 0.9]].forEach(([cx, cy]) =>
    el('circle', { cx, cy, r: 0.35, fill: '#E8C39A' }, grp));
  return grp;
}

// a cute wandering germ: green blob, stubby spikes, googly eyes
function spawnGerm() {
  const a = Math.random() * Math.PI * 2, d = Math.random() * 13;
  const grp = el('g', {}, woundsG);
  [0, 72, 144, 216, 288].forEach(deg => el('line', {
    x1: 0, y1: 0,
    x2: Math.cos(deg * Math.PI / 180) * 3.1, y2: Math.sin(deg * Math.PI / 180) * 3.1,
    stroke: '#5E9427', 'stroke-width': 0.6, 'stroke-linecap': 'round',
  }, grp));
  el('circle', { r: 2.3, fill: '#8CC63F', stroke: '#5E9427', 'stroke-width': 0.5 }, grp);
  el('circle', { cx: -0.7, cy: -0.4, r: 0.6, fill: '#fff' }, grp);
  el('circle', { cx: 0.7, cy: -0.4, r: 0.6, fill: '#fff' }, grp);
  el('circle', { cx: -0.7, cy: -0.35, r: 0.28, fill: '#2B2B2B' }, grp);
  el('circle', { cx: 0.7, cy: -0.35, r: 0.28, fill: '#2B2B2B' }, grp);
  const va = Math.random() * Math.PI * 2;
  const v0 = (game.params.germSpeed || 9) * 0.8;
  const germ = {
    x: 36 + Math.cos(a) * d, y: 36 + Math.sin(a) * d,
    vx: Math.cos(va) * v0, vy: Math.sin(va) * v0,
    el: grp, alive: true,
  };
  grp.setAttribute('transform', `translate(${germ.x} ${germ.y})`);
  return germ;
}

function moveGerm(g, dt) {
  const cap = game.params.germSpeed || 9;   // germs get quicker on later levels
  g.vx += rnd(-15, 15) * dt;
  g.vy += rnd(-15, 15) * dt;
  const sp = Math.hypot(g.vx, g.vy);
  if (sp > cap) { g.vx *= cap / sp; g.vy *= cap / sp; }
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  const dx = g.x - 36, dy = g.y - 36, d = Math.hypot(dx, dy);
  if (d > 17) {                       // bounce back inside the face
    g.x = 36 + dx / d * 17;
    g.y = 36 + dy / d * 17;
    const dot = (g.vx * dx + g.vy * dy) / d;
    g.vx -= 2 * dot * dx / d;
    g.vy -= 2 * dot * dy / d;
  }
  g.el.setAttribute('transform', `translate(${g.x.toFixed(2)} ${g.y.toFixed(2)})`);
}

// ── Progress ring & target ghost ─────────────────────────────────────────────

function showRing(x, y, r) {
  const rr = r + 1.5;
  if (!ring) {
    const g = el('g', {}, fxG);
    ring = {
      g,
      track: el('circle', { fill: 'none', stroke: 'rgba(43,43,43,0.15)', 'stroke-width': 1 }, g),
      fill:  el('circle', { fill: 'none', stroke: '#2BB673', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g),
    };
  }
  [ring.track, ring.fill].forEach(c => {
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', rr);
  });
  ring.fill.setAttribute('transform', `rotate(-90 ${x} ${y})`);   // fill from 12 o'clock
  ring.c = 2 * Math.PI * rr;
  ring.g.setAttribute('visibility', 'visible');
}

function setRing(p) {
  if (ring) ring.fill.setAttribute('stroke-dasharray', `${(ring.c * p).toFixed(2)} ${ring.c.toFixed(2)}`);
}

function hideRing() {
  if (ring) ring.g.setAttribute('visibility', 'hidden');
}

function showGhost(t) {
  hideGhost();
  ghost = el('circle', {
    cx: t.x, cy: t.y, r: t.r, fill: 'none', stroke: '#FF5A5F',
    'stroke-width': 0.7, 'stroke-dasharray': '2 1.5', class: 'op-ghost',
  }, fxG);
}

function hideGhost() {
  if (ghost) { ghost.remove(); ghost = null; }
}

// ── Cases ─────────────────────────────────────────────────────────────────────
// Each case dresses the patient with wound art, then runs its steps in order.
// A step names its type (the engine mechanic), the required tool, the kid-
// facing instruction, and optional onProgress/onDone hooks that animate the
// case's own art (kept in game.art by dress()).
//
// `time` is the level-1 limit in seconds (shrunk per level by openCase);
// `prep(L)` bakes the level's difficulty into fresh params (game.params),
// which dress() and steps() both read — steps is a FUNCTION so every play
// gets fresh step objects (handlers scribble progress onto them).

const SPLINTER_SPOTS = [
  { x: 30, y: 24, a: -27 },
  { x: 46, y: 29, a: 55 },
  { x: 39, y: 51, a: 169 },
  { x: 24, y: 35, a: -85 },   // extra prickles for higher levels
  { x: 44, y: 44, a: 135 },
];

const TOOTH_SPOTS = [
  { x: 33, y: 47, a: 180 },
  { x: 40, y: 47, a: 180 },
];

const PAINT_SPOTS = [
  { x: 28, y: 26 }, { x: 45, y: 31 }, { x: 31, y: 47 }, { x: 44, y: 47 }, { x: 36, y: 20 },
];
const PAINT_COLORS = ['#4A90E2', '#E53E3E', '#2BB673', '#8E6FF7', '#FF9F1C'];

const CASES = [
  {
    id: 'scrape', icon: '\u{1F6F9}', name: 'Skateboard Scrape', time: 40,
    story: 'Your emoji wiped out on a skateboard and scraped its cheek. Clean it, stitch it, patch it!',
    prep(L) {
      return { stitches: 4 + Math.min(3, Math.floor((L - 1) / 3)) };
    },
    dress(g, art) {
      art.cut = jaggedLine(g, 21, 41.5, 29, 48.5, '#E05252', 1.1);
      art.dots = [[23, 41], [27.5, 44], [25, 47.5]].map(([x, y]) =>
        el('circle', { cx: x, cy: y, r: 1.5, fill: '#8CC63F', stroke: '#5E9427', 'stroke-width': 0.4 }, g));
    },
    steps: p => [
      { type: 'spray', tool: 'spray', text: 'Spray the scrape squeaky clean!',
        zones: [{ x: 25, y: 45, r: 7.5 }], time: 1.6,
        onProgress(prog) { game.art.dots.forEach(d => d.setAttribute('opacity', String(1 - prog))); } },
      { type: 'suture', tool: 'suture', text: 'Stitch the cut — zigzag across it!',
        line: { x1: 21, y1: 41.5, x2: 29, y2: 48.5 }, stitches: p.stitches,
        onDone() { game.art.cut.setAttribute('stroke', '#EBA8A8'); } },
      { type: 'place', tool: 'bandage', text: 'Finish with a bandage!',
        target: { x: 25, y: 45, r: 7 }, rot: -40 },
    ],
  },
  {
    id: 'cactus', icon: '\u{1F335}', name: 'Cactus Hug', time: 35,
    story: 'Your emoji hugged a cactus (it looked friendly). Those prickles need to come out!',
    prep(L) {
      const n = 3 + Math.min(2, Math.floor((L - 1) / 3));
      return { spots: SPLINTER_SPOTS.slice(0, n).map(s => ({ ...s })) };
    },
    dress(g, art) {
      const spots = game.params.spots;
      art.holes = spots.map(it =>
        el('circle', { cx: it.x, cy: it.y, r: 1.1, fill: '#E8938C', opacity: 0 }, g));
      art.spl = spots.map(it => drawSplinter(g, it));
    },
    steps: p => [
      { type: 'tweeze', tool: 'tweezers', text: 'Grab each prickle and pull it out!', items: p.spots },
      { type: 'spray', tool: 'spray', text: 'Spray each sore spot!',
        zones: p.spots.map(it => ({ x: it.x, y: it.y, r: 4.5 })), time: 0.7,
        onZoneProgress(i, prog) { game.art.holes[i].setAttribute('opacity', String(1 - prog)); } },
    ],
  },
  {
    id: 'germs', icon: '\u{1F9A0}', name: 'Germ Attack', time: 35,
    story: 'Your emoji forgot to wash its hands and now germs are having a party. Zap them all!',
    prep(L) {
      return {
        count: 4 + Math.min(8, Math.ceil(L / 2)),       // 5 germs at level 1 → 12
        germSpeed: 9 + Math.min(7, (L - 1) * 0.8),      // and they get faster
      };
    },
    dress() {},   // the germs are spawned by the zap step itself
    steps: p => [
      { type: 'zap', tool: 'spray', text: 'Spray every wiggly germ!', count: p.count },
      { type: 'hold', tool: 'syringe', text: 'One vitamin boost to finish!',
        target: { x: 46, y: 46, r: 8 }, time: 1.3,
        onDone() { fx.sparkle(46, 46); } },
    ],
  },
  {
    id: 'fever', icon: '\u{1F975}', name: 'Too Hot!', time: 35,
    story: 'Your emoji feels all hot and wobbly. Find out how hot, then cool it down!',
    prep(L) {
      return { iceTime: 2.2 + Math.min(1.6, (L - 1) * 0.2) };
    },
    dress(g, art) {
      art.cheeks = [26, 46].map(x =>
        el('circle', { cx: x, cy: 44, r: 4.5, fill: '#FF6B6B', opacity: 0.55 }, g));
      art.drops = [[15, 26], [56, 22], [51, 13]].map(([x, y]) =>
        el('path', { d: `M${x} ${y} q1.6 2.6 0 3.6 q-1.6 -1.2 0 -3.6`, fill: '#69B7FF', opacity: 0.9 }, g));
      art.temp = el('text', {
        x: 36, y: 5, 'text-anchor': 'middle', 'font-size': 6,
        'font-weight': 700, fill: '#E03E47', opacity: 0,
      }, g);
    },
    steps: p => [
      { type: 'hold', tool: 'thermo', text: 'Hold the thermometer on the forehead!',
        target: { x: 36, y: 23, r: 8 }, time: 1.3,
        onDone() { game.art.temp.textContent = '39.9°!'; game.art.temp.setAttribute('opacity', 1); } },
      { type: 'hold', tool: 'ice', text: '39.9°?! Ice pack on the forehead!',
        target: { x: 36, y: 23, r: 9 }, time: p.iceTime,
        onProgress(prog) {
          game.art.temp.textContent = (39.9 - 3.4 * prog).toFixed(1) + '°';
          game.art.cheeks.forEach(c => c.setAttribute('opacity', String(0.55 * (1 - prog))));
          game.art.drops.forEach(d => d.setAttribute('opacity', String(0.9 * (1 - prog))));
        },
        onDone() {
          game.art.temp.textContent = '36.5°';
          game.art.temp.setAttribute('fill', '#2BB673');
        } },
      { type: 'hold', tool: 'syringe', text: 'Vitamins so the fever stays away!',
        target: { x: 46, y: 46, r: 8 }, time: 1.3,
        onDone() { fx.sparkle(46, 46); } },
    ],
  },
  {
    id: 'bump', icon: '\u{1F4AB}', name: 'Bonked Head', time: 28,
    story: 'Your emoji bonked its head and now it sees little stars. Shrink that bump!',
    prep(L) {
      return { iceTime: 2.2 + Math.min(1.6, (L - 1) * 0.2) };
    },
    dress(g, art) {
      art.bump = el('ellipse', {
        cx: 44, cy: 14.5, rx: 4.4, ry: 4,
        fill: '#FF9E9E', stroke: '#D96A6A', 'stroke-width': 0.6,
      }, g);
      art.stars = [0, 1].map(() => {
        const s = el('text', { 'font-size': 4.5, 'text-anchor': 'middle', opacity: 0.9 }, g);
        s.textContent = '⭐';
        return s;
      });
      game.orbit = { cx: 36, cy: 13, r: 15, t: 0, els: art.stars };
    },
    steps: p => [
      { type: 'hold', tool: 'ice', text: 'Hold the ice on the bump till it shrinks!',
        target: { x: 44, y: 15, r: 7 }, time: p.iceTime,
        onProgress(prog) {
          game.art.bump.setAttribute('rx', String(4.4 - 3.8 * prog));
          game.art.bump.setAttribute('ry', String(4 - 3.5 * prog));
          game.orbit.els.forEach(s => s.setAttribute('opacity', String(0.9 * (1 - prog))));
        },
        onDone() {
          game.art.bump.setAttribute('opacity', 0);
          game.orbit.els.forEach(s => s.remove());
          game.orbit = null;
        } },
      { type: 'place', tool: 'bandage', text: 'A bandage to keep it cosy!',
        target: { x: 44, y: 15, r: 7 }, rot: 25 },
    ],
  },
  {
    id: 'tooth', icon: '\u{1F9B7}', name: 'Wobbly Tooth', time: 32,
    story: 'Your emoji has a super wobbly tooth (maybe two!). Wiggle it out, rinse, and patch it cosy!',
    prep(L) {
      const n = L >= 5 ? 2 : 1;
      return { teeth: TOOTH_SPOTS.slice(0, n).map(s => ({ ...s })) };
    },
    dress(g, art) {
      const teeth = game.params.teeth;
      art.holes = teeth.map(it =>
        el('circle', { cx: it.x, cy: it.y, r: 1.2, fill: '#E8938C', opacity: 0 }, g));
      art.spl = teeth.map(it => drawTooth(g, it));
    },
    steps: p => [
      { type: 'tweeze', tool: 'tweezers', text: 'Wiggle each wobbly tooth out!', items: p.teeth },
      { type: 'spray', tool: 'spray', text: 'Rinse where it wobbled!',
        zones: p.teeth.map(it => ({ x: it.x, y: it.y, r: 5 })), time: 0.9,
        onZoneProgress(i, prog) { game.art.holes[i].setAttribute('opacity', String(1 - prog)); } },
      { type: 'place', tool: 'bandage', text: 'A cosy pad for the tooth fairy!',
        target: { x: 36, y: 47, r: 7 }, rot: 0 },
    ],
  },
  {
    id: 'paint', icon: '\u{1F3A8}', name: 'Painty Face', time: 34,
    story: 'Art class got wild — there’s paint everywhere! Soak each splodge, then scrub the face shiny.',
    prep(L) {
      const n = 3 + Math.min(2, Math.floor((L - 1) / 3));
      return {
        splats: PAINT_SPOTS.slice(0, n).map((s, i) => ({ ...s, color: PAINT_COLORS[i % PAINT_COLORS.length] })),
        scrub: 26 + Math.min(18, (L - 1) * 2),   // viewBox units of scrubbing per splodge
      };
    },
    dress(g, art) {
      art.splats = game.params.splats.map(s => {
        const grp = el('g', { transform: `translate(${s.x} ${s.y})` }, g);
        el('path', {
          d: 'M-3.2 0 Q-2.6 -3 0 -2.6 Q3 -3.2 2.8 -0.4 Q3.4 2.2 0.6 2.6 Q-2.4 3.2 -3.2 0 Z',
          fill: s.color, opacity: 0.85,
        }, grp);
        el('circle', { cx: 3.4, cy: 1.8, r: 0.7, fill: s.color, opacity: 0.85 }, grp);
        return grp;
      });
    },
    steps: p => [
      { type: 'spray', tool: 'spray', text: 'Soak every paint splodge!',
        zones: p.splats.map(s => ({ x: s.x, y: s.y, r: 4.5 })), time: 0.7,
        onZoneProgress(i, prog) { game.art.splats[i].setAttribute('opacity', String(1 - 0.45 * prog)); } },
      { type: 'rub', tool: 'bandage', text: 'Scrub each splodge clean with the pad!',
        zones: p.splats.map(s => ({ x: s.x, y: s.y, r: 4.5 })), travel: p.scrub,
        onZoneProgress(i, prog) { game.art.splats[i].setAttribute('opacity', String(0.55 * (1 - prog))); } },
    ],
  },
  {
    id: 'chills', icon: '\u{1F976}', name: 'Brrr! Too Cold', time: 30,
    story: 'Your emoji lost a snowball fight and is all shivery. Warm those chilly cheeks back up!',
    prep(L) {
      return { warm: 22 + Math.min(18, (L - 1) * 2.2) };   // scrubbing per cheek
    },
    dress(g, art) {
      art.flakes = [[16, 20], [55, 16], [50, 9], [21, 10]].map(([x, y]) => {
        const t = el('text', { x, y, 'font-size': 4, 'text-anchor': 'middle', opacity: 0.9 }, g);
        t.textContent = '❄️';
        return t;
      });
      art.lips = el('path', {
        d: 'M30 52 Q36 55 42 52', stroke: '#69B7FF', 'stroke-width': 1.6,
        fill: 'none', 'stroke-linecap': 'round', opacity: 0.8,
      }, g);
      art.temp = el('text', {
        x: 36, y: 5, 'text-anchor': 'middle', 'font-size': 6,
        'font-weight': 700, fill: '#4A90E2', opacity: 0,
      }, g);
    },
    steps: p => [
      { type: 'hold', tool: 'thermo', text: 'Check how chilly it is!',
        target: { x: 36, y: 23, r: 8 }, time: 1.3,
        onDone() { game.art.temp.textContent = '34.1°!'; game.art.temp.setAttribute('opacity', 1); } },
      { type: 'rub', tool: 'bandage', text: 'Rub each cheek warm with the cosy pad!',
        zones: [{ x: 26, y: 44, r: 5.5 }, { x: 46, y: 44, r: 5.5 }], travel: p.warm,
        onZoneProgress(i, prog) {
          game.art.flakes[i * 2].setAttribute('opacity', String(0.9 * (1 - prog)));
          game.art.flakes[i * 2 + 1].setAttribute('opacity', String(0.9 * (1 - prog)));
        },
        onDone() {
          game.art.temp.textContent = '36.5°';
          game.art.temp.setAttribute('fill', '#2BB673');
          game.art.temp.setAttribute('opacity', 1);
          game.art.lips.setAttribute('opacity', 0);
        } },
      { type: 'hold', tool: 'syringe', text: 'Vitamins to stay toasty!',
        target: { x: 46, y: 46, r: 8 }, time: 1.3,
        onDone() { fx.sparkle(46, 46); } },
    ],
  },
];

// ── Step mechanics ────────────────────────────────────────────────────────────
// Each handler implements the engine side of one step type:
//   enter(step)      set up
//   down/move/up(p)  pointer input in viewBox coords (only with the RIGHT tool)
//   tick(dt)         per-frame while the step is active

const HANDLERS = {

  // hold the spray inside each zone until its ring fills
  spray: {
    enter(step) { step.zones.forEach(z => { z.p = 0; z.done = false; }); },
    tick(dt) {
      const s = game.step;
      if (!game.ptr.down || game.tool !== s.tool) { hideRing(); return; }
      const z = s.zones.find(z => !z.done && dist(game.ptr, z) <= z.r);
      if (!z) { hideRing(); return; }
      z.p = Math.min(1, z.p + dt / s.time);
      showRing(z.x, z.y, z.r);
      setRing(z.p);
      game.sprayAcc = (game.sprayAcc || 0) + dt;
      if (game.sprayAcc > 0.1) {
        game.sprayAcc = 0;
        SFX.spray();
        fx.puff(game.ptr.x + rnd(-2, 2), game.ptr.y + rnd(-2, 2), '#BFE7FF', 2);
      }
      const i = s.zones.indexOf(z);
      if (s.onZoneProgress) s.onZoneProgress(i, z.p);
      if (s.onProgress) s.onProgress(z.p);
      if (z.p >= 1) {
        z.done = true;
        hideRing();
        fx.puff(z.x, z.y, '#BFE7FF', 8);
        if (s.zones.every(q => q.done)) completeStep();
      }
    },
  },

  // grab a splinter (or tooth) and drag it out along its own axis
  tweeze: {
    enter(step) { step.items.forEach(it => { it.out = false; }); },
    down(p) {
      const s = game.step;
      let best = null, bd = 5;
      s.items.forEach((it, i) => {
        if (it.out) return;
        const d = dist(p, it);
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== null) game.grab = { i: best, sx: p.x, sy: p.y };
    },
    move(p) {
      if (!game.grab) return;
      const s = game.step, i = game.grab.i, it = s.items[i], grp = game.art.spl[i];
      const ax = Math.sin(it.a * Math.PI / 180), ay = -Math.cos(it.a * Math.PI / 180);
      const d = Math.max(0, (p.x - game.grab.sx) * ax + (p.y - game.grab.sy) * ay);
      grp.setAttribute('transform',
        `translate(${(it.x + ax * d).toFixed(2)} ${(it.y + ay * d).toFixed(2)}) rotate(${it.a})`);
      if (d > 7) {
        it.out = true;
        game.grab = null;
        grp.remove();
        game.art.holes[i].setAttribute('opacity', 1);
        SFX.pop();
        fx.puff(it.x, it.y, '#C98A4B', 6);
        if (s.items.every(q => q.out)) completeStep();
      }
    },
    up() {
      if (!game.grab) return;
      const i = game.grab.i, it = game.step.items[i];   // let go early → it snaps back in
      game.art.spl[i].setAttribute('transform', `translate(${it.x} ${it.y}) rotate(${it.a})`);
      game.grab = null;
    },
  },

  // zigzag the needle across the cut — each pass near a marker sews a stitch
  suture: {
    enter(step) {
      const L = step.line;
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1, len = Math.hypot(dx, dy);
      const px = -dy / len, py = dx / len;
      step.marks = [];
      for (let i = 0; i < step.stitches; i++) {
        const t = (i + 0.5) / step.stitches;
        const x = L.x1 + dx * t, y = L.y1 + dy * t;
        const tick = el('line', {
          x1: x - px * 2.6, y1: y - py * 2.6, x2: x + px * 2.6, y2: y + py * 2.6,
          stroke: '#B9C4CE', 'stroke-width': 0.7,
          'stroke-dasharray': '1 0.8', 'stroke-linecap': 'round',
        }, woundsG);
        step.marks.push({ x, y, el: tick, done: false });
      }
      step.prev = null;
    },
    down(p) { game.step.prev = p; },
    move(p) {
      const s = game.step;
      if (s.prev) {
        s.marks.forEach(m => {
          if (m.done || segDist(m, s.prev, p) >= 2.2) return;
          m.done = true;
          m.el.setAttribute('stroke', '#3B3B3B');
          m.el.setAttribute('stroke-width', '1.1');
          m.el.removeAttribute('stroke-dasharray');
          SFX.stitch();
          fx.puff(m.x, m.y, '#9FD5FF', 3);
        });
        if (s.marks.every(m => m.done)) {
          if (s.onDone) s.onDone();
          completeStep();
        }
      }
      s.prev = p;
    },
    up() { game.step.prev = null; },
  },

  // tap the wandering germs before they scoot away
  zap: {
    enter(step) {
      step.germs = [];
      for (let i = 0; i < step.count; i++) step.germs.push(spawnGerm());
    },
    down(p) {
      const s = game.step;
      SFX.spray();
      fx.puff(p.x, p.y, '#BFE7FF', 3);
      const g = s.germs.find(q => q.alive && dist(p, q) < 5);
      if (!g) return;
      g.alive = false;
      g.el.remove();
      SFX.squish();
      fx.puff(g.x, g.y, '#8CC63F', 7);
      if (s.germs.every(q => !q.alive)) completeStep();
    },
    tick(dt) {
      game.step.germs.forEach(g => { if (g.alive) moveGerm(g, dt); });
    },
  },

  // hold the tool inside the dashed target until the ring fills
  hold: {
    enter(step) { step.p = 0; showGhost(step.target); },
    tick(dt) {
      const s = game.step;
      if (!game.ptr.down || game.tool !== s.tool || dist(game.ptr, s.target) > s.target.r) {
        hideRing();
        return;
      }
      s.p = Math.min(1, s.p + dt / s.time);
      showRing(s.target.x, s.target.y, s.target.r);
      setRing(s.p);
      if (s.onProgress) s.onProgress(s.p);
      if (s.p >= 1) {
        hideRing();
        hideGhost();
        if (s.onDone) s.onDone();
        completeStep();
      }
    },
  },

  // scrub back and forth inside each zone — progress is pointer travel, so it
  // rewards actual circular rubbing rather than holding still
  rub: {
    enter(step) {
      step.zones.forEach(z => { z.p = 0; z.done = false; });
      step.last = null;
    },
    down(p) { game.step.last = p; },
    move(p) {
      const s = game.step;
      if (!s.last) { s.last = p; return; }
      const d = dist(p, s.last);
      s.last = p;
      const z = s.zones.find(z => !z.done && dist(p, z) <= z.r);
      if (!z || d <= 0) { hideRing(); return; }
      z.p = Math.min(1, z.p + d / s.travel);
      showRing(z.x, z.y, z.r);
      setRing(z.p);
      if (Math.random() < 0.35) fx.puff(p.x, p.y, '#FFF3B0', 1);
      const i = s.zones.indexOf(z);
      if (s.onZoneProgress) s.onZoneProgress(i, z.p);
      if (z.p >= 1) {
        z.done = true;
        hideRing();
        SFX.pop();
        fx.puff(z.x, z.y, '#FFF3B0', 6);
        if (s.zones.every(q => q.done)) {
          if (s.onDone) s.onDone();
          completeStep();
        }
      }
    },
    up() {
      game.step.last = null;
      hideRing();
    },
  },

  // release the bandage over the dashed target
  place: {
    enter(step) { showGhost(step.target); },
    up(p) {
      const s = game.step;
      if (!p) return;
      if (dist(p, s.target) <= s.target.r) {
        hideGhost();
        drawBandage(woundsG, s.target.x, s.target.y, s.rot || 0);
        SFX.pop();
        fx.puff(s.target.x, s.target.y, '#FFD9A8', 6);
        completeStep();
      } else if (onPatient(p)) {
        flashMsg('Closer to the dotted circle!');
      }
    },
  },
};

// ── Engine ────────────────────────────────────────────────────────────────────

function onPatient(p) {
  return Math.hypot(p.x - 36, p.y - 36) < 30;
}

function setMsg(txt, cls) {
  msgEl.textContent = txt;
  msgEl.className = 'clinic-msg' + (cls ? ' ' + cls : '');
}

function instruction() {
  const t = toolById(game.step.tool);
  setMsg(t.emoji + ' ' + game.step.text);
}

function flashMsg(txt) {
  setMsg(txt, 'flash');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    if (game && game.phase === 'op') instruction();
  }, 1300);
}

function updateMood() {
  moodFill.style.width = game.mood + '%';
  moodFill.style.background = game.mood > 60 ? '#2BB673' : game.mood > 35 ? '#FFD93B' : '#FF5A5F';
  moodFace.textContent = game.mood > 75 ? '\u{1F604}' : game.mood > 45 ? '\u{1F642}' : '\u{1F61F}';
}

function mistake() {
  game.mistakes++;
  game.mood = Math.max(15, game.mood - 12);
  updateMood();
  SFX.buzz();
  stageEl.classList.add('op-shake');
  setTimeout(() => stageEl.classList.remove('op-shake'), 400);
  const t = toolById(game.step.tool);
  flashMsg(`Oops! Try the ${t.emoji} ${t.name}!`);
}

function startStep() {
  game.step = game.steps[game.stepIdx];
  game.phase = 'op';
  const h = HANDLERS[game.step.type];
  if (h.enter) h.enter(game.step);
  instruction();
  highlightTool(game.step.tool);
}

function completeStep() {
  if (game.phase !== 'op') return;
  game.phase = 'wait';
  SFX.step();
  game.mood = Math.min(100, game.mood + 6);
  updateMood();
  hideRing();
  hideGhost();
  clearTimeout(msgTimer);
  game.stepIdx++;
  if (game.stepIdx >= game.steps.length) { finishOp(); return; }
  setMsg(PRAISE[Math.floor(Math.random() * PRAISE.length)], 'praise');
  game.timer = setTimeout(startStep, 950);
}

// ── Countdown ────────────────────────────────────────────────────────────────
// Runs during 'op' AND the little praise pauses ('wait') — the clock only
// stops when the operation is over. Amber under 10s, red + blink + tick
// under 5s, timeUp() at zero. Relax mode skips all of this.

const timerRow = () => document.getElementById('clinic-timer');

function updateTimer() {
  const secs = Math.ceil(game.timeLeft);
  document.getElementById('timer-num').textContent = secs + 's';
  document.getElementById('timer-fill').style.width =
    (game.timeLeft / game.timeLimit * 100) + '%';
  timerRow().classList.toggle('low', game.timeLeft <= 10 && game.timeLeft > 5);
  timerRow().classList.toggle('critical', game.timeLeft <= 5);
}

function tickTimer(dt) {
  const before = Math.ceil(game.timeLeft);
  game.timeLeft = Math.max(0, game.timeLeft - dt);
  const now = Math.ceil(game.timeLeft);
  if (now !== before && now <= 5 && now > 0) SFX.tick();
  updateTimer();
  if (game.timeLeft <= 0) timeUp();
}

function timeUp() {
  game.phase = 'fail';
  clearTimeout(game.timer);
  clearTimeout(msgTimer);
  hideRing();
  hideGhost();
  highlightTool(null);
  SFX.fail();
  setMsg("Time's up! ⏰");
  document.getElementById('fail-note').textContent =
    `Level ${level} needs a speedier doctor. Same patient, fresh clock — go again!`;
  failPanel.classList.add('show');
}

function finishOp() {
  game.phase = 'done';
  SFX.win();
  fx.confetti();
  highlightTool(null);
  if (!game.relax && level > best) {
    best = level;
    GameKit.saveBest(BEST_KEY, best);
  }
  const stars = game.mistakes === 0 ? 3 : game.mistakes <= 2 ? 2 : 1;
  // careful AND quick earns a lightning bolt on top of the stars
  const quick = !game.relax && game.timeLeft >= game.timeLimit * 0.25;
  document.getElementById('done-stars').textContent =
    '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + (quick ? ' ⚡' : '');
  if (level === MAX_LEVEL) {
    document.getElementById('done-title').textContent = '\u{1F393} Doctor of Emoji Medicine!';
    document.getElementById('done-note').textContent =
      `You climbed all ${MAX_LEVEL} levels — that's a real doctor's diploma! ` +
      'Keep on doctoring as long as you like.';
  } else {
    document.getElementById('done-title').textContent = `Level ${level} cleared! \u{1F389}`;
    document.getElementById('done-note').textContent =
      ['', 'A good save, doctor!', 'Great work, doctor!', 'A perfect operation!'][stars] +
      (quick ? ' ⚡ Lightning fast' : '') +
      (game.relax ? '' : ` — ⏱ ${Math.ceil(game.timeLeft)}s to spare`) + '.';
  }
  setMsg('All better! \u{1F389}');
  game.timer = setTimeout(() => donePanel.classList.add('show'), 1000);
}

// ── Open / close / flow ───────────────────────────────────────────────────────

function pickCase() {
  const pool = CASES.filter(c => c !== lastCase);
  return pool[Math.floor(Math.random() * pool.length)];
}

// deal one case as the current level: fresh game state, level-scaled params,
// level-scaled time limit, intro card up
function openCase(caseDef) {
  lastCase = caseDef;

  game = {
    caseDef, phase: 'intro', stepIdx: 0, step: null,
    mood: 100, mistakes: 0, tool: null, relax,
    ptr: { down: false, x: 0, y: 0 }, art: {}, orbit: null, lastT: 0,
  };
  game.params = caseDef.prep ? caseDef.prep(level) : {};
  game.steps = caseDef.steps(game.params);
  // the level-1 base time shrinks 5% per level, flooring at half
  game.timeLimit = Math.round(caseDef.time * Math.max(0.5, 1 - 0.05 * (level - 1)));
  game.timeLeft = game.timeLimit;

  patientG.innerHTML = GameKit.emojiSnapshotSvg();
  woundsG.innerHTML = '';
  fx.reset();
  ring = null; ghost = null;
  cursorG.setAttribute('visibility', 'hidden');
  tray.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('is-active', 'is-hint'));

  titleEl.textContent = caseDef.icon + ' ' + caseDef.name;
  document.getElementById('timer-level').textContent = 'Lv ' + level;
  document.getElementById('intro-level').textContent = 'Level ' + level;
  document.getElementById('intro-icon').textContent = caseDef.icon;
  document.getElementById('intro-name').textContent = caseDef.name;
  document.getElementById('intro-story').textContent = caseDef.story;
  document.getElementById('intro-time').textContent =
    relax ? '\u{1F324}\u{FE0F} No timer' : '⏱ ' + game.timeLimit + ' seconds';
  document.getElementById('intro-best').textContent = best > 0 ? '\u{1F3C6} Best: level ' + best : '';
  timerRow().style.display = relax ? 'none' : '';
  timerRow().classList.remove('low', 'critical');
  updateTimer();
  donePanel.classList.remove('show');
  failPanel.classList.remove('show');
  introPanel.classList.add('show');
  setMsg('Your patient is here! \u{1F691}');
  updateMood();

  game.raf = requestAnimationFrame(tickLoop);
}

function openClinic() {
  level = 1;   // a fresh visit starts the ladder from the bottom
  openOverlay(overlay, closeClinic);
  openCase(pickCase());
}

function startOp() {
  introPanel.classList.remove('show');
  game.art = {};
  if (game.caseDef.dress) game.caseDef.dress(woundsG, game.art);
  startStep();
}

function endCase() {
  cancelAnimationFrame(game.raf);
  clearTimeout(game.timer);
  clearTimeout(msgTimer);
  game = null;
}

function nextLevel() {
  endCase();
  level++;
  openCase(pickCase());   // pickCase still excludes the case just cleared
}

function retryLevel() {
  const again = game.caseDef;   // same patient, same level, fresh clock
  endCase();
  openCase(again);
}

function closeClinic() {
  if (game) endCase();
  closeOverlay(overlay);
}

function tickLoop(t) {
  if (!game) return;
  const dt = game.lastT ? Math.min(0.05, (t - game.lastT) / 1000) : 0.016;
  game.lastT = t;
  if (!game.relax && (game.phase === 'op' || game.phase === 'wait')) tickTimer(dt);
  if (game && game.phase === 'op') {
    const h = HANDLERS[game.step.type];
    if (h.tick) h.tick(dt);
  }
  if (game && game.orbit) {          // dizzy stars circling the bonked head
    const o = game.orbit;
    o.t += dt * 2;
    o.els.forEach((s, i) => {
      const a = o.t + i * Math.PI;
      s.setAttribute('x', (o.cx + Math.cos(a) * o.r).toFixed(1));
      s.setAttribute('y', (o.cy + Math.sin(a) * o.r * 0.3).toFixed(1));
    });
  }
  fx.tick(dt);
  if (game) game.raf = requestAnimationFrame(tickLoop);
}

// ── Tool tray & cursor ────────────────────────────────────────────────────────

function buildTray() {
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.id = 'tool-' + t.id;
    b.setAttribute('aria-label', t.name);
    b.innerHTML = `<span class="tool-emoji" aria-hidden="true">${t.emoji}</span>` +
                  `<span class="tool-name">${t.name}</span>`;
    b.addEventListener('click', () => selectTool(t.id));
    tray.appendChild(b);
  });
}

function selectTool(id) {
  if (!game) return;
  game.tool = id;
  SFX.pick();
  tray.querySelectorAll('.tool-btn').forEach(b =>
    b.classList.toggle('is-active', b.id === 'tool-' + id));
  cursorText.textContent = toolById(id).emoji;
}

// soft pulse on the tool the current step needs — young players get guided
function highlightTool(id) {
  tray.querySelectorAll('.tool-btn').forEach(b =>
    b.classList.toggle('is-hint', id !== null && b.id === 'tool-' + id));
}

function moveCursor(p) {
  if (!game || !game.tool) {
    cursorG.setAttribute('visibility', 'hidden');
    return;
  }
  cursorG.setAttribute('visibility', 'visible');
  cursorG.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
}

// ── Pointer input ─────────────────────────────────────────────────────────────

function onDown(e) {
  if (!game || game.phase !== 'op') return;
  const p = GameKit.svgPoint(opSvg, e);
  if (!p) return;
  game.ptr = { down: true, x: p.x, y: p.y };
  moveCursor(p);
  if (opSvg.setPointerCapture) try { opSvg.setPointerCapture(e.pointerId); } catch (err) {}
  if (!game.tool) { flashMsg('Pick a tool from the tray!'); return; }
  if (game.tool !== game.step.tool) {
    if (onPatient(p)) mistake();     // wrong tool on the patient — Trauma Center says no
    return;
  }
  const h = HANDLERS[game.step.type];
  if (h.down) h.down(p);
  e.preventDefault();
}

function onMove(e) {
  if (!game || game.phase !== 'op') return;
  const p = GameKit.svgPoint(opSvg, e);
  if (!p) return;
  game.ptr.x = p.x;
  game.ptr.y = p.y;
  moveCursor(p);
  if (game.ptr.down && game.tool === game.step.tool) {
    const h = HANDLERS[game.step.type];
    if (h.move) h.move(p);
    e.preventDefault();
  }
}

function onUp(e) {
  if (!game) return;
  game.ptr.down = false;
  if (game.phase !== 'op' || game.tool !== game.step.tool) return;
  const h = HANDLERS[game.step.type];
  if (h.up) h.up(GameKit.svgPoint(opSvg, e) || { x: game.ptr.x, y: game.ptr.y });
}

// ── Init & registry ───────────────────────────────────────────────────────────

function initClinic() {
  overlay = document.getElementById('clinic');
  opSvg = document.getElementById('op-svg');
  patientG = document.getElementById('op-patient');
  woundsG = document.getElementById('op-wounds');
  fxG = document.getElementById('op-fx');
  cursorG = document.getElementById('op-cursor');
  titleEl = document.getElementById('clinic-title');
  msgEl = document.getElementById('clinic-msg');
  moodFace = document.getElementById('mood-face');
  moodFill = document.getElementById('mood-fill');
  tray = document.getElementById('tool-tray');
  stageEl = document.querySelector('.clinic-stage');
  introPanel = document.getElementById('clinic-intro');
  donePanel = document.getElementById('clinic-done');
  failPanel = document.getElementById('clinic-fail');
  fx = GameKit.particles(fxG, 0);   // the clinic's puffs float rather than fall

  cursorText = el('text', {
    x: 0, y: -2.5, 'font-size': 8, 'text-anchor': 'middle',
  }, cursorG);

  best = GameKit.loadBest(BEST_KEY);
  try { relax = localStorage.getItem(RELAX_KEY) === '1'; } catch (e) {}
  const relaxBox = document.getElementById('clinic-relax');
  relaxBox.checked = relax;
  relaxBox.addEventListener('change', () => {
    relax = relaxBox.checked;
    try { localStorage.setItem(RELAX_KEY, relax ? '1' : '0'); } catch (e) {}
    if (game && game.phase === 'intro') {
      game.relax = relax;
      document.getElementById('intro-time').textContent =
        relax ? '\u{1F324}\u{FE0F} No timer' : '⏱ ' + game.timeLimit + ' seconds';
      timerRow().style.display = relax ? 'none' : '';
    }
  });

  buildTray();
  document.getElementById('clinic-close').addEventListener('click', closeClinic);
  document.getElementById('intro-start').addEventListener('click', startOp);
  document.getElementById('done-again').addEventListener('click', nextLevel);
  document.getElementById('done-close').addEventListener('click', closeClinic);
  document.getElementById('fail-retry').addEventListener('click', retryLevel);
  document.getElementById('fail-close').addEventListener('click', closeClinic);

  // tiny hook for automated tests: shrink the clock / peek at the phase
  window.__clinic = {
    hurry: () => { if (game) game.timeLeft = Math.min(game.timeLeft, 2); },
    state: () => game && {
      phase: game.phase, level, timeLeft: game.timeLeft,
      case: game.caseDef.id, relax: game.relax,
    },
  };

  opSvg.addEventListener('pointerdown', onDown);
  opSvg.addEventListener('pointermove', onMove);
  opSvg.addEventListener('pointerup', onUp);
  opSvg.addEventListener('pointercancel', onUp);
  // held tools (rub, hold-still) must not pop the browser's long-press menu
  opSvg.addEventListener('contextmenu', e => e.preventDefault());
}

// register before games.js builds the Games picker on DOMContentLoaded
window.MINIGAMES = window.MINIGAMES || {};
window.MINIGAMES.clinic = {
  name: 'Emoji Doctor', emoji: '\u{1FA7A}', start: openClinic,
  best: () => best > 0 ? 'Lv ' + best : '',
};

document.addEventListener('DOMContentLoaded', initClinic);

})();
