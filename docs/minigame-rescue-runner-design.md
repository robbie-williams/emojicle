# Rescue Runner — minigame design doc

A new entry in the Games picker alongside Emoji Doctor and Water Safari.
This is a **functional design** meant as input for a one-shot build — it
describes what the game must do, not how the code should be structured.

## Concept

An endless-feeling, level-based platform runner. The player's custom emoji
(the face built on the canvas) is the **Hero** — but the Hero's body is not
fixed. The player swaps between a small set of **hero bodies** on the fly,
each suited to smashing/melting/dodging a different kind of obstacle. Reach
the end of the level to find the **Civilian** — another emoji, arms raised,
stranded — grab them, and leap off-screen together to clear the level.

Tone stays in line with the rest of Emojicle: nobody gets hurt, failure is
silly rather than punishing, and the "win" screen is a celebration.

## Core loop

1. Hero auto-runs forward at a constant (per-level) speed across 3 parallel
   **rails**.
2. Obstacles approach; the player reacts by:
   - switching **rail** (left/center/right), and/or
   - **jumping** a gap, and/or
   - swapping to the **correct body** for what's ahead.
3. Wrong body (or wrong lane, or mistimed jump) at an obstacle = a bounce-off
   fail (see Fail state below), not instant game over.
4. Reaching the far end triggers the **rescue beat**: Hero runs to the
   Civilian, grabs them, both jump up and out of frame.
5. "Level Complete" modal appears → button to advance to the next
   (harder/faster) level.

## The Hero

- **Head**: whatever face is currently built in the app (reuse as-is — this
  is the game's hook, "you rescue people as your own emoji").
- **Body**: swaps between a small fixed roster of hero forms. Swapping is
  instant to input but plays a **~0.3–0.5s sparkle transformation flourish**
  (burst of star/sparkle particles over the body silhouette) before the new
  body's powers are "live" — so timing the swap early enough is part of the
  challenge, not just picking the right one.
- Only one body is active at a time. Default/neutral body has no special
  power and cannot pass any of the guarded obstacles.

### Body roster (suggested 4, keep it small and legible)

| Body | Look | Beats | Obstacle example |
|---|---|---|---|
| **Muscle** | big buff arms | Smashes hard/heavy blockers | crate stacks, boulders, brick walls |
| **Blaze** | fire aura | Burns through / immune to heat | ice walls, thorny vines, lava strip |
| **Ghost** | translucent, floaty | Phases through energy hazards | laser fences, spike walls |
| **Rocket** | jet boots/wings | Extended air time over long gaps | wide chasms, spinning saw pits |

Every obstacle type is telegraphed with a distinct, readable silhouette/color
so players can recognize it a beat before arrival and pre-swap. A given
obstacle is only ever beaten by exactly one body (no overlap), so there's
always one correct answer.

Plain gaps (no hazard icon, just a missing rail segment) can be crossed by
**jumping alone**, regardless of body — jump is the universal action, body
swap is the specialized one.

## Rails & movement

- **3 rails** (left / center / right), laid out side by side, always visible
  a short distance ahead so upcoming obstacles are readable per-rail.
- **Move between rails**: swipe left/right (or tap on-screen left/right
  arrows) — snaps to the adjacent rail with a quick slide, not a teleport.
- **Jump**: swipe up / tap a jump button — arcs the Hero up and slightly
  forward, clearing a gap in the current rail or a low obstacle. Does not
  change rails by itself (pure vertical/forward arc) — lane changes and
  jumps are separate inputs that can be combined (e.g. jump while mid-slide).
- **Body swap buttons**: 4 always-visible icon buttons (one per body) below
  or beside the play area. Tapping one starts the sparkle transformation;
  spamming/cancelling mid-animation is not allowed (commit to the swap).

## Procedural level layout

Each level is generated as a sequence of **beats** down the 3 rails:

- A beat is a short stretch containing either: nothing (breather), a single
  obstacle on 1–2 rails (forcing a rail choice), a gap (forcing a jump), or
  a combined obstacle+gap (forcing both a body swap and a jump).
- At least one rail through any given beat is always clearable somehow
  (never an unavoidable wall across all 3 rails with no valid body/jump
  response) — the game must always be theoretically beatable blind, just
  harder.
- Sprinkle in **optional civilians** mid-level (see below).
- The level ends with a short guaranteed-clear runway leading to the main
  Civilian, so the rescue beat always reads clearly and isn't itself a
  gauntlet.
- Length and beat density scale with level number (see Difficulty).

## Civilians

- **Main Civilian**: one per level, standing at the finish line, arms up,
  visibly distinct from obstacles (a random emoji character — reuse random
  face/part generation for variety). Running into them triggers the rescue
  beat and ends the level.
- **Optional Civilians**: 0–3 per level, placed just off the "easy" path —
  reachable by a deliberate rail change or a small detour, not free. Each is
  its own small emoji character, arms up, same "grab" interaction, but
  instead of ending the level it's a quick scoop-and-continue (brief pickup
  animation, Hero keeps running) and adds to a per-level rescue tally.
- Optional civilians never block a rail outright — they're a rewarded
  detour, not an obstacle.

## Level complete flow

1. Hero reaches the main Civilian → auto-grab.
2. Short animation: Hero + Civilian jump up and off the top of the screen.
3. Modal: level number cleared, civilians rescued this level (e.g. "2/3
   saved"), a cheerful message, and a **Next Level** button.
4. Best level reached persists (same pattern as Doctor/Safari), so players
   can always jump back in and try to beat their record.

## Difficulty progression

Per level, increase some mix of:

- **Run speed** (the main driver of "feels harder").
- **Beat density** (less breathing room between obstacles).
- **Combined beats** (obstacle+gap together, needing swap *and* jump timed
  right) become more frequent.
- **Body cycling pressure** (sequences that demand back-to-back different
  bodies, punishing slow swappers).
- Optional civilians become slightly more tucked away / require tighter
  detours to reach.

Keep obstacle *rules* constant across levels (a given hazard always needs
the same body) — only pacing and density escalate, so mastery carries
forward and the game doesn't need new teaching moments every level.

## Fail state

- Hitting an obstacle in the wrong body (or missing a jump into a gap)
  bounces the Hero back/down for a beat (brief stumble animation + a "miss"
  sfx) and costs a **life**, but doesn't stop the run — keep momentum, keep
  it forgiving.
- Run out of lives (e.g. start at 3) → run ends short of the Civilian: a
  gentle "so close!" panel with a **Retry** (same level) option, matching
  the fail-panel pattern already used in Emoji Doctor.

## Audio & feel

- Reuse the existing synthesized-SFX approach (no audio files): a rising
  chime on successful body swap completing, a distinct "thunk" per obstacle
  type when beaten correctly, a soft "boing" on jump, a happy chime on
  civilian pickup, and a bigger fanfare on level-complete — consistent with
  the win/fail stingers already used in Doctor and Safari.
- The sparkle transformation on body swap is the game's signature visual
  beat — make it snappy and satisfying since the player will trigger it
  constantly.

## Integration notes

- Registers in the shared `window.MINIGAMES` picker like Doctor (`clinic`)
  and Safari (`safari`): a name, an emoji icon, and a start function.
- Hero's head is read from whatever face is currently on the builder canvas,
  same "reads the builder's globals" pattern the other two minigames use.
- Best-level-reached persists in localStorage, same convention as the other
  two games.
