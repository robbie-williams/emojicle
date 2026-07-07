'use strict';

/*
 * Unit tests for the share-link codec in app.js (encodeState / decodeState).
 * app.js is a browser script, so it's evaluated in a vm context with a stub
 * document; everything under test is pure data-in/data-out. Run:
 *   npm test   (node --test tests/)
 * parts-data.js must exist — run `node tools/build-parts.js` first.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Minimal browser shims: app.js's only top-level DOM touch is registering
// event listeners; everything else happens inside init() which never runs.
const context = vm.createContext({
  document: { addEventListener() {}, getElementById: () => null },
  window: {},
  console,
});

vm.runInContext(read('parts-data.js'), context, { filename: 'parts-data.js' });
vm.runInContext(read('app.js'), context, { filename: 'app.js' });

// Top-level let/const in a vm script live in the context's global lexical
// scope, not on globalThis — grab what the tests need with one eval.
const api = vm.runInContext(
  '({ encodeState, decodeState, state, offsets, LAYERS, MOVABLE, ID_ALIASES,' +
  '   DEFAULT_IDS, PARTS, ID_INDEX, setZOrder: z => { zOrder = z; },' +
  '   getZOrder: () => zOrder })',
  context
);
const { encodeState, decodeState, LAYERS, MOVABLE, PARTS, ID_INDEX } = api;

// Objects built inside the vm have that realm's prototypes, which
// deepStrictEqual rejects — normalise through JSON before comparing.
const eq = (actual, expected, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), msg);

// Put the builder globals into a known state before each encode test
function reset() {
  LAYERS.forEach(l => { api.state[l] = 0; });
  MOVABLE.forEach(l => { api.offsets[l] = { x: 0, y: 0 }; });
  api.setZOrder(LAYERS.slice());
}

test('encode → decode round-trips parts, offsets and defaults', () => {
  reset();
  api.state.face = 1;
  api.state.eyes = 2;
  api.state.mouth = 3;
  api.offsets.eyes = { x: 3, y: -4 };

  const enc = encodeState();
  const d = decodeState(enc);

  eq(d.state, api.state);
  eq(d.offsets.eyes, { x: 3, y: -4 });
  eq(d.offsets.mouth, { x: 0, y: 0 });
  eq(d.zOrder, LAYERS);
});

test('default stacking omits the ~z segment and trims trailing dots', () => {
  reset();
  const enc = encodeState();
  assert.ok(!enc.includes('~z'), 'no ~z segment for default order');
  assert.ok(!enc.endsWith('.'), 'trailing empty segments are trimmed');
});

test('restacked layers ride along as ~z and round-trip', () => {
  reset();
  const z = LAYERS.slice();
  z.push(z.shift());          // move the face to the top of the stack
  api.setZOrder(z);

  const enc = encodeState();
  assert.ok(enc.includes('.~z'), 'restack encoded as a ~z segment');
  eq(decodeState(enc).zOrder, z);
});

test('a corrupt ~z segment is ignored, default order stands', () => {
  const d = decodeState('yellow.....~z012');   // not a full permutation
  eq(d.zOrder, LAYERS);
});

test('legacy retired ids resolve to their surviving twin', () => {
  for (const [layer, aliases] of Object.entries(api.ID_ALIASES)) {
    for (const [retired, twin] of Object.entries(aliases)) {
      assert.strictEqual(ID_INDEX[layer][retired], undefined,
        `${layer}/${retired} should no longer exist in the pack`);
      const li = LAYERS.indexOf(layer);
      const enc = LAYERS.map((_, i) => (i === li ? retired : '')).join('.');
      assert.strictEqual(decodeState(enc).state[layer], ID_INDEX[layer][twin],
        `${layer}/${retired} → ${twin}`);
    }
  }
});

test('unknown ids fall back to None (optional) or a neutral part (mandatory)', () => {
  const d = decodeState('nope-1.nope-2.nope-3.nope-4.nope-5.nope-6');
  assert.strictEqual(d.state.eyebrows, 0, 'optional layer → None');
  assert.strictEqual(d.state.extras, 0, 'optional layer → None');
  assert.strictEqual(PARTS.face[d.state.face].id, api.DEFAULT_IDS.face);
  assert.strictEqual(PARTS.eyes[d.state.eyes].id, api.DEFAULT_IDS.eyes);
  assert.strictEqual(PARTS.mouth[d.state.mouth].id, api.DEFAULT_IDS.mouth);
});

test('empty and short strings decode to a sane default emoji', () => {
  const d = decodeState('');
  LAYERS.forEach(l => assert.strictEqual(d.state[l], 0));
  MOVABLE.forEach(l => eq(d.offsets[l], { x: 0, y: 0 }));
});
