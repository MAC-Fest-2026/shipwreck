import { describe, expect, it } from 'vitest'
import { neutralIntent } from '../src/input/intent'
import { pilotBot, replay, defaultAssists } from '../src/game/replay'
import { scoreRun } from '../src/game/score'
import { Session } from '../src/game/session'
import { Boat, boatLungePosition, boatLungeTiming, boatSharkLength, boatSharkPose, harbor, harborContact,
  planBoatLunge, reefContact, rockProfiles, sharkChaseEnd, type ReefHazard } from '../src/sim/boat'
import { Rescue, rescueBoardX, rescuePlaneZ } from '../src/sim/rescue'
import { setWaveIntensity, waveHeight, waveIntensity, waveUniforms } from '../src/sim/water'
import type { GameEvent } from '../src/game/events'
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
    expect(first.events.filter(event => event.type === 'LUNGE_WARNING')).toHaveLength(8)
    expect(first.events.filter(event => event.boatSplash?.shark === 'megalodon').map(event => event.boatSplash?.stage))
      .toEqual(['breach', 'reentry', 'breach', 'reentry', 'breach'])
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
  it('can winch a swimmer out of a deep trough at maximum wave intensity', () => {
    const previous = waveUniforms.waveIntensity.value
    setWaveIntensity(waveIntensity.max)
    try {
      const rescue = new Rescue(tuning.seed, () => {})
      // Find a trough well below the pickup range of the original 25-unit cable.
      const times = Array.from({ length: 2400 }, (_, step) => step * tuning.tick)
      const trough = rescue.survivors.filter(person => person.state === 'floating')
        .map(swimmer => ({ swimmer, time: times.find(time => rescue.survivorY(swimmer, time + tuning.rescue.gripSeconds) < -1.1) }))
        .find(sample => sample.time !== undefined)
      if (trough?.time === undefined) throw new Error('No swimmer reached a deep trough.')
      const { swimmer } = trough
      rescue.time = trough.time
      rescue.x = swimmer.x
      rescue.cable = tuning.rescue.cableMax
      for (let i = 0; i < 30 && swimmer.state !== 'carried'; i++) {
        rescue.tick(tuning.tick, { ...neutralIntent, heliTargetX: swimmer.x / tuning.rescue.span,
          winchTarget: rescue.winchTargetAt(rescue.survivorY(swimmer)), gripClosed: true }, { ...defaultAssists, aim: false })
      }
      expect(rescue.carried).toContain(swimmer)
      expect(rescue.cable).toBeGreaterThan(25)
    } finally {
      setWaveIntensity(previous)
    }
  })
  it('keeps swimmers on the winch plane and reachable from both ends of the board', () => {
    const rescue = new Rescue(tuning.seed, () => {})
    const swimmers = rescue.survivors.filter(person => person.state === 'floating')
    expect(swimmers.filter(person => person.x < rescueBoardX - 6)).toHaveLength(2)
    expect(swimmers.filter(person => person.x > rescueBoardX + 6)).toHaveLength(3)
    const startX = new Map(swimmers.map(person => [person.id, person.x]))
    for (let i = 0; i < 240; i++) rescue.tick(tuning.tick, neutralIntent, defaultAssists)
    expect(swimmers.some(person => person.x !== startX.get(person.id))).toBe(true)
    for (const swimmer of swimmers) expect(Math.abs(swimmer.x - startX.get(swimmer.id)!)).toBeLessThanOrEqual(0.281)
    for (const person of rescue.survivors) {
      expect(person.z).toBe(rescuePlaneZ)
      expect(Math.abs(person.x)).toBeLessThan(tuning.rescue.span)
      rescue.x = person.x
      rescue.cable = tuning.rescue.cableMin
        + (tuning.rescue.cableMax - tuning.rescue.cableMin) * rescue.winchTargetAt(rescue.survivorY(person))
      expect(rescue.grabbable()).toContain(person)
    }
  })
  it('computes time and integrity points only in eligible outcomes', () => {
    expect(scoreRun(8000, 125, 95, 75, true, 'completed')).toBe(10790)
    expect(scoreRun(-3200, 150, 0, 100, false, 'failed_all_lost')).toBe(0)
  })
})

describe('boat flank attacks', () => {
  it('breaks off an active lunge when the boat enters the safe approach', () => {
    const events: Omit<GameEvent, 't'>[] = []
    const boat = new Boat(tuning.seed, (type, data) => events.push({ type, ...data }))
    const attack = boat.lunges.at(-1)!
    for (const other of boat.lunges) if (other !== attack) other.ended = true
    boat.z = attack.courseZ - 44
    boat.speed = tuning.boat.speed
    const input = { ...neutralIntent, throttle: 1 }
    boat.tick(tuning.tick, input, false)
    expect(attack.time).toBeGreaterThan(0)
    boat.z = sharkChaseEnd
    for (let i = 0; i < 240; i++) boat.tick(tuning.tick, input, false)
    expect(attack.retreatAt).toBeDefined()
    expect(events.some(event => event.type === 'LUNGE' || !!event.boatSplash)).toBe(false)
  })

  it('reaches a slower open-water idle for hold-to-accelerate', () => {
    const hold = new Boat(tuning.seed, () => {})
    const sticky = new Boat(tuning.seed, () => {})
    hold.speed = sticky.speed = 12
    for (let i = 0; i < 180; i++) {
      const idle = { ...neutralIntent, throttle: 0 }
      hold.tick(tuning.tick, idle, false, true)
      sticky.tick(tuning.tick, idle, false, false)
    }
    expect(hold.speed).toBeCloseTo(2.4)
    expect(sticky.speed).toBeCloseTo(tuning.boat.speed * tuning.boat.throttleFloor)
  })

  it.each([-1, 1] as const)('can dodge the regular shark from side %s after the warning', side => {
    function sail(dodge: boolean) {
      const events: Omit<GameEvent, 't'>[] = []
      const boat = new Boat(tuning.seed, (type, data) => events.push({ type, ...data }))
      const attack = boat.lunges.find(lunge => lunge.shark === 'regularShark' && lunge.side === side)!
      for (const other of boat.lunges) if (other !== attack) other.ended = true
      boat.z = attack.courseZ - 44 - 0.1
      boat.speed = tuning.boat.speed * 0.69
      boat.tick(tuning.tick, { ...neutralIntent, throttle: 0.69 }, false)
      const spawn = boatLungePosition(attack, 0)
      expect(spawn.x * side).toBeGreaterThan(12)
      expect(spawn.z - boat.z).toBeGreaterThan(25)
      for (let i = 0; i < 60 * 5; i++) {
        boat.tick(tuning.tick, { ...neutralIntent, throttle: 0.69, steer: dodge && i > 50 ? -side * 0.52 : 0 }, false)
      }
      const peak = boatSharkPose(attack, attack.time + boatLungeTiming.apex)
      expect(peak.y - waveHeight(peak.x, peak.z, attack.time + boatLungeTiming.apex)).toBeGreaterThan(1.5)
      const splashes = events.filter(event => event.type === 'WATER_SPLASH')
      expect(splashes.map(event => event.boatSplash?.stage)).toEqual(['breach', 'reentry'])
      expect(splashes.every(event => event.heavySplash && (event.boatSplash?.z ?? 0) < -80)).toBe(true)
      return events.filter(event => event.type === 'BOAT_COLLISION' && event.impact === 'shark').length
    }
    expect(sail(false)).toBe(1)
    expect(sail(true)).toBe(0)
  })
})

describe('destination harbor', () => {
  it.each([10.5, 25])('blocks the boat at the pier from x=%s and lets it steer clear', pierX => {
    const boat = new Boat(tuning.seed, () => {})
    boat.x = pierX
    boat.z = harbor.pier.minZ - 7
    boat.speed = 12
    for (let i = 0; i < 120; i++) boat.tick(tuning.tick, { ...neutralIntent, throttle: 1 }, false)
    expect(boat.z).toBeLessThan(harbor.pier.minZ - 4.9)
    expect(boat.z).toBeGreaterThan(harbor.pier.minZ - 6)
    expect(boat.done).toBeNull()
    const stoppedX = boat.x
    for (let i = 0; i < 120; i++) {
      boat.tick(tuning.tick, { ...neutralIntent, steer: -1 }, false)
      expect(harborContact(boat.x, boat.z, boat.heading)).toBe(false)
    }
    expect(boat.x).toBeLessThan(stoppedX - 0.15)
  })

  it('keeps the hull off the shore even when tracking is degraded', () => {
    const boat = new Boat(tuning.seed, () => {})
    boat.x = 0
    boat.z = tuning.boat.length + 1
    boat.speed = 10
    expect(harborContact(boat.x, boat.z, boat.heading)).toBe(false)
    expect(harborContact(boat.x, tuning.boat.length + 10, boat.heading)).toBe(true)
    for (let i = 0; i < 240; i++) {
      boat.tick(tuning.tick, { ...neutralIntent, trackingState: 'degraded' }, false)
      expect(harborContact(boat.x, boat.z, boat.heading)).toBe(false)
    }
    expect(boat.z).toBeGreaterThan(tuning.boat.length + 2)
    expect(boat.z).toBeLessThan(tuning.boat.length + 9)
  })

  it('finishes inside the left berth and keeps clear water outside it playable', () => {
    const eventTypes: string[] = []
    const boat = new Boat(tuning.seed, type => eventTypes.push(type))
    boat.x = harbor.mooring.helmX
    boat.z = tuning.boat.length - 0.05
    boat.speed = 2.4
    for (let i = 0; i < 4; i++) boat.tick(tuning.tick, { ...neutralIntent, throttle: 0 }, false)
    expect(boat.done).toBe('landed')
    expect(boat.smooth).toBe(true)
    expect(eventTypes.filter(type => type === 'LANDED')).toHaveLength(1)
    const outside = new Boat(tuning.seed, () => {})
    outside.x = harbor.mooring.minX - 2
    outside.z = tuning.boat.length
    outside.tick(tuning.tick, { ...neutralIntent, throttle: 0 }, false)
    expect(outside.done).toBeNull()
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
