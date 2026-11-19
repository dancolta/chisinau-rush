// Dev tool: traffic on the Centura and the roads out. Checks the vehicle counts per quality preset,
// that the models come from VEHICLES, that everything moves the way its lane goes, stays in its lane
// on the deck, never overlaps and never comes in through a checkpoint, that the lights are on at
// night and off by day, that the instances in view are the ones drawn, what all of it adds in draw
// calls, and that there are no console errors.
// usage: node tools/centura.mjs [--shots dir]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const ai = process.argv.indexOf('--shots')
const shots = ai > 0 ? process.argv[ai + 1] : null
if (shots) fs.mkdirSync(shots, { recursive: true })

const server = await createServer({ server: { port: 5272, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 403/.test(m.text())) errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = (fn, a) => page.evaluate(fn, a)

await page.goto(base)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.debug.noStory = true
  g.story.events.t = 1e9
  g.renderer.tod.paused = true
  g.renderer.tod.set(13)
  g.weather?.set(false)
  window.__frames = async (n) => { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) }
  window.__T = await import('/src/world/HighwayTraffic.js')
  window.__V = await import('/src/data/vehicles.js')
  window.__L = await import('/src/world/CityLayout.js')
  // a fixed view from inside the city (or the player's own camera when `cam` is null)
  window.__view = async (cam, hour, frames = 3) => {
    g.renderer.tod.set(hour)
    g.freeCam = !!cam
    if (cam) { g.camera.position.set(...cam.at); g.camera.lookAt(...cam.to) }
    await window.__frames(frames)
  }
})

// ---- counts per preset, and the models they're drawn with ---------------------------------------
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const r = await ev(async (q) => {
    const g = window.__game
    g.renderer.applyQuality(q)
    await window.__frames(2)
    const s = g.world.centura.snapshot()
    return { want: window.__T.CENTURA_COUNTS[q], hw: s.filter((c) => !c.road).length, w: s.filter((c) => c.road < 0).length, e: s.filter((c) => c.road > 0).length }
  }, q)
  check(`${q}: ${r.want.highway} on the highway, ${r.want.road} on each road out`, r.hw === r.want.highway && r.w === r.want.road && r.e === r.want.road, JSON.stringify(r))
}
await ev(async () => { window.__game.renderer.applyQuality('low'); await window.__frames(2) })
const models = await ev(() => {
  const g = window.__game, H = g.world.centura
  const want = Object.entries(window.__V.VEHICLES).filter(([, d]) => d.kay && !d.police && !d.trolley && d.highway !== false && g.assets.kay[d.kay]).map(([, d]) => d.kay)
  const s = H.snapshot()
  return { want: [...new Set(want)].sort(), have: [...H.models.values()].map((m) => m.key.split(':')[0]).sort(), tris: Object.fromEntries([...H.models.values()].map((m) => [m.key, m.tris])), used: new Set(s.map((c) => c.model)).size, paints: new Set(g.world.centura.cars.map((c) => c.model.key + c.shift)).size, heavy: s.filter((c) => c.heavy).length }
})
check('every ordinary VEHICLES model drives (no police, no trolleybus, nothing marked highway: false)', JSON.stringify(models.want) === JSON.stringify(models.have) && !models.have.includes('car_police'), JSON.stringify(models))
check('varied models and paint', models.used >= Math.min(3, models.have.length) && models.paints >= 8, `models ${models.used}, model+paint ${models.paints}`)

// ---- a long run, fast-forwarded: lanes, deck, direction, gaps, speeds, the checkpoints -----------
// a long run of a traffic instance, fast-forwarded in 0.2 s steps (runs in the page)
const runFn = (H, steps) => {
  const { LANES, deckY } = window.__T, { x0: X0, x1: X1 } = window.__L.BOUNDS
  const out = { samples: 0, lane: [], deck: [], dir: [], overlap: [], inside: [], offRoad: [], turned: new Set(), speeds: [], back: [] }
  const corners = (c) => { const rx = c.fz, rz = -c.fx, n = Math.hypot(rx, rz) || 1; return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [c.x + c.fx * c.hl * a + rx / n * c.hw * b, c.z + c.fz * c.hl * a + rz / n * c.hw * b]) }
  const sep = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 4], nx = z1 - z0, nz = x0 - x1; let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d) } for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d) } if (a1 < b0 || b1 < a0) return true } return false }
  let prev = H.snapshot()
  for (let k = 0; k < steps; k++) {
    H.step(0.2)
    const s = H.snapshot()
    if (k % 3 === 0) {
      out.samples++
      for (let i = 0; i < s.length; i++) {
        const c = s[i], p = prev[i], d = [c.x - p.x, c.z - p.z]
        if (c.s >= p.s && d[0] * p.fx + d[1] * p.fz < -0.01) out.back.push([i, d])
        if (!c.road) {
          const L = LANES[c.lane]
          if (c.x - c.hw < X1 + L.x0 - 0.02 || c.x + c.hw > X1 + L.x1 + 0.02) out.lane.push([i, c.x - X1])
          if (Math.abs(c.y - deckY(c.z)) > 0.03) out.deck.push([i, c.z, c.y])
          if (Math.sign(c.fz) !== L.dir || Math.abs(c.fx) > 1e-6) out.dir.push([i, c.fz])
          out.speeds.push(c.v * 3.6)
        } else {
          const X = c.road < 0 ? X0 : X1, us = corners(c).map(([x]) => c.road * (x - X))
          if (Math.min(...us) < 2) out.inside.push([i, Math.min(...us)])
          const u = c.road * (c.x - X)
          if (Math.max(...corners(c).map(([, z]) => Math.abs(z))) > (u < 60 ? 11 : 7.5)) out.offRoad.push([i, u, c.z])
          if (u < 45) out.turned.add(i)
        }
      }
      // overlaps among neighbours
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
        const a = s[i], b = s[j]
        if (Math.hypot(a.x - b.x, a.z - b.z) > a.hl + b.hl + 1 || Math.abs(a.y - b.y) > 3) continue
        if (!sep(corners(a), corners(b))) out.overlap.push([i, j, +a.x.toFixed(1), +a.z.toFixed(1)])
      }
    }
    prev = s
  }
  const sp = out.speeds.sort((a, b) => a - b), q = (f) => +sp[Math.floor(f * (sp.length - 1))].toFixed(1)
  const roadCars = H.cars.filter((c) => c.lane.road).length
  return { samples: out.samples, lane: out.lane.slice(0, 3), nLane: out.lane.length, deck: out.deck.slice(0, 3), nDeck: out.deck.length, dir: out.dir.length, back: out.back.length, backEx: out.back.slice(0, 3), overlap: out.overlap.length, overlapEx: out.overlap.slice(0, 3), inside: out.inside.length, insideEx: out.inside.slice(0, 3), offRoad: out.offRoad.length, offEx: out.offRoad.slice(0, 3), turned: out.turned.size, roadCars, kmh: { p1: q(0.01), p50: q(0.5), p99: q(0.99), max: q(1) } }
}
await page.evaluate(`window.__run = ${runFn}`)
const run = await ev(() => window.__run(window.__game.world.centura, 900))
const n = `${run.samples} samples over 180 s`
check('highway: everything inside its lane', run.nLane === 0, `${n}; ${JSON.stringify(run.lane)}`)
check('highway: on the deck surface', run.nDeck === 0, JSON.stringify(run.deck))
check('highway: right-hand traffic (southbound by the city, northbound beyond the median)', run.dir === 0)
check('everything moves the way it faces', run.back === 0, JSON.stringify(run.backEx))
check('no two vehicles overlap', run.overlap === 0, JSON.stringify(run.overlapEx))
check('highway speeds about 70-110 km/h', run.kmh.p1 >= 62 && run.kmh.max <= 112 && run.kmh.p50 >= 75, JSON.stringify(run.kmh))
check('roads out: nothing ever reaches the checkpoint barrier', run.inside === 0, JSON.stringify(run.insideEx))
check('roads out: on the carriageway', run.offRoad === 0, JSON.stringify(run.offEx))
check('roads out: cars come up to the checkpoint and turn back', run.turned >= Math.ceil(run.roadCars / 2), `${run.turned} of ${run.roadCars}`)

// a stand-in for the vans and lorries on their way to VEHICLES: a stretched, taller sedan under a
// new name joins the traffic on its own, keeps to the slow lanes and still never overlaps
const lorry = await ev(() => {
  const g = window.__game, V = window.__V.VEHICLES, k = g.assets.kay.car_sedan
  g.assets.kay.test_lorry = { geometry: k.geometry.clone().scale(1.15, 2.1, 2.4), wheels: k.wheels }
  V.lorry = { name: 'Lorry', kay: 'test_lorry', body: 'steel', colors: ['white', 'red', 'blue'], dims: [1.1, 1.6, 5.3] }
  const H = new window.__T.HighwayTraffic(g.world)
  delete V.lorry; delete g.assets.kay.test_lorry
  H.populate('ultra')
  const heavy = H.cars.filter((c) => c.model.heavy)
  const r = window.__run(H, 450)
  H.group.removeFromParent()
  return { models: [...H.models.keys()], heavy: heavy.length, lanes: [...new Set(heavy.filter((c) => !c.lane.road).map((c) => H.hw.indexOf(c.lane)))], amber: heavy.find((c) => c.model.key === 'test_lorry:steel')?.model.lights.filter((l) => l[3] === 2).length, r }
})
check('a new VEHICLES model joins the traffic by itself', lorry.models.includes('test_lorry:steel') && lorry.heavy > 0, `${lorry.heavy} lorries; ${lorry.models.join(', ')}`)
check('lorries keep to the slow lanes, with amber roof markers', lorry.lanes.length && lorry.lanes.every((l) => l === 0 || l === 3) && lorry.amber === 2, JSON.stringify({ lanes: lorry.lanes, amber: lorry.amber }))
const lr = lorry.r
check('with lorries: lanes, deck, gaps, barrier, direction all hold', lr.nLane + lr.nDeck + lr.dir + lr.back + lr.overlap + lr.inside + lr.offRoad === 0 && lr.kmh.p1 >= 62, JSON.stringify({ lane: lr.nLane, deck: lr.nDeck, dir: lr.dir, back: lr.back, overlap: lr.overlapEx, inside: lr.inside, off: lr.offEx, kmh: lr.kmh }))

// ---- in real time: moving, lights, culling, draw calls ------------------------------------------
// from a balcony by the east wall, looking up the Centura
const roof = { at: [466, 14, 150], to: [478 + 12, 7, 50] }
const live = await ev(async (roof) => {
  const g = window.__game, H = g.world.centura
  await window.__view(roof, 13, 3)
  const humNear = H.hum
  const a = H.snapshot()
  await window.__frames(6)
  const b = H.snapshot()
  const moved = a.filter((c, i) => { const d = Math.hypot(b[i].x - c.x, b[i].z - c.z); return d > 0.05 && d < 100 }).length
  // nothing on screen culled away, and nothing drawn that isn't packed
  const cam = g.camera, v = new window.THREE.Vector3()
  const missed = H.cars.filter((c) => { H.pose(c); v.set(c.p.x, c.p.y + c.h / 2, c.p.z).project(cam); return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 && c.p.distanceTo(cam.position) < 800 && !c.vis }).length
  const packed = [...H.models.values()].reduce((s, m) => s + m.mesh.count, 0)
  const info = g.renderer.renderer.info.render
  const calls = async (on) => { H.group.visible = on; const r = []; for (let i = 0; i < 3; i++) { await window.__frames(1); r.push([info.calls, info.triangles]) } r.sort((x, y) => x[0] - y[0]); return r[1] }
  const dayOn = await calls(true), dayOff = await calls(false)
  const dayLights = { visible: H.lights.visible, lit: H.litCount }
  await window.__view(roof, 23, 3)
  const nightOn = await calls(true), nightOff = await calls(false)
  H.group.visible = true
  await window.__frames(1)
  const night = { visible: H.lights.visible, lit: H.litCount, vis: H.cars.filter((c) => c.vis).length, uNight: +H.night.toFixed(2) }
  // looking away from the east edge: nothing packed, nothing drawn
  await window.__view({ at: [0, 80, 0], to: [0, 0, 5] }, 13, 3)
  const away = [...H.models.values()].reduce((s, m) => s + m.mesh.count, 0) + H.litCount
  return { hum: { amb: !!g.audio?.amb, near: humNear, away: H.hum }, moved, total: a.length, missed, packed, models: H.models.size, day: [dayOn[0] - dayOff[0], dayOn[1] - dayOff[1]], night: [nightOn[0] - nightOff[0], nightOn[1] - nightOff[1]], dayLights, nightLights: night, away }
}, roof)
check('traffic hum by the east edge, none in the middle of town', !live.hum.amb || (live.hum.near > 0.05 && live.hum.away < 0.01), JSON.stringify(live.hum))
check('vehicles move in real time', live.moved > live.total * 0.8, `${live.moved} of ${live.total}`)
check('culling: every vehicle on screen is drawn', live.missed === 0 && live.packed > 0, `missed ${live.missed}, drawn ${live.packed}`)
check('culling: looking away from the edge draws none', live.away === 0, `${live.away}`)
check('lights off by day', !live.dayLights.visible && live.dayLights.lit === 0, JSON.stringify(live.dayLights))
check('lights on at night, for every vehicle in view', live.nightLights.visible && live.nightLights.lit >= 4 * live.nightLights.vis && live.nightLights.vis > 0, JSON.stringify(live.nightLights))
check(`draw calls added: one per model in view (${live.models} models), one for the lights`, live.day[0] > 0 && live.day[0] <= live.models && live.night[0] <= live.models + 1, `day +${live.day[0]} calls +${live.day[1]} tris, night +${live.night[0]} calls +${live.night[1]} tris`)

// ---- screenshots --------------------------------------------------------------------------------
if (shots) {
  await ev(async () => {
    const g = window.__game, H = g.world.centura
    // just the 3D view
    for (let el = document.getElementById('game-canvas'); el.parentElement; el = el.parentElement) for (const s of el.parentElement.children) if (s !== el) s.style.visibility = 'hidden'
    g.renderer.applyQuality('medium')
    await window.__frames(2)
    // a street spot by the east wall for the player's own view
    let spot = null
    for (let z = 120; z < 300 && !spot; z += 10) for (let x = 400; x > 340 && !spot; x -= 4) if (g.physics.groundHeight(x, z, 6) < 0.5) spot = [x, z]
    window.__spot = spot
  })
  const shot = async (name, cam, hour, player, prep) => {
    await ev(async ([cam, hour, player, prep]) => {
      const g = window.__game, H = g.world.centura
      // a car coming up to the checkpoint, for the road out
      if (prep) for (let i = 0; i < 3000 && !H.cars.some((c) => c.lane.side === prep && (H.pose(c), Math.abs(c.p.x) - 478 < 75)); i++) H.step(0.1)
      if (player) { const [x, z] = window.__spot; g.player.teleport(x, g.physics.groundHeight(x, z, 6), z, player) }
      await window.__view(cam, hour, player ? 14 : 4)
    }, [cam, hour, player, prep])
    await page.screenshot({ path: path.join(shots, name) })
  }
  await shot('city-day.png', null, 13, 2.0)
  await shot('city-night.png', null, 22.5, 2.0)
  await shot('deck-day.png', roof, 10)
  await shot('deck-night.png', roof, 22.5)
  await shot('road-east.png', { at: [478 - 12, 4.6, -3], to: [478 + 70, 1, 3] }, 17, null, 1)
  await shot('road-west.png', { at: [-478 + 12, 4.6, 3], to: [-478 - 70, 1, -3] }, 21, null, -1)
  console.log('shots in', shots, JSON.stringify(await ev(() => window.__spot)))
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
