// Dev tool: the added vehicle and street models load and work. Every new kind drives as the player on
// real key presses with its wheels on the road and turning, joins AI traffic and the parking mix, and
// can be carjacked; the new street props stand with colliders; no console errors. Prints the added
// download size. --shots dir saves a gallery of the new models next to a KayKit car and a person.
// usage: node tools/models.mjs [--shots dir]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const KINDS = ['camioneta', 'pickup', 'jeep', 'santier', 'moto']
const MODELS = ['vehicle-truck-red', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-yellow', 'vehicle-motorcycle', 'trash_A', 'trash_B', 'trafficlight_B', 'trafficlight_C', 'firehydrant']
const ADDED = ['public/assets/kenney']
const args = process.argv.slice(2)
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
if (shots) fs.mkdirSync(shots, { recursive: true })

let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }

// what the new assets add to the download (the game fetches every file in these folders)
let raw = 0, gz = 0
for (const dir of ADDED) for (const f of fs.readdirSync(dir)) {
  const b = fs.readFileSync(path.join(dir, f))
  raw += b.length; gz += zlib.gzipSync(b, { level: 9 }).length
}
check('added assets stay small', gz < 3e6, `${raw} bytes raw, ${gz} bytes gzipped`)

const server = await createServer({ server: { port: 5274, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('requestfailed', (r) => { if (/assets\//.test(r.url())) errors.push('REQUEST FAILED ' + r.url()) })
const ev = (fn, a) => page.evaluate(fn, a)

await page.goto(`http://127.0.0.1:${server.config.server.port}/`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
const loaded = await ev((models) => models.map((n) => { const k = window.__game.assets.kay[n]; return { n, verts: k?.geometry.attributes.position.count || 0, wheels: k?.wheels.length || 0 } }), MODELS)
for (const m of loaded) check(`model ${m.n} loads`, m.verts > 0 && (!/^vehicle-/.test(m.n) || m.wheels >= 2), `${m.verts} verts, ${m.wheels} wheels`)

await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  window.__frames = async (n) => { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) }
  // open ground on the square (as in drivecam.mjs)
  const P = g.world.places.pman, V = g.vehicles
  const free = (x, z, a) => !V.blockedCar(x, z, a) && !V.blocked(x, z)
  const open = (x, z) => [0, 3, 6, 9, 12, 15, 18, 20].every((r) => [...Array(r ? 24 : 1)].every((_, i) => free(x + r * Math.cos(i * Math.PI / 12), z + r * Math.sin(i * Math.PI / 12), i * Math.PI / 12)))
  let spot = null
  for (let d = 0; d <= 60 && !spot; d += 2) for (let a = 0; a < 16 && !spot; a++) { const x = P.x + d * Math.cos(a * Math.PI / 8), z = P.z + d * Math.sin(a * Math.PI / 8); if (open(x, z)) spot = { x, z } }
  window.__spot = spot
})
const spot = await ev(() => window.__spot)
check('(setup) open ground for the test drives', !!spot, JSON.stringify(spot))

// the player takes each new kind and holds W: it moves off, the wheels spin and stay on the road
for (const kind of KINDS) {
  const r = await ev(async (kind) => {
    const g = window.__game, S = window.__spot, p = g.player
    g.police.clear()
    g.vehicles.clearSpot(S.x, S.z, 20)
    const v = g.vehicles.spawn(kind, S.x, S.z, 0.4)
    p.teleport(S.x + 3, g.physics.groundHeight(S.x + 3, S.z, 6), S.z, 0)
    await window.__frames(10)
    // tyres touch the ground: wheel centre minus radius, against the road under it
    const wp = v.wheels[0].position.clone(), gy = g.physics.groundHeight(v.pos.x, v.pos.z)
    const tyre = v.wheels.map((w) => +(w.getWorldPosition(wp).y - v.wheelR - gy).toFixed(3))
    g.vehicles.enter(v)
    await window.__frames(10)
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }))
    const x0 = v.pos.x, z0 = v.pos.z, spin0 = v.spin
    key('KeyW', 'keydown')
    let peak = 0
    for (let i = 0; i < 7; i++) { await window.__frames(10); peak = Math.max(peak, v.speed) }
    key('KeyW', 'keyup')
    const out = { tyre, dist: +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1), speed: +peak.toFixed(1), spun: +(v.spin - spin0).toFixed(1), inCar: p.vehicle === v, rider: v.rider ? v.rider.visible : null, size: v.mesh.children[0].geometry.boundingBox.getSize(wp).toArray().map((n) => +n.toFixed(2)) }
    g.vehicles.exit(true)
    await window.__frames(3)
    out.riderAfter = v.rider ? v.rider.visible : null
    g.vehicles.remove(v)
    await window.__frames(5)
    return out
  }, kind)
  check(`${kind}: drives as the player on W`, r.inCar && r.dist > 4 && r.speed > 2, JSON.stringify(r))
  check(`${kind}: wheels on the road and turning`, r.tyre.every((t) => Math.abs(t) < 0.12) && r.spun > 3, `tyre gaps ${r.tyre}, spin ${r.spun}`)
  if (kind === 'moto') check('moto: a rider shows while it is ridden, not when parked', r.rider === true && r.riderAfter === false, `ridden ${r.rider}, left ${r.riderAfter}`)
}

// AI traffic: each kind is in the mix and the parking picks, and a traffic spawn of it drives off
const mix = await ev(async () => { const m = await import('/src/data/vehicles.js'); return m.TRAFFIC_MIX })
const parked = await ev((kinds) => kinds.map((k) => window.__game.vehicles.parkedSlots.filter((s) => s.kindPick === k).length), KINDS)
for (const [i, kind] of KINDS.entries()) {
  check(`${kind}: in the traffic mix and parked along the streets`, mix.includes(kind) && parked[i] > 0, `${parked[i]} parking slots`)
  const r = await ev(async (kind) => {
    const g = window.__game, p = g.player, m = await import('/src/data/vehicles.js')
    const keep = m.TRAFFIC_MIX.slice()
    let out = { spawned: false }
    // a fast car can leave the traffic radius and be despawned before it's caught: then another
    for (let attempt = 0; attempt < 4 && !out.jacked; attempt++) {
      let v = null
      try {
        m.TRAFFIC_MIX.splice(0, m.TRAFFIC_MIX.length, kind)
        for (let i = 0; i < 40 && !v; i++) v = g.traffic.spawnOne(p.pos.x, p.pos.z)
      } finally { m.TRAFFIC_MIX.splice(0, m.TRAFFIC_MIX.length, ...keep) }
      if (!v) continue
      const x0 = v.pos.x, z0 = v.pos.z
      await window.__frames(30)
      if (v.disposed) continue
      out = { spawned: v.kind === kind, ai: !!(v.driver && v.driver.eject), dist: +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1), attempt }
      // carjack it
      p.teleport(v.pos.x + 2.5, g.physics.groundHeight(v.pos.x + 2.5, v.pos.z, 6), v.pos.z, 0)
      g.vehicles.enter(v)
      await window.__frames(5)
      out.jacked = p.vehicle === v && v.driver === 'player'
      g.vehicles.exit(true)
      g.vehicles.remove(v)
      g.police.clear()
      await window.__frames(5)
    }
    return out
  }, kind)
  check(`${kind}: drives in AI traffic and can be carjacked`, r.spawned && r.ai && r.dist > 3 && r.jacked, JSON.stringify(r))
}

// street furniture: KayKit poles at the crossings with the live lamps on their lenses, hydrants on
// the kerbs, trash bags by the dumpsters; all of them solid
const props = await ev(() => {
  const g = window.__game, w = g.world
  const of = (t) => w.streetProps.filter((p) => p.type === t)
  const solid = (list) => list.slice(0, 24).every((p) => g.vehicles.blocked(p.x, p.z))
  return {
    lights: of('trafficlight').length, lightsSolid: solid(of('trafficlight')), lenses: w.trafficHeads.every((h) => h.ys[0] > h.ys[1] && h.ys[1] > h.ys[2]),
    hydrants: of('hydrant').length, hydrantsSolid: solid(of('hydrant')), hydrantsInWay: of('hydrant').filter((p) => w.keepClear(p.x, p.z)).length,
    trash: w.dynamicProps.filter((p) => /^trash_/.test(p.type)).length, trashBodies: !!(w.dyn.types.trash_A && w.dyn.types.trash_B),
  }
})
check('traffic lights: KayKit poles at the crossings, solid, lamps on the lenses', props.lights > 0 && props.lightsSolid && props.lenses, JSON.stringify(props))
check('fire hydrants on the kerbs, solid, clear of doorways and roads', props.hydrants > 0 && props.hydrantsSolid && props.hydrantsInWay === 0)
check('trash bags by the dumpsters, knock-over-able', props.trash > 0 && props.trashBodies)

if (shots) {
  // the HUD and any chat with a passer-by stay out of the pictures
  await page.setViewportSize({ width: 960, height: 540 })
  const bare = () => { for (const e of document.querySelectorAll('body *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden' }
  // line-ups on the open square: the new kinds between a KayKit Logan and the player
  const line = ['logan', ...KINDS]
  for (const [n, h] of [['front', 0.55], ['rear', Math.PI + 0.55]]) {
    await ev(async ([line, h, bare]) => {
      const g = window.__game, S = window.__spot, p = g.player
      new Function(bare)()
      g.vehicles.clearSpot(S.x, S.z, 20)
      window.__line?.forEach((v) => g.vehicles.remove(v))
      window.__line = line.map((k, i) => {
        const v = g.vehicles.spawn(k, S.x + (i - (line.length - 1) / 2) * 3.6, S.z, h)
        if (v.def.moto) v.driver = { eject() {} }
        return v
      })
      p.teleport(S.x + (line.length / 2 + 0.2) * 3.6, g.physics.groundHeight(S.x + 12, S.z, 6), S.z + 1, 0)
      const c = g.camera.position.clone()
      g.cameraRig.shot({ from: c.clone().set(S.x + 2.5, 6, S.z + 15), look: c.clone().set(S.x + 0.5, 0.4, S.z), dur: 1e6 })
      await window.__frames(20)
    }, [line, h, `(${bare})()`])
    await page.screenshot({ path: `${shots}/models_${n}.png` })
  }
  await ev(() => { const g = window.__game; window.__line.forEach((v) => g.vehicles.remove(v)) })
  // the nearest traffic light as its drivers see it, and the nearest hydrant from the road
  for (const n of ['lights', 'hydrant']) {
    await ev(async ([n, bare]) => {
      const g = window.__game, S = window.__spot, c = g.camera.position.clone()
      new Function(bare)()
      const near = (list) => list.reduce((a, b) => ((b.x - S.x) ** 2 + (b.z - S.z) ** 2 < (a.x - S.x) ** 2 + (a.z - S.z) ** 2 ? b : a))
      if (n === 'lights') {
        const h = near(g.world.trafficHeads)
        g.cameraRig.shot({ from: c.clone().set(h.x + Math.sin(h.ry) * 7, 3, h.z + Math.cos(h.ry) * 7), look: c.clone().set(h.x, h.ys[1] - 0.6, h.z), dur: 1e6 })
      } else {
        const h = near(g.world.streetProps.filter((p) => p.type === 'hydrant')), s = Math.sin(h.ry)
        g.cameraRig.shot({ from: c.clone().set(h.x + s * 4, 1.8, h.z + 2.5), look: c.clone().set(h.x, 0.6, h.z), dur: 1e6 })
      }
      await window.__frames(20)
    }, [n, `(${bare})()`])
    await page.screenshot({ path: `${shots}/props_${n}.png` })
  }
  await ev(() => window.__game.cameraRig.endShot())
}

check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
