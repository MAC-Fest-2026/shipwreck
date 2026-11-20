import { clamp } from '../core/math'
import type { HandSample } from './hands'

export class HandEmulator {
  enabled = false
  visible = true
  pose = 'Open_Palm'
  readonly palms = [{ x: 0.35, y: 0.55 }, { x: 0.65, y: 0.55 }]

  move(index: number, x: number, y: number) {
    this.palms[index].x = clamp(x, 0.07, 0.93)
    this.palms[index].y = clamp(y, 0.08, 0.92)
  }

  sample(): HandSample[] {
    if (!this.visible) return []
    return this.palms.map((palm, index) => ({
      palm: { ...palm }, tip: { x: palm.x, y: palm.y + 0.035 }, pinch: 0.7, label: index ? 'right' : 'left',
      open: index || this.pose !== 'Closed_Fist' ? 1.85 : 1.04,
      gesture: index && this.pose === 'Closed_Fist' ? 'Open_Palm' : this.pose,
      landmarks: Array.from({ length: 21 }, () => ({ ...palm })),
    }))
  }
}
