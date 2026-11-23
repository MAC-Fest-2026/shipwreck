import type { SoundSettings } from '../audio/radio'
import type { SessionOptions } from '../game/session'
import type { RenderSettings } from '../render/renderer'
import type { BoatThrottle } from '../input/keyboard'
import { maxSurvivors, normalizeSurvivorCount } from '../sim/rescue'
import { normalizeWaveIntensity, waveIntensity } from '../sim/water'

export type Settings = SoundSettings & RenderSettings & SessionOptions & {
  preview: boolean
  captions: boolean
  captionLarge: boolean
  captionPlate: boolean
  contrast: boolean
  survivorCount: number
  waveIntensity: number
  boatThrottle: BoatThrottle
}
const initial: Settings = {
  preview: true, captions: true, captionLarge: false, captionPlate: true, contrast: false,
  master: 0.62, music: 0.42, effects: 0.70, voice: 0.75, spoken: true, muted: false,
  quality: 'medium', reduceMotion: false, flashes: false,
  aim: true, steering: true, stabilization: 0.35, winchOnly: false, survivorCount: maxSurvivors,
  waveIntensity: waveIntensity.default,
  boatThrottle: 'hold',
}
export function readSettings(): Settings {
  try {
    const current = JSON.parse(localStorage.getItem('shipwreck-settings-v1') ?? '{}')
    const settings = { ...initial, ...current } as Settings
    return { ...settings, survivorCount: normalizeSurvivorCount(settings.survivorCount),
      waveIntensity: normalizeWaveIntensity(settings.waveIntensity), boatThrottle: settings.boatThrottle === 'sticky' ? 'sticky' : 'hold' }
  } catch { return { ...initial } }
}
