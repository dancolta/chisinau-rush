// Dev tool: the game on a phone held sideways, where most players arrive from a link. In headless
// Chromium with touch on (isMobile + hasTouch, so the game's own touch mode switches on), at four
// landscape phone sizes: the title and the sign-up wall, the account form (and the field you type in
// with the keyboard up), character creation, the HUD on foot and at the wheel, a dialogue with
// choices, notifications and reward chips, every pause tab, the big map, the LEȘINAT / REȚINUT cards
// and the mission banners. A phone held upright gets the title and the wall (the "turn it round"
// card may cover them); 1280×720 on a desktop gets everything, so nothing regresses there.
// Each screen: the pieces that matter inside the screen, the pairs that must not touch kept apart,
// no text running out of its box.
// usage: node tools/landscape.mjs [--shots dir] [--only 640x360]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const shots = opt('--shots'), only = opt('--only')
if (shots) await mkdir(shots, { recursive: true })
const PHONE = [[640, 360], [740, 360], [844, 390], [932, 430]].filter(([w, h]) => !only || only === `${w}x${h}`)
const UPRIGHT = [390, 844]
const DESK = [1280, 720]
// the keyboard on a phone on its side leaves a bit under half the screen
const KEYBOARD = 0.45

const t0 = Date.now()
const server = await createServer({ server: { port: 5271, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })

let failed = 0, passed = 0
const check = (name, bad) => {
  const ok = !bad.length
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  · ' + bad.slice(0, 5).join(' | ')}`)
  if (ok) passed++; else failed++
}
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (page, fn, arg) => page.evaluate(fn, arg)
const quiet = (page) => ev(page, () => { const r = window.__game.renderer; if (!r.__draw) { r.applyQuality('low'); r.__draw = r.render } r.render = () => {} })
const loud = (page) => ev(page, () => { const r = window.__game.renderer; if (r.__draw) r.render = r.__draw })
// a few game frames (the HUD lays itself out in the update), then every entrance animation at its end
const settle = (page) => ev(page, async () => {
  const g = window.__game, f0 = g.frame
  for (let i = 0; i < 100 && g.frame < f0 + 3; i++) await new Promise((r) => setTimeout(r, 30))
  for (const a of document.getAnimations()) { try { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish() } catch {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
})
async function shot(page, file) {
  if (!shots) return
  try {
    await loud(page)
    const f0 = await ev(page, () => window.__game.frame)
    await page.waitForFunction((f) => window.__game.frame > f + 2, f0, { timeout: 60000 })
    await settle(page)
    await page.screenshot({ path: `${shots}/${file}.png`, timeout: 90000 })
  } catch (e) { console.log(`  (no screenshot ${file}: ${e.message.split('\n')[0]})`) }
  await quiet(page).catch(() => {})
}

// ---- the measuring: everything from bounding rects in the page ----------------------------------------
// need: present and visible · inside: within the screen · apart: [a, b] never intersect · fit: no text
// out of its box: never sideways, and not past the bottom of a box that clips (cut on purpose with an
// ellipsis or a line clamp is fine; a scroller may scroll down; a display face's letters may stand
// a little above and below a tight line, the overlap checks see what they reach) · within: [a, b] a drawn inside b · tall: [sel, px] at least that high.
// "sel::text" measures the letters, not the box (a centred title in a full-width block)
function measure(spec) {
  const vw = innerWidth, vh = innerHeight, bad = []
  const shown = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0
  const ink = new Map()
  const all = (sel) => {
    const text = sel.endsWith('::text'), list = [...document.querySelectorAll(text ? sel.slice(0, -6) : sel)].filter(shown)
    if (text) for (const e of list) { const r = document.createRange(); r.selectNodeContents(e); ink.set(e, r.getBoundingClientRect()) }
    return list
  }
  const R = (e) => ink.get(e) || e.getBoundingClientRect()
  const box = (r) => `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)}]`
  const label = (e) => (e.textContent || '').trim().slice(0, 24)
  for (const sel of spec.need || []) if (!all(sel).length) bad.push(`missing ${sel}`)
  for (const sel of spec.inside || []) {
    for (const e of all(sel)) { const r = R(e); if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push(`off-screen ${sel} "${label(e)}" ${box(r)}`) }
  }
  for (const [a, b] of spec.apart || []) {
    for (const x of all(a)) for (const y of all(b)) {
      if (x === y || x.contains(y) || y.contains(x)) continue
      const p = R(x), q = R(y)
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)
      if (w > 2 && h > 2) bad.push(`overlap ${a} "${label(x)}" × ${b} "${label(y)}" (${Math.round(w)}×${Math.round(h)})`)
    }
  }
  for (const sel of spec.fit || []) {
    for (const e of all(sel)) {
      const cs = getComputedStyle(e)
      if (cs.display === 'inline' || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') continue
      const clips = /hidden|clip/.test(cs.overflowY)
      if (e.scrollWidth > e.clientWidth + 2 || (clips && e.scrollHeight > e.clientHeight + 2)) bad.push(`text out of ${sel} "${label(e)}" ${e.scrollWidth}×${e.scrollHeight} in ${e.clientWidth}×${e.clientHeight}`)
    }
  }
  for (const [a, b] of spec.within || []) {
    const outer = all(b)[0]
    if (!outer) continue
    const o = R(outer)
    for (const e of all(a)) { const r = R(e); if (r.left < o.left - 1 || r.top < o.top - 1 || r.right > o.right + 1 || r.bottom > o.bottom + 1) bad.push(`${a} "${label(e)}" ${box(r)} outside ${b} ${box(o)}`) }
  }
  for (const [sel, px] of spec.tall || []) for (const e of all(sel)) if (R(e).height < px) bad.push(`${sel} only ${Math.round(R(e).height)} px high`)
  return bad
}
async function look(page, name, spec, file) {
  await settle(page)
  check(name, await ev(page, measure, spec))
  if (file) await shot(page, file)
}

// ---- the screens ------------------------------------------------------------------------------------
const TITLE = {
  need: ['.mainmenu', '.mm-logo', '.mm-btns .btn'],
  inside: ['.mm-logo', '.mm-btns .btn', '.mm-save', '.mm-cloud', '.mm-daily', '.mm-foot'],
  apart: [['.mm-daily', '.mainmenu .side'], ['.mm-daily', '.mm-foot'], ['.mm-foot', '.mainmenu .side'], ['.mm-btns .btn', '.mm-btns .btn'],
    ['.mm-save', '.mm-btns .btn'], ['.mm-logo', '.mm-btns .btn'], ['.mm-cloud', '.mm-save']],
  fit: ['.mm-btns .btn', '.mm-save', '.mm-cloud', '.mm-daily .ms-h', '.mm-daily .ms-l', '.mm-foot .cr', '.mm-foot .k'],
  within: [['.mm-save', '.mainmenu .side'], ['.mm-btns .btn', '.mainmenu .side'], ['.mm-logo', '.mainmenu .side']],
}
const WALL = { ...TITLE, need: [...TITLE.need, '.mm-save'] }
const ACCOUNT = {
  need: ['.acct input', '.acct-go'],
  inside: ['.pause .top h1', '.acct-tab', '.acct input', '.acct-go', '.pause .foot .btn'],
  apart: [['.pause .foot .btn', '.acct-go'], ['.pause .top', '.acct']],
  fit: ['.acct-tab', '.acct-go', '.acct-p', '.acct-note', '.acct-l', '.pause .foot .btn', '.pause .body'],
}
const CREATE = {
  need: ['.create .type', '.create input', '.create .actions .btn'],
  inside: ['.create h2', '.create input', '.create .actions .btn', '.create .turn-hint', '.type.sel'],
  apart: [['.create .actions .btn', '.create .actions .btn'], ['.create .turn-hint', '.create .side'], ['.create .types', '.create .actions']],
  fit: ['.type .n', '.type .pk', '.create .actions .btn', '.cr-kick', '.create h2', '.create .side'],
  within: [['.type.sel', '.create .types']],
}
const HUD_TL = '.hud-tl > :not(.hidden)', HUD_TR = '.hud-tr > :not(.toasts):not(.rw-stack), .hud-tr .toast, .hud-tr .rw-chip'
const HUD = {
  need: ['.hud-money', '.minimap-wrap', '.objective', '.vitals'],
  inside: [HUD_TL, HUD_TR, '.hud-bl', '.aura-chip', '.tbtn', '.prompt', '.ticker .lbl', '.gcard'],
  apart: [[HUD_TL, HUD_TR], [HUD_TL, '.ttop'], [HUD_TL, '.hud-bl'], [HUD_TL, '.aura-chip'], [HUD_TR, '.ttop'], [HUD_TR, '.tbtns .tbtn'], [HUD_TR, '.hud-bl'],
    ['.hud-bl', '.tbtns .tbtn'], ['.aura-chip', '.tbtns .tbtn'], ['.prompt', '.tbtn'], ['.prompt', '.hud-bl'], ['.prompt', HUD_TL], ['.prompt', HUD_TR],
    ['.tbtns .tbtn', '.tbtns .tbtn'], ['.ttop .tbtn', '.ttop .tbtn'], ['.gcard', '.tbtns .tbtn'], ['.gcard', '.hud-bl'], ['.gcard', HUD_TL], ['.gcard', '.prompt']],
  fit: ['.objective .o', '.objective .sub', '.objective .t', '.tip', '.toast', '.rw-chip .v', '.hud-weapon', '.hud-money', '.prompt', '.aura-chip'],
}
const TOUCH_NEED = ['.tbtns .tbtn', '.ttop .tbtn']
const DRIVE = { ...HUD, inside: [...HUD.inside, '.hud-br'], apart: [...HUD.apart, ['.hud-br', '.tbtns .tbtn'], ['.hud-br', '.hud-bl'], ['.hud-br', '.prompt'], ['.hud-br', HUD_TR], ['.hud-br', '.gcard']],
  fit: [...HUD.fit, '.speedo', '.vname'] }
const DIALOG = {
  need: ['.dialog .card', '.dialog .choice'],
  inside: ['.dialog .card', '.dialog .portrait', '.dialog .choice'],
  apart: [['.dialog .card', '.hud-money'], ['.dialog .card', '.rw-chip'], ['.dialog .card', '.toast'], ['.dialog .choice', '.dialog .choice']],
  fit: ['.dialog .text', '.dialog .choice .t', '.dialog .name', '.dialog .role'],
  within: [['.dialog .choice', '.dialog .card']],
}
const PAUSE = {
  need: ['.pause .tabs button.on', '.pause .body > *'],
  inside: ['.pause .top h1', '.tabs button.on', '.pause .foot .btn', '.pause .body'],
  apart: [['.pause .foot .btn', '.pause .foot .btn'], ['.pause .top h1', '.tabs'], ['.pause .body', '.pause .foot']],
  fit: ['.tabs button.on', '.pause .foot .btn', '.pause .body', '.pause .col', '.stat-row', '.setting', '.mission-item'],
  within: [['.tabs button.on', '.tabs']],
}
const TABS = ['map', 'missions', 'progress', 'ach', 'char', 'aura', 'controls', 'settings', 'account']
const CARD = { need: ['.overlay-msg .h'], inside: ['.overlay-msg .h'], fit: ['.overlay-msg .h'] }
// the letters of a banner against everything still drawn around them
const AROUND = [HUD_TL, HUD_TR, '.hud-bl', '.ttop', '.tbtns .tbtn', '.prompt']
const BANNER = { need: ['.mbanner .t'], inside: ['.mbanner .k::text', '.mbanner .t::text'], fit: ['.mbanner .t', '.mbanner .k'],
  apart: AROUND.flatMap((x) => [['.mbanner .k::text', x], ['.mbanner .t::text', x]]) }
const PASSED = { need: ['.bigmsg .h'], inside: ['.bigmsg .h::text', '.bigmsg .s::text'], fit: ['.bigmsg .h', '.bigmsg .s'],
  apart: AROUND.flatMap((x) => [['.bigmsg .h::text', x], ['.bigmsg .s::text', x]]) }

const title = (page, wall) => ev(page, (wall) => {
  const g = window.__game, c = g.cloud
  g.menus.closeAccount?.()
  if (c) { c.__server ??= c.server; c.server = wall ? 'ok' : c.__server; c.emit() }
  g.menus.showMain()
  return !!c?.required === wall
}, wall)

async function menus(page, [w, h], touch) {
  const tag = `${w}×${h}${touch ? ' touch' : ''}`, f = `${w}x${h}`
  await page.setViewportSize({ width: w, height: h })
  check(`${tag} title: wall off`, (await title(page, false)) ? [] : ['the cloud still asks for an account'])
  await look(page, `${tag} title`, TITLE, `${f}-title`)
  check(`${tag} sign-up wall: on`, (await title(page, true)) ? [] : ['no wall'])
  await look(page, `${tag} sign-up wall`, WALL, `${f}-wall`)
  if (h > w) return
  for (const mode of ['signup', 'login']) {
    await ev(page, (mode) => { const m = window.__game.menus; m.closeAccount?.(); m.showAccount({ mode, gate: true }) }, mode)
    await look(page, `${tag} account ${mode}`, ACCOUNT, mode === 'signup' && `${f}-signup`)
    if (!touch) continue
    // the keyboard comes up under a field: it stays in sight, not under anything
    const n = await ev(page, () => document.querySelectorAll('.acct input').length)
    const bad = []
    for (let i = 0; i < n; i++) {
      await page.setViewportSize({ width: w, height: h })
      await ev(page, (i) => document.querySelectorAll('.acct input')[i].focus(), i)
      await page.setViewportSize({ width: w, height: Math.round(h * KEYBOARD) })
      await sleep(250)
      await settle(page)
      bad.push(...await ev(page, (i) => {
        const e = document.querySelectorAll('.acct input')[i], r = e.getBoundingClientRect()
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        const out = []
        if (document.activeElement !== e) out.push(`field ${i} lost focus`)
        if (r.top < -1 || r.bottom > innerHeight + 1) out.push(`field ${i} (${e.type}) at ${Math.round(r.top)}..${Math.round(r.bottom)} with ${innerHeight} px above the keyboard`)
        else if (at !== e && !e.parentElement.contains(at)) out.push(`field ${i} under ${at?.className}`)
        return out
      }, i))
      if (i === n - 1 && mode === 'signup' && w === 640) await shot(page, `${f}-keyboard`)
    }
    await ev(page, () => document.activeElement?.blur())
    await page.setViewportSize({ width: w, height: h })
    check(`${tag} account ${mode}: the field you type in stays above the keyboard`, bad)
  }
  await ev(page, () => { const m = window.__game.menus; m.closeAccount?.(); m.showCreate() })
  await look(page, `${tag} character creation`, CREATE, `${f}-create`)
  await title(page, false)
}

const OBJ = 'Du-te la {y}Piața Centrală{/y} și găsește-l pe Borea înainte să închidă taraba cu pepeni de la Cricova.'
async function city(page, [w, h], touch) {
  const tag = `${w}×${h}${touch ? ' touch' : ''}`, f = `${w}x${h}`
  await page.setViewportSize({ width: w, height: h })
  const need = touch ? TOUCH_NEED : []
  // on foot: a long objective with a timer, a tip, two notifications, three reward chips, a prompt, two stars
  await ev(page, (OBJ) => {
    const g = window.__game, ui = g.ui
    ui.setObjective(OBJ, { title: 'CAPITOLUL 1 · PROFETUL', sub: 'Taxiul e parcat lângă bloc, pe partea cealaltă.', flash: false })
    ui.tip('Ține apăsat {y}[Shift]{/y} ca să fugi. Pe telefon: butonul {y}»{/y} din dreapta jos.', 0)
    ui.notify('Ai găsit 50 de lei sub o bancă din parc.', 1e6)
    ui.notify('Tanti Zina ți-a lăsat un mesaj pe Viber.', 1e6, 'gold')
    ui.rewards.push('lei', 1250, { why: 'Cursă cu taxiul până la Botanica' })
    ui.rewards.push('xp', 80, { why: 'Misiune: Profetul' })
    ui.rewards.push('respect', 5, { k: 'gop', icon: '👊', who: 'gopnici', why: 'ai câștigat bătaia' })
    ui.prompt('Vorbește cu {y}Tanti Galea{/y}')
    g.police.heat = 20; g.police.level = 2
  }, OBJ)
  await look(page, `${tag} HUD on foot`, { ...HUD, need: [...HUD.need, ...need] }, `${f}-foot`)
  // at the wheel
  await ev(page, () => {
    const g = window.__game, p = g.player, v = g.vehicles.spawn('taxi', p.pos.x + 3, p.pos.z + 3, 0)
    v.keep = true; g.vehicles.enter(v); g.ui.prompt(null)
  })
  await sleep(400)
  await look(page, `${tag} HUD at the wheel`, { ...DRIVE, need: [...HUD.need, ...need, '.hud-br'] }, `${f}-drive`)
  await ev(page, () => { const g = window.__game; g.vehicles.exit(true); g.police.heat = 0; g.police.level = 0; g.ui.tip(null) })
  // a dialogue with choices that carry chips
  await ev(page, () => {
    window.__dlg = window.__game.ui.dialogue({ name: 'Tanti Galea', role: 'vecina de la etajul trei, care știe tot' },
      ['Măi băiete, iar ai parcat taxiul pe iarbă? Să știi că-l chem pe sectoristul Bivol, că el nu iartă pe nimeni.'],
      { choices: [{ text: 'Vă dau o sută de lei și uităm totul, bine?', cost: '100 lei' }, { text: 'Chemați-l, am și eu ceva de vorbit cu el despre gropi.', out: { gop: 2, pol: -5, risk: 'police' } }, { text: 'Pa.' }] })
  })
  await ev(page, async () => { for (let i = 0; i < 200 && !document.querySelector('.dialog .choice'); i++) await new Promise((r) => setTimeout(r, 50)) })
  await look(page, `${tag} dialogue with choices`, DIALOG, `${f}-dialogue`)
  await ev(page, async () => { document.querySelector('.dialog .choice:last-child')?.click(); await Promise.race([window.__dlg, new Promise((r) => setTimeout(r, 3000))]) })
  // every pause tab
  for (const tab of TABS) {
    await ev(page, (tab) => { const m = window.__game.menus; if (m.open?.classList.contains('pause')) m.closePause(); m.showPause(tab) }, tab)
    const spec = tab === 'map' ? { ...PAUSE, need: [...PAUSE.need, '.bigmap canvas'], inside: [...PAUSE.inside, '.bigmap'], tall: [['.bigmap', Math.min(200, h * 0.45)]] } : PAUSE
    await look(page, `${tag} pause: ${tab}`, spec, ['map', 'missions', 'settings'].includes(tab) && `${f}-pause-${tab}`)
  }
  await ev(page, () => window.__game.menus.closePause())
  // the cards and banners
  for (const [name, text, o] of [['LEȘINAT', 'LEȘINATĂ', { gray: true }], ['REȚINUT', 'REȚINUTĂ', { tone: 'blue', gray: true }]]) {
    await ev(page, ([text, o]) => { window.__game.ui.overlay(text, 1e6, o) }, [text, o])
    await look(page, `${tag} ${name} card`, CARD, name === 'LEȘINAT' && `${f}-wasted`)
    await ev(page, () => { document.querySelectorAll('.overlay-msg').forEach((e) => e.remove()); document.getElementById('viewport')?.classList.remove('drained') })
  }
  await ev(page, () => { window.__game.ui.missionBanner('CAPITOLUL 2 · DOSARELE PRIMĂRIEI', 'Sergentul care nu lua mită') })
  await look(page, `${tag} mission banner`, { ...BANNER, need: [...BANNER.need, ...need] }, `${f}-banner`)
  await ev(page, () => document.querySelectorAll('.mbanner').forEach((e) => e.remove()))
  await ev(page, () => { window.__game.ui.bigMessage('MISIUNE ÎNDEPLINITĂ', '+500 lei · +120 XP · gopnicii te respectă un pic mai mult', { secs: 1e6 }) })
  await look(page, `${tag} mission passed`, { ...PASSED, need: [...PASSED.need, ...need] }, `${f}-passed`)
  await ev(page, () => document.querySelectorAll('.bigmsg').forEach((e) => e.remove()))
  await ev(page, () => { const ui = window.__game.ui; ui.toastsEl.innerHTML = ''; ui.rewards.clear() })
}

async function open(ctx, name) {
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`))
  await page.goto(base)
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })
  await quiet(page)
  return page
}
async function inCity(page) {
  await ev(page, async () => { const g = window.__game; await g.debug.startAt('profetul'); g.story.events.t = 1e9 })
  await settle(page)
}

// ---- a phone on its side (and held upright, for the title) --------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: PHONE[0][0], height: PHONE[0][1] }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const page = await open(ctx, 'phone')
  const t = await ev(page, () => ({ touch: !!window.__game.touch, cls: document.documentElement.classList.contains('touch') }))
  check('a phone gets the touch controls', t.touch && t.cls ? [] : [JSON.stringify(t)])
  for (const size of PHONE) await menus(page, size, true)
  if (!only) {
    await page.setViewportSize({ width: UPRIGHT[0], height: UPRIGHT[1] })
    for (const wall of [false, true]) {
      await title(page, wall)
      await look(page, `${UPRIGHT.join('×')} upright: the "turn it round" card over the ${wall ? 'wall' : 'title'}`,
        { need: ['.trotate p'], inside: ['.trotate div', '.trotate p'], fit: ['.trotate p'] }, wall ? '' : `${UPRIGHT.join('x')}-title`)
      await look(page, `${UPRIGHT.join('×')} upright: the ${wall ? 'wall' : 'title'} under it`, wall ? WALL : TITLE)
    }
  }
  await inCity(page)
  for (const size of PHONE) await city(page, size, true)
  await ctx.close()
}

// ---- the desktop must not regress ---------------------------------------------------------------------
if (!only) {
  const ctx = await browser.newContext({ viewport: { width: DESK[0], height: DESK[1] } })
  const page = await open(ctx, 'desktop')
  await menus(page, DESK, false)
  await inCity(page)
  await city(page, DESK, false)
  await ctx.close()
}

check('no errors in the console', errors)
console.log(`\n${passed} passed, ${failed} failed  (${Math.round((Date.now() - t0) / 1000)} s)`)
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
