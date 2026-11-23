import { clamp, lerp } from '../core/math'
import { tuning } from './tuning'
import { readSettings, type Settings } from './settings'
import { Radio } from '../audio/radio'
import { Calibrator } from '../input/calibration'
import { defaults, HandsIntentProvider, Hold, loadCalibration, startCamera } from '../input/hands'
import { KeyboardMouseIntentProvider } from '../input/keyboard'
import { HandEmulator } from '../input/emulator'
import { neutralIntent, ReplayIntentProvider, type ControlIntent } from '../input/intent'
import { isCinematic, Session } from '../game/session'
import { pilotBot } from '../game/replay'
import type { GameEvent } from '../game/events'
import type { InputMode, RunRecord } from '../game/score'
import { ScoreRepository } from '../persistence/scores'
import type { GameRenderer } from '../render/renderer'
import { setWaveIntensity } from '../sim/water'

export type Screen = 'title' | 'camera' | 'calibration' | 'callsign' | 'briefing' | 'game' | 'leaderboard' | 'settings'
type CameraState = 'off' | 'loading' | 'live' | 'error'
const put = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Browser storage may be restricted. */ }
}
const overlaySkeleton = [
  [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17],
]
const query = new URLSearchParams(location.search)

export class Controller {
  screen: Screen = 'title'
  mode: InputMode = 'keyboardMouse'
  overlay: 'pause' | 'tracking' | 'graphics' | null = null
  settings = readSettings()
  game: Session | null = null
  recent: RunRecord | null = null
  history: RunRecord[] = []
  saving: 'idle' | 'saving' | 'saved' | 'error' = 'idle'
  callsign = 'MAVERICK'
  letters = ['S', 'A', 'R']
  camera: CameraState = 'off'
  cameraNote = ''
  leaderBack: Screen = 'title'
  status = ''
  loadingStart: 'school' | 'mission' | null = null
  calibrating = new Calibrator()
  calibration = loadCalibration()
  settingsReturn: Screen = 'title'
  calibrateReturn: Screen = 'callsign'
  readonly hands = new HandsIntentProvider(this.calibration ?? defaults)
  readonly fallback = new KeyboardMouseIntentProvider()
  readonly emulator = new HandEmulator()
  readonly radio = new Radio(this.settings)
  readonly scores = new ScoreRepository()
  readonly kiosk = query.has('kiosk')
  readonly debug = import.meta.env.DEV && query.has('debug') && !this.kiosk
  readonly vm: { fps: number; calls: number; triangles: number; scale: number } = { fps: 0, calls: 0, triangles: 0, scale: 1 }
  readonly video: HTMLVideoElement
  readonly skeleton: HTMLCanvasElement
  readonly cursor: HTMLDivElement
  readonly stage: HTMLElement
  get deckMarker() { return this.renderer?.deckMarker }
  toast: { text: string; end: number; points?: number; type: GameEvent['type'] } | null = null
  trackingProgress = 0
  startProgress = 0
  skipProgress = 0
  clearOpen = false
  clearProgress = 0
  leaderboardToday = false
  leaderboardAssists = 'all'
  now = performance.now()
  private cameraRequest: AbortController | null = null
  private renderer: GameRenderer | null = null
  private assetLoad: Promise<boolean> | null = null
  private assetsReady = false
  private rendering = false
  private frame = 0
  private previous = 0
  private accumulator = 0
  private uiAt = 0
  private dirty = true
  private lastAction = performance.now()
  private enteredAt = performance.now()
  private arrivedAt = 0
  private startHold = new Hold()
  private ignorePauseUntil = 0
  private skipHold = new Hold()
  private clearHold = new Hold()
  private clearArmed = false
  private recoveryHold = new Hold()
  private calibrationHold = new Hold()
  private target: HTMLElement | null = null
  private targetSince = 0
  private firedTarget = false
  private blendsUntil = 0
  private blendOrigin = neutralIntent
  private replay: ReplayIntentProvider | null = null
  private replayFast = false
  private savingRun: string | null = null

  constructor(private readonly renderView: (control: Controller) => void) {
    setWaveIntensity(this.settings.waveIntensity)
    this.stage = document.querySelector('#stage')!
    this.stage.hidden = true
    this.video = document.querySelector('#camera-feed')!
    this.skeleton = document.querySelector('#landmarks')!
    this.cursor = document.querySelector('#cursor')!
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.screen === 'game' && !this.overlay && !this.replayFast) this.pause()
    })
    window.addEventListener('keydown', event => {
      if ((event.target as HTMLElement).matches('input, textarea, select')) return
      this.lastAction = performance.now()
      if (event.code === 'Escape') {
        event.preventDefault()
        this.back()
      }
      if (event.code === 'Space' && this.screen === 'game' && !this.overlay && event.target === document.body) {
        if (this.game && (this.game.phase === 'school' || isCinematic(this.game.phase))) {
          event.preventDefault()
          this.skip()
        }
      }
    })
    window.addEventListener('pointerdown', () => { this.lastAction = performance.now(); this.radio.unlock() })
    window.addEventListener('pointermove', () => { this.lastAction = performance.now() })
    void this.refreshHistory()
    requestAnimationFrame(this.tick)
  }

  private tick = (ms: number) => {
    this.frame++
    this.now = ms
    const dt = clamp((ms - (this.previous || ms)) / 1000, 0, 0.2)
    this.previous = ms
    if (this.emulator.enabled && this.mode === 'hands') this.hands.ingest(this.emulator.sample(), ms)
    const throttleMode = this.game?.phase === 'boat' ? this.settings.boatThrottle : undefined
    const input = this.mode === 'hands' ? this.hands.poll(ms)
      : this.fallback.poll(ms, throttleMode, this.screen === 'game' && !this.overlay)
    this.handleTracking(input, dt)
    this.handleGestures(input)
    this.positionCamera()
    const session = this.game
    if (this.mode === 'hands' && ms - this.hands.lastBoth < 175) this.lastAction = ms
    if (session && this.screen === 'game' && !this.overlay) {
      if (this.replayFast) {
        for (let i = 0; i < 128 && !session.record; i++) {
          if (isCinematic(session.phase) || session.phase === 'school') session.skip()
          else session.tick(tuning.tick, this.replay!.poll(session.activeTime * 1000))
        }
      } else {
        this.accumulator += dt
        while (this.accumulator >= tuning.tick) {
          const source = this.replay ? this.replay.poll(session.activeTime * 1000) : this.recoveringIntent(input)
          session.tick(tuning.tick, source)
          this.accumulator -= tuning.tick
        }
      }
    } else this.accumulator = 0
    if (session?.record && this.savingRun !== session.record.runId) {
      this.arrivedAt = ms
      this.persist(session.record)
    }
    if (this.kiosk && this.screen !== 'title') {
      if (session?.record && this.screen === 'game' && ms - this.arrivedAt > 20000) this.openLeaderboard()
      if (ms - this.lastAction > 60000) this.quit()
    }
    if (session && (this.screen === 'game' || this.previewingSettings && this.dirty)) {
      if (this.overlay === 'graphics' || session.phase === 'results' && this.frame % 3 !== 0) {
        // The title art remains available while a graphics context recovers.
      } else if (this.renderer && (session.phase !== 'results' || this.frame % 3 === 0)) {
        this.renderer.draw(session, dt, this.settings, this.settings.reduceMotion ? 1 : ms / 1000)
        Object.assign(this.vm, this.renderer.stats)
      }
    }
    this.radio.update(ms, {
      active: this.screen === 'game' && !this.overlay,
      phase: session?.phase,
      pressure: session?.rescue.threat ?? 0,
      flightSpeed: clamp(Math.abs(session?.rescue.velocity ?? 0) / tuning.rescue.speed),
      boatSpeed: clamp((session?.boat.speed ?? 0) / tuning.boat.speed),
      throttle: clamp(session?.desired.throttle ?? 0),
    })
    if (this.toast && ms > this.toast.end) this.toast = null
    if (this.dirty || ms - this.uiAt > 64 && (this.screen === 'game' || this.mode === 'hands' || this.camera === 'loading')) {
      this.dirty = false
      this.uiAt = ms
      this.renderView(this)
    }
    requestAnimationFrame(this.tick)
  }

  go(screen: Screen) {
    this.screen = screen
    this.enteredAt = this.lastAction = this.now
    this.stage.hidden = screen !== 'game' && !this.previewingSettings
    this.setTarget(null)
    this.dirty = true
    this.fallback.active = this.mode === 'keyboardMouse' && screen === 'game'
    if (screen !== 'game') { this.cursor.style.display = 'none'; this.radio.stopLine() }
  }

  async activateCamera() {
    this.radio.unlock()
    this.emulator.enabled = false
    this.go('camera')
    this.cameraRequest?.abort()
    const request = this.cameraRequest = new AbortController()
    this.camera = 'loading'
    this.status = ''
    this.cameraNote = 'Allow webcam access in your browser to continue.'
    this.mode = 'hands'
    try {
      const { delegate } = await startCamera(this.hands, this.video, request.signal)
      if (request.signal.aborted) return
      this.camera = 'live'
      this.cameraNote = delegate === 'GPU' ? 'Webcam ready · GPU tracking' : 'Webcam ready · CPU tracking'
    } catch (error) {
      if (request.signal.aborted) return
      this.camera = 'error'
      this.cameraNote = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Camera access was denied. Allow access in your browser or use keyboard controls.'
        : 'The webcam or tracking engine could not start. Check your camera and try again.'
    }
    this.dirty = true
  }

  useKeyboard(destination: Screen = 'callsign') {
    this.radio.unlock()
    this.cameraRequest?.abort()
    this.cameraRequest = null
    this.camera = 'off'
    this.emulator.enabled = false
    this.mode = 'keyboardMouse'
    this.overlay = null
    if (this.game && (this.screen === 'game' || this.screen === 'calibration' && this.calibrateReturn === 'game')) {
      this.go('game')
      this.game.inputMode = 'keyboardMouse'
      this.game.paused = this.game.autoStop = false
      this.fallback.active = true
    } else this.go(destination)
    this.dirty = true
  }

  stopCamera() {
    this.useKeyboard(this.screen === 'camera' || this.screen === 'calibration' ? 'title' : this.screen)
  }

  async refreshHistory() {
    try { this.history = await this.scores.listRuns() } catch { this.status = 'Score storage is unavailable in this browser session.' }
    this.dirty = true
  }

  private persist(record: RunRecord) {
    this.savingRun = record.runId
    this.recent = record
    this.saving = 'saving'
    this.dirty = true
    void this.scores.saveRun(record).then(async () => {
      this.saving = 'saved'
      await this.refreshHistory()
    }).catch(() => {
      this.saving = 'error'
      this.dirty = true
    })
  }

  retrySave() { if (this.recent) this.persist(this.recent) }

  beginCalibration(destination: Screen = 'callsign') {
    this.calibrationHold = new Hold()
    this.calibrating = new Calibrator()
    this.calibrateReturn = destination
    this.go('calibration')
  }

  finishCalibration(saved = false) {
    this.calibration = saved && this.calibration ? this.calibration : this.calibrating.value
    this.hands.calibration = this.calibration
    put('shipwreck-calibration-v1', this.calibration)
    this.go(this.calibrateReturn)
    if (this.calibrateReturn === 'game') {
      this.overlay = 'pause'
      if (this.game) this.game.paused = true
    }
  }

  selectCallsign(value: string) {
    this.callsign = value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14) || 'MAVERICK'
    this.go('briefing')
  }

  changeLetter(i: number, delta: number) {
    this.letters[i] = String.fromCharCode(65 + (this.letters[i].charCodeAt(0) - 65 + delta + 26) % 26)
    this.dirty = true
  }

  preloadAssets() {
    this.assetLoad ??= import('../render/renderer').then(async ({ GameRenderer }) => {
      this.renderer = new GameRenderer(this.stage, lost => {
        if (lost && this.screen === 'game') {
          this.overlay = 'graphics'
          if (this.game) this.game.paused = true
        } else if (!lost && this.screen === 'game') this.pause()
        this.dirty = true
      })
      await this.renderer.ready
      const preview = new Session(tuning.seed, '', 'replay', this.settings, false, () => {})
      await this.renderer.warmup(preview, this.settings)
      this.assetsReady = true
      return true
    }).catch(() => false)
    return this.assetLoad
  }

  async launch(school: boolean, mode = this.mode, fast = false) {
    if (this.rendering || this.renderer?.lost) return
    this.radio.unlock()
    this.rendering = true
    this.loadingStart = this.assetsReady ? null : school ? 'school' : 'mission'
    this.status = ''
    this.dirty = true
    const origin = this.screen
    try {
      const ready = await this.preloadAssets()
      if (this.screen !== origin) return
      if (!ready && !fast) throw new Error('Renderer unavailable')
      this.radio.reset()
      this.overlay = null
      this.saving = 'idle'
      this.recent = null
      this.toast = null
      this.mode = mode
      this.game = new Session(tuning.seed, this.callsign, mode, this.settings, school,
        event => this.event(event), this.settings.survivorCount)
      this.replayFast = fast
      this.replay = mode === 'replay' ? new ReplayIntentProvider(() => pilotBot(this.game!)) : null
      this.status = ''
      if (ready && !fast) this.renderer?.draw(this.game, 0, this.settings, this.now / 1000)
      this.go('game')
    } catch {
      this.status = 'WebGL2 could not start. Open in Chromium with hardware acceleration enabled.'
    } finally {
      this.rendering = false
      this.loadingStart = null
      this.dirty = true
    }
  }

  private event(event: GameEvent) {
    const session = this.game
    if (!session) return
    const boat = ['boat', 'outro', 'handoff'].includes(session.phase)
    const eligible = new Set(session.rescue.survivors.filter(s => boat ? s.state === 'saved' : s.state !== 'lost').map(s => s.id))
    this.radio.event(event, eligible, this.now, boat ? session.boat.x : 0)
    if (event.text) {
      const warning = event.type.includes('WARNING') || event.type === 'SHARK_TELEGRAPH'
      this.toast = { text: event.text, points: event.points, end: this.now + (warning ? 3900 : 2500), type: event.type }
    }
  }

  skip() {
    if (!this.game || this.overlay) return
    this.radio.stopLine()
    this.game.skip()
    this.ignorePauseUntil = this.now + 850
    this.setTarget(null)
    this.enteredAt = this.now
    this.dirty = true
  }

  pause() {
    if (!this.game || this.game.record || this.screen !== 'game') return
    this.overlay = 'pause'
    this.game.paused = true
    this.radio.stopLine()
    this.setTarget(null)
    this.dirty = true
  }

  resume() {
    if (!this.game || this.renderer?.lost) return
    this.overlay = null
    this.game.paused = false
    this.game.autoStop = false
    this.enteredAt = this.now
    this.setTarget(null)
    this.dirty = true
  }

  quit() {
    if (this.game && !this.game.record) this.persist(this.game.finish('abandoned'))
    this.game = null
    this.overlay = null
    this.clearOpen = false
    this.go('title')
  }

  openSettings() {
    this.settingsReturn = this.screen
    if (this.screen === 'game' && !this.overlay) this.pause()
    this.go('settings')
  }

  private get previewingSettings() {
    return this.screen === 'settings' && this.settingsReturn === 'game' && !!this.game
  }

  changeSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings = { ...this.settings, [key]: value }
    if (key === 'waveIntensity') this.settings.waveIntensity = setWaveIntensity(this.settings.waveIntensity)
    else {
      this.radio.configure(this.settings)
      if (this.game && key !== 'survivorCount') this.game.assist = { ...this.game.assist, [key]: value }
    }
    put('shipwreck-settings-v1', this.settings)
    this.dirty = true
  }

  openLeaderboard() {
    this.leaderBack = this.screen
    this.go('leaderboard')
    void this.refreshHistory()
  }

  setFilter(key: 'today' | 'assists') {
    if (key === 'today') this.leaderboardToday = !this.leaderboardToday
    else this.leaderboardAssists = this.leaderboardAssists === 'all' ? 'pure' : this.leaderboardAssists === 'pure' ? 'assisted' : 'all'
    this.dirty = true
  }

  openClear() {
    this.clearOpen = true
    this.clearArmed = false
    this.clearHold = new Hold()
    this.dirty = true
  }

  cancelClear() { this.clearOpen = false; this.dirty = true }

  async clearScores() {
    this.clearOpen = false
    this.dirty = true
    try {
      await this.scores.clearAll()
      this.recent = null
      await this.refreshHistory()
    } catch { this.status = 'Score history could not be cleared.' }
  }

  nextPlayer() {
    this.game = null
    this.overlay = null
    if (this.mode === 'replay') this.mode = 'keyboardMouse'
    this.go('callsign')
  }

  back() {
    if (this.clearOpen) { this.cancelClear(); return }
    if (this.screen === 'settings') this.go(this.settingsReturn)
    else if (this.screen === 'leaderboard') this.go(this.leaderBack)
    else if (this.screen === 'briefing') this.go('callsign')
    else if (this.screen === 'camera') this.stopCamera()
    else if (this.screen === 'calibration') this.go(this.calibrateReturn === 'game' ? 'game' : 'camera')
    else if (this.screen === 'callsign') this.go('title')
    else if (this.screen === 'game' && this.game?.record) this.quit()
    else if (this.screen === 'game') {
      if (this.overlay === 'pause') this.resume()
      else this.pause()
    }
  }

  private recoveringIntent(input: ControlIntent): ControlIntent {
    if (this.now >= this.blendsUntil || this.mode !== 'hands') return input
    const t = clamp(1 - (this.blendsUntil - this.now) / tuning.hands.blendMs)
    return { ...input,
      heliTargetX: lerp(this.blendOrigin.heliTargetX, input.heliTargetX, t),
      winchTarget: lerp(this.blendOrigin.winchTarget, input.winchTarget, t),
      throttle: lerp(this.blendOrigin.throttle, input.throttle, t),
      steer: input.steer * t, gripClosed: t < 1 ? this.blendOrigin.gripClosed : input.gripClosed,
    }
  }

  private handleTracking(input: ControlIntent, dt: number) {
    const fresh = this.hands.frame && this.now - this.hands.frame.tMs < 300
    const bothOpen = !!fresh && this.hands.frame?.left?.gesture === 'Open_Palm' && this.hands.frame?.right?.gesture === 'Open_Palm'
    if (this.mode === 'hands' && this.camera === 'live') {
      if (this.screen === 'camera' || this.screen === 'title') {
        if (this.startHold.update(bothOpen && this.now - this.enteredAt > 450, this.now, 850)) {
          if (this.calibration) this.go('callsign')
          else this.beginCalibration()
        }
        this.startProgress = this.startHold.progress
      }
      if (this.screen === 'calibration') {
        this.calibrating.tick(dt, fresh ? this.hands.frame : null, fresh ? this.hands.latestSamples : [], this.hands.aspect)
        if (this.calibrating.step === 3) this.hands.calibration = this.calibrating.value
        if (this.calibrationHold.update(this.calibrating.step === 3 && this.calibrating.elapsed >= 4.5 && bothOpen,
          this.now, 1100)) this.finishCalibration()
        this.startProgress = this.calibrationHold.progress
      }
    }
    const session = this.game
    if (this.mode !== 'hands' || this.screen !== 'game' || !session || session.record) return
    const gameplay = session.phase === 'rescue' || session.phase === 'boat' || session.phase === 'school'
    if (gameplay && !this.overlay && input.trackingState === 'lost') {
      this.overlay = 'tracking'
      session.autoStop = true
      this.radio.stopLine()
      this.setTarget(null)
      this.dirty = true
    }
    if (this.overlay === 'tracking') {
      if (this.recoveryHold.update(bothOpen && input.trackingState === 'ok', this.now, tuning.hands.recoveryMs)) {
        this.blendOrigin = { ...neutralIntent, heliTargetX: session.rescue.x / tuning.rescue.span,
          winchTarget: (session.rescue.cable - tuning.rescue.cableMin) / (tuning.rescue.cableMax - tuning.rescue.cableMin),
          gripClosed: session.rescue.grip, throttle: session.boat.speed / 16 }
        this.blendsUntil = this.now + tuning.hands.blendMs
        this.resume()
      }
      this.trackingProgress = this.recoveryHold.progress
    } else this.recoveryHold.update(false, this.now, tuning.hands.recoveryMs)
  }

  private setTarget(target: HTMLElement | null) {
    if (target === this.target) return
    this.target?.classList.remove('gesture-hover')
    this.target = target
    this.target?.classList.add('gesture-hover')
    this.targetSince = this.now
    this.firedTarget = false
  }

  private handleGestures(input: ControlIntent) {
    if (this.mode !== 'hands') return
    const session = this.game
    const activePlay = this.screen === 'game' && !!session && !this.overlay && !session.record
    if (this.clearOpen) {
      const bothFists = input.trackingState === 'ok' && this.now - this.hands.lastBoth < 175
        && this.hands.frame?.left?.gesture === 'Closed_Fist' && this.hands.frame.right?.gesture === 'Closed_Fist'
      if (!bothFists) this.clearArmed = true
      if (this.clearHold.update(this.clearArmed && bothFists, this.now, 2000)) void this.clearScores()
      this.clearProgress = this.clearHold.progress
      if (bothFists) return
    }
    if (input.pauseToggle && this.screen === 'game' && session && !session.record
      && (!isCinematic(session.phase) || this.overlay === 'pause') && this.now >= this.ignorePauseUntil) {
      if (this.overlay === 'pause') this.resume()
      else if (!this.overlay) this.pause()
    }
    const skipPose = activePlay && isCinematic(session.phase) && this.now - this.hands.lastBoth < 175
      && this.hands.frame?.left?.gesture === 'Thumb_Up' && this.hands.frame.right?.gesture === 'Thumb_Up'
    if (this.skipHold.update(skipPose, this.now, 1000)) this.skip()
    this.skipProgress = this.skipHold.progress
    if (!activePlay && input.back && this.now - this.enteredAt > 550 && this.overlay !== 'tracking') this.back()
    const selectingDuringPlay = activePlay && (session.phase === 'school' || isCinematic(session.phase))
    const show = input.cursor.active && (!this.emulator.enabled || this.emulator.pose === 'Pointing_Up')
      && (!activePlay || selectingDuringPlay)
    this.cursor.style.display = show ? '' : 'none'
    if (!show || this.now - this.enteredAt < 350) { this.setTarget(null); return }
    this.lastAction = this.now
    const x = input.cursor.x * innerWidth
    const y = (1 - input.cursor.y) * innerHeight
    this.cursor.style.transform = `translate(${x}px,${y}px)`
    const node = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('button[data-gesture]')
    this.setTarget(node?.disabled ? null : node ?? null)
    const progress = this.target ? clamp((this.now - this.targetSince) / tuning.hands.dwellMs) : 0
    this.cursor.style.setProperty('--dwell', String(progress))
    if (this.target && !this.firedTarget && (progress === 1 || input.select)) {
      this.firedTarget = true
      this.target.click()
    }
  }

  private positionCamera() {
    const slot = document.querySelector<HTMLElement>('[data-camera-slot]')
    const shell = this.video.parentElement!
    if (!slot || this.camera !== 'live') { shell.hidden = true; return }
    const rect = slot.getBoundingClientRect()
    shell.hidden = false
    shell.style.left = rect.left + 'px'; shell.style.top = rect.top + 'px'
    shell.style.width = rect.width + 'px'; shell.style.height = rect.height + 'px'
    if (this.frame % 2 !== 0) return
    const width = Math.round(rect.width * devicePixelRatio)
    const height = Math.round(rect.height * devicePixelRatio)
    if (this.skeleton.width !== width || this.skeleton.height !== height) {
      this.skeleton.width = width
      this.skeleton.height = height
    }
    const g = this.skeleton.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, width, height)
    const frame = this.hands.frame
    const cutoff = this.now - (frame?.tMs ?? -Infinity)
    if (!frame || cutoff > 180) return
    const imageWidth = Math.min(width, height * this.hands.aspect)
    const imageHeight = imageWidth / this.hands.aspect
    for (const [side, sample] of Object.entries({ left: frame.left, right: frame.right })) {
      if (!sample) continue
      const points = sample.landmarks.map(point => [
        (width - imageWidth) / 2 + point.x * imageWidth,
        (height - imageHeight) / 2 + (1 - point.y) * imageHeight,
      ])
      g.strokeStyle = g.fillStyle = side === 'left' ? '#ffb774' : '#74f1df'
      g.lineWidth = Math.max(1, width / 240)
      g.globalAlpha = 0.88
      overlaySkeleton.forEach(chain => {
        g.beginPath()
        chain.forEach((id, i) => {
          const [x, y] = points[id]
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        })
        g.stroke()
      })
      points.forEach(([x, y]) => {
        g.beginPath(); g.arc(x, y, Math.max(2, width / 155), 0, Math.PI * 2); g.fill()
      })
    }
  }

  enableEmulator() {
    if (!this.debug) return
    this.emulator.enabled = true
    this.mode = 'hands'
    this.hands.calibration = defaults
    this.go('callsign')
  }

  setupDebug() {
    if (!this.debug) return
    Object.assign(window, { shipwreck: {
      startReplay: (fast = false) => { this.callsign = 'REPLAY'; return this.launch(false, 'replay', fast) },
      useEmulator: () => this.enableEmulator(),
      showHands: (show: boolean) => { this.emulator.visible = show },
      setQuality: (quality: Settings['quality']) => this.changeSetting('quality', quality),
      getRun: () => this.game?.record ?? null,
      snapshot: () => ({ phase: this.game?.phase, overlay: this.overlay, screen: this.screen,
        time: this.game?.activeTime, saved: this.game?.rescue.saved, stats: this.vm, camera: this.camera }),
      skip: () => this.skip(),
      advanceToBoat: () => {
        if (!this.game || this.mode !== 'replay') return
        for (let i = 0; i < 60 * 180 && this.game.phase !== 'boat' && !this.game.record; i++) {
          if (isCinematic(this.game.phase)) this.game.skip()
          else this.game.tick(tuning.tick, pilotBot(this.game))
        }
      },
    } })
  }
}
