import * as T from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing'
import { tuning } from '../app/tuning'
import { clamp, damp, lerp, seededRandom } from '../core/math'
import type { Session } from '../game/session'
import { boatLungePosition, boatLungeTiming } from '../sim/boat'
import { roster } from '../sim/rescue'
import { waveHeight } from '../sim/water'
import { beam, environment, placeBeam } from './environment'
import { claw, cockpit, dock, fitModelScale, hazard, helicopter, light, lighthouse, MODEL_SCALES, person, raft,
  rescueVessel, SharkModel, wreck, type ScaledModel } from './models'

export type Quality = 'low' | 'medium' | 'high'
export interface RenderSettings { quality: Quality; reduceMotion: boolean; flashes: boolean }
const R = tuning.rescue
const amber = new T.Color('#ffc078')
const cyan = new T.Color('#73e6d5')
const danger = new T.Color('#ff664c')
const { smoothstep } = T.MathUtils
const bootClearance = 0.02

// The top of the breach passes over the board at age zero.
function boardBreachHeight(age: number) {
  return -1.5 - 6.1 * smoothstep(age, -2.2, -1.25)
    + 14.5 * smoothstep(age, -1.25, 0) - 14.9 * smoothstep(age, 0, 2.25)
}

function boatLungeHeight(age: number) {
  const { bite, strike, clear, end } = boatLungeTiming
  return -1.05 + 1.4 * (smoothstep(age, bite, strike) - smoothstep(age, strike, clear))
    - 7.2 * smoothstep(age, clear, end)
}

function ring(radius: number, color: string) {
  const meshRing = new T.Mesh(new T.RingGeometry(radius * 0.89, radius, 42), light(color))
  meshRing.rotation.x = -Math.PI / 2
  return meshRing
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
  private readonly helo: ReturnType<typeof helicopter>
  private readonly picker = claw()
  private readonly raft = raft()
  private readonly ship = wreck()
  private readonly rescueBoat = rescueVessel()
  private readonly deckPassengers = new T.Group()
  private readonly deckSlots = roster.map((_, i) =>
    new T.Vector3((i % 4) * 1.07 - 1.8, 1.585 + bootClearance, 0.3 - Math.floor(i / 4) * 1.4))
  private readonly people = roster.map((r, i) => person(r.skin, i))
  private readonly marker = ring(2.1, '#82f2d7')
  private readonly peopleMarkers = roster.map(() => ring(0.87, '#ffc078'))
  private readonly sharks = Array.from({ length: 3 }, (_, i) => new SharkModel('regularShark', i / 3))
  private readonly meg = new SharkModel('megalodon')
  private readonly animatedAttacks = new WeakSet<object>()
  private nextSharkBite = 0
  private readonly rescueBeam = beam(this.scene)
  private readonly island = lighthouse()
  private readonly lightBeam: ReturnType<typeof beam>
  private readonly modelSizes: Partial<Record<ScaledModel, ReturnType<typeof fitModelScale>>>
  private readonly schoolBuoy = hazard('barrel', 1.15)
  private readonly cabin = cockpit()
  private readonly rescueGroup = new T.Group()
  private readonly boatGroup = new T.Group()
  private readonly obstacles = new T.Group()
  private readonly rope = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: '#b5a998' }))
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
    const heloModel = helicopter()
    this.helo = { ...heloModel, root: new T.Group().add(heloModel.root) }
    this.modelSizes = {
      rescueVessel: fitModelScale('rescueVessel', this.rescueBoat),
      helicopter: fitModelScale('helicopter', heloModel.root),
      cruiseShip: fitModelScale('cruiseShip', this.ship),
      island: fitModelScale('island', this.island),
      rocks: fitModelScale('rocks', hazard('reef', MODEL_SCALES.rocks.referenceRadius)),
    }
    this.rescueBoat.add(this.deckPassengers)
    this.island.position.set(31, 0, -950)
    this.lightBeam = beam(this.island, '#ffbf65')

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
    this.scene.add(this.camera, this.upperLight, this.rim, this.flashLight, this.rescueGroup, this.boatGroup, this.meg.root)
    this.rim.position.set(-42, 35, 23)
    this.flashLight.position.set(41, 58, -12)
    this.camera.add(this.cabin.root)
    this.rescueGroup.add(this.helo.root, this.picker.root, this.raft.root, this.ship, this.rescueBoat, this.rope,
      this.marker, this.schoolBuoy, ...this.people.map(p => p.root), ...this.peopleMarkers, ...this.sharks.map(s => s.root))
    this.ship.position.set(-42, -0.7, -22)
    this.raft.root.position.x = -32
    this.rescueBoat.position.x = R.deploy
    this.rope.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(21), 3))
    this.rope.frustumCulled = false
    this.boatGroup.add(this.island, this.obstacles)
    dock(this.boatGroup, -901)
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
      loader.loadAsync(path + 'sar-helicopter.glb').then(({ scene }) => {
        const rotor = scene.getObjectByName('MainRotor')
        const tail = scene.getObjectByName('TailRotor')
        if (!rotor || !tail) return
        this.modelSizes.helicopter = fitModelScale('helicopter', scene)
        this.helo.root.clear().add(scene)
        this.helo.rotor = rotor as T.Group
        this.helo.tailRotor = tail as T.Group
      }),
      loader.loadAsync(path + 'rescue-vessel.glb').then(({ scene }) => {
        this.modelSizes.rescueVessel = fitModelScale('rescueVessel', scene)
        // The GLB's recovery deck is aft of its origin. Align it to the existing drop zone at full scale.
        const [deckX, deckY, deckZ] = MODEL_SCALES.rescueVessel.deckAnchor
        scene.position.add(new T.Vector3(-deckX, R.deckY - deckY, -deckZ))
        const deck = scene.getObjectByName('Cambered_nonskid_main_deck')
        // Sample the camber in boat-local coordinates before attaching the visual to the moving boat.
        scene.updateMatrixWorld(true)
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
    this.env.uniforms.time.value = t
    this.env.uniforms.dawn.value = arrival ? clamp(0.37 + run.elapsed / 15) : 0
    const flash = settings.flashes ? Math.max(0, 1 - (presentationTime % 13.42) * 5.8) * 0.72 : 0
    this.env.uniforms.flash.value = flash
    this.flashLight.intensity = flash * 4.5
    const fog = firstPerson && run.boat.z > 350 && run.boat.z < 600 ? 0.021 : 0.0068
    this.narrowFog.density = fog
    this.env.uniforms.fog.value = fog * 0.73
    this.env.uniforms.search.value = this.rescueBeam.mesh.visible ? 0.7 : 0
    this.meg.root.visible = false
    this.meg.swimSpeed = 1
    let desiredFov = 44
    if (isRescue) {
      desiredFov = this.drawRescue(run, t, departure, settings.reduceMotion)
    } else {
      desiredFov = this.drawBoat(run, t, arrival, settings.reduceMotion)
    }
    const animationDt = run.paused || run.autoStop || run.record ? 0 : dt
    if (isRescue) this.sharks.forEach(shark => shark.animate(animationDt))
    this.meg.animate(animationDt)
    const weight = !this.initialized || newPhase && (firstPerson || arrival || run.phase === 'rescue') ? 1 : 1 - Math.exp(-dt * (firstPerson ? 8 : 3.6))
    this.camera.position.lerp(this.eye, weight)
    this.scratch.lerp(this.point, weight)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.scratch)
    if (firstPerson && !settings.reduceMotion) this.camera.rotateZ(run.boat.roll)
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
    this.env.sea.position.set(Math.round(this.camera.position.x / 18) * 18, 0, Math.round(this.camera.position.z / 18) * 18)
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
    this.nextSharkBite = 0
    this.sharks.forEach(shark => shark.resetAnimation())
    this.meg.resetAnimation()
    this.obstacles.clear()
    for (const obstacle of run.boat.hazards) {
      const model = hazard(obstacle.type, obstacle.radius)
      if (obstacle.type === 'reef') fitModelScale('rocks', model, obstacle.radius / MODEL_SCALES.rocks.referenceRadius)
      model.position.set(obstacle.x, 0, -obstacle.z)
      model.rotation.y = obstacle.z * 0.31
      this.obstacles.add(model)
    }
  }

  private drawRescue(run: Session, t: number, departure: boolean, reduced: boolean) {
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
    if (inIntro) {
      this.eye.set(-31 + Math.sin(run.elapsed * 0.14) * 17, 11 + run.elapsed * 0.42, 36 + run.elapsed * 0.66)
      this.point.set(-38, 7.0, -7)
      this.meg.root.visible = run.elapsed > 7
      this.meg.root.position.set(-73 + run.elapsed * 2.4, -2.35, 14)
      this.meg.root.rotation.set(0, Math.PI / 2, -0.02, 'YXZ')
      const split = clamp(run.elapsed / 7)
      this.ship.children[0].rotation.z = lerp(-0.06, -0.25, split)
      this.ship.children[1].rotation.z = lerp(0.04, 0.33, split)
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
    this.ship.visible = !practice
    this.helo.root.visible = !inIntro
    this.helo.root.position.set(inArrival ? r.x - (8 - run.elapsed) ** 2 * 1.15 : r.x, r.altitude, 0)
    this.helo.root.rotation.z = r.bank
    this.helo.root.rotation.y = -0.16
    this.helo.rotor.rotation.y = t * 29
    this.helo.tailRotor.rotation.z = t * 51
    this.picker.root.visible = !inIntro && !inArrival
    this.picker.root.position.set(r.clawX, r.clawY, 0)
    this.picker.root.rotation.z = -r.swing
    this.picker.jaws.forEach(jaw => { jaw.rotation.z = lerp(0.39, -0.54, r.gripProgress) })
    const rope = this.rope.geometry.attributes.position
    for (let i = 0; i < rope.count; i++) {
      const k = i / (rope.count - 1)
      rope.setXYZ(i, lerp(r.x + 0.36, r.clawX, k) + 2 * r.swing * Math.sin(k * Math.PI),
        lerp(r.altitude - 1.31, r.clawY + 0.27, k), 0)
    }
    rope.needsUpdate = true
    this.rope.visible = this.picker.root.visible
    const source = new T.Vector3(this.helo.root.position.x - 2.73, r.altitude - 0.79, 0.61)
    const target = new T.Vector3(this.helo.root.position.x - 7.6 + Math.sin(t * 0.8) * 2.8, 0, -0.6)
    placeBeam(this.rescueBeam.mesh, source, target)
    this.env.uniforms.contact.value.copy(target)
    this.rescueBeam.intensity.value = 0.39
    this.marker.visible = this.picker.root.visible && !departure
    this.marker.position.set(r.clawX, waveHeight(r.clawX, 0, t) + 0.1, 0)
    this.marker.material.color.copy(r.grabbable().length ? amber : cyan)
    this.raft.root.visible = !practice
    this.raft.root.position.y = waveHeight(-32, 0, t) + 0.35
    this.raft.planks.forEach(({ plank, offset, rotation, drift }, index) => {
      const warp = clamp(breach / 5) * drift
      plank.position.set(warp * 1.4, 0.12 + Math.sin(t * 2 + index * 0.22) * (breach >= 0 ? 0.28 : 0.06), offset * (1 + Math.max(0, Math.abs(warp) * 0.29)))
      plank.rotation.set(0, rotation + warp * 0.32, Math.sin(t + index * 0.1) * 0.055)
    })
    this.rescueBoat.position.set(R.deploy, waveHeight(R.deploy, 0, t), 0)
    this.rescueBoat.rotation.y = -0.13
    this.rescueBoat.rotation.z = Math.sin(t * 1.7) * 0.043
    this.schoolBuoy.visible = practice && !r.carried.length
    this.schoolBuoy.position.set(r.survivors[0].x, waveHeight(r.survivors[0].x, 0, t) + 0.25, 0)
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
        i >= 0 ? r.clawY - 2.2 : r.survivorY(s) - 1.22, i >= 0 ? 0.1 : s.z)
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
      const targetX = attack ? attack.target.x : -32 + Math.cos(angle) * dx
      const chargeStart = 15 * (i % 2 === 0 ? 1 : -1)
      const z = attack ? lerp(chargeStart, 0.8, clamp((t - attack.start) / (attack.end - attack.start))) : Math.sin(angle) * dx * 0.42
      root.position.set(targetX, waveHeight(targetX, z, t) - (attack ? 0.25 : 0.58), z)
      root.rotation.y = attack ? (chargeStart > 0 ? Math.PI : 0) : Math.atan2(-Math.sin(angle), 0.42 * Math.cos(angle))
      if (attack?.announced && attack.target.state === 'floating' && !this.animatedAttacks.has(attack)
        && shark.bite(this.nextSharkBite, 2.7)) {
        this.animatedAttacks.add(attack)
        this.nextSharkBite++
      }
    })
    return fov
  }

  private drawBoat(run: Session, t: number, arrival: boolean, reduced: boolean) {
    const b = run.boat
    if (arrival) {
      const path = clamp(run.elapsed / 12)
      this.eye.set(-18 + path * 8, 10 + path * 6, -872 - path * 7)
      this.point.set(13, 6 + path * 5, -926)
      this.rescueGroup.visible = true
      this.rescueBoat.position.set(2.8, waveHeight(1, -902, t), -903)
      this.rescueBoat.rotation.y = Math.PI / 2
      const visible = this.rescueGroup.children
      visible.forEach(item => { item.visible = item === this.rescueBoat || item === this.helo.root || this.people.some(p => p.root === item) })
      this.helo.root.position.set(12 - path * 37, 18 + path * 2, -931)
      this.helo.rotor.rotation.y = t * 29
      let disembarking = 0
      this.people.forEach(({ root, arms }, i) => {
        root.visible = run.rescue.survivors[i]?.state === 'saved'
        if (!root.visible) return
        if (root.parent !== this.rescueGroup) this.rescueGroup.add(root)
        const slot = disembarking++
        root.position.set(9 + (slot % 2) * 2.15, 1.49, -904 - (slot * 1.65 + path * 4.7))
        root.rotation.set(0, Math.PI, 0)
        arms[0].rotation.z = Math.sin(t * 6 + i) * 0.48
        arms[1].rotation.z = -arms[0].rotation.z
      })
      return 49
    }
    const water = waveHeight(b.x, -b.z, t)
    const shake = !reduced && b.time - b.lastImpact < 0.48 ? Math.sin(t * 75) * (0.48 - (b.time - b.lastImpact)) : 0
    this.eye.set(b.x + shake, 2.58 + water * (reduced ? 0.13 : 0.56), -b.z)
    this.point.set(b.x + Math.sin(b.heading) * 48, 1.15 + water * 0.55, -b.z - Math.cos(b.heading) * 48)
    this.cabin.wheel.rotation.z = -b.steer * 0.82
    this.cabin.wiper.rotation.z = reduced ? -0.85 : -0.80 - Math.cos(t * 1.9) * 0.63
    this.cabin.lantern.rotation.z = reduced ? 0 : Math.sin(t * 2.0) * 0.14 + b.roll
    this.obstacles.children.forEach((model, i) => {
      const h = b.hazards[i]
      model.visible = h.z < b.z + 230 && h.z > b.z - 15
      if (model.visible && h.type !== 'reef') model.position.y = waveHeight(h.x, -h.z, t)
    })
    const active = b.lunges.find(l => l.time >= 0 && t - l.time < boatLungeTiming.end)
    if (active) {
      const age = t - active.time
      const snout = boatLungePosition(active, age)
      const speed = Math.hypot(active.vx, active.vz)
      // The model's origin is behind the snout. Align its head with the collision path.
      const snoutOffset = MODEL_SCALES.megalodon.targetLength * 0.44
      const x = snout.x - active.vx / speed * snoutOffset
      const z = -snout.z + active.vz / speed * snoutOffset
      const rise = (boatLungeHeight(age + 0.01) - boatLungeHeight(age - 0.01)) / 0.02
      this.meg.root.visible = true
      this.meg.root.position.set(x, waveHeight(x, z, t) + boatLungeHeight(age), z)
      this.meg.root.rotation.set(-Math.atan2(rise, speed), Math.atan2(active.vx, -active.vz), 0, 'YXZ')
      this.meg.swimSpeed = lerp(1.5, 2, smoothstep(age, 1, boatLungeTiming.bite))
      if (age >= boatLungeTiming.bite && age <= boatLungeTiming.clear
        && !this.animatedAttacks.has(active) && this.meg.bite(0, 1.75)) this.animatedAttacks.add(active)
    }
    const bearing = Math.sin(t * 0.91) * 110
    const target = new T.Vector3(bearing, 24.7, 116)
    placeBeam(this.lightBeam.mesh, new T.Vector3(7, 25.9, 6), target)
    this.lightBeam.intensity.value = 0.44
    return 59
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
