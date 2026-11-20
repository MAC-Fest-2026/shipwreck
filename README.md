# SHIPWRECK

A desktop browser rescue game: fly the helicopter, winch survivors onto the rescue boat, then steer them to the island. Play with two palms and a webcam, or use the keyboard and mouse. The game runs as a static site; no backend, API keys, or environment file is required.

## Clone and play

Install Node.js 22.22.1 (see `.nvmrc`), then install pnpm 11.5.3 (pinned in `package.json`):

```sh
npm install --global pnpm@11.5.3
git clone https://github.com/MAC-Fest-2026/shipwreck.git
cd shipwreck
pnpm install --frozen-lockfile
pnpm dev
```

Open the localhost URL printed by Vite, normally <http://127.0.0.1:5173>. Keep the terminal running; changes under `src/` reload automatically. An up-to-date Corepack installation can also select the pinned manager from `package.json`; older Corepack launchers may fail with pnpm 11.

Use a desktop Chrome or Edge browser with WebGL2 and hardware acceleration enabled. Choose **Keyboard & mouse**, select a callsign, and start Flight school or the mission. To use hands, choose **Play with hands**, allow camera access, and follow calibration. Webcam access requires localhost or HTTPS; opening `index.html` directly or using an ordinary HTTP LAN address does not work.

| Action | Keyboard / mouse | Hands |
| --- | --- | --- |
| Move helicopter | Mouse horizontally or Left / Right arrows | Move right palm horizontally |
| Raise / lower winch | Mouse vertically or Up / Down arrows | Move left palm up / down |
| Close / open claw | Hold / release F or left mouse button | Close / open left palm |
| Steer boat | A / D | Tilt both palms like a steering wheel |
| Increase / decrease throttle | W / S | Raise / lower both palms |
| Pause | Esc | Hold both thumbs up |

Lower the claw over a survivor, close it, lift, then release low over the green rescue deck. During the boat phase, avoid debris and shark wakes, follow the lighthouse, and slow down for landfall. Scores and settings are stored in that browser on that origin.

## Develop and verify

```sh
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

On Linux, Playwright may also need system libraries: `pnpm exec playwright install --with-deps chromium`. Browser tests run a dev server on port 4173 and cover onboarding, replay and score persistence, camera startup with synthetic video, tracking recovery, and shader parity. Unit tests include seeded fairness simulations. Physical webcam accuracy and hardware performance still need manual testing; see [verification notes](docs/VERIFICATION.md).

Open `http://127.0.0.1:5173/?debug=1` during development for the hand emulator and `window.shipwreck` replay/debug API. `?kiosk=1` enables the kiosk flow and disables debug mode. These query parameters also work if Vite selects another port; use the URL from your terminal.

| Location | Purpose |
| --- | --- |
| `src/app/` | App controller, settings, gameplay tuning |
| `src/game/`, `src/sim/` | Session flow, replay, scoring, rescue, boat, water |
| `src/input/` | Webcam tracking, calibration, keyboard and emulated input |
| `src/render/` | Three.js scene, procedural models, graphics |
| `src/audio/`, `src/ui/`, `src/persistence/` | Audio, interface, local score storage |
| `public/` | Bundled art, models, dialogue, voices, MediaPipe runtime/model, notices |
| `tests/` | Unit/fairness tests and Playwright browser tests |
| `scripts/` | Static server, asset generation, performance tooling |
| `docs/` | Design brief, development plans, asset inventory, verification |

The current live renderer uses WebGL2. `src/render/graphics.ts` and `src/render/webgpu/` contain preparatory backend code. A WebGPU `SceneMaterials` implementation must be supplied before selecting that backend. [The V2 plan](docs/PLAN_V2.md) and [fidelity ledger](docs/FIDELITY_LEDGER.md) describe future work rather than completed features.

Commit `pnpm-lock.yaml` with dependency changes. Use the pinned MediaPipe version: the Vite plugin patches its metrics transport and fails deliberately if an SDK update changes that code. When updating MediaPipe, review the patch and replace the matching bundled runtime files together.

## Production build

```sh
pnpm build
pnpm serve
```

The included static server serves `dist/` at <http://127.0.0.1:4174> with the project's security headers and WASM MIME type. `pnpm preview` is also available for a Vite preview. Deploy the contents of `dist/` to an HTTPS static host; there is no required server application. Apply the rules in `public/_headers` or equivalent headers for your host, and serve `.wasm` as `application/wasm`. Vite's relative base supports a repository subdirectory such as `/shipwreck/`.

All runtime assets are committed as ordinary Git files, including MediaPipe WASM/model files, GLB models and WAV dialogue. Git LFS, asset regeneration, and external CDNs are unnecessary for a normal clone/install/build. `node_modules/`, `dist/`, local secrets, test output, and unused full-resolution art references are excluded.

## Optional asset tools

The checked-in assets are ready to use. To edit their sources:

- Models originate in `src/render/models.ts`. With the dev server on port 4173, run `node scripts/export-models.mjs` to regenerate the two GLB files; this needs the Playwright Chromium installation.
- Dialogue lives in `public/dialogue/lines.en.json`. `node scripts/dialogue.mjs` regenerates that JSON from the authored bank, removing generated audio paths. Follow it with `python3 scripts/gen-voice.py` to regenerate WAVs and restore the audio references. Voice generation requires Python 3 and the eSpeak NG shared library/voice data; these are optional development tools.
- With a dev server on port 4173, run `pnpm perf` for the performance harness. Its optional `SHIPWRECK_BENCH_URL`, `SHIPWRECK_SOFTWARE_GL` and `SHIPWRECK_P95_MS` variables are described in `scripts/perf.mjs`.

Keep [the asset inventory](docs/ASSETS.md) and the bundled notices current when changing assets or dependencies. GitHub Actions runs lint, unit tests, build, and Chromium tests on pushes and pull requests.
