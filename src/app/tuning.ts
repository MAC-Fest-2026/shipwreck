export const tuning = {
  tick: 1 / 60, seed: 20260101,
  rescue: {
    altitude: 26, span: 80, speed: 14, spring: 3.2, damping: 0.9,
    cableMin: 3, cableMax: 28.5, extend: 7, retract: 9, swingDamping: 0.35,
    deploy: 52, deckWidth: 7, deckY: 1.45,
    gripSeconds: 0.25, releaseSeconds: 0.25, grabX: 1.1, grabY: 1.2,
    capacity: 2, safeHeight: 2, injuredHeight: 5, par: 150,
  },
  shark: {
    grace: 45, earlyInterval: 19, lateInterval: 10, idleDelay: 25,
    telegraph: 1.8, strike: 0.6, repeat: 10, breachAt: 75, breachCount: 4, warning: 4,
  },
  boat: {
    length: 900, speed: 16, accel: 4, turn: 40 * Math.PI / 180, maxHull: 100,
    throttleFloor: 0.4, approach: 780, landingSpeed: 4, par: 100,
  },
  hands: {
    minCutoff: 1.2, beta: 0.03, dCutoff: 1, gripMs: 120,
    graceMs: 400, lossMs: 1000, recoveryMs: 1500, blendMs: 300,
    dwellMs: 900, backMs: 800, pauseMs: 1200,
  },
} as const
