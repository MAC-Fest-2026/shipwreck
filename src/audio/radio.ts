import { clamp, seededRandom } from '../core/math'
import type { GameEvent, EventType } from '../game/events'

const names: Record<string, string> = {
  reyes: 'Pilot Reyes', oduya: 'Captain Oduya', mara: 'Mara Voss', elias: 'Elias Rook', dev: 'Dev Kapoor',
  ana: 'Ana Kapoor', priya: 'Priya Nair', jay: 'Jay Okafor', tommy: 'Tommy Ricci', hollis: 'Hollis Brandt',
}
interface Line {
  id: string; speaker: string; text: string; priority: number; cooldownMs: number; maxPlays: number; audio?: string
  trigger: { event: EventType }
}
export type Subtitle = { name: string; text: string; end: number; priority: number }
export type SoundSettings = { master: number; music: number; effects: number; voice: number; spoken: boolean }
const base = import.meta.env.BASE_URL

export class Radio {
  private audio?: AudioContext
  private master?: GainNode
  private music?: GainNode
  private effects?: GainNode
  private voiceBus?: GainNode
  private voiceSource?: AudioBufferSourceNode
  private requestVoice?: AbortController
  private ambience?: GainNode
  private rumble?: GainNode
  private swell?: GainNode
  private drone?: OscillatorNode
  private speech?: SpeechSynthesisUtterance
  private lines: Line[] = []
  private played = new Map<string, number>()
  private last = new Map<string, number>()
  private now = 0
  private settings: SoundSettings = { master: 0.62, music: 0.42, effects: 0.70, voice: 0.75, spoken: true }
  subtitle: Subtitle | null = null

  constructor() {
    void fetch(base + 'dialogue/lines.en.json').then(response => response.json()).then((data: Line[]) => { this.lines = data }).catch(() => {})
  }

  unlock() {
    if (this.audio) { void this.audio.resume().catch(() => {}); return }
    try {
      const audio = this.audio = new AudioContext()
      const gain = (target: AudioNode, initial: number) => {
        const node = audio.createGain()
        node.gain.value = initial
        node.connect(target)
        return node
      }
      this.master = gain(audio.destination, this.settings.master)
      this.music = gain(this.master, this.settings.music)
      this.effects = gain(this.master, this.settings.effects)
      this.voiceBus = gain(this.master, this.settings.voice)
      this.ambience = gain(this.effects, 0)
      this.rumble = gain(this.effects, 0)
      this.swell = gain(this.music, 0)
      const noise = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate)
      const data = noise.getChannelData(0)
      const random = seededRandom(149)
      let filtered = 0
      for (let n = 0; n < data.length; n++) { filtered = 0.91 * filtered + (random() * 2 - 1) * 0.09; data[n] = filtered }
      const wind = audio.createBufferSource()
      wind.loop = true
      wind.buffer = noise
      wind.connect(this.ambience)
      wind.start()
      const rotor = this.drone = audio.createOscillator()
      rotor.type = 'triangle'
      rotor.frequency.value = 42
      rotor.connect(this.rumble)
      rotor.start()
      const lfo = audio.createOscillator()
      const pulse = audio.createGain()
      pulse.gain.value = 0.018
      lfo.frequency.value = 4.5
      lfo.connect(pulse)
      pulse.connect(this.rumble.gain)
      lfo.start()
      for (const [frequency, level] of [[43.65, 0.42], [65.41, 0.20], [87.3, 0.10]]) {
        const note = audio.createOscillator()
        note.type = 'sine'
        note.frequency.value = frequency
        note.connect(gain(this.swell, level))
        note.start()
      }
      void audio.resume().catch(() => {})
    } catch { /* Subtitles remain available when audio hardware is unavailable. */ }
  }

  configure(settings: SoundSettings) { this.settings = settings }
  update(now: number, active: boolean, boat: boolean, pressure: number, speed: number) {
    this.now = now
    if (this.subtitle && now > this.subtitle.end) this.stopLine()
    if (!this.audio || !this.master || !this.music || !this.effects || !this.ambience || !this.rumble || !this.swell || !this.drone) return
    const t = this.audio.currentTime
    this.master.gain.setTargetAtTime(clamp(this.settings.master), t, 0.12)
    this.music.gain.setTargetAtTime(this.settings.music * (this.subtitle ? 0.51 : 1), t, 0.15)
    this.voiceBus?.gain.setTargetAtTime(this.settings.voice, t, 0.12)
    this.effects.gain.setTargetAtTime(this.settings.effects * (this.subtitle ? 0.64 : 1), t, 0.15)
    this.ambience.gain.setTargetAtTime(active ? 0.35 + 0.24 * pressure : 0.075, t, 0.24)
    this.rumble.gain.setTargetAtTime(active ? 0.039 + speed * 0.018 : 0, t, 0.18)
    this.swell.gain.setTargetAtTime(active ? 0.09 + pressure * 0.116 : 0.05, t, 0.28)
    this.drone.frequency.setTargetAtTime(boat ? 31 + speed * 32 : 44 + speed * 4.5, t, 0.18)
  }

  event(event: GameEvent, eligible: Set<string>) {
    if (['CLAW_CLOSED', 'CLAW_OPENED'].includes(event.type)) this.tone(114, 67, 0.14, 0.13, event.x)
    if (['SURVIVOR_DELIVERED', 'LANDED', 'QUICK_SAVE'].includes(event.type)) this.tone(330, 660, 0.37, 0.21, event.x)
    if (['SHARK_TELEGRAPH', 'LUNGE_WARNING', 'MEGALODON_WARNING'].includes(event.type)) this.tone(89, 51, 0.66, 0.34, event.x)
    if (['MEGALODON_BREACH', 'BOAT_COLLISION', 'SHARK_STRIKE'].includes(event.type)) this.tone(56, 26, 0.52, 0.46, event.x)
    const candidates = this.lines.filter(line => line.trigger.event === event.type
      && (['oduya', 'reyes'].includes(line.speaker) || eligible.has(line.speaker))
      && (this.played.get(line.id) ?? 0) < line.maxPlays
      && this.now - (this.last.get(line.speaker) ?? -Infinity) >= line.cooldownMs)
    const line = candidates.find(line => line.speaker === event.id)
      ?? candidates.sort((a, b) => (this.last.get(a.speaker) ?? -1e9) - (this.last.get(b.speaker) ?? -1e9))[0]
    if (!line || this.subtitle && this.subtitle.priority >= line.priority) return
    this.stopLine()
    this.last.set(line.speaker, this.now)
    this.played.set(line.id, (this.played.get(line.id) ?? 0) + 1)
    this.subtitle = { name: names[line.speaker], text: line.text,
      end: this.now + Math.max(1600, line.text.length * (1000 / 15)) + 350, priority: line.priority }
    if (this.settings.spoken && this.audio?.state === 'running') void this.playLine(line)
  }

  private async playLine(line: Line) {
    const audio = this.audio
    const bus = this.voiceBus
    const subtitle = this.subtitle
    if (audio && bus && line.audio) {
      const request = this.requestVoice = new AbortController()
      try {
        const response = await fetch(base + line.audio, { signal: request.signal })
        if (!response.ok) throw new Error('Voice unavailable')
        const decoded = await audio.decodeAudioData(await response.arrayBuffer())
        if (request.signal.aborted || this.subtitle !== subtitle || !subtitle) return
        subtitle.end = Math.max(subtitle.end, this.now + decoded.duration * 1000 + 150)
        const source = this.voiceSource = audio.createBufferSource()
        source.buffer = decoded
        source.connect(bus)
        source.start()
        return
      } catch {
        if (request.signal.aborted || this.subtitle !== subtitle) return
      }
    }
    if (!window.speechSynthesis) return
    const local = speechSynthesis.getVoices().filter(voice => voice.localService && /^en\b/.test(voice.lang))
    if (!local.length) return
    const i = Object.keys(names).indexOf(line.speaker)
    this.speech = new SpeechSynthesisUtterance(line.text)
    this.speech.voice = local[i % local.length]
    this.speech.pitch = 0.81 + (i % 5) * 0.095
    this.speech.rate = 0.95 + (i % 3) * 0.09
    this.speech.volume = this.settings.voice * this.settings.master
    speechSynthesis.speak(this.speech)
  }

  stopLine() {
    this.requestVoice?.abort()
    this.requestVoice = undefined
    this.voiceSource?.stop()
    this.voiceSource = undefined
    if (this.speech) window.speechSynthesis?.cancel()
    this.speech = undefined
    this.subtitle = null
  }

  reset() {
    this.stopLine()
    this.last.clear()
    this.played.clear()
  }

  tone(from: number, to: number, duration: number, level: number, x = 0) {
    if (!this.audio || !this.effects) return
    const a = this.audio
    const t = a.currentTime
    const oscillator = a.createOscillator()
    const gain = a.createGain()
    const pan = a.createStereoPanner()
    pan.pan.value = clamp(x / 80, -1, 1) * 0.75
    oscillator.type = from < 90 ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(from, t)
    oscillator.frequency.exponentialRampToValueAtTime(to, t + duration)
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(level, t + Math.min(duration * 0.28, 0.065))
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    oscillator.connect(gain).connect(pan).connect(this.effects)
    oscillator.start(t)
    oscillator.stop(t + duration + 0.01)
  }
}
