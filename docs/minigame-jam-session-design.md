# Jam Session — minigame design doc

A new entry in the Games picker alongside Emoji Doctor, Water Safari, and
Rescue Runner. This is a **functional design** meant as input for a one-shot
build — it describes what the game must do, not how the code should be
structured.

## Initial design input

The raw ask this doc is based on, kept verbatim for reference:

> we're going to build another minigame design doc to feed to fable 5
> Effectively I'm going to use this document as input into a fable 5 one shot
> to implement, so don't worry too much about the code base or specifics,
> functional design is more important. It doesn't need to be war and peace,
> fable will figure that out
>
> This game is going to be a few musical instruments. It will have drums,
> xylophone, and piano. The bottom 3 quarters of the screen will be dedicated
> to the instrument, the top quarter will display the emoji with arms
> attached playing the selected instrument as the player plays.
> There will be a recording button feature that listens to the player play
> the instrument and stores (probably in their browser local storage) a
> recording of their song, and a play/stop button to play the recorded song
> (which is grayed out when there is no). Only one instrument can be selected
> at a time by using instrument selection buttons in the top quarter of the
> screen - but the recording can still be stored and played from other
> instruments until overridden.
> Instruments can play multiple keys at a time - instruments can be played
> over the recording also
>
> When in the instruments minigame, there will be a "challenge button" which
> will teach the kids how to play very simple songs by asking them to follow
> along sub sections of the song, then getting them to play the whole song,
> and rating their score based on how well they played the song ang giving
> them a score out of 100
> The challenge button should provide a selection modal to pick the song they
> want to learn
>
> The emoji in the top quarter should be sitting on a stool on top a of a
> stage with the selected instrument in front of them

## Concept

The player's custom emoji becomes a musician: it sits on a stool on a small
stage, holding whichever instrument is currently selected, and plays along as
the child taps. Three instruments are available — **Drums**, **Xylophone**,
and **Piano** — each played by tapping keys/pads that make actual musical
notes (polyphonic — multiple keys/pads at once). A **record/playback** loop
lets the player capture a short performance and hear it back, and a
**Challenge** mode teaches simple, well-known kids' songs step by step and
scores the player's attempt at playing the whole thing.

Tone stays in line with the rest of Emojicle: no fail states that feel bad,
just encouragement and a score to beat next time.

## Screen layout

- **Top quarter**: the stage. Player's emoji sits on a stool, arms attached
  and posed to play whatever instrument is currently selected (drumsticks
  for Drums, mallet for Xylophone, hands hovering over keys for Piano) —
  same "arms injected onto the emoji" pattern as the existing Dance system.
  A simple painted backdrop (curtain + spotlight) sets the stage, similar in
  spirit to Water Safari's painted biome backdrops.
  - **Instrument selector**: 3 small buttons (one per instrument, icon +
    label) live in this quarter. Exactly one instrument is selected at a
    time; tapping a different one swaps the instrument shown below *and*
    what the emoji is holding, instantly.
  - **Record button** (●) and **Play/Stop button** (▶/■) also live in this
    quarter, always visible regardless of which instrument is selected.
- **Bottom three quarters**: the currently selected instrument's playable
  surface, filling the space (see Instruments below). Tapping/holding
  triggers the note and a matching arm-swing animation up in the stage
  quarter.

## The instruments

All three are drawn as inline SVG (no image/audio assets), consistent with
the rest of the app.

| Instrument | Layout | Notes |
|---|---|---|
| **Drums** | A small kit of round pads (kick, snare, hi-hat, tom, cymbal) arranged across the width | Short percussive hits, not pitched |
| **Xylophone** | A row of colored bars, biggest/lowest-pitched on the left | ~8–15 bars, one octave-ish diatonic run, bar length hints at pitch like a real xylophone |
| **Piano** | A keyboard strip, white + black keys | ~1–1.5 octaves, sized to fit the bottom-three-quarters width without scrolling |

- Every instrument supports **multi-touch/polyphony** — holding or tapping
  several keys/pads at once plays a chord/combo, no note-stealing.
- Tapping is playable **at any time**, including while a recorded
  performance is being played back (jam-along), and while recording (that's
  literally how you record).

## Recording & playback

- There is **one recording slot** (not one per instrument), persisted to
  `localStorage` so it survives a reload.
- Pressing **Record** starts capturing: every note played (which
  instrument, which key/pad, and the timestamp) is appended to the take
  until Record is pressed again to stop, or a generous cap (~30s) is hit
  automatically.
- Pressing **Record** again while a take already exists **overwrites** the
  old one — the old take is only gone once a new recording actually starts,
  not just from switching instruments or pressing Play.
- **Play/Stop** plays the stored take back through the synth, in order,
  at the timing it was recorded. The button is **disabled/grayed out**
  whenever there's no take stored.
- Because each recorded note remembers which instrument it was played on,
  **switching instruments never invalidates or silences the recording** —
  you can record on Piano, flip to Drums to noodle around, and Play still
  faithfully plays back the original Piano performance. A nice touch (not
  required): during playback, briefly auto-switch the visible
  instrument/arm pose to match whichever instrument each note belongs to,
  so watching playback looks like the emoji is "replaying" the whole
  performance — otherwise, simplest fallback is just correct audio plus a
  generic arm-bounce in time with the notes.
- Playing live on top of an in-progress playback is allowed (jamming along)
  but those extra live notes are **not** added to the saved take — only an
  explicit new Record does that.

## Challenge mode

- A **Challenge** button (near the record/play controls) opens a modal to
  pick a song to learn. Songs are simple, recognizable kids' tunes (e.g.
  Twinkle Twinkle Little Star, Hot Cross Buns, Mary Had a Little Lamb),
  each written for one melodic instrument (Piano or Xylophone); a couple of
  simple rhythm-only patterns can be offered for Drums. Picking a song
  auto-selects its instrument and starts the lesson.
- **Teaching flow**:
  1. The song is broken into a few short subsections (phrases/bars).
  2. For each subsection in turn: the game demonstrates it (plays the notes
     itself, highlighting each key/pad as it sounds), then the player
     repeats that same subsection by tapping along, with the correct
     key/pad highlighted as a guide. Getting a note right/wrong gets
     immediate light feedback (chime + green flash / gentle shake) but
     never blocks progress — it's forgiving practice, not a gate.
  3. Once every subsection has been introduced, the player performs the
     **whole song** themselves, back to back, with guides faded out (or
     much subtler) — this is the graded attempt.
  4. Score out of 100 based on how many notes were hit correctly and how
     close to the right timing, shown on a results panel (score, a
     cheerful message, best score for this song) with **Retry** and
     **Pick another song** options — same fail/win panel pattern already
     used in Doctor/Safari/Runner.
- Best score per song persists in `localStorage`, so kids can come back and
  try to beat their own record, consistent with the best-level pattern
  used by the other minigames.

## Song list

Ten simple, well-known, public-domain kids' songs to teach:

1. Twinkle Twinkle Little Star
2. Hot Cross Buns
3. Mary Had a Little Lamb
4. Row, Row, Row Your Boat
5. Old MacDonald Had a Farm
6. London Bridge Is Falling Down
7. Frère Jacques (Are You Sleeping)
8. Itsy Bitsy Spider
9. Ode to Joy (Beethoven, simplified)
10. Happy Birthday to You

## Audio & feel

- Reuse the existing synthesized-SFX approach (Web Audio, no audio files):
  each instrument gets its own simple synthesized timbre — short
  noise/thump envelopes per drum pad, a bright short bell-like tone for
  xylophone bars, a slightly longer sustained tone for piano keys — all
  built from oscillators/envelopes, not samples.
- The arm-swing-to-hit animation on every note (live or during playback) is
  the game's signature visual beat, in the same spirit as the sparkle
  transform in Rescue Runner or the dance moves — make it quick and
  satisfying since it fires constantly.

## Integration notes

- Registers in the shared `window.MINIGAMES` picker like the others: a
  name, an emoji icon, and a start function.
- The emoji's head/face is read from whatever's currently built on the
  canvas, same "reads the builder's globals" pattern the other minigames
  use; arms are swapped per-instrument the same way the Dance system swaps
  arm SVGs into `#layer-arms`.
- `localStorage` holds: the current recorded take, and best score per
  Challenge song — same persistence convention as best-level-reached in the
  other games.
