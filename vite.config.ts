import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

function localVision(): Plugin {
  const endpoint = 'https://odml.pa.googleapis.com/v1/log'
  const telemetryCall = /this\.o\.send\(\{url:"https:\/\/odml\.pa\.googleapis\.com\/v1\/log",[^\n]*?e\?\.\("net-send-failed",t\)\}\)/
  return {
    name: 'shipwreck-local-vision',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@mediapipe/tasks-vision/') || !id.endsWith('/vision_bundle.mjs')) return
      // The pinned Web SDK exposes no public off switch. Discard its metrics locally.
      const patched = code.replace(telemetryCall, 't?.()')
      if (patched === code || patched.includes(endpoint)) {
        this.error('Review the MediaPipe metrics transport before updating the pinned SDK.')
      }
      return { code: patched, map: null }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [localVision()],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
    include: ['three', 'three/addons/utils/BufferGeometryUtils.js', 'three/addons/loaders/GLTFLoader.js',
      'three/addons/exporters/GLTFExporter.js', 'postprocessing', 'idb', 'preact', 'preact/hooks'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/*.test.ts'] },
})
