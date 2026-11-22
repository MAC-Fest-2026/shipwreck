import { tuning } from '../app/tuning'
import { clamp } from '../core/math'
import { neutralIntent, type ControlIntent } from '../input/intent'
import { boatLungePosition, boatLungeTiming } from '../sim/boat'
import { Session } from './session'

export const defaultAssists = { aim: true, steering: true, stabilization: 0.35, winchOnly: false }

export function pilotBot(run: Session): ControlIntent {
  const r = run.rescue
  const b = run.boat
  if (run.phase === 'rescue' || run.phase === 'school') {
    const span = tuning.rescue.span
    if (r.carried.length) {
      const over = r.overDeck && Math.abs(r.x - 52) < 2.2 && Math.abs(r.velocity) < 3
      return { ...neutralIntent, heliTargetX: 52 / span, winchTarget: r.winchTargetAt(over ? r.deckY + 1.1 : 5.6),
        gripClosed: !(over && r.clawY - r.deckY < 1.85) }
    }
    const waiting = r.survivors.filter(s => s.state === 'floating' || s.state === 'debris')
    const xTarget = waiting.find(s => s.targeted && Math.abs(s.x - r.x) < 27)
      ?? waiting.find(s => s.id === 'jay') ?? waiting.find(s => s.id === 'tommy')
      ?? waiting.find(s => s.id === 'hollis') ?? waiting[0]
    if (!xTarget) return neutralIntent
    const partner = waiting.find(s => s !== xTarget && Math.abs(s.x - xTarget.x) < 1.8)
    const target = partner ? (xTarget.x + partner.x) / 2 : xTarget.x
    // Hold a settled position throughout the closing animation.
    const near = Math.abs(r.clawX - target) < (partner ? 0.34 : 0.74)
      && r.grabbable().includes(xTarget) && Math.abs(r.velocity) < 1.25
    return { ...neutralIntent, heliTargetX: target / span, winchTarget: r.winchTargetAt(r.survivorY(xTarget)), gripClosed: near }
  }
  if (run.phase === 'boat') {
    const warning = b.lunges.find(l => l.time >= 0 && !l.ended)
    const route = b.reefRouteX(b.z + 18)
    const strikeX = warning ? boatLungePosition(warning, boatLungeTiming.strike).x : route
    const x = warning ? route + (route < strikeX ? -1 : 1) * (Math.abs(route) > 5 ? 6.25 : 8) : route
    return { ...neutralIntent, steer: clamp((x - b.x) * 0.09 - b.heading * 1.65, -1, 1),
      throttle: b.z > 875 ? 0 : 0.69 }
  }
  return neutralIntent
}

export function replay(seed: number, choose: (run: Session) => ControlIntent, maxSteps = 60 * 280) {
  const run = new Session(seed, 'REPLAY', 'replay', defaultAssists, false, () => {})
  for (let tick = 0; tick < maxSteps && !run.record; tick++) {
    if (run.phase === 'intro' || run.phase === 'arrival' || run.phase === 'handoff' || run.phase === 'outro') run.skip()
    else run.tick(tuning.tick, choose(run))
  }
  return run
}
