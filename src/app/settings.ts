import type { SoundSettings } from '../audio/radio'
import type { SessionOptions } from '../game/session'
import type { RenderSettings } from '../render/renderer'

export type Settings = SoundSettings & RenderSettings & SessionOptions & {
  preview: boolean
  captions: boolean
  captionLarge: boolean
  captionPlate: boolean
  contrast: boolean
}
const initial: Settings = {
  preview: true, captions: true, captionLarge: false, captionPlate: true, contrast: false,
  master: 0.62, music: 0.42, effects: 0.70, voice: 0.75, spoken: true,
  quality: 'medium', reduceMotion: false, flashes: false,
  aim: true, steering: true, stabilization: 0.35, winchOnly: false,
}
export function readSettings() {
  try {
    const current = JSON.parse(localStorage.getItem('shipwreck-settings-v1') ?? '{}')
    return { ...initial, ...current } as Settings
  } catch { return { ...initial } }
}
