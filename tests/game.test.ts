import { describe, expect, it } from 'vitest'
import { neutralIntent } from '../src/input/intent'
import { pilotBot, replay, defaultAssists } from '../src/game/replay'
import { scoreRun } from '../src/game/score'
import { Session } from '../src/game/session'
import { Boat, boatLungePosition, boatLungeTiming, boatSharkLength, planBoatLunge, reefContact, rockProfiles, type ReefHazard } from '../src/sim/boat'
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
  it('keeps all variants, attaches the small stones and leaves a winding lane', () => {
    for (const seed of [1, 2, 81, tuning.seed]) {
      const boat = new Boat(seed, () => {})
      const rocks = boat.hazards.filter(h => h.type === 'reef').filter(h => !h.island)
      const bodies = rocks.filter(h => !h.variant.startsWith('Stone_'))
      expect(new Set(rocks.map(h => h.variant))).toEqual(new Set(Object.keys(rockProfiles)))
      expect(new Set(rocks.map(h => `${h.x},${h.z}`)).size).toBe(rocks.length)
      for (const stone of rocks.filter(h => h.variant.startsWith('Stone_'))) {
        expect(stone.profile[2]).toBeGreaterThan(rockProfiles[stone.variant][2])
        expect(bodies.some(body => {
          for (let i = 1; i < 20; i++) {
            const x = stone.x + (body.x - stone.x) * i / 20, z = stone.z + (body.z - stone.z) * i / 20
            if (reefContact(stone, x, z, 0) && reefContact(body, x, z, 0)) return true
          }
          return false
        })).toBe(true)
      }
      for (let z = 350; z <= 890; z += 2) {
        const x = boat.reefRouteX(z)
        expect(rocks.some(h => reefContact(h, x, z, 7.5))).toBe(false)
      }
      expect(boat.reefRouteX(408) * boat.reefRouteX(537)).toBeLessThan(0)
      expect(rocks.some(h => !h.variant.startsWith('Stone_') && Math.abs(h.x) < 5)).toBe(true)
    }
  })

  it('rotates an elongated reef hitbox with the displayed rock', () => {
    const reef: ReefHazard = { type: 'reef', variant: 'Reef_04', x: 12, z: 400, length: 10,
      radius: rockProfiles.Reef_04[3] * 10, yaw: 0, hit: false, island: false, profile: rockProfiles.Reef_04 }
    expect(reefContact(reef, 8.4, 400, 0)).toBe(true)
    expect(reefContact(reef, 12, 403.6, 0)).toBe(false)
    reef.yaw = Math.PI / 2
    expect(reefContact(reef, 8.4, 400, 0)).toBe(false)
    expect(reefContact(reef, 12, 396.4, 0)).toBe(true)
  })

  it('avoids a reef with the whole shark even when the straight lunge would cross it', () => {
    const profile = rockProfiles.Boulder_02
    const rock: ReefHazard = { type: 'reef', variant: 'Boulder_02', x: -16, z: 79, radius: profile[3] * 7,
      length: 7, yaw: .31, hit: true, island: false, profile }
    const straight = { x: 0, targetZ: 72, vx: 8, vz: -3.5 }
    const original = boatLungePosition(straight, 1.1)
    expect(reefContact(rock, original.x, original.z, 0)).toBe(true)
    const detour = planBoatLunge(straight, [rock])
    expect(detour?.curve).toBeDefined()
    for (let i = 0; i <= 200; i++) {
      const { x, z, vx, vz } = boatLungePosition(detour!, i * boatLungeTiming.end / 200)
      const speed = Math.hypot(vx, vz)
      for (let j = 0; j <= 12; j++) {
        const back = j * boatSharkLength / 12
        expect(reefContact(rock, x - vx / speed * back, z - vz / speed * back, 5.4)).toBe(false)
      }
    }
  })
})
