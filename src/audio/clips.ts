import bundledFiles from 'virtual:shipwreck-audio'

const base = import.meta.env.BASE_URL

export type DialogueEmotion = 'steady' | 'hope' | 'urgent' | 'panic' | 'relief' | 'grief'

const deliveries = {
  steady: { rate: 1, presence: 0 },
  hope: { rate: 1.018, presence: 0.45 },
  urgent: { rate: 1.05, presence: 1.55 },
  panic: { rate: 1.085, presence: 2.5 },
  relief: { rate: 0.958, presence: -0.85 },
  grief: { rate: 0.965, presence: -0.65 },
} satisfies Record<DialogueEmotion, { rate: number; presence: number }>

export function dialogueDelivery(emotion: DialogueEmotion = 'steady', overRadio = false) {
  const { rate, presence } = deliveries[emotion] ?? deliveries.steady
  const range = overRadio ? 0.44 : 1
  return { rate: 1 + (rate - 1) * range, presence: presence * range }
}

export class AudioClips {
  private readonly files = new Map<string, Promise<AudioBuffer | null>>()
  private readonly overrides = new Map<string, Promise<AudioBuffer | null>>()
  private readonly decoded = new Map<string, AudioBuffer>()
  private readonly inventory = import.meta.env.DEV
    ? fetch('/__shipwreck_audio').then(response => response.json() as Promise<string[]>)
      .then(files => new Set(files)).catch(() => new Set(bundledFiles))
    : Promise.resolve(new Set(bundledFiles))

  constructor(private readonly context: AudioContext) {}

  override(slug: string) {
    let clip = this.overrides.get(slug)
    if (!clip) {
      clip = this.loadOverride(slug).then(buffer => {
        if (buffer) this.decoded.set(slug, buffer)
        return buffer
      })
      this.overrides.set(slug, clip)
    }
    return clip
  }

  readyOverride(slug: string) { return this.decoded.get(slug) }

  private async loadOverride(slug: string) {
    const files = await this.inventory
    for (const extension of ['mp3', 'wav', 'ogg']) {
      const name = slug + '.' + extension
      if (!files.has(name)) continue
      const buffer = await this.load('audio/' + name)
      if (buffer) return buffer
    }
    return null
  }

  load(path: string) {
    let clip = this.files.get(path)
    if (!clip) {
      clip = this.decode(path)
      this.files.set(path, clip)
    }
    return clip
  }

  private async decode(path: string) {
    const request = new AbortController()
    const abort = () => request.abort()
    let timeout = setTimeout(abort, 1500)
    try {
      const response = await fetch(base + path, { signal: request.signal, headers: { Accept: 'audio/*, application/octet-stream' } })
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) return null
      // Keep extension probes short and give larger recordings more time to transfer.
      if (Number(response.headers.get('content-length')) > 1024 * 1024) {
        clearTimeout(timeout)
        timeout = setTimeout(abort, 15_000)
      }
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
      return buffer.duration > 0 ? buffer : null
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function gainTo(audio: AudioContext, output: AudioNode, level: number) {
  const gain = audio.createGain()
  gain.gain.value = level
  gain.connect(output)
  return gain
}

export function bufferTo(audio: AudioContext, output: AudioNode, buffer: AudioBuffer) {
  const source = audio.createBufferSource()
  source.buffer = buffer
  source.connect(output)
  source.addEventListener('ended', () => source.disconnect(), { once: true })
  return source
}
