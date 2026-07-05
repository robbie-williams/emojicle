'use strict';

// ── Water Safari — a squirt-the-thirsty-animals minigame (issue #4) ──────────
// Big Buck Hunter, but kind: the emoji on the canvas stands at the bottom of
// the screen with a water pistol, and thirsty animals trot across the top
// three quarters. Tapping an animal squirts it a drink — it stops looking
// thirsty (💧), looks happy (❤️) and hops away. No animal is ever hurt; the
// ending message always celebrates how many animals you helped.
//
// Levels rotate through four biomes (savannah → jungle → meadow → city), each
// with its own painted SVG backdrop and animal cast. Difficulty climbs per
// level: more points needed in the same 30 seconds, faster animals, quicker
// spawns. Each level hides 1–2 golden animals worth triple points. Clearing
// level 8 is "the end"; the best level cleared is kept in localStorage.
//
// Animal casts follow the issue where emoji exist; tapirs, cardinals, field
// sparrows and guinea pigs have no glyph, so a monkey, a red-tinted bird
// (SVG filter), a plain bird and a hamster stand in.
//
// Reads the builder's globals (PARTS, state, offsets, zOrder, note,
// getAudioCtx) like minigames.js does, and registers itself in the shared
// window.MINIGAMES registry so the Games picker lists it.

(function () {

const NS = 'http://www.w3.org/2000/svg';

// tiny SVG element helper
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const animalCount = n => n + ' animal' + (n === 1 ? '' : 's');

// ── Sounds (synthesized via note() from app.js — no audio files) ─────────────

function sfx(fn) {
  const ctx = getAudioCtx();
  if (ctx) fn(ctx, ctx.currentTime + 0.02);
}

const SFX = {
  squirt: () => sfx((c, t) => note(c, t, 1400 + Math.random() * 300, 0.1, { type: 'sine', glide: 480, vol: 0.05 })),
  splash: () => sfx((c, t) => { note(c, t, 300, 0.1, { type: 'sine', glide: 130, vol: 0.07 }); note(c, t + 0.05, 950, 0.06, { type: 'sine', vol: 0.03 }); }),
  happy:  () => sfx((c, t) => { note(c, t, 659.25, 0.09, { vol: 0.08 }); note(c, t + 0.1, 880, 0.15, { vol: 0.08 }); }),
  golden: () => sfx((c, t) => [783.99, 987.77, 1318.5].forEach((f, i) => note(c, t + i * 0.09, f, 0.15, { vol: 0.09 }))),
  tick:   () => sfx((c, t) => note(c, t, 1050, 0.05, { type: 'square', vol: 0.03 })),
  win:    () => sfx((c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, t + i * 0.13, f, 0.18, { vol: 0.09 }))),
  gentle: () => sfx((c, t) => { note(c, t, 523.25, 0.2, { vol: 0.08 }); note(c, t + 0.22, 659.25, 0.3, { vol: 0.08 }); }),
};

// ── Biomes ────────────────────────────────────────────────────────────────────
// The stage viewBox is 0 0 72 96: y 0–72 is the animals' world (sky + field),
// y 72–96 the ground the player stands on. Each biome paints sky/field/ground
// bands plus its own deco, and brings its animal cast (glyph + base size;
// fly = bird that flutters along the top, tint = colour filter id).

const BIOMES = [
  {
    name: 'Savannah', icon: '\u{1F981}',
    story: 'The savannah sun is scorching! Squirt the thirsty animals a cool drink as they pass.',
    sky: '#FFE2AC', field: '#EFD189', ground: '#E0B368',
    animals: [
      { e: '\u{1F418}', size: 10.5 },   // elephant
      { e: '\u{1F993}', size: 9 },      // zebra
      { e: '\u{1F981}', size: 9 },      // lion
    ],
    deco(g) {
      el('circle', { cx: 60, cy: 8, r: 5, fill: '#FFC93B' }, g);
      [[12, 15], [50, 13]].forEach(([x, y]) => {
        el('rect', { x: x - 0.7, y, width: 1.4, height: 6, fill: '#8B5A2B' }, g);
        el('ellipse', { cx: x, cy: y, rx: 6.5, ry: 2.6, fill: '#7BA05B' }, g);
      });
      for (let i = 0; i < 7; i++) {
        const x = rnd(4, 68), y = rnd(76, 93);
        el('path', { d: `M${x} ${y} l1 -2.6 M${x + 1} ${y} l0.4 -2.2 M${x - 1} ${y} l-0.4 -2.2`,
          stroke: '#C89A52', 'stroke-width': 0.5, 'stroke-linecap': 'round', fill: 'none' }, g);
      }
    },
  },
  {
    name: 'Jungle', icon: '\u{1F406}',
    story: 'Deep in the steamy jungle, the animals need a splash. (The tapirs sent a monkey instead!)',
    sky: '#CBE8AC', field: '#A9D687', ground: '#8CBF6C',
    animals: [
      { e: '\u{1F406}', size: 9 },              // leopard → panther
      { e: '\u{1F98C}', size: 9.5 },            // deer → antelope
      { e: '\u{1F99C}', size: 5.5, fly: true }, // macaw
      { e: '\u{1F412}', size: 8 },              // monkey (no tapir emoji)
    ],
    deco(g) {
      [[4, 3, 11], [68, 2, 12], [36, -3, 14]].forEach(([x, y, r]) =>
        el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.6, fill: '#69A44C' }, g));
      [[14, 0], [58, 0]].forEach(([x, y]) => {
        el('path', { d: `M${x} ${y} q1.5 7 0 13`, stroke: '#5E9427', 'stroke-width': 0.7, fill: 'none' }, g);
        el('circle', { cx: x, cy: y + 13, r: 1.3, fill: '#7BA05B' }, g);
      });
      for (let i = 0; i < 5; i++) {
        const x = rnd(4, 68), y = rnd(76, 93);
        el('path', { d: `M${x} ${y} q-2.5 -2 -2 -4.5 M${x} ${y} q2.5 -2 2 -4.5 M${x} ${y} l0 -4`,
          stroke: '#6FA352', 'stroke-width': 0.6, 'stroke-linecap': 'round', fill: 'none' }, g);
      }
    },
  },
  {
    name: 'Meadow', icon: '\u{1F407}',
    story: 'A sunny meadow full of little friends! Even the tiniest vole gets thirsty.',
    sky: '#C9EAFF', field: '#C4E79E', ground: '#ACDB84',
    animals: [
      { e: '\u{1F407}', size: 6.5 },                            // rabbit
      { e: '\u{1F401}', size: 5.5 },                            // mouse → meadow vole
      { e: '\u{1F426}', size: 5, fly: true, tint: 'sf-red' },   // cardinal (red-tinted bird)
      { e: '\u{1F426}', size: 5, fly: true },                   // field sparrow
    ],
    deco(g) {
      [[16, 6], [52, 9]].forEach(([x, y]) => {
        el('ellipse', { cx: x, cy: y, rx: 5, ry: 2, fill: '#FFFFFF', opacity: 0.9 }, g);
        el('ellipse', { cx: x + 3, cy: y - 1.4, rx: 3.4, ry: 1.7, fill: '#FFFFFF', opacity: 0.9 }, g);
      });
      for (let i = 0; i < 8; i++) {
        const x = rnd(3, 69), y = rnd(20, 93);
        el('circle', { cx: x, cy: y, r: 1, fill: i % 2 ? '#FFFFFF' : '#FF9DBB' }, g);
        el('circle', { cx: x, cy: y, r: 0.4, fill: '#FFD93B' }, g);
      }
    },
  },
  {
    name: 'City', icon: '\u{1F415}',
    story: 'Hot pavement, thirsty pets! Give the city animals a drink on their walk.',
    sky: '#D6EBFF', field: '#CFD4DB', ground: '#B9BFC9',
    animals: [
      { e: '\u{1F415}', size: 8 },      // dog
      { e: '\u{1F408}', size: 7 },      // cat
      { e: '\u{1F40E}', size: 10 },     // horse
      { e: '\u{1F439}', size: 5.5 },    // hamster (no guinea pig emoji)
    ],
    deco(g) {
      [[2, 4, 10, 12], [13, 7, 8, 9], [24, 2, 9, 14], [36, 6, 8, 10], [47, 3, 10, 13], [60, 7, 10, 9]]
        .forEach(([x, y, w, h]) => {
          el('rect', { x, y, width: w, height: h, fill: '#9FB0C4' }, g);
          for (let wy = y + 1.5; wy < y + h - 1.5; wy += 3) {
            for (let wx = x + 1.5; wx < x + w - 1.5; wx += 3) {
              el('rect', { x: wx, y: wy, width: 1.3, height: 1.3, fill: '#E7F0FA' }, g);
            }
          }
        });
      for (let i = 0; i < 5; i++) {
        el('rect', { x: 5 + i * 14, y: 42, width: 7, height: 2.4, rx: 0.6, fill: '#E9EDF2', opacity: 0.8 }, g);
      }
    },
  },
];

// ── Difficulty ────────────────────────────────────────────────────────────────

const MAX_LEVEL = 8;    // two laps of the biomes = "the end"

function levelParams(L) {
  return {
    biome: BIOMES[(L - 1) % BIOMES.length],
    time: 30,
    target: 60 + 22 * (L - 1),                          // points to accrue…
    interval: Math.max(0.6, 1.5 - 0.11 * (L - 1)),      // …while spawns speed up
    traverse: Math.max(3.2, 6.5 - 0.45 * (L - 1)),      // seconds to cross the field
    goldens: 1 + (Math.random() < 0.5 ? 1 : 0),         // 1–2 golden animals
  };
}

// ── Game state ────────────────────────────────────────────────────────────────

let game = null;        // null when the safari is closed
let level = 1;
let helped = 0;         // animals helped across the whole run (the kind number)
let best = 0;           // highest level ever cleared (persisted)
const BEST_KEY = 'emojicle-safari-best';
let parts = [];         // live particles
let msgTimer = null;
let aimTimer = null;

// DOM refs, resolved once in initSafari
let overlay, svg, sceneG, animalsG, playerG, fxG, pistolG,
    msgEl, helpedEl, hudEl, goalFill,
    introPanel, clearPanel, failPanel, endPanel;

// lanes across the field: [y, depth scale] — lower lanes are nearer = bigger
const LANES = [[18, 0.8], [39, 1], [60, 1.2]];

// the pistol sits in the emoji's "hands" at the bottom-left of the face
const PISTOL = { x: 24, y: 81 };

const REGULAR_PTS = 10, GOLDEN_PTS = 30;

// ── Player (the emoji from the builder, plus its water pistol) ───────────────
// Same snapshot recipe as the clinic: current parts in stacking order with
// drag offsets baked in, scaled into the bottom quarter of the stage.

function playerSvg() {
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

function drawPlayer() {
  playerG.innerHTML = '';
  const body = el('g', { transform: 'translate(25.5 74) scale(0.29)' }, playerG);
  body.innerHTML = playerSvg();
  pistolG = el('g', {}, playerG);
  const t = el('text', { 'font-size': 8, 'text-anchor': 'middle', y: 2.8 }, pistolG);
  t.textContent = '\u{1F52B}';
  aimPistol(36, 22);
}

// swing the pistol so its barrel (the glyph points left = 180°) faces (tx,ty)
function aimPistol(tx, ty) {
  const a = Math.atan2(ty - PISTOL.y, tx - PISTOL.x) * 180 / Math.PI;
  pistolG.setAttribute('transform', `translate(${PISTOL.x} ${PISTOL.y}) rotate(${(a + 180).toFixed(1)})`);
}

// ── Particles (water, sparkles, floating scores, confetti) ───────────────────

function puff(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(4, 12);
    parts.push({
      el: el('circle', { cx: x, cy: y, r: rnd(0.6, 1.4), fill: color }, fxG),
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: rnd(1.8, 2.8), grav: 8,
    });
  }
}

function floatText(x, y, str, fill) {
  const t = el('text', {
    x, y, 'font-size': 4.6, 'text-anchor': 'middle', 'font-weight': 700,
    fill, stroke: '#FFFFFF', 'stroke-width': 0.25, 'paint-order': 'stroke',
  }, fxG);
  t.textContent = str;
  parts.push({ el: t, x, y, vx: 0, vy: -7, life: 1, decay: 1.3, grav: 0, isText: true });
}

function confetti() {
  const colors = ['#FF5A5F', '#FFD93B', '#2BB673', '#8E6FF7', '#69B7FF', '#FF4FA3'];
  for (let i = 0; i < 30; i++) {
    const x = rnd(6, 66);
    parts.push({
      el: el('rect', { width: 1.7, height: 1.1, fill: colors[i % colors.length] }, fxG),
      x, y: -8, vx: rnd(-5, 5), vy: rnd(6, 14),
      life: 1, decay: 0.35, grav: 16,
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
    } else if (p.isText) {
      p.el.setAttribute('x', p.x.toFixed(1));
      p.el.setAttribute('y', p.y.toFixed(1));
    } else {
      p.el.setAttribute('cx', p.x.toFixed(1));
      p.el.setAttribute('cy', p.y.toFixed(1));
    }
    p.el.setAttribute('opacity', p.life.toFixed(2));
    return true;
  });
}

// a quick arc of droplets from the pistol tip to the tap point, plus a splash
function squirt(tx, ty) {
  aimPistol(tx, ty);
  clearTimeout(aimTimer);
  aimTimer = setTimeout(() => { if (game) aimPistol(36, 22); }, 400);
  const a = Math.atan2(ty - PISTOL.y, tx - PISTOL.x);
  const tip = { x: PISTOL.x + Math.cos(a) * 4.5, y: PISTOL.y + Math.sin(a) * 4.5 };
  const mx = (tip.x + tx) / 2, my = Math.min(tip.y, ty) - 9;
  for (let i = 1; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    const x = u * u * tip.x + 2 * u * t * mx + t * t * tx;
    const y = u * u * tip.y + 2 * u * t * my + t * t * ty;
    parts.push({
      el: el('circle', { cx: x, cy: y, r: rnd(0.5, 0.9), fill: '#69B7FF' }, fxG),
      x, y, vx: rnd(-2, 2), vy: rnd(-2, 2),
      life: 0.55 + t * 0.3, decay: 2.6, grav: 10,
    });
  }
  puff(tx, ty, '#BFE7FF', 6);
  SFX.squirt();
}

// ── Animals ───────────────────────────────────────────────────────────────────

function spawnAnimal(golden) {
  const def = pick(game.params.biome.animals);
  const [laneY, laneScale] = def.fly ? [rnd(7, 14), 0.85] : pick(LANES);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const size = def.size * laneScale;
  const speed = 88 / game.params.traverse *
    (def.fly ? 1.2 : 1) * (golden ? 1.15 : 1) * rnd(0.9, 1.15);

  const g = el('g', {}, animalsG);
  if (golden) el('circle', { r: size * 0.7, cy: -size * 0.1, fill: '#FFD93B', opacity: 0.35 }, g);
  const glyph = el('text', {
    'font-size': size, 'text-anchor': 'middle', y: size * 0.35,
  }, g);
  glyph.textContent = def.e;
  // glyphs face left; flip to face the direction of travel
  if (dir > 0) glyph.setAttribute('transform', 'scale(-1 1)');
  const tint = golden ? 'sf-gold' : def.tint;
  if (tint) glyph.setAttribute('filter', `url(#${tint})`);
  const drop = el('text', {
    'font-size': size * 0.5, 'text-anchor': 'middle', y: -size * 0.55,
  }, g);
  drop.textContent = '\u{1F4A7}';
  if (golden) {
    const spark = el('text', { 'font-size': size * 0.45, x: size * 0.7, y: -size * 0.45 }, g);
    spark.textContent = '✨';
  }

  game.animals.push({
    g, drop, golden, size,
    pts: golden ? GOLDEN_PTS : REGULAR_PTS,
    x: dir > 0 ? -10 : 82, y: laneY,
    vx: speed * dir, fly: !!def.fly,
    bobT: rnd(0, 6), bobF: def.fly ? 5 : rnd(6, 9),
    state: 'walk', t: 0,
  });
}

function tickAnimals(dt) {
  game.animals = game.animals.filter(a => {
    if (a.state === 'happy') {
      // a joyful hop, then fade away all better
      a.t += dt;
      const s = 1 + 0.2 * Math.sin(Math.min(a.t * 9, Math.PI));
      const y = a.y - 3 * Math.sin(Math.min(a.t * 5, Math.PI));
      a.g.setAttribute('transform', `translate(${a.x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})`);
      a.g.setAttribute('opacity', String(Math.max(0, 1 - Math.max(0, a.t - 0.4) / 0.4)));
      if (a.t > 0.85) { a.g.remove(); return false; }
      return true;
    }
    a.x += a.vx * dt;
    a.bobT += dt;
    if (a.x < -12 || a.x > 84) { a.g.remove(); return false; }   // wandered off
    const y = a.fly
      ? a.y + Math.sin(a.bobT * a.bobF) * 1.4
      : a.y - Math.abs(Math.sin(a.bobT * a.bobF)) * 0.9;
    a.g.setAttribute('transform', `translate(${a.x.toFixed(1)} ${y.toFixed(1)})`);
    return true;
  });
}

function hitAnimal(a, px, py) {
  a.state = 'happy';
  a.t = 0;
  a.drop.textContent = '❤️';   // thirst quenched → love
  helped++;
  game.score += a.pts;
  helpedEl.textContent = String(helped);
  if (a.golden) {
    SFX.golden();
    puff(a.x, a.y, '#FFD93B', 10);
    floatText(a.x, a.y - a.size, '+' + a.pts + ' ✨', '#DB8E00');
    flashMsg('✨ A golden friend! +' + a.pts + '!');
  } else {
    SFX.happy();
    floatText(a.x, a.y - a.size, '+' + a.pts, '#2BB673');
  }
  SFX.splash();
  puff(px, py, '#BFE7FF', 5);
  updateHud();
  if (game.score >= game.params.target) {
    game.phase = 'won';
    game.timer = setTimeout(levelCleared, 600);
  }
}

// ── HUD, timer & messages ─────────────────────────────────────────────────────

function setMsg(txt, cls) {
  msgEl.textContent = txt;
  msgEl.className = 'clinic-msg' + (cls ? ' ' + cls : '');
}

function flashMsg(txt) {
  setMsg(txt, 'praise');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    if (game && game.phase === 'play') setMsg('Squirt the thirsty animals! \u{1F4A6}');
  }, 1400);
}

function updateHud() {
  const p = game.params;
  goalFill.style.width = Math.min(100, game.score / p.target * 100) + '%';
  document.getElementById('sf-goal').textContent = game.score + '/' + p.target;
  document.getElementById('sf-time').textContent = Math.ceil(game.timeLeft) + 's';
  hudEl.classList.toggle('low', game.timeLeft <= 10 && game.timeLeft > 5);
  hudEl.classList.toggle('critical', game.timeLeft <= 5);
}

function tickTimer(dt) {
  const before = Math.ceil(game.timeLeft);
  game.timeLeft = Math.max(0, game.timeLeft - dt);
  const now = Math.ceil(game.timeLeft);
  if (now !== before) {
    if (now <= 5 && now > 0) SFX.tick();
    updateHud();
  }
  if (game.timeLeft <= 0) timeUp();
}

// golden animals appear at pre-rolled moments of the level
function tickSpawns(dt) {
  game.spawnAcc += dt;
  if (game.spawnAcc >= game.nextSpawn) {
    game.spawnAcc = 0;
    game.nextSpawn = game.params.interval * rnd(0.75, 1.25);
    spawnAnimal(false);
  }
  const elapsed = game.params.time - game.timeLeft;
  while (game.goldenTimes.length && elapsed >= game.goldenTimes[0]) {
    game.goldenTimes.shift();
    spawnAnimal(true);
  }
}

// ── Level flow ────────────────────────────────────────────────────────────────

function openLevel() {
  const params = levelParams(level);
  game = {
    params, phase: 'intro', score: 0,
    timeLeft: params.time, animals: [],
    spawnAcc: 0, nextSpawn: 0.3,
    goldenTimes: Array.from({ length: params.goldens }, () => rnd(4, params.time - 6)).sort((a, b) => a - b),
    lastT: 0, timer: null,
  };

  sceneG.innerHTML = '';
  el('rect', { x: 0, y: 0, width: 72, height: 96, fill: params.biome.sky }, sceneG);
  el('rect', { x: 0, y: 12, width: 72, height: 60, fill: params.biome.field }, sceneG);
  el('rect', { x: 0, y: 72, width: 72, height: 24, fill: params.biome.ground }, sceneG);
  params.biome.deco(sceneG);
  animalsG.innerHTML = '';
  fxG.innerHTML = '';
  parts = [];
  drawPlayer();

  document.getElementById('sf-level').textContent = 'Lv ' + level;
  document.getElementById('sf-intro-level').textContent = 'Level ' + level + ' · ' + params.biome.name;
  document.getElementById('sf-intro-icon').textContent = params.biome.icon;
  document.getElementById('sf-intro-name').textContent = params.biome.name;
  document.getElementById('sf-intro-story').textContent = params.biome.story;
  document.getElementById('sf-intro-target').textContent = '\u{1F3AF} ' + params.target + ' points';
  document.getElementById('sf-intro-time').textContent = '⏱ ' + params.time + ' seconds';
  document.getElementById('sf-intro-best').textContent = best > 0 ? '\u{1F3C6} Best: level ' + best : '';
  helpedEl.textContent = String(helped);
  hudEl.classList.remove('low', 'critical');
  updateHud();
  setMsg('The ' + params.biome.name.toLowerCase() + ' animals are thirsty! \u{1F4A6}');

  clearPanel.classList.remove('show');
  failPanel.classList.remove('show');
  endPanel.classList.remove('show');
  introPanel.classList.add('show');
  game.raf = requestAnimationFrame(tickLoop);
}

function startLevel() {
  introPanel.classList.remove('show');
  game.phase = 'play';
  setMsg('Squirt the thirsty animals! \u{1F4A6}');
}

function levelCleared() {
  SFX.win();
  confetti();
  if (level > best) {
    best = level;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
  }
  setMsg('Everyone got a drink! \u{1F389}');
  if (level >= MAX_LEVEL) {
    document.getElementById('sf-end-note').textContent =
      'You finished the whole safari and helped ' + animalCount(helped) +
      '. What a hero! \u{1F49A}';
    endPanel.classList.add('show');
  } else {
    document.getElementById('sf-clear-title').textContent = 'Level ' + level + ' cleared! \u{1F389}';
    document.getElementById('sf-clear-note').textContent =
      'You’ve helped ' + animalCount(helped) + ' so far — they’re all smiles!';
    clearPanel.classList.add('show');
  }
}

// running out of time still celebrates the animals that DID get a drink
function timeUp() {
  game.phase = 'fail';
  clearTimeout(game.timer);
  SFX.gentle();
  setMsg('What a kind helper! \u{1F49A}');
  document.getElementById('sf-fail-note').textContent =
    'You helped ' + animalCount(helped) + ' today! A few more points and level ' +
    level + ' is yours — have another go!';
  failPanel.classList.add('show');
}

function endLevel() {
  cancelAnimationFrame(game.raf);
  clearTimeout(game.timer);
  clearTimeout(msgTimer);
  clearTimeout(aimTimer);
  game = null;
}

function nextLevel() { endLevel(); level++; openLevel(); }
function retryLevel() { endLevel(); openLevel(); }
function restartRun() { endLevel(); level = 1; helped = 0; openLevel(); }

function openSafari() {
  level = 1;
  helped = 0;
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('safari-open');
  openLevel();
}

function closeSafari() {
  if (!game) return;
  endLevel();
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('safari-open');
}

function tickLoop(t) {
  if (!game) return;
  const dt = game.lastT ? Math.min(0.05, (t - game.lastT) / 1000) : 0.016;
  game.lastT = t;
  if (game.phase === 'play') {
    tickTimer(dt);
    if (game && game.phase === 'play') tickSpawns(dt);
  }
  if (game) {
    tickAnimals(dt);
    tickParts(dt);
    game.raf = requestAnimationFrame(tickLoop);
  }
}

// ── Pointer input ─────────────────────────────────────────────────────────────

function toStage(evt) {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(m.inverse());
}

function onDown(e) {
  if (!game || (game.phase !== 'play' && game.phase !== 'won')) return;
  const p = toStage(e);
  if (!p || p.y > 74) return;      // taps on the player aren't shots
  squirt(p.x, p.y);
  if (game.phase !== 'play') return;   // celebration squirts don't score
  let hit = null, hd = Infinity;
  game.animals.forEach(a => {
    if (a.state !== 'walk') return;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < a.size * 0.8 + 2 && d < hd) { hd = d; hit = a; }
  });
  if (hit) hitAnimal(hit, p.x, p.y);
  e.preventDefault();
}

// ── Init & registry ───────────────────────────────────────────────────────────

function initSafari() {
  overlay = document.getElementById('safari');
  svg = document.getElementById('safari-svg');
  sceneG = document.getElementById('sf-scene');
  animalsG = document.getElementById('sf-animals');
  playerG = document.getElementById('sf-player');
  fxG = document.getElementById('sf-fx');
  msgEl = document.getElementById('sf-msg');
  helpedEl = document.getElementById('sf-helped');
  hudEl = document.getElementById('safari-hud');
  goalFill = document.getElementById('sf-goal-fill');
  introPanel = document.getElementById('safari-intro');
  clearPanel = document.getElementById('safari-clear');
  failPanel = document.getElementById('safari-fail');
  endPanel = document.getElementById('safari-end');

  // colour filters: golden animals, and the meadow's red cardinal — both map
  // the glyph to luminance and re-colour it
  const defs = el('defs', {}, svg);
  el('feColorMatrix', { type: 'matrix', values:
    '0.276 0.930 0.094 0 0.08  0.213 0.715 0.072 0 0.02  0.053 0.179 0.018 0 0  0 0 0 1 0',
  }, el('filter', { id: 'sf-gold' }, defs));
  el('feColorMatrix', { type: 'matrix', values:
    '0.287 0.966 0.097 0 0.12  0.085 0.286 0.029 0 0  0.085 0.286 0.029 0 0.02  0 0 0 1 0',
  }, el('filter', { id: 'sf-red' }, defs));

  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) {}

  document.getElementById('safari-close').addEventListener('click', closeSafari);
  document.getElementById('sf-go').addEventListener('click', startLevel);
  document.getElementById('sf-next').addEventListener('click', nextLevel);
  document.getElementById('sf-clear-close').addEventListener('click', closeSafari);
  document.getElementById('sf-retry').addEventListener('click', retryLevel);
  document.getElementById('sf-fail-close').addEventListener('click', closeSafari);
  document.getElementById('sf-again').addEventListener('click', restartRun);
  document.getElementById('sf-end-close').addEventListener('click', closeSafari);

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSafari(); });

  // tiny hook for automated tests: shrink the clock / boost the score
  window.__safari = {
    hurry: () => { if (game) game.timeLeft = Math.min(game.timeLeft, 2); },
    score: n => {
      if (!game) return;
      game.score = n;
      updateHud();
      if (n >= game.params.target) { game.phase = 'won'; levelCleared(); }
    },
    state: () => game && {
      phase: game.phase, level, helped, score: game.score,
      timeLeft: game.timeLeft, animals: game.animals.length,
    },
  };
}

// register before minigames.js builds the Games picker on DOMContentLoaded
window.MINIGAMES = window.MINIGAMES || {};
window.MINIGAMES.safari = { name: 'Water Safari', emoji: '\u{1F4A6}', start: openSafari };

document.addEventListener('DOMContentLoaded', initSafari);

})();
