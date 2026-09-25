// Dev tool: the street AI in headless Chromium: gopnik benches that notice you and come over
// (tolls, talking your way out, fights, chases, friends, favours, the lads at Blocul 7), the
// police (witnesses, pursuit on foot and by car, arrests, escaping, hands up, talking to cops)
// and the crowd's reactions. Reports pass/fail per check.
// usage: node tools/streetai.mjs [--only name,name]
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const only = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : null })()
const server = await createServer({ server: { port: 5231, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
let current = '(setup)'
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { const t = m.text().slice(0, 500); if (!errors.includes(t)) console.log(`  !! console.error after "${current}": ${t}`); errors.push(t) } })
page.on('pageerror', (e) => { const t = 'PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | '); console.log(`  !! after "${current}": ${t}`); errors.push(t) })
let failed = 0, passed = 0
const check = (name, ok, info = '') => { current = name; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (ok) passed++; else failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }
const want = (k) => !only || only.includes(k)

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  // Vasea the builder: nobody on the street knows him yet
  await g.debug.startAt('jiguli', { type: 'stroitor' })
  g.autoTalk = true
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  const Q_CAMERA = ((0xffff << 16) | 0x0001) >>> 0
  window.__CR.blockAt = (await import('/src/world/CityLayout.js')).blockAt
  const T = window.__T = {
    g,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    los(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
      return !g.physics.raycast(a.x, 1.4, a.z, dx / d, 0, dz / d, d - 0.3, Q_CAMERA)
    },
    // a bench, spawned, memory wiped, with the player parked out of the way
    async bench(k) {
      const s = g.ambient.spots.filter((q) => q.archetype === 'gopnik')[k]
      if (!s) return null
      g.hood.abort(); g.hood.endHang(false)
      T.place(s.x + 30, s.z + 30)
      g.ambient.t = 0
      await T.until(() => s.npcs, 60)
      await T.until(() => s.npcs && s.npcs.every((n) => n.state !== 'walk' && n.state !== 'run'), 60)
      s.hood = null
      g.hood.nextEnc = 0
      return s
    },
    // stand d metres from a bench where they can see you, facing it
    near(s, d) {
      let best = null
      const inYard = (x, z) => window.__CR.blockAt ? window.__CR.blockAt(x, z) === window.__CR.blockAt(s.x, s.z) : true
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d
        if (g.vehicles.blocked(x, z) || Math.abs(g.physics.groundHeight(x, z, 6)) > 0.6) continue
        const seen = s.npcs.filter((n) => T.los(n.pos, { x, z }) && Math.abs(window.__angle(n.char.heading, Math.atan2(x - n.pos.x, z - n.pos.z))) < 1.7).length + (inYard(x, z) ? 10 : 0)
        if (!best || seen > best.seen) best = { x, z, seen }
      }
      T.place(best.x, best.z, Math.atan2(s.x - best.x, s.z - best.z))
      return best
    },
    rnd(v) { T.realRandom ||= Math.random; Math.random = () => v },
    unrnd() { if (T.realRandom) Math.random = T.realRandom },
    lines: [], menus: [], said: [],
  }
  window.__angle = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d }
  const od = g.ui.dialogue.bind(g.ui)
  g.ui.dialogue = (sp, L, o) => { T.lines.push(`${sp?.name}: ${L.map((l) => (typeof l === 'string' ? l : l.text)).join(' | ')}`); if (o?.choices) T.menus.push(o.choices.map((c) => (typeof c === 'string' ? c : c.text))); return od(sp, L, o) }
  const ob = g.ui.bubble.bind(g.ui)
  g.ui.bubble = (n, text, dur) => { T.said.push({ n, text, f: g.frame }); return ob(n, text, dur) }
  T.busted = 0
  const obu = g.director.busted.bind(g.director)
  g.director.busted = () => { T.busted++; return obu() }
})
await page.waitForTimeout(300)
let r

// ================================ gopnik benches ==================================================
if (want('toll')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 0
    const s = await T.bench(1)
    if (!s) return { none: true }
    T.lines.length = 0
    const lei0 = pr.lei, gop0 = pr.respect.gop
    g.autoChoices = [0, 0]
    const at = T.near(s, 10)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const e = g.hood.enc
    const walking = !!e && ['walk', 'run', 'talk'].includes(e.lead.state)
    const talked = await T.until(() => T.lines.some((l) => /zece lei|Taxă de drum/.test(l)), 200)
    await T.until(() => !g.ui.modalOpen && !g.hood.enc, 120)
    const home = await T.until(() => e && ['sit', 'squat', 'phone'].includes(e.lead.state), 300)
    return { seen: at.seen, came, kind: e?.kind, walking, talked, dLei: pr.lei - lei0, dGop: pr.respect.gop - gop0, home, lines: T.lines.slice(-2), inc: !!g.life.openIncident() }
  })
  check('tier 0: one of the bench gets up, walks over and starts talking (no E)', r.came && r.kind === 'toll' && r.walking && r.talked, JSON.stringify(r))
  check('paying the toll: −10 lei, +1 respect, back to the bench', r.dLei === -10 && r.dGop === 1 && r.home && r.inc, JSON.stringify({ dLei: r.dLei, dGop: r.dGop, home: r.home, inc: r.inc }))
}

if (want('refuse')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress, p = g.player
    pr.respect.gop = 0
    const s = await T.bench(2)
    if (!s) return { none: true }
    g.autoChoices = [0, 2]
    T.near(s, 9)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const fight = await T.until(() => g.life.fights.some((f) => f.members.some((m) => s.npcs.includes(m))), 250)
    const f = g.life.fights.find((q) => q.members.some((m) => s.npcs.includes(m)))
    const all = !!f && s.npcs.every((m) => f.members.includes(m) && m.hostile)
    const gop0 = pr.respect.gop
    for (const m of s.npcs) m.takeHit(999, p.pos.x, p.pos.z, 3, p)
    const over = await T.until(() => !g.life.fights.length, 40)
    return { came, fight, all, over, dGop: pr.respect.gop - gop0 }
  })
  check('refusing the toll: insults, then the whole bench', r.came && r.fight && r.all, JSON.stringify(r))
  check('beating the bench you refused: +10 respect', r.over && r.dGop === 10, JSON.stringify(r))
}

if (want('talkout')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 0
    const s = await T.bench(3)
    if (!s) return { none: true }
    T.menus.length = 0
    g.hood.odds = () => 1   // the dice always land your way here
    const lei0 = pr.lei, gop0 = pr.respect.gop
    g.autoChoices = [0, 1]
    T.near(s, 9)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    await T.until(() => T.menus.length >= 2, 200)
    await T.until(() => !g.ui.modalOpen && !g.hood.enc, 120)
    delete g.hood.odds
    const shown = T.menus[1]?.[1] || ''
    return { came, dLei: pr.lei - lei0, dGop: pr.respect.gop - gop0, paid: s.hood?.paid === g.street.day, shown }
  })
  check('talking your way out: no lei, +2 respect, free passage today', r.came && r.dLei === 0 && r.dGop === 2 && r.paid, JSON.stringify(r))
  r = await ev(() => {
    const g = window.__T.g, h = g.hood, pr = g.progress
    const day = h.night
    const a = h.odds('toll', 0)
    pr.type = 'patan'
    const b = h.odds('toll', 0)
    pr.type = 'stroitor'
    const c = h.odds('beef', -2)
    h.night = () => true
    const n = h.odds('toll', 0)
    h.night = day
    return { base: +a.toFixed(2), patan: +b.toFixed(2), beef: +c.toFixed(2), night: +n.toFixed(2) }
  })
  check('the odds are fair and readable: type helps, beef and night hurt', r.patan > r.base && r.beef < r.base && r.night < r.base && r.base >= 0.3, JSON.stringify(r))
}

if (want('chase')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 0
    const s = await T.bench(4)
    if (!s) return { none: true }
    T.lines.length = 0
    const lei0 = pr.lei
    g.autoChoices = [0, 3, 0]
    T.near(s, 9)
    let runners = 0, ran = false
    const off = g.events.on('hood:chase', () => { runners = g.hood.enc?.runners?.length || 0 })
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const chasing = await T.until(() => { const e = g.hood.enc; if (e?.phase === 'chase' && e.runners.some((q) => q.state === 'run')) ran = true; return runners > 0 && (ran || T.lines.some((l) => /Unde fugeai/.test(l))) }, 250)
    off?.()
    // standing still: they catch you, and now it costs double
    const caught = await T.until(() => T.lines.some((l) => /Unde fugeai/.test(l)), 200)
    await T.until(() => !g.ui.modalOpen && !g.hood.enc, 120)
    return { came, chasing, runners, caught, dLei: pr.lei - lei0 }
  })
  check('running from the toll: two of them come after you', r.came && r.chasing && r.runners === 2, JSON.stringify(r))
  check('caught: the toll doubles (20 lei)', r.caught && r.dLei === -20, JSON.stringify(r))
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress, p = g.player
    pr.respect.gop = 5
    const s = await T.bench(5)
    if (!s) return { none: true }
    const gop0 = pr.respect.gop
    g.autoChoices = [0, 3]
    T.near(s, 9)
    await T.until(() => g.hood.enc?.phase === 'chase', 300)
    // over the fence and gone
    const e = g.hood.enc
    for (let i = 0; i < 12 && g.hood.enc; i++) { const a = Math.atan2(p.pos.x - s.x, p.pos.z - s.z); T.place(p.pos.x + Math.sin(a) * 6, p.pos.z + Math.cos(a) * 6, a); await T.frames(2) }
    const gone = await T.until(() => !g.hood.enc, 120)
    return { chased: !!e, gone, beef: s.hood?.beef, dGop: pr.respect.gop - gop0, next: g.hood.kindFor(s) }
  })
  check('outrunning them: they remember (beef), −2 respect, next time it costs more', r.chased && r.gone && r.beef === 1 && r.dGop === -2 && r.next === 'beef', JSON.stringify(r))
}

if (want('friend')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 80
    const s = await T.bench(6)
    if (!s) return { none: true }
    T.menus.length = 0; T.lines.length = 0
    const lei0 = pr.lei
    g.autoChoices = [0, 4]
    T.near(s, 10)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const e = g.hood.enc
    const stood = e?.standers.length || 0
    await T.until(() => T.menus.length >= 1, 200)
    await T.until(() => !g.ui.modalOpen && !g.hood.enc, 160)
    return { came, kind: e?.kind, stood, menu: T.menus[0], dLei: pr.lei - lei0, toll: T.lines.some((l) => /lei\. Pentru semințe|Taxă de drum/.test(l)) }
  })
  check('tier 3: the whole bench stands up for you, no toll', r.came && r.kind === 'boss' && r.stood >= 1 && !r.toll, JSON.stringify(r))
  check('tier 3: the boss gets a cut', r.dLei >= 10 && r.dLei <= 30 && /Cota/.test(r.menu?.[0] || ''), JSON.stringify(r))
}

if (want('newbie')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 0
    const done = pr.story.done.slice()
    pr.story.done = done.filter((id) => id !== 'paine')
    const s = await T.bench(7)
    if (!s) { pr.story.done = done; return { none: true } }
    T.lines.length = 0
    g.autoChoices = [0, 2]
    T.near(s, 9)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const kind = g.hood.enc?.kind
    await T.until(() => T.lines.length >= 2, 200)
    await T.until(() => !g.ui.modalOpen && !g.hood.enc, 120)
    await T.frames(5)
    const fight = g.life.fights.some((f) => f.members.some((m) => s.npcs.includes(m)))
    pr.story.done = done
    return { came, kind, ask: T.lines[1], fight }
  })
  check('before the bread run: curious, "dă un leu", and no fight when you refuse', r.came && r.kind === 'newbie' && /un leu/.test(r.ask || '') && !r.fight, JSON.stringify(r))
}

if (want('favor')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 50
    const s = await T.bench(8)
    if (!s) return { none: true }
    // they ask you for a beer
    let f = g.hood.planFavor('bere', s)
    if (!f) return { noKiosk: true }
    g.hood.favor = { ...f, t: 0 }
    const blip = g.street.blips().some((b) => b.icon === '🍺')
    g.events.emit('shop:buy', { shop: f.to.label, item: { name: 'Halbă de cvas' } })
    const back = g.hood.favor?.stage === 'back'
    const lei0 = pr.lei, gop0 = pr.respect.gop
    g.autoChoices = [0]
    T.near(s, 9)
    const came = await T.until(() => g.hood.enc?.kind === 'back', 80)
    await T.until(() => !g.hood.favor && !g.ui.modalOpen && !g.hood.enc, 250)
    return { blip, back, came, done: !g.hood.favor, dLei: pr.lei - lei0, dGop: pr.respect.gop - gop0 }
  })
  check('a favour: fetch a beer, bring it back, get paid in respect', r.noKiosk || (r.blip && r.back && r.came && r.done && r.dGop === 6 && r.dLei === 5), JSON.stringify(r))
}

if (want('squat')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress, p = g.player
    pr.respect.gop = 50
    const s = await T.bench(0)
    if (!s) return { none: true }
    const gop0 = pr.respect.gop
    g.autoChoices = [0]
    T.near(s, 10)
    const came = await T.until(() => g.hood.enc?.s === s, 60)
    const kind = g.hood.enc?.kind
    const sat = await T.until(() => g.hood.hang?.phase === 'sit', 300)
    const pose = p.char.anim.action?.name
    const locked = !p.control
    const gained = await T.until(() => pr.respect.gop > gop0, 200)
    const talk = T.said.filter((q) => s.npcs.includes(q.n) && q.f > g.frame - 400).length
    g.input.down.add('KeyW')
    const up = await T.until(() => !g.hood.hang, 20)
    g.input.down.delete('KeyW')
    await T.frames(2)
    return { came, kind, sat, pose, locked, gained, talk, up, control: p.control, poseAfter: p.char.anim.action?.name || null }
  })
  check('tier 2: they invite you onto your heels with them', r.came && r.kind === 'friend' && r.sat && r.pose === 'squatdown' && r.locked, JSON.stringify(r))
  check('squatting with the lads: banter, respect, get up by moving', r.gained && r.talk >= 1 && r.up && r.control && r.poseAfter !== 'squatdown', JSON.stringify(r))
}

if (want('life')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g, pr = g.progress
    pr.respect.gop = 20
    const s = await T.bench(3)
    if (!s) return { none: true }
    s.hood = { ...g.hood.mem(s), met: g.street.day, cd: 1e9 }   // already met today: no walk-over
    T.near(s, 12)
    const f0 = g.frame
    const ok = await T.until(() => new Set(T.said.filter((q) => q.f >= f0 && s.npcs.includes(q.n)).map((q) => q.n)).size >= 2, 300)
    const lines = T.said.filter((q) => q.f >= f0 && s.npcs.includes(q.n)).map((q) => q.text).slice(0, 4)
    // your car: a comment when you pull up
    const v = g.vehicles.spawn('jiguli', g.player.pos.x, g.player.pos.z, 0)
    v.keep = true
    g.vehicles.enter(v)
    s.hood.car = 0
    const f1 = g.frame
    const car = await T.until(() => T.said.some((q) => q.f >= f1 && s.npcs.includes(q.n)), 120)
    g.vehicles.exit(true)
    g.vehicles.remove(v)
    return { ok, lines, car }
  })
  check('bench life: they talk among themselves and comment on your car', r.ok && r.car, JSON.stringify(r))
}

if (want('cast')) {
  r = await ev(async () => {
    const T = window.__T, g = T.g
    const gc = g.world.places.gopnici_curte
    const c = g.story.cast
    const who = ['vitea', 'gop2', 'gop3'].map((k) => c[k]).filter(Boolean)
    if (!who.length) return { none: true }
    const pos0 = who.map((n) => ({ x: n.pos.x, z: n.pos.z, s: n.state }))
    // no real mission may start by itself while we stand in the yard
    const auto = g.story.autoStart
    g.story.autoStart = null
    T.place(gc.x + 5, gc.z + 3, Math.atan2(-5, -3))
    const f0 = g.frame
    const spoke = await T.until(() => T.said.some((q) => q.f >= f0 && who.includes(q.n)), 200)
    const still = who.every((n, i) => Math.hypot(n.pos.x - pos0[i].x, n.pos.z - pos0[i].z) < 0.2 && n.state === pos0[i].s)
    // with a mission running they're scenery again
    const fake = { def: { id: 'test' }, tick() {}, waiters: [], tracked: [] }
    const real = g.story.active?.def.id || null
    g.story.active = fake
    // (by index, not frame: the greeting above may have been said this very frame)
    const i1 = T.said.length
    await T.frames(60)
    const loud = T.said.slice(i1).filter((q) => who.includes(q.n)).map((q) => q.text)
    g.story.active = null
    g.story.autoStart = auto
    return { spoke, still, quiet: !loud.length, n: who.length, real, loud }
  })
  check('the lads at Blocul 7 greet you outside missions, stay put, stay quiet in one', r.spoke && r.still && r.quiet, JSON.stringify(r))
}

// ================================ police ============================================================
const street = async () => ev(async () => {
  const T = window.__T, g = T.g
  g.police.clear()
  g.hood.abort(); g.hood.endHang(false)
  await T.until(() => !g.ui.modalOpen, 60)
  // no leftovers from the last chase
  for (const c of [...g.police.cars]) { for (const o of c.riders || []) o.dispose(); g.vehicles.remove(c.v) }
  g.police.cars = []
  for (const o of [...g.police.officers]) o.dispose()
  g.police.officers = []
  const pl = g.world.places.pman
  T.place(pl.x + 8, pl.z + 8, 0)
  for (const n of [...g.peds.list]) if (n.personality === 'cop') g.peds.remove(n)
  await T.frames(3)
})

if (want('witness')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    const cop = g.peds.spawn(p.pos.x + 12, p.pos.z, window.__CR.CAST.cop, { personality: 'cop', archetype: 'cop', hp: 60, walkSpeed: 1.15 })
    cop.state = 'idle'; cop.path = []
    await T.frames(2)
    const f0 = g.frame
    g.events.emit('crime', { type: 'assault', x: p.pos.x, z: p.pos.z, severity: 1 })
    const lvl = g.police.level
    const adopted = g.police.officers.includes(cop)
    const whistle = T.said.some((q) => q.n === cop && q.f >= f0)
    const d0 = Math.hypot(cop.pos.x - p.pos.x, cop.pos.z - p.pos.z)
    T.busted = 0
    g.autoChoices = [0]
    const ran = await T.until(() => cop.state === 'run', 40)
    const grab = await T.until(() => !!g.police.grab, 250)
    const busted = await T.until(() => T.busted > 0, 120)
    await T.until(() => !g.ui.modalOpen, 100)
    return { lvl, adopted, whistle, d0: Math.round(d0), ran, grab, busted, after: g.police.level }
  })
  check('a patrol cop who sees a crime blows the whistle and comes for you', r.lvl === 1 && r.adopted && r.whistle && r.ran, JSON.stringify(r))
  check('one star: he grabs you and it ends in the busted talk (bribe clears it)', r.grab && r.busted && r.after === 0, JSON.stringify(r))
}

if (want('pursuit')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player, pr = g.progress
    pr.hp = pr.maxHp
    T.busted = 0
    g.autoChoices = [0]
    g.police.setLevel(2)
    const trace = []
    let idleFar = 0, hit = false
    for (let k = 0; k < 40 && !T.busted; k++) {
      await T.frames(5)
      const os = g.police.officers.filter((o) => !o.char.ko)
      if (!g.ui.modalOpen && !g.police.grab) for (const o of os) if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 3 && o.state === 'idle' && o.cop?.mode === 'chase' && !o.char.anim.busy) idleFar++
      if (pr.hp < pr.maxHp) hit = true
      trace.push(os.map((o) => Math.round(Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z))).join(','))
    }
    const busted = await T.until(() => T.busted > 0, 60)
    await T.until(() => !g.ui.modalOpen, 100)
    return { busted, hit, idleFar, cars: g.police.cars.length, trace: trace.filter((_, i) => i % 5 === 0), after: g.police.level }
  })
  check('two stars: officers turn up, run at you, use the baton, and arrest', r.busted && r.hit && r.idleFar < 3, JSON.stringify(r))
}

if (want('cars')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    // a car on a road, engine off
    const e = g.traffic.graph.edges.find((q) => Math.hypot(g.traffic.graph.lanePoint(q, 0, 0.5).x - p.pos.x, g.traffic.graph.lanePoint(q, 0, 0.5).z - p.pos.z) < 80)
    const lp = g.traffic.graph.lanePoint(e, 0, 0.5)
    const v = g.vehicles.spawn('logan', lp.x, lp.z, Math.atan2(e.fx, e.fz))
    v.keep = true
    T.place(lp.x + 2, lp.z)
    g.vehicles.enter(v)
    T.busted = 0
    g.autoChoices = [0]
    g.police.setLevel(2)
    const ds = []
    const chasing = () => g.police.cars.filter((c) => c.mode === 'chase')
    const spawned = await T.until(() => chasing().length >= 1, 60)
    const siren = chasing().every((c) => c.v.siren)
    let n = 0
    for (let k = 0; k < 30 && !T.busted; k++) { await T.frames(5); n = Math.max(n, chasing().length); if (chasing().length) ds.push(Math.min(...chasing().map((c) => Math.round(Math.hypot(c.v.pos.x - v.pos.x, c.v.pos.z - v.pos.z))))) }
    const res = { spawned, n, siren, ds: ds.filter((_, i) => i % 3 === 0), min: Math.min(...ds), first: ds[0], roles: g.police.cars.map((c) => c.role), level: g.police.level }
    g.police.clear()
    g.vehicles.exit(true)
    g.vehicles.remove(v)
    return res
  })
  check('police cars come after you with sirens and close in', r.spawned && r.n >= 2 && r.siren && r.min < 20 && r.min < r.first - 15, JSON.stringify(r))
}

if (want('escape')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    g.police.setLevel(2)
    await T.frames(40)
    const had = g.police.officers.length
    // gone: round the corner, into a courtyard two streets away
    const hideout = g.ambient.spots.find((q) => q.archetype === 'gopnik' && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > 150)
    T.place(hideout.x + 4, hideout.z + 4)
    const blink = await T.until(() => g.police.escaping, 60)
    const free = await T.until(() => g.police.level === 0, 400)
    await T.frames(10)
    const patrol = g.peds.list.filter((n) => n.chased).length
    return { had, blink, free, patrol, left: g.police.officers.length }
  })
  check('breaking the line of sight long enough loses the police', r.had > 0 && r.blink && r.free, JSON.stringify(r))
}

if (want('talkcop')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player, pr = g.progress
    const h = p.char.heading
    const cop = g.peds.spawn(p.pos.x + Math.sin(h) * 1.5, p.pos.z + Math.cos(h) * 1.5, window.__CR.CAST.cop, { personality: 'cop', archetype: 'cop', hp: 60, walkSpeed: 1.15 })
    cop.state = 'idle'; cop.path = []
    const cand = await T.until(() => g.street.cand === cop, 30)
    await T.frames(2)
    const prompt = document.querySelector('.prompt')?.textContent || ''
    // something happened to you earlier: report it
    g.life.incidents = []
    g.life.incident('shake', { lei: 10 })
    T.menus.length = 0
    g.street.tips = []
    const pol0 = pr.respect.pol, tips0 = 0
    g.autoChoices = [5, 4]
    await g.street.talk(cop)
    return { cand, prompt, menu: T.menus[0], dPol: pr.respect.pol - pol0, tip: g.street.tips.length - tips0, reported: !g.life.openIncident() }
  })
  check('E-talk on a patrol cop: the prompt shows', r.cand && /polițistul/.test(r.prompt), JSON.stringify({ cand: r.cand, prompt: r.prompt }))
  check('cops: report a crime (+respect) and ask the way (a pin)', r.dPol === 4 && r.tip === 1 && r.reported && r.menu?.length === 7, JSON.stringify(r))
}

if (want('surrender')) {
  await street()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player, pr = g.progress
    pr.lei = 400
    g.police.setLevel(2)
    const o = g.police.spawnOfficerAt(p.pos.x + 1.6, p.pos.z)
    await T.frames(2)
    const to = g.police.surrenderTo() === o
    const it = g.interaction.items.get('police_surrender')
    const label = it.label()
    g.police.bribeOdds = () => 1
    g.autoChoices = [1]
    const lei0 = pr.lei
    // E, like a player would
    g.input.pressedSet.add('KeyE')
    const talking = await T.until(() => g.police.talking, 30)
    const hands = p.char.anim.action?.name
    await T.until(() => !g.police.talking, 120)
    const bribe = { level: g.police.level, dLei: pr.lei - lei0 }
    delete g.police.bribeOdds
    // again, and this time a fine: one star less
    g.police.setLevel(2)
    g.police.spawnOfficerAt(p.pos.x - 1.6, p.pos.z)
    await T.frames(2)
    g.autoChoices = [0]
    const lei1 = pr.lei
    await g.police.surrender()
    const fine = { level: g.police.level, dLei: pr.lei - lei1 }
    g.police.clear()
    return { to, label, talking, hands, bribe, fine, control: p.control }
  })
  check('with stars, E next to a cop: hands up and talk', r.to && /Mâinile sus/.test(r.label) && r.talking && r.hands === 'surrender', JSON.stringify(r))
  check('hands up: a bribe clears the stars, a fine takes one off', r.bribe.level === 0 && r.bribe.dLei < 0 && r.fine.level === 1 && r.fine.dLei < 0 && r.control, JSON.stringify(r))
}

// ================================ the crowd ==========================================================
// a quiet pavement with nobody in uniform around
const quiet = async () => ev(async () => {
  const T = window.__T, g = T.g
  g.police.clear()
  g.hood.abort(); g.hood.endHang(false)
  await T.until(() => !g.ui.modalOpen, 60)
  for (const c of [...g.police.cars]) g.vehicles.remove(c.v)
  g.police.cars = []
  for (const o of [...g.police.officers]) o.dispose()
  g.police.officers = []
  const pl = g.world.places.pman
  T.place(pl.x - 6, pl.z + 14, 0)
  for (const n of [...g.peds.list]) if (n.personality === 'cop' || Math.hypot(n.pos.x - g.player.pos.x, n.pos.z - g.player.pos.z) < 40) g.peds.remove(n)
  g.crowd.nextCall = 0
  await T.frames(3)
})

if (want('pause')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    // someone walking past right in front of you
    const x = p.pos.x + Math.sin(h) * 2 - Math.cos(h) * 3, z = p.pos.z + Math.cos(h) * 2 + Math.sin(h) * 3
    const n = g.peds.spawn(x, z, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'walk'; n.path = [{ x: x + Math.cos(h) * 30, z: z - Math.sin(h) * 30 }]
    const stopped = await T.until(() => !!n.pause && n.state === 'idle', 60)
    const cand = await T.until(() => g.street.cand === n, 30)
    const look = +n.char.anim.lookYaw.toFixed(2)
    T.place(p.pos.x - Math.sin(h) * 8, p.pos.z - Math.cos(h) * 8, h)
    const walks = await T.until(() => !n.pause && n.state === 'walk', 80)
    g.peds.remove(n)
    return { stopped, cand, look, walks }
  })
  check('walk up to someone: they stop for you (E works), then go on their way', r.stopped && r.cand && r.walks, JSON.stringify(r))
}

if (want('stare')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    const n = g.peds.spawn(p.pos.x + Math.sin(h) * 4, p.pos.z + Math.cos(h) * 4, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'idle'; n.path = []
    const f0 = g.frame
    const said = await T.until(() => T.said.some((q) => q.n === n && q.f >= f0), 120)
    const text = T.said.find((q) => q.n === n)?.text
    g.peds.remove(n)
    return { said, text }
  })
  check('stare at someone long enough and they call you on it', r.said, JSON.stringify(r))
}

if (want('shove')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const n = g.peds.spawn(p.pos.x + 0.6, p.pos.z, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'idle'; n.path = []
    const f0 = g.frame
    g.life.bump(n)
    n.bumpT = 0
    T.rnd(0.9)
    g.life.bump(n)
    T.unrnd()
    const again = T.said.filter((q) => q.n === n && q.f >= f0).map((q) => q.text)
    const mem = { ...n.mem }
    g.peds.remove(n)
    return { again, shoved: mem.shoved }
  })
  check('shove someone twice: they remember and let you have it', r.shoved === 2 && r.again.some((t) => /Iar|A doua/.test(t)), JSON.stringify(r))
}

if (want('caller')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    const a = g.peds.spawn(p.pos.x + Math.sin(h) * 10, p.pos.z + Math.cos(h) * 10, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    a.state = 'idle'; a.path = []
    const lvl0 = g.police.level
    T.rnd(0.1)
    g.events.emit('crime', { type: 'assault', x: p.pos.x, z: p.pos.z, severity: 1 })
    T.unrnd()
    const calling = !!a.calling
    const phone = await T.until(() => a.state === 'phone', 60)
    const star = await T.until(() => g.police.level > 0, 120)
    const res = { lvl0, calling, phone, star }
    // again, and this time twenty lei settle it
    g.police.clear()
    for (const c of [...g.police.cars]) g.vehicles.remove(c.v)
    g.police.cars = []
    for (const o of [...g.police.officers]) o.dispose()
    g.police.officers = []
    await T.frames(2)
    g.crowd.nextCall = 0
    const b = g.peds.spawn(p.pos.x + Math.sin(h) * 1.5, p.pos.z + Math.cos(h) * 1.5, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    b.state = 'idle'; b.path = []
    g.peds.remove(a)
    T.rnd(0.1)
    g.events.emit('crime', { type: 'assault', x: p.pos.x + 4, z: p.pos.z, severity: 1 })
    T.unrnd()
    res.calling2 = !!b.calling
    await T.until(() => b.state === 'phone', 60)
    // they ran a few steps before dialling: go after them
    const a2 = Math.atan2(p.pos.x - b.pos.x, p.pos.z - b.pos.z) || 0.5
    T.place(b.pos.x + Math.sin(a2) * 1.3, b.pos.z + Math.cos(a2) * 1.3, a2 + Math.PI)
    const cand = await T.until(() => g.street.cand === b, 12)
    const lei0 = g.progress.lei
    g.autoChoices = [0]
    await g.street.talk(b)
    await T.frames(40)
    res.hushed = { cand, dLei: g.progress.lei - lei0, calling: !!b.calling, level: g.police.level }
    g.peds.remove(b)
    return res
  })
  check('a crime no cop saw: someone phones the police, and it costs you a star', r.lvl0 === 0 && r.calling && r.phone && r.star, JSON.stringify(r))
  check('...unless you talk them out of it (20 lei)', r.calling2 && r.hushed?.cand && r.hushed.dLei === -20 && !r.hushed.calling && r.hushed.level === 0, JSON.stringify(r.hushed))
}

if (want('granny')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    const baba = g.peds.spawn(p.pos.x - Math.sin(h) * 7, p.pos.z - Math.cos(h) * 7, { ...window.__CR.CAST.zina })
    baba.state = 'idle'; baba.path = []
    const v = g.peds.spawn(p.pos.x + Math.sin(h) * 1.2, p.pos.z + Math.cos(h) * 1.2, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    v.state = 'idle'; v.path = []
    const f0 = g.frame
    T.rnd(0.1)
    v.takeHit(3, p.pos.x, p.pos.z, 1, p)
    T.unrnd()
    await T.frames(3)
    const scold = T.said.filter((q) => q.n === baba && q.f >= f0).map((q) => q.text)
    const res = { arch: baba.archetype, scold, fled: baba.state === 'flee' }
    g.peds.remove(baba); g.peds.remove(v)
    g.crowd.cancelCalls()
    return res
  })
  check('a granny who sees a fight scolds you instead of running', r.arch === 'babushka' && r.scold.length >= 1 && !r.fled, JSON.stringify(r))
}

if (want('kid')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player, pr = g.progress
    const h = p.char.heading
    const kid = g.peds.spawn(p.pos.x + Math.sin(h) * 1.5, p.pos.z + Math.cos(h) * 1.5, null, { archetype: 'kid', personality: 'coward' })
    kid.state = 'idle'; kid.path = []
    const cand = await T.until(() => g.street.cand === kid, 30)
    const label = document.querySelector('.prompt')?.textContent || ''
    const bab0 = pr.respect.bab, lei0 = pr.lei
    T.menus.length = 0
    g.autoChoices = [1, 1, 2]
    await g.street.talk(kid)
    const res = { cand, label, menu: T.menus[0], dBab: pr.respect.bab - bab0, dLei: pr.lei - lei0, secret: T.lines.slice(-2)[0] }
    // and a car going past: the nearest long stretch of road, the kid on its kerb
    let e = null, bd = 1e9
    for (const q of g.traffic.graph.edges) { const lp = g.traffic.graph.lanePoint(q, 0, 0.3); const d = Math.hypot(lp.x - p.pos.x, lp.z - p.pos.z); if (q.len > 40 && d < bd) { bd = d; e = q } }
    if (e) {
      const lp = g.traffic.graph.lanePoint(e, 0, 0.3)
      const kx = lp.x + e.fz * 4.5, kz = lp.z - e.fx * 4.5
      kid.teleport(kx, g.physics.groundHeight(kx, kz, 3), kz)
      kid.state = 'idle'; kid.path = []
      for (const q of [...g.peds.list]) if (q !== kid && Math.hypot(q.pos.x - kx, q.pos.z - kz) < 20) g.peds.remove(q)
      const v = g.vehicles.spawn('jiguli', lp.x, lp.z, Math.atan2(e.fx, e.fz))
      v.keep = true
      g.vehicles.enter(v)
      const f0 = g.frame
      g.input.down.add('KeyW')
      res.point = await T.until(() => T.said.some((q) => q.n === kid && q.f >= f0), 40)
      g.input.down.delete('KeyW')
      g.vehicles.exit(true)
      g.vehicles.remove(v)
    }
    g.peds.remove(kid)
    return res
  })
  check('kids: talk to them, buy an ice cream (the grannies hear of it)', r.cand && /copilul/.test(r.label) && r.dBab === 2 && r.dLei === -5, JSON.stringify(r))
  check('kids point at your car', r.point === true, JSON.stringify({ point: r.point }))
}

if (want('queue')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const k = g.world.kiosks[0]
    const front = { x: k.x + Math.sin(k.ry) * 1.9, z: k.z + Math.cos(k.ry) * 1.9 }
    T.place(front.x + Math.sin(k.ry) * 12, front.z + Math.cos(k.ry) * 12, k.ry + Math.PI)
    for (const q of [...g.peds.list]) if (Math.hypot(q.pos.x - front.x, q.pos.z - front.z) < 25) g.peds.remove(q)
    const n = g.peds.spawn(front.x + 3, front.z, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'walk'; n.path = [{ x: front.x + 30, z: front.z }]
    await T.frames(2)
    g.crowd.nextRoutine = 0
    T.rnd(0.05)
    g.crowd.routines()
    T.unrnd()
    const joined = !!n.queue
    const inLine = await T.until(() => n.state === 'idle' && Math.hypot(n.pos.x - front.x, n.pos.z - front.z) < 1.5, 100)
    const served = await T.until(() => !n.queue && n.state === 'walk', 250)
    g.peds.remove(n)
    return { joined, inLine, served }
  })
  check('people queue at a kiosk, get served and walk on', r.joined && r.inLine && r.served, JSON.stringify(r))
}

if (want('helped')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    const n = g.peds.spawn(p.pos.x + Math.sin(h) * 1.4, p.pos.z + Math.cos(h) * 1.4, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'idle'; n.path = []
    await T.until(() => g.street.cand === n, 30)
    g.autoChoices = [3, 4]
    await g.street.talk(n)
    const f0 = g.frame
    const thanks = await T.until(() => T.said.some((q) => q.n === n && q.f >= f0 && /douăzeci|Omul bun/.test(q.text)), 120)
    g.peds.remove(n)
    return { helped: !!n.mem?.helped, thanks }
  })
  check('someone you helped greets you when you pass', r.helped && r.thanks, JSON.stringify(r))
}

if (want('dog')) {
  await quiet()
  r = await ev(async () => {
    const T = window.__T, g = T.g, p = g.player
    const h = p.char.heading
    // a man walking his dog past you
    const x = p.pos.x + Math.sin(h) * 6, z = p.pos.z + Math.cos(h) * 6
    const n = g.peds.spawn(x, z, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' })
    n.state = 'walk'; n.path = [{ x: x + Math.cos(h) * 12, z: z - Math.sin(h) * 12 }]
    const d = g.crowd.dogs.spawn(n)
    await T.frames(40)
    const heel = Math.hypot(d.x - n.pos.x, d.z - n.pos.z)
    const moved = Math.hypot(d.x - x, d.z - z)
    // walk right up to it
    T.place(d.x + Math.sin(h) * 1.6, d.z + Math.cos(h) * 1.6, h + Math.PI)
    const f0 = g.frame
    const bark = await T.until(() => T.said.some((q) => q.n === d && q.f >= f0), 60)
    g.peds.remove(n)
    await T.frames(3)
    return { heel: +heel.toFixed(2), moved: +moved.toFixed(1), bark, gone: !g.crowd.dogs.list.includes(d) }
  })
  check('someone walks a dog: it keeps to heel, barks at you, goes home with its owner', r.heel < 1.6 && r.moved > 2 && r.bark && r.gone, JSON.stringify(r))
}

console.log(`\n${passed} passed, ${failed} failed`)
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
