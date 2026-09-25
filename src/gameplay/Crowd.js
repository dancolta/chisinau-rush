import { CROWD, BAB, COP } from '../data/streettalk.js'
import { fill } from '../story/hero.js'
import { angleDiff } from '../entities/Character.js'
import { Dogs } from './Dogs.js'

// Ordinary people around you. They glance at you when you're close and stop when you walk up
// to them (so you can talk), get uneasy when you stare, make way when you're coming through,
// complain when you shove them and remember it for a while. Violence makes them scream and
// run; somebody always ends up on the phone to the police (talk them out of it, or it's a
// star); grannies scold instead of running; kids point at cars. A few stand in line at the
// kiosks, sit down on a free bench for a bit, or walk the dog. People you helped greet you
// (and the tough ones have your back). At high respect the street makes way for you and nods.
// One brain four times a second over the people near you, with caps on everything.

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export class Crowd {
  constructor(game) {
    this.game = game
    this.clock = 0
    this.brainT = 0.15
    this.callers = []
    this.queues = new Map()   // kiosk -> people in line
    this.benchers = []
    this.stare = { n: null, t: 0 }
    this.nextCall = 0
    this.nextRoutine = 0
    this.dogs = new Dogs(game)
    game.events.on('player:crash', (e) => this.onCrash(e))
  }

  fill(s, vars) { return fill(this.game, s, vars) }
  mem(n) { return (n.mem ||= {}) }
  // one passing remark at a time: a crowd that all talks at once is noise
  speak(n, text, secs = 2.4, gap = 1.4) {
    if (this.clock < (this.lineT || 0)) return false
    this.lineT = this.clock + gap
    n.say(this.fill(text), secs)
    return true
  }
  // plain people: not gopniks at a bench, not cops on the job, not your crew, not story people
  plain(n) { return !n.disposed && !n.crew && !n.char.ko && n.personality !== 'story' && !n.hostile && n.state !== 'fight' && n.state !== 'knocked' && n.state !== 'riding' }
  free(n) { return this.plain(n) && !n.chat && !n.queue && !n.bench && !n.calling && !n.debtor && n.state === 'walk' && !n.onRoad }

  // ---- the police call -------------------------------------------------------------------------
  // a crime nobody in uniform saw: somebody nearby pulls out a phone (severity makes it likelier)
  report(c) {
    const g = this.game, P = { x: c.x, z: c.z }
    const sev = c.severity || 1
    // rudeness isn't worth a call; a punch, a stolen car or a hit-and-run is
    if (c.type === 'harass') return false
    if (this.clock < this.nextCall || this.callers.length || Math.random() > [0, 0.45, 0.8, 1][Math.min(3, sev)]) return false
    let best = null, bd = 1e9
    for (const n of g.peds.list) {
      if (!this.plain(n) || n.archetype === 'gopnik' || n.archetype === 'cop' || n.archetype === 'kid' || n.calling || c.victim === n && n.char.ko) continue
      const d = dist(n.pos, P)
      if (d < 3 || d > 32 || d >= bd) continue
      best = n; bd = d
    }
    if (!best) return false
    this.nextCall = this.clock + 20
    const n = best
    // run a few steps first, then the phone comes out
    n.calling = { t: 0, at: { x: c.x, z: c.z }, sev, phase: n.state === 'flee' ? 'run' : 'call' }
    this.callers.push(n)
    return true
  }

  updateCallers(dt) {
    const g = this.game, p = g.player
    for (const n of [...this.callers]) {
      const c = n.calling
      if (!c || n.disposed || n.char.ko || n.hostile || n.state === 'knocked') { this.dropCaller(n); continue }
      c.t += dt
      if (c.phase === 'run') {
        if (c.t < 1.8 && n.state === 'flee') continue
        c.phase = 'call'; c.t = 0
      }
      if (c.phase === 'call' && !c.dialled) {
        c.dialled = true
        n.path = []; n.state = 'phone'; n.vel.set(0, 0, 0)
        n.char.lookAtNow(c.at.x, c.at.z)
        n.say(this.fill(pick(CROWD.call)), 3.6)
        continue
      }
      // you're talking them out of it
      if (g.street?.talking === n) { c.t = Math.min(c.t, 1); continue }
      if (c.t > 5.5) {
        this.dropCaller(n)
        if (!g.police.enabled) continue
        const P = p.vehicle ? p.vehicle.pos : p.pos
        g.police.lastSeen = { x: P.x, z: P.z }
        g.police.addHeat(c.sev >= 2 ? 20 : 12)
        g.ui.notify(CROWD.callDone, 3, 'red')
      }
    }
  }

  dropCaller(n) {
    const i = this.callers.indexOf(n)
    if (i >= 0) this.callers.splice(i, 1)
    if (!n.calling) return
    n.calling = null
    if (n.disposed || n.state !== 'phone') return
    // talking to you right now: the phone goes away once you're done
    if (this.game.street?.talking === n) { n.hungUp = true; return }
    n.state = 'walk'; n.path = []; this.game.peds.repath(n)
  }

  cancelCalls() { for (const n of [...this.callers]) this.dropCaller(n) }

  // StreetTalk: "lasă telefonul" (twenty lei and they never saw a thing)
  hushCaller(n) {
    const pr = this.game.progress
    if (!n.calling || !pr.spend(20)) return null
    this.dropCaller(n)
    pr.addCivic(-1)
    return CROWD.callStopped
  }

  // ---- reactions around you ---------------------------------------------------------------------
  brain(dt) {
    const g = this.game, p = g.player, pr = g.progress
    if (!p || g.cutscene) return
    const P = p.pos, onFoot = !p.vehicle
    const sp = onFoot ? Math.hypot(p.vel.x, p.vel.z) : 0
    const fx = Math.sin(p.char.heading), fz = Math.cos(p.char.heading)
    const mvx = sp > 0.5 ? p.vel.x / sp : fx, mvz = sp > 0.5 ? p.vel.z / sp : fz
    const gop3 = pr.tier('gop') >= 3, pol3 = pr.tier('pol') >= 3, bab2 = pr.tier('bab') >= 2
    let stareAt = null, stareD = 7, reactors = 0
    const near = []
    for (const n of g.peds.list) {
      const d = dist(n.pos, P)
      if (d < 16) near.push([n, d])
    }
    near.sort((a, b) => a[1] - b[1])
    for (const [n, d] of near) {
      if (reactors >= 10) break
      if (!this.plain(n) || n.riding) continue
      reactors++
      const m = this.mem(n)
      const dx = n.pos.x - P.x, dz = n.pos.z - P.z
      const ahead = (dx * mvx + dz * mvz) / (d || 1)
      const facing = (dx * fx + dz * fz) / (d || 1)
      // a glance your way when you're close (heads only; the body keeps walking)
      const look = onFoot && d < 5 && n.state !== 'flee' ? Math.max(-1, Math.min(1, angleDiff(n.char.heading, Math.atan2(-dx, -dz)))) : 0
      n.char.anim.lookYaw += (look - n.char.anim.lookYaw) * 0.4
      if (!onFoot) { this.kid(n, d); continue }
      // you, right there: people who know you, remember you or salute you say so
      if (d < 4.5 && !g.ui.modalOpen && this.clock > (m.greetT || 0)) this.greet(n, m, d, { gop3, pol3, bab2 })
      // you walk up to someone and slow down: they stop for you ("yes?")
      if (n.state === 'walk' && d < 2.6 && sp < 2.2 && facing > 0.8 && !n.pause && !n.onRoad && n.archetype !== 'gopnik' && this.clock > (m.pauseT || 0)) {
        m.pauseT = this.clock + 20
        n.pause = { t: 5, path: n.path, onArrive: n.onArrive }
        n.path = []; n.state = 'idle'; n.vel.set(0, 0, 0)
        n.turnBack = Math.atan2(-dx, -dz)
        if (Math.random() < 0.4) this.speak(n, pick(CROWD.glance), 2)
      }
      // coming through: they make way (early and wide when the whole street knows you)
      if (n.state === 'walk' && sp > 1.6 && ahead > 0.85 && d < (gop3 ? 4.2 : 2.6)) {
        const side = (dx * -mvz + dz * mvx) >= 0 ? 1 : -1
        n.pushX = (n.pushX || 0) + -mvz * side * 1.2; n.pushZ = (n.pushZ || 0) + mvx * side * 1.2
        if (this.clock > (m.asideT || 0) && Math.random() < (gop3 ? 0.35 : 0.15)) { m.asideT = this.clock + 25; this.speak(n, pick(gop3 && n.archetype === 'civilian' ? CROWD.avoid : CROWD.aside), 1.8) }
      }
      // a granny who sees you tearing down the pavement
      if (n.archetype === 'babushka' && sp > 7 && d < 5 && this.clock > (m.scoldT || 0)) { m.scoldT = this.clock + 30; this.speak(n, pick(CROWD.scoldRun), 2.2) }
      if (d < stareD && facing > 0.94 && n.state !== 'flee') { stareD = d; stareAt = n }
    }
    this.updateStare(stareAt, sp, dt)
    // the granny on the bench you did an errand for
    if (onFoot) for (const n of g.ambient.npcs) {
      if (!n.mem?.helped || n.mem.thanked || n.char.ko || g.ui.modalOpen || dist(n.pos, P) > 5) continue
      this.greet(n, n.mem, 0, { gop3, pol3, bab2 })
    }
  }

  greet(n, m, d, { gop3, pol3, bab2 }) {
    const g = this.game
    let line = null, must = false
    // the ones that matter (you shoved them, you helped them) are always said
    if (m.shoved && this.clock - m.shovedAt > 20 && this.clock - m.shovedAt < 150 && !m.remembered) { m.remembered = true; must = true; line = pick(CROWD.remember) }
    else if (m.helped && !m.thanked) { m.thanked = true; must = true; line = pick(n.archetype === 'babushka' ? CROWD.helpedBab : CROWD.helped) }
    else if (n.archetype === 'cop' && pol3) line = pick(COP.salute)
    else if (n.archetype === 'gopnik' && gop3 && n.state === 'walk') line = pick(CROWD.nodGop)
    else if (n.archetype === 'babushka' && bab2 && Math.random() < 0.5) line = pick(BAB.pass)
    if (!line) { m.greetT = this.clock + 8; return }
    if (must) n.say(this.fill(line), 2.8)
    else if (!this.speak(n, line, 2.6, 2.5)) { m.greetT = this.clock + 3; return }
    m.greetT = this.clock + 45
    if (n.state === 'idle' && !n.char.anim.busy) n.char.anim.play('wave')
    // someone you gave money to has a tip for you
    if (m.helped && n.archetype === 'civilian' && Math.random() < 0.5) {
      const t = g.street?.tipDosar() || g.street?.tipPothole()
      if (t) setTimeout(() => { if (!n.disposed) n.say(this.fill('Ascultă, am văzut ceva pe lângă {place}. Ți-am pus pe hartă.', { place: t }), 3.2) }, 2600)
    }
  }

  // stand there staring at someone and they'll let you know how they feel about it
  updateStare(n, sp, dt) {
    const s = this.stare
    if (!n || sp > 0.4 || this.game.ui.modalOpen) { s.n = null; s.t = 0; return }
    if (s.n !== n) { s.n = n; s.t = 0 }
    s.t += dt
    const m = this.mem(n)
    if (s.t < 3 || this.clock < (m.stareT || 0)) return
    m.stareT = this.clock + 30
    s.t = 0
    const tough = n.personality === 'tough' || n.archetype === 'gopnik'
    n.say(this.fill(pick(n.archetype === 'babushka' ? CROWD.stareBab : tough ? CROWD.stareTough : CROWD.stare)), 2.6)
    if (n.state === 'walk' || n.state === 'idle') n.turnBack = Math.atan2(this.game.player.pos.x - n.pos.x, this.game.player.pos.z - n.pos.z)
    // twice, from a tough guy: now there's a problem
    m.stared = (m.stared || 0) + 1
    if (tough && m.stared >= 2 && !this.game.story.active) { n.hostile = true; n.state = 'fight'; n.target = this.game.player; n.path = [] }
  }

  // kids at the kerb: your car, and a police car with its siren going
  kid(n, d) {
    if (n.archetype !== 'kid') return
    const g = this.game, v = g.player.vehicle, m = this.mem(n)
    if (!v || d > 14 || this.clock < (m.pointT || 0) || Math.abs(v.speed) < 2) return
    m.pointT = this.clock + 20
    n.char.lookAtNow(v.pos.x, v.pos.z)
    if (!n.char.anim.busy) n.char.anim.play('point')
    n.say(this.fill(pick(CROWD.kid)), 2.4)
  }

  // shoved (StreetLife.bump): remember it, and a second shove soon after is one too many
  shoved(n) {
    const m = this.mem(n)
    const again = m.shoved && this.clock - m.shovedAt < 60
    m.shoved = (m.shoved || 0) + 1
    m.shovedAt = this.clock
    m.remembered = false
    if (!again || n.archetype === 'gopnik' || n.archetype === 'cop') return false
    n.say(this.fill(pick(CROWD.shovedAgain)), 2.4)
    if (n.personality === 'tough' && !this.game.story.active) { n.hostile = true; n.state = 'fight'; n.target = this.game.player; n.path = [] }
    else if (Math.random() < 0.4) this.report({ x: n.pos.x, z: n.pos.z, severity: 1 })
    return true
  }

  // a crash near people: screams, phones out
  onCrash({ force }) {
    const g = this.game, v = g.player?.vehicle
    if (!v || force < 25) return
    let k = 0
    for (const n of g.peds.list) {
      if (k >= 3 || !this.plain(n) || dist(n.pos, v.pos) > 14 || Math.random() < 0.5) continue
      k++
      n.say(this.fill(pick(CROWD.crash)), 2.2)
    }
    if (k) g.life.film(v.pos)
  }

  // a fight or a crime near a granny: she doesn't run, she tells you off
  scold(at) {
    const g = this.game
    let k = 0
    for (const n of g.peds.list.concat(g.ambient.npcs)) {
      if (k >= 2 || n.archetype !== 'babushka' || !this.plain(n) || dist(n.pos, at) > 16) continue
      const m = this.mem(n)
      if (this.clock < (m.scoldT || 0)) continue
      m.scoldT = this.clock + 20
      k++
      n.say(this.fill(pick(CROWD.scold)), 2.8)
      if (n.state !== 'sit' && !n.char.anim.busy) { n.char.lookAtNow(at.x, at.z); n.char.anim.play('point') }
    }
  }

  // ---- little routines --------------------------------------------------------------------------------
  routines() {
    const g = this.game, P = g.focus()
    if (this.clock < this.nextRoutine) return
    this.nextRoutine = this.clock + 1.5
    // somebody passing a kiosk joins the line (never more than three to a kiosk)
    for (const k of g.world.kiosks) {
      if (dist(k, P) > 55) continue
      const q = this.queues.get(k) || []
      if (q.length >= 3) continue
      const front = { x: k.x + Math.sin(k.ry) * 1.9, z: k.z + Math.cos(k.ry) * 1.9 }
      const n = g.peds.list.find((m) => this.free(m) && m.archetype !== 'cop' && dist(m.pos, front) < 9 && Math.random() < 0.3)
      if (!n) continue
      q.push(n)
      this.queues.set(k, q)
      n.queue = { k, t: 0, wait: 5 + Math.random() * 7 }
      this.lineUp(k)
      return
    }
    // a free bench and tired legs
    if (this.benchers.length < 3) {
      for (const b of g.world.benches) {
        if (b.special || b.yard || dist(b, P) > 45 || b.taken) continue
        if (g.ambient.spots.some((s) => dist(s, b) < 1.5)) continue
        const n = g.peds.list.find((m) => this.free(m) && m.archetype !== 'cop' && m.archetype !== 'kid' && dist(m.pos, b) < 8 && Math.random() < 0.25)
        if (!n) continue
        const sx = Math.sin(b.ry), sz = Math.cos(b.ry)
        b.taken = n
        n.bench = { b, t: 0, stay: 10 + Math.random() * 15 }
        this.benchers.push(n)
        n.walkTo(b.x + sx * 0.45, b.z + sz * 0.45, { face: b.ry + Math.PI, onArrive: (m) => { m.state = 'sit'; m.vel.set(0, 0, 0); if (Math.random() < 0.3) m.say(this.fill(pick(CROWD.bench)), 2.4) } })
        return
      }
    }
  }

  // everyone in line steps to their place (the front one is served)
  lineUp(k) {
    const q = this.queues.get(k) || []
    const dx = Math.sin(k.ry), dz = Math.cos(k.ry)
    q.forEach((n, i) => {
      const x = k.x + dx * (1.9 + i * 0.95), z = k.z + dz * (1.9 + i * 0.95)
      n.walkTo(x, z, { face: k.ry + Math.PI, onArrive: (m) => { m.state = 'idle'; m.vel.set(0, 0, 0) } })
    })
  }

  updateRoutines(dt) {
    const g = this.game, P = g.focus()
    for (const [k, q] of this.queues) {
      for (const n of [...q]) {
        const bad = n.disposed || !n.queue || n.char.ko || n.state === 'flee' || n.state === 'fight' || n.hostile || n.calling
        if (bad || dist(k, P) > 90) { q.splice(q.indexOf(n), 1); this.leave(n, 'queue'); continue }
      }
      const n = q[0]
      if (n && n.state === 'idle' && dist(n.pos, k) < 3) {
        n.queue.t += dt
        if (n.queue.t > n.queue.wait) {
          if (Math.random() < 0.4) n.say(this.fill(pick(CROWD.queue)), 2.2)
          q.shift()
          this.leave(n, 'queue')
          this.lineUp(k)
        }
      }
      if (!q.length) this.queues.delete(k)
    }
    for (const n of [...this.benchers]) {
      const s = n.bench
      const bad = n.disposed || !s || n.char.ko || n.state === 'flee' || n.state === 'fight' || n.hostile || n.calling
      if (!bad && n.state === 'sit') s.t += dt
      if (bad || s.t > s.stay || dist(n.pos, P) > 90 || (n.state === 'walk' && !n.path.length)) {
        this.benchers.splice(this.benchers.indexOf(n), 1)
        if (s?.b) s.b.taken = null
        this.leave(n, 'bench')
      }
    }
  }

  leave(n, key) {
    if (!n[key]) return
    n[key] = null
    if (n.disposed || n.char.ko || n.hostile || n.state === 'flee' || n.state === 'fight' || n.calling) return
    if (this.game.street?.talking === n) return
    n.state = 'walk'; n.path = []; n.node = null
    this.game.peds.repath(n)
  }

  // someone who stopped for you goes on their way when you do
  updatePauses(dt) {
    const g = this.game, p = g.player
    for (const n of g.peds.list) {
      if (n.hungUp && g.street?.talking !== n) { n.hungUp = false; if (n.state === 'phone') { n.state = 'walk'; n.path = []; g.peds.repath(n) } }
      const s = n.pause
      if (!s) continue
      s.t -= dt
      if (n.disposed || n.state !== 'idle') { n.pause = null; continue }
      if (g.street?.talking === n) { s.t = Math.max(s.t, 2); continue }
      if (s.t > 0 && dist(n.pos, p.pos) < 3.5 && !p.vehicle) continue
      n.pause = null
      n.state = 'walk'
      n.path = s.path && s.path.length ? s.path : []
      n.onArrive = s.onArrive
      if (!n.path.length) g.peds.repath(n)
    }
  }

  // the tough guy you gave twenty lei to jumps in when you're jumped
  backup() {
    const g = this.game, p = g.player
    if (p.vehicle || g.story.active) return
    const threats = g.crew.threats().filter((t) => t.target === p)
    if (!threats.length) return
    for (const n of g.peds.list) {
      const m = n.mem
      if (!m?.helped || n.personality !== 'tough' || !this.plain(n) || dist(n.pos, p.pos) > 20 || this.clock < (m.backupT || 0)) continue
      m.backupT = this.clock + 60
      n.hostile = true; n.state = 'fight'; n.target = threats[0]; n.path = []; n.ally = true
      n.say(this.fill('Ăsta-i omul meu! Lasă-l în pace!'), 2.4)
      setTimeout(() => { if (!n.disposed) n.ally = false }, 30000)
      return
    }
  }

  update(dt) {
    const g = this.game
    if (g.state !== 'play') return
    this.clock += dt
    this.updateCallers(dt)
    this.updatePauses(dt)
    this.updateRoutines(dt)
    this.dogs.update(dt)
    this.brainT -= dt
    if (this.brainT <= 0) {
      const h = 0.25 - this.brainT
      this.brainT = 0.25
      this.brain(h)
      if (!g.story.active || g.story.active.def.activity) this.routines()
      this.backup()
    }
  }
}
