<a id="top"></a>

<p align="center">
  <img src="docs/media/hero.svg" alt="SHIPWRECK. Bring them home. A rescue helicopter hovers over a stormy ocean on a midnight naval chart." width="100%" />
</p>

<p align="center">
  <strong>Fly into the storm. Pull people from the water. Get them home.</strong><br />
  A cinematic browser rescue game you can play with webcam hand gestures or keyboard and mouse.
</p>

<p align="center">
  <a href="#quick-start"><strong>LAUNCH THE GAME</strong></a> &nbsp; / &nbsp;
  <a href="#mission">THE MISSION</a> &nbsp; / &nbsp;
  <a href="#controls">CONTROLS</a> &nbsp; / &nbsp;
  <a href="#development">BUILD ROOM</a> &nbsp; / &nbsp;
  <a href="#deployment">DEPLOY</a>
</p>

<p align="center">
  <a href="https://github.com/MAC-Fest-2026/shipwreck/actions/workflows/ci.yml"><img src="https://github.com/MAC-Fest-2026/shipwreck/actions/workflows/ci.yml/badge.svg?branch=main" alt="Shipwreck continuous integration status." /></a>
  <br />
  <sub>TYPESCRIPT &nbsp; · &nbsp; THREE.JS &nbsp; · &nbsp; MEDIAPIPE &nbsp; · &nbsp; PREACT &nbsp; · &nbsp; VITE</sub>
</p>

<p align="center">
  <img src="docs/media/systems.svg" alt="Two mission phases. Eight lives in your hands. 114 voice lines. Camera inference stays local." width="100%" />
</p>

---

<a id="quick-start"></a>

## 01 / Clear for takeoff

**Clone. Install. Fly.** Every runtime asset comes aboard with the repository.

| Before you launch | Version / requirement |
| :--- | :--- |
| Node.js | **22.22.1** — pinned in [`.nvmrc`](.nvmrc) |
| Package manager | **pnpm 11.5.3** — pinned in [`package.json`](package.json) |
| Browser | Desktop Chrome or Edge with WebGL2 and hardware acceleration |
| Input | Webcam and two hands, or keyboard and mouse |

```sh
npm install --global pnpm@11.5.3
git clone https://github.com/MAC-Fest-2026/shipwreck.git
cd shipwreck
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL Vite prints, normally **<http://127.0.0.1:5173>**. Keep the terminal running; source changes reload automatically.

> [!TIP]
> Choose **Keyboard & mouse → callsign → Flight school** to jump into training. For palm controls, choose **Play with hands**, allow the webcam, and follow calibration.

Camera access needs **localhost or HTTPS**. Use the local server rather than opening `index.html` directly. No backend, API keys, or environment file is required. An up-to-date Corepack installation can also select the pinned pnpm version; older launchers may fail with pnpm 11.

<a id="mission"></a>

## 02 / Eight lives. One way home.

A passenger ship is sinking, with damage along the hull and stern. Survivors cling to a plank or tread water among the wreckage. Sharks circle below. You arrive with a helicopter, a rescue claw, and very little time.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>01 — Fly + rescue</h3>
      <p>The helicopter banks into turns and flares as you slow. Hold steady, close the claw over a survivor, and release low over the green rescue deck.</p>
      <p><strong>Brace as the 30 m Megalodon breaches beside the plank. The impact throws a swell that breaks it apart.</strong></p>
    </td>
    <td width="50%" valign="top">
      <h3>02 — Take the helm</h3>
      <p>Take the wheel at a modern marine helm with radar, chart, and engine displays. Thread the reefs and turn away from recurring shark and Megalodon lunges.</p>
      <p><strong>The sharks break off about 60 m from shore. Follow the lighthouse, slow down, and moor to the left of the pier.</strong></p>
    </td>
  </tr>
</table>

<p align="center">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/rescue.png" />
    <img src="docs/media/mission-preview.gif" alt="Gameplay replay: a helicopter winches survivors wearing orange life jackets, then the rescue boat navigates the swells from its multi-screen helm." width="960" />
  </picture>
  <br />
  <sub>ACTUAL GAMEPLAY · BUILT-IN REPLAY · WEBGL2</sub><br />
  <sub>Prefer a still? <a href="docs/media/rescue.png">Helicopter rescue</a> &nbsp; / &nbsp; <a href="docs/media/boat.png">Island run</a></sub>
</p>

### Built for the mission

| | What you get |
| :--- | :--- |
| **Choose your controls** | Two-palm tracking with calibration and tracking-loss recovery, or keyboard and mouse. |
| **A sea that moves with you** | Shared rendered waves and buoyancy, adjustable swell, a pitching boat, rain, searchlights, and a sinking wreck. |
| **Eight rigged survivors** | Fitted safety-orange life jackets and procedural `wave`, `tread`, `dangle`, and `idle` animations. Waterborne survivors tread upright with their heads and shoulders above the surface. |
| **Voices in the storm** | 114 Kokoro-82M lines, cockpit PA and radio chatter, and captions. Web Audio mixes the helicopter and speed-reactive boat engines with damage-scaled hull hits and breach splashes. |
| **Every run leaves a record** | Callsigns, scores, saved/lost survivors, and a local run log backed by IndexedDB. |
| **Camera processing stays local** | Self-hosted MediaPipe runtime and recognition model; webcam frames stay on the device. |
| **Ready at takeoff** | All 16 GLBs start loading and warming up behind the title. An early Start click queues the mission until the scene is ready. |

### Cast

| Survivor | Role | Model in `public/models/` |
| :--- | :--- | :--- |
| Mara Voss | First Officer | `mara-voss.glb` |
| Priya Nair | ER Nurse | `priya-nair.glb` |
| Ana Kapoor | Honeymooner | `ana-kapoor.glb` |
| Elias Rook | Engineer | `elias-rook.glb` |
| Tommy Ricci | Ship's Cook | `tommy-ricci.glb` |
| Dev Kapoor | Honeymooner | `dev-kapoor.glb` |
| Hollis Brandt | Retired Fisherman | `hollis-brandt.glb` |
| Jay Okafor | Student Deckhand | `jay-okafor.glb` |

<a id="controls"></a>

## 03 / Your hands. Your rescue.

| Action | Two-palm controls | Keyboard / mouse |
| :--- | :--- | :--- |
| **Move helicopter** | Move your **right palm** horizontally | Mouse horizontally or <kbd>←</kbd> / <kbd>→</kbd> |
| **Raise / lower winch** | Move your **left palm** up / down | Mouse vertically or <kbd>↑</kbd> / <kbd>↓</kbd> |
| **Close / open claw** | Close / open your **left palm** | Hold / release <kbd>F</kbd> or left mouse button |
| **Steer boat** | Tilt both palms like a steering wheel | <kbd>A</kbd> / <kbd>D</kbd> |
| **Boat throttle** | Raise / lower both palms | Hold <kbd>W</kbd> to accelerate, release to idle, or press <kbd>S</kbd> to slow faster. |
| **Pause** | Hold both thumbs up | <kbd>Esc</kbd> |

**Settings** includes a live **Wave Intensity** slider for the visible swell and boat motion. Under **Boat Throttle**, **Hold to Accelerate** is the keyboard default. Choose **Cruise Throttle (Sticky)** to set the throttle with <kbd>W</kbd> and <kbd>S</kbd> and keep that setting after release. **Survivor Count** sets the cast size for the next mission.

Scores and settings belong to the current browser and origin. Keeping the same host and port keeps the same local scorebook.

<a id="development"></a>

## 04 / Welcome to the build room

**Start here:** [`src/app/tuning.ts`](src/app/tuning.ts) for game tuning, [`src/ui/`](src/ui/) for the interface, and [`src/sim/`](src/sim/) for rescue, boat, and water behavior.

```text
shipwreck/
├── src/
│   ├── app/            Controller, settings, tuning
│   ├── game/           Session flow, replay, events, scoring
│   ├── sim/            Rescue, boat, shared water simulation
│   ├── input/          Hand tracking, calibration, keyboard, emulator
│   ├── render/         Three.js scene, models, graphics backends
│   ├── audio/          Web Audio, dialogue, engine and impact mix
│   ├── ui/             Preact views and styles
│   ├── persistence/    Local score storage
│   └── core/           Shared math
├── public/             Runtime GLBs, audio, decoders, art, and notices
├── tests/              Unit, fairness, and browser integration tests
├── scripts/            Static server, asset tools, performance harness
└── docs/               Design, plans, verification, and README media
```

### The command deck

| Command | Purpose |
| :--- | :--- |
| `pnpm dev` | Start Vite with live reload |
| `pnpm lint` | Lint the game and tests |
| `pnpm test` | Run unit tests and seeded fairness simulations |
| `pnpm build` | Type-check and build the production site |
| `pnpm e2e` | Run the Playwright browser suite |
| `pnpm serve` | Serve `dist/` with the project's security headers |
| `pnpm preview` | Preview `dist/` through Vite |
| `pnpm perf` | Run the browser performance harness |
| `pnpm format` | Format source, tests, configuration, and docs |

<details>
<summary><strong>Run the full verification sequence</strong></summary>

```sh
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

On Linux, browser system libraries may also be needed:

```sh
pnpm exec playwright install --with-deps chromium
```

Playwright starts its own dev server on **port 4173**. Stop any existing service on that port first. Coverage includes onboarding, replay and durable scores, synthetic-camera startup, tracking recovery, and WebGL2 water shader parity. See [verification notes](docs/VERIFICATION.md) for the evidence and pending physical-camera, human, and reference-hardware checks.

</details>

<details>
<summary><strong>Developer modes: replay, hand emulator, and kiosk</strong></summary>

Open the Vite URL with **`?debug=1`** for the hand emulator and the `window.shipwreck` debug API:

```js
await window.shipwreck.startReplay()
window.shipwreck.snapshot()
window.shipwreck.advanceToBoat()
```

**`?kiosk=1`** enables the kiosk flow and disables debug mode. Use the actual host and port printed by your dev server. Debug tools are available in development builds.

</details>

### Keep the crew in sync

1. Create a branch for your change and keep the game runnable.
2. Run the relevant checks before opening a pull request.
3. Commit **`pnpm-lock.yaml`** with dependency changes and update [asset records](docs/ASSETS.md) when adding or replacing media.

The live scene currently uses **WebGL2**. The adapters under `src/render/graphics.ts` and `src/render/webgpu/` prepare for future work; WebGPU needs its own `SceneMaterials` implementation before selection. The [V2 plan](docs/PLAN_V2.md) and [fidelity ledger](docs/FIDELITY_LEDGER.md) track that work.

<a id="deployment"></a>

## 05 / Ship the rescue

```sh
pnpm build
pnpm serve
```

Your production build is ready at **<http://127.0.0.1:4174>**. Deploy the contents of **`dist/`** to an HTTPS static host.

| Deployment detail | What matters |
| :--- | :--- |
| **Hosting** | Static files over HTTPS; localhost is trusted for local play |
| **Headers** | Apply [`public/_headers`](public/_headers), or the equivalent for your host |
| **WASM** | Serve `.wasm` with `Content-Type: application/wasm` |
| **Base path** | Vite's relative base supports a subdirectory such as `/shipwreck/` |
| **Assets** | Deploy the full build, including `mediapipe/`, `models/`, audio, and notices |
| **Server application** | None required |

Runtime files use ordinary Git storage and local URLs. A checkout with the licensed runtime assets builds without Git LFS or an external runtime CDN. Keep third-party model files within the distribution rights listed in [CREDITS.md](CREDITS.md). Generated dependencies, build/test output, raw assets, and local secrets stay outside version control.

<a id="asset-tools"></a>

## 06 / Under the hood

The checked-in assets are ready to use. Open these field notes when you want to change their sources.

<details>
<summary><strong>Maintain the runtime models</strong></summary>

The title screen starts the GLB loader in [`src/render/renderer.ts`](src/render/renderer.ts). It uses local Draco and Meshopt decoders. Tune scene sizes in `MODEL_SCALES` in [`src/render/models.ts`](src/render/models.ts). Finished models go in `public/models/`. Keep `rescue-vessel.glb` protected from the legacy procedural exporter.

</details>

<details>
<summary><strong>Maintain dialogue and sound overrides</strong></summary>

The authored bank is in [`scripts/dialogue.mjs`](scripts/dialogue.mjs); the runtime bank is [`public/dialogue/lines.en.json`](public/dialogue/lines.en.json).

The bundled Kokoro-82M `.ogg` clips use the dialogue IDs as filenames. See [CREDITS.md](CREDITS.md) for the voice presets. The legacy eSpeak generator in [`scripts/gen-voice.py`](scripts/gen-voice.py) produces the WAV fallbacks under `public/audio/voice/`.

Sound overrides under `public/audio/` use the clip name and one of `.mp3`, `.wav`, or `.ogg`, in that order. The four supplied recordings are `helicopter-engine.wav`, `boat-engine.wav`, `boat-rock-hit.wav`, and `water-splash.wav`. Recorded and synthesized audio share the same phase and event triggers. Boat shark splashes use 30–35% of the gain of the rescue-phase platform slam so the engine and hull impacts stay audible. Rebuild after changing the set of available files for production.

</details>

<details>
<summary><strong>Profile performance or update MediaPipe</strong></summary>

With the dev server on port 4173, run `pnpm perf`. The harness accepts `SHIPWRECK_BENCH_URL`, `SHIPWRECK_SOFTWARE_GL`, and `SHIPWRECK_P95_MS`; see [`scripts/perf.mjs`](scripts/perf.mjs).

Keep MediaPipe pinned. [`vite.config.ts`](vite.config.ts) patches the SDK's metrics transport and deliberately fails if an update changes that code. Review the patch and update the matching files under `public/mediapipe/` together when changing the SDK version.

</details>

<a id="field-notes"></a>

## 07 / The field notes

| Document | Open it for… |
| :--- | :--- |
| [Original brief](docs/SHIPWRECK.md) | The story, design pillars, systems, and acceptance targets |
| [Implementation plan](docs/PLAN.md) | The original milestone sequence |
| [V2 development plan](docs/PLAN_V2.md) | The graphics, physics, and asset roadmap |
| [Fidelity ledger](docs/FIDELITY_LEDGER.md) | Earlier implementation and evidence checkpoints |
| [Verification](docs/VERIFICATION.md) | Reproduction steps, historical test results, and manual gates |
| [Reference rig](docs/REFERENCE_RIG.md) | The provisional hardware and performance baseline |
| [Asset inventory](docs/ASSETS.md) | Asset sources, generation tools, and bundled notices |
| [Credits](CREDITS.md) | Model, dialogue, and sound attribution and licenses |

README illustrations are original project graphics. The animated preview and stills are captures of the game's built-in replay; they demonstrate gameplay rather than hardware performance. Keep [`public/notices/`](public/notices/) with distributed builds.

---

<p align="center">
  <strong>THE STORM IS LOUD. THE MISSION IS SIMPLE.</strong><br />
  <sub>Get them out. Get them aboard. Bring them home.</sub><br /><br />
  <a href="#top">↑ BACK TO THE SURFACE</a>
</p>
