import { expect, test, type Page } from '@playwright/test'
import type { RunRecord } from '../../src/game/score'

interface DebugApi {
  startReplay(fast?: boolean): Promise<void>
  getRun(): RunRecord | null
  snapshot(): { phase?: string; camera: string; time?: number; saved?: number }
  skip(): void
  advanceToBoat(): void
}
declare global { interface Window { shipwreck: DebugApi } }

async function offlineScore(page: Page, runId: string) {
  return page.evaluate(id => new Promise<RunRecord | null>((resolve, reject) => {
    const request = indexedDB.open('shipwreck-scorebook', 1)
    request.onsuccess = () => {
      const database = request.result
      const row = database.transaction('runs').objectStore('runs').get(id)
      row.onsuccess = () => { resolve(row.result ?? null); database.close() }
      row.onerror = () => reject(row.error)
    }
    request.onerror = () => reject(request.error)
  }), runId)
}

test('keyboard onboarding, rescue HUD and pause', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'SHIPWRECK', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Keyboard & mouse/ }).click()
  await page.getByRole('button', { name: /MAVERICK/ }).click()
  await expect(page.getByRole('heading', { name: 'Flight briefing' })).toBeVisible()
  await page.getByRole('button', { name: /Flight school/ }).click()
  await expect(page.getByRole('button', { name: 'Skip tutorial' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip tutorial' }).click()
  await page.getByRole('button', { name: /Skip/ }).click()
  await page.getByRole('button', { name: /Skip/ }).click()
  await expect(page.getByLabel('Survivor tracker')).toBeVisible()
  await page.getByRole('button', { name: 'Pause mission' }).click()
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const waves = page.getByRole('group', { name: 'Wave Intensity' })
  await expect(waves).toHaveText(/180%/)
  await expect(page.locator('#stage canvas')).toBeVisible()
  await waves.getByRole('button', { name: 'Raise wave intensity' }).click()
  await expect(waves).toHaveText(/190%/)
  expect(await page.evaluate(async () => {
    const path = '/src/sim/water.ts'
    const { waveUniforms } = await import(path)
    const stored = JSON.parse(localStorage.getItem('shipwreck-settings-v1') ?? '{}')
    return [waveUniforms.waveIntensity.value, stored.waveIntensity]
  })).toEqual([1.9, 1.9])
  const slider = page.getByRole('slider', { name: 'Wave Intensity' })
  await slider.fill('210')
  await expect(waves).toHaveText(/210%/)
  await page.getByRole('button', { name: /Done/ }).click()
  await page.getByRole('button', { name: /Resume/ }).click()
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('full replay repeats score and saves a durable record', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/?debug=1')
  await page.evaluate(() => window.shipwreck.startReplay(true))
  await expect(page.getByRole('heading', { name: 'Rescue complete' })).toBeVisible({ timeout: 45000 })
  await expect(page.getByText(/saved to local run log/i)).toBeVisible()
  const first = await page.evaluate(() => window.shipwreck.getRun())
  expect(first?.outcome).toBe('completed')
  expect(first?.survivors.saved).toBeGreaterThanOrEqual(5)
  await page.reload()
  expect((await offlineScore(page, first!.runId))?.score).toBe(first!.score)
  await page.evaluate(() => window.shipwreck.startReplay(true))
  await expect(page.getByRole('heading', { name: 'Rescue complete' })).toBeVisible({ timeout: 45000 })
  const second = await page.evaluate(() => window.shipwreck.getRun())
  expect(second?.score).toBe(first?.score)
  expect(second?.time).toEqual(first?.time)
  await page.getByRole('button', { name: /Next player/ }).click()
  await expect(page.getByRole('heading', { name: 'Select callsign' })).toBeVisible()
})

test('bundled camera inference initializes with Chromium fake media', async ({ page }) => {
  test.setTimeout(60000)
  const requests = new Set<string>()
  page.on('request', request => requests.add(new URL(request.url()).host))
  await page.goto('/?debug=1')
  await page.getByRole('button', { name: /Play with hands/ }).click()
  await expect(page.getByText(/Webcam ready · (GPU|CPU) tracking/)).toBeVisible({ timeout: 45000 })
  expect([...requests]).toEqual(['127.0.0.1:4173'])
  await page.getByRole('button', { name: /Keyboard & mouse/ }).click()
  expect(await page.locator('#camera-feed').evaluate(v => (v as HTMLVideoElement).srcObject)).toBe(null)
})

test('the hand emulator pauses the clock on loss and recovers with both palms', async ({ page }) => {
  await page.goto('/?debug=1')
  await page.getByRole('button', { name: 'Hand emulator' }).click()
  await page.getByRole('button', { name: /MAVERICK/ }).click()
  await page.getByRole('button', { name: /Start mission/ }).click()
  await page.getByRole('button', { name: /Skip/ }).click()
  await page.getByRole('button', { name: /Skip/ }).click()
  await page.getByRole('button', { name: 'Hide hands' }).click()
  await expect(page.getByRole('heading', { name: 'Tracking lost' })).toBeVisible()
  const timeBefore = await page.evaluate(() => window.shipwreck.snapshot().time)
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.shipwreck.snapshot().time)).toBe(timeBefore)
  await page.getByRole('button', { name: 'Show hands' }).click()
  await expect(page.getByRole('heading', { name: 'Tracking lost' })).toHaveCount(0, { timeout: 6000 })
  await expect.poll(() => page.evaluate(() => window.shipwreck.snapshot().time)).toBeGreaterThan(timeBefore!)
})

test('water height matches the actual WebGL2 shader', async ({ page }) => {
  await page.goto('/')
  const maxError = await page.evaluate(async () => {
    const modulePath = '/src/sim/water.ts'
    const { waveHeight, waterGlsl, setWaveIntensity } = await import(modulePath)
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) throw new Error('WebGL2 unavailable')
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader failed')
      return shader
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
      precision highp float;
      in vec3 samplePosition;
      out vec3 wave;
      ${waterGlsl}
      void main(){wave=oceanSample(samplePosition.xy,samplePosition.z);gl_Position=vec4(0.,0.,0.,1.);}`))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(1.);}'))
    gl.transformFeedbackVaryings(program, ['wave'], gl.INTERLEAVED_ATTRIBS)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link failed')
    gl.useProgram(program)
    const values = new Float32Array(Array.from({ length: 150 }, (_, i) =>
      [Math.sin(i * 2.2) * 81, Math.cos(i * 1.338) * 900, i * 0.91]).flat())
    const sampleBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, sampleBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW)
    const attribute = gl.getAttribLocation(program, 'samplePosition')
    gl.enableVertexAttribArray(attribute)
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0)
    const result = new Float32Array(values.length)
    const resultBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, resultBuffer)
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, result.byteLength, gl.STREAM_READ)
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, resultBuffer)
    const intensity = gl.getUniformLocation(program, 'waveIntensity')
    const slope = { x: 0, z: 0 }
    let error = 0
    for (const level of [0.5, 1.6, 2.5]) {
      gl.uniform1f(intensity, setWaveIntensity(level))
      gl.enable(gl.RASTERIZER_DISCARD)
      gl.beginTransformFeedback(gl.POINTS)
      gl.drawArrays(gl.POINTS, 0, result.length / 3)
      gl.endTransformFeedback()
      gl.disable(gl.RASTERIZER_DISCARD)
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result)
      for (let i = 0; i < result.length; i += 3) {
        const height = waveHeight(values[i], values[i + 1], values[i + 2], slope)
        error = Math.max(error, Math.abs(result[i] - height), Math.abs(result[i + 1] - slope.x),
          Math.abs(result[i + 2] - slope.z))
      }
    }
    return error
  })
  expect(maxError).toBeLessThan(0.01)
})
