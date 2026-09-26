import { NPC, pickLine } from '../entities/NPC.js'
import { CAST } from '../data/outfits.js'
import { angleDiff } from '../entities/Character.js'
import { COP, COPS } from '../data/streettalk.js'
import { clearSight } from './Sight.js'
import { fill } from '../story/hero.js'

const THRESH = [0, 1, 18, 40, 70, 100] // heat needed for each star
const FOOT = [0, 2, 3, 4, 5, 6]         // officers on foot per star
const CARS = [0, 0, 1, 2, 3, 3]         // cars per star (one more while you drive)
const RUN = [5.2, 5.3, 5.5, 5.8, 6.0, 6.2] // they catch a jog; a sprint gets away
const ESCAPE = [0, 8, 11, 14, 18, 22]   // seconds out of sight to lose them
const SIGHT = 36, CAR_SIGHT = 55
const GRAB = 1.7                        // seconds with a hand on your collar before it's over
const ROLES = ['tail', 'cut', 'ram', 'cut']
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// a fresh route starts at the crossing nearest to the car, which is often the one behind it:
// already on the first leg, head for the next crossing instead of U-turning back
function firstLeg(r, v) {
  if (!r || r.length < 3) return 1
  const a = r[1], b = r[2], abx = b.x - a.x, abz = b.z - a.z
  const t = ((v.pos.x - a.x) * abx + (v.pos.z - a.z) * abz) / (abx * abx + abz * abz || 1)
  return t > 0.05 ? 2 : 1
}

// Wanted level, and the police who act on it. Cops on foot look for you with their eyes (range
// plus a ray against the buildings): in sight they run at you, shout, grab you (one star), use
// the baton (two) or bring you down with a tackle (three and up); out of sight they go to where
// they last saw you and poke around. Cars run with sirens, aim where your car will be, try to
// get in front of you and, at three stars, ram. Break the line of sight long enough and the
// stars go; the cops go back to their cars or their beat, where you can talk to them again.
// Patrol cops who watch you commit a crime blow the whistle on the spot. With stars, walk up
// to a cop and press E to put your hands up: pay a fine for a star, try a bribe, give up, or
// bolt. Brains run four times a second, with a small budget of sight rays.
export class Police {
  constructor(game) {
    this.game = game
    this.heat = 0
    this.level = 0
    this.officers = []
    this.cars = []
    this.unseenT = 0
    this.escaping = false
    this.bustT = 0
    this.spawnT = 0
    this.enabled = true
    this.clock = 0
    this.brainT = 0
    this.seenAt = -1e9
    this.lastSeen = null
    this.grab = null
    this.tackles = []
    this.graceT = 0
    this.talking = false
    game.events.on('crime', (c) => this.onCrime(c))
  }

  get wantedFor() { return this.level > 0 }

  // ---- crimes and heat --------------------------------------------------------------------------
  // a cop who saw it with their own eyes (or one close enough to hear it)
  witness(x, z) {
    const g = this.game, at = { x, z }
    let best = null, bd = 1e9, rays = 4
    const look = (n, eyes) => {
      if (!n || n.disposed || n.char.ko || n.riding) return
      const d = dist(n.pos, at)
      if (d > 45 || d >= bd) return
      if (eyes && d > 10) { if (rays-- <= 0 || !clearSight(g, n.pos, { x, z, y: n.pos.y })) return }
      best = n; bd = d
    }
    for (const o of this.officers) look(o, true)
    for (const n of g.peds?.list || []) if (n.personality === 'cop') look(n, true)
    for (const n of g.story?.npcs || []) if (n.personality === 'cop') look(n, false)
    if (best) return { npc: best, d: bd }
    for (const c of this.cars) if (dist(c.v.pos, at) < 45) return { npc: null, d: dist(c.v.pos, at) }
    return null
  }

  // kept for callers that only want a distance
  nearestCopDist(x, z) {
    let d = 1e9
    for (const o of this.officers) if (!o.char.ko) d = Math.min(d, dist(o.pos, { x, z }))
    for (const c of this.cars) d = Math.min(d, dist(c.v.pos, { x, z }))
    for (const n of this.game.story?.npcs || []) if (n.personality === 'cop') d = Math.min(d, dist(n.pos, { x, z }))
    for (const n of this.game.peds?.list || []) if (n.personality === 'cop' && !n.char.ko) d = Math.min(d, dist(n.pos, { x, z }))
    return d
  }

  onCrime(c) {
    if (!this.enabled) return
    const g = this.game
    const sev = c.severity || 1
    const w = this.witness(c.x, c.z)
    let add = 0
    if (c.type !== 'harass' && c.type !== 'theft') g.crowd?.scold({ x: c.x, z: c.z })
    if (w || this.level > 0) add = sev * 12
    // nobody in uniform saw it: somebody around may call it in (you can see them dial)
    else if (g.crowd) { g.crowd.report(c); return }
    else if (sev >= 2 && Math.random() < 0.35) add = sev * 7
    if (c.type === 'assault_cop') add += 25
    if (c.type === 'runover' && w && w.d < 60) add += 10
    if (!add) return
    add *= g.progress.perk.heatDecay ? 0.8 : 1
    // cops who know you look the other way on small stuff; a coffee buys a quiet afternoon
    if (sev <= 1 && this.level === 0 && (g.progress.respect?.pol || 0) >= 40) add *= 0.5
    if (performance.now() < (this.coffeeUntil || 0)) add *= 0.5
    const fresh = this.level === 0
    this.seenAt = this.clock
    this.lastSeen = { x: c.x, z: c.z }
    this.addHeat(add)
    // the one who saw it blows the whistle and comes for you right away
    if (w && this.level > 0) this.spotted = true
    if (w?.npc && this.level > 0) {
      if (g.peds.list.includes(w.npc)) this.adoptOfficer(w.npc)
      if (fresh) this.alarm(w.npc)
    }
  }

  alarm(n) {
    const g = this.game
    if (!n || n.disposed) return
    n.say(pickLine(COPS.witness), 2.2)
    g.audio?.sfx('whistle', { at: n.pos, vol: 0.9 })
    const p = g.player
    if (p && !n.char.ko) n.char.lookAtNow(p.pos.x, p.pos.z)
  }

  addHeat(n) {
    const prev = this.level
    this.heat = Math.min(100, this.heat + n)
    let lvl = 0
    for (let i = 1; i < THRESH.length; i++) if (this.heat >= THRESH[i]) lvl = i
    this.level = Math.max(this.level, lvl)
    this.unseenT = 0
    this.escaping = false
    if (this.level > prev) {
      const p = this.game.player
      if (p && !this.lastSeen) this.lastSeen = { x: p.pos.x, z: p.pos.z }
      this.seenAt = this.clock
      this.game.audio?.sting('wanted')
      if (prev === 0) { this.game.ui?.notify('{r}Poliția te caută!{/r} Rupe contactul vizual ca să scapi.', 4, 'red'); this.adoptPatrol() }
    }
  }

  setLevel(n) {
    this.level = n
    this.heat = n ? THRESH[n] : 0
    if (!n) return this.clear()
    const p = this.game.player
    if (p) { const P = p.vehicle ? p.vehicle.pos : p.pos; this.lastSeen = { x: P.x, z: P.z }; this.seenAt = this.clock }
    this.unseenT = 0; this.escaping = false
  }

  // one star less (a fine paid on the spot)
  dropStar() {
    if (this.level <= 1) return this.clear()
    this.level--
    this.heat = THRESH[this.level]
    this.unseenT = 0
  }

  clear() {
    this.game.crowd?.cancelCalls()   // a clean slate: nobody's still on the phone about you
    this.level = 0; this.heat = 0; this.escaping = false; this.unseenT = 0; this.bustT = 0
    this.grab = null; this.tackles = []; this.graceT = 0; this.lastSeen = null; this.spotted = false; this.idleT = 0
    for (const o of [...this.officers]) this.standDown(o)
    for (const c of this.cars) { c.v.siren = false; if (c.mode !== 'leave') { c.mode = 'leave'; c.leaveT = 0; c.away = null } }
  }

  // the chase is over: back to their car, or back on the beat (where you can talk to them)
  standDown(o) {
    const g = this.game
    if (o.disposed) { this.officers.splice(this.officers.indexOf(o), 1); return }
    o.hostile = false; o.target = null; o.path = []; o.onArrive = null
    const car = o.cop?.car
    if (car && !car.v.disposed && this.cars.includes(car) && !o.char.ko && dist(o.pos, car.v.pos) < 45) {
      o.cop.mode = 'return'
      return
    }
    const i = this.officers.indexOf(o)
    if (i >= 0) this.officers.splice(i, 1)
    o.cop = null
    o.archetype = 'cop'; o.personality = 'cop'; o.chased = true
    o.runSpeed = 5.2
    if (!g.peds.list.includes(o)) g.peds.list.push(o)
    if (g.street?.talking === o) return   // mid-conversation: the talk puts them back on their way
    if (!o.char.ko) { o.state = 'walk'; o.node = null; o.prevNode = null; g.peds.repath(o) }
    else o.onGetUp = (n) => { n.hostile = false; n.state = 'walk'; n.node = null; g.peds.repath(n) }
  }

  // ---- who's on your case ------------------------------------------------------------------------
  initCop(o, mode = 'chase') {
    o.personality = 'cop'; o.archetype = 'cop'
    o.hostile = true; o.target = null; o.path = []; o.onArrive = null
    o.maxHp = Math.max(o.maxHp, 70); o.hp = Math.max(o.hp, 50)
    o.runSpeed = RUN[this.level] || 5.4
    o.cop = { mode, last: null, lostT: 0, re: 0, strikeCD: 0.4, strikes: 0, tackleCD: 1.5, shoutT: 1 + Math.random() * 3, wanderT: 0, target: null, car: o.cop?.car || null, losT: 0, los: false }
    if (!this.officers.includes(o)) this.officers.push(o)
    return o
  }

  // backup comes to where you were last seen (a street or two off, out of the camera's eye if
  // possible), never right on top of you: that's what makes ducking out of sight worth it
  spawnOfficer(near, P = near) {
    const g = this.game
    let best = null, bs = -1e9
    for (const n of g.peds.nodes) {
      const d = dist(n, near)
      if (d < 26 || d > 62 || dist(n, P) < 24) continue
      const s = (g.traffic.visible(n.x, n.z) ? 0 : 12) - Math.abs(d - 40) * 0.15 + Math.random() * 6
      if (s > bs) { bs = s; best = n }
    }
    let x, z
    if (best) { x = best.x + (Math.random() - 0.5) * 1.5; z = best.z + (Math.random() - 0.5) * 1.5 }
    else {
      const a = Math.random() * Math.PI * 2
      x = near.x + Math.cos(a) * 34; z = near.z + Math.sin(a) * 34
      if (g.vehicles.blocked(x, z)) return null
    }
    const cop = new NPC(g, CAST.cop, { x, y: g.physics.groundHeight(x, z), z, personality: 'cop', hp: 70, runSpeed: 5.6, voice: { pitch: 0.85 + Math.random() * 0.2, type: 'gruff' } })
    this.initCop(cop, 'search')
    cop.cop.target = this.lastSeen ? { ...this.lastSeen } : { x: near.x, z: near.z }
    cop.cop.shoutT = 0.5
    return cop
  }

  spawnOfficerAt(x, z, car = null) {
    const g = this.game
    const cop = new NPC(g, CAST.cop, { x, y: g.physics.groundHeight(x, z), z, personality: 'cop', hp: 70, runSpeed: 5.6, voice: { pitch: 0.85 + Math.random() * 0.2, type: 'gruff' } })
    cop.cop = { car }
    this.initCop(cop, this.level > 0 ? 'chase' : 'return')
    if (!this.level) cop.hostile = false
    if (car) (car.crew ||= []).push(cop)
    return cop
  }

  // like the officers on foot: a car comes to where you were seen, not to where you are
  spawnCar(near, P = near) {
    const g = this.game, gr = g.traffic.graph
    let pick = null
    for (let t = 0; t < 20; t++) {
      const e = gr.edges[Math.floor(Math.random() * gr.edges.length)]
      const p = gr.lanePoint(e, 0, 0.5)
      const d = dist(p, near)
      if (d < 60 || d > 150 || dist(p, P) < 60) continue
      pick = { e, p }
      if (!g.traffic.visible(p.x, p.z)) break
    }
    if (!pick) return null
    const v = g.vehicles.spawn('police', pick.p.x, pick.p.z, Math.atan2(pick.e.fx, pick.e.fz), { y: 0 })
    v.siren = true
    v.locked = false
    return this.attach(v)
  }

  attach(v) {
    const c = { v, mode: 'chase', stuck: 0, reverseT: 0, role: ROLES[this.cars.length % ROLES.length], crew: [], riders: [] }
    v.driver = c; v.ai = c; v.siren = true
    // carjacked: whoever was inside gets out and comes for you
    c.eject = () => {
      const i = this.cars.indexOf(c); if (i >= 0) this.cars.splice(i, 1)
      v.siren = false
      for (const o of c.riders) if (!o.disposed) { o.unride(v.pos.x + 2, v.pos.z, v.heading); this.initCop(o, 'chase') }
      c.riders = []
      this.spawnOfficerAt(v.pos.x + Math.cos(v.heading) * 2, v.pos.z - Math.sin(v.heading) * 2)
    }
    this.cars.push(c)
    return c
  }

  // take over a scripted police car: it joins the pursuit and gets cleaned up like the others
  adopt(v) { return this.attach(v) }

  // a cop on the beat joins the chase
  adoptOfficer(n) {
    const g = this.game
    const i = g.peds.list.indexOf(n)
    if (i >= 0) g.peds.list.splice(i, 1)
    n.chat = null
    this.initCop(n, 'chase')
    n.state = 'idle'
  }

  // the whistle: patrol cops who heard it (or can see you) come running
  adoptPatrol() {
    const g = this.game, p = g.player
    if (!p) return
    const pos = p.vehicle ? p.vehicle.pos : p.pos
    for (const n of [...(g.peds?.list || [])]) {
      if (n.personality !== 'cop' || n.char.ko) continue
      const d = dist(n.pos, pos)
      if (d < 35 || (d < 50 && clearSight(g, n.pos, pos))) this.adoptOfficer(n)
    }
  }

  // officers step out of a car that pulled up next to you on foot
  bail(c, n) {
    const v = c.v
    c.bailed = true
    for (let k = 0; k < n; k++) {
      const s = k ? -1 : 1
      const x = v.pos.x + Math.cos(v.heading) * 1.9 * s, z = v.pos.z - Math.sin(v.heading) * 1.9 * s
      const o = this.spawnOfficerAt(x, z, c)
      o.say(pickLine(k ? COPS.shout : COPS.arrive), 2)
    }
  }

  // ---- sight -------------------------------------------------------------------------------------
  sees(o, P, range) {
    const d = dist(o.pos, P)
    if (d < 7) return true
    if (d > range) return false
    const c = o.cop
    if (c && this.clock < c.losT) return c.los
    if (this.rays <= 0) return c ? c.los : false
    this.rays--
    const los = clearSight(this.game, o.pos, P)
    if (c) { c.los = los; c.losT = this.clock + 0.45 }
    return los
  }

  saw(P) { this.seenAt = this.clock; this.lastSeen = { x: P.x, z: P.z } }

  // ---- foot officers -------------------------------------------------------------------------------
  run(o, at, run = true) { o.walkTo(at.x, at.z, { run, onArrive: (m) => { m.state = 'idle'; m.vel.set(0, 0, 0) } }) }
  hold(o, P) { o.path = []; o.onArrive = null; if (o.state === 'run' || o.state === 'walk') o.state = 'idle'; o.vel.set(0, 0, 0); if (P) o.char.faceTowards(P.x, P.z, 0.25, 6) }

  footBrain(o, h, P) {
    const g = this.game, p = g.player, c = o.cop
    if (!c || o.disposed || o.riding || o.char.ko || o.state === 'knocked') return false
    c.strikeCD -= h; c.tackleCD -= h
    if (c.mode === 'return') return this.walkBack(o), false
    if (o.stun > 0) return false
    const d = dist(o.pos, P)
    const sees = this.sees(o, P, SIGHT)
    if (sees) {
      c.last = { x: P.x, z: P.z }; c.lostT = 0
      this.saw(P)
      if (c.mode === 'search') { c.mode = 'chase'; o.say(pickLine(COPS.spot), 2) }
    } else c.lostT += h
    // everything waits for a dialogue or a cutscene; a paid fine buys a few seconds
    if (this.talking || g.cutscene || g.ui.modalOpen || this.graceT > 0) { this.hold(o, P); return sees }
    o.hostile = true
    o.runSpeed = RUN[this.level] || 5.4
    if (c.mode === 'chase' && !sees && c.lostT > 1.5) {
      c.mode = 'search'; c.target = c.last || this.lastSeen || { x: P.x, z: P.z }; c.wanderT = 0
      if (Math.random() < 0.5) o.say(pickLine(COPS.lost), 2.2)
    }
    if (c.mode === 'search') {
      const t = c.target || this.lastSeen || P
      if (dist(o.pos, t) > 1.6) { c.re -= h; if (c.re <= 0) { c.re = 0.5; this.run(o, t, c.wanderT <= 0) } }
      else {
        // poke around where they lost you
        c.wanderT += h
        const base = this.lastSeen || t
        c.target = { x: base.x + (Math.random() - 0.5) * 16, z: base.z + (Math.random() - 0.5) * 16 }
        this.run(o, c.target, false)
      }
      return sees
    }
    // chase: shout now and then
    c.shoutT -= h
    if (c.shoutT <= 0) { c.shoutT = 4 + Math.random() * 5; o.say(pickLine(COPS.shout), 2) }
    if (p.vehicle) {
      // at your car window
      if (d > 2.3) { c.re -= h; if (c.re <= 0) { c.re = 0.3; this.run(o, P) } } else this.hold(o, P)
      return sees
    }
    if (d > 1.35) {
      // three stars: a flying tackle at a runner
      if (this.level >= 3 && c.tackleCD <= 0 && d < 3.4 && d > 1.7 && !this.grab && !p.char.ko && sees) { c.tackleCD = 5 + Math.random() * 2; this.tackle(o) }
      c.re -= h
      if (c.re <= 0) {
        c.re = 0.25
        // aim a step ahead of where you're going
        const lead = clamp(d / 12, 0, 0.5)
        this.run(o, { x: P.x + (p.vel?.x || 0) * lead, z: P.z + (p.vel?.z || 0) * lead })
      }
      return sees
    }
    this.hold(o, P)
    if (this.grab || p.char.ko) return sees
    // up close: a baton from two stars, then the collar
    if (this.level >= 2 && c.strikeCD <= 0 && c.strikes < 2 && !o.char.anim.busy) { c.strikeCD = 1.2 + Math.random() * 0.6; c.strikes++; this.baton(o) }
    else if ((this.level === 1 || c.strikes >= 2 || p.hitStun > 0.1) && Math.hypot(p.vel?.x || 0, p.vel?.z || 0) < 6.5) this.startGrab(o)
    return sees
  }

  walkBack(o) {
    const c = o.cop, car = c.car
    if (this.game.street?.talking === o) return   // stopped for a word with you
    if (!car || car.v.disposed || !this.cars.includes(car)) { this.standDown(o); return }
    const v = car.v
    const door = { x: v.pos.x + Math.cos(v.heading) * 1.7, z: v.pos.z - Math.sin(v.heading) * 1.7 }
    if (dist(o.pos, door) < 2.2) {
      o.ride(v)
      car.riders.push(o)
      const i = this.officers.indexOf(o); if (i >= 0) this.officers.splice(i, 1)
      return
    }
    c.re -= 0.25
    if (c.re <= 0) { c.re = 1; this.run(o, door, false) }
  }

  baton(o) {
    const g = this.game, p = g.player
    if (Math.random() < 0.4) o.say(pickLine(COPS.baton), 1.8)
    o.char.anim.play('swing', { side: 1, onHit: () => {
      if (o.disposed || o.char.ko || p.vehicle || p.char.ko || this.talking) return
      const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1
      if (d > 1.8 || Math.abs(angleDiff(o.char.heading, Math.atan2(dx, dz))) > 1.2) return
      g.progress.hurt(6 + this.level)
      p.char.anim.play('hit', { side: Math.random() < 0.5 ? 1 : -1 })
      p.hitStun = Math.max(p.hitStun || 0, 0.35)
      p.vel.x += dx / d * 2.5; p.vel.z += dz / d * 2.5
      g.cameraRig?.shake(0.3)
      g.ui?.damageFlash(0.5)
      g.fx?.hit(p.pos.x, p.pos.y + 1.4, p.pos.z)
      g.audio?.sfx('punch_heavy', { at: p.pos, pitch: 0.8 })
    } })
  }

  tackle(o) {
    const p = this.game.player
    o.say(pickLine(COPS.tackle), 1.6)
    o.char.anim.play('kick')
    const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1
    o.pushX = dx / d * 1.6; o.pushZ = dz / d * 1.6
    this.run(o, p.pos)
    this.tackles.push({ o, t: 0.35 })
  }

  updateTackles(dt) {
    const g = this.game, p = g.player
    for (const k of [...this.tackles]) {
      k.t -= dt
      if (k.t > 0) continue
      this.tackles.splice(this.tackles.indexOf(k), 1)
      const o = k.o
      if (o.disposed || o.char.ko) continue
      if (!p.vehicle && !p.char.ko && !this.talking && dist(o.pos, p.pos) < 1.6) {
        // you both go down; he's up first
        p.char.ko = true
        p.char.anim.play('knockdown')
        p.bailT = 1.0; p.hitStun = 1.4
        const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1
        p.vel.x = dx / d * 3; p.vel.z = dz / d * 3
        g.progress.hurt(5)
        g.cameraRig?.shake(0.55)
        g.ui?.damageFlash(0.6)
        g.audio?.sfx('hit_body', { at: p.pos })
        this.startGrab(o, 2.4)
      } else { o.stun = 0.8; o.char.anim.set('cower') }   // missed and ate the pavement
    }
  }

  startGrab(o, limit = GRAB) {
    if (this.grab) return
    this.grab = { o, t: 0, limit, hits: o.hitCount }
    o.say(pickLine(COPS.grab), 2)
    this.game.ui?.tip('{r}Te-a înhățat!{/r} {y}[E]{/y} mâinile sus · lovește ca să te smulgi (+★)', 3)
  }

  updateGrab(dt) {
    const gr = this.grab
    if (!gr) return
    const g = this.game, p = g.player, o = gr.o
    const broke = o.hitCount > gr.hits || o.stun > 0 || o.char.ko
    if (o.disposed || broke || this.level === 0 || p.vehicle || dist(o.pos, p.pos) > 2.4 || this.talking) {
      this.grab = null
      if (broke && !o.disposed && !o.char.ko) { o.stun = Math.max(o.stun, 0.9); o.say(pickLine(COPS.hurt), 2); if (o.cop) o.cop.strikes = 0 }
      return
    }
    if (g.ui.modalOpen || g.cutscene) return
    gr.t += dt
    // his hand on your collar: you're not going anywhere (you can still swing, or give up)
    p.hitStun = Math.max(p.hitStun || 0, 0.12)
    if (!o.char.anim.busy) o.char.lookAtNow(p.pos.x, p.pos.z)
    if (gr.t > gr.limit) { this.grab = null; this.bust() }
  }

  bust() {
    const g = this.game
    if (g.ui.modalOpen || g.cutscene || this.talking) return
    this.bustT = 0
    g.director.busted()
  }

  // ---- cars ----------------------------------------------------------------------------------------
  driveCar(c, h) {
    const g = this.game, v = c.v, p = g.player
    if (v.driver !== c) return
    if (v.broken) { v.throttle = 0; v.handbrake = true; if (!c.bailed && this.level > 0) this.bail(c, 2); return }
    if (c.mode === 'leave') return this.driveAway(c, h)
    const pv = p.vehicle
    const P = pv ? pv.pos : p.pos
    const fresh = this.clock - this.seenAt < 4
    let tgt = fresh || !this.lastSeen ? P : this.lastSeen
    const d0 = dist(v.pos, tgt)
    // lead a moving car: where it'll be in a moment; the second car goes for the front
    if (pv && fresh && d0 < 90) {
      const lead = clamp(d0 / 22, 0.2, 1.4)
      const vx = Math.sin(pv.heading) * pv.speed, vz = Math.cos(pv.heading) * pv.speed
      tgt = { x: P.x + vx * lead, z: P.z + vz * lead }
      if (c.role === 'cut' && d0 > 10) tgt = { x: tgt.x + Math.sin(pv.heading) * 12, z: tgt.z + Math.cos(pv.heading) * 12 }
    }
    // lost you: cruise around where you were last seen
    if (!fresh && this.lastSeen && d0 < 14) {
      c.patrol = c.patrol && dist(c.patrol, v.pos) > 12 ? c.patrol : { x: this.lastSeen.x + (Math.random() - 0.5) * 90, z: this.lastSeen.z + (Math.random() - 0.5) * 90 }
      tgt = c.patrol
    }
    const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z, d = Math.hypot(dx, dz)
    let want = Math.atan2(dx, dz)
    // far away: follow the road graph
    if (d > 45) {
      c.routeT = (c.routeT || 0) - h
      if (c.routeT <= 0 || !c.route) { c.routeT = 1.2; c.route = g.traffic.graph.route(v.pos.x, v.pos.z, tgt.x, tgt.z); c.ri = firstLeg(c.route, v) }
      const r = c.route
      if (r && r[c.ri]) {
        if (dist(r[c.ri], v.pos) < 12 && c.ri < r.length - 1) c.ri++
        want = Math.atan2(r[c.ri].x - v.pos.x, r[c.ri].z - v.pos.z)
      }
    }
    const err = angleDiff(v.heading, want)
    if (c.reverseT > 0) { c.reverseT -= h; v.throttle = -0.8; v.steer = Math.sign(err) || 1; v.handbrake = false; return }
    v.steer = clamp(-err * 2.2, -1, 1)
    const dp = dist(v.pos, P)
    let target
    if (!pv) target = dp < 13 ? 0 : dp < 30 ? 8 : 22 + this.level * 1.5   // on foot: pull up, let the officers out
    else if (d > 30) target = 24 + this.level * 2
    else if (Math.abs(pv.speed) < 3 && dp < 18) target = clamp((dp - 6) * 0.8, 0, 8)   // you stopped: pull up alongside
    else if (c.role === 'ram' && this.level >= 3) target = Math.abs(pv.speed) + 10
    else target = Math.max(8, Math.abs(pv.speed) + (d > 10 ? 6 : 2))
    if (Math.abs(err) > 1) target = Math.min(target, 9)
    const e = target - v.speed
    v.throttle = e > 0 ? Math.min(1, e * 0.4 + 0.3) : Math.max(-1, e * 0.3)
    v.handbrake = (Math.abs(err) > 1.2 && v.speed > 10) || (!pv && dp < 13 && Math.abs(v.speed) < 1.5)
    if (Math.abs(v.speed) < 1 && target > 3) { c.stuck += h; if (c.stuck > 1.5) { c.stuck = 0; c.reverseT = 1.2 } } else c.stuck = 0
    if (!pv && dp < 16 && Math.abs(v.speed) < 2 && !c.bailed && this.level > 0) this.bail(c, this.level >= 3 ? 2 : 1)
  }

  // off along the roads, away from you; the crew gets in first
  driveAway(c, h) {
    const g = this.game, v = c.v
    c.leaveT = (c.leaveT || 0) + h
    const waiting = c.crew.some((o) => !o.disposed && !o.riding && o.cop?.mode === 'return')
    if (waiting && c.leaveT < 12) { v.throttle = 0; v.handbrake = true; return }
    for (const o of c.crew) if (!o.disposed && !o.riding && o.cop?.mode === 'return') { o.cop.car = null; this.standDown(o) }
    v.siren = false
    if (!c.away) {
      const P = g.focus(), ax = v.pos.x - P.x, az = v.pos.z - P.z, L = Math.hypot(ax, az) || 1
      c.away = { x: clamp(v.pos.x + ax / L * 260, -470, 470), z: clamp(v.pos.z + az / L * 260, -320, 340) }
      c.route = g.traffic.graph.route(v.pos.x, v.pos.z, c.away.x, c.away.z); c.ri = firstLeg(c.route, v)
    }
    const r = c.route
    let want = v.heading
    if (r && r[c.ri]) {
      if (dist(r[c.ri], v.pos) < 10 && c.ri < r.length - 1) c.ri++
      want = Math.atan2(r[c.ri].x - v.pos.x, r[c.ri].z - v.pos.z)
    }
    const err = angleDiff(v.heading, want)
    if (c.reverseT > 0) { c.reverseT -= h; v.throttle = -0.7; v.steer = Math.sign(err) || 1; v.handbrake = false; return }
    v.steer = clamp(-err * 2.2, -1, 1)
    const target = Math.abs(err) > 0.8 ? 6 : 12
    const e = target - v.speed
    v.handbrake = false
    v.throttle = e > 0 ? Math.min(1, e * 0.4 + 0.2) : Math.max(-1, e * 0.3)
    if (Math.abs(v.speed) < 0.8) { c.stuck += h; if (c.stuck > 2) { c.stuck = 0; c.reverseT = 1.2 } } else c.stuck = 0
  }

  // ---- hands up ---------------------------------------------------------------------------------------
  // the officer you can surrender to right now (cached per frame: Interaction asks several times)
  surrenderTo() {
    const g = this.game, p = g.player
    if (this._stF === g.frame) return this._st
    this._stF = g.frame
    this._st = null
    if (!this.level || this.talking || !p || p.vehicle || p.char.ko || g.ui.modalOpen || g.cutscene) return null
    let bd = 3.3
    for (const o of this.officers) {
      if (o.disposed || o.char.ko || o.riding || o.cop?.mode === 'return') continue
      const d = dist(o.pos, p.pos)
      if (d < bd) { bd = d; this._st = o }
    }
    return this._st
  }

  surrenderLabel() {
    const gr = this.grab
    if (gr) return `{r}Mâinile sus!{/r} Te arestează: ${Math.min(99, Math.round(gr.t / gr.limit * 100))}%`
    return 'Mâinile sus: vorbește cu polițistul'
  }

  fineFor(lvl) { return this.game.progress.price(20 + lvl * 25) }
  bribeFor(lvl) { return Math.round((25 + lvl * 35) * (this.game.progress.tier('pol') >= 3 ? 0.5 : 1)) }
  // how likely the man in uniform takes it: cops who know you, easily
  bribeOdds(lvl) { return clamp([0.55, 0.7, 0.9, 1][this.game.progress.tier('pol')] - (lvl - 1) * 0.08, 0.15, 1) }

  async surrender(o = this.surrenderTo()) {
    const g = this.game, pr = g.progress, p = g.player
    if (!o || this.talking || !this.level) return
    this.talking = true
    this.grab = null
    const lvl = this.level
    p.control = false
    p.vel.set(0, 0, 0)
    p.char.anim.play('surrender')
    for (const q of this.officers) if (!q.disposed && !q.char.ko && q.cop?.mode !== 'return') this.hold(q, p.pos)
    o.char.lookAtNow(p.pos.x, p.pos.z)
    p.char.lookAtNow(o.pos.x, o.pos.z)
    let jailed = false
    try {
      const sp = { id: 'cop' + o.char.mesh.id, name: g.street?.name(o) || 'Sergentul', role: `Poliția Chișinău · te știe: ${pr.tierName('pol')}`, spec: o.char.spec, voice: o.voice }
      const fine = this.fineFor(lvl), bribe = this.bribeFor(lvl), odds = this.bribeOdds(lvl)
      const choices = [
        { text: 'Plătesc amenda pe loc.', cost: `${fine} lei · −1 ★`, disabled: pr.lei < fine, k: 'fine' },
        { text: '„Poate ne înțelegem, șefu\'…"', cost: `${bribe} lei · ${Math.round(odds * 100)}%`, disabled: pr.lei < bribe, k: 'bribe' },
        { text: 'Mă predau. Duceți-mă la secție.', cost: 'amendă + 3 ore', k: 'give' },
        { text: '(O iei la fugă)', cost: '+★', k: 'run' },
      ]
      if (pr.flags.acteFalse) choices.unshift({ text: 'Arăți „actele" de la Borea', cost: 'acte false', k: 'papers' })
      const i = await g.ui.dialogue(sp, [fill(g, lvl >= 3 ? COP.surrenderHot : pickLine(COP.surrender))], { choices, focus: o })
      const k = choices[i]?.k || 'run'
      if (k === 'papers') {
        pr.flags.acteFalse = false
        o.say(COP.papers, 3.4)
        this.clear()
        g.events.emit('police:deal', { how: 'papers' })
      } else if (k === 'fine' && pr.spend(fine)) {
        pr.addRespect('pol', 1)
        o.say(fill(g, (lvl > 1 ? COP.fineMore : COP.fine).replace('{n}', fine)), 3.6)
        this.dropStar()
        this.graceT = 5
        g.events.emit('police:deal', { how: 'fine' })
      } else if (k === 'bribe' && pr.lei >= bribe) {
        if (Math.random() < odds) {
          pr.spend(bribe); pr.stats.bribes++
          pr.addRespect('pol', 2, 'o „cafea"')
          o.say(pickLine(COP.bribeOk), 3.6)
          this.clear()
          g.events.emit('police:deal', { how: 'bribe' })
        } else {
          o.say(COP.bribeNo, 3.4)
          this.addHeat(Math.max(1, THRESH[Math.min(5, lvl + 1)] - this.heat))
          pr.addRespect('pol', -3)
        }
      } else if (k === 'give') {
        const fine2 = Math.min(pr.lei, 30 + lvl * 25)
        o.say(COP.giveUp, 3.4)
        pr.addLei(-fine2, 'Amendă la poliție')
        pr.stats.busted++
        pr.addRespect('pol', 2)
        g.events.emit('police:deal', { how: 'jail' })
        g.story.failActive('Ai fost reținut de poliție.')
        jailed = true
      } else {
        o.say(COP.runAway, 2.4)
        this.addHeat(10)
        g.events.emit('police:deal', { how: 'run' })
        for (const q of this.officers) if (!q.disposed && dist(q.pos, p.pos) < 4) q.stun = 1.2
      }
    } finally {
      p.char.anim.stop('surrender')
      this.talking = false
      if (jailed) await g.director.jail()
      else { p.control = true; g.input.clear() }
    }
  }

  // ---- loop ------------------------------------------------------------------------------------------
  brain(h, P) {
    const g = this.game, p = g.player
    this.rays = 12
    let seen = false
    for (const o of [...this.officers]) if (this.footBrain(o, h, P)) seen = true
    let loud = null
    for (const c of this.cars) {
      if (c.mode !== 'chase' || c.v.disposed) continue
      const d = dist(c.v.pos, P)
      if (d < 9 || (d < CAR_SIGHT && this.rays-- > 0 && clearSight(g, c.v.pos, P, 1.3, 1.1))) { seen = true; this.saw(P); if (d < 30) loud = c }
    }
    // the megaphone, when one of them is right behind your car
    const busy = g.ui.modalOpen || g.cutscene || g.ui.subText || (g.story.active && !g.story.active.def.activity)
    if (loud && p.vehicle && this.clock > (this.megaT || 0) && !busy) {
      this.megaT = this.clock + 8 + Math.random() * 6
      g.ui.subtitle('Megafonul poliției', pickLine(COPS.megaphone), 2.6)
    }
    // a wanted face in front of a patrol cop
    if (this.level > 0) {
      for (const n of [...g.peds.list]) {
        if (n.personality !== 'cop' || n.char.ko || this.rays <= 0) continue
        const d = dist(n.pos, P)
        if (d > 32) continue
        if (d < 8 || (this.rays-- > 0 && clearSight(g, n.pos, P))) { this.adoptOfficer(n); n.say(pickLine(COPS.spot), 2); g.audio?.sfx('whistle', { at: n.pos, vol: 0.7 }); seen = true; this.saw(P) }
      }
    }
    this.seenNow = seen
  }

  fixedUpdate(h) {
    if (this.cars.some((c) => c.v.disposed)) this.cars = this.cars.filter((c) => !c.v.disposed)
    if (this.officers.some((o) => o.disposed)) this.officers = this.officers.filter((o) => !o.disposed)
    for (const c of this.cars) this.driveCar(c, h)
    for (const o of this.officers) o.fixedUpdate(h)
    for (const c of this.cars) for (const o of c.riders) if (!o.disposed) o.fixedUpdate(h)
  }

  update(dt) {
    const g = this.game, p = g.player
    if (!p) return
    this.clock += dt
    for (const o of this.officers) o.update(dt)
    const P = p.vehicle ? p.vehicle.pos : p.pos
    if (this.graceT > 0) this.graceT -= dt
    this.updateGrab(dt)
    this.updateTackles(dt)
    this.brainT -= dt
    if (this.brainT <= 0) { const h = 0.25 - this.brainT; this.brainT = 0.25; this.brain(h, P) }
    if (this.level > 0 && this.enabled) {
      // out of sight long enough and they give up; the clock only runs once they've had eyes on
      // you, or someone is out there looking (sitting still before the first car even shows up
      // doesn't count), or nobody turned up at all for a good while
      const L = this.lastSeen
      const near = (q, r) => dist(q, P) < r || (L && dist(q, L) < r)
      const looking = this.spotted || this.officers.some((o) => !o.char.ko && o.cop?.mode !== 'return' && near(o.pos, 70)) || this.cars.some((c) => c.mode === 'chase' && near(c.v.pos, 80))
      this.idleT = looking ? 0 : (this.idleT || 0) + dt
      if (this.seenNow) { this.unseenT = 0; this.escaping = false; this.spotted = true }
      else if (!looking && this.idleT < 25) this.escaping = false
      else {
        this.unseenT += dt
        this.escaping = this.unseenT > 1.5
        if (this.unseenT > ESCAPE[this.level] && !this.talking && !g.ui.modalOpen) {
          const lvl = this.level
          g.ui?.notify(`{g}${COPS.escaped}{/g}`, 3, 'green')
          g.progress.addXp(20 * lvl, 'Scăpat de poliție')
          for (const o of this.officers) if (!o.char.ko && !o.disposed && Math.random() < 0.5) { o.say(pickLine(COPS.gaveUp), 2.4); break }
          g.events.emit('police:escape', { level: lvl })
          this.clear()
        }
      }
      // keep the right number of cops around
      this.spawnT -= dt
      if (this.spawnT <= 0) {
        this.spawnT = 2.5
        const foot = this.officers.filter((o) => o.cop?.mode !== 'return').length
        if (foot < FOOT[this.level] && !p.vehicle) this.spawnOfficer(this.seenNow || !this.lastSeen ? P : this.lastSeen, P)
        const want = Math.min(4, CARS[this.level] + (p.vehicle ? 1 : 0))
        if (this.cars.filter((c) => c.mode === 'chase').length < want) this.spawnCar(this.seenNow || !this.lastSeen ? P : this.lastSeen, P)
      }
      this.checkBust(dt)
    }
    // cleanup far away cops and cars
    for (const o of [...this.officers]) {
      const d = dist(o.pos, P)
      if (d > 160 || (o.cop?.mode === 'return' && d > 90)) { this.officers.splice(this.officers.indexOf(o), 1); o.dispose() }
    }
    for (const c of [...this.cars]) {
      const d = dist(c.v.pos, P)
      if ((c.mode === 'leave' && d > 90 && !g.traffic.visible(c.v.pos.x, c.v.pos.z)) || d > 220) {
        this.cars.splice(this.cars.indexOf(c), 1)
        for (const o of c.riders) o.dispose()
        for (const o of c.crew) if (!o.disposed && o.cop?.car === c) o.cop.car = null
        if (c.v.driver === c) g.vehicles.remove(c.v)
      }
    }
  }

  // in a car: boxed in and stopped, or a cop at the window of a car that isn't moving
  checkBust(dt) {
    const g = this.game, p = g.player
    if (!p.vehicle) return
    const v = p.vehicle
    let close = false
    if (Math.abs(v.speed) < 1.5) {
      for (const c of this.cars) if (c.v !== v && dist(c.v.pos, v.pos) < 7) close = true
      for (const o of this.officers) if (!o.char.ko && o.cop?.mode === 'chase' && dist(o.pos, v.pos) < 2.8) close = true
    }
    this.bustT = close ? this.bustT + dt : Math.max(0, this.bustT - dt * 2)
    if (this.bustT > 1.3 && !g.ui.modalOpen && !g.cutscene) this.bust()
  }
}
