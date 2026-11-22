import { tuning } from '../app/tuning'
import { approach, clamp, lerp, seededRandom } from '../core/math'
import type { ControlIntent } from '../input/intent'
import type { Emit, GameEvent } from '../game/events'

const T = tuning.boat
const boatClearance = 1.1
const warningRange = 25
const contactMarginScale = 1 / Math.cos(Math.PI / 12)
export const reefScales = {
  rocks: { label: 'Rocks', targetLength: 7.5 },
  island: { label: 'Island', targetLength: 100 },
} as const

type RockProfile = readonly [
  pitchDegrees: number, rollDegrees: number, sink: number, radius: number, ...supports: number[],
]
// Measured from the Draco meshes in ocean-rocks.glb. Distances are per unit of model length.
// The final 12 values enclose the rock's waterline band after the listed tilt and sink.
export const rockProfiles = {
  Boulder_01: [-3, -2, 0.2275, 0.5442, 0.5069, 0.4645, 0.4355, 0.404, 0.4848, 0.4812, 0.3999, 0.4465, 0.4694, 0.4685, 0.5305, 0.5199],
  Boulder_02: [3, -7, 0.2016, 0.5477, 0.5404, 0.5124, 0.5044, 0.5179, 0.4741, 0.4513, 0.4614, 0.4801, 0.4907, 0.4835, 0.4933, 0.4948],
  Boulder_03: [8, 6, 0.132, 0.5729, 0.4501, 0.5223, 0.5218, 0.5421, 0.562, 0.5308, 0.5116, 0.4942, 0.475, 0.4131, 0.4442, 0.4682],
  Boulder_04: [-5, 1, 0.2688, 0.5536, 0.4913, 0.4877, 0.4275, 0.4084, 0.4716, 0.502, 0.5078, 0.5242, 0.5429, 0.4915, 0.5159, 0.5097],
  Boulder_05: [1, -5, 0.2035, 0.5666, 0.508, 0.5615, 0.5241, 0.5067, 0.4701, 0.4109, 0.4328, 0.419, 0.4415, 0.471, 0.5123, 0.5441],
  Boulder_06: [6, 8, 0.3534, 0.5925, 0.4272, 0.4618, 0.5017, 0.5168, 0.5825, 0.5585, 0.5787, 0.5175, 0.4925, 0.4346, 0.4624, 0.4541],
  Reef_01: [-7, 3, 0.2062, 0.5462, 0.3812, 0.3742, 0.4028, 0.4331, 0.4419, 0.4029, 0.4146, 0.482, 0.4978, 0.542, 0.5029, 0.4037],
  Reef_02: [-2, -3, 0.1394, 0.5198, 0.3714, 0.429, 0.4518, 0.4845, 0.4609, 0.3735, 0.3177, 0.3728, 0.4763, 0.512, 0.4881, 0.4103],
  Reef_03: [4, -8, 0.1573, 0.5345, 0.3371, 0.4436, 0.5038, 0.5255, 0.4768, 0.3572, 0.2466, 0.3317, 0.4308, 0.4811, 0.46, 0.4075],
  Reef_04: [-8, 4, 0.1042, 0.5668, 0.455, 0.4521, 0.3811, 0.2378, 0.1919, 0.3672, 0.5135, 0.5646, 0.4837, 0.3247, 0.2443, 0.3537],
  Stone_01: [-3, -2, 0.2855, 0.5658, 0.5128, 0.5636, 0.511, 0.4064, 0.44, 0.4973, 0.4728, 0.4214, 0.4597, 0.4697, 0.4238, 0.4343],
  Stone_02: [3, -7, 0.23, 0.5677, 0.5546, 0.5409, 0.4964, 0.3959, 0.4098, 0.367, 0.3587, 0.3802, 0.3557, 0.3083, 0.392, 0.4789],
  Stone_03: [8, 6, 0.3286, 0.6461, 0.4347, 0.6001, 0.6394, 0.5181, 0.4655, 0.5038, 0.5361, 0.5336, 0.491, 0.4196, 0.3416, 0.3274],
  Stone_04: [-5, 1, 0.2152, 0.5477, 0.4377, 0.4609, 0.4511, 0.4169, 0.4673, 0.4829, 0.4707, 0.5074, 0.5231, 0.5323, 0.5253, 0.467],
  Stone_05: [1, -5, 0.3125, 0.5909, 0.5159, 0.5628, 0.5089, 0.5025, 0.5735, 0.5375, 0.4169, 0.496, 0.5612, 0.4954, 0.5841, 0.5503],
  Stone_06: [6, 8, 0.2153, 0.567, 0.3349, 0.3897, 0.5036, 0.5464, 0.5488, 0.5397, 0.4614, 0.4624, 0.4879, 0.4495, 0.4699, 0.4271],
  Stone_07: [-7, 3, 0.3806, 0.5769, 0.3755, 0.3425, 0.3787, 0.4334, 0.4089, 0.3542, 0.4257, 0.4638, 0.5183, 0.5657, 0.5463, 0.4926],
  Stone_08: [-2, -3, 0.277, 0.5984, 0.5208, 0.593, 0.5533, 0.4463, 0.5, 0.4998, 0.4521, 0.4877, 0.5197, 0.5037, 0.454, 0.4713],
  Stone_09: [4, -8, 0.3553, 0.6047, 0.5688, 0.498, 0.4559, 0.5053, 0.5531, 0.5358, 0.4428, 0.4008, 0.4254, 0.4583, 0.5499, 0.5952],
  Stone_10: [-8, 4, 0.2191, 0.5661, 0.3686, 0.2962, 0.3571, 0.4604, 0.508, 0.4861, 0.4021, 0.4815, 0.5202, 0.5558, 0.535, 0.4444],
  Stone_11: [-3, -2, 0.215, 0.5971, 0.4668, 0.4864, 0.486, 0.4729, 0.4375, 0.4276, 0.4338, 0.4475, 0.4817, 0.4975, 0.5819, 0.5708],
  Stone_12: [3, -7, 0.2799, 0.5904, 0.5529, 0.5823, 0.5355, 0.4713, 0.494, 0.5132, 0.4447, 0.4327, 0.3988, 0.4322, 0.4546, 0.4833],
  Stone_13: [8, 6, 0.2135, 0.6103, 0.3879, 0.5284, 0.5916, 0.5601, 0.5777, 0.5986, 0.5372, 0.4963, 0.4784, 0.4373, 0.4026, 0.3957],
  Stone_14: [-5, 1, 0.3496, 0.5681, 0.4944, 0.4913, 0.4448, 0.4375, 0.4526, 0.4803, 0.5097, 0.559, 0.5328, 0.5057, 0.5465, 0.5508],
} as const satisfies Record<string, RockProfile>
export type RockVariant = keyof typeof rockProfiles
type StoneVariant = Extract<RockVariant, `Stone_${string}`>

// The same meshes and tilts measured again at the deeper submersion used for cluster bases.
const accentProfiles = {
  Stone_01: [-3, -2, 0.5426, 0.5666, 0.5111, 0.5623, 0.5215, 0.4201, 0.4561, 0.5178, 0.4815, 0.4263, 0.4439, 0.461, 0.4242, 0.4445],
  Stone_02: [3, -7, 0.5685, 0.6327, 0.5959, 0.6223, 0.5417, 0.3942, 0.4478, 0.4182, 0.4338, 0.3879, 0.3726, 0.3433, 0.4185, 0.4971],
  Stone_03: [8, 6, 0.6037, 0.6328, 0.4368, 0.5841, 0.6275, 0.5181, 0.4928, 0.5831, 0.5731, 0.5377, 0.454, 0.3872, 0.3332, 0.3276],
  Stone_04: [-5, 1, 0.5047, 0.557, 0.4546, 0.4702, 0.4867, 0.4516, 0.4942, 0.4819, 0.4683, 0.5044, 0.5236, 0.5447, 0.5298, 0.4661],
  Stone_05: [1, -5, 0.5562, 0.5894, 0.5099, 0.5456, 0.5223, 0.5096, 0.575, 0.5369, 0.4306, 0.5202, 0.5148, 0.4742, 0.5841, 0.5452],
  Stone_06: [6, 8, 0.4809, 0.5694, 0.3349, 0.3861, 0.5038, 0.551, 0.5488, 0.5473, 0.4716, 0.4549, 0.4875, 0.4495, 0.4942, 0.4391],
  Stone_07: [-7, 3, 0.6575, 0.5766, 0.3572, 0.336, 0.3787, 0.4334, 0.4249, 0.3514, 0.4257, 0.4638, 0.5181, 0.5653, 0.5463, 0.4926],
  Stone_08: [-2, -3, 0.5916, 0.6149, 0.5307, 0.6052, 0.5784, 0.4694, 0.5087, 0.549, 0.4669, 0.4849, 0.5173, 0.5064, 0.4624, 0.4798],
  Stone_09: [4, -8, 0.5967, 0.6065, 0.5671, 0.4984, 0.4646, 0.5286, 0.5626, 0.537, 0.4348, 0.382, 0.3619, 0.442, 0.5499, 0.5985],
  Stone_10: [-8, 4, 0.4488, 0.5661, 0.3679, 0.2916, 0.3565, 0.4563, 0.508, 0.4615, 0.3832, 0.4804, 0.5202, 0.5558, 0.535, 0.4376],
  Stone_11: [-3, -2, 0.6, 0.6399, 0.4989, 0.4899, 0.4767, 0.4738, 0.4727, 0.4721, 0.4517, 0.4775, 0.5033, 0.5421, 0.6294, 0.6027],
  Stone_12: [3, -7, 0.5516, 0.5836, 0.5529, 0.5722, 0.5355, 0.481, 0.5281, 0.5211, 0.4437, 0.4264, 0.3989, 0.425, 0.4409, 0.4698],
  Stone_13: [8, 6, 0.5592, 0.6357, 0.4366, 0.5775, 0.6328, 0.5782, 0.6011, 0.6076, 0.5605, 0.5738, 0.4977, 0.4337, 0.4172, 0.4056],
  Stone_14: [-5, 1, 0.6645, 0.5639, 0.4534, 0.3779, 0.3291, 0.366, 0.4535, 0.4874, 0.5097, 0.542, 0.5258, 0.5279, 0.5501, 0.5382],
} as const satisfies Record<StoneVariant, RockProfile>

interface HazardPosition {
  x: number; z: number; radius: number; hit: boolean
}
export interface FloatingHazard extends HazardPosition {
  type: 'debris' | 'barrel'
}
export interface ReefHazard extends HazardPosition {
  type: 'reef'
  variant: RockVariant
  length: number
  yaw: number
  island: boolean
  profile: RockProfile
}
export type Hazard = FloatingHazard | ReefHazard

const contactNormals = Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)])

export function reefContact(rock: ReefHazard, x: number, z: number, padding = boatClearance) {
  const dx = x - rock.x, dz = z - rock.z
  const reach = rock.radius + padding * contactMarginScale
  if (dx * dx + dz * dz > reach * reach) return false
  // Rotate course coordinates back to the model's XZ plane. Course Z points into -world Z.
  const cos = Math.cos(rock.yaw), sin = Math.sin(rock.yaw)
  const localX = (dx * cos + dz * sin) / rock.length
  const localZ = (dx * sin - dz * cos) / rock.length
  const margin = padding / rock.length
  return contactNormals.every(([nx, nz], i) => localX * nx + localZ * nz <= rock.profile[i + 4] + margin)
}

function rockAt(variant: RockVariant, x: number, z: number, length: number, yaw: number, island = false): ReefHazard {
  const profile = !island && variant.startsWith('Stone_') ? accentProfiles[variant as StoneVariant] : rockProfiles[variant]
  return { type: 'reef', x, z, radius: profile[3] * length, hit: false, variant, length, yaw, island, profile }
}

function cycleVariants(prefix: string, rng: () => number) {
  const variants = (Object.keys(rockProfiles) as RockVariant[]).filter(name => name.startsWith(prefix))
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const earlier = variants[j]
    variants[j] = variants[i]
    variants[i] = earlier
  }
  let index = 0
  return () => variants[index++ % variants.length]
}

const harborPier = { minX: 6.5, maxX: 14.5, minZ: 880, maxZ: 928, deckY: 1.62 } as const
export const harbor = {
  island: { x: 5, z: 959, baseY: -0.48 },
  pier: harborPier,
  // The seaward head closes the starboard approach. The boat can turn toward the open port side.
  pierHead: { minX: harborPier.maxX, maxX: 41, minZ: harborPier.minZ, maxZ: 886 },
  mooring: { minX: -13, maxX: harborPier.minX, minZ: 886, maxZ: 913, helmX: 2.7, helmZ: 903 },
  boardingZ: 893.2,
} as const

type HarborPoint = readonly [x: number, z: number]
// Waterline contour sampled from the optimized island at its 100-unit reference length.
// Course Z points toward the island, opposite Three.js world Z.
const islandContour = [
  [6.62, -48.99], [5.1, -47.31], [1.99, -48.91], [0.9, -47.93],
  [-0.54, -48.54], [-3.93, -46.17], [-7.33, -47.9], [-11.42, -43.75],
  [-13.97, -42.84], [-12.44, -42.2], [-13.22, -40.85], [-12.29, -39.27],
  [-14.27, -37.9], [-16.39, -38.61], [-18.54, -37.57], [-20.15, -38.72],
  [-22.86, -37.48], [-24.5, -38.37], [-26.39, -36.11], [-25.89, -34.43],
  [-27.15, -32.56], [-28.64, -35.47], [-32.24, -37.26], [-37.93, -33.04],
  [-37.18, -30.84], [-39.69, -22.93], [-41.82, -21.79], [-39.68, -12.4],
  [-46.68, -7.45], [-45.3, 5.36], [-49.08, 7.44], [-43.18, 15.68],
  [-46.46, 22.15], [-36.33, 30.05], [-39.31, 32.82], [-46, 31.89],
  [-49.84, 36.4], [-48.11, 44.2], [-42.87, 48.15], [-36.95, 45.45],
  [-33.7, 46.9], [-32.37, 42.37], [-28.57, 44.48], [-24.77, 42.48],
  [-23.2, 48.65], [-19.82, 48.55], [-18.75, 45.24], [-14.79, 48.99],
  [-10.45, 45.63], [2.65, 46.2], [9.1, 41.61], [21.66, 48.19],
  [25.12, 45.21], [27.72, 46.32], [29.4, 41.36], [31.24, 43.7],
  [37.01, 43.2], [44.47, 35.96], [39.7, 31.1], [41.2, 26.83],
  [43.59, 27.37], [41.73, 25.44], [44.58, 17.93], [44.97, 12.45],
  [41.49, 9.48], [44.36, 9.71], [50, 2.04], [46.98, -4.72],
  [37.59, -8.92], [36.55, -12.65], [37.03, -18.55], [39.73, -18.6],
  [38.93, -21.7], [44.67, -26.95], [40.23, -30.1], [40.32, -32.71],
  [44.62, -34.66], [43.45, -36], [39.96, -35.53], [41.61, -41.49],
  [37.69, -46.34], [34.68, -45.61], [29.15, -46.77], [22.04, -43.89],
  [20.45, -41.53], [21.85, -38.19], [18.91, -37.63], [18.39, -38.99],
  [19.86, -39.03], [17.27, -40.99], [18.5, -42.3], [16.64, -44.67],
  [13.13, -47.24], [11.56, -45.98], [8.67, -46.96],
] as const
const islandScale = reefScales.island.targetLength / 100
const shore: HarborPoint[] = islandContour.map(([x, z]) =>
  [harbor.island.x + x * islandScale, harbor.island.z + z * islandScale])
const coastStart = Math.min(...shore.map(([, z]) => z))
const { minX: pierLeft, maxX: pierRight, minZ: pierTip, maxZ: pierEnd } = harbor.pier
const pier: HarborPoint[] = [[pierLeft, pierTip], [pierRight, pierTip], [pierRight, pierEnd], [pierLeft, pierEnd]]
const { minX: headLeft, maxX: headRight, minZ: headTip, maxZ: headEnd } = harbor.pierHead
const pierHead: HarborPoint[] = [[headLeft, headTip], [headRight, headTip], [headRight, headEnd], [headLeft, headEnd]]
// The navigation point is at the helm. The stern extends much farther behind it than the bow.
const hull: HarborPoint[] = [[-2.8, -12.5], [2.8, -12.5], [3.32, -10], [3.32, 2.25],
  [1.52, 5.12], [-1.52, 5.12], [-3.32, 2.25], [-3.32, -10]]

function insideHarborPolygon([x, z]: HarborPoint, points: readonly HarborPoint[]) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[i], [bx, bz] = points[j]
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside
  }
  return inside
}

function turnAt([ax, az]: HarborPoint, [bx, bz]: HarborPoint, [cx, cz]: HarborPoint) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
}

function harborPolygonsTouch(a: readonly HarborPoint[], b: readonly HarborPoint[]) {
  if (insideHarborPolygon(a[0], b) || insideHarborPolygon(b[0], a)) return true
  return a.some((from, i) => {
    const to = a[(i + 1) % a.length]
    const [ax, az] = from, [bx, bz] = to
    return b.some((c, j) => {
      const d = b[(j + 1) % b.length]
      return Math.max(ax, bx) >= Math.min(c[0], d[0]) && Math.max(c[0], d[0]) >= Math.min(ax, bx)
        && Math.max(az, bz) >= Math.min(c[1], d[1]) && Math.max(c[1], d[1]) >= Math.min(az, bz)
        && turnAt(from, to, c) * turnAt(from, to, d) <= 0
        && turnAt(c, d, from) * turnAt(c, d, to) <= 0
    })
  })
}

export function harborContact(x: number, z: number, heading: number) {
  if (z < Math.min(pierTip, coastStart) - 7) return false
  const sin = Math.sin(heading), cos = Math.cos(heading)
  const footprint: HarborPoint[] = hull.map(([side, forward]) =>
    [x + side * cos + forward * sin, z - side * sin + forward * cos])
  const nose = Math.max(...footprint.map(([, pointZ]) => pointZ))
  return (nose >= pierTip && (harborPolygonsTouch(footprint, pier) || harborPolygonsTouch(footprint, pierHead)))
    || (nose >= coastStart && harborPolygonsTouch(footprint, shore))
}

function inMooringZone(x: number, z: number) {
  const { minX, maxX, maxZ } = harbor.mooring
  return z >= T.length && z <= maxZ && x >= minX && x < maxX
}

function coastalRocks() {
  const rng = seededRandom(81)
  const boulder = cycleVariants('Boulder_', rng)
  const reef = cycleVariants('Reef_', rng)
  const stone = cycleVariants('Stone_', rng)
  const rocks: ReefHazard[] = []
  for (const [x, z] of shore) {
    if (z < harbor.pier.maxZ + 5 && x > harbor.mooring.minX - 7 && x < harbor.pier.maxX + 7) continue
    if (rocks.some(rock => Math.hypot(rock.x - x, rock.z - z) < 12)) continue
    const kind = rng()
    const size = lerp(3.2, 8.4, rng()) * islandScale
    // Sink the rocks into the bank and leave the mooring and pier approach clear.
    rocks.push(rockAt(kind < 0.46 ? boulder() : kind < 0.76 ? reef() : stone(),
      lerp(x, harbor.island.x, 0.035), lerp(z, harbor.island.z, 0.035), size, rng() * Math.PI * 2, true))
  }
  return rocks
}

const reefBends = [
  [350, 0], [397, 14], [441, 14], [510, -15], [548, -15], [610, 0],
  [648, 8.5], [674, 8.5], [725, -8.5], [750, -8.5],
  [780, 0], [816, 12], [847, 12], [887, 0],
] as const
const laneHalfWidth = 6.5

function reefRouteX(z: number, side: number) {
  for (let i = 1; i < reefBends.length; i++) {
    const [endZ, endX] = reefBends[i]
    if (z > endZ) continue
    const [startZ, startX] = reefBends[i - 1]
    const t = clamp((z - startZ) / (endZ - startZ))
    return side * lerp(startX, endX, t * t * (3 - 2 * t))
  }
  return 0
}

function rockEdge(rock: ReefHazard, dx: number, dz: number) {
  const cos = Math.cos(rock.yaw), sin = Math.sin(rock.yaw)
  const x = dx * cos + dz * sin, z = dx * sin - dz * cos
  let edge = Infinity
  for (let i = 0; i < contactNormals.length; i++) {
    const [nx, nz] = contactNormals[i]
    const facing = x * nx + z * nz
    if (facing > 0) edge = Math.min(edge, rock.profile[i + 4] / facing)
  }
  return edge * rock.length
}

function joinRocks(anchor: ReefHazard, rock: ReefHazard, dx: number, dz: number, overlap: number) {
  const near = rockEdge(rock, -dx, -dz)
  const spacing = rockEdge(anchor, dx, dz) + near * (1 - overlap)
  rock.x = anchor.x + dx * spacing
  rock.z = anchor.z + dz * spacing
}

function keepLaneClear(formation: readonly ReefHazard[], side: number, bendSide: number) {
  let shift = 0
  for (const rock of formation) {
    const reach = rock.radius + (boatClearance + laneHalfWidth) * contactMarginScale
    const low = rock.z - reach, high = rock.z + reach
    let lane = Math.max(reefRouteX(low, bendSide) * side, reefRouteX(high, bendSide) * side)
    for (const [z, x] of reefBends) if (z > low && z < high) lane = Math.max(lane, x * bendSide * side)
    shift = Math.max(shift, lane + reach - side * rock.x)
  }
  for (const rock of formation) rock.x += side * shift
}

function makeReefs(seed: number) {
  const rng = seededRandom(seed ^ 0x482a561b)
  const yaw = () => rng() * 2 * Math.PI
  const boulder = cycleVariants('Boulder', rng)
  const reef = cycleVariants('Reef', rng)
  const stone = cycleVariants('Stone', rng)
  const length = (min: number, max: number) => reefScales.rocks.targetLength * lerp(min, max, rng())
  const bendSide = rng() < 0.5 ? -1 : 1
  const rocks: ReefHazard[] = []
  const clusters = [
    [362, 4, -28], [407, 3, -3.2], [461, 2, 20], [492, 4, -26], [537, 4, 3.5],
    [578, 3, 21], [793, 4, 27], [831, 3, -4.6], [867, 4, 24],
  ] as const
  const makeFormation = ([station, count, lateral]: readonly [number, number, number]) => {
    const side = Math.sign(lateral) * bendSide
    const lead = rockAt(boulder(), bendSide * lateral + side * lerp(-1.9, 2.6, rng()),
      station + lerp(-4, 4, rng()), length(1.65, 2.17), yaw())
    const pieces = [lead]
    const ahead = rng() < .5 ? -1 : 1
    for (let j = 1; j < count; j++) {
      const next = rockAt(j === 1 ? reef() : stone(), 0, 0,
        j === 1 ? length(.95, 1.37) : length(.35, .55), yaw())
      const angle = j === 1 ? lerp(.91, 1.49, rng()) : j === 2 ? lerp(-1.32, -.79, rng()) : lerp(2.83, 3.37, rng())
      const overlap = j === 1 ? lerp(.06, .20, rng()) : lerp(.42, .67, rng())
      joinRocks(j === 3 ? pieces[1] : lead, next, side * Math.cos(angle), ahead * Math.sin(angle), overlap)
      pieces.push(next)
    }
    return { pieces, side, ahead }
  }
  const formations = clusters.map(makeFormation)
  const additionalRocks = [
    { station: 384, lateral: -14 }, { formation: 2, accent: true }, { formation: 4, accent: false },
    { station: 563, lateral: -12 }, { formation: 7, accent: true }, { station: 851, lateral: -18 },
    { station: 642, lateral: -26 }, { station: 711, lateral: 24 }, { station: 767, lateral: -22 },
  ] as const
  for (const placement of additionalRocks) {
    const small = 'accent' in placement && placement.accent
    const drift = lerp(-4, 4, rng())
    const rock = rockAt(small ? stone() : boulder(), 0, 0,
      small ? length(.36, .5) : length(.64, .94), yaw())
    const variation = rng()
    if ('station' in placement) {
      const { station, lateral } = placement
      rock.z = station + drift
      rock.x = bendSide * lateral + Math.sign(lateral) * bendSide * lerp(-2, 3, variation)
      keepLaneClear([rock], Math.sign(lateral) * bendSide, bendSide)
      rocks.push(rock)
      continue
    }
    const { pieces, side, ahead } = formations[placement.formation]
    const angle = drift * 0.035 + (small ? 2.55 : -.89) + variation * .24
    joinRocks(small ? pieces[1] : pieces[0], rock, side * Math.cos(angle), ahead * Math.sin(angle), small ? .56 : .24)
    pieces.push(rock)
  }
  // Add the swell formations after the original placements to preserve their seeded sizes and angles.
  const lateClusters = [[620, 3, 24], [665, 2, -2.8], [741, 3, 2.4]] as const
  formations.push(...lateClusters.map(makeFormation))
  for (const { pieces, side } of formations) {
    keepLaneClear(pieces, side, bendSide)
    rocks.push(...pieces)
  }
  rocks.push(...coastalRocks())
  return { rocks, bendSide }
}

interface BoatLunge {
  courseZ: number; side: -1 | 1; time: number; ended: boolean
  x: number; targetZ: number; vx: number; vz: number
  curve?: LungeCurve
}

export const boatLungeTiming = { bite: 2.55, strike: 3.1, clear: 3.65, end: 5 } as const
export const boatSharkLength = 21.39
const sharkTailReach = boatSharkLength * 1.1
const sharkClearance = boatSharkLength * 0.29 + 0.65
const lungeKnots = [0, 1.45, boatLungeTiming.strike, 4.12, boatLungeTiming.end]
type LungeCurve = { offsets: readonly number[]; slopes: readonly number[] }
type LungeMotion = Pick<BoatLunge, 'x' | 'targetZ' | 'vx' | 'vz' | 'curve'>

// Damage and rendering follow the same snout position and tangent in course coordinates.
export function boatLungePosition(lunge: LungeMotion, age: number) {
  const travel = age - boatLungeTiming.strike
  const x = lunge.x + travel * lunge.vx, z = lunge.targetZ + travel * lunge.vz
  const { vx, vz, curve } = lunge
  if (!curve) return { x, z, vx, vz }
  const { offsets, slopes } = curve
  const end = lungeKnots.findIndex((time, i) => i > 0 && time >= age)
  const j = end < 0 ? lungeKnots.length - 1 : end
  const i = j - 1
  const dt = lungeKnots[j] - lungeKnots[i]
  const t = clamp((age - lungeKnots[i]) / dt), t2 = t * t
  const a = offsets[i], b = offsets[j], m = slopes[i] * dt, n = slopes[j] * dt
  const lateral = lerp(a, b, t2 * (3 - 2 * t)) + t * (1 - t) * ((1 - t) * m - t * n)
  const rate = (6 * t * (1 - t) * (b - a) + (3 * t2 - 4 * t + 1) * m + (3 * t2 - 2 * t) * n) / dt
  const speed = Math.hypot(vx, vz)
  return { x: x - lateral * vz / speed, z: z + lateral * vx / speed, vx: vx - rate * vz / speed, vz: vz + rate * vx / speed }
}

// Intersect the snout-to-tail span with the same convex footprint the boat uses, inflated by the shark's beam.
function sharkTouchesReef(rock: ReefHazard, noseX: number, noseZ: number, tailX: number, tailZ: number) {
  const reach = rock.radius + sharkClearance * contactMarginScale
  if (rock.x < Math.min(noseX, tailX) - reach || rock.x > Math.max(noseX, tailX) + reach
    || rock.z < Math.min(noseZ, tailZ) - reach || rock.z > Math.max(noseZ, tailZ) + reach) return false
  const cos = Math.cos(rock.yaw), sin = Math.sin(rock.yaw)
  const ax = noseX - rock.x, az = noseZ - rock.z, bx = tailX - rock.x, bz = tailZ - rock.z
  const x1 = ax * cos + az * sin, z1 = ax * sin - az * cos
  const x2 = bx * cos + bz * sin, z2 = bx * sin - bz * cos
  let enter = 0, leave = 1
  for (let i = 0; i < contactNormals.length; i++) {
    const [nx, nz] = contactNormals[i]
    const edge = rock.profile[i + 4] * rock.length + sharkClearance
    const a = x1 * nx + z1 * nz - edge, b = x2 * nx + z2 * nz - edge
    if (a > 0 && b > 0) return false
    if (a > 0) enter = Math.max(enter, a / (a - b))
    else if (b > 0) leave = Math.min(leave, a / (a - b))
    if (enter > leave) return false
  }
  return true
}

function clearLunge(lunge: LungeMotion, rocks: readonly ReefHazard[]) {
  // The extra clearance covers motion between samples and the tail swing in the clip.
  const samples = 125
  const step = boatLungeTiming.end / samples
  const turnLimit = Math.cos(1.8 * step)
  let forwardX = 0, forwardZ = 0
  for (let i = 0; i <= samples; i++) {
    const { x, z, vx, vz } = boatLungePosition(lunge, i * step)
    const speed = Math.hypot(vx, vz)
    const dx = vx / speed, dz = vz / speed
    if (i > 0 && forwardX * dx + forwardZ * dz < turnLimit) return false
    if (rocks.some(rock => sharkTouchesReef(rock, x + dx * .8, z + dz * .8, x - dx * sharkTailReach, z - dz * sharkTailReach))) return false
    forwardX = dx
    forwardZ = dz
  }
  return true
}

const lungeBends = [
  [5, 3, 0, -2, -4], [4, 2, 0, 2, 5], [0, 4, 0, 0, 0], [0, 0, 0, 3, 5],
  [0, 8, 0, 0, 0], [10, 9, 0, 0, 0], [0, 0, 0, 7, 12],
  [12, 10, 0, -5, -10], [16, 13, 0, 7, 12], [20, 12, 0, 0, 0], [23, 17, 0, -5, -10],
] as const
const lungeShifts = [0, 4, -4, 9, -9, 16, -16, 26, -26, 38, -38, 50, -50]
const maxLateralReach = Math.max(...lungeShifts) + 2 * Math.max(...lungeBends.flat().map(Math.abs))

export function planBoatLunge(lunge: LungeMotion, hazards: readonly Hazard[]): LungeMotion | null {
  const longitudinalReach = Math.hypot(lunge.vx, lunge.vz) * boatLungeTiming.strike
  const reach = Math.hypot(longitudinalReach, maxLateralReach) + sharkTailReach + 1 + sharkClearance * contactMarginScale
  const rocks = hazards.filter((h): h is ReefHazard => h.type === 'reef'
    && Math.abs(h.x - lunge.x) < reach + h.radius && Math.abs(h.z - lunge.targetZ) < reach + h.radius)
  if (!rocks.length || clearLunge(lunge, rocks)) return lunge

  // Prefer a bend that still reaches the original strike point. If it is occupied, the shark veers past it.
  for (const shift of lungeShifts) {
    for (const bend of lungeBends) for (const side of [1, -1]) {
      const offsets = bend.map(value => shift + value * side)
      const slopes = offsets.map((_, i) => i === 0 || i === offsets.length - 1 ? 0
        : (offsets[i + 1] - offsets[i - 1]) / (lungeKnots[i + 1] - lungeKnots[i - 1]))
      const pass = { ...lunge, curve: { offsets, slopes } }
      if (clearLunge(pass, rocks)) return pass
    }
  }
  // If a reef is too tight for a turn at this speed, a displaced pass is safer than diving through it.
  for (const shift of lungeShifts.slice(1)) {
    const pass = { ...lunge, curve: { offsets: lungeKnots.map(() => shift), slopes: lungeKnots.map(() => 0) } }
    if (clearLunge(pass, rocks)) return pass
  }
  return null
}

export const courseLabel = (d: number) =>
  d < 150 ? 'Open water' : d < 350 ? 'Debris field' : d < 600 ? 'Fog & reef' : d < 780 ? 'Rogue swell'
    : d < 860 ? 'Island approach' : 'Moor left of the pier'

export class Boat {
  readonly hazards: Hazard[] = []
  private readonly hazardReach: number
  private readonly bendSide: number
  readonly lunges: BoatLunge[] = [
    { courseZ: 455, side: -1, time: -1, ended: false, x: 0, targetZ: 0, vx: 0, vz: 0 },
    { courseZ: 689, side: 1, time: -1, ended: false, x: 0, targetZ: 0, vx: 0, vz: 0 },
  ]
  x = 0
  z = 0
  heading = 0
  speed = 0
  roll = 0
  steer = 0
  time = 0
  hull: number = T.maxHull
  collisions = 0
  lastImpact = -100
  reefsActive = true
  sighted = false
  smooth = false
  done: 'landed' | 'destroyed' | null = null
  private lastHazard = -100

  constructor(seed: number, private readonly emit: Emit) {
    const rng = seededRandom(seed ^ 0x572913)
    for (let z = 158; z <= 824; z += z < 355 ? 22 : 27) {
      const sign = rng() < 0.5 ? -1 : 1
      const center = z < 350 ? 6 : 11
      const main = sign * (center + rng() * 12)
      const type = z > 350 && z < 610 || z > 780 ? null : rng() < 0.48 ? 'barrel' : 'debris'
      // Preserve the previous floating-hazard layout for the same seed across the replaced reef rows.
      const radius = 1.1 + rng()
      const flank = -sign * (19 + rng() * 12)
      if (!type) continue
      this.hazards.push({ x: main, z, type, radius, hit: false })
      this.hazards.push({ x: flank, z: z + 6, type, radius: 1.3, hit: false })
    }
    const { rocks, bendSide } = makeReefs(seed)
    this.bendSide = bendSide
    this.hazards.push(...rocks)
    this.hazards.sort((a, b) => a.z - b.z)
    this.hazardReach = Math.max(warningRange, ...this.hazards.map(h => h.radius + boatClearance * contactMarginScale))
  }

  reefRouteX(z: number) {
    return reefRouteX(z, this.bendSide)
  }

  tick(dt: number, intent: ControlIntent, assist: boolean) {
    if (this.done) return
    const previousTime = this.time
    this.time += dt
    const approachZone = this.z >= T.approach
    const throttle = clamp(intent.throttle)
    const speedTarget = approachZone ? 2.4 + 13.6 * throttle : T.speed * Math.max(T.throttleFloor, throttle)
    const swell = this.z > 600 && this.z < 780 ? 0.82 + 0.18 * Math.cos(this.time * 1.15) : 1
    this.speed = approach(this.speed, speedTarget * swell, (approachZone ? 5.8 : T.accel) * dt)
    const headingAssist = assist ? clamp(-this.x * 0.024 - this.heading * 0.22, -0.15, 0.15) : 0
    this.steer = approach(this.steer, clamp(intent.steer + headingAssist, -1, 1), dt * 4.5)
    const heading = clamp(this.heading + this.steer * (intent.trackingState === 'ok' ? 1 : 0) * T.turn
      * clamp(this.speed / 9, 0.25, 1) * dt, -1.12, 1.12)
    this.advance(dt, heading)
    this.roll = approach(this.roll, -this.steer * 0.17 + Math.sin(this.time * 2.15) * 0.036, dt * 0.7)
    if (intent.trackingState !== 'ok') return

    for (const obstacle of this.hazards) {
      const dz = obstacle.z - this.z
      if (dz > this.hazardReach) break
      if (dz < -this.hazardReach || obstacle.hit || obstacle.type === 'reef' && !this.reefsActive) continue
      const dx = obstacle.x - this.x
      const distanceSq = dx * dx + dz * dz
      const contact = obstacle.type === 'reef' ? reefContact(obstacle, this.x, this.z) : distanceSq < (obstacle.radius + boatClearance) ** 2
      if (contact) {
        obstacle.hit = true
        const deflected = this.x + (this.x >= obstacle.x ? 2.8 : -2.8)
        if (!harborContact(deflected, this.z, this.heading)) this.x = deflected
        this.damage(obstacle.type === 'reef' ? 25 : 10, obstacle.x, obstacle.type === 'reef' ? 'rock' : 'debris')
      } else if (dz > 0 && distanceSq < warningRange ** 2 && this.time - this.lastHazard > 12) {
        this.lastHazard = this.time
        this.emit('BOAT_HAZARD', { x: obstacle.x, text: obstacle.type === 'reef' ? 'REEF AHEAD' : 'DEBRIS AHEAD' })
      }
    }

    for (const lunge of this.lunges) {
      if (lunge.time >= 0 && previousTime - lunge.time < boatLungeTiming.strike
        && this.time - lunge.time >= boatLungeTiming.strike) {
        this.emit('WATER_SPLASH', { x: boatLungePosition(lunge, this.time - lunge.time).x, heavySplash: true })
      }
      if (lunge.ended) continue
      if (lunge.time < 0) {
        if (this.z < lunge.courseZ - 44) continue
        // Lead the current heading once at the warning. Turning changes the boat's path only.
        const forwardX = Math.sin(this.heading)
        const forwardZ = Math.cos(this.heading)
        const lead = this.speed * boatLungeTiming.strike
        const flank = lunge.side * 22
        lunge.time = this.time
        lunge.x = this.x + forwardX * lead
        lunge.targetZ = this.z + forwardZ * lead
        lunge.vx = -(forwardZ * flank + forwardX * 14) / boatLungeTiming.strike
        lunge.vz = -(-forwardX * flank + forwardZ * 14) / boatLungeTiming.strike
        const approach = planBoatLunge(lunge, this.hazards)
        if (!approach) {
          lunge.ended = true
          lunge.time = -1
          continue
        }
        lunge.curve = approach.curve
        const spawn = boatLungePosition(lunge, 0)
        lunge.side = (spawn.x - this.x) * forwardZ - (spawn.z - this.z) * forwardX < 0 ? -1 : 1
        const text = lunge.side < 0 ? 'MEGALODON ON LEFT · STEER RIGHT' : 'MEGALODON ON RIGHT · STEER LEFT'
        this.emit('LUNGE_WARNING', { x: lunge.side * 22, text })
      }
      const age = this.time - lunge.time
      if (age < boatLungeTiming.bite) continue
      const snout = boatLungePosition(lunge, age)
      const contact = age <= boatLungeTiming.clear && Math.hypot(snout.x - this.x, snout.z - this.z) < 4.5
      if (!contact && age < boatLungeTiming.clear) continue
      lunge.ended = true
      this.emit('LUNGE', { x: snout.x })
      if (contact) this.damage(35, snout.x, 'shark')
    }
    if (!this.sighted && this.z >= 740) {
      this.sighted = true
      this.emit('ISLAND_SIGHTED', { text: 'ISLAND AHEAD · MOOR LEFT OF THE PIER' })
    }
    if (this.done) return
    if (inMooringZone(this.x, this.z)) {
      this.smooth = this.speed <= T.landingSpeed
      if (!this.smooth) this.hull = Math.max(0, this.hull - 20)
      this.done = 'landed'
      this.emit('LANDED', { text: this.smooth ? 'SAFE MOORING' : 'MOORED · HARD LANDING' })
    }
  }

  private advance(dt: number, heading: number) {
    const nextX = this.x + Math.sin(heading) * this.speed * dt
    const x = clamp(nextX, -39, 39)
    const z = Math.min(this.z + Math.cos(heading) * this.speed * dt, T.length + 10)
    const turn = nextX === x ? heading : -Math.sign(x) * 0.42
    if (!harborContact(x, z, turn)) {
      this.x = x
      this.z = z
      this.heading = turn
      return
    }
    // Keep a clear turn at the current position and use the unobstructed axis to slide along the dock.
    if (!harborContact(this.x, this.z, turn)) {
      this.heading = turn
      const slides = Math.abs(x - this.x) > z - this.z ? [[x, this.z], [this.x, z]] : [[this.x, z], [x, this.z]]
      const slide = slides.find(([sx, sz]) => (sx !== this.x || sz !== this.z) && !harborContact(sx, sz, turn))
      if (slide) {
        this.x = slide[0]
        this.z = slide[1]
        this.speed *= Math.exp(-3.4 * dt)
        return
      }
    }
    // Recoil slightly from a head-on stop so the bow has room to swing away.
    const backX = clamp(this.x - 0.32 * Math.sin(this.heading), -39, 39)
    const backZ = this.z - 0.32 * Math.cos(this.heading)
    if (!harborContact(backX, backZ, turn)) {
      this.x = backX
      this.z = backZ
      this.heading = turn
    }
    this.speed = 0
  }

  private damage(amount: number, x: number, impact: NonNullable<GameEvent['impact']>) {
    if (this.done) return
    this.hull = Math.max(0, this.hull - amount)
    this.collisions++
    this.lastImpact = this.time
    this.speed *= 0.73
    this.emit('BOAT_COLLISION', { x, text: 'HULL IMPACT', impact })
    if (this.hull === 0) this.done = 'destroyed'
  }
}
