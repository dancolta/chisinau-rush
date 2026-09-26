import { GOP, HOOD } from '../data/streettalk.js'
import { fill } from '../story/hero.js'
import { angleDiff } from '../entities/Character.js'
import { clearSight } from './Sight.js'
import { blockAt } from '../world/CityLayout.js'

// The courtyard crews. A gopnik bench watches its yard: whoever has you in view (in front of
// them, no wall between) nudges the others, one of them gets up, calls out and walks over, and
// the talk starts when he's in your face, no key needed. What he wants depends on how the
// yard knows you (respect), what you wear, who you are, the hour and whether your lads are
// with you: a toll from strangers ("Ai o siga? De unde ești? Dă zece lei"), a smoke and a
// favour from acquaintances, a spot on their heels for friends, a standing ovation and a cut
// for the boss. Pay, talk your way out (the odds are on the button), refuse (insults, then
// the whole bench) or run (two of them after you, briefly). Between visitors they banter,
// spit husks, cheer fights and comment on your car. The story lads at Blocul 7 get the same
// small life, never more, and only when no mission is running.
// Brains run four times a second; timers follow game time, not the wall clock.

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] } return r }
// small sums the way the lads say them
const WORDS = { 1: 'un', 2: 'doi', 5: 'cinci', 10: 'zece', 15: 'cincisprezece', 20: 'douăzeci', 25: 'douăzeci și cinci', 30: 'treizeci', 35: 'treizeci și cinci', 40: 'patruzeci', 45: 'patruzeci și cinci', 50: 'cincizeci', 60: 'șaizeci', 70: 'șaptezeci', 80: 'optzeci', 90: 'nouăzeci', 100: 'o sută' }
const words = (n) => WORDS[n] || String(n)
const TOLL = ['toll', 'newbie', 'beef', 'caught']

export class Hood {
  constructor(game) {
    this.game = game
    this.clock = 0
    this.brainT = 0.1
    this.lifeT = 0.3
    this.enc = null        // one of them on his way over, talking, or after you
    this.hang = null       // you on your heels with them
    this.favor = null      // a job for a bench
    this.nextEnc = 0
    this.pending = []      // second halves of banter
    this.castSpot = { story: true, x: 0, z: 0, npcs: [] }
    const ev = game.events
    ev.on('npc:hit', (e) => this.onHit(e))
    ev.on('shop:buy', (e) => this.onBuy(e))
    ev.on('mission:start', () => { this.abort(); this.endHang(false) })
    ev.on('player:down', () => { this.abort(); this.endHang(false) })
  }

  fill(s, vars) { return fill(this.game, s, vars) }
  day() { return this.game.street?.day || 0 }
  mem(s) { return (s.hood ||= { alert: 0, cd: 0, met: -1, paid: -1, beef: 0, cut: -1, banter: 0, spit: 0, car: 0, bark: 0, hangDay: -1, hangGain: 0 }) }
  night() { const h = this.game.renderer.tod.hour; return h >= 22 || h < 4 }
  // what your clothes say before you open your mouth
  look() {
    const g = this.game, pr = g.progress, top = g.player?.char?.spec?.top?.style
    return { track: top === 'tracksuit', suit: top === 'suit', rich: pr.look?.rich || 0, gop: pr.look?.gop || 0 }
  }
  able(n) { return !!n && !n.disposed && !n.crew && !n.char.ko && !n.hostile && n.state !== 'fight' && n.state !== 'knocked' && n.state !== 'flee' }
  benches() { return this.game.ambient.spots.filter((s) => s.archetype === 'gopnik' && s.npcs) }
  inFight(s) { return this.game.life.fights.some((f) => f.members.some((m) => s.npcs?.includes(m))) }
  crewNear() { const p = this.game.player; return this.game.crew.list.filter((c) => !c.riding && !c.char.ko && dist(c.pos, p.pos) < 14) }

  // ---- who they are to you ----------------------------------------------------------------------
  kindFor(s) {
    const g = this.game, pr = g.progress, m = this.mem(s), day = this.day()
    if (this.favor?.s === s && this.favor.stage === 'back') return 'back'
    const tier = pr.tier('gop')
    if (tier === 0 && !this.crewNear().length) {
      // before the bread run the yard is curious more than dangerous
      if (!g.story.isDone('paine')) return m.met === day ? null : 'newbie'
      if (m.beef > 0) return 'beef'
      return m.paid === day ? null : 'toll'
    }
    if (m.met === day) return null
    return tier <= 1 ? 'smoke' : tier === 2 ? 'friend' : 'boss'
  }

  // ten lei, fifteen more for every bit of shine you wear, a night rate, double if you ran
  fee(kind) {
    if (kind === 'newbie') return 1
    let f = 10 + this.look().rich * 15 + (this.night() ? 5 : 0)
    if (kind === 'beef' || kind === 'caught') f *= 2
    return Math.min(100, Math.round(f / 5) * 5)
  }

  // a fair chance to talk your way out, shown on the button
  odds(kind, mood = 0) {
    const g = this.game, pr = g.progress, L = this.look()
    const type = { patan: 0.25, stroitor: 0.15, badanta: 0.2, hot: 0.05 }[pr.type] || 0
    let k = 0.3 + L.gop * 0.012 + pr.cred / 250 + type + mood * 0.08 + (L.track ? 0.08 : 0)
    if (this.night()) k -= 0.1
    if (L.suit) k -= 0.1
    k -= L.rich * 0.04
    if (kind === 'beef') k -= 0.15
    if (kind === 'caught') k -= 0.3
    if (kind === 'newbie') k += 0.2
    return clamp(k, 0.08, 0.92)
  }

  // ---- perception ----------------------------------------------------------------------------------
  // someone on the bench has you in view: in front of them (or right next to them), no wall between
  sees(s, P) {
    let best = null, bd = 1e9
    for (const n of s.npcs) {
      if (!this.able(n) || n.state === 'walk' || n.state === 'run') continue
      const dx = P.x - n.pos.x, dz = P.z - n.pos.z, d = Math.hypot(dx, dz)
      if (d > 22 || d >= bd) continue
      if (d > 5 && Math.abs(angleDiff(n.char.heading, Math.atan2(dx, dz))) > 1.95) continue
      best = n; bd = d
    }
    if (!best) return null
    if (bd > 4.5 && !clearSight(this.game, best.pos, P, best.state === 'sit' || best.state === 'squat' ? 1.1 : 1.55)) return null
    return best
  }

  canMeet() {
    const g = this.game, p = g.player
    return !!p && !g.story.active && !p.vehicle && p.control && !p.char.ko && !p.scripted && !g.ui.modalOpen && !g.cutscene &&
      !g.street?.talking && !g.police.level && !g.home?.inside && !this.enc && !this.hang && g.state === 'play'
  }

  brain(dt) {
    const g = this.game, p = g.player
    const P = p.vehicle ? p.vehicle.pos : p.pos
    // a dialogue just now (theirs or anyone's): give it a moment before the next walk-over
    if (g.ui.modalOpen || g.street?.talking) this.nextEnc = Math.max(this.nextEnc, this.clock + 6)
    const free = this.canMeet()
    const yard = blockAt(P.x, P.z)
    for (const s of this.benches()) {
      const m = this.mem(s)
      const d = dist(s, P)
      if (d > 40) { m.alert = 0; continue }
      if (this.inFight(s)) { m.cd = Math.max(m.cd, this.clock + 90); m.alert = 0; continue }
      // you're talking to one of them yourself: they leave the walking over to you (and you've met)
      const talking = g.street?.talking
      if (talking && s.npcs.includes(talking)) { m.cd = Math.max(m.cd, this.clock + 60); m.alert = 0; m.met = m.paid = this.day(); continue }
      const w = this.sees(s, P)
      m.alert = w ? Math.min(1.6, m.alert + dt * (d < 8 ? 1.6 : d < 14 ? 0.9 : 0.5)) : Math.max(0, m.alert - dt * 0.3)
      if (!w || m.alert < 1 || !free) continue
      const back = this.favor?.s === s && this.favor.stage === 'back'
      if (!back && (this.clock < m.cd || this.clock < this.nextEnc)) continue
      const kind = this.kindFor(s)
      const near = s.npcs.some((n) => dist(n.pos, P) < 3.2)
      // friends let you walk up and talk (E); strangers come to you, but only in their own yard
      // (and on the pavement round it): across the road it's a shout, not a walk
      if (near && kind && !TOLL.includes(kind) && kind !== 'back') continue
      if (!kind || (yard !== (s.blk ||= blockAt(s.x, s.z)) && !back)) { if (d < 16) this.nod(s, w); continue }
      this.approach(s, kind)
      return
    }
  }

  // no business with you today: a word or a nod as you pass
  nod(s, w) {
    const g = this.game, pr = g.progress, m = this.mem(s)
    m.cd = this.clock + 40
    if (this.clock < m.bark) return
    m.bark = this.clock + 25 + Math.random() * 15
    const tier = pr.tier('gop'), crew = this.crewNear()
    let line
    if (tier === 0 && crew.length) line = this.fill(pick(HOOD.withCrew), { name: crew[0].stName || 'Jora' })
    else if (tier === 0 && m.paid === this.day()) line = this.fill(pick(HOOD.paidToday))
    else line = this.fill(pick(GOP.bark[tier]))
    w.say(line, 2.6)
    if (tier >= 3 && w.state !== 'sit' && w.state !== 'squat' && !w.char.anim.busy) w.char.anim.play('wave')
  }

  // ---- one of them comes over -----------------------------------------------------------------------
  approach(s, kind) {
    const g = this.game, p = g.player
    let lead = null, bd = 1e9
    for (const n of s.npcs) {
      if (!this.able(n)) continue
      const d = dist(n.pos, p.pos) + (n.state === 'sit' ? 1.5 : 0)
      if (d < bd) { bd = d; lead = n }
    }
    if (!lead) return
    const m = this.mem(s)
    m.cd = this.clock + 150
    m.alert = 0
    this.nextEnc = this.clock + 20
    const e = this.enc = { s, lead, kind, t: 0, re: 0, phase: 'walk', standers: [] }
    lead.path = []; lead.onArrive = null
    lead.speed = kind === 'boss' ? 1.9 : 1.55
    // what you're wearing is the first thing they comment on
    const L = this.look()
    const call = kind === 'toll' && L.suit ? HOOD.call.tollSuit : kind === 'toll' && L.track ? HOOD.call.tollTrack : HOOD.call[kind] || HOOD.call.toll
    lead.say(this.fill(pick(call)), 2.6)
    this.stepTo(lead, p.pos, false)
    // the rest turn to watch; for the boss, the whole bench gets up
    for (const n of s.npcs) {
      if (n === lead || !this.able(n)) continue
      if (kind === 'boss') { n.state = 'idle'; n.char.anim.play('cheer'); e.standers.push(n) }
      if (n.state !== 'sit') n.turnBack = Math.atan2(p.pos.x - n.pos.x, p.pos.z - n.pos.z)
    }
    g.events.emit('hood:approach', { spot: s, kind, lead })
  }

  stepTo(n, at, run) { n.walkTo(at.x, at.z, { run, onArrive: (m) => { m.state = 'idle'; m.vel.set(0, 0, 0) } }) }

  alive(e) { return this.enc === e && !e.lead.disposed && !e.lead.char.ko }

  updateEnc(dt) {
    const e = this.enc
    if (!e) return
    const g = this.game, p = g.player, n = e.lead
    e.t += dt
    if (e.phase === 'talk') return
    if (n.disposed || n.char.ko || n.hostile || n.state === 'fight' || n.state === 'flee' || n.crew) return this.endEnc(false)
    if (g.story.active) return this.endEnc(true)
    if (g.police.level > 0) return this.endEnc(true, pick(HOOD.cops))
    if (e.phase === 'chase') return this.updateChase(e, dt)
    if (p.vehicle) return this.endEnc(true, pick(HOOD.inCar))
    const d = dist(n.pos, p.pos)
    const toll = TOLL.includes(e.kind)
    // you walked off before he got to you: sprint off from a toll and two of them come after you
    if (d > 15 || e.t > 16) {
      if (toll && e.kind !== 'newbie' && p.char.speed > 6.5 && d < 24) return this.startChase(e, 0)
      return this.endEnc(true, pick(toll ? HOOD.gaveUp : HOOD.gaveUpFriend))
    }
    if (d > 1.9) {
      e.re -= dt
      if (e.re <= 0) { e.re = 0.35; this.stepTo(n, p.pos, toll && d > 6) }
      return
    }
    if (g.ui.modalOpen || g.cutscene || g.street?.talking || !p.control || p.char.ko) { n.path = []; n.state = 'idle'; n.vel.set(0, 0, 0); return }
    e.phase = 'talk'
    this.talk(e)
  }

  endEnc(home = true, line = null) {
    const e = this.enc
    if (!e) return
    this.enc = null
    const g = this.game
    for (const n of new Set([e.lead, ...(e.runners || [])])) {
      if (n.disposed) continue
      n.speed = 1.2; n.runSpeed = 5.2
      if (home && !n.hostile && !n.crew && !n.char.ko && n.state !== 'fight') g.life.goHome(n)
    }
    for (const n of e.standers) if (!n.disposed && !n.hostile && !n.crew && n.state === 'idle' && n.ambient) n.state = n.ambient.state || 'idle'
    for (const n of e.s.npcs || []) if (!n.disposed && n.ambient && !n.hostile && n !== e.lead) n.turnBack = n.ambient.ry
    if (line && !e.lead.disposed) e.lead.say(this.fill(line), 2.8)
    this.mem(e.s).cd = Math.max(this.mem(e.s).cd, this.clock + 90)
    this.nextEnc = this.clock + 20
  }

  abort() {
    const e = this.enc
    if (!e || e.phase === 'talk') return
    this.endEnc(true)
  }

  // ---- the talk --------------------------------------------------------------------------------------
  ask(n, line, choices, vars) {
    const g = this.game
    return g.ui.dialogue(g.street.speaker(n), [this.fill(line, vars)], { choices: choices.map((c) => ({ ...c, text: this.fill(c.text, vars) })), focus: n })
  }

  async talk(e) {
    const g = this.game, p = g.player, n = e.lead
    n.path = []; n.onArrive = null; n.state = 'talk'; n.vel.set(0, 0, 0)
    n.char.lookAtNow(p.pos.x, p.pos.z); p.char.lookAtNow(n.pos.x, n.pos.z)
    // respect may have moved while he walked over
    if (e.kind !== 'back' && e.kind !== 'caught') e.kind = this.kindFor(e.s) || 'hello'
    let r = 'home'
    try {
      if (TOLL.includes(e.kind)) r = await this.toll(e, e.kind)
      else if (e.kind === 'back') r = await this.handIn(e)
      else if (e.kind === 'hello') n.say(this.fill(pick(GOP.bark[g.progress.tier('gop')])), 2.6)
      else r = await this.friendly(e, e.kind)
    } catch (err) { console.error(err) }
    if (this.enc !== e) return
    if (r === 'chase') return this.startChase(e, 0.7)
    this.endEnc(r !== 'fight' && r !== 'crew')
    if (r === 'squat') this.startHang(e.s)
  }

  // ---- strangers: the toll -----------------------------------------------------------------------------
  async toll(e, kind) {
    const g = this.game, pr = g.progress, n = e.lead, s = e.s, m = this.mem(s), day = this.day()
    const newbie = kind === 'newbie'
    let mood = 0, re = ''
    // the classic openers, first time you meet
    if (kind === 'toll' || newbie) {
      const op = pick(HOOD.open)
      const i = await this.ask(n, op.line, op.a.map((a) => ({ text: a.text, cost: a.lei ? `${a.lei} lei` : undefined, disabled: !!a.lei && pr.lei < a.lei })))
      if (!this.alive(e)) return 'home'
      const a = op.a[i] || op.a[0]
      if (a.lei && !pr.spend(a.lei)) return 'home'
      mood = a.mood + (i === 0 && pr.type === 'patan' ? 1 : 0)
      re = a.re + ' '
    }
    m.met = day
    const L = this.look()
    if (L.track) mood += 1   // three stripes: halfway to being one of them
    const fee = this.fee(kind), odds = this.odds(kind, mood)
    const askLine = newbie ? pick(HOOD.askNewbie) : kind === 'beef' ? pick(HOOD.askBeef) : kind === 'caught' ? pick(HOOD.askCaught)
      : L.suit ? pick(HOOD.askSuit) : this.night() ? pick(HOOD.askNight) : pick(HOOD.ask)
    const fight = newbie ? '😒' : '👊'
    const choices = [
      { text: newbie ? 'Na, un leu. Bine v-am găsit.' : `Na, ${fee} lei. Să fie pace.`, cost: `${fee} ${fee === 1 ? 'leu' : 'lei'}`, disabled: pr.lei < fee },
      { text: HOOD.talkOut[pr.type] || HOOD.talkOut.any, cost: `🗣 ${Math.round(odds * 100)}%` },
      { text: 'N-am nimic pentru voi.', cost: fight },
    ]
    if (kind !== 'caught') choices.push({ text: '(O iei la fugă)', cost: '🏃' })
    // the thief from "logistics" has a third way out
    if (pr.perk.pickpocket && !newbie) choices.push({ text: HOOD.lift, cost: 'hoț', lift: true })
    let j = await this.ask(n, re + askLine, choices, { fee: words(fee) })
    if (!this.alive(e)) return 'home'
    if (choices[j]?.lift) {
      if (Math.random() < 0.55) {
        m.paid = day
        pr.addLei(10 + Math.floor(Math.random() * 5) * 5, 'Din buzunarul gopnicului')
        pr.addXp(10)
        n.say(this.fill(HOOD.liftOk), 3.2)
        return 'home'
      }
      n.say(this.fill(HOOD.liftNo), 2.6)
      g.life.groupFight(s.npcs.filter((q) => q.archetype === 'gopnik' && !q.crew && !q.char.ko), { provoked: false })
      return 'fight'
    }
    // talking your way out: on a miss the price doubles
    if (j === 1) {
      if (Math.random() < odds) {
        m.paid = day; m.beef = 0
        pr.addRespect('gop', 2, 'te-ai descurcat din gură')
        pr.addXp(10)
        n.say(this.fill(HOOD.talkOkType[pr.type] || pick(HOOD.talkOk)), 3.2)
        return 'home'
      }
      const fee2 = newbie ? 2 : Math.min(100, fee * 2)
      const k = await this.ask(n, `${pick(HOOD.talkNo)} Acu\' ${words(fee2)} lei.`, [
        { text: `Bine, bine. Na, ${fee2} lei.`, cost: `${fee2} lei`, disabled: pr.lei < fee2 },
        { text: 'N-am nimic pentru voi.', cost: fight },
        { text: '(O iei la fugă)', cost: '🏃' },
      ])
      if (!this.alive(e)) return 'home'
      if (k === 0) return this.paid(e, fee2, newbie)
      j = k === 1 ? 2 : 3
    }
    if (j === 0) return this.paid(e, fee, newbie)
    if (j === 2) return this.refused(e, newbie)
    // running: the newcomer's lot just laughs
    if (newbie) { n.say(this.fill(pick(HOOD.runNewbie)), 2.6); return 'home' }
    return 'chase'
  }

  // the toll right now, from whoever you point at (the old one-shot shakedown, kept for callers)
  async tollNow(s, n) {
    if (!s || !n || n.disposed) return
    if (this.enc) this.endEnc(false)
    const e = this.enc = { s, lead: n, kind: 'toll', t: 0, re: 0, phase: 'talk', standers: [] }
    const p = this.game.player
    n.path = []; n.onArrive = null; n.state = 'talk'; n.vel.set(0, 0, 0)
    n.char.lookAtNow(p.pos.x, p.pos.z)
    let r = 'home'
    try { r = await this.toll(e, 'toll') } catch (err) { console.error(err) }
    if (this.enc !== e) return
    if (r === 'chase') this.startChase(e, 0.7)
    else this.endEnc(r !== 'fight')
  }

  paid(e, fee, newbie) {
    const g = this.game, pr = g.progress, m = this.mem(e.s)
    if (!pr.spend(fee)) return 'home'
    m.paid = this.day(); m.beef = 0
    pr.addRespect('gop', 1)
    e.lead.say(this.fill(pick(newbie ? HOOD.paidNewbie : HOOD.paid)), 3)
    g.life.incident('shake', { lei: fee, spot: e.s })
    return 'home'
  }

  refused(e, newbie) {
    const g = this.game, n = e.lead
    if (newbie) { n.say(this.fill(pick(HOOD.refuseNewbie)), 3); this.spit(n); return 'home' }
    n.say(this.fill(pick(HOOD.refuse)), 2.6)
    g.life.groupFight(e.s.npcs.filter((m) => m.archetype === 'gopnik' && !m.crew && !m.char.ko), { provoked: false })
    return 'fight'
  }

  // two of them after you for a few seconds; you get a head start
  startChase(e, head = 0.6) {
    const g = this.game, p = g.player, n = e.lead
    e.phase = 'chase'; e.ct = -head; e.re = 0; e.caughtT = 0
    let mate = null, bd = 1e9
    for (const m of e.s.npcs) { if (m === n || !this.able(m)) continue; const d = dist(m.pos, p.pos); if (d < bd) { bd = d; mate = m } }
    e.runners = mate ? [n, mate] : [n]
    for (const r of e.runners) { r.runSpeed = 5.7; r.path = []; r.state = 'idle' }
    n.say(this.fill(pick(HOOD.run)), 2.2)
    g.events.emit('hood:chase', { spot: e.s })
  }

  updateChase(e, dt) {
    const g = this.game, p = g.player, pr = g.progress
    e.ct += dt
    let dMin = 1e9
    for (const r of e.runners) if (this.able(r)) dMin = Math.min(dMin, dist(r.pos, p.pos))
    if (e.ct > 0) {
      e.re -= dt
      if (e.re <= 0) { e.re = 0.3; for (const r of e.runners) if (this.able(r)) this.stepTo(r, p.pos, true) }
    }
    if (dMin < 1.5 && !p.vehicle) {
      e.caughtT += dt
      if (e.caughtT > 0.25 && !g.ui.modalOpen && !g.cutscene && !g.street?.talking) {
        for (const r of e.runners) if (this.able(r)) { r.path = []; r.state = 'idle'; r.vel.set(0, 0, 0) }
        e.kind = 'caught'; e.phase = 'talk'
        return this.talk(e)
      }
      return
    }
    e.caughtT = 0
    if (e.ct > 10 || dMin > 24 || p.vehicle || dMin === 1e9) {
      this.mem(e.s).beef = 1
      pr.addRespect('gop', -2, 'ai fugit')
      this.endEnc(true, pick(HOOD.escaped))
    }
  }

  // ---- people who know you ---------------------------------------------------------------------------------
  async friendly(e, kind) {
    const g = this.game, pr = g.progress, n = e.lead, s = e.s
    this.mem(s).met = this.day()
    let line = pick(HOOD[kind])
    for (let k = 0; k < 6; k++) {
      const opts = this.friendlyOpts(e, kind)
      const i = await this.ask(n, line, opts)
      if (!this.alive(e)) return 'home'
      const o = opts[i] || opts[opts.length - 1]
      const r = (await o.run()) || { end: true }
      if (r.end) { if (r.line && !n.disposed) n.say(this.fill(r.line, r.vars), 3.2); return r.result || 'home' }
      line = this.fill(r.line || '…', r.vars)
      if (!this.alive(e)) return 'home'
    }
    return 'home'
  }

  friendlyOpts(e, kind) {
    const g = this.game, pr = g.progress, n = e.lead, s = e.s, st = g.street
    const seeds = pr.price(5)
    const out = []
    const seedsOpt = { text: 'Serviți semințe, [[bratan|băieți]].', cost: `${seeds} lei`, disabled: pr.lei < seeds, run: () => st.gopSeeds(n, seeds) }
    const gossip = { text: 'Ce se mai aude pe cartier?', run: () => this.gossip(n) }
    const favor = { text: 'Aveți vreo treabă pentru mine?', cost: '💰', run: () => this.offerFavor(e) }
    const squat = { text: 'Hai, stau un pic cu voi.', cost: '🌻', run: () => ({ end: true, result: 'squat' }) }
    const bye = { text: kind === 'boss' ? 'Stați liniștiți. Pa.' : 'Mă grăbesc, pacani. Pa.', run: () => ({ end: true, line: pick(HOOD.bye) }) }
    if (kind === 'smoke') out.push(seedsOpt, gossip, favor)
    else if (kind === 'friend') out.push(squat, favor, gossip, seedsOpt)
    else {
      const m = this.mem(s)
      out.push({ text: 'Cota mea, pacani.', cost: m.cut === this.day() ? '✓ azi' : '💰', run: () => this.cut(s) })
      out.push({ text: 'Vine careva cu mine?', cost: g.crew.full ? 'gașca-i plină' : 'gratis', disabled: g.crew.full, run: () => this.recruit(e) })
      out.push(favor, squat)
    }
    out.push(bye)
    return out
  }

  gossip(n) {
    const g = this.game, pr = g.progress, st = g.street, mem = st.mem(n), day = this.day()
    if (mem.chatDay !== day && st.cap('gopChat', 4)) { mem.chatDay = day; pr.addRespect('gop', 2) }
    // friends let you in on things: a dossier or a pothole on the map, once per bench a day
    if (pr.tier('gop') >= 1 && mem.tipDay !== day && Math.random() < 0.65) {
      const t = st.tipDosar() || st.tipPothole()
      if (t) { mem.tipDay = day; return { line: pick(GOP.tip), vars: { place: t } } }
    }
    return { line: pick(Math.random() < 0.5 ? HOOD.gossip : GOP.chat) }
  }

  cut(s) {
    const pr = this.game.progress, m = this.mem(s)
    if (m.cut === this.day()) return { line: HOOD.cutAgain }
    m.cut = this.day()
    pr.addLei(10 + Math.floor(Math.random() * 5) * 5, 'Cota de la bancă')
    pr.addXp(5)
    return { line: pick(HOOD.cut) }
  }

  recruit(e) {
    const g = this.game
    if (g.crew.full) return { line: pick(GOP.crewFull) }
    g.street.name(e.lead)
    g.crew.recruit(e.lead, 300)
    g.ui.notify(`👊 ${e.lead.stName} vine cu tine. {y}[E]{/y} lângă el: ordine.`, 4, 'gold')
    return { end: true, line: pick(HOOD.recruitFree), result: 'crew' }
  }

  // ---- favours -----------------------------------------------------------------------------------------
  planFavor(kind, s) {
    const g = this.game, w = g.world, P = g.player.pos
    if (kind === 'bere') {
      let best = null, bd = 450
      w.kiosks.forEach((k) => { if (k.label !== 'CVAS') return; const q = { x: k.x + Math.sin(k.ry) * 1.8, z: k.z + Math.cos(k.ry) * 1.8, label: 'CVAS' }; const d = dist(q, s); if (d < bd) { bd = d; best = q } })
      w.shops.forEach((q) => { if (q.label !== 'BERE LA HALBĂ') return; const d = dist(q, s); if (d < bd) { bd = d; best = { x: q.x, z: q.z, label: 'BERE LA HALBĂ' } } })
      if (!best) return null
      return { kind, s, stage: 'go', to: best, place: best.label === 'CVAS' ? 'Cvas' : 'Bere la halbă', limit: 480 }
    }
    if (kind === 'pachet') {
      const L = g.ambient.spots.filter((q) => q.archetype === 'gopnik' && q !== s && dist(q, s) > 60 && dist(q, s) < 330)
      const q = pick(L)
      if (!q) return null
      return { kind, s, stage: 'go', to: { x: q.x, z: q.z }, dest: q, place: g.street.placeName(q.x, q.z), limit: 540 }
    }
    if (kind === 'datornic') {
      const L = g.peds.list.filter((n) => n.archetype === 'civilian' && n.state === 'walk' && !n.onRoad && !n.chat && !n.debtor && !n.persistent && dist(n.pos, P) > 16 && dist(n.pos, P) < 70)
      const t = pick(L)
      if (!t) return null
      return { kind, s, stage: 'go', target: t, place: '', limit: 360 }
    }
    return null
  }

  async offerFavor(e) {
    const g = this.game, pr = g.progress, n = e.lead, s = e.s
    if (this.favor) return { line: HOOD.favor.busy }
    const kinds = pr.tier('gop') <= 1 ? ['bere'] : shuffle(['bere', 'pachet', 'datornic'])
    let f = null
    for (const k of kinds) { f = this.planFavor(k, s); if (f) break }
    if (!f) return { line: 'Acu\' n-avem nimic pentru tine. Treci mâine, poate.' }
    const F = HOOD.favor[f.kind]
    const reward = { bere: '+respect · +5 lei', pachet: '+respect · +25 lei', datornic: '+respect · +10 lei' }[f.kind]
    const i = await this.ask(n, F.offer, [{ text: F.accept, cost: reward }, { text: F.decline }], { place: f.place })
    if (!this.alive(e)) return { end: true }
    if (i !== 0) return { line: 'Normalno. Altă dată.' }
    this.favor = f
    f.t = 0
    if (f.kind === 'bere') pr.addLei(20, 'De la pacani, pentru bere')
    if (f.kind === 'datornic') { f.target.debtor = f; f.target.persistent = true }
    g.ui.tip(this.fill(F.tip, { place: f.place }), 8)
    return { end: true, line: 'Davai. Te așteptăm aici.' }
  }

  endFavor(ok, note = null) {
    const f = this.favor
    if (!f) return
    this.favor = null
    if (f.target && !f.target.disposed) { f.target.debtor = null; f.target.persistent = false }
    if (!ok) {
      this.game.progress.addRespect('gop', -2, 'ai lăsat pacanii baltă')
      if (note) this.game.ui.notify(this.fill(note), 3.6, 'red')
    }
  }

  updateFavor(dt) {
    const f = this.favor
    if (!f) return
    const g = this.game, p = g.player, pr = g.progress
    f.t += dt
    if (f.t > f.limit) return this.endFavor(false, HOOD.favor.late)
    if (f.kind === 'pachet' && f.stage === 'go' && g.police.level >= 2) return this.endFavor(false, HOOD.favor.pachet.cops)
    if (f.kind === 'datornic' && f.stage === 'go' && (!f.target || f.target.disposed)) return this.endFavor(false, HOOD.favor.datornic.gone)
    // the package is handed over at the other bench (anyone there takes it; nobody there, under the bench it goes)
    if (f.kind === 'pachet' && f.stage === 'go' && !p.vehicle && dist(p.pos, f.to) < 5) {
      const other = (f.dest.npcs || []).find((n) => this.able(n))
      if (other) { other.char.lookAtNow(p.pos.x, p.pos.z); other.say(this.fill(HOOD.favor.pachet.got), 3.2) }
      pr.addLei(25, 'Pentru drum, de la pacani')
      pr.addRespect('gop', 6, 'ai dus pachetul')
      pr.addXp(30, 'Curier de cartier')
      g.audio?.sfx('pickup', { bus: 'ui' })
      this.favor = null
      return
    }
    // back at the bench with the goods: they come to you (or you walk right up)
    if (f.stage === 'back' && f.s.npcs && !this.enc && this.canMeet() && !p.vehicle && dist(p.pos, f.s) < 14) {
      if (!this.inFight(f.s)) this.approach(f.s, 'back')
    }
  }

  onBuy({ shop }) {
    const f = this.favor
    if (f?.kind === 'bere' && f.stage === 'go' && (shop === 'CVAS' || shop === 'BERE LA HALBĂ')) {
      f.stage = 'back'
      this.game.ui.tip('Du {y}băutura{/y} la pacanii de pe bancă.', 6)
    }
  }

  // the debtor was told (StreetTalk offers the line when you talk to him)
  debtorPaid(n) {
    const f = this.favor
    if (!f || f.target !== n) return null
    f.stage = 'back'
    n.debtor = null; n.persistent = false
    this.game.progress.addLei(30, 'De la datornic, pentru pacani')
    this.game.ui.tip('Du {y}banii{/y} la pacanii de pe bancă.', 6)
    return HOOD.favor.datornic.pay
  }

  async handIn(e) {
    const g = this.game, pr = g.progress, n = e.lead, f = this.favor
    if (!f || f.s !== e.s) return 'home'
    if (f.kind === 'bere') {
      await this.ask(n, pick(HOOD.call.back), [{ text: 'Poftiți. Rece, ca la mama în frigider.' }])
      this.favor = null
      pr.addLei(5, 'Pentru picioare')
      pr.addRespect('gop', 6, 'ai adus berea')
      pr.addXp(20, 'Bere pentru bancă')
      n.say(this.fill(HOOD.favor.bere.back), 3.2)
      n.char.anim.play('cheer')
      return 'home'
    }
    // the debt collected: hand over twenty, or pretend he never paid
    const i = await this.ask(n, pick(HOOD.call.back), [
      { text: 'A dat. Poftiți douăzeci, zece-s ale mele.', cost: '−20 lei', disabled: pr.lei < 20 },
      { text: 'N-a dat nimic. Zice că joi.', cost: '🤥' },
    ])
    this.favor = null
    if (i === 0 && pr.spend(20)) {
      pr.addRespect('gop', 8, 'ai adus datoria')
      pr.addXp(30, 'Colector de cartier')
      n.say(this.fill(HOOD.favor.datornic.back), 3.2)
      return 'home'
    }
    // they asked him themselves already
    if (Math.random() < 0.5) {
      pr.addRespect('gop', -10, 'ai mințit pacanii')
      this.mem(e.s).beef = 1
      n.say(this.fill('Joi? Noi l-am sunat. O zis că ți-a dat treizeci. Ai o problemă, [[bratan|tanti]].'), 3.4)
      return 'home'
    }
    n.say(this.fill('Joi… Mereu joi. Bine. Mersi oricum.'), 3)
    return 'home'
  }

  // ---- on your heels with the lads -------------------------------------------------------------------------
  startHang(s) {
    const g = this.game, p = g.player
    if (!s.npcs || this.hang) return
    // a free spot in the circle, a step off the squatters
    let best = null, bs = -1
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2, x = s.x + Math.sin(a) * 1.9, z = s.z + Math.cos(a) * 1.9
      let m = 1e9
      for (const n of s.npcs) m = Math.min(m, dist(n.pos, { x, z }))
      m -= dist({ x, z }, p.pos) * 0.1
      if (m > bs) { bs = m; best = { x, z } }
    }
    this.hang = { s, t: 0, sayT: 1.6, acc: 0, phase: 'walk' }
    p.scripted = { x: best.x, z: best.z, speed: 2.2, onArrive: () => this.sitDown() }
  }

  sitDown() {
    const h = this.hang, p = this.game.player
    if (!h || h.phase === 'sit') return
    h.phase = 'sit'; h.t = 0
    p.scripted = null
    p.char.lookAtNow(h.s.x, h.s.z)
    p.char.anim.play('squatdown')
    p.control = false
    this.game.ui.tip('Stai pe vine cu pacanii. Mișcă-te ca să pleci.', 4)
  }

  updateHang(dt) {
    const h = this.hang
    if (!h) return
    const g = this.game, p = g.player, pr = g.progress, s = h.s
    h.t += dt
    const abort = !!g.story.active || g.police.level > 0 || !s.npcs || p.char.ko || g.cutscene || p.vehicle || this.inFight(s)
    if (h.phase === 'walk') {
      if (abort) return this.endHang(false)
      if (h.t > 5) this.sitDown()   // a bench leg in the way: squat where you are
      return
    }
    const mv = g.input.move()
    if (abort || mv.x || mv.y || g.input.pressed('attack') || g.input.pressed('interact') || g.input.pressed('jump') || h.t > 90) {
      g.input.consume('interact')   // getting up isn't a request to talk to whoever's next to you
      return this.endHang(!abort)
    }
    h.sayT -= dt
    if (h.sayT <= 0 && !g.ui.modalOpen) {
      h.sayT = 4 + Math.random() * 3
      const n = pick(s.npcs.filter((m) => this.able(m)))
      if (n) { n.say(this.fill(pick(HOOD.squat)), 3.2); if (Math.random() < 0.5) this.spit(n) }
    }
    // their company: a little health back, a little respect (up to +6 a day per bench)
    pr.heal(dt * 0.6)
    h.acc += dt
    if (h.acc > 12) {
      h.acc = 0
      const m = this.mem(s), day = this.day()
      if (m.hangDay !== day) { m.hangDay = day; m.hangGain = 0 }
      if (m.hangGain < 6) { m.hangGain += 2; pr.addRespect('gop', 2, 'stat pe vine cu pacanii') }
    }
  }

  endHang(say = true) {
    const h = this.hang
    if (!h) return
    this.hang = null
    const g = this.game, p = g.player
    p.char.anim.stop('squatdown')
    if (p.scripted && h.phase === 'walk') p.scripted = null
    if (h.phase === 'sit') p.control = true
    this.mem(h.s).cd = Math.max(this.mem(h.s).cd, this.clock + 60)
    const n = say && h.s.npcs ? pick(h.s.npcs.filter((m) => this.able(m))) : null
    if (n) n.say(this.fill(pick(HOOD.squatBye)), 2.8)
  }

  // ---- the yard's own life ------------------------------------------------------------------------------
  castBench() {
    const g = this.game, c = g.story.cast, cs = this.castSpot
    cs.npcs = ['vitea', 'gop2', 'gop3'].map((k) => c[k]).filter((n) => n && !n.disposed && n.char.visible)
    const gc = g.world.places.gopnici_curte
    if (gc) { cs.x = gc.x; cs.z = gc.z }
    return cs.npcs.length && !g.story.active ? cs : null
  }

  life(dt) {
    const g = this.game, p = g.player, pr = g.progress
    const P = p.vehicle ? p.vehicle.pos : p.pos
    const list = this.benches()
    const cs = this.castBench()
    if (cs) list.push(cs)
    const honk = p.vehicle && this.honked
    this.honked = false
    this.backup()
    for (const s of list) {
      const d = dist(s, P)
      if (d > 34) continue
      const m = this.mem(s)
      if (this.enc?.s === s || this.hang?.s === s || this.inFight(s)) continue
      // the show's over: back to facing each other
      if (m.cheerEnd && this.clock > m.cheerEnd) { m.cheerEnd = 0; for (const n of s.npcs) if (n.ambient && this.able(n)) n.turnBack = n.ambient.ry }
      const ppl = s.npcs.filter((n) => this.able(n) && !n.char.anim.busy)
      if (!ppl.length) continue
      // your car: honks, fly-bys, and whatever you pulled up in
      if (p.vehicle && d < 18) {
        const v = p.vehicle, sp = Math.abs(v.speed)
        if (honk) { m.car = this.clock + 20; pick(ppl).say(this.fill(pick(HOOD.car.horn)), 2.6); continue }
        if (sp > 13 && d < 11 && this.clock > m.car) { m.car = this.clock + 15; for (const n of ppl.slice(0, 2)) n.say(this.fill(pick(HOOD.car.fast)), 2.2); continue }
        if (sp < 5 && d < 14 && this.clock > m.car) {
          m.car = this.clock + 45
          const k = v.def.police ? 'police' : v.def.taxi ? 'taxi' : HOOD.car[v.kind] ? v.kind : 'any'
          const n = pick(ppl)
          n.say(this.fill(pick(HOOD.car[k])), 3)
          if (k !== 'police' && n.state !== 'sit' && n.state !== 'squat') n.char.anim.play('point')
          continue
        }
      }
      // passing by: the story lads greet you by what you've been through together
      if (s.story && !p.vehicle && d < 10 && this.clock > m.bark) {
        m.bark = this.clock + 35 + Math.random() * 20
        const n = pick(ppl)
        n.say(this.fill(pick(this.castLines())), 2.8)
        if (n.state === 'idle' && !n.char.anim.busy) n.char.anim.play('wave')
        continue
      }
      // among themselves
      if (d < 28 && this.clock > m.banter && ppl.length >= 2) {
        m.banter = this.clock + 22 + Math.random() * 22
        this.banter(ppl)
        continue
      }
      if (d < 22 && this.clock > m.spit) { m.spit = this.clock + 5 + Math.random() * 9; this.spit(pick(ppl)) }
    }
    // the lads turn their heads after you (story lads keep their spot: only the head follows)
    for (const n of this.castSpot.npcs) {
      if (n.disposed || n.char.ko) continue
      const d = dist(n.pos, P)
      const want = cs && d < 9 ? clamp(angleDiff(n.char.heading, Math.atan2(P.x - n.pos.x, P.z - n.pos.z)), -1, 1) : 0
      n.char.anim.lookYaw += (want - n.char.anim.lookYaw) * 0.35
    }
  }

  // at Bratan the nearest bench won't watch you get jumped: two of them come to help
  backup() {
    const g = this.game, p = g.player
    for (const q of [...(this.helpers || [])]) {
      const t = q.target
      if (q.disposed || q.char.ko || !t || t.disposed || t.char.ko || this.clock > q.helpUntil || q.state !== 'fight') {
        this.helpers.splice(this.helpers.indexOf(q), 1)
        if (!q.disposed && !q.char.ko) { q.hostile = false; q.ally = false; q.state = 'idle'; g.life.goHome(q) }
        else if (!q.disposed) q.ally = false
      }
    }
    if (g.story.active || p.vehicle || g.progress.tier('gop') < 3 || (this.helpers?.length || 0) >= 2) return
    const threats = g.crew.threats().filter((t) => t.target === p)
    if (!threats.length) return
    for (const s of this.benches()) {
      if (dist(s, p.pos) > 22 || this.inFight(s) || this.enc?.s === s || threats.some((t) => s.npcs.includes(t))) continue
      const ppl = s.npcs.filter((n) => this.able(n)).slice(0, 2)
      if (!ppl.length) continue
      this.helpers ||= []
      for (const q of ppl) {
        let best = null, bd = 1e9
        for (const t of threats) { const d = dist(t.pos, q.pos); if (d < bd) { bd = d; best = t } }
        q.hostile = true; q.ally = true; q.state = 'fight'; q.target = best; q.path = []; q.helpUntil = this.clock + 25
        this.helpers.push(q)
      }
      ppl[0].say(this.fill('Pe-al nostru nu-l atinge nimeni!'), 2.4)
      return
    }
  }

  castLines() {
    const s = this.game.story, C = HOOD.cast
    if (s.isDone('mitingul')) return C.mitingul
    if (s.isDone('rapirea')) return C.rapirea
    if (s.isDone('cursa')) return C.cursa
    if (s.isDone('paine')) return C.paine.concat(C.early)
    return C.early
  }

  banter(ppl) {
    const pair = pick(this.night() ? HOOD.banterNight.concat(HOOD.banter.slice(0, 4)) : HOOD.banter)
    const who = shuffle(ppl)
    who[0].say(this.fill(pair[0]), 2.8)
    for (let i = 1; i < pair.length; i++) this.pending.push({ t: this.clock + 2.8 * i, n: who[i % who.length], text: this.fill(pair[i]) })
  }

  // a mouthful of husks, spat in an arc
  spit(n) {
    const fx = this.game.fx
    if (!n || n.char.ko || !n.char.visible || !fx?.bits) return
    const h = n.char.heading, sx = Math.sin(h), sz = Math.cos(h)
    const y = n.pos.y + (n.state === 'squat' ? 0.95 : n.state === 'sit' ? 1.2 : 1.55)
    for (let i = 0; i < 4; i++) {
      const s = 1.3 + Math.random() * 0.9, j = (Math.random() - 0.5) * 0.5
      fx.bits.emit(n.pos.x + sx * 0.25, y, n.pos.z + sz * 0.25, { vx: sx * s + sz * j, vy: 0.9 + Math.random() * 0.7, vz: sz * s - sx * j, life: 0.9, size: 0.05, color: [0.12, 0.1, 0.08], grav: 9, drag: 0.6, spin: 12 })
    }
  }

  // a fight nearby: the benches get up to watch and cheer (and at Bratan they come to help)
  onHit({ npc, attacker }) {
    if (!npc || !attacker) return
    const at = npc.pos
    const cs = this.castBench()
    if (cs && dist(cs, at) < 24 && !cs.npcs.includes(npc) && this.clock > (this.mem(cs).cheer || 0)) {
      this.mem(cs).cheer = this.clock + 8
      const n = pick(cs.npcs.filter((q) => this.able(q)))
      n?.say(this.fill(pick(HOOD.cheer)), 2.2)
    }
    for (const s of this.benches()) {
      if (dist(s, at) > 26 || s.npcs.includes(npc) || this.enc?.s === s || this.inFight(s)) continue
      const m = this.mem(s)
      if (this.clock < (m.cheer || 0)) continue
      m.cheer = this.clock + 6
      m.cheerEnd = this.clock + 7
      const ppl = s.npcs.filter((n) => this.able(n))
      if (!ppl.length) continue
      const n = pick(ppl)
      n.say(this.fill(pick(HOOD.cheer)), 2.2)
      for (const q of ppl) { if (q.state !== 'sit') q.turnBack = Math.atan2(at.x - q.pos.x, at.z - q.pos.z); else if (!q.char.anim.busy && Math.random() < 0.5) q.char.anim.play('cheer') }
    }
  }

  // ---- loop ------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game
    if (g.state !== 'play' || !g.player) return
    this.clock += dt
    if (g.player.vehicle && g.input.pressed('horn')) this.honked = true
    for (const q of [...this.pending]) {
      if (this.clock < q.t) continue
      this.pending.splice(this.pending.indexOf(q), 1)
      // the story lads drop the banter the moment a mission needs them
      if (q.n.personality === 'story' && g.story.active) continue
      if (!q.n.disposed && !q.n.char.ko && !q.n.hostile) q.n.say(q.text, 2.8)
    }
    this.updateEnc(dt)
    this.updateHang(dt)
    this.updateFavor(dt)
    this.brainT -= dt
    if (this.brainT <= 0) { this.brain(0.25 - this.brainT); this.brainT = 0.25 }
    this.lifeT -= dt
    if (this.lifeT <= 0) { this.lifeT = 0.5; this.life(0.5) }
  }

  tags() {
    const f = this.favor, out = []
    if (!f) return out
    const y = 0.4
    if (f.kind === 'datornic' && f.stage === 'go' && f.target && !f.target.disposed) out.push({ npc: f.target, icon: '💸', label: 'Datornicul' })
    else if (f.stage === 'back') out.push({ x: f.s.x, y, z: f.s.z, icon: '👊', label: 'Pacanii' })
    else if (f.kind === 'bere') out.push({ x: f.to.x, y, z: f.to.z, icon: '🍺', label: f.place })
    else if (f.kind === 'pachet') out.push({ x: f.to.x, y, z: f.to.z, icon: '📦', label: 'Pachetul' })
    return out
  }

  blips() {
    const f = this.favor
    if (!f) return []
    if (f.kind === 'datornic' && f.stage === 'go') return f.target && !f.target.disposed ? [{ kind: 'icon', x: f.target.pos.x, z: f.target.pos.z, icon: '💸' }] : []
    const at = f.stage === 'back' ? f.s : f.to
    return [{ kind: 'icon', x: at.x, z: at.z, icon: f.stage === 'back' ? '👊' : f.kind === 'bere' ? '🍺' : '📦' }]
  }
}
