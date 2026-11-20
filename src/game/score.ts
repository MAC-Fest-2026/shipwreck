import { tuning } from '../app/tuning'
import type { GameEvent } from './events'

export type Outcome = 'completed' | 'failed_all_lost' | 'failed_boat_destroyed' | 'abandoned'
export type InputMode = 'hands' | 'keyboardMouse' | 'replay'
export const rankFor = (score: number) => score >= 12000 ? 'S' : score >= 9500 ? 'A' : score >= 7000 ? 'B' : score >= 4000 ? 'C' : 'D'

export function scoreRun(rescuePoints: number, rescueSec: number, boatSec: number, hull: number, smooth: boolean, outcome: Outcome) {
  const boatBonus = outcome === 'completed'
    ? 1500 + hull * 10 + (smooth ? 300 : 0) + Math.max(0, tuning.boat.par - boatSec) * 8
    : 0
  const rescueBonus = outcome === 'completed' || outcome === 'failed_boat_destroyed'
    ? Math.max(0, tuning.rescue.par - rescueSec) * 8 : 0
  return Math.max(0, Math.round(rescuePoints + rescueBonus + boatBonus))
}

export interface RunRecord {
  runId: string
  player: { id: string; callsign: string }
  startedAt: string
  outcome: Outcome
  score: number
  rank: ReturnType<typeof rankFor>
  time: { totalActiveMs: number; rescueMs: number; boatMs: number }
  survivors: { total: number; saved: number; lost: number; perSurvivor: Record<string, string> }
  stats: { grabAttempts: number; grabSuccesses: number; quickSaves: number; hardDrops: number; hullRemaining: number; collisions: number }
  settings: { assists: { stabilization: number; aim: boolean; steering: boolean }; inputMode: InputMode; leftHandMode: 'dual' | 'winchOnly' }
  seed: number
  buildVersion: string
  events: GameEvent[]
}
