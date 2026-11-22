import { expect, it } from 'vitest'
import { neutralIntent } from '../src/input/intent'
import { pilotBot, replay } from '../src/game/replay'

it('evaluates 200 independent course and attack seeds', () => {
  const aggregate = { saved: 0, lost: 0, idleTerminated: 0, idleSeconds: 0, completions: 0, noviceSaved: 0 }
  for (let seed = 1; seed <= 200; seed++) {
    const pilot = replay(seed, pilotBot)
    const idle = replay(seed, () => neutralIntent)
    const novice = replay(seed, run => {
      const intent = pilotBot(run)
      if (run.phase !== 'rescue' || run.rescue.time % 16 < 13.2) return intent
      const rescue = run.rescue
      return { ...intent, heliTargetX: rescue.x / 80, winchTarget: rescue.winchTargetAt(rescue.clawY), gripClosed: rescue.grip }
    })
    aggregate.saved += pilot.rescue.saved
    aggregate.lost += pilot.rescue.lost
    aggregate.completions += Number(pilot.record?.outcome === 'completed')
    aggregate.idleTerminated += Number(idle.record?.outcome === 'failed_all_lost')
    aggregate.idleSeconds += idle.rescue.time
    aggregate.noviceSaved += novice.rescue.saved
  }
  console.info(JSON.stringify({
    competentMeanSaved: aggregate.saved / 200, competentMeanLost: aggregate.lost / 200,
    competentCompleted: aggregate.completions,
    idleFailed: aggregate.idleTerminated, idleMeanSeconds: aggregate.idleSeconds / 200,
    syntheticNoviceMeanSaved: aggregate.noviceSaved / 200,
  }))
  expect(aggregate.completions).toBe(200)
  expect(aggregate.lost / 200).toBeLessThanOrEqual(1)
  expect(aggregate.idleSeconds / 200).toBeGreaterThan(125)
  expect(aggregate.idleTerminated).toBe(200)
  expect(aggregate.idleSeconds / 200).toBeLessThan(160)
}, 18000)
