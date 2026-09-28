// Dev tool: the driving camera stays straight behind the car whichever way the car faces. The car's
// mesh.rotation.y folds into -90..90° (an Euler read back from its quaternion), which once had the
// camera sit in front of a car driving "south" and turn the wrong way when you steered.
// usage: node tools/drivecam.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5261, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
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
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  window.__frames = async (n) => { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) }
  // open ground on the square: nothing solid (a car's box, a pole's capsule) on rings out to 20 m, so
  // the flagpole, the tribune and the trees stay out of the way whichever way the car turns
  const P = g.world.places.pman, V = g.vehicles
  const free = (x, z, a) => !V.blockedCar(x, z, a) && !V.blocked(x, z)
  const open = (x, z) => [0, 3, 6, 9, 12, 15, 18, 20].every((r) => [...Array(r ? 24 : 1)].every((_, i) => free(x + r * Math.cos(i * Math.PI / 12), z + r * Math.sin(i * Math.PI / 12), i * Math.PI / 12)))
  let spot = null
  for (let d = 0; d <= 60 && !spot; d += 2) for (let a = 0; a < 16 && !spot; a++) { const x = P.x + d * Math.cos(a * Math.PI / 8), z = P.z + d * Math.sin(a * Math.PI / 8); if (open(x, z)) spot = { x, z } }
  window.__spot = spot
})
const spot = await ev(() => window.__spot)
check('(setup) open ground for the test drives', !!spot, JSON.stringify(spot))

const wrapDeg = (a) => ((a % 360) + 540) % 360 - 180
// a car facing `deg` on the open square, you at the wheel, then gas and a steer key: every few frames,
// how far the camera's view points off the car's nose, and which way each has turned
async function drive(deg, steerKey) {
  const r = await ev(async ([deg, steerKey]) => {
    const g = window.__game, P = window.__spot
    const h = deg * Math.PI / 180
    g.police.clear()
    g.progress.hp = g.progress.maxHp
    g.vehicles.clearSpot(P.x, P.z, 20)
    const v = g.vehicles.spawn('taxi', P.x, P.z, h)
    const p = g.player
    p.teleport(P.x + 3, g.physics.groundHeight(P.x + 3, P.z, 6), P.z, h)
    g.vehicles.enter(v)
    await window.__frames(25)
    const cam = g.cameraRig.cam
    const look = () => { const d = cam.getWorldDirection(cam.position.clone().set(0, 0, 0)); return Math.atan2(d.x, d.z) }
    const deg2 = (a) => a * 180 / Math.PI
    const out = []
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }))
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
    // the view as it was before the turn: where on it the car's nose ends up says which way it went
    const cam0 = { matrixWorldInverse: cam.matrixWorldInverse.clone(), projectionMatrix: cam.projectionMatrix.clone() }
    let hPrev = v.visHeading ?? v.heading, lPrev = look(), turned = 0, camTurned = 0, noseX = null
    // (read once it has turned 10-20°: far round, the point would be behind that old view)
    const noseOnOldView = (h) => +v.pos.clone().add({ x: Math.sin(h) * 30, y: 0, z: Math.cos(h) * 30 }).project(cam0).x.toFixed(2)
    key('KeyW', 'keydown'); key(steerKey, 'keydown')
    await window.__frames(8)
    const early = { steer: g.input.steer(), carSteer: v.steer, steerVis: +(v.steerVis || 0).toFixed(3), angvelY: +v.body.angvel().y.toFixed(3) }
    for (let i = 0; i < 12; i++) {
      await window.__frames(i ? 4 : 0)
      const hv = v.visHeading ?? v.heading, l = look()
      turned += wrap(hv - hPrev); camTurned += wrap(l - lPrev); hPrev = hv; lPrev = l
      if (noseX === null && Math.abs(turned) > 0.17) noseX = noseOnOldView(hv)
      out.push({ off: deg2(l - hv), turned: deg2(turned), camTurned: deg2(camTurned), speed: +(v.speed || 0).toFixed(1), inCar: p.vehicle === v })
    }
    out.early = early
    out.noseX = noseX
    key(steerKey, 'keyup'); key('KeyW', 'keyup')
    g.vehicles.exit(true)
    g.vehicles.remove?.(v)
    await window.__frames(5)
    return { samples: out, early: out.early, noseX: out.noseX }
  }, [deg, steerKey])
  const offs = r.samples.map((s) => Math.abs(wrapDeg(s.off)))
  const last = r.samples[r.samples.length - 1]
  return { maxOff: Math.max(...offs), turned: last.turned, camTurned: last.camTurned, speed: last.speed, inCar: r.samples.every((s) => s.inCar), early: r.early, noseX: r.noseX }
}

for (const deg of [0, 60, 120, 180, -120, -60]) {
  for (const k of ['KeyD', 'KeyA']) {
    const r = await drive(deg, k), right = k === 'KeyD'
    const info = JSON.stringify({ maxOff: +r.maxOff.toFixed(1), carTurned: +r.turned.toFixed(1), camTurned: +r.camTurned.toFixed(1), speed: r.speed, inCar: r.inCar, noseX: r.noseX, early: r.early })
    check(`facing ${deg}°, steering ${right ? 'right' : 'left'}: the camera stays behind the nose and turns with the car`,
      r.inCar && r.maxOff < 6 && Math.abs(r.turned) > 10 && Math.sign(r.camTurned) === Math.sign(r.turned) && Math.abs(r.camTurned - r.turned) < 6, info)
    // on the screen you drove from: D takes the nose off to the right, A to the left
    check(`facing ${deg}°: ${right ? 'D' : 'A'} turns the car to the ${right ? 'right' : 'left'} of the screen`, right ? r.noseX > 0.05 : r.noseX < -0.05, info)
  }
}

check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
