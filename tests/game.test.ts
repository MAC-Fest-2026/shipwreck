import { describe, expect, it } from 'vitest'
import { neutralIntent } from '../src/input/intent'
import { pilotBot, replay, defaultAssists } from '../src/game/replay'
import { scoreRun } from '../src/game/score'
import { Session } from '../src/game/session'
import { Rescue } from '../src/sim/rescue'
import { tuning } from '../src/app/tuning'
import { toCsv } from '../src/persistence/scores'

describe('complete run', () => {
  it('is deterministic and reaches the island with survivors', () => {
    const first = replay(tuning.seed, pilotBot).record!
    const repeat = replay(tuning.seed, pilotBot).record!
    expect(first?.outcome).toBe('completed')
    expect(first.survivors.saved).toBeGreaterThanOrEqual(5)
    expect(first.score).toBe(repeat.score)
    expect(first.time).toEqual(repeat.time)
    expect(toCsv([first])).toContain('"REPLAY"')
  })
  it('logs a terminal idle loss', () => {
    const run = replay(12, () => neutralIntent)
    expect(run.record?.outcome).toBe('failed_all_lost')
    expect(run.rescue.time).toBeLessThan(170)
  })
  it('holds active time during pauses and intro', () => {
    const run = new Session(4, 'CHECK', 'replay', defaultAssists, false, () => {})
    run.tick(4, neutralIntent)
    expect(run.activeTime).toBe(0)
    run.skip()
    run.skip()
    run.tick(0.1, neutralIntent)
    run.paused = true
    run.tick(60, neutralIntent)
    expect(run.activeTime).toBe(0.1)
  })
  it('rejects a single-frame open or close', () => {
    const r = new Rescue(0, () => {}, true)
    r.tick(tuning.tick, { ...neutralIntent, gripClosed: true }, defaultAssists)
    r.tick(tuning.tick, neutralIntent, defaultAssists)
    expect(r.grip).toBe(false)
    for (let i = 0; i < 30; i++) r.tick(tuning.tick, { ...neutralIntent, gripClosed: true }, defaultAssists)
    r.tick(tuning.tick, neutralIntent, defaultAssists)
    expect(r.grip).toBe(true)
  })
  it('computes time and integrity points only in eligible outcomes', () => {
    expect(scoreRun(8000, 125, 95, 75, true, 'completed')).toBe(10790)
    expect(scoreRun(-3200, 150, 0, 100, false, 'failed_all_lost')).toBe(0)
  })
})
