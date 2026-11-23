import * as T from 'three'
import { Octree } from 'three/addons/math/Octree.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { clamp, damp, lerp, seededRandom } from '../core/math'
import { boatSharkLength, harbor, reefScales, regularSharkLength, rockProfiles, type FloatingHazard, type ReefHazard, type RockVariant } from '../sim/boat'

// Visual sizes in scene units. Survivor height, the wooden board, and the rescue deck are fixed references.
export const MODEL_SCALES = {
  survivor: { label: 'Survivor', targetHeight: 1.85 * 1.45 },
  regularShark: { label: 'Regular shark', targetLength: regularSharkLength * 1.2 },
  megalodon: { label: 'Megalodon', targetLength: boatSharkLength * 1.42 },
  rescueVessel: { label: 'Rescue vessel', scale: 1, deckAnchor: [-1.95, 1.548, 0] },
  helicopter: { label: 'Helicopter', targetLength: 14.2 },
  cruiseShip: { label: 'Cruise ship', targetLength: 145 },
  lighthouse: { label: 'Lighthouse', targetHeight: 9.2 },
  ...reefScales,
} as const

export type ScaledModel = keyof typeof MODEL_SCALES

/** Fit a detached model in its neutral pose. Length is its longer horizontal span. */
export function fitModelScale(name: ScaledModel, model: T.Object3D, lengthMultiplier = 1) {
  const { x, y, z } = new T.Box3().setFromObject(model, true).getSize(new T.Vector3())
  const length = Math.max(x, z)
  const rule = MODEL_SCALES[name]
  if (!Number.isFinite(length) || length <= 0) throw new Error(`Unable to measure ${rule.label}.`)
  const scale = 'targetHeight' in rule ? rule.targetHeight / y
    : 'targetLength' in rule ? rule.targetLength * lengthMultiplier / length : rule.scale
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

  pose(velocity: number, acceleration: number, dt: number, reduced: boolean) {
    if (Math.abs(velocity) > 0.8) this.facingRight = velocity > 0
    // The model faces -X. Hovers retain the last heading, and turns pass through +Z.
    const heading = this.facingRight ? Math.PI : 0
    const yaw = this.posed ? damp(this.root.rotation.y, heading, 6.8, dt) : heading
    const banking = reduced ? 0 : clamp((heading - yaw) * 0.085 + acceleration * 0.0045 + velocity * 0.0025, -0.23, 0.23)
    const flare = velocity * acceleration < 0 ? 0.017 : 0.012
    const forwardTilt = clamp(-velocity * 0.009 - acceleration * flare, -0.30, 0.30) * (reduced ? 0.48 : 1)
    const roll = this.posed ? damp(this.root.rotation.x, banking, 6.5, dt) : banking
    const pitch = this.posed ? damp(this.root.rotation.z, forwardTilt, 7.5, dt) : forwardTilt
    // Z tilts the nose in the world travel plane as the aircraft swings through a turn.
    this.root.rotation.set(roll, yaw, pitch, 'ZYX')
    this.posed = true
  }
}

export function claw() {
  const root = new T.Group()
  oval(root, steel, 0, 0.16, 0, 0.38, 0.31, 0.38)
  const cableAnchor = new T.Object3D()
  cableAnchor.position.y = 0.45
  root.add(cableAnchor)
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
  return { root, jaws, cableAnchor }
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

export type SurvivorPose = 'debris' | 'floating' | 'carried' | 'falling' | 'saved' | 'walking'

interface SurvivorJoint {
  bone: T.Bone
  rest: T.Quaternion
  parentFrame: T.Quaternion
  direction: T.Vector3
}

interface SurvivorLimbs {
  side: number
  shoulder?: SurvivorJoint
  upperArm: SurvivorJoint
  forearm: SurvivorJoint
  hand: SurvivorJoint
  thigh: SurvivorJoint
  calf: SurvivorJoint
}

function survivorJoint(bone: T.Bone, end?: T.Bone): SurvivorJoint {
  const parentFrame = bone.parent!.getWorldQuaternion(new T.Quaternion())
  const direction = new T.Vector3()
  if (end) {
    direction.copy(end.getWorldPosition(new T.Vector3()))
      .sub(bone.getWorldPosition(new T.Vector3()))
      .applyQuaternion(parentFrame.clone().invert()).normalize()
  }
  return { bone, rest: bone.quaternion.clone(), parentFrame, direction }
}

export class SurvivorModel {
  readonly root = new T.Group()
  readonly height = MODEL_SCALES.survivor.targetHeight
  private limbs: SurvivorLimbs[] = []
  private hips?: SurvivorJoint
  private spine?: SurvivorJoint
  private chest?: SurvivorJoint
  private neck?: SurvivorJoint
  private head?: SurvivorJoint
  private readonly frame = new T.Quaternion()
  private readonly parentFrame = new T.Quaternion()
  private readonly rotation = new T.Quaternion()
  private readonly direction = new T.Vector3()
  private readonly tilt = new T.Euler()

  constructor(private readonly index = 0) {}

  setAsset(scene: T.Object3D) {
    const model = cloneSkeleton(scene)
    model.updateMatrixWorld(true)
    const originalBounds = new T.Box3().setFromObject(model, true)
    if (!(originalBounds.max.y > originalBounds.min.y)) throw new Error('Unable to measure survivor height.')
    const size = fitModelScale('survivor', model)
    const bounds = new T.Box3().setFromObject(model, true)
    const center = bounds.getCenter(new T.Vector3())
    model.position.sub(center.setY(bounds.min.y))
    model.updateMatrixWorld(true)

    const bones = new Map<string, T.Bone>()
    model.traverse(node => {
      if (!(node instanceof T.Bone)) return
      // Character Creator, Unreal, Auto-Rig Pro and Renderpeople use different bone names.
      const name = node.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        .replace(/^(ccbase|rpmanuelanimated001dancing)/, '')
      bones.set(name, node)
    })
    const findBone = (...aliases: string[]) => aliases.map(name => bones.get(name)).find(Boolean)
    const limbs = ['l', 'r'].map(side => {
      const findSide = (...names: string[]) => findBone(...names.flatMap(name => [`${side}${name}`, `${name}${side}`]))
      const shoulder = findSide('clavicle', 'shoulder')
      const upperArm = findSide('upperarm', 'carmtwistoffset', 'armstretch')
      const forearm = findSide('forearm', 'lowerarm', 'forearmstretch')
      const hand = findSide('hand')
      const thigh = findSide('thigh', 'upperleg', 'thightwist', 'thighstretch')
      const calf = findSide('calf', 'lowerleg', 'legstretch')
      const foot = findSide('foot')
      if (!upperArm || !forearm || !hand || !thigh || !calf || !foot) {
        throw new Error(`Missing ${side === 'l' ? 'left' : 'right'} limb joints in survivor rig.`)
      }
      const outward = Math.sign(upperArm.getWorldPosition(new T.Vector3()).x - model.position.x)
      return {
        side: outward || (side === 'l' ? 1 : -1),
        shoulder: shoulder && survivorJoint(shoulder),
        upperArm: survivorJoint(upperArm, forearm), forearm: survivorJoint(forearm, hand),
        hand: survivorJoint(hand),
        thigh: survivorJoint(thigh, calf), calf: survivorJoint(calf, foot),
      }
    })
    const hips = findBone('pelvis', 'hip', 'rootx', 'root')
    const spine = findBone('waist', 'spine01x', 'spine01')
    const chest = findBone('spine03x', 'spine03', 'spine02x', 'spine02', 'spine01x', 'spine01')
    const neck = findBone('neck01', 'necktwist01', 'neckx', 'neck')
    const head = findBone('headx', 'head') ?? neck
    this.hips = hips && survivorJoint(hips)
    this.spine = spine && spine !== chest ? survivorJoint(spine) : undefined
    this.chest = chest && survivorJoint(chest)
    this.neck = neck && neck !== head ? survivorJoint(neck) : undefined
    this.head = head && survivorJoint(head)
    this.limbs = limbs
    if (chest) {
      const shoulders = limbs.map(limb => limb.upperArm.bone.getWorldPosition(new T.Vector3()))
      const center = shoulders[0].clone().lerp(shoulders[1], 0.5)
      const width = shoulders[0].distanceTo(shoulders[1])
      const jacket = new T.Group()
      jacket.name = 'Safety-orange flotation vest'
      jacket.position.copy(center)
      jacket.position.y -= this.height * 0.104
      const orangeFoam = metal('#ff690b', 0.89, 0.015)
      const straps = metal('#322c28', 0.94, 0)
      const reflective = metal('#e8f1f0', 0.48, 0.16)
      const height = this.height * 0.205
      const point = new T.Vector3()
      let front = width * 0.19, back = -front
      // Size the shell from each model's actual clothed torso in its bind pose.
      model.traverse(node => {
        if (!(node instanceof T.SkinnedMesh)) return
        const count = node.geometry.getAttribute('position').count
        for (let i = 0; i < count; i++) {
          node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).sub(jacket.position)
          if (Math.abs(point.x) > width * 0.45 || Math.abs(point.y) > height * 0.48) continue
          front = Math.max(front, point.z)
          back = Math.min(back, point.z)
        }
      })
      const padDepth = width * 0.18
      const frontPad = front + padDepth * 0.31, backPad = back - padDepth * 0.31
      const reflectiveOffset = padDepth * 0.5 + 0.032
      for (const side of [-1, 1]) {
        const x = side * width * 0.25
        mesh(jacket, roundedPanel(width * 0.48, height, padDepth, width * 0.09, 0.025), orangeFoam, x, 0, frontPad)
        mesh(jacket, roundedPanel(width * 0.49, height, padDepth, width * 0.08, 0.023), orangeFoam, x, 0, backPad)
        box(jacket, orangeFoam, x, height * 0.48, (frontPad + backPad) / 2, width * 0.18, width * 0.085, frontPad - backPad)
        box(jacket, straps, side * width * .465, -height * 0.23, (frontPad + backPad) / 2,
          width * .060, height * 0.088, frontPad - backPad)
        for (const z of [frontPad + reflectiveOffset, backPad - reflectiveOffset])
          box(jacket, reflective, x, height * 0.30, z, width * 0.31, height * 0.095, 0.012)
        box(jacket, straps, x, -height * 0.23, frontPad + reflectiveOffset, width * 0.46, height * 0.075, 0.012)
      }
      mergeStaticMeshes(jacket)
      jacket.updateMatrixWorld(true)
      chest.attach(jacket)
    }
    this.root.clear().add(model)
    return size
  }

  private turn(joint: SurvivorJoint | undefined, pitch: number, yaw: number, roll: number) {
    if (!joint) return
    this.rotation.setFromEuler(this.tilt.set(pitch, yaw, roll))
    joint.bone.quaternion.copy(joint.parentFrame).invert().multiply(this.rotation)
      .multiply(joint.parentFrame).multiply(joint.rest)
  }

  private aim(joint: SurvivorJoint, x: number, y: number, z: number) {
    joint.bone.parent!.getWorldQuaternion(this.parentFrame).invert()
    this.direction.set(x, y, z).normalize().applyQuaternion(this.frame).applyQuaternion(this.parentFrame)
    joint.bone.quaternion.copy(this.rotation.setFromUnitVectors(joint.direction, this.direction)).multiply(joint.rest)
  }

  pose(state: SurvivorPose, time: number, swing = 0) {
    if (!this.limbs.length) return
    const phase = this.index * 0.73
    const breath = Math.sin(time * 4.4 + phase)
    const scan = Math.sin(time * 2.3 + phase)
    const chestPitch = state === 'floating' ? -0.08 : state === 'saved' ? 0.035 : 0.08
    const chestRoll = state === 'carried' ? swing * 0.45 : Math.sin(time * 3.2 + phase) * 0.07
    const hipsActive = state === 'floating' || state === 'carried' || state === 'falling'
    const glance = state === 'debris' ? 0.36 * breath + 0.045 : 0.05
    this.root.getWorldQuaternion(this.frame)
    this.turn(this.hips, 0, hipsActive ? scan * 0.09 : 0, hipsActive ? chestRoll * 0.25 : 0)
    this.turn(this.spine, chestPitch * 0.35, 0, chestRoll * 0.3)
    this.turn(this.chest, chestPitch * 0.65 + breath * 0.025, 0, chestRoll * 0.7)
    this.turn(this.neck, glance * 0.28, scan * 0.07, -chestRoll * 0.15)
    this.turn(this.head, glance * (this.neck ? 0.72 : 1), scan * 0.15, -chestRoll * 0.3)
    for (const { side, shoulder, upperArm, forearm, hand, thigh, calf } of this.limbs) {
      thigh.bone.quaternion.copy(thigh.rest)
      calf.bone.quaternion.copy(calf.rest)
      const cycle = time * 5.8 + phase + (side < 0 ? Math.PI : 0)
      const stroke = Math.sin(cycle)
      const recovery = Math.cos(cycle)
      const shoulderLift = state === 'debris' ? 0.17 + stroke * 0.08 : 0.035 + breath * 0.025
      this.turn(shoulder, 0, 0, side * shoulderLift)
      this.turn(hand, 0, 0, side * (state === 'saved' ? 0.05 : 0.08 + stroke * 0.16))
      switch (state) {
        case 'debris':
          // Feet stay planted while the arms signal and brace against the breaking board.
          this.aim(upperArm, side * (0.48 + 0.18 * recovery), 0.79 + stroke * 0.36, 0.31 - stroke * 0.23)
          this.aim(forearm, side * (0.18 + 0.42 * stroke), 0.83 + stroke * 0.21, 0.38 + recovery * 0.26)
          break
        case 'floating':
          this.aim(upperArm, side * (0.66 + stroke * 0.23), -0.26 + recovery * 0.31, 0.65 - stroke * 0.36)
          this.aim(forearm, side * (0.2 + stroke * 0.65), -0.11 + recovery * 0.35, 0.9 - stroke * 0.3)
          this.aim(thigh, side * 0.19, -0.84, stroke * 0.54)
          this.aim(calf, side * 0.12, -0.9, stroke * 0.48 - 0.28)
          break
        case 'carried':
          this.aim(upperArm, side * 0.22, -0.95, stroke * 0.11 - swing * 0.17)
          this.aim(forearm, side * 0.13, -0.97, stroke * 0.18 + 0.11)
          this.aim(thigh, side * 0.14, -0.97, stroke * 0.2 - swing * 0.18)
          this.aim(calf, side * 0.08, -0.95, recovery * 0.25 - 0.15)
          break
        case 'falling':
          this.aim(upperArm, side * 0.82, 0.46 + stroke * 0.24, 0.34)
          this.aim(forearm, side * 0.49, 0.7, 0.25 + recovery * 0.34)
          this.aim(thigh, side * 0.22, -0.88, stroke * 0.3)
          this.aim(calf, side * 0.12, -0.9, recovery * 0.2 - 0.22)
          break
        case 'saved':
          this.aim(upperArm, side * 0.21, -0.97, 0.08 + breath * 0.07)
          this.aim(forearm, side * -0.12, -0.94, 0.3 + breath * 0.05)
          break
        case 'walking':
          this.aim(upperArm, side * 0.18, -0.94, -stroke * 0.38)
          this.aim(forearm, side * 0.1, -0.95, 0.19 - stroke * 0.3)
          this.aim(thigh, side * 0.035, -0.95, stroke * 0.37)
          this.aim(calf, side * 0.035, -0.96, stroke * 0.37 - Math.max(0, -recovery) * 0.44)
          break
      }
    }
  }
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

export function prepareIsland(model: T.Object3D) {
  const size = fitModelScale('island', model)
  const bounds = new T.Box3().setFromObject(model, true)
  const center = bounds.getCenter(new T.Vector3())
  model.position.add(new T.Vector3(harbor.island.x - center.x, harbor.island.baseY - bounds.min.y, -harbor.island.z - center.z))
  return size
}

export function prepareLighthouse(model: T.Object3D) {
  model.getObjectByName('pasted__pCylinder14_aiStandardSurface10_0')?.removeFromParent()
  const size = fitModelScale('lighthouse', model)
  const bounds = new T.Box3().setFromObject(model, true)
  const center = bounds.getCenter(new T.Vector3())
  const lens = model.getObjectByName('pasted__pCylinder14_aiStandardSurface2_0')
  if (!lens) throw new Error('Lighthouse lantern assembly is missing.')
  const lightOrigin = new T.Box3().setFromObject(lens, true).getCenter(new T.Vector3())
  const base = new T.Vector3(center.x, bounds.min.y, center.z)
  model.position.sub(base)
  return { size, baseRadius: size.length / 2, lightOrigin: lightOrigin.sub(base) }
}

export function islandSurface(model: T.Object3D) {
  const bounds = new T.Box3().setFromObject(model, true)
  const octree = new Octree().fromGraphNode(model)
  const ray = new T.Ray(new T.Vector3(), new T.Vector3(0, -1, 0))
  const normal = new T.Vector3()
  const at = (x: number, z: number) => {
    ray.origin.set(x, bounds.max.y + 2, z)
    const hit = octree.rayIntersect(ray)
    return hit ? { y: hit.position.y, up: hit.triangle.getNormal(normal).y } : null
  }
  const terrain = model.getObjectsByProperty('isMesh', true).find((object): object is T.Mesh<T.BufferGeometry, T.MeshStandardMaterial> =>
    object instanceof T.Mesh && object.material instanceof T.MeshStandardMaterial && !!object.material.map)
  const map = terrain?.material.map
  const shade = document.createElement('canvas')
  shade.width = shade.height = 256
  const context = shade.getContext('2d')
  let pixels: Uint8ClampedArray | null = null
  if (context && map?.image) {
    context.drawImage(map.image as CanvasImageSource, 0, 0, shade.width, shade.height)
    pixels = context.getImageData(0, 0, shade.width, shade.height).data
  }
  const textureRay = new T.Raycaster(new T.Vector3(), ray.direction)
  function grassy(x: number, z: number) {
    if (!terrain || !map || !pixels) return true
    textureRay.ray.origin.set(x, bounds.max.y + 2, z)
    const uv = textureRay.intersectObject(terrain, false)[0]?.uv
    if (!uv) return false
    map.transformUv(uv)
    const u = clamp(Math.floor(uv.x * shade.width), 0, shade.width - 1)
    const v = clamp(Math.floor(uv.y * shade.height), 0, shade.height - 1)
    const i = (v * shade.width + u) * 4
    const [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]]
    return green > red * 0.82 && blue < green * 0.82
  }
  return { at, bounds, grassy, dispose: () => octree.clear() }
}

type IslandSurface = ReturnType<typeof islandSurface>

export function lighthouseSite(surface: IslandSurface, radius: number) {
  const { bounds, at } = surface
  const rim = [0.5, 1].flatMap(ring => {
    const samples = ring === 1 ? 64 : 16
    return Array.from({ length: samples }, (_, i) => {
      const angle = i * 2 * Math.PI / samples
      return [Math.cos(angle) * radius * ring, Math.sin(angle) * radius * ring] as const
    })
  })
  const best: { height: number; site: { position: T.Vector3; padDepth: number } | null } =
    { height: bounds.max.y * 0.48, site: null }
  function visit(x: number, z: number) {
    const center = at(x, z)
    if (!center || center.up < 0.89 || center.y <= best.height) return
    let min = center.y, max = center.y
    for (const [dx, dz] of rim) {
      const edge = at(x + dx, z + dz)
      if (!edge || edge.up < 0.77 || edge.y < 2) return
      min = Math.min(min, edge.y)
      max = Math.max(max, edge.y)
      if (max - min > 0.96) return
    }
    best.height = center.y
    best.site = { position: new T.Vector3(x, max + 0.025, z), padDepth: max - min + 0.25 }
  }
  for (let x = bounds.min.x + radius; x < bounds.max.x - radius; x += 0.66)
    for (let z = bounds.min.z + radius; z < bounds.max.z - radius; z += 0.66) visit(x, z)
  if (best.site) {
    const { x, z } = best.site.position
    for (let dx = -0.65; dx <= 0.65; dx += 0.13)
      for (let dz = -0.65; dz <= 0.65; dz += 0.13) visit(x + dx, z + dz)
  }
  return best.site
}

export function lighthouseFoundation(parent: T.Object3D, radius: number, depth: number) {
  const pad = mesh(parent, new T.CylinderGeometry(radius, radius, depth, 24), metal('#888574', 0.94, 0),
    0, 0.06 - depth / 2, 0)
  pad.name = 'Lighthouse Stone Footing'
}

function fronds(palm: boolean) {
  const positions: number[] = []
  const indices: number[] = []
  const random = seededRandom(palm ? 831 : 635)
  const count = palm ? 8 : 9
  for (let i = 0; i < count; i++) {
    const angle = i * 2 * Math.PI / count + random() * 0.32
    const x = Math.cos(angle), z = Math.sin(angle)
    const reach = palm ? lerp(1.54, 2.78, random()) : lerp(0.34, 0.94, random())
    const rise = palm ? lerp(0.28, 0.89, random()) : lerp(0.48, 1.18, random())
    const width = palm ? lerp(0.21, 0.36, random()) : lerp(0.09, 0.19, random())
    const start = positions.length / 3
    for (let j = 0; j <= 4; j++) {
      const t = j / 4
      const bend = Math.sin(Math.PI * t)
      const y = palm ? rise * bend - 0.75 * t * t : rise * (1.35 * t - 0.43 * t * t)
      for (const side of [-1, 0, 1]) {
        const w = width * bend * side
        positions.push(x * reach * t - z * w, y + (side === 0 ? width * bend * 0.25 : 0), z * reach * t + x * w)
      }
      if (j < 4) {
        const a = start + 3 * j
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
      }
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function islandPlantings(surface: IslandSurface, keepClear: T.Vector3 | null) {
  const root = new T.Group()
  root.name = 'Island Palms and Coastal Foliage'
  const random = seededRandom(192)
  const { bounds, at, grassy } = surface
  type Plant = { x: number; y: number; z: number; scale: number; yaw: number; phase: number }
  const palms: Plant[] = [], shrubs: Plant[] = []
  for (const [grove, maximum, spacing, palm] of [[palms, 33, 4.2, true], [shrubs, 58, 2.1, false]] as const) {
    for (let i = 0; i < 1000 && grove.length < maximum; i++) {
      const x = lerp(bounds.min.x, bounds.max.x, random())
      const z = lerp(bounds.min.z, bounds.max.z, random())
      const hit = at(x, z)
      if (!hit || hit.y < (palm ? 1.9 : 1.22) || hit.y > bounds.max.y * (palm ? 0.82 : 0.91) || hit.up < (palm ? 0.87 : 0.82)) continue
      if (keepClear && Math.hypot(x - keepClear.x, z - keepClear.z) < 5.2) continue
      if (x > harbor.pier.minX - 2 && x < harbor.pier.maxX + 2 && Math.abs(z + harbor.pier.maxZ) < 5) continue
      if (grove.some(plant => Math.hypot(x - plant.x, z - plant.z) < spacing)) continue
      const scale = lerp(palm ? 0.64 : 0.50, palm ? 1.26 : 1.20, random())
      const foot = scale * (palm ? 0.21 : 0.28)
      const support = [at(x + foot, z), at(x - foot, z), at(x, z + foot), at(x, z - foot)]
      if (support.some(edge => !edge || Math.abs(edge.y - hit.y) > foot * 0.65)) continue
      const slopeRadius = scale * (palm ? 0.95 : 0.45)
      const slope = [at(x + slopeRadius, z), at(x - slopeRadius, z), at(x, z + slopeRadius), at(x, z - slopeRadius)]
      if (slope.some(edge => !edge || Math.abs(edge.y - hit.y) > slopeRadius * 0.54) || !grassy(x, z)) continue
      grove.push({ x, y: Math.min(hit.y, ...support.map(edge => edge!.y)) - 0.075, z, scale,
        yaw: random() * 2 * Math.PI, phase: random() * 2 * Math.PI })
    }
  }
  const tip = new T.Vector3(0.55, 4.8, 0.20)
  const axis = new T.CatmullRomCurve3([new T.Vector3(0, -0.1, 0), new T.Vector3(0.10, 1.8, -0.06),
    new T.Vector3(0.26, 3.4, 0.03), tip])
  const trunk = new T.TubeGeometry(axis, 7, 0.16, 6, false)
  const vertices = trunk.attributes.position
  for (let row = 0; row <= 7; row++) {
    const center = axis.getPointAt(row / 7)
    const taper = lerp(1.3, 0.6, row / 7)
    for (let j = 0; j <= 6; j++) {
      const i = row * 7 + j
      vertices.setXYZ(i, lerp(center.x, vertices.getX(i), taper), lerp(center.y, vertices.getY(i), taper),
        lerp(center.z, vertices.getZ(i), taper))
    }
  }
  trunk.computeVertexNormals()
  const stems = new T.InstancedMesh(trunk, metal('#a88b63', 0.97, 0), palms.length)
  const leaves = new T.MeshStandardMaterial({ color: '#ffffff', side: T.DoubleSide, roughness: 0.93 })
  const crowns = new T.InstancedMesh(fronds(true), leaves, palms.length)
  const scrub = new T.InstancedMesh(fronds(false), leaves, shrubs.length)
  crowns.instanceMatrix.setUsage(T.DynamicDrawUsage)
  crowns.frustumCulled = false
  root.add(stems, crowns, scrub)
  const pose = new T.Object3D(), color = new T.Color(), crown = new T.Vector3()
  const greens = ['#527233', '#658744', '#557b39', '#72904d', '#446a44']
  const bark = ['#c2b69a', '#b1a186', '#d6cab0']
  function place(batch: T.InstancedMesh, grove: readonly Plant[]) {
    grove.forEach((plant, i) => {
      pose.position.set(plant.x, plant.y, plant.z)
      pose.scale.setScalar(plant.scale)
      pose.rotation.set(0, plant.yaw, 0)
      pose.updateMatrix()
      batch.setMatrixAt(i, pose.matrix)
      const shades = batch === stems ? bark : greens
      batch.setColorAt(i, color.set(shades[i % shades.length]))
    })
    batch.computeBoundingSphere()
  }
  place(stems, palms)
  place(scrub, shrubs)
  palms.forEach((_, i) => crowns.setColorAt(i, color.set(greens[(i + 1) % greens.length])))
  function update(t: number, reduced: boolean) {
    palms.forEach((plant, i) => {
      const sway = reduced ? 0 : Math.sin(t * 1.55 + plant.phase) * 0.088
      pose.position.copy(crown.copy(tip).multiplyScalar(plant.scale))
      pose.position.applyAxisAngle(T.Object3D.DEFAULT_UP, plant.yaw)
      pose.position.add(crown.set(plant.x, plant.y, plant.z))
      pose.rotation.set(sway * 0.72, plant.yaw, sway, 'YXZ')
      pose.scale.setScalar(plant.scale)
      pose.updateMatrix()
      crowns.setMatrixAt(i, pose.matrix)
    })
    crowns.instanceMatrix.needsUpdate = true
  }
  update(0, true)
  return { root, update }
}

export function dock(parent: T.Object3D) {
  const root = new T.Group()
  root.name = 'Harbor Pier'
  parent.add(root)
  const { minX, maxX, minZ, maxZ, deckY } = harbor.pier
  const width = maxX - minX, span = maxZ - minZ
  const x = (minX + maxX) / 2
  const count = Math.ceil(span / 0.82)
  const plank = span / count
  const head = harbor.pierHead
  const headCount = Math.ceil((head.maxX - head.minX) / 0.82)
  const headPlank = (head.maxX - head.minX) / headCount
  const planks = new T.InstancedMesh(cube, metal('#ffffff', 0.92, 0.04), count + headCount)
  const pose = new T.Object3D(), color = new T.Color()
  for (let i = 0; i < count; i++) {
    pose.position.set(x, deckY - 0.16, -minZ - (i + 0.5) * plank)
    pose.scale.set(width, 0.32, plank - 0.035)
    pose.updateMatrix()
    planks.setMatrixAt(i, pose.matrix)
    planks.setColorAt(i, color.copy(wood[i % wood.length].color).multiplyScalar(1.17))
  }
  for (let i = 0; i < headCount; i++) {
    pose.position.set(head.minX + (i + 0.5) * headPlank, deckY - 0.16, -(head.minZ + head.maxZ) / 2)
    pose.scale.set(headPlank - 0.035, 0.32, head.maxZ - head.minZ)
    pose.updateMatrix()
    planks.setMatrixAt(count + i, pose.matrix)
    planks.setColorAt(count + i, color.copy(wood[i % wood.length].color).multiplyScalar(1.17))
  }
  root.add(planks)
  const yellow = light('#ffdc77')
  for (const edge of [minX + 0.27, maxX - 0.27]) {
    box(root, wood[0], edge, deckY - 0.44, -(minZ + maxZ) / 2, 0.46, 0.40, span)
    for (let z = minZ + 0.45; z < maxZ; z += 5.5) {
      const boarding = edge < x && Math.abs(z - harbor.boardingZ) < 3
      tube(root, wood[0], [edge, -2.8, -z], [edge, deckY + (boarding ? 0.1 : 0.84), -z], 0.23)
      if (!boarding) {
        box(root, dark, edge, deckY + 0.86, -z, 0.32, 0.19, 0.32)
        box(root, yellow, edge, deckY + 1.04, -z, 0.23, 0.21, 0.23)
        box(root, dark, edge, deckY + 1.18, -z, 0.32, 0.12, 0.32)
      }
    }
  }
  for (const z of [head.minZ + 0.25, head.maxZ - 0.25]) {
    box(root, wood[0], (head.minX + head.maxX) / 2, deckY - 0.44, -z, head.maxX - head.minX, 0.40, 0.46)
    for (let x = head.minX + 2; x < head.maxX; x += 5.2) {
      tube(root, wood[0], [x, -2.8, -z], [x, deckY + 0.32, -z], 0.23)
      box(root, yellow, x, deckY + 0.36, -z, 0.20, 0.15, 0.20)
    }
  }
  const gangway = box(root, wood[3], 0, 0, 0, 1, 0.13, 1.1)
  gangway.name = 'Port Berth Gangway'
  gangway.visible = false
  return { root, gangway }
}

export function mooringLights(parent: T.Object3D) {
  const { minX, minZ, maxZ } = harbor.mooring
  const yellow = light('#ffdf72')
  const base = metal('#b98623')
  return [minZ, lerp(minZ, maxZ, 0.34), lerp(minZ, maxZ, 0.67), maxZ].map(z => {
    const buoy = new T.Group()
    buoy.position.set(minX, 0, -z)
    mesh(buoy, new T.CylinderGeometry(0.43, 0.56, 0.28, 9), base, 0, 0.1, 0)
    tube(buoy, dark, [0, 0.2, 0], [0, 0.8, 0], 0.06)
    oval(buoy, yellow, 0, 0.82, 0, 0.16, 0.18, 0.16)
    parent.add(buoy)
    return buoy
  })
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

function marineDisplay() {
  const canvas = document.createElement('canvas')
  canvas.width = 864
  canvas.height = 480
  const ctx = canvas.getContext('2d')!
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  const material = new T.MeshBasicMaterial({ map: texture, toneMapped: false })
  return { ctx, texture, material }
}

export function cockpit() {
  const root = new T.Group()
  const shell = metal('#333d44', 0.83, 0.13)
  const trim = metal('#737d85', 0.51, 0.23)
  const rubber = metal('#121719', 0.86, 0)
  const chrome = metal('#cdd9df', 0.29, 0.36)
  const backlight = light('#8cdae7')
  const caution = light('#ffb75b')
  const screens = [marineDisplay(), marineDisplay(), marineDisplay()]

  for (const side of [-1, 1]) {
    const wing = mesh(root, roundedPanel(1.5, 0.45, 0.68, 0.10, 0.055), shell, side * 1.28, -1.31, -1.92)
    wing.rotation.y = side * -0.24
    tube(root, rubber, [side * 1.12, -0.87, -2.37], [side * 2.02, 1.16, -2.32], 0.087)
    tube(root, trim, [side * 1.14, -0.87, -2.32], [side * 2.04, 1.16, -2.27], 0.042)
    tube(root, rubber, [side * 1.14, -0.79, -2.55], [side * 0.84, -0.33, -2.58], 0.016)
    tube(root, rubber, [side * 0.38, -0.30, -2.59], [side * 1.22, -0.34, -2.59], 0.018)
  }
  mesh(root, roundedPanel(2.18, 0.55, 0.65, 0.11, 0.066), shell, 0, -1.34, -2.16)
  box(root, rubber, 0, -1.44, -1.77, 2.42, 0.23, 0.16)

  screens.forEach((screen, index) => {
    const offset = index - 1
    const display = new T.Group()
    display.position.set(offset * 0.99, -0.69 - Math.abs(offset) * 0.11, -2.27 + Math.abs(offset) * .06)
    display.rotation.set(-0.27, -offset * .17, 0)
    root.add(display)
    const width = offset === 0 ? 1.12 : .92
    mesh(display, roundedPanel(width, .56, .075, .048, .022), rubber, 0, 0, 0)
    mesh(display, new T.PlaneGeometry(width - .09, .48), screen.material, 0, 0, .066)
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * .102
      box(display, rubber, x, -.328, .05, .083, .077, .04).rotation.x = -.12
      box(display, (i + index) % 6 === 0 ? caution : backlight, x, -.318, .073, .047, .014, .005)
    }
  })

  const column = new T.Group()
  column.position.set(0.03, -0.78, -1.74)
  column.rotation.x = -0.20
  root.add(column)
  tube(column, rubber, [0, 0, -0.44], [0, 0, 0], 0.116)
  const wheel = new T.Group()
  column.add(wheel)
  mesh(wheel, new T.TorusGeometry(.285, .043, 18, 84), rubber, 0, 0, 0)
  mesh(wheel, new T.TorusGeometry(.248, .013, 12, 84), chrome, 0, 0, .02)
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 / 3 + .1667) * Math.PI
    box(wheel, chrome, Math.cos(angle) * .169, Math.sin(angle) * .169, .01, .195, .044, .046).rotation.z = angle
  }
  oval(wheel, chrome, 0, 0, .017, .108, .108, .049)
  oval(wheel, rubber, 0, 0, .064, .072, .072, .015)

  mesh(root, roundedPanel(.37, .122, .43, .053, .024), chrome, .91, -1.03, -1.77)
  const throttle = new T.Group()
  throttle.position.set(.91, -.965, -1.77)
  root.add(throttle)
  for (const side of [-1, 1]) {
    const x = side * .088
    tube(throttle, chrome, [x, 0, 0], [x, .222, -.026], .019)
    oval(throttle, rubber, x, .237, -.026, .064, .047, .040)
  }
  oval(root, rubber, 1.28, -1.01, -1.83, .11, .063, .108)
  tube(root, chrome, [1.28, -1.01, -1.83], [1.31, -.846, -1.85], .022)
  oval(root, rubber, 1.31, -.834, -1.85, .068, .051, .059)

  // Replace the driver-side furnishings in camera space without altering the hull GLB.
  mesh(root, roundedPanel(.79, .18, .68, .084, .058), rubber, .05, -1.39, .66)
  mesh(root, roundedPanel(.77, .70, .16, .10, .063), rubber, .05, -1.01, .96).rotation.x = -.14
  for (const side of [-1, 1]) {
    oval(root, rubber, .05 + side * .33, -1.33, .64, .09, .15, .36)
    oval(root, rubber, .05 + side * .33, -.99, .9, .087, .34, .12)
  }
  mergeStaticMeshes(root)

  let displayFrame = -1
  function update(heading: number, time: number, speed: number, throttlePower: number, courseX: number, courseZ: number) {
    const frame = Math.floor(time * 8)
    if (frame === displayFrame) return
    displayFrame = frame
    const bearing = ((Math.round(T.MathUtils.radToDeg(heading)) % 360) + 360) % 360
    for (const [index, screen] of screens.entries()) {
      const ctx = screen.ctx
      ctx.fillStyle = '#0b1824'
      ctx.fillRect(0, 0, 864, 480)
      ctx.fillStyle = '#173445'
      ctx.fillRect(0, 0, 864, 68)
      ctx.fillStyle = '#d0f3fa'
      ctx.font = 'bold 33px monospace'
      ctx.fillText(['PROPULSION', 'SURFACE RADAR', 'COASTAL CHART'][index], 29, 46)
      if (index === 0) {
        for (let i = 0; i < 2; i++) {
          const x = 230 + i * 404
          const amount = clamp(i ? throttlePower : speed / 16)
          ctx.lineWidth = 15
          for (let j = 0; j < 11; j++) {
            const angle = Math.PI * (.76 + j * .148)
            ctx.strokeStyle = j / 10 <= amount ? '#49d8a5' : '#335667'
            ctx.beginPath()
            ctx.arc(x, 251, 135, angle, angle + .098)
            ctx.stroke()
          }
          ctx.font = 'bold 63px monospace'
          ctx.fillStyle = '#f0fbfa'
          ctx.textAlign = 'center'
          ctx.fillText(i ? String(Math.round(amount * 100)) + '%' : speed.toFixed(1), x, 273)
          ctx.font = '25px monospace'
          ctx.fillStyle = '#9ac8d6'
          ctx.fillText(i ? 'THROTTLE' : 'SPEED', x, 333)
          ctx.textAlign = 'left'
        }
      } else if (index === 1) {
        ctx.strokeStyle = '#3b806f'
        ctx.lineWidth = 3
        for (const radius of [43, 86, 129, 172]) {
          ctx.beginPath()
          ctx.arc(285, 270, radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.beginPath()
        ctx.moveTo(285, 98); ctx.lineTo(285, 442); ctx.moveTo(113, 270); ctx.lineTo(457, 270)
        ctx.stroke()
        const sweep = time * 1.86
        ctx.fillStyle = '#16efa947'
        ctx.beginPath()
        ctx.moveTo(285, 270)
        ctx.arc(285, 270, 171, sweep - .48, sweep)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#a2fdd8'
        ctx.beginPath()
        ctx.moveTo(285, 270)
        ctx.lineTo(285 + Math.cos(sweep) * 172, 270 + Math.sin(sweep) * 172)
        ctx.stroke()
        ctx.fillStyle = '#a9cee0'
        ctx.font = 'bold 31px monospace'
        ctx.fillText('HDG ' + String(bearing).padStart(3, '0') + '°', 633, 46)
        ctx.font = '25px monospace'
        ctx.fillText('SHORT RANGE', 515, 164)
      } else {
        ctx.fillStyle = '#244d66'
        ctx.fillRect(18, 89, 828, 365)
        ctx.strokeStyle = '#638b9b'
        ctx.lineWidth = 1.5
        for (let i = 1; i < 8; i++) {
          const x = 18 + i * 103.5
          ctx.beginPath(); ctx.moveTo(x, 89); ctx.lineTo(x, 454); ctx.stroke()
        }
        ctx.fillStyle = '#9ab585'
        ctx.beginPath()
        ctx.moveTo(350, 89); ctx.lineTo(397, 133); ctx.lineTo(455, 145); ctx.lineTo(488, 184)
        ctx.lineTo(532, 172); ctx.lineTo(588, 196); ctx.lineTo(644, 156); ctx.lineTo(816, 148)
        ctx.lineTo(845, 209); ctx.lineTo(845, 89); ctx.closePath(); ctx.fill()
        const y = lerp(429, 209, clamp(courseZ / 900))
        const x = 487 + clamp(courseX / 45, -1, 1) * 140
        ctx.setLineDash([11, 8])
        ctx.strokeStyle = '#ffc860'
        ctx.lineWidth = 3.5
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(560, 196); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#fdfbde'
        ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x - 9, y + 10); ctx.lineTo(x + 9, y + 10); ctx.closePath(); ctx.fill()
        ctx.font = 'bold 23px monospace'
        ctx.fillText('HARBOR', 602, 232)
      }
      screen.texture.needsUpdate = true
    }
  }
  update(0, 0, 0, 0, 0, 0)
  return { root, wheel, throttle, update }
}

export function rescueDeckTrim() {
  const trim = new T.Group()
  const decking = metal('#344048', .9, .05)
  const seams = metal('#637078', .96, .03)
  const frame = metal('#87969a', .47, .44)
  const cushion = metal('#303b42', .89, 0)
  // Keep fixtures beside the usable aft-deck slots and leave the rescue opening clear.
  for (const side of [-1, 1]) {
    box(trim, decking, -.63, 1.465, side * 1.67, 4.8, .022, .33)
    for (let i = 0; i < 3; i++)
      box(trim, seams, -.63, 1.480, side * (1.53 + .124 * i), 4.74, .005, .014)
  }
  for (const z of [-.69, .69])
    tube(trim, frame, [-3.55, 1.49, z], [-3.55, 1.98, z], .04)
  mesh(trim, roundedPanel(1.75, .11, .47, .049, .018), cushion, -3.55, 1.96, 0).rotation.y = Math.PI / 2
  mesh(trim, roundedPanel(1.75, .33, .11, .053, .020), cushion, -3.78, 2.13, 0).rotation.y = Math.PI / 2
  mergeStaticMeshes(trim)
  return trim
}
