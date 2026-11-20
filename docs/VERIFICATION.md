# Developer handoff verification

Checked on 20 November 2026 using Linux, Node.js 22.22.1, pnpm 11.5.3 and headless Chromium 159.0.8154.6 (Playwright build 1255). Graphics checks used SwiftShader software rendering and camera checks used Chromium synthetic video. These checks establish a runnable development checkpoint; reference-GPU performance and real-hand accuracy require separate measurements.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

The dependency install and checks were repeated in an isolated copy containing only the intended repository files, with a new dependency store. No existing `node_modules`, generated `dist`, private settings or external asset folders were copied into it. The pinned pnpm executable was used directly because the host's old Corepack 0.24 launcher fails with pnpm 11; the README uses a direct pnpm installation, and CI uses `pnpm/action-setup`.

| Check | Result / evidence |
| --- | --- |
| Frozen dependency install | Passed; 146 packages installed from the committed lockfile with pnpm 11.5.3 |
| Lint | `pnpm lint` passed |
| Unit and fairness | `pnpm test`: 6 tests passed in 2 files, including 200 seeded courses/attacks |
| Type checking and production build | `pnpm build` passed; includes `tsc --noEmit` |
| Browser integration | `pnpm e2e`: 5 tests covering keyboard onboarding/HUD/pause, deterministic repeated replay and persisted score, self-hosted camera initialization, emulated tracking loss/recovery, and actual WebGL2 water shader parity |
| Production root and subdirectory | Built game tested at `/` using `scripts/serve.mjs` and at `/shipwreck/` using an equivalent static mount; camera initialization, keyboard rescue HUD and pause succeeded under the bundled CSP, without page errors or failing HTTP responses |
| Runtime network requests | Production root/subdirectory smoke checks and the camera browser test observed only the local origin |
| Asset completeness | All 114 dialogue entries resolve to existing WAV files; both GLB headers and both WASM headers validated |
| Repository contents | Source, locked dependencies/configuration, tests, scripts, design docs, runtime assets and notices are included; dependencies, build/test output, local secrets and unused art references are excluded |

Playwright owns its dev server on port 4173 to ensure tests exercise this checkout. Stop any existing service on that port before running `pnpm e2e`. An interrupted run that reused an older server lost its connection; the final configuration disables server reuse. MediaPipe's package references an absent development source map, producing a non-fatal Vite warning; inference and the production build succeed.

## Scope of acceptance evidence

| Design gate | Current evidence and limits |
| --- | --- |
| P-01 hand tracking | Synthetic-video capture and local recognizer initialization passed; real tracking percentage, latency and five-minute identity stability remain manual |
| P-02 ergonomics | Seated/standing and different reach ranges remain manual |
| P-03 ocean | Browser test compares the actual WebGL2 shader against CPU heights within 1 cm; GPU timing/visual buoyancy review remain manual |
| P-04 cable usability | The replay completes rescues; representative novice and first-grab timing trials remain manual |
| P-05 grab/drop safety | Single-frame grip rejection is unit tested; the full noisy-gesture/recovery matrix is not certified |
| P-06 threats | Existing 200-seed fairness suite passes; first-time human rescue targets remain manual |
| P-07 cinematics | Skips are exercised on the browser play path; exhaustive skip-at-each-cue parity is not certified |
| P-08 dialogue | Dialogue/audio references are complete; a four-minute overlap/repetition audit is not certified |
| P-09 scores | Score rules, pause clocks, repeated score/time equality and reload persistence are exercised; every export/filter path is not certified |
| P-10 performance | No hardware frame-time, payload-budget, latency or soak acceptance claim is made from software rendering |
| P-11 determinism | Repeated seeded simulation and browser replay pass, including durable score reload |
| P-12 kiosk | Next-player transition and onboarding are exercised; gesture-only timing and physical-camera kiosk trials remain manual |

R-01–R-08 have automated functional evidence through the rescue/boat simulation, replay completion and browser HUD. R-09 has automated score and persistence evidence. R-10's cinematic quality and R-11's spoken delivery still need human review; the existing scene, voices and dialogue bank are included. R-12 has keyboard/emulator and synthetic-camera evidence, with physical palm control acceptance pending. R-13's supplied brief and implementation plans are retained.

## Build repairs in this handoff

The active renderer now uses the refactored beam's `mesh` and `intensity` fields correctly, and scene uniforms satisfy Three.js's shader-uniform type. The preparatory WebGPU backend takes an explicit `SceneMaterials` dependency instead of importing a missing module; its bloom type import matches the pinned Three.js declarations. The active playable scene remains WebGL2. The V2 plans and reference-rig targets are retained as pending development work.
