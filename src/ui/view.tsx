import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { tuning } from '../app/tuning'
import type { Controller } from '../app/controller'
import type { Settings } from '../app/settings'
import { clamp, clockLabel } from '../core/math'
import { instructions } from '../input/calibration'
import { courseLabel } from '../sim/boat'
import { maxSurvivors } from '../sim/rescue'
import { isCinematic } from '../game/session'
import { downloadRuns } from '../persistence/scores'
import type { RunRecord } from '../game/score'

const number = (n: number) => n.toLocaleString('en-US')
const time = (ms: number) => clockLabel(ms / 1000)
const presets = ['MAVERICK', 'SKYLARK', 'TIDERUNNER', 'STORMHAWK']
const R = tuning.rescue
const clock = '◷'

function Button({ children, action, variant = 'secondary', disabled = false, label }: {
  children: ComponentChildren; action: () => void; variant?: string; disabled?: boolean; label?: string
}) {
  return <button type="button" class={`action ${variant}`} data-gesture aria-label={label} disabled={disabled} onClick={action}>{children}</button>
}

function Beacon({ live = false }: { live?: boolean }) {
  return <i class={`beacon ${live ? 'live' : ''}`} aria-hidden="true" />
}

function Progress({ value }: { value: number }) {
  return <div class="progress" aria-hidden="true"><i style={{ width: `${clamp(value) * 100}%` }} /></div>
}

function Header({ c }: { c: Controller }) {
  return <header class="masthead">
    <button class="brand" data-gesture aria-label="SHIPWRECK home" onClick={() => c.quit()}>
      <span class="brand-mark" aria-hidden="true"><i /></span>
      <span>SHIPWRECK<small>MARITIME RESCUE</small></span>
    </button>
    <nav aria-label="Game menu">
      {c.camera === 'live' && <Button variant="quiet camera-label" action={() => c.stopCamera()}><Beacon live /> Stop camera</Button>}
      <Button variant="quiet" action={() => c.openLeaderboard()}>Leaderboard</Button>
      <Button variant="quiet settings-link" action={() => c.openSettings()}><span aria-hidden="true">⚙</span> Settings</Button>
    </nav>
  </header>
}

function Title({ c }: { c: Controller }) {
  const top = c.history.filter(row => row.settings.inputMode !== 'replay' && row.outcome === 'completed').slice(0, 3)
  return <>
    <Header c={c} />
    <main class="title-content">
      <div class="title-kicker mono"><Beacon /> DISTRESS SIGNAL RECEIVED</div>
      <h1>SHIPWRECK</h1>
      <div class="hero-rule" />
      <p class="hero-copy">Eight survivors. One way home.</p>
      <p class="hero-description">Fly the rescue helicopter, lift survivors from the storm, and get them to the island before the Megalodon closes in.</p>
      <div class="hero-actions">
        <Button variant="primary" action={() => c.camera === 'live' ? (c.calibration ? c.go('callsign') : c.beginCalibration()) : void c.activateCamera()}>
          <span class="camera-icon" aria-hidden="true" />
          <span>{c.camera === 'live' ? 'Begin rescue' : 'Play with hands'}</span><span class="chevron" aria-hidden="true">↗</span>
        </Button>
        <Button variant="secondary" action={() => c.useKeyboard()}>Keyboard &amp; mouse <span aria-hidden="true">→</span></Button>
      </div>
      <div class="hero-hint mono">{c.camera === 'live' ? 'RAISE BOTH PALMS TO BEGIN' : 'WEBCAM CONTROLS · VIDEO STAYS ON THIS DEVICE'}</div>
      {c.camera === 'live' && <Progress value={c.startProgress} />}
    </main>
    <footer class="title-footer">
      <div class="stages">
        <div><span class="mono">01</span><b>Helicopter rescue</b></div>
        <div><span class="mono">02</span><b>Island run</b></div>
      </div>
      <div class="title-records mono">{top.length ? top.map((r, index) => <span key={r.runId}>{index + 1}. {r.player.callsign} <b>{number(r.score)}</b></span>)
        : <span><i class="signal-bars" aria-hidden="true" /> LOCAL LEADERBOARD</span>}</div>
    </footer>
  </>
}

function CameraSlot({ className = '' }: { className?: string }) {
  return <div data-camera-slot class={`camera-slot ${className}`} aria-hidden="true"><div class="camera-frame" /></div>
}

function Camera({ c }: { c: Controller }) {
  const count = Number(!!c.hands.frame?.left) + Number(!!c.hands.frame?.right)
  return <section class="panel camera-panel" aria-labelledby="camera-title">
    <p class="kicker mono"><Beacon live={c.camera === 'live'} /> HAND CONTROLS</p>
    <h2 id="camera-title">{c.camera === 'error' ? 'Camera unavailable' : 'Camera check'}</h2>
    <p>{c.cameraNote}</p>
    {c.camera === 'live' && <>
      <CameraSlot />
      <div class="camera-status mono"><span>{count}/2 HANDS IN FRAME</span><span>LOCAL VIDEO</span></div>
      <p>Face a light and keep both palms in frame. Raise both palms to {c.calibration ? 'use your saved calibration' : 'calibrate'}.</p>
      <Progress value={c.startProgress} />
    </>}
    <div class="actions">
      <Button variant="primary" disabled={c.camera === 'loading'} action={() => {
        if (c.camera !== 'live') void c.activateCamera()
        else if (c.calibration) c.go('callsign')
        else c.beginCalibration()
      }}>{c.camera === 'loading' ? 'Connecting…' : c.camera === 'error' ? 'Retry camera' : 'Continue'} <span>→</span></Button>
      {c.camera === 'live' && c.calibration ? <Button action={() => c.beginCalibration()}>Recalibrate</Button>
        : <Button action={() => c.useKeyboard()}>Keyboard &amp; mouse</Button>}
      <Button variant="quiet" action={() => c.stopCamera()}>Back</Button>
    </div>
  </section>
}

function Calibration({ c }: { c: Controller }) {
  const step = c.calibrating.step
  const hint = step === 0 && c.calibrating.side === 1 ? 'Lower your left palm before raising your right.' : instructions[step]
  const names = ['Identify hands', 'Reach range', 'Grip range', 'Neutral wheel']
  const value = c.hands.previewIntent
  return <section class="panel calibration-panel" aria-labelledby="calibration-title">
    <p class="kicker mono"><Beacon live /> STEP {step + 1} / 4</p>
    <h2 id="calibration-title">Hand calibration</h2>
    <p class="hero-description">{hint}</p>
    <div class="calibration-layout">
      <div><CameraSlot /><div class="camera-status mono"><span>⟐ MIRRORED CAMERA</span><span>{c.hands.frame?.left && c.hands.frame?.right ? 'BOTH PALMS TRACKED' : 'SHOW YOUR HANDS'}</span></div></div>
      <div class="calibration-steps">
        {names.map((name, i) => <div key={name} class={i === step ? 'current' : i < step ? 'complete' : ''}>
          <span class="mono">{i < step ? '✓' : '0' + (i + 1)}</span>{name}</div>)}
        <div class="calibration-rail"><span class="mono">FLIGHT RAIL</span><Progress value={(value.heliTargetX + 1) / 2} />
          <span class="mono">WINCH LENGTH</span><Progress value={value.winchTarget} /></div>
      </div>
    </div>
    <Progress value={c.startProgress} />
    <div class="actions">
      <Button variant="primary" action={() => step === 3 ? c.finishCalibration() : c.calibrating.next()}>
        {step === 3 ? 'Confirm calibration' : 'Next step'} <span>→</span></Button>
      {c.calibration && <Button action={() => c.finishCalibration(true)}>Use saved</Button>}
      <Button variant="quiet" action={() => c.useKeyboard()}>Keyboard &amp; mouse</Button>
    </div>
  </section>
}

function Callsign({ c }: { c: Controller }) {
  const [custom, showCustom] = useState(false)
  const [typed, type] = useState('')
  return <section class="panel callsign-panel" aria-labelledby="callsign-title">
    <p class="kicker mono"><Beacon live /> FLIGHT CREW</p>
    <h2 id="callsign-title">Select callsign</h2>
    <p>{c.mode === 'hands' ? 'Point your right index finger, then hold or pinch to select.' : 'Choose a callsign for the local leaderboard.'}</p>
    <div class="callsign-grid">
      {presets.map(p => {
        const best = c.history.find(r => r.player.callsign === p)
        return <Button key={p} variant="call-card" action={() => c.selectCallsign(p)}><strong>{p}</strong>
          <span class="mono">{best ? 'BEST ' + number(best.score) + ' · RANK ' + best.rank : '—'}</span></Button>
      })}
    </div>
    {custom && <div class="custom-call">
      <div class="letter-picker">{c.letters.map((letter, i) => <div key={i}>
        <Button label={`Next letter ${i + 1}`} variant="letter-button" action={() => c.changeLetter(i, 1)}>↑</Button>
        <b>{letter}</b>
        <Button label={`Previous letter ${i + 1}`} variant="letter-button" action={() => c.changeLetter(i, -1)}>↓</Button>
      </div>)}</div>
      {c.mode !== 'hands' && <input value={typed} onInput={e => type(e.currentTarget.value)} maxLength={14} placeholder="Type a callsign" aria-label="Custom callsign" />}
      <Button variant="primary" action={() => c.selectCallsign(typed || c.letters.join(''))}>Use callsign <span>→</span></Button>
    </div>}
    <div class="actions">
      <Button action={() => showCustom(!custom)}>{custom ? 'Close custom callsign' : 'Custom callsign'}</Button>
      {c.camera === 'live' && <Button action={() => c.beginCalibration()}>Recalibrate</Button>}
      <Button variant="quiet" action={() => c.back()}>Back</Button>
    </div>
  </section>
}

function Briefing({ c }: { c: Controller }) {
  const hand = c.mode === 'hands'
  return <section class="panel briefing-panel" aria-labelledby="briefing-title">
    <p class="kicker mono"><Beacon /> CALLSIGN {c.callsign}</p>
    <h2 id="briefing-title">Flight briefing</h2>
    <div class="brief-grid">
      <article>
        <p class="kicker mono">01 / HELICOPTER RESCUE</p><h3>Get them aboard.</h3>
        <dl><dt>Fly laterally</dt><dd>{hand ? 'Move your right palm' : 'Mouse X or ← / →'}</dd>
          <dt>Raise / lower winch</dt><dd>{hand ? 'Move your left palm up / down' : 'Mouse Y or ↑ / ↓'}</dd>
          <dt>Grab / release</dt><dd>{hand ? 'Close / open your left palm' : 'Hold / release F or left click'}</dd></dl>
        <p>Lower the claw over a survivor. Carry them to the green deck and open low for a safe landing.</p>
      </article>
      <article>
        <p class="kicker mono">02 / ISLAND RUN</p><h3>Follow the light.</h3>
        <dl><dt>Steer</dt><dd>{hand ? 'Tilt your palms like a wheel' : 'A / D'}</dd>
          <dt>Throttle</dt><dd>{hand ? 'Raise / lower both palms' : 'W / S'}</dd>
          <dt>Pause</dt><dd>{hand ? 'Hold both thumbs up' : 'Esc'}</dd></dl>
        <p>Turn away from shark wakes. Lower throttle on approach and aim between the channel lights.</p>
      </article>
    </div>
    {c.status && <p role="status" class="status">{c.status}</p>}
    <div class="actions">
      <Button variant="primary" disabled={c.status === 'Loading rescue scene…'} action={() => void c.launch(true)}>Flight school <span>→</span></Button>
      <Button disabled={c.status === 'Loading rescue scene…'} action={() => void c.launch(false)}>Start mission <span>→</span></Button>
      <Button variant="quiet" action={() => c.back()}>Back</Button>
    </div>
  </section>
}

function UserSettings({ c }: { c: Controller }) {
  const switches: [keyof Settings, string][] = [
    ['captions', 'Subtitles'], ['captionPlate', 'Subtitle background'], ['captionLarge', 'Large subtitles'], ['spoken', 'Spoken dialogue'],
    ['preview', 'Webcam preview'], ['reduceMotion', 'Reduced motion'], ['flashes', 'Lightning flashes'], ['contrast', 'High contrast'],
    ['aim', 'Pickup assist'], ['steering', 'Steering assist'], ['winchOnly', 'Automatic claw'],
  ]
  const volumes = [['master', 'Master'], ['music', 'Music'], ['effects', 'Effects'], ['voice', 'Voice']] as const
  return <section class="panel settings-panel" aria-labelledby="settings-title">
    <p class="kicker mono"><Beacon live /> CONTROL PANEL</p>
    <h2 id="settings-title">Settings</h2>
    <div class="settings-grid">
      <div class="settings-block"><h3>Sound</h3>
        {volumes.map(([key, label]) => <div class="setting-row" key={key}><span>{label}</span><div class="stepper">
          <Button variant="letter-button" label={`Lower ${label} volume`} action={() => c.changeSetting(key, clamp(c.settings[key] - 0.1))}>−</Button>
          <strong>{Math.round(c.settings[key] * 100)}%</strong>
          <Button variant="letter-button" label={`Raise ${label} volume`} action={() => c.changeSetting(key, clamp(c.settings[key] + 0.1))}>+</Button>
        </div></div>)}
        <div class="setting-row"><span>Graphics</span><Button action={() => c.changeSetting('quality',
          c.settings.quality === 'low' ? 'medium' : c.settings.quality === 'medium' ? 'high' : 'low')}>{c.settings.quality} ↻</Button></div>
        <div class="setting-row"><span>Cable stabilization</span><Button action={() => c.changeSetting('stabilization', c.settings.stabilization ? 0 : 0.35)}>
          {c.settings.stabilization ? '35%' : 'Off'}</Button></div>
        <div class="setting-row"><span>Survivor Count <small>· next mission</small></span><div class="stepper" role="group" aria-label="Survivor Count">
          <Button variant="letter-button" label="Decrease survivor count" disabled={c.settings.survivorCount <= 1}
            action={() => c.changeSetting('survivorCount', Math.max(1, c.settings.survivorCount - 1))}>−</Button>
          <strong aria-live="polite">{c.settings.survivorCount}</strong>
          <Button variant="letter-button" label="Increase survivor count" disabled={c.settings.survivorCount >= maxSurvivors}
            action={() => c.changeSetting('survivorCount', Math.min(maxSurvivors, c.settings.survivorCount + 1))}>+</Button>
        </div></div>
      </div>
      <div class="settings-block"><h3>Display &amp; controls</h3><div class="switches">
        {switches.map(([key, label]) => <Button key={key} variant={c.settings[key] ? 'switch on' : 'switch'}
          action={() => c.changeSetting(key, !c.settings[key])}>{label}<span>{c.settings[key] ? 'On' : 'Off'}</span></Button>)}
      </div></div>
    </div>
    <div class="actions"><Button variant="primary" action={() => c.back()}>Done <span>✓</span></Button></div>
  </section>
}

function Leaderboard({ c }: { c: Controller }) {
  const runs = c.history.filter(r => r.settings.inputMode !== 'replay')
  const today = new Date().toDateString()
  const list = runs.filter(r => {
    const assisted = r.settings.assists.aim || r.settings.assists.steering || r.settings.assists.stabilization > 0 || r.settings.leftHandMode === 'winchOnly'
    return (!c.leaderboardToday || new Date(r.startedAt).toDateString() === today)
      && (c.leaderboardAssists === 'all' || (c.leaderboardAssists === 'assisted') === assisted)
  })
  return <section class="panel ranks-panel" aria-labelledby="ranks-title">
    <p class="kicker mono"><Beacon live /> LOCAL RUN LOG</p>
    <h2 id="ranks-title">Leaderboard</h2>
    <div class="filters">
      <Button variant="compact" action={() => c.setFilter('today')}>{c.leaderboardToday ? 'Today' : 'All time'} ↻</Button>
      <Button variant="compact" action={() => c.setFilter('assists')}>{c.leaderboardAssists === 'all' ? 'Any assists' : c.leaderboardAssists === 'pure' ? 'Pure' : 'Assisted'} ↻</Button>
    </div>
    {list.length ? <table class="rank-table">
      <thead><tr><th>#</th><th>Callsign</th><th>Rank</th><th>Saved</th><th>Time</th><th>Score</th></tr></thead>
      <tbody>{list.slice(0, 10).map((r, i) => <tr key={r.runId} class={r.runId === c.recent?.runId ? 'latest' : ''}>
        <td>{String(i + 1).padStart(2, '0')}</td><th scope="row">{r.player.callsign}</th><td>{r.rank}</td>
        <td>{r.survivors.saved}/{r.survivors.total}</td><td>{time(r.time.totalActiveMs)}</td><td>{number(r.score)}</td>
      </tr>)}</tbody>
    </table> : <div class="empty-records"><span aria-hidden="true">◎</span><h3>No runs yet</h3><p>Scores and active times from this device will appear here.</p></div>}
    {c.status && <p role="status" class="status">{c.status}</p>}
    <div class="actions">
      <Button variant="primary" action={() => c.nextPlayer()}>Next player <span>→</span></Button>
      <Button variant="compact" disabled={!runs.length} action={() => downloadRuns(list, 'csv')}>CSV ↓</Button>
      <Button variant="compact" disabled={!runs.length} action={() => downloadRuns(list, 'json')}>JSON ↓</Button>
      <Button variant="quiet" disabled={!runs.length} action={() => c.openClear()}>Clear log</Button>
      <Button variant="quiet" action={() => c.back()}>Back</Button>
    </div>
    {c.clearOpen && <ClearScores c={c} />}
  </section>
}

function ClearScores({ c }: { c: Controller }) {
  const [text, change] = useState('')
  return <div class="scrim" role="dialog" aria-modal="true" aria-labelledby="clear-title">
    <div class="panel pause-panel">
      <h2 id="clear-title">Clear scores?</h2>
      <p>Erase the saved runs on this device. Hold both fists for two seconds or type CLEAR.</p>
      <Progress value={c.clearProgress} />
      <input aria-label="Type CLEAR" value={text} onInput={e => change(e.currentTarget.value)} />
      <div class="actions"><Button variant="primary" disabled={text !== 'CLEAR'} action={() => void c.clearScores()}>Clear scores</Button>
        <Button action={() => c.cancelClear()}>Cancel</Button></div>
    </div>
  </div>
}

function Survivors({ c }: { c: Controller }) {
  return <div class="pips" aria-label="Survivor tracker">
    {c.game!.rescue.survivors.map((s, i) => {
      const state = s.targeted && (s.state === 'debris' || s.state === 'floating') ? 'targeted' : s.state
      const icons = { targeted: '!', saved: '✓', lost: '×', debris: '○', floating: '◌', carried: '↑', falling: '↓' }
      return <div key={s.id} class={`pip ${state}`} title={s.name + ' · ' + state}><i>{icons[state]}</i><small>{String(i + 1).padStart(2, '0')}</small>
        <span class="sr-only">{s.name} {state}</span></div>
    })}
  </div>
}

function RescueHud({ c }: { c: Controller }) {
  const session = c.game!
  const rescue = session.rescue
  const desired = session.desired
  const school = session.phase === 'school'
  const progress = (rescue.x / R.span + 1) * 50
  const cable = (rescue.cable - R.cableMin) / (R.cableMax - R.cableMin)
  const target = (desired.heliTargetX + 1) * 50
  const schoolHints = [
    'Move the helicopter to the training buoy.', 'Lower the winch until the ring highlights the buoy.',
    'Close the claw around the buoy.', 'Carry the buoy to the green deck. Lower it and open the claw.',
  ]
  const steps = ['Fly laterally', 'Lower the winch', 'Close claw to grab', 'Release on deck']
  return <>
    {!school && <Survivors c={c} />}
    {school && <div class="school-panel instrumentation">
      <div class="kicker mono">FLIGHT SCHOOL</div>
      <ol>{steps.map((step, i) => <li class={i === session.schoolSteps ? 'current' : i < session.schoolSteps ? 'complete' : ''} key={step}>
        <span>{i < session.schoolSteps ? '✓' : i === session.schoolSteps ? '▸' : '○'}</span>{step}</li>)}</ol>
      <p>{schoolHints[session.schoolSteps]}</p>
      <Button variant="compact" action={() => c.skip()}>Skip tutorial</Button>
    </div>}
    <div class="instrumentation winch" aria-label="Winch length">
      <span class="mono">WINCH</span>
      <div class="winch-track">
        <i class="winch-fill" style={{ height: cable * 100 + '%' }} />
        <i class="winch-target" style={{ top: desired.winchTarget * 100 + '%' }} />
        <i class="winch-slide" style={{ top: cable * 100 + '%' }} />
      </div>
      <strong>{rescue.cable.toFixed(1)}<small> m</small></strong>
      <i class={rescue.grip ? 'grip closed' : 'grip'} aria-hidden="true">⌑</i>
      <span class="mono">{rescue.jammed ? 'JAMMED' : rescue.grip ? 'CLOSED' : 'OPEN'}</span>
    </div>
    <div class="hud-controls">
      <div class="rail-label mono"><span>−80 M</span><b>FLIGHT POSITION</b><span>+80 M</span></div>
      <div class="flight-rail">
        <i class="rail-water" style={{ left: progress + '%' }} />
        <i class="rail-ghost" style={{ left: target + '%' }} />
        <i class="rail-deck" style={{ left: (R.deploy / R.span + 1) * 50 + '%' }} title="Rescue deck" />
        <i class="rail-actual" style={{ left: progress + '%' }} />
      </div>
      <div class="control-hint mono">{c.mode === 'hands' ? 'RIGHT PALM · FLIGHT     LEFT PALM · WINCH & CLAW' : 'MOUSE / ARROWS · FLIGHT & WINCH     F / LEFT CLICK · CLAW'}</div>
    </div>
    {rescue.carried.length > 0 && c.deckMarker && <div class="deck-marker mono" style={{ left: c.deckMarker.x + '%', top: c.deckMarker.y + '%' }}>
      {c.deckMarker.offscreen ? 'RESCUE DECK →' : '◆ RESCUE DECK'}
    </div>}
    {!school && <div class="task-note"><span class="mono">OBJECTIVE</span><strong>{rescue.carried.length ? 'Lower onto the green deck' : 'Recover the survivors'}</strong></div>}
  </>
}

function BoatHud({ c }: { c: Controller }) {
  const b = c.game!.boat
  const r = c.game!.rescue
  return <>
    <div class="instrumentation course-note"><p class="kicker mono">ISLAND RUN</p>
      <strong>{courseLabel(b.z)}</strong>
      <span class="mono">{Math.max(0, Math.ceil(900 - b.z))} M TO LANDING</span>
      <Progress value={b.z / 900} />
    </div>
    <div class="compass mono"><span>W</span><span>·</span><b>◆ N</b><span>·</span><span>E</span>
      <i style={{ transform: `translateX(${-b.heading * 72}px)` }}>▴</i>
    </div>
    <div class="dash instrumentation">
      <div class="dash-instrument"><span class="mono">SPEED</span><strong>{(b.speed * 1.94384).toFixed(1)}</strong><small class="mono">KT</small></div>
      <div class="dash-hull"><div class="mono"><span>HULL</span><b>{b.hull}%</b></div><Progress value={b.hull / 100} />
        <div class="mono"><span>SOULS ABOARD</span><b>{r.saved}</b></div>
      </div>
      <div class="dash-instrument"><span class="mono">THROTTLE</span><strong>{Math.round(c.game!.desired.throttle * 100)}</strong><small class="mono">%</small></div>
    </div>
    <div class="boat-hint mono">{b.z >= 780 ? 'LANDING · SLOW TO 7.8 KT AND CENTER IN THE CHANNEL'
      : c.mode === 'hands' ? 'TILT PALMS TO STEER · RAISE / LOWER BOTH TO CHANGE SPEED' : 'A / D TO STEER · W / S TO ADJUST THROTTLE'}</div>
  </>
}

const cineWords = {
  intro: ['THE WRECK', 'A distress call cuts through the storm.'],
  arrival: ['SEARCH & RESCUE', 'The searchlight finds survivors on the wreckage.'],
  handoff: ['ALL ABOARD', 'Take the helm and follow the lighthouse.'],
  outro: ['LANDFALL', 'The first light breaks over the harbor.'],
}

function Results({ c, record }: { c: Controller; record: RunRecord }) {
  const completed = record.outcome === 'completed'
  return <section class="panel result-panel" aria-labelledby="result-title">
    <p class="kicker mono"><Beacon live={completed} /> {record.player.callsign} / RUN DEBRIEF</p>
    <h2 id="result-title">{completed ? 'Rescue complete' : record.outcome === 'failed_all_lost' ? 'Rescue lost' : record.outcome === 'failed_boat_destroyed' ? 'Hull lost' : 'Mission ended'}</h2>
    <div class="result-tally">
      <div class="rank-medal" aria-label={`Rank ${record.rank}`}>{record.rank}</div>
      <div><span class="mono">FINAL SCORE</span><strong>{number(record.score)}</strong></div>
    </div>
    <div class="result-stats">
      <div><span class="mono">SAVED</span><strong>{record.survivors.saved}/{record.survivors.total}</strong></div>
      <div><span class="mono">LOST</span><strong>{record.survivors.lost}</strong></div>
      <div><span class="mono">ACTIVE TIME</span><strong>{time(record.time.totalActiveMs)}</strong></div>
      <div><span class="mono">HULL</span><strong>{record.stats.hullRemaining}%</strong></div>
    </div>
    {c.saving === 'error' ? <p role="status">The score could not be saved. <Button variant="compact" action={() => c.retrySave()}>Retry save</Button></p>
      : <p class="mono saved-label">{c.saving === 'saved' ? '✓ SAVED TO LOCAL RUN LOG' : 'SAVING RUN…'}</p>}
    <div class="actions"><Button variant="primary" action={() => c.nextPlayer()}>{completed ? 'Next player' : 'Try again'} <span>→</span></Button>
      <Button action={() => c.openLeaderboard()}>Leaderboard</Button></div>
  </section>
}

function Pause({ c }: { c: Controller }) {
  const lost = c.overlay === 'tracking'
  const graphics = c.overlay === 'graphics'
  return <div class="scrim">
    <section class={`panel pause-panel ${lost ? 'signal-loss' : ''}`} aria-labelledby="pause-title">
      <p class="kicker mono"><Beacon live={!lost} /> {lost ? 'HAND SIGNAL LOST' : 'MISSION HOLD'}</p>
      <h2 id="pause-title">{lost ? 'Tracking lost' : graphics ? 'Graphics interrupted' : 'Paused'}</h2>
      <p>{lost ? 'Show both open palms to resume. The clock and hazards are held.' : graphics ? 'Waiting for the graphics context to recover.' : 'The clock and hazards are held while you pause.'}</p>
      {lost && <><CameraSlot /><Progress value={c.trackingProgress} /></>}
      <div class="actions">
        {!lost && !graphics && <Button variant="primary" action={() => c.resume()}>Resume <span>→</span></Button>}
        {!graphics && c.camera === 'live' && <Button action={() => c.beginCalibration('game')}>Recalibrate</Button>}
        {!graphics && c.mode === 'hands' && <Button action={() => c.useKeyboard()}>Keyboard controls</Button>}
        {!graphics && <Button action={() => c.openSettings()}>Settings</Button>}
        <Button variant="quiet" action={() => c.quit()}>Quit to title</Button>
      </div>
    </section>
  </div>
}

function Game({ c }: { c: Controller }) {
  const session = c.game!
  const { phase } = session
  if (session.record) return <Results c={c} record={session.record} />
  const cinematic = isCinematic(phase)
  const caption = c.radio.subtitle
  const rescue = phase === 'rescue' || phase === 'school'
  return <div class={`game-hud ${cinematic ? 'cinematic' : ''} ${phase === 'boat' ? 'boat-hud' : ''}`}>
    {cinematic ? <>
      <div class="letterbox top" /><div class="letterbox bottom" />
      <div class="cine-title"><span class="kicker mono"><Beacon /> {cineWords[phase][0]}</span>
        <h2>{cineWords[phase][1]}</h2></div>
      <div class="cine-skip"><Button variant="compact" action={() => c.skip()}>Skip <span>→</span></Button>
        <Progress value={c.skipProgress} /><small class="mono">{c.mode === 'hands' ? 'HOLD BOTH THUMBS UP' : 'SPACE TO SKIP'}</small></div>
    </> : <div class="game-top">
      <div class="phase-tag mono"><Beacon live /> {rescue ? '01 / HELICOPTER RESCUE' : '02 / ISLAND RUN'}</div>
      <div class="game-metrics instrumentation">
        <span aria-label="Elapsed time">{clock} <b>{clockLabel(session.activeTime)}</b></span><span aria-label="Current score"><b>{number(session.currentScore)}</b> <small>PTS</small></span>
        <Button label="Pause mission" variant="compact pause-button" action={() => c.pause()}>Ⅱ</Button>
      </div>
    </div>}
    {rescue && <RescueHud c={c} />}
    {phase === 'boat' && <BoatHud c={c} />}
    {c.camera === 'live' && c.settings.preview && !cinematic && !c.overlay && <div class="hud-camera instrumentation">
      <CameraSlot /><div class="camera-status mono"><Beacon live /> {session.desired.trackingState === 'ok' ? 'HAND TRACKING' : 'REACQUIRING'}</div>
    </div>}
    {c.toast && !cinematic && !c.overlay && <div class={`event-label ${c.toast.type.includes('WARNING') || c.toast.type === 'SHARK_TELEGRAPH' ? 'warning' : ''}`} role="status">
      {c.toast.points ? <strong>{c.toast.points > 0 ? '+' : ''}{number(c.toast.points)}</strong> : <i>◆</i>} {c.toast.text}</div>}
    {caption && c.settings.captions && !c.overlay && <div class={`subtitle ${c.settings.captionLarge ? 'large' : ''} ${c.settings.captionPlate ? 'plate' : ''}`}>
      <i class="signal-bars" aria-hidden="true" /><b>{caption.name}</b> <span>{caption.text}</span></div>}
    {c.overlay && <Pause c={c} />}
  </div>
}

function Emulator({ c }: { c: Controller }) {
  const em = c.emulator
  if (!em.enabled) return c.screen === 'title'
    ? <button class="emulator-start action compact" onClick={() => c.enableEmulator()}>Hand emulator</button> : null
  return <div class="emulator instrumentation">
    <div class="mono">HAND EMULATOR</div>
    <div class="emulator-area" onPointerMove={event => {
      const token = event.currentTarget.getAttribute('data-drag')
      if (token === null) return
      const rect = event.currentTarget.getBoundingClientRect()
      em.move(Number(token), (event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height)
    }} onPointerUp={event => event.currentTarget.removeAttribute('data-drag')}
    onPointerCancel={event => event.currentTarget.removeAttribute('data-drag')}>
      {em.palms.map((palm, index) => <button type="button" key={index} aria-label={index ? 'Emulated right hand' : 'Emulated left hand'}
        style={{ left: palm.x * 100 + '%', top: (1 - palm.y) * 100 + '%' }}
        onPointerDown={event => {
          const area = event.currentTarget.parentElement!
          area.setAttribute('data-drag', String(index))
          area.setPointerCapture(event.pointerId)
        }}>{index ? 'R' : 'L'}</button>)}
    </div>
    <div class="emulator-controls">
      <button onClick={() => { em.pose = em.pose === 'Closed_Fist' ? 'Open_Palm' : 'Closed_Fist' }}>{em.pose === 'Closed_Fist' ? 'Open' : 'Fist'}</button>
      <button onClick={() => { em.pose = em.pose === 'Pointing_Up' ? 'Open_Palm' : 'Pointing_Up' }}>Point</button>
      <button onClick={() => { em.visible = !em.visible }}>{em.visible ? 'Hide hands' : 'Show hands'}</button>
    </div>
  </div>
}

export function View({ c }: { c: Controller }) {
  const active = c.screen === 'game'
  return <div class={`interface ${c.settings.contrast ? 'high-contrast' : ''} ${active ? 'over-stage' : 'over-art'} ${c.screen === 'title' ? 'title-screen' : ''}`}>
    {c.screen === 'title' ? <Title c={c} /> : active && c.game ? <Game c={c} /> : <main class="modal-layout">
      {c.screen === 'camera' && <Camera c={c} />}
      {c.screen === 'calibration' && <Calibration c={c} />}
      {c.screen === 'callsign' && <Callsign c={c} />}
      {c.screen === 'briefing' && <Briefing c={c} />}
      {c.screen === 'settings' && <UserSettings c={c} />}
      {c.screen === 'leaderboard' && <Leaderboard c={c} />}
    </main>}
    {c.debug && <Emulator c={c} />}
    {c.debug && <aside class="debug instrumentation mono">{c.vm.fps} FPS · {c.vm.calls} DRAWS · {Math.round(c.vm.triangles / 1000)}K TRI · {c.vm.scale.toFixed(2)}×</aside>}
  </div>
}
