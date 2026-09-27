// Dev tool: the Comisariatul de Poliție Centru and where an arrest ends, in headless Chromium. The
// building is there (on the map, colliders as drawn, patrol cars in their bays, two officers on the
// door who are real patrol cops), and every arrest that ends in custody lets you out on its steps:
// on foot, in control, no stars, the fine paid, the car you were driving gone, a running mission
// failed. Reports pass/fail per check.
// usage: node tools/comisariat.mjs [--shot station.png]   (the shot: the building from the street, 960x540)
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const shot = (() => { const i = args.indexOf('--shot'); return i >= 0 ? args[i + 1] : null })()
const server = await createServer({ server: { port: 5241, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
let current = '(setup)'
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { const t = m.text().slice(0, 500); if (!errors.includes(t)) console.log(`  !! console.error after "${current}": ${t}`); errors.push(t) } })
page.on('pageerror', (e) => { const t = 'PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | '); console.log(`  !! after "${current}": ${t}`); errors.push(t) })
let failed = 0, passed = 0
const check = (name, ok, info = '') => { current = name; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (ok) passed++; else failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  // (far enough into the story for the taxi shift, not so far that Nelu stands on this street)
  await g.debug.startAt('profetul', { type: 'stroitor' })
  g.debug.noStory = true
  g.autoTalk = true
  // the progression layer's prizes (achievements, rank prizes, the daily bonus) would land in the
  // middle of checks that count lei (a first arrest pays): here they don't
  const addLei = g.progress.addLei.bind(g.progress)
  g.progress.addLei = (n, reason = '') => (/^(🏆|⭐|🔥)/u.test(reason) ? undefined : addLei(n, reason))
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  const { FILTER } = await import('/src/physics/Physics.js')
  const T = window.__T = {
    g, FILTER,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 2.4), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    lines: [], toasts: [], said: [],
  }
  const od = g.ui.dialogue.bind(g.ui)
  g.ui.dialogue = (sp, L, o) => { T.lines.push(`${sp?.name} (${sp?.role}): ${L.map((l) => (typeof l === 'string' ? l : l.text)).join(' | ')}`); return od(sp, L, o) }
  const on = g.ui.notify.bind(g.ui)
  g.ui.notify = (text, ...a) => { T.toasts.push(text); return on(text, ...a) }
  const ob = g.ui.bubble.bind(g.ui)
  g.ui.bubble = (n, text, dur) => { T.said.push({ n, text }); return ob(n, text, dur) }
  // the physics clock starts behind after a slow boot: let it catch up before measuring anything
  await T.until(() => g.acc >= 0, 400)
  await T.frames(5)
  if (g.story.active) g.story.active.fail('reset')
  await T.until(() => !g.story.active && !g.ui.modalOpen, 200)
})
let r

// ================================ the building =======================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, w = g.world, s = w.comisariat, P = g.physics
  const pl = w.places.comisariat
  // a horizontal ray toward the building: where it stops is where the collider is
  const hitX = (x, y, z, dx) => { const h = P.raycast(x, y, z, dx, 0, 0, 30, T.FILTER.Q_WORLD); return h ? +h.point.x.toFixed(3) : null }
  const gh = (x, z) => +P.groundHeight(x, z, 2.4).toFixed(3)
  const fx = s.door.x, cz = s.door.z
  const inPlot = (q) => q.x > fx - 13.8 && q.x < fx + 9.6 && q.z > cz - 17 && q.z < cz + 17
  const blip = g.blips().some((b) => b.kind === 'icon' && Math.hypot(b.x - fx, b.z - cz) < 8)
  const foot = w.footprints.some((f) => Math.abs(f.x - (fx - 6.4)) < 0.01 && Math.abs(f.z - cz) < 0.01 && Math.abs(f.hx - 6.4) < 0.01 && Math.abs(f.hz - 16) < 0.01)
  const bays = g.vehicles.parkedSlots.filter((q) => q.kind === 'police')
  return {
    place: pl && { name: pl.name, kind: pl.kind, d: +Math.hypot(pl.x - fx, pl.z - cz).toFixed(1) }, blip, foot,
    // the front wall above the plinth, the plinth, the back wall, a gable end: exactly where drawn
    wall: hitX(fx + 10, 5, cz + 8, -1), wallLow: hitX(fx + 10, 1.2, cz + 8, -1), plinth: hitX(fx + 10, 0.4, cz + 8, -1),
    back: hitX(fx - 30, 5, cz, 1), door: hitX(fx + 10, 1.4, cz, -1), column: hitX(fx + 10, 1.4, cz + 2.85, -1),
    gable: (() => { const h = P.raycast(fx - 6, 5, cz + 30, 0, 0, -1, 30, T.FILTER.Q_WORLD); return h ? +h.point.z.toFixed(3) : null })(),
    floor: { landing: gh(fx + 1.3, cz), step1: gh(fx + 2.8, cz), step2: gh(fx + 3.15, cz), forecourt: gh(fx + 5, cz + 4), bay: gh(fx + 6.2, cz + 12) },
    trees: w.treeSpots.filter(inPlot).length, benches: w.benches.filter(inPlot).length,
    otherParking: g.vehicles.parkedSlots.filter((q) => q.kind !== 'police' && inPlot(q)).length,
    bays: bays.map((q) => ({ bad: !!q.bad, x: +q.x.toFixed(1), z: +q.z.toFixed(1) })),
  }
})
{
  const s = await ev(() => window.__game.world.comisariat)
  const fx = s.door.x, cz = s.door.z
  check('the place: „Comisariatul de Poliție Centru", a landmark by the door, a 🚔 on the minimap, a footprint on the map', r.place?.name === 'Comisariatul de Poliție Centru' && r.place.kind === 'landmark' && r.place.d < 6 && r.blip && r.foot, JSON.stringify({ place: r.place, blip: r.blip, foot: r.foot }))
  const near = (a, b, e = 0.03) => a !== null && Math.abs(a - b) <= e
  check('colliders as drawn: facade, plinth, back wall, gable, door, canopy column', near(r.wall, fx) && near(r.wallLow, fx) && near(r.plinth, fx + 0.15) && near(r.back, fx - 12.8) && near(r.gable, cz + 16) && near(r.door, fx + 0.25) && near(r.column, fx + 2.6), JSON.stringify({ fx, wall: r.wall, wallLow: r.wallLow, plinth: r.plinth, back: r.back, gable: r.gable, door: r.door, column: r.column }))
  const f = r.floor
  check('you can walk up it: landing and two steps under your feet, the forecourt at kerb height', near(f.landing, 0.61, 0.01) && near(f.step1, 0.46, 0.01) && near(f.step2, 0.31, 0.01) && near(f.forecourt, 0.16, 0.01) && near(f.bay, 0.16, 0.01), JSON.stringify(f))
  check('the plot is clear: no trees, benches or other parking on it; three patrol-car bays, all usable', r.trees === 0 && r.benches === 0 && r.otherParking === 0 && r.bays.length === 3 && r.bays.every((b) => !b.bad), JSON.stringify({ trees: r.trees, benches: r.benches, other: r.otherParking, bays: r.bays }))
}

// ================================ the officers on the door ===========================================
r = await ev(async () => {
  const T = window.__T, g = T.g, s = g.world.comisariat, p = g.player
  // come up the street: the officers take their posts while you're still a way off, the patrol
  // cars their bays
  T.place(s.door.x + 12, s.door.z - 80, 0)
  const posted = await T.until(() => g.comisariat.posts.every((q) => q.cop && !q.cop.disposed), 120)
  const cops = g.comisariat.posts.map((q) => q.cop)
  const cars = await T.until(() => g.vehicles.list.filter((v) => v.kind === 'police' && v.parked && Math.hypot(v.pos.x - s.door.x, v.pos.z - s.door.z) < 16).length === 3, 120)
  const info = cops.map((n, i) => ({ d: +Math.hypot(n.pos.x - s.posts[i].x, n.pos.z - s.posts[i].z).toFixed(2), y: +n.pos.y.toFixed(2), state: n.state, cop: n.personality === 'cop' && n.archetype === 'cop', peds: g.peds.list.includes(n) }))
  // walk up to one of them: E talks to him like to any cop on the beat
  const n = cops[0], q = s.posts[0]
  T.place(q.x + 1.4, q.z, -Math.PI / 2)
  const cand = await T.until(() => g.street.cand === n, 60)
  await T.frames(2)
  const prompt = document.querySelector('.prompt')?.textContent || ''
  T.lines.length = 0
  g.autoChoices = [0, 5]
  await g.street.talk(n)
  const talked = T.lines.slice()
  return { posted, cars, info, cand, prompt, talked }
})
check('two officers take their posts on the landing as you come up the street (not on the canopy), and three patrol cars their bays', r.posted && r.cars && r.info?.every((c) => c.d < 0.5 && Math.abs(c.y - 0.61) < 0.05 && c.state === 'idle' && c.cop && c.peds), JSON.stringify({ posted: r.posted, cars: r.cars, info: r.info }))
check('they are cops on the beat: E talks to them', r.cand && /polițistul/.test(r.prompt) && r.talked?.length >= 2 && /Poliția/.test(r.talked[0]), JSON.stringify({ cand: r.cand, prompt: r.prompt, talked: r.talked }))

r = await ev(async () => {
  const T = window.__T, g = T.g, s = g.world.comisariat, p = g.player
  g.police.clear()
  const cops = g.comisariat.posts.map((q) => q.cop)
  // a punch thrown right under their noses
  T.place(s.foot + 3, s.door.z + 3, -Math.PI / 2)
  await T.frames(2)
  const n0 = T.said.length
  g.events.emit('crime', { type: 'assault', x: p.pos.x, z: p.pos.z, severity: 1 })
  const level = g.police.level
  const chasing = cops.filter((n) => g.police.officers.includes(n)).length
  const whistle = T.said.slice(n0).some((q) => cops.includes(q.n))
  // it's over: they walk back to the door
  await T.frames(3)
  g.police.clear()
  T.place(s.door.x + 12, s.door.z + 30, 0)
  const back = await T.until(() => g.comisariat.posts.every((q) => q.cop && q.cop.state === 'idle' && Math.hypot(q.cop.pos.x - q.x, q.cop.pos.z - q.z) < 0.8), 600)
  return { level, chasing, whistle, back, same: g.comisariat.posts.every((q, i) => q.cop === cops[i]) }
})
check('a crime in front of them: the whistle, a star, they come for you; afterwards they walk back to the door', r.level >= 1 && r.chasing >= 1 && r.whistle && r.back && r.same, JSON.stringify(r))

// ================================ arrests that end in custody =========================================
const custody = async (how) => ev(async (how) => {
  const T = window.__T, g = T.g, s = g.world.comisariat, p = g.player, pr = g.progress
  g.police.clear()
  await T.until(() => !g.ui.modalOpen, 60)
  pr.lei = 400; pr.civic = 0; pr.respect.pol = 0; pr.flags.acteFalse = false
  g.renderer.tod.set(13)
  const lei0 = pr.lei
  let car = null
  T.toasts.length = 0
  if (how === 'busted') {
    // far away across town, at the wheel of a taxi, on a taxi shift
    const e = g.traffic.graph.edges.find((q) => { const lp = g.traffic.graph.lanePoint(q, 0, 0.5); return Math.hypot(lp.x - s.door.x, lp.z - s.door.z) > 250 && q.len > 30 })
    const lp = g.traffic.graph.lanePoint(e, 0, 0.5)
    T.place(lp.x + 3, lp.z)
    car = g.vehicles.spawn('taxi', lp.x, lp.z, Math.atan2(e.fx, e.fz))
    car.keep = true
    g.vehicles.enter(car)
    await T.frames(3)
    g.input.pressedSet.add('KeyT')
    await T.until(() => g.story.active?.def.id === 'act_taxi', 200)
  } else {
    T.place(g.world.places.pman.x + 8, g.world.places.pman.z + 8, 0)
    await T.frames(3)
  }
  const mission = g.story.active?.def.id || null
  const from = { x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1) }
  const h0 = g.renderer.tod.hour
  g.police.setLevel(how === 'busted' ? 5 : 2)
  const lvl = g.police.level
  if (how === 'busted') {
    // vorbă frumoasă at five stars never works: the fine and a walk to the station
    g.autoChoices = [1]
    await g.director.busted()
  } else {
    const o = g.police.spawnOfficerAt(p.pos.x + 1.6, p.pos.z)
    await T.frames(2)
    // hands up, then „Mă predau. Duceți-mă la secție."
    g.autoChoices = [2]
    await g.police.surrender(o)
  }
  await T.frames(3)
  const door = s.door
  return {
    how, mission, from, lvl,
    d: +Math.hypot(p.pos.x - door.x, p.pos.z - door.z).toFixed(2), y: +p.pos.y.toFixed(2), scripted: !!p.scripted,
    facing: +Math.cos(p.char.heading - s.ry).toFixed(2),
    onFoot: !p.vehicle, control: p.control, modal: g.ui.modalOpen, stars: g.police.level, fine: lei0 - pr.lei,
    carGone: car ? (car.disposed && !g.vehicles.list.includes(car)) : null,
    missionAfter: g.story.active?.def.id || null,
    hours: +(((g.renderer.tod.hour - h0) % 24 + 24) % 24).toFixed(1),
    toast: T.toasts.find((t) => /Comisariatul Centru/.test(t)) || null,
    cops: g.comisariat.posts.filter((q) => q.cop && !q.cop.disposed && Math.hypot(q.cop.pos.x - q.x, q.cop.pos.z - q.z) < 0.5).length,
    camera: !g.cameraRig.cut,
  }
}, how)

r = await custody('busted')
// (let out at the top of the steps, you walk down them while the camera comes down from the sign)
const outside = (r) => r.d < 5 && r.y > 0.1 && r.y < 0.7 && r.facing > 0.9 && r.onFoot && r.control && !r.scripted && !r.modal && r.stars === 0 && r.camera
check('busted, „vorbă frumoasă" fails: fine, then let out on the Comisariat\'s steps (on foot, in control, 0 stars)', outside(r) && r.fine === 260, JSON.stringify(r))
check('…the taxi you were driving is gone, the taxi shift failed, hours have passed, the note says so', r.carGone === true && r.mission === 'act_taxi' && !r.missionAfter && r.hours >= 3 && /Amendă/.test(r.toast || '') && r.cops === 2, JSON.stringify({ carGone: r.carGone, mission: r.mission, after: r.missionAfter, hours: r.hours, toast: r.toast, cops: r.cops }))

r = await custody('surrender')
check('hands up, „Mă predau": the same, on the Comisariat\'s steps (on foot, in control, 0 stars, the fine paid)', outside(r) && r.fine === 80 && r.hours >= 3 && !!r.toast && r.cops === 2, JSON.stringify(r))

if (shot) {
  await page.setViewportSize({ width: 960, height: 540 })
  await ev(async () => {
    const T = window.__T, g = T.g, s = g.world.comisariat
    g.renderer.applyQuality('high')
    g.renderer.tod.set(11)
    g.renderer.tod.paused = true
    T.place(s.door.x + 15, s.door.z - 5, -Math.PI / 2)
    g.comisariat.fill()
    g.ui.showHud(false)
    g.cutscene = true
    g.cameraRig.shot({ from: [s.door.x + 26, 3.4, s.door.z + 15], look: [s.door.x - 3, 6.2, s.door.z - 1], dur: 9999 })
    await T.frames(6)
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: shot, timeout: 180000 })
  console.log('saved', shot)
}

console.log(`\n${passed} passed, ${failed} failed`)
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed || errors.length ? 1 : 0)
