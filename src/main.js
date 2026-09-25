import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/700.css'
import '@fontsource/rubik/900.css'
import '@fontsource/bungee/400.css'
import '@fontsource/bangers/400.css'
import '@fontsource/paytone-one/400.css'
import './styles/boot.css'
import './styles/ui.css'
import { Game } from './core/Game.js'
import { TIPS } from './data/tips.js'

const BASE = import.meta.env.BASE_URL || './'
const boot = document.getElementById('boot')
const fill = document.getElementById('boot-fill')
const status = document.getElementById('boot-status')
const tip = document.getElementById('boot-tip')
document.querySelector('.boot-art').style.backgroundImage = `url(${BASE}title-art.jpg)`

let tipIdx = Math.floor(Math.random() * TIPS.length)
tip.textContent = TIPS[tipIdx]
const tipTimer = setInterval(() => { tipIdx = (tipIdx + 1) % TIPS.length; tip.textContent = TIPS[tipIdx] }, 4200)

async function start() {
  const game = new Game({
    viewport: document.getElementById('viewport'),
    ui: document.getElementById('ui'),
  })
  window.__game = game
  try {
    await game.boot((p, label) => {
      fill.style.width = `${Math.round(p * 100)}%`
      if (label) status.textContent = label
    })
  } catch (e) {
    console.error(e)
    status.textContent = 'Eroare la încărcare: ' + (e && e.message ? e.message : e)
    return
  }
  clearInterval(tipTimer)
  fill.style.width = '100%'
  boot.classList.add('hide')
  setTimeout(() => boot.remove(), 900)
  game.start()
}

start()
