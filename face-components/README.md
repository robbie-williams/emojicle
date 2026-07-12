# Emojicle art pack

The [OpenMoji](https://openmoji.org) art that powers Emojicle, in three kinds:

1. **Face parts** — semantic part decomposition of the OpenMoji face emojis
   (the `face-*` subgroups of `smileys-emotion`) into reusable, stackable SVG
   pieces: `face · eyes · mouth · nose · brows · arms · extras`.
2. **Stickers** (`<hex>_sticker.svg`) — curated whole, self-contained emojis
   (food, fruit, animals, nature, objects) kept intact. They're emitted as
   the standalone `STICKERS` list in `parts-data.js` for the emoji-pack /
   background features, and mirrored into the builder's Extras scaled-down
   by `app.js`.
3. **Wearables** (`<hex>-<slug>_extras.svg`) — whole accessory emojis (top
   hat, crown, cap, glasses, headphones, …) with a baked `translate+scale`
   that fits them onto the builder face (circle cx36 cy36 r23), joining the
   ordinary Extras list.

## Layout

```
face-components/
├── components.json        # the lookup / tracking file (name, id, type, …)
├── svg/                   # one SVG per component, e.g. 1F920_extras.svg
└── review/                # rendered sheets for eyeballing the heuristic
    ├── decomposition-preview.png   # all 119, tinted by type
    └── sample-components.png       # a few emojis split into parts
```

## `components.json`

Top-level metadata plus a `components` array. Each entry:

| field | meaning |
|---|---|
| `id` | unique identifier, `<token>_<type>` (e.g. `1F920_extras`, `1F355_sticker`) |
| `name` | human label, `"<emoji name> — <type>"` |
| `type` | face part type, `sticker`, or `extras` for wearables |
| `hexcode` | source emoji's Unicode hexcode (matches the OpenMoji filename) |
| `source_emoji` | display name — the OpenMoji annotation (or a kid-friendlier override, e.g. "sun hat" for *woman's hat*) |
| `emoji` | the parent emoji character |
| `subgroup` | OpenMoji subgroup (e.g. `face-glasses`, `food-fruit`) |
| `file` | path to the component SVG, relative to this folder |

The manifest keeps entries for components that later curation passes removed
from `svg/` — the build only scans `svg/` and uses the manifest for display
names, so stale entries are harmless. `svg/` is the source of truth for what
ships; `npm run build` prints the live per-type counts.

## SVG details

Every component keeps the **original `0 0 72 72` viewBox** and its element's
original coordinates, so parts from the same — or different — emojis stack
directly on top of each other in alignment. Original group wrappers
(`color`, `line`, …) and their `fill` / `stroke` / `transform` attributes are
preserved, so each piece renders identically to how it looked in the full face.
Wearables add one outer `<g transform="translate(…) scale(…)">` around the
untouched glyph to place it on the face.

## ⚠️ Face parts are heuristic, not authoritative

OpenMoji SVGs only carry *render* layers (`color`, `line`, `skin`, …), **not**
semantic part labels. The eyes/mouth/nose/etc. classification here is **derived
by geometry** (position, size, symmetry, fill, per-emoji context such as
"does this face wear glasses"). It is a solid first pass but **will contain
mistakes** — review `review/decomposition-preview.png` and correct `type`
values in `components.json` (and rename the matching file in `svg/`) as needed.

Known soft spots: squeezed-shut eyes can fold into `brows`; non-standard bases
(skull, alien, exploding head) land their head shape in `extras`; a face wearing
eyewear intentionally has **no** `eyes` component when the eyes are hidden.

Stickers and wearables are whole glyphs — nothing heuristic about them beyond
the hand-tuned wearable fit.

## Regenerating / extending

The face-part pipeline lives outside the repo (geometry via Playwright
`getBBox`, then a heuristic classifier). Source of truth for names is
OpenMoji's `data/openmoji.json`; the face set is every entry whose `subgroup`
starts with `face-`.

Stickers (added 2026-07, pinned to OpenMoji **15.1.0**) are curated by hand —
kid-friendly, visually clean, no flags/scenes — copied verbatim from
`color/svg/<hex>.svg` to `svg/<hex>_sticker.svg`. Wearable transforms were
computed by measuring each glyph's bbox (Playwright `getBBox`) and mapping its
width and anchor point (hat bottoms to the forehead, eyewear centres to eye
height) onto the face circle. To add more of either: drop the file in `svg/`,
add a `components.json` entry for the display name, and `npm run build`.

Licence: OpenMoji — CC BY-SA 4.0 (https://openmoji.org). Keep the credit.
