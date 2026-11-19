// Dev tool: what the scenery costs per quality preset. Draw calls and triangles (every pass of one
// frame, shadows and post included) at fixed viewpoints: the title flyover, on foot at Blocul 7, in a
// taxi on the boulevard, the east edge facing the Centura and the north edge over the Bîc. With
// --base it measures a checkout of the old code first and prints before/after, then checks that low
// draws at least 30% less where the far scenery is most of the frame, and still draws everything
// high draws near the camera.
// usage: node tools/lod.mjs [--base DIR] [--shots DIR] [--breakdown]
//   --base DIR   the code to compare against (e.g. a `git archive` of main, with node_modules linked)
//   --shots DIR  low before/after screenshots of every viewpoint
//   --breakdown  where the calls and triangles go, by batch kind
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const BASE = arg('--base'), SHOTS = arg('--shots'), BREAK = process.argv.includes('--breakdown')
const PRESETS = ['low', 'medium', 'high']
const VIEWS = ['flyover', 'acasa', 'boulevard', 'east', 'north']
// where the far scenery is most of the frame (what lies wholly past 150 m was over half of what
// low drew): low has to come down by a third there
const farHeavy = (v) => before[v].low.farShare >= 0.5
// how far round the camera low must still draw all that high draws (ahead of the car: further)
const NEAR = { acasa: 150, boulevard: 250, east: 150, north: 150 }
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }

async function measure(root, tag, cacheDir) {
  const server = await createServer({ root, ...(cacheDir ? { cacheDir } : {}), server: { port: 5273, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
  await server.listen()
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  await page.goto(`http://127.0.0.1:${server.config.server.port}/`)
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
  await page.evaluate(() => {
    const g = window.__game
    window.__frames = async (n) => { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) }
    window.__view = async (name) => {
      if (name === 'flyover') {
        // the highest of the title shots, held half way through
        g.cameraRig.shot({ from: [-360, 65, -100], look: [-285, 20, -120], dur: 1e6 })
        g.renderer.tod.set(17.9)
        return window.__frames(10)
      }
      if (g.state !== 'play') { await g.debug.startAt('profetul'); g.story.events.t = 1e9 }
      g.renderer.tod.set(13)
      if (g.cameraRig.cut) g.cameraRig.endShot()
      g.police.clear()
      const tp = (x, z, h) => { g.player.teleport(x, g.physics.groundHeight(x, z, 6), z, h); g.cameraRig.yaw = h; g.cameraRig.pitch = 0.2; g.cameraRig.snap() }
      if (name === 'acasa') { const p = g.world.places.acasa; tp(p.x, p.z, Math.PI) }
      else if (name === 'boulevard') {
        // the east-bound lanes, the car facing down the boulevard towards the Centura
        g.vehicles.clearSpot(-220, 5, 12)
        const v = g.vehicles.spawn('taxi', -220, 5, Math.PI / 2)
        tp(-220, 9, Math.PI / 2)
        g.vehicles.enter(v)
      } else {
        if (g.player.vehicle) g.vehicles.exit(true)
        if (name === 'east') tp(466, 120, Math.PI / 2)
        else tp(-60, -322, Math.PI)
      }
      return window.__frames(40)
    }
    window.__measure = async (preset, near) => {
      const R = g.renderer, r = R.renderer, scene = R.scene, cam = R.camera
      R.applyQuality(preset)
      await window.__frames(8)
      const per = new Map(), drawn = new Set()
      const cat = (o) => {
        let n = o.name
        if (!n) {
          let p = o.parent; while (p && p !== scene && !p.name) p = p.parent
          n = (p?.name ? p.name + '>' : '') + (o.isInstancedMesh ? 'Instanced' : o.type) + (o.matrixAutoUpdate ? '' : ' (static)') + ' ' + (o.material?.type || '').replace('Material', '')
        }
        // batches are kind|chunk (facade:chunk); 1e5 m chunks hold what stands past the edge
        const far = /100000:/.test(n)
        n = n.replace(/\|.*$/, '').replace(/^facade:.*$/, 'facade')
        return far && !n.endsWith('_far') ? n + '_far' : n
      }
      const add = (k, pass, c, t) => { const e = per.get(k) || per.set(k, { k, calls: 0, tris: 0, sCalls: 0, sTris: 0 }).get(k); if (pass) { e.sCalls += c; e.sTris += t } else { e.calls += c; e.tris += t } }
      // main-pass triangles of what lies wholly past 150 m (the far field's share of the frame)
      const s = new cam.position.constructor()
      const dist = (o) => { const b = o.geometry?.boundingSphere; return b ? s.copy(b.center).applyMatrix4(o.matrixWorld).distanceTo(cam.position) - b.radius * o.matrixWorld.getMaxScaleOnAxis() : 0 }
      let farTris = 0, mainTris = 0
      const hooked = []
      scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return
        const own = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'].map((f) => Object.hasOwn(o, f) ? o[f] : null)
        const k = cat(o), base = [o.onBeforeRender, o.onAfterRender, o.onBeforeShadow, o.onAfterShadow]
        let c0 = 0, t0 = 0
        const before = (i) => function (...a) { c0 = r.info.render.calls; t0 = r.info.render.triangles; return base[i].apply(this, a) }
        const after = (i, sh) => function (...a) {
          add(k, sh, r.info.render.calls - c0, r.info.render.triangles - t0)
          if (!sh) { drawn.add(o); mainTris += r.info.render.triangles - t0; if (dist(o) > 150) farTris += r.info.render.triangles - t0 }
          return base[i].apply(this, a)
        }
        o.onBeforeRender = before(0); o.onAfterRender = after(1, false); o.onBeforeShadow = before(2); o.onAfterShadow = after(3, true)
        hooked.push([o, own])
      })
      R.render(0)
      const calls = r.info.render.calls, tris = r.info.render.triangles
      for (const [o, own] of hooked) ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'].forEach((f, i) => { if (own[i]) o[f] = own[i]; else delete o[f] })
      // static meshes drawn whose bounds come within `near` m of the camera (a batch of trees
      // drawn as its low-poly twin counts as the batch)
      const close = []
      if (near) {
        const full = new Map()
        scene.traverse((o) => { if (o.name.startsWith('vcol:tree|')) full.set(o.name, o) })
        for (const o of drawn) {
          if (o.matrixAutoUpdate || !o.geometry?.boundingSphere || dist(o) >= near) continue
          const m = full.get(o.name.replace('vcol:tree_lod|', 'vcol:tree|')) || o
          close.push(m.uuid + ' ' + (m.name || m.type))
        }
      }
      return { calls, tris, farShare: farTris / (mainTris || 1), per: [...per.values()].sort((a, b) => b.calls + b.sCalls - a.calls - a.sCalls).slice(0, 12), close, far: cam.far, fog: [scene.fog.near, scene.fog.far] }
    }
  })
  const out = {}
  for (const view of VIEWS) {
    await page.evaluate((v) => window.__view(v), view)
    out[view] = {}
    for (const p of PRESETS) {
      out[view][p] = await page.evaluate(([p, n]) => window.__measure(p, n), [p, NEAR[view] || 0])
      if (SHOTS && p === 'low') await page.screenshot({ path: `${SHOTS}/${view}-${tag}.png` })
    }
  }
  out.errors = errors
  await browser.close()
  await server.close()
  return out
}

const pct = (a, b) => (b ? `${b > a ? '+' : ''}${Math.round((b - a) / a * 100)}%` : '')
let before = null
if (BASE) {
  // the old code's numbers keep (they can't change): only measured again when shots are missing
  const cache = resolve(BASE, '.lod-base.json')
  if (existsSync(cache) && (!SHOTS || VIEWS.every((v) => existsSync(`${SHOTS}/${v}-before.png`)))) before = JSON.parse(readFileSync(cache, 'utf8'))
  else {
    before = await measure(resolve(BASE), 'before', process.env.VITE_CACHE_DIR ? process.env.VITE_CACHE_DIR + '-base' : undefined)
    writeFileSync(cache, JSON.stringify(before))
  }
}
const after = await measure(process.cwd(), 'after')

console.log(`\n${'view'.padEnd(10)}${'preset'.padEnd(8)}${'calls'.padStart(18)}${'triangles'.padStart(26)}   far share of the scene / camera.far / fog`)
for (const v of VIEWS) for (const p of PRESETS) {
  const a = after[v][p], b = before?.[v][p]
  const col = (k, w) => (b ? `${b[k]} → ${a[k]} ${pct(b[k], a[k])}` : `${a[k]}`).padStart(w)
  const share = (r) => `${Math.round(r.farShare * 100)}%`
  console.log(`${v.padEnd(10)}${p.padEnd(8)}${col('calls', 18)}${col('tris', 26)}   ${b ? share(b) + ' → ' : ''}${share(a)} / ${a.far} / ${a.fog.map(Math.round).join('-')}`)
}
if (BREAK) for (const v of VIEWS) for (const p of PRESETS) {
  console.log(`\n${v} ${p}: kind  calls/tris  (shadow calls/tris)`)
  for (const e of after[v][p].per) console.log(`  ${e.k.padEnd(28)}${String(e.calls).padStart(5)} ${String(e.tris).padStart(8)}   (${e.sCalls} / ${e.sTris})`)
}
console.log('')

if (before) for (const v of VIEWS.filter(farHeavy)) {
  const a = after[v].low, b = before[v].low
  check(`${v}: low draws at least 30% fewer calls and triangles`, a.calls <= b.calls * 0.7 && a.tris <= b.tris * 0.7, `calls ${b.calls} → ${a.calls}, triangles ${b.tris} → ${a.tris}`)
}
for (const v of Object.keys(NEAR)) for (const p of ['low', 'medium']) {
  const keep = new Set(after[v][p].close)
  const miss = after[v].high.close.filter((u) => !keep.has(u))
  check(`${v}: ${p} still draws all that high draws within ${NEAR[v]} m`, miss.length === 0, miss.slice(0, 4).map((u) => u.split(' ')[1]).join(', ') || `${keep.size} meshes`)
}
check('no errors', after.errors.length === 0, after.errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
process.exit(failed ? 1 : 0)
