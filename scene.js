'use strict';

// ── Scene designer ────────────────────────────────────────────────────────────
// A full-screen canvas the size of the device window: pick a background from
// the library, then place emojis from your pack on it — tap a tray thumbnail
// to drop one in, drag to move, chip tools to grow/shrink/duplicate/delete.
//
// The scene reflows with the viewport: the SVG viewBox is 100 units tall and
// as wide as the screen's aspect ratio, and every placed emoji stores its
// position as per-mille of that box — so a scene shared from a phone spreads
// out on a tablet instead of cropping.
//
// Share: ?s=<bg>*<m>_<x>_<y>_<s>*…  — m is the pack member index, so a scene
// link travels together with the ?p= pack (and stays stateless, no backend).
// Persistence mirrors the gallery/pack (localStorage).

const SCENE_KEY = 'emojicle-scene';
const SCENE_MAX = 12;          // plenty of chaos, still a short share link
const SCENE_BASE = 0.35;       // default emoji size: 35% of the short side
const SCENE_STEP = 1.3;        // grow/shrink factor per size step
// widened for issue #36 (was -2..3): both extremes roughly double outward —
// 1.3^6 ≈ 2.2× the old biggest, 1.3^-5 ≈ 0.45× the old smallest
const SCENE_S_MIN = -5;
const SCENE_S_MAX = 6;

// ── Doodle motifs ─────────────────────────────────────────────────────────────
// Simplified, emoji-esque decorations (pizza, fruit, stars…) drawn around the
// origin at roughly ±14 units. One source of art for two uses: scattered
// full-strength on the "Emoji doodles" scene background, and tiled at low
// opacity as the app's backdrop (see applyDoodleBackdrop) — soft enough to
// stay decorative and keep the foreground UI fully legible.
const DOODLES = [
  /* pizza      */ '<path d="M-11 -10 L11 -10 L0 16 Z" fill="#FFC24B"/><path d="M-12 -10 Q0 -17 12 -10 L10 -5 Q0 -11 -10 -5 Z" fill="#E8853C"/><circle cx="-3" cy="-4" r="2.4" fill="#E8534A"/><circle cx="4" cy="0" r="2.4" fill="#E8534A"/><circle cx="-1" cy="7" r="2.2" fill="#E8534A"/>',
  /* star       */ '<path d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4 Z" fill="#FFD93B"/>',
  /* cherries   */ '<path d="M-5 -1 Q-3 -11 6 -14 M5 -2 Q4 -9 6 -14" stroke="#7BAE5A" stroke-width="2" fill="none"/><circle cx="-6" cy="5" r="6" fill="#E8534A"/><circle cx="6" cy="4" r="6" fill="#D64545"/>',
  /* heart      */ '<path d="M0 12 C-14 2 -10 -12 0 -6 C10 -12 14 2 0 12 Z" fill="#FF8FB3"/>',
  /* ice cream  */ '<path d="M-7 -1 L7 -1 L0 16 Z" fill="#E8A863"/><circle cx="0" cy="-7" r="8" fill="#FFB3C7"/>',
  /* balloon    */ '<ellipse cx="0" cy="-5" rx="8" ry="10" fill="#8FC7F2"/><path d="M0 5 q-3 6 2 11" stroke="#8FC7F2" stroke-width="1.5" fill="none"/>',
  /* flower     */ '<circle cx="0" cy="-8" r="4.5" fill="#C9A6F2"/><circle cx="7.6" cy="-2.5" r="4.5" fill="#C9A6F2"/><circle cx="4.7" cy="6.5" r="4.5" fill="#C9A6F2"/><circle cx="-4.7" cy="6.5" r="4.5" fill="#C9A6F2"/><circle cx="-7.6" cy="-2.5" r="4.5" fill="#C9A6F2"/><circle cx="0" cy="0" r="4" fill="#FFD93B"/>',
  /* cloud      */ '<ellipse cx="-5" cy="2" rx="8" ry="5.5" fill="#BFE3F7"/><ellipse cx="5" cy="0" rx="9" ry="6.5" fill="#D4EDFB"/>',
  /* bolt       */ '<path d="M2 -14 L-8 2 L-1 2 L-4 14 L8 -2 L1 -2 Z" fill="#FFC24B"/>',
  /* watermelon */ '<path d="M-14 0 A14 14 0 0 0 14 0 L12 0 A12 12 0 0 1 -12 0 Z" fill="#7ECC5B"/><path d="M-12 0 A12 12 0 0 0 12 0 Z" fill="#FF8A99"/><circle cx="-5" cy="4" r="1.2" fill="#5B3B2E"/><circle cx="1" cy="6.5" r="1.2" fill="#5B3B2E"/><circle cx="6" cy="3.5" r="1.2" fill="#5B3B2E"/>',
  /* orange     */ '<circle r="8.5" fill="#FFAD5C"/><ellipse cx="3.5" cy="-8" rx="3.5" ry="2" fill="#7BAE5A"/>',
];

function doodleAt(i, x, y, rot, scale) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">${DOODLES[i % DOODLES.length]}</g>`;
}

// one repeatable 320×320 tile for the app backdrop
function doodleTile(opacity) {
  const spots = [
    [0, 48, 44, -12, 1], [1, 152, 30, 8, 0.9], [2, 258, 58, -6, 1],
    [3, 62, 142, 12, 0.9], [4, 168, 122, -8, 1], [5, 272, 156, 10, 0.95],
    [6, 44, 244, 0, 1], [7, 146, 218, -10, 1], [8, 240, 246, 9, 0.9],
    [9, 96, 302, -8, 0.8], [10, 300, 300, 6, 0.8],
  ].map(([i, x, y, r, s]) => doodleAt(i, x, y, r, s)).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">' +
         `<g opacity="${opacity}">${spots}</g></svg>`;
}

// Kid-friendly app backdrop (issue #14; animated in issue #29): a fixed
// full-screen layer of doodles behind the UI. Every third doodle carries a
// slow, mostly-idle jiggle/twirl/sparkle cycle with scattered timing — a few
// are moving at any moment while the rest hold still — and the whole field
// drifts slowly downward, looping seamlessly (two stacked copies, -50%).
// Reduced-motion users get the original static CSS tile instead, and the
// animated path stays cheap: only transform/opacity animate, two thirds of
// the doodles have no animation at all.
function applyDoodleBackdrop() {
  const reduceMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !document.body) {
    if (!document.documentElement || !document.documentElement.style) return;
    const enc = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    const root = document.documentElement.style;
    root.setProperty('--doodle-bg-light', enc(doodleTile(0.5)));
    root.setProperty('--doodle-bg-dark', enc(doodleTile(0.16)));
    return;
  }
  buildDoodleLayer();
  let lastW = innerWidth;
  window.addEventListener('resize', () => {
    // mobile URL-bar show/hide jitters innerHeight — only real changes rebuild
    if (Math.abs(innerWidth - lastW) > 40 || innerHeight > doodleFieldH) {
      lastW = innerWidth;
      buildDoodleLayer();
    }
  });
}

let doodleFieldH = 0;

function buildDoodleLayer() {
  let layer = document.getElementById('doodle-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'doodle-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
  }
  const step = innerWidth > 800 ? 150 : 110;
  const W = innerWidth;
  // a whole number of grid rows keeps the spacing even across the loop seam
  const H = Math.ceil(Math.max(innerHeight, 900) / step) * step;
  doodleFieldH = H;
  const MOTIONS = ['doodle-jiggle', 'doodle-twirl', 'doodle-sparkle'];
  let bits = '';
  let n = 0;
  for (let gy = step / 2; gy < H; gy += step) {
    for (let gx = (gy / step % 2 ? step / 2 : step * 0.75); gx < W; gx += step) {
      const i = n++;
      const jx = ((i * 7) % 10 - 5) * 2.2;
      const jy = ((i * 13) % 10 - 5) * 2.2;
      const rot = ((i * 47) % 40) - 20;
      const sc = 0.75 + ((i * 11) % 5) * 0.1;
      let cls = '';
      let style = '';
      if (i % 3 === 0) {                       // only a third of them ever move
        const dur = 7 + (i * 3) % 6;           // 7–12s cycles…
        const delay = -((i * 1.7) % dur);      // …starting at scattered points
        cls = ` class="doodle ${MOTIONS[(i / 3) % 3]}"`;
        style = ` style="animation-duration:${dur}s;animation-delay:${delay.toFixed(1)}s"`;
      }
      bits += `<g transform="translate(${(gx + jx).toFixed(1)} ${(gy + jy).toFixed(1)})">` +
              `<g${cls}${style}><g transform="rotate(${rot}) scale(${sc.toFixed(2)})">` +
              DOODLES[i % DOODLES.length] + '</g></g></g>';
    }
  }
  const field = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
                `viewBox="0 0 ${W} ${H}">${bits}</svg>`;
  layer.innerHTML = `<div class="doodle-scroll">${field}${field}</div>`;
}

// ── Background library ────────────────────────────────────────────────────────
// Each background draws itself for an arbitrary w×h box (viewBox units) from
// flat shapes and gradients — lightweight, crisp at any size, offline by
// construction. The first entry is the default (and doubles as the app's
// backdrop pattern — issue #14).
const SCENE_BGS = [
  {
    id: 'doodles', name: 'Emoji doodles',
    draw(w, h) {
      // small sprinkles on a jittered grid so any aspect stays evenly covered
      // and the doodles read as wallpaper, not as placed stickers
      let bits = '';
      const step = 15;
      let n = 0;
      for (let gy = step / 2; gy < h; gy += step) {
        for (let gx = (gy / step % 2 ? step / 2 : step) - step / 4; gx < w; gx += step) {
          const i = n++;
          const jx = ((i * 7) % 10 - 5) * 0.4;
          const jy = ((i * 13) % 10 - 5) * 0.4;
          bits += doodleAt(i, (gx + jx).toFixed(1), (gy + jy).toFixed(1), ((i * 47) % 40) - 20, 0.17);
        }
      }
      return `<rect width="${w}" height="${h}" fill="#FFF7EF"/><g opacity="0.8">${bits}</g>`;
    },
  },
  {
    id: 'meadow', name: 'Sunny meadow',
    draw(w, h) {
      return `
<defs><linearGradient id="g-meadow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8ED8FF"/><stop offset="1" stop-color="#E3F6FF"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-meadow)"/>
<circle cx="${w * 0.85}" cy="${h * 0.14}" r="${h * 0.09}" fill="#FFD93B" stroke="#F4B400" stroke-width="1"/>
<g fill="#FFFFFF" opacity="0.95">
  <ellipse cx="${w * 0.22}" cy="${h * 0.16}" rx="${h * 0.1}" ry="${h * 0.045}"/>
  <ellipse cx="${w * 0.30}" cy="${h * 0.13}" rx="${h * 0.08}" ry="${h * 0.04}"/>
  <ellipse cx="${w * 0.62}" cy="${h * 0.24}" rx="${h * 0.09}" ry="${h * 0.04}"/>
</g>
<ellipse cx="${w * 0.25}" cy="${h * 1.06}" rx="${w * 0.75}" ry="${h * 0.42}" fill="#7ECC5B"/>
<ellipse cx="${w * 0.85}" cy="${h * 1.12}" rx="${w * 0.7}" ry="${h * 0.45}" fill="#5DBA46"/>
<g stroke="#3E8E2F" stroke-width="0.8">
  <line x1="${w * 0.15}" y1="${h * 0.87}" x2="${w * 0.15}" y2="${h * 0.92}"/>
  <line x1="${w * 0.45}" y1="${h * 0.93}" x2="${w * 0.45}" y2="${h * 0.98}"/>
  <line x1="${w * 0.78}" y1="${h * 0.9}" x2="${w * 0.78}" y2="${h * 0.95}"/>
</g>
<g>
  <circle cx="${w * 0.15}" cy="${h * 0.86}" r="1.8" fill="#FF7DAF"/>
  <circle cx="${w * 0.45}" cy="${h * 0.92}" r="1.8" fill="#FFD93B"/>
  <circle cx="${w * 0.78}" cy="${h * 0.89}" r="1.8" fill="#FF8A5C"/>
</g>`;
    },
  },
  {
    id: 'beach', name: 'Beach day',
    draw(w, h) {
      return `
<defs><linearGradient id="g-beach" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#9FE0FF"/><stop offset="1" stop-color="#D9F4FF"/>
</linearGradient></defs>
<rect width="${w}" height="${h * 0.55}" fill="url(#g-beach)"/>
<circle cx="${w * 0.18}" cy="${h * 0.13}" r="${h * 0.08}" fill="#FFD93B" stroke="#F4B400" stroke-width="1"/>
<rect y="${h * 0.5}" width="${w}" height="${h * 0.22}" fill="#3FB8E8"/>
<path d="M0 ${h * 0.5} Q ${w * 0.125} ${h * 0.47} ${w * 0.25} ${h * 0.5} T ${w * 0.5} ${h * 0.5} T ${w * 0.75} ${h * 0.5} T ${w} ${h * 0.5} V ${h * 0.56} H 0 Z" fill="#7FD4F2"/>
<rect y="${h * 0.68}" width="${w}" height="${h * 0.32}" fill="#FBE3A3"/>
<path d="M0 ${h * 0.68} Q ${w * 0.25} ${h * 0.64} ${w * 0.5} ${h * 0.68} T ${w} ${h * 0.68} V ${h} H 0 Z" fill="#F6D588"/>
<circle cx="${w * 0.8}" cy="${h * 0.84}" r="1.6" fill="#FFFFFF" opacity="0.8"/>
<circle cx="${w * 0.3}" cy="${h * 0.9}" r="1.2" fill="#FFFFFF" opacity="0.8"/>`;
    },
  },
  {
    id: 'space', name: 'Outer space',
    draw(w, h) {
      const stars = [[0.1, 0.2, 0.9], [0.3, 0.08, 0.6], [0.55, 0.3, 0.7], [0.8, 0.1, 0.9],
        [0.9, 0.45, 0.6], [0.2, 0.55, 0.7], [0.65, 0.6, 0.9], [0.4, 0.8, 0.6],
        [0.85, 0.8, 0.8], [0.12, 0.9, 0.7], [0.5, 0.5, 0.5], [0.72, 0.88, 0.6]]
        .map(([x, y, r]) => `<circle cx="${w * x}" cy="${h * y}" r="${r}" fill="#FFF7C9"/>`).join('');
      return `
<defs><linearGradient id="g-space" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#12173F"/><stop offset="1" stop-color="#2C2A6B"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-space)"/>
${stars}
<circle cx="${w * 0.78}" cy="${h * 0.22}" r="${h * 0.085}" fill="#F2984F"/>
<ellipse cx="${w * 0.78}" cy="${h * 0.22}" rx="${h * 0.14}" ry="${h * 0.035}" fill="none" stroke="#FFD93B" stroke-width="1.4" transform="rotate(-18 ${w * 0.78} ${h * 0.22})"/>
<path d="M ${w * 0.18} ${h * 0.68} a ${h * 0.06} ${h * 0.06} 0 1 0 ${h * 0.045} ${h * 0.1} a ${h * 0.075} ${h * 0.075} 0 1 1 -${h * 0.045} -${h * 0.1} Z" fill="#EDEBFF"/>`;
    },
  },
  {
    id: 'party', name: 'Party time',
    draw(w, h) {
      const bits = [[0.12, 0.2, '#FF5A5F'], [0.28, 0.4, '#2BB673'], [0.44, 0.15, '#3FA7E8'],
        [0.6, 0.45, '#FFD93B'], [0.75, 0.2, '#B06CE8'], [0.9, 0.4, '#FF8A5C'],
        [0.2, 0.62, '#3FA7E8'], [0.5, 0.7, '#FF5A5F'], [0.82, 0.66, '#2BB673'],
        [0.35, 0.88, '#FFD93B'], [0.68, 0.9, '#B06CE8'], [0.08, 0.85, '#FF8A5C']]
        .map(([x, y, c], i) => `<rect x="${w * x}" y="${h * y}" width="2.4" height="1.3" fill="${c}" transform="rotate(${(i * 53) % 360} ${w * x} ${h * y})"/>`).join('');
      return `
<defs><linearGradient id="g-party" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFE9F2"/><stop offset="1" stop-color="#FFD6E8"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-party)"/>
${bits}
<g>
  <ellipse cx="${w * 0.08}" cy="${h * 0.12}" rx="${h * 0.045}" ry="${h * 0.055}" fill="#FF5A5F"/>
  <path d="M ${w * 0.08} ${h * 0.175} q 2 ${h * 0.06} -1.5 ${h * 0.12}" fill="none" stroke="#C94A4E" stroke-width="0.7"/>
  <ellipse cx="${w * 0.93}" cy="${h * 0.1}" rx="${h * 0.045}" ry="${h * 0.055}" fill="#3FA7E8"/>
  <path d="M ${w * 0.93} ${h * 0.155} q -2 ${h * 0.06} 1.5 ${h * 0.12}" fill="none" stroke="#2E7FB4" stroke-width="0.7"/>
</g>`;
    },
  },
  {
    id: 'rainbow', name: 'Rainbow sky',
    draw(w, h) {
      const cx = w / 2, cy = h * 1.02, bands = ['#FF5A5F', '#FF8A5C', '#FFD93B', '#7ECC5B', '#3FA7E8', '#B06CE8'];
      const arcs = bands.map((c, i) => {
        const r = h * (0.85 - i * 0.07);
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${h * 0.07}"/>`;
      }).join('');
      return `
<defs><linearGradient id="g-rainbow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#BDE8FF"/><stop offset="1" stop-color="#EAF7FF"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-rainbow)"/>
${arcs}
<g fill="#FFFFFF">
  <ellipse cx="${w * 0.13}" cy="${h * 0.62}" rx="${h * 0.11}" ry="${h * 0.055}"/>
  <ellipse cx="${w * 0.2}" cy="${h * 0.58}" rx="${h * 0.085}" ry="${h * 0.05}"/>
  <ellipse cx="${w * 0.87}" cy="${h * 0.62}" rx="${h * 0.11}" ry="${h * 0.055}"/>
  <ellipse cx="${w * 0.8}" cy="${h * 0.58}" rx="${h * 0.085}" ry="${h * 0.05}"/>
</g>`;
    },
  },
  {
    id: 'snow', name: 'Snowy day',
    draw(w, h) {
      const flakes = [[0.1, 0.15], [0.3, 0.3], [0.5, 0.1], [0.7, 0.25], [0.9, 0.12],
        [0.2, 0.5], [0.6, 0.55], [0.85, 0.45], [0.4, 0.68], [0.75, 0.72], [0.12, 0.75]]
        .map(([x, y]) => {
          const fx = w * x, fy = h * y;
          return `<g stroke="#FFFFFF" stroke-width="0.5" opacity="0.9">
<line x1="${fx - 1.4}" y1="${fy}" x2="${fx + 1.4}" y2="${fy}"/>
<line x1="${fx}" y1="${fy - 1.4}" x2="${fx}" y2="${fy + 1.4}"/>
<line x1="${fx - 1}" y1="${fy - 1}" x2="${fx + 1}" y2="${fy + 1}"/>
<line x1="${fx - 1}" y1="${fy + 1}" x2="${fx + 1}" y2="${fy - 1}"/></g>`;
        }).join('');
      return `
<defs><linearGradient id="g-snow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#C4DDF2"/><stop offset="1" stop-color="#EAF3FB"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-snow)"/>
${flakes}
<ellipse cx="${w * 0.3}" cy="${h * 1.04}" rx="${w * 0.75}" ry="${h * 0.28}" fill="#FFFFFF"/>
<ellipse cx="${w * 0.85}" cy="${h * 1.08}" rx="${w * 0.6}" ry="${h * 0.3}" fill="#F2F8FD"/>`;
    },
  },
  {
    id: 'under', name: 'Under the sea',
    draw(w, h) {
      const bubbles = [[0.15, 0.2, 1.4], [0.85, 0.14, 1], [0.7, 0.35, 1.6], [0.3, 0.45, 1],
        [0.9, 0.55, 1.3], [0.1, 0.65, 1.5], [0.55, 0.12, 0.8]]
        .map(([x, y, r]) => `<circle cx="${w * x}" cy="${h * y}" r="${r}" fill="none" stroke="#BFEAF7" stroke-width="0.5"/>`).join('');
      const weed = (x, ht, c) =>
        `<path d="M ${w * x} ${h} q ${h * 0.03} -${ht * 0.5} 0 -${ht} q -${h * 0.03} ${ht * 0.4} 0 ${ht}" fill="${c}"/>`;
      return `
<defs><linearGradient id="g-under" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#4FC2E8"/><stop offset="1" stop-color="#1B7FB8"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-under)"/>
${bubbles}
<ellipse cx="${w * 0.5}" cy="${h * 1.05}" rx="${w * 0.85}" ry="${h * 0.16}" fill="#F2D98C"/>
${weed(0.12, h * 0.22, '#3E9E5C')}
${weed(0.2, h * 0.15, '#57B573')}
${weed(0.86, h * 0.2, '#3E9E5C')}
<path d="M ${w * 0.68} ${h * 0.92} a 2.4 2.4 0 1 1 0 0.1 Z" fill="#FF8FB3"/>
<path d="M ${w * 0.3} ${h * 0.94} l 2.6 -2 v 4 Z" fill="#FFD93B"/>`;
    },
  },
  {
    id: 'jungle', name: 'Jungle',
    draw(w, h) {
      const leaf = (x, y, rot, s, c) =>
        `<path d="M0 0 Q ${8 * s} -${5 * s} ${14 * s} 0 Q ${8 * s} ${5 * s} 0 0 Z" fill="${c}" transform="translate(${w * x} ${h * y}) rotate(${rot})"/>`;
      return `
<defs><linearGradient id="g-jungle" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#C8EFB4"/><stop offset="1" stop-color="#8FD877"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-jungle)"/>
${leaf(-0.02, 0.06, 30, 1.4, '#4CA83C')}
${leaf(-0.02, 0.2, 10, 1.2, '#3E8E2F')}
${leaf(1.02, 0.1, 150, 1.4, '#4CA83C')}
${leaf(1.02, 0.26, 190, 1.2, '#3E8E2F')}
${leaf(0.5, -0.02, 80, 1.3, '#57B573')}
<path d="M ${w * 0.85} 0 q -${w * 0.12} ${h * 0.3} ${w * 0.04} ${h * 0.55}" fill="none" stroke="#3E8E2F" stroke-width="1.2"/>
<circle cx="${w * 0.89}" cy="${h * 0.55}" r="2" fill="#FF7DAF"/>
<ellipse cx="${w * 0.4}" cy="${h * 1.06}" rx="${w * 0.8}" ry="${h * 0.2}" fill="#5DBA46"/>
<ellipse cx="${w * 0.9}" cy="${h * 1.1}" rx="${w * 0.55}" ry="${h * 0.22}" fill="#4CA83C"/>`;
    },
  },
  {
    id: 'farm', name: 'On the farm',
    draw(w, h) {
      const bx = w * 0.72, by = h * 0.52, bw = w * 0.24, bh = h * 0.16;
      return `
<defs><linearGradient id="g-farm" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#A5DCFF"/><stop offset="1" stop-color="#E8F7FF"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-farm)"/>
<circle cx="${w * 0.15}" cy="${h * 0.12}" r="${h * 0.07}" fill="#FFD93B" stroke="#F4B400" stroke-width="1"/>
<ellipse cx="${w * 0.5}" cy="${h * 1.02}" rx="${w * 0.95}" ry="${h * 0.4}" fill="#8FD877"/>
<path d="M ${bx} ${by} h ${bw} v ${bh} h -${bw} Z" fill="#E8534A"/>
<path d="M ${bx - bw * 0.08} ${by} L ${bx + bw / 2} ${by - bh * 0.55} L ${bx + bw * 1.08} ${by} Z" fill="#B03A33"/>
<rect x="${bx + bw * 0.36}" y="${by + bh * 0.35}" width="${bw * 0.28}" height="${bh * 0.65}" fill="#7A4A32"/>
<g stroke="#B58A5C" stroke-width="0.9">
  <line x1="0" y1="${h * 0.8}" x2="${w * 0.45}" y2="${h * 0.8}"/>
  <line x1="${w * 0.06}" y1="${h * 0.74}" x2="${w * 0.06}" y2="${h * 0.86}"/>
  <line x1="${w * 0.2}" y1="${h * 0.74}" x2="${w * 0.2}" y2="${h * 0.86}"/>
  <line x1="${w * 0.34}" y1="${h * 0.74}" x2="${w * 0.34}" y2="${h * 0.86}"/>
</g>
<circle cx="${w * 0.55}" cy="${h * 0.88}" r="1.6" fill="#FFD93B"/>
<circle cx="${w * 0.62}" cy="${h * 0.92}" r="1.6" fill="#FFFFFF"/>`;
    },
  },
  {
    id: 'city', name: 'City street',
    draw(w, h) {
      const win = (x, y) => `<rect x="${x}" y="${y}" width="1.6" height="2" fill="#FFE9A3"/>`;
      let wins = '';
      const towers = [[0.04, 0.34, 0.16], [0.24, 0.22, 0.2], [0.48, 0.4, 0.14], [0.66, 0.18, 0.22], [0.9, 0.32, 0.12]]
        .map(([x, top, tw]) => {
          const tx = w * x, ty = h * top, twp = w * tw;
          for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
            wins += win(tx + twp * 0.22 + c * twp * 0.4, ty + h * 0.05 + r * h * 0.09);
          }
          return `<rect x="${tx}" y="${ty}" width="${twp}" height="${h * 0.62 - ty + h * 0.2}" fill="${['#5C6BC0', '#7986CB', '#4A5AB8'][Math.round(x * 10) % 3]}"/>`;
        }).join('');
      return `
<defs><linearGradient id="g-city" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFD9A0"/><stop offset="1" stop-color="#FFB2C4"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-city)"/>
<circle cx="${w * 0.5}" cy="${h * 0.2}" r="${h * 0.07}" fill="#FFD93B"/>
${towers}${wins}
<rect y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="#5A5A6E"/>
<g stroke="#FFFFFF" stroke-width="1" stroke-dasharray="3 2.4">
  <line x1="0" y1="${h * 0.91}" x2="${w}" y2="${h * 0.91}"/>
</g>`;
    },
  },
  {
    id: 'castle', name: 'Fairy castle',
    draw(w, h) {
      const cx = w * 0.5, base = h * 0.62, cw = w * 0.34;
      const tower = (x, tw, th, c) => `
<rect x="${x - tw / 2}" y="${base - th}" width="${tw}" height="${th}" fill="${c}"/>
<path d="M ${x - tw * 0.7} ${base - th} L ${x} ${base - th - tw * 1.1} L ${x + tw * 0.7} ${base - th} Z" fill="#B06CE8"/>
<line x1="${x}" y1="${base - th - tw * 1.1}" x2="${x}" y2="${base - th - tw * 1.1 - 3}" stroke="#8E4EC6" stroke-width="0.5"/>
<path d="M ${x} ${base - th - tw * 1.1 - 3} h 2.6 l -2.6 1.6 Z" fill="#FF5A5F"/>`;
      return `
<defs><linearGradient id="g-castle" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#D5C4F7"/><stop offset="1" stop-color="#F7E4FB"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-castle)"/>
<circle cx="${w * 0.85}" cy="${h * 0.1}" r="${h * 0.055}" fill="#FFF3B0"/>
<rect x="${cx - cw / 2}" y="${base - h * 0.14}" width="${cw}" height="${h * 0.14}" fill="#EDE3FB"/>
${tower(cx - cw / 2, w * 0.09, h * 0.2, '#E3D2FA')}
${tower(cx + cw / 2, w * 0.09, h * 0.2, '#E3D2FA')}
${tower(cx, w * 0.11, h * 0.26, '#EDE3FB')}
<path d="M ${cx - w * 0.035} ${base} v -${h * 0.07} a ${w * 0.035} ${w * 0.035} 0 0 1 ${w * 0.07} 0 v ${h * 0.07} Z" fill="#8E4EC6"/>
<ellipse cx="${w * 0.35}" cy="${h * 1.05}" rx="${w * 0.85}" ry="${h * 0.42}" fill="#8FD877"/>
<ellipse cx="${w * 0.95}" cy="${h * 1.12}" rx="${w * 0.65}" ry="${h * 0.42}" fill="#7ECC5B"/>
<path d="M ${cx - w * 0.05} ${h * 0.75} h ${w * 0.1} L ${cx + w * 0.08} ${h} h -${w * 0.16} Z" fill="#C9A96A"/>`;
    },
  },
  {
    id: 'desert', name: 'Desert',
    draw(w, h) {
      const cactus = (x, y, s) => `
<g fill="#4CA83C" transform="translate(${w * x} ${h * y}) scale(${s})">
  <rect x="-1.4" y="-9" width="2.8" height="9" rx="1.4"/>
  <rect x="-5.4" y="-7" width="2.4" height="4" rx="1.2"/>
  <rect x="-5.4" y="-4.2" width="4" height="2" rx="1"/>
  <rect x="3" y="-6" width="2.4" height="3.4" rx="1.2"/>
  <rect x="1.4" y="-4" width="4" height="2" rx="1"/>
</g>`;
      return `
<defs><linearGradient id="g-desert" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFE0A3"/><stop offset="1" stop-color="#FFC97E"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-desert)"/>
<circle cx="${w * 0.8}" cy="${h * 0.13}" r="${h * 0.09}" fill="#FF9F1C"/>
<ellipse cx="${w * 0.25}" cy="${h * 1.02}" rx="${w * 0.8}" ry="${h * 0.34}" fill="#F2B25C"/>
<ellipse cx="${w * 0.9}" cy="${h * 1.08}" rx="${w * 0.7}" ry="${h * 0.36}" fill="#E8A143"/>
${cactus(0.16, 0.82, 1.3)}
${cactus(0.78, 0.9, 1)}
<circle cx="${w * 0.5}" cy="${h * 0.9}" r="1.1" fill="#C98A4B"/>
<circle cx="${w * 0.6}" cy="${h * 0.94}" r="0.8" fill="#C98A4B"/>`;
    },
  },
  {
    id: 'forest', name: 'Pine forest',
    draw(w, h) {
      const pine = (x, y, s, c) => `
<g fill="${c}" transform="translate(${w * x} ${h * y}) scale(${s})">
  <path d="M0 -16 L5 -8 L2.5 -8 L7 0 L-7 0 L-2.5 -8 L-5 -8 Z"/>
  <rect x="-1.1" y="0" width="2.2" height="3" fill="#7A4A32"/>
</g>`;
      return `
<defs><linearGradient id="g-forest" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#D2F0E8"/><stop offset="1" stop-color="#A8E0C8"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-forest)"/>
${pine(0.12, 0.5, 1.2, '#57B573')}
${pine(0.32, 0.44, 0.9, '#3E9E5C')}
${pine(0.72, 0.48, 1.1, '#3E9E5C')}
${pine(0.9, 0.42, 0.8, '#57B573')}
<ellipse cx="${w * 0.5}" cy="${h * 1.04}" rx="${w * 0.95}" ry="${h * 0.5}" fill="#7ECC5B"/>
<circle cx="${w * 0.4}" cy="${h * 0.78}" r="1.5" fill="#E8534A"/>
<circle cx="${w * 0.44}" cy="${h * 0.8}" r="0.5" fill="#FFFFFF"/>
<circle cx="${w * 0.6}" cy="${h * 0.86}" r="1.5" fill="#E8534A"/>
<circle cx="${w * 0.64}" cy="${h * 0.88}" r="0.5" fill="#FFFFFF"/>`;
    },
  },
  {
    id: 'bday', name: 'Birthday table',
    draw(w, h) {
      const flags = Array.from({ length: 7 }, (_, i) => {
        const fx = w * (i + 0.5) / 7, fy = h * 0.06 + Math.sin(i * 1.1) * h * 0.015 + h * 0.02;
        return `<path d="M ${fx - 2} ${fy} h 4 l -2 3.4 Z" fill="${['#FF5A5F', '#FFD93B', '#3FA7E8', '#7ECC5B', '#B06CE8'][i % 5]}"/>`;
      }).join('');
      const cx = w * 0.5, ty = h * 0.68;
      return `
<defs><linearGradient id="g-bday" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFF3D6"/><stop offset="1" stop-color="#FFE3EE"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-bday)"/>
<path d="M0 ${h * 0.04} Q ${w * 0.5} ${h * 0.12} ${w} ${h * 0.04}" fill="none" stroke="#B06CE8" stroke-width="0.8"/>
${flags}
<rect y="${ty}" width="${w}" height="${h * 0.05}" fill="#F2A7C3"/>
<rect y="${ty + h * 0.05}" width="${w}" height="${h * 0.27}" fill="#FBD4E4"/>
<g transform="translate(${cx} ${ty})">
  <rect x="-7" y="-6" width="14" height="6" rx="1.4" fill="#FF8FB3"/>
  <rect x="-5.4" y="-11" width="10.8" height="5" rx="1.2" fill="#FFD1DF"/>
  <path d="M-5.4 -8.4 q 1.35 1.8 2.7 0 t 2.7 0 t 2.7 0 t 2.7 0 v -1 h -10.8 Z" fill="#FF8FB3"/>
  <line x1="0" y1="-14" x2="0" y2="-11" stroke="#3FA7E8" stroke-width="0.9"/>
  <ellipse cx="0" cy="-14.6" rx="0.8" ry="1.2" fill="#FFD93B"/>
</g>`;
    },
  },
  {
    id: 'camp', name: 'Campsite',
    draw(w, h) {
      const stars = [[0.15, 0.1], [0.4, 0.06], [0.68, 0.12], [0.88, 0.07], [0.25, 0.22], [0.78, 0.26]]
        .map(([x, y]) => `<circle cx="${w * x}" cy="${h * y}" r="0.8" fill="#FFF7C9"/>`).join('');
      const tx = w * 0.3, ty = h * 0.72, ts = w * 0.2;
      return `
<defs><linearGradient id="g-camp" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#2C3A6B"/><stop offset="1" stop-color="#6B5AA8"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-camp)"/>
${stars}
<circle cx="${w * 0.55}" cy="${h * 0.14}" r="${h * 0.05}" fill="#FFF3B0"/>
<ellipse cx="${w * 0.5}" cy="${h * 1.02}" rx="${w * 0.95}" ry="${h * 0.34}" fill="#3E6E4C"/>
<path d="M ${tx - ts} ${ty} L ${tx} ${ty - ts * 1.2} L ${tx + ts} ${ty} Z" fill="#FF9F1C"/>
<path d="M ${tx - ts * 0.28} ${ty} L ${tx} ${ty - ts * 0.55} L ${tx + ts * 0.28} ${ty} Z" fill="#B36A00"/>
<g transform="translate(${w * 0.72} ${h * 0.78})">
  <line x1="-3" y1="2" x2="3" y2="4" stroke="#7A4A32" stroke-width="1"/>
  <line x1="-3" y1="4" x2="3" y2="2" stroke="#7A4A32" stroke-width="1"/>
  <path d="M0 -4 q 2.6 2 1.4 4.6 a 2.9 2.9 0 0 1 -2.8 0 Q -2.6 -1 0 -4 Z" fill="#FF8A5C"/>
  <path d="M0 -1.8 q 1.4 1.2 0.7 2.6 a 1.6 1.6 0 0 1 -1.4 0 Q -1.4 -0.4 0 -1.8 Z" fill="#FFD93B"/>
</g>`;
    },
  },
  {
    id: 'garden', name: 'Flower garden',
    draw(w, h) {
      const flower = (x, y, s, c) => `
<g transform="translate(${w * x} ${h * y}) scale(${s})">
  <line x1="0" y1="0" x2="0" y2="6" stroke="#3E8E2F" stroke-width="0.9"/>
  <g fill="${c}">
    <circle cx="0" cy="-2.2" r="1.6"/><circle cx="2.1" cy="-0.7" r="1.6"/>
    <circle cx="1.3" cy="1.8" r="1.6"/><circle cx="-1.3" cy="1.8" r="1.6"/>
    <circle cx="-2.1" cy="-0.7" r="1.6"/>
  </g>
  <circle r="1.4" fill="#FFD93B"/>
</g>`;
      return `
<defs><linearGradient id="g-garden" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#C9EEFF"/><stop offset="1" stop-color="#E8FBEF"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-garden)"/>
<circle cx="${w * 0.12}" cy="${h * 0.1}" r="${h * 0.06}" fill="#FFD93B" stroke="#F4B400" stroke-width="1"/>
<ellipse cx="${w * 0.5}" cy="${h * 1.04}" rx="${w * 0.95}" ry="${h * 0.42}" fill="#8FD877"/>
${flower(0.15, 0.82, 1.2, '#FF7DAF')}
${flower(0.38, 0.9, 1, '#C9A6F2')}
${flower(0.63, 0.84, 1.3, '#FF8A5C')}
${flower(0.86, 0.9, 1, '#FF7DAF')}
<path d="M ${w * 0.45} ${h * 0.6} q 1.5 -1.4 3 0 q -1.5 1.4 -3 0 Z" fill="#3FA7E8"/>
<path d="M ${w * 0.48} ${h * 0.6} q 1.5 -1.4 3 0 q -1.5 1.4 -3 0 Z" fill="#8FC7F2"/>`;
    },
  },
  {
    id: 'night', name: 'Starry night',
    draw(w, h) {
      const stars = [[0.1, 0.12, 1], [0.3, 0.06, 0.7], [0.5, 0.2, 0.9], [0.72, 0.08, 0.7],
        [0.9, 0.18, 1], [0.2, 0.32, 0.6], [0.62, 0.35, 0.8], [0.84, 0.42, 0.6], [0.4, 0.44, 0.7]]
        .map(([x, y, r]) => `<circle cx="${w * x}" cy="${h * y}" r="${r}" fill="#FFF7C9"/>`).join('');
      return `
<defs><linearGradient id="g-night" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1B2452"/><stop offset="1" stop-color="#3C3A7E"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-night)"/>
${stars}
<path d="M ${w * 0.76} ${h * 0.13} a ${h * 0.075} ${h * 0.075} 0 1 0 ${h * 0.055} ${h * 0.125} a ${h * 0.09} ${h * 0.09} 0 1 1 -${h * 0.055} -${h * 0.125} Z" fill="#FFF3B0"/>
<ellipse cx="${w * 0.3}" cy="${h * 1.06}" rx="${w * 0.8}" ry="${h * 0.32}" fill="#232B5E"/>
<ellipse cx="${w * 0.9}" cy="${h * 1.1}" rx="${w * 0.6}" ry="${h * 0.3}" fill="#1B2452"/>
<g fill="#FFE9A3">
  <rect x="${w * 0.14}" y="${h * 0.86}" width="1.6" height="1.6"/>
  <rect x="${w * 0.2}" y="${h * 0.9}" width="1.6" height="1.6"/>
</g>`;
    },
  },
  {
    id: 'playground', name: 'Playground',
    draw(w, h) {
      return `
<defs><linearGradient id="g-play" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#AEE3FF"/><stop offset="1" stop-color="#E6F7FF"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-play)"/>
<circle cx="${w * 0.88}" cy="${h * 0.1}" r="${h * 0.06}" fill="#FFD93B" stroke="#F4B400" stroke-width="1"/>
<ellipse cx="${w * 0.5}" cy="${h * 1.04}" rx="${w * 0.95}" ry="${h * 0.42}" fill="#8FD877"/>
<g stroke="#E8534A" stroke-width="1.2" fill="none">
  <path d="M ${w * 0.12} ${h * 0.86} L ${w * 0.2} ${h * 0.6} L ${w * 0.28} ${h * 0.86}"/>
  <line x1="${w * 0.2}" y1="${h * 0.6}" x2="${w * 0.42}" y2="${h * 0.86}"/>
</g>
<rect x="${w * 0.19}" y="${h * 0.585}" width="${w * 0.02}" height="${h * 0.02}" fill="#B03A33"/>
<g stroke="#3FA7E8" stroke-width="1.2" fill="none">
  <path d="M ${w * 0.62} ${h * 0.62} h ${w * 0.28}"/>
  <line x1="${w * 0.64}" y1="${h * 0.62}" x2="${w * 0.64}" y2="${h * 0.86}"/>
  <line x1="${w * 0.88}" y1="${h * 0.62}" x2="${w * 0.88}" y2="${h * 0.86}"/>
  <line x1="${w * 0.71}" y1="${h * 0.62}" x2="${w * 0.71}" y2="${h * 0.76}"/>
  <line x1="${w * 0.81}" y1="${h * 0.62}" x2="${w * 0.81}" y2="${h * 0.76}"/>
</g>
<rect x="${w * 0.695}" y="${h * 0.76}" width="${w * 0.03}" height="${h * 0.015}" fill="#FFD93B"/>
<rect x="${w * 0.795}" y="${h * 0.76}" width="${w * 0.03}" height="${h * 0.015}" fill="#FFD93B"/>`;
    },
  },
  {
    id: 'sweets', name: 'Sweet shop',
    draw(w, h) {
      const stripes = Array.from({ length: 8 }, (_, i) =>
        `<rect x="${w * i / 8}" width="${w / 16}" height="${h * 0.6}" fill="#FFE3EE"/>`).join('');
      const pop = (x, y, s, c) => `
<g transform="translate(${w * x} ${h * y}) scale(${s})">
  <line x1="0" y1="0" x2="0" y2="5.4" stroke="#C9A96A" stroke-width="0.8"/>
  <circle r="3.2" fill="${c}"/>
  <path d="M -3 -1 a 3.2 3.2 0 0 1 6 0" fill="none" stroke="#FFFFFF" stroke-width="0.9"/>
</g>`;
      return `
<rect width="${w}" height="${h}" fill="#FFF3F8"/>
${stripes}
<rect y="${h * 0.6}" width="${w}" height="${h * 0.06}" fill="#F2A7C3"/>
<rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="#FBD4E4"/>
${pop(0.2, 0.42, 1.2, '#FF7DAF')}
${pop(0.5, 0.38, 1.4, '#8FC7F2')}
${pop(0.8, 0.44, 1.1, '#C9A6F2')}
<circle cx="${w * 0.35}" cy="${h * 0.52}" r="1.4" fill="#FFD93B"/>
<circle cx="${w * 0.65}" cy="${h * 0.54}" r="1.4" fill="#7ECC5B"/>`;
    },
  },
  {
    id: 'dino', name: 'Dino valley',
    draw(w, h) {
      const palm = (x, y, s) => `
<g transform="translate(${w * x} ${h * y}) scale(${s})">
  <path d="M-0.8 0 q 0.4 -6 1.6 -8 l 1 0.4 q -1.4 2.4 -1 7.6 Z" fill="#9C6B43"/>
  <g fill="#4CA83C">
    <path d="M1.6 -8 q 3 -2.6 6 -1 q -3.4 1.6 -6 1.6 Z"/>
    <path d="M1.6 -8 q -3 -2.6 -6 -1 q 3.4 1.6 6 1.6 Z"/>
    <path d="M1.6 -8.2 q 0.4 -3.4 3 -4.6 q -0.6 3.2 -2.2 4.8 Z"/>
    <path d="M1.6 -8.2 q -1.6 -3 -4.4 -3.4 q 1.4 3 3.6 4 Z"/>
  </g>
</g>`;
      return `
<defs><linearGradient id="g-dino" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFE8B8"/><stop offset="1" stop-color="#FFD2A3"/>
</linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g-dino)"/>
<path d="M ${w * 0.62} ${h * 0.52} L ${w * 0.78} ${h * 0.24} L ${w * 0.94} ${h * 0.52} Z" fill="#9C6B7E"/>
<path d="M ${w * 0.73} ${h * 0.33} L ${w * 0.78} ${h * 0.24} L ${w * 0.83} ${h * 0.33} L ${w * 0.8} ${h * 0.36} L ${w * 0.76} ${h * 0.36} Z" fill="#FF8A5C"/>
<path d="M ${w * 0.78} ${h * 0.2} q 1.6 -2.4 0.6 -4.4" fill="none" stroke="#8A8A96" stroke-width="0.9" opacity="0.7"/>
<ellipse cx="${w * 0.35}" cy="${h * 1.04}" rx="${w * 0.85}" ry="${h * 0.4}" fill="#8FD877"/>
<ellipse cx="${w * 0.95}" cy="${h * 1.1}" rx="${w * 0.6}" ry="${h * 0.38}" fill="#7ECC5B"/>
${palm(0.14, 0.78, 1.3)}
${palm(0.88, 0.85, 1)}
<ellipse cx="${w * 0.5}" cy="${h * 0.88}" rx="3" ry="1.1" fill="#6EB8E8" opacity="0.8"/>`;
    },
  },
];

const SCENE_BG_IDS = {};
SCENE_BGS.forEach(b => { SCENE_BG_IDS[b.id] = b; });

// ── Scene state & codec ───────────────────────────────────────────────────────

// items: { m, x, y, s } for a pack member, { st, x, y, s } for a standard
// sticker placed straight from the searchable picker (issue #19)
let scene = { bg: SCENE_BGS[0].id, items: [] };
let sceneSel = -1;                                 // selected item index (top = last)

const STICKER_BY_ID = {};
STICKERS.forEach(s => { STICKER_BY_ID[s.id] = s; });

// ?s=<bg>*<m>_<x>_<y>_<s>[_<o>[_<r>[_<f>]]]*…  x/y are per-mille ints, s a
// size step, then three optional trailing fields (issues #30/#36): o opacity
// percent, r rotation degrees, f flip bits (1=horizontal, 2=vertical). Any
// all-default tail is trimmed, so untouched items keep the old 4-field shape
// and their links stay readable by old apps; items using newer fields are
// simply skipped by older decoders (same degrade path as stickers, whose
// "s<id>" head parseInts to NaN in the oldest apps).
function encodeScene(sc) {
  return sc.bg + sc.items.map(it => {
    const defs = [100, 0, 0];
    const vals = [it.o || 100, it.r || 0, it.f || 0];
    while (vals.length && vals[vals.length - 1] === defs[vals.length - 1]) vals.pop();
    return `*${it.st ? 's' + it.st : it.m}_${it.x}_${it.y}_${it.s}` +
           (vals.length ? '_' + vals.join('_') : '');
  }).join('');
}

function decodeScene(str) {
  const segs = (str || '').split('*');
  const bg = SCENE_BG_IDS[segs[0]] ? segs[0] : SCENE_BGS[0].id;
  const items = [];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  for (const seg of segs.slice(1)) {
    if (items.length >= SCENE_MAX) break;
    const f = seg.split('_');
    const nums = f.slice(1).map(v => parseInt(v, 10));
    if (f.length < 4 || f.length > 7 || nums.some(n => !Number.isInteger(n))) continue;
    const pos = {
      x: clamp(nums[0], 0, 1000),
      y: clamp(nums[1], 0, 1000),
      s: clamp(nums[2], SCENE_S_MIN, SCENE_S_MAX),
    };
    if (nums.length > 3 && nums[3] < 100) pos.o = clamp(nums[3], 10, 99);
    if (nums.length > 4 && nums[4] % 360) pos.r = ((nums[4] % 360) + 360) % 360;
    if (nums.length > 5 && nums[5] % 4) pos.f = ((nums[5] % 4) + 4) % 4;
    if (f[0].startsWith('s')) {
      const st = f[0].slice(1);
      if (STICKER_BY_ID[st]) items.push({ st, ...pos });
    } else {
      const m = parseInt(f[0], 10);
      if (Number.isInteger(m)) items.push({ m: clamp(m, 0, PACK_MAX - 1), ...pos });
    }
  }
  return { bg, items };
}

// the inner 72×72 art for any scene item: a sticker's own glyph, or the
// item's pack member decoded — '' when the referenced thing no longer exists
function sceneItemArt(it, packArr) {
  if (it.st) {
    const s = STICKER_BY_ID[it.st];
    return s ? s.svg : '';
  }
  const enc = packArr[it.m];
  return enc ? encodedInnerSvg(enc) : '';
}

// items whose pack member vanished (pack re-curation) render as nothing and
// are dropped on the next open
function sceneValidItems() {
  return scene.items.filter(it => !!sceneItemArt(it, pack));
}

function persistScene() {
  try { localStorage.setItem(SCENE_KEY, JSON.stringify(scene)); } catch (e) {}
}

function loadStoredScene() {
  try {
    const d = JSON.parse(localStorage.getItem(SCENE_KEY));
    if (d && typeof d.bg === 'string' && Array.isArray(d.items)) {
      return decodeScene(encodeScene({ bg: d.bg, items: d.items.filter(
        it => it && (Number.isInteger(it.m) || typeof it.st === 'string'),
      ) }));   // sanitise through the codec
    }
  } catch (e) {}
  return null;
}

function sceneSyncUrl() {
  const u = new URL(location.href);
  if (scene.items.length || scene.bg !== SCENE_BGS[0].id) {
    u.searchParams.set('s', encodeScene(scene));
  } else {
    u.searchParams.delete('s');
  }
  history.replaceState(null, '', u);
}

// ── Geometry ──────────────────────────────────────────────────────────────────
// The viewBox is 100 units tall and aspect×100 wide, so "device window" is
// the default canvas and positions reflow proportionally on other screens.

let sceneDims = { w: 56, h: 100 };

function sceneMeasure() {
  const wrap = document.querySelector('.scene-stage-wrap');
  const svg = document.getElementById('scene-svg');
  if (!wrap || !svg) return;
  const r = wrap.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const w = Math.max(30, Math.min(400, Math.round(100 * r.width / r.height)));
  sceneDims = { w, h: 100 };
  svg.setAttribute('viewBox', `0 0 ${w} 100`);
}

function itemFactor(it) {
  return SCENE_BASE * Math.min(sceneDims.w, sceneDims.h) / 72 * Math.pow(SCENE_STEP, it.s);
}

function itemCenter(it) {
  return { x: it.x / 1000 * sceneDims.w, y: it.y / 1000 * sceneDims.h };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// dims-parameterised so saved-scene thumbnails (which carry their own pack
// snapshot) render through the same path as the live canvas
function sceneItemMarkupIn(it, art, dims) {
  if (!art) return '';
  const f = SCENE_BASE * Math.min(dims.w, dims.h) / 72 * Math.pow(SCENE_STEP, it.s);
  const c = { x: it.x / 1000 * dims.w, y: it.y / 1000 * dims.h };
  const op = it.o && it.o < 100 ? ` opacity="${(it.o / 100).toFixed(2)}"` : '';
  // rotation and flips (issue #36) happen around the item's centre: rotate
  // after moving there, mirror by negating the scale per axis
  const rot = it.r ? ` rotate(${it.r})` : '';
  const sx = (it.f & 1 ? -f : f).toFixed(4);
  const sy = (it.f & 2 ? -f : f).toFixed(4);
  return `<g${op} transform="translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})${rot} ` +
         `scale(${sx} ${sy}) translate(-36 -36)">${art}</g>`;
}

function sceneItemMarkup(it) {
  return sceneItemMarkupIn(it, sceneItemArt(it, pack), sceneDims);
}

function renderSceneBg() {
  const g = document.getElementById('scene-bg-layer');
  if (!g) return;
  g.innerHTML = SCENE_BG_IDS[scene.bg].draw(sceneDims.w, sceneDims.h);
  document.querySelectorAll('#scene-bgs .scene-bg-btn').forEach(b =>
    b.classList.toggle('is-selected', b.dataset.bg === scene.bg));
}

function renderSceneItems() {
  const g = document.getElementById('scene-items');
  if (!g) return;
  g.innerHTML = scene.items.map(sceneItemMarkup).join('');
  renderSceneSel();
}

// Much of the 72×72 art box is empty padding for many stickers, so the
// selection box and hit-test hug the art's real bbox instead (issue #31),
// measured once per art string via a throwaway <g> and cached. getBBox
// ignores stroke widths, so a couple of art-units of pad go back on.
const ART_BOUNDS = new Map();
const ART_PAD = 2;

function sceneArtBounds(it) {
  const key = it.st ? 's' + it.st : pack[it.m];
  if (ART_BOUNDS.has(key)) return ART_BOUNDS.get(key);
  const svg = document.getElementById('scene-svg');
  const art = sceneItemArt(it, pack);
  let b = { x: 0, y: 0, w: 72, h: 72 };            // fallback: the full box
  if (svg && art) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('visibility', 'hidden');
    g.innerHTML = art;
    svg.appendChild(g);
    try {
      const r = g.getBBox();
      if (r.width > 0 && r.height > 0) b = { x: r.x, y: r.y, w: r.width, h: r.height };
    } catch (e) { /* keep the full-box fallback */ }
    g.remove();
    ART_BOUNDS.set(key, b);
  }
  return b;
}

// scene-space axis-aligned box around the item's (padded) art bounds, with
// the item's flip and rotation applied — shared by the selection rectangle
// and the pointer hit-test
function sceneItemBox(it) {
  const f = itemFactor(it);
  const c = itemCenter(it);
  const b = sceneArtBounds(it);
  const x0 = b.x - ART_PAD - 36;
  const y0 = b.y - ART_PAD - 36;
  const x1 = x0 + b.w + ART_PAD * 2;
  const y1 = y0 + b.h + ART_PAD * 2;
  const sx = it.f & 1 ? -f : f;
  const sy = it.f & 2 ? -f : f;
  const rad = (it.r || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const qx = px * sx, qy = py * sy;
    const rx = qx * cos - qy * sin;
    const ry = qx * sin + qy * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { x: c.x + minX, y: c.y + minY, w: maxX - minX, h: maxY - minY };
}

function renderSceneSel() {
  const box = document.getElementById('scene-sel');
  if (!box) return;
  const it = scene.items[sceneSel];
  if (!it || !sceneItemArt(it, pack)) { box.setAttribute('visibility', 'hidden'); syncSceneTools(); return; }
  const r = sceneItemBox(it);
  box.setAttribute('x', r.x);
  box.setAttribute('y', r.y);
  box.setAttribute('width', r.w);
  box.setAttribute('height', r.h);
  box.setAttribute('visibility', 'visible');
  syncSceneTools();
}

function syncSceneTools() {
  const bar = document.getElementById('scene-tools');
  if (bar) bar.hidden = sceneSel < 0;
  const slider = document.getElementById('sc-opacity');
  const it = scene.items[sceneSel];
  if (slider && it) slider.value = it.o || 100;
}

// tray.innerHTML = '' detaches the adopted 🔎/📦 buttons each render, so they
// are re-found by reference after the first adoption (getElementById can't
// see detached nodes)
let scenePickBtnRef = null;
let scenePackBtnRef = null;

function renderSceneTray() {
  const tray = document.getElementById('scene-tray');
  if (!tray) return;
  tray.innerHTML = '';
  // adopt 🔎 and 📦 as the cluster's first children (issue #35) — appendChild
  // moves the persistent nodes (and their listeners) from wherever they are
  const pick = document.getElementById('scene-pick-btn') || scenePickBtnRef;
  const packBtn = document.getElementById('scene-pack-btn') || scenePackBtnRef;
  if (pick) { scenePickBtnRef = pick; tray.appendChild(pick); }
  if (packBtn) { scenePackBtnRef = packBtn; tray.appendChild(packBtn); }
  pack.forEach((enc, i) => {
    const b = document.createElement('button');
    b.className = 'pack-thumb scene-tray-thumb';
    b.setAttribute('aria-label', 'Place pack emoji ' + (i + 1) + ' in the scene');
    b.innerHTML = galleryThumbSvg(enc);
    b.addEventListener('click', () => placeSceneItem(i));
    tray.appendChild(b);
  });
  // the emoji on the canvas isn't in the pack yet → offer it with a + badge
  // (placing it adds it to the pack so the scene link can reference it)
  if (packActive === -1 && pack.length < PACK_MAX) {
    const b = document.createElement('button');
    b.className = 'pack-thumb scene-tray-thumb scene-tray-current';
    b.setAttribute('aria-label', 'Add your current emoji to the pack and place it');
    b.innerHTML = galleryThumbSvg(encodeState()) + '<span class="scene-tray-plus">+</span>';
    b.addEventListener('click', () => {
      addCurrentToPack();
      renderSceneTray();
      placeSceneItem(pack.length - 1);
    });
    tray.appendChild(b);
  }
  const hint = document.getElementById('scene-hint');
  if (hint) hint.hidden = scene.items.length > 0;
}

function renderScene() {
  sceneMeasure();
  renderSceneBg();
  renderSceneItems();
  renderSceneTray();
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function sceneChanged() {
  persistScene();
  sceneSyncUrl();
}

// Landing spot for a new item (issue #41): sample candidate positions across
// the whole canvas and keep the one farthest from every existing item, so
// drops spread out instead of piling into one small box. Distances are
// measured in viewBox units (not per-mille), so a tall/narrow phone canvas
// spreads vertically as it should. The margin keeps the item's default
// footprint on-canvas, in per-mille of each axis.
function sceneDropSpot() {
  const half = SCENE_BASE * Math.min(sceneDims.w, sceneDims.h) / 2;
  const mx = Math.min(400, Math.round(half / sceneDims.w * 1000) + 20);
  const my = Math.min(400, Math.round(half / sceneDims.h * 1000) + 20);
  let best = { x: 500, y: 500 };
  let bestD = -1;
  for (let i = 0; i < 16; i++) {
    const x = mx + Math.round(Math.random() * (1000 - 2 * mx));
    const y = my + Math.round(Math.random() * (1000 - 2 * my));
    let d = Infinity;
    for (const it of scene.items) {
      const dx = (x - it.x) / 1000 * sceneDims.w;
      const dy = (y - it.y) / 1000 * sceneDims.h;
      d = Math.min(d, dx * dx + dy * dy);
    }
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function placeSceneItem(mi) {
  if (!pack[mi]) return;
  if (scene.items.length >= SCENE_MAX) {
    showToast('\u{1F3DE}\u{FE0F} The scene is full!');
    return;
  }
  const spot = sceneDropSpot();
  scene.items.push({ m: mi, x: spot.x, y: spot.y, s: 0 });
  sceneSel = scene.items.length - 1;
  renderSceneItems();
  renderSceneTray();
  sceneChanged();
}

// ── Standard-emoji picker (issue #19) ─────────────────────────────────────────
// 🔎 next to the tray opens a searchable, category-grouped picker over the
// curated STICKERS set, so a rocket can join the scene without building a
// custom face for it. Placed stickers behave exactly like pack items:
// drag, resize, duplicate, delete, share.

const STICKER_GROUP_ORDER = ['Animals', 'Food & drink', 'Nature', 'Travel & places', 'More fun'];

function placeStickerItem(id) {
  if (!STICKER_BY_ID[id]) return;
  if (scene.items.length >= SCENE_MAX) {
    showToast('\u{1F3DE}\u{FE0F} The scene is full!');
    return;
  }
  const spot = sceneDropSpot();
  scene.items.push({ st: id, x: spot.x, y: spot.y, s: 0 });
  sceneSel = scene.items.length - 1;
  renderSceneItems();
  renderSceneTray();   // syncs the "tap an emoji" hint
  sceneChanged();
  closeScenePicker();
}

function stickerButton(s) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.setAttribute('aria-label', 'Add ' + s.name + ' to the scene');
  b.innerHTML = `<svg viewBox="0 0 72 72" class="swatch-svg" aria-hidden="true">${s.svg}</svg>` +
                `<span class="swatch-name">${s.name}</span>`;
  b.addEventListener('click', () => placeStickerItem(s.id));
  return b;
}

function renderScenePicker(query) {
  const grid = document.getElementById('scene-picker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const q = (query || '').trim().toLowerCase();
  if (q) {
    const hits = STICKERS.filter(s => s.name.toLowerCase().includes(q));
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'gallery-empty';
      p.textContent = 'Nothing found — try another word!';
      grid.appendChild(p);
      return;
    }
    hits.forEach(s => grid.appendChild(stickerButton(s)));
    return;
  }
  STICKER_GROUP_ORDER.forEach(group => {
    const members = STICKERS.filter(s => (s.g || 'More fun') === group);
    if (!members.length) return;
    const head = document.createElement('h3');
    head.className = 'gallery-sect';
    head.textContent = group;
    grid.appendChild(head);
    members.forEach(s => grid.appendChild(stickerButton(s)));
  });
}

function openScenePicker() {
  const el = document.getElementById('scene-picker');
  const search = document.getElementById('scene-picker-search');
  if (search) search.value = '';
  renderScenePicker('');
  openOverlay(el, closeScenePicker);
}

function closeScenePicker() {
  closeOverlay(document.getElementById('scene-picker'));
}

// ── Pack switcher (issue #35) ─────────────────────────────────────────────────
// 📦 next to the tray: swap the working pack for a saved pack (My Emojis,
// issue #27) or a starter pack without leaving the scene. Goes through
// replacePack() so Undo/persistence/savedId all behave like a gallery load;
// the `after` hook re-renders the tray and re-skins placed items (they
// reference pack members by index).

function sceneAfterPackSwap() {
  renderSceneTray();
  renderSceneItems();
}

function scenePackRow(label, members, onPick) {
  const btn = document.createElement('button');
  btn.className = 'preset-pack';
  btn.setAttribute('aria-label', 'Switch to ' + label);
  const thumbs = document.createElement('span');
  thumbs.className = 'preset-thumbs';
  thumbs.innerHTML = members.map(galleryThumbSvg).join('');
  const name = document.createElement('span');
  name.className = 'preset-name';
  name.textContent = label;   // saved-pack names are user text
  btn.appendChild(thumbs);
  btn.appendChild(name);
  btn.addEventListener('click', onPick);
  return btn;
}

function renderScenePackPicker() {
  const grid = document.getElementById('scene-pack-grid');
  grid.innerHTML = '';
  const section = txt => {
    const head = document.createElement('h3');
    head.className = 'gallery-sect';
    head.textContent = txt;
    grid.appendChild(head);
  };
  const saved = loadGallery();
  if (saved.length) {
    section('\u{1F5BC}\u{FE0F} My Emojis');
    saved.forEach(entry => {
      const label = entry.n || '\u{1F49B} Saved emoji';
      grid.appendChild(scenePackRow(label, entry.m, () => {
        closeScenePackPicker();
        replacePack(entry.m, '\u{1F4E6} ' + label, entry.id, sceneAfterPackSwap);
      }));
    });
  }
  section('✨ Starter packs');
  PRESET_PACKS.forEach(preset => {
    grid.appendChild(scenePackRow(preset.name, preset.members, () => {
      closeScenePackPicker();
      replacePack(preset.members, preset.emoji + ' ' + preset.name, null, sceneAfterPackSwap);
    }));
  });
}

function openScenePackPicker() {
  renderScenePackPicker();
  openOverlay(document.getElementById('scene-pack-picker'), closeScenePackPicker);
}

function closeScenePackPicker() {
  closeOverlay(document.getElementById('scene-pack-picker'));
}

function removeSceneItem() {
  if (sceneSel < 0) return;
  scene.items.splice(sceneSel, 1);
  sceneSel = -1;
  renderSceneItems();
  renderSceneTray();
  sceneChanged();
}

function duplicateSceneItem() {
  const it = scene.items[sceneSel];
  if (!it) return;
  if (scene.items.length >= SCENE_MAX) {
    showToast('\u{1F3DE}\u{FE0F} The scene is full!');
    return;
  }
  const copy = { ...it, x: Math.min(1000, it.x + 70), y: Math.min(1000, it.y + 70) };
  scene.items.push(copy);
  sceneSel = scene.items.length - 1;
  renderSceneItems();
  sceneChanged();
}

function resizeSceneItem(dir) {
  const it = scene.items[sceneSel];
  if (!it) return;
  it.s = Math.max(SCENE_S_MIN, Math.min(SCENE_S_MAX, it.s + dir));
  renderSceneItems();
  sceneChanged();
}

function setSceneBg(id) {
  if (!SCENE_BG_IDS[id] || scene.bg === id) return;
  scene.bg = id;
  renderSceneBg();
  sceneChanged();
}

// selecting raises the item to the top so it's draggable out of a pile
function selectSceneItem(i) {
  if (i >= 0 && i < scene.items.length - 1) {
    const [it] = scene.items.splice(i, 1);
    scene.items.push(it);
    i = scene.items.length - 1;
    renderSceneItems();
    sceneChanged();
  }
  sceneSel = i;
  renderSceneSel();
}

// ── Pointer: select & drag ────────────────────────────────────────────────────

let sceneDrag = null;

function sceneToSvg(evt) {
  const svg = document.getElementById('scene-svg');
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(m.inverse());
}

function sceneHit(p) {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const it = scene.items[i];
    if (!sceneItemArt(it, pack)) continue;
    const r = sceneItemBox(it);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
  }
  return -1;
}

// Two fingers on the stage pinch-resize AND twist-rotate the selected item;
// a scroll wheel over an item resizes it; long-pressing an item cycles its
// flips; holding the right mouse button drags a rotation (issues #30/#36).
// The +/- chips stay as the accessible fallback. Pinch maps the finger-
// distance ratio onto whole size steps so it lands on the same sizes the
// buttons reach; rotation is continuous but snaps to right angles.
const scenePtrs = new Map();
let scenePinch = null;
let sceneRotate = null;      // right-button drag: { r0, a0, changed }
let scenePressTimer = null;  // long-press → flip cycle
const SCENE_DRAG_SLOP = 6;   // client px a pointer may wander and still hold

function scenePinchDist() {
  const [a, b] = [...scenePtrs.values()];
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

function scenePinchAngle() {
  const [a, b] = [...scenePtrs.values()];
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

// continuous rotation, but a nudge near 0/90/180/270 lands exactly there —
// straightening an item by eye is otherwise fiddly. 0 means "no r field".
function snapAngle(r) {
  const n = ((Math.round(r) % 360) + 360) % 360;
  const k = (Math.round(n / 90) * 90) % 360;
  return Math.abs(((n - k + 540) % 360) - 180) <= 6 ? k : n;
}

function setItemRotation(it, deg) {
  const r = snapAngle(deg);
  if (r === (it.r || 0)) return false;
  if (r) it.r = r; else delete it.r;
  return true;
}

// long-press on an item cycles plain → flipped ↔ → flipped ↕ → both → plain
function flipCycle(it) {
  const f = ((it.f || 0) + 1) % 4;
  if (f) it.f = f; else delete it.f;
  renderSceneItems();
  sceneChanged();
}

function initSceneDrag() {
  const svg = document.getElementById('scene-svg');
  const cancelPress = () => { clearTimeout(scenePressTimer); scenePressTimer = null; };
  svg.addEventListener('pointerdown', e => {
    scenePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (svg.setPointerCapture) try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    if (scenePtrs.size === 2) {
      // second finger: switch from dragging to pinch-resize + twist-rotate
      sceneDrag = null;
      cancelPress();
      const it = scene.items[sceneSel];
      if (it) {
        scenePinch = { d0: scenePinchDist(), s0: it.s,
                       a0: scenePinchAngle(), r0: it.r || 0, changed: false };
      }
      return;
    }
    if (scenePtrs.size > 2) return;
    const p = sceneToSvg(e);
    if (!p) return;
    const i = sceneHit(p);
    if (i < 0) { sceneSel = -1; renderSceneSel(); return; }
    selectSceneItem(i);
    const it = scene.items[sceneSel];
    const c = itemCenter(it);
    if (e.button === 2) {
      // hold right-click and drag to rotate (contextmenu is suppressed below)
      sceneRotate = { r0: it.r || 0,
                      a0: Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI,
                      changed: false };
      return;
    }
    sceneDrag = { dx: c.x - p.x, dy: c.y - p.y, moved: false,
                  cx: e.clientX, cy: e.clientY };
    // holding still on the item for a beat flips it (same timing as the
    // action buttons' addLongPress helper) — any real drag cancels this
    scenePressTimer = setTimeout(() => {
      scenePressTimer = null;
      sceneDrag = null;
      flipCycle(it);
    }, LONG_PRESS_MS);
  });
  svg.addEventListener('pointermove', e => {
    if (scenePtrs.has(e.pointerId)) scenePtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (scenePinch) {
      if (scenePtrs.size < 2) return;
      const it = scene.items[sceneSel];
      if (!it) return;
      const steps = Math.round(Math.log(scenePinchDist() / scenePinch.d0) / Math.log(SCENE_STEP));
      const ns = Math.max(SCENE_S_MIN, Math.min(SCENE_S_MAX, scenePinch.s0 + steps));
      let dirty = false;
      if (ns !== it.s) { it.s = ns; dirty = true; }
      const dA = ((scenePinchAngle() - scenePinch.a0 + 540) % 360) - 180;
      if (setItemRotation(it, scenePinch.r0 + dA)) dirty = true;
      if (dirty) { scenePinch.changed = true; renderSceneItems(); }
      e.preventDefault();
      return;
    }
    if (sceneRotate && sceneSel >= 0) {
      const p = sceneToSvg(e);
      const it = scene.items[sceneSel];
      if (!p || !it) return;
      const c = itemCenter(it);
      const a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI;
      if (setItemRotation(it, sceneRotate.r0 + a - sceneRotate.a0)) {
        sceneRotate.changed = true;
        renderSceneItems();
      }
      e.preventDefault();
      return;
    }
    if (!sceneDrag || sceneSel < 0) return;
    // a finger can tremble a little and still be a long-press, not a drag
    if (!sceneDrag.moved &&
        Math.hypot(e.clientX - sceneDrag.cx, e.clientY - sceneDrag.cy) < SCENE_DRAG_SLOP) return;
    cancelPress();
    const p = sceneToSvg(e);
    if (!p) return;
    const it = scene.items[sceneSel];
    it.x = Math.round(Math.max(0, Math.min(1, (p.x + sceneDrag.dx) / sceneDims.w)) * 1000);
    it.y = Math.round(Math.max(0, Math.min(1, (p.y + sceneDrag.dy) / sceneDims.h)) * 1000);
    sceneDrag.moved = true;
    renderSceneItems();
    e.preventDefault();
  });
  const up = e => {
    scenePtrs.delete(e.pointerId);
    cancelPress();
    if (scenePinch && scenePtrs.size < 2) {
      if (scenePinch.changed) sceneChanged();
      scenePinch = null;
    }
    if (sceneRotate) {
      if (sceneRotate.changed) sceneChanged();
      sceneRotate = null;
    }
    if (sceneDrag && sceneDrag.moved) sceneChanged();
    sceneDrag = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // wheel over an item: select it and resize, one step per ~60 units of spin
  let wheelAcc = 0;
  svg.addEventListener('wheel', e => {
    const p = sceneToSvg(e);
    if (!p) return;
    const i = sceneHit(p);
    if (i < 0) return;
    e.preventDefault();
    if (i !== sceneSel) { selectSceneItem(i); wheelAcc = 0; }
    wheelAcc += e.deltaY;
    const steps = -Math.trunc(wheelAcc / 60);
    if (steps) { wheelAcc += steps * 60; resizeSceneItem(steps); }
  }, { passive: false });
  svg.addEventListener('contextmenu', e => e.preventDefault());
}

// ── Export & share ────────────────────────────────────────────────────────────

function buildSceneExportSvg() {
  const { w, h } = sceneDims;
  const items = sceneValidItems().map(sceneItemMarkup).join('');
  const exH = 1080;
  const exW = Math.round(exH * w / h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
         `width="${exW}" height="${exH}">${SCENE_BG_IDS[scene.bg].draw(w, h)}${items}</svg>`;
}

function rasteriseScene() {
  return new Promise((resolve, reject) => {
    const svgStr = buildSceneExportSvg();
    const m = svgStr.match(/width="(\d+)" height="(\d+)"/);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = parseInt(m[1], 10);
      c.height = parseInt(m[2], 10);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = () => reject(new Error('svg decode failed'));
    img.src = url;
  });
}

async function shareScene() {
  let blob;
  try { blob = await rasteriseScene(); } catch (e) { showToast('Could not make image'); return; }
  const file = new File([blob], 'emojicle-scene.png', { type: 'image/png' });
  if (canShareFiles(file)) {
    try { await navigator.share({ files: [file] }); } catch (e) { /* cancelled */ }
  } else {
    downloadBlob(blob, 'emojicle-scene.png');
    showToast('Scene exported');
  }
}

// ── My Scenes ─────────────────────────────────────────────────────────────────
// 💾 in the scene header keeps the current scene in a localStorage list,
// mirroring the My Emojis gallery (issue #23). Scene items reference pack
// members by index, so each save snapshots the pack alongside the scene
// encoding — a saved scene survives any later pack editing. Saved scenes
// show as a shelf inside the My Emojis gallery; opening one restores scene
// AND pack, with an Undo (same shape as loading a ?p= link).

const SCENES_KEY = 'emojicle-scenes';
const SCENES_MAX = 12;

function loadScenes() {
  try {
    const l = JSON.parse(localStorage.getItem(SCENES_KEY));
    if (!Array.isArray(l)) return [];
    return l.filter(e => e && typeof e.s === 'string' &&
      Array.isArray(e.p) && e.p.every(m => typeof m === 'string'));
  } catch (e) { return []; }
}

function saveScenes(list) {
  try { localStorage.setItem(SCENES_KEY, JSON.stringify(list)); } catch (e) {}
}

function savedScenesCount() { return loadScenes().length; }

function saveCurrentScene() {
  const entry = { s: encodeScene({ bg: scene.bg, items: sceneValidItems() }), p: pack.slice() };
  const list = loadScenes();
  if (!list.some(e => e.s === entry.s && packToParam(e.p) === packToParam(entry.p))) {
    list.unshift(entry);
    if (list.length > SCENES_MAX) list.pop();
    saveScenes(list);
  }
  showToast('\u{1F4BE} Saved — find it in \u{1F5BC}\u{FE0F} My Emojis!');
}

// portrait thumbnail (scenes are designed on portrait phones)
function sceneThumbSvg(entry) {
  const dims = { w: 60, h: 100 };
  const dec = decodeScene(entry.s);
  const items = dec.items.map(it => sceneItemMarkupIn(it, sceneItemArt(it, entry.p), dims)).join('');
  return `<svg viewBox="0 0 ${dims.w} ${dims.h}" class="scene-thumb-svg" aria-hidden="true">` +
         SCENE_BG_IDS[dec.bg].draw(dims.w, dims.h) + items + '</svg>';
}

function openSavedScene(entry) {
  const prev = { p: pack.slice(), a: packActive, sid: packSavedId, s: encodeScene(scene) };
  pack = entry.p.slice(0, PACK_MAX);
  packActive = -1;
  packSavedId = null;   // a scene's pack snapshot isn't a saved gallery pack
  persistPack();
  renderPackRail();
  scene = decodeScene(entry.s);
  persistScene();
  closeGallery();
  openScene();
  showToast('\u{1F3DE}\u{FE0F} Scene loaded!', 'Undo', () => {
    pack = prev.p;
    packActive = prev.a;
    packSavedId = prev.sid;
    persistPack();
    renderPackRail();
    scene = decodeScene(prev.s);
    persistScene();
    const el = document.getElementById('scene');
    if (el && el.classList.contains('show')) renderScene();
    sceneSyncUrl();
  });
}

// called by renderGallery() (app.js) to append the shelf under the emojis
function renderSceneShelf(grid) {
  const list = loadScenes();
  if (!list.length) return;
  const head = document.createElement('h3');
  head.className = 'gallery-sect';
  head.textContent = '\u{1F3DE}\u{FE0F} My Scenes';
  grid.appendChild(head);
  list.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const open = document.createElement('button');
    open.className = 'swatch scene-shelf-thumb';
    open.setAttribute('aria-label', 'Open saved scene ' + (i + 1));
    open.innerHTML = sceneThumbSvg(entry);
    open.addEventListener('click', () => openSavedScene(entry));
    const del = document.createElement('button');
    del.className = 'gallery-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Forget saved scene ' + (i + 1));
    del.addEventListener('click', () => {
      const l = loadScenes();
      l.splice(i, 1);
      saveScenes(l);
      renderGallery();
    });
    item.appendChild(open);
    item.appendChild(del);
    grid.appendChild(item);
  });
}

// ── Open / close / init ───────────────────────────────────────────────────────

function openScene() {
  scene.items = sceneValidItems();   // shed members that no longer exist
  sceneSel = -1;
  openOverlay(document.getElementById('scene'), closeScene);
  renderScene();      // after openOverlay: it must be visible to measure
  sceneSyncUrl();
}

function closeScene() {
  sceneSel = -1;
  closeOverlay(document.getElementById('scene'));
}

function buildSceneBgPicker() {
  const row = document.getElementById('scene-bgs');
  SCENE_BGS.forEach(bg => {
    const b = document.createElement('button');
    b.className = 'scene-bg-btn';
    b.dataset.bg = bg.id;
    b.setAttribute('aria-label', bg.name + ' background');
    b.title = bg.name;
    b.innerHTML = `<svg viewBox="0 0 56 36" aria-hidden="true">${bg.draw(56, 36)}</svg>`;
    b.addEventListener('click', () => setSceneBg(bg.id));
    row.appendChild(b);
  });
}

function initScene() {
  applyDoodleBackdrop();

  const el = document.getElementById('scene');
  if (!el) return;

  buildSceneBgPicker();
  initSceneDrag();

  document.getElementById('btn-scene').addEventListener('click', () => {
    pulse('btn-scene');
    openScene();
  });
  document.getElementById('scene-close').addEventListener('click', closeScene);
  document.getElementById('scene-save').addEventListener('click', saveCurrentScene);
  document.getElementById('scene-pick-btn').addEventListener('click', openScenePicker);
  document.getElementById('scene-picker-close').addEventListener('click', closeScenePicker);
  document.getElementById('scene-picker').addEventListener('click', e => {
    if (e.target.id === 'scene-picker') closeScenePicker();
  });
  document.getElementById('scene-pack-btn').addEventListener('click', openScenePackPicker);
  document.getElementById('scene-pack-close').addEventListener('click', closeScenePackPicker);
  document.getElementById('scene-pack-picker').addEventListener('click', e => {
    if (e.target.id === 'scene-pack-picker') closeScenePackPicker();
  });
  document.getElementById('scene-picker-search').addEventListener('input', e =>
    renderScenePicker(e.target.value));
  document.getElementById('scene-share').addEventListener('click', shareScene);
  document.getElementById('sc-bigger').addEventListener('click', () => resizeSceneItem(1));
  document.getElementById('sc-smaller').addEventListener('click', () => resizeSceneItem(-1));
  document.getElementById('sc-dup').addEventListener('click', duplicateSceneItem);
  document.getElementById('sc-del').addEventListener('click', removeSceneItem);
  // opacity slider (issue #30): live preview on input, persist on release;
  // 100% is stored as "no o field" so fully-opaque items keep short links
  const opSlider = document.getElementById('sc-opacity');
  opSlider.addEventListener('input', () => {
    const it = scene.items[sceneSel];
    if (!it) return;
    const v = parseInt(opSlider.value, 10);
    if (v >= 100) delete it.o; else it.o = v;
    renderSceneItems();
  });
  opSlider.addEventListener('change', () => {
    if (scene.items[sceneSel]) sceneChanged();
  });

  // The viewBox aspect must always match .scene-stage-wrap's real box —
  // preserveAspectRatio is "none", so any mismatch renders as stretching.
  // A window 'resize' listener alone loses that race on iOS rotation: the
  // wrap's box can keep settling (address bar / safe-areas animate on their
  // own schedule) after the last resize event fires, leaving a stale viewBox
  // stretched over the final layout (issue #42). Observing the element's own
  // box re-measures whenever it truly changes, however late that lands.
  const relayout = () => {
    if (el.classList.contains('show')) renderScene();
  };
  const wrap = document.querySelector('.scene-stage-wrap');
  if (window.ResizeObserver && wrap) new ResizeObserver(relayout).observe(wrap);
  else window.addEventListener('resize', relayout);

  // a ?s= link opens straight into the shared scene (the pack came in ?p=);
  // otherwise yesterday's scene quietly waits behind the Scene button
  const sParam = new URLSearchParams(location.search).get('s');
  if (sParam) {
    scene = decodeScene(sParam);
    persistScene();
    openScene();
  } else {
    const stored = loadStoredScene();
    if (stored) scene = stored;
  }
}

document.addEventListener('DOMContentLoaded', initScene);
