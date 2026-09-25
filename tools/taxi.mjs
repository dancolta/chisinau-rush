// Dev tool: taxi fares, the taxi shift, the chauffeur and the prologue ride, in headless Chromium.
// usage: node tools/taxi.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

// fs.strict off: lets the tool run from a snapshot copy whose node_modules is a symlink
const server = await createServer({ server: { port: 5194, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
let current = 'boot'
const errors = []
page.on('console', (m) => {
  if (m.type() !== 'error' || /status of 403/.test(m.text())) return
  errors.push(m.text().slice(0, 400)); console.log(`  [console.error · ${current}] ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log(`  [pageerror · ${current}] ${e.message}`) })
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = (fn, arg) => page.evaluate(fn, arg)

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  await g.debug.startAt('profetul')
  g.autoTalk = true
  const L = await import('/src/world/CityLayout.js')
  const T = window.T = {
    ms: (n) => new Promise((r) => setTimeout(r, n)),
    // waits count game frames, not wall time (software rendering is slow and uneven)
    async until(fn, frames = 900) {
      const f0 = g.frame
      for (let k = 0; k < 20000; k++) {
        let ok = false
        try { ok = fn() } catch { ok = false }
        if (ok) return true
        if (g.frame - f0 > frames) return false
        await T.ms(40)
      }
      return false
    },
    async frames(n) { const f0 = g.frame; for (let k = 0; k < 20000 && g.frame < f0 + n; k++) await T.ms(30) },
    // a spot along the road near (x, z) that no other car (or the trolleybus) is standing on
    spot(x, z, ry, self = null) {
      g.vehicles.clearSpot(x, z, 8)
      const fx = Math.sin(ry), fz = Math.cos(ry)
      let best = null
      for (const s of [0, 4, -4, 7, -7]) {
        const px = x + fx * s, pz = z + fz * s
        let gap = 99
        for (const o of g.vehicles.list) if (o !== self) gap = Math.min(gap, Math.hypot(o.pos.x - px, o.pos.z - pz) - o.def.dims[2] - 2.4)
        if (!best || gap > best.gap) best = { x: px, z: pz, gap }
        if (gap > 2) break
      }
      return best
    },
    cab(x, z, ry) { const s = T.spot(x, z, ry); const v = g.vehicles.spawn('taxi', s.x, s.z, ry); v.keep = true; return v },
    park(v, x, z, ry) { const s = T.spot(x, z, ry, v); v.teleport(s.x, g.physics.groundHeight(s.x, s.z, 3) + 0.3, s.z, ry) },
    // the kerb lane next to a spot on the pavement, facing so the kerb is on the right
    kerb(x, z) {
      let best = null
      for (const r of L.H_ROADS) { const d = Math.abs(z - r.z); if (!best || d < best.d) best = { d, h: true, r } }
      for (const r of L.V_ROADS) { const d = Math.abs(x - r.x); if (!best || d < best.d) best = { d, h: false, r } }
      const off = best.r.w / 2 - 1.75
      if (best.h) { const s = Math.sign(z - best.r.z) || 1; return { x, z: best.r.z + s * off, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2 } }
      const s = Math.sign(x - best.r.x) || 1
      return { x: best.r.x + s * off, z, ry: s > 0 ? Math.PI : 0 }
    },
    // a fresh cab on the boulevard with the hero at the wheel
    async drive(x = -146, z = 5.75) {
      const p = g.player
      if (p.vehicle) g.vehicles.exit(true)
      g.police.clear()
      p.teleport(x - 4, 0.2, 14, Math.PI / 2)
      const cab = T.cab(x, z, Math.PI / 2)
      g.vehicles.enter(cab)
      await T.frames(8)
      return cab
    },
    drop(cab) { if (g.player.vehicle) g.vehicles.exit(true); if (g.vehicles.list.includes(cab)) g.vehicles.remove(cab) },
    fails: [], big: [], notes: [],
  }
  g.events.on('mission:fail', (d, r) => T.fails.push({ id: d.id, r }))
  // what the player gets told
  const big = g.ui.bigMessage.bind(g.ui), note = g.ui.notify.bind(g.ui)
  g.ui.bigMessage = (t, s, o) => { T.big.push(`${t} | ${s || ''}`); return big(t, s, o) }
  g.ui.notify = (t, s, c) => { T.notes.push(t); return note(t, s, c) }
})

// ---- one story fare, start to finish ---------------------------------------------------------------------------
current = 'fare'
let r = await ev(async () => {
  const g = window.__game, p = g.player, T = window.T
  const { taxiFare } = await import('/src/story/missions/common.js')
  const cab = await T.drive()
  const from = { x: -120, z: 13.5 }, to = { x: 100, z: 13.5 }
  let res = null
  g.story.run({
    id: 't_fare', activity: true, title: 'Test', silentPass: true, noRetry: true,
    async script(m) { res = await taxiFare(m, { taxi: cab, name: 'Testul', from, to, toLabel: 'Grădina', patience: 25 }) },
  })
  const out = {}
  out.spawned = await T.until(() => g.story.npcs.some((n) => n.name === 'Testul'), 300)
  // pull up beside the client
  T.park(cab, from.x, 9.25, Math.PI / 2)
  out.locked = await T.until(() => p.control === false, 400)
  out.rode = await T.until(() => /Du clientul/.test(g.ui.objective || ''), 900)
  out.control = p.control
  // five knocks in one go, then three more a moment later: two crashes
  for (let i = 0; i < 5; i++) g.events.emit('player:crash', { force: 30 })
  const t1 = g.story.active.t
  await T.until(() => g.story.active.t - t1 > 1.6, 600)
  for (let i = 0; i < 3; i++) g.events.emit('player:crash', { force: 30 })
  // out of the cab mid-ride: the client's patience shows on the objective, and goes back in
  g.vehicles.exit(true)
  out.timer = await T.until(() => !!g.ui.objEl.querySelector('.timer'), 300)
  out.timerText = g.ui.objEl.querySelector('.timer')?.textContent
  g.vehicles.enter(cab)
  out.timerGone = await T.until(() => !g.ui.objEl.querySelector('.timer'), 300)
  const lei0 = g.progress.lei
  T.park(cab, to.x - 5, 9.25, Math.PI / 2)
  await T.until(() => res, 1500)
  out.res = res && { total: res.total, crashes: res.crashes }
  out.paid = g.progress.lei - lei0
  await T.until(() => !g.story.active, 300)
  T.drop(cab)
  return out
})
check('fare: the cab waits while the client climbs in', r.spawned && r.locked && r.rode && r.control, JSON.stringify(r))
check('fare: one knock counts once', r.res?.crashes === 2, JSON.stringify(r.res))
check('fare: stepping out shows how long the client will wait', r.timer && r.timerGone, `timer ${r.timerText}`)
check('fare: pays on arrival', !!r.res && r.paid === r.res.total && r.paid > 0, `paid ${r.paid}`)

// ---- a wrecked cab ends a story fare there and then ------------------------------------------------------------
current = 'fare wreck'
r = await ev(async () => {
  const g = window.__game, T = window.T
  const { taxiFare } = await import('/src/story/missions/common.js')
  const cab = await T.drive()
  const n0 = T.fails.length
  g.story.run({
    id: 't_wreck', activity: true, title: 'Test', silentPass: true, noRetry: true,
    async script(m) { await taxiFare(m, { taxi: cab, name: 'Testul2', from: { x: -120, z: 13.5 }, to: { x: 100, z: 13.5 }, toLabel: 'Grădina', patience: 25 }) },
  })
  await T.until(() => g.story.npcs.some((n) => n.name === 'Testul2'), 300)
  const t0 = g.frame
  cab.damage(1e6)
  const ended = await T.until(() => !g.story.active, 600)
  const out = { ended, frames: g.frame - t0, fails: T.fails.slice(n0), timer: !!g.ui.objEl.querySelector('.timer') }
  T.drop(cab)
  return out
})
check('fare: a wrecked cab fails the fare right away', r.ended && r.fails.some((f) => f.id === 't_wreck' && /praf/.test(f.r)) && !r.timer, JSON.stringify(r))

// ---- the taxi shift ------------------------------------------------------------------------------------------------
current = 'shift'
r = await ev(async () => {
  const g = window.__game, T = window.T
  const cab = await T.drive()
  let saves = 0
  const save = g.progress.save
  g.progress.save = function () { saves++; return save.call(this) }
  const known = new Set(g.story.npcs)
  const FEM = ['Clienta', 'O doamnă cu sacoșe', 'O studentă', 'O turistă', 'O pensionară']
  const MAN = ['Clientul', 'Un domn grăbit', 'Un student', 'Un turist', 'Un pensionar']
  // a new client (cast members come and go with distance, so go by the name too)
  const client = () => g.story.npcs.find((n) => !known.has(n) && (FEM.includes(n.name) || MAN.includes(n.name)))
  const out = { clients: [] }
  g.input.pressedSet.add('KeyT')
  out.started = await T.until(() => g.story.active?.def.id === 'act_taxi', 300)
  for (let i = 0; i < 2 && out.started; i++) {
    if (!await T.until(() => client(), 600)) break
    const npc = client()
    known.add(npc)
    const spec = npc.char.spec || {}
    const c = { name: npc.name, woman: 'stockings' in spec, d: Math.round(Math.hypot(npc.pos.x - cab.pos.x, npc.pos.z - cab.pos.z)), seen: g.traffic.visible(npc.pos.x, npc.pos.z) }
    c.ok = c.woman === FEM.includes(c.name)
    out.clients.push(c)
    const k = T.kerb(npc.pos.x, npc.pos.z)
    T.park(cab, k.x, k.z, k.ry)
    c.rode = await T.until(() => /Du clientul/.test(g.ui.objective || ''), 900)
    const to = g.ui.marker
    const lei0 = g.progress.lei, s0 = saves
    const k2 = T.kerb(to.x, to.z)
    T.park(cab, k2.x, k2.z, k2.ry)
    await T.until(() => saves > s0, 1500)
    c.paid = g.progress.lei - lei0
    c.saved = saves > s0
  }
  // a wreck ends the shift with its summary, not with a failed mission
  const n0 = T.fails.length, b0 = T.big.length, m0 = T.notes.length
  cab.damage(1e6)
  out.ended = await T.until(() => !g.story.active, 900)
  out.fails = T.fails.slice(n0).filter((f) => f.r)
  out.big = T.big.slice(b0)
  out.notes = T.notes.slice(m0)
  // and a wrecked cab offers no new shift
  g.input.pressedSet.add('KeyT')
  await T.frames(40)
  out.restarted = !!g.story.active
  g.progress.save = save
  T.drop(cab)
  return out
})
check('shift: [T] starts it', r.started, '')
check('shift: clients wait out of sight, a proper drive away', r.clients.length === 2 && r.clients.every((c) => !c.seen && c.d > 40), JSON.stringify(r.clients.map(({ name, d, seen }) => ({ name, d, seen }))))
check('shift: a client\'s name fits how they look', r.clients.length === 2 && r.clients.every((c) => c.ok), JSON.stringify(r.clients.map(({ name, woman }) => ({ name, woman }))))
check('shift: every fare pays and saves', r.clients.length === 2 && r.clients.every((c) => c.rode && c.paid > 0 && c.saved), JSON.stringify(r.clients.map(({ paid, saved }) => ({ paid, saved }))))
check('shift: a wreck ends it with a summary, not a failure', r.ended && !r.fails.length && r.big.some((b) => /TURA S-A ÎNCHEIAT/.test(b)) && !r.big.some((b) => /EȘUAT/.test(b)) && r.notes.some((n) => /praf/.test(n)), JSON.stringify({ big: r.big, notes: r.notes, fails: r.fails }))
check('shift: a wrecked cab can\'t start a new one', !r.restarted, '')

// ---- riding in the back: the driver is gentle, eases off early, lights the road at night ------------------------
current = 'chauffeur'
r = await ev(async () => {
  const g = window.__game, p = g.player, T = window.T
  if (p.vehicle) g.vehicles.exit(true)
  g.renderer.tod.set(23)
  p.teleport(-204, 0.2, 14, Math.PI / 2)
  const cab = T.cab(-200, 5.75, Math.PI / 2)
  await T.frames(5)
  const route = [{ x: -150, z: 5.75 }, { x: -60, z: 5.75 }, { x: 0, z: 5.75, speed: 4, r: 4 }, { x: 90, z: 5.75 }]
  const out = { min: 0, max: 0, top: 0, atSlow: null, head: 0 }
  g.story.run({
    id: 't_ride', activity: true, title: 'Test', silentPass: true, noRetry: true,
    async script(m) {
      m.board(cab)
      const drv = m.driver(cab, route, { speed: 14.5 })
      m.track({
        update: () => {
          out.min = Math.min(out.min, cab.throttle); out.max = Math.max(out.max, cab.throttle)
          out.top = Math.max(out.top, cab.speed)
          out.head = Math.max(out.head, g.nightLights.head.intensity)
          if (out.atSlow === null && Math.hypot(cab.pos.x, cab.pos.z - 5.75) < 5) out.atSlow = cab.speed
        },
      })
      await m.until(() => drv.done)
      m.unboard()
    },
  })
  out.fin = await T.until(() => !g.story.active, 4000)
  g.renderer.tod.set(13)
  T.drop(cab)
  for (const k of ['min', 'max', 'top', 'atSlow', 'head']) if (out[k] != null) out[k] = +out[k].toFixed(2)
  return out
})
check('chauffeur: gentle on both pedals with you in the back', r.fin && r.max <= 0.73 && r.min >= -0.36, JSON.stringify(r))
check('chauffeur: eases off before a slow corner', r.atSlow !== null && r.atSlow < 7 && r.top > 10, `at corner ${r.atSlow} m/s, top ${r.top}`)
check('chauffeur: headlights on at night for a passenger', r.head > 50, `spot ${r.head}`)

// ---- the prologue ride home, skipped halfway -----------------------------------------------------------------------
current = 'prologue'
r = await ev(async () => {
  const g = window.__game, T = window.T
  await g.debug.startAt('sosire')
  g.debug.autoplay(true)
  const out = {}
  out.ride = await T.until(() => /te duce acasă/.test(g.ui.objective || ''), 8000)
  if (!out.ride) return out
  const taxi = g.player.vehicle
  const end = { x: -55.25, z: 182 }
  let min = 0, max = 0
  const f0 = g.frame
  await T.until(() => { min = Math.min(min, taxi.throttle); max = Math.max(max, taxi.throttle); return g.frame - f0 > 90 }, 200)
  out.pedals = [+min.toFixed(2), +max.toFixed(2)]
  g.story.active.skipFlag = true
  out.jumped = await T.until(() => Math.hypot(taxi.pos.x - end.x, taxi.pos.z - end.z) < 3, 900)
  out.yaw = +Math.abs(Math.atan2(Math.sin(g.cameraRig.yaw - Math.PI), Math.cos(g.cameraRig.yaw - Math.PI))).toFixed(2)
  // the cab stays put for as long as you sit in it (Grișa drives off once you're out)
  let rolled = 0
  out.out = await T.until(() => {
    if (g.player.vehicle !== taxi) return true
    rolled = Math.max(rolled, Math.hypot(taxi.pos.x - end.x, taxi.pos.z - end.z))
    return false
  }, 1500)
  out.rolled = +rolled.toFixed(2)
  g.debug.autoplay(false)
  return out
})
check('prologue: Nea Grișa drives gently', r.ride && r.pedals && r.pedals[1] <= 0.73 && r.pedals[0] >= -0.36, JSON.stringify(r.pedals))
check('prologue: skipping the ride parks the cab at Blocul 7 and looks at home', r.jumped && r.rolled < 2.5 && r.yaw < 0.6 && r.out, JSON.stringify(r))

console.log(errors.length ? `console errors: ${errors.length}` : 'no console errors')
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
