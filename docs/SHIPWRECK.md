# SHIPWRECK
## Master Prompt for Agentic Coders (Codex · Claude Code · Cursor · Aider · any autonomous coding agent)

**Version:** 1.0 · **Platform:** desktop browser · **Input:** webcam hand tracking, both palms only · **Genre:** cinematic arcade rescue + first-person boat run

---

## 0. How to use this document

**Human:** give this entire file to the agent as its first message, or save it as `AGENTS.md` (Codex) / `CLAUDE.md` (Claude Code) at the repo root and tell the agent: *"Read SHIPWRECK.md fully, write PLAN.md, then execute the milestones in Section 32."*

**Agent:** read the whole document before writing any code. It contains the mission (Part A), problem definitions (Part B), tech stack (Part C), architecture (Part D), gameplay and input specs (Part E), UX definitions (Part F), delivery plan (Part G), and appendices. Where this document gives a default value, use it, tune it later, and record changes in `docs/DECISIONS.md`. Where it is silent, decide sensibly and record the decision. Ask the human a question only if you are truly blocked.

---

# PART A: MISSION

## 1. Role and goal

You are a senior team consisting of a real-time graphics engineer, a gameplay engineer, a computer-vision/HCI engineer, and a technical game designer. Build **SHIPWRECK**: a complete, polished, cinematic browser game that is played **only with the player's two palms in front of a webcam**. No keyboard or mouse is required for any part of a normal playthrough (keyboard and mouse exist only as accessibility and debug fallbacks).

## 2. Rewritten project brief

### 2.1 Premise
A passenger ship has been torn apart by a **Megalodon**. At dusk, in a rolling storm swell, a handful of survivors are in the water. A few are floating on their own in life jackets. Most are standing on a large piece of wooden wreckage. A pack of hungry sharks circles them, and something far larger moves beneath the sharks.

A **rescue helicopter** arrives. It lowers an extendable **picker** (a winch cable ending in an open/close rescue claw). The player flies the helicopter and operates the picker with both hands, lifts the survivors one or two at a time, carries them across the water, and gently lowers them onto a nearby **rescue boat**.

**Time is the enemy.** The longer the player takes, the more the sharks attack the survivors who have not yet been rescued. Survivors who are not saved are lost.

When every surviving person is aboard the rescue boat, the camera cuts to a **first-person view from the boat driver's seat**. The player now steers the refugees through wreckage, reefs, fog, and Megalodon lunges to a **nearby island**.

### 2.2 Narrative beats (in order)
1. **Cold open (cinematic, skippable):** the ship is struck and splits; survivors scramble onto wreckage; sharks arrive; the Megalodon's dorsal fin passes the camera.
2. **Helicopter arrival (cinematic to gameplay handover):** rotor thunder, searchlight sweeps, pilot radio line, survivors wave and shout. Control is handed to the player.
3. **Rescue phase (gameplay, Phase 1):** fly, lower, grab, carry, release. Sharks escalate with time. A Megalodon breach shatters the wreckage at a scripted escalation point.
4. **All aboard (transition cinematic):** the last survivor is delivered; the boat captain shouts "go"; the camera pushes through the cockpit window into the driver's seat (match-cut to first person).
5. **Boat phase (gameplay, Phase 2):** steer through hazards to the island while survivors talk behind you.
6. **Landfall (outro cinematic):** dock/beach landing, survivors disembark, dawn light breaks, helicopter passes overhead.
7. **Results:** score, rank, time, survivors saved/lost; log the run; show the leaderboard; "Next player."

### 2.3 Design pillars
1. **Your hands are the game.** Every control is a palm. Feedback on hand tracking must be immediate, readable, and forgiving.
2. **Cinematic always.** Even gameplay has camera direction, slow-motion beats, rain, lightning, bloom, and dynamic music.
3. **Tension through time, not through frustration.** Shark attacks are telegraphed, escalate fairly, and are always avoidable by a competent player.
4. **Characters you care about.** Each survivor has a voice, a personality, and lines reacting to what the player does.
5. **Runs in a browser tab.** Fast load, stable frame rate, no installs, no server required.

### 2.4 Original requirements (must all be satisfied)

| ID | Requirement (from the original brief) | Addressed in |
|---|---|---|
| R-01 | Ship wrecked by Megalodon; some survivors float in the ocean, most stand on a wooden piece; hungry sharks circle them | §2, §15, §16 |
| R-02 | Rescue helicopter flies in with an extended picker | §16 |
| R-03 | **Left palm** controls the picker's contraction and expansion | §14, §16 |
| R-04 | **Right palm** controls the helicopter on the horizontal axis | §14, §16 |
| R-05 | Rescued people are safely put down onto a nearby rescue boat | §16 |
| R-06 | As the player takes longer, sharks keep attacking idle, unrescued people | §17 |
| R-07 | When all alive people are on the boat, POV changes to a first-person boat driver | §18 |
| R-08 | Player steers refugees safely to a nearby island | §18 |
| R-09 | Each player has a score; scores are logged with time taken to complete | §21, §22 |
| R-10 | Cinematic game | §19, §20, §26 |
| R-11 | Shipwrecked people have dialogues that make gameplay engaging | §20, Appendix B |
| R-12 | Controlled with both palms; runs in the browser; carefully chosen tech stack | Part C, §14 |
| R-13 | Deliver: rewritten prompt, architecture, tech stack, UX definitions, problem definitions | This document |

## 3. Interpretation decisions (ambiguities resolved up front)

| Ambiguity | Decision | Escape hatch |
|---|---|---|
| "Left palm controls picker contraction and expansion" could mean cable winding or claw opening/closing | **Do both on the left hand:** palm *height* sets cable length (up = retract, down = extend); palm *openness* sets the claw (open palm = expanded/open jaws, fist = contracted/closed jaws) | Setting `leftHandMode: 'dual' \| 'winchOnly'`. In `winchOnly`, the claw auto-closes on contact and auto-releases over the boat's drop zone |
| "Right palm controls the helicopter in a horizontal axis" | Right palm *horizontal position* sets the helicopter's target X (position control with spring-damper inertia, not a raw joystick) | Setting `heliControl: 'position' \| 'rate'` |
| "Each player has a score" | Players take **sequential turns** on one machine (event/kiosk style). Each turn is one logged run tied to a player callsign | Optional remote leaderboard adapter |
| Boat controls are unspecified | Both palms act as an invisible steering wheel (§18.3) | Keyboard/mouse fallback |
| Number of survivors | 8 total: 3 floating, 5 on the wooden debris (data-driven, see Appendix C) | Level JSON |
| Failure | Game ends in failure only if **all** survivors are lost or the boat is destroyed. Partial losses still allow completion | n/a |
| Platform | Desktop/laptop Chromium-class browsers with a webcam. Mobile is a non-goal | n/a |
| Content rating | PG-13. Shark attacks are shown as splashes, shadows, and screams, never gore | n/a |

## 4. Non-negotiable constraints

1. **Both palms only** for the full normal playthrough, including menus, calibration, name entry, and pause.
2. **Runs entirely in the browser**, as a static site. No required backend. Webcam video **never leaves the device**.
3. **Playable without a webcam for development and tests** via a synthetic input provider (§14.6). The agent cannot rely on a physical camera.
4. **The game must always be winnable and never softlock.** Tracking loss, hand swaps, or odd poses can never trap the player.
5. **60 fps target** on a mid-range laptop with integrated graphics at 1080p using dynamic resolution scaling.
6. **Every milestone leaves the project in a runnable state** (`pnpm dev` works, tests pass).
7. **Licensing hygiene:** only original, CC0, or permissively licensed assets, all recorded in `docs/ASSETS.md`. No copyrighted characters, music, or voices.

---

# PART B: PROBLEM DEFINITIONS

Each problem lists why it is hard, the required approach, and acceptance criteria. Treat these as the project's risk register.

### P-01 Robust two-hand tracking in a browser
- **Why hard:** webcam quality, lighting, motion blur, hand occlusion, handedness label flips, jitter, GPU variability, latency.
- **Approach:** MediaPipe Tasks Vision `GestureRecognizer` (landmarks + handedness + canned gestures in one model), GPU delegate with CPU fallback, 30 Hz inference decoupled from 60 Hz rendering, One-Euro filtering, handedness auto-calibration plus screen-position disambiguation, tracking-loss grace logic.
- **Accept:** both palms tracked simultaneously ≥ 95% of frames in a normally lit room; end-to-end input latency (camera frame to sim intent) ≤ 80 ms median on a 2020-class laptop; no left/right swaps during a 5-minute session in test recordings.

### P-02 Ergonomic mapping from hand space to game space
- **Why hard:** players differ in height, distance, arm reach, and seated vs standing posture. Arm fatigue ("gorilla arm") is real. Camera depth is noisy.
- **Approach:** calibration of an *active reach box* per player; use only 2D palm-center position (x, y) and a scale-invariant openness metric; never depend on depth (z); dead zones; recenter zone; short sessions; rest cues between phases.
- **Accept:** a 5'0" seated player and a 6'2" standing player can both fully reach all control ranges after the 20-second calibration without leaving the camera frame.

### P-03 Believable ocean in WebGL, cheaply
- **Why hard:** water must look cinematic, bob objects convincingly, and stay fast.
- **Approach:** one shared analytic Gerstner-wave function implemented identically in GLSL and TypeScript so rendering and buoyancy agree. Sky-driven environment lighting (PMREM), no planar reflections. Foam from wave height and noise. Fog and rain for atmosphere.
- **Accept:** CPU `waveHeight(x, z, t)` matches the shader within 1 cm (unit test); floating survivors visibly ride the swell; water cost ≤ 3 ms/frame on integrated GPU at Medium quality.

### P-04 Cable and picker feel
- **Why hard:** a swinging cable is realistic but frustrating; a rigid one is boring.
- **Approach:** damped pendulum/verlet rope with a swing influence that is noticeable but bounded, plus a configurable stabilization assist; claw capture volumes are generous and forgiving; a visible ground-shadow/ring on the water under the picker for depth cueing.
- **Accept:** in playtest recordings, a first-time player completes their first successful grab within 60 seconds of the tutorial starting (≥ 80% of test runs, using replayed synthetic inputs of typical novice behavior).

### P-05 Fair grab, carry, and release
- **Why hard:** gesture precision is lower than mouse precision. Accidental drops and missed grabs feel unfair.
- **Approach:** hysteresis on open/closed state, 120 ms debounce, safe-release guard (open ≥ 250 ms), generous capture volumes, a clear on-screen state for the claw, safe-drop height rules, and a "drop recovery" path (dropped survivors become floating survivors, not deaths).
- **Accept:** no single misclassified frame can release or grab; recoverable failure for every mistake.

### P-06 A shark threat system that is tense but fair
- **Why hard:** "sharks attack more as time passes" can become cheap or impossible.
- **Approach:** a `SharkDirector` with a threat curve, per-attack telegraph (≥ 1.8 s), target selection by vulnerability, cadence limits, concurrency limits, a no-attack grace period, and a winnability guarantee (§17).
- **Accept:** simulated "competent player" bots (par pace) lose ≤ 1 survivor on average over 200 seeded runs; "idle player" bots lose all survivors by ~150 s; first-time humans typically save 5–6 of 8.

### P-07 Cinematic direction inside a real-time game
- **Why hard:** cutscenes, gameplay cameras, slow-motion, and POV switches need one coherent system, not ad-hoc code.
- **Approach:** a data-driven timeline/sequencer (camera splines, FOV, shake, audio cues, dialogue cues, event cues), a `CameraDirector` with prioritized shots (gameplay, reaction close-ups, set pieces), and a match-cut transition into first person.
- **Accept:** all cinematics skippable, deterministic, and never leave the game in an inconsistent state when skipped mid-way.

### P-08 Dialogue that engages and never spams
- **Why hard:** repetitive or overlapping lines kill immersion.
- **Approach:** an event-driven `DialogueDirector` with priorities, cooldowns, per-line play caps, speaker rotation, no overlap, interruption rules, subtitles always on by default, and pre-rendered voice audio with a speech-synthesis fallback.
- **Accept:** in a 4-minute run, no line repeats verbatim more than once; no two voices overlap; every spoken line has a subtitle.

### P-09 Scoring and logging with integrity
- **Why hard:** "time taken" must exclude cutscenes and pauses; scores must be comparable between players; data must survive reloads.
- **Approach:** an active-gameplay clock owned by the game core, a pure scoring function with unit tests, an append-only run log in IndexedDB, JSON/CSV export, and a compact event log for audit.
- **Accept:** pausing for 60 seconds changes neither score nor time; reloading the page preserves all logged runs; exporting produces valid CSV and JSON.

### P-10 Load time, memory, and frame-rate on the open web
- **Approach:** glTF + Draco/Meshopt + KTX2, texture atlases, instancing, progressive loading with an attract-screen while heavy assets stream, object pooling for particles, dynamic resolution scaling, quality tiers.
- **Accept:** time to first interactive screen ≤ 5 s on broadband; total initial download ≤ 25 MB gzipped (cinematic assets may stream after); steady-state JS heap growth < 5 MB/min.

### P-11 Testability without a webcam and without randomness
- **Approach:** all game logic consumes an abstract `ControlIntent`; a seeded PRNG and fixed-timestep simulation make runs deterministic; recorded hand-landmark traces can be replayed; Playwright runs with Chromium's fake video capture.
- **Accept:** a full 4-minute scripted playthrough runs headless in CI and produces an identical score on repeated runs with the same seed.

### P-12 Multi-player turn-taking flow (event/kiosk use)
- **Approach:** a hands-only "Next player" loop with callsign selection, attract mode, idle reset, and optional `?kiosk=1` mode.
- **Accept:** a new player can go from the leaderboard to the first gameplay second in under 60 seconds including calibration.

---

# PART C: TECH STACK

## 5. Decisions and rationale

| Layer | Choice | Why | Rejected |
|---|---|---|---|
| Language | **TypeScript (strict)** | Type safety across a large real-time codebase | Plain JS |
| Build/dev | **Vite**, **pnpm** | Instant HMR, simple static output | Webpack |
| 3D rendering | **Three.js (WebGL2)** | Largest ecosystem, glTF tooling, easy custom shaders, small enough | Unity/Godot web export (heavy downloads, awkward webcam integration), Babylon.js (viable alternative, but Three.js chosen for lighter weight and shader flexibility), WebGPU (not universal yet; allow as a later experiment) |
| Post-processing | **`postprocessing` (pmndrs)** | Efficient merged effect passes: bloom, SMAA, vignette, chromatic aberration, color grading, noise | Many separate Three.js passes |
| Water/sky | Custom GLSL Gerstner water + Three.js `Sky` + PMREM environment | Matches CPU buoyancy; cheap and cinematic | Planar reflections, FFT oceans (too costly) |
| Hand tracking | **`@mediapipe/tasks-vision` GestureRecognizer** | Real-time two-hand landmarks, handedness, and canned gestures, GPU-accelerated in the browser, no server | TensorFlow.js HandPose (older, slower), server-side CV (latency, privacy) |
| Filtering | **One-Euro filter** (in-house, ~40 lines) | Best jitter/latency trade-off for pointing and tracking | Moving average (laggy) |
| Physics | **Custom lightweight physics** | Verlet rope, spring-damper helicopter, analytic buoyancy, 2D (XZ) circle/OBB collisions with a spatial hash. Deterministic and tiny | Full engines (Rapier, cannon-es) unless a measured need arises |
| Game architecture | Hand-rolled typed **FSM** + **systems pipeline** + typed **event bus** | Minimal dependencies, total control of determinism | ECS libraries |
| UI | **Preact** + plain CSS for HUD/menus/subtitles (DOM overlay) | 3 KB, crisp text, easy accessibility, no canvas text issues | React (heavier), canvas-drawn UI |
| Audio | **Web Audio API** thin wrapper (buses: master/music/sfx/voice; `PannerNode` for 3D) | Spatial, layered, adaptive music with no extra dependency | Heavy audio frameworks |
| Voice | Pre-rendered voice audio files, plus **Web Speech API** fallback | Consistent quality; offline-capable | Runtime cloud TTS (latency, privacy, cost) |
| Persistence | **IndexedDB** via `idb`; `ScoreRepository` interface with an optional remote implementation (e.g., Supabase) behind env flags | Offline-first, event-friendly | Mandatory backend |
| Assets | **glTF 2.0** + Draco/Meshopt + **KTX2/Basis**; `gltf-transform` CLI for optimization | Small downloads, fast GPU upload | OBJ/FBX at runtime |
| Quality | **Vitest** (unit), **Playwright** (e2e with fake webcam), **ESLint + Prettier**, `tsc --noEmit` in CI | Verifiable work | None |
| Hosting | Any static host over **HTTPS** (Cloudflare Pages / Vercel / Netlify / GitHub Pages) | `getUserMedia` requires a secure context (localhost is exempt) | Required servers |

**Self-host** the MediaPipe WASM runtime and `gesture_recognizer.task` model under `/public/mediapipe/` so the game works offline and has no third-party CDN dependency at runtime.

**Verify current APIs.** Before coding against MediaPipe, Three.js, `postprocessing`, or `idb`, read their current official documentation and pin exact versions in `package.json` (latest stable at build time). Do not rely on memory for API signatures.

**Browser support:** Chrome/Edge (primary, fully tested). Firefox and Safari: best effort; show a compatibility notice and fall back to CPU inference or lower quality if the GPU delegate fails.

---

# PART D: ARCHITECTURE

## 6. High-level system diagram

```
 Webcam (getUserMedia)
        │ video frames (≈30 Hz)
        ▼
 ┌──────────────────┐   HandFrame    ┌─────────────────────────┐
 │ HandTracker      │───────────────▶│ GestureMapper           │
 │ (MediaPipe GR)   │                │ + Calibration + Filters │
 └──────────────────┘                └───────────┬─────────────┘
                                                 │ ControlIntent (every sim tick)
 Keyboard/Mouse emulator (debug/a11y) ───────────┤
 Replay provider (tests)  ───────────────────────┤
                                                 ▼
 ┌───────────────────────── Game Core (fixed 60 Hz sim) ─────────────────────────┐
 │  Game FSM ─▶ Phase controllers (Rescue, Boat) ─▶ Sim systems                  │
 │  (Water, Heli, Cable, Claw, Survivors, SharkDirector, Boat, Course, Scoring)  │
 │         ▲                         │ typed EventBus                            │
 │         │                         ▼                                           │
 │  Director (Camera/Timeline) ◀──▶ DialogueDirector ◀──▶ AudioEngine            │
 └──────────────┬──────────────────────────────────────────────┬────────────────┘
                │ interpolated render state                    │ events / view-models
                ▼                                              ▼
        Three.js Renderer                                 Preact UI overlay
        (Water, Sky, Models, Particles, PostFX)           (HUD, menus, subtitles, cursors)
                                                                │
                                                                ▼
                                                   ScoreRepository (IndexedDB → optional remote)
```

## 7. Repository layout

```
shipwreck/
├─ public/
│  ├─ mediapipe/                 # wasm + gesture_recognizer.task (self-hosted)
│  ├─ models/                    # .glb (Draco/Meshopt), .ktx2
│  ├─ audio/{music,sfx,voice}/
│  └─ dialogue/lines.en.json
├─ src/
│  ├─ main.ts
│  ├─ app/        # bootstrap, tuning.ts, config, fsm.ts, eventBus.ts, settings.ts
│  ├─ core/       # loop.ts (fixed timestep), rng.ts, time.ts, math.ts, pool.ts
│  ├─ input/      # handTracker.ts, handFrame.ts, gestures.ts, calibration.ts,
│  │              # oneEuro.ts, mapper.ts, providers/{hands,keyboardMouse,replay}.ts
│  ├─ sim/        # water.ts, helicopter.ts, cable.ts, claw.ts, survivors.ts,
│  │              # sharks.ts, megalodon.ts, rescueBoat.ts, driverBoat.ts, course.ts
│  ├─ game/       # phases/{rescue,boat}.ts, sharkDirector.ts, scoring.ts, levels/*.json
│  ├─ cinematics/ # timeline.ts, cameraDirector.ts, cutscenes/{intro,transition,outro}.ts
│  ├─ render/     # renderer.ts, waterMaterial.ts, sky.ts, postfx.ts, models.ts,
│  │              # particles.ts, lod.ts, quality.ts
│  ├─ audio/      # audioEngine.ts, music.ts, sfx.ts, voice.ts
│  ├─ dialogue/   # dialogueDirector.ts, types.ts
│  ├─ ui/         # screens/*, hud/*, subtitles.tsx, handCursor.tsx, leaderboard.tsx
│  ├─ persistence/# scoreRepository.ts, idbRepository.ts, remoteRepository.ts, export.ts
│  └─ debug/      # overlay.ts, handEmulator.ts, cheats.ts
├─ tests/{unit,e2e,fixtures/hand-traces}/
├─ docs/{DECISIONS.md,TUNING.md,ASSETS.md,PLAN.md}
├─ package.json  vite.config.ts  tsconfig.json  README.md
```

## 8. Game loop and determinism

- **Fixed-timestep simulation** at 60 Hz with an accumulator; render at display rate with interpolation between the last two sim states.
- **Seeded PRNG** (mulberry32 or similar) injected everywhere; no `Math.random()` in sim code.
- **Tick order:** `Input → Intent smoothing → FSM/phase update → Water → Helicopter → Cable/Claw → Survivors → Sharks/Director → Boat/Course → Collisions → Scoring/Clock → Events flush → Dialogue/Audio/Camera → Render`.
- **Time scale:** a global `timeScale` supports slow-motion beats. The **active gameplay clock** advances only in gameplay states, only while tracking is healthy and not paused, and scales with real time, not `timeScale`.

## 9. Game state machine

```
BOOT → LOADING → CAMERA_PERMISSION → CAMERA_TEST → CALIBRATION → TITLE(attract)
  → PLAYER_SELECT → TUTORIAL(optional) → INTRO_CINEMATIC → RESCUE_PHASE
  → TRANSITION_CINEMATIC → BOAT_PHASE → OUTRO_CINEMATIC → RESULTS → LEADERBOARD → (TITLE or PLAYER_SELECT)

Failure edges:   RESCUE_PHASE (all lost) → GAME_OVER → RESULTS
                 BOAT_PHASE (hull = 0)    → GAME_OVER → RESULTS
Overlays:        PAUSED, TRACKING_LOST, SETTINGS (can overlay most states)
```

Rules: every state has `enter()`, `update(dt)`, `exit()`; transitions are explicit and logged; cinematics are cancelable (skip) and call a `finalizeSkipped()` that sets world state exactly as if the cinematic had finished.

## 10. Core data contracts (TypeScript)

```ts
export type Hand = 'left' | 'right';

export interface HandSample {
  present: boolean;
  palm: { x: number; y: number };   // calibrated 0..1, mirrored so x grows to the player's right, y grows upward
  openness: number;                 // 0 = fist, 1 = fully open (scale-invariant)
  gesture: 'None' | 'Open_Palm' | 'Closed_Fist' | 'Thumb_Up' | 'Pointing_Up' | 'Victory' | 'Thumb_Down' | 'ILoveYou';
  indexTip: { x: number; y: number };  // for UI cursor
  pinch: number;                    // 0..1, thumb-tip to index-tip closeness
  confidence: number;
  tMs: number;
}

export interface HandFrame { left: HandSample | null; right: HandSample | null; tMs: number; }

export interface ControlIntent {
  // Rescue phase
  heliTargetX: number;    // -1..1 → mapped to level bounds
  winchTarget: number;    // 0..1  (0 = fully retracted, 1 = fully extended)
  gripClosed: boolean;
  // Boat phase
  steer: number;          // -1..1
  throttle: number;       // 0..1
  // UI/meta
  cursor: { x: number; y: number; active: boolean };
  select: boolean;        // dwell-complete or pinch
  back: boolean;
  pauseToggle: boolean;
  trackingState: 'ok' | 'degraded' | 'lost';
}

export interface IntentProvider { poll(tMs: number): ControlIntent; dispose(): void; }
// Implementations: HandsIntentProvider, KeyboardMouseIntentProvider, ReplayIntentProvider
```

All gameplay code depends on `ControlIntent` only. Nothing in `sim/` or `game/` may import from `input/handTracker`.

## 11. Event bus (examples)

`SURVIVOR_STATE_CHANGED`, `SHARK_TELEGRAPH`, `SHARK_STRIKE`, `SURVIVOR_SAVED_FROM_STRIKE`, `SURVIVOR_LOST`, `CLAW_CLOSED`, `CLAW_OPENED`, `SURVIVOR_GRABBED`, `SURVIVOR_RELEASED`, `SURVIVOR_DELIVERED`, `MEGALODON_WARNING`, `MEGALODON_BREACH`, `ALL_ABOARD`, `BOAT_COLLISION`, `BOAT_NEAR_MISS`, `HULL_CRITICAL`, `ISLAND_SIGHTED`, `LANDED`, `TRACKING_LOST`, `TRACKING_RESTORED`, `PHASE_COMPLETE`.

Dialogue, audio, camera direction, scoring, and UI all subscribe to events. Sim systems never call them directly.

## 12. Rendering architecture notes

- Single `WebGLRenderer`, one main scene, a separate lightweight cockpit overlay scene for first person.
- Instanced rain streaks and spray; pooled splash and foam sprites; GPU-skinned or vertex-shader-animated sharks.
- Quality tiers `Low/Medium/High` plus dynamic resolution scaling (target frame time 16.6 ms; scale between 0.6× and 1.0× pixel ratio).
- Lightning flashes drive a global light intensity curve and a post-FX flash (respect the reduced-flash accessibility setting).

## 13. Persistence architecture

`ScoreRepository` interface: `saveRun(run)`, `listRuns(filter)`, `listPlayers()`, `exportCsv()`, `exportJson()`, `clearAll()` (behind a confirmation gesture). Default `IdbScoreRepository`. Optional `RemoteScoreRepository` enabled by env vars. Runs are append-only.

---

# PART E: INPUT AND GAMEPLAY SPECIFICATION

## 14. Input specification (hands)

### 14.1 Camera pipeline
- Request `getUserMedia({ video: { width: 640, height: 480, frameRate: 30, facingMode: 'user' } })`. Prefer 640×480; higher resolution does not help and costs latency.
- Drive detection with `requestVideoFrameCallback` where available.
- Display the video **mirrored** (selfie view) in the preview, and convert landmark x to `1 - x` so that moving a hand to the player's right moves things to the screen's right.
- Show a small preview with landmark overlay during calibration and an optional tiny preview in gameplay (toggle in settings).

### 14.2 Handedness
MediaPipe's handedness label assumes a mirrored image. Browser webcam frames are not mirrored. Do **not** trust the label blindly:
1. During calibration step 1, ask the player to raise **only their left hand**, then **only their right hand**, and store a `swapHandedness` flag.
2. At runtime, if both detected hands receive the same label, or labels disagree with the screen-position order, assign by mirrored x-position (smaller x = left hand).
3. Keep a short-term identity tracker (nearest-neighbor between frames) so briefly crossing hands do not swap roles.

### 14.3 Per-hand features
- **Palm center:** mean of landmarks 0, 5, 9, 13, 17 (wrist and the four finger bases).
- **Palm size:** distance from landmark 0 (wrist) to landmark 9 (middle finger base). Use it to normalize everything.
- **Openness:** for the four fingers (index/middle/ring/pinky), average of `dist(tip, wrist) / dist(base, wrist)`, then remap using the player's calibrated closed/open extremes to 0..1.
- **Open/closed with hysteresis:** closed when openness < 0.35 for ≥ 120 ms; open when > 0.60 for ≥ 120 ms.
- **Pinch:** `dist(thumbTip, indexTip) / palmSize`, hysteresis-thresholded; used only for UI.
- **Canned gestures** from the recognizer are used for UI and pause, not for continuous control.

### 14.4 Smoothing
Apply a **One-Euro filter** to each palm coordinate (start values: `minCutoff = 1.2 Hz`, `beta = 0.03`, `dCutoff = 1.0 Hz`). Expose these in the debug overlay for live tuning. Apply an additional dead zone of ±6% around neutral for the steering wheel angle.

### 14.5 Calibration (≈20 s, hands-only)
1. **Show your hands:** raise left, then right (handedness check; show landmarks).
2. **Reach box:** "Move your right palm to the far left, far right"; "Move your left palm as high and as low as is comfortable." Store min/max; shrink by 10% to make extremes easy to hit; define a neutral rest position.
3. **Grip range:** "Open your left hand wide... now make a fist." Store openness extremes.
4. **Confirm:** a 5-second mini-sandbox where the player moves a dummy helicopter and winch and sees the rails respond. Save the calibration to `localStorage`. Offer "Recalibrate" from the pause menu.

### 14.6 Intent providers
- **HandsIntentProvider:** the production path.
- **KeyboardMouseIntentProvider:** a fully functional fallback for accessibility and debugging (mouse X = right palm X, mouse Y = left palm Y, left mouse button = fist, `A/D` steer, `W/S` throttle, `Esc` pause).
- **ReplayIntentProvider:** replays recorded hand-landmark traces or scripted intents. Used by unit and e2e tests and by "competent/idle player" bots (see P-06).
- **Hand emulator overlay (dev):** draggable on-screen palms that generate `HandFrame`s without a webcam.

### 14.7 Tracking loss
| Time without a hand | Behavior |
|---|---|
| 0–400 ms | Hold last filtered value (grace) |
| 400 ms–1 s | Ease to a **safe neutral**: helicopter holds position, winch holds length, claw keeps its current state, boat holds heading and eases to cruise |
| > 1 s | Show `TRACKING_LOST` overlay ("Show your hands"), set `timeScale` to 0.15, pause the shark director, pause the active clock |
| Restored | 1.5 s countdown ring, then resume; no sudden jumps (blend intent from neutral to current over 300 ms) |

### 14.8 Ergonomics and assists
- Use only the central ~70% of the camera frame for control ranges; the outer band is a soft clamp.
- Short sessions (~5 minutes total), a rest beat between phases (cinematics let arms drop).
- A configurable **stabilization assist** (default 35%) damps cable swing when the winch is nearly stationary. A **soft aim assist** (default on, small) eases helicopter X slightly toward a nearby grabbable survivor when the picker is low. Both are disabled in "Pure" mode and flagged in the run log.

---

## 15. Scene layout and world units

Units are meters; Y is up; sea level at y = 0; gameplay lies on the **X–Y plane** (Z offsets are cosmetic, ±1.5 m). X increases to the player's right.

| Element | Default position / size |
|---|---|
| Playable X range | −80 m to +80 m |
| Helicopter altitude | y = 26 m (slight bob), hovering |
| Wooden debris (large wreck piece) | centered x ≈ −32 m, ≈ 9 m × 5 m, standing survivors (5) |
| Floating survivors (3) | x ≈ −58, −41, −8 (in life jackets) |
| Rescue boat (stationary in phase 1) | x ≈ +52 m, deck 7 m wide, drop zone marked |
| Sharks (3 normal) | 3.5–4.5 m long, circling the group at radius 10–22 m |
| Megalodon | ≈ 20 m long (exaggerated for cinema); mostly a shadow and fin until the breach |
| Camera (gameplay) | three-quarter chase view, slightly above and behind the helicopter, wide FOV (~55°), smooth look-ahead toward the picker and targets |

## 16. Phase 1: Rescue gameplay specification

### 16.1 Controls (summary)
| Hand | Gesture | Effect |
|---|---|---|
| **Right palm** | move left/right | Helicopter target X (spring-damper), bank angle follows acceleration, rotor wash ring tracks on the water |
| **Left palm** | move up/down | Cable length: up = retract, down = extend. Rate-limited winch (extend ≤ 7 m/s, retract ≤ 9 m/s). Cable length 3–25 m |
| **Left palm** | open / fist | Open = claw expanded (open radius 1.4 m); fist = claw contracted (closed radius 0.35 m) |

### 16.2 Picker (claw) rules
- **Capacity:** 2 survivors per lift (config).
- **Grab:** on the open→closed transition, any survivor whose center is within 1.1 m horizontally and ±1.2 m vertically of the claw center (and in a grabbable state) is captured, nearest first, up to capacity. Captured survivors hang below the claw with a flailing/dangling animation and panic dialogue.
- **Carry hazards:** if the claw (with survivors) hangs lower than 1.5 m above the surface while sharks are near, the carried survivors may be bitten. Pull up quickly.
- **Release:** requires the claw open for ≥ 250 ms. Release rules:
  - Over the boat drop zone and ≤ 2.0 m above the deck: **safe landing** (bonus).
  - Over the drop zone, 2–5 m: **hard landing** (no bonus; survivor stays alive).
  - Over the drop zone, > 5 m: **injured landing** (survivor alive, score penalty).
  - Anywhere else above water: survivor falls into the water as a **floating survivor** (recoverable).
- **Water contact:** dipping the claw in the water is allowed. A shark bite on the picker causes a 1.5 s "jam" (claw cannot change state), signaled by sparks and sound.

### 16.3 Survivor states

```
ON_DEBRIS → (shark knock) → FLOATING
FLOATING / ON_DEBRIS → (telegraphed) TARGETED → (strike resolves) LOST
TARGETED → (grabbed in time) GRABBED  [QUICK-SAVE bonus]
GRABBED → IN_TRANSIT → RELEASED_SAFE / RELEASED_HARD / FALLING → ON_BOAT (terminal, safe)
FALLING (missed boat) → FLOATING
```
Each state has a distinct pose/animation, a distinct HUD icon **shape** (not color alone), and dialogue triggers.

### 16.4 Camera behavior in Phase 1
The `CameraDirector` keeps a readable gameplay shot, with reaction shots as brief overlays: a 0.6-second slow-motion close-up on a **quick-save**, a handheld push-in on a shark **strike**, a low-angle swoop on the **Megalodon breach**, and a satisfying wide when the **last survivor is delivered**. Never block the player's view of the picker for more than 1 second.

## 17. Shark threat system (`SharkDirector`)

### 17.1 Concept
Sharks circle until the director "arms" an attack. The director increases pressure with elapsed active time and with the number of unrescued survivors, but obeys fairness rules.

### 17.2 Attack lifecycle
`CIRCLE → STALK (telegraph ≥ 1.8 s) → STRIKE (≈ 0.6 s) → RESOLVE → RETREAT`

- **Telegraph:** a fin line cuts toward the target, water churns, an audio sting plays, the target survivor shows a pulsing icon and shouts, other survivors react.
- **Resolve:**
  - Target **floating** and still in place: **lost** (non-graphic).
  - Target **on debris edge:** 50% chance **lost**, otherwise **knocked into the water** (becomes floating).
  - Target on debris center: sharks **bump** the debris (splash, shake, no loss), raising stress.
  - Target **grabbed** and above water: strike misses (**quick-save** bonus).
  - Target hanging low (< 1.5 m above water): can be bitten.

### 17.3 Pressure curve and fairness rules (defaults)
- No attack in the first **20 s** of active rescue time.
- Minimum interval between attacks: lerp from **14 s** (early) to **7 s** (late) as `threat` goes 0 → 1. `threat = clamp(activeTime / 180, 0, 1)` blended with unrescued ratio.
- **Max concurrent attacks:** 1 until threat ≥ 0.6, then 2.
- **Target selection:** weighted by vulnerability (floating > debris edge > debris center), distance to the shark pack, and recent-target cooldown (no survivor targeted twice in 10 s unless they are the only one left).
- **Telegraph is never shortened below 1.5 s**, regardless of difficulty.
- **Winnability guarantee:** if the helicopter is currently within reach of the targeted survivor (heli X within 25 m, picker able to reach in under 1.5 s), delay the strike by up to 0.8 s once. The game should feel dangerous, not rigged.
- **Idle penalty:** if the player makes no successful grab for 25 s, shorten the minimum interval by 25% and make survivors shout for help. This is the "sharks keep attacking idle players" rule (R-06).

### 17.4 Megalodon set-piece
- Triggered **once** at 50% of par time (default 75 s) or when ≥ 4 survivors have been delivered, whichever comes first.
- **Warning phase (4 s):** giant shadow, water bulge, dialogue ("That shadow is a building!"), dread music swell.
- **Breach:** the Megalodon surfaces near the debris, the wooden piece breaks apart, and remaining debris survivors fall into the water as floating survivors. Slow-mo, camera swoop, screen shake, heavy audio. Never directly kills a survivor, but sharks smell blood and the pressure curve steps up by +0.15.

### 17.5 End of Phase 1
- **Success:** no survivor remains in a rescue-eligible state (all alive survivors are `ON_BOAT`). Play `ALL_ABOARD` and start the transition cinematic.
- **Failure:** all survivors lost (`GAME_OVER`, still logged).
- Partial loss is not failure.

## 18. Phase 2: First-person boat run specification

### 18.1 POV
Cockpit view: dashboard, windshield with water droplets, wipers (cosmetic), a visible steering wheel with hands that mirror the player's hands, survivors seated behind with idle animations and head sway, a swinging lantern. Camera sways with wave motion and speed, with gentle shake on impacts.

### 18.2 Course (~900 m, ≈ 95–110 s)
| Segment | Distance | Content |
|---|---|---|
| S1 Open water | 0–150 m | Easy steering, learn throttle, lighthouse beam visible on the horizon as a guide |
| S2 Debris field | 150–350 m | Floating wreckage, barrels, drifting life rafts (collisions scrape the hull) |
| S3 Fog and reef | 350–600 m | Reduced visibility, rock slalom, **Megalodon lunge #1** telegraphed by a shadow and a wake |
| S4 Rogue swell | 600–780 m | Big wave swell (speed and sway change), **lunge #2** from the opposite side |
| S5 Approach | 780–900 m | Narrow channel, dock/beach landing zone with lights; slow to ≤ 4 m/s to land smoothly |

### 18.3 Controls (both palms as a steering wheel)
- **Steer:** angle of the line from left palm center to right palm center: `θ = atan2(y_right − y_left, x_right − x_left)`. Dead zone ±4°, full lock at ±35°, smoothed and rate-limited.
- **Throttle:** mean vertical position of both palms mapped to **0.4–1.0** (auto-cruise floor of 0.4 means dropped hands slow the boat but never stall it). Raise both hands = faster; lower = slower. Slow down for the reef and the landing.
- **Pose independence:** control uses palm positions only; open palms and fists both work as "gripping the wheel."
- **Tracking loss:** hold the heading, ease to cruise speed, never crash because of lost tracking (see §14.7).

### 18.4 Boat dynamics (defaults)
Length 8 m; max speed 16 m/s; acceleration 4 m/s²; max turn rate 40°/s at full lock with speed-dependent authority; slight drift and wave-induced roll. **Steering assist** (≤ 15% authority) gently biases toward the safe corridor, toggleable.

### 18.5 Hazards and damage
- **Hull:** 100 HP. Debris −10, reef −25, Megalodon bite −35 (only if the player fails to evade; lunges are telegraphed ≥ 2 s). Collisions bounce the boat; the boat can never become stuck.
- **Fail:** hull reaches 0 → the boat capsizes → `GAME_OVER` (still logged).
- **Win:** enter the landing zone at ≤ 4 m/s. Entering faster costs 20 hull and still completes (no softlock).

### 18.6 Diegetic HUD
Compass, speed gauge, hull gauge, and a passenger-count plaque on the dash; a distant lighthouse as a waypoint; a subtle "slow down" light on the dash near the landing zone.

---

## 19. Cinematics

### 19.1 Cinematic list
1. **Intro (≈ 18 s):** ship split by the Megalodon, survivors scramble, fin passes camera, title card "SHIPWRECK." Skippable (hold a gesture for 1 s, or `Space`).
2. **Helicopter arrival (≈ 8 s):** searchlight sweep, pilot radio line, handover with "You have control."
3. **Mid-game set pieces:** Megalodon breach, first shark strike, last-survivor delivered (camera moments driven by the `CameraDirector`).
4. **Transition (≈ 8 s):** survivors on deck, captain gives the go-ahead, camera pushes into the cockpit window and cross-dissolves into the first-person seat.
5. **Outro (≈ 12 s):** landfall, survivors disembark, dawn light, helicopter fly-by.

### 19.2 Cinematic tooling
A `Timeline` supports tracks for camera (Catmull-Rom splines with FOV and roll), object animations, audio cues, dialogue cues, effects (shake, flash, letterbox, slow-mo), and event cues. Timelines are authored in code or JSON, are deterministic, and can be sought and skipped. Letterbox bars slide in for cinematics.

### 19.3 Look
Stormy dusk palette (teal shadows, amber highlights, orange life jackets as readable focal points), volumetric-looking fog, rain, lightning, bloom on lights and the searchlight, subtle film grain and vignette, shallow depth of field in cinematics only.

## 20. Audio and dialogue

### 20.1 Audio
- **Buses:** master, music, sfx, voice; separate volume sliders; ducking of music and sfx during voice lines.
- **Adaptive music:** layers (ambient drone, rotor rhythm, tension strings, percussion hits). Intensity follows `threat` and set pieces.
- **Spatial sfx:** rotor, shark splashes, rain, waves, boat engine, creaking wood. Rotor doppler/pitch from helicopter velocity.
- Audio starts only after the first user gesture (browser policy); the "raise both palms to begin" step also resumes the `AudioContext` (a click/keypress fallback is acceptable only for this step).

### 20.2 Dialogue system
- **Data-driven** lines in `public/dialogue/lines.en.json` (schema in Appendix C): speaker, trigger event, conditions, text, audio file, priority, cooldown, max plays, emotion tag.
- **Rules:** one voice at a time; higher priority interrupts lower; per-speaker cooldown (≥ 6 s); per-line cap (1–2 plays); do not play irrelevant lines (e.g., do not mention a lost survivor if they were never lost); idle chatter only during calm moments.
- **Presentation:** subtitle bar (speaker name colored plus icon) and optional world-space speech bubbles tracking the speaker, with automatic readable timing (≈ 15 characters/second, minimum 1.6 s).
- **Voice:** pre-rendered files in `public/audio/voice/`. Provide an offline script (`scripts/gen-voice`) to generate them from a licensed/consented TTS service, plus a runtime fallback to the Web Speech API with distinct pitch/rate per speaker.
- **Cast:** see Appendix B.

---

## 21. Scoring

### 21.1 Default formula (pure function, unit-tested)

**Phase 1 (rescue)**
| Item | Points |
|---|---|
| Survivor delivered alive | +1000 each |
| Safe landing (≤ 2.0 m) | +150 each |
| Hard landing | +0 |
| Injured landing | −100 |
| Multi-lift (2 delivered in one lift) | +200 per lift |
| Quick-save (picked up while targeted) | +100 each |
| Survivor lost | −400 each |
| Time bonus | `max(0, T_par1 − t1) × 8`, with `T_par1 = 150 s` |

**Phase 2 (boat)**
| Item | Points |
|---|---|
| Reached the island | +1500 |
| Hull integrity bonus | `hullHP × 10` (max 1000) |
| Smooth landing (≤ 4 m/s) | +300 |
| Time bonus | `max(0, T_par2 − t2) × 8`, with `T_par2 = 100 s` |

`score = max(0, sum)`. **Rank:** S ≥ 12000, A ≥ 9500, B ≥ 7000, C ≥ 4000, D otherwise (tunable in `tuning.ts`). Assist usage and "Pure" mode are flagged, and the leaderboard can filter on them.

### 21.2 Time taken
`totalActiveMs = rescueMs + boatMs`, where each phase's clock starts when control is handed to the player and stops at phase completion. Cinematics, pauses, tracking-loss pauses, and menus are excluded. Both phase times and the total are logged.

## 22. Logging and leaderboard

### 22.1 Run record (see schema in Appendix C)
`runId`, player (id, callsign), timestamps, outcome (`completed`, `failed_all_lost`, `failed_boat_destroyed`, `abandoned`), score, rank, total/phase times, survivors saved/lost, per-survivor outcomes, grab attempts and successes, quick-saves, hard drops, hull remaining, collision count, assists on/off, input mode (`hands`, `keyboardMouse`), RNG seed, build version, and a compact event log for audit/replay.

### 22.2 Leaderboard
Sorted by **score desc, then total time asc**. Filters: today / all time, assists on/off. Shows rank letter, callsign, score, time, survivors saved. Highlights the player's latest run. Export JSON/CSV. Clearing data requires a deliberate hands-only confirmation (hold both fists 2 s) or a typed confirmation with the keyboard.

---

# PART F: USER EXPERIENCE DEFINITIONS

## 23. Player journey

```
Attract/Title → "Raise both palms to begin" → Camera permission → Camera & lighting check
→ Calibration (≈20 s) → Callsign select → Flight School tutorial (≈45 s, skippable)
→ Intro cinematic → Rescue → Transition → Boat run → Outro → Results
→ Logged to leaderboard → "Next player" (gesture) → back to Callsign select
```

## 24. Hands-only UI interaction model

- **Cursor:** the right index fingertip drives a glowing cursor (fallback: right palm center). The left hand is ignored in menus except for "back."
- **Select:** **dwell** for 900 ms (a radial progress ring fills) **or** pinch (thumb to index). Hover targets enlarge by 8% and glow.
- **Back:** hold a left fist for 800 ms (ring fill at screen corner).
- **Pause (in-game):** both hands **Thumb_Up** held 1.2 s. Resume: the same, or dwell on "Resume."
- **Target sizes:** all interactive elements ≥ 120 px wide/tall at 1080p, spaced ≥ 24 px, to compensate for tracking jitter.
- **Text input (callsign):** a hands-only picker: three slots with up/down arrows, or an on-screen keyboard with large keys and dwell/pinch. Provide a list of cool preset callsigns (e.g., "MAVERICK," "SKYLARK," "TIDERUNNER"), plus the physical keyboard when present.

## 25. Screen definitions

| # | Screen | Purpose | Key UX details |
|---|---|---|---|
| S0 | Loading | Preload essentials, compat check | Progress bar, rotating hints, checks for WebGL2, camera, and secure context; clear error screens with fix instructions |
| S1 | Camera permission | Explain why the camera is needed | Plain-language privacy line: "Video stays on your device." One large button |
| S2 | Camera and lighting check | Ensure usable tracking | Mirrored preview with landmark overlay; warnings for dark scene, backlit scene, hands out of frame, distance too close/far |
| S3 | Calibration | See §14.5 | Step indicators, success chimes, retry on failure, always skippable using saved calibration |
| S4 | Title / attract | Invite players | Looping cinematic fly-by, "Raise both palms to begin," leaderboard top-3 ticker |
| S5 | Callsign select | Identify the player | Large controls, presets, shows the player's previous best if the callsign exists |
| S6 | Flight School | Teach controls | 4 checklist steps with live hand-rail feedback (see below), success auto-advances; skippable |
| S7 | Rescue HUD | Phase 1 play | See §26 |
| S8 | Boat HUD | Phase 2 play | Diegetic (see §18.6) |
| S9 | Pause | Safe stop | Resume, Recalibrate, Settings, Quit to title |
| S10 | Tracking lost | Recover | Dim and desaturate scene, big hand icons, "Show both palms" |
| S11 | Results | Celebrate and inform | Animated score tally, rank letter stamp, time taken, saved/lost portraits, quick stats |
| S12 | Leaderboard | Compare | Highlight the new entry, top 10 visible, filters, export |
| S13 | Game over | Failure with retry | Short, non-punishing; "Try again" and "Leaderboard" |
| S14 | Settings | Accessibility and quality | Volume sliders, subtitles size/background, reduced flashes/shake, quality tier, assists, color-blind markers, show camera preview |

## 26. HUD and feedback design

### 26.1 Phase 1 HUD
- **Control rails (critical feedback):** a horizontal rail at the bottom showing the right palm's mapped position and the helicopter's actual X; a vertical rail on the left showing the left palm's mapped winch target and actual cable length, with a claw icon showing open/closed. Ghost hand glyphs light up when each hand is tracked.
- **Survivor tracker (top center):** 8 pips with state shapes: ✓ safe, ○ waiting, ! targeted, ✕ lost, ↑ in transit.
- **Timer and score (top right):** active time and a running score.
- **World markers:** subtle pulsing rings on survivors; a red pulsing triangle on a targeted survivor; a shadow/ring under the picker to indicate where it would touch the water; a boat drop-zone glow when the claw carries survivors.
- **Camera preview:** an optional tiny mirrored thumbnail (bottom-left) with the hand landmark skeleton.

### 26.2 Feedback principles
- Every successful input has an immediate sound plus a visual response (claw clunk, winch whine, spark).
- Every danger has at least two cues (visual plus audio plus dialogue).
- No essential information is communicated by color alone.
- Respect reduced-motion and reduced-flash settings.

## 27. Accessibility
- Subtitles on by default, adjustable size, optional background plate.
- Seated/standing calibration; one-handed users can use `leftHandMode: 'winchOnly'` and the keyboard fallback for the right hand (documented, not default).
- Color-blind-safe state icons; high-contrast HUD option.
- Reduced screen shake, reduced lightning flashes, and reduced motion toggles.
- Audio-only cues always have a visual equivalent.
- Fatigue care: short run length, rest during cinematics, a "take a break" suggestion after repeated runs in kiosk mode.

## 28. Kiosk / event mode (`?kiosk=1`)
Auto-start the attract loop; return to the title after 60 s of inactivity; auto-advance from Results to Leaderboard after 20 s; "Next player" gesture; disable exiting full-screen; hide dev tooling; keep calibration saved but offer a quick recalibrate for each new player.

---

## 29. Art direction and asset strategy

- **Style:** stylized-realistic, low-poly forms with high-end lighting and post-processing, built for readability and performance (no photoreal heavy assets).
- **Readability:** survivors wear **orange life jackets** against dark teal water; interactive items get rim lighting; sharks are dark gray with pale bellies; the Megalodon is visibly a different, larger silhouette.
- **Milestone-friendly assets:** every asset has a **primitive-geometry placeholder** so the game runs end-to-end from M3 onward. Replace with glTF models later.
- **Required assets:** helicopter (rotor animation), cable and claw, 8 survivor character variants (low-poly, simple rigged poses: standing, floating, struggling, hanging, sitting, cheering), wooden debris (breakable into 3–5 chunks), rescue boat (deck plus cockpit interior), driver boat cockpit, sharks (swim cycle via skeletal animation or vertex-shader sway), Megalodon, island with dock, lighthouse, rocks/reef, floating debris, barrels, life raft.
- **Sources:** author in Blender or use CC0/permissive libraries (record every asset, license, and URL in `docs/ASSETS.md`). Optimize with `gltf-transform` (Draco/Meshopt, KTX2).
- **Budgets:** ≤ 500k visible triangles; ≤ 300 draw calls; ≤ 256 MB GPU texture memory; textures ≤ 2048 px (hero assets) and ≤ 1024 px otherwise.

## 30. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | 60 fps target; dynamic resolution scaling; hand inference ≤ 10 ms/frame main-thread cost on mid laptops (otherwise move to a worker) |
| Latency | camera-to-intent ≤ 80 ms median |
| Load | first interactive ≤ 5 s on broadband; initial download ≤ 25 MB gz |
| Reliability | no crash on tracking loss, camera disconnect, tab blur (auto-pause), or WebGL context loss (recover gracefully) |
| Privacy | camera frames processed locally only; no analytics by default; no personal data beyond a callsign; clear camera-indicator and "stop camera" control |
| Security | strict CSP; no third-party scripts at runtime; remote leaderboard (if enabled) uses a write-only anon role and server-side rate limits |
| Compatibility | Chrome/Edge latest two versions (primary); Firefox/Safari best effort with fallbacks |
| Resilience | if MediaPipe GPU delegate fails, fall back to CPU and lower resolution; if the camera is unavailable, offer the keyboard/mouse mode |

---

# PART G: DELIVERY PLAN

## 31. Testing and QA

- **Unit (Vitest):** water function parity (CPU vs GLSL port), One-Euro filter, openness/hysteresis, hand-to-intent mapping, calibration math, shark director (seeded cadence and fairness rules), scoring formula, score ordering, CSV/JSON export, dialogue director (cooldowns, no overlap).
- **Simulation bots:** "competent," "novice," and "idle" intent scripts run across 200 seeds in CI to verify the winnability targets in P-06.
- **E2E (Playwright, Chromium):** use `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<y4m/mjpeg>` plus `ReplayIntentProvider` to complete a full run headless; assert state transitions, final score, and log persistence.
- **Visual:** screenshot checkpoints for each screen and key set piece (for regression, not pixel-perfect).
- **Performance:** a perf script that records frame times in the Rescue and Boat phases at each quality tier and fails CI if the p95 frame time budget is exceeded.
- **Manual QA checklist (README):** lighting variations, glasses, long sleeves, seated vs standing, left/right swap test, camera disconnect, tab switch, full-screen toggle, 5-minute continuous play.

## 32. Milestones and gates

| M | Deliverable | Gate (must pass before moving on) |
|---|---|---|
| **M0** | Scaffold: Vite + TS strict + lint + test runner + debug overlay + CI scripts + `docs/PLAN.md` | `pnpm dev`, `pnpm test`, `pnpm build` all green |
| **M1** | Input pipeline: webcam → MediaPipe → filters → `ControlIntent`; calibration UI; hand emulator; keyboard/mouse provider; replay provider | P-01 targets met on recordings; both palms tracked; handedness correct; works with the emulator and without a webcam |
| **M2** | Scene: ocean (shared wave function), sky, lighting, placeholder helicopter, camera, quality tiers | 60 fps on the reference laptop at Medium; wave parity test passes |
| **M3** | **Vertical slice of Rescue** (primitive meshes): helicopter control, cable physics, claw, survivors, debris, boat, drop zone, HUD rails, no sharks | A full rescue of 8 survivors is completable by emulator and by hands |
| **M4** | Sharks and threat: SharkDirector, strike/lost logic, Megalodon set-piece, fail state, idle penalty | Bot targets (P-06) pass in CI |
| **M5** | Dialogue + audio + subtitles + adaptive music + speech bubbles | P-08 acceptance met; all cues present |
| **M6** | Cinematics: intro, handover, transition (POV match-cut), outro, camera director, post-FX | All cinematics skippable and deterministic |
| **M7** | Boat phase: cockpit, steering wheel control, course, hazards, Megalodon lunges, landing | Complete a full run with hands; no softlocks |
| **M8** | Scoring, logging, results, leaderboard, callsign select, kiosk flow, export | P-09 and P-12 acceptance met |
| **M9** | Polish: asset swap-in, performance tuning, accessibility, tutorial, settings, docs, deploy | All P-xx acceptance criteria met; Definition of Done satisfied |

**Cut line if time-constrained (drop in this order):** Web Speech/voice generation scripts → remote leaderboard → depth of field and extra post-FX → tutorial polish → Megalodon lunge #2 → speech bubbles. **Never cut:** calibration, tracking-loss handling, fairness rules, scoring/logging, subtitles, keyboard/mouse fallback.

## 33. Definition of Done

- All requirements R-01 to R-13 implemented and demonstrable.
- All P-01 to P-12 acceptance criteria verified and documented.
- `pnpm install && pnpm dev` runs; `pnpm build` produces a static site; `pnpm test` and `pnpm e2e` pass.
- A deployed (or locally previewable) HTTPS build with working camera access.
- README with: setup, controls, calibration guide, camera tips, quality settings, kiosk mode, score export, troubleshooting.
- `docs/DECISIONS.md` (every deviation and decision), `docs/TUNING.md` (all tuning knobs and rationale), `docs/ASSETS.md` (all assets and licenses).
- A final report listing: what was built, what was cut, known issues, and measured performance numbers.

## 34. Agent working agreement

1. **Plan first.** Produce `docs/PLAN.md` with the milestone breakdown, risks, and assumptions before writing code.
2. **Work in vertical slices.** Prefer a thin, playable, end-to-end game early over perfect individual parts.
3. **Always runnable.** After each milestone, the repo builds and runs. Commit with clear messages (`feat(input): ...`).
4. **Verify, do not assume.** Run tests, run the headless e2e, and capture screenshots. Never claim something works without evidence. If a camera is not available, use the emulator and the replay provider and say so.
5. **Keep tuning in one place:** `src/app/tuning.ts` plus `docs/TUNING.md`.
6. **No placeholder code left behind in P0 features;** no `TODO` without an issue note in `docs/DECISIONS.md`.
7. **Dependencies:** minimal, pinned, license-checked. Justify each new one in `DECISIONS.md`.
8. **Accessibility and fairness are features,** not polish. Build them in from M1 onward.
9. **Do not ask the human questions** unless blocked; decide, document, continue.
10. **Final answer format:** a concise report with how to run, what to test, links to docs, and an honest known-issues list.

---

# APPENDICES

## Appendix A: Tuning defaults (`src/app/tuning.ts`)

| Group | Parameter | Default |
|---|---|---|
| Helicopter | altitude | 26 m |
| | playable X range | ±80 m |
| | max lateral speed | 14 m/s |
| | spring ω / damping ζ | 3.2 rad/s / 0.9 |
| | max bank angle | 14° |
| Cable | min / max length | 3 m / 25 m |
| | extend / retract speed | 7 / 9 m/s |
| | swing damping | 0.35 |
| | stabilization assist | 35% |
| Claw | open / closed radius | 1.4 m / 0.35 m |
| | capacity | 2 |
| | grab tolerance (H / V) | 1.1 m / ±1.2 m |
| | close time | 0.25 s |
| | release debounce | 250 ms |
| | safe landing height | ≤ 2.0 m |
| Hands | One-Euro (minCutoff, beta, dCutoff) | 1.2 Hz, 0.03, 1.0 Hz |
| | open/closed thresholds | > 0.60 / < 0.35, 120 ms |
| | tracking grace / pause | 400 ms / 1000 ms |
| | dead zone | 6% |
| Sharks | normal shark count | 3 |
| | circle speed / strike speed | 4 m/s / 11 m/s |
| | telegraph | ≥ 1.8 s (floor 1.5 s) |
| | first attack not before | 20 s |
| | attack interval | 14 s → 7 s |
| | max concurrent | 1 → 2 at threat ≥ 0.6 |
| Megalodon | length | 20 m |
| | breach trigger | 75 s or ≥ 4 delivered |
| | pressure step on breach | +0.15 |
| Par times | T_par1 / T_par2 | 150 s / 100 s |
| Boat | length / max speed | 8 m / 16 m/s |
| | throttle floor | 0.4 |
| | max turn rate | 40°/s |
| | hull / damage (debris, reef, bite) | 100 / 10, 25, 35 |
| | landing speed limit | 4 m/s |
| Steering | dead zone / full lock | ±4° / ±35° |

## Appendix B: Cast and dialogue bank

**Cast (all adults/teens 17+; original characters)**

| Name | Role | Voice / personality |
|---|---|---|
| **Mara Voss** | First officer | Disciplined, steady, keeps order |
| **Hollis Brandt** | Retired fisherman | Dry, gallows humor, grumbles |
| **Jay Okafor** | Student deckhand, 19 | Panicky, talkative, big heart |
| **Priya Nair** | ER nurse | Calm, reassuring, checks on others |
| **Tommy Ricci** | Ship's cook | Jokes under pressure |
| **Dev Kapoor** | Honeymooner | Protective, earnest |
| **Ana Kapoor** | Honeymooner | Fierce, loud when scared |
| **Elias Rook** | Engineer | Terse, observant, calls out hazards |
| **Pilot Reyes** (radio) | Helicopter pilot | Calm professional |
| **Captain Oduya** | Rescue boat captain | Warm, authoritative |

**Sample lines (the agent must expand every trigger to ≥ 6 varied lines; keep each ≤ 12 words)**

| Trigger | Sample lines |
|---|---|
| Idle on debris | Mara: "Stay together! Nobody lets go of the wood." · Hollis: "Forty years fishing. Never seen a fin like that." · Jay: "Is it coming back? Tell me it's not coming back." |
| Helicopter approach | Ana: "Dev, listen. That's a rotor!" · Priya: "Wave slowly. Save your strength." · Jay: "HERE! WE'RE HERE!" |
| Player idle too long | Jay: "Why is it just hovering?! Come down!" · Tommy: "I did not survive a shipwreck to be lunch!" |
| Shark spotted | Elias: "Fin. Two o'clock." · Mara: "Everyone, stop kicking. Stay still." |
| Targeted | Jay: "It's looking at ME!" · Tommy: "Pull me up, pull me up, PULL ME UP!" |
| Saved from strike | Jay: "Did you SEE that?!" · Hollis: "Nice flying, kid." |
| Survivor lost | Ana: "No…!" · Mara: "Eyes forward. We keep the rest alive." |
| Grabbed | Tommy: "Got me! Oh, I love you, flying machine!" · Priya: "Breathe. Don't look down." |
| Dangling | Hollis: "My knees are in the next county!" · Jay: "Don't drop me, don't drop me!" |
| Safe delivery | Dev: "Solid floor. Beautiful, beautiful floor." · Oduya: "Got you. Blanket's coming." |
| Megalodon warning | Elias: "That shadow is a building." · Mara: "Everyone, brace!" |
| Megalodon breach | Hollis: "Merciful heavens." · Ana: "It's HUGE!" |
| All aboard | Oduya: "That's everyone! Hold on, we're going home." · Reyes: "All souls clear. Good flying." |
| Boat hazard ahead | Elias: "Debris, ten o'clock!" · Tommy: "Rock! Big rock! Left, LEFT!" |
| Boat collision | Dev: "We're okay, keep going!" · Hollis: "Gentle, kid. Gentle." |
| Megalodon lunge | Ana: "It's behind us!" · Mara: "Full throttle, now!" |
| Island sighted | Priya: "Lights… that's land." · Jay: "Is that a lighthouse? I'm gonna cry." |
| Landing | Dev: "Ana. We're alive." · Mara: "Every one of you counts. Remember that." |

## Appendix C: Data schemas

**Dialogue line (`lines.en.json`)**
```json
{
  "id": "targeted_jay_01",
  "speaker": "jay",
  "trigger": { "event": "SHARK_TELEGRAPH", "conditions": { "targetId": "jay" } },
  "text": "It's looking at ME!",
  "audio": "voice/jay/targeted_01.ogg",
  "priority": 8,
  "cooldownMs": 6000,
  "maxPlays": 2,
  "emotion": "panic"
}
```

**Level config (`levels/ship-01.json`)**
```json
{
  "seed": 20260101,
  "bounds": { "xMin": -80, "xMax": 80 },
  "debris": { "x": -32, "size": [9, 5], "survivorSlots": 5 },
  "survivors": [
    { "id": "mara",  "start": "debris", "slot": 0 },
    { "id": "elias", "start": "debris", "slot": 1 },
    { "id": "dev",   "start": "debris", "slot": 2 },
    { "id": "ana",   "start": "debris", "slot": 3 },
    { "id": "priya", "start": "debris", "slot": 4 },
    { "id": "jay",   "start": "floating", "x": -58 },
    { "id": "tommy", "start": "floating", "x": -41 },
    { "id": "hollis","start": "floating", "x": -8 }
  ],
  "boat": { "x": 52, "dropZoneWidth": 7 },
  "parTimes": { "rescueSec": 150, "boatSec": 100 }
}
```

**Run record**
```json
{
  "runId": "uuid",
  "player": { "id": "uuid", "callsign": "MAVERICK" },
  "startedAt": "2026-01-01T18:30:00Z",
  "outcome": "completed",
  "score": 11240,
  "rank": "A",
  "time": { "totalActiveMs": 231000, "rescueMs": 128000, "boatMs": 103000 },
  "survivors": { "total": 8, "saved": 7, "lost": 1, "perSurvivor": { "jay": "saved", "tommy": "lost" } },
  "stats": { "grabAttempts": 14, "grabSuccesses": 9, "quickSaves": 2, "hardDrops": 1, "hullRemaining": 75, "collisions": 3 },
  "settings": { "assists": { "stabilization": 0.35, "aim": true, "steering": true }, "inputMode": "hands", "leftHandMode": "dual" },
  "seed": 20260101,
  "buildVersion": "1.0.0",
  "events": [ { "t": 12430, "type": "SURVIVOR_GRABBED", "id": "tommy" } ]
}
```

## Appendix D: Original brief (verbatim, for traceability)

> **STORY**
> A ship gets wrecked by a Megalodon attack. Some of the passengers on the ship are floating in the ocean, and most of them are standing on a wooden piece. A group of hungry sharks keeps swimming around them.
>
> A rescue helicopter flew towards the scene. The player has to control the picker extended by the rescue helicopter and rescue the shipwrecked people, using both hands to control the picker; left palm to control the picker contraption and expansion, and right palm to control the helicopter in a horizontal axis.
>
> Then the wrecked people are safely put down to a rescue boat nearby. As the player takes more time, the sharks keep attacking the idle unrescued players. As all the alive people are put onto the rescue boat, the POV changes to a First Person Mode rescue boat driver, who has to safely steer the refugees to a nearby island.
>
> Each player should have a score, and the scores of each player should be logged, with time taken to complete.
>
> The game should be cinematic, with the shipwrecked people having dialogues to make the gameplay engaging.
>
> NOTE: THE GAME IS CONTROLLED WITH BOTH PALMS. THE GAME IS RAN ON THE BROWSER, SO CAREFULLY SELECT THE TECHSTACK NEEDED.

---

*End of SHIPWRECK master prompt. Begin with `docs/PLAN.md`, then execute M0 → M9.*