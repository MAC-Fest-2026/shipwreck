# Runtime asset inventory

All paths below are included in a normal checkout. Optional source art in the local `images/` directory is not loaded by the game and is excluded from the repository.

| Asset | Source / maintenance | Notice |
| --- | --- | --- |
| `public/models/*.glb` | 16 game-ready models covering the helicopter, rescue vessel, wreck, island, lighthouse, reefs, both shark sizes, and eight survivors. The title screen preloads the roster with the local Draco and Meshopt decoders. | [Asset sources and license terms](../CREDITS.md) |
| Other scene models, sky, water, effects and synthesized sound | Project TypeScript/shader sources | Project-authored |
| `public/art/storm.webp` | Existing generated storm artwork supplied with this project | Generation/source metadata was not present in the workspace |
| `public/dialogue/lines.en.json` | Authored dialogue bank in `scripts/dialogue.mjs` | Project-authored text |
| `public/audio/*.ogg`, `public/audio/voice/**/*.wav` | 114 Kokoro-82M recordings with legacy eSpeak WAV fallbacks | [Voice presets and model license](../CREDITS.md#character-dialogue) |
| `public/audio/helicopter-engine.wav`, `boat-engine.wav`, `boat-rock-hit.wav`, `water-splash.wav` | Freesound recordings used as local sound overrides | [Recording sources and license terms](../CREDITS.md#sound-effects) |
| `public/decoders/` | Local Draco and Meshopt runtime decoders | `public/notices/Draco.txt`, `meshoptimizer.txt` |
| `public/mediapipe/*wasm*` | Matching WASM and loader files from the pinned `@mediapipe/tasks-vision` SDK | `public/notices/MediaPipe.txt` (Apache 2.0) |
| `public/mediapipe/gesture_recognizer.task` | Existing bundled MediaPipe gesture recognition model | Retained with the MediaPipe notice; original download metadata was not present |
| Barlow Condensed and IBM Plex Mono | Installed from pinned `@fontsource` packages and bundled by Vite | `public/notices/Barlow-Condensed.txt`, `IBM-Plex-Mono.txt` |
| Three.js, Preact, postprocessing, idb | Installed from pinned dependencies | Corresponding files under `public/notices/` |
| `docs/media/hero.svg`, `systems.svg` | Original project vector illustrations; lettering outlined from the bundled Barlow Condensed and IBM Plex Mono fonts | Corresponding font notices retained under `public/notices/` |
| `docs/media/mission-preview.gif`, `rescue.png`, `boat.png` | Chrome captures from the built-in replay showing the sinking wreck, rigged survivors, and multi-screen helm | Project gameplay footage; no physical camera footage or performance claim |

Runtime dependencies are locked in `pnpm-lock.yaml`. Preserve the notice directory in deployments. Source provenance gaps above are recorded explicitly rather than assigning new licenses to supplied files.
