import { clamp } from '../core/math'
import { neutralIntent, type ControlIntent, type IntentProvider } from './intent'

export class KeyboardMouseIntentProvider implements IntentProvider {
  private readonly abort = new AbortController()
  private readonly keys = new Set<string>()
  private intent = { ...neutralIntent }
  private lastTime = 0
  private pressed = false
  active = false
  constructor() {
    const { signal } = this.abort
    window.addEventListener('pointermove', event => {
      if (!this.active) return
      this.intent.heliTargetX = clamp(event.clientX / innerWidth, 0, 1) * 2 - 1
      this.intent.winchTarget = clamp((event.clientY / innerHeight - 0.2) / 0.60)
    }, { signal })
    window.addEventListener('pointerdown', event => {
      if (this.active && event.button === 0 && !(event.target as HTMLElement).closest('button, input, select')) this.pressed = true
    }, { signal })
    window.addEventListener('pointerup', () => { this.pressed = false }, { signal })
    window.addEventListener('keydown', event => {
      if ((event.target as HTMLElement).matches('input, select, textarea')) return
      if (this.active && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
      this.keys.add(event.code)
    }, { signal })
    window.addEventListener('keyup', event => this.keys.delete(event.code), { signal })
    window.addEventListener('blur', () => { this.keys.clear(); this.pressed = false }, { signal })
  }
  poll(now: number): ControlIntent {
    const dt = Math.min(0.08, (now - this.lastTime) / 1000)
    this.lastTime = now
    const axis = (pos: string, neg: string) => Number(this.keys.has(pos)) - Number(this.keys.has(neg))
    this.intent.heliTargetX = clamp(this.intent.heliTargetX + axis('ArrowRight', 'ArrowLeft') * dt * 0.63, -1, 1)
    this.intent.winchTarget = clamp(this.intent.winchTarget + axis('ArrowDown', 'ArrowUp') * dt * 0.61)
    this.intent.throttle = clamp(this.intent.throttle + axis('KeyW', 'KeyS') * dt * 0.65)
    return { ...this.intent, steer: axis('KeyD', 'KeyA'), gripClosed: this.pressed || this.keys.has('KeyF') }
  }
  dispose() { this.abort.abort() }
}
