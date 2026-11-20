export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x))
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x
export const approach = (from: number, to: number, step: number) => from + clamp(to - from, -step, step)
export const damp = (from: number, to: number, rate: number, dt: number) =>
  lerp(from, to, 1 - Math.exp(-rate * dt))

export function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let n = Math.imul(state ^ (state >>> 15), 1 | state)
    n = n ^ (n + Math.imul(n ^ (n >>> 7), 61 | n))
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

export const clockLabel = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  return [Math.floor(wholeSeconds / 60), wholeSeconds % 60].map(n => String(n).padStart(2, '0')).join(':')
}
