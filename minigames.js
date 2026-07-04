'use strict';

// ── Emojicle Clinic — a pocket-surgery minigame ───────────────────────────────
// Trauma Center-style operations, kid-sized: the emoji currently on the canvas
// becomes the patient. A case is a short sequence of steps (spray, tweeze,
// suture, ice…), each needing the right tool from the tray. There is no fail
// state — using the wrong tool just dents the happy meter, which decides the
// star rating at the end.
//
// Reads the builder's globals (PARTS, state, offsets, zOrder, note,
// getAudioCtx, pulse); everything else stays inside this IIFE.
//
// MINIGAMES at the bottom is the registry: to add another game later, give it
// a start() entry there and the Play button grows a picker.

(function () {

const NS = 'http://www.w3.org/2000/svg';

// tiny SVG element helper
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rnd = (a, b) => a + Math.random() * (b - a);

// distance from point m to segment a→b (used to detect suture crossings)
function segDist(m, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(m.x - a.x, m.y - a.y);
  const t = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / l2));
  return Math.hypot(m.x - (a.x + dx * t), m.y - (a.y + dy * t));
}

// ── Sounds (reuse note() from app.js — synthesized, no audio files) ──────────

function sfx(fn) {
  const ctx = getAudioCtx();
  if (ctx) fn(ctx, ctx.currentTime + 0.02);
}

const SFX = {
  pick:   () => sfx((c, t) => note(c, t, 520, 0.07, { vol: 0.06 })),
  spray:  () => sfx((c, t) => note(c, t, 900 + Math.random() * 300, 0.04, { type: 'sine', vol: 0.02 })),
  pop:    () => sfx((c, t) => note(c, t, 260, 0.13, { type: 'sine', glide: 760, vol: 0.12 })),
  squish: () => sfx((c, t) => note(c, t, 520, 0.12, { type: 'sine', glide: 140, vol: 0.1 })),
  stitch: () => sfx((c, t) => note(c, t, 660, 0.05, { type: 'square', vol: 0.035 })),
  buzz:   () => sfx((c, t) => note(c, t, 110, 0.25, { type: 'square', vol: 0.05 })),
  step:   () => sfx((c, t) => { note(c, t, 523.25, 0.1, { vol: 0.08 }); note(c, t + 0.11, 659.25, 0.16, { vol: 0.08 }); }),
  win:    () => sfx((c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, t + i * 0.13, f, 0.18, { vol: 0.09 }))),
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

let game = null;        // null when the clinic is closed
let lastCase = null;    // avoid dealing the same case twice in a row
let parts = [];         // live particles
let ring = null;        // hold-progress ring
let ghost = null;       // dashed "put it here" target circle
let msgTimer = null;

// DOM refs, resolved once in initClinic
let overlay, opSvg, patientG, woundsG, fxG, cursorG, cursorText,
    titleEl, msgEl, moodFace, moodFill, tray, stageEl,
    introPanel, donePanel;

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
  const germ = {
    x: 36 + Math.cos(a) * d, y: 36 + Math.sin(a) * d,
    vx: Math.cos(va) * 7, vy: Math.sin(va) * 7,
    el: grp, alive: true,
  };
  grp.setAttribute('transform', `translate(${germ.x} ${germ.y})`);
  return germ;
}

function moveGerm(g, dt) {
  g.vx += rnd(-15, 15) * dt;
  g.vy += rnd(-15, 15) * dt;
  const sp = Math.hypot(g.vx, g.vy);
  if (sp > 9) { g.vx *= 9 / sp; g.vy *= 9 / sp; }
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

// ── Particles (bubbles, pops, sparkles, confetti) ────────────────────────────

function puff(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(4, 12);
    parts.push({
      el: el('circle', { cx: x, cy: y, r: rnd(0.6, 1.5), fill: color }, fxG),
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: rnd(1.6, 2.6), grav: 0,
    });
  }
}

function sparkleBurst(x, y) {
  puff(x, y, '#FFD93B', 7);
  puff(x, y, '#FFF3B0', 7);
}

function confetti() {
  const colors = ['#FF5A5F', '#FFD93B', '#2BB673', '#8E6FF7', '#69B7FF', '#FF4FA3'];
  for (let i = 0; i < 26; i++) {
    const x = rnd(6, 66);
    parts.push({
      el: el('rect', { width: 1.7, height: 1.1, fill: colors[i % colors.length] }, fxG),
      x, y: -8, vx: rnd(-5, 5), vy: rnd(6, 14),
      life: 1, decay: 0.4, grav: 16,
      rot: rnd(0, 360), vr: rnd(-300, 300),
    });
  }
}

function tickParts(dt) {
  parts = parts.filter(p => {
    p.life -= dt * p.decay;
    if (p.life <= 0) { p.el.remove(); return false; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.vr !== undefined) {
      p.rot += p.vr * dt;
      p.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)})`);
    } else {
      p.el.setAttribute('cx', p.x.toFixed(1));
      p.el.setAttribute('cy', p.y.toFixed(1));
    }
    p.el.setAttribute('opacity', p.life.toFixed(2));
    return true;
  });
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

const SPLINTERS = [
  { x: 30, y: 24, a: -27 },
  { x: 46, y: 29, a: 55 },
  { x: 39, y: 51, a: 169 },
];

const CASES = [
  {
    id: 'scrape', icon: '\u{1F6F9}', name: 'Skateboard Scrape',
    story: 'Your emoji wiped out on a skateboard and scraped its cheek. Clean it, stitch it, patch it!',
    dress(g, art) {
      art.cut = jaggedLine(g, 21, 41.5, 29, 48.5, '#E05252', 1.1);
      art.dots = [[23, 41], [27.5, 44], [25, 47.5]].map(([x, y]) =>
        el('circle', { cx: x, cy: y, r: 1.5, fill: '#8CC63F', stroke: '#5E9427', 'stroke-width': 0.4 }, g));
    },
    steps: [
      { type: 'spray', tool: 'spray', text: 'Spray the scrape squeaky clean!',
        zones: [{ x: 25, y: 45, r: 7.5 }], time: 1.6,
        onProgress(p) { game.art.dots.forEach(d => d.setAttribute('opacity', String(1 - p))); } },
      { type: 'suture', tool: 'suture', text: 'Stitch the cut — zigzag across it!',
        line: { x1: 21, y1: 41.5, x2: 29, y2: 48.5 }, stitches: 4,
        onDone() { game.art.cut.setAttribute('stroke', '#EBA8A8'); } },
      { type: 'place', tool: 'bandage', text: 'Finish with a bandage!',
        target: { x: 25, y: 45, r: 7 }, rot: -40 },
    ],
  },
  {
    id: 'cactus', icon: '\u{1F335}', name: 'Cactus Hug',
    story: 'Your emoji hugged a cactus (it looked friendly). Three prickles need to come out!',
    dress(g, art) {
      art.holes = SPLINTERS.map(it =>
        el('circle', { cx: it.x, cy: it.y, r: 1.1, fill: '#E8938C', opacity: 0 }, g));
      art.spl = SPLINTERS.map(it => drawSplinter(g, it));
    },
    steps: [
      { type: 'tweeze', tool: 'tweezers', text: 'Grab each prickle and pull it out!', items: SPLINTERS },
      { type: 'spray', tool: 'spray', text: 'Spray each sore spot!',
        zones: SPLINTERS.map(it => ({ x: it.x, y: it.y, r: 4.5 })), time: 0.7,
        onZoneProgress(i, p) { game.art.holes[i].setAttribute('opacity', String(1 - p)); } },
    ],
  },
  {
    id: 'germs', icon: '\u{1F9A0}', name: 'Germ Attack',
    story: 'Your emoji forgot to wash its hands and now germs are having a party. Zap them all!',
    dress() {},   // the germs are spawned by the zap step itself
    steps: [
      { type: 'zap', tool: 'spray', text: 'Spray every wiggly germ!', count: 6 },
      { type: 'hold', tool: 'syringe', text: 'One vitamin boost to finish!',
        target: { x: 46, y: 46, r: 8 }, time: 1.3,
        onDone() { sparkleBurst(46, 46); } },
    ],
  },
  {
    id: 'fever', icon: '\u{1F975}', name: 'Too Hot!',
    story: 'Your emoji feels all hot and wobbly. Find out how hot, then cool it down!',
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
    steps: [
      { type: 'hold', tool: 'thermo', text: 'Hold the thermometer on the forehead!',
        target: { x: 36, y: 23, r: 8 }, time: 1.3,
        onDone() { game.art.temp.textContent = '39.9°!'; game.art.temp.setAttribute('opacity', 1); } },
      { type: 'hold', tool: 'ice', text: '39.9°?! Ice pack on the forehead!',
        target: { x: 36, y: 23, r: 9 }, time: 2.2,
        onProgress(p) {
          game.art.temp.textContent = (39.9 - 3.4 * p).toFixed(1) + '°';
          game.art.cheeks.forEach(c => c.setAttribute('opacity', String(0.55 * (1 - p))));
          game.art.drops.forEach(d => d.setAttribute('opacity', String(0.9 * (1 - p))));
        },
        onDone() {
          game.art.temp.textContent = '36.5°';
          game.art.temp.setAttribute('fill', '#2BB673');
        } },
      { type: 'hold', tool: 'syringe', text: 'Vitamins so the fever stays away!',
        target: { x: 46, y: 46, r: 8 }, time: 1.3,
        onDone() { sparkleBurst(46, 46); } },
    ],
  },
  {
    id: 'bump', icon: '\u{1F4AB}', name: 'Bonked Head',
    story: 'Your emoji bonked its head and now it sees little stars. Shrink that bump!',
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
    steps: [
      { type: 'hold', tool: 'ice', text: 'Hold the ice on the bump till it shrinks!',
        target: { x: 44, y: 15, r: 7 }, time: 2.2,
        onProgress(p) {
          game.art.bump.setAttribute('rx', String(4.4 - 3.8 * p));
          game.art.bump.setAttribute('ry', String(4 - 3.5 * p));
          game.orbit.els.forEach(s => s.setAttribute('opacity', String(0.9 * (1 - p))));
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
        puff(game.ptr.x + rnd(-2, 2), game.ptr.y + rnd(-2, 2), '#BFE7FF', 2);
      }
      const i = s.zones.indexOf(z);
      if (s.onZoneProgress) s.onZoneProgress(i, z.p);
      if (s.onProgress) s.onProgress(z.p);
      if (z.p >= 1) {
        z.done = true;
        hideRing();
        puff(z.x, z.y, '#BFE7FF', 8);
        if (s.zones.every(q => q.done)) completeStep();
      }
    },
  },

  // grab a splinter and drag it out along its own axis
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
        puff(it.x, it.y, '#C98A4B', 6);
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
          puff(m.x, m.y, '#9FD5FF', 3);
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
      puff(p.x, p.y, '#BFE7FF', 3);
      const g = s.germs.find(q => q.alive && dist(p, q) < 5);
      if (!g) return;
      g.alive = false;
      g.el.remove();
      SFX.squish();
      puff(g.x, g.y, '#8CC63F', 7);
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
        puff(s.target.x, s.target.y, '#FFD9A8', 6);
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
  game.step = game.caseDef.steps[game.stepIdx];
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
  if (game.stepIdx >= game.caseDef.steps.length) { finishOp(); return; }
  setMsg(PRAISE[Math.floor(Math.random() * PRAISE.length)], 'praise');
  game.timer = setTimeout(startStep, 950);
}

function finishOp() {
  game.phase = 'done';
  SFX.win();
  confetti();
  highlightTool(null);
  const stars = game.mistakes === 0 ? 3 : game.mistakes <= 2 ? 2 : 1;
  document.getElementById('done-stars').textContent =
    '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('done-note').textContent =
    ['', 'A good save, doctor!', 'Great work, doctor!', 'A perfect operation!'][stars];
  setMsg('All better! \u{1F389}');
  game.timer = setTimeout(() => donePanel.classList.add('show'), 1000);
}

// ── Patient snapshot ──────────────────────────────────────────────────────────
// Same recipe as the builder's export: current parts in their current stacking
// order, with any drag offsets baked in.

function patientSvg() {
  let inner = '';
  zOrder.forEach(layer => {
    const part = PARTS[layer][state[layer]];
    if (!part || !part.svg) return;
    const o = offsets[layer] || { x: 0, y: 0 };
    const t = (o.x || o.y) ? ` transform="translate(${o.x} ${o.y})"` : '';
    inner += `<g${t}>${part.svg}</g>`;
  });
  return inner;
}

// ── Open / close / flow ───────────────────────────────────────────────────────

function openClinic() {
  const pool = CASES.filter(c => c !== lastCase);
  const caseDef = pool[Math.floor(Math.random() * pool.length)];
  lastCase = caseDef;

  game = {
    caseDef, phase: 'intro', stepIdx: 0, step: null,
    mood: 100, mistakes: 0, tool: null,
    ptr: { down: false, x: 0, y: 0 }, art: {}, orbit: null, lastT: 0,
  };

  patientG.innerHTML = patientSvg();
  woundsG.innerHTML = '';
  fxG.innerHTML = '';
  parts = []; ring = null; ghost = null;
  cursorG.setAttribute('visibility', 'hidden');
  tray.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('is-active', 'is-hint'));

  titleEl.textContent = caseDef.icon + ' ' + caseDef.name;
  document.getElementById('intro-icon').textContent = caseDef.icon;
  document.getElementById('intro-name').textContent = caseDef.name;
  document.getElementById('intro-story').textContent = caseDef.story;
  donePanel.classList.remove('show');
  introPanel.classList.add('show');
  setMsg('Your patient is here! \u{1F691}');
  updateMood();

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('clinic-open');
  game.raf = requestAnimationFrame(tickLoop);
}

function startOp() {
  introPanel.classList.remove('show');
  game.art = {};
  if (game.caseDef.dress) game.caseDef.dress(woundsG, game.art);
  startStep();
}

function nextPatient() {
  cancelAnimationFrame(game.raf);
  clearTimeout(game.timer);
  clearTimeout(msgTimer);
  game = null;
  openClinic();
}

function closeClinic() {
  if (!game) return;
  cancelAnimationFrame(game.raf);
  clearTimeout(game.timer);
  clearTimeout(msgTimer);
  game = null;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('clinic-open');
}

function tickLoop(t) {
  if (!game) return;
  const dt = game.lastT ? Math.min(0.05, (t - game.lastT) / 1000) : 0.016;
  game.lastT = t;
  if (game.phase === 'op') {
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
  tickParts(dt);
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

function toOp(evt) {
  const m = opSvg.getScreenCTM();
  if (!m) return null;
  const pt = opSvg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(m.inverse());
}

function onDown(e) {
  if (!game || game.phase !== 'op') return;
  const p = toOp(e);
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
  const p = toOp(e);
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
  if (h.up) h.up(toOp(e) || { x: game.ptr.x, y: game.ptr.y });
}

// ── Minigame registry & init ──────────────────────────────────────────────────
// One game for now, so Play launches it directly; when a second game lands,
// give this a picker sheet like the dance one.

const MINIGAMES = {
  clinic: { name: 'Emoji Doctor', emoji: '\u{1FA7A}', start: openClinic },
};

function onPlayButton() {
  pulse('btn-play');
  const keys = Object.keys(MINIGAMES);
  MINIGAMES[keys[0]].start();
}

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

  cursorText = el('text', {
    x: 0, y: -2.5, 'font-size': 8, 'text-anchor': 'middle',
  }, cursorG);

  buildTray();
  document.getElementById('btn-play').addEventListener('click', onPlayButton);
  document.getElementById('clinic-close').addEventListener('click', closeClinic);
  document.getElementById('intro-start').addEventListener('click', startOp);
  document.getElementById('done-again').addEventListener('click', nextPatient);
  document.getElementById('done-close').addEventListener('click', closeClinic);

  opSvg.addEventListener('pointerdown', onDown);
  opSvg.addEventListener('pointermove', onMove);
  opSvg.addEventListener('pointerup', onUp);
  opSvg.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeClinic(); });
}

document.addEventListener('DOMContentLoaded', initClinic);

})();
