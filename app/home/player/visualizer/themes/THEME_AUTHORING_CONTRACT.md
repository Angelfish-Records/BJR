# BJR Visualizer Theme Authoring Contract

This document defines the artistic, temporal and performance contract for active
BJR visualizer themes.

The goal is not stylistic uniformity. Themes should remain radically distinct.
The shared contract exists so that every theme feels composed, musical,
cinematic and performant rather than behaving like an audio-reactive
screensaver.

---

## 1. Core design objective

Every active theme should aim for:

> A visually extraordinary autonomous world whose local behaviour responds
> musically to the recording, while its larger dramatic state evolves across
> the whole life of the track.

Three different systems own three different kinds of change:

1. autonomous scene time;
2. instantaneous audio response;
3. whole-track narrative progress.

Do not collapse these responsibilities together.

---

## 2. The three temporal domains

### 2.1 Scene time — `opts.time`

Scene time keeps the visual world alive.

Appropriate uses include:

- gas drift;
- orbital motion;
- slow rotation;
- convection;
- growth motion;
- wave propagation;
- ambient particulate motion;
- shimmer;
- slow topology movement;
- other continuous physical processes.

Scene time does not represent the dramatic position of the song.

A scene may continue to move while playback is paused if that suits the
theme's physical logic.

---

### 2.2 Audio response — `opts.audio`

Audio features provide local musical excitation.

Available signals include:

- energy;
- RMS;
- bass;
- mid;
- treble;
- spectral centroid.

Prefer audio modulation of:

- luminosity;
- emission;
- glow;
- colour temperature;
- local plasma activity;
- internal turbulence accents;
- flare intensity;
- star scintillation;
- particle birth or visibility;
- line brightness or thickness;
- localised bloom;
- transient events;
- secondary structures.

Audio should generally make an existing world ignite, breathe, flare, pulse,
spark or intensify.

### Structural stability rule

Momentary audio values should normally **not** drive:

- the global coordinate frame;
- the primary camera;
- whole-field translation;
- whole-field rotation;
- large-scale geometry position;
- the master scene clock;
- strong global scale deformation.

A bass hit should not make the universe look as though it is painted on a
sheet being shaken.

Exceptions are allowed only when large-scale deformation is the explicit
concept of the theme, and even then it should be deliberate rather than an
accidental consequence of multiplying coordinates by an audio feature.

---

### 2.3 Whole-track narrative — `opts.trackProgress01`

`trackProgress01` is the normalized dramatic position of the recording:

- `0.0` = beginning;
- `1.0` = end.

It owns the macroscopic theatrical arc.

Appropriate uses include:

- camera ingress or retreat;
- revelation or occlusion;
- increasing or decreasing density;
- approach to a structure;
- progressive collapse;
- emergence;
- accumulation;
- erosion;
- topology change;
- spatial reorganisation;
- perspective shift;
- transformation between visual states.

The narrative must be deterministic with respect to playback position.

Therefore:

- pause freezes the narrative position;
- resume continues from that position;
- seeking recomposes the appropriate chapter immediately;
- stage recreation resumes at the same chapter;
- inline/fullscreen movement must not restart the story;
- a new track begins a new narrative at zero;
- offline rendering should reproduce the same narrative position as realtime
  playback.

Do not recreate this behaviour with a private `performance.now()` lifetime
clock in new or hardened themes.

---

## 3. Every theme needs a long-form visual verb

Before hardening a theme, define its dominant whole-track action as a verb.

Examples:

- Nebula — **enter**
- Event Horizon — **fall**
- Coral Reef — **colonise**
- Crystal — **grow**
- Cathedral — **reveal**
- Lattice — **cohere**
- Signal Decay — **erode**
- Singularity — **condense**
- Wormhole — **traverse**

The verb should describe a visual journey, not merely an effect.

Do not solve every theme with the same camera zoom.

---

## 4. The 10 / 50 / 90 test

Frames at approximately:

- 10%;
- 50%;
- 90%

should look like recognisably different chapters of the **same visual world**.

The difference does not need to be dramatic in a still-image comparison, but
the cumulative journey should be perceptible over a complete listen.

A successful theme should reward sustained viewing.

---

## 5. Long-form pacing

Whole-track progression should normally be shaped rather than linear.

Useful approaches include:

- eased ingress;
- slow establishment followed by acceleration;
- early transformation followed by a long reveal;
- staged thresholds;
- asymmetric arcs;
- late culmination;
- approach without complete arrival;
- accumulation followed by partial release.

Avoid mechanically obvious constant-speed movement unless the concept calls
for it.

Narrative progress may control several related parameters, but they should
describe one coherent dramatic journey rather than independent arbitrary
automation.

---

## 6. Relationship between narrative and audio

Narrative determines **where the visual world is in its story**.

Audio determines **what is happening inside that world right now**.

For example:

- track progress may move a camera deeper into a nebula;
- bass may illuminate massive gas structures at the current location;
- mids may excite ionised filaments;
- treble may brighten stable stars;
- a transient may trigger a local flare.

Momentary audio must not unintentionally reset, accelerate or destabilise the
whole-track journey.

---

## 7. Stable topology, reactive appearance

Where practical, prefer stable underlying topology with reactive appearance.

Examples:

- stars keep their positions but change brightness;
- cloud masses retain coherent spatial identity while internal light changes;
- lattice nodes stay spatially intelligible while connections energise;
- persistent structures can accumulate or erode according to track progress;
- particles may be born in response to music without the whole field moving
  abruptly.

This creates the impression that the music is affecting a physical world
rather than regenerating a procedural texture every frame.

---

## 8. Performance doctrine

Visual ambition is encouraged.

Mobile performance is a design constraint, not a reason to make themes bland.

Prefer high-value visual complexity:

- analytical shapes;
- reused noise fields;
- shared calculations;
- stable procedural structures;
- temporal development;
- colour and emission changes;
- coordinate transforms;
- bounded loops;
- precomputed or seeded values;
- selective high-frequency detail.

Be cautious with:

- additional full-screen passes;
- repeated high-octave FBM evaluations;
- large nested loops;
- per-frame allocations;
- expensive work whose contribution is visually negligible;
- excessive alpha overdraw;
- large blur or glow operations;
- complexity added merely to increase apparent detail.

Before increasing computational complexity, ask whether equivalent theatrical
impact can come from composition, depth, light, timing or narrative change.

---

## 9. Engine versus theme ownership

### Engine owns

- render scheduling;
- stage activation;
- canvas/backing-store sizing;
- DPR adaptation;
- FPS policy;
- transition composition;
- snapshots;
- performance telemetry;
- delivery of audio features;
- delivery of normalized track progress.

### Theme owns

- visual identity;
- spatial composition;
- physical metaphor;
- audio mapping;
- long-form visual verb;
- narrative pacing;
- use of track progress;
- local complexity;
- palette;
- visual hierarchy.

Do not duplicate engine-level mobile/device heuristics inside individual themes
without evidence that the shared performance system cannot handle the case.

---

## 10. Realtime / offline parity

A hardened active theme should be authored so that the important composition
is reproducible in both realtime and offline rendering.

In particular:

- whole-track narrative must derive from `trackProgress01`;
- seeded procedural structure should remain deterministic where required;
- offline render speed must not alter the visual narrative;
- wall-clock render duration must not determine the story position.

Autonomous `time` motion can remain separate from narrative progression.

---

## 11. Interaction semantics

When assessing a hardened theme, explicitly test:

### Pause

The world may remain gently alive, but the dramatic chapter should not
continue advancing through the recording.

### Resume

The long-form journey continues from the same chapter.

### Seek forward

The scene should recompose convincingly at the later narrative state.

It does not need to simulate every missed intermediate state unless the theme
explicitly requires stateful history.

### Seek backward

The theme should produce a coherent earlier chapter rather than retaining
irreversible later-state artefacts unless irreversibility is itself a deliberate
and supported design decision.

### Stage recreation

Moving between inline and fullscreen or recreating the WebGL theme instance
must not restart the recording's dramatic journey.

### Track change

A new recording begins its own narrative at zero.

---

## 12. Theme hardening checklist

Before declaring a theme hardened, answer:

### Concept

- What physical or visual world does the theme represent?
- What is its long-form visual verb?
- What makes it unmistakably different from every other theme?

### Structural motion

- What changes autonomously with `time`?
- Does that motion remain coherent and physically legible?

### Musical response

- What does bass affect?
- What do mids affect?
- What does treble affect?
- What does energy affect?
- Does spectral centroid have a useful role?
- Are these responses primarily local rather than whole-canvas tremors?

### Narrative

- What changes from 0 → 1?
- What do the 10%, 50% and 90% chapters look like?
- Is the whole-track evolution theatrical but not mechanically obvious?
- Does it survive pause, seek and stage recreation correctly?

### Performance

- What are the expensive operations?
- Can expensive calculations be reused?
- Is any complexity visually redundant?
- Does the theme rely on the engine's adaptive DPR/FPS rather than inventing
  parallel device heuristics?
- Is its computational budget justified by visible impact?

### Visual hierarchy

- Is there foreground, middle distance and depth where appropriate?
- Are blacks and negative space preserved?
- Is there a clear focal hierarchy?
- Does audio enhance that hierarchy rather than flatten it?

### Offline validation

- Scrub approximately 0%, 25%, 50%, 75%, 95%.
- Watch a continuous representative musical passage.
- Confirm that structural movement, musical response and long-form narrative
  remain perceptually distinct.

---

## 13. Anti-patterns

Avoid unless explicitly required by the theme concept:

- bass multiplied into the global coordinate frame;
- audio-controlled master time;
- whole-screen shaking;
- random topology regeneration on musical peaks;
- every theme using a generic zoom;
- global brightness pumping as the principal audio response;
- adding particles solely because a theme feels empty;
- making mobile quality decisions locally before proving the shared engine
  needs additional information;
- private wall-clock theme-age systems for recording narrative.

---

## 14. Current migration note

Some existing themes predate the normalized track-progress contract and use
private wall-clock lifetime mechanics.

They should be migrated individually during their hardening pass rather than
through a bulk mechanical conversion, because their existing lifecycle
behaviour is part of their artistic identity.

For each one:

1. identify what the existing age mechanic is artistically accomplishing;
2. preserve the successful visual idea;
3. decide which part belongs to autonomous `time`;
4. move recording-level dramatic progression to `trackProgress01`;
5. preserve or improve performance;
6. verify pause, seek, stage recreation and offline parity.

---

## 15. Reference: Nebula

Nebula is the first hardened reference implementation.

Its current design separates:

- autonomous slow gas/star motion → scene `time`;
- gas illumination, stellar pulse and local flares → audio features;
- progressive entry into the luminous complex → `trackProgress01`.

Its long-form verb is:

> **enter**

The important precedent is not Nebula's particular shader technique. It is the
separation of responsibilities.

Future themes should obey the same behavioural architecture while remaining
visually and conceptually distinct.
