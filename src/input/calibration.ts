import { clamp, lerp } from '../core/math'
import { defaults, type Calibration, type HandFrame, type HandSample } from './hands'

export const instructions = [
  'Raise only your left palm, then raise only your right palm.',
  'Sweep your right palm sideways. Raise and lower your left palm. Then raise and lower both together.',
  'Open your left palm wide, then close it into a fist.',
  'Hold your palms comfortably like a level wheel, then open both palms to finish.',
]

export class Calibrator {
  step = 0
  side = 0
  elapsed = 0
  private hold = 0
  private labels: string[] = []
  private x = [1, 0]
  private y = [1, 0]
  private both = [1, 0]
  private open = 0
  private closed = 3
  private neutral = 0
  get value(): Calibration {
    const shrink = (range: number[], start: number, end: number) => range[1] - range[0] < 0.13
      ? [start, end] : [lerp(range[0], range[1], 0.05), lerp(range[1], range[0], 0.05)]
    const [xmin, xmax] = shrink(this.x, defaults.xmin, defaults.xmax)
    const [ymin, ymax] = shrink(this.y, defaults.ymin, defaults.ymax)
    const [low, high] = shrink(this.both, defaults.low, defaults.high)
    return { xmin, xmax, ymin, ymax, low, high,
      open: this.open - this.closed > 0.2 ? this.open : defaults.open,
      closed: this.open - this.closed > 0.2 ? this.closed : defaults.closed,
      swap: this.labels[0] === 'right' && this.labels[1] === 'left',
      wheel: clamp(this.neutral, -0.4, 0.4),
    }
  }

  tick(dt: number, frame: HandFrame | null, samples: HandSample[], aspect: number) {
    const { left, right } = frame ?? { left: null, right: null }
    if (this.step === 0) {
      this.hold = samples.length === 1 && samples[0].gesture === 'Open_Palm' ? this.hold + dt : 0
      if (this.side === 1) {
        if (samples.length === 0) this.side = 2
        return
      }
      if (this.hold >= 0.7) {
        this.labels.push(samples[0].label)
        this.hold = 0
        if (this.side === 2) this.next()
        else this.side = 1
      }
    } else if (left && right) {
      this.elapsed += dt
      if (this.step === 1) {
        const extend = (range: number[], value: number) => {
          range[0] = Math.min(range[0], value)
          range[1] = Math.max(range[1], value)
        }
        extend(this.x, right.palm.x)
        extend(this.y, left.palm.y)
        extend(this.both, (left.palm.y + right.palm.y) / 2)
        if (this.elapsed > 7) this.next()
      } else if (this.step === 2) {
        if (left.gesture === 'Open_Palm') this.open = Math.max(this.open, left.open)
        if (left.gesture === 'Closed_Fist') this.closed = Math.min(this.closed, left.open)
        if (this.open - this.closed > 0.2 && this.elapsed > 2.0) this.next()
      } else if (this.step === 3) {
        const angle = Math.atan2(left.palm.y - right.palm.y, Math.max(0.09, (right.palm.x - left.palm.x) * aspect))
        this.neutral = lerp(this.neutral, angle, 0.04)
      }
    }
  }

  next() {
    this.step = Math.min(3, this.step + 1)
    this.elapsed = 0
    this.hold = 0
  }
}
