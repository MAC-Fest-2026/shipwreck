import type { GestureRecognizerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { tuning } from '../app/tuning'
import { clamp, lerp } from '../core/math'
import { neutralIntent, type ControlIntent, type IntentProvider } from './intent'

const T = tuning.hands
type Side = 'left' | 'right'
type Point = { x: number; y: number }
export interface HandSample {
  palm: Point
  tip: Point
  open: number
  pinch: number
  gesture: string
  label: Side
  landmarks: Point[]
}
export interface HandFrame { left: HandSample | null; right: HandSample | null; tMs: number }

export interface Calibration {
  xmin: number; xmax: number; ymin: number; ymax: number
  open: number; closed: number; wheel: number; low: number; high: number
  swap: boolean
}
export const defaults: Calibration = {
  xmin: 0.20, xmax: 0.82, ymin: 0.24, ymax: 0.77, open: 1.78, closed: 1.02,
  wheel: 0, low: 0.26, high: 0.72, swap: false,
}

export function loadCalibration(): Calibration | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('shipwreck-calibration-v1') ?? 'null')
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (typeof record[key] !== typeof defaultValue || (typeof defaultValue === 'number' && !Number.isFinite(record[key]))) return null
    }
    return value as Calibration
  } catch {
    return null
  }
}

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }

export class OneEuro {
  private raw = 0
  private filtered = 0
  private derivative = 0
  private time: number | null = null
  reset() { this.time = null }
  sample(value: number, time: number) {
    const oldTime = this.time
    this.time = time
    if (oldTime === null || time - oldTime > 180) {
      this.raw = this.filtered = value
      this.derivative = 0
      return value
    }
    const dt = Math.max(0.001, (time - oldTime) / 1000)
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
    this.derivative = lerp(this.derivative, (value - this.raw) / dt, alpha(T.dCutoff))
    this.filtered = lerp(this.filtered, value, alpha(T.minCutoff + T.beta * Math.abs(this.derivative)))
    this.raw = value
    return this.filtered
  }
}

export function extractHand(points: NormalizedLandmark[], label: Side, gesture: string, aspect: number): HandSample {
  const landmarks = points.map(p => ({ x: 1 - p.x, y: 1 - p.y }))
  const scaled = landmarks.map(p => ({ x: p.x * aspect, y: p.y }))
  const palm = [0, 5, 9, 13, 17].reduce((p, index) => ({
    x: p.x + landmarks[index].x / 5, y: p.y + landmarks[index].y / 5,
  }), { x: 0, y: 0 })
  const open = [5, 9, 13, 17].reduce((total, index) => total
    + distance(scaled[index + 3], scaled[0]) / Math.max(0.01, distance(scaled[index], scaled[0])) / 4, 0)
  return { palm, tip: landmarks[8], open, pinch: distance(scaled[4], scaled[8]) / Math.max(0.01, distance(scaled[0], scaled[9])),
    gesture, label, landmarks }
}

export function identify(samples: HandSample[], previous: HandFrame | null, swap: boolean, tMs: number): HandFrame {
  const byLabel = (sample: HandSample) => (sample.label === 'left') !== swap ? 'left' : 'right'
  const result: HandFrame = { left: null, right: null, tMs }
  if (samples.length === 2) {
    const [a, b] = samples
    const continuity = previous?.left && previous.right && tMs - previous.tMs < 230
    let aLeft = a.palm.x < b.palm.x
    if (continuity) {
      const { left, right } = previous
      const direct = distance(a.palm, left!.palm) + distance(b.palm, right!.palm)
      const reverse = distance(a.palm, right!.palm) + distance(b.palm, left!.palm)
      if (Math.abs(direct - reverse) > 0.015) aLeft = direct < reverse
      else if (a.label !== b.label) aLeft = byLabel(a) === 'left'
    }
    result.left = aLeft ? a : b
    result.right = aLeft ? b : a
  } else if (samples.length === 1) {
    const sample = samples[0]
    const leftDistance = previous?.left ? distance(sample.palm, previous.left.palm) : Infinity
    const rightDistance = previous?.right ? distance(sample.palm, previous.right.palm) : Infinity
    const side = Math.min(leftDistance, rightDistance) < 0.17 && previous && tMs - previous.tMs < 230
      ? leftDistance < rightDistance ? 'left' : 'right' : byLabel(sample)
    result[side] = sample
  }
  return result
}

export class Hold {
  private since: number | null = null
  private fired = false
  progress = 0
  update(condition: boolean, now: number, duration: number) {
    if (!condition) {
      this.since = null
      this.fired = false
      this.progress = 0
      return false
    }
    this.since ??= now
    this.progress = clamp((now - this.since) / duration)
    if (this.progress < 1 || this.fired) return false
    this.fired = true
    return true
  }
}

export class HandsIntentProvider implements IntentProvider {
  frame: HandFrame | null = null
  latestSamples: HandSample[] = []
  aspect = 4 / 3
  lastBoth = -Infinity
  lastPoseBoth = -Infinity
  calibration: Calibration
  private readonly filters = [new OneEuro(), new OneEuro(), new OneEuro(), new OneEuro(), new OneEuro(), new OneEuro()]
  private readonly closeHold = new Hold()
  private readonly openHold = new Hold()
  private readonly backHold = new Hold()
  private readonly pauseHold = new Hold()
  private intent = neutralIntent
  private pinched = false
  private cursor = neutralIntent.cursor
  private edges = { select: false, back: false, pauseToggle: false }
  constructor(calibration: Calibration) { this.calibration = calibration }

  ingest(samples: HandSample[], tMs: number) {
    this.latestSamples = samples
    const frame = identify(samples, this.frame, this.calibration.swap, tMs)
    const { left, right } = frame
    this.frame = frame
    if (left && right) this.lastBoth = tMs
    if (left?.gesture === 'Open_Palm' && right?.gesture === 'Open_Palm') this.lastPoseBoth = tMs
    const c = this.calibration
    if (right) {
      const point = right.gesture === 'Pointing_Up' || right.pinch < 0.44 ? right.tip : right.palm
      this.cursor = {
        x: clamp((this.filters[4].sample(point.x, tMs) - 0.12) / 0.76),
        y: clamp((this.filters[5].sample(point.y, tMs) - 0.13) / 0.74), active: true,
      }
    } else this.cursor = { ...this.cursor, active: false }
    const pinch = !!right && right.pinch < (this.pinched ? 0.43 : 0.29)
    this.edges.select ||= pinch && !this.pinched
    this.pinched = pinch
    this.edges.back ||= this.backHold.update(left?.gesture === 'Closed_Fist', tMs, T.backMs)
    this.edges.pauseToggle ||= this.pauseHold.update(left?.gesture === 'Thumb_Up' && right?.gesture === 'Thumb_Up', tMs, T.pauseMs)
    const open = left ? clamp((left.open - c.closed) / Math.max(0.2, c.open - c.closed)) : 0.5
    const closed = this.closeHold.update(!!left && open < 0.35, tMs, T.gripMs)
    const opened = this.openHold.update(!!left && open > 0.60, tMs, T.gripMs)
    if (!left || !right) return
    const lx = this.filters[0].sample(left.palm.x, tMs)
    const ly = this.filters[1].sample(left.palm.y, tMs)
    const rx = this.filters[2].sample(right.palm.x, tMs)
    const ry = this.filters[3].sample(right.palm.y, tMs)
    const spread = (rx - lx) * this.aspect
    const delta = Math.abs(spread) < 0.09 ? 0 : Math.atan2(ly - ry, Math.max(0.09, spread)) - c.wheel
    const angle = delta * 180 / Math.PI
    this.intent = {
      ...this.intent, heliTargetX: clamp((rx - c.xmin) / Math.max(0.1, c.xmax - c.xmin)) * 2 - 1,
      winchTarget: 1 - clamp((ly - c.ymin) / Math.max(0.1, c.ymax - c.ymin)),
      gripClosed: closed || (this.intent.gripClosed && !opened),
      steer: Math.sign(angle) * clamp((Math.abs(angle) - 4) / 31),
      throttle: clamp(((ly + ry) / 2 - c.low) / Math.max(0.1, c.high - c.low)),
    }
  }

  get previewIntent() { return this.intent }

  poll(now: number): ControlIntent {
    const elapsed = now - this.lastBoth
    const trackingState = elapsed > T.lossMs ? 'lost' : elapsed > T.graceMs ? 'degraded' : 'ok'
    const fresh = this.frame && now - this.frame.tMs < T.graceMs
    const result: ControlIntent = {
      ...this.intent, ...this.edges, trackingState,
      select: !!fresh && this.edges.select, back: !!fresh && this.edges.back,
      pauseToggle: !!fresh && trackingState === 'ok' && this.edges.pauseToggle,
      cursor: { ...this.cursor, active: !!fresh && this.cursor.active },
    }
    this.edges = { select: false, back: false, pauseToggle: false }
    return result
  }
  dispose() {
    this.frame = null
    this.lastBoth = this.lastPoseBoth = -Infinity
    this.latestSamples = []
    this.filters.forEach(filter => filter.reset())
  }
}

export async function startCamera(provider: HandsIntentProvider, video: HTMLVideoElement, signal: AbortSignal) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open the game in Chromium on HTTPS or localhost to use a webcam.')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }, audio: false,
  })
  const stopTracks = () => stream.getTracks().forEach(track => track.stop())
  let recognizer: import('@mediapipe/tasks-vision').GestureRecognizer | undefined
  let raf = 0
  let frameCallback = 0
  const stop = () => {
    stopTracks()
    cancelAnimationFrame(raf)
    if (frameCallback) video.cancelVideoFrameCallback?.(frameCallback)
    recognizer?.close()
    recognizer = undefined
    video.srcObject = null
    provider.dispose()
  }
  try {
    signal.throwIfAborted()
    signal.addEventListener('abort', stop, { once: true })
    video.srcObject = stream
    await video.play()
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
    const dir = new URL(import.meta.env.BASE_URL + 'mediapipe/', document.baseURI).href
    const files = await FilesetResolver.forVisionTasks(dir.replace(/\/$/, ''))
    const create = (delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(files, {
      baseOptions: { modelAssetPath: dir + 'gesture_recognizer.task', delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.53, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    })
    signal.throwIfAborted()
    let delegate: 'GPU' | 'CPU' = 'GPU'
    try { recognizer = await create('GPU') } catch {
      signal.throwIfAborted()
      delegate = 'CPU'
      recognizer = await create('CPU')
    }
    signal.throwIfAborted()
    let previous = -1
    let lastInference = -Infinity
    const ingest = (result: GestureRecognizerResult, now: number) =>
      provider.ingest(result.landmarks.map((points, index) => extractHand(points,
        result.handedness[index]?.[0]?.categoryName.toLowerCase() === 'left' ? 'left' : 'right',
        result.gestures[index]?.[0]?.categoryName ?? 'None', provider.aspect)), now)
    const loop = (now: number) => {
      if (!recognizer || signal.aborted) return
      if (video.readyState >= 2 && now - lastInference >= 27 && previous !== video.currentTime && !document.hidden) {
        previous = video.currentTime
        lastInference = now
        provider.aspect = video.videoWidth / Math.max(1, video.videoHeight)
        try { ingest(recognizer.recognizeForVideo(video, now), now) } catch { provider.ingest([], now) }
      }
      if (typeof video.requestVideoFrameCallback === 'function') frameCallback = video.requestVideoFrameCallback(loop)
      else raf = requestAnimationFrame(loop)
    }
    loop(performance.now())
    return { delegate }
  } catch (error) {
    signal.removeEventListener('abort', stop)
    stop()
    throw error
  }
}
