# SHIPWRECK implementation plan

Build a self-contained Chromium game with local camera inference, a playable camera-free path, and a static release. The supplied master prompt is the specification. The images guide staging, lighting, controls and HUD.

| Milestone | Scope | Evidence to collect |
| --- | --- | --- |
| M0 | Strict TypeScript, Vite, pnpm, lint, test, debug overlay and CI | Dev server responds, test and build exit successfully |
| M1 | Camera, calibrated hand identities, filters, replay and accessibility input | Landmark fixtures, real camera check and subsequent camera-free run |
| M2 | Shared wave field, procedural sky, lighting, camera and quality | Wave parity, screenshots, frame timings |
| M3 | Helicopter, winch, claw, eight survivors, drop zone and rails | Rescue all eight with seeded intents, then repeat with a webcam |
| M4 | Sharks, rescue breach and failure | 200-seed competent, novice and idle simulations |
| M5 | Reactive dialogue, subtitles and adaptive sound | Check line uniqueness, priority, cooldown and event coverage |
| M6 | Intro, arrival, deck-to-cockpit and landfall | Verify finish/skip state parity |
| M7 | Steering, course hazards, attacks and dock | Deterministic full run plus collision and failure checks |
| M8 | Scoring, phase clocks, IndexedDB, callsigns, export and kiosk | End-to-end score persistence and next-player loop |
| M9 | Art and controls polish, QA, local static build and documentation | Headless release checks and outstanding hardware test record |

R-01–R-08 are covered by the rescue/cockpit phases and their transitions. R-09 is covered by the run log, R-10–R-11 by staging and dialogue, R-12 by the camera path, and R-13 by the supplied brief and implementation docs.

P-01–P-02 require representative live cameras and players. P-03, P-04, P-10 and P-12 also require reference-hardware or human timing evidence. P-05 through P-09 and P-11 have automated simulation and browser substitutes. Keep pending live gates visible in the handoff and continue all checks the environment supports.
