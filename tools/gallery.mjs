// Dev tool: captures frames of every cutscene in the given missions (autopilot drives the rest).
// usage: node tools/gallery.mjs --out dir [--missions sosire,paine] [--turbo 3] [--max 10]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const out = opt('out', 'gallery')
const list = opt('missions', 'sosire,paine,jiguli,taxi,eban,cursa,borea,profetul,sergentul,beciul,rapirea,mitingul,cortegiul,alegeri').split(',')
const turbo = +opt('turbo', '3')
const max = +opt('max', '10')
const perMission = +opt('secs', '240')
fs.mkdirSync(out, { recursive: true })

const server = await createServer({ server: { port: 5195, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${server.config.server.port}/?turbo=${turbo}`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })

for (const id of list) {
  await page.evaluate(async (id) => {
    const g = window.__game
    if (g.story.active) g.story.active.fail('reset')
    await new Promise((r) => setTimeout(r, 300))
    await g.debug.startAt(id)
    g.debug.autoplay(true)
    g.debug.noStory = true
    const m = g.story.byId(id)
    g.story.run(m)
  }, id)
  const t0 = Date.now()
  let n = 0, last = 0
  for (;;) {
    await page.waitForTimeout(300)
    const st = await page.evaluate((id) => { const g = window.__game; return { cut: g.cutscene, act: g.story.active?.def.id || null, done: g.progress.story.done.includes(id) } }, id)
    if (st.cut && Date.now() - last > 1100 && n < max) {
      last = Date.now()
      await page.screenshot({ path: `${out}/${id}_${String(n++).padStart(2, '0')}.png` })
    }
    if (st.done || (!st.act && Date.now() - t0 > 5000) || Date.now() - t0 > perMission * 1000) break
  }
  console.log(id, 'frames', n)
}
await browser.close()
await server.close()
