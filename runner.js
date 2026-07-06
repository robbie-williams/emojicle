'use strict';

// ── Rescue Runner — a body-swapping platform runner (issue #6) ───────────────
// The emoji on the canvas becomes the Hero, dashing down three sky-bridge
// rails toward a stranded Civilian. Obstacles scroll toward the hero; each is
// beaten by exactly one hero body — Muscle smashes crates, Blaze melts ice
// walls, Ghost phases through laser fences, Rocket's long jump crosses wide
// chasms — while plain gaps just need a jump in any body. Swapping bodies
// plays a short sparkle flourish before the new powers go live, so swapping
// early is the skill. Optional civilians stand just off the easy path for
// bonus scoops; the main Civilian waits at the finish, and grabbing them ends
// the level with both leaping off the top of the screen.
//
// Levels are generated as a sequence of beats (breather / obstacle on 1–2
// rails / gap / chasm / gap+obstacle combo) that get faster and denser with
// the level number; obstacle RULES never change, only pacing. Mistakes cost a
// life (3 per level) with a forgiving stumble — the failed obstacle visibly
// wobbles in place for a beat so the cause is clear — not a game over; losing
// all three offers a retry of the same level. Clearing level 10 earns the
// Hero Medal (play continues endlessly after). Best level cleared persists
// in localStorage.
//
// Reads the builder's globals plus GameKit from games-common.js, and registers
// itself in the shared window.MINIGAMES registry so the Games picker lists it.

(function () {

const { el, rnd, ri, pick, sfx } = GameKit;

// ── Sounds (synthesized via note() from app.js — no audio files) ─────────────

const SFX = {
  boing:   () => sfx((c, t) => note(c, t, 150, 0.22, { type: 'sine', glide: 440, vol: 0.09 })),
  swap:    () => sfx((c, t) => { note(c, t, 523.25, 0.08, { vol: 0.07 }); note(c, t + 0.08, 783.99, 0.14, { vol: 0.08 }); }),
  smash:   () => sfx((c, t) => { note(c, t, 170, 0.14, { type: 'square', glide: 90, vol: 0.07 }); note(c, t + 0.02, 90, 0.18, { type: 'sine', vol: 0.1 }); }),
  melt:    () => sfx((c, t) => note(c, t, 1300, 0.25, { type: 'sine', glide: 480, vol: 0.07 })),
  phase:   () => sfx((c, t) => note(c, t, 260, 0.22, { type: 'square', glide: 620, vol: 0.04 })),
  pickup:  () => sfx((c, t) => { note(c, t, 659.25, 0.09, { vol: 0.08 }); note(c, t + 0.1, 880, 0.15, { vol: 0.08 }); }),
  stumble: () => sfx((c, t) => { note(c, t, 330, 0.12, { type: 'square', vol: 0.05 }); note(c, t + 0.12, 220, 0.2, { type: 'square', vol: 0.05 }); }),
  win:     () => sfx((c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, t + i * 0.13, f, 0.18, { vol: 0.09 }))),
  gentle:  () => sfx((c, t) => { note(c, t, 523.25, 0.2, { vol: 0.08 }); note(c, t + 0.22, 659.25, 0.3, { vol: 0.08 }); }),
};

// ── Track geometry ────────────────────────────────────────────────────────────
// Stage viewBox is 0 0 72 96. Three vertical rails scroll downward past the
// hero, who runs in place at HERO_Y. An entity at track distance `d` is drawn
// at screenY = HERO_Y - (d - traveled), so it reaches the hero when d ==
// traveled. Jumps cover a fixed track DISTANCE (not time), so their reach is
// the same at every level speed.

const RX = [14, 36, 58];        // rail centre x
const HERO_Y = 74;
const GAP_LEN = 7, CHASM_LEN = 20;
const JUMP_DIST = 18, ROCKET_DIST = 34;
const SWAP_TIME = 0.45;         // the sparkle flourish before powers go live
const SKY_DEEP = '#6FB2E4', WOOD = '#D9A45C', WOOD_EDGE = '#B5813E';
const MAX_LEVEL = 10;           // the medal level; play continues endlessly after

// ── Hero bodies ───────────────────────────────────────────────────────────────
// The default 'plain' body has no power; each obstacle type is beaten by
// exactly one of these four. Rocket also stretches jump distance, which is
// what "beats" the wide chasms.

const BODIES = [
  { id: 'muscle', name: 'Muscle', emoji: '\u{1F4AA}' },
  { id: 'blaze',  name: 'Blaze',  emoji: '\u{1F525}' },
  { id: 'ghost',  name: 'Ghost',  emoji: '\u{1F47B}' },
  { id: 'rocket', name: 'Rocket', emoji: '\u{1F680}' },
];

// body art, drawn under the head (local coords: torso centred on 0, feet ~6.6)
function drawBody(g, id) {
  g.innerHTML = '';
  if (id !== 'ghost') {          // ghosts float — everyone else gets legs
    el('line', { x1: -1.7, y1: 4, x2: -1.7, y2: 6.6, stroke: '#6B5B4A', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, g);
    el('line', { x1: 1.7, y1: 4, x2: 1.7, y2: 6.6, stroke: '#6B5B4A', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, g);
  }
  if (id === 'muscle') {
    el('rect', { x: -4.4, y: -3.4, width: 8.8, height: 7.8, rx: 3, fill: '#E05252', stroke: '#B23B3B', 'stroke-width': 0.5 }, g);
    [-1, 1].forEach(s => {
      el('circle', { cx: 5.4 * s, cy: -2.2, r: 2.3, fill: '#E05252', stroke: '#B23B3B', 'stroke-width': 0.5 }, g);
      el('circle', { cx: 6.3 * s, cy: 0.8, r: 1.5, fill: '#F6C99F' }, g);
    });
  } else if (id === 'blaze') {
    el('path', { d: 'M-4.6 4 Q-6.4 0 -4.8 -3.6 Q-4 -6.2 -2.4 -4.4 Q0 -8 2.4 -4.4 Q4 -6.2 4.8 -3.6 Q6.4 0 4.6 4 Z',
      fill: '#FFB020', opacity: 0.9 }, g);
    el('rect', { x: -3.1, y: -3.2, width: 6.2, height: 7.6, rx: 2.6, fill: '#FF7043', stroke: '#D84E2A', 'stroke-width': 0.5 }, g);
    el('path', { d: 'M0 1.8 Q-1.4 0.2 -0.6 -1.2 Q0 -2.4 0.6 -1.2 Q1.4 0.2 0 1.8 Z', fill: '#FFD93B' }, g);
  } else if (id === 'ghost') {
    el('path', { d: 'M-3.6 -2.6 Q-3.6 -5.4 0 -5.4 Q3.6 -5.4 3.6 -2.6 L3.6 3.4 Q2.4 2.2 1.2 3.6 Q0 5 -1.2 3.6 Q-2.4 2.2 -3.6 3.4 Z',
      fill: '#DCEBFF', opacity: 0.66, stroke: '#AFC8E8', 'stroke-width': 0.5 }, g);
    [-1, 1].forEach(s =>
      el('path', { d: `M${3.6 * s} -1 Q${5.4 * s} -0.4 ${5 * s} 1.4`, stroke: '#DCEBFF',
        'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.66 }, g));
  } else if (id === 'rocket') {
    [-1, 1].forEach(s => {
      el('rect', { x: 3.1 * s - (s < 0 ? 2.1 : 0), y: -2.8, width: 2.1, height: 6, rx: 1, fill: '#9AA7B4', stroke: '#7A8794', 'stroke-width': 0.4 }, g);
      el('path', { d: `M${4.2 * s} 3.4 L${4.9 * s} 6.2 L${4.2 * s} 5.1 L${3.5 * s} 6.2 Z`, fill: '#FFB020' }, g);
    });
    el('rect', { x: -3.1, y: -3.4, width: 6.2, height: 7.8, rx: 2.6, fill: '#4FB3BF', stroke: '#3A8E98', 'stroke-width': 0.5 }, g);
  } else {   // plain — no special power
    el('rect', { x: -3.1, y: -3.4, width: 6.2, height: 7.8, rx: 2.6, fill: '#B8C4D0', stroke: '#93A2B1', 'stroke-width': 0.5 }, g);
    [-1, 1].forEach(s =>
      el('line', { x1: 3.4 * s, y1: -1.6, x2: 4.4 * s, y2: 2.4, stroke: '#B8C4D0', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g));
  }
}

// ── Obstacles ─────────────────────────────────────────────────────────────────
// Wall obstacles sit ON the rail (art extends upward from the entity's d).
// They're tall — jumping doesn't help; only the matching body does.

const OBSTACLES = {
  crate: {
    body: 'muscle', len: 3, sfx: 'smash', puffColor: '#C98A4B',
    msg: '\u{1F4A5} Smashed!', hint: 'Crates need \u{1F4AA} Muscle!',
    draw(g) {
      [[-5.75, -5.6, 11.5, 5.6], [-4.25, -10.8, 8.5, 5.2]].forEach(([x, y, w, h]) => {
        el('rect', { x, y, width: w, height: h, rx: 0.7, fill: '#C98A4B', stroke: '#8B5A2B', 'stroke-width': 0.5 }, g);
        el('line', { x1: x + 0.8, y1: y + 0.8, x2: x + w - 0.8, y2: y + h - 0.8, stroke: '#8B5A2B', 'stroke-width': 0.45 }, g);
        el('line', { x1: x + w - 0.8, y1: y + 0.8, x2: x + 0.8, y2: y + h - 0.8, stroke: '#8B5A2B', 'stroke-width': 0.45 }, g);
      });
    },
  },
  ice: {
    body: 'blaze', len: 3, sfx: 'melt', puffColor: '#BFE7FF',
    msg: '\u{1F525} Melted!', hint: 'Ice melts for \u{1F525} Blaze!',
    draw(g) {
      el('path', { d: 'M-6.5 0 L-6.5 -7 L-4.5 -9.5 L-2 -7.5 L0 -10.5 L2.5 -7.5 L4.5 -9.8 L6.5 -7 L6.5 0 Z',
        fill: '#BFE7FF', opacity: 0.9, stroke: '#8FCBEF', 'stroke-width': 0.5 }, g);
      el('line', { x1: -3.5, y1: -1.5, x2: -1.5, y2: -6.5, stroke: '#FFFFFF', 'stroke-width': 0.8, opacity: 0.8, 'stroke-linecap': 'round' }, g);
      el('line', { x1: 1, y1: -1.5, x2: 2.6, y2: -5.5, stroke: '#FFFFFF', 'stroke-width': 0.6, opacity: 0.7, 'stroke-linecap': 'round' }, g);
    },
  },
  laser: {
    body: 'ghost', len: 3, sfx: 'phase', puffColor: '#FF9DD6',
    msg: '\u{1F47B} Phased through!', hint: 'Lasers need \u{1F47B} Ghost!',
    draw(g) {
      [-7, 7].forEach(x => {
        el('rect', { x: x - 0.9, y: -9, width: 1.8, height: 9, rx: 0.6, fill: '#7A8794', stroke: '#5C6771', 'stroke-width': 0.4 }, g);
        el('circle', { cx: x, cy: -9, r: 0.9, fill: '#FF4FA3' }, g);
      });
      [-2.2, -4.7, -7.2].forEach(y => {
        el('line', { x1: -6.4, y1: y, x2: 6.4, y2: y, stroke: '#FF4FA3', 'stroke-width': 0.9, opacity: 0.85, 'stroke-linecap': 'round' }, g);
        el('line', { x1: -6.4, y1: y, x2: 6.4, y2: y, stroke: '#FFC0DF', 'stroke-width': 0.35, opacity: 0.9 }, g);
      });
    },
  },
};

// gap / chasm art — a hole in the planks showing the sky below
function drawGapArt(g, len, wide) {
  el('rect', { x: -8, y: -len, width: 16, height: len, fill: wide ? '#5C9FD6' : SKY_DEEP }, g);
  [[-len, -1], [0, 1]].forEach(([y, flip]) => {
    const pts = [];
    for (let x = -8; x <= 8; x += 2) {
      pts.push(x + ',' + (y + (Math.abs(x / 2) % 2 ? 1.3 : 0.2) * flip).toFixed(1));
    }
    el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#8A5F2B', 'stroke-width': 0.8 }, g);
  });
  if (wide) el('ellipse', { cx: 0, cy: -len / 2, rx: 4.5, ry: 1.2, fill: '#FFFFFF', opacity: 0.55 }, g);
}

// ── Civilians ─────────────────────────────────────────────────────────────────
// Little emoji folk with their arms up — each gets a random face from the
// builder's part sets, so every rescue is somebody new.

function randomFaceSvg() {
  let inner = '';
  ['face', 'eyes', 'mouth'].forEach(layer => {
    const arr = PARTS[layer];
    let part = arr[ri(arr.length)];
    if (!part || !part.svg) part = arr.find(q => q.svg) || part;
    if (part && part.svg) inner += part.svg;
  });
  return inner;
}

function drawCiv(g, main) {
  const cBody = main ? '#8E6FF7' : '#FF9F1C';
  const edge = main ? '#6E50D4' : '#DB7F00';
  el('line', { x1: -1.3, y1: 2.8, x2: -1.3, y2: 4.6, stroke: '#6B5B4A', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
  el('line', { x1: 1.3, y1: 2.8, x2: 1.3, y2: 4.6, stroke: '#6B5B4A', 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
  el('rect', { x: -2.4, y: -1.8, width: 4.8, height: 5, rx: 2, fill: cBody, stroke: edge, 'stroke-width': 0.5 }, g);
  [-1, 1].forEach(s => {       // arms up!
    el('line', { x1: 2.4 * s, y1: -0.8, x2: 4.4 * s, y2: -4.6, stroke: cBody, 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: 4.4 * s, cy: -4.6, r: 0.9, fill: '#F6C99F' }, g);
  });
  const head = el('g', { transform: 'translate(-4.05 -10.3) scale(0.1125)' }, g);
  head.innerHTML = randomFaceSvg();
  if (main) {
    const ex = el('text', { 'font-size': 5, 'text-anchor': 'middle', y: -12.5, class: 'rr-help' }, g);
    ex.textContent = '❗';
  }
}

// ── Difficulty ────────────────────────────────────────────────────────────────
// Obstacle rules stay constant; only speed, density and combo pressure climb.

function levelParams(L) {
  return {
    speed: Math.min(24 + 2.4 * (L - 1), 44),
    beats: Math.min(9 + 2 * L, 33),
    spacing: Math.max(34 - 1.1 * (L - 1), 23),
    comboChance: L >= 3 ? Math.min(0.06 + 0.03 * (L - 3), 0.28) : 0,
    doubleChance: Math.min(0.14 + 0.04 * (L - 1), 0.55),
    civs: Math.min(3, Math.floor(rnd(0, Math.min(4, 2 + L * 0.5)))),
  };
}

// ── Level generation ──────────────────────────────────────────────────────────
// A beat is a breather, an obstacle on 1–2 rails, a gap, a chasm, or (later
// levels) a gap+obstacle combo. Nothing ever blocks all three rails at once,
// and the level ends with a guaranteed-clear runway to the main Civilian.

function genLevel(p) {
  const ents = [];
  const kinds = Object.keys(OBSTACLES);
  let d = 78;                                     // opening runway
  for (let i = 0; i < p.beats; i++) {
    const roll = Math.random();
    const rail = ri(3);
    if (roll < 0.12) {
      // breather — nothing this beat
    } else if (roll < 0.28) {
      ents.push({ type: 'gap', rail, d, len: GAP_LEN });
      d += GAP_LEN;
    } else if (roll < 0.40) {
      ents.push({ type: 'chasm', rail, d, len: CHASM_LEN });
      d += CHASM_LEN;
    } else if (roll < 0.40 + p.comboChance) {
      // combo: jump the gap, then smash straight through — swap AND jump
      ents.push({ type: 'gap', rail, d, len: GAP_LEN });
      ents.push({ type: pick(kinds), rail, d: d + GAP_LEN + 8 });
      d += GAP_LEN + 11;
    } else {
      const rails = [0, 1, 2].sort(() => Math.random() - 0.5);
      ents.push({ type: pick(kinds), rail: rails[0], d });
      if (Math.random() < p.doubleChance) ents.push({ type: pick(kinds), rail: rails[1], d });
    }
    d += p.spacing * rnd(0.9, 1.15);
  }
  // optional civilians — a rewarded detour, never inside a beat
  let civTotal = 0;
  for (let i = 0; i < p.civs; i++) {
    for (let tries = 0; tries < 12; tries++) {
      const cd = rnd(110, d - 20), rail = ri(3);
      const clash = ents.some(o => o.rail === rail && cd > o.d - 9 && cd < o.d + (o.len || 3) + 9);
      if (!clash) { ents.push({ type: 'civ', rail, d: cd }); civTotal++; break; }
    }
  }
  const endD = d + 44;                            // clear runway to the rescue
  ents.push({ type: 'main', rail: 1, d: endD });
  return { ents, endD, civTotal };
}

// ── Game state ────────────────────────────────────────────────────────────────

let game = null;        // null when the runner is closed
let level = 1;
let totalSaved = 0;     // civilians rescued across the whole run (incl. mains)
let best = 0;           // highest level ever cleared (persisted)
const BEST_KEY = 'emojicle-runner-best';
let fx = null;          // GameKit particle system, bound to #rr-fx in init
let msgTimer = null;
let swipe = null;

// DOM refs, resolved once in initRunner
let overlay, svg, sceneG, trackG, heroG, fxG, seamsG,
    msgEl, savedEl, livesEl, hudEl, progFill, stageEl, bodiesEl,
    introPanel, clearPanel, failPanel;

const hero = {};        // SVG pieces of the hero (rebuilt per level)

// ── Hero (head from the builder, body from the roster) ───────────────────────

function buildHero() {
  heroG.innerHTML = '';
  hero.shadow = el('ellipse', { cx: 0, cy: 7.4, rx: 5.5, ry: 1.4, fill: 'rgba(43,43,43,0.18)' }, heroG);
  hero.inner = el('g', {}, heroG);
  hero.bodyG = el('g', {}, hero.inner);
  hero.headG = el('g', { transform: 'translate(-5.4 -13.9) scale(0.15)' }, hero.inner);
  hero.headG.innerHTML = GameKit.emojiSnapshotSvg();
  drawBody(hero.bodyG, game.hero.body);
}

// ── HUD & messages ───────────────────────────────────────────────────────────

const RUN_MSG = 'Swap bodies to beat what’s ahead!';

function setMsg(txt, cls) {
  msgEl.textContent = txt;
  msgEl.className = 'clinic-msg' + (cls ? ' ' + cls : '');
}

function flashMsg(txt, cls) {
  setMsg(txt, cls || 'praise');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    if (game && (game.phase === 'play' || game.phase === 'finish')) setMsg(RUN_MSG);
  }, 1400);
}

function updateLives() {
  livesEl.textContent = '❤️'.repeat(game.lives) + '\u{1F90D}'.repeat(Math.max(0, 3 - game.lives));
}

function updateSaved() {
  savedEl.textContent = String(totalSaved);
}

function updateProg() {
  if (!game) return;
  progFill.style.width = Math.min(100, game.traveled / game.endD * 100) + '%';
}

function updateBodyButtons() {
  const h = game && game.hero;
  bodiesEl.querySelectorAll('.tool-btn').forEach(b => {
    const id = b.dataset.body;
    b.classList.toggle('is-active', !!h && h.body === id);
    b.classList.toggle('is-hint', !!h && !!h.swap && h.swap.to === id);
  });
}

// ── Input actions ─────────────────────────────────────────────────────────────

function move(dir) {
  if (!game || game.phase !== 'play') return;
  game.hero.lane = Math.max(0, Math.min(2, game.hero.lane + dir));
}

function doJump() {
  if (!game || game.phase !== 'play') return;
  const h = game.hero;
  if (h.air) return;
  h.air = true;
  h.jumpStart = game.traveled;
  h.jumpDist = h.body === 'rocket' ? ROCKET_DIST : JUMP_DIST;
  SFX.boing();
}

function requestSwap(id) {
  if (!game || game.phase !== 'play') return;
  const h = game.hero;
  if (h.swap || h.body === id) return;   // commit to a swap in progress
  h.swap = { to: id, until: game.time + SWAP_TIME };
  updateBodyButtons();
}

// ── Collisions & stumbles ─────────────────────────────────────────────────────

function beatObstacle(o) {
  const def = OBSTACLES[o.type];
  SFX[def.sfx]();
  fx.puff(RX[o.rail], HERO_Y - 5, def.puffColor, 9);
  fx.puff(RX[o.rail], HERO_Y - 5, '#FFF3B0', 4);
  flashMsg(def.msg);
  removeEnt(o);
}

function removeEnt(o) {
  o.dead = true;
  if (o.el) { o.el.remove(); o.el = null; }
}

// a failed obstacle stays put and wobbles for a beat, so the lesson ("you
// needed Muscle") reads clearly instead of the wall silently evaporating
function breakEnt(o) {
  o.resolved = true;
  o.wobbleUntil = game.time + 0.55;
}

function scoop(o) {
  o.resolved = true;
  game.saved++;
  totalSaved++;
  updateSaved();
  SFX.pickup();
  fx.puff(RX[o.rail], HERO_Y - 8, '#FF9DBB', 8);
  fx.floatText(RX[o.rail], HERO_Y - 14, '+1 \u{1F49A}', '#2BB673');
  flashMsg('\u{1F49A} Rescued!');
  removeEnt(o);
}

function stumble(hint) {
  const g = game;
  g.lives--;
  updateLives();
  g.hero.invulnT = g.time + 1.5;
  SFX.stumble();
  stageEl.classList.add('op-shake');
  setTimeout(() => stageEl.classList.remove('op-shake'), 400);
  fx.puff(g.hero.x, HERO_Y, '#FFD93B', 6);
  if (g.lives <= 0) { failRun(); return; }
  flashMsg(hint, 'flash');
}

function tickCollisions() {
  const g = game, h = g.hero, T = g.traveled;
  const invuln = g.time < h.invulnT;
  for (const o of g.ents) {
    if (o.resolved || o.dead || o.type === 'main') continue;
    if (o.type === 'civ') {
      if (o.rail === h.lane && Math.abs(o.d - T) < 3.2) scoop(o);
      else if (o.d < T - 6) o.resolved = true;    // ran past — they wave you on
      continue;
    }
    if (o.rail !== h.lane) {
      if (o.d + (o.len || 3) < T - 8) o.resolved = true;
      continue;
    }
    if (o.type === 'gap' || o.type === 'chasm') {
      if (T > o.d + 1.2 && T < o.d + o.len - 1.2 && !h.air) {
        o.resolved = true;   // iframes carry the hero across the rest
        if (!invuln) {
          stumble(o.type === 'chasm'
            ? 'Wide gaps need \u{1F680} Rocket + a jump!'
            : 'Whoops — jump the gaps! ⬆️');
        }
      } else if (T >= o.d + o.len) {
        o.resolved = true;
        if (o.type === 'chasm') flashMsg('\u{1F680} What a leap!');
      }
      continue;
    }
    // wall obstacle — tall, so only the matching body gets through
    if (T >= o.d - 0.5) {
      o.resolved = true;
      const def = OBSTACLES[o.type];
      if (h.body === def.body) beatObstacle(o);
      else if (!invuln) { breakEnt(o); stumble('Oof! ' + def.hint); }
      else removeEnt(o);   // dazed hero barrels through, no extra penalty
    }
  }
}

// ── Level flow ────────────────────────────────────────────────────────────────

const STORIES = [
  'Dash down the sky-rails! Swap your body to beat what’s ahead, jump the gaps, and rescue the stranded civilian at the end!',
  'Another call for help — someone’s stranded further down the rails. Faster this time!',
  'The rails get wilder out here. Keep those bodies swapping!',
  'Word of your rescues is spreading. One more dash, hero!',
];

function buildScene() {
  sceneG.innerHTML = '';
  el('rect', { x: 0, y: 0, width: 72, height: 96, fill: SKY_DEEP }, sceneG);
  game.clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = el('g', {}, sceneG);
    el('ellipse', { cx: 0, cy: 0, rx: rnd(4, 7), ry: rnd(1.4, 2.2), fill: '#FFFFFF', opacity: 0.75 }, c);
    el('ellipse', { cx: rnd(2, 4), cy: rnd(-1.6, -1), rx: rnd(2.5, 4), ry: rnd(1.1, 1.6), fill: '#FFFFFF', opacity: 0.75 }, c);
    game.clouds.push({ el: c, x: rnd(2, 70), y0: rnd(0, 116) });
  }
  RX.forEach(x => {
    el('rect', { x: x - 8, y: -4, width: 16, height: 104, fill: WOOD }, sceneG);
    el('line', { x1: x - 8, y1: -4, x2: x - 8, y2: 100, stroke: WOOD_EDGE, 'stroke-width': 0.8 }, sceneG);
    el('line', { x1: x + 8, y1: -4, x2: x + 8, y2: 100, stroke: WOOD_EDGE, 'stroke-width': 0.8 }, sceneG);
  });
  seamsG = el('g', {}, sceneG);
  for (let y = -9; y <= 99; y += 9) {
    RX.forEach(x =>
      el('line', { x1: x - 8, y1: y, x2: x + 8, y2: y, stroke: WOOD_EDGE, 'stroke-width': 0.5, opacity: 0.65 }, seamsG));
  }
}

function makeEntity(o) {
  const g = el('g', {}, trackG);
  if (o.type === 'gap' || o.type === 'chasm') drawGapArt(g, o.len, o.type === 'chasm');
  else if (o.type === 'civ') drawCiv(g, false);
  else if (o.type === 'main') drawCiv(el('g', { transform: 'scale(1.18)' }, g), true);
  else OBSTACLES[o.type].draw(g);
  return g;
}

function openLevel() {
  const params = levelParams(level);
  const gen = genLevel(params);
  game = {
    params, phase: 'intro', time: 0, traveled: 0,
    ents: gen.ents, endD: gen.endD, civTotal: gen.civTotal,
    lives: 3, saved: 0,
    hero: { lane: 1, x: RX[1], body: 'plain', swap: null, air: false, jumpStart: 0, jumpDist: 0, invulnT: -1 },
    rise: 0, rescueT: 0, sparkAcc: 0, lastT: 0, raf: null,
  };

  buildScene();
  trackG.innerHTML = '';
  fx.reset();
  buildHero();
  updateBodyButtons();

  document.getElementById('rr-level').textContent = 'Lv ' + level;
  document.getElementById('rr-intro-level').textContent = 'Level ' + level;
  document.getElementById('rr-intro-story').textContent =
    level === 1 ? STORIES[0] : STORIES[1 + (level - 2) % 3];
  document.getElementById('rr-intro-civs').textContent = game.civTotal > 0
    ? '\u{1F49A} ' + game.civTotal + ' bonus rescue' + (game.civTotal === 1 ? '' : 's') + ' out there'
    : '\u{1F3C3} A clear dash to the rescue';
  document.getElementById('rr-intro-best').textContent = best > 0 ? '\u{1F3C6} Best: level ' + best : '';
  updateLives();
  updateSaved();
  updateProg();
  setMsg('Someone needs a hero! \u{1F4E3}');

  clearPanel.classList.remove('show');
  failPanel.classList.remove('show');
  introPanel.classList.add('show');
  game.raf = requestAnimationFrame(tickLoop);
}

function startLevel() {
  introPanel.classList.remove('show');
  game.phase = 'play';
  setMsg(RUN_MSG);
}

function levelCleared() {
  SFX.win();
  fx.confetti();
  totalSaved++;                       // the big rescue counts too
  updateSaved();
  if (level > best) {
    best = level;
    GameKit.saveBest(BEST_KEY, best);
  }
  setMsg('Rescued! Up, up and away! \u{1F389}');
  if (level === MAX_LEVEL) {
    document.getElementById('rr-clear-title').textContent = '\u{1F3C5} Hero of the Sky-Rails!';
    document.getElementById('rr-clear-note').textContent =
      `You cleared all ${MAX_LEVEL} levels — that's a Hero Medal! ` +
      'The rails go on forever for heroes who keep running.';
  } else {
    document.getElementById('rr-clear-title').textContent = 'Level ' + level + ' cleared! \u{1F389}';
    document.getElementById('rr-clear-note').textContent =
      (game.civTotal > 0
        ? 'You saved the civilian and scooped ' + game.saved + '/' + game.civTotal + ' bonus rescue' +
          (game.civTotal === 1 ? '' : 's') + ' on the way!'
        : 'A perfect dash — civilian saved!') + ' Ready for a faster run?';
  }
  clearPanel.classList.add('show');
}

function failRun() {
  game.phase = 'fail';
  SFX.gentle();
  setMsg('What a brave run! \u{1F49A}');
  document.getElementById('rr-fail-note').textContent =
    'The civilian is still waving — ' +
    (game.saved > 0 ? 'you already saved ' + game.saved + ' friend' + (game.saved === 1 ? '' : 's') + ', ' : '') +
    'have another run at level ' + level + '!';
  failPanel.classList.add('show');
}

function endLevel() {
  cancelAnimationFrame(game.raf);
  clearTimeout(msgTimer);
  game = null;
}

function nextLevel() { endLevel(); level++; openLevel(); }
function retryLevel() { endLevel(); openLevel(); }

function openRunner() {
  level = 1;
  totalSaved = 0;
  openOverlay(overlay, closeRunner);
  openLevel();
}

function closeRunner() {
  if (game) endLevel();
  closeOverlay(overlay);
}

// ── Per-frame logic ───────────────────────────────────────────────────────────

function tickHero(dt) {
  const g = game, h = g.hero;
  // slide toward the current rail (nudging left during the rescue huddle)
  const tx = RX[h.lane] + (g.phase === 'finish' || g.phase === 'rescue' ? -4.5 : 0);
  h.x += (tx - h.x) * Math.min(1, dt * 14);
  // land when the jump's track distance is spent
  if (h.air && g.traveled - h.jumpStart >= h.jumpDist) h.air = false;
  // sparkle flourish, then the new body's powers go live
  if (h.swap) {
    g.sparkAcc += dt;
    if (g.sparkAcc > 0.05) {
      g.sparkAcc = 0;
      fx.puff(h.x + rnd(-4, 4), HERO_Y + rnd(-6, 4), Math.random() < 0.5 ? '#FFD93B' : '#FFF3B0', 1);
    }
    if (g.time >= h.swap.until) {
      h.body = h.swap.to;
      h.swap = null;
      drawBody(hero.bodyG, h.body);
      SFX.swap();
      fx.puff(h.x, HERO_Y - 2, '#FFD93B', 8);
      fx.puff(h.x, HERO_Y - 2, '#FFFFFF', 5);
      updateBodyButtons();
    }
  }
}

function tickFinish() {
  const g = game;
  if (g.phase === 'play' && g.traveled >= g.endD - 26) {
    g.phase = 'finish';                 // runway: lock input, line up the grab
    g.hero.lane = 1;
    setMsg('There they are! \u{1F64C}');
  }
  if (g.phase === 'finish' && g.traveled >= g.endD - 3) {
    g.phase = 'rescue';
    SFX.win();
    fx.confetti();
  }
}

function tickRescue(dt) {
  const g = game;
  g.rescueT += dt;
  g.rise = Math.min(150, 260 * g.rescueT * g.rescueT);
  if (Math.random() < 0.5) {
    fx.puff(g.hero.x + rnd(-5, 8), HERO_Y - g.rise + rnd(0, 8), '#FFD93B', 1);
  }
  if (g.rescueT > 1 && g.phase === 'rescue') {
    g.phase = 'clear';
    levelCleared();
  }
}

function renderWorld() {
  const g = game, h = g.hero, T = g.traveled;
  seamsG.setAttribute('transform', `translate(0 ${(T % 9).toFixed(2)})`);
  // cloud parallax is decoration — hold the clouds still for reduced motion
  if (!GameKit.reducedMotion()) {
    g.clouds.forEach(c => {
      const y = (c.y0 + T * 0.35) % 116 - 10;
      c.el.setAttribute('transform', `translate(${c.x.toFixed(1)} ${y.toFixed(1)})`);
    });
  }
  for (const o of g.ents) {
    if (o.dead) continue;
    if (o.wobbleUntil && g.time > o.wobbleUntil) { removeEnt(o); continue; }
    const sy = HERO_Y - (o.d - T);
    if (sy > 118) { removeEnt(o); continue; }
    const vis = sy > -24;
    if (!o.el && vis) o.el = makeEntity(o);
    if (o.el) {
      const oy = (o.type === 'main' && (g.phase === 'rescue' || g.phase === 'clear')) ? sy - g.rise : sy;
      const ox = o.type === 'main' ? RX[o.rail] + 2.5 : RX[o.rail];
      const wobble = o.wobbleUntil ? ` rotate(${(Math.sin(g.time * 34) * 7).toFixed(1)})` : '';
      o.el.setAttribute('transform', `translate(${ox} ${oy.toFixed(2)})${wobble}`);
    }
  }
  // hero: jump arc, run bob, rescue leap, invulnerability blink
  let lift = 0, sc = 1;
  if (h.air) {
    const p = Math.min(1, (T - h.jumpStart) / h.jumpDist);
    lift = Math.sin(Math.PI * p) * 11;
    sc = 1 + 0.22 * Math.sin(Math.PI * p);
  }
  const running = g.phase === 'play' || g.phase === 'finish';
  const bob = running ? Math.abs(Math.sin(g.time * 9)) * 1.1 : 0;
  const hy = HERO_Y - (g.phase === 'rescue' || g.phase === 'clear' ? g.rise : 0);
  heroG.setAttribute('transform', `translate(${h.x.toFixed(2)} ${hy.toFixed(2)})`);
  hero.inner.setAttribute('transform', `translate(0 ${(-(lift + bob)).toFixed(2)}) scale(${sc.toFixed(3)})`);
  hero.inner.setAttribute('opacity',
    g.time < h.invulnT ? (Math.sin(g.time * 22) > 0 ? '0.45' : '0.9') : '1');
  hero.shadow.setAttribute('rx', (5.5 - lift * 0.25).toFixed(2));
  hero.shadow.setAttribute('opacity', String(Math.max(0.05, 0.18 - lift * 0.01)));
}

function tickLoop(t) {
  if (!game) return;
  const dt = game.lastT ? Math.min(0.05, (t - game.lastT) / 1000) : 0.016;
  game.lastT = t;
  const ph = game.phase;
  if (ph === 'play' || ph === 'finish') {
    game.time += dt;
    game.traveled += game.params.speed * dt;
    tickHero(dt);
    if (game.phase === 'play') tickCollisions();
    tickFinish();
    updateProg();
  } else if (ph === 'rescue' || ph === 'clear') {
    game.time += dt;
    tickHero(dt);
    tickRescue(dt);
  }
  if (game) {
    renderWorld();
    fx.tick(dt);
    game.raf = requestAnimationFrame(tickLoop);
  }
}

// ── Pointer & keyboard input ──────────────────────────────────────────────────
// Swipe left/right to change rail, swipe up to jump; the on-screen buttons do
// the same. Keys: arrows + space, 1–4 for bodies. Pointer capture keeps the
// swipe alive when the finger is released off the stage.

function onDown(e) {
  if (!game || game.phase !== 'play') return;
  swipe = { x: e.clientX, y: e.clientY };
  if (svg.setPointerCapture) try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}

function onUp(e) {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  else if (dy < -22) doJump();
}

function onKey(e) {
  if (!game) return;
  if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowUp' || e.key === ' ') { doJump(); e.preventDefault(); }
  else {
    const i = parseInt(e.key, 10) - 1;
    if (i >= 0 && i < BODIES.length) requestSwap(BODIES[i].id);
  }
}

// ── Init & registry ───────────────────────────────────────────────────────────

function buildBodyTray() {
  BODIES.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.body = b.id;
    btn.setAttribute('aria-label', 'Swap to ' + b.name + ' body');
    btn.innerHTML = `<span class="tool-emoji" aria-hidden="true">${b.emoji}</span>` +
                    `<span class="tool-name">${b.name}</span>`;
    btn.addEventListener('click', () => requestSwap(b.id));
    bodiesEl.appendChild(btn);
  });
}

function initRunner() {
  overlay = document.getElementById('runner');
  svg = document.getElementById('runner-svg');
  sceneG = document.getElementById('rr-scene');
  trackG = document.getElementById('rr-track');
  heroG = document.getElementById('rr-hero');
  fxG = document.getElementById('rr-fx');
  msgEl = document.getElementById('rr-msg');
  savedEl = document.getElementById('rr-saved');
  livesEl = document.getElementById('rr-lives');
  hudEl = document.getElementById('runner-hud');
  progFill = document.getElementById('rr-prog-fill');
  stageEl = document.querySelector('.runner-stage');
  bodiesEl = document.getElementById('rr-bodies');
  introPanel = document.getElementById('runner-intro');
  clearPanel = document.getElementById('runner-clear');
  failPanel = document.getElementById('runner-fail');
  fx = GameKit.particles(fxG);

  best = GameKit.loadBest(BEST_KEY);

  buildBodyTray();
  document.getElementById('runner-close').addEventListener('click', closeRunner);
  document.getElementById('rr-go').addEventListener('click', startLevel);
  document.getElementById('rr-next').addEventListener('click', nextLevel);
  document.getElementById('rr-clear-close').addEventListener('click', closeRunner);
  document.getElementById('rr-retry').addEventListener('click', retryLevel);
  document.getElementById('rr-fail-close').addEventListener('click', closeRunner);
  ['rr-left', 'rr-right', 'rr-jump'].forEach(id => {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
      if (id === 'rr-jump') doJump();
      else move(id === 'rr-left' ? -1 : 1);
    });
  });

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', () => { swipe = null; });
  svg.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', onKey);

  // tiny hook for automated tests: warp along the track / peek at the state
  window.__runner = {
    state: () => game && {
      phase: game.phase, level, lives: game.lives, saved: game.saved,
      body: game.hero.body, lane: game.hero.lane,
      traveled: game.traveled, endD: game.endD,
    },
    warp: d => { if (game) game.traveled = d; },
    finish: () => { if (game) { game.ents.forEach(o => { if (o.type !== 'main') o.resolved = true; }); game.traveled = game.endD - 28; } },
    lane: n => { if (game) game.hero.lane = n; },
  };
}

// register before games.js builds the Games picker on DOMContentLoaded
window.MINIGAMES = window.MINIGAMES || {};
window.MINIGAMES.runner = {
  name: 'Rescue Runner', emoji: '\u{1F9B8}', start: openRunner,
  best: () => best > 0 ? 'Lv ' + best : '',
};

document.addEventListener('DOMContentLoaded', initRunner);

})();
