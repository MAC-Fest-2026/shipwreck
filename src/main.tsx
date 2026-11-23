import { render } from 'preact'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import { Controller } from './app/controller'
import { View } from './ui/view'
import './ui/styles.css'

const app = document.querySelector<HTMLElement>('#app')!
const controller = new Controller(c => render(<View c={c} />, app))
controller.setupDebug()
render(<View c={controller} />, app)
void controller.preloadAssets()
