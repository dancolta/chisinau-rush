// Dev tool: automated story playthrough in headless Chromium.
// usage: node tools/play.mjs [--from jiguli] [--until eban] [--turbo 6] [--secs 500] [--shots dir] [--every 30]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const from = opt('from', '')
const until = opt('until', '')
const turbo = +opt('turbo', '6')
const secs = +opt('secs', '500')
const shots = opt('shots', '')
const every = +opt('every', '30')
const W = +opt('w', '640'), H = +opt('h', '360')

// fs.strict off: lets the tool run from a snapshot copy whose node_modules is a symlink
const server = await createServer({ server: { port: 5198, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text().slice(0, 600); errors.push(t); console.log('  !! console.error: ' + t) } })
page.on('pageerror', (e) => { const t = 'PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | '); errors.push(t); console.log('  !! ' + t) })
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('!! navigation/reload') })

await page.goto(base + `?turbo=${turbo}`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
if (from) await page.evaluate(async (id) => { await window.__game.debug.startAt(id) }, from)
else await page.evaluate(() => { window.__game.director.newGame({ name: 'Dan', type: 'patan' }) })
await page.evaluate(() => window.__game.debug.autoplay(true))
if (shots) fs.mkdirSync(shots, { recursive: true })
const t0 = Date.now()
let lastShot = 0, lastLog = 0, n = 0
for (;;) {
  await page.waitForTimeout(2000)
  const st = await page.evaluate(() => {
    const g = window.__game, a = g.story.active
    return { m: a ? a.def.id : null, t: a ? +a.t.toFixed(0) : 0, obj: (g.ui.objective || '').replace(/\{\/?[a-z]\}/g, '').slice(0, 80), done: g.progress.story.done.slice(), frames: g.frame, log: g.debug.log.splice(0) }
  }).catch((e) => ({ err: e.message }))
  if (st.err) { console.log('eval error', st.err); break }
  for (const l of st.log) console.log('  ' + l)
  const el = (Date.now() - t0) / 1000
  if (el - lastLog > 10) { lastLog = el; console.log(`${el.toFixed(0)}s  mission=${st.m} t=${st.t} done=${st.done.length} obj="${st.obj}"`) }
  if (shots && el - lastShot > every) { lastShot = el; await page.screenshot({ path: `${shots}/p${String(n++).padStart(3, '0')}_${st.m}.png` }).catch((e) => console.log('shot failed', e.message)) }
  if (until && st.done.includes(until)) { console.log('reached', until); break }
  if (!st.m && st.done.length >= 14) { console.log('story complete'); break }
  if (el > secs) { console.log('time up'); break }
}
if (shots) await page.screenshot({ path: `${shots}/final.png` }).catch(() => {})
console.log('errors:', errors.length ? '\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'none')
await browser.close()
await server.close()
