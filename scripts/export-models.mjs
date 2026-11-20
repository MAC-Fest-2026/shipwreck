import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4173/')
  const files = await page.evaluate(async () => {
    const { helicopter, rescueVessel } = await import('/src/render/models.ts')
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js')
    const exporter = new GLTFExporter()
    const encode = async root => Array.from(new Uint8Array(await exporter.parseAsync(root, { binary: true })))
    return { 'sar-helicopter.glb': await encode(helicopter().root), 'rescue-vessel.glb': await encode(rescueVessel()) }
  })
  await mkdir('public/models', { recursive: true })
  await Promise.all(Object.entries(files).map(([name, data]) => writeFile('public/models/' + name, Uint8Array.from(data))))
} finally {
  await browser.close()
}
