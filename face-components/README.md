# Face components

Semantic part decomposition of the **119 OpenMoji face emojis** (the `face-*`
subgroups of `smileys-emotion`) into reusable, stackable SVG pieces for the
Emojicle builder.

Each source emoji is split into up to eight part **types**:

`face · eyes · mouth · nose · brows · ears · arms · extras`

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
| `id` | unique identifier, `<hexcode>_<type>` (e.g. `1F920_extras`) |
| `name` | human label, `"<emoji name> — <type>"` |
| `type` | one of the eight types above |
| `hexcode` | source emoji's Unicode hexcode (matches the OpenMoji filename) |
| `source_emoji` | official OpenMoji annotation of the parent face |
| `emoji` | the parent emoji character |
| `subgroup` | OpenMoji subgroup (e.g. `face-glasses`) |
| `file` | path to the component SVG, relative to this folder |

Counts: **453 components across 119 emojis.**

| type | components |
|---|---|
| face | 115 |
| eyes | 113 |
| mouth | 112 |
| nose | 8 |
| brows | 44 |
| ears | 1 |
| arms | 10 |
| extras | 50 |

## SVG details

Every component keeps the **original `0 0 72 72` viewBox** and its element's
original coordinates, so parts from the same — or different — emojis stack
directly on top of each other in alignment. Original group wrappers
(`color`, `line`, …) and their `fill` / `stroke` / `transform` attributes are
preserved, so each piece renders identically to how it looked in the full face.

## ⚠️ These are heuristic, not authoritative

OpenMoji SVGs only carry *render* layers (`color`, `line`, `skin`, …), **not**
semantic part labels. The eyes/mouth/nose/etc. classification here is **derived
by geometry** (position, size, symmetry, fill, per-emoji context such as
"does this face wear glasses"). It is a solid first pass but **will contain
mistakes** — review `review/decomposition-preview.png` and correct `type`
values in `components.json` (and rename the matching file in `svg/`) as needed.

Known soft spots: squeezed-shut eyes can fold into `brows`; non-standard bases
(skull, alien, exploding head) land their head shape in `extras`; a face wearing
eyewear intentionally has **no** `eyes` component when the eyes are hidden.

## Regenerating

The pipeline lives outside the repo (geometry via Playwright `getBBox`, then a
heuristic classifier). Source of truth for names is OpenMoji's
`data/openmoji.json`; the emoji set is every entry whose `subgroup` starts with
`face-`.
