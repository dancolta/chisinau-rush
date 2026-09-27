// Dev tool: the progression layer in headless Chromium. Achievements unlocking from real game
// actions (a taxi fare, escaping the police at three stars, a pothole, the four districts, the
// frying pan), the pop-up queue (one card at a time, held under dialogues and banners), the reward
// chips staying above the dialogue box, the golden seed packets, the daily streak, the one-time
// explainer cards, near-miss nudges, the HUD's next-reward line, the Progres and Realizări pages,
// the title-screen strip, and save/load (old saves included).
// usage: node tools/achievements.mjs [--shots dir]   (dir: HUD, toast, pages and a phone layout)
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'

const args = process.argv.slice(2)
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
if (shots) fs.mkdirSync(shots, { recursive: true })

// fs.strict off: lets the tool run from a checkout whose node_modules is a symlink; no HMR: an
// edit saved while it runs mustn't reload the page under the checks
const server = await createServer({ server: { port: 5207, strictPort: false, host: '127.0.0.1', fs: { strict: false }, hmr: false }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
let current = '(setup)'
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { const t = m.text().slice(0, 600); if (!errors.includes(t)) console.log(`  !! console.error after "${current}": ${t}`); errors.push(t) } })
page.on('pageerror', (e) => { const t = 'PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 5).join(' | '); console.log(`  !! after "${current}": ${t}`); errors.push(t) })
let failed = 0
const check = (name, ok, info = '') => { current = name; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
// a condition that reads deep into a result (a failed step returns { error } instead)
const ok = (fn) => { try { return !!fn() } catch (e) { return false } }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })

// ================================ the title screen, before any save =================================
let r = await ev(() => document.querySelector('.mm-daily')?.textContent.replace(/\s+/g, ' ') || '')
check('title screen: the daily bonus strip (no save yet: day 1, +50 lei)', /BONUS ZILNIC/.test(r) && /Azi: \+50 lei/.test(r), r)

await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  const goals = g.side.goals
  // every card the stage is handed, in order (wrapped before the story starts so the first ones count)
  const cards = []
  const push = goals.stage.push.bind(goals.stage)
  // (cards play short here unless a check needs their real length: the queue is what's tested)
  goals.stage.push = (c) => { cards.push(`${c.kind}:${c.id || c.title || c.day || ''}`); if (window.__T?.fast) c.dur = 1.5; return push(c) }
  await g.debug.startAt('profetul')
  g.autoTalk = true
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  const T = window.__T = {
    g, goals, cards, fast: true,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { let ok = false; try { ok = fn() } catch (e) { ok = false } if (ok) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    ach: (id) => g.progress.meta?.ach[id]?.n || 0,
    // let every queued card play (they need calm; at ×4 they're quick)
    async drain(n = 900) { return T.until(() => !goals.stage.busy, n) },
  }
})
await page.waitForTimeout(300)

// ================================ a save from before achievements ======================================
r = await ev(async () => {
  const T = window.__T, g = T.g
  await T.until(() => g.progress.meta && !g.progress.meta.fresh, 300)
  const m = g.progress.meta
  return { prolog: T.ach('prolog'), cap1: T.ach('cap1'), cards: T.cards.slice(), login: { ...m.login }, lei: m.lei }
})
check('what was already done counts once, quietly, in one summary card', r.prolog === 1 && r.cap1 === 1 && r.cards?.some((c) => /^summary:Ai deja 2/.test(c)) && !r.cards?.some((c) => c === 'ach:prolog'), JSON.stringify(r))
check('the daily bonus: day 1 of the streak on the first session', r.login?.streak === 1 && r.login?.days === 1 && r.cards?.some((c) => c === 'streak:1'), JSON.stringify(r.login))

// ================================ achievements from real game actions ===================================
// a taxi fare, start to finish (the third one: bronze at three)
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const L = await import('/src/world/CityLayout.js')
  const { taxiFare } = await import('/src/story/missions/common.js')
  await T.drain()
  pr.stats.fares = 2
  const spot = (x, z, ry, self = null) => {
    g.vehicles.clearSpot(x, z, 8)
    const fx = Math.sin(ry), fz = Math.cos(ry)
    let best = null
    for (const s of [0, 4, -4, 7, -7]) {
      const px = x + fx * s, pz = z + fz * s
      let gap = 99
      for (const o of g.vehicles.list) if (o !== self) gap = Math.min(gap, Math.hypot(o.pos.x - px, o.pos.z - pz) - o.def.dims[2] - 2.4)
      if (!best || gap > best.gap) best = { x: px, z: pz, gap }
      if (gap > 2) break
    }
    return best
  }
  const park = (v, x, z, ry) => { const s = spot(x, z, ry, v); v.teleport(s.x, g.physics.groundHeight(s.x, s.z, 3) + 0.3, s.z, ry) }
  if (p.vehicle) g.vehicles.exit(true)
  g.police.clear()
  p.teleport(-150, 0.2, 14, Math.PI / 2)
  const s0 = spot(-146, 5.75, Math.PI / 2)
  const cab = g.vehicles.spawn('taxi', s0.x, s0.z, Math.PI / 2)
  cab.keep = true
  g.vehicles.enter(cab)
  await T.frames(8)
  const from = { x: -120, z: 13.5 }, to = { x: 100, z: 13.5 }
  let res = null
  const lei0 = pr.lei
  g.story.run({ id: 't_fare', activity: true, title: 'Test', silentPass: true, noRetry: true, async script(m) { res = await taxiFare(m, { taxi: cab, name: 'Testul', from, to, toLabel: 'Grădina', patience: 25 }) } })
  await T.until(() => g.story.npcs.some((n) => n.name === 'Testul'), 300)
  park(cab, from.x, 9.25, Math.PI / 2)
  await T.until(() => /Du clientul/.test(g.ui.objective || ''), 900)
  park(cab, to.x - 5, 9.25, Math.PI / 2)
  await T.until(() => res, 1500)
  await T.until(() => !g.story.active, 300)
  g.vehicles.exit(true)
  if (g.vehicles.list.includes(cab)) g.vehicles.remove(cab)
  return { fares: pr.stats.fares, taxi: T.ach('taxi'), card: T.cards.includes('ach:taxi'), fare: res?.total, dLei: pr.lei - lei0 }
})
check('a real taxi fare, the third: 🥉 Taximetrist de 5 stele, +50 lei on top of the fare', r.fares === 3 && r.taxi === 1 && r.card && r.dLei >= (r.fare || 0) + 50, JSON.stringify(r))

// escaping the police at three stars, through the police's own clock
r = await ev(async () => {
  const T = window.__T, g = T.g
  T.place(60, 60)
  g.police.setLevel(3)
  g.police.spotted = true
  await T.frames(2)
  // and gone: half a kilometre away, out of sight
  T.place(-420, 205)
  const gone = await T.until(() => g.police.level === 0, 2500)
  return { gone, escapes: g.progress.meta.c.escapes, escape: T.ach('escape'), faraActe: T.ach('fara_acte'), cards: T.cards.filter((c) => /escape|fara_acte/.test(c)) }
})
check('escaping three stars: 🥉 Prinde-mă dacă poți and „Fără acte"', ok(() => r.gone && r.escapes === 1 && r.escape === 1 && r.faraActe === 1 && r.cards.length === 2), JSON.stringify(r))

// a pothole, with the real repair
r = await ev(() => {
  const T = window.__T, g = T.g, s = g.story
  const h = s.potholes.list.find((q) => !q.fixed)
  s.acts.fixPothole(h)
  return { n: g.progress.potholes.length, gropi: T.ach('gropi'), card: T.cards.includes('ach:gropi') }
})
check('a pothole filled: 🥉 Groapa cu groapă', r.n === 1 && r.gropi === 1 && r.card, JSON.stringify(r))

// all four districts, on foot
r = await ev(async () => {
  const T = window.__T, g = T.g
  const seen = []
  // (on the streets: Centru, Râșcani, Botanica, Gara)
  for (const [x, z] of [[60, 60], [60, -205], [-60, 205], [305, 205]]) {
    T.place(x, z)
    await T.frames(6)
    seen.push(g.progress.meta.districts.slice())
  }
  return { districts: g.progress.meta.districts.slice(), seen: seen.map((s) => s.length), ach: T.ach('districts') }
})
check('every district visited: 🗺️ Turist în orașul tău', ok(() => r.districts.length === 4 && r.ach === 1), JSON.stringify(r))

// Tanti Galea's frying pan, swung at somebody for real
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const q = g.world.places.pman
  T.place(q.x, q.z, 0)
  await T.frames(2)
  if (!pr.weapons.includes('tigaie')) pr.weapons.push('tigaie')
  if (!pr.carry.includes('tigaie')) { if (pr.carry.length >= 4) pr.carry.pop(); pr.carry.push('tigaie') }
  pr.weapon = 'tigaie'; p.setWeapon('tigaie')
  const h = p.char.heading
  const n = g.peds.spawn(p.pos.x + Math.sin(h) * 1.2, p.pos.z + Math.cos(h) * 1.2, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
  n.state = 'idle'; n.path = []; n.hp = n.maxHp = 60
  for (let i = 0; i < 6 && n.hp >= 60; i++) { p.attackCD = 0; p.aimYaw = null; p.attack(); const f0 = g.frame; for (let j = 0; j < 40 && g.frame < f0 + 8; j++) await new Promise((r) => setTimeout(r, 80)) }
  g.peds.remove(n)
  pr.weapon = 'fist'; p.setWeapon('fist')
  g.police.clear()
  return { hit: n.hp < 60, ach: T.ach('tigaie'), card: T.cards.includes('ach:tigaie') }
})
check('a swing of the frying pan: „Tanti Galea ar fi mândră"', r.hit && r.ach === 1 && r.card, JSON.stringify(r))

// a story mission rated three stars (the story's mission:rated event)
r = await ev(() => {
  const T = window.__T, g = T.g
  g.events.emit('mission:rated', { id: 'paine', stars: 2, time: 90 })
  const two = T.ach('stele')
  g.events.emit('mission:rated', { id: 'paine', stars: 3, time: 60 })
  return { two, three: T.ach('stele') }
})
check('three stars on a story mission: „Trei stele, ca la hotel"', r.two === 0 && r.three === 1, JSON.stringify(r))

// ================================ the pop-up queue ======================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress, st = T.goals.stage
  await T.drain()
  // three at once
  pr.stats.ko = 10; pr.stats.races = 1; pr.meta.c.water = 1
  T.goals.check()
  const queued = st.queue.filter((c) => c.kind === 'ach').map((c) => c.id)
  let most = 0
  const shown = new Set()
  for (let i = 0; i < 700 && st.busy; i++) {
    most = Math.max(most, document.querySelectorAll('.gcard:not(.out)').length)
    if (st.cur) shown.add(st.cur.id || st.cur.kind)
    await T.frames(1)
  }
  return { queued, most, shown: [...shown] }
})
check('three achievements at once: one card at a time, all three shown', ok(() => r.queued.length === 3 && r.most === 1 && ['ko', 'race', 'water'].every((id) => r.shown.includes(id))), JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, st = T.goals.stage
  await T.drain()
  T.fast = false
  st.push({ kind: 'explain', icon: '🧪', title: 'TEST', text: 'Un card de test.', foot: '', dur: 3 })
  await T.until(() => st.cur, 200)
  const up = !!document.querySelector('.gcard:not(.held)')
  // a dialogue turns up: the card steps aside and its clock stops
  g.ui.modalOpen = true
  await T.frames(3)
  const t0 = st.cur?.t, held = !!document.querySelector('.gcard.held')
  await T.frames(20)
  const frozen = st.cur && st.cur.t === t0
  g.ui.modalOpen = false
  await T.frames(3)
  const back = !!document.querySelector('.gcard:not(.held)')
  await T.drain()
  // and a card that's waiting doesn't start over a banner
  g.ui.bigMessage('TEST', '', { secs: 2.5 })
  st.push({ kind: 'explain', icon: '🧪', title: 'TEST 2', text: 'Încă unul.', foot: '', dur: 2 })
  let overBanner = false
  for (let i = 0; i < 60 && document.querySelector('.bigmsg'); i++) { if (st.cur && document.querySelector('.bigmsg:not(.out)')) overBanner = true; await T.frames(1) }
  await T.drain()
  T.fast = true
  return { up, held, frozen, back, overBanner }
})
check('a dialogue puts the card on hold (hidden, clock stopped), then it comes back', r.up && r.held && r.frozen && r.back, JSON.stringify(r))
check('a waiting card never starts over a mission-pass banner', r.overBanner === false, JSON.stringify(r))

// the reward chips: they show at once, merge, and never sit on the dialogue box
await page.setViewportSize({ width: 960, height: 540 })
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  await T.frames(4)
  g.ui.rewards.clear()
  pr.addLei(40, 'Test')
  pr.addLei(5, 'Test')
  // (read from the stack itself: in a slow software render a chip's life can fit in a frame or two)
  const merged = g.ui.rewards.queue.filter((c) => c.kind === 'lei').map((c) => `+${c.n} lei`)
  const shown = await T.until(() => g.ui.rewards.live.some((c) => c.kind === 'lei' && c.n === 45), 80)
  g.ui.rewards.clear()
  g.autoTalk = false
  const d = g.ui.dialogue({ name: 'Testul' }, ['O replică lungă, ca să stea deschis dialogul cât timp vin banii, respectul și XP-ul.', 'A doua.'])
  await T.frames(2)
  for (let i = 0; i < 4; i++) { pr.addLei(10 + i * 7, 'Test ' + i); pr.addXp(10 + i, 'Test ' + i); pr.addRespect(i % 2 ? 'bab' : 'gop', 1, 'test') }
  let bad = 0, seen = 0
  for (let i = 0; i < 40; i++) {
    const dlg = document.querySelector('.dialog')
    if (!dlg) break
    const top = (dlg.querySelector('.card') || dlg).getBoundingClientRect().top
    for (const c of document.querySelectorAll('.rw-chip:not(.out):not(.tuck)')) { seen++; if (c.getBoundingClientRect().bottom > top) bad++ }
    await T.frames(1)
  }
  const waiting = g.ui.rewards.queue.length
  for (let i = 0; i < 12 && document.querySelector('.dialog'); i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })); await new Promise((r) => setTimeout(r, 300)) }
  await Promise.race([d, new Promise((r) => setTimeout(r, 8000))])
  g.autoTalk = true
  const drained = await T.until(() => !g.ui.rewards.queue.length, 300)
  return { merged, shown, bad, seen, waiting, drained }
})
check('a fare and its tip in one blink: one chip with the sum', ok(() => r.merged.length === 1 && r.merged[0] === '+45 lei' && r.shown), JSON.stringify(r))
check('reward chips during a dialogue: shown above it only, the rest wait, then all come', r.bad === 0 && r.seen > 0 && r.drained, JSON.stringify(r))
// (back to the small, quick viewport for the logic)
await page.setViewportSize({ width: 480, height: 270 })

// ================================ the golden seed packets ================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress, S = T.goals.seeds
  const spots = S.spots()
  let minGap = 1e9
  for (const a of spots) for (const b of spots) if (a !== b) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z))
  const s = spots.find((q) => !pr.meta.seeds.includes(q.i))
  // land right on it (a teleport): nothing
  T.place(s.x, s.z)
  await T.frames(8)
  const onLanding = pr.meta.seeds.includes(s.i)
  const mesh = !!s.obj
  const blip = g.director.blips().some((b) => b.icon === '🌻' && Math.hypot(b.x - s.x, b.z - s.z) < 1)
  // back to the pavement corner it's hidden behind, then walk up to it
  T.place(s.from.x, s.from.z)
  await T.frames(4)
  const lei0 = pr.lei, a0 = g.side.aura.total
  const L = Math.hypot(s.x - s.from.x, s.z - s.from.z)
  for (let d = 1.2; d <= L + 0.01 && !pr.meta.seeds.includes(s.i); d += 1.2) { const k = Math.min(1, d / L); T.place(s.from.x + (s.x - s.from.x) * k, s.from.z + (s.z - s.from.z) * k); await T.frames(2) }
  T.place(s.x, s.z)
  await T.frames(3)
  return { n: spots.length, minGap: Math.round(minGap), onLanding, mesh, blip, got: pr.meta.seeds.includes(s.i), dLei: pr.lei - lei0, dAura: g.side.aura.total - a0, gone: !s.obj, count: pr.meta.seeds.length, explain: T.cards.includes('explain:SEMINȚE DE AUR') }
})
check('30 golden seed packets, well apart, on the minimap when near', r.n === 30 && r.minGap >= 48 && r.mesh && r.blip, JSON.stringify(r))
check('a packet: not picked up by landing on it, picked up by walking in (+10 lei, +AURA, explained once)', !r.onLanding && r.got && r.gone && r.dLei >= 10 && r.dAura >= 15 && r.count === 1 && r.explain, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress, m = pr.meta
  await T.drain()
  // nine more (the count is what matters): the tenth brings bronze
  for (let i = 0; i < 30 && m.seeds.length < 10; i++) if (!m.seeds.includes(i)) T.goals.found(i)
  return { n: m.seeds.length, seeds: T.ach('seeds'), card: T.cards.includes('ach:seeds') }
})
check('ten packets: 🥉 Semințe de aur', r.n === 10 && r.seeds === 1 && r.card, JSON.stringify(r))

// ================================ the progression story ===================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  await T.drain()
  const n0 = T.cards.filter((c) => /^explain:XP/.test(c)).length
  pr.addXp(5, 'test'); pr.addXp(5, 'test')
  const n1 = T.cards.filter((c) => /^explain:XP/.test(c)).length
  const byTitle = {}
  for (const c of T.cards.filter((c) => c.startsWith('explain:'))) byTitle[c] = (byTitle[c] || 0) + 1
  // a rank: its bonus in lei
  await T.drain()
  const lei0 = pr.lei
  pr.xp = 240
  pr.addXp(20, 'test')
  const rank = pr.rankIdx
  await T.frames(2)
  const dLei = pr.lei - lei0
  // a respect tier: a card that says what it gets you
  pr.respect.bab = 10
  pr.addRespect('bab', 8, 'test')
  const respCard = T.goals.stage.queue.find((c) => c.kind === 'respect') || (T.goals.stage.cur?.kind === 'respect' ? T.goals.stage.cur : null)
  return { n0, n1, byTitle, rank, dLei, resp: respCard && { who: respCard.who, tier: respCard.tierName, text: respCard.text } }
})
check('the XP card explains XP once (and each card only ever once)', ok(() => r.n1 === 1 && Object.values(r.byTitle).every((n) => n === 1)), JSON.stringify(r.byTitle))
check('a new rank pays its bonus (+75 lei for „Băiat de cartier")', r.rank === 1 && r.dLei === 75, JSON.stringify(r))
check('a new respect tier: a card with what it gets you', r.resp?.who === 'babe' && r.resp?.tier === 'Cuminte' && /pont/.test(r.resp?.text || ''), JSON.stringify(r.resp))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress, m = pr.meta
  await T.drain()
  // one fare short of silver
  pr.stats.fares = 14
  for (const k of Object.keys(m.nudged)) if (k.startsWith('taxi')) delete m.nudged[k]
  let text = ''
  for (let i = 0; i < 8 && !/Taximetrist/.test(text); i++) {
    T.goals.nudgeT = 0
    T.goals.nudge()
    text = [...document.querySelectorAll('.sfeed.nudge')].map((e) => e.textContent).join(' | ')
  }
  return { text }
})
check('near-miss nudge: „Încă 1 cursă până la 🥈 Taximetrist de 5 stele (argint)!"', /Încă 1 cursă până la 🥈 Taximetrist de 5 stele \(argint\)!/.test(r.text), r.text)

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  const next = () => ({ cls: document.querySelector('.aura-chip .next')?.className, text: document.querySelector('.aura-chip .next')?.textContent.replace(/\s+/g, ' ').trim() })
  g.side.ui.hintFocus('aura')
  await T.frames(3)
  const aura = next()
  pr.addXp(3, 'test')
  await T.frames(3)
  const xp = next()
  return { aura, xp }
})
check('HUD: the next-reward line (next AURA level, then the next rank on an XP gain)', ok(() => /Nv \d+/.test(r.aura.text) && /încă \d+ AURA/.test(r.aura.text) && /xp/.test(r.xp.cls) && /încă \d+ XP/.test(r.xp.text)), JSON.stringify(r))

// ================================ the daily streak across days ================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress, L = pr.meta.login, goals = T.goals
  await T.drain()
  const today = goals.today()
  const out = {}
  // came back the next day (the streak's own achievement tiers may pay on top: counted apart)
  L.day = today - 1; L.streak = 3
  let lei0 = pr.lei, a0 = g.side.aura.total
  const { ACHIEVEMENTS } = await import('/src/data/goals.js')
  const def = ACHIEVEMENTS.find((a) => a.id === 'streak')
  const t0 = T.ach('streak')
  goals.checkLogin()
  let extra = 0
  for (let t = t0; t < T.ach('streak'); t++) extra += def.tiers[t][1].lei
  out.next = { streak: L.streak, dLei: pr.lei - lei0 - extra, dAura: g.side.aura.total - a0 }
  // the same day again: nothing
  lei0 = pr.lei
  goals.checkLogin()
  out.again = pr.lei - lei0
  // missed a day: back to day one
  L.day = today - 3
  goals.checkLogin()
  out.missed = L.streak
  // day seven: mama's parcel, and the gold tier
  L.day = today - 1; L.streak = 6
  pr.hunger = 0.2
  goals.checkLogin()
  out.seven = { streak: L.streak, hunger: pr.hunger, best: L.best, gold: T.ach('streak'), papuci: pr.clothes.includes('rz_papuci') }
  return out
})
check('streak: the next day pays day 4 (+150 lei, +75 AURA), the same day nothing', ok(() => r.next.streak === 4 && r.next.dLei === 150 && r.next.dAura === 75 && r.again === 0), JSON.stringify(r))
check('streak: a missed day starts it over', r.missed === 1, JSON.stringify(r))
check('streak: day 7, mama\'s parcel (fed) and 🥇 Vecinul de la geam with its slippers', ok(() => r.seven.streak === 7 && r.seven.hunger === 1 && r.seven.best >= 7 && r.seven.gold === 3 && r.seven.papuci), JSON.stringify(r.seven))

// ================================ save / load ================================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  await T.drain()
  pr.save()
  const disk = JSON.parse(localStorage.getItem('cr3d-save'))
  const before = JSON.parse(JSON.stringify(pr.meta))
  pr.load(JSON.parse(JSON.stringify(disk)))
  await T.frames(3)
  const m = pr.meta
  const same = JSON.stringify(m.ach) === JSON.stringify(before.ach) && m.seeds.join() === before.seeds.join() && m.login.streak === before.login.streak && m.login.day === before.login.day && m.districts.length === 4
  const loginAgain = m.login.days === before.login.days
  // an old save, from before any of this
  const old = JSON.parse(JSON.stringify(disk))
  delete old.meta
  pr.load(old)
  await T.until(() => pr.meta && !pr.meta.fresh, 100)
  const o = pr.meta
  const oldOk = { v: old.v, taxi: o.ach.taxi?.n, prolog: o.ach.prolog?.n, streak: o.login.streak, seeds: o.seeds.length, loads: typeof window.__game.progress.constructor.hasSave() }
  // back to the real one
  pr.load(JSON.parse(JSON.stringify(disk)))
  await T.frames(3)
  return { v: disk.v, hasMeta: !!disk.meta, same, loginAgain, oldOk, back: pr.meta.seeds.length === before.seeds.length }
})
check('save/load keeps achievements, the streak, seed packets and districts (save v3)', r.v === 3 && r.hasMeta && r.same && r.loginAgain && r.back, JSON.stringify(r))
check('an old save without them loads: counted once, streak day 1, no packets yet', ok(() => r.oldOk.v === 3 && r.oldOk.taxi >= 1 && r.oldOk.prolog === 1 && r.oldOk.streak === 1 && r.oldOk.seeds === 0), JSON.stringify(r.oldOk))

// ================================ the pause pages =================================================================
r = await ev(async () => {
  const T = window.__T, g = T.g
  await T.drain()
  g.menus.showPause('progress')
  await new Promise((r) => setTimeout(r, 300))
  const txt = document.querySelector('.pause .body')?.textContent.replace(/\s+/g, ' ') || ''
  const prog = { cards: document.querySelectorAll('.pg-card').length, words: ['Cum crești', 'Cariera', 'AURA', 'Respect', 'Lei', 'CE-ȚI ADUCE FIECARE TREAPTĂ', 'ZI DE ZI', 'Bonus zilnic', 'Semințe de aur', 'RANGURILE', 'TOTALURI', 'Tupeu', 'Simț civic'].filter((w) => !txt.includes(w)) }
  const tab = [...document.querySelectorAll('.pause .tabs button')].map((b) => b.textContent)
  ;[...document.querySelectorAll('.pause .tabs button')].find((b) => b.dataset.t === 'ach').click()
  await new Promise((r) => setTimeout(r, 300))
  const { ACHIEVEMENTS, ACH_TOTAL } = await import('/src/data/goals.js')
  const cards = [...document.querySelectorAll('.ach-card')]
  const ach = {
    total: ACH_TOTAL, cards: cards.length, defs: ACHIEVEMENTS.length, secret: document.querySelectorAll('.ach-card.secret').length,
    dated: cards.filter((c) => /\d{2}\.\d{2}\.\d{4}/.test(c.textContent)).length, bars: document.querySelectorAll('.ach-card .gbar').length,
    head: document.querySelector('.ach-head')?.textContent.replace(/\s+/g, ' '),
  }
  g.menus.closePause()
  return { prog, tab, ach }
})
check('pause: Progres and Realizări tabs', ok(() => r.tab.includes('Progres') && r.tab.includes('Realizări')), JSON.stringify(r.tab))
check('the Progres page: the four currencies, respect tiers, the daily loop, ranks, totals', ok(() => r.prog.cards === 4 && !r.prog.words.length), JSON.stringify(r.prog))
check('the Realizări page: every achievement, hidden ones as ???, dates, progress bars', ok(() => r.ach.cards === r.ach.defs && r.ach.secret >= 1 && r.ach.dated >= 10 && r.ach.bars >= 10 && new RegExp(`REALIZĂRI \\d+/${r.ach.total}`).test(r.ach.head)), JSON.stringify(r.ach))

r = await ev(async () => {
  const { GoalsUI } = await import('/src/side/GoalsUI.js')
  const g = window.__game, today = g.side.goals.today()
  const strip = (login) => { const d = document.createElement('div'); d.innerHTML = GoalsUI.titleStrip({ v: 3, meta: { login } }); return d.textContent.replace(/\s+/g, ' ') }
  return {
    taken: strip({ day: today, streak: 3 }), waiting: strip({ day: today - 1, streak: 3 }), lost: strip({ day: today - 4, streak: 5 }),
  }
})
check('title screen strip: taken today / waiting (day 4) / lost (starts over)', /luat/.test(r.taken) && /Ziua 4 te așteaptă/.test(r.waiting) && /Ai ratat o zi/.test(r.lost), JSON.stringify(r))

// ================================ screenshots =====================================================================
if (shots) {
  const shot = async (name) => { await page.screenshot({ path: `${shots}/${name}.png`, timeout: 180000 }); console.log(`  saved ${shots}/${name}.png`) }
  await page.setViewportSize({ width: 960, height: 540 })
  await ev(async () => {
    const T = window.__T, g = T.g
    await T.drain()
    T.place(g.world.places.pman.x + 12, g.world.places.pman.z + 26, Math.PI)
    g.renderer.tod.set(15)
    g.ui.rewards.clear()
    g.side.ui.hintFocus('aura')
    await T.frames(6)
    // (frozen: at a frame a second the chips would come and go between two captures)
    g.ui.rewards.freeze(true)
    g.progress.addXp(25, 'Cursă de taxi')
    g.progress.addLei(38, 'Cursă 31 lei + bacșiș 7')
    g.progress.addRespect('gop', 2, 'semințe')
    await T.until(() => g.ui.rewards.live.length >= 3, 40)
    await new Promise((r) => setTimeout(r, 600))
  })
  await shot('hud')
  await ev(() => window.__game.ui.rewards.freeze(false))
  await ev(async () => {
    const T = window.__T, g = T.g, st = T.goals.stage
    // (whatever was still waiting goes: the silver taxi card is the one in the picture)
    st.clear()
    st.freeze(true)
    g.progress.stats.fares = 15
    T.goals.check()
    await T.until(() => st.cur?.id === 'taxi', 400)
    await T.frames(2)
  })
  await shot('toast')
  await ev(async () => {
    const T = window.__T, st = T.goals.stage
    st.freeze(false); st.dismiss(); st.clear()
    const { STREAK } = await import('/src/data/goals.js')
    st.freeze(true)
    st.push({ kind: 'streak', day: 3, week: 1, reward: STREAK[2], roll: true, tall: true, dur: 6, next: 'Revino mâine: <b>+150 lei · +75 AURA</b>. O zi ratată și o iei de la capăt.' })
    await T.until(() => st.cur?.kind === 'streak', 400)
    st.cur.t = 1; st.roll(st.cur)
  })
  await shot('streak-card')
  await ev(async () => { const T = window.__T, st = T.goals.stage; st.freeze(false); st.dismiss(); st.clear(); window.__game.menus.showPause('progress'); await new Promise((r) => setTimeout(r, 400)) })
  await shot('progress')
  await ev(async () => { const g = window.__game; g.menus.closePause(); g.menus.showPause('ach'); await new Promise((r) => setTimeout(r, 400)) })
  await shot('achievements')
  // a phone on its side, with the touch controls
  await ev(() => window.__game.menus.closePause())
  await page.setViewportSize({ width: 844, height: 390 })
  await ev(async () => {
    const T = window.__T, g = T.g
    const { Touch } = await import('/src/ui/Touch.js')
    if (!g.touch) g.touch = new Touch(g)
    g.touch.rotate?.remove()
    await T.frames(6)
    g.progress.addLei(50, 'Bonus')
    const st = T.goals.stage
    st.clear()
    st.freeze(true)
    g.progress.stats.fares = 40
    T.goals.check()
    await T.until(() => st.cur?.id === 'taxi', 400)
    await T.frames(3)
  })
  await shot('phone-hud')
  await ev(async () => { const T = window.__T, st = T.goals.stage; st.freeze(false); st.dismiss(); st.clear(); window.__game.menus.showPause('progress'); await new Promise((r) => setTimeout(r, 400)) })
  await shot('phone-progress')
  await ev(async () => { const g = window.__game; g.menus.closePause(); g.menus.showPause('ach'); await new Promise((r) => setTimeout(r, 400)) })
  await shot('phone-achievements')
  await ev(() => window.__game.menus.closePause())
}

check('no console errors', errors.length === 0, errors.length ? `${errors.length}` : '')
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed || errors.length ? 1 : 0)
