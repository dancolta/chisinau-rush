// Dev tool: the side-content layer in headless Chromium: AURA gains/losses and streaks, level-ups
// and their unlocks, car stunt scoring, daily challenges, save/load, and every random street
// event (start, win, lose/abandon, clean up) plus the rules for when events may happen.
// usage: node tools/aura.mjs [--only core,stunts,daily,events,rules]
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(k)

const server = await createServer({ server: { port: 5201, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
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
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.autoTalk = true
  g.renderer.tod.set(13)
  g.story.events.t = 1e9 // the scheduler gets its own checks at the end
  const T = window.__T = {
    g,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    // wait for queued rewards (they need a calm second)
    async flushed(n = 400) { return T.until(() => !g.side.queue.length, n) },
    pops: () => [...document.querySelectorAll('.apop')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    // a car for the driving events, parked on the boulevard
    car() {
      const p = g.player
      if (p.vehicle && !p.passenger) return p.vehicle
      const x = p.pos.x, z = 6
      T.place(x, 14)
      const v = g.vehicles.spawn('logan', x, z, Math.PI / 2)
      v.keep = true
      g.vehicles.enter(v)
      return v
    },
  }
})
await page.waitForTimeout(300)

// ================================ AURA ===========================================================
if (want('core')) {
  let r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura
    const t0 = a.total
    const v1 = a.gain(50, 'Test cool')
    const pops = T.pops()
    await T.frames(2)
    const chip = document.querySelector('.aura-chip')?.textContent || ''
    return { d: a.total - t0, v1, pops, chip: chip.replace(/\s+/g, ' ') }
  })
  check('aura: +50 adds up and pops on screen', r.d === 50 && r.pops.some((p) => /\+50/.test(p) && /Test cool/.test(p)) && /AURA/.test(r.chip), JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura
    a.streak = 0
    const got = [a.gain(20, 'unu'), a.gain(20, 'doi'), a.gain(20, 'trei'), a.gain(20, 'patru')]
    const mult = a.mult
    const tagged = T.pops().some((p) => /×1,5|×1,75/.test(p))
    const chip = document.querySelector('.aura-chip .streak')
    a.s.total = a.floor + 100
    const t0 = a.total
    const lost = a.lose(15, 'Test cringe')
    const cringe = T.pops().some((p) => /−15/.test(p) && /CRINGE/.test(p))
    return { got, mult, tagged, lost, d: a.total - t0, streak: a.streak, cringe }
  })
  check('aura: chained gains build a streak (×1.25, ×1.5 …)', r.got.join() === '20,25,30,35' && r.mult === 2 && r.tagged, JSON.stringify(r))
  check('aura: cringe costs aura, breaks the streak, pops red', r.lost === 15 && r.d === -15 && r.streak === 0 && r.cringe, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura
    a.streak = 0
    const same = [a.gain(40, 'farm', { key: 'farm', raw: true }), a.gain(40, 'farm', { key: 'farm', raw: true }), a.gain(40, 'farm', { key: 'farm', raw: true })]
    // the floor: a level is never lost
    const lvl = a.level, total = a.total
    a.lose(1e6, 'cringe uriaș')
    return { same, lvl, after: a.level, floorOk: a.total >= 0 && a.total <= total }
  })
  check('aura: the same thing again pays less; losses never cost a level', r.same[0] === 40 && r.same[1] === 32 && r.same[2] === 24 && r.after === r.lvl && r.floorOk, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura, ev = g.events
    const mk = (archetype, personality) => ({ archetype, personality, char: { ko: true }, pos: { x: 0, z: 0 } })
    const d = (fn) => { a.streak = 0; const t0 = a.total; fn(); return a.total - t0 }
    const res = {
      koGop: d(() => ev.emit('npc:ko', mk('gopnik', 'tough'))),
      koGranny: 0,
      fight: d(() => ev.emit('street:fight', { how: 'won', n: 3 })),
      escape: d(() => ev.emit('police:escape', { level: 2 })),
      talked: d(() => ev.emit('police:deal', { how: 'talk' })),
      fare: d(() => ev.emit('taxi:fare', { total: 40, crashes: 0 })),
    }
    a.s.total = a.floor + 100
    res.koGranny = d(() => ev.emit('npc:ko', mk('babushka', 'babushka')))
    res.bribe = d(() => ev.emit('police:deal', { how: 'bribe' }))
    const trolley = { def: { trolley: true } }
    res.trolley = d(() => { ev.emit('player:crash', { force: 30, other: trolley }); ev.emit('player:crash', { force: 30, other: trolley }) })
    return res
  })
  check('aura from the street: KO, fight, escape, sweet talk, a clean fare', r.koGop === 15 && r.fight === 54 && r.escape === 50 && r.talked === 40 && r.fare === 25, JSON.stringify(r))
  check('cringe from the street: a KO\'d granny, a bribe, the trolleybus (once)', r.koGranny === -40 && r.bribe === -10 && r.trolley === -20, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura, pr = g.progress
    g.police.clear()
    const granny = g.peds.spawn(g.player.pos.x + 1, g.player.pos.z, { ...window.__CR.CAST.zina }, { personality: 'babushka' })
    granny.archetype = 'babushka'
    g.events.emit('player:hit', { by: granny, dmg: 4 })
    a.s.total = a.floor + 100
    const t0 = a.total
    pr.hurt(1000)
    const d = a.total - t0, pops = T.pops()
    await T.until(() => g.director.handlingDown, 60)
    await T.until(() => !g.director.handlingDown, 600)
    g.peds.remove(granny)
    pr.hp = pr.maxHp
    return { d, pops }
  })
  check('knocked out by a granny: −60 AURA', r.d === -60 && r.pops.some((p) => /−60/.test(p) && /bunică/.test(p)), JSON.stringify(r))

  // ---- levels ----
  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura, pr = g.progress
    await T.flushed()
    a.s.total = 0; a.s.level = 1; a.s.rewarded = 1
    let evt = null
    const off = g.events.on('side:levelup', (e) => { evt = e })
    const lei0 = pr.lei, w0 = pr.weapons.includes('pistol')
    pr.weapons = pr.weapons.filter((k) => k !== 'pistol'); pr.carry = pr.carry.filter((k) => k !== 'pistol')
    pr.clothes = pr.clothes.filter((c) => !c.startsWith('aura_'))
    // held back while a dialogue is open
    g.ui.modalOpen = true
    a.setLevel(4)
    await T.frames(40)
    const heldBack = g.side.queue.length > 0 && !document.querySelector('.lvlup')
    g.ui.modalOpen = false
    // (frames are slow here: keep the card up until it's been read)
    g.side.ui.freeze(true)
    await T.flushed()
    await T.until(() => document.querySelector('.lvlup'), 20)
    const card = document.querySelector('.lvlup')?.textContent.replace(/\s+/g, ' ') || ''
    document.querySelector('.lvlup')?.remove()
    g.side.ui.freeze(false)
    off()
    return { evt, level: a.level, rewarded: a.s.rewarded, heldBack, dLei: pr.lei - lei0, clothes: pr.clothes.filter((c) => c.startsWith('aura_')), pistol: pr.weapons.includes('pistol'), card }
  })
  check('level-up waits for a calm moment (not during a dialogue)', r.heldBack, JSON.stringify(r))
  check('level 4: lei, NPC shirt, Milano glasses, water pistol, the card', r.level === 4 && r.rewarded === 4 && r.evt?.to === 4 && r.dLei === 70 + 90 + 110 && r.clothes.includes('aura_npc') && r.clothes.includes('aura_milano') && r.pistol && /NIVEL NOU/.test(r.card) && /Venit de-afară/.test(r.card), JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    // the aura clothes are wearable like any others
    const item = window.__CR && g.wardrobe.listFor('wardrobe', null, 'top').find((i) => i.id === 'aura_npc')
    if (item) g.wardrobe.wear(item.item)
    await T.frames(2)
    return { listed: !!item, top: pr.outfit.top, color: g.player.char.spec.top?.color }
  })
  check('the NPC shirt is in the wardrobe and wearable', r.listed && r.top === 'aura_npc' && r.color === 0x8a8c90, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, a = g.side.aura, pr = g.progress
    await T.frames(80)
    // perks: the kiosk's first thing of the day is on the house (level 5)
    a.setLevel(5)
    await T.flushed()
    const k = g.world.kiosks[0]
    const lei0 = pr.lei
    g.events.emit('shop:buy', { shop: k.label, item: { name: 'Plăcintă', price: 12 } })
    const first = pr.lei - lei0
    g.events.emit('shop:buy', { shop: k.label, item: { name: 'Plăcintă', price: 12 } })
    const second = pr.lei - lei0 - first
    return { level: a.level, perk: g.side.perk('kiosk'), first, second }
  })
  check('level 5 perk: the first kiosk buy of the day is refunded', r.level === 5 && r.perk && r.first === 12 && r.second === 0, JSON.stringify(r))
}

// ================================ STUNTS =============================================================
if (want('stunts')) {
  let r = await ev(async () => {
    const T = window.__T, g = T.g, st = g.side.stunts, a = g.side.aura
    // a fake car far off the roads: sliding sideways at 16 m/s for two seconds
    const v = { speed: 16, lateral: 6, heading: 0, pos: { x: 2000, y: 0, z: 2000 }, def: { dims: [0.98, 0.62, 2.2] }, broken: false, airborne: false }
    st.combo = null; st.reset()
    for (let i = 0; i < 20; i++) st.sample(v, 0.1)
    const live = st.live
    v.lateral = 0
    for (let i = 0; i < 5; i++) st.sample(v, 0.1)
    const combo = st.combo && { n: st.combo.n, pts: st.combo.pts, mult: st.combo.mult, tricks: st.combo.tricks.slice() }
    // and a near miss: a moving car passing a hand's width away
    const o = { speed: 12, heading: Math.PI, pos: { x: 2000 + 2.2, y: 0, z: 2000 }, def: { dims: [0.98, 0.62, 2.2] }, disposed: false }
    v.pos = { x: 2000, y: 0, z: 2000 }
    g.vehicles.list.push(o)
    st.sample(v, 0.05)
    o.pos.z = 2000 - 9
    st.sample(v, 0.05)
    g.vehicles.list.splice(g.vehicles.list.indexOf(o), 1)
    const after = st.combo && { n: st.combo.n, pts: st.combo.pts, mult: st.combo.mult, tricks: st.combo.tricks.slice() }
    const t0 = a.total
    const banked = st.bank()
    const hud = document.querySelector('.stunt')?.textContent.replace(/\s+/g, ' ')
    return { live, combo, after, banked, d: a.total - t0, best: g.side.state.stats.bestCombo, near: g.side.state.stats.nearMiss, hud }
  })
  check('stunts: a 2 s drift scores as one trick', r.live > 200 && r.combo?.n === 1 && r.combo?.tricks[0] === 'DRIFT' && r.combo?.pts > 200, JSON.stringify(r))
  check('stunts: a near miss adds a trick and a step of multiplier', r.after?.n === 2 && r.after?.mult === 2 && /LA UN FIR DE PĂR|LA MUSTAȚĂ/.test(r.after?.tricks.join()), JSON.stringify(r))
  check('stunts: the combo banks as aura (points × mult / 25)', r.banked === Math.round(r.after.pts * 2 / 25) && r.d === r.banked && r.best >= r.banked && r.near >= 1 && /COMBO/.test(r.hud), JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, st = g.side.stunts, a = g.side.aura
    const v = { speed: 16, lateral: 6, heading: 0, pos: { x: 2000, y: 0, z: 2000 }, def: { dims: [0.98, 0.62, 2.2] }, broken: false, airborne: false }
    st.combo = null; st.reset()
    a.s.total = a.floor + 100
    st.trick('DRIFT', 400); st.trick('LA MUSTAȚĂ', 60); st.trick('DRIFT', 300)
    for (let i = 0; i < 10; i++) st.sample(v, 0.1)
    const t0 = a.total
    g.events.emit('player:crash', { force: 30, other: null })
    return { combo: st.combo, d: a.total - t0, hud: document.querySelector('.stunt')?.textContent || '' }
  })
  check('stunts: a crash loses the combo (and a little aura)', r.combo === null && r.d === -10 && /BUȘIT/.test(r.hud), JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, st = g.side.stunts
    // wrong way on the boulevard: heading east on the westbound side
    const v = { speed: 18, lateral: 0, heading: Math.PI / 2, pos: { x: 100, y: 0.16, z: -6 }, def: { dims: [0.98, 0.62, 2.2] }, broken: false, airborne: false }
    st.combo = null; st.reset()
    for (let i = 0; i < 20; i++) st.sample(v, 0.1)
    v.pos.z = 6
    for (let i = 0; i < 6; i++) st.sample(v, 0.1)
    const wrong = st.combo?.tricks.includes('CONTRASENS')
    // airtime, reported by the car itself
    v.airborne = true
    for (let i = 0; i < 8; i++) st.sample(v, 0.1)
    v.airborne = false
    st.sample(v, 0.1)
    const air = st.combo?.tricks.includes('ZBOR')
    st.bank()
    return { wrong, air }
  })
  check('stunts: wrong-way runs and airtime are tricks too', r.wrong && r.air, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player, st = g.side.stunts
    // a real car on the boulevard: flat out, then a handbrake turn
    const v = T.car()
    v.teleport(-150, g.physics.groundHeight(-150, 6, 3) + 0.2, 6, Math.PI / 2)
    await T.frames(3)
    g.input.down.add('KeyW')
    await T.frames(25)
    const speed = Math.abs(v.speed)
    g.input.down.add('KeyD'); g.input.down.add('Space')
    let maxLat = 0, sawDrift = false
    for (let i = 0; i < 30 && !sawDrift; i++) { await T.frames(1); maxLat = Math.max(maxLat, Math.abs(v.lateral || 0)); if (st.driftT > 0 || st.combo) sawDrift = true }
    g.input.down.delete('KeyW'); g.input.down.delete('KeyD'); g.input.down.delete('Space')
    await T.frames(8)
    return { speed: +speed.toFixed(1), maxLat: +maxLat.toFixed(1), sawDrift, best: g.side.state.stats.bestCombo }
  })
  check('stunts: a real handbrake turn at speed registers a drift', r.sawDrift, JSON.stringify(r))
  await ev(() => { const g = window.__game; if (g.player.vehicle) g.vehicles.exit(true) })
}

// ================================ DAILY CHALLENGES ===================================================
if (want('daily')) {
  let r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges
    await T.frames(3)
    const list = ch.list.map((c) => c.id)
    return { list, n: list.length, unlocked: ch.unlocked, hours: ch.hoursLeft }
  })
  check('daily: three challenges once the story lets you out', r.n === 3 && r.unlocked && r.hours > 0 && r.hours <= 24, JSON.stringify(r))

  r = await ev(async () => {
    const g = window.__game, ch = g.side.challenges
    const { challengeDef } = await import('/src/side/Challenges.js')
    const bad = []
    for (let i = 0; i < 80; i++) {
      ch.issue()
      const defs = ch.list.map((c) => challengeDef(c.id))
      const kinds = new Set(defs.map((d) => d.kind))
      if (defs.length !== 3 || kinds.size !== 3 || defs.map((d) => d.tier).join() !== '1,2,3') bad.push(defs.map((d) => d.id).join())
    }
    return { bad: bad.slice(0, 5), n: bad.length }
  })
  check('daily: always one easy, one medium, one hard, never two of a kind', r.n === 0, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges, pr = g.progress, a = g.side.aura
    await T.flushed()
    ch.issue(['ko3', 'fight1', 'escape1'])
    const lei0 = pr.lei
    const mk = () => ({ archetype: 'civilian', personality: 'normal', char: { ko: true }, pos: { x: 0, z: 0 } })
    g.events.emit('npc:ko', mk()); g.events.emit('npc:ko', mk())
    const mid = ch.list[0].n
    g.events.emit('npc:ko', mk())
    const done = ch.list[0].done
    await T.flushed()
    const feed = document.querySelector('.side-feed')?.textContent || ''
    return { mid, done, dLei: pr.lei - lei0, feed: /PROVOCARE ÎNDEPLINITĂ/.test(feed), stats: g.side.state.stats.challenges }
  })
  check('daily: KOs count, the third completes it, 40 lei paid', r.mid === 2 && r.done && r.dLei === 40 && r.feed, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges
    const before = ch.list[1].id
    const ok1 = ch.reroll(1)
    const after = ch.list[1].id
    const ok2 = ch.reroll(2)
    return { before, after, ok1, ok2, left: ch.rerollsLeft }
  })
  check('daily: one free reroll swaps a challenge, the second is refused', r.ok1 && r.before !== r.after && r.ok2 === false && r.left === 0, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges, pr = g.progress
    await T.flushed()
    ch.issue(['talk3', 'fight1', 'escape1'])
    const lei0 = pr.lei
    ch.track('talk', 3)
    g.events.emit('street:fight', { how: 'won', n: 2 })
    g.events.emit('police:escape', { level: 1 })
    const all = ch.list.every((c) => c.done), bonus = ch.d.bonus
    await T.flushed(600)
    return { all, bonus, dLei: pr.lei - lei0, full: g.side.state.stats.fullDays }
  })
  // (the aura they bring may also pay a level on top)
  check('daily: all three bring the day\'s bonus (+200 lei on top)', r.all && r.bonus && r.dLei >= 40 + 80 + 150 + 200 && r.full >= 1, JSON.stringify(r))

  r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges, st = g.side.state
    const day0 = ch.d.day, ids0 = ch.list.map((c) => c.id).join()
    st.clock += 24.5
    await T.frames(3)
    // a night's sleep counts too
    const day1 = ch.d.day
    g.renderer.tod.set(23)
    await T.frames(2)
    const c0 = st.clock
    g.renderer.tod.set(8)
    await T.frames(2)
    return { day0, day1, fresh: ch.list.every((c) => !c.done), ids: ch.list.map((c) => c.id).join() !== ids0 || true, slept: +(st.clock - c0).toFixed(2) }
  })
  check('daily: a new game day brings a new set; sleeping moves the clock', r.day1 === r.day0 + 1 && r.fresh && r.slept > 8.9 && r.slept < 9.2, JSON.stringify(r))
}

// ================================ SAVE / LOAD =============================================================
if (want('core') || want('daily')) {
  const r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress, a = g.side.aura
    await T.flushed()
    const before = JSON.parse(JSON.stringify(pr.side))
    const copy = JSON.parse(JSON.stringify(pr.serialize()))
    pr.load(copy)
    await T.frames(2)
    const s = g.side.state
    const same = s.aura.total === before.aura.total && s.aura.level === before.aura.level && s.aura.rewarded === before.aura.rewarded &&
      JSON.stringify(s.daily.list) === JSON.stringify(before.daily.list) && s.stats.challenges === before.stats.challenges && Math.abs(s.clock - before.clock) < 0.1
    // an old save, from before AURA
    delete copy.side
    pr.load(copy)
    await T.frames(2)
    const old = { total: g.side.state.aura.total, level: g.side.state.aura.level, v: copy.v }
    // and back
    pr.load(JSON.parse(JSON.stringify({ ...copy, side: before })))
    await T.frames(2)
    return { same, old, back: g.side.state.aura.level === before.aura.level }
  })
  check('save/load keeps aura, level, challenges, records (save v3)', r.same && r.back, JSON.stringify(r))
  check('an old save without aura starts at level 1', r.old.total === 0 && r.old.level === 1 && r.old.v === 3, JSON.stringify(r))
}

// ================================ PAUSE MENU =============================================================
if (want('core') || want('daily')) {
  const r = await ev(async () => {
    const T = window.__T, g = T.g, ch = g.side.challenges
    ch.issue(['ko3', 'fight1', 'escape1'])
    g.menus.showPause('aura')
    await new Promise((r) => setTimeout(r, 300))
    const txt = document.querySelector('.pause')?.textContent || ''
    const btn = document.querySelector('.au-rr:not(:disabled)')
    const id0 = ch.list.map((c) => c.id).join()
    btn?.click()
    await new Promise((r) => setTimeout(r, 100))
    const id1 = ch.list.map((c) => c.id).join()
    g.menus.closePause()
    return { ladder: /SCARA AUREI/.test(txt), daily: /PROVOCĂRILE ZILEI/.test(txt), title: /Cunoscut la chioșc|Venit de-afară|NPC de fundal/.test(txt), rerolled: id0 !== id1 }
  })
  check('pause menu: the Aura tab with the ladder, the day\'s challenges and a working reroll', r.ladder && r.daily && r.title && r.rerolled, JSON.stringify(r))
}

// ================================ STREET EVENTS ==========================================================
if (want('events')) {
  await ev(() => {
    const T = window.__T, g = T.g
    // play an event the way a player would: go where the marker says, in or out of a car as asked;
    // the minigames play themselves (g.side.auto). Returns how it ended and what was left behind.
    T.advance = (ctx) => {
      const p = g.player, mk = g.ui.marker
      if (ctx.onFootWanted && p.vehicle && !p.passenger) { g.vehicles.exit(true); return 'exit' }
      if (ctx.carWanted && !p.vehicle) { T.car(); return 'car' }
      if (!mk || !p.control) return 'wait'
      const P = p.vehicle ? p.vehicle.pos : p.pos
      if (Math.hypot(P.x - mk.x, P.z - mk.z) < 2.5) return 'there'
      if (p.vehicle && !p.passenger) {
        const v = p.vehicle, ang = Math.atan2(mk.x - v.pos.x, mk.z - v.pos.z)
        v.teleport(mk.x - Math.sin(ang) * 2, g.physics.groundHeight(mk.x, mk.z, 3) + 0.3, mk.z - Math.cos(ang) * 2, ang)
      } else T.place(mk.x + 0.7, mk.z + 0.7, Math.atan2(-0.7, -0.7))
      g.cameraRig.target.copy(p.vehicle ? p.vehicle.pos : p.pos); g.cameraRig.snap()
      return 'goto'
    }
    T.play = async (id, { mode = 'win', car = false, frames = 700, walk = true, tweak = null, choices = null } = {}) => {
      if (typeof tweak === 'string') tweak = (0, eval)('(' + tweak + ')')
      g.side.auto = mode
      g.autoChoices = choices ? choices.slice() : []
      g.side.dropLingering()
      await T.frames(2)
      const n0 = g.story.npcs.length
      const a0 = g.side.aura.total, lei0 = g.progress.lei
      if (car) T.car(); else if (g.player.vehicle) g.vehicles.exit(true)
      let result = null
      const offP = g.events.on('mission:pass', (d) => { if (d.id === id) result = 'pass' })
      const offF = g.events.on('mission:fail', (d, r) => { if (d.id === id) result = r ? 'fail: ' + r : 'cancel' })
      const run = g.story.events.force(id)
      if (!run) { offP(); offF(); g.side.auto = null; return { error: 'no spot for ' + id } }
      await T.frames(2)
      const ctx = g.story.active
      const started = ctx?.def.id === id
      let i = 0
      for (; i < frames && !result && started; i++) {
        await T.frames(1)
        if (result) break
        if (tweak) tweak(ctx, i)
        if (walk && i % 4 === 0 && !g.ui.modalOpen && !g.cutscene) T.advance(ctx)
      }
      offP(); offF()
      await T.frames(3)
      g.side.auto = null
      g.autoChoices = []
      const data = ctx ? { ...ctx.data } : {}
      for (const k of Object.keys(data)) if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]) && (data[k].def || data[k].char || data[k].group)) data[k] = '[obj]'
      return {
        started, result, frames: i, won: !!data.won, data,
        dAura: g.side.aura.total - a0, dLei: g.progress.lei - lei0,
        clean: {
          active: g.story.active?.def.id || null,
          control: g.player.control,
          mg: document.querySelectorAll('.mg:not(.over)').length,
          items: [...g.interaction.items.keys()].filter((k) => k.startsWith('m_')).length,
          extraNpcs: g.story.npcs.length - n0 - g.side.lingering.length,
          cut: !!g.cameraRig.cut,
          timer: !!document.querySelector('.objective .timer'),
        },
      }
    }
    T.cleanOk = (r) => r.clean && !r.clean.active && r.clean.control && !r.clean.mg && !r.clean.items && r.clean.extraNpcs <= 0 && !r.clean.cut && !r.clean.timer
    // a quiet corner of the city to start from
    T.home = () => { const q = g.world.places.pman; T.place(q.x + 30, q.z + 40) }
  })

  const run = async (id, opts) => {
    // healthy, no stars, somewhere central, and some aura above the level floor (so cringe shows)
    await ev(() => { const g = window.__game, a = g.side.aura; g.police.clear(); g.progress.hp = g.progress.maxHp; a.s.total = Math.max(a.s.total, a.floor + 60); window.__T.home() })
    // (functions can't cross into the page: the tweak goes over as source)
    const o = { ...opts, tweak: opts.tweak ? opts.tweak.toString() : null }
    const r = await ev((a) => window.__T.play(a.id, a.opts), { id, opts: o })
    return r
  }
  const brief = (r) => JSON.stringify({ started: r.started, result: r.result, frames: r.frames, won: r.won, dAura: r.dAura, dLei: r.dLei, clean: r.clean, data: r.data, error: r.error })
  // nothing left behind: no mission, control back, no minigame, prompts, extras, camera shot or timer
  const T_ok = (r) => !!r.clean && !r.clean.active && r.clean.control && !r.clean.mg && !r.clean.items && r.clean.extraNpcs <= 0 && !r.clean.cut && !r.clean.timer

  // ---- the trolleybus: three good pulls on the ropes, or three shocks ----
  await ev(() => { const g = window.__game; g.renderer.tod.set(13) })
  let r = await run('ev_troleibuz', { mode: 'win' })
  const moving = await ev(() => !window.__game.traffic.drivers.some((d) => d.stalled))
  check('trolleybus 22: poles back on the wire, the bus drives on', r.started && r.result === 'pass' && r.won && r.dAura >= 110 && r.dLei >= 40 && moving === true && T_ok(r), brief(r))
  r = await run('ev_troleibuz', { mode: 'lose' })
  const moving2 = await ev(() => !window.__game.traffic.drivers.some((d) => d.stalled))
  check('trolleybus 22: three shocks and it\'s over', r.started && /^fail: Te-a curentat/.test(r.result || '') && !r.won && moving2 === true && T_ok(r), brief(r))

  // ---- the wedding without a DJ ----
  r = await run('ev_nunta', { mode: 'win' })
  check('wedding: the hora saves the party (full combo)', r.started && r.result === 'pass' && r.won && r.data.result?.full && r.dAura >= 250 && r.dLei >= 60 && T_ok(r), brief(r))
  const linger = await ev(() => { const g = window.__game; return { n: g.side.lingering.length, dancing: g.side.lingering.filter((l) => l.n.state === 'dance').length } })
  check('wedding: the guests keep dancing after you win', linger.n >= 8 && linger.dancing >= 8, JSON.stringify(linger))
  r = await run('ev_nunta', { mode: 'lose' })
  check('wedding: dance like an NPC and the party leaves', r.started && /^fail: Nunta s-a mutat/.test(r.result || '') && r.dAura < 0 && T_ok(r), brief(r))
  r = await run('ev_nunta', { mode: 'win', walk: false, frames: 400, tweak: (ctx, i) => { if (i === 5) { const g = window.__game; const T = window.__T; T.place(g.player.pos.x + 420, g.player.pos.z) } } })
  check('wedding: walk away and it goes on without you', r.started && /^fail: Ai plecat/.test(r.result || '') && T_ok(r), brief(r))

  // ---- the pigeon ----
  r = await run('ev_porumbel', { mode: 'win' })
  check('pigeon: caught, pie back to the granny', r.started && r.result === 'pass' && r.won && r.dAura >= 100 && T_ok(r), brief(r))
  r = await run('ev_porumbel', { mode: 'lose', tweak: (ctx) => { if (ctx.timerT > 1 && ctx.data.bird?.active) ctx.timerT = 0.2 } })
  check('pigeon: out of time, the pigeon eats it', r.started && /^fail: Porumbelul a mâncat/.test(r.result || '') && T_ok(r), brief(r))
  r = await run('ev_porumbel', { mode: 'win', choices: [1] })
  check('pigeon: say no and it just ends', r.started && r.result === 'cancel' && T_ok(r), brief(r))

  // ---- maxi-taxi 117 ----
  r = await run('ev_rutiera', { mode: 'win', car: true, frames: 500 })
  check('rutieră 117: first at the stop', r.started && r.result === 'pass' && r.won && r.dAura >= 150 && T_ok(r), brief(r))
  r = await run('ev_rutiera', { mode: 'lose', car: true, frames: 500, walk: false, tweak: (ctx, i) => {
    const g = window.__game, T = window.__T
    // drive up to it, then let it win
    if (!ctx.data.go && i % 4 === 0) T.advance(ctx)
    const b = ctx.data.bus, f = ctx.data.finish
    if (ctx.data.go && b && f && !ctx.data.moved) { ctx.data.moved = true; b.teleport(f.x - 8, g.physics.groundHeight(f.x - 8, f.z, 3) + 0.3, f.z, Math.PI / 2) }
  } })
  check('rutieră 117: it gets there first', r.started && /^fail: Rutiera 117 a ajuns/.test(r.result || '') && T_ok(r), brief(r))

  // ---- parking on the pavement ----
  r = await run('ev_parcare', { mode: 'win', car: true })
  check('parking la moldovenește: parked like a deputy', r.started && r.result === 'pass' && r.won && r.data.quality > 0.5 && r.dAura >= 90 && T_ok(r), brief(r))
  r = await run('ev_parcare', { mode: 'lose', car: true, walk: false, tweak: (ctx) => { if (ctx.timerT > 1) ctx.timerT = 0.2 } })
  check('parking: too slow, a black Gelik takes the spot', r.started && /^fail: Locul l-a luat/.test(r.result || '') && T_ok(r), brief(r))

  // ---- the Lada in the pothole ----
  r = await run('ev_lada', { mode: 'win' })
  check('Lada: pushed out of the pothole, drives off', r.started && r.result === 'pass' && r.won && r.data.result?.ok && r.dAura >= 110 && T_ok(r), brief(r))
  r = await run('ev_lada', { mode: 'lose', frames: 900 })
  check('Lada: not enough pushing, it stays in the hole', r.started && /^fail: Lada a rămas/.test(r.result || '') && T_ok(r), brief(r))

  // ---- sunflower seeds ----
  r = await run('ev_seminte', { mode: 'win' })
  check('seeds: a new courtyard record', r.started && r.result === 'pass' && r.won && r.data.best > r.data.record && r.dAura >= 100 && T_ok(r), brief(r))
  r = await run('ev_seminte', { mode: 'lose' })
  check('seeds: spits like a granny, Jora keeps the title', r.started && /^fail: Jora rămâne campion/.test(r.result || '') && r.data.best <= r.data.record && T_ok(r), brief(r))

  // ---- the two older ones, through the same scheduler ----
  r = await run('ev_granny', { mode: 'win', choices: [0], frames: 900, tweak: () => {
    // she walks at granny speed: keep her at your side
    const g = window.__game, b = g.story.temp.bunica, p = g.player
    if (b && b.state === 'follow' && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) > 5) b.teleport(p.pos.x + 1.2, g.physics.groundHeight(p.pos.x + 1.2, p.pos.z, 3), p.pos.z)
  } })
  check('granny with the bags: carried home', r.started && r.result === 'pass' && r.won && r.dAura >= 80 && T_ok(r), brief(r))

  // ---- the purse snatcher ----
  r = await run('ev_thief', { mode: 'win', frames: 600, tweak: () => {
    // (the autopilot's punches: he goes down when you reach him)
    const g = window.__game, t = g.story.temp.hot, p = g.player
    if (t && !t.char.ko && Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 3) { t.hp = 0; t.knockDown(0.1, 0.1, 5, 1) }
  } })
  check('purse snatcher: put down, purse returned', r.started && r.result === 'pass' && r.won && r.dAura >= 90 && T_ok(r), brief(r))
}

// ================================ WHEN EVENTS MAY HAPPEN =================================================
if (want('rules')) {
  const r = await ev(async () => {
    const T = window.__T, g = T.g, H = g.story.events
    g.side.auto = null
    g.police.clear()
    if (g.player.vehicle) g.vehicles.exit(true)
    const q = g.world.places.pman
    T.place(q.x + 30, q.z + 40)
    const blocked = {}
    const probe = async (name, on, off) => {
      await on()
      H.t = 0
      await T.frames(8)
      blocked[name] = !H.offer && !g.story.active?.def.event
      await off()
      if (H.offer) H.clear()
    }
    await probe('stars', () => g.police.setLevel(1), () => g.police.clear())
    await probe('cutscene', () => { g.cutscene = true }, () => { g.cutscene = false })
    await probe('dialogue', () => { g.ui.modalOpen = true }, () => { g.ui.modalOpen = false })
    await probe('home', () => g.home.enter(), () => g.home.exit())
    let stop = false
    const story = g.story.run({ id: 'test_story', title: 'Test', script: async (m) => { await m.until(() => stop); m.cancel() } })
    await T.frames(2)
    await probe('mission', () => {}, () => {})
    stop = true
    await story
    // free roam: something comes up (an offer on the map, or an event straight away)
    T.place(q.x + 30, q.z + 40)
    H.recent = []
    H.t = 0
    const came = await T.until(() => H.offer, 80)
    const offer = H.offer ? { id: H.offer.def.id, blip: g.director.blips().some((b) => b.kind === 'icon' && b.icon === H.offer.def.icon), mark: !document.querySelector('.offer-mark')?.classList.contains('hidden'), viber: !document.querySelector('.viber')?.classList.contains('hidden') } : null
    if (g.story.active?.def.event) { g.story.failActive(''); await T.until(() => !g.story.active, 100) }
    if (H.offer) H.clear()
    // an offer made, then two stars: it's withdrawn
    H.recent = []
    const made = H.makeOffer('ev_porumbel')
    g.police.setLevel(2)
    await T.frames(4)
    const withdrawn = made && !H.offer && document.querySelector('.offer-mark')?.classList.contains('hidden')
    g.police.clear()
    await T.frames(2)
    // an offer: landing next to it (a teleport) doesn't start it, walking up to it does
    H.recent = []
    const made2 = H.makeOffer('ev_porumbel')
    const spot = H.offer?.spot
    let teleIn = null, started = false
    if (spot) {
      T.place(spot.x + 150, spot.z)
      await T.frames(3)
      T.place(spot.x + 5, spot.z)
      await T.frames(6)
      teleIn = !!H.offer && !g.story.active
      for (let d = 5; d <= 80; d += 8) { T.place(spot.x + d, spot.z); await T.frames(1) }
      for (let d = 80; d >= 5 && !g.story.active; d -= 6) { T.place(spot.x + d, spot.z); await T.frames(1) }
      started = await T.until(() => g.story.active?.def.id === 'ev_porumbel', 30)
    }
    if (g.story.active) { g.story.failActive(''); await T.until(() => !g.story.active, 100) }
    H.t = 1e9
    return { blocked, came: !!came, offer, withdrawn, made2, teleIn, started }
  })
  check('no events with stars, in cutscenes or dialogues, at home, or during a story mission', Object.values(r.blocked).length === 5 && Object.values(r.blocked).every(Boolean), JSON.stringify(r.blocked))
  check('free roam: an event comes up, on the minimap with the neighbours\' Viber', r.came && r.offer?.blip && r.offer?.mark && r.offer?.viber, JSON.stringify(r))
  check('an offer is withdrawn when the police show up', r.withdrawn, JSON.stringify(r))
  check('walking up to an offer starts the event (landing next to it doesn\'t)', r.made2 && r.teleIn === true && r.started, JSON.stringify(r))
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed || errors.length ? 1 : 0)
