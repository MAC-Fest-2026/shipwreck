import { tuning } from '../app/tuning'
import { neutralIntent, type ControlIntent } from '../input/intent'
import type { BoatThrottle } from '../input/keyboard'
import { Boat } from '../sim/boat'
import { maxSurvivors, normalizeSurvivorCount, Rescue } from '../sim/rescue'
import type { Emit, GameEvent } from './events'
import { rankFor, scoreRun, type InputMode, type Outcome, type RunRecord } from './score'

export type ScenePhase = 'school' | 'intro' | 'arrival' | 'rescue' | 'handoff' | 'boat' | 'outro' | 'results'
export type SessionOptions = { aim: boolean; steering: boolean; stabilization: number; winchOnly: boolean; boatThrottle?: BoatThrottle }
export const timelines = {
  intro: { duration: 18, next: 'arrival' },
  arrival: { duration: 8, next: 'rescue' },
  handoff: { duration: 8, next: 'boat' },
  outro: { duration: 12, next: 'results' },
} as const
type Cinematic = keyof typeof timelines
export const isCinematic = (phase: ScenePhase): phase is Cinematic => Object.hasOwn(timelines, phase)

export class Session {
  phase: ScenePhase
  elapsed = 0
  rescue: Rescue
  boat: Boat
  record: RunRecord | null = null
  assist: SessionOptions
  paused = false
  autoStop = false
  outcome: Outcome = 'completed'
  readonly events: GameEvent[] = []
  readonly startedAt = new Date().toISOString()
  readonly id = globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(36)
  schoolSteps = 0
  desired = neutralIntent
  private cuePlayed = false
  private slowUntil = -Infinity
  private readonly survivorCount: number

  constructor(
    readonly seed: number,
    readonly callsign: string,
    public inputMode: InputMode,
    options: SessionOptions,
    school: boolean,
    private readonly eventListener: (e: GameEvent) => void,
    survivorCount: number = maxSurvivors,
  ) {
    this.assist = { ...options }
    this.survivorCount = normalizeSurvivorCount(survivorCount)
    this.phase = school ? 'school' : 'intro'
    this.rescue = new Rescue(seed, school ? () => {} : this.emit, school, this.survivorCount)
    this.boat = new Boat(seed, this.emit)
  }

  get activeTime() { return (this.rescue.practice ? 0 : this.rescue.time) + this.boat.time }
  get timeScale() { return this.rescue.time < this.slowUntil ? 0.46 : 1 }
  get currentScore() { return this.record?.score ?? Math.max(0, this.rescue.score) }

  private emit: Emit = (type, data) => {
    const event = { type, t: Math.round(this.activeTime * 1000), ...data }
    this.events.push(event)
    if (type === 'QUICK_SAVE') this.slowUntil = this.rescue.time + 0.6
    this.eventListener(event)
  }

  tick(dt: number, input: ControlIntent) {
    if (this.paused || this.autoStop || this.phase === 'results') return
    this.desired = input
    this.elapsed += dt
    if (isCinematic(this.phase)) {
      this.trackCues()
      if (this.elapsed >= timelines[this.phase].duration) this.skip()
    } else if (this.phase === 'rescue' || this.phase === 'school') {
      const safe = input.trackingState === 'degraded' ? {
        ...input, heliTargetX: this.rescue.x / tuning.rescue.span,
        winchTarget: (this.rescue.cable - tuning.rescue.cableMin) / (tuning.rescue.cableMax - tuning.rescue.cableMin),
      } : input
      this.rescue.tick(dt, safe, this.assist, this.timeScale)
      if (this.phase === 'school') {
        const r = this.rescue
        if (this.schoolSteps === 0 && Math.abs(r.x + 12) > 4) this.schoolSteps++
        if (this.schoolSteps === 1 && r.cable > 20) this.schoolSteps++
        if (r.grabSuccesses) this.schoolSteps = Math.max(3, this.schoolSteps)
        if (r.done) { this.schoolSteps = 4; this.skip() }
      } else if (this.rescue.done === 'aboard') {
        this.enter('handoff')
      } else if (this.rescue.done === 'all-lost') {
        this.finish('failed_all_lost')
      }
    } else if (this.phase === 'boat') {
      this.boat.tick(dt, input.trackingState === 'degraded' ? { ...input, steer: 0, throttle: 0.4 } : input,
        this.assist.steering, this.inputMode === 'keyboardMouse' && this.assist.boatThrottle === 'hold')
      if (this.boat.done === 'landed') this.enter('outro')
      if (this.boat.done === 'destroyed') this.finish('failed_boat_destroyed')
    }
  }

  skip() {
    if (this.phase === 'school') {
      this.rescue = new Rescue(this.seed, this.emit, false, this.survivorCount)
      this.enter('intro')
    } else if (isCinematic(this.phase)) {
      const next = timelines[this.phase].next
      if (next === 'results') this.finish('completed')
      else this.enter(next)
    }
  }

  private trackCues() {
    if (this.cuePlayed || this.elapsed < 0.95) return
    this.cuePlayed = true
    if (this.phase === 'arrival') this.emit('APPROACH')
  }

  private enter(phase: ScenePhase) {
    this.phase = phase
    this.elapsed = 0
    this.cuePlayed = false
    if (phase === 'rescue') this.emit('HANDOVER')
    if (phase === 'handoff') this.emit('ALL_ABOARD')
  }

  finish(outcome: Outcome) {
    if (this.record) return this.record
    const { rescue, boat } = this
    this.outcome = outcome
    const score = scoreRun(rescue.score, rescue.time, boat.time, boat.hull, boat.smooth, outcome)
    const rescueMs = Math.round((rescue.practice ? 0 : rescue.time) * 1000)
    const boatMs = Math.round(boat.time * 1000)
    this.record = {
      runId: this.id, player: { id: this.callsign.toLowerCase(), callsign: this.callsign },
      startedAt: this.startedAt, outcome, score, rank: rankFor(score),
      time: { rescueMs, boatMs, totalActiveMs: rescueMs + boatMs },
      survivors: { total: rescue.practice ? this.survivorCount : rescue.survivors.length,
        saved: rescue.practice ? 0 : rescue.saved, lost: rescue.practice ? 0 : rescue.lost,
        perSurvivor: rescue.practice ? {} : Object.fromEntries(rescue.survivors.map(s => [s.id, s.state])) },
      stats: { grabAttempts: rescue.grabAttempts, grabSuccesses: rescue.grabSuccesses, quickSaves: rescue.quickSaves,
        hardDrops: rescue.hardDrops, hullRemaining: boat.hull, collisions: boat.collisions },
      settings: { inputMode: this.inputMode, leftHandMode: this.assist.winchOnly ? 'winchOnly' : 'dual',
        assists: { aim: this.assist.aim, steering: this.assist.steering, stabilization: this.assist.stabilization } },
      seed: this.seed, buildVersion: '1.0.0', events: this.events.slice(),
    }
    this.enter('results')
    return this.record
  }
}
