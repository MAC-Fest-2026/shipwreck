import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { clamp, damp, seededRandom } from '../core/math'
import { boatSharkLength, reefScales, rockProfiles, type FloatingHazard, type ReefHazard, type RockVariant } from '../sim/boat'

// Visual lengths in scene units. Survivors, the wooden board, and the rescue deck are fixed references.
export const MODEL_SCALES = {
  regularShark: { label: 'Regular shark', targetLength: 6.2 },
  megalodon: { label: 'Megalodon', targetLength: boatSharkLength },
  rescueVessel: { label: 'Rescue vessel', scale: 1, deckAnchor: [-1.95, 1.548, 0] },
  helicopter: { label: 'Helicopter', targetLength: 14.2 },
  cruiseShip: { label: 'Cruise ship', targetLength: 145 },
  ...reefScales,
} as const

export type ScaledModel = keyof typeof MODEL_SCALES

/** Fit a detached model in its neutral pose. Length is its longer horizontal span. */
export function fitModelScale(name: ScaledModel, model: T.Object3D, lengthMultiplier = 1) {
  const { x, y, z } = new T.Box3().setFromObject(model, true).getSize(new T.Vector3())
  const length = Math.max(x, z)
  const rule = MODEL_SCALES[name]
  if (!Number.isFinite(length) || length <= 0) throw new Error(`Unable to measure ${rule.label}.`)
  const scale = 'targetLength' in rule ? rule.targetLength * lengthMultiplier / length : rule.scale
  model.scale.multiplyScalar(scale)
  return { length: length * scale, width: Math.min(x, z) * scale, height: y * scale, scale }
}

const materials = new Map<string, T.MeshStandardMaterial>()
export function metal(color: string, roughness = 0.64, metalness = 0.25) {
  const key = [color, roughness, metalness].join('/')
  let material = materials.get(key)
  if (!material) {
    material = new T.MeshStandardMaterial({ color, roughness, metalness })
    materials.set(key, material)
  }
  return material
}
export const light = (color: string) => new T.MeshBasicMaterial({ color })
const steel = metal('#7c9697', 0.42, 0.62)
const dark = metal('#182c30')
const seal = metal('#0b1b1e')
const glass = metal('#142d39', 0.19, 0.7)
const orange = metal('#df6220')
const trim = metal('#e5b576')
const lamp = light('#ffe0a3')
const green = light('#8cffb3')
const red = light('#ff6140')
const rotorMaterial = metal('#21272b')
const wood = ['#6a4030', '#855640', '#805940', '#996748'].map(c => metal(c, 0.88, 0.04))
type Material = T.Material

const cube = new T.BoxGeometry()
const sphere = new T.SphereGeometry(1, 20, 12)
const cylinder = new T.CylinderGeometry(1, 1, 1, 16)
export function mesh(parent: T.Object3D, geo: T.BufferGeometry, material: Material, x: number, y: number, z: number) {
  const result = new T.Mesh(geo, material)
  result.position.set(x, y, z)
  parent.add(result)
  return result
}
export function box(parent: T.Object3D, m: Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const item = mesh(parent, cube, m, x, y, z)
  item.scale.set(w, h, d)
  return item
}
function oval(parent: T.Object3D, m: Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const item = mesh(parent, sphere, m, x, y, z)
  item.scale.set(w, h, d)
  return item
}
export function tube(parent: T.Object3D, m: Material, a: number[], b: number[], radius: number) {
  const start = new T.Vector3(...a)
  const end = new T.Vector3(...b)
  const midpoint = start.clone().lerp(end, 0.5)
  const result = mesh(parent, cylinder, m, midpoint.x, midpoint.y, midpoint.z)
  const delta = end.sub(start)
  result.scale.set(radius, delta.length(), radius)
  result.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize())
  return result
}
function extrude(points: [number, number][], depth: number) {
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)))
  return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
}
function badge(parent: T.Object3D, text: string, x: number, y: number, z: number, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 96
  const c = canvas.getContext('2d')!
  c.font = 'bold 65px sans-serif'
  c.textAlign = 'center'
  c.fillStyle = '#e5e7df'
  c.fillText(text, 192, 70)
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  return mesh(parent, new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), x, y, z)
}

function mergeStaticMeshes(parent: T.Group) {
  const grouped = new Map<T.Material, T.Mesh[]>()
  for (const child of parent.children) {
    if (!(child instanceof T.Mesh) || Array.isArray(child.material) || child.material.transparent) continue
    const group = grouped.get(child.material) ?? []
    group.push(child)
    grouped.set(child.material, group)
  }
  for (const [material, parts] of grouped) {
    if (parts.length < 2) continue
    const source = parts.map(part => {
      part.updateMatrix()
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
      return geometry.applyMatrix4(part.matrix)
    })
    const merged = mergeGeometries(source)
    source.forEach(geometry => geometry.dispose())
    if (!merged) continue
    parent.remove(...parts)
    mesh(parent, merged, material, 0, 0, 0)
  }
}

export function helicopter() {
  const root = new T.Group()
  oval(root, steel, -0.55, 0, 0, 3.3, 1.34, 1.25)
  oval(root, dark, -1.0, -0.86, 0, 2.65, 0.52, 1.15)
  oval(root, steel, -3.0, -0.15, 0, 1.34, 0.82, 1.035)
  const windscreen = extrude([[-4.03, 0.14], [-3.05, 1.13], [-2.25, 1.12], [-2.42, 0.14]], 0.06)
  const sideWindow = extrude([[-2.12, 1], [-1.12, 1], [-1.05, 0.13], [-2.29, 0.13]], 0.06)
  for (const side of [-1, 1]) {
    mesh(root, windscreen, glass, 0, 0, 0.73 * side).rotation.y = -0.17 * side
    mesh(root, sideWindow, glass, 0, 0, 1.06 * side)
    box(root, seal, 0.08, 0.14, 1.19 * side, 1.38, 1.5, 0.16)
    box(root, dark, -0.2, -0.46, 1.29 * side, 0.92, 0.21, 0.11)
    box(root, glass, 1.28, 0.38, 1.04 * side, 0.57, 0.55, 0.12)
    box(root, orange, 0.19, -0.72, 1.16 * side, 3.55, 0.18, 0.12)
    oval(root, steel, 0.47, 1.08, 0.77 * side, 1.83, 0.53, 0.53)
    oval(root, dark, 1.73, 1.10, 0.77 * side, 0.44, 0.37, 0.37)
    tube(root, dark, [-1.9, -0.66, side * 0.8], [-1.74, -1.62, side * 1.09], 0.13)
    oval(root, seal, -1.72, -1.57, side * 1.12, 0.37, 0.37, 0.15)
    oval(root, steel, -1.72, -1.57, side * 1.22, 0.18, 0.18, 0.06)
    oval(root, side > 0 ? red : green, 1.39, -0.42, side * 1.27, 0.12, 0.13, 0.1)
  }
  badge(root, 'SAR 07', 0.75, -0.22, 1.25, 1.52, 0.35)
  oval(root, steel, 4.14, 0.12, 0, 3.1, 0.53, 0.53).rotation.z = 0.125
  mesh(root, extrude([[0, 0], [1.9, 0.12], [1.55, 2.25], [0.92, 2.22]], 0.2), steel, 5.55, 0.12, -0.1)
  box(root, dark, 6.3, 0.36, 0, 0.9, 0.13, 2.8).rotation.y = -0.23
  tube(root, dark, [5.15, 0, 0], [5.62, -1.08, 0.08], 0.12)
  oval(root, seal, 5.65, -1.08, 0.09, 0.26, 0.27, 0.14)
  const tailRotor = new T.Group()
  tailRotor.name = 'TailRotor'
  tailRotor.position.set(6.97, 2.18, 0.41)
  root.add(tailRotor)
  for (let blade = 0; blade < 4; blade++) {
    const pivot = new T.Group()
    pivot.rotation.z = blade * Math.PI / 2
    tailRotor.add(pivot)
    box(pivot, rotorMaterial, 0.51, 0, 0, 0.93, 0.13, 0.04)
  }
  oval(root, red, 7.01, 2.23, -0.2, 0.18, 0.13, 0.17)
  tube(root, dark, [0.1, 1.25, 0], [0.1, 2.15, 0], 0.12)
  const rotor = new T.Group()
  rotor.name = 'MainRotor'
  root.add(rotor)
  rotor.position.set(0.1, 2.17, 0)
  oval(rotor, steel, 0, 0, 0, 0.58, 0.15, 0.58)
  for (let blade = 0; blade < 4; blade++) {
    const pivot = new T.Group()
    pivot.rotation.y = blade * Math.PI / 2
    rotor.add(pivot)
    box(pivot, rotorMaterial, 3.8, 0, 0, 6.9, 0.055, 0.37).rotation.y = -0.035
    box(pivot, trim, 7.0, 0, 0.11, 0.38, 0.057, 0.37)
  }
  oval(root, lamp, -3.0, -0.83, 0.44, 0.23, 0.16, 0.23)
  oval(root, dark, 0.4, -1.34, 0, 0.41, 0.28, 0.43)
  mergeStaticMeshes(root)
  return { root, rotor, tailRotor }
}

const rotorPlaybackRate = 1.65
const tailCyclesPerTake = 36

function flightRotorClip(take: T.AnimationClip) {
  const tail = take.tracks.find(track => track.name === 'Rotor_Rear_02.quaternion')
  if (!tail || tail.times.length < 2) return take

  // Take 001 has four main rotor turns and just one tail rotor turn per second.
  // Repeat the original tail keys within the take so both rotors can run at flight speed.
  const intervals = tail.times.length - 1
  const stride = tail.getValueSize()
  const last = intervals * tailCyclesPerTake
  const retimed = tail.clone()
  retimed.times = new Float32Array(last + 1)
  retimed.values = new Float32Array((last + 1) * stride)
  for (let cycle = 0; cycle < tailCyclesPerTake; cycle++) {
    const start = cycle * intervals
    for (let key = 0; key < intervals; key++) {
      retimed.times[start + key] = (cycle * take.duration + tail.times[key]) / tailCyclesPerTake
    }
    retimed.values.set(tail.values.subarray(0, intervals * stride), start * stride)
  }
  retimed.times[last] = take.duration
  retimed.values.set(tail.values.subarray(intervals * stride), last * stride)
  return new T.AnimationClip(take.name, take.duration,
    take.tracks.map(track => track === tail ? retimed : track), take.blendMode)
}

function spinRotorNodes(main: T.Object3D, tail: T.Object3D) {
  const revolution = 2 * Math.PI
  return (dt: number) => {
    main.rotation.y = (main.rotation.y + dt * revolution * 4 * rotorPlaybackRate) % revolution
    tail.rotation.z = (tail.rotation.z + dt * revolution * tailCyclesPerTake * rotorPlaybackRate) % revolution
  }
}

export class HelicopterModel {
  readonly root = new T.Group()
  readonly winch = new T.Object3D()
  readonly searchlight = new T.Object3D()
  readonly fallbackSize: ReturnType<typeof fitModelScale>
  animateRotors: (dt: number) => void
  private facingRight = false
  private posed = false

  constructor() {
    const fallback = helicopter()
    this.fallbackSize = fitModelScale('helicopter', fallback.root)
    this.root.add(fallback.root)
    this.winch.name = 'WinchCableExit'
    this.searchlight.name = 'SearchlightLens'
    this.winch.position.set(0.4, -1.625, 0)
    this.searchlight.position.set(-3, -1, 0.44)
    fallback.root.add(this.winch, this.searchlight)
    this.animateRotors = spinRotorNodes(fallback.rotor, fallback.tailRotor)
  }

  setAsset(art: T.Object3D, clips: T.AnimationClip[]) {
    art.updateMatrixWorld(true)
    const size = fitModelScale('helicopter', art)
    const take = T.AnimationClip.findByName(clips, 'Take 001')
    if (take) {
      const mixer = new T.AnimationMixer(art)
      mixer.clipAction(flightRotorClip(take)).setLoop(T.LoopRepeat, Infinity).setEffectiveTimeScale(rotorPlaybackRate).play()
      this.animateRotors = dt => { mixer.update(dt) }
    } else {
      const main = art.getObjectByName('MainRotor')
      const tail = art.getObjectByName('TailRotor')
      if (!main || !tail) throw new Error('Helicopter is missing Take 001 and rotor control nodes.')
      this.animateRotors = spinRotorNodes(main, tail)
    }
    // Mesh measurements in the centered EC-135's local space, before the scene's flight transform.
    this.winch.position.set(-0.56, -1.75, 0)
    this.searchlight.position.set(-4.05, -1.59, 0)
    art.add(this.winch, this.searchlight)
    oval(this.winch, dark, 0, 0.10, 0, 0.20, 0.12, 0.16)
    oval(this.searchlight, dark, 0, 0.09, 0, 0.23, 0.105, 0.19)
    oval(this.searchlight, lamp, 0, 0.018, 0, 0.16, 0.028, 0.135)
    this.root.clear().add(art)
    this.animateRotors(0)
    return size
  }

  resetHeading() {
    this.facingRight = false
    this.posed = false
  }

  pose(velocity: number, bank: number, dt: number, reduced: boolean) {
    if (Math.abs(velocity) > 0.8) this.facingRight = velocity > 0
    // The model faces -X. Hovers retain the last heading, and turns pass through +Z.
    const heading = this.facingRight ? Math.PI : 0
    const yaw = this.posed ? damp(this.root.rotation.y, heading, 9, dt) : heading
    const roll = reduced ? 0 : clamp((heading - yaw) * 0.055, -0.12, 0.12)
    const pitch = this.posed ? damp(this.root.rotation.z, bank, 10, dt) : bank
    // Apply the simulation's bank in the world travel plane, even while the model is turning.
    this.root.rotation.set(roll, yaw, pitch, 'ZYX')
    this.posed = true
  }
}

export function claw() {
  const root = new T.Group()
  oval(root, steel, 0, 0.16, 0, 0.38, 0.31, 0.38)
  oval(root, trim, 0, -0.14, 0, 0.47, 0.13, 0.47)
  const jaws = Array.from({ length: 3 }, (_, index) => {
    const base = new T.Group()
    base.rotation.y = index * Math.PI * 2 / 3
    root.add(base)
    const jaw = new T.Group()
    jaw.position.set(0.3, -0.15, 0)
    base.add(jaw)
    const path = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0), new T.Vector3(0.4, -0.38, 0),
      new T.Vector3(0.46, -0.82, 0), new T.Vector3(0.1, -1.16, 0),
    ])
    mesh(jaw, new T.TubeGeometry(path, 10, 0.104, 6), trim, 0, 0, 0)
    return jaw
  })
  return { root, jaws }
}

export function rescueVessel() {
  const root = new T.Group()
  const deckMarks = new T.Group()
  deckMarks.name = 'RescueDeckMarks'
  root.add(deckMarks)
  const hullShape: [number, number][] = [[-5.1, -1.05], [-6.2, 0.5], [-5.9, 1.18], [6.6, 1.18], [6.2, -0.82], [5, -1.05]]
  mesh(root, extrude(hullShape, 3.5), orange, 4.1, 0, -1.75)
  box(root, dark, 4.2, 0.11, 0, 11.9, 0.27, 3.65)
  box(root, steel, 4.45, 1.34, 0, 11.65, 0.26, 3.66)
  box(root, dark, 0, 1.53, 0, 7.3, 0.11, 4.28)
  for (const side of [-1, 1]) {
    box(deckMarks, green, 0, 1.61, side * 2.04, 7.05, 0.07, 0.074)
    box(deckMarks, green, side * 3.51, 1.61, 0, 0.074, 0.07, 4.13)
    for (let x = 4.1; x < 10; x += 1.5) tube(root, steel, [x, 1.38, side * 1.67], [x, 2.5, side * 1.67], 0.036)
    tube(root, steel, [4, 2.5, side * 1.67], [9.3, 2.5, side * 1.67], 0.034)
    const lifeRing = mesh(root, new T.TorusGeometry(0.33, 0.11, 6, 16), orange, 4.58, 2.36, side * 1.6)
    lifeRing.rotation.y = side * 0.07
    oval(root, side < 0 ? green : red, 7.5, 4.3, side * 1.41, 0.13, 0.12, 0.14)
  }
  box(deckMarks, light('#c3dfc7'), 0, 1.602, 0, 0.3, 0.016, 1.3)
  for (const z of [-0.65, 0.65]) box(deckMarks, light('#c3dfc7'), 0, 1.602, z, 1.2, 0.016, 0.25)
  box(root, steel, 6.8, 2.87, 0, 3.8, 2.64, 2.95)
  box(root, orange, 6.8, 4.23, 0, 4.22, 0.22, 3.21)
  for (const x of [5.72, 7.03, 8.08]) {
    box(root, glass, x, 3.47, 1.495, 0.95, 0.76, 0.09)
    box(root, glass, x, 3.47, -1.495, 0.95, 0.76, 0.09)
  }
  badge(root, 'RESCUE', 6.65, 2.47, 1.51, 2.4, 0.39)
  tube(root, steel, [6.55, 4.27, 0], [6.55, 7.95, 0], 0.105)
  tube(root, steel, [6.55, 6.25, -1.01], [6.55, 6.25, 1.01], 0.055)
  oval(root, lamp, 6.55, 8, 0, 0.14, 0.15, 0.14)
  mergeStaticMeshes(deckMarks)
  mergeStaticMeshes(root)
  return root
}

export function raft() {
  const root = new T.Group()
  const rng = seededRandom(995)
  const planks = Array.from({ length: 10 }, (_, i) => {
    const plank = box(root, wood[i % 4], 0, 0, 0, 9 + rng() * 1.8, 0.18, 0.42 + rng() * 0.16)
    return { plank, offset: i * 0.49 - 2.2, rotation: (rng() - 0.5) * 0.12, drift: (rng() - 0.5) * 2.8 }
  })
  return { root, planks }
}

export function person(skin: string, variation: number) {
  const root = new T.Group()
  const skinMaterial = metal(skin, 0.87, 0)
  const jacket = metal(variation % 2 ? '#ff6a17' : '#ff8940', 0.83, 0)
  const jumpsuit = metal(['#273949', '#243939', '#4d4f4c'][variation % 3], 0.95, 0)
  oval(root, jacket, 0, 1.13, 0, 0.278, 0.35, 0.15)
  oval(root, skinMaterial, 0, 1.62, 0, 0.142, 0.174, 0.135)
  oval(root, dark, 0, 1.705, -0.021, 0.147, 0.10, 0.138)
  box(root, dark, 0, 1.08, 0.145, 0.48, 0.06, 0.023)
  for (const side of [-1, 1]) {
    box(root, trim, side * 0.12, 1.31, 0.106, 0.065, 0.18, 0.08)
    oval(root, jumpsuit, side * 0.112, 0.51, 0, 0.106, 0.47, 0.103)
    oval(root, dark, side * 0.112, 0.083, 0.049, 0.118, 0.095, 0.14)
  }
  const arms = [-1, 1].map(side => {
    const arm = new T.Group()
    arm.position.set(side * 0.235, 1.33, 0.018)
    root.add(arm)
    oval(arm, jumpsuit, 0, -0.22, 0, 0.088, 0.25, 0.083)
    oval(arm, skinMaterial, 0, -0.47, 0, 0.062, 0.104, 0.072)
    return arm
  })
  mergeStaticMeshes(root)
  return { root, arms }
}

const sharkClips = {
  regularShark: ['Action_Swimming', 'Action_Bite_1', 'Action_Bite_2', 'Action_Bite_3'],
  megalodon: ['Megalodon_skeleton|megalodon_swim_forward', 'Megalodon_skeleton|megalodon_attack_bite'],
} as const
const biteFade = 0.12

interface SharkAnimation {
  mixer: T.AnimationMixer
  swim: T.AnimationAction
  bites: T.AnimationAction[]
  activeBite: T.AnimationAction | null
}

export class SharkModel {
  readonly root = new T.Group()
  swimSpeed = 1
  private animation?: SharkAnimation

  constructor(private readonly kind: keyof typeof sharkClips, private readonly swimPhase = 0) {}

  setAsset(scene: T.Object3D, clips: T.AnimationClip[]) {
    const [swimClip, ...biteClips] = sharkClips[this.kind].map(name => {
      const clip = T.AnimationClip.findByName(clips, name)
      if (!clip) throw new Error(`Missing animation "${name}".`)
      return clip
    })
    // Both GLBs face +Z. The outer group owns the game path and heading.
    const model = cloneSkeleton(scene)
    model.updateMatrixWorld(true)
    const size = fitModelScale(this.kind, model)
    const mixer = new T.AnimationMixer(model)
    const swim = mixer.clipAction(swimClip).setLoop(T.LoopRepeat, Infinity)
    const bites = biteClips.map(clip => {
      const action = mixer.clipAction(clip).setLoop(T.LoopOnce, 1)
      action.clampWhenFinished = true
      return action
    })
    const animation: SharkAnimation = { mixer, swim, bites, activeBite: null }
    this.animation = animation
    mixer.addEventListener('finished', ({ action }) => {
      if (action !== animation.activeBite) return
      action.crossFadeTo(swim.reset().play(), biteFade, false)
      animation.activeBite = null
    })
    this.root.add(model)
    this.resetAnimation()
    return size
  }

  resetAnimation() {
    const animation = this.animation
    if (!animation) return
    animation.mixer.stopAllAction()
    animation.activeBite = null
    animation.swim.reset().play().time = animation.swim.getClip().duration * this.swimPhase
    animation.mixer.update(0)
  }

  bite(variant = 0, speed = 1) {
    const animation = this.animation
    if (!animation) return false
    const next = animation.bites[variant % animation.bites.length]
    const previous = animation.activeBite ?? animation.swim
    next.reset().setEffectiveTimeScale(speed).play()
    if (previous !== next) previous.crossFadeTo(next, biteFade, false)
    animation.activeBite = next
    return true
  }

  animate(dt: number) {
    if (!this.root.visible || !this.animation) return
    this.animation.swim.setEffectiveTimeScale(this.swimSpeed)
    this.animation.mixer.update(dt)
  }
}

export function wreck() {
  const root = new T.Group()
  const hull = metal('#263c43')
  const faded = metal('#607c82')
  const black = metal('#142026')
  mesh(root, extrude([[-32, 4.7], [-28, -3.2], [25, -3.2], [32, 4.7]], 9.8), hull, 0, 0, -4.9)
  for (let level = 0; level < 4; level++) {
    const length = 54 - level * 5
    const width = 9.4 - level * 0.7
    const y = 5.6 + level * 1.55
    box(root, faded, -1, y, 0, length, 1.55, width)
    for (const side of [-1, 1]) {
      for (let x = 1 - length / 2; x < length / 2 - 2; x += 2) {
        box(root, black, x, y + 0.1, side * width / 2, 1.1, 0.52, 0.06)
      }
    }
  }
  box(root, dark, -7, 12.9, 0, 3, 4.2, 3.3).rotation.z = 0.16
  mergeStaticMeshes(root)
  return root
}

export function prepareCruiseWreck(model: T.Object3D) {
  // The authored bow points along +Z and the geometry is offset from the origin.
  model.rotation.y = Math.PI / 2
  const size = fitModelScale('cruiseShip', model)
  const bounds = new T.Box3().setFromObject(model, true)
  const waterline = bounds.getCenter(new T.Vector3())
  waterline.y = bounds.min.y + size.height * 0.25
  model.position.sub(waterline)
  return size
}

export function prepareRockSet(scene: T.Object3D) {
  const variants = new Map((Object.keys(rockProfiles) as RockVariant[]).map(name => {
    const source = scene.getObjectByName(name)
    if (!(source instanceof T.Mesh)) throw new Error(`Missing ocean rock ${name}.`)
    return [name, { source, size: fitModelScale('rocks', source) }] as const
  }))
  return { variants, referenceSize: variants.get('Boulder_01')!.size }
}

export function instanceRocks(asset: ReturnType<typeof prepareRockSet>, rocks: readonly ReefHazard[]) {
  const batches = new Map<RockVariant, ReefHazard[]>()
  for (const rock of rocks) {
    const group = batches.get(rock.variant)
    if (group) group.push(rock)
    else batches.set(rock.variant, [rock])
  }
  const pose = new T.Object3D()
  return Array.from(batches, ([name, placements]) => {
    const { source, size } = asset.variants.get(name)!
    const batch = new T.InstancedMesh(source.geometry, source.material, placements.length)
    batch.name = name
    placements.forEach((rock, index) => {
      const [pitch, roll, sink] = rock.profile
      pose.position.set(rock.x, -sink * rock.length, -rock.z)
      pose.rotation.set(T.MathUtils.degToRad(pitch), rock.yaw, T.MathUtils.degToRad(roll), 'YXZ')
      pose.scale.setScalar(size.scale * rock.length / MODEL_SCALES.rocks.targetLength)
      pose.updateMatrix()
      batch.setMatrixAt(index, pose.matrix)
    })
    batch.instanceMatrix.needsUpdate = true
    batch.computeBoundingSphere()
    return batch
  })
}

export function lighthouse() {
  const root = new T.Group()
  for (let i = 0; i < 5; i++) {
    const r = 2.7 - i * 0.28
    const segment = mesh(root, new T.CylinderGeometry(r - 0.24, r, 3.45, 18), metal(i % 2 === 0 ? '#c1b59c' : '#95482e'), 7, 9.65 + i * 3.45, 6)
    segment.rotation.y = 0.12
  }
  tube(root, dark, [7, 24.3, 6], [7, 26.4, 6], 1.57)
  oval(root, lamp, 7, 25.65, 6, 1.45, 1.34, 1.43)
  mesh(root, new T.ConeGeometry(2.13, 1.9, 16), dark, 7, 27.22, 6)
  return root
}

export function dock(parent: T.Object3D, z: number) {
  for (let index = 0; index < 12; index++) {
    box(parent, wood[index % 4], 10.3, 1.35, z + index * 1.5, 8, 0.27, 1.43)
  }
  for (let index = 0; index < 6; index++) {
    for (const side of [-1, 1]) {
      const x = 10.3 + side * 3.8
      tube(parent, wood[0], [x, -1, z + index * 3.4], [x, 2.0, z + index * 3.4], 0.18)
      if (index % 2 === 0) oval(parent, lamp, x, 2.02, z + index * 3.4, 0.12, 0.12, 0.12)
    }
  }
}

export function hazard(type: FloatingHazard['type'], radius: number) {
  const root = new T.Group()
  if (type === 'debris') {
    for (let index = 0; index < 4; index++) {
      const piece = box(root, wood[index], (index - 1.5) * 0.44, 0.1, 0, 0.37, 0.22, radius * 1.6)
      piece.rotation.y = 0.15 * index
    }
  } else {
    tube(root, orange, [0, -0.55, 0], [0, 0.67, 0], radius * 0.55)
    for (const y of [-0.34, 0.49]) tube(root, dark, [0, y, 0], [0, y + 0.12, 0], radius * 0.57)
  }
  return root
}

function roundedPanel(width: number, height: number, depth: number, corner: number, bevel: number) {
  const x = width / 2
  const y = height / 2
  const shape = new T.Shape()
  shape.moveTo(-x + corner, -y)
  shape.lineTo(x - corner, -y)
  shape.quadraticCurveTo(x, -y, x, -y + corner)
  shape.lineTo(x, y - corner)
  shape.quadraticCurveTo(x, y, x - corner, y)
  shape.lineTo(-x + corner, y)
  shape.quadraticCurveTo(-x, y, -x, y - corner)
  shape.lineTo(-x, -y + corner)
  shape.quadraticCurveTo(-x, -y, -x + corner, -y)
  return new T.ExtrudeGeometry(shape, { depth, curveSegments: 12, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 5 }).translate(0, 0, -depth / 2)
}

function bridgeCompass() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  const screen = new T.MeshBasicMaterial({ map: texture, toneMapped: false })
  const cardinal = ['N', 'E', 'S', 'W']
  let lastHeading = -1
  const wrapHeading = (degrees: number) => (degrees + 360) % 360
  function setHeading(radians: number) {
    const degrees = wrapHeading(Math.round(T.MathUtils.radToDeg(radians)))
    if (lastHeading === degrees) return
    lastHeading = degrees
    ctx.fillStyle = '#081a21'
    ctx.fillRect(0, 0, 1024, 512)
    ctx.strokeStyle = '#29515a'
    ctx.lineWidth = 6
    ctx.strokeRect(22, 22, 980, 468)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#98bec0'
    ctx.font = '600 44px monospace'
    ctx.fillText('HEADING', 512, 102)
    ctx.fillStyle = '#e3fff8'
    ctx.font = '700 150px monospace'
    ctx.fillText(String(degrees).padStart(3, '0') + '°', 512, 267)
    ctx.save()
    ctx.beginPath()
    ctx.rect(46, 310, 932, 155)
    ctx.clip()
    for (let tick = Math.ceil((degrees - 45) / 5) * 5; tick <= degrees + 45; tick += 5) {
      const bearing = wrapHeading(tick)
      const x = 512 + (tick - degrees) * 11
      const major = bearing % 15 === 0
      ctx.fillStyle = major ? '#b7e4e4' : '#558a91'
      ctx.fillRect(x - 2, 344, 4, major ? 44 : 24)
      if (major) {
        ctx.font = '600 41px monospace'
        ctx.fillText(bearing % 90 === 0 ? cardinal[bearing / 90] : String(bearing), x, 442)
      }
    }
    ctx.restore()
    ctx.fillStyle = '#ff944d'
    ctx.beginPath()
    ctx.moveTo(491, 318)
    ctx.lineTo(533, 318)
    ctx.lineTo(512, 346)
    ctx.closePath()
    ctx.fill()
    texture.needsUpdate = true
  }
  setHeading(0)
  return { screen, setHeading }
}

export function cockpit() {
  const root = new T.Group()
  const shell = metal('#f5eee2', 0.5, 0.07)
  const safetyOrange = metal('#f66c27', 0.39, 0.08)
  const rubber = metal('#182327', 0.85, 0)
  const satin = metal('#aabbbf', 0.4, 0.34)

  // Camera-space console stays within reach as the vessel heels.
  mesh(root, roundedPanel(4.05, 0.51, 0.61, 0.21, 0.065), shell, 0, -1.22, -2.05)
  mesh(root, roundedPanel(3.87, 0.108, 0.53, 0.052, 0.033), safetyOrange, 0, -0.965, -2.064)
  mesh(root, roundedPanel(3.56, 0.265, 0.055, 0.10, 0.024), rubber, 0, -1.16, -1.698)
  for (const side of [-1, 1]) {
    tube(root, rubber, [side * 1.50, -0.98, -2.02], [side * 1.81, 1.08, -2.24], 0.068)
    tube(root, shell, [side * 1.49, -0.98, -1.98], [side * 1.80, 1.08, -2.20], 0.046)
  }

  const compass = bridgeCompass()
  const display = new T.Group()
  display.position.set(-0.94, -0.73, -1.86)
  display.rotation.x = -0.12
  root.add(display)
  mesh(display, roundedPanel(0.85, 0.445, 0.12, 0.062, 0.027), shell, 0, 0, 0)
  mesh(display, roundedPanel(0.75, 0.393, 0.032, 0.036, 0.012), rubber, 0, 0, 0.09)
  mesh(display, new T.PlaneGeometry(0.70, 0.35), compass.screen, 0, 0, 0.121)

  const column = new T.Group()
  column.position.set(0.80, -0.63, -1.66)
  column.rotation.x = -0.20
  root.add(column)
  tube(root, rubber, [0.80, -1.09, -1.93], [0.80, -0.69, -1.93], 0.09)
  tube(column, rubber, [0, 0, -0.35], [0, 0, -0.025], 0.105)
  const wheel = new T.Group()
  column.add(wheel)
  mesh(wheel, new T.TorusGeometry(0.276, 0.036, 24, 96), rubber, 0, 0, 0)
  mesh(wheel, new T.TorusGeometry(0.249, 0.009, 12, 96), satin, 0, 0, 0.017)
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 / 3 + 0.5) * Math.PI
    tube(wheel, satin, [0, 0, 0], [Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, 0], 0.024)
  }
  oval(wheel, safetyOrange, 0, 0, 0.008, 0.112, 0.112, 0.061)
  oval(wheel, shell, 0, 0, 0.057, 0.064, 0.064, 0.018)

  mesh(root, roundedPanel(0.245, 0.126, 0.34, 0.055, 0.023), rubber, 1.23, -0.95, -1.72)
  const throttle = new T.Group()
  throttle.position.set(1.23, -0.89, -1.72)
  root.add(throttle)
  tube(throttle, satin, [0, 0, 0], [0, 0.255, 0], 0.028)
  oval(throttle, safetyOrange, 0, 0.266, 0, 0.103, 0.052, 0.046)

  mergeStaticMeshes(root)
  return { root, wheel, throttle, setHeading: compass.setHeading }
}
