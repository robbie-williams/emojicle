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
- **Random** — roll a whole new emoji in one tap.
- **Drag to move** — tap a part on the canvas to select it, press-and-drag to
  move it anywhere (the face stays put as the anchor).
- **Dance** — grows a pair of arms and busts a move, each with its own little
  soundbite (synthesized in the browser — no audio files). Random by default;
  untick "Random dance" to pick the move yourself.
- **Send** — shares a transparent PNG through the native share sheet (or
  downloads it on desktop). Tick "Share with link" to include a link that
  rebuilds the exact emoji.
- **Stateless share links** — the whole emoji is encoded in the `?e=` query
  param; no backend, no storage.
- **Installable PWA** — cache-first service worker; fully usable offline.

## How it's built

Pure static HTML/CSS/JS — no framework, no build step at runtime, no CDN
dependencies (Bulma is vendored at `vendor/bulma.min.css`). The art is the
[OpenMoji](https://openmoji.org) face-component pack (SVG, viewBox `0 0 72 72`),
compiled by `tools/build-parts.js` into the generated `parts-data.js` so the
app makes zero per-part fetches.

```
index.html        app shell
app.js            all behaviour (rendering, picker, drag, dance, share)
style.css         flat-modern theme on top of Bulma
parts-data.js     GENERATED — the whole art pack, inline (npm run build)
sw.js             cache-first service worker (cache name stamped by the build)
tools/build-parts.js   compiles face-components/svg/ → parts-data.js
face-components/  OpenMoji SVG pack (scanned — see "Adding art")
```

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

### Adding art

Drop a file named `<token>_<type>.svg` into `face-components/svg/` (`type` is
one of face/eyes/brows/nose/mouth/extras/ears/arms; `token` is usually the
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
