// Dev tool: every short piece of text the player reads, mounted on its own (the real UI classes and
// stylesheets, no 3D world) with the longest real strings from the code (tools/texts.mjs), in
// headless Chromium at four screen sizes. Reports text that overflows or is clipped, text running
// off the screen, HUD pieces drawn over each other, and empty or "undefined" renders; saves a
// contact sheet per size in shots/ (not committed). Exits 1 on a problem in the HUD pieces; text cut
// on purpose, the art director's screens and the dense phone layout are printed as notes.
// usage: node tools/textfit.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { corpus } from './texts.mjs'

const ROOT = new URL('..', import.meta.url).pathname
// [width, height, touch]: a phone on its side gets the touch layout (a phone held upright shows
// "Întoarce telefonul pe orizontală" over the game, so 360×640 is a narrow desktop window)
const SIZES = [[360, 640, false], [640, 360, true], [1280, 720, false], [1920, 1080, false]]
// frames the art director owns right now (loading screen, menus): reported, not failed on
const ART = /^(boot|menu|pause-)/

// notes, not failures: text cut on purpose (ellipsis, line clamp), the art director's screens, and
// HUD pieces meeting below desktop size (a phone on its side, a 360 px window): there the HUD is
// dense by design and the remaining collisions need a layout decision (listed in the report)
// known on desktop: the longest objective + tip + Viber message at once reach the aura chip at 720p
const KNOWN = [['1280×720', 'tips', /viber/]]
const small = (size) => parseInt(size) < 1280
const note = (r) => r.kind === 'ellipsis' || ART.test(r.frame) || (r.kind === 'overlap' && (small(r.size) || KNOWN.some(([s, f, re]) => s === r.size && f === r.frame && re.test(r.at))))
// ---- the longest real strings, per piece -------------------------------------------------------------------
// visible length: markup out, key caps as their letter, the longer side of [[his|hers]]
const vis = (t) => t.replace(/\{\/?[ybrgw]\}/g, '').replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, (_, a, b) => (a.length > b.length ? a : b)).replace(/\[([^\]]{1,9})\]/g, '$1')
// ${…} in a template: something as long as a real value usually is (a price or a count next to a
// unit, a name or a place elsewhere)
const real = (t) => t
  .replace(/\$\{…\}(?=\s?(lei|leu|m\b|km|%|XP|AURA|ori|min|sec|de |\/|\)))/g, '120')
  .replace(/(?<=[\/(+−-]\s?)\$\{…\}/g, '12')
  .replace(/\$\{…\}/g, 'Tanti Galea')
const sinkIs = (re) => (c) => c.sinks.some((s) => re.test(s))
const storySay = (c) => /^src\/(story|side\/events)\//.test(c.file) && c.sinks.some((s) => /^(m|ctx|this|s|story)\.(say|choose)$/.test(s))
function longest(pred, n = 1) {
  const seen = new Set()
  return corpus.filter((c) => !c.html && pred(c)).map((c) => real(c.text)).filter((t) => !seen.has(t) && seen.add(t))
    .sort((a, b) => vis(b).length - vis(a).length).slice(0, n)
}
const upper = (t) => t === t.toUpperCase()
const S = {
  notify: longest(sinkIs(/(^|\.)notify$/), 4),
  tip: longest(sinkIs(/(^|\.)tip$/))[0],
  objective: longest((c) => (sinkIs(/(^|\.)(objective|setObjective)$/)(c) && !['sub', 'title'].includes(c.key)) || c.key === 'startText')[0],
  objSub: longest((c) => c.key === 'sub' || sinkIs(/(^|\.)sub$/)(c))[0],
  objTitle: 'CAPITOLUL 1 · ' + longest((c) => c.key === 'title' && /^src\/story\/missions\//.test(c.file))[0].toUpperCase(),
  prompt: longest((c) => sinkIs(/(^|\.)prompt$/)(c) || (c.key === 'label' && /^src\/(story|gameplay|side)\//.test(c.file)))[0],
  help: longest(sinkIs(/(^|\.)help$/))[0] || '',
  subName: longest((c) => c.key === 'name' && c.file === 'src/story/cast.js')[0],
  subtitle: longest(sinkIs(/(^|\.)(subtitle|talk)$/))[0],
  bubble: longest((c) => (sinkIs(/\.say$/)(c) && !storySay(c)) || sinkIs(/\.talk$/)(c))[0],
  overlay: longest((c) => sinkIs(/(^|\.)overlay$/)(c))[0],
  bigTitle: longest((c) => sinkIs(/(^|\.)bigMessage$/)(c) && upper(c.text))[0],
  bigSub: longest((c) => sinkIs(/(^|\.)(bigMessage|fail)$/)(c) && !upper(c.text))[0],
  bannerKick: longest((c) => sinkIs(/(^|\.)missionBanner$/)(c) && upper(c.text))[0],
  bannerTitle: longest((c) => c.key === 'title' && /^src\/(story|side\/events)\//.test(c.file))[0],
  chapterKick: longest((c) => sinkIs(/(^|\.)chapter$/)(c) && upper(c.text))[0],
  chapterName: longest((c) => c.key === 'chapterEnd' || (sinkIs(/(^|\.)chapter$/)(c) && upper(c.text)))[0],
  chapterDesc: longest((c) => c.key === 'chapterEndText' || c.key === 'desc' && /^src\/story\/missions\//.test(c.file))[0],
  why: longest(sinkIs(/(addLei|addXp|addRespect|spend|\.gain|\.lose|\.money|\.xp|\.chip)$/), 4),
  viber: longest((c) => c.key === 'viber')[0],
  viberWho: longest((c) => c.key === 'who' && /^src\/side\/events\//.test(c.file))[0],
  feed: longest(sinkIs(/\.feed$/))[0],
  gender: '[[Uite-l|Uite-o]]! Acolo!',
}
for (const [k, v] of Object.entries(S)) if (v == null) S[k] = ''

// ---- the page: index.html, with src/main.js swapped for the pieces and their stylesheets ---------------------
const ENTRY = `
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/700.css'
import '@fontsource/rubik/900.css'
import '@fontsource/bungee/400.css'
import '@fontsource/bangers/400.css'
import '@fontsource/paytone-one/400.css'
import './styles/boot.css'
import './styles/ui.css'
import { UI } from './ui/UI.js'
import { Menus } from './ui/Menus.js'
import { Stage } from './side/Stage.js'
import { SideUI } from './side/SideUI.js'
import { WEAPONS } from './data/weapons.js'
import { VEHICLES } from './data/vehicles.js'
import { H_ROADS, V_ROADS } from './world/CityLayout.js'
import { ACHIEVEMENTS, EXPLAIN, RESPECT_PERKS, TIERS, STREAK, GOAL_CLOTHES } from './data/goals.js'
import { RESPECT_NAMES } from './gameplay/Progress.js'
import { NEWS } from './data/news.js'
import { TIPS } from './data/tips.js'
import { fill } from './story/hero.js'
import { Touch } from './ui/Touch.js'
window.__tf = { fill, Touch, UI, Menus, Stage, SideUI, WEAPONS, VEHICLES, H_ROADS, V_ROADS, ACHIEVEMENTS, EXPLAIN, RESPECT_PERKS, RESPECT_NAMES, TIERS, STREAK, GOAL_CLOTHES, NEWS, TIPS }
`
const server = await createServer({
  root: ROOT, logLevel: 'error',
  server: { port: 5197, strictPort: false, host: '127.0.0.1', fs: { strict: false } },
  plugins: [{ name: 'textfit-entry', enforce: 'pre', load(id) { if (id.split('?')[0].endsWith('/src/main.js')) return ENTRY } }],
})
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })

// ---- in the page: mount, show a frame, measure ---------------------------------------------------------------
function setup([S, touch]) {
  const T = window.__tf
  // no animations or transitions: every piece at its settled layout, right away
  const st = document.createElement('style')
  st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; } #viewport { background: linear-gradient(160deg, #4a5a6a, #2a2f38 55%, #3a3226); }'
  document.head.appendChild(st)
  // the pieces take themselves down after a few seconds: hold those timers while one is put up
  const hold = (fn) => { const t = window.setTimeout; window.setTimeout = () => 0; try { return fn() } finally { window.setTimeout = t } }
  const longestOf = (list, f = (x) => x) => list.reduce((a, b) => (f(b).length > f(a).length ? b : a))
  const W = Object.entries(T.WEAPONS).reduce((a, b) => (b[1].name.length > a[1].name.length ? b : a))[0]
  const street = longestOf([...T.H_ROADS, ...T.V_ROADS].map((r) => r.name).filter(Boolean))
  const car = longestOf(Object.values(T.VEHICLES).map((v) => v.name).filter(Boolean))
  const ach = longestOf(T.ACHIEVEMENTS, (a) => a.name)
  const explain = longestOf(Object.values(T.EXPLAIN), (e) => (e.text || '') + (e.foot || ''))
  const respK = Object.keys(T.RESPECT_PERKS).reduce((a, b) => (Math.max(...T.RESPECT_PERKS[b].map((x) => x.length)) > Math.max(...T.RESPECT_PERKS[a].map((x) => x.length)) ? b : a))
  const respT = T.RESPECT_PERKS[respK].reduce((a, b, i, l) => (b.length > l[a].length ? i : a), 0)
  const tierName = longestOf(Object.values(T.RESPECT_NAMES).flat())
  const goals = {
    state: { ach: Object.fromEntries(T.ACHIEVEMENTS.slice(0, 20).map((a, i) => [a.id, { n: 1 + (i % a.tiers.length), at: [Date.now(), Date.now(), Date.now()] }])), nudged: {} },
    unlocked: 20, value: (a) => Math.max(0, a.tiers[0][0] - 1),
  }
  const g = window.__g = {
    uiRoot: document.getElementById('ui'), state: 'play', paused: false, frame: 0, timeScale: 1, autoTalk: false, cutscene: false,
    audio: null, cloud: null, home: { inside: true },
    input: { padState: () => null, clear() {} },
    renderer: { tod: { clock: '23:59', hour: 23, set() {} }, applyQuality() {}, renderer: { domElement: document.createElement('canvas') } },
    camera: { position: { x: 0, y: 0, z: 0 } }, cameraRig: { shot() {}, talkTo() {}, yaw: Math.PI, baseFov: 45 },
    police: { level: 5, escaping: false }, weapons: T.WEAPONS,
    player: { stamina: 0.62, passenger: false, pos: { x: 0, z: 0 }, char: { heading: 0 }, vehicle: { speed: 41.7, def: { name: car }, health: 64, pos: { x: 0, z: 0 }, heading: 0 } },
    progress: { type: 'badanta', name: 'Tanti Galea', lei: 1234567, hp: 21, maxHp: 140, hunger: 0.35, weapon: W, rank: { name: 'Plecat peste hotare' }, respect: { gop: 0, bab: 0, pol: 0 }, side: { aura: { total: 0 } }, perk: { female: true }, story: { done: [] } },
    events: { on: () => () => {}, emit() {} },
    settings: { quality: 'high', autoRes: true, moveMode: 'steer', mouseLook: true, invertCam: false, master: 0.9, music: 0.6, sfx: 0.85, voice: 0.8, shake: 1, fov: 45, camSensitivity: 1, brightness: 1 },
    blips: () => [], portraits: { get: () => '' }, director: { continueGame() {}, newGame() {}, setWaypoint() {} },
    story: {
      catalog: () => [{ title: S.bannerTitle, desc: S.objective, done: true }, { title: S.bannerTitle, desc: S.chapterDesc, current: true }, { title: 'Misiune', locked: true }],
      evidence: () => [{ title: S.bannerTitle, text: S.chapterDesc }], activities: () => [{ title: S.bannerTitle, desc: S.tip }], missionRow() {},
    },
    side: { goals },
  }
  const ui = window.__ui = new T.UI(g)
  g.ui = ui
  const errors = window.__mountErrors = []
  if (touch) { try { new T.Touch(g) } catch (e) { document.documentElement.classList.add('touch'); errors.push('Touch: ' + e.message) } }
  document.querySelector('.trotate')?.remove()
  let side = null
  try { side = new T.SideUI({ game: g, aura: { level: 1, total: 0 } }) } catch (e) { errors.push('SideUI: ' + e.message) }
  const stage = new T.Stage({ game: g })
  stage.frozen = true
  const menus = new T.Menus(g, ui)
  const clearHud = () => {
    ui.tip(null); ui.prompt(null); ui.subtitle(null); ui.rewards.clear(); ui.toastsEl.innerHTML = ''
    for (const [n] of ui.bubbles) ui.removeBubble(n)
    ui.districtEl?.remove()
    if (side) { side.hideViber(); side.feedEl.innerHTML = '' }
  }
  const clearTop = () => { for (const e of [...ui.top.children]) if (!e.classList.contains('fader') && !e.classList.contains('subtitle')) e.remove() }
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const npc = (x, y) => ({ char: { visible: true, mesh: { position: { x: 0, y: 0, z: 0 } } }, x, y })
  window.__frames = {
    boot() {
      const tip = longestOf(T.TIPS)
      document.getElementById('boot-tip').textContent = tip
      document.getElementById('boot-status').textContent = 'Oameni, mașini, polițiști…'
      return { scope: '#boot', expect: ['#boot-tip', '#boot-status'] }
    },
    // a busy moment: the objective, a prompt, a couple of rewards and notifications, driving
    hud() {
      document.getElementById('boot')?.remove()
      ui.showHud(true)
      ui.update(0.016)
      ui.streetEl.textContent = street; ui.streetEl.style.display = ''
      ui.ticker(true); ui.tickerRun.textContent = '◆ ' + longestOf(T.NEWS) + '   ◆'
      ui.setObjective(S.objective, { title: S.objTitle, sub: S.objSub, flash: false })
      ui.setTimer(125)
      ui.rewards.freeze(true)
      ui.rewards.push('respect', 12, { k: 'gop', icon: '👊', who: 'gopnici', tier: tierName, why: S.why[0] })
      ui.rewards.push('lei', 12345, { why: S.why[1] })
      for (let i = 0; i < 4; i++) ui.rewards.update()
      hold(() => { for (const t of S.notify.slice(0, 2)) ui.notify(t, 1e6) })
      ui.prompt(S.prompt)
      if (S.help) ui.help(S.help)
      const n = npc()
      ui.bubble(n, S.gender, 1e6)
      const b = ui.bubbles.get(n).el
      b.style.left = Math.round(innerWidth * 0.62) + 'px'; b.style.top = Math.round(innerHeight * 0.42) + 'px'
      return {
        scope: '#ui', overlap: true,
        expect: ['.objective .o', '.objective .sub', '.objective .timer', '.toast', '.rw-chip .v', '.prompt', '.hud-clock', '.hud-money', '.hud-weapon', '.vname', '.speedo span', '.bubble', '.minimap-street'],
        gender: [b.textContent],
      }
    },
    // someone talks while you walk past a prompt, crossing into another district
    talk() {
      clearHud()
      ui.subtitle(S.subName, S.subtitle, 0)
      hold(() => ui.districtBanner('Botanica'))
      ui.prompt(S.prompt)
      const n = npc()
      ui.bubble(n, S.bubble, 1e6)
      const b = ui.bubbles.get(n).el
      b.style.left = Math.round(innerWidth * 0.5) + 'px'; b.style.top = Math.round(innerHeight * 0.4) + 'px'
      return { scope: '#ui', overlap: true, expect: ['.subtitle', '.district-banner .n', '.prompt', '.bubble'] }
    },
    // a tip and the neighbours' group chat under the objective
    tips() {
      clearHud()
      ui.tip(S.tip, 0)
      if (side) { hold(() => side.viber(S.viberWho, T.fill(g, S.viber), 1e6)); hold(() => side.feed(S.feed, 1e6)) }
      return { scope: '#ui', overlap: true, expect: ['.tip', '.viber .vm'] }
    },
    // a reward burst: four chips and four notifications (the most either shows at once)
    rewards() {
      clearHud()
      ui.rewards.push('respect', 12, { k: 'gop', icon: '👊', who: 'gopnici', tier: tierName, why: S.why[0] })
      ui.rewards.push('lei', 12345, { why: S.why[1] })
      ui.rewards.push('xp', -250, { why: S.why[2] })
      ui.rewards.push('aura', 160, { why: S.why[3] })
      for (let i = 0; i < 8; i++) ui.rewards.update()
      hold(() => { for (const t of S.notify) ui.notify(t, 1e6) })
      return { scope: '#ui', overlap: true, expect: ['.toast', '.rw-chip .v'] }
    },
    overlay() {
      clearHud()
      hold(() => ui.overlay(S.overlay, 1e6, { tone: 'blue', gray: true }))
      return { scope: '.overlay-msg', expect: ['.overlay-msg .h'] }
    },
    banners() {
      clearTop()
      hold(() => ui.missionBanner(S.bannerKick, S.bannerTitle))
      hold(() => ui.bigMessage(S.bigTitle, S.bigSub, { secs: 1e6 }))
      return { scope: '.mbanner, .bigmsg', expect: ['.mbanner .t', '.bigmsg .h', '.bigmsg .s'] }
    },
    chapter() {
      clearTop()
      hold(() => ui.chapter(S.chapterKick, S.chapterName, S.chapterDesc, 1e6))
      return { scope: '.chapter', expect: ['.chapter .k', '.chapter .n', '.chapter .d'] }
    },
    'stage-ach'() {
      clearTop(); ui.hud.style.opacity = '1'
      stage.show({ kind: 'ach', icon: ach.icon, name: ach.name, tiers: 3, tier: 2, hidden: false, reward: { lei: 12500, clothesName: longestOf(T.GOAL_CLOTHES.map((c) => c.name)) }, roll: true, count: 59, total: 70 })
      return { scope: '.gcard', expect: ['.gcard .t', '.gcard .k'] }
    },
    'stage-explain'() {
      stage.show({ kind: 'explain', icon: explain.icon || '💡', title: (explain.title || '').toUpperCase(), text: explain.text, foot: explain.foot })
      return { scope: '.gcard', expect: ['.gcard .x'] }
    },
    'stage-respect'() {
      stage.show({ kind: 'respect', icon: '👊', who: 'gopnici', tierName: T.RESPECT_NAMES[respK][respT], text: T.RESPECT_PERKS[respK][respT] })
      return { scope: '.gcard', expect: ['.gcard .t', '.gcard .x'] }
    },
    'stage-streak'() {
      stage.show({ kind: 'streak', day: 7, week: 12, reward: { lei: 250, aura: 60, mama: true }, roll: true, next: 'Săptămână completă! Mâine începe una nouă.' })
      return { scope: '.gcard', expect: ['.gcard .f'] }
    },
    menu() {
      stage.clear(); ui.showHud(false)
      g.cloud = { enabled: true, loggedIn: false, on: () => () => {}, ready: async () => {}, setResolver() {} }
      menus.showMain()
      return { scope: '.mainmenu', expect: ['.mm-btns .btn', '.mm-tag'] }
    },
    'pause-settings'() {
      menus.close(); g.state = 'play'
      menus.showPause('settings')
      return { scope: '.pause', expect: ['.pause .tabs button', '.setting span'] }
    },
    'pause-controls'() { document.querySelector('.pause .tabs [data-t="controls"]').click(); return { scope: '.pause', expect: ['.ctl td:first-child'] } },
    'pause-missions'() { document.querySelector('.pause .tabs [data-t="missions"]').click(); return { scope: '.pause', expect: ['.mission-item .mt'] } },
    'pause-ach'() { document.querySelector('.pause .tabs [data-t="ach"]').click(); return { scope: '.pause', expect: ['.ach-card .nm'] } },
  }
  window.__settle = settle
  return Object.keys(window.__frames)
}

function measure({ scope, expect = [], overlap = false }) {
  const W = innerWidth, H = innerHeight, out = []
  const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''))
  const path = (e) => { const p = []; for (let x = e; x && x.id !== 'ui' && x !== document.body && p.length < 3; x = x.parentElement) p.unshift(name(x)); return p.join(' > ') }
  const shown = (e) => {
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false
    }
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const roots = [...document.querySelectorAll(scope)]
  const els = [...new Set(roots.flatMap((r) => [r, ...r.querySelectorAll('*')]))]
    .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
  const R = (r) => [r.left, r.top, r.right, r.bottom].map(Math.round)
  for (const e of els) {
    if (!shown(e) || e.closest('.ticker .run') || e.closest('select, option')) continue
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    const text = e.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)
    const at = path(e)
    if (/\bundefined\b|\bNaN\b|\[object |(^|\s)null(\s|$)/.test(e.textContent)) out.push({ kind: 'undefined', at, text })
    // (a menu that scrolls is meant to: only its own box counts)
    let scroller = null
    for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x); if (/(auto|scroll)/.test(o.overflowX + ' ' + o.overflowY)) { scroller = x; break } }
    if (!scroller && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) out.push({ kind: 'offscreen', at, text, rect: R(r) })
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'
    if ((cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) || (clamp && e.scrollHeight > e.clientHeight + 1)) out.push({ kind: 'ellipsis', at, text })
    else if (/(hidden|clip)/.test(cs.overflowX + ' ' + cs.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) out.push({ kind: 'clipped', at, text })
    // text wider than its own box, spilling over whatever is next to it
    else if (/^(block|flex|grid|inline-block|list-item|-webkit-box)$/.test(cs.display) && cs.overflowX === 'visible' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) out.push({ kind: 'overflow', at, text: text + ' (' + e.scrollWidth + ' > ' + e.clientWidth + ' px)' })
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
      const o = getComputedStyle(x)
      if (/(auto|scroll)/.test(o.overflowX + ' ' + o.overflowY)) break
      if (/(hidden|clip)/.test(o.overflowX + ' ' + o.overflowY)) {
        const a = x.getBoundingClientRect()
        if (r.left < a.left - 1 || r.right > a.right + 1 || r.top < a.top - 1 || r.bottom > a.bottom + 1) out.push({ kind: 'clipped', at, text, by: name(x) })
        // a round mask (the minimap): the corners of the text itself (inside its padding) must be in the circle
        const br = o.borderTopLeftRadius, rad = br.endsWith('%') ? (parseFloat(br) / 100) * a.width : parseFloat(br)
        if (rad >= a.width / 2 - 1) {
          const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2, rx = a.width / 2, ry = a.height / 2
          const x0 = r.left + parseFloat(cs.paddingLeft), x1 = r.right - parseFloat(cs.paddingRight), y0 = r.top + parseFloat(cs.paddingTop), y1 = r.bottom - parseFloat(cs.paddingBottom)
          if ([[x0, y0], [x1, y0], [x0, y1], [x1, y1]].some(([px, py]) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > 1)) out.push({ kind: 'clipped', at, text, by: name(x) + ' (round)' })
        }
        break
      }
    }
  }
  for (const sel of expect) {
    const all = [...document.querySelectorAll(sel)]
    if (!all.length) out.push({ kind: 'missing', at: sel, text: '' })
    for (const e of all.filter(shown)) if (!e.textContent.trim()) out.push({ kind: 'empty', at: sel, text: '' })
  }
  if (overlap) {
    const groups = {
      ticker: '.ticker', objective: '.hud-tl > *', stats: '.hud-tr > .hud-clock, .hud-tr > .hud-money, .hud-tr > .hud-weapon, .hud-tr .rw-chip, .hud-tr .toast',
      map: '.hud-bl > *', car: '.hud-br', prompt: '.prompt', help: '.help-keys', subtitle: '.subtitle', district: '.district-banner',
      buttons: '.ttop .tbtn, .tbtns .tbtn',
    }
    const boxes = Object.entries(groups).map(([k, sel]) => [k, [...document.querySelectorAll(sel)].filter(shown).map((e) => ({ e, r: e.getBoundingClientRect() }))])
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        for (const a of boxes[i][1]) {
          for (const b of boxes[j][1]) {
            const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
            if (w > 2 && h > 2) out.push({ kind: 'overlap', at: `${boxes[i][0]} (${name(a.e)}) × ${boxes[j][0]} (${name(b.e)})`, text: `${Math.round(w)}×${Math.round(h)} px` })
          }
        }
      }
    }
  }
  return out
}

// ---- run ----------------------------------------------------------------------------------------------------------
mkdirSync(join(ROOT, 'shots'), { recursive: true })
let problems = 0
const pageErrors = []
const report = []
for (const [w, h, touch] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.on('pageerror', (e) => pageErrors.push(`${w}×${h}: ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => window.__tf, null, { timeout: 180000 })
  const frames = await page.evaluate(setup, [S, touch])
  await page.evaluate(() => document.fonts.ready.then(() => true))
  const mountErrors = await page.evaluate(() => window.__mountErrors)
  for (const m of mountErrors) pageErrors.push(`${w}×${h}: ${m}`)
  const shots = []
  for (const f of frames) {
    const spec = await page.evaluate((f) => window.__frames[f](), f)
    await page.evaluate(() => document.fonts.ready.then(() => window.__settle()))
    const found = await page.evaluate(measure, spec)
    if (spec.gender) for (const t of spec.gender) if (/\[\[|\]\]/.test(t)) found.push({ kind: 'unfilled', at: '.bubble', text: t })
    for (const x of found) report.push({ size: `${w}×${h}`, frame: f, ...x })
    const sized = found.map((x) => ({ size: `${w}×${h}`, frame: f, ...x }))
    shots.push({ f, png: (await page.screenshot({ type: 'png' })).toString('base64'), n: sized.filter((x) => !note(x)).length, notes: sized.filter(note).length })
  }
  await page.close()
  // the contact sheet: every frame of this size on one image
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const cell = Math.min(520, Math.round(1560 / 3) - 16)
  await sheet.setContent(`<body style="margin:0;padding:12px;background:#15121a;font:13px sans-serif;color:#eee;display:flex;flex-wrap:wrap;gap:12px;width:1576px">
    <h2 style="width:100%;margin:4px 0 0;font-weight:600">textfit · ${w}×${h}</h2>
    ${shots.map((s) => `<figure style="margin:0;width:${cell}px"><img style="width:100%;display:block;border:1px solid #444" src="data:image/png;base64,${s.png}"><figcaption style="padding:4px 2px;color:${s.n ? '#ff8a7a' : '#8fd47a'}">${s.f}${s.n ? ` · ${s.n} problem${s.n > 1 ? 's' : ''}` : ' · ok'}${s.notes ? ` · ${s.notes} note${s.notes > 1 ? 's' : ''}` : ''}</figcaption></figure>`).join('')}</body>`)
  await sheet.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  const file = join(ROOT, 'shots', `textfit-${w}x${h}.png`)
  writeFileSync(file, await sheet.screenshot({ type: 'png', fullPage: true }))
  await sheet.close()
  const here = report.filter((r) => r.size === `${w}×${h}`)
  console.log(`${w}×${h}: ${shots.length} frames · ${here.filter((r) => !note(r)).length} problems · ${here.filter(note).length} notes · shots/textfit-${w}x${h}.png`)
}
await browser.close()
await server.close()

// ---- report -------------------------------------------------------------------------------------------------------
console.log('\nstrings used:')
for (const [k, v] of Object.entries(S)) console.log(`  ${k.padEnd(12)} ${Array.isArray(v) ? v.map((x) => JSON.stringify(x)).join(' | ') : JSON.stringify(v)}`)
const show = (title, list) => {
  const byKind = {}
  for (const r of list) (byKind[r.kind] ||= []).push(r)
  for (const [kind, l] of Object.entries(byKind)) {
    console.log(`\n== ${title}${kind} (${l.length})`)
    for (const r of l) console.log(`  ${r.size.padEnd(9)} ${r.frame.padEnd(15)} ${r.at}${r.by ? ' [cut by ' + r.by + ']' : ''}${r.rect ? ' ' + JSON.stringify(r.rect) : ''}  ${r.text}`)
  }
}
show('note · ', report.filter(note))
show('', report.filter((r) => !note(r)))
for (const e of pageErrors) console.log('PAGE ERROR ' + e)
problems = report.filter((r) => !note(r)).length + pageErrors.length
console.log(`\ntextfit.mjs: ${SIZES.length} sizes · ${problems} problem${problems === 1 ? '' : 's'} · ${report.filter(note).length} notes`)
process.exitCode = problems ? 1 : 0
