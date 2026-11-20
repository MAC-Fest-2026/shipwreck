# SHIPWRECK V2 implementation plan

The V2 brief governs the renderer, water, physics, assets, voice and helm. [The V1 brief](SHIPWRECK.md) governs story, flow, fairness, scoring, local records, kiosk and accessibility wherever V2 leaves those contracts in place.

## R0 feasibility

1. Check the shipped V1 flows and preserve a runnable WebGL2 Compat path.
2. Use Three.js r187 WebGPU for the existing game scene. Port the custom sea, sky, light beams and post effects to the node path. Report the selected backend and capability failures in the UI. Keep the R0 renderer labeled as a preview until the visual gates pass.
3. Execute four independent probes on native WebGPU when available. Exercise spectral FFT with depth-aware refraction and caustics, a 300,000-triangle PBR material with subsurface lighting, four shadow cascades with GTAO and SSR, and a dedicated deterministic Rapier worker stepping at 120 Hz with CCD on. Record settings, software or hardware adapter, timings and shortfalls in [performance reports](PERF_REPORTS/).
4. Keep first-run transfers small enough to test locally. The owner indicated hosting or download limits apply. Use transferable physics snapshots on any host and request the exact release constraints before setting pack sizes or deployment headers. Start asset and voice work with free and already licensed sources.
5. Use the provisional [reference rig](REFERENCE_RIG.md) until the owner specifies a machine. The development environment has no exposed hardware GPU or physical camera. Software WebGPU can test rendering and compute correctness.

## Milestone sequence

| Milestone | Work and evidence |
| --- | --- |
| R0 | Audit V1, port the live renderer, run the four feasibility probes, record asset and rig needs |
| R1 | Introduce fixed 120 Hz worker authority, adaptive 240 Hz CCD steps, snapshot transport, collider validation and seeded collision tests. Verify coverage before switching live gameplay to it |
| R2 | Integrate four spectral cascades, CPU buoyancy modes, near-field wakes, depth-aware water and caustics. Verify CPU/GPU wave agreement and visibility in every required state |
| R3 | Drive sky, water, clouds, lighting, fog and weather from one atmosphere state. Validate shadow and post captures and the horizon color sweep |
| R4 | Import distinct rigged great whites, tiger shark and Megalodon. Validate articulated collision, motion, skin and 4K close-ups |
| R5 | Build ragdolls, physical cradle and winch, fracture and impact-speed landing scoring. Check no clipping, winnability and scoring |
| R6 | Deliver the 6-DOF hull, non-centering helm, gated throttles, hands calibration and Sea Trials. Measure handling and novice completion |
| R7 | Build the island, reef, vegetation, weather and dock. Capture course and landfall shots |
| R8 | Audition three eligible voice engines, align speech, integrate synchronized subtitles, facial animation and spatial mix. Run the panel review |
| R9 | Profile the 12 shots per tier, validate streaming and comfort controls, run the 30-minute soak and obtain owner sign-off |

## Release boundaries

A test fixture verifies its own mechanism. Full-world collision coverage, repeatable end-to-end physics, 1440p Ultra performance, physical hand-input latency and the owner's golden-shot review require their respective evidence. [The fidelity ledger](FIDELITY_LEDGER.md) tracks gaps and requested decisions without changing the Ultra target.
