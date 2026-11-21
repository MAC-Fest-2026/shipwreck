import { describe, expect, it } from 'vitest'
import { neutralIntent } from '../src/input/intent'
import { pilotBot, replay, defaultAssists } from '../src/game/replay'
import { scoreRun } from '../src/game/score'
import { Session } from '../src/game/session'
import { Boat, reefContact, rockProfiles, type ReefHazard } from '../src/sim/boat'
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
  it.each([1, 2])('sends a %i-survivor mission from flight school to the boat', count => {
    const run = new Session(tuning.seed, 'CHECK', 'keyboardMouse', defaultAssists, true, () => {}, count)
    expect(run.rescue.survivors.map(s => s.id)).toEqual(['buoy'])
    run.skip()
    expect(run.rescue.survivors).toHaveLength(count)
    expect(run.rescue.survivors.every(s => s.state === 'debris')).toBe(true)
    run.skip()
    run.skip()
    for (let i = 0; i < 60 * 45 && run.phase === 'rescue'; i++) run.tick(tuning.tick, pilotBot(run))
    expect(run.phase).toBe('handoff')
    run.skip()
    expect(run.phase).toBe('boat')
    expect(run.finish('abandoned').survivors).toMatchObject({ total: count, saved: count, lost: 0 })
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

describe('ocean rocks', () => {
  it('places each variant once or more with a clear central lane', () => {
    for (const seed of [1, 2, 81, tuning.seed]) {
      const rocks = new Boat(seed, () => {}).hazards.filter(h => h.type === 'reef').filter(h => !h.island)
      expect(new Set(rocks.map(h => h.variant))).toEqual(new Set(Object.keys(rockProfiles)))
      expect(new Set(rocks.map(h => `${h.x},${h.z}`)).size).toBe(rocks.length)
      expect(Math.min(...rocks.map(h => Math.abs(h.x) - h.radius - 1.1))).toBeGreaterThan(8)
    }
  })

  it('rotates an elongated reef hitbox with the displayed rock', () => {
    const reef: ReefHazard = { type: 'reef', variant: 'Reef_04', x: 12, z: 400, length: 10,
      radius: rockProfiles.Reef_04[3] * 10, yaw: 0, hit: false, island: false }
    expect(reefContact(reef, 8.4, 400, 0)).toBe(true)
    expect(reefContact(reef, 12, 403.6, 0)).toBe(false)
    reef.yaw = Math.PI / 2
    expect(reefContact(reef, 8.4, 400, 0)).toBe(false)
    expect(reefContact(reef, 12, 396.4, 0)).toBe(true)
  })
})
