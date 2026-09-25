// Dev tool: exercises the street systems (talking to people, respect, the crew, gopnik benches,
// shakedowns, group fights, the crowd's habits) in headless Chromium and reports pass/fail.
// usage: node tools/street.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5197, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 400)) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul') // Vitalik the pațan: the gopniks already know him (40)
  g.autoTalk = true
  g.renderer.tod.set(13)
  g.story.events.t = 1e9 // no random street events in the middle of a test
  // helpers shared by every check
  const T = window.__T = {
    g,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    // stand 1.5 m from an NPC, facing it
    faceUp(n, d = 1.5) {
      const a = Math.atan2(g.player.pos.x - n.pos.x, g.player.pos.z - n.pos.z) || 0.7
      const x = n.pos.x + Math.sin(a) * d, z = n.pos.z + Math.cos(a) * d
      T.place(x, z, Math.atan2(n.pos.x - x, n.pos.z - z))
    },
    async spot(kind, pick = 0) {
      const s = g.ambient.spots.filter((q) => q.archetype === kind)[pick]
      if (!s) return null
      T.place(s.x + 20, s.z + 1)
      g.ambient.t = 0
      await T.until(() => s.npcs, 60)
      return s
    },
    rnd(v) { T.realRandom ||= Math.random; Math.random = () => v },
    unrnd() { if (T.realRandom) Math.random = T.realRandom },
    civ(x, z, spec) { const n = g.peds.spawn(x, z, spec || { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' }); n.state = 'idle'; n.path = []; return n },
    lines: [],
  }
  const od = g.ui.dialogue.bind(g.ui)
  g.ui.dialogue = (sp, L, o) => { T.lines.push(`${sp?.name}: ${L.map((l) => (typeof l === 'string' ? l : l.text)).join(' | ')}`); return od(sp, L, o) }
})
await page.waitForTimeout(500)

// ---- respect: tiers, events, save round trip, old saves ------------------------------------------
let r = await ev(() => {
  const g = window.__game, pr = g.progress
  const start = { ...pr.respect }
  let evt = null
  const off = g.events.on('respect', (e) => { evt = e })
  pr.respect.bab = 10
  pr.addRespect('bab', 6)
  off?.()
  pr.respect.pol = 33
  const s = pr.serialize()
  const copy = JSON.parse(JSON.stringify(s))
  pr.load(copy)
  const back = { ...pr.respect }
  delete copy.respect
  pr.load(copy)
  const old = { ...pr.respect }
  pr.respect = { ...back }
  return { start, evt, back, old, tier: pr.tierName('gop') }
})
check('patan starts known to the gopniks', r.start?.gop === 40 && r.tier === 'De-al nostru', JSON.stringify(r.start))
check('crossing a tier fires a respect event', r.evt?.k === 'bab' && r.evt?.tier === 1, JSON.stringify(r.evt))
check('respect survives save/load', r.back?.pol === 33 && r.back?.bab === 16, JSON.stringify(r.back))
check('an old save gets starting respect', r.old?.gop === 40 && r.old?.pol === 0, JSON.stringify(r.old))

// ---- gopnik benches -------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g
  const s = await T.spot('gopnik', 0)
  if (!s) return { none: true }
  return { hangouts: g.ambient.hangouts, n: s.npcs.length, arch: [...new Set(s.npcs.map((n) => n.archetype))], states: s.npcs.map((n) => n.state), tough: s.npcs.every((n) => n.personality === 'tough') }
})
check('gopnik benches in the courtyards', r.hangouts >= 5 && r.n >= 3 && r.arch?.join() === 'gopnik' && r.tough && r.states.includes('sit') && r.states.includes('squat'), JSON.stringify(r))

// ---- talking to a gopnik: the prompt, a chat, seeds ----------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  const s = g.ambient.spots.filter((q) => q.archetype === 'gopnik')[0]
  const n = s.npcs.find((m) => m.state === 'squat')
  T.faceUp(n)
  await T.until(() => g.street.cand === n, 20)
  await T.frames(2)
  const prompt = document.querySelector('.prompt')?.textContent || ''
  pr.respect.gop = 20
  const g0 = pr.respect.gop, lei0 = pr.lei
  g.autoChoices = [0, 1, 4]
  await g.street.talk(n)
  return { cand: g.street.cand === n || true, prompt, dGop: pr.respect.gop - g0, dLei: pr.lei - lei0, back: n.state }
})
check('E-prompt on a gopnik you face', /Vorbește cu gopnicul/.test(r.prompt), r.prompt)
check('chat + seeds: +6 respect, −5 lei, back on his heels', r.dGop === 6 && r.dLei === -5 && r.back === 'squat', JSON.stringify(r))

// ---- recruiting needs respect -------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  const s = g.ambient.spots.filter((q) => q.archetype === 'gopnik')[0]
  const n = s.npcs.find((m) => m.state === 'squat')
  pr.respect.gop = 20
  let menu = null
  const od = g.ui.dialogue
  g.ui.dialogue = (sp, L, o) => { if (o?.choices && !menu) menu = o.choices.map((c) => ({ t: c.text, d: !!c.disabled })); return od(sp, L, o) }
  g.autoChoices = [4]
  await g.street.talk(n)
  g.ui.dialogue = od
  const locked = menu?.[2]?.d
  pr.respect.gop = 45
  const lei0 = pr.lei
  g.autoChoices = [2]
  await g.street.talk(n)
  return { locked, crew: g.crew.list.length, dLei: pr.lei - lei0, left: !s.npcs.includes(n), state: n.state, ally: n.ally }
})
check('recruit locked below 40 respect', r.locked === true, JSON.stringify(r))
check('recruit at 40+: joins the crew for 30 lei', r.crew === 1 && r.dLei === -30 && r.left && r.state === 'follow' && r.ally, JSON.stringify(r))

// ---- the crew follows you around a corner ------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  const n = g.crew.list[0]
  // walk 18 m one way, then 12 m at a right angle
  for (const [ang, steps] of [[p.char.heading, 18], [p.char.heading + Math.PI / 2, 12]]) {
    for (let i = 0; i < steps; i++) { const x = p.pos.x + Math.sin(ang), z = p.pos.z + Math.cos(ang); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ang); await T.frames(1) }
  }
  await T.until(() => Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 4, 80)
  return { d: +Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z).toFixed(1), state: n.state }
})
check('the crew keeps up', r.d < 4 && r.state === 'follow', JSON.stringify(r))

// ---- the crew defends you ------------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  const n = g.crew.list[0]
  const h = p.char.heading
  const foe = g.peds.spawn(p.pos.x + Math.sin(h) * 4, p.pos.z + Math.cos(h) * 4, null, { personality: 'tough' })
  foe.hp = foe.maxHp = 30
  foe.hostile = true; foe.state = 'fight'; foe.target = p
  g.cheats = { ...(g.cheats || {}), god: true }
  const engaged = await T.until(() => n.state === 'fight' && n.target === foe, 40)
  const down = await T.until(() => foe.char.ko && foe.hp <= 0, 400)
  const back = await T.until(() => n.state === 'follow', 40)
  g.cheats.god = false
  return { engaged, down, back, foeHp: Math.round(foe.hp) }
})
check('the crew jumps into your fight', r.engaged && r.down && r.back, JSON.stringify(r))

// ---- the crew rides with you -----------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  const n = g.crew.list[0]
  const v = g.vehicles.spawn('logan', p.pos.x + Math.cos(p.char.heading) * 4, p.pos.z - Math.sin(p.char.heading) * 4, p.char.heading)
  v.keep = true
  g.vehicles.enter(v)
  const rode = await T.until(() => n.riding === v, 80)
  g.vehicles.exit(true)
  await T.frames(3)
  const out = !n.riding && n.char.visible && Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z) < 5
  g.vehicles.remove(v)
  return { rode, out, state: n.state }
})
check('the crew gets in your car and out again', r.rode && r.out, JSON.stringify(r))

// ---- talking to your own guy: wait here / come / go home ---------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g
  const n = g.crew.list[0]
  T.faceUp(n)
  g.autoChoices = [0]
  await g.street.talk(n)
  const waiting = n.waiting && n.state === 'idle'
  g.autoChoices = [0]
  await g.street.talk(n)
  const following = !n.waiting && n.state === 'follow'
  return { waiting, following }
})
check('crew orders: wait and follow', r.waiting && r.following, JSON.stringify(r))

// ---- two stars: the crew has never met you ---------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g
  const n = g.crew.list[0]
  g.police.setLevel(2)
  await T.until(() => !g.crew.list.length, 30)
  const res = { crew: g.crew.list.length, inPeds: g.peds.list.includes(n), state: n.state }
  g.police.clear()
  return res
})
check('the crew scatters at two stars', r.crew === 0 && r.inPeds && r.state === 'flee', JSON.stringify(r))

// ---- picking a fight with a whole bench, and winning ---------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const s = g.ambient.spots.filter((q) => q.archetype === 'gopnik')[0]
  await T.until(() => s.npcs && s.npcs.every((m) => m.state !== 'walk'), 120)
  const n = s.npcs.find((m) => m.state === 'squat' || m.state === 'sit')
  T.faceUp(n)
  await T.until(() => g.street.cand === n, 20)
  pr.respect.gop = 20
  g.autoChoices = [3]
  await g.street.talk(n)
  const f = g.life.fights[0]
  const all = f && s.npcs.every((m) => f.members.includes(m) && m.hostile)
  // floor them
  for (const m of s.npcs) m.takeHit(999, p.pos.x, p.pos.z, 3, p)
  const won = await T.until(() => !g.life.fights.length, 30)
  const dGop = pr.respect.gop - 20
  const home = await T.until(() => s.npcs.every((m) => !m.char.ko && (m.state === 'squat' || m.state === 'sit' || m.state === 'phone')), 500)
  return { fight: !!f, all, won, dGop, home, states: s.npcs.map((m) => m.state) }
})
check('provoking a bench starts a group fight', r.fight && r.all, JSON.stringify(r))
check('winning it: +8 respect, back to the bench after', r.won && r.dGop === 8 && r.home, JSON.stringify(r))

// ---- the shakedown when they don't know you ---------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  const s = await T.spot('gopnik', 1)
  pr.respect.gop = 0
  await T.frames(4)
  const lei0 = pr.lei, n0 = T.lines.length
  g.autoChoices = [0]
  T.place(s.x + 6, s.z)
  const said = () => T.lines.slice(n0).some((l) => /zece lei|Taxă de drum/.test(l))
  const started = await T.until(() => g.life.shake || said(), 40)
  const asked = await T.until(said, 250)
  await T.until(() => !g.ui.modalOpen, 60)
  await T.frames(3)
  return { started, done: asked, dLei: pr.lei - lei0, dGop: pr.respect.gop }
})
check('a bench that doesn\'t know you shakes you down (pay 10 lei)', r.started && r.done && r.dLei === -10 && r.dGop === 1, JSON.stringify(r))

// ---- grannies: gossip, the bread errand ------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  let s = null
  for (let k = 0; k < 30 && !s; k++) { const q = g.ambient.spots.filter((x) => x.list[0]?.archetype === 'babushka')[k]; if (q) { T.place(q.x + 6, q.z); g.ambient.t = 0; await T.until(() => q.npcs, 30); s = q } }
  if (!s?.npcs) return { none: true }
  const n = s.npcs[0]
  T.faceUp(n, 1.4)
  await T.until(() => g.street.cand === n, 20)
  pr.respect.bab = 0
  const lei0 = pr.lei
  g.autoChoices = [0, 2]
  await g.street.talk(n)
  const gossip = pr.respect.bab === 2
  const errand = !!g.street.errand && s.keep && pr.lei - lei0 === 10
  g.events.emit('shop:buy', { shop: 'FRANZELUȚA', item: { name: 'Franzelă caldă' } })
  const bought = g.street.errand?.bought
  T.faceUp(n, 1.4)
  await T.until(() => g.street.cand === n, 20)
  g.autoChoices = [0, 4]
  await g.street.talk(n)
  return { gossip, errand, bought, done: !g.street.errand && !s.keep, bab: pr.respect.bab, arch: n.archetype, pers: n.personality }
})
check('bench granny: gossip +2 respect', r.gossip && r.arch === 'babushka' && r.pers === 'babushka', JSON.stringify(r))
check('bench granny: the bread errand', r.errand && r.bought && r.done && r.bab >= 8, JSON.stringify(r))

// ---- passers-by -------------------------------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const h = p.char.heading
  const n = T.civ(p.pos.x + Math.sin(h) * 1.4, p.pos.z + Math.cos(h) * 1.4)
  n.char.lookAtNow(p.pos.x, p.pos.z)
  await T.until(() => g.street.cand === n, 20)
  const xp0 = pr.xp, tips0 = g.street.tips.length
  g.autoChoices = [0, 1, 5]
  await g.street.talk(n)
  const res = { arch: n.archetype, xp: pr.xp - xp0, tips: g.street.tips.length - tips0, blip: g.director.blips().some((b) => b.kind === 'icon' && b.icon === '📍') }
  g.autoChoices = [4]
  await g.street.talk(n)
  res.fled = n.state === 'flee'
  return res
})
check('passer-by: chat, directions pin, provoking scares them off', r.arch === 'civilian' && r.xp >= 5 && r.tips === 1 && r.blip && r.fled, JSON.stringify(r))

// ---- Marcel's quick hands ------------------------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const perk = pr.perk
  pr.perk = { ...perk, pickpocket: true }
  const h = p.char.heading
  const n = T.civ(p.pos.x + Math.sin(h) * 1.4, p.pos.z + Math.cos(h) * 1.4)
  await T.until(() => g.street.cand === n, 20)
  const lei0 = pr.lei
  T.rnd(0.1)
  g.autoChoices = [4]
  await g.street.talk(n)
  T.unrnd()
  pr.perk = perk
  return { gained: pr.lei - lei0 }
})
check('pickpocketing (hoț only)', r.gained >= 8 && r.gained <= 35, JSON.stringify(r))

// ---- a patrol cop: coffee, then an insult ------------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const h = p.char.heading
  const n = g.peds.spawn(p.pos.x + Math.sin(h) * 1.4, p.pos.z + Math.cos(h) * 1.4, window.__CR.CAST.cop, { personality: 'cop', archetype: 'cop' })
  n.state = 'idle'; n.path = []
  await T.until(() => g.street.cand === n, 20)
  pr.respect.pol = 0
  const lei0 = pr.lei
  g.autoChoices = [1, 4]
  await g.street.talk(n)
  const coffee = { dLei: pr.lei - lei0, pol: pr.respect.pol, buff: g.police.coffeeUntil > performance.now() }
  await T.frames(3)
  g.autoChoices = [3]
  await g.street.talk(n)
  const res = { coffee, level: g.police.level, officer: g.police.officers.includes(n) }
  g.police.clear()
  return res
})
check('patrol cop: a coffee buys goodwill', r.coffee?.dLei === -20 && r.coffee?.pol === 4 && r.coffee?.buff, JSON.stringify(r.coffee))
check('patrol cop: an insult gets you a star', r.level >= 1 && r.officer, JSON.stringify(r))

// ---- the market, the card players, the wedding --------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  g.renderer.tod.set(12)
  const out = {}
  for (const [kind, choice, key] of [['vendor', [0, 4], 'vendor'], ['cards', [0, 2], 'cards'], ['wedding', [0, 2], 'wedding']]) {
    const s = await T.spot(kind, 0)
    if (!s?.npcs) { out[key] = 'none'; continue }
    const n = s.npcs[kind === 'wedding' ? 1 : 0]
    T.faceUp(n, 1.3)
    await T.until(() => g.street.cand === n, 20)
    const lei0 = pr.lei, food0 = pr.hunger
    pr.hunger = 0.5
    g.autoChoices = choice
    await g.street.talk(n)
    out[key] = { cand: true, dLei: pr.lei - lei0, fed: pr.hunger > 0.5 }
    pr.hunger = food0
  }
  return out
})
check('market vendor sells tomatoes', r.vendor?.dLei === -10 && r.vendor?.fed, JSON.stringify(r.vendor))
check('card players take (or pay) your 20 lei', r.cards?.dLei === -20 || r.cards?.dLei === 20, JSON.stringify(r.cards))
check('the wedding pays you for a toast', r.wedding?.dLei === 20, JSON.stringify(r.wedding))

// ---- the crowd: pair chats, filming a fight, bumping a gopnik ----------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  const h = p.char.heading
  const x = p.pos.x + Math.sin(h) * 8, z = p.pos.z + Math.cos(h) * 8
  const a = T.civ(x, z), b = T.civ(x + 1.2, z)
  for (const n of [a, b]) { n.state = 'walk'; n.path = [{ x: x + 30, z }]; n.chatCD = 0 }
  const others = g.peds.list.filter((n) => n !== a && n !== b)
  for (const n of others) n.chatCD = performance.now() + 1e7
  T.rnd(0.1)
  g.life.startChat()
  T.unrnd()
  const chatting = a.chat && a.state === 'talk' && b.state === 'talk'
  const over = await T.until(() => !a.chat && a.state === 'walk', 200)
  // filming
  const fx = p.pos.x, fz = p.pos.z
  for (const n of g.life.filmers) { n.filmT = 0 }
  await T.frames(2)
  const crowd = [0, 1, 2, 3, 4, 5].map((k) => T.civ(fx + Math.cos(k) * 20, fz + Math.sin(k) * 20))
  for (const n of crowd) n.state = 'walk'
  T.rnd(0.1)
  g.life.film({ x: fx, z: fz })
  T.unrnd()
  const filming = g.life.filmers.filter((n) => n.state === 'phone').length
  // bumping a gopnik who doesn't know you
  g.progress.respect.gop = 0
  const gop = g.peds.spawn(p.pos.x + 0.5, p.pos.z, { ...window.__CR.CAST.gopnik2 })
  T.rnd(0.1)
  g.life.bump(gop)
  T.unrnd()
  const bumpFight = g.life.fights.some((f) => f.members.includes(gop)) && gop.state === 'fight'
  for (const f of g.life.fights) for (const m of f.members) if (!m.char.ko) m.takeHit(999, p.pos.x, p.pos.z, 3, p)
  await T.until(() => !g.life.fights.length, 20)
  return { chatting, over, filming, bumpFight, gopArch: gop.archetype }
})
check('two neighbours stop for a chat and move on', r.chatting && r.over, JSON.stringify(r))
check('people film a fight on their phones', r.filming >= 1 && r.filming <= 3, JSON.stringify(r))
check('bumping a gopnik who doesn\'t know you starts a fight', r.bumpFight && r.gopArch === 'gopnik', JSON.stringify(r))

// ---- hitting a granny: the grannies and your crew remember ----------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  pr.respect.gop = 50; pr.respect.bab = 30
  const h = p.char.heading
  const lad = g.peds.spawn(p.pos.x - 2, p.pos.z, { ...window.__CR.CAST.gopnik1 })
  g.crew.recruit(lad, 300)
  const baba = g.peds.spawn(p.pos.x + Math.sin(h) * 1.2, p.pos.z + Math.cos(h) * 1.2, { ...window.__CR.CAST.zina })
  baba.takeHit(5, p.pos.x, p.pos.z, 2, p)
  await T.frames(2)
  return { bab: pr.respect.bab, gop: pr.respect.gop, crew: g.crew.list.length, arch: baba.archetype }
})
check('hit a granny: grannies −8, the crew walks off, gopniks −10', r.arch === 'babushka' && r.bab === 22 && r.crew === 0 && r.gop === 40, JSON.stringify(r))

// ---- gamepad in a dialogue menu --------------------------------------------------------------------------------------------------------
r = await ev(async () => {
  const T = window.__T, g = T.g
  g.autoTalk = false
  const btn = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: btn, index: 0, id: 'test pad', mapping: 'standard' }
  const real = navigator.getGamepads.bind(navigator)
  navigator.getGamepads = () => [pad]
  const pr = g.ui.dialogue({ name: 'Test' }, ['x'], { choices: ['unu', 'doi', 'trei'] })
  const tap = async (i) => { btn[i].pressed = true; await new Promise((r) => setTimeout(r, 160)); btn[i].pressed = false; await new Promise((r) => setTimeout(r, 160)) }
  await new Promise((r) => setTimeout(r, 900))
  await tap(13)
  await tap(0)
  const res = await Promise.race([pr, new Promise((r) => setTimeout(() => r('timeout'), 4000))])
  navigator.getGamepads = real
  g.autoTalk = true
  return { res }
})
check('gamepad: d-pad down + A picks the second choice', r.res === 1, JSON.stringify(r))

// ---- the pause screen shows your street standing ----------------------------------------------------------------------------------------
r = await ev(async () => {
  const g = window.__game
  g.menus.showPause('char')
  await new Promise((r) => setTimeout(r, 300))
  const txt = document.querySelector('.pause')?.textContent || ''
  g.menus.closePause()
  return { ok: /Gopnicii te știu/.test(txt) && /Babele te știu/.test(txt) && /Poliția te știe/.test(txt) }
})
check('pause menu shows the three respects', r.ok, JSON.stringify(r))

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
