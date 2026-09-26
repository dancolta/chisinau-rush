// Dev tool: the story's engagement layer in headless Chromium: mission ratings (stars, records,
// the 'mission:rated' event), replays from the pause menu, the phone hooks after a mission, the
// favours (each one offered, started and passed), checkpoints, Nea Grișa's taxi and the
// [[his|hers]] markup in what people say.
// usage: node tools/story.mjs [--only rating,replay,taxi,favors,offers,checkpoint,gender] [--turbo 5]
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const only = (opt('only', '') || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(k)
const turbo = +opt('turbo', '5')

// fs.strict off: lets the tool run from a snapshot copy whose node_modules is a symlink; no HMR,
// so an edit elsewhere in the tree doesn't reload the page halfway through a run
const server = await createServer({ server: { port: 5207, strictPort: false, host: '127.0.0.1', fs: { strict: false }, hmr: false }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
let current = 'boot'
const errors = []
page.on('console', (m) => {
  if (m.type() !== 'error' || /status of 403|Failed to load resource/.test(m.text())) return
  errors.push(m.text().slice(0, 400)); console.log(`  [console.error · ${current}] ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => { errors.push('PAGEERROR ' + e.message); console.log(`  [pageerror · ${current}] ${e.message} ${(e.stack || '').split('\n').slice(1, 3).join(' | ')}`) })
let failed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }
const t0 = Date.now()
const log = (s) => console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)}s) ${s}`)

await page.goto(base + `?turbo=${turbo}`)
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality?.('low')
  const T = window.T = {
    g,
    ms: (n) => new Promise((r) => setTimeout(r, n)),
    // waits count game frames, not wall time (software rendering is slow and uneven)
    async until(fn, frames = 900) {
      const f0 = g.frame
      for (let k = 0; k < 40000; k++) {
        let ok = false
        try { ok = fn() } catch { ok = false }
        if (ok) return true
        if (g.frame - f0 > frames) return false
        await T.ms(40)
      }
      return false
    },
    async frames(n) { const f0 = g.frame; for (let k = 0; k < 20000 && g.frame < f0 + n; k++) await T.ms(30) },
    rated: [], passed: [], replayed: [], failed: [], started: [], cards: 0,
    // start at a story mission with the autopilot solving whatever it's given, but not starting
    // story missions on its own
    async at(id) {
      await g.debug.startAt(id)
      g.autoTalk = true
      g.debug.autoplay(true)
      g.debug.noStory = true
      g.story.events.t = 1e9     // no street events in the way
      g.renderer.tod.set(13)
    },
    // run a mission (story or favour) with the autopilot until it passes, fails or time runs out
    async play(id, frames = 5000, opts) {
      const def = g.story.byId(id)
      const p0 = T.passed.length + T.replayed.length, f0 = T.failed.length
      g.story.run(def, opts)
      const ok = await T.until(() => T.passed.length + T.replayed.length > p0 || T.failed.length > f0, frames)
      return { ok: ok && T.failed.length === f0, fail: T.failed.slice(f0).map((f) => f.r).join(' | '), obj: g.ui.objective, active: g.story.active?.def.id || null }
    },
  }
  g.events.on('mission:rated', (e) => T.rated.push(e))
  g.events.on('mission:pass', (d) => T.passed.push(d.id))
  g.events.on('mission:replay', (d) => T.replayed.push(d.id))
  g.events.on('mission:fail', (d, r) => { if (r) T.failed.push({ id: d.id, r }) })
  g.events.on('mission:start', (d, o) => T.started.push({ id: d.id, ...(o || {}) }))
  new MutationObserver(() => { if (document.querySelector('.rate-card')) T.cards++ }).observe(g.ui.top, { childList: true })
})

// ================================ the rating ======================================================
if (want('rating') || want('replay')) {
  current = 'rating'
  let r = await ev(async () => {
    const T = window.T, g = T.g
    await T.at('paine')
    const xp0 = g.progress.xp
    const res = await T.play('paine', 6000)
    await T.until(() => T.cards > 0, 200)
    const rec = g.progress.story.ratings?.paine
    return { res, rated: T.rated.slice(), rec, done: g.progress.story.done.includes('paine'), xp: g.progress.xp - xp0, cards: T.cards }
  })
  log('paine: ' + JSON.stringify(r.res))
  const e = r.rated?.find?.((x) => x.id === 'paine')
  check('rating: a passed mission emits mission:rated { id, stars, time }', !!e && e.stars >= 1 && e.stars <= 3 && e.time > 0, JSON.stringify(e))
  check('rating: the best result is kept in the save', !!r.rec && r.rec.stars === e?.stars && r.rec.plays === 1 && r.rec.goals?.length === 2, JSON.stringify(r.rec))
  check('rating: the mission passed card shows the stars', r.cards > 0 && r.done, `cards ${r.cards}`)

  // ---- the hook: a text from uncle Vasile once the bread is home ----------------------------------------------
  current = 'hook'
  r = await ev(async () => {
    const T = window.T, g = T.g
    const ok = await T.until(() => g.story.phone.log.some((l) => l.id === 'after:paine'), 1500)
    return { ok, log: g.story.phone.log.map((l) => `${l.id}:${l.kind}:${l.from}`) }
  })
  check('hooks: the phone rings after the mission (Vasile\'s text after the bread)', r.ok, JSON.stringify(r.log))
}

// ================================ replay from the pause menu =======================================
if (want('replay')) {
  current = 'replay'
  let r = await ev(async () => {
    const T = window.T, g = T.g
    if (!g.progress.story.done.includes('paine')) return { skip: true }
    g.menus.showPause('missions')
    await T.ms(200)
    const rows = [...document.querySelectorAll('.pause .mission-item')]
    const row = rows.find((e) => /Pâine de la Linella/.test(e.textContent))
    const stars = row?.querySelector('.mstars')?.textContent || ''
    const btn = [...(row?.querySelectorAll('.macts button') || [])].find((b) => /Rejoacă/.test(b.textContent))
    const heads = [...document.querySelectorAll('.pause .mission-head')].map((h) => h.textContent)
    if (!btn) { g.menus.closePause(); return { stars, btn: false, heads } }
    const done0 = g.progress.story.done.length, xp0 = g.progress.xp, n0 = T.replayed.length, p0 = T.passed.length
    btn.click()
    const started = await T.until(() => g.story.active?.def.id === 'paine', 400)
    const replay = !!g.story.active?.replay
    const paused = !!document.querySelector('.pause')
    const fin = await T.until(() => T.replayed.length > n0 || !g.story.active, 6000)
    const rec = g.progress.story.ratings?.paine
    return {
      stars, btn: true, heads, started, replay, paused, fin, replayedEvt: T.replayed.length > n0, passEvt: T.passed.length > p0,
      done: g.progress.story.done.length - done0, xp: g.progress.xp - xp0, plays: rec?.plays, lastRated: T.rated[T.rated.length - 1],
    }
  })
  check('replay: the pause menu shows the stars and a replay button', r.btn && /★/.test(r.stars), JSON.stringify({ stars: r.stars, heads: r.heads }))
  check('replay: the button closes the menu and starts the mission as a replay', r.started && r.replay && !r.paused, JSON.stringify(r))
  check('replay: passed again, rated again, no story progress or base reward', r.fin && r.replayedEvt && !r.passEvt && r.done === 0 && r.xp < 150 && r.plays === 2 && r.lastRated?.replay === true, JSON.stringify(r))
}

// ================================ Nea Grișa's taxi =================================================
if (want('taxi')) {
  current = 'taxi'
  const r = await ev(async () => {
    const T = window.T, g = T.g
    if (!g.progress.story.done.includes('paine')) await T.at('jiguli')
    await T.until(() => !g.story.active, 600)
    const next = g.story.nextMission()
    const p = g.player
    p.teleport(300, 0.2, 14, 0); g.cameraRig.snap()
    await T.frames(5)
    g.progress.lei = 100
    g.menus.showPause('missions')
    await T.ms(200)
    const btn = [...document.querySelectorAll('.pause .macts button')].find((b) => /Du-mă/.test(b.textContent))
    if (!btn) { g.menus.closePause(); return { btn: false, next: next?.id } }
    btn.click()
    await T.until(() => !document.querySelector('.pause') && g.ui.faderEl.style.opacity === '0', 300)
    await T.frames(20)
    const at = g.story.giverPos(next)
    return { btn: true, next: next.id, d: Math.round(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)), lei: g.progress.lei, veh: !!p.vehicle }
  })
  check('taxi: "Du-mă acolo" drops you near the next mission for 15 lei', r.btn && r.d < 40 && r.lei === 85, JSON.stringify(r))
}

// ================================ the favours ======================================================
const FAV = ['sm_borcane', 'sm_nunta', 'sm_conferinta', 'sm_gropi', 'sm_troleibuz']
if (want('offers') || want('favors')) {
  current = 'offers'
  const r = await ev(async () => {
    const T = window.T, g = T.g
    await T.at('profetul')
    // the calls queued when the game resumed ring once it's calm
    const ok = await T.until(() => g.story.favors.st.offered.length >= 2, 2500)
    return { ok, offered: g.story.favors.st.offered.slice(), log: g.story.phone.log.map((l) => l.id) }
  })
  check('offers: favours ring in on the phone and land on the map', r.ok && r.offered.includes('sm_borcane'), JSON.stringify(r))
}
if (want('favors')) {
  for (const id of FAV) {
    current = id
    const r = await ev(async (id) => {
      const T = window.T, g = T.g, s = g.story
      if (s.active) { s.failActive(''); await T.until(() => !s.active, 200) }
      g.police.clear()
      g.progress.hp = g.progress.maxHp
      s.favors.offer(id)
      const def = s.byId(id)
      // walk up to the giver: they're standing there, with an [E] to start
      const at = def.giver.pos(g.world.places)
      const p = g.player
      if (p.vehicle) g.vehicles.exit(true)
      p.teleport(at.x + 3, g.physics.groundHeight(at.x + 3, at.z, 3), at.z, -Math.PI / 2)
      g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
      const giver = await T.until(() => !!s.favors.npcs[id] && g.interaction.items.has('favor_' + id), 200)
      const blip = s.blipList().some((b) => b.kind === 'icon' && b.icon === def.icon)
      g.side.auto = 'win'
      const res = await T.play(id, 9000)
      g.side.auto = null
      const rec = g.progress.story.ratings?.[id]
      return { giver, blip, res, done: s.favors.isDone(id), rec, rated: T.rated.filter((e) => e.id === id).length }
    }, id)
    log(`${id}: ${JSON.stringify(r.res)}`)
    check(`${id}: offered, the giver waits on the map`, r.giver && r.blip, JSON.stringify({ giver: r.giver, blip: r.blip }))
    check(`${id}: starts and passes`, !!r.res?.ok && r.done, JSON.stringify(r.res))
    check(`${id}: rated`, !!r.rec && r.rated >= 1, JSON.stringify(r.rec))
  }
  current = 'favor hook'
  const r = await ev(async () => {
    const T = window.T, g = T.g
    const ok = await T.until(() => g.story.phone.log.some((l) => l.id === 'after:sm_conferinta'), 1200)
    g.menus.showPause('missions')
    await T.ms(200)
    const favRows = [...document.querySelectorAll('.pause .mission-item')].filter((e) => /Favor|Borcanele|Convoiul|Conferința|Cursa gropilor|Troleibuzul/.test(e.textContent)).length
    const head = document.querySelector('.pause .mission-head')?.textContent || ''
    g.menus.closePause()
    return { ok, favRows, head }
  })
  check('favours: the press conference ends on Lilia\'s text', r.ok, '')
  check('favours: the pause menu lists them under FAVORURI', r.favRows >= 5 && /FAVORURI/.test(r.head), JSON.stringify(r))
}

// ================================ checkpoints ======================================================
if (want('checkpoint')) {
  current = 'checkpoint'
  const r = await ev(async () => {
    const T = window.T, g = T.g, s = g.story
    await T.at('taxi')
    s.run(s.byId('taxi'))
    const reached = await T.until(() => s.active?.cpKey === 'fare2', 6000)
    if (!reached) return { reached, obj: g.ui.objective }
    s.failActive('test: the cab broke down')
    await T.until(() => !s.active && s.retryDef, 300)
    const offered = !!s.retryDef && s.retryOpts?.from === 'fare2'
    // (the autopilot would drive on to the next client before we look)
    g.debug.auto = false
    s.retry()
    const back = await T.until(() => s.active?.def.id === 'taxi', 400)
    const resume = s.active?.resume
    await T.until(() => /Ionel/.test(g.ui.objective || ''), 200)
    const p = g.player
    const inCab = !!p.vehicle?.vovaCab
    const d = Math.round(Math.hypot(p.pos.x - 243, p.pos.z - 13.2))
    const obj = g.ui.objective || ''
    s.failActive('')
    await T.until(() => !s.active, 300)
    return { reached, offered, back, resume, inCab, d, obj }
  })
  check('checkpoint: a fail after the first fare retries from the second', r.reached && r.offered && r.back && r.resume === 'fare2' && r.inCab && r.d < 45 && /Ionel/.test(r.obj), JSON.stringify(r))
}

// ================================ [[his|hers]] ====================================================
if (want('gender')) {
  current = 'gender'
  const r = await ev(async () => {
    const T = window.T, g = T.g, s = g.story
    if (!g.progress.story.done.length) await T.at('paine')
    if (s.active) { s.failActive(''); await T.until(() => !s.active, 200) }
    const type0 = g.progress.type
    g.progress.type = 'badanta'
    // a text between missions: what the phone shows
    let sms = null
    const off = g.events.on('phone:start', (e) => { if (e.id === 'test:gender') sms = s.phone.$.line.textContent })
    s.phone.sms('lilia', 'Am văzut-o pe [[băiatul|fata]] Mariei la televizor.', { id: 'test:gender', priority: true })
    await T.until(() => sms != null, 900)
    off()
    // Tanti Zina's bench chat once you're mayor
    const said = []
    const dlg = g.ui.dialogue
    g.ui.dialogue = function (sp, lines, o) { said.push(...lines.map((l) => (typeof l === 'string' ? l : l.text))); return dlg.call(this, sp, lines, o) }
    for (const id of ['mitingul', 'alegeri']) if (!s.isDone(id)) s.done.push(id)
    try { await Promise.race([s.chat('zina'), T.ms(20000)]) } finally { g.ui.dialogue = dlg }
    g.progress.type = type0
    return { sms, said: said.join(' / ').slice(0, 200) }
  })
  check('gender: [[his|hers]] follows the hero on the phone', /fata Mariei/.test(r.sms || '') && !/\[\[/.test(r.sms || ''), JSON.stringify(r))
  check('gender: … and in the bench chat', /Doamnă primar/.test(r.said || '') && !/\[\[/.test(r.said || ''), JSON.stringify(r))
}

console.log(errors.length ? `console errors: ${errors.length}\n${[...new Set(errors)].slice(0, 10).join('\n')}` : 'no console errors')
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
