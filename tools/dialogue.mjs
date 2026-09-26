// Dev tool: the conversation screen. Choices carry chips for what they do, what a pick paid shows
// on the next line, the camera frames the other face above the box and the HUD steps back, then
// everything comes back when the talk ends.
// usage: node tools/dialogue.mjs            (a phone on its side: the box goes right)
//        VIEW=1280x720 node tools/dialogue.mjs (desktop: the box at the bottom)
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5243, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const [VW, VH] = (process.env.VIEW || '640x360').split('x').map(Number)
const page = await browser.newPage({ viewport: { width: VW, height: VH } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 400)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 })

// ---- chips: what a choice says it does -----------------------------------------------------------
let r = await ev(async () => {
  const { choiceChips } = await import('/src/ui/UI.js')
  const t = (o) => choiceChips(o).map(([c, s]) => `${c}:${s}`)
  return {
    lei: t({ cost: '5 lei' }),
    two: t({ cost: '300 lei · −1 ★' }),
    odds: t({ cost: '🗣 45%' }),
    risk: t({ cost: '👊' }),
    lock: t({ cost: '🔒 respect 40' }),
    sell: t({ cost: '+120 lei' }),
    out: t({ out: { lei: -20, xp: 10, gop: 2, pol: -5, chance: 0.45, risk: 'police' } }),
    none: t({ text: 'Pa.' }),
  }
})
check('a price reads as a cost', r.lei?.[0] === 'cost:−5 lei', JSON.stringify(r.lei))
check('two tags in one cost become two chips', r.two?.length === 2 && r.two[0] === 'cost:−300 lei' && r.two[1].startsWith('gain:'), JSON.stringify(r.two))
check('odds read as a gamble', r.odds?.[0] === 'chance:🎲 45%', JSON.stringify(r.odds))
check('a fist reads as a fight', r.risk?.[0] === 'risk:👊 bătaie', JSON.stringify(r.risk))
check('a lock stays a lock', r.lock?.[0]?.startsWith('lock:🔒'), JSON.stringify(r.lock))
check('money coming in reads as a gain', r.sell?.[0] === 'gain:+120 lei', JSON.stringify(r.sell))
check('structured outcomes: lei, XP, respect, odds, risk', JSON.stringify(r.out) === JSON.stringify(['cost:−20 lei', 'xp:+10 XP', 'rep:👊 +2 respect', 'cost:👮 −5 respect', 'chance:🎲 45%', 'risk:★ poliție']), JSON.stringify(r.out))
check('a plain goodbye has no chips', Array.isArray(r.none) && r.none.length === 0, JSON.stringify(r.none))

// ---- a talk with a gopnik on a bench ------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  const T = window.__T = {
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    paid: [], menus: [], seen: [],
  }
  const s = g.ambient.spots.filter((q) => q.archetype === 'gopnik')[0]
  if (!s) return { error: 'no gopnik bench' }
  T.place(s.x + 20, s.z + 1); g.ambient.t = 0
  await T.until(() => s.npcs, 80)
  const n = s.npcs?.[0]
  if (!n) return { error: 'nobody on the bench' }
  const a = Math.atan2(g.player.pos.x - n.pos.x, g.player.pos.z - n.pos.z) || 0.7
  T.place(n.pos.x + Math.sin(a) * 1.6, n.pos.z + Math.cos(a) * 1.6, a + Math.PI)
  await T.frames(10)
  T.n = n
  // record what each box showed as paid, and whether the talk look was on
  const tp = g.ui.takePaid.bind(g.ui)
  g.ui.takePaid = () => { const x = tp(); T.paid.push(x.map((c) => c[1])); return x }
  const od = g.ui.dialogue.bind(g.ui)
  g.ui.dialogue = (sp, L, o) => {
    const p = od(sp, L, o)
    setTimeout(() => T.seen.push({ talking: document.querySelector('#ui').classList.contains('talking'), cam: !!g.cameraRig.talk, portrait: !document.querySelector('.dialog')?.classList.contains('no-portrait') }), 0)
    return p
  }
  g.street.daily = {}
  g.street.mem(n).chatDay = -1
  g.autoTalk = false
  window.__talkDone = false
  g.street.talk(n).then(() => { window.__talkDone = true })
  return { ok: true, who: n.stName }
})
check('found someone to talk to', r?.ok, JSON.stringify(r))

const menu = () => ev(() => [...document.querySelectorAll('.dialog .choice')].map((b) => [...b.querySelectorAll('.chip')].map((c) => c.textContent)))
await page.waitForFunction(() => document.querySelectorAll('.dialog .choice').length > 0, null, { timeout: 180000 }).catch(() => {})
const menu1 = await menu()
check('the first menu tags "Salut, pacani" with its respect', JSON.stringify(menu1?.[0]) === JSON.stringify(['👊 +2 respect']), JSON.stringify(menu1?.[0]))
check('seeds show what they cost and what they bring', JSON.stringify(menu1?.[1]) === JSON.stringify(['−5 lei', '👊 +4 respect']), JSON.stringify(menu1?.[1]))

// mid-talk: where the camera puts the other face
r = await ev(async () => {
  const g = window.__game, T = window.__T
  await T.frames(40)
  const cam = g.cameraRig.cam
  const head = (ch) => { const v = ch.mesh.userData.bones.head.getWorldPosition(ch.mesh.position.clone()); v.y += 0.16; return v }
  const ha = head(T.n.char), hb = head(g.player.char)
  const da = ha.distanceTo(cam.position), db = hb.distanceTo(cam.position)
  const pa = ha.project(cam), pb = hb.project(cam)
  const box = document.querySelector('.dialog .card')?.getBoundingClientRect()
  const H = innerHeight, W = innerWidth
  return { ya: Math.round((1 - pa.y) / 2 * H), xa: Math.round((pa.x + 1) / 2 * W), xb: Math.round((pb.x + 1) / 2 * W), yb: Math.round((1 - pb.y) / 2 * H), boxTop: box ? Math.round(box.top) : null, boxLeft: box ? Math.round(box.left) : null, boxBottom: box ? Math.round(box.bottom) : null, W, H, inFront: pa.z < 1, heroNearer: db < da }
})
check('the dialogue box fits on the screen', r.boxTop >= 0 && r.boxBottom <= r.H, JSON.stringify(r))
check('the other face is on screen, clear of the dialogue box', r.inFront && r.xa > 0 && r.xa < r.W && r.ya > 0 && r.ya < r.H && (r.ya < r.boxTop - 10 || r.xa < r.boxLeft - 10), JSON.stringify(r))
check('the hero does not cover the other face', !r.heroNearer || Math.hypot(r.xa - r.xb, r.ya - r.yb) > r.W * 0.12, JSON.stringify(r))

// pick "Salut, pacani", then say goodbye (the last choice)
await page.waitForTimeout(300)
await page.keyboard.press('Digit1')
await page.waitForFunction(() => document.querySelector('.dialog .paid .chip') || window.__talkDone, null, { timeout: 180000 }).catch(() => {})
const paidNow = await ev(() => [...document.querySelectorAll('.dialog .paid .chip')].map((c) => c.textContent))
await page.waitForFunction(() => document.querySelectorAll('.dialog .choice').length > 0 || window.__talkDone, null, { timeout: 180000 }).catch(() => {})
await page.waitForTimeout(600) // choices take keys a moment after they appear (so the E that ended the line can't pick)
const last = await ev(() => document.querySelectorAll('.dialog .choice').length)
if (last > 0) await page.keyboard.press('Digit' + last)
await page.waitForFunction(() => window.__talkDone, null, { timeout: 180000 }).catch(() => {})
await page.waitForTimeout(700)
r = await ev(async () => {
  const g = window.__game, T = window.__T
  await T.frames(10)
  return { paid: T.paid, seen: T.seen, talking: document.querySelector('#ui').classList.contains('talking'), cam: !!g.cameraRig.talk }
})
check('what the pick paid shows on the next line', paidNow?.includes?.('👊 +2 respect'), JSON.stringify({ paidNow, all: r.paid }))
check('during the talk: HUD steps back, camera on the face, portrait up', r.seen?.length >= 2 && r.seen.every((s) => s.talking && s.cam && s.portrait), JSON.stringify(r.seen))
check('after the talk: HUD and follow camera are back', !r.talking && !r.cam, JSON.stringify({ talking: r.talking, cam: r.cam }))

// ---- a closing pick that pays: the chips rise where the box was ----------------------------------
r = await ev(async () => {
  const g = window.__game, T = window.__T
  g.progress.lei = 500
  g.autoTalk = true
  g.autoChoices = [0]
  await g.ui.dialogue({ name: 'Test', role: 'x' }, ['Na.'], { choices: [{ text: 'Iau.' }] })
  g.progress.addLei(20, '')
  g.progress.addXp(15)
  for (let i = 0; i < 40 && !document.querySelector('.paid-burst'); i++) await new Promise((res) => setTimeout(res, 50))
  const b = document.querySelector('.paid-burst')
  return { burst: b ? [...b.querySelectorAll('.chip')].map((c) => c.textContent) : null }
})
check('a talk that ends on a payout shows it rising', JSON.stringify(r.burst) === JSON.stringify(['+15 XP', '+20 lei']), JSON.stringify(r))

check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
