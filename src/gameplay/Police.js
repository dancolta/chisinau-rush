import { NPC, pickLine } from '../entities/NPC.js'
import { CAST } from '../data/outfits.js'
import { angleDiff } from '../entities/Character.js'

const COP_SHOUT = ['Stai! Poliția!', 'Stai pe loc, bre!', 'Mâinile unde să le văd!', 'Documentele! Acum!', 'Hei, tu! Stai!']
const THRESH = [0, 1, 18, 40, 70, 100] // heat needed for each star

// Wanted level, cop spawning/pursuit, escaping, getting busted (bribe / sweet-talk / run).
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
    game.events.on('crime', (c) => this.onCrime(c))
  }

  get wantedFor() { return this.level > 0 }

  onCrime(c) {
    if (!this.enabled) return
    const g = this.game
    // witnessed by a cop, or reported by civilians for serious stuff
    const near = this.nearestCopDist(c.x, c.z)
    const sev = c.severity || 1
    let add = 0
    if (near < 45 || this.level > 0) add = sev * 12
    else if (sev >= 2 && Math.random() < 0.5) add = sev * 7
    else if (c.type === 'carjack' && Math.random() < 0.3) add = 8
    if (c.type === 'assault_cop') add += 25
    if (c.type === 'runover' && near < 60) add += 10
    if (!add) return
    add *= g.progress.perk.heatDecay ? 0.8 : 1
    // cops who know you look the other way on small stuff; a coffee buys a quiet afternoon
    if (sev <= 1 && this.level === 0 && (g.progress.respect?.pol || 0) >= 40) add *= 0.5
    if (performance.now() < (this.coffeeUntil || 0)) add *= 0.5
    this.addHeat(add)
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
      this.game.audio?.sting('wanted')
      if (prev === 0) { this.game.ui?.notify('{r}Poliția te caută!{/r} Rupe contactul vizual ca să scapi.', 4, 'red'); this.adoptPatrol() }
    }
  }

  setLevel(n) {
    this.level = n
    this.heat = n ? THRESH[n] : 0
    if (!n) this.clear()
  }

  clear() {
    this.level = 0; this.heat = 0; this.escaping = false; this.unseenT = 0
    for (const o of this.officers) o.leaving = true
    for (const c of this.cars) { c.v.siren = false; c.mode = 'leave' }
  }

  nearestCopDist(x, z) {
    let d = 1e9
    for (const o of this.officers) if (!o.char.ko) d = Math.min(d, Math.hypot(o.pos.x - x, o.pos.z - z))
    for (const c of this.cars) d = Math.min(d, Math.hypot(c.v.pos.x - x, c.v.pos.z - z))
    // parked story cops and the patrol on foot count too
    for (const n of this.game.story?.npcs || []) if (n.personality === 'cop') d = Math.min(d, Math.hypot(n.pos.x - x, n.pos.z - z))
    for (const n of this.game.peds?.list || []) if (n.personality === 'cop' && !n.char.ko) d = Math.min(d, Math.hypot(n.pos.x - x, n.pos.z - z))
    return d
  }

  // ---- spawning -----------------------------------------------------------------------------
  spawnOfficer(near) {
    const g = this.game
    for (let t = 0; t < 8; t++) {
      const a = Math.random() * Math.PI * 2, r = 28 + Math.random() * 18
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r
      if (g.vehicles.blocked(x, z)) continue
      const cop = new NPC(g, CAST.cop, { x, y: g.physics.groundHeight(x, z), z, personality: 'cop', hp: 70, runSpeed: 5.6, voice: { pitch: 0.9, type: 'gruff' } })
      cop.state = 'fight'; cop.hostile = true; cop.target = g.player
      this.officers.push(cop)
      return cop
    }
    return null
  }

  spawnCar(near) {
    const g = this.game, gr = g.traffic.graph
    for (let t = 0; t < 12; t++) {
      const e = gr.edges[Math.floor(Math.random() * gr.edges.length)]
      const p = gr.lanePoint(e, 0, 0.5)
      const d = Math.hypot(p.x - near.x, p.z - near.z)
      if (d < 60 || d > 150) continue
      const v = g.vehicles.spawn('police', p.x, p.z, Math.atan2(e.fx, e.fz), { y: 0 })
      v.siren = true
      v.locked = false
      const c = { v, mode: 'chase', stuck: 0, reverseT: 0 }
      v.driver = c; v.ai = c
      c.eject = () => { this.cars.splice(this.cars.indexOf(c), 1); v.siren = false; this.spawnOfficerAt(v.pos.x + 2, v.pos.z) }
      this.cars.push(c)
      return c
    }
    return null
  }

  // take over a scripted police car: it joins the pursuit and gets cleaned up like the others
  adopt(v) {
    const c = { v, mode: 'chase', stuck: 0, reverseT: 0 }
    v.driver = c; v.ai = c; v.siren = true
    c.eject = () => { const i = this.cars.indexOf(c); if (i >= 0) this.cars.splice(i, 1); v.siren = false; this.spawnOfficerAt(v.pos.x + 2, v.pos.z) }
    this.cars.push(c)
    return c
  }

  // a cop on the beat joins the chase
  adoptOfficer(n) {
    const g = this.game
    const i = g.peds.list.indexOf(n)
    if (i >= 0) g.peds.list.splice(i, 1)
    n.personality = 'cop'; n.hostile = true; n.state = 'fight'; n.target = g.player; n.path = []
    n.maxHp = Math.max(n.maxHp, 70); n.hp = Math.max(n.hp, 50); n.runSpeed = 5.6
    if (!this.officers.includes(n)) this.officers.push(n)
  }

  adoptPatrol() {
    const g = this.game, p = g.player
    if (!p) return
    const pos = p.vehicle ? p.vehicle.pos : p.pos
    for (const n of [...(g.peds?.list || [])]) if (n.personality === 'cop' && !n.char.ko && Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z) < 60) this.adoptOfficer(n)
  }

  spawnOfficerAt(x, z) {
    const g = this.game
    const cop = new NPC(g, CAST.cop, { x, y: g.physics.groundHeight(x, z), z, personality: 'cop', hp: 70, runSpeed: 5.6 })
    cop.state = 'fight'; cop.hostile = true; cop.target = g.player
    this.officers.push(cop)
  }

  // ---- car pursuit AI ------------------------------------------------------------------------
  driveCar(c, h) {
    const g = this.game, v = c.v
    const tgt = g.player.vehicle ? g.player.vehicle.pos : g.player.pos
    if (c.mode === 'leave') { v.throttle = 0.4; v.steer = 0; return }
    const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z, d = Math.hypot(dx, dz)
    let want = Math.atan2(dx, dz)
    // far away: follow the road graph toward the player
    if (d > 45) {
      c.routeT = (c.routeT || 0) - h
      if (c.routeT <= 0 || !c.route) { c.routeT = 1.2; c.route = g.traffic.graph.route(v.pos.x, v.pos.z, tgt.x, tgt.z); c.ri = 1 }
      const r = c.route
      if (r && r[c.ri]) {
        const w = r[c.ri]
        if (Math.hypot(w.x - v.pos.x, w.z - v.pos.z) < 12 && c.ri < r.length - 1) c.ri++
        want = Math.atan2(r[c.ri].x - v.pos.x, r[c.ri].z - v.pos.z)
      }
    }
    const err = angleDiff(v.heading, want)
    if (c.reverseT > 0) { c.reverseT -= h; v.throttle = -0.8; v.steer = Math.sign(err) || 1; v.handbrake = false; return }
    v.steer = Math.max(-1, Math.min(1, -err * 2.2))
    const target = d < 10 ? (g.player.vehicle ? 16 : 3) : Math.abs(err) > 1 ? 9 : 26
    const e = target - v.speed
    v.throttle = e > 0 ? Math.min(1, e * 0.4 + 0.3) : Math.max(-1, e * 0.3)
    v.handbrake = Math.abs(err) > 1.2 && v.speed > 10
    if (Math.abs(v.speed) < 1 && d > 8) { c.stuck += h; if (c.stuck > 1.5) { c.stuck = 0; c.reverseT = 1.2 } } else c.stuck = 0
    // officers bail out near a player on foot
    if (!g.player.vehicle && d < 12 && Math.abs(v.speed) < 3 && !c.bailed) {
      c.bailed = true
      this.spawnOfficerAt(v.pos.x + Math.cos(v.heading) * 2, v.pos.z - Math.sin(v.heading) * 2)
    }
  }

  fixedUpdate(h) {
    if (this.cars.some((c) => c.v.disposed)) this.cars = this.cars.filter((c) => !c.v.disposed)
    for (const c of this.cars) this.driveCar(c, h)
    for (const o of this.officers) o.fixedUpdate(h)
  }

  // ---- per frame ------------------------------------------------------------------------------
  update(dt) {
    const g = this.game, p = g.player
    if (!p) return
    for (const o of this.officers) o.update(dt)
    const pos = p.vehicle ? p.vehicle.pos : p.pos
    if (this.level > 0 && this.enabled) {
      // line of sight: any cop within range that isn't knocked out
      let seen = false
      for (const o of this.officers) if (!o.char.ko && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < 38) seen = true
      for (const c of this.cars) if (Math.hypot(c.v.pos.x - pos.x, c.v.pos.z - pos.z) < 55) seen = true
      if (seen) { this.unseenT = 0; this.escaping = false }
      else {
        this.unseenT += dt
        this.escaping = this.unseenT > 1
        if (this.unseenT > 7 + this.level * 3) {
          g.ui?.notify('{g}Ai scăpat de poliție.{/g}', 3, 'green')
          g.progress.addXp(20 * this.level, 'Scăpat de poliție')
          this.clear()
        }
      }
      // keep the right number of cops around
      this.spawnT -= dt
      if (this.spawnT <= 0 && this.level > 0) {
        this.spawnT = 2.5
        const wantFoot = [0, 2, 3, 4, 5, 6][this.level], wantCars = [0, 0, 1, 2, 3, 4][this.level]
        const foot = this.officers.filter((o) => !o.leaving).length
        if (foot < wantFoot && !p.vehicle) this.spawnOfficer(pos)
        if (this.cars.filter((c) => c.mode === 'chase').length < wantCars || (p.vehicle && this.cars.length < Math.max(1, wantCars))) this.spawnCar(pos)
      }
      // shouts
      for (const o of this.officers) if (!o.char.ko && Math.random() < dt * 0.15) o.say(pickLine(COP_SHOUT))
      this.checkBust(dt, pos)
    }
    // cleanup far away / leaving cops
    for (const o of [...this.officers]) {
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z)
      if ((o.leaving && d > 50) || d > 160) { this.officers.splice(this.officers.indexOf(o), 1); o.dispose() }
      else if (o.leaving && !o.char.ko) { o.state = 'walk'; o.hostile = false; if (!o.path.length) o.walkTo(o.pos.x + (o.pos.x - pos.x), o.pos.z + (o.pos.z - pos.z)) }
    }
    for (const c of [...this.cars]) {
      const d = Math.hypot(c.v.pos.x - pos.x, c.v.pos.z - pos.z)
      if ((c.mode === 'leave' && d > 90) || d > 220) { this.cars.splice(this.cars.indexOf(c), 1); if (c.v.driver === c) g.vehicles.remove(c.v) }
    }
  }

  checkBust(dt, pos) {
    const g = this.game, p = g.player
    let close = false
    if (!p.vehicle) {
      for (const o of this.officers) if (!o.char.ko && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < 1.7) close = true
      if (p.char.speed > 5) close = false
    } else {
      const v = p.vehicle
      if (Math.abs(v.speed) < 1.5) for (const c of this.cars) if (Math.hypot(c.v.pos.x - v.pos.x, c.v.pos.z - v.pos.z) < 7) close = true
    }
    this.bustT = close ? this.bustT + dt : Math.max(0, this.bustT - dt * 2)
    if (this.bustT > 1.3 && !g.ui.modalOpen && !g.cutscene) { this.bustT = 0; g.director.busted() }
  }
}
