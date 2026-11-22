import { clamp } from '../core/math'
import type { EventType, GameEvent } from '../game/events'
import type { ScenePhase } from '../game/session'
import { AudioClips, bufferTo, gainTo } from './clips'
import {
  effects as synthesize, loopEngine, loopMusic, loopRain, loopSlot, noiseBuffer, type EffectSlot,
  radioLeadIn, radioSlots, radioTail, radioTransmission,
} from './sounds'

const names: Record<string, string> = {
  reyes: 'Pilot Reyes', oduya: 'Captain Oduya', mara: 'Mara Voss', elias: 'Elias Rook', dev: 'Dev Kapoor',
  ana: 'Ana Kapoor', priya: 'Priya Nair', jay: 'Jay Okafor', tommy: 'Tommy Ricci', hollis: 'Hollis Brandt',
}

interface Line {
  id: string; speaker: string; text: string; priority: number; cooldownMs: number; maxPlays: number; audio?: string
  trigger: { event: EventType }
}

export type Subtitle = { name: string; text: string; end: number; priority: number }
export type SoundSettings = { master: number; music: number; effects: number; voice: number; spoken: boolean; muted: boolean }

interface SoundScene {
  active: boolean
  phase?: ScenePhase
  pressure: number
  flightSpeed: number
  boatSpeed: number
  throttle: number
}

const radioSpeaker = (speaker: string) => speaker === 'reyes' || speaker === 'oduya'
const voiceGapMs = 650
const voiceQueueMs = 3200
const rotorFadeSeconds = 7
const effectCooldownMs: Partial<Record<EffectSlot, number>> = { 'boat-rock-hit': 650, 'boat-shark-hit': 460, 'water-splash': 180 }
const base = import.meta.env.BASE_URL

function effectFor(event: GameEvent): EffectSlot | undefined {
  switch (event.type) {
    case 'CLAW_CLOSED': case 'CLAW_OPENED': return 'claw-click'
    case 'SURVIVOR_DELIVERED': case 'LANDED': case 'QUICK_SAVE': return 'success-chime'
    case 'SHARK_TELEGRAPH': case 'LUNGE_WARNING': case 'MEGALODON_WARNING': return 'danger-warning'
    case 'MEGALODON_BREACH': case 'SHARK_STRIKE': case 'WATER_SPLASH': return 'water-splash'
    case 'BOAT_COLLISION':
      if (event.impact === 'rock') return 'boat-rock-hit'
      if (event.impact === 'shark') return 'boat-shark-hit'
      return 'impact-thud'
  }
}

function radioChannel(audio: AudioContext, output: AudioNode) {
  const highpass = audio.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 300
  highpass.Q.value = 0.707
  const drive = audio.createWaveShaper()
  drive.curve = Float32Array.from({ length: 257 }, (_, i) => Math.tanh((i / 128 - 1) * 1.16))
  drive.oversample = '2x'
  const presence = audio.createBiquadFilter()
  presence.type = 'peaking'
  presence.frequency.value = 1850
  presence.Q.value = 0.9
  presence.gain.value = 3
  const lowpass = audio.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 3000
  lowpass.Q.value = 0.707
  const compressor = audio.createDynamicsCompressor()
  compressor.threshold.value = -17
  compressor.knee.value = 16
  compressor.ratio.value = 2.4
  compressor.attack.value = 0.005
  compressor.release.value = 0.085
  highpass.connect(drive).connect(presence).connect(lowpass).connect(compressor).connect(output)
  return highpass
}

function makeMix(audio: AudioContext, settings: SoundSettings) {
  const clips = new AudioClips(audio)
  const master = gainTo(audio, audio.destination, settings.muted ? 0 : clamp(settings.master))
  const music = gainTo(audio, master, clamp(settings.music))
  const effects = gainTo(audio, master, clamp(settings.effects))
  const voice = gainTo(audio, master, settings.spoken ? clamp(settings.voice) : 0)
  const noise = noiseBuffer(audio, 1, 0, 402)
  const radio = radioChannel(audio, voice)

  for (const slug of Object.keys(synthesize)) void clips.override(slug)
  const radioClips = Promise.all(radioSlots.map(slug => clips.override(slug)))
  return {
    audio, clips, master, music, effects, voice, noise, radio, radioClips,
    rain: loopSlot(audio, clips, 'rain-ambience', effects, out => loopRain(audio, out)),
    musicLoop: loopSlot(audio, clips, 'tension-music', music, out => loopMusic(audio, out)),
    helicopter: loopSlot(audio, clips, 'helicopter-engine', effects, out => loopEngine(audio, out, noise, true)),
    boat: loopSlot(audio, clips, 'boat-engine', effects, out => loopEngine(audio, out, noise, false)),
  }
}

export class Radio {
  private mix?: ReturnType<typeof makeMix>
  private lines: Line[] = []
  private readonly played = new Map<string, number>()
  private readonly lastLine = new Map<string, number>()
  private readonly lastSpeaker = new Map<string, number>()
  private readonly lastEffect = new Map<EffectSlot, number>()
  private queued?: { line: Line; at: number }
  private cancelVoice?: () => void
  private speaking = false
  private voiceReadyAt = 0
  private soundEpoch = 0
  private now = 0
  private rotorLevel = 0
  private rotorFadeAt: number | null = null
  private ducked = false
  subtitle: Subtitle | null = null

  constructor(private settings: SoundSettings) {
    void fetch(base + 'dialogue/lines.en.json').then(response => response.json()).then((data: Line[]) => { this.lines = data }).catch(() => {})
  }

  unlock() {
    if (this.mix) { void this.mix.audio.resume().catch(() => {}); return }
    try {
      const audio = new AudioContext()
      this.mix = makeMix(audio, this.settings)
      this.applyVolumes()
      void audio.resume().catch(() => {})
    } catch { /* Subtitles remain available when audio hardware is unavailable. */ }
  }

  configure(settings: SoundSettings) {
    const speechVolumeChanged = this.settings.voice !== settings.voice || this.settings.master !== settings.master
    this.settings = settings
    if (!this.canSpeak || this.speaking && speechVolumeChanged) this.stopPlayback()
    this.applyVolumes()
  }

  private get canSpeak() {
    return this.settings.spoken && !this.settings.muted && this.settings.voice > 0 && this.settings.master > 0
  }

  private applyVolumes() {
    const mix = this.mix
    if (!mix) return
    const t = mix.audio.currentTime
    this.ducked = !!this.subtitle
    mix.master.gain.setTargetAtTime(this.settings.muted ? 0 : clamp(this.settings.master), t, 0.06)
    mix.music.gain.setTargetAtTime(clamp(this.settings.music) * (this.ducked ? 0.51 : 1), t, 0.15)
    mix.effects.gain.setTargetAtTime(clamp(this.settings.effects) * (this.ducked ? 0.64 : 1), t, 0.15)
    mix.voice.gain.setTargetAtTime(this.settings.spoken ? clamp(this.settings.voice) : 0, t, 0.06)
  }

  update(now: number, { active, phase, pressure, flightSpeed, boatSpeed, throttle }: SoundScene) {
    this.now = now
    if (!active) this.stopLine()
    else if (phase === 'results') {
      this.clearLine()
      this.queued = undefined
    }
    if (this.subtitle && now >= this.subtitle.end) this.clearLine()
    if (this.queued && now - this.queued.at > voiceQueueMs) this.queued = undefined
    if (this.queued && !this.subtitle && now >= this.voiceReadyAt) {
      const { line } = this.queued
      this.queued = undefined
      this.startLine(line)
    }
    const mix = this.mix
    if (!mix) return
    if (this.ducked !== !!this.subtitle) this.applyVolumes()
    mix.rain(active ? 0.35 + 0.24 * pressure : 0.075)
    mix.musicLoop(active ? 0.09 + pressure * 0.116 : 0.05, 1, 0.28)

    const flight = phase === 'school' || phase === 'arrival' || phase === 'rescue'
    const departing = phase === 'handoff' || phase === 'boat'
    const t = mix.audio.currentTime
    if (departing) this.rotorFadeAt ??= t
    else {
      this.rotorFadeAt = null
      this.rotorLevel = flight ? 0.14 + 0.055 * flightSpeed : 0
    }
    const fade = this.rotorFadeAt === null ? 1 : clamp(1 - (t - this.rotorFadeAt) / rotorFadeSeconds) ** 1.35
    mix.helicopter(active ? this.rotorLevel * fade : 0, 0.95 + 0.16 * flightSpeed, 0.12)
    const power = clamp(throttle * 0.64 + boatSpeed * 0.36)
    mix.boat(active && phase === 'boat' ? 0.085 + 0.19 * power : 0, 0.73 + 0.55 * power, 0.18)
  }

  event(event: GameEvent, eligible: Set<string>, now: number, listenerX = 0) {
    const slot = effectFor(event)
    if (slot) this.playEffect(slot, (event.x ?? listenerX) - listenerX, now, event.heavySplash || event.type === 'MEGALODON_BREACH')
    const candidates = this.lines.filter(line => line.trigger.event === event.type
      && (radioSpeaker(line.speaker) || eligible.has(line.speaker))
      && (this.played.get(line.id) ?? 0) < line.maxPlays
      && now - (this.lastLine.get(line.id) ?? -Infinity) >= line.cooldownMs
      && now - (this.lastSpeaker.get(line.speaker) ?? -Infinity) >= line.cooldownMs)
    const targeted = candidates.filter(line => line.speaker === event.id)
    const line = (targeted.length ? targeted : candidates).sort((a, b) =>
      (this.lastSpeaker.get(a.speaker) ?? -1e9) - (this.lastSpeaker.get(b.speaker) ?? -1e9)
      || (this.lastLine.get(a.id) ?? -1e9) - (this.lastLine.get(b.id) ?? -1e9))[0]
    if (!line || (this.subtitle?.priority ?? -Infinity) >= line.priority) return
    if (this.queued && now - this.queued.at <= voiceQueueMs) {
      // The first sighting and first charge are announced on the same tick.
      if (this.queued.at === now && this.queued.line.trigger.event === 'SHARK_SPOTTED' && event.type === 'SHARK_TELEGRAPH') return
      if (this.queued.line.priority >= line.priority) return
    }
    this.queued = { line, at: now }
  }

  private startLine(line: Line) {
    this.lastSpeaker.set(line.speaker, this.now)
    this.lastLine.set(line.id, this.now)
    this.played.set(line.id, (this.played.get(line.id) ?? 0) + 1)
    const subtitle = this.subtitle = {
      name: names[line.speaker], text: line.text, priority: line.priority,
      end: this.now + Math.max(1600, line.text.length * (1000 / 15)) + 350,
    }
    if (this.canSpeak && this.mix?.audio.state === 'running') void this.playLine(this.mix, line, subtitle)
  }

  private async playLine(mix: ReturnType<typeof makeMix>, line: Line, subtitle: Subtitle) {
    const isRadio = radioSpeaker(line.speaker)
    const [buffer, radioClips] = await Promise.all([
      mix.clips.override(line.id).then(override => override ?? (line.audio ? mix.clips.load(line.audio) : null)),
      isRadio ? mix.radioClips : null,
    ])
    if (this.subtitle !== subtitle || !this.canSpeak) return
    const captionEnd = subtitle.end
    const transmission = () => radioClips && radioTransmission(mix.audio, mix.radio, mix.noise, radioClips)
    const finish = (tx: ReturnType<typeof transmission>) => {
      tx?.finish()
      subtitle.end = Math.max(captionEnd, performance.now() + (tx ? radioTail * 1000 : 0) + 130)
    }

    if (buffer) {
      const tx = transmission()
      const lead = tx ? radioLeadIn : 0
      const source = bufferTo(mix.audio, tx?.input ?? mix.voice, buffer)
      subtitle.end = Math.max(captionEnd, performance.now() + (lead + buffer.duration + (tx ? radioTail : 0)) * 1000 + 160)
      const onEnd = () => finish(tx)
      source.addEventListener('ended', onEnd, { once: true })
      this.cancelVoice = () => {
        source.removeEventListener('ended', onEnd)
        source.stop()
        tx?.cancel()
      }
      source.start(mix.audio.currentTime + lead)
      return
    }

    // Browser speech has its own output path. It can share the squelch and static, but not the voice filter.
    const speech = window.speechSynthesis
    const local = speech?.getVoices().filter(voice => voice.localService && /^en\b/.test(voice.lang))
    if (!local?.length) return
    const i = Object.keys(names).indexOf(line.speaker)
    const utterance = new SpeechSynthesisUtterance(line.text)
    utterance.voice = local[i % local.length]
    utterance.pitch = 0.81 + (i % 5) * 0.095
    utterance.rate = 0.95 + (i % 3) * 0.09
    utterance.volume = clamp(this.settings.voice * this.settings.master)
    let tx: ReturnType<typeof transmission> = null
    this.speaking = true
    subtitle.end = performance.now() + Math.max(4500, (captionEnd - this.now) * 2 + 1500)
    utterance.onstart = () => { tx = transmission() }
    utterance.onend = utterance.onerror = () => {
      this.speaking = false
      finish(tx)
    }
    this.cancelVoice = () => {
      utterance.onstart = utterance.onend = utterance.onerror = null
      if (this.speaking) speech.cancel()
      this.speaking = false
      tx?.cancel()
    }
    speech.speak(utterance)
  }

  private stopPlayback() {
    this.cancelVoice?.()
    this.cancelVoice = undefined
  }

  private clearLine() {
    this.stopPlayback()
    if (this.subtitle) this.voiceReadyAt = this.now + voiceGapMs
    this.subtitle = null
  }

  stopLine() {
    this.soundEpoch++
    this.clearLine()
    this.queued = undefined
  }

  reset() {
    this.stopLine()
    this.voiceReadyAt = 0
    this.rotorLevel = 0
    this.rotorFadeAt = null
    this.played.clear()
    this.lastSpeaker.clear()
    this.lastEffect.clear()
  }

  private playEffect(slot: EffectSlot, x: number, now: number, heavy: boolean) {
    const mix = this.mix
    if (!mix || mix.audio.state !== 'running' || this.settings.muted || this.settings.effects <= 0 || this.settings.master <= 0) return
    if (now - (this.lastEffect.get(slot) ?? -Infinity) < (effectCooldownMs[slot] ?? 0)) return
    this.lastEffect.set(slot, now)
    const epoch = this.soundEpoch
    void mix.clips.override(slot).then(buffer => {
      if (epoch !== this.soundEpoch) return
      const pan = mix.audio.createStereoPanner()
      pan.pan.value = clamp(x / 80, -1, 1) * 0.75
      pan.connect(mix.effects)
      if (buffer) {
        const gain = gainTo(mix.audio, pan, slot === 'water-splash' && !heavy ? 0.37 : 0.61)
        const source = bufferTo(mix.audio, gain, buffer)
        source.start()
        source.addEventListener('ended', () => { gain.disconnect(); pan.disconnect() }, { once: true })
      } else synthesize[slot](mix.audio, pan, mix.audio.currentTime, mix.noise, heavy)
    })
  }
}
