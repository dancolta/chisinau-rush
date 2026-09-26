// End-to-end check of accounts and cloud saves in headless Chromium: the game, the API
// (tools/api-dev.mjs on an in-memory PGlite) behind Vite's /api proxy, and separate browser
// contexts playing separate devices, one open at a time. The 3D city isn't what's tested here,
// so it isn't drawn (software GL is slow); the game loop, menus and saves run as usual.
// usage: node tools/account.mjs [--shots dir]   (--shots: screenshots of the account screens)
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { startApi, pgliteDb } from './api-dev.mjs'

const args = process.argv.slice(2)
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
if (shots) await mkdir(shots, { recursive: true })
const SMALL = { width: 480, height: 270 }

const t0 = Date.now()
const db = await pgliteDb()
const api = await startApi({ port: 0, adapter: db, quiet: true })
const server = await createServer({ server: { port: 5197, strictPort: false, host: '127.0.0.1', fs: { strict: false }, proxy: { '/api': { target: api.url } } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
console.log(`api ${api.url} · game ${base} · ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`)

let failed = 0, passed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info && !ok ? '  · ' + info : ''}`); if (ok) passed++; else failed++ }
const js = (x) => JSON.stringify(x)?.slice(0, 400)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 20000, step = 250) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step) }
}
const errors = []
const apiCalls = {}

const device = (ip) => browser.newContext({ viewport: SMALL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
async function open(ctx, name) {
  const page = await ctx.newPage()
  apiCalls[name] ||= []
  // expected API answers (401, 409, 429) show up as "Failed to load resource": not errors
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`))
  page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls[name].push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(base)
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
  await quiet(page)
  return page
}
const ev = (page, fn, arg) => page.evaluate(fn, arg)
// stop / resume drawing the city
const quiet = (page) => ev(page, () => { const r = window.__game.renderer; if (!r.__draw) { r.applyQuality('low'); r.__draw = r.render } r.render = () => {} })
const loud = (page) => ev(page, () => { const r = window.__game.renderer; if (r.__draw) r.render = r.__draw })
const startGame = (page) => ev(page, async () => {
  const g = window.__game
  await g.debug.startAt('profetul')
  g.autoTalk = true
  g.story.events.t = 1e9
})
// Continue from the main menu; no random street events afterwards (the save picker waits them out)
async function continueGame(page) {
  await page.click('.mm-btns .btn.primary')
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 90000 })
  await ev(page, () => { window.__game.story.events.t = 1e9 })
}
// the picker focuses the preselected save a moment after it opens
async function pickerUp(page) {
  await page.waitForSelector('.savepick', { timeout: 60000 })
  await page.waitForFunction(() => document.activeElement?.classList.contains('sp-pick'), null, { timeout: 10000 })
  return ev(page, () => ({
    cards: [...document.querySelectorAll('.sp-card')].map((c) => c.textContent.replace(/\s+/g, ' ')),
    focus: document.activeElement.dataset.pick, paused: window.__game.paused,
  }))
}
const cloudRow = async (email) => (await db.query('SELECT s.data, s.rev FROM saves s JOIN users u ON u.id = s.user_id WHERE u.email = $1', [email]))[0] || null
// screenshots are for looking at, never a reason to fail (the city is drawn again just for them)
async function shot(page, file, size = null) {
  if (!shots) return
  try {
    if (size) await page.setViewportSize(size)
    await loud(page)
    const f0 = await ev(page, () => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f + 3, f0, { timeout: 60000 })
    await page.screenshot({ path: `${shots}/${file}.png`, timeout: 90000 })
  } catch (e) { console.log(`  (no screenshot ${file}: ${e.message.split('\n')[0]})`) }
  await quiet(page).catch(() => {})
  if (size) await page.setViewportSize(SMALL)
}

const PASS_A = 'placinte-cu-varza'
const emailA = `dan.${Date.now().toString(36)}@example.md`
const victim = `victima.${Date.now().toString(36)}@example.md`
const created = await fetch(api.url + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.99' }, body: JSON.stringify({ email: victim, password: 'parola-victimei' }) })
check('(setup) an account for the login tests', created.status === 201, String(created.status))

// ======================= device A: sign up, play, the save reaches the database ==============================
const ctxA = await device('10.0.0.1')
{
  const p = await open(ctxA, 'A')
  let r = await ev(p, () => [...document.querySelectorAll('.mm-btns .btn')].map((b) => b.textContent.trim()))
  check('new device: "Cont" in the main menu, no Continue', r.some((t) => t.includes('Cont')) && !r.some((t) => t.includes('Continuă')), js(r))
  await p.click('.mm-btns .acct-btn')
  await p.waitForSelector('.acct-screen .acct-form')
  await p.click('.acct-tab[data-m=signup]')
  await p.fill('.acct input[name=email]', emailA)
  await p.fill('.acct input[name=password]', PASS_A)
  await p.click('.acct-eye')
  r = await ev(p, () => document.querySelector('.acct input[name=password]').type)
  check('show / hide password', r === 'text', r)
  await shot(p, 'signup-640x360', { width: 640, height: 360 })
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForSelector('.acct-screen .acct-email', { timeout: 60000 })
  r = await ev(p, () => ({ email: document.querySelector('.acct-email').textContent, auth: JSON.parse(localStorage.getItem('cr3d-auth') || 'null'), state: window.__game.cloud.state }))
  check('sign-up with Enter: logged in, token kept on the device', r.email.includes(emailA) && /^[A-Za-z0-9_-]{43}$/.test(r.auth?.token || '') && r.auth.email === emailA, js(r))
  await p.click('.acct-screen .acct-back')
  r = await ev(p, () => document.querySelector('.mm-cloud')?.textContent || '')
  check('main menu shows who is logged in', r.includes(emailA), r)
  await shot(p, 'mainmenu-640x360', { width: 640, height: 360 })

  await startGame(p)
  await ev(p, () => { const g = window.__game; g.progress.lei = 777; g.progress.save() })
  const t1 = Date.now()
  let row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 777 && x }, 30000)
  check('a save reaches the database (debounced)', !!row && row.data.story.done.length === 7, `${js(row?.data?.lei)} after ${Date.now() - t1} ms`)

  // a story mission passed: its save skips the 20 s spacing (otherwise it would wait ~19 s more)
  await ev(p, () => { const g = window.__game; g.events.emit('mission:pass', { id: 'test', activity: false }); g.progress.lei = 800; g.progress.save() })
  const t2 = Date.now()
  row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 800 && x }, 15000)
  check('after a mission pass the save goes up at once', !!row && Date.now() - t2 < 8000, `${Date.now() - t2} ms`)

  await ev(p, () => window.__game.menus.showPause('account'))
  await p.waitForSelector('.pause .acct-status')
  await until(() => ev(p, () => document.querySelector('.acct-status span').textContent.includes('Salvat în cloud')), 15000)
  r = await ev(p, () => document.querySelector('.acct-status span').textContent)
  check('pause › Cont shows the sync status', r.startsWith('Salvat în cloud · acum'), r)
  await shot(p, 'pause-account-640x360', { width: 640, height: 360 })
  await ev(p, () => window.__game.menus.closePause())

  // leaving the page: the pending save still goes up (fetch keepalive on pagehide)
  await ev(p, () => { const g = window.__game; g.progress.lei = 999; g.progress.save() })
  await p.goto('about:blank')
  row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 999 && x }, 15000)
  check('closing the page flushes the pending save (keepalive)', !!row, js((await cloudRow(emailA))?.data?.lei))
  await p.close()
}

// ======================= a guest: exactly as before; then wrong password, limits, and logging in ==============
{
  const ctx = await device('10.0.0.9')
  const p = await open(ctx, 'guest')
  let r = await ev(p, () => window.__game.cloud.state)
  check('guest: the cloud stays idle', r === 'guest', r)
  await startGame(p)
  r = await ev(p, async () => {
    const g = window.__game
    g.progress.lei = 4321
    g.progress.addXp(300)
    g.progress.save()
    g.menus.showPause('missions')
    g.menus.closePause()
    await new Promise((res) => setTimeout(res, 7000))
    return { saved: JSON.parse(localStorage.getItem('cr3d-save')).lei, auth: localStorage.getItem('cr3d-auth') }
  })
  check('guest: saves stay local, no account data', r.saved === 4321 && r.auth === null, js(r))
  check('guest: not a single request to the API', apiCalls.guest.length === 0, js(apiCalls.guest))

  await ev(p, () => window.__game.menus.showPause('account'))
  await p.waitForSelector('.pause .acct-form')
  await p.fill('.acct input[name=email]', victim)
  await p.fill('.acct input[name=password]', 'parola-gresita')
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForFunction(() => document.querySelector('.acct-err.on')?.textContent.includes('greșită'), null, { timeout: 30000 })
  check('wrong password: inline error, still a guest', await ev(p, () => !window.__game.cloud.loggedIn && document.querySelector('.acct-err').textContent === 'Email sau parolă greșită.'))
  // 7 more wrong tries (through the page), then the 9th from the form is refused
  r = await ev(p, async (email) => { const out = []; for (let i = 0; i < 7; i++) out.push((await window.__game.cloud.login(email, 'inca-una-gresita-' + i)).status); return out }, victim)
  await p.fill('.acct input[name=password]', 'parola-victimei')
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForFunction(() => document.querySelector('.acct-err.on')?.textContent.includes('Prea multe'), null, { timeout: 30000 })
  check('9th try in 15 min: "Prea multe încercări" (429), even with the right password', r.every((s) => s === 401) && await ev(p, () => !window.__game.cloud.loggedIn), js(r))

  await p.click('.acct-tab[data-m=signup]')
  await p.fill('.acct input[name=email]', victim.toUpperCase())
  await p.fill('.acct input[name=password]', 'alta-parola-buna')
  await p.click('.acct-go')
  await p.waitForFunction(() => document.querySelector('.acct-err.on')?.textContent.includes('Există deja'), null, { timeout: 30000 })
  check('sign-up with a taken email: inline error', await ev(p, () => !window.__game.cloud.loggedIn))
  await p.fill('.acct input[name=password]', 'scurt')
  await p.press('.acct input[name=password]', 'Enter')
  r = await ev(p, () => document.querySelector('.acct-err').textContent)
  check('short password caught before any request', r.includes('8 caractere'), r)

  // this guest has a save of their own and logs into A's account (mid-game, from the pause menu)
  await p.click('.acct-tab[data-m=login]')
  await p.fill('.acct input[name=email]', emailA)
  await p.fill('.acct input[name=password]', PASS_A)
  await p.press('.acct input[name=password]', 'Enter')
  r = await pickerUp(p)
  check('login with a different local save: the player is asked, with both summaries', r.cards.length === 2 && r.cards[0].includes('4 321 lei') && r.cards[0].includes('7 / 14') && r.cards[0].includes('300 XP') && r.cards[1].includes('999 lei') && r.paused, js(r))
  check('the save that came further (more XP) is preselected', r.focus === 'local', js(r))
  await p.keyboard.press('Enter')
  await p.waitForSelector('.pause .acct-email', { timeout: 60000 })
  const row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 4321 && x })
  check('Enter keeps it, and it goes up to the account', !!row && row.data.xp === 300, js(row?.data?.lei))

  // phone in landscape: nothing sticks out sideways, every control reachable
  await p.setViewportSize({ width: 844, height: 390 })
  await sleep(800)
  r = await ev(p, () => {
    const a = document.querySelector('.acct'), out = document.querySelector('.acct-out')
    out.scrollIntoView({ block: 'nearest' })
    const b = out.getBoundingClientRect()
    return { wide: a.scrollWidth > a.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth, inView: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth }
  })
  check('phone landscape (844×390): the account panel fits', !r.wide && r.inView, js(r))
  await shot(p, 'pause-account-844x390', { width: 844, height: 390 })
  await p.setViewportSize(SMALL)

  await p.click('.acct-out')
  await p.waitForSelector('.pause .acct-form', { timeout: 30000 })
  r = await ev(p, () => ({ auth: localStorage.getItem('cr3d-auth'), save: JSON.parse(localStorage.getItem('cr3d-save'))?.lei, state: window.__game.cloud.state }))
  check('logout: token gone, the save stays on the device', r.auth === null && r.save === 4321 && r.state === 'guest', js(r))
  const before = apiCalls.guest.length
  await ev(p, async () => { const g = window.__game; g.menus.closePause(); g.progress.lei = 1; g.progress.save(); await new Promise((res) => setTimeout(res, 6500)) })
  check('after logout: back to local-only saves', apiCalls.guest.length === before && (await cloudRow(emailA)).data.lei === 4321, js(apiCalls.guest.slice(before)))
  await ctx.close()
}

// ======================= device B: log in elsewhere, the progress comes along ===============================
let tokenB
{
  const ctx = await device('10.0.0.2')
  const p = await open(ctx, 'B')
  await p.click('.mm-btns .acct-btn')
  await p.waitForSelector('.acct-screen .acct-form')
  await p.fill('.acct input[name=email]', emailA.toUpperCase())
  await p.fill('.acct input[name=password]', PASS_A)
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForSelector('.acct-screen .acct-email', { timeout: 60000 })
  await p.click('.acct-screen .acct-back')
  let r = await ev(p, () => ({ btn: [...document.querySelectorAll('.mm-btns .btn')].map((b) => b.textContent.trim()), line: document.querySelector('.mm-save').textContent }))
  check('logging in on a new device brings the save (main menu: Continue)', r.btn.some((t) => t.includes('Continuă')) && r.line.includes('4 321 lei'), js(r))
  await continueGame(p)
  r = await ev(p, () => { const g = window.__game; return { lei: g.progress.lei, done: g.progress.story.done.length, xp: g.progress.xp } })
  check('Continue on the new device restores the progress', r.lei === 4321 && r.done === 7 && r.xp === 300, js(r))
  await ev(p, () => { const g = window.__game; g.progress.lei = 1234; g.progress.save(); g.cloud.flush() })
  const row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 1234 && x })
  check('device B uploads its progress', !!row, js(row?.rev))
  tokenB = await ev(p, () => JSON.parse(localStorage.getItem('cr3d-auth')).token)
  await ctx.close()
}

// ======================= device A again: fast-forward, then a real conflict mid-game ==========================
{
  const p = await open(ctxA, 'A')
  await until(() => ev(p, () => document.querySelector('.mm-save')?.textContent.includes('1 234 lei')), 30000)
  let r = await ev(p, () => ({ line: document.querySelector('.mm-save').textContent, picker: !!document.querySelector('.savepick') }))
  check('back on device A the newer cloud save is taken without asking', r.line.includes('1 234 lei') && !r.picker, js(r))
  await continueGame(p)
  r = await ev(p, () => window.__game.progress.lei)
  check('…and Continue plays it', r === 1234, js(r))

  // both devices play on: B (through the API, with its own session) writes first, A's upload gets 409
  await ev(p, () => { const g = window.__game; g.progress.lei = 555; g.progress.addXp(50); g.progress.save() })
  const auth = { authorization: 'Bearer ' + tokenB, 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' }
  const cur = await (await fetch(api.url + '/api/save', { headers: auth })).json()
  const put = await fetch(api.url + '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ data: { ...cur.data, lei: 2000, xp: cur.data.xp + 500, t: Date.now() }, baseRev: cur.rev }) })
  check('(setup) device B saves again meanwhile', put.status === 200, String(put.status))
  r = await pickerUp(p)
  check('conflict (409) mid-game: the game pauses and asks', r.cards.length === 2 && r.cards[0].includes('555 lei') && r.cards[1].includes('2 000 lei') && r.paused, js(r))
  check('the save that came further is preselected', r.focus === 'cloud', js(r))
  await shot(p, 'conflict-640x360', { width: 640, height: 360 })
  const reloaded = p.waitForEvent('load', { timeout: 60000 })
  await p.click('.sp-pick[data-pick=cloud]')
  await reloaded
  await p.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 300000 })
  r = await ev(p, () => ({ lei: window.__game.progress.lei, local: JSON.parse(localStorage.getItem('cr3d-save')).lei }))
  const row = await cloudRow(emailA)
  check('picking the cloud save restarts into it; nothing overwrites it', r.lei === 2000 && r.local === 2000 && row.data.lei === 2000, js({ r, db: row.data.lei }))
  await ctxA.close()
}

check('no console errors', errors.length === 0, errors.join('\n'))
console.log(`\n${passed} passed, ${failed} failed · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
await browser.close()
await server.close()
await api.close()
await db.close()
process.exit(failed ? 1 : 0)
