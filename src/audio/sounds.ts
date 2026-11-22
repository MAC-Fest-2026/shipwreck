import { seededRandom } from '../core/math'
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

export function prepareHelicopterLoop(buffer: AudioBuffer) {
  const frames = Math.min(Math.round(buffer.sampleRate * 0.12), Math.floor(buffer.length / 4))
  const overlap = frames >= 2 ? frames : 0
  const fade = new Float32Array(overlap)
  for (let i = 0; i < overlap; i++) fade[i] = Math.sin(i / (overlap - 1) * Math.PI / 2)
  let peak = 0
  let energy = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    const tail = samples.length - overlap
    // The tail blends into the head. Playback wraps to the next unblended sample.
    for (let i = 0; i < overlap; i++) samples[tail + i] = samples[tail + i] * fade[overlap - 1 - i] + samples[i] * fade[i]
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample))
      energy += sample * sample
    }
  }
  const rms = Math.sqrt(energy / (buffer.numberOfChannels * buffer.length))
  // Calibrate the recording against the rain while leaving headroom at full rotor gain.
  const trim = peak > 0 ? Math.min(0.50 / rms, 3.50 / peak, 7.50) : 1
  return { trim, loopStart: overlap / buffer.sampleRate }
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

export function loopEngine(audio: AudioContext, output: AudioNode, noise: AudioBuffer, helicopter: boolean): SetPitch {
  const pulse = gainTo(audio, output, 0.61)
  const rumble = audio.createBiquadFilter()
  rumble.type = 'lowpass'
  rumble.frequency.value = helicopter ? 222 : 168
  rumble.Q.value = 0.4
  rumble.connect(pulse)
  const fundamental = helicopter ? 42 : 33
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
  const wash = bufferTo(audio, gainTo(audio, rumble, 0.34), noise)
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

export const radioSlots = ['radio-squelch-open', 'radio-squelch-close', 'radio-static'] as const
export const radioLeadIn = 0.09
export const radioTail = 0.125

export function radioTransmission(audio: AudioContext, channel: AudioNode, noise: AudioBuffer,
  [opening, closing, staticClip]: readonly (AudioBuffer | null)[]) {
  const gate = gainTo(audio, channel, 1)
  const time = audio.currentTime
  const hiss = gainTo(audio, gate, staticClip ? 0.025 : 0.034)
  const carrier = bufferTo(audio, hiss, staticClip ?? noise)
  carrier.loop = true
  carrier.start(time + radioLeadIn)
  let finished = false

  function squelch(buffer: AudioBuffer | null, t: number, opening: boolean) {
    if (buffer) {
      const duration = Math.min(buffer.duration, opening ? radioLeadIn : radioTail)
      const envelope = gainTo(audio, gate, 0.28)
      envelope.gain.setValueAtTime(0.28, t + duration * 0.72)
      envelope.gain.linearRampToValueAtTime(0, t + duration)
      const source = bufferTo(audio, envelope, buffer)
      source.start(t, 0, duration)
      source.addEventListener('ended', () => envelope.disconnect(), { once: true })
    } else {
      sweep(audio, gate, t, opening ? 2200 : 1680, opening ? 940 : 710, 0.023, 0.29, 'triangle')
      noiseBurst(audio, gate, noise, t + 0.004, opening ? 0.061 : 0.096, opening ? 2440 : 1920, 0.33)
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
