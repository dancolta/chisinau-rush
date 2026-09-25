// Dev tool: captures a fixed set of camera views (day, dusk, night, gameplay camera) for visual review.
// usage: node tools/views.mjs --out dir [--w 1600 --h 900] [--only courtyard,night] [--settle 3500]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const out = opt('out', 'views')
const W = +opt('w', '1600'), H = +opt('h', '900')
const settle = +opt('settle', '3500')
const only = opt('only', '')
const port = +opt('port', '5194')
fs.mkdirSync(out, { recursive: true })

// camera: `from`/`look` for a fixed shot, or `follow` to use the gameplay camera behind the player
export const VIEWS = [
  { id: 'courtyard', hour: 16.5, from: [-34, 5.5, 196], look: [-8, 4, 160] },
  { id: 'boulevard', hour: 12, from: [42, 6.5, 7], look: [-25, 3, -6] },
  { id: 'pman', hour: 17.6, from: [24, 9, -14], look: [0, 4, -70] },
  { id: 'arc', hour: 18.4, from: [14, 4.2, 6], look: [0, 6, 32] },
  { id: 'street', hour: 10, from: [-48, 5, 118], look: [-60, 2.5, 165] },
  { id: 'night', hour: 22.3, from: [32, 5.5, 6], look: [-22, 2, -2] },
  { id: 'play_day', hour: 14.5, follow: { x: -52, z: 186, ry: Math.PI } },
  { id: 'play_center', hour: 11, follow: { x: 12, z: -14, ry: -Math.PI / 2 } },
  { id: 'play_night', hour: 21.8, follow: { x: -52, z: 186, ry: Math.PI } },
  { id: 'play_car', hour: 17, follow: { x: -58.25, z: 120, ry: Math.PI, car: 'logan' } },
  { id: 'trees', hour: 15, from: [-36, 3.2, 170], look: [-24, 3.5, 186] },
  // the opening of a new game (train at the station)
  { id: 'open_a0', hour: 17.9, train: 372, from: [262, 42, 376], look: [352, 8, 292] },
  { id: 'open_a1', hour: 17.9, train: 322, from: [276, 34, 362], look: [340, 6, 300] },
  { id: 'open_se', hour: 17.9, train: 380, from: [446, 44, 382], look: [330, 10, 282] },
  { id: 'open_se1', hour: 17.9, train: 330, from: [402, 22, 352], look: [322, 4, 304] },
  { id: 'open_s', hour: 17.9, train: 360, from: [352, 52, 420], look: [322, 6, 270] },
  { id: 'open_b1', hour: 17.9, train: 298.3, from: [304, 3.2, 300.5], look: [322, 1.8, 311.2] },
  { id: 'open_c', hour: 17.9, train: 298.3, from: [312.5, 2.0, 297.5], look: [319, 1.3, 304] },
  { id: 'open_play', hour: 17.9, train: 298.3, follow: { x: 318.5, z: 302.5, ry: Math.PI } },
]

const server = await createServer({ server: { port, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
await page.goto(`http://127.0.0.1:${server.config.server.port}/`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await page.evaluate(async () => {
  const g = window.__game
  await g.debug.startAt('taxi')
  g.debug.noStory = true
  await new Promise((r) => setTimeout(r, 400))
  if (g.story.active) g.story.active.fail('reset')
  await new Promise((r) => setTimeout(r, 600))
  g.renderer.tod.paused = true
  g.streetEvents && (g.streetEvents.disabled = true)
})

for (const v of VIEWS) {
  if (only && !only.split(',').includes(v.id)) continue
  await page.evaluate(async (v) => {
    const g = window.__game
    const p = g.player
    g.renderer.tod.set(v.hour)
    if (g.weather) { g.weather.set(false); g.weather.k = 0; g.weather.target = 0 }
    g.ui.showHud(!!v.follow)
    g.ui.ticker(false)
    g.ui.setObjective?.(null)
    if (p.vehicle) g.vehicles.exit(true)
    if (v.follow) {
      g.cutscene = false
      g.cameraRig.endShot(false)
      p.teleport(v.follow.x, g.physics.groundHeight(v.follow.x, v.follow.z, 3), v.follow.z, v.follow.ry)
      if (v.follow.car) {
        const car = g.vehicles.spawn(v.follow.car, v.follow.x, v.follow.z, v.follow.ry, {})
        g.vehicles.enter(car)
      }
      g.cameraRig.yaw = v.follow.ry
      g.cameraRig.target.copy(p.vehicle ? p.vehicle.pos : p.pos); g.cameraRig.snap()
    } else {
      g.cutscene = true
      p.teleport(v.look[0], g.physics.groundHeight(v.look[0], v.look[2], 3), v.look[2])
      g.cameraRig.shot({ from: v.from, look: v.look, dur: 9999 })
    }
    if (v.train !== undefined) {
      if (!window.__train) { const { Train } = await import('/src/story/Kit.js'); window.__train = new Train(g, { cars: 3 }) }
      const t = window.__train
      t.x = v.train; t.mode = 'stopped'; t.group.position.x = v.train; t.group.visible = true
    } else if (window.__train) window.__train.group.visible = false
    g.renderer.updateEnvironment?.(true)
  }, v)
  await page.waitForTimeout(settle)
  await page.screenshot({ path: `${out}/${v.id}.png`, timeout: 180000 })
  console.log('view', v.id)
}
await browser.close()
await server.close()
