'use strict';

// ── GameKit — the shared minigame toolkit ─────────────────────────────────────
// Every game file used to carry its own copy of the SVG helper, the particle
// system, the emoji-snapshot recipe, the pointer→viewBox converter and the
// best-score persistence; they had already started drifting apart. They all
// live here now, loaded after app.js (for getAudioCtx/note and the builder
// globals) and before the game files.
//
// Games use it as:  const { el, rnd, sfx } = GameKit;  plus a per-game
// particle system:  fx = GameKit.particles(fxGroupElement);

const GameKit = (() => {

  const NS = 'http://www.w3.org/2000/svg';

  // tiny SVG element helper
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = n => Math.floor(Math.random() * n);
  const pick = arr => arr[ri(arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // run a synth soundbite (reuses note()/getAudioCtx from app.js)
  function sfx(fn) {
    const ctx = getAudioCtx();
    if (ctx) fn(ctx, ctx.currentTime + 0.02);
  }

  // Decorative JS-driven motion (confetti, celebration bursts) is skipped for
  // reduced-motion users; gameplay-relevant motion (germs, animals) stays.
  const motionMq = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionMq.matches;

  // The emoji from the builder, exactly as it looks on the canvas: current
  // parts in their current stacking order with drag offsets baked in.
  function emojiSnapshotSvg() {
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

  // client coords → the svg's viewBox units
  function svgPoint(svg, evt) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(m.inverse());
  }

  function loadBest(key) {
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; }
  }

  function saveBest(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) {}
  }

  // ── Particles (puffs, sparkles, floating text, confetti) ──────────────────
  // One system per game, bound to its fx <g>. `defaultGrav` keeps the clinic's
  // floatier puffs and the outdoor games' fallier ones both available.
  function particles(fxG, defaultGrav = 8) {
    let parts = [];

    // spawn a fully custom particle (e.g. the safari's squirt arc droplets)
    function add(p) {
      parts.push(p);
      return p;
    }

    function puff(x, y, color, n, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(4, 12);
        parts.push({
          el: el('circle', { cx: x, cy: y, r: rnd(0.6, 1.4), fill: color }, fxG),
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: rnd(1.8, 2.8), grav: grav === undefined ? defaultGrav : grav,
        });
      }
    }

    function sparkle(x, y) {
      puff(x, y, '#FFD93B', 7);
      puff(x, y, '#FFF3B0', 7);
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
      if (reducedMotion()) return;
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

    function tick(dt) {
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

    // a fresh level clears the fx layer and forgets the live particles
    function reset() {
      parts = [];
      fxG.innerHTML = '';
    }

    return { add, puff, sparkle, floatText, confetti, tick, reset };
  }

  return {
    el, rnd, ri, pick, clamp, dist, sfx, reducedMotion,
    emojiSnapshotSvg, svgPoint, loadBest, saveBest, particles,
  };
})();
