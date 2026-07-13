'use strict';

/*
 * Tests for the scene designer (issue #13): the ?s= scene codec, the
 * background library, and the pack-index coupling. Same vm harness as the
 * other suites; scene.js is evaluated after app.js like in the page.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const eq = (actual, expected, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), msg);

const store = new Map();
const context = vm.createContext({
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  window: { addEventListener() {} },
  console,
  URL,
  URLSearchParams,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  location: { href: 'https://emojicle.test/', search: '' },
  history: { replaceState(_s, _t, url) { context.location.href = String(url); } },
});

vm.runInContext(read('parts-data.js'), context, { filename: 'parts-data.js' });
vm.runInContext(read('app.js'), context, { filename: 'app.js' });
vm.runInContext(read('scene.js'), context, { filename: 'scene.js' });

const api = vm.runInContext(
  '({ encodeScene, decodeScene, SCENE_BGS, SCENE_MAX, SCENE_S_MIN, SCENE_S_MAX,' +
  '   sceneValidItems, encodeState,' +
  '   setPack: (m, a) => { pack = m; packActive = a; },' +
  '   setScene: s => { scene = s; },' +
  '   getScene: () => scene })',
  context
);

test('scene codec round-trips background and items', () => {
  const sc = {
    bg: 'space',
    items: [
      { m: 0, x: 250, y: 700, s: 0 },
      { m: 3, x: 1000, y: 0, s: -2 },
      { m: 6, x: 42, y: 999, s: 3 },
    ],
  };
  eq(api.decodeScene(api.encodeScene(sc)), sc);
});

test('scene codec is URL-safe end to end', () => {
  const sc = { bg: 'meadow', items: [{ m: 1, x: 10, y: 20, s: -1 }] };
  const u = new URL('https://emojicle.test/');
  u.searchParams.set('s', api.encodeScene(sc));
  assert.ok(!u.search.includes('%'), 'no percent-escapes in the scene param: ' + u.search);
  eq(api.decodeScene(new URL(u).searchParams.get('s')), sc);
});

test('junk decodes to a safe default scene', () => {
  const def = api.SCENE_BGS[0].id;
  eq(api.decodeScene(''), { bg: def, items: [] });
  eq(api.decodeScene(null), { bg: def, items: [] });
  eq(api.decodeScene('nonsense*not_an_item*1_2'), { bg: def, items: [] });
});

test('items are clamped and capped on decode', () => {
  const raw = 'beach' + Array.from({ length: 20 }, () => '*0_5000_-50_99').join('');
  const d = api.decodeScene(raw);
  assert.strictEqual(d.items.length, api.SCENE_MAX, 'capped at SCENE_MAX');
  for (const it of d.items) {
    assert.ok(it.x >= 0 && it.x <= 1000 && it.y >= 0 && it.y <= 1000, 'position clamped');
    assert.ok(it.s >= api.SCENE_S_MIN && it.s <= api.SCENE_S_MAX, 'size step clamped');
  }
});

test('an unknown background falls back to the default', () => {
  assert.strictEqual(api.decodeScene('lava*0_1_2_0').bg, api.SCENE_BGS[0].id);
});

test('items referencing missing pack members are shed', () => {
  api.setPack([api.encodeState(), api.encodeState()], -1);   // 2 members
  api.setScene({ bg: 'meadow', items: [{ m: 0, x: 1, y: 1, s: 0 }, { m: 5, x: 1, y: 1, s: 0 }] });
  const valid = api.sceneValidItems();
  assert.strictEqual(valid.length, 1);
  assert.strictEqual(valid[0].m, 0);
});

test('sticker items round-trip through the codec (#19)', () => {
  const stickerId = vm.runInContext('STICKERS[0].id', context);
  const sc = {
    bg: 'space',
    items: [
      { m: 2, x: 100, y: 200, s: 1 },
      { st: stickerId, x: 700, y: 300, s: -1 },
    ],
  };
  eq(api.decodeScene(api.encodeScene(sc)), sc);
  // URL-safe too
  const u = new URL('https://emojicle.test/');
  u.searchParams.set('s', api.encodeScene(sc));
  assert.ok(!u.search.includes('%'), 'no percent-escapes: ' + u.search);
});

test('rotation and flips ride as trailing fields, defaults trimmed (#36)', () => {
  const sc = {
    bg: 'space',
    items: [
      { m: 0, x: 1, y: 2, s: 0, r: 45 },              // rotated only
      { m: 1, x: 3, y: 4, s: 0, f: 3 },               // flipped both ways
      { m: 2, x: 5, y: 6, s: 0, o: 50, r: 270, f: 1 },// the works
      { m: 3, x: 7, y: 8, s: 0 },                     // untouched → 4-field
    ],
  };
  const enc = api.encodeScene(sc);
  assert.ok(enc.includes('*0_1_2_0_100_45'), 'rotation with opacity placeholder: ' + enc);
  assert.ok(enc.includes('*1_3_4_0_100_0_3'), 'flip with placeholders: ' + enc);
  assert.ok(enc.includes('*2_5_6_0_50_270_1'), 'all three fields: ' + enc);
  assert.ok(enc.includes('*3_7_8_0*') || enc.endsWith('*3_7_8_0'),
            'untouched item stays 4-field: ' + enc);
  eq(api.decodeScene(enc), sc);
  // r wraps mod 360 and 0 is "no field"; f wraps mod 4
  assert.strictEqual(api.decodeScene('space*0_1_2_0_100_405').items[0].r, 45);
  assert.strictEqual(api.decodeScene('space*0_1_2_0_100_360').items[0].r, undefined);
  assert.strictEqual(api.decodeScene('space*0_1_2_0_100_0_4').items[0].f, undefined);
});

test('the size range doubled outward (#36)', () => {
  assert.ok(api.SCENE_S_MAX >= 6 && api.SCENE_S_MIN <= -5,
    `range is ${api.SCENE_S_MIN}..${api.SCENE_S_MAX}`);
});

test('opacity rides as a 5th field only when see-through (#30)', () => {
  const sc = {
    bg: 'space',
    items: [
      { m: 0, x: 100, y: 200, s: 0, o: 50 },   // see-through → 5-field
      { m: 1, x: 300, y: 400, s: 1 },          // opaque → legacy 4-field
    ],
  };
  const enc = api.encodeScene(sc);
  assert.ok(enc.includes('*0_100_200_0_50'), 'opacity encoded: ' + enc);
  assert.ok(enc.includes('*1_300_400_1') && !enc.includes('*1_300_400_1_'),
            'opaque item stays 4-field: ' + enc);
  eq(api.decodeScene(enc), sc);
  // o is clamped, and _100 decodes as plain opaque
  assert.strictEqual(api.decodeScene('space*0_1_2_0_3').items[0].o, 10);
  assert.strictEqual(api.decodeScene('space*0_1_2_0_100').items[0].o, undefined);
});

test('unknown sticker ids are skipped on decode; old apps skip sticker segments', () => {
  const d = api.decodeScene('meadow*sNOPE_1_2_0*3_4_5_0');
  eq(d.items, [{ m: 3, x: 4, y: 5, s: 0 }]);
  // the old decoder treated every segment as ints — "s…" parses to NaN and is
  // dropped, which is exactly what decodeScene does with junk today
  eq(api.decodeScene('meadow*not_an_item_0_0').items, []);
});

test('sticker items survive sceneValidItems; pack items still shed (#19)', () => {
  const stickerId = vm.runInContext('STICKERS[0].id', context);
  api.setPack([api.encodeState()], -1);
  api.setScene({ bg: 'meadow', items: [
    { st: stickerId, x: 1, y: 1, s: 0 },
    { m: 5, x: 1, y: 1, s: 0 },
  ] });
  const valid = api.sceneValidItems();
  assert.strictEqual(valid.length, 1);
  assert.strictEqual(valid[0].st, stickerId);
});

test('the kid-friendly doodle background is the library default (#14)', () => {
  assert.strictEqual(api.SCENE_BGS[0].id, 'doodles');
  // and the app-backdrop tile built from the same motifs is clean SVG
  const tile = vm.runInContext('doodleTile(0.5)', context);
  assert.ok(tile.startsWith('<svg') && tile.includes('opacity="0.5"'));
  assert.ok(!tile.includes('NaN') && !tile.includes('undefined'));
  const doodles = vm.runInContext('DOODLES.length', context);
  assert.ok(doodles >= 8, 'a real variety of motifs');
});

test('the background library is well-formed at any aspect', () => {
  assert.ok(api.SCENE_BGS.length >= 5, 'a real library, not a token');
  const ids = api.SCENE_BGS.map(b => b.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'unique ids');
  for (const bg of api.SCENE_BGS) {
    assert.ok(bg.name, bg.id + ' has a name');
    for (const [w, h] of [[46, 100], [200, 100], [56, 36]]) {
      const svg = vm.runInContext(
        `SCENE_BG_IDS[${JSON.stringify(bg.id)}].draw(${w}, ${h})`, context);
      assert.ok(svg.includes('<rect') || svg.includes('<circle'), bg.id + ' draws shapes');
      assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), bg.id + ' has clean numbers');
      assert.ok(!/https?:/.test(svg), bg.id + ' is self-contained (no external refs)');
    }
  }
});
