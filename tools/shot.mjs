// Dev tool: boots the game in headless Chromium (SwiftShader WebGL) and saves screenshots.
// usage: node tools/shot.mjs --out a.png [--wait 4000] [--w 1280 --h 720] [--eval "js"] [--steps file.json]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const out = opt('out', 'shot.png')
const wait = +opt('wait', '4000')
const W = +opt('w', '1280'), H = +opt('h', '720')
const evalJs = opt('eval', '')
const stepsFile = opt('steps', '')
const port = +opt('port', '5199')
const url = opt('url', '')

const server = url ? null : await createServer({ server: { port, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
if (server) await server.listen()
const base = url || `http://127.0.0.1:${server.config.server.port}/`

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
})
const touch = args.includes('--touch')
const page = await browser.newPage({ viewport: { width: W, height: H }, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) })
const logs = []
page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning' || t === 'log') logs.push(`[${t}] ${m.text()}`) })
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + (e.stack || '')))

const t0 = Date.now()
await page.goto(base + (opt('query', '') || ''), { waitUntil: 'domcontentloaded' })
try {
  await page.waitForFunction(() => window.__game && window.__game.state && window.__game.state !== 'loading', null, { timeout: 180000 })
} catch (e) { logs.push('[timeout] game never left loading state') }
console.log('boot ms', Date.now() - t0)
if (evalJs) {
  try { const r = await page.evaluate(evalJs); if (r !== undefined) console.log('eval ->', JSON.stringify(r).slice(0, 2000)) } catch (e) { logs.push('[eval error] ' + e.message) }
}
if (stepsFile) {
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'))
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait)
    if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('step ->', JSON.stringify(r).slice(0, 2000)) } catch (e) { logs.push('[step error] ' + e.message) } }
    if (s.key) await page.keyboard.press(s.key)
    if (s.down) await page.keyboard.down(s.down)
    if (s.up) await page.keyboard.up(s.up)
    if (s.click) await page.mouse.click(s.click[0], s.click[1])
    if (s.shot) { await page.screenshot({ path: s.shot, timeout: 180000 }); console.log('saved', s.shot) }
  }
}
await page.waitForTimeout(wait)
await page.screenshot({ path: out, timeout: 180000 })
const fps = await page.evaluate(() => window.__game ? { frame: window.__game.frame, calls: window.__game.renderer.renderer.info.render.calls, tris: window.__game.renderer.renderer.info.render.triangles, scale: window.__game.renderer.dynScale } : null).catch(() => null)
console.log('stats', JSON.stringify(fps))
console.log('saved', out)
if (logs.length) console.log(logs.slice(0, 60).join('\n'))
await browser.close()
if (server) await server.close()
