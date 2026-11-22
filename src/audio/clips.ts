const base = import.meta.env.BASE_URL

export class AudioClips {
  private readonly files = new Map<string, Promise<AudioBuffer | null>>()
  private readonly overrides = new Map<string, Promise<AudioBuffer | null>>()

  constructor(private readonly context: AudioContext) {}

  override(slug: string) {
    let clip = this.overrides.get(slug)
    if (!clip) {
      clip = this.loadOverride(slug)
      this.overrides.set(slug, clip)
    }
    return clip
  }

  private async loadOverride(slug: string) {
    for (const extension of ['mp3', 'ogg', 'wav']) {
      const buffer = await this.load('audio/' + slug + '.' + extension)
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
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(1500), headers: { Accept: 'audio/*, application/octet-stream' } })
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) return null
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
      return buffer.duration > 0 ? buffer : null
    } catch {
      return null
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
