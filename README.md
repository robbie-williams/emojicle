# Emojicle

Make your own emoji face! Mix and match faces, eyes, brows, noses, mouths and
extras, drag them anywhere, make it dance, then share it. Built for kids —
free, no ads, no accounts, works offline.

| Environment | URL | Deploys from |
|---|---|---|
| **Production** | https://robbie-williams.github.io/emojicle/ | `main` |
| **Staging** | https://robbie-williams.github.io/emojicle/staging/ | `staging` |

## Features

- **Tap pickers** — tap a part's name to browse every option in a grid.
- **Stickers & wearables** — beyond face parts, the Extras picker carries
  whole-emoji stickers (pizza, fruit, animals, stars…) that drop onto the
  canvas as small draggable pieces, plus wearable accessories (top hat,
  crown, cap, glasses, headphones…) pre-fitted to the face.
- **Random** — roll a whole new emoji in one tap.
- **Drag to move** — tap a part on the canvas to select it, press-and-drag to
  move it anywhere (the face stays put as the anchor).
- **Dance** — grows a pair of arms and busts one of six moves (tango, bounce,
  wiggle, spin, moonwalk, disco), each with its own little soundbite
  (synthesized in the browser — no audio files). Random by default; untick
  "Random dance" to pick the move yourself.
- **Games** — four minigames starring your emoji, launched from one picker
  that shows a 🏆 badge for your best run in each:
  - **Emoji Clinic** — Trauma Center-style: treat cases (scrapes, splinters,
    germs, fever, a sore tooth, paint, the chills…) with the right tools
    against the clock, through 12 levels to a diploma.
  - **Water Safari** — squirt drifting animals before time runs out; streaks
    score double, big animals take two squirts.
  - **Rescue Runner** — swap bodies to beat obstacles on the way to a
    stranded civilian, 10 levels to a medal.
  - **Jam Session** — a free-play piano/drums/xylophone stage with a
    recorder; learn songs in challenge mode, or share a recording as a
    `?j=` link.
  - Every game has a **relax mode** checkbox (no timers) and full keyboard
    controls.
- **Emoji packs** — build a little cast of up to 7 emojis that lives around
  the canvas (thumbnails flanking it on wide screens, a row beneath on
  phones). Tap a thumbnail to switch which one you're editing, + to add the
  current emoji, ✕ to remove one. A whole pack shares as a `?p=` link —
  still no backend — and comes back on the next visit.
- **Gallery** — save the current emoji on-device (🖼 in the header) and
  reload or delete saves later; nothing leaves the browser.
- **Mute** — a header toggle silences every game and dance sound at the
  audio bus (remembered across visits).
- **Dark mode** — follows the system preference, with a moon/sun toggle in
  the header to override (remembered across visits).
- **Send** — shares a transparent PNG through the native share sheet (or
  downloads it on desktop). Tick "Share with link" to include a link that
  rebuilds the exact emoji.
- **Stateless share links** — the whole emoji is encoded in the `?e=` query
  param (a pack is those encodings joined in `?p=`); no backend, no storage.
- **Installable PWA** — cache-first service worker; fully usable offline.

## How it's built

Pure static HTML/CSS/JS — no framework, no CSS library, no build step at
runtime, no CDN dependencies. The art is [OpenMoji](https://openmoji.org)
(SVG, viewBox `0 0 72 72`): a face-component pack decomposed into stackable
parts, plus whole-emoji stickers and fitted wearables — all compiled by
`tools/build-parts.js` into the generated `parts-data.js` (the `PARTS` layers
and the `STICKERS` list) so the app makes zero per-part fetches.

```
index.html        app shell
app.js            builder behaviour (rendering, picker, drag, dance, share,
                  gallery, overlay stack, audio bus)
games-common.js   GameKit — helpers shared by every minigame (SFX, particles,
                  emoji snapshots, best-score storage, reduced-motion)
games.js          minigame registry + the Games picker
minigames.js      Emoji Clinic (cases, tools, step engine)
safari.js         Water Safari
runner.js         Rescue Runner
jam.js            Jam Session (instruments, recorder, songs, ?j= links)
style.css         flat-modern theme (self-contained, incl. its own mini reset)
parts-data.js     GENERATED — the whole art pack, inline (npm run build)
sw.js             cache-first service worker (cache name stamped by the build)
tools/build-parts.js   compiles face-components/svg/ → parts-data.js
face-components/  OpenMoji SVG pack (scanned — see "Adding art")
tests/            unit tests for the share codec + a Playwright smoke test
```

New minigames register themselves in `window.MINIGAMES` at script-eval time
(`{ name, emoji, start, best? }`) and appear in the Games picker automatically.

## Development

Work happens on the **`staging`** branch; `main` is what production serves.

1. Branch from / commit to `staging` and push — GitHub Actions deploys it to
   the [staging URL](https://robbie-williams.github.io/emojicle/staging/)
   within a minute or two.
2. Check it on staging (it's a real Pages deploy — installable PWA, share
   sheet, the lot).
3. Merge `staging` → `main` to release to production.

Every deploy publishes both environments from one Pages artifact: `main` at
the site root and `staging` under `/staging/` (see
`.github/workflows/deploy.yml`).

### Run locally

No install needed — serve the repo root and open it:

```sh
python3 -m http.server 8000
# http://localhost:8000/
```

### Tests

```sh
npm test                            # share-codec unit tests (no dependencies)
npm install && npx playwright install chromium
npm run test:e2e                    # browser smoke test (boot, share links, all 4 games)
```

CI runs the unit tests on every deploy; a failing test blocks the deploy.

### Adding art

Drop a file named `<token>_<type>.svg` into `face-components/svg/` (`type` is
one of face/eyes/brows/nose/mouth/extras/sticker; `token` is usually the
OpenMoji hexcode, optionally suffixed like `1F4A9-hat`) and run:

```sh
npm run build
```

The build scans the directory — no manifest edits needed — and also re-stamps
the service-worker cache name so returning users pick up the change. CI runs
the same build on deploy, so `parts-data.js` never needs committing by hand.

## Credits & licence

Emoji art by [OpenMoji](https://openmoji.org) — the free and open emoji
project — licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
