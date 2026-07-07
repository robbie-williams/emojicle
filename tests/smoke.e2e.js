'use strict';

/*
 * End-to-end smoke test: serves the repo, boots the app in headless Chromium,
 * then walks the front door of every feature — Random + share-link round-trip,
 * and each of the four minigames via the Games picker (asserting each game's
 * __test hook reports a live state). Run:  npm run test:e2e
 * Needs the playwright devDependency (npm install) and its Chromium binary
 * (npx playwright install chromium).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let failed = false;
function check(cond, label) {
  console.log((cond ? '  ok    ' : '  FAIL  ') + label);
  if (!cond) failed = true;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  page.on('pageerror', e => { console.log('  FAIL  page error: ' + e.message); failed = true; });

  console.log('boot');
  await page.goto(base);
  await page.waitForSelector('#layer-face *');           // parts rendered
  check(true, 'app booted and drew an emoji');

  console.log('random + share-link round-trip');
  await page.click('#btn-random');
  const enc = await page.evaluate('encodeState()');
  check(typeof enc === 'string' && enc.length > 0, 'randomise produced an encoding');
  await page.goto(base + '?e=' + encodeURIComponent(enc));
  await page.waitForSelector('#layer-face *');
  const enc2 = await page.evaluate('encodeState()');
  check(enc2 === enc, `?e= link rebuilds the same emoji (${enc})`);

  console.log('games picker → all four games');
  const games = [
    { name: 'clinic', hook: '__clinic' },
    { name: 'safari', hook: '__safari' },
    { name: 'runner', hook: '__runner' },
    { name: 'jam',    hook: '__jam' },
  ];
  for (const g of games) {
    await page.click('#btn-play');
    await page.waitForSelector('#minigame-picker.show');
    const options = await page.$$('#minigame-grid .dance-option');
    check(options.length === games.length, `picker lists ${games.length} games`);
    await options[games.indexOf(g)].click();
    await page.waitForTimeout(250);                      // open animation / first tick
    const state = await page.evaluate(`window.${g.hook} && window.${g.hook}.state()`);
    check(!!state, `${g.name} opened with a live state: ${JSON.stringify(state)}`);
    await page.keyboard.press('Escape');                 // close the game...
    await page.waitForSelector('#minigame-picker.show', { state: 'detached' }).catch(() => {});
    await page.waitForTimeout(150);
    const after = await page.evaluate(`window.${g.hook}.state()`);
    check(!after, `${g.name} closed again via Escape`);
  }

  await browser.close();
  server.close();
  console.log(failed ? 'SMOKE FAILED' : 'SMOKE PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
