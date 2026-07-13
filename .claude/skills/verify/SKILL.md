---
name: verify
description: Build/launch/drive recipe for verifying Emojicle changes in a real browser
---

# Verifying Emojicle

Pure static app — no build step (`npm run build` only regenerates parts-data.js
from face-components/, needed only when the art pack changes).

## Launch

```bash
python3 -m http.server 8642    # from the repo root, in the background
```

## Drive (Playwright)

Chromium is already cached in `~/.cache/ms-playwright` on this box; `npm install
playwright` in a scratch dir is enough (no `playwright install` download needed).
Use a phone viewport (390×844) — the app is mobile-first.

Useful handles:

- Load a deterministic emoji via the share param: `/?e=yellow.1F47F.1F600..1F602.`
- Dance state: `#dance-group` gains classes `dancing dance-<move>` for 5s; the
  `dancing` flag blocks re-entry, so wait ~5.2s between dances.
- Sound: no audio files — Web Audio oscillators. To observe, wrap
  `window.AudioContext` in `page.addInitScript` and count `createOscillator()`
  / `start()` calls (tango schedules 17 notes).
- Modals: `#picker` (parts) and `#dance-picker` (dances) both use
  `.show` + `aria-hidden`; Esc and backdrop click close them.
- Long-press: tap Dance opens `#dance-picker`, holding it ~500ms dances; tap
  Send shares plain (shows `#action-hint`), holding adds the magic link.

## Worth probing

- Button spam mid-dance (must not stack animations/sounds).
- 320px viewport: `document.documentElement.scrollWidth > clientWidth` catches
  the action-row bleed this app has regressed on before.
- Landscape ≥640px media query rearranges the layout — screenshot 740×360.
