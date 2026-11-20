export const waves = [
  // dir X, dir Z, amplitude, radians/m, radians/sec
  [0.37, 0.929, 0.51, 0.155, 1.13],
  [-0.78, 0.626, 0.26, 0.29, 1.45],
  [0.94, 0.341, 0.14, 0.47, 1.9],
  [-0.24, 0.971, 0.09, 0.87, 2.3],
] as const

// Height-field form of Gerstner. CPU queries use world X/Z directly.
export function waveHeight(x: number, z: number, t: number) {
  let height = 0
  for (const [dx, dz, amplitude, k, w] of waves) {
    height += amplitude * Math.sin((dx * x + dz * z) * k - w * t)
  }
  return height
}

export const waterGlsl = `
vec3 oceanSample(vec2 p, float t) {
  vec3 result = vec3(0.);
  ${waves.map(([x, z, amplitude, k, speed]) => `{
    vec2 dir = vec2(${x}, ${z});
    float phase = dot(dir,p)*${k} - t*${speed};
    result += vec3(${amplitude}*sin(phase), ${amplitude * k}*cos(phase)*dir);
  }`).join('\n')}
  return result;
}
`
