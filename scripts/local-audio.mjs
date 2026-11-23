import { existsSync, readdirSync } from 'node:fs'

export function localAudio() {
  const virtual = 'virtual:shipwreck-audio'
  const id = '\0' + virtual
  const directory = new URL('../public/audio/', import.meta.url)
  const inventory = () => existsSync(directory)
    ? readdirSync(directory).filter(name => /\.(mp3|ogg|wav)$/.test(name))
    : []
  return {
    name: 'shipwreck-local-audio',
    resolveId: source => source === virtual ? id : null,
    load: source => source === id ? `export default ${JSON.stringify(inventory())}` : null,
    configureServer(server) {
      // Read the live directory in development so dropped-in clips need no server restart.
      server.middlewares.use('/__shipwreck_audio', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(inventory()))
      })
    },
  }
}
