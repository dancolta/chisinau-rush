// The sign-up wall on the title screen, end to end in headless Chromium against the dev API
// (tools/api-dev.mjs on an in-memory PGlite): where the server can make accounts, nobody plays
// without one. Sign up and you're making your character; log in on a new device and your save is
// there; a guest's old save waits behind the wall and goes up with the new account; a click that
// beats the server's answer still hits the wall; a server that's down lets you play.
// The real sites ask /api/health at boot; on localhost the game doesn't, so each device asks here.
// usage: node tools/gate.mjs [--shots dir]
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
const server = await createServer({ server: { port: 5263, strictPort: false, host: '127.0.0.1', fs: { strict: false }, proxy: { '/api': { target: api.url } } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })

let failed = 0, passed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info && !ok ? '  · ' + info : ''}`); if (ok) passed++; else failed++ }
const js = (x) => JSON.stringify(x)?.slice(0, 400)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 20000, step = 250) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step) }
}
const errors = []
const device = (ip) => browser.newContext({ viewport: SMALL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
const ev = (page, fn, arg) => page.evaluate(fn, arg)
const quiet = (page) => ev(page, () => { const r = window.__game.renderer; if (!r.__draw) { r.applyQuality('low'); r.__draw = r.render } r.render = () => {} })
const loud = (page) => ev(page, () => { const r = window.__game.renderer; if (r.__draw) r.render = r.__draw })
async function open(ctx, name) {
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
  await quiet(page)
  return page
}
// what the real sites do at boot
const probe = (page) => ev(page, async () => { const c = window.__game.cloud; c.probing = c.probe(); await c.probing; return { server: c.server, required: c.required } })
const title = (page) => ev(page, () => ({
  btns: [...document.querySelectorAll('.mm-btns .btn')].map((b) => b.textContent.trim()),
  save: document.querySelector('.mm-save')?.textContent || '',
  state: window.__game.state,
}))
const wall = (t) => t.btns.includes('Creează cont') && t.btns.includes('Am deja cont') && !t.btns.some((b) => /Continuă|Joc nou|^Cont$/.test(b))
const click = (page, label) => ev(page, (label) => [...document.querySelectorAll('.mm-btns .btn')].find((b) => b.textContent.trim() === label)?.click(), label)
async function shot(page, file, size) {
  if (!shots) return
  try {
    await page.setViewportSize(size)
    await loud(page)
    const f0 = await ev(page, () => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f + 3, f0, { timeout: 60000 })
    await page.screenshot({ path: `${shots}/${file}.png`, timeout: 90000 })
  } catch (e) { console.log(`  (no screenshot ${file}: ${e.message.split('\n')[0]})`) }
  await quiet(page).catch(() => {})
  await page.setViewportSize(SMALL)
}
const cloudRow = async (email) => (await db.query('SELECT s.data, s.rev FROM saves s JOIN users u ON u.id = s.user_id WHERE u.email = $1', [email]))[0] || null

const PASS = 'placinte-cu-branza'
const stamp = Date.now().toString(36)
const emailA = `poarta.${stamp}@example.md`, emailC = `vechi.${stamp}@example.md`

// ======================= A: a new player hits the wall, signs up, makes a character ======================
{
  const ctx = await device('10.1.0.1')
  const p = await open(ctx, 'A')
  let t = await title(p)
  check('dev server with no answer from the API yet: the title plays as before', t.btns.includes('Joc nou') && !wall(t), js(t))
  const pr = await probe(p)
  check('the API can make accounts: required', pr.server === 'ok' && pr.required, js(pr))
  t = await title(p)
  check('the title turns into the wall: Creează cont, Am deja cont; no Joc nou, no Cont', wall(t) && t.btns.includes('Setări'), js(t))
  check('the note under the buttons says why', t.save.includes('CONT OBLIGATORIU'), t.save)
  await shot(p, 'gate-title-640x360', { width: 640, height: 360 })
  await shot(p, 'gate-title-1280x720', { width: 1280, height: 720 })
  await click(p, 'Creează cont')
  await p.waitForSelector('.acct-screen .acct-form')
  let r = await ev(p, () => ({ tab: document.querySelector('.acct-tab.on')?.dataset.m, text: document.querySelector('.acct-p')?.textContent }))
  check('Creează cont opens the account screen on the sign-up tab, worded as the way in', r.tab === 'signup' && r.text.startsWith('Ca să joci'), js(r))
  await p.fill('.acct input[name=email]', emailA)
  await p.fill('.acct input[name=password]', PASS)
  await shot(p, 'gate-signup-640x360', { width: 640, height: 360 })
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForSelector('.create', { timeout: 60000 })
  r = await ev(p, () => ({ state: window.__game.state, in: window.__game.cloud.loggedIn, screens: document.querySelectorAll('.acct-screen').length }))
  check('signed up: the screen steps aside, straight on to making your character', r.state === 'create' && r.in && r.screens === 0, js(r))
  r = await ev(p, () => document.querySelectorAll('.acct-screen, .acct').length)
  check('no account screen left behind', r === 0, String(r))
  await ev(p, async () => {
    const g = window.__game
    await g.debug.startAt('profetul')
    g.story.events.t = 1e9
    // prizes (achievements, ranks, the daily bonus) would move the lei this test follows
    const add = g.progress.addLei.bind(g.progress)
    g.progress.addLei = (n, reason = '') => (/^(🏆|⭐|🔥)/u.test(reason) ? undefined : add(n, reason))
    g.progress.lei = 4242
    g.progress.save()
    g.cloud.flush?.()
  })
  const row = await until(async () => { const x = await cloudRow(emailA); return x?.data?.lei === 4242 && x }, 40000)
  check('the new player\'s save reaches the database', !!row, js((await cloudRow(emailA))?.data?.lei))
  await ev(p, () => { const g = window.__game; g.progress.save(); g.menus.showMain() })
  await p.waitForSelector('.mainmenu')
  t = await title(p)
  check('logged in: the title is the usual one (Continuă, Cont)', t.btns.includes('Continuă') && t.btns.includes('Cont') && !wall(t), js(t))
  await ev(p, () => window.__game.cloud.logout())
  await until(async () => wall(await title(p)), 10000)
  t = await title(p)
  check('logged out on the title: the wall is back, the save waits behind it', wall(t) && t.save.includes('SALVAREA TA TE AȘTEAPTĂ'), js(t))
  await ctx.close()
}

// ======================= B: a new device, "Am deja cont": the save from the cloud, no character creation =====
{
  const ctx = await device('10.1.0.2')
  const p = await open(ctx, 'B')
  await probe(p)
  let t = await title(p)
  check('new device: the wall', wall(t) && t.save.includes('CONT OBLIGATORIU'), js(t))
  await click(p, 'Am deja cont')
  await p.waitForSelector('.acct-screen .acct-form')
  let r = await ev(p, () => document.querySelector('.acct-tab.on')?.dataset.m)
  check('Am deja cont opens on the login tab', r === 'login', r)
  await p.fill('.acct input[name=email]', emailA)
  await p.fill('.acct input[name=password]', PASS)
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForFunction(() => !document.querySelector('.acct-screen') && window.__game.cloud.loggedIn, null, { timeout: 60000 })
  await sleep(600)
  t = await title(p)
  r = await ev(p, () => ({ lei: JSON.parse(localStorage.getItem('cr3d-save') || 'null')?.lei, create: !!document.querySelector('.create') }))
  const up = (await cloudRow(emailA))?.data?.lei
  check('logged in: the cloud save came down, the title offers Continuă (no character creation)', t.state === 'menu' && t.btns[0] === 'Continuă' && r.lei === up && r.lei >= 4242 && !r.create, js({ t, r, db: up }))
  await ctx.close()
}

// ======================= C: a guest who played before the wall: the save goes up with the new account ======
{
  const ctx = await device('10.1.0.3')
  const p = await open(ctx, 'C')
  await ev(p, async () => {
    const g = window.__game
    await g.debug.startAt('profetul')
    g.story.events.t = 1e9
    g.progress.lei = 1313
    g.progress.save()
    g.menus.showMain()
  })
  await p.waitForSelector('.mainmenu')
  await probe(p)
  let t = await title(p)
  check('a guest with a save on this device: the wall, the save named behind it, no Continuă', wall(t) && t.save.includes('SALVAREA TA TE AȘTEAPTĂ'), js(t))
  await click(p, 'Creează cont')
  await p.waitForSelector('.acct-screen .acct-form')
  await p.fill('.acct input[name=email]', emailC)
  await p.fill('.acct input[name=password]', PASS)
  await p.press('.acct input[name=password]', 'Enter')
  await p.waitForFunction(() => !document.querySelector('.acct-screen') && window.__game.cloud.loggedIn, null, { timeout: 60000 })
  await sleep(600)
  t = await title(p)
  const row = await until(async () => { const x = await cloudRow(emailC); return x?.data?.lei === 1313 && x }, 20000)
  check('signed up: that save is now the account\'s, the title offers Continuă', t.state === 'menu' && t.btns[0] === 'Continuă' && !!row, js({ t, db: row?.data?.lei }))
  await ctx.close()
}

// ======================= D: a click that beats the server's answer; a server that's down ===================
{
  const ctx = await device('10.1.0.4')
  const p = await open(ctx, 'D')
  // the answer is on its way (slow network): Joc nou is still up and gets clicked
  await ev(p, () => {
    const c = window.__game.cloud
    c.server = 'unknown'
    c.probing = new Promise((res) => setTimeout(() => c.probe().then(res), 1500))
  })
  await click(p, 'Joc nou')
  await p.waitForSelector('.acct-screen .acct-form', { timeout: 20000 })
  let r = await ev(p, () => ({ tab: document.querySelector('.acct-tab.on')?.dataset.m, state: window.__game.state, create: !!document.querySelector('.create') }))
  check('Joc nou clicked before the answer: the wall, not the game', r.tab === 'signup' && r.state === 'menu' && !r.create, js(r))
  await p.click('.acct-screen .acct-back')
  let t = await title(p)
  check('back from it: the title is the wall', wall(t), js(t))
  await ev(p, () => { const c = window.__game.cloud; c.state = 'expired'; c.emit() })
  t = await title(p)
  r = await ev(p, () => document.querySelector('.mm-btns .btn.primary')?.textContent.trim())
  check('a session that ran out: the wall leads with logging back in', wall(t) && t.btns[0] === 'Am deja cont' && r === 'Am deja cont', js({ t, r }))
  await ev(p, () => { const c = window.__game.cloud; c.state = 'guest'; c.emit() })
  await ev(p, () => { const c = window.__game.cloud; c.server = 'down'; c.emit() })
  t = await title(p)
  check('the server is down: you play without an account', t.btns.includes('Joc nou') && !wall(t), js(t))
  await click(p, 'Joc nou')
  await p.waitForSelector('.create', { timeout: 20000 })
  check('Joc nou goes to character creation', (await ev(p, () => window.__game.state)) === 'create')
  await ctx.close()
}

check('no console errors', errors.length === 0, errors.join('\n'))
console.log(`\n${passed} passed, ${failed} failed · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
await browser.close()
await server.close()
await api.close()
await db.close()
process.exit(failed ? 1 : 0)
