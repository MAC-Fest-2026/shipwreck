import * as T from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing'
import { tuning } from '../app/tuning'
import { clamp, damp, lerp, seededRandom } from '../core/math'
import { timelines, type Session } from '../game/session'
import { boatBuoyancyCenter, boatLungeTiming, boatSharkPose, harbor, type BoatLunge, type FloatingHazard } from '../sim/boat'
import { boardBreachHeight, rescueBoardX, rescuePlaneZ, roster } from '../sim/rescue'
import { waterGlsl, waveHeight, waveUniforms } from '../sim/water'
import { beam, boatSplash, boatSplashDuration, environment, lanternGlow, placeBeam, wreckAtmosphere, wreckDebris } from './environment'
import { claw, cockpit, dock, fitModelScale, hazard, HelicopterModel, instanceRocks, islandPlantings, islandSurface,
  light, lighthouseFoundation, lighthouseSite, MODEL_SCALES, mooringLights, person, prepareCruiseWreck, prepareIsland, prepareLighthouse,
  prepareRockSet, raft, rescueVessel, SharkModel, wreck, type ScaledModel } from './models'

export type Quality = 'low' | 'medium' | 'high'
export interface RenderSettings { quality: Quality; reduceMotion: boolean; flashes: boolean }
const R = tuning.rescue
const amber = new T.Color('#ffc078')
const cyan = new T.Color('#73e6d5')
const danger = new T.Color('#ff664c')
const { smoothstep } = T.MathUtils
const bootClearance = 0.02
const wreckX = -42
const wreckZ = -52
// Authored GLB coordinates. The bow points along +X.
const wheelhouseEye = new T.Vector3(6.52, 3.72, 0)
// Waterline measured after the rescue vessel is aligned to the recovery deck.
const vesselWaterline = { center: 4.4, halfLength: 7.96, halfBeam: 2.83 }
const fallbackWaterline = { center: 4.25, halfLength: 6.25, halfBeam: 1.75 }
// Replace the exterior window assembly with slimmer pillars for the interior view.
const wheelhouseOccluders = new Set([
  'Laminated_pilothouse_lights', 'Formed_window_apertures', 'Ceramic_obscuration_bands',
  'Glazing_flange_and_compression_seal', 'Rolled_corner_posts', 'welded_aluminium',
  'Marine_frame_fasteners', 'Wiper_spindle_escutcheons', 'Wiper_spindle_locknuts', 'Rocker_pivot',
  'Torx_drive_recesses',
])

function ring(radius: number, color: string) {
  const meshRing = new T.Mesh(new T.RingGeometry(radius * 0.89, radius, 42), light(color))
  meshRing.rotation.x = -Math.PI / 2
  return meshRing
}

// The outline follows the near-side plating in the scaled ship's local XY plane.
const wreckTear = [
  [-14.2, 8.9], [-12.2, 12], [-9.6, 11.8], [-9.5, 14.4], [-6.6, 13.5], [-3, 15.65],
  [-2.5, 13.9], [0.7, 14.6], [1.6, 13.2], [5.4, 13.3], [8.1, 11.6], [9.4, 9.4],
  [7.8, 8.15], [7.1, 5.75], [4.9, 6.25], [2.6, 4.05], [0.5, 5.5], [-2.7, 3.3],
  [-4.5, 4.9], [-7.7, 4.45], [-7.4, 6], [-11, 6.65], [-12.5, 8.2],
].map(([x, y]) => new T.Vector2(x, y))
const tearDepth = 4.85

function tearMask(bounds: T.Box2) {
  const resolution = 128
  const data = new Uint8Array(resolution ** 2)
  for (let row = 0; row < resolution; row++) {
    const y = lerp(bounds.min.y, bounds.max.y, (row + 0.5) / resolution)
    for (let column = 0; column < resolution; column++) {
      const x = lerp(bounds.min.x, bounds.max.x, (column + 0.5) / resolution)
      let inside = false
      let distanceSq = Infinity
      for (let i = 0; i < wreckTear.length; i++) {
        const a = wreckTear[i], b = wreckTear[(i + 1) % wreckTear.length]
        const dx = b.x - a.x, dy = b.y - a.y
        const along = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))
        distanceSq = Math.min(distanceSq, (x - a.x - along * dx) ** 2 + (y - a.y - along * dy) ** 2)
        if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * dx / dy) inside = !inside
      }
      data[row * resolution + column] = Math.round(255 * clamp(0.5 + (inside ? -1 : 1) * Math.sqrt(distanceSq) / 4))
    }
  }
  const texture = new T.DataTexture(data, resolution, resolution, T.RedFormat)
  texture.minFilter = texture.magFilter = T.LinearFilter
  texture.needsUpdate = true
  return texture
}

function damageCruiseShip(ship: T.Object3D, shipFromWorld: T.Matrix4) {
  const bounds = new T.Box2().setFromPoints(wreckTear).expandByScalar(2)
  const damageBounds = new T.Box3(new T.Vector3(bounds.min.x, bounds.min.y, tearDepth),
    new T.Vector3(bounds.max.x, bounds.max.y, 12))
  const mask = tearMask(bounds)
  const maskSize = bounds.getSize(new T.Vector2())
  const meshBounds = new T.Box3()
  const materials = new Map<T.Material, T.Material>()
  const cutMaterial = (original: T.Material) => {
    const existing = materials.get(original)
    if (existing) return existing
    const material = original.clone()
    material.onBeforeCompile = shader => {
      shader.uniforms.wreckFromWorld = { value: shipFromWorld }
      shader.uniforms.tearMask = { value: mask }
      shader.uniforms.tearMin = { value: bounds.min }
      shader.uniforms.tearSize = { value: maskSize }
      shader.uniforms.tearDepth = { value: tearDepth }
      shader.vertexShader = 'uniform mat4 wreckFromWorld; varying vec3 wreckLocal;\n' + shader.vertexShader.replace(
        '#include <project_vertex>', 'wreckLocal = (wreckFromWorld * (modelMatrix * vec4(transformed, 1.))).xyz;\n#include <project_vertex>')
      shader.fragmentShader = `uniform sampler2D tearMask; uniform vec2 tearMin, tearSize;
        uniform float tearDepth; varying vec3 wreckLocal;\n` + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 tearUV = (wreckLocal.xy - tearMin) / tearSize;
        if (wreckLocal.z > tearDepth && all(greaterThan(tearUV, vec2(0.))) && all(lessThan(tearUV, vec2(1.)))) {
          float edge = texture2D(tearMask, tearUV).r;
          if (edge < .5) discard;
          float soot = smoothstep(.52, .89, edge + .065 * sin(wreckLocal.x * 4.2 + wreckLocal.y * 7.7));
          diffuseColor.rgb *= mix(vec3(.12,.10,.088), vec3(1.), soot);
        }
      `)
    }
    materials.set(original, material)
    return material
  }
  ship.updateMatrixWorld(true)
  ship.traverse(node => {
    if (!(node instanceof T.Mesh)) return
    const geometry = node.geometry as T.BufferGeometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (!geometry.boundingBox || !meshBounds.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld).intersectsBox(damageBounds)) return
    node.material = Array.isArray(node.material) ? node.material.map(cutMaterial) : cutMaterial(node.material)
  })

  // Side walls step inward to a dark, folded steel bulkhead behind the opening.
  const vertices: number[] = [], colors: number[] = [], indices: number[] = []
  const rust = new T.Color('#3b322d'), steel = new T.Color('#242a2b'), char = new T.Color('#0d1317')
  const rng = seededRandom(288)
  const color = new T.Color()
  for (let i = 0; i < wreckTear.length; i++) {
    const p = wreckTear[i]
    const center = -2.4
    const side = lerp(7.75, 8.85, smoothstep(p.y, 5.8, 8.2))
    vertices.push(center + (p.x - center) * 0.996, lerp(9.4, p.y, 0.996), side - 0.12 - rng() * 0.37)
    vertices.push(lerp(p.x, center, 0.12 + rng() * 0.10), lerp(p.y, 9.4, 0.12 + rng() * 0.12), 6.05 + rng() * 0.50)
    vertices.push(p.x, p.y, tearDepth + 0.06 + rng() * 0.14)
    colors.push(...color.copy(rust).lerp(steel, rng()).multiplyScalar(0.45 + rng() * 0.62).toArray(),
      ...color.copy(steel).lerp(char, rng()).toArray(), ...char.toArray())
    const k = i * 3, n = ((i + 1) % wreckTear.length) * 3
    indices.push(k, n, k + 1, n, n + 1, k + 1, k + 1, n + 1, k + 2, n + 1, n + 2, k + 2)
  }
  for (const [a, b, c] of T.ShapeUtils.triangulateShape(wreckTear, [])) indices.push(a * 3 + 2, b * 3 + 2, c * 3 + 2)
  const bentRibs = [
    [[-11.75, 10.37, 8.7], [-10.75, 10.95, 8.52], [-8.15, 9.6, 7.3], [-7.11, 7.7, 6.5], [-8.83, 8.93, 7.37]],
    [[-4.4, 13.86, 8.8], [-2.45, 14.16, 8.6], [-1.8, 12, 7.4], [-0.1, 10.9, 6.8], [-3.15, 11.5, 7.4]],
    [[7.25, 10.8, 8.8], [8.15, 9.6, 8.8], [4.85, 8.6, 7.8], [2.75, 7.2, 6.9], [4, 9.05, 7.3]],
    [[-0.8, 5.04, 8.05], [0.52, 5.5, 8], [3, 6.7, 7.2], [4.1, 6.9, 7.3], [3.15, 5.97, 7.5]],
  ]
  const chippedSteel = new T.Color('#635852')
  for (const rib of bentRibs) {
    const k = vertices.length / 3
    for (const [i, point] of rib.entries()) {
      vertices.push(...point)
      colors.push(...color.copy(chippedSteel).lerp(steel, i / (rib.length - 1)).toArray())
    }
    indices.push(k, k + 1, k + 2, k, k + 2, k + 4, k + 4, k + 2, k + 3)
  }
  const interior = new T.BufferGeometry()
  interior.setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
  interior.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
  interior.setIndex(indices)
  interior.computeVertexNormals()
  return new T.Mesh(interior, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.96, flatShading: true }))
}

// Local Z at the sea plane along the real hull at the start and end of the list.
// Each row is X, near side intact/listed, far side intact/listed.
const foamSections = [
  [-71, 2, 3, -1, -3], [-65, 8.6, 9, -2.7, -6.2], [-57, 9.1, 9.6, -7.3, -8], [-48, 9.1, 9.6, -7.5, -8.4],
  [-36, 9.1, 8.5, -7.7, -8.9], [-24, 9.1, 7.1, -7.9, -9.1], [-12, 9.1, 7.3, -8.1, -9.1], [0, 9.1, 5.8, -8.3, -9.1],
  [12, 9.5, 4.3, -8.5, -9.1], [24, 11, 5, -8.7, -7.8], [36, 10.1, 4.2, -8.3, -10.1], [48, 8.6, 1, -6.8, -8.4],
  [57, 8.2, 0, -4.5, -4], [65, 4.6, -2, -1.5, -2], [71, 0, -2, 0, -2],
] as const

function wreckFoam() {
  const subdivisions = 4
  const segments = (foamSections.length - 1) * subdivisions
  const positions = new T.BufferAttribute(new Float32Array((segments + 1) * 2 * 2 * 3), 3).setUsage(T.DynamicDrawUsage)
  const uv: number[] = [], indices: number[] = []
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= segments; i++) {
      uv.push(i / segments, 0, i / segments, 1)
      if (i === segments) continue
      const j = (side * (segments + 1) + i) * 2
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', positions)
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  const time = { value: 0 }, sink = { value: 0 }
  const material = new T.ShaderMaterial({
    uniforms: { time, sink, ...waveUniforms }, transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    vertexShader: `
      uniform float time; varying vec2 tex, seaPoint;
      ${waterGlsl}
      void main() {
        tex = uv;
        vec3 world = (modelMatrix * vec4(position, 1.)).xyz;
        seaPoint = world.xz;
        world.y = oceanSample(seaPoint, time).x + .15;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
      }
    `,
    fragmentShader: `
      uniform float time, sink; varying vec2 tex, seaPoint;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float grain(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f*f*(3.-2.*f);
        return mix(mix(hash(cell), hash(cell+vec2(1,0)), f.x), mix(hash(cell+vec2(0,1)), hash(cell+1.), f.x), f.y);
      }
      void main() {
        float swell = grain(seaPoint * .32 + time * vec2(.24,-.1));
        float bubbles = grain(seaPoint * 2.4 - time * vec2(.47,.26));
        float spread = tex.y + (swell-.5)*.45;
        float lace = (1.-smoothstep(.05,.58,abs(spread-.22))) * smoothstep(.37,.78, .57*bubbles+.43*swell);
        float ends = smoothstep(.005,.08,tex.x) * (1.-smoothstep(.81-sink*.13,1.-sink*.10,tex.x));
        float alpha = ends * lace * smoothstep(.0,.16,tex.y) * (1.-smoothstep(.55,1.,tex.y));
        gl_FragColor = vec4(mix(vec3(.45,.62,.64),vec3(.83,.91,.90),bubbles),alpha * .81);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new T.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.visible = false
  const p = new T.Vector3(), up = new T.Vector3(), out = new T.Vector3()
  return {
    mesh,
    update(ship: T.Object3D, t: number, list: number) {
      time.value = t
      sink.value = list
      const m = ship.matrixWorld.elements
      up.set(m[4], m[5], m[6])
      out.set(m[8], 0, m[10]).normalize()
      for (let side = 0; side < 2; side++) {
        const column = side * 2 + 1
        const direction = side === 0 ? 1 : -1
        for (let i = 0; i <= segments; i++) {
          const section = i / subdivisions
          const a = foamSections[Math.floor(section)], b = foamSections[Math.ceil(section)]
          const f = section % 1
          const x = lerp(a[0], b[0], f)
          const z = lerp(lerp(a[column], a[column + 1], list), lerp(b[column], b[column + 1], list), f)
          p.set(x, 0, z).applyMatrix4(ship.matrixWorld)
          p.addScaledVector(up, (waveHeight(p.x, p.z, t) - p.y) / up.y)
          p.addScaledVector(up, (waveHeight(p.x, p.z, t) - p.y) / up.y)
          const j = (side * (segments + 1) + i) * 2
          positions.setXYZ(j, p.x - out.x * direction * 1.0, 0, p.z - out.z * direction * 1.0)
          positions.setXYZ(j + 1, p.x + out.x * direction * 3.8, 0, p.z + out.z * direction * 3.8)
        }
      }
      positions.needsUpdate = true
    },
  }
}

export class GameRenderer {
  readonly renderer: T.WebGLRenderer
  readonly scene = new T.Scene()
  readonly camera = new T.PerspectiveCamera(46, 1, 0.12, 2300)
  private readonly composer: EffectComposer
  private readonly env = environment(this.scene)
  private readonly upperLight = new T.HemisphereLight('#b3d8eb', '#414545', 2.48)
  private readonly rim = new T.DirectionalLight('#ffc28a', 2.35)
  private readonly flashLight = new T.DirectionalLight('#acd9ff', 0)
  private readonly helo = new HelicopterModel()
  private readonly picker = claw()
  private readonly raft = raft()
  private readonly ship = new T.Group()
  private readonly shipFromWorld = new T.Matrix4()
  private readonly wreckWater = wreckFoam()
  private readonly wreckEffects = wreckAtmosphere()
  private readonly floatingDebris = wreckDebris()
  private wreckLoaded = false
  private readonly rescueBoat = rescueVessel()
  private vesselHelm: T.Vector3 | null = null
  private readonly driverHiddenParts: T.Object3D[] = []
  private readonly recoveryGate: T.Object3D[] = []
  private readonly deckPassengers = new T.Group()
  private readonly deckSlots = roster.map((_, i) =>
    new T.Vector3((i % 4) * 1.07 - 1.8, 1.585 + bootClearance, 0.3 - Math.floor(i / 4) * 1.4))
  private readonly people = roster.map((r, i) => person(r.skin, i))
  private readonly marker = ring(2.1, '#82f2d7')
  private readonly peopleMarkers = roster.map(() => ring(0.87, '#ffc078'))
  private readonly sharks = Array.from({ length: 3 }, (_, i) => new SharkModel('regularShark', i / 3))
  private readonly meg = new SharkModel('megalodon')
  private readonly boatSplashes = [boatSplash(), boatSplash()]
  private readonly animatedAttacks = new WeakSet<object>()
  private nextSharkBite = 0
  private readonly rescueBeam = beam(this.scene)
  private readonly island = new T.Group()
  private readonly tower = new T.Group()
  private lanternOrigin: T.Vector3 | null = null
  private plantings: ReturnType<typeof islandPlantings> | null = null
  private readonly harborDock: ReturnType<typeof dock>
  private readonly markerBuoys: ReturnType<typeof mooringLights>
  private readonly reefs = new T.Group()
  private rockSet: ReturnType<typeof prepareRockSet> | null = null
  private readonly lightBeam: ReturnType<typeof beam>
  private readonly modelSizes: Partial<Record<ScaledModel, ReturnType<typeof fitModelScale>>>
  private readonly schoolBuoy = hazard('barrel', 1.15)
  private readonly cabin = cockpit()
  private readonly rescueGroup = new T.Group()
  private readonly boatGroup = new T.Group()
  private readonly obstacles = new T.Group()
  private readonly floatingHazards = new Map<FloatingHazard, T.Group>()
  private readonly rope = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: '#b5a998' }))
  private readonly winchStart = new T.Vector3()
  private readonly winchEnd = new T.Vector3()
  private readonly beamSource = new T.Vector3()
  private readonly beamTarget = new T.Vector3()
  private readonly narrowFog = new T.FogExp2('#40606a', 0.008)
  private readonly rainGeometry = new T.BufferGeometry()
  private readonly rain = new T.LineSegments(this.rainGeometry,
    new T.LineBasicMaterial({ color: '#9dc5d9', transparent: true, opacity: 0.26, depthWrite: false }))
  private readonly rainPositions: Float32Array
  private readonly rainSeeds: number[]
  private readonly eye = new T.Vector3(-7, 23, 63)
  private readonly point = new T.Vector3(-7, 11, 0)
  private readonly scratch = new T.Vector3()
  private quality: Quality = 'medium'
  private performanceWindow = 0
  private averageMs = 16.67
  private scale = 0.9
  private initialized = false
  private lastPhase = ''
  private lastRun: Session | null = null
  readonly deckMarker = { x: 50, y: 60, offscreen: false }
  lost = false
  get fps() { return Math.round(1000 / Math.max(1, this.averageMs)) }
  get stats() { return { fps: this.fps, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, scale: this.scale } }

  constructor(container: HTMLElement, onContext: (lost: boolean) => void) {
    this.modelSizes = {
      rescueVessel: fitModelScale('rescueVessel', this.rescueBoat),
      helicopter: this.helo.fallbackSize,
    }
    this.rescueBoat.add(this.deckPassengers)
    this.env.uniforms.shoal.value.set(harbor.island.x, -harbor.island.z, 1 / 62, 1 / 64)
    this.lightBeam = beam(this.tower, '#ffd788')
    this.lightBeam.mesh.visible = false

    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setClearColor('#1f3640')
    this.renderer.toneMapping = T.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.domElement.setAttribute('aria-label', 'Live 3D storm and rescue scene')
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      this.lost = true
      onContext(true)
    })
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.lost = false
      onContext(false)
      this.resize()
    })
    container.replaceChildren(this.renderer.domElement)
    this.scene.fog = this.narrowFog
    this.scene.add(this.camera, this.upperLight, this.rim, this.flashLight, this.rescueGroup, this.boatGroup,
      this.meg.root, ...this.sharks.map(shark => shark.root))
    this.rim.position.set(-42, 35, 23)
    this.flashLight.position.set(41, 58, -12)
    this.camera.add(this.cabin.root)
    this.rescueGroup.add(this.helo.root, this.picker.root, this.raft.root, this.ship, this.rescueBoat, this.rope,
      this.wreckEffects.root, this.wreckWater.mesh, this.floatingDebris.root, this.marker, this.schoolBuoy,
      ...this.people.map(p => p.root), ...this.peopleMarkers)
    this.raft.root.position.set(rescueBoardX, 0, rescuePlaneZ)
    this.rescueBoat.position.x = R.deploy
    this.rope.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(17 * 3), 3).setUsage(T.DynamicDrawUsage))
    this.rope.frustumCulled = false
    this.boatGroup.add(this.island, this.reefs, this.obstacles, ...this.boatSplashes.map(splash => splash.root))
    this.harborDock = dock(this.boatGroup)
    this.markerBuoys = mooringLights(this.boatGroup)
    this.scene.add(this.rain)
    this.rain.frustumCulled = false
    this.rainPositions = new Float32Array(420 * 6)
    const rng = seededRandom(17)
    this.rainSeeds = Array.from({ length: this.rainPositions.length }, rng)
    this.rainGeometry.setAttribute('position', new T.BufferAttribute(this.rainPositions, 3))
    this.composer = new EffectComposer(this.renderer, { frameBufferType: T.HalfFloatType })
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new EffectPass(this.camera, new BloomEffect({ intensity: 0.36, luminanceThreshold: 0.55, mipmapBlur: true }),
      new VignetteEffect({ offset: 0.22, darkness: 0.32 })))
    this.resize()
    void this.loadModels()
    addEventListener('resize', () => this.resize())
  }

  private async loadModels() {
    const base = import.meta.env.BASE_URL
    const decoders = new URL(base + 'decoders/', document.baseURI)
    const draco = new DRACOLoader().setDecoderPath(new URL('draco/', decoders).href)
    const loader = new GLTFLoader().setDRACOLoader(draco)
    loader.register(parser => {
      // Load embedded GLB images through img-src, which permits local blob URLs.
      parser.textureLoader = new T.TextureLoader(parser.options.manager)
      return { name: 'ShipwreckModelTextures' }
    })
    const meshoptUrl = new URL('meshopt_decoder.module.js', decoders).href
    const meshopt: typeof import('three/addons/libs/meshopt_decoder.module.js') | null =
      await import(/* @vite-ignore */ meshoptUrl).catch((error: unknown) => {
        console.warn('[models] Meshopt decoder could not load.', error)
        return null
      })
    if (meshopt) loader.setMeshoptDecoder(meshopt.MeshoptDecoder)

    const path = base + 'models/'
    const sharkAssets = [
      { file: 'shark.glb', kind: 'regularShark', models: this.sharks },
      { file: 'megalodon.glb', kind: 'megalodon', models: [this.meg] },
    ] as const
    await Promise.allSettled([
      ...sharkAssets.map(({ file, kind, models }) => loader.loadAsync(path + file).then(({ scene, animations }) => {
        const sizes = models.map(model => model.setAsset(scene, animations))
        this.modelSizes[kind] = sizes[0]
      }).catch((error: unknown) => console.warn(`[models] Could not load ${file}.`, error))),
      loader.loadAsync(path + 'sar-helicopter.glb').then(({ scene, animations }) => {
        this.modelSizes.helicopter = this.helo.setAsset(scene, animations)
      }).catch((error: unknown) => console.warn('[models] Could not load sar-helicopter.glb.', error)),
      loader.loadAsync(path + 'cruise_ship_wreck.glb').then(({ scene }) => {
        this.modelSizes.cruiseShip = prepareCruiseWreck(scene)
        const interior = damageCruiseShip(scene, this.shipFromWorld)
        this.ship.add(scene, interior)
        this.wreckLoaded = true
      }).catch((error: unknown) => {
        console.warn('[models] Could not load cruise_ship_wreck.glb.', error)
        const fallbackShip = wreck()
        this.modelSizes.cruiseShip = fitModelScale('cruiseShip', fallbackShip)
        this.ship.add(fallbackShip)
      }),
      loader.loadAsync(path + 'ocean-rocks.glb').then(({ scene }) => {
        const asset = prepareRockSet(scene)
        this.rockSet = asset
        this.modelSizes.rocks = asset.referenceSize
        if (this.lastRun) this.placeReefs(this.lastRun)
      }).catch((error: unknown) => console.warn('[models] Could not load ocean-rocks.glb.', error)),
      this.loadHarbor(loader, path),
      loader.loadAsync(path + 'rescue-vessel.glb').then(({ scene }) => {
        this.modelSizes.rescueVessel = fitModelScale('rescueVessel', scene)
        // The GLB's recovery deck is aft of its origin. Align it to the existing drop zone at full scale.
        const [deckX, deckY, deckZ] = MODEL_SCALES.rescueVessel.deckAnchor
        scene.position.add(new T.Vector3(-deckX, R.deckY - deckY, -deckZ))
        const deck = scene.getObjectByName('Cambered_nonskid_main_deck')
        // Sample the camber in boat-local coordinates before attaching the visual to the moving boat.
        scene.updateMatrixWorld(true)
        this.vesselHelm = scene.localToWorld(wheelhouseEye.clone())
        scene.traverse(part => {
          if (wheelhouseOccluders.has(part.name.replace(/\d{3}$/, ''))) this.driverHiddenParts.push(part)
          if (typeof part.userData.name === 'string' && part.userData.name.startsWith('Aft starboard guard / recovery gate closure'))
            this.recoveryGate.push(part)
        })
        const down = new T.Vector3(0, -1, 0)
        const ray = new T.Raycaster()
        const origin = new T.Vector3()
        for (const slot of this.deckSlots) {
          ray.set(origin.set(slot.x, R.deckY + 1, slot.z), down)
          const surface = deck ? ray.intersectObject(deck)[0]?.point.y : undefined
          slot.y = (surface ?? R.deckY) + bootClearance
        }
        const deckMarks = this.rescueBoat.getObjectByName('RescueDeckMarks')
        this.rescueBoat.clear().add(scene, this.deckPassengers)
        if (deckMarks) this.rescueBoat.add(deckMarks)
      }),
    ])
    draco.dispose()

    for (const name of Object.keys(MODEL_SCALES) as ScaledModel[]) {
      const size = this.modelSizes[name]
      if (!size) continue
      const { length, width, height, scale } = size
      console.info(`[models] ${MODEL_SCALES[name].label} length=${length.toFixed(2)} width=${width.toFixed(2)} height=${height.toFixed(2)} scale=${scale.toFixed(4)}`)
    }
  }

  private async loadHarbor(loader: GLTFLoader, path: string) {
    const [terrain, tower] = await Promise.allSettled([
      loader.loadAsync(path + 'island.glb'),
      loader.loadAsync(path + 'lighthouse.glb'),
    ])
    if (terrain.status === 'rejected') {
      console.warn('[models] Could not load island.glb.', terrain.reason)
      return
    }
    const model = terrain.value.scene
    this.modelSizes.island = prepareIsland(model)
    this.island.add(model)
    const surface = islandSurface(model)
    let site: T.Vector3 | null = null
    if (tower.status === 'fulfilled') {
      try {
        const art = tower.value.scene
        const { size, baseRadius, lightOrigin } = prepareLighthouse(art)
        const radius = baseRadius + 0.08
        const footing = lighthouseSite(surface, radius)
        if (!footing) throw new Error('No elevated plateau supports the lighthouse base.')
        site = footing.position
        this.tower.name = 'Summit Lighthouse'
        this.tower.position.copy(site)
        this.tower.add(art)
        lighthouseFoundation(this.tower, radius, footing.padDepth)
        this.island.add(this.tower)
        this.lanternOrigin = lightOrigin
        lanternGlow(this.tower, lightOrigin)
        this.modelSizes.lighthouse = size
      } catch (error) { console.warn('[models] Could not place lighthouse.glb.', error) }
    } else console.warn('[models] Could not load lighthouse.glb.', tower.reason)
    this.plantings = islandPlantings(surface, site)
    this.island.add(this.plantings.root)
    surface.dispose()
  }

  resize() {
    const w = innerWidth
    const h = innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4) * this.scale)
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h, false)
  }

  draw(run: Session, dt: number, settings: RenderSettings, presentationTime: number) {
    if (this.lost) return
    if (this.quality !== settings.quality) {
      this.quality = settings.quality
      this.scale = this.quality === 'low' ? 0.65 : this.quality === 'medium' ? 0.88 : 1
      this.resize()
    }
    this.averageMs = damp(this.averageMs, dt * 1000, 1.8, dt)
    this.performanceWindow += dt
    if (this.performanceWindow > 2.6) {
      this.performanceWindow = 0
      const nextScale = clamp(this.scale + (this.averageMs > 22 ? -0.07 : this.averageMs < 17 ? 0.04 : 0),
        0.60, this.quality === 'low' ? 0.72 : 1)
      if (Math.abs(nextScale - this.scale) > 0.01) { this.scale = nextScale; this.resize() }
    }
    if (this.lastRun !== run) this.loadRun(run)
    const firstPerson = run.phase === 'boat'
    const departure = run.phase === 'handoff'
    const arrival = run.phase === 'outro' || run.phase === 'results' && run.outcome === 'completed'
    const isRescue = !firstPerson && !arrival
    const newPhase = this.lastPhase !== run.phase
    this.lastPhase = run.phase
    const weatherTime = firstPerson || arrival ? run.boat.time : run.rescue.time
    const t = weatherTime + (run.phase === 'intro' || run.phase === 'arrival' || departure || arrival ? run.elapsed : 0)
    this.rescueGroup.visible = isRescue
    this.rescueBeam.mesh.visible = isRescue && run.phase !== 'intro'
    this.boatGroup.visible = !isRescue
    this.cabin.root.visible = firstPerson
    const vesselParent = firstPerson ? this.boatGroup : this.rescueGroup
    if (this.rescueBoat.parent !== vesselParent) vesselParent.add(this.rescueBoat)
    this.rescueBoat.visible = !firstPerson || !!this.vesselHelm
    this.deckPassengers.visible = !firstPerson
    for (const part of this.driverHiddenParts) part.visible = !firstPerson
    for (const bar of this.recoveryGate) bar.visible = !arrival
    this.env.uniforms.time.value = t
    this.env.uniforms.dawn.value = arrival ? clamp(0.37 + run.elapsed / 15) : 0
    const flash = settings.flashes ? Math.max(0, 1 - (presentationTime % 13.42) * 5.8) * 0.72 : 0
    this.env.uniforms.flash.value = flash
    this.flashLight.intensity = flash * 4.5
    const fog = firstPerson && run.boat.z > 350 && run.boat.z < 600 ? 0.021 : 0.0068
    this.narrowFog.density = fog
    this.env.uniforms.fog.value = fog * 0.73
    this.env.uniforms.search.value = this.rescueBeam.mesh.visible ? 0.7 : 0
    this.env.uniforms.sharkWakeSize.value.z = 0
    this.sharks.forEach(shark => { shark.root.visible = false })
    this.boatSplashes.forEach(splash => { splash.root.visible = false })
    this.meg.root.visible = false
    this.meg.swimSpeed = 1
    const animationDt = run.paused || run.autoStop || run.record ? 0 : dt
    if (newPhase && (run.phase === 'arrival' || arrival)) this.helo.resetHeading()
    if (newPhase && firstPerson) {
      this.sharks.forEach(shark => shark.resetAnimation())
      this.meg.resetAnimation()
    }
    let desiredFov = 44
    if (isRescue) {
      desiredFov = this.drawRescue(run, t, departure, settings.reduceMotion, animationDt)
    } else {
      desiredFov = this.drawBoat(run, t, arrival, settings.reduceMotion, animationDt)
    }
    if (firstPerson) this.drawBoatSplashes(run, t, settings.reduceMotion)
    const raft = this.raft.root
    const boardWash = isRescue && raft.visible ? 1 - 0.8 * clamp((t - run.rescue.breachedAt) / 5) : 0
    this.env.uniforms.boardFoam.value.set(raft.position.x, raft.position.z, boardWash)
    const { rotation, position, visible } = this.rescueBoat
    const { center, halfLength, halfBeam } = this.vesselHelm ? vesselWaterline : fallbackWaterline
    const forwardX = Math.cos(rotation.y), forwardZ = -Math.sin(rotation.y)
    this.env.uniforms.hullFoamPose.value.set(position.x + forwardX * center, position.z + forwardZ * center, forwardX, forwardZ)
    this.env.uniforms.hullFoamSize.value.set(halfLength, halfBeam, visible ? 0.82 + 0.18 * clamp(run.boat.speed / 16) : 0)
    this.helo.animateRotors(animationDt)
    this.sharks.forEach(shark => shark.animate(animationDt))
    this.meg.animate(animationDt)
    const opening = run.phase === 'intro'
    const weight = firstPerson || !this.initialized || newPhase && (opening || arrival || run.phase === 'rescue')
      ? 1 : 1 - Math.exp(-dt * 3.6)
    this.camera.position.lerp(this.eye, weight)
    this.scratch.lerp(this.point, weight)
    this.camera.up.set(0, 1, 0)
    if (firstPerson) this.camera.up.applyQuaternion(this.rescueBoat.quaternion)
    this.camera.lookAt(this.scratch)
    this.camera.fov = lerp(this.camera.fov, desiredFov, weight)
    this.camera.updateProjectionMatrix()
    if (isRescue) {
      this.camera.updateMatrixWorld()
      const deck = new T.Vector3(R.deploy, run.rescue.deckY + 1.8, 0).project(this.camera)
      this.deckMarker.x = clamp(deck.x * 50 + 50, 10, 91)
      this.deckMarker.y = clamp(50 - deck.y * 50, 23, 73)
      this.deckMarker.offscreen = deck.x > 0.83 || deck.x < -0.82
    }
    this.env.sky.position.copy(this.camera.position)
    // Center the dense water grid on the action with steps aligned to its 1.25-unit cells.
    this.env.sea.position.set(Math.round(this.scratch.x / 20) * 20, 0, Math.round(this.scratch.z / 20) * 20)
    this.rain.visible = !arrival
    if (this.rain.visible) this.drawRain(t, settings.reduceMotion)
    this.initialized = true
    if (this.quality === 'high') this.composer.render(dt)
    else {
      // EffectComposer disables automatic clearing on the shared renderer.
      this.renderer.clear()
      this.renderer.render(this.scene, this.camera)
    }
  }

  private loadRun(run: Session) {
    this.lastRun = run
    this.initialized = false
    this.helo.resetHeading()
    this.nextSharkBite = 0
    this.sharks.forEach(shark => shark.resetAnimation())
    this.meg.resetAnimation()
    this.obstacles.clear()
    this.floatingHazards.clear()
    for (const obstacle of run.boat.hazards) {
      if (obstacle.type === 'reef') continue
      const model = hazard(obstacle.type, obstacle.radius)
      model.position.set(obstacle.x, 0, -obstacle.z)
      model.rotation.y = obstacle.z * 0.31
      this.obstacles.add(model)
      this.floatingHazards.set(obstacle, model)
    }
    this.placeReefs(run)
  }

  private placeReefs(run: Session) {
    const asset = this.rockSet
    // A failed or pending load must not make interactive players hit invisible rocks.
    run.boat.reefsActive = !!asset || run.inputMode === 'replay'
    if (!asset) return
    for (const batch of this.reefs.children) (batch as T.InstancedMesh).dispose()
    this.reefs.clear()
    const rocks = run.boat.hazards.filter(rock => rock.type === 'reef')
    const channel = rocks.filter(rock => !rock.island && rock.z < 650)
    const approach = rocks.filter(rock => !rock.island && rock.z >= 650)
    const coast = rocks.filter(rock => rock.island)
    this.reefs.add(...instanceRocks(asset, channel), ...instanceRocks(asset, approach), ...instanceRocks(asset, coast))
  }

  private drawRescue(run: Session, t: number, departure: boolean, reduced: boolean, dt: number) {
    const r = run.rescue
    const inIntro = run.phase === 'intro'
    const inArrival = run.phase === 'arrival'
    const practice = run.phase === 'school'
    const follow = r.x * 0.75 + 0.25 * clamp(r.clawX, -47, 46)
    const viewX = r.carried.length ? lerp(follow, R.deploy, 0.18) : lerp(follow, -1, 0.17)
    const spread = this.camera.aspect < 1.45 ? 9 : 0
    let fov = 44
    this.eye.set(viewX + 12, 23.7, 65 + spread)
    this.point.set(viewX, 11.8, -0.5)
    const sink = inIntro ? smoothstep(run.elapsed, 0, timelines.intro.duration) : 1
    this.ship.position.set(wreckX, lerp(0.6, -7, sink) + waveHeight(wreckX, wreckZ, t) * 0.22, wreckZ)
    this.ship.rotation.set(lerp(0.42, 0.77, sink), -0.11, lerp(-0.04, -0.12, sink), 'YXZ')
    const showWreckEffects = this.wreckLoaded && !practice
    const lowQuality = this.quality === 'low'
    this.wreckEffects.root.visible = this.wreckWater.mesh.visible = showWreckEffects
    this.floatingDebris.root.visible = !practice
    if (!practice) this.floatingDebris.update(this.ship.position, this.raft.root.position, t, reduced, lowQuality)
    if (showWreckEffects) {
      this.ship.updateWorldMatrix(true, false)
      this.shipFromWorld.copy(this.ship.matrixWorld).invert()
      this.wreckWater.update(this.ship, t, sink)
      this.wreckEffects.update(this.ship, t, reduced, lowQuality)
    }
    if (inIntro) {
      this.eye.set(lerp(-58, -25, sink), lerp(27, 21, sink), lerp(88, 70, sink) + spread)
      this.point.set(lerp(-44, -37, sink), lerp(10, 7, sink), -27)
      fov = 46
      this.meg.root.visible = run.elapsed > 7
      this.meg.root.position.set(-73 + run.elapsed * 2.4, -2.35, 14)
      this.meg.root.rotation.set(0, Math.PI / 2, -0.02, 'YXZ')
    } else if (inArrival) {
      this.eye.set(-18 + run.elapsed * 1.1, 16 + run.elapsed * 0.75, 50)
      this.point.set(-27 + run.elapsed * 2, 12, -3)
    } else if (departure) {
      const push = clamp(run.elapsed / 7.6) ** 2
      this.eye.set(64 - 5.6 * push, 13.6 - 10.3 * push, 21 - 17.8 * push)
      this.point.set(55 + push * 4, 2.8 + push * 0.65, 0)
      fov = 40 + push * 7
    }
    const breach = t - r.breachedAt
    const warning = t - r.warningTime
    if (!inIntro && warning >= 0 && (breach >= 0 ? breach < 2.5 : warning < tuning.shark.warning)) {
      const age = breach >= 0 ? breach : warning - tuning.shark.warning
      const vx = -14
      const vz = 2.2
      const x = this.raft.root.position.x + vx * age
      const z = this.raft.root.position.z + vz * age
      const rise = (boardBreachHeight(age + 0.01) - boardBreachHeight(age - 0.01)) / 0.02
      this.meg.root.visible = true
      this.meg.root.position.set(x, waveHeight(x, z, t) + boardBreachHeight(age), z)
      this.meg.root.rotation.set(-Math.atan2(rise, Math.hypot(vx, vz)), Math.atan2(vx, vz), 0, 'YXZ')
      this.meg.swimSpeed = lerp(1.4, 2.1, smoothstep(age, -2.2, -1.25))
      if (breach >= 0 && !this.animatedAttacks.has(r) && this.meg.bite(0, 1.85)) this.animatedAttacks.add(r)
      if (!reduced && breach >= 0 && breach < 0.9) this.eye.y += Math.sin(breach * 27) * 0.38
    }
    this.ship.visible = !practice && this.ship.children.length > 0
    this.helo.root.visible = !inIntro
    const approachTime = 8 - run.elapsed
    this.helo.root.position.set(inArrival ? r.x - approachTime ** 2 * 1.15 : r.x, r.altitude, rescuePlaneZ)
    if (this.helo.root.visible) {
      this.helo.pose(inArrival ? approachTime * 2.3 : departure ? 0 : r.velocity,
        inArrival ? 0.065 * clamp(approachTime) : departure ? 0 : r.bank, dt, reduced)
    }
    this.picker.root.visible = !inIntro && !inArrival
    this.picker.root.position.set(r.clawX, r.clawY, rescuePlaneZ)
    this.picker.root.rotation.z = -r.swing
    this.picker.jaws.forEach(jaw => { jaw.rotation.z = lerp(0.39, -0.54, r.gripProgress) })
    this.rope.visible = this.picker.root.visible
    if (this.rope.visible) {
      const winch = this.helo.winch.getWorldPosition(this.winchStart)
      const anchor = this.picker.cableAnchor.getWorldPosition(this.winchEnd)
      const rope = this.rope.geometry.attributes.position
      for (let i = 0; i < rope.count; i++) {
        const k = i / (rope.count - 1)
        rope.setXYZ(i, lerp(winch.x, anchor.x, k) + 2 * r.swing * Math.sin(k * Math.PI),
          lerp(winch.y, anchor.y, k), lerp(winch.z, anchor.z, k))
      }
      rope.needsUpdate = true
    }
    if (this.rescueBeam.mesh.visible) {
      const lamp = this.helo.searchlight.getWorldPosition(this.beamSource)
      const sweep = this.helo.root.rotation.y + Math.sin(t * 0.8) * 0.36
      const x = lamp.x - Math.cos(sweep) * 4.7
      const z = lamp.z + Math.sin(sweep) * 4.7
      this.beamTarget.set(x, waveHeight(x, z, t), z)
      placeBeam(this.rescueBeam.mesh, lamp, this.beamTarget)
      this.env.uniforms.contact.value.copy(this.beamTarget)
      this.rescueBeam.intensity.value = 0.39
    }
    this.marker.visible = this.picker.root.visible && !departure
    this.marker.position.set(r.clawX, waveHeight(r.clawX, rescuePlaneZ, t) + 0.1, rescuePlaneZ)
    this.marker.material.color.copy(r.grabbable().length ? amber : cyan)
    this.raft.root.visible = !practice
    this.raft.root.position.y = waveHeight(rescueBoardX, rescuePlaneZ, t) + 0.35
    this.raft.planks.forEach(({ plank, offset, rotation, drift }, index) => {
      const warp = clamp(breach / 5) * drift
      plank.position.set(warp * 1.4, 0.12 + Math.sin(t * 2 + index * 0.22) * (breach >= 0 ? 0.28 : 0.06), offset * (1 + Math.max(0, Math.abs(warp) * 0.29)))
      plank.rotation.set(0, rotation + warp * 0.32, Math.sin(t + index * 0.1) * 0.055)
    })
    this.rescueBoat.position.set(R.deploy, waveHeight(R.deploy, rescuePlaneZ, t), rescuePlaneZ)
    this.rescueBoat.rotation.set(0, -0.13, Math.sin(t * 1.7) * 0.043, 'XYZ')
    this.schoolBuoy.visible = practice && !r.carried.length
    this.schoolBuoy.position.set(r.survivors[0].x, waveHeight(r.survivors[0].x, rescuePlaneZ, t) + 0.25, rescuePlaneZ)
    const carriers = r.carried
    this.people.forEach(({ root, arms }, index) => {
      const s = r.survivors[index]
      const mark = this.peopleMarkers[index]
      root.visible = !practice && !!s && s.state !== 'lost'
      mark.visible = root.visible && !departure && !inIntro && !!s && (s.state === 'floating' || s.state === 'debris')
      if (!root.visible || !s) return
      root.scale.setScalar(1.14)
      const i = carriers.indexOf(s)
      const floating = s.state === 'floating'
      const saved = s.state === 'saved'
      const parent = saved ? this.deckPassengers : this.rescueGroup
      if (root.parent !== parent) parent.add(root)
      if (saved) root.position.copy(this.deckSlots[index])
      else root.position.set(i >= 0 ? r.clawX + (i - 0.5) * 0.59 : s.x,
        i >= 0 ? r.clawY - 2.2 : r.survivorY(s, t) - 1.22, s.z)
      root.rotation.z = Math.sin(t * 3.7 + index) * (floating ? 0.23 : 0.074)
      root.rotation.y = Math.sin(index * 15.13) * 0.52
      arms[0].rotation.z = 0.55 + Math.sin(t * 2.75 + index) * 0.3
      arms[1].rotation.z = 0.42 + Math.sin(t * 4.0 + index) * (saved ? 0.12 : 1.7)
      if (i >= 0) { arms[0].rotation.z = -2.4; arms[1].rotation.z = 2.4 }
      if (mark.visible) {
        mark.position.set(s.x, waveHeight(s.x, s.z, t) + 0.12 + (s.state === 'debris' ? 0.56 : 0), s.z)
      }
      mark.material.color.copy(s.targeted ? danger : amber)
      mark.scale.setScalar(s.targeted ? 1.25 + Math.sin(t * 9) * 0.25 : 1)
    })
    this.sharks.forEach((shark, i) => {
      const { root } = shark
      root.visible = !practice
      const patrol = t * 0.52 + i * Math.PI * 2 / 3
      // Cover the tight ends of the oval faster to even out the patrol's speed.
      const angle = patrol + 0.2 * Math.sin(2 * patrol)
      const attack = r.attacks[i]
      shark.swimSpeed = attack ? 2.7 : 2
      const dx = i * 4 + 16
      const targetX = attack ? attack.target.x : rescueBoardX + Math.cos(angle) * dx
      const chargeStart = 15 * (i % 2 === 0 ? 1 : -1)
      const z = attack ? lerp(chargeStart, 0.8, clamp((t - attack.start) / (attack.end - attack.start))) : Math.sin(angle) * dx * 0.42
      root.position.set(targetX, waveHeight(targetX, z, t) - (attack ? 0.25 : 0.58), z)
      const yaw = attack ? (chargeStart > 0 ? Math.PI : 0) : Math.atan2(-Math.sin(angle), 0.42 * Math.cos(angle))
      root.rotation.set(0, yaw, 0, 'YXZ')
      if (attack?.announced && attack.target.state === 'floating' && !this.animatedAttacks.has(attack)
        && shark.bite(this.nextSharkBite, 2.7)) {
        this.animatedAttacks.add(attack)
        this.nextSharkBite++
      }
    })
    return fov
  }

  private drawBoat(run: Session, t: number, arrival: boolean, reduced: boolean, dt: number) {
    const b = run.boat
    if (b.z > 730 || arrival) {
      this.plantings?.update(t, reduced)
      for (const buoy of this.markerBuoys) buoy.position.y = waveHeight(buoy.position.x, buoy.position.z, t) + 0.09
    }
    const lantern = this.lanternOrigin
    this.lightBeam.mesh.visible = !!lantern
    if (lantern) {
      const bearing = t * 0.52
      this.beamTarget.set(lantern.x + Math.cos(bearing) * 116, lantern.y - 9, lantern.z + Math.sin(bearing) * 116)
      placeBeam(this.lightBeam.mesh, lantern, this.beamTarget)
      this.lightBeam.intensity.value = arrival ? 0.42 : 0.68
    }
    const gangway = this.harborDock.gangway
    gangway.visible = arrival
    if (arrival) {
      const path = clamp(run.elapsed / 12)
      const { helmX, helmZ } = harbor.mooring
      const deckY = harbor.pier.deckY
      this.eye.set(-20 + path * 3, 12.5 + path * 6, -862 - path * 11)
      this.point.set(7, 4.2 + path * 2.6, -921)
      this.rescueGroup.visible = true
      const bob = waveHeight(helmX, -helmZ, t) * 0.48
      const stern = -helmZ + (this.vesselHelm?.x ?? wheelhouseEye.x)
      this.rescueBoat.position.set(helmX, bob, stern)
      this.rescueBoat.rotation.set(0, Math.PI / 2, 0, 'XYZ')
      const visible = this.rescueGroup.children
      visible.forEach(item => { item.visible = item === this.rescueBoat || item === this.helo.root || this.people.some(p => p.root === item) })
      this.helo.root.position.set(-8 - path * 40, 20 + path * 5, -929 - path * 13)
      this.helo.pose(-37 / 12, -0.054, dt, reduced)
      const port = this.vesselHelm ? 2.65 : 1.48
      const aboardX = helmX + port
      const ashoreX = harbor.pier.minX + 0.66
      const boardingZ = -harbor.boardingZ
      const boatDeckY = R.deckY + bob
      gangway.position.set((aboardX + ashoreX) / 2, (boatDeckY + deckY) / 2 - 0.062, boardingZ)
      gangway.scale.x = Math.hypot(ashoreX - aboardX, deckY - boatDeckY)
      gangway.rotation.z = Math.atan2(deckY - boatDeckY, ashoreX - aboardX)
      let disembarking = 0
      this.people.forEach(({ root, arms }, i) => {
        root.visible = run.rescue.survivors[i]?.state === 'saved'
        if (!root.visible) return
        if (root.parent !== this.rescueGroup) this.rescueGroup.add(root)
        const slot = disembarking++
        const seat = this.deckSlots[i]
        const walk = run.elapsed - (0.45 + slot * 0.49)
        const crossDeck = smoothstep(walk, 0, 1.35)
        const boardPier = smoothstep(walk, 1.35, 2.72)
        const clearWay = smoothstep(walk, 2.72, 7.75)
        const x = lerp(lerp(helmX + seat.z, aboardX, crossDeck), ashoreX, boardPier)
        const y = lerp(lerp(bob + seat.y, boatDeckY + bootClearance, crossDeck), deckY + bootClearance, boardPier)
        const z = lerp(stern - seat.x, boardingZ, crossDeck) - clearWay * (10.4 + (slot % 4) * 1.48)
        root.position.set(lerp(x, 9.25 + (slot % 2) * 1.55, clearWay), y, z)
        root.rotation.set(0, lerp(Math.PI / 2, Math.PI, smoothstep(walk, 2.55, 3.3)), 0)
        arms[0].rotation.z = Math.sin(t * 6 + i) * (walk > 0 && walk < 7.75 ? 0.48 : 0.12)
        arms[1].rotation.z = -arms[0].rotation.z
      })
      return 51
    }
    const { heave, pitch, roll } = b.wavePose(t)
    const shake = !reduced && b.time - b.lastImpact < 0.48 ? Math.sin(t * 75) * (0.48 - (b.time - b.lastImpact)) : 0
    const helm = this.vesselHelm ?? wheelhouseEye
    const boat = this.rescueBoat
    boat.rotation.set(reduced ? 0 : roll, Math.PI / 2 - b.heading, reduced ? 0 : pitch, 'YXZ')
    // Rotate around the waterline near midships. The helm and camera follow the same rigid pose.
    boat.position.set(-helm.x - boatBuoyancyCenter, 0, -helm.z).applyQuaternion(boat.quaternion)
    boat.position.x += b.x + boatBuoyancyCenter * Math.sin(b.heading)
    boat.position.y += heave * (reduced ? 0.2 : 1)
    boat.position.z -= b.z + boatBuoyancyCenter * Math.cos(b.heading)
    this.eye.copy(helm).applyQuaternion(boat.quaternion).add(boat.position)
    this.eye.x += shake
    this.point.set(48, -4.2, 0).applyQuaternion(boat.quaternion).add(this.eye)
    this.cabin.wheel.rotation.z = -b.steer * 1.55
    this.cabin.throttle.rotation.x = lerp(-0.45, 0.56, run.desired.throttle)
    this.cabin.setHeading(b.heading)
    for (const [h, model] of this.floatingHazards) {
      model.visible = h.z < b.z + 230 && h.z > b.z - 15
      if (model.visible) model.position.y = waveHeight(h.x, -h.z, t)
    }
    for (const lunge of b.lunges) {
      if (lunge.time >= 0 && t - lunge.time < boatLungeTiming.end) this.drawBoatShark(lunge, t)
    }
    return 61
  }

  private drawBoatShark(lunge: BoatLunge, time: number) {
    const { rise, breach, bite, clear } = boatLungeTiming
    const age = time - lunge.time
    const meg = lunge.shark === 'megalodon'
    const variant = lunge.side < 0 ? 0 : 1
    const shark = meg ? this.meg : this.sharks[variant]
    const pose = boatSharkPose(lunge, time)
    shark.root.visible = true
    shark.root.position.set(pose.x, pose.y, pose.z)
    shark.root.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
    shark.swimSpeed = (meg ? 1.55 : 2.1) + 0.65 * smoothstep(age, 0.4, bite)
    if (age >= bite && age <= clear && !this.animatedAttacks.has(lunge)
      && shark.bite(meg ? 0 : variant, meg ? 1.75 : 2.7)) this.animatedAttacks.add(lunge)
    if (age < breach) {
      this.env.uniforms.sharkWakePose.value.set(pose.x, pose.z, pose.forwardX, pose.forwardZ)
      this.env.uniforms.sharkWakeSize.value.set(meg ? 24 : 11, meg ? 1.2 : 0.66,
        smoothstep(age, 0, 0.18) * (1 - smoothstep(age, rise, breach)))
    }
  }

  private drawBoatSplashes(run: Session, time: number, reduced: boolean) {
    const now = run.activeTime
    let slot = 0
    for (let i = run.events.length - 1; i >= 0 && slot < this.boatSplashes.length; i--) {
      const event = run.events[i]
      const age = Math.max(0, now - event.t / 1000)
      if (age >= boatSplashDuration) break
      if (event.type !== 'WATER_SPLASH' || !event.boatSplash || event.x === undefined) continue
      const { shark, stage, z } = event.boatSplash
      const strength = (shark === 'megalodon' ? 1.85 : 1) * (stage === 'reentry' ? 1.12 : 1)
      this.boatSplashes[slot++].update(event.x, z, time, age, strength, reduced || this.quality === 'low')
    }
  }

  private drawRain(t: number, reduced: boolean) {
    const rainCount = reduced ? 72 : this.quality === 'low' ? 170 : 420
    const eye = this.camera.position
    for (let i = 0; i < rainCount; i++) {
      const o = i * 6
      const speed = 0.27 + this.rainSeeds[o + 3] * 0.19
      const y = ((this.rainSeeds[o + 1] - t * speed) % 1 + 1) % 1
      const x = ((this.rainSeeds[o] + t * 0.009) % 1 - 0.5) * 121
      const z = (this.rainSeeds[o + 2] - 0.62) * 147
      this.rainPositions[o] = eye.x + x
      this.rainPositions[o + 1] = eye.y + y * 39 - 25
      this.rainPositions[o + 2] = eye.z + z
      this.rainPositions[o + 3] = eye.x + x - 0.14
      this.rainPositions[o + 4] = eye.y + y * 39 - 24.1
      this.rainPositions[o + 5] = eye.z + z - 0.06
    }
    this.rainGeometry.setDrawRange(0, rainCount * 2)
    this.rainGeometry.attributes.position.needsUpdate = true
  }
}
