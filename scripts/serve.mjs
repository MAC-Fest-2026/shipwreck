import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.argv[2] ?? 4174)
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webp': 'image/webp', '.wasm': 'application/wasm', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
}
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
try { await stat(resolve(root, 'index.html')) }
catch { throw new Error('The dist directory is missing. Run pnpm build before serving.') }

createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname))
    if (!file.startsWith(root + sep)) throw new Error('Invalid path')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('File unavailable')
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Security-Policy': policy,
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).pipe(response)
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`SHIPWRECK is ready at http://127.0.0.1:${port}/`))
