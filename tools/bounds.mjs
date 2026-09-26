// Dev tool: the edge of the map. Walks and drives into the barriers on every side and checks that
// they stop you where you can see them (the collider's face is the face you see), that nothing gets
// through at speed, that the player never ends up outside the city or falling, that reaching the
// edge gets its line once per visit, and that there are no console errors.
// usage: node tools/bounds.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

// fs.strict off: lets the tool run from a snapshot copy whose node_modules is a symlink
const server = await createServer({ server: { port: 5198, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
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
  await g.debug.startAt('taxi')
  g.debug.noStory = true
  await new Promise((r) => setTimeout(r, 400))
  if (g.story.active) g.story.active.fail('reset')
  await new Promise((r) => setTimeout(r, 600))
  g.renderer.tod.paused = true
  g.renderer.tod.set(14)
  g.weather?.set(false)
  const L = await import('/src/world/CityLayout.js')
  const { FILTER } = await import('/src/physics/Physics.js')
  const THREE = window.THREE
  const E = window.E = {
    L,
    ms: (n) => new Promise((r) => setTimeout(r, n)),
    // waits count game frames, not wall time (software rendering is slow and uneven)
    async frames(n) { const f0 = g.frame; for (let k = 0; k < 20000 && g.frame < f0 + n; k++) await E.ms(20) },
    async until(fn, frames = 600) {
      const f0 = g.frame
      for (let k = 0; k < 20000; k++) {
        let ok = false
        try { ok = fn() } catch { ok = false }
        if (ok) return true
        if (g.frame - f0 > frames) return false
        await E.ms(20)
      }
      return false
    },
    // software rendering on a shared machine is slow and none of this needs pictures: the world
    // runs without drawing, and a couple of frames are drawn at the end of every run (shaders
    // still compile where the player is, and their errors still show)
    async show() { g.draw = true; await E.frames(2); g.draw = false },
    hold(...keys) { for (const k of keys) { g.input.down.add(k); g.input.pressedSet.add(k) } },
    release(...keys) { for (const k of keys) g.input.down.delete(k) },
    // every frame: the lowest the player got, and how far past the limit (negative = outside)
    watch: { minY: Infinity, minD: Infinity, frames: 0, on: true },
    tick() {
      if (!E.watch.on || g.state !== 'play') return
      const p = g.player, pos = p.vehicle ? p.vehicle.pos : p.pos
      E.watch.frames++
      E.watch.minY = Math.min(E.watch.minY, pos.y)
      E.watch.minD = Math.min(E.watch.minD, L.edgeDistance(pos.x, pos.z))
    },
    lines: [],
    reset() {
      const p = g.player
      E.release('KeyW', 'ShiftLeft', 'KeyS')
      if (p.vehicle) g.vehicles.exit(true)
      for (const v of E.cars || []) if (g.vehicles.list.includes(v)) g.vehicles.remove(v)
      E.cars = []
      g.police.clear()
      p.control = true
    },
    // first thing in the way along (dx, dz) at height y: the collider, and the surface you see. A
    // few rays side by side, so a gate's bars count as seen
    ray(x, y, z, dx, dz, max = 4) {
      const L2 = Math.hypot(dx, dz), ux = dx / L2, uz = dz / L2
      g.scene.updateMatrixWorld() // (the renderer does this, and it isn't drawing)
      const skip = (o) => { for (let q = o; q; q = q.parent) if (q.userData?.vehicle || q.userData?.isPlayer || q.isSkinnedMesh || q.name === 'sky') return true; return false }
      let col = null, vis = null
      for (const o of [-0.24, -0.12, 0, 0.12, 0.24]) {
        const ox = x - uz * o, oz = z + ux * o
        const h = g.physics.raycast(ox, y, oz, ux, 0, uz, max, FILTER.Q_WORLD)
        if (h && (col === null || h.dist < col)) col = h.dist
        const rc = new THREE.Raycaster(new THREE.Vector3(ox, y, oz), new THREE.Vector3(ux, 0, uz), 0, max)
        const seen = rc.intersectObjects(g.scene.children, true).find((i) => i.object.isMesh && i.object.visible && !skip(i.object))
        if (seen && (vis === null || seen.distance < vis)) vis = seen.distance
      }
      return { col: col === null ? null : +col.toFixed(3), vis: vis === null ? null : +vis.toFixed(3) }
    },
    // a straight run to the edge with nothing else in the way (the barrier is the first thing hit)
    lane(x, z, dx, dz, half = 0) {
      const L2 = Math.hypot(dx, dz), ux = dx / L2, uz = dz / L2, px = -uz, pz = ux
      let d = Infinity
      for (const o of half ? [-half, 0, half] : [0]) for (const y of [0.5, 1.0]) {
        const h = g.physics.raycast(x + px * o, y, z + pz * o, ux, 0, uz, 200, FILTER.Q_WORLD)
        d = Math.min(d, h ? h.dist : Infinity)
      }
      const ex = x + ux * d, ez = z + uz * d
      return { d, edge: L.edgeDistance(ex, ez) }
    },
    // walk (sprinting, keyboard) from (x, z) along (dx, dz) until you stop
    async walk(x, z, dx, dz, fresh = true) {
      E.reset()
      const p = g.player, hd = Math.atan2(dx, dz)
      // (from the middle of town, so every walk is a new visit to the edge)
      if (fresh) { p.teleport(0, 0.2, 20, 0); await E.frames(2) }
      p.teleport(x, g.physics.groundHeight(x, z, 3), z, hd)
      g.cameraRig.yaw = hd; g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
      p.stamina = 1
      await E.frames(3)
      const x0 = p.pos.x, z0 = p.pos.z
      E.hold('KeyW', 'ShiftLeft')
      let still = 0, lx = p.pos.x, lz = p.pos.z
      for (let k = 0; k < 600 && still < 12; k++) {
        await E.frames(1)
        p.char.heading = hd // no drifting off the line
        const m = Math.hypot(p.pos.x - lx, p.pos.z - lz)
        still = m < 0.004 && Math.hypot(p.pos.x - x0, p.pos.z - z0) > 3 ? still + 1 : 0
        lx = p.pos.x; lz = p.pos.z
      }
      E.release('KeyW', 'ShiftLeft')
      await E.show()
      const probe = [0.2, 0.35, 0.6, 1.0, 1.4].map((y) => ({ y, ...E.ray(p.pos.x, p.pos.y + y, p.pos.z, dx, dz) }))
      return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), moved: +Math.hypot(p.pos.x - x0, p.pos.z - z0).toFixed(1), d: +L.edgeDistance(p.pos.x, p.pos.z).toFixed(2), grounded: p.grounded, probe }
    },
    // drive a patrol car flat out (nitro) from (x, z) along (dx, dz) into the edge
    async drive(x, z, dx, dz) {
      E.reset()
      const hd = Math.atan2(dx, dz)
      g.vehicles.clearSpot(x, z, 10)
      const v = g.vehicles.spawn('police', x, z, hd)
      E.cars.push(v)
      g.vehicles.enter(v)
      g.progress.flags.nitro = true
      await E.frames(3)
      E.hold('KeyW', 'ShiftLeft')
      let top = 0, still = 0
      for (let k = 0; k < 900 && still < 15; k++) {
        await E.frames(1)
        top = Math.max(top, Math.abs(v.speed))
        still = top > 8 && Math.abs(v.speed) < 0.4 ? still + 1 : 0
      }
      E.release('KeyW', 'ShiftLeft')
      await E.show()
      return E.carState(v, dx, dz, top)
    },
    // put a car 20 m from the barrier already doing 60 m/s at it (at normal speed, so the frames
    // before the hit are seen)
    async shoot(x, z, dx, dz) {
      E.reset()
      const hd = Math.atan2(dx, dz), L2 = Math.hypot(dx, dz)
      const v = g.vehicles.spawn('police', x, z, hd)
      E.cars.push(v)
      g.vehicles.enter(v)
      await E.frames(2)
      const turbo = g.turbo
      g.turbo = 1
      E.hold('KeyW')
      v.body.setLinvel({ x: (dx / L2) * 60, y: 0, z: (dz / L2) * 60 }, true)
      let top = 0
      for (let k = 0; k < 40; k++) { await E.frames(1); top = Math.max(top, Math.abs(v.speed)) }
      E.release('KeyW')
      g.turbo = turbo
      await E.show()
      return E.carState(v, dx, dz, top)
    },
    carState(v, dx, dz, top) {
      const L2 = Math.hypot(dx, dz), ux = dx / L2, uz = dz / L2
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading), half = v.def.dims[2], w = v.def.dims[0]
      // the corners of the car's footprint: none of them past the limit
      let front = Infinity
      for (const [a, b] of [[half, w], [half, -w], [-half, w], [-half, -w]]) front = Math.min(front, L.edgeDistance(v.pos.x + fx * a - fz * b, v.pos.z + fz * a + fx * b))
      return { top: +top.toFixed(1), speed: +v.speed.toFixed(2), x: +v.pos.x.toFixed(1), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(1), d: +L.edgeDistance(v.pos.x, v.pos.z).toFixed(2), corner: +front.toFixed(2), along: +(v.pos.x * ux + v.pos.z * uz).toFixed(1) }
    },
  }
  const upd = g.world.update.bind(g.world)
  g.world.update = (dt) => { upd(dt); E.tick() }
  const note = g.ui.notify.bind(g.ui)
  g.ui.notify = (t, s, c) => { E.lines.push(t); return note(t, s, c) }
  g.draw = false
})

const B = await ev(() => { const b = window.E.L.BOUNDS; return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 } })

// ---- walking into the edge ----------------------------------------------------------------------
// a spot on each side where the run straight at the edge is clear of lamps, trees and blocks
const findLane = async (cands, dx, dz, half = 0) => {
  for (const [x, z] of cands) {
    const l = await ev(({ x, z, dx, dz, half }) => window.E.lane(x, z, dx, dz, half), { x, z, dx, dz, half })
    if (Math.abs(l.edge) < 0.35) return [x, z]
  }
  return cands[0]
}
const walks = [
  { id: 'nord · parapetul Bîcului', dx: 0, dz: -1, cands: [-200, -150, -104, 150, 250, -330].map((x) => [x, B.z0 + 12]), stretch: 'bic' },
  { id: 'vest · zidul de sub pădure', dx: -1, dz: 0, cands: [-196, -148, 100, 172].map((z) => [B.x0 + 12, z]), stretch: 'padure' },
  { id: 'est · zidul Centurii', dx: 1, dz: 0, cands: [200, 150, -150, -220].map((z) => [B.x1 - 12, z]), stretch: 'centura' },
  { id: 'sud · gardul combinatului', dx: 0, dz: 1, cands: [100, 60, -60, -300, 150].map((x) => [x, B.z1 - 11]), stretch: 'gard' },
  { id: 'postul de poliție, vest', dx: -1, dz: 0, cands: [[B.x0 + 12, -4]], stretch: 'vest' },
  { id: 'postul de poliție, est', dx: 1, dz: 0, cands: [[B.x1 - 12, 4]], stretch: 'est' },
  { id: 'podul în reparație', dx: 0, dz: -1, cands: [[60, B.z0 + 12]], stretch: 'pod' },
  { id: 'poarta combinatului', dx: 0, dz: 1, cands: [[-180, B.z1 - 10]], stretch: 'combinat' },
  { id: 'poarta tunelului CFM', dx: -1, dz: 0, cands: [[B.x0 + 12, 318]], stretch: 'tunel' },
  { id: 'poarta CFM de sub Centură', dx: 1, dz: 0, cands: [[B.x1 - 12, 318]], stretch: 'cfm' },
  { id: 'colțul de nord-vest', dx: -1, dz: -1, cands: [[B.x0 + 10, B.z0 + 10]], stretch: null },
  { id: 'colțul de sud-est', dx: 1, dz: 1, cands: [[B.x1 - 10, B.z1 - 10]], stretch: null },
]
for (const w of walks) {
  current = 'walk ' + w.id
  const [x, z] = await findLane(w.cands, w.dx, w.dz)
  const n0 = await ev(() => window.E.lines.length)
  const r = await ev(({ x, z, dx, dz }) => window.E.walk(x, z, dx, dz), { x, z, dx: w.dx, dz: w.dz })
  const said = await ev((n0) => ({ lines: window.E.lines.slice(n0), last: window.__game.world.edge.lastLine }), n0)
  // touching what you see: at some height the first visible surface is right against the body
  // (capsule radius 0.3), and wherever a collider is hit it's where the visible surface is
  const touch = Math.min(...r.probe.filter((p) => p.vis !== null).map((p) => p.vis - 0.3))
  // (up to knee height every barrier is solid; above the blocks at the closures the fence panels
  // are wire mesh you see through)
  const agree = r.probe.filter((p) => p.y < 0.8 && p.col !== null && p.col < 1.5).every((p) => p.vis !== null && Math.abs(p.col - p.vis) < 0.06)
  check(`walk · ${w.id}: stops at the barrier`, r.moved > 3 && r.d > 0 && r.d < 1.2 && touch < 0.12 && agree && r.grounded && r.y > -0.1 && r.y < 0.5,
    `moved ${r.moved} m, ${r.d} m inside, gap to what you see ${touch.toFixed(3)} m, probe ${JSON.stringify(r.probe.map((p) => [p.y, p.col, p.vis]))}`)
  if (w.stretch) check(`walk · ${w.id}: says its line`, said.lines.length === 1 && said.last?.stretch === w.stretch, JSON.stringify(said))
}

// ---- one line per visit ------------------------------------------------------------------------------
current = 'visit'
{
  const r = await ev(async ({ z0 }) => {
    const E = window.E, g = window.__game
    const out = {}
    const n0 = E.lines.length
    await E.walk(-104, z0 + 10, 0, -1)
    out.first = E.lines.length - n0
    // along the parapet, and back into it: still the same visit
    await E.walk(-90, z0 + 3, 0, -1, false)
    await E.walk(-120, z0 + 2, 0, -1, false)
    out.same = E.lines.length - n0
    // walk off 40 m, come back: a new visit, the next line
    g.player.teleport(-104, 0, z0 + 45); await E.frames(4)
    await E.walk(-104, z0 + 10, 0, -1, false)
    out.again = E.lines.length - n0
    out.texts = E.lines.slice(n0)
    return out
  }, { z0: B.z0 })
  check('one line per visit to the edge', r.first === 1 && r.same === 1 && r.again === 2 && r.texts[0] !== r.texts[1], JSON.stringify(r))
}

// ---- driving into the edge at speed -----------------------------------------------------------------------
const drives = [
  { id: 'nord · parapetul', dx: 0, dz: -1, cands: [-200, -150, -104, 150, 250, 330, -330, -250].map((x) => [x, -266]) },
  { id: 'vest · zidul', dx: -1, dz: 0, cands: [-196, -148, -100, 100, 172, 220].map((z) => [-414, z]) },
  { id: 'est · zidul Centurii', dx: 1, dz: 0, cands: [200, 150, -150, -220, 100].map((z) => [414, z]) },
  { id: 'sud · gardul', dx: 0, dz: 1, cands: [100, 60, -60, -300, 150, 0, -250].map((x) => [x, 280]) },
  { id: 'postul de poliție, vest', dx: -1, dz: 0, cands: [[-414, -5.75]], lip: true },
  { id: 'postul de poliție, est', dx: 1, dz: 0, cands: [[414, 5.75]], lip: true },
  { id: 'podul în reparație', dx: 0, dz: -1, cands: [[61.75, -266]], lip: true },
  { id: 'poarta combinatului', dx: 0, dz: 1, cands: [[-178.25, 280]] },
]
for (const d of drives) {
  current = 'drive ' + d.id
  const [x, z] = await findLane(d.cands, d.dx, d.dz, 1.3)
  const r = await ev(({ x, z, dx, dz }) => window.E.drive(x, z, dx, dz), { x, z, dx: d.dx, dz: d.dz })
  // (at a closure the bumper, 34 cm up, stops against the blocks' face, which leans back 17 cm)
  const lip = d.lip ? -0.25 : -0.05
  check(`drive · ${d.id}: stops at the barrier`, r.top > 22 && Math.abs(r.speed) < 1 && r.d > 0.9 && r.corner > lip && r.corner < 1.2 && r.y > -0.3 && r.y < 1.2, JSON.stringify(r))
}

// ---- no tunnelling: already doing 60 m/s a car's length from the barrier ------------------------------------
const shots = [
  { id: 'nord', dx: 0, dz: -1, cands: [-104, -150, -200, 150, 250].map((x) => [x, B.z0 + 20]) },
  { id: 'vest', dx: -1, dz: 0, cands: [-148, -196, 100, 172].map((z) => [B.x0 + 20, z]) },
  { id: 'est', dx: 1, dz: 0, cands: [200, 150, -150].map((z) => [B.x1 - 20, z]) },
  { id: 'sud', dx: 0, dz: 1, cands: [60, 100, -60, -300, 150].map((x) => [x, 318]) },
  { id: 'post vest', dx: -1, dz: 0, cands: [[B.x0 + 20, -5.75]], lip: true },
  { id: 'colț NV', dx: -1, dz: -1, cands: [[B.x0 + 14, B.z0 + 14], [B.x0 + 16, B.z0 + 13]] },
]
for (const sh of shots) {
  current = 'shoot ' + sh.id
  const [x, z] = await findLane(sh.cands, sh.dx, sh.dz, 1.3)
  const r = await ev(({ x, z, dx, dz }) => window.E.shoot(x, z, dx, dz), { x, z, dx: sh.dx, dz: sh.dz })
  check(`60 m/s into the barrier · ${sh.id}: nothing gets through`, r.top > 40 && r.d > 0.9 && r.corner > (sh.lip ? -0.25 : -0.05), JSON.stringify(r))
}

// ---- nobody outside, nobody falling -----------------------------------------------------------------------------------
current = 'watch'
{
  const r = await ev(() => { const w = window.E.watch; return { frames: w.frames, minY: +w.minY.toFixed(2), minD: +w.minD.toFixed(2) } })
  check('the player never left the city or fell', r.frames > 200 && r.minD > 0 && r.minY > -0.5, JSON.stringify(r))
}

// ---- and if anything ever did get out, the city pulls you back ----------------------------------------------------------
current = 'guard'
{
  const r = await ev(async () => {
    const E = window.E, g = window.__game, p = g.player
    E.reset()
    E.watch.on = false
    p.teleport(0, 0, 0, 0); await E.frames(4)
    p.teleport(E.L.BOUNDS.x0 - 30, 0, 2, 0); await E.frames(6)
    const foot = +E.L.edgeDistance(p.pos.x, p.pos.z).toFixed(1)
    const v = g.vehicles.spawn('logan', 30, 5.75, Math.PI / 2); E.cars.push(v); g.vehicles.enter(v); await E.frames(4)
    v.teleport(E.L.BOUNDS.x1 + 40, 0.3, 0, Math.PI / 2); await E.frames(6)
    const car = +E.L.edgeDistance(v.pos.x, v.pos.z).toFixed(1)
    E.reset()
    E.watch.on = true
    return { foot, car, said: E.lines.filter((t) => /Orașul te-a tras înapoi/.test(t)).length }
  })
  check('pushed out past the edge: straight back inside', r.foot > 2 && r.car > 2 && r.said >= 2, JSON.stringify(r))
}

check('no console errors', errors.length === 0, errors.length ? [...new Set(errors)].join(' | ').slice(0, 600) : '')
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
