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
// loading screen: a cover-art grid of stills the game rendered of itself (tools/trailer.mjs), so
// it looks like what you're about to play. Each still has the point its panel should frame
const KEYART = {
  bataie: '64% 50%', urmarire: '38% 55%', garderoba: '50% 45%', bere: '50% 55%', taxi: '72% 60%', echipa: '20% 45%',
  oras: '50% 45%', bulevard: '70% 55%', nunta: '45% 60%', acasa: '50% 50%',
}
const panels = [...document.querySelectorAll('.boot-grid .bp:not(.bp-l)')]
const shown = new Map() // panel -> still
const paint = (panel, name, fade) => {
  const i = document.createElement('i')
  i.style.backgroundImage = `url(${BASE}keyart/${name}.jpg)`
  i.style.backgroundPosition = KEYART[name]
  if (fade) { i.className = 'gone'; requestAnimationFrame(() => requestAnimationFrame(() => i.classList.remove('gone'))) }
  const old = panel.querySelector('i')
  panel.appendChild(i)
  if (old) setTimeout(() => old.remove(), 900)
  shown.set(panel, name)
}
// the first six slam in one after another as they arrive
Object.keys(KEYART).slice(0, panels.length).forEach((name, k) => {
  const panel = panels[k], img = new Image()
  img.onload = img.onerror = () => setTimeout(() => panel.classList.add('in'), k * 110)
  img.src = `${BASE}keyart/${name}.jpg`
  paint(panel, name, false)
})
// …then one panel at a time swaps to a still that isn't on screen
const swapTimer = setInterval(() => {
  const vis = panels.filter((q) => q.offsetParent !== null && q.classList.contains('in'))
  if (!vis.length) return
  const panel = vis[Math.floor(Math.random() * vis.length)]
  const free = Object.keys(KEYART).filter((n) => ![...shown.values()].includes(n))
  if (free.length) paint(panel, free[Math.floor(Math.random() * free.length)], true)
}, 3200)

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
  clearInterval(swapTimer)
  fill.style.width = '100%'
  boot.classList.add('hide')
  setTimeout(() => boot.remove(), 900)
  game.start()
}

start()
