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
const SCENE_S_MIN = -2;
const SCENE_S_MAX = 3;

// ── Background library ────────────────────────────────────────────────────────
// Each background draws itself for an arbitrary w×h box (viewBox units) from
// flat shapes and gradients — lightweight, crisp at any size, offline by
// construction. The first entry is the default.
const SCENE_BGS = [
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
];

const SCENE_BG_IDS = {};
SCENE_BGS.forEach(b => { SCENE_BG_IDS[b.id] = b; });

// ── Scene state & codec ───────────────────────────────────────────────────────

let scene = { bg: SCENE_BGS[0].id, items: [] };   // items: { m, x, y, s }
let sceneSel = -1;                                 // selected item index (top = last)

// ?s=<bg>*<m>_<x>_<y>_<s>*…  x/y are per-mille ints, s a size step
function encodeScene(sc) {
  return sc.bg + sc.items.map(it => `*${it.m}_${it.x}_${it.y}_${it.s}`).join('');
}

function decodeScene(str) {
  const segs = (str || '').split('*');
  const bg = SCENE_BG_IDS[segs[0]] ? segs[0] : SCENE_BGS[0].id;
  const items = [];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  for (const seg of segs.slice(1)) {
    if (items.length >= SCENE_MAX) break;
    const f = seg.split('_').map(v => parseInt(v, 10));
    if (f.length !== 4 || f.some(n => !Number.isInteger(n))) continue;
    items.push({
      m: clamp(f[0], 0, PACK_MAX - 1),
      x: clamp(f[1], 0, 1000),
      y: clamp(f[2], 0, 1000),
      s: clamp(f[3], SCENE_S_MIN, SCENE_S_MAX),
    });
  }
  return { bg, items };
}

// items whose pack member vanished (pack re-curation) render as nothing and
// are dropped on the next open
function sceneValidItems() {
  return scene.items.filter(it => !!pack[it.m]);
}

function persistScene() {
  try { localStorage.setItem(SCENE_KEY, JSON.stringify(scene)); } catch (e) {}
}

function loadStoredScene() {
  try {
    const d = JSON.parse(localStorage.getItem(SCENE_KEY));
    if (d && typeof d.bg === 'string' && Array.isArray(d.items)) {
      return decodeScene(encodeScene({ bg: d.bg, items: d.items.filter(
        it => it && Number.isInteger(it.m)) }));   // sanitise through the codec
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

function sceneItemMarkup(it) {
  const enc = pack[it.m];
  if (!enc) return '';
  const f = itemFactor(it);
  const c = itemCenter(it);
  return `<g transform="translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${f.toFixed(4)}) translate(-36 -36)">${encodedInnerSvg(enc)}</g>`;
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

function renderSceneSel() {
  const box = document.getElementById('scene-sel');
  if (!box) return;
  const it = scene.items[sceneSel];
  if (!it || !pack[it.m]) { box.setAttribute('visibility', 'hidden'); syncSceneTools(); return; }
  const f = itemFactor(it);
  const c = itemCenter(it);
  const half = 36 * f + 1.5;
  box.setAttribute('x', c.x - half);
  box.setAttribute('y', c.y - half);
  box.setAttribute('width', half * 2);
  box.setAttribute('height', half * 2);
  box.setAttribute('visibility', 'visible');
  syncSceneTools();
}

function syncSceneTools() {
  const bar = document.getElementById('scene-tools');
  if (bar) bar.hidden = sceneSel < 0;
}

function renderSceneTray() {
  const tray = document.getElementById('scene-tray');
  if (!tray) return;
  tray.innerHTML = '';
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

function placeSceneItem(mi) {
  if (!pack[mi]) return;
  if (scene.items.length >= SCENE_MAX) {
    showToast('\u{1F3DE}\u{FE0F} The scene is full!');
    return;
  }
  // drop near the middle with a little scatter so repeated taps don't stack
  const jx = Math.round((Math.random() - 0.5) * 240);
  const jy = Math.round((Math.random() - 0.5) * 240);
  scene.items.push({ m: mi, x: 500 + jx, y: 560 + jy, s: 0 });
  sceneSel = scene.items.length - 1;
  renderSceneItems();
  renderSceneTray();
  sceneChanged();
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
  const copy = { m: it.m, x: Math.min(1000, it.x + 70), y: Math.min(1000, it.y + 70), s: it.s };
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
    if (!pack[it.m]) continue;
    const c = itemCenter(it);
    const half = 36 * itemFactor(it);
    if (Math.abs(p.x - c.x) <= half && Math.abs(p.y - c.y) <= half) return i;
  }
  return -1;
}

function initSceneDrag() {
  const svg = document.getElementById('scene-svg');
  svg.addEventListener('pointerdown', e => {
    const p = sceneToSvg(e);
    if (!p) return;
    const i = sceneHit(p);
    if (i < 0) { sceneSel = -1; renderSceneSel(); return; }
    selectSceneItem(i);
    const it = scene.items[sceneSel];
    const c = itemCenter(it);
    sceneDrag = { dx: c.x - p.x, dy: c.y - p.y, moved: false };
    if (svg.setPointerCapture) try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  });
  svg.addEventListener('pointermove', e => {
    if (!sceneDrag || sceneSel < 0) return;
    const p = sceneToSvg(e);
    if (!p) return;
    const it = scene.items[sceneSel];
    it.x = Math.round(Math.max(0, Math.min(1, (p.x + sceneDrag.dx) / sceneDims.w)) * 1000);
    it.y = Math.round(Math.max(0, Math.min(1, (p.y + sceneDrag.dy) / sceneDims.h)) * 1000);
    sceneDrag.moved = true;
    renderSceneItems();
    e.preventDefault();
  });
  const up = () => {
    if (sceneDrag && sceneDrag.moved) sceneChanged();
    sceneDrag = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
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
  const linkOpt = document.getElementById('opt-link');
  const withLink = !!(linkOpt && linkOpt.checked);
  if (canShareFiles(file)) {
    const data = { files: [file] };
    if (withLink) data.text = location.href;
    try { await navigator.share(data); } catch (e) { /* cancelled */ }
  } else {
    downloadBlob(blob, 'emojicle-scene.png');
    if (withLink) {
      try { await navigator.clipboard.writeText(location.href); } catch (e) {}
    }
    showToast(withLink ? 'Scene saved · link copied' : 'Scene saved');
  }
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
  const el = document.getElementById('scene');
  if (!el) return;

  buildSceneBgPicker();
  initSceneDrag();

  document.getElementById('btn-scene').addEventListener('click', () => {
    pulse('btn-scene');
    openScene();
  });
  document.getElementById('scene-close').addEventListener('click', closeScene);
  document.getElementById('scene-share').addEventListener('click', shareScene);
  document.getElementById('sc-bigger').addEventListener('click', () => resizeSceneItem(1));
  document.getElementById('sc-smaller').addEventListener('click', () => resizeSceneItem(-1));
  document.getElementById('sc-dup').addEventListener('click', duplicateSceneItem);
  document.getElementById('sc-del').addEventListener('click', removeSceneItem);

  window.addEventListener('resize', () => {
    if (el.classList.contains('show')) renderScene();
  });

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
