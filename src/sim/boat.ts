import { tuning } from '../app/tuning'
import { approach, clamp, seededRandom } from '../core/math'
import type { ControlIntent } from '../input/intent'
import type { Emit } from '../game/events'

const T = tuning.boat
export interface Hazard {
  x: number; z: number; radius: number; type: 'reef' | 'debris' | 'barrel'; hit: boolean
}
export const courseLabel = (d: number) =>
  d < 150 ? 'Open water' : d < 350 ? 'Debris field' : d < 600 ? 'Fog & reef' : d < 780 ? 'Rogue swell' : 'Island approach'

export class Boat {
  readonly hazards: Hazard[] = []
  readonly lunges = [{ z: 455, x: 0, time: -1, ended: false }, { z: 689, x: 0, time: -1, ended: false }]
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
  sighted = false
  smooth = false
  done: 'landed' | 'destroyed' | null = null
  private lastHazard = -100

  constructor(seed: number, private readonly emit: Emit) {
    const rng = seededRandom(seed ^ 0x572913)
    for (let z = 158; z <= 824; z += z < 355 ? 22 : 27) {
      const sign = rng() < 0.5 ? -1 : 1
      const reef = z > 350 && z < 610 || z > 780
      const center = z < 350 ? 6 : 11
      const main = sign * (center + rng() * 12)
      const type = reef ? 'reef' : rng() < 0.48 ? 'barrel' : 'debris'
      this.hazards.push({ x: main, z, type, radius: reef ? 3.5 + rng() * 2 : 1.1 + rng(), hit: false })
      this.hazards.push({ x: -sign * (19 + rng() * 12), z: z + 6, type, radius: reef ? 4.5 : 1.3, hit: false })
    }
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
      const distance = Math.hypot(obstacle.x - this.x, obstacle.z - this.z)
      if (!obstacle.hit && distance < obstacle.radius + 1.1) {
        obstacle.hit = true
        this.x += this.x >= obstacle.x ? 2.8 : -2.8
        this.damage(obstacle.type === 'reef' ? 25 : 10, obstacle.x)
      } else if (!obstacle.hit && obstacle.z > this.z && distance < 25 && this.time - this.lastHazard > 12) {
        this.lastHazard = this.time
        this.emit('BOAT_HAZARD', { x: obstacle.x, text: obstacle.type === 'reef' ? 'REEF AHEAD' : 'DEBRIS AHEAD' })
      }
    }

    for (const lunge of this.lunges) {
      if (lunge.ended) continue
      if (lunge.time < 0 && this.z >= lunge.z - 44) {
        lunge.time = this.time
        lunge.x = this.x
        this.emit('LUNGE_WARNING', { x: lunge.x, text: 'MEGALODON · TURN AWAY FROM THE WAKE' })
      }
      if (lunge.time >= 0 && this.time - lunge.time >= 3.1) {
        lunge.ended = true
        this.emit('LUNGE', { x: lunge.x })
        if (Math.abs(this.x - lunge.x) < 5 && Math.abs(this.z - lunge.z) < 21) this.damage(35, lunge.x)
      }
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
