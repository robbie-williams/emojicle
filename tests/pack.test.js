'use strict';

/*
 * Tests for emoji packs (issue #12): the ?p= multi-emoji codec and the
 * add / remove / switch behaviour around the canvas. Same vm-context harness
 * as encode.test.js, plus localStorage / location / history stubs so the
 * persistence and URL plumbing run for real.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// vm-realm objects have foreign prototypes — normalise through JSON to compare
const eq = (actual, expected, msg) =>
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), msg);

const store = new Map();
const context = vm.createContext({
  document: { addEventListener() {}, getElementById: () => null },
  window: {},
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

const api = vm.runInContext(
  '({ packToParam, packFromParam, addCurrentToPack, removePackMember,' +
  '   selectPackMember, detachFromPack, persistPack, loadStoredPack,' +
  '   encodeState, decodeState, state, offsets, LAYERS, MOVABLE, PARTS, STICKERS,' +
  '   getPack: () => pack, getActive: () => packActive,' +
  '   setPack: (m, a) => { pack = m; packActive = a; },' +
  '   setZOrder: z => { zOrder = z; } })',
  context
);

function reset() {
  api.LAYERS.forEach(l => { api.state[l] = 0; });
  api.MOVABLE.forEach(l => { api.offsets[l] = { x: 0, y: 0 }; });
  api.setZOrder(api.LAYERS.slice());
  api.setPack([], -1);
  store.clear();
}

test("the '*' pack separator cannot appear inside any member encoding", () => {
  const ids = [];
  for (const layer of Object.keys(api.PARTS)) {
    api.PARTS[layer].forEach(p => { if (p.id) ids.push(p.id); });
  }
  api.STICKERS.forEach(s => ids.push(s.id));
  for (const id of ids) assert.ok(!id.includes('*'), `id ${id} contains '*'`);
});

test('pack param round-trips members, including offsets and restacking', () => {
  reset();
  api.state.eyes = 3;
  api.offsets.mouth = { x: -6, y: 4 };
  const a = api.encodeState();
  const z = api.LAYERS.slice();
  z.push(z.shift());
  api.setZOrder(z);
  const b = api.encodeState();

  const param = api.packToParam([a, b]);
  const back = api.packFromParam(param);
  eq(back, [a, b]);
  // each member still decodes to what was encoded
  assert.strictEqual(api.decodeState(back[0]).state.eyes, 3);
  eq(api.decodeState(back[0]).offsets.mouth, { x: -6, y: 4 });
  eq(api.decodeState(back[1]).zOrder, z);
});

test('packFromParam ignores junk and caps at 7', () => {
  eq(api.packFromParam(''), []);
  eq(api.packFromParam(null), []);
  eq(api.packFromParam('**a**b*'), ['a', 'b']);
  const ten = Array.from({ length: 10 }, (_, i) => 'e' + i).join('*');
  assert.strictEqual(api.packFromParam(ten).length, 7);
});

test('add: current emoji joins the pack and becomes the active member', () => {
  reset();
  api.state.mouth = 2;
  api.addCurrentToPack();
  assert.strictEqual(api.getPack().length, 1);
  assert.strictEqual(api.getActive(), 0);
  assert.strictEqual(api.decodeState(api.getPack()[0]).state.mouth, 2);
});

test('the 7 cap is enforced gracefully', () => {
  reset();
  for (let i = 0; i < 9; i++) api.addCurrentToPack();
  assert.strictEqual(api.getPack().length, 7, 'stops at 7');
  assert.strictEqual(api.getActive(), 6);
});

test('switching members loads that encoding into the builder', () => {
  reset();
  api.state.mouth = 1;
  api.addCurrentToPack();
  api.state.mouth = 5;
  api.addCurrentToPack();
  assert.strictEqual(api.getActive(), 1);

  api.selectPackMember(0);
  assert.strictEqual(api.getActive(), 0);
  assert.strictEqual(api.state.mouth, 1, 'builder now shows member 0');
});

test('edits flow into the active member (and persist)', () => {
  reset();
  api.addCurrentToPack();
  api.state.eyes = 4;
  // updateUrl is the edit hook; every real mutation path calls it
  vm.runInContext('updateUrl()', context);
  assert.strictEqual(api.decodeState(api.getPack()[0]).state.eyes, 4);
  const stored = api.loadStoredPack();
  assert.strictEqual(api.decodeState(stored.members[0]).state.eyes, 4);
  assert.strictEqual(stored.active, 0);
});

test('remove shifts the active index and detaches when it was the removed one', () => {
  reset();
  for (let i = 0; i < 3; i++) api.addCurrentToPack();   // active = 2
  api.removePackMember(0);
  assert.strictEqual(api.getPack().length, 2);
  assert.strictEqual(api.getActive(), 1, 'active index follows its member');
  api.removePackMember(1);
  assert.strictEqual(api.getActive(), -1, 'removing the active member detaches');
  assert.strictEqual(api.getPack().length, 1);
});

test('the share URL carries e, p and pi together', () => {
  reset();
  api.addCurrentToPack();
  api.addCurrentToPack();
  vm.runInContext('updateUrl()', context);
  const u = new URL(context.location.href);
  assert.strictEqual(u.searchParams.get('e'), api.encodeState());
  assert.strictEqual(u.searchParams.get('p'), api.packToParam(api.getPack()));
  assert.strictEqual(u.searchParams.get('pi'), '1');
  assert.ok(!u.search.includes('%2A'), "the '*' separator survives URL-encoding");

  api.detachFromPack();
  vm.runInContext('updateUrl()', context);
  const u2 = new URL(context.location.href);
  assert.strictEqual(u2.searchParams.get('pi'), null, 'standalone canvas has no pi');
  assert.strictEqual(u2.searchParams.get('p'), api.packToParam(api.getPack()),
    'the pack still rides along');
});
