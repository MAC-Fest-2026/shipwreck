export interface ControlIntent {
  heliTargetX: number
  winchTarget: number
  gripClosed: boolean
  steer: number
  throttle: number
  cursor: { x: number; y: number; active: boolean }
  select: boolean
  back: boolean
  pauseToggle: boolean
  trackingState: 'ok' | 'degraded' | 'lost'
}
export interface IntentProvider {
  poll(tMs: number): ControlIntent
  dispose(): void
}
export const neutralIntent: ControlIntent = {
  heliTargetX: -0.15, winchTarget: 0.24, gripClosed: false, steer: 0, throttle: 0.55,
  cursor: { x: 0.5, y: 0.5, active: false }, select: false, back: false, pauseToggle: false,
  trackingState: 'ok',
}

export class ReplayIntentProvider implements IntentProvider {
  constructor(private readonly sample: (tMs: number) => ControlIntent) {}
  poll(tMs: number) { return this.sample(tMs) }
  dispose() {}
}
