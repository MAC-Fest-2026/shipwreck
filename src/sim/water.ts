import { clamp } from '../core/math'

export const waveIntensity = { min: 0.5, max: 2.5, step: 0.1, default: 1.8 }

// Short-lived displacement from the rescue-phase breach. Base buoyancy stays on the ocean formula.
export function impactSwell(distance: number, age: number) {
  if (age < 0 || age > 3.6) return 0
  const front = distance - 12 * age
  return 1.05 * Math.sin(front * 0.88) * Math.exp(-front * front * 0.075 - age * 0.9)
    * clamp(age * 8) * clamp((3.6 - age) * 2)
}
export const waveUniforms = { waveIntensity: { value: waveIntensity.default } }

export function normalizeWaveIntensity(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, waveIntensity.min, waveIntensity.max)
    : waveIntensity.default
}

export function setWaveIntensity(value: number) {
  waveUniforms.waveIntensity.value = normalizeWaveIntensity(value)
  return waveUniforms.waveIntensity.value
}

// Ocean settings. Both simulation heights and the GLSL surface use these waves.
export const waves = [
  // dir X, dir Z, amplitude, radians/m, radians/sec
  [0.37, 0.929, 0.51, 0.155, 1.13],
  [-0.78, 0.626, 0.26, 0.29, 1.45],
  [0.94, 0.341, 0.14, 0.47, 1.9],
  [-0.24, 0.971, 0.09, 0.87, 2.3],
] as const

export const waveAmplitude = waves.reduce((sum, [, , amplitude]) => sum + Math.abs(amplitude), 0)

export interface WaveSlope {
  x: number
  z: number
}

// Height-field form of Gerstner. CPU queries use world X/Z directly.
export function waveHeight(x: number, z: number, t: number, slope?: WaveSlope) {
  const intensity = waveUniforms.waveIntensity.value
  let height = 0
  let slopeX = 0
  let slopeZ = 0
  for (const [dx, dz, amplitude, k, w] of waves) {
    const phase = (dx * x + dz * z) * k - w * t
    height += amplitude * Math.sin(phase)
    if (slope) {
      const gradient = amplitude * k * Math.cos(phase)
      slopeX += gradient * dx
      slopeZ += gradient * dz
    }
  }
  if (slope) {
    slope.x = slopeX * intensity
    slope.z = slopeZ * intensity
  }
  return height * intensity
}

const glslFloat = (value: number) => Number.isInteger(value) ? `${value}.0` : String(value)

// The sample returns height followed by the two analytical slopes.
export const waterGlsl = `
uniform float waveIntensity;
vec3 oceanSample(vec2 p, float t) {
  vec3 result = vec3(0.);
  ${waves.map(wave => {
    const [x, z, amplitude, k, speed] = wave.map(glslFloat)
    return `{
    vec2 dir = vec2(${x}, ${z});
    float phase = dot(dir, p) * ${k} - t * ${speed};
    result += vec3(${amplitude} * sin(phase), ${amplitude} * ${k} * cos(phase) * dir);
  }`
  }).join('\n')}
  return result * waveIntensity;
}
`
