// Dev tool: exercises the side systems in headless Chromium and reports pass/fail per check.
// usage: node tools/systems.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5196, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = (fn, arg) => page.evaluate(fn, arg)
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => { const g = window.__game; await g.debug.startAt('profetul'); g.autoTalk = true })
await wait(1500)

// ---- save / load round trip -------------------------------------------------------------
let r = await ev(() => { const g = window.__game; g.progress.lei = 321; g.progress.save(); const s = JSON.parse(localStorage.getItem('cr3d-save')); return { lei: s.lei, done: s.story.done.length, v: s.v } })
check('save writes localStorage', r.lei === 321 && r.done === 7 && r.v === 3, JSON.stringify(r))

// ---- busted: bribe path ------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.police.setLevel(2)
  const before = g.progress.lei
  g.autoChoices = [0]
  await g.director.busted()
  return { lvl: g.police.level, spent: before - g.progress.lei, control: g.player.control }
})
check('busted → bribe clears wanted level', r.lvl === 0 && r.spent > 0 && r.control, JSON.stringify(r))

// ---- combat: punch a pedestrian, police notice ----------------------------------------------------
r = await ev(async () => {
  const g = window.__game, p = g.player
  const ped = g.peds.spawn(p.pos.x + Math.sin(p.char.heading) * 1.1, p.pos.z + Math.cos(p.char.heading) * 1.1)
  ped.state = 'idle'
  const hp0 = ped.hp
  // give each swing time to land even when frames are slow (software rendering)
  for (let i = 0; i < 6 && ped.hp >= hp0; i++) {
    p.attackCD = 0; p.aimYaw = null; p.attack()
    const f0 = g.frame
    for (let k = 0; k < 40 && g.frame < f0 + 8; k++) await new Promise((r) => setTimeout(r, 100))
  }
  return { hp0, hp: ped.hp, ko: ped.char.ko, heat: g.police.heat }
})
check('punches hurt a pedestrian', r.hp < r.hp0, JSON.stringify(r))

// ---- fainting: wake up at home, lose some cash ----------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.police.clear()
  const lei0 = g.progress.lei
  g.progress.hurt(1000)
  await new Promise((r) => setTimeout(r, 7000))
  const home = g.world.places.acasa
  return { d: Math.hypot(g.player.pos.x - home.x, g.player.pos.z - home.z), hp: g.progress.hp, lost: lei0 - g.progress.lei, control: g.player.control }
})
check('fainting sends you home', r.d < 6 && r.hp > 0 && r.control, JSON.stringify(r))

// ---- potholes ----------------------------------------------------------------------------------------
r = await ev(() => {
  const g = window.__game, s = g.story
  const h = s.potholes.list.find((q) => !q.fixed)
  const civic0 = g.progress.civic
  s.acts.fixPothole(h)
  return { fixed: h.fixed, n: g.progress.potholes.length, civic: g.progress.civic - civic0 }
})
check('filling a pothole', r.fixed && r.n === 1 && r.civic > 0, JSON.stringify(r))

// ---- lost dossiers --------------------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game, s = g.story, p = g.player
  const spots = s.acts.dosarSpots()
  const d = spots[0]
  p.teleport(d.x, g.physics.groundHeight(d.x, d.z, 3), d.z)
  for (let i = 0; i < 30 && !g.progress.dosare.length; i++) await new Promise((r) => setTimeout(r, 200))
  return { spots: spots.length, got: g.progress.dosare.length }
})
check('30 dossier spots, pickup works', r.spots === 30 && r.got === 1, JSON.stringify(r))

// ---- Borea's shop: buy the first offer ---------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.progress.lei = 500
  g.autoChoices = [0, 99]
  await g.story.acts.boreaShop()
  return { weapons: g.progress.weapons.slice(), lei: g.progress.lei }
})
check("Borea's shop sells a weapon", r.weapons.length > 1 && r.lei < 500, JSON.stringify(r))

// ---- weapon swap -------------------------------------------------------------------------------------------
r = await ev(() => { const g = window.__game; const w0 = g.progress.weapon; g.combat.cycleWeapon(g.player); return { w0, w: g.progress.weapon } })
check('weapon cycling', r.w !== r.w0, JSON.stringify(r))

// ---- taxi shift on [T] ------------------------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game, p = g.player
  const v = g.vehicles.spawn('taxi', p.pos.x + 4, p.pos.z, 0)
  v.keep = true
  g.vehicles.enter(v)
  await new Promise((r) => setTimeout(r, 400))
  g.input.pressedSet.add('KeyT')
  for (let k = 0; k < 80 && !g.story.active; k++) await new Promise((r) => setTimeout(r, 100))
  const started = g.story.active?.def.id
  g.vehicles.exit(true)
  for (let k = 0; k < 150 && g.story.active; k++) await new Promise((r) => setTimeout(r, 100))
  return { started, after: g.story.active?.def.id || null }
})
check('taxi shift starts with T and ends on exit', r.started === 'act_taxi' && !r.after, JSON.stringify(r))

// ---- carjack: yank an AI driver ------------------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  const d = g.traffic.drivers.find((x) => x.v && !x.v.def.trolley)
  if (!d) return { skip: true }
  const before = new Set(g.peds.list)
  const at = { x: d.v.pos.x, z: d.v.pos.z }
  g.vehicles.enter(d.v)
  await new Promise((r) => setTimeout(r, 300))
  const ok = g.player.vehicle === d.v
  g.vehicles.exit(true)
  // the yanked driver is a new pedestrian right next to the car
  return { ok, ejected: g.peds.list.some((n) => !before.has(n) && Math.hypot(n.pos.x - at.x, n.pos.z - at.z) < 8) }
})
check('carjacking an AI car', r.skip || (r.ok && r.ejected), JSON.stringify(r))

// ---- pause menu opens/closes ------------------------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.menus.showPause('missions')
  const open = !!document.querySelector('.pause') && g.paused
  g.menus.closePause()
  return { open, closed: !document.querySelector('.pause') && !g.paused }
})
check('pause menu', r.open && r.closed, JSON.stringify(r))

// ---- continue from save after reload ---------------------------------------------------------------------------------
await ev(() => window.__game.progress.save())
await page.reload()
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
r = await ev(() => ({ hasContinue: [...document.querySelectorAll('.mm-btns .btn')].some((b) => b.textContent.includes('Continuă')) }))
check('main menu offers Continue', r.hasContinue)
await ev(() => [...document.querySelectorAll('.mm-btns .btn')].find((b) => b.textContent.includes('Continuă')).click())
await wait(2500)
r = await ev(() => { const g = window.__game; return { state: g.state, done: g.progress.story.done.length, weapons: g.progress.weapons.length, giver: g.story.giverId } })
check('continue restores progress', r.state === 'play' && r.done === 7 && r.weapons > 1, JSON.stringify(r))

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
