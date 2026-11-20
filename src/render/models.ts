import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { seededRandom } from '../core/math'

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
const rockGeo = new T.DodecahedronGeometry(1, 0)
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
  const hullShape: [number, number][] = [[-5.1, -1.05], [-6.2, 0.5], [-5.9, 1.18], [6.6, 1.18], [6.2, -0.82], [5, -1.05]]
  mesh(root, extrude(hullShape, 3.5), orange, 4.1, 0, -1.75)
  box(root, dark, 4.2, 0.11, 0, 11.9, 0.27, 3.65)
  box(root, steel, 4.45, 1.34, 0, 11.65, 0.26, 3.66)
  box(root, dark, 0, 1.53, 0, 7.3, 0.11, 4.28)
  for (const side of [-1, 1]) {
    box(root, green, 0, 1.61, side * 2.04, 7.05, 0.07, 0.074)
    box(root, green, side * 3.51, 1.61, 0, 0.074, 0.07, 4.13)
    for (let x = 4.1; x < 10; x += 1.5) tube(root, steel, [x, 1.38, side * 1.67], [x, 2.5, side * 1.67], 0.036)
    tube(root, steel, [4, 2.5, side * 1.67], [9.3, 2.5, side * 1.67], 0.034)
    const lifeRing = mesh(root, new T.TorusGeometry(0.33, 0.11, 6, 16), orange, 4.58, 2.36, side * 1.6)
    lifeRing.rotation.y = side * 0.07
    oval(root, side < 0 ? green : red, 7.5, 4.3, side * 1.41, 0.13, 0.12, 0.14)
  }
  box(root, light('#c3dfc7'), 0, 1.602, 0, 0.3, 0.016, 1.3)
  for (const z of [-0.65, 0.65]) box(root, light('#c3dfc7'), 0, 1.602, z, 1.2, 0.016, 0.25)
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

export function shark() {
  const root = new T.Group()
  const sharkSkin = metal('#273d44', 0.4)
  const belly = metal('#829c9c', 0.6)
  oval(root, sharkSkin, 0, 0, 0, 2.23, 0.47, 0.53)
  oval(root, belly, -0.32, -0.22, 0, 1.49, 0.265, 0.46)
  oval(root, sharkSkin, -1.74, 0, 0, 0.78, 0.29, 0.41)
  mesh(root, extrude([[-0.61, 0], [0.57, 0], [0.65, 1.09], [0.27, 0.95]], 0.057), sharkSkin, 0, 0.29, -0.03)
  const tail = new T.Group()
  tail.position.x = 1.8
  root.add(tail)
  mesh(tail, extrude([[0, 0], [0.72, 0.99], [0.66, 0.07], [0.57, -0.70]], 0.04), sharkSkin, 0, 0, -0.02)
  for (const side of [-1, 1]) {
    oval(root, seal, -1.65, 0.102, side * 0.38, 0.078, 0.057, 0.04)
    const fin = mesh(root, extrude([[0, 0], [1.15, 0], [1.45, 1.02]], 0.055), sharkSkin, -0.4, -0.19, 0)
    fin.rotation.x = side * Math.PI / 2
  }
  mergeStaticMeshes(root)
  return { root, tail }
}

export function wreck() {
  const root = new T.Group()
  const hull = metal('#263c43')
  const faded = metal('#607c82')
  const black = metal('#142026')
  for (const [offset, angle, size] of [[-22, -0.22, 37], [15, 0.29, 27]]) {
    const part = new T.Group()
    part.rotation.z = angle
    part.position.set(offset, 0, 0)
    root.add(part)
    const w = size / 2
    mesh(part, extrude([[-w, 5.2], [-w + 4.8, -2.0], [w, -2], [w - 1.2, 5.1]], 7.5), hull, 0, 0, -3.75)
    box(part, faded, 0.35, 5.2, 0, size - 4, 0.64, 7.25)
    for (let level = 0; level < 3; level++) {
      const width = size - 9 - level * 4
      box(part, faded, 1, 6.3 + level * 1.56, 0, width, 1.56, 6.2 - level * 1.27)
      for (let x = 2 - width * 0.5; x < width * 0.5; x += 1.85) {
        box(part, (Math.floor(x + 20 + level) % 7 === 0) ? lamp : black, x, 6.4 + level * 1.56, 3.14 - level * 0.636, 0.97, 0.59, 0.08)
      }
    }
    tube(part, dark, [2, 9.7, 0], [2, 15.2, 0], 0.22)
    tube(part, dark, [0, 13.2, 0], [4.6, 13.2, 0], 0.14)
    if (angle > 0) box(part, hull, 4.7, 11.6, 0, 4.0, 4.7, 3.1).rotation.z = 0.14
    // Exposed framing at the fault line and a rust-painted load line.
    const brokenEdge = (angle < 0 ? w : -w + 4.3)
    const rust = metal('#6e5143', 0.91)
    box(part, rust, 0, 2.3, 3.78, size - 1.2, 0.32, 0.11)
    for (let j = 0; j < 6; j++) {
      const spar = box(part, hull, brokenEdge + (j % 2) * 1.1, 2.5 + j * 0.69, (j - 3) * 0.92, 3.4, 0.16, 0.21)
      spar.rotation.z = 0.34 * Math.sin(j * 3)
    }
    mergeStaticMeshes(part)
  }
  return root
}

export function lighthouse(parent: T.Object3D, x: number, z: number, size = 1) {
  const root = new T.Group()
  root.position.set(x, 0, z)
  root.scale.setScalar(size)
  parent.add(root)
  const rng = seededRandom(81)
  for (let i = 0; i < 21; i++) {
    const p = mesh(root, rockGeo, metal(i % 2 ? '#34484a' : '#354943'), (rng() - 0.5) * 78, -1 + rng() * 4, (rng() - 0.3) * 37)
    p.scale.set(7 + rng() * 14, 3 + rng() * 8, 7 + rng() * 12)
    p.rotation.set(rng(), rng() * 6, rng())
  }
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

export function hazard(type: 'debris' | 'reef' | 'barrel', radius: number) {
  const root = new T.Group()
  if (type === 'debris') {
    for (let index = 0; index < 4; index++) {
      const piece = box(root, wood[index], (index - 1.5) * 0.44, 0.1, 0, 0.37, 0.22, radius * 1.6)
      piece.rotation.y = 0.15 * index
    }
  } else if (type === 'barrel') {
    tube(root, orange, [0, -0.55, 0], [0, 0.67, 0], radius * 0.55)
    for (const y of [-0.34, 0.49]) tube(root, dark, [0, y, 0], [0, y + 0.12, 0], radius * 0.57)
  } else {
    const r = mesh(root, rockGeo, metal('#334a4a', 0.91), 0, 0.72, 0)
    r.scale.set(radius * 0.84, radius * 0.49, radius * 0.76)
    r.rotation.set(0.3, 0.9, -0.27)
    mesh(root, rockGeo, metal('#496263'), radius * 0.42, 0.13, radius * 0.38)
      .scale.set(radius * 0.35, radius * 0.21, radius * 0.52)
  }
  return root
}

export function cockpit() {
  const root = new T.Group()
  const wheel = new T.Group()
  root.add(wheel)
  const black = metal('#122025', 0.71)
  const dash = metal('#4e5550', 0.49, 0.65)
  // The scene is attached to the first-person camera in camera space.
  box(root, black, 0, -1.12, -1.95, 9, 0.48, 0.56)
  box(root, dash, 0, -0.90, -2.01, 8.8, 0.12, 0.61)
  box(root, metal('#997a55', 0.52, 0.54), 0, -0.868, -1.67, 8.8, 0.029, 0.032)
  box(root, black, 0, -0.856, -2.18, 8.75, 0.06, 0.075)
  const bodyPaint = metal('#564233', 0.63)
  box(root, bodyPaint, 0, -0.89, -3.85, 2.42, 0.12, 3.8)
  for (const side of [-1, 1]) {
    tube(root, steel, [side * 1.05, -0.60, -2.65], [side * 0.58, -0.66, -5], 0.022)
    tube(root, steel, [side * 0.58, -0.67, -5], [side * 0.48, -0.87, -5.19], 0.022)
    tube(root, steel, [side * 1.05, -0.60, -2.65], [side * 1.06, -0.90, -2.63], 0.023)
    oval(root, side > 0 ? green : red, side * 0.77, -0.76, -4.12, 0.18, 0.035, 0.08)
  }
  box(root, black, 0, 1.43, -2.18, 9.8, 0.32, 0.46)
  for (const side of [-1, 1]) {
    const x = 2.17 * side
    tube(root, dash, [x, -1.06, -1.94], [side * 1.85, 1.37, -2.18], 0.073)
    tube(root, black, [x * 1.074, -1.06, -1.94], [side * 1.94, 1.37, -2.18], 0.048)
  }
  const lantern = new T.Group()
  lantern.position.set(-1.33, 1.16, -2.2)
  root.add(lantern)
  tube(lantern, dark, [0, 0.14, 0], [0, -0.15, 0], 0.015)
  oval(lantern, lamp, 0, -0.24, 0, 0.076, 0.105, 0.078)
  tube(lantern, dark, [0, -0.37, 0], [0, -0.314, 0], 0.096)
  tube(lantern, dark, [0, -0.19, 0], [0, -0.141, 0], 0.088)
  wheel.position.set(0.58, -0.72, -1.39)
  const wheelRim = new T.TorusGeometry(0.38, 0.036, 10, 42)
  mesh(wheel, wheelRim, black, 0, 0, 0)
  oval(wheel, dash, 0, 0, 0, 0.117, 0.117, 0.062)
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3 - Math.PI / 2
    tube(wheel, dash, [0, 0, 0], [Math.cos(angle) * 0.36, Math.sin(angle) * 0.36, 0], 0.026)
  }
  const handMaterial = metal('#343b37', 0.85, 0.04)
  for (const side of [-1, 1]) {
    const glove = oval(wheel, handMaterial, side * 0.34, 0.18, 0.026, 0.085, 0.12, 0.047)
    glove.rotation.z = -side * 0.5
  }
  const wiper = new T.Group()
  wiper.position.set(0.02, -0.77, -2.02)
  root.add(wiper)
  tube(wiper, black, [0, 0, 0], [0, 0.58, 0], 0.018)
  box(wiper, black, 0.031, 0.68, 0, 0.026, 0.64, 0.03).rotation.z = -0.12
  mergeStaticMeshes(root)
  return { root, wheel, wiper, lantern }
}
