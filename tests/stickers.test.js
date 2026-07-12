'use strict';

/*
 * Tests for the whole-emoji sticker pack (issue #11): STICKERS exists as a
 * standalone list in parts-data.js, and app.js mirrors every sticker into the
 * builder's Extras with a stable id so share links can reference them.
 * Same vm-context harness as encode.test.js.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const context = vm.createContext({
  document: { addEventListener() {}, getElementById: () => null },
  window: {},
  console,
});

vm.runInContext(read('parts-data.js'), context, { filename: 'parts-data.js' });
vm.runInContext(read('app.js'), context, { filename: 'app.js' });

const api = vm.runInContext(
  '({ STICKERS, PARTS, ID_INDEX, CLASSIC_EXTRAS, LAYERS, MOVABLE, state, offsets,' +
  '   encodeState, decodeState, setZOrder: z => { zOrder = z; } })',
  context
);

test('STICKERS is a meaningful, well-formed set', () => {
  assert.ok(Array.isArray(api.STICKERS) && api.STICKERS.length >= 60,
    `expected a meaningful sticker set, got ${api.STICKERS.length}`);
  for (const s of api.STICKERS) {
    assert.ok(s.id && typeof s.id === 'string', 'sticker has an id');
    assert.ok(s.name && s.name !== s.id.toLowerCase(), `sticker ${s.id} has a human name`);
    assert.ok(s.svg && s.svg.includes('<'), `sticker ${s.id} has inline svg`);
  }
});

test('sticker ids are unique and collision-free against extras', () => {
  const ids = api.STICKERS.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'sticker ids unique');
  // PARTS.extras = None + classic extras + appended stickers; every id must
  // still be unique or share links become ambiguous
  const extraIds = api.PARTS.extras.map(p => p.id).filter(Boolean);
  assert.strictEqual(new Set(extraIds).size, extraIds.length, 'extras ids unique');
});

test('every sticker is reachable in the builder as an Extras part', () => {
  for (const s of api.STICKERS) {
    const idx = api.ID_INDEX.extras[s.id];
    assert.notStrictEqual(idx, undefined, `sticker ${s.id} indexed in extras`);
    const part = api.PARTS.extras[idx];
    assert.ok(part.svg.includes(s.svg), `extras ${s.id} wraps the sticker art`);
  }
});

test('sticker extras round-trip through the share codec', () => {
  api.LAYERS.forEach(l => { api.state[l] = 0; });
  api.MOVABLE.forEach(l => { api.offsets[l] = { x: 0, y: 0 }; });
  api.setZOrder(api.LAYERS.slice());

  const pizza = api.ID_INDEX.extras['1F355'];
  assert.notStrictEqual(pizza, undefined, 'pizza sticker exists');
  api.state.extras = pizza;
  api.offsets.extras = { x: 5, y: -7 };

  const d = api.decodeState(api.encodeState());
  assert.strictEqual(d.state.extras, pizza);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.offsets.extras)), { x: 5, y: -7 });
});

test('CLASSIC_EXTRAS caps Random below the sticker range', () => {
  assert.strictEqual(api.PARTS.extras.length, api.CLASSIC_EXTRAS + api.STICKERS.length);
  // the classic range still contains the None option at the front
  assert.strictEqual(api.PARTS.extras[0].id, '');
});
