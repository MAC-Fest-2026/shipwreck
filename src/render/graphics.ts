import * as T from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing'
import { beam, environment, type SceneMaterials } from './environment'

export interface RenderBackend {
  name: 'webgpu' | 'webgl2'
  canvas: HTMLCanvasElement
  materials: SceneMaterials
  note: string
  attach(scene: T.Scene, camera: T.PerspectiveCamera): void
  watchLoss(onContext: (lost: boolean) => void): () => void
  resize(width: number, height: number, pixelRatio: number): void
  render(scene: T.Scene, camera: T.PerspectiveCamera, effects: boolean, delta: number): void
  stats(): { calls: number; triangles: number }
  dispose(): void
}

export function createCompatBackend(note: string): RenderBackend {
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setClearColor('#1f3640')
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  let composer: EffectComposer | undefined

  return {
    name: 'webgl2',
    canvas: renderer.domElement,
    materials: { environment, beam },
    note,
    attach(scene, camera) {
      composer = new EffectComposer(renderer, { frameBufferType: T.HalfFloatType })
      composer.addPass(new RenderPass(scene, camera))
      composer.addPass(new EffectPass(
        camera,
        new BloomEffect({ intensity: 0.36, luminanceThreshold: 0.55, mipmapBlur: true }),
        new VignetteEffect({ offset: 0.22, darkness: 0.32 }),
      ))
    },
    watchLoss(onContext) {
      const lost = (event: Event) => {
        event.preventDefault()
        onContext(true)
      }
      const restored = () => onContext(false)
      renderer.domElement.addEventListener('webglcontextlost', lost)
      renderer.domElement.addEventListener('webglcontextrestored', restored)
      return () => {
        renderer.domElement.removeEventListener('webglcontextlost', lost)
        renderer.domElement.removeEventListener('webglcontextrestored', restored)
      }
    },
    resize(width, height, ratio) {
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
      composer?.setSize(width, height, false)
    },
    render(scene, camera, effects, delta) {
      if (effects && composer) composer.render(delta)
      else renderer.render(scene, camera)
    },
    stats: () => renderer.info.render,
    dispose() {
      composer?.dispose()
      renderer.dispose()
    },
  }
}

export async function createBackend(compat: boolean, webGpuMaterials?: SceneMaterials) {
  if (compat) return createCompatBackend('WebGL2 Compat was selected.')
  if (!navigator.gpu) return createCompatBackend('WebGPU is unavailable in this browser or context.')
  if (!webGpuMaterials) return createCompatBackend('WebGPU scene materials are not available in this checkpoint.')

  try {
    const { createWebGpuBackend } = await import('./webgpu/backend')
    return await createWebGpuBackend(webGpuMaterials)
  } catch (error) {
    const note = error instanceof Error ? error.message : 'WebGPU initialization failed.'
    return createCompatBackend(note)
  }
}
