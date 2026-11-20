# Runtime asset inventory

All paths below are included in a normal checkout. Optional source art in the local `images/` directory is not loaded by the game and is excluded from the repository.

| Asset | Source / maintenance | Notice |
| --- | --- | --- |
| `public/models/sar-helicopter.glb`, `rescue-vessel.glb` | Project procedural models in `src/render/models.ts`; exported by `scripts/export-models.mjs` | Project-authored geometry |
| Other scene models, sky, water, effects and synthesized sound | Project TypeScript/shader sources | Project-authored |
| `public/art/storm.webp` | Existing generated storm artwork supplied with this project | Generation/source metadata was not present in the workspace |
| `public/dialogue/lines.en.json` | Authored dialogue bank in `scripts/dialogue.mjs` | Project-authored text |
| `public/audio/voice/**/*.wav` | Existing generated speech; reproducible using `scripts/gen-voice.py` with a local eSpeak NG installation | Synthetic voices; no voice service or credentials required |
| `public/mediapipe/*wasm*` | Matching WASM and loader files from the pinned `@mediapipe/tasks-vision` SDK | `public/notices/MediaPipe.txt` (Apache 2.0) |
| `public/mediapipe/gesture_recognizer.task` | Existing bundled MediaPipe gesture recognition model | Retained with the MediaPipe notice; original download metadata was not present |
| Barlow Condensed and IBM Plex Mono | Installed from pinned `@fontsource` packages and bundled by Vite | `public/notices/Barlow-Condensed.txt`, `IBM-Plex-Mono.txt` |
| Three.js, Preact, postprocessing, idb | Installed from pinned dependencies | Corresponding files under `public/notices/` |

Runtime dependencies are locked in `pnpm-lock.yaml`. Preserve the notice directory in deployments. Source provenance gaps above are recorded explicitly rather than assigning new licenses to supplied files.
