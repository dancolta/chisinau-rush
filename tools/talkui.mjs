// Story lines on screen, checked every frame of a staged cutscene: the words are in the subtitle only
// (never again in a bubble over the speaker, who gets the "talking" dots), a long line goes up in
// sentence-sized pieces, and no speech bubble covers another one or the subtitle, even with three
// passers-by shouting at once.
// usage: node tools/talkui.mjs [--shots dir]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
if (shots) await mkdir(shots, { recursive: true })
const server = await createServer({ server: { port: 5265, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = (fn, a) => page.evaluate(fn, a)
const js = (x) => JSON.stringify(x)?.slice(0, 500)

// turbo: the scene's lines wait in game time, and software GL on a busy machine draws few frames a
// second; 4x game time per frame plays the whole scene well inside the time limit
await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.story.events.t = 1e9
  g.renderer.tod.set(13)
})

const LONG = 'Bine ai venit acasă, după șapte ani peste hotare. Blocul 7 nu s-a schimbat deloc: tot liftul stricat, tot Tanti Zina la geam. Du-te la Str. Bănulescu-Bodoni, acolo te așteaptă Vova cu mașina. Și nu uita: aici toți știu tot despre toți!'
const SHORT = 'Hai, urcă. Nu stăm toată ziua.'
const BARK = 'Ce faci, mă, de unde ești tu, că nu te-am mai văzut pe aici niciodată?'

const run = ev(async ([LONG, SHORT, BARK]) => {
  const g = window.__game
  for (let i = 0; i < 100 && g.story.active; i++) await new Promise((r) => setTimeout(r, 100))
  const frames = []
  let on = true
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom } }
  const meets = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
  const sample = () => {
    if (!on) return
    const sub = document.querySelector('.subtitle')
    const subOn = sub && !sub.classList.contains('hidden')
    const bubbles = [...document.querySelectorAll('.bubble')].filter((b) => b.style.display !== 'none' && b.style.visibility !== 'hidden')
    const f = { sub: subOn ? sub.textContent : null, bubbles: bubbles.map((b) => ({ cls: b.className, text: b.textContent })), clash: [] }
    const rs = bubbles.map(box)
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (meets(rs[i], rs[j])) f.clash.push(`bubbles ${i}/${j}`)
    if (subOn) { const s = box(sub); rs.forEach((r, i) => { if (meets(r, s)) f.clash.push(`bubble ${i} on the subtitle`) }) }
    frames.push(f)
    requestAnimationFrame(sample)
  }
  let done
  const finished = new Promise((r) => { done = r })
  g.story.run({
    id: 'test_talk', title: 'Test', activity: true,
    async script(m) {
      const p = m.player, x = p.pos.x, z = p.pos.z
      const h = p.char.heading, fx = Math.sin(h), fz = Math.cos(h)
      // the speakers stand in front of you, the passers-by in a knot to one side
      m.spawn('zina', 'badanta', x + fx * 3.5 - fz * 1.2, z + fz * 3.5 + fx * 1.2, { name: 'Tanti Zina' })
      m.spawn('vova', 'taxist', x + fx * 3.5 + fz * 1.2, z + fz * 3.5 - fx * 1.2, { name: 'Vova' })
      const crowd = [0, 1, 2].map((i) => m.spawn('p' + i, null, x + fx * 6 + fz * (2.5 + i * 0.4), z + fz * 6 - fx * (2.5 + i * 0.4)))
      await m.wait(0.6)
      requestAnimationFrame(sample)
      await m.cutscene(async () => {
        crowd.forEach((n) => n.say(BARK, 6))
        await m.talk('zina', LONG)
        await m.talk('vova', SHORT)
      })
      on = false
      done()
    },
  })
  await Promise.race([finished, new Promise((r) => setTimeout(r, 600000))])
  on = false
  return frames
}, [LONG, SHORT, BARK])

// a screenshot mid-line, when asked for
if (shots) {
  await page.waitForFunction(() => !document.querySelector('.subtitle')?.classList.contains('hidden'), null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${shots}/talk-960x540.png` }).catch(() => {})
}
const frames = await run
const said = frames.filter((f) => f.sub)
check('(setup) the cutscene ran and its lines went up', said.length > 10, `${frames.length} frames, ${said.length} with a subtitle`)

// the words in one place only
const words = [LONG, SHORT].flatMap((t) => t.split(/(?<=[.!?])\s+/))
const twice = frames.filter((f) => f.bubbles.some((b) => words.some((w) => b.text && b.text.includes(w.slice(0, 24)))))
check('a story line is never also in a bubble over the speaker', twice.length === 0, js(twice[0]))
const dots = frames.filter((f) => f.sub && f.bubbles.some((b) => /\bdots\b/.test(b.cls) && !b.text))
check('the speaker gets the "talking" dots while the line is up', dots.length > 5, `${dots.length} frames`)

// long lines in pieces, all of them, in order
const shown = [...new Set(said.map((f) => f.sub))]
const longest = Math.max(...shown.map((t) => t.length))
const pieces = shown.filter((t) => t.startsWith('Tanti Zina:') || t.startsWith('Zina'))
check('a long line goes up in pieces of a subtitle\'s size', longest <= 130 && shown.length >= 3, js({ longest, shown }))
const order = ['Bine ai venit', 'Blocul 7', 'Bănulescu-Bodoni', 'Hai, urcă']
const at = order.map((w) => shown.findIndex((t) => t.includes(w)))
check('every piece is shown, in order, and "Str. Bănulescu-Bodoni" stays whole', at.every((i, k) => i >= 0 && (k === 0 || i >= at[k - 1])) && shown.some((t) => t.includes('Str. Bănulescu-Bodoni')), js({ at, pieces: pieces.length }))

// nothing covers anything
const clash = frames.filter((f) => f.clash.length)
check('no speech bubble covers another one or the subtitle (three passers-by shouting at once)', clash.length === 0, js(clash[0]))
const crowd = frames.filter((f) => f.bubbles.filter((b) => b.text.startsWith('Ce faci')).length >= 2)
check('(setup) the passers-by\'s bubbles were up together', crowd.length > 0, `${crowd.length} frames with 2+`)

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
