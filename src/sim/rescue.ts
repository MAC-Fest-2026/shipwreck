import { tuning } from '../app/tuning'
import { approach, clamp, damp, lerp, seededRandom } from '../core/math'
import type { ControlIntent } from '../input/intent'
import type { Emit } from '../game/events'
import { waveHeight } from './water'

const R = tuning.rescue
const S = tuning.shark
const boardCapacity = 3
export const rescueBoardX = -32
export const rescuePlaneZ = 0
export const boardBreachImpact = { apexAge: -1.13, x: rescueBoardX - 13.2, z: 10 } as const

// The existing board-break tick marks splashdown; the visible breach peaks before it.
export function boardBreachHeight(age: number) {
  const arcTime = age - boardBreachImpact.apexAge
  const ease = (from: number, to: number) => {
    const progress = clamp((arcTime - from) / (to - from))
    return progress * progress * (3 - 2 * progress)
  }
  return -1.5 - 6.1 * ease(-2.2, -1.25) + 14.5 * ease(-1.25, 0) - 14.9 * ease(0, 2.25)
}

export const roster = [
  { id: 'mara', name: 'Mara Voss', x: -35.4, model: 'mara-voss.glb' },
  { id: 'elias', name: 'Elias Rook', x: -34, model: 'elias-rook.glb' },
  { id: 'dev', name: 'Dev Kapoor', x: -30.8, model: 'dev-kapoor.glb' },
  { id: 'ana', name: 'Ana Kapoor', x: -39.8, model: 'ana-kapoor.glb' },
  { id: 'priya', name: 'Priya Nair', x: -24.1, model: 'priya-nair.glb' },
  { id: 'jay', name: 'Jay Okafor', x: -41.2, model: 'jay-okafor.glb' },
  { id: 'tommy', name: 'Tommy Ricci', x: -22.7, model: 'tommy-ricci.glb' },
  { id: 'hollis', name: 'Hollis Brandt', x: -21.25, model: 'hollis-brandt.glb' },
] as const
export const maxSurvivors = roster.length
export const normalizeSurvivorCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(Math.round(value), 1, maxSurvivors) : maxSurvivors

export type SurvivorState = 'debris' | 'floating' | 'carried' | 'falling' | 'saved' | 'lost'
export interface Survivor {
  id: string; name: string; x: number; readonly z: typeof rescuePlaneZ
  waterAnchorX: number
  state: SurvivorState; targeted: boolean; lastTarget: number; fallY: number; fallSpeed: number
}
interface Attack { target: Survivor; start: number; strike: number; end: number; delayed: boolean; announced: boolean }
export interface RescueAssists { aim: boolean; stabilization: number; winchOnly: boolean }
export class Rescue {
  readonly survivors: Survivor[]
  readonly attacks: Attack[] = []
  time = 0
  threat = 0
  x = -12
  velocity = 0
  acceleration = 0
  cable = 8.28
  swing = 0
  private swingVelocity = 0
  private readonly swimmerSlope = { x: 0, z: 0 }
  grip = false
  gripProgress = 0
  private gripTimer = 0
  private firstAttack = true
  private nextAttack: number = S.grace
  private lastGrab = 0
  private nextChatter = 7
  private warnedIdle = false
  private danglingAt = Infinity
  private jamUntil = 0
  warningTime = Infinity
  breachedAt = Infinity
  score = 0
  grabAttempts = 0
  grabSuccesses = 0
  quickSaves = 0
  hardDrops = 0
  done: 'aboard' | 'all-lost' | null = null
  readonly random: () => number

  constructor(seed: number, private readonly emit: Emit, readonly practice = false, count: number = maxSurvivors) {
    this.random = seededRandom(seed)
    this.survivors = practice
      ? [{ id: 'buoy', name: 'Training buoy', x: 0, z: rescuePlaneZ, waterAnchorX: 0, state: 'floating', targeted: false,
          lastTarget: -Infinity, fallY: 0, fallSpeed: 0 }]
      : roster.slice(0, normalizeSurvivorCount(count)).map((entry, i) => ({
          ...entry, z: rescuePlaneZ, waterAnchorX: entry.x, state: i < boardCapacity ? 'debris' : 'floating',
          targeted: false, lastTarget: -Infinity, fallY: 0, fallSpeed: 0 }))
  }

  get altitude() { return R.altitude + 0.18 * Math.sin(this.time * 1.6) }
  get clawX() { return this.x + this.cable * Math.sin(this.swing) }
  get clawY() { return this.altitude - this.cable * Math.cos(this.swing) }
  get deckY() { return R.deckY + waveHeight(R.deploy, rescuePlaneZ, this.time) }
  get saved() { return this.survivors.filter(s => s.state === 'saved').length }
  get lost() { return this.survivors.filter(s => s.state === 'lost').length }
  get carried() { return this.survivors.filter(s => s.state === 'carried') }
  get overDeck() { return Math.abs(this.clawX - R.deploy) <= R.deckWidth / 2 }
  get jammed() { return this.time < this.jamUntil }

  winchTargetAt(height: number) {
    const length = (this.altitude - height) / Math.cos(this.swing)
    return clamp((length - R.cableMin) / (R.cableMax - R.cableMin))
  }

  survivorY(s: Survivor, waveTime = this.time) {
    if (s.state === 'falling') return s.fallY
    if (s.state === 'saved') return this.deckY + 1.1
    return s.state === 'debris'
      ? waveHeight(rescueBoardX, rescuePlaneZ, waveTime) + 1.45
      : waveHeight(s.x, s.z, waveTime) + 0.75
  }

  grabbable(horizontal = R.grabX, vertical = R.grabY) {
    return this.survivors
      .filter(s => (s.state === 'floating' || s.state === 'debris')
        && Math.abs(this.clawX - s.x) <= horizontal && Math.abs(this.clawY - this.survivorY(s)) <= vertical)
      .sort((a, b) => Math.abs(this.clawX - a.x) - Math.abs(this.clawX - b.x))
  }

  tick(dt: number, intent: ControlIntent, assist: RescueAssists, timeScale = 1) {
    if (this.done) return
    const previousTime = this.time
    this.time += dt
    const step = dt * timeScale
    let target = intent.heliTargetX * R.span
    if (assist.aim && this.cable > 20 && !this.grip && !this.overDeck) {
      const near = this.survivors.find(s => (s.state === 'debris' || s.state === 'floating') && Math.abs(target - s.x) < 2.3)
      if (near) target = lerp(target, near.x, 0.33)
    }
    const previousVelocity = this.velocity
    const acceleration = R.spring ** 2 * (target - this.x)
      - (2 * R.damping * R.spring + 0.18) * this.velocity
    this.velocity = clamp(this.velocity + acceleration * step, -R.speed, R.speed)
    this.x = clamp(this.x + this.velocity * step, -R.span, R.span)
    this.acceleration = damp(this.acceleration, clamp((this.velocity - previousVelocity) / step, -20, 20), 4.8, step)
    const targetCable = lerp(R.cableMin, R.cableMax, intent.winchTarget)
    const previousCable = this.cable
    this.cable = approach(this.cable, targetCable, step * (targetCable > this.cable ? R.extend : R.retract))
    const damping = 0.75 + R.swingDamping + assist.stabilization * (Math.abs(previousCable - this.cable) < step ? 2.8 : 1.8)
    this.swingVelocity += (-this.swing * (9.81 / this.cable + 3) - this.swingVelocity * damping
      + clamp(-acceleration, -15, 15) * 0.012) * step
    this.swing = clamp(this.swing + this.swingVelocity * step, -0.13, 0.13)

    if (!this.practice) {
      for (const s of this.survivors) {
        if (s.state !== 'floating') continue
        waveHeight(s.waterAnchorX, s.z, this.time, this.swimmerSlope)
        const sway = clamp(-0.58 * this.swimmerSlope.x, -0.28, 0.28)
        s.x = clamp(s.waterAnchorX + sway, -R.span, R.span)
      }
    }

    if (intent.trackingState === 'ok' && !this.jammed) {
      const desired = assist.winchOnly
        ? (this.grip && !(this.overDeck && this.clawY - this.deckY <= R.safeHeight)) || this.grabbable().length > 0
        : intent.gripClosed
      this.updateGrip(desired, step)
    } else {
      this.gripTimer = 0
    }

    for (const s of this.survivors) {
      if (s.state === 'falling') {
        s.fallSpeed += 9.81 * step
        s.fallY -= s.fallSpeed * step
        if (s.fallY <= waveHeight(s.x, s.z, this.time) + 0.75) {
          s.state = 'floating'
          this.emit('WATER_SPLASH', { x: s.x })
        }
      }
    }

    if (!this.practice) {
      if (intent.trackingState === 'ok') this.updateThreat()
      const previousAge = previousTime - this.breachedAt
      const breachAge = this.time - this.breachedAt
      if (previousAge < 0 && breachAge >= 0) {
        this.emit('WATER_SPLASH', { x: boardBreachImpact.x, heavySplash: true })
      }
      if (this.time >= this.danglingAt) {
        const hanging = this.carried[0]
        if (hanging) this.emit('DANGLING', { id: hanging.id })
        this.danglingAt = Infinity
      }
    }
    if (this.saved + this.lost === this.survivors.length) {
      this.done = this.saved > 0 ? 'aboard' : 'all-lost'
    }
  }

  private updateGrip(desired: boolean, dt: number) {
    const target = desired ? 1 : 0
    this.gripProgress = approach(this.gripProgress, target, dt / R.gripSeconds)
    if (desired === this.grip) {
      this.gripTimer = 0
      return
    }
    this.gripTimer += dt
    if (this.gripTimer + 0.000001 < (desired ? R.gripSeconds : R.releaseSeconds)) return
    this.gripTimer = 0
    this.grip = desired
    this.emit(desired ? 'CLAW_CLOSED' : 'CLAW_OPENED', { x: this.clawX })
    if (desired) this.grab()
    else this.release()
  }

  private grab() {
    this.grabAttempts++
    const targets = this.grabbable().slice(0, R.capacity)
    if (targets.length === 0) return
    this.grabSuccesses++
    this.lastGrab = this.time
    this.warnedIdle = false
    this.danglingAt = this.time + 3.5
    for (const s of targets) {
      s.state = 'carried'
      this.emit('SURVIVOR_GRABBED', { id: s.id, x: s.x })
      if (s.targeted) {
        this.quickSaves++
        this.score += 100
        this.emit('QUICK_SAVE', { id: s.id, x: s.x, points: 100, text: 'QUICK SAVE' })
      }
    }
  }

  private release() {
    const carried = this.carried
    if (!carried.length) return
    const height = this.clawY - this.deckY
    const safe = height <= R.safeHeight
    for (const s of carried) {
      if (this.overDeck) {
        const points = 1000 + (safe ? 150 : height > R.injuredHeight ? -100 : 0)
        this.score += points
        if (!safe) this.hardDrops++
        s.state = 'saved'
        s.targeted = false
      } else {
        s.state = 'falling'
        s.x = s.waterAnchorX = clamp(this.clawX, -R.span, R.span)
        s.fallY = this.clawY
        s.fallSpeed = 0
        this.emit('WATER_DROP', { id: s.id, x: s.x, text: 'WATER DROP · RECOVER SURVIVOR' })
      }
    }
    if (this.overDeck) {
      const dual = carried.length === 2
      const points = carried.length * (1000 + (safe ? 150 : height > R.injuredHeight ? -100 : 0)) + (dual ? 200 : 0)
      if (dual) this.score += 200
      this.emit('SURVIVOR_DELIVERED', { id: carried[0].id, points, x: R.deploy,
        text: dual ? (safe ? 'MULTI-LIFT · SAFE LANDING' : 'MULTI-LIFT') : safe ? 'SAFE LANDING' : 'SURVIVOR ABOARD' })
    }
  }

  private updateThreat() {
    const active = this.survivors.filter(s => s.state === 'debris' || s.state === 'floating')
    const idle = this.time - this.lastGrab >= S.idleDelay
    const breached = this.time >= this.breachedAt
    this.threat = clamp(this.time / 180 * 0.8 + active.length / 8 * 0.2 + (breached ? 0.15 : 0))
    if (idle && !this.warnedIdle && active.length) {
      this.warnedIdle = true
      this.emit('IDLE_WARNING')
    } else if (this.time >= this.nextChatter && !idle && this.attacks.length === 0) {
      this.nextChatter += 14
      this.emit('IDLE_DEBRIS')
    }
    if (active.length && this.warningTime === Infinity && (this.time >= S.breachAt || this.saved >= S.breachCount)) {
      this.warningTime = this.time
      this.emit('MEGALODON_WARNING', { x: rescueBoardX, text: 'LARGE CONTACT · BRACE' })
    }
    if (!breached && this.time >= this.warningTime + S.warning) {
      this.breachedAt = this.time
      for (const s of this.survivors) if (s.state === 'debris') s.state = 'floating'
      this.emit('MEGALODON_BREACH', { x: rescueBoardX, text: 'MEGALODON BREACH' })
    }
    for (let index = this.attacks.length - 1; index >= 0; index--) {
      const attack = this.attacks[index]
      if (this.time >= attack.strike && !attack.announced) {
        const s = attack.target
        const reachable = Math.abs(s.x - this.x) <= 25 && this.clawY - this.survivorY(s) < 10.5
        if (!attack.delayed && reachable && active.includes(s)) {
          attack.delayed = true
          attack.strike += 0.8
          attack.end += 0.8
        } else {
          attack.announced = true
          if (s.state !== 'saved' && s.state !== 'lost') this.emit('SHARK_STRIKE', { id: s.id, x: s.x })
        }
      }
      if (this.time >= attack.end) {
        this.resolveAttack(attack.target)
        this.attacks.splice(index, 1)
      }
    }
    if (this.time < this.nextAttack || this.attacks.length >= (this.threat >= 0.6 ? 2 : 1)) return
    const candidates = active.filter(s => !s.targeted && (active.length === 1 || this.time - s.lastTarget >= S.repeat))
    const reachable = candidates.filter(s => Math.abs(this.x - s.x) < 31)
    const eligible = !idle && reachable.length ? reachable : candidates
    if (!eligible.length) return
    const weights = eligible.map(s => (s.state === 'floating' ? 5 : Math.abs(s.x - rescueBoardX) > 2 ? 2 : 0.65)
      * (0.7 + 0.3 / (1 + Math.abs(s.x + 30) / 20)))
    let choice = this.random() * weights.reduce((total, weight) => total + weight, 0)
    const choiceIndex = weights.findIndex(weight => (choice -= weight) <= 0)
    const s = eligible[Math.max(0, choiceIndex)]
    s.targeted = true
    s.lastTarget = this.time
    const telegraph = S.telegraph + (idle ? 0 : 6.4)
    this.attacks.push({ target: s, start: this.time, strike: this.time + telegraph,
      end: this.time + telegraph + S.strike, delayed: false, announced: false })
    this.nextAttack = this.time + lerp(S.earlyInterval, S.lateInterval, this.threat) * (idle ? 0.92 : 1)
    if (this.firstAttack) this.emit('SHARK_SPOTTED', { id: s.id, x: s.x })
    this.firstAttack = false
    this.emit('SHARK_TELEGRAPH', { id: s.id, x: s.x, text: 'SHARK APPROACHING' })
  }

  private resolveAttack(s: Survivor) {
    s.targeted = false
    const lowCarry = s.state === 'carried' && this.clawY - waveHeight(this.clawX, rescuePlaneZ, this.time) < 1.5
    const edge = s.state === 'debris' && Math.abs(s.x - rescueBoardX) > 2
    if (edge && this.random() < 0.5) {
      s.state = 'floating'
    } else if (s.state === 'floating' || lowCarry || edge) {
      s.state = 'lost'
      if (lowCarry) this.jamUntil = this.time + 1.5
      this.score -= 400
      this.emit('SURVIVOR_LOST', { id: s.id, x: s.x, points: -400, text: 'SURVIVOR LOST' })
    }
  }
}
