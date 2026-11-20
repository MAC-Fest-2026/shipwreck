import { chromium } from '@playwright/test'

const url = process.env.SHIPWRECK_BENCH_URL ?? 'http://127.0.0.1:4173/?debug=1'
const args = process.env.SHIPWRECK_SOFTWARE_GL === '1'
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []
const browser = await chromium.launch({ args })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await page.goto(url)
  await page.evaluate(() => window.shipwreck.startReplay())
  await page.evaluate(() => { window.shipwreck.skip(); window.shipwreck.skip() })
  const rows = []
  for (const phase of ['rescue', 'boat']) {
    if (phase === 'boat') await page.evaluate(() => window.shipwreck.advanceToBoat())
    for (const quality of ['low', 'medium', 'high']) {
      await page.evaluate(quality => window.shipwreck.setQuality(quality), quality)
      const values = await page.evaluate(() => new Promise(resolve => {
        let count = 0
        let last = performance.now()
        const samples = []
        function frame(now) {
          if (count >= 14) samples.push(now - last)
          last = now
          count++
          if (samples.length === 65) resolve(samples)
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }))
      const sorted = values.sort((a, b) => a - b)
      const stats = await page.evaluate(() => window.shipwreck.snapshot().stats)
      rows.push({ phase, quality, medianMs: sorted[32].toFixed(1), p95Ms: sorted[61].toFixed(1),
        draws: stats.calls, triangles: stats.triangles, scale: stats.scale.toFixed(2) })
    }
  }
  console.table(rows)
  const max = Number(process.env.SHIPWRECK_P95_MS ?? 0)
  if (max > 0 && rows.some(row => Number(row.p95Ms) > max)) process.exitCode = 1
} finally {
  await browser.close()
}
