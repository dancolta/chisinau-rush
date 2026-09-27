// Dev tool: how alive is the street? In headless Chromium, for each district and hour, counts
// over a minute of game time the pedestrians within 60 m of you, the moving traffic within 120 m
// and the little scenes around (benches, card players, gopnik groups), plus what keeps the city
// from filling up (spawn tries that failed, people kept alive far away), and what a frame costs.
// Runs in ?capture mode: the clock only moves when the tool steps it, so every run is the same
// length of game time however slow the machine is.
// usage: node tools/density.mjs [--quality medium] [--only centru,yard] [--hours 8,18,23]
//                               [--secs 60] [--warm 20] [--mode stand|walk|both] [--perf] [--json out.json]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const quality = opt('quality', 'medium')
const only = opt('only', '')
const hours = opt('hours', '8,18,23').split(',').map(Number)
const secs = +opt('secs', '60'), warm = +opt('warm', '20')
const mode = opt('mode', 'both')
const perf = args.includes('--perf')
const jsonOut = opt('json', '')
const port = +opt('port', '5263')

// where to stand (x, z, facing) and, walking, where to walk to and back
const SPOTS = [
  { id: 'centru', name: 'Centru, Bd. Ștefan cel Mare (PMAN)', x: 30, z: -15, ry: -Math.PI / 2, to: { x: -90, z: -15 } },
  { id: 'botanica', name: 'Botanica, str. Bănulescu-Bodoni', x: -52, z: 200, ry: Math.PI, to: { x: -52, z: 150 } },
  { id: 'rascani', name: 'Râșcani, str. Bănulescu-Bodoni', x: -52, z: -205, ry: 0, to: { x: -52, z: -155 } },
  { id: 'yard', name: 'curtea unui bloc (Botanica)', yard: true },
  { id: 'gradina', name: 'Grădina Publică', place: 'gradina' },
  { id: 'valea', name: 'Parcul Valea Trandafirilor', place: 'valea_trandafirilor' },
]

const server = await createServer({ server: { port, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
// capture mode swaps performance.now for its virtual clock: keep a real one for the frame costs
await page.addInitScript(() => { performance.__real = performance.now.bind(performance) })

await page.goto(`http://127.0.0.1:${server.config.server.port}/?capture`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && window.__cap, null, { timeout: 300000 })
const setup = await page.evaluate(async (quality) => {
  const g = window.__game
  g.settings.quality = quality
  g.renderer.applyQuality(quality)
  g.onQuality?.(quality)
  await g.debug.startAt('taxi', { name: 'Vitalik', type: 'patan' })
  for (let i = 0; i < 10; i++) window.__cap.step(1 / 30, false)
  g.debug.noStory = true
  g.story.autoStart = null
  if (g.story.active) g.story.active.fail('probe')
  for (let i = 0; i < 10; i++) window.__cap.step(1 / 30, false)
  g.story.events.t = 1e9           // no random street events: the plain street only
  g.autoTalk = true
  g.renderer.tod.paused = true
  const { blockAt } = await import('/src/world/CityLayout.js')
  // spawn bookkeeping: tries, spawns and what went away
  const P = window.__P = { tries: 0, spawned: 0, removed: 0, carTries: 0, cars: 0, carsGone: 0 }
  const sa = g.peds.spawnAmbient.bind(g.peds)
  g.peds.spawnAmbient = (...a) => { P.tries++; const n = sa(...a); if (n) P.spawned++; return n }
  const rm = g.peds.remove.bind(g.peds)
  g.peds.remove = (n) => { P.removed++; return rm(n) }
  const so = g.traffic.spawnOne.bind(g.traffic)
  g.traffic.spawnOne = (...a) => { P.carTries++; const v = so(...a); if (v) P.cars++; return v }
  const dsp = g.traffic.despawn.bind(g.traffic)
  g.traffic.despawn = (d) => { P.carsGone++; return dsp(d) }
  // a courtyard in Botanica with a bench, away from the home yard
  const yardB = g.world.benches.filter((b) => b.yard && blockAt(b.x, b.z)?.zone === 'soviet' && b.z > 150).sort((a, b) => Math.abs(a.x + 120) - Math.abs(b.x + 120))[0]
  window.__yard = yardB ? { x: yardB.x + 6, z: yardB.z + 6 } : { x: -120, z: 205 }
  return { quality: g.renderer.q.label, cores: navigator.hardwareConcurrency, pedTarget: g.peds.target, trafficTarget: g.traffic.target, yard: window.__yard }
}, quality)
console.log(`quality ${quality} (${setup.quality}) · ped target ${setup.pedTarget} · traffic target ${setup.trafficTarget} · yard ${JSON.stringify(setup.yard)}`)

const results = []
for (const spot of SPOTS) {
  if (only && !only.split(',').includes(spot.id)) continue
  for (const hour of hours) {
    for (const m of mode === 'both' ? ['stand', 'walk'] : [mode]) {
      const r = await page.evaluate(async ({ spot, hour, m, secs, warm, perf }) => {
        const g = window.__game, P = window.__P, p = g.player
        const pl = g.world.places
        let at = spot
        if (spot.place) { const q = pl[spot.place]; at = { x: q.x, z: q.z, ry: 0, to: { x: q.x + 30, z: q.z + 10 } } }
        if (spot.yard) { const y = window.__yard; at = { x: y.x, z: y.z, ry: 0, to: { x: y.x + 18, z: y.z + 14 } } }
        g.renderer.tod.set(hour)
        if (g.weather) { g.weather.set(false); g.weather.k = 0; g.weather.target = 0 }
        g.police.clear()
        if (p.vehicle) g.vehicles.exit(true)
        p.teleport(at.x, g.physics.groundHeight(at.x, at.z, 3), at.z, at.ry)
        g.cameraRig.yaw = at.ry
        g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
        g.progress.hp = g.progress.maxHp
        const step = (n, draw = false) => { for (let i = 0; i < n; i++) { window.__cap.step(1 / 30, draw); g.camera.updateMatrixWorld() } }
        // walking: there and back along the street, at a stroll
        let leg = 0
        const walk = () => {
          if (m !== 'walk' || p.scripted || g.ui.modalOpen) return
          const t = leg++ % 2 ? { x: at.x, z: at.z } : at.to
          p.scripted = { x: t.x, z: t.z, speed: 1.9, onArrive: () => {} }
        }
        const reset = () => { for (const k of Object.keys(P)) P[k] = 0 }
        // warm up (the street fills in around you), then count
        for (let t = 0; t < warm; t += 0.5) { walk(); step(15) }
        reset()
        const S = { peds60: [], peds30: [], pedsAll: [], pedsFar: [], cars120: [], moving120: [], carsAll: [], carsFar: [], groups: [], groupPeople: [], gop: [] }
        const d = (a) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z)
        for (let t = 0; t < secs; t += 0.5) {
          walk(); step(15)
          const peds = g.peds.list.filter((n) => !n.disposed && !n.char.ko)
          S.peds60.push(peds.filter((n) => d(n.pos) < 60).length)
          S.peds30.push(peds.filter((n) => d(n.pos) < 30).length)
          S.pedsAll.push(peds.length)
          S.pedsFar.push(peds.filter((n) => d(n.pos) > 115).length)
          const cars = g.traffic.drivers.filter((q) => q.v && !q.v.disposed && !q.v.def.trolley)
          S.carsAll.push(cars.length)
          S.carsFar.push(cars.filter((q) => d(q.v.pos) > 240).length)
          const near = g.vehicles.list.filter((v) => v.driver && v.driver !== 'player' && d(v.pos) < 120)
          S.cars120.push(near.length)
          S.moving120.push(near.filter((v) => Math.abs(v.speed) > 1).length)
          const spots = g.ambient.spots.filter((s) => s.npcs && d(s) < 75)
          S.groups.push(spots.length)
          S.groupPeople.push(spots.reduce((a, s) => a + s.npcs.length, 0))
          S.gop.push(spots.filter((s) => s.archetype === 'gopnik').length)
        }
        p.scripted = null
        const avg = (a) => +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1)
        const out = { spot: spot.id, hour, mode: m }
        for (const [k, a] of Object.entries(S)) { out[k] = avg(a); out[k + 'Min'] = Math.min(...a) }
        out.kinds = [...new Set(g.ambient.spots.filter((s) => s.npcs && d(s) < 75).map((s) => s.archetype || 'bench'))].join('/')
        out.tries = P.tries; out.spawned = P.spawned; out.removed = P.removed
        out.carTries = P.carTries; out.carsSpawned = P.cars; out.carsGone = P.carsGone
        // what a frame costs here: simulation and draw, split, plus the renderer's own counters
        if (perf) {
          const r = g.renderer, gl = r.renderer.getContext()
          const ou = g.update, of = g.fixedUpdate, orr = r.render
          let sim = 0, draw = 0
          g.update = function (...a) { const t0 = performance.__real(); const x = ou.apply(this, a); sim += performance.__real() - t0; return x }
          g.fixedUpdate = function (...a) { const t0 = performance.__real(); const x = of.apply(this, a); sim += performance.__real() - t0; return x }
          r.render = function (...a) { const t0 = performance.__real(); const x = orr.apply(this, a); gl.finish(); draw += performance.__real() - t0; return x }
          step(10, true)
          sim = 0; draw = 0
          let calls = 0, tris = 0
          const N = 30
          for (let i = 0; i < N; i++) { walk(); step(1, true); calls += r.renderer.info.render.calls; tris += r.renderer.info.render.triangles }
          g.update = ou; g.fixedUpdate = of; r.render = orr
          out.simMs = +(sim / N).toFixed(2); out.drawMs = +(draw / N).toFixed(1); out.calls = Math.round(calls / N); out.tris = Math.round(tris / N)
        }
        return out
      }, { spot, hour, m, secs, warm, perf })
      results.push(r)
      const f = (k) => `${r[k]}`.padStart(5)
      console.log(`${(spot.id + ' ' + String(hour).padStart(2, '0') + 'h ' + m).padEnd(20)} peds<60 ${f('peds60')} (min ${r.peds60Min}) <30 ${f('peds30')} all ${f('pedsAll')} far ${f('pedsFar')} · cars<120 ${f('cars120')} moving ${f('moving120')} (min ${r.moving120Min}) all ${f('carsAll')} · groups ${f('groups')} (${r.groupPeople} ppl, gop ${r.gop}) ${r.kinds} · ped tries ${r.tries}/${r.spawned} gone ${r.removed} · car tries ${r.carTries}/${r.carsSpawned} gone ${r.carsGone}${perf ? ` · sim ${r.simMs} ms draw ${r.drawMs} ms calls ${r.calls} tris ${r.tris}` : ''}`)
    }
  }
}

// district averages, the way a player feels them
const byMode = {}
for (const r of results) (byMode[r.mode] ||= []).push(r)
for (const [m, L] of Object.entries(byMode)) {
  const avg = (k) => +(L.reduce((a, r) => a + r[k], 0) / L.length).toFixed(1)
  console.log(`\n${m}: avg peds<60 ${avg('peds60')} · moving cars<120 ${avg('moving120')} · groups<75 ${avg('groups')}${perf ? ` · sim ${avg('simMs')} ms · draw ${avg('drawMs')} ms · calls ${avg('calls')}` : ''}`)
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ quality, setup, results }, null, 1))
if (errors.length) console.log('\nconsole errors:\n' + [...new Set(errors)].slice(0, 20).join('\n'))
await browser.close()
await server.close()
