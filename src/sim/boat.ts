import { tuning } from '../app/tuning'
import { approach, clamp, lerp, seededRandom } from '../core/math'
import type { ControlIntent } from '../input/intent'
import type { Emit } from '../game/events'

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
  const profile = rockProfiles[rock.variant]
  return contactNormals.every(([nx, nz], i) => localX * nx + localZ * nz <= profile[i + 4] + margin)
}

function rockAt(variant: RockVariant, x: number, z: number, length: number, yaw: number, island = false): ReefHazard {
  return { type: 'reef', x, z, radius: rockProfiles[variant][3] * length, hit: false, variant, length, yaw, island }
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

export const islandCrown = { variant: 'Boulder_02', heightPerUnit: 0.3101 } as const
const islandRocks = [
  [8, -8, 34, islandCrown.variant], [-16, -10, 30, 'Boulder_05'], [29, -11, 25, 'Boulder_01'],
  [-35, -2, 26, 'Reef_01'], [36, 4, 24, 'Boulder_06'], [-31, 16, 28, 'Boulder_04'],
  [-3, 16, 34, 'Boulder_03'], [24, 17, 28, 'Reef_03'], [-11, 33, 35, 'Reef_04'],
  [14, -23, 13, 'Reef_02'], [-21, -24, 13, 'Stone_12'], [36, -22, 12, 'Stone_13'],
  [-42, 8, 15, 'Stone_04'], [19, 34, 22, 'Reef_01'],
] as const satisfies readonly (readonly [number, number, number, RockVariant])[]

function makeReefs(seed: number) {
  const rng = seededRandom(seed ^ 0x482a561b)
  const yaw = () => rng() * 2 * Math.PI
  const boulder = cycleVariants('Boulder', rng)
  const reef = cycleVariants('Reef', rng)
  const stone = cycleVariants('Stone', rng)
  const length = (min: number, max: number) => reefScales.rocks.targetLength * lerp(min, max, rng())
  const sideStart = rng() < 0.5 ? -1 : 1
  // Alternate the banks and reserve room even where the solo rocks project into the channel.
  const rocks: ReefHazard[] = []
  const clusters = [[365, 4], [405, 3], [455, 2], [492, 4], [532, 4], [574, 3], [787, 4], [827, 3], [869, 4]]
  clusters.forEach(([station, count], i) => {
    const side = i % 2 === 0 ? sideStart : -sideStart
    const lead = rockAt(boulder(), side * lerp(29.5, 33.5, rng()), station + lerp(-3, 3, rng()), length(1.65, 2.17), yaw())
    rocks.push(lead)
    const ahead = rng() < .5 ? -1 : 1
    for (let j = 1; j < count; j++) {
      const next = rockAt(j === 1 ? reef() : stone(), lead.x, lead.z,
        j === 1 ? length(.95, 1.37) : length(.35, .55), yaw())
      const angle = j === 1 ? lerp(.88, 1.33, rng()) : j === 2 ? lerp(-1.29, -.83, rng()) : lerp(2.8, 3.32, rng())
      const offset = (lead.radius + next.radius) * lerp(.95, 1.09, rng())
      next.x += side * Math.cos(angle) * offset
      next.z += ahead * Math.sin(angle) * offset
      rocks.push(next)
    }
  })
  const solos = [382, 472, 517, 595, 810, 852]
  solos.forEach((station, i) => {
    const side = i % 2 === 0 ? -sideStart : sideStart
    const small = i % 3 === 1
    const rock = rockAt(small ? stone() : boulder(), 0, station + lerp(-4, 4, rng()),
      small ? length(.36, .5) : length(.64, .94), yaw())
    rock.x = side * (8.6 + boatClearance + rock.radius + rng() * 2.2)
    rocks.push(rock)
  })
  const islandRng = seededRandom(81)
  const islandScale = reefScales.island.targetLength / 100
  for (const [x, z, size, variant] of islandRocks) {
    rocks.push(rockAt(variant, 31 + x * islandScale, 950 + z * islandScale,
      size * islandScale, islandRng() * 2 * Math.PI, true))
  }
  return rocks
}

interface BoatLunge {
  courseZ: number; side: -1 | 1; time: number; ended: boolean
  x: number; targetZ: number; vx: number; vz: number
}

export const boatLungeTiming = { bite: 2.55, strike: 3.1, clear: 3.65, end: 5 } as const

// Both damage and rendering use this path for the tip of the shark's snout.
export function boatLungePosition(lunge: BoatLunge, age: number) {
  const travel = age - boatLungeTiming.strike
  return { x: lunge.x + travel * lunge.vx, z: lunge.targetZ + travel * lunge.vz }
}

export const courseLabel = (d: number) =>
  d < 150 ? 'Open water' : d < 350 ? 'Debris field' : d < 600 ? 'Fog & reef' : d < 780 ? 'Rogue swell' : 'Island approach'

export class Boat {
  readonly hazards: Hazard[] = []
  private readonly hazardReach: number
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
    this.hazards.push(...makeReefs(seed))
    this.hazards.sort((a, b) => a.z - b.z)
    this.hazardReach = Math.max(warningRange, ...this.hazards.map(h => h.radius + boatClearance * contactMarginScale))
  }

  tick(dt: number, intent: ControlIntent, assist: boolean) {
    if (this.done) return
    this.time += dt
    const approachZone = this.z >= T.approach
    const throttle = clamp(intent.throttle)
    const speedTarget = approachZone ? 2.4 + 13.6 * throttle : T.speed * Math.max(T.throttleFloor, throttle)
    const swell = this.z > 600 && this.z < 780 ? 0.82 + 0.18 * Math.cos(this.time * 1.15) : 1
    this.speed = approach(this.speed, speedTarget * swell, (approachZone ? 5.8 : T.accel) * dt)
    const headingAssist = assist ? clamp(-this.x * 0.024 - this.heading * 0.22, -0.15, 0.15) : 0
    this.steer = approach(this.steer, clamp(intent.steer + headingAssist, -1, 1), dt * 4.5)
    this.heading = clamp(this.heading + this.steer * (intent.trackingState === 'ok' ? 1 : 0) * T.turn
      * clamp(this.speed / 9, 0.25, 1) * dt, -1.12, 1.12)
    this.x += Math.sin(this.heading) * this.speed * dt
    this.z += Math.cos(this.heading) * this.speed * dt
    if (Math.abs(this.x) > 39) {
      this.x = clamp(this.x, -39, 39)
      this.heading = -Math.sign(this.x) * 0.42
    }
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
        this.x += this.x >= obstacle.x ? 2.8 : -2.8
        this.damage(obstacle.type === 'reef' ? 25 : 10, obstacle.x)
      } else if (dz > 0 && distanceSq < warningRange ** 2 && this.time - this.lastHazard > 12) {
        this.lastHazard = this.time
        this.emit('BOAT_HAZARD', { x: obstacle.x, text: obstacle.type === 'reef' ? 'REEF AHEAD' : 'DEBRIS AHEAD' })
      }
    }

    for (const lunge of this.lunges) {
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
        const text = lunge.side < 0 ? 'MEGALODON ON LEFT · STEER RIGHT' : 'MEGALODON ON RIGHT · STEER LEFT'
        this.emit('LUNGE_WARNING', { x: flank, text })
      }
      const age = this.time - lunge.time
      if (age < boatLungeTiming.bite) continue
      const snout = boatLungePosition(lunge, age)
      const contact = age <= boatLungeTiming.clear && Math.hypot(snout.x - this.x, snout.z - this.z) < 4.5
      if (!contact && age < boatLungeTiming.clear) continue
      lunge.ended = true
      this.emit('LUNGE', { x: snout.x })
      if (contact) this.damage(35, snout.x)
    }
    if (!this.sighted && this.z >= 740) {
      this.sighted = true
      this.emit('ISLAND_SIGHTED', { text: 'ISLAND AHEAD · LOWER THROTTLE' })
    }
    if (this.done) return
    if (this.z >= T.length && Math.abs(this.x) <= 13) {
      this.smooth = this.speed <= T.landingSpeed
      if (!this.smooth) this.hull = Math.max(0, this.hull - 20)
      this.done = 'landed'
      this.emit('LANDED', { text: this.smooth ? 'SMOOTH LANDING' : 'LANDFALL' })
    }
    if (this.z >= T.length + 10) {
      this.z = T.length + 10
      this.x = approach(this.x, 0, dt * 4)
    }
  }

  private damage(amount: number, x: number) {
    if (this.done) return
    this.hull = Math.max(0, this.hull - amount)
    this.collisions++
    this.lastImpact = this.time
    this.speed *= 0.73
    this.emit('BOAT_COLLISION', { x, text: 'HULL IMPACT' })
    if (this.hull === 0) this.done = 'destroyed'
  }
}
