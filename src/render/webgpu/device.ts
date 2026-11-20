export const webGpuLimits = {
  maxStorageBufferBindingSize: 256 * 1024 * 1024,
  maxBufferSize: 512 * 1024 * 1024,
  maxTextureDimension2D: 16384,
  maxComputeWorkgroupStorageSize: 32 * 1024,
} satisfies Partial<Record<keyof GPUSupportedLimits, number>>

export async function openWebGpuDevice(timestamps = false) {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser or context.')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter was available.')
  for (const [limit, minimum] of Object.entries(webGpuLimits)) {
    if (adapter.limits[limit as keyof GPUSupportedLimits] < minimum) {
      throw new Error('The WebGPU adapter does not meet ' + limit + ' (' + minimum + ').')
    }
  }
  // Three uses compression and depth features when present on an externally supplied device.
  const optional: GPUFeatureName[] = [
    'texture-compression-bc', 'texture-compression-astc', 'texture-compression-etc2',
    'depth32float-stencil8', 'float32-filterable', 'float32-blendable',
  ]
  if (timestamps) optional.push('timestamp-query')
  const device = await adapter.requestDevice({
    label: 'SHIPWRECK WebGPU',
    requiredLimits: webGpuLimits,
    requiredFeatures: optional.filter(feature => adapter.features.has(feature)),
  })
  return { adapter, device }
}
