import { clamp, lerp, seededRandom } from '../core/math'
import { bufferTo, gainTo, type AudioClips } from './clips'

type SetPitch = (rate: number, time: number) => void
type PrepareLoop = (buffer: AudioBuffer) => { trim: number; loopStart: number }

export function loopSlot(audio: AudioContext, clips: AudioClips, slug: string, output: AudioNode,
  fallback: (output: AudioNode) => SetPitch | void, prepare?: PrepareLoop) {
  const gain = gainTo(audio, output, 0)
  const recording = clips.override(slug).then(buffer => buffer && { buffer, ...prepare?.(buffer) })
  let started = false
  let level = 0
  let rate = 1
  let setPitch: SetPitch | void
  return (volume: number, speed = 1, smoothing = 0.24) => {
    const time = audio.currentTime
    if (volume !== level) {
      level = volume
      gain.gain.setTargetAtTime(level, time, smoothing)
    }
    if (Math.abs(speed - rate) > 0.001) {
      rate = speed
      setPitch?.(rate, time)
    }
    if (started || level <= 0) return
    started = true
    void recording.then(clip => {
      if (level <= 0) { started = false; return }
      const start = audio.currentTime
      gain.gain.cancelScheduledValues(start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.setTargetAtTime(level, start, smoothing)
      if (clip) {
        const source = bufferTo(audio, clip.trim === undefined ? gain : gainTo(audio, gain, clip.trim), clip.buffer)
        source.loop = true
        source.loopStart = clip.loopStart ?? 0
        source.playbackRate.value = rate
        setPitch = (pitch, t) => source.playbackRate.setTargetAtTime(pitch, t, 0.17)
        source.start()
      } else {
        setPitch = fallback(gain)
        setPitch?.(rate, audio.currentTime)
      }
    })
  }
}

export function prepareEngineLoop(buffer: AudioBuffer) {
  const frames = Math.min(Math.round(buffer.sampleRate * 0.12), Math.floor(buffer.length / 4))
  const overlap = frames >= 2 ? frames : 0
  const fade = new Float32Array(overlap)
  for (let i = 0; i < overlap; i++) fade[i] = Math.sin(i / (overlap - 1) * Math.PI / 2)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    const tail = samples.length - overlap
    // The tail blends into the head. Playback wraps to the next unblended sample.
    for (let i = 0; i < overlap; i++) samples[tail + i] = samples[tail + i] * fade[overlap - 1 - i] + samples[i] * fade[i]
  }
  return { trim: recordingGain(buffer), loopStart: overlap / buffer.sampleRate }
}

export function recordingGain(buffer: AudioBuffer, duration = buffer.duration) {
  const frames = Math.min(buffer.length, Math.round(duration * buffer.sampleRate))
  let peak = 0
  let energy = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel).subarray(0, frames)) {
      peak = Math.max(peak, Math.abs(sample))
      energy += sample * sample
    }
  }
  const rms = Math.sqrt(energy / (buffer.numberOfChannels * frames))
  return peak > 0 ? Math.min(0.50 / rms, 3.50 / peak, 7.50) : 1
}

export function noiseBuffer(audio: AudioContext, seconds: number, smoothing: number, seed: number) {
  const noise = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate)
  const data = noise.getChannelData(0)
  const random = seededRandom(seed)
  let filtered = 0
  for (let n = 0; n < data.length; n++) {
    filtered = smoothing * filtered + (random() * 2 - 1) * (1 - smoothing)
    data[n] = filtered
  }
  return noise
}

export function loopRain(audio: AudioContext, output: AudioNode) {
  const source = bufferTo(audio, output, noiseBuffer(audio, 3, 0.91, 149))
  source.loop = true
  source.start()
}

export function loopMusic(audio: AudioContext, output: AudioNode) {
  for (const [frequency, level] of [[43.65, 0.42], [65.41, 0.20], [87.3, 0.10]]) {
    const note = audio.createOscillator()
    note.frequency.value = frequency
    note.connect(gainTo(audio, output, level))
    note.start()
  }
}

const boatIdleRate = 0.70
const boatFullRate = 1.46

export function boatEngineMix(throttle: number, speed: number) {
  const load = clamp(throttle * 0.72 + speed * 0.28)
  return { volume: 0.04 + 0.42 * load ** 1.18, rate: lerp(boatIdleRate, boatFullRate, load) }
}

export function loopEngine(audio: AudioContext, output: AudioNode, noise: AudioBuffer, helicopter: boolean): SetPitch {
  const pulse = gainTo(audio, output, 0.61)
  const rumble = audio.createBiquadFilter()
  rumble.type = 'lowpass'
  rumble.frequency.value = helicopter ? 222 : 168
  rumble.Q.value = 0.4
  rumble.connect(pulse)
  const fundamental = helicopter ? 42 : 38
  const bladeRate = helicopter ? 7.4 : 10.2
  const motor = audio.createOscillator()
  motor.type = helicopter ? 'triangle' : 'sawtooth'
  motor.frequency.value = fundamental
  motor.connect(gainTo(audio, rumble, helicopter ? 0.57 : 0.52))
  motor.start()
  const harmonic = audio.createOscillator()
  harmonic.type = 'triangle'
  harmonic.frequency.value = fundamental * 2
  harmonic.connect(gainTo(audio, rumble, 0.23))
  harmonic.start()
  const washGain = gainTo(audio, rumble, 0.34)
  const wash = bufferTo(audio, washGain, noise)
  wash.loop = true
  wash.start()
  const blades = audio.createOscillator()
  blades.frequency.value = bladeRate
  const modulation = audio.createGain()
  modulation.gain.value = 0.29
  blades.connect(modulation)
  modulation.connect(pulse.gain)
  blades.start()
  return (rate, time) => {
    motor.frequency.setTargetAtTime(fundamental * rate, time, 0.17)
    harmonic.frequency.setTargetAtTime(2 * fundamental * rate, time, 0.17)
    blades.frequency.setTargetAtTime(bladeRate * rate, time, 0.17)
    wash.playbackRate.setTargetAtTime(rate, time, 0.17)
    if (!helicopter) {
      const load = clamp((rate - boatIdleRate) / (boatFullRate - boatIdleRate))
      rumble.frequency.setTargetAtTime(lerp(148, 460, load), time, 0.19)
      washGain.gain.setTargetAtTime(lerp(0.22, 0.53, load), time, 0.19)
    }
  }
}

function sweep(audio: AudioContext, output: AudioNode, t: number,
  from: number, to: number, duration: number, level: number, type: OscillatorType = from < 90 ? 'triangle' : 'sine') {
  const source = audio.createOscillator()
  const envelope = gainTo(audio, output, 0.001)
  source.type = type
  source.frequency.setValueAtTime(from, t)
  source.frequency.exponentialRampToValueAtTime(to, t + duration)
  envelope.gain.setValueAtTime(0.001, t)
  envelope.gain.exponentialRampToValueAtTime(level, t + Math.min(duration * 0.28, 0.065))
  envelope.gain.exponentialRampToValueAtTime(0.001, t + duration)
  source.connect(envelope)
  source.start(t)
  source.stop(t + duration + 0.01)
  source.addEventListener('ended', () => { source.disconnect(); envelope.disconnect() }, { once: true })
}

function noiseBurst(audio: AudioContext, output: AudioNode, noise: AudioBuffer,
  t: number, duration: number, frequency: number, level: number, type: BiquadFilterType = 'bandpass') {
  const envelope = gainTo(audio, output, 0)
  const filter = audio.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(frequency, t)
  filter.frequency.exponentialRampToValueAtTime(frequency * 0.57, t + duration)
  filter.Q.value = 0.62
  filter.connect(envelope)
  envelope.gain.setValueAtTime(0, t)
  envelope.gain.linearRampToValueAtTime(level, t + Math.min(0.026, duration * 0.25))
  envelope.gain.exponentialRampToValueAtTime(0.001, t + duration)
  const source = bufferTo(audio, filter, noise)
  source.start(t, 0, duration + 0.01)
  source.addEventListener('ended', () => { filter.disconnect(); envelope.disconnect() }, { once: true })
}

type Effect = (audio: AudioContext, output: AudioNode, time: number, noise: AudioBuffer, heavy: boolean) => void

export const effects = {
  'claw-click': (audio, out, t) => sweep(audio, out, t, 114, 67, 0.14, 0.13),
  'success-chime': (audio, out, t) => sweep(audio, out, t, 330, 660, 0.37, 0.21),
  'danger-warning': (audio, out, t) => sweep(audio, out, t, 89, 51, 0.66, 0.34),
  'impact-thud': (audio, out, t) => sweep(audio, out, t, 56, 26, 0.52, 0.46),
  'boat-rock-hit': (audio, out, t, noise) => {
    sweep(audio, out, t, 90, 37, 0.23, 0.46, 'triangle')
    noiseBurst(audio, out, noise, t, 0.48, 1650, 0.64)
  },
  'boat-shark-hit': (audio, out, t, noise) => {
    noiseBurst(audio, out, noise, t, 0.10, 1150, 0.69)
    sweep(audio, out, t + 0.018, 69, 27, 0.52, 0.59)
    noiseBurst(audio, out, noise, t + 0.025, 0.32, 390, 0.42, 'lowpass')
  },
  'water-splash': (audio, out, t, noise, heavy) => {
    noiseBurst(audio, out, noise, t, heavy ? 0.68 : 0.34, heavy ? 1600 : 2350, heavy ? 0.72 : 0.56, 'lowpass')
    sweep(audio, out, t, heavy ? 82 : 150, heavy ? 32 : 71, heavy ? 0.29 : 0.13, heavy ? 0.34 : 0.12)
  },
} satisfies Record<string, Effect>

export type EffectSlot = keyof typeof effects

export function voiceFilter(audio: AudioContext, type: BiquadFilterType, frequency: number, gain = 0, q = 0.707) {
  const filter = audio.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.gain.value = gain
  filter.Q.value = q
  return filter
}

export function earlyReflections(audio: AudioContext, input: AudioNode, output: AudioNode, cutoff: number,
  taps: readonly (readonly [delay: number, level: number, pan: number])[]) {
  const damped = voiceFilter(audio, 'lowpass', cutoff)
  input.connect(damped)
  for (const [time, level, side] of taps) {
    const delay = audio.createDelay(0.12)
    delay.delayTime.value = time
    const pan = audio.createStereoPanner()
    pan.pan.value = side
    damped.connect(delay).connect(pan).connect(gainTo(audio, output, level))
  }
}

export function survivorChannel(audio: AudioContext, output: AudioNode, aboard: boolean) {
  const input = voiceFilter(audio, 'highpass', aboard ? 95 : 168)
  const body = voiceFilter(audio, 'peaking', 405, aboard ? 1.8 : -1.35, 0.87)
  const air = voiceFilter(audio, 'lowpass', aboard ? 9300 : 5400)
  const level = gainTo(audio, output, aboard ? 1 : 0.86)
  input.connect(body).connect(air).connect(level)
  if (aboard) earlyReflections(audio, air, level, 3200, [[0.015, 0.058, -0.16], [0.031, 0.032, 0.22]])
  else earlyReflections(audio, air, level, 2450, [[0.038, 0.074, -0.38], [0.067, 0.042, 0.44]])
  return input
}

export function voiceTake(audio: AudioContext, output: AudioNode, presence: number, side: number, volume: number) {
  const input = voiceFilter(audio, 'peaking', 2180, presence, 0.82)
  const pan = audio.createStereoPanner()
  pan.pan.value = side
  const level = gainTo(audio, output, volume)
  input.connect(pan).connect(level)
  return {
    input,
    disconnect() {
      input.disconnect()
      pan.disconnect()
      level.disconnect()
    },
  }
}

export const radioSlots = ['radio-squelch-open', 'radio-squelch-close', 'radio-static'] as const
export const radioLeadIn = 0.06
export const radioTail = 0.115

export function radioTransmission(audio: AudioContext, channel: AudioNode, noise: AudioBuffer,
  [opening, closing, staticClip]: readonly (AudioBuffer | null)[]) {
  const gate = gainTo(audio, channel, 1)
  const time = audio.currentTime
  const hiss = gainTo(audio, gate, 0)
  const carrierFilter = voiceFilter(audio, 'lowpass', 2000)
  carrierFilter.connect(hiss)
  const carrier = bufferTo(audio, carrierFilter, staticClip ?? noise)
  carrier.loop = true
  carrier.addEventListener('ended', () => { carrierFilter.disconnect(); hiss.disconnect() }, { once: true })
  const speechAt = time + radioLeadIn
  hiss.gain.setValueAtTime(0, speechAt)
  hiss.gain.linearRampToValueAtTime(staticClip ? 0.017 : 0.021, speechAt + 0.018)
  carrier.start(speechAt)
  let finished = false

  function squelch(buffer: AudioBuffer | null, t: number, opening: boolean) {
    if (buffer) {
      const duration = Math.min(buffer.duration, opening ? radioLeadIn : radioTail)
      const envelope = gainTo(audio, gate, 0)
      envelope.gain.setValueAtTime(0, t)
      envelope.gain.linearRampToValueAtTime(0.22, t + duration * 0.12)
      envelope.gain.setValueAtTime(0.22, t + duration * 0.74)
      envelope.gain.linearRampToValueAtTime(0, t + duration)
      const source = bufferTo(audio, envelope, buffer)
      source.start(t, 0, duration)
      source.addEventListener('ended', () => envelope.disconnect(), { once: true })
    } else {
      sweep(audio, gate, t, opening ? 1420 : 1060, opening ? 760 : 570, 0.022, opening ? 0.21 : 0.15)
      noiseBurst(audio, gate, noise, t, 0.016, opening ? 1850 : 1310, 0.14)
    }
  }

  squelch(opening, time, true)
  return {
    input: gate,
    finish() {
      if (finished) return
      finished = true
      const t = audio.currentTime
      hiss.gain.setTargetAtTime(0, t, 0.014)
      carrier.stop(t + 0.07)
      squelch(closing, t, false)
    },
    cancel() {
      if (!finished) carrier.stop()
      gate.disconnect()
    },
  }
}
