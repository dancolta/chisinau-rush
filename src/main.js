import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/700.css'
import '@fontsource/rubik/900.css'
import '@fontsource/bungee/400.css'
import '@fontsource/bangers/400.css'
import '@fontsource/paytone-one/400.css'
import './styles/boot.css'
import './styles/ui.css'
import './styles/menus.css'
import { Game } from './core/Game.js'
import { TIPS } from './data/tips.js'

const BASE = import.meta.env.BASE_URL || './'
const boot = document.getElementById('boot')
const fill = document.getElementById('boot-fill')
const status = document.getElementById('boot-status')
const tip = document.getElementById('boot-tip')
// loading screen: prints of stills the game rendered of itself (tools/trailer.mjs), hung on the
// wall around the carpet, so it looks like what you're about to play. Each still has the point
// its panel should frame and the caption on its strip of paper
const KEYART = {
  bataie: ['64% 50%', 'Tigaia rezolvă tot'], urmarire: ['38% 55%', 'Poliția vine. Cândva.'], garderoba: ['50% 45%', 'Moda adusă de afară'],
  bere: ['50% 55%', 'Semințe, bere, filozofie'], taxi: ['72% 60%', 'Taxi: prețul se negociază'], echipa: ['20% 45%', 'Gașca de pe raion'],
  oras: ['50% 45%', 'Chișinăul, de sus'], bulevard: ['70% 55%', 'Ștefan cel Mare, la apus'], nunta: ['45% 60%', 'Nunta: trei zile, minim'],
  acasa: ['50% 50%', 'Acasă, după 7 ani'],
}
const panels = [...document.querySelectorAll('.boot-grid .bp:not(.bp-l)')]
const shown = new Map() // panel -> still
const paint = (panel, name, fade) => {
  const i = document.createElement('i')
  i.style.backgroundImage = `url(${BASE}keyart/${name}.jpg)`
  i.style.backgroundPosition = KEYART[name][0]
  const cap = document.createElement('em')
  cap.className = 'cap'
  cap.textContent = KEYART[name][1]
  const old = [...panel.querySelectorAll('i, .cap')]
  if (fade) {
    // the new print fades in over the old one; the old caption steps aside first
    i.className = 'gone'
    cap.classList.add('gone')
    cap.style.transitionDelay = '0.35s'
    for (const o of old) if (o.classList.contains('cap')) { o.style.transitionDelay = '0s'; o.classList.add('gone') }
    requestAnimationFrame(() => requestAnimationFrame(() => { i.classList.remove('gone'); cap.classList.remove('gone') }))
  }
  panel.append(i, cap)
  if (old.length) setTimeout(() => old.forEach((o) => o.remove()), 900)
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
  if (!free.length) return
  // the next print goes up only once it has arrived, never as an empty frame
  const name = free[Math.floor(Math.random() * free.length)], img = new Image()
  shown.set(panel, name)
  img.onload = () => { if (boot.isConnected) paint(panel, name, true) }
  img.src = `${BASE}keyart/${name}.jpg`
}, 3200)

// the tip note: a new line, and the SFAT stamp comes down on it again
let tipIdx = Math.floor(Math.random() * TIPS.length)
tip.textContent = TIPS[tipIdx]
const note = tip.parentElement
const tipTimer = setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length
  tip.textContent = TIPS[tipIdx]
  note.classList.remove('swap')
  void note.offsetWidth
  note.classList.add('swap')
}, 4200)

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
