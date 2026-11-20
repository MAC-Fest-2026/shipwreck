import { ACESFilmicToneMapping, RenderPipeline, WebGPURenderer } from 'three/webgpu'
import { float, pass, screenUV, smoothstep, vec4 } from 'three/tsl'
import { bloom, type default as BloomNode } from 'three/addons/tsl/display/BloomNode.js'
import type { RenderBackend } from '../graphics'
import type { SceneMaterials } from '../environment'
import { openWebGpuDevice } from './device'

export async function createWebGpuBackend(materials: SceneMaterials): Promise<RenderBackend> {
  const { device } = await openWebGpuDevice()
  const renderer = new WebGPURenderer({ device, antialias: false })
  try {
    await renderer.init()
    if (!('isWebGPUBackend' in renderer.backend)) throw new Error('Three.js could not initialize its WebGPU backend.')
  } catch (error) {
    device.destroy()
    throw error
  }

  renderer.setClearColor('#1f3640')
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  let pipeline: RenderPipeline | undefined
  let scenePass: ReturnType<typeof pass> | undefined
  let glow: BloomNode | undefined

  return {
    name: 'webgpu',
    canvas: renderer.domElement,
    materials,
    note: 'WebGPU preview · V1 scene',
    attach(scene, camera) {
      scenePass = pass(scene, camera)
      const color = scenePass.getTextureNode('output')
      glow = bloom(color, 0.36, 0.42, 0.55)
      const radius = screenUV.sub(0.5).length()
      const vignette = float(1).sub(smoothstep(0.22, 0.72, radius).mul(0.32))
      pipeline = new RenderPipeline(renderer, vec4(color.rgb.add(glow.rgb).mul(vignette), color.a))
    },
    watchLoss(onContext) {
      renderer.onDeviceLost = () => onContext(true)
      return () => { renderer.onDeviceLost = () => {} }
    },
    resize(width, height, ratio) {
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
    },
    render(scene, camera, effects) {
      if (effects && pipeline) pipeline.render()
      else renderer.render(scene, camera)
    },
    stats: () => renderer.info.render,
    dispose() {
      scenePass?.dispose()
      glow?.dispose()
      pipeline?.dispose()
      void renderer.dispose()
      device.destroy()
    },
  }
}
