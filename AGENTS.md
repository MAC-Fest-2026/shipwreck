# SHIPWRECK

SHIPWRECK is a desktop browser game. Fly a helicopter, winch survivors onto a rescue boat, then drive the boat to an island in first person. The game uses TypeScript, Three.js/WebGL2, Preact, and MediaPipe. Scores are stored in the browser.

If the docs and the code disagree, the code wins. `docs/SHIPWRECK.md` is the original plan. Check the current implementation before relying on it.

## Run locally

Use Node.js 22.22.1 (`.nvmrc`) and pnpm 11.5.3 (`package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL Vite prints, usually `http://127.0.0.1:5173/`, in desktop Chrome or Edge. Webcam mode needs permission and localhost or HTTPS. No `.env` file or backend is required.

## Controls

Choose a mode on the title screen, then select a callsign and open **Flight school** or **Start mission**.

- **Play with hands** uses the webcam and calibration. Move the right palm sideways to fly. Move the left palm up or down to operate the winch and close or open the hand to grab or release. Tilt both palms to steer the boat and raise or lower them together for throttle.
- **Keyboard & mouse** uses mouse movement or the arrow keys for flight and winch. Hold or release `F` or the left mouse button for the claw. Use `A`/`D` to steer the boat and `W`/`S` for throttle.

## Folder map

- `src/app/` starts and coordinates the game and contains settings and tuning.
- `src/game/` owns phase changes, scoring, events, and replay.
- `src/sim/` handles rescue, sharks, boat movement, and shared wave math.
- `src/input/` handles webcam tracking, calibration, keyboard and mouse, and the hand emulator.
- `src/render/` draws the scenes, cinematics, water, and models.
- `src/ui/`, `src/audio/`, and `src/persistence/` contain the interface, radio/audio, and local scores.
- `public/` contains runtime assets. `docs/`, `scripts/`, and `tests/` contain project notes, tools, and tests.

## 3D models

Put `.glb` files under `public/models/`. The loader in `src/render/renderer.ts` currently names `sar-helicopter.glb` and `rescue-vessel.glb`. Wire new files into the renderer to use them in the game. Other scene geometry is built in `src/render/models.ts`.
