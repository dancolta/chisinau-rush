import { Vehicle } from '../entities/Vehicle.js'
import { H_ROADS, V_ROADS } from '../world/CityLayout.js'
import { roadProfile } from '../world/Ground.js'
import { mulberry } from '../world/rng.js'
import { TRAFFIC_MIX, VEHICLES } from '../data/vehicles.js'
import { FILTER } from '../physics/Physics.js'

// Owns every vehicle: player driving, enter/exit/carjack, parked cars, crash damage.
export class Vehicles {
  constructor(game) {
    this.game = game
    this.list = []
    this.parkedSlots = this.buildParkingSlots()
    this.parkedActive = new Map() // slot index -> vehicle
    this.checkT = 0
    game.physics.onContact((a, b, force) => this.onContact(a, b, force))
  }

  spawn(kind, x, z, ry = 0, opts = {}) {
    const y = opts.y ?? this.game.physics.groundHeight(x, z)
    const dims = VEHICLES[kind]?.dims
    if (dims) this.game.world?.dyn?.clearBox(x, z, ry, dims[0], dims[2])
    const v = new Vehicle(this.game, kind, { x, y, z, ry, ...opts })
    this.list.push(v)
    return v
  }

  // make room for a scripted vehicle: ambient cars nearby go away and their slots stay empty
  clearSpot(x, z, r = 5.5) {
    for (const s of this.parkedSlots) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (r + 2) ** 2) s.taken = true
    for (const v of [...this.list]) {
      if (v.keep || v.driver === 'player' || v.def.trolley) continue
      if ((v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 > r * r) continue
      if (v.driver && v.driver.eject) { const d = v.driver; if (this.game.traffic.drivers.includes(d)) { this.game.traffic.despawn(d); continue } }
      if (v.slot) this.parkedActive.delete(v.slot.i)
      this.remove(v)
    }
  }

  remove(v) {
    if (!v || v.disposed) return
    const i = this.list.indexOf(v)
    if (i >= 0) this.list.splice(i, 1)
    if (v.driver === 'player' || this.game.player?.vehicle === v) this.exit(true)
    if (v.slot) { this.parkedActive.delete(v.slot.i); v.slot = null }
    v.dispose()
  }

  // curb-side parking along streets with parking strips + courtyard spots from the world
  buildParkingSlots() {
    const rnd = mulberry(606)
    const slots = []
    for (const h of H_ROADS) {
      const p = roadProfile(h)
      if (p.parking < 1.5) continue
      for (let j = 0; j < V_ROADS.length - 1; j++) {
        const a = V_ROADS[j].x + V_ROADS[j].w / 2 + 12, b = V_ROADS[j + 1].x - V_ROADS[j + 1].w / 2 - 12
        for (let x = a; x < b; x += 6.2) {
          if (rnd() < 0.45) continue
          const off = p.travel + p.parking / 2
          if (rnd() < 0.5) slots.push({ x, z: h.z - off, ry: Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) })
          else slots.push({ x, z: h.z + off, ry: Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) })
        }
      }
    }
    for (const v of V_ROADS) {
      const p = roadProfile(v)
      if (p.parking < 1.5) continue
      for (let i = 0; i < H_ROADS.length - 1; i++) {
        const a = H_ROADS[i].z + H_ROADS[i].w / 2 + 12, b = H_ROADS[i + 1].z - H_ROADS[i + 1].w / 2 - 12
        for (let z = a; z < b; z += 6.2) {
          if (rnd() < 0.5) continue
          const off = p.travel + p.parking / 2
          slots.push({ x: v.x + (rnd() < 0.5 ? off : -off), z, ry: rnd() < 0.5 ? 0 : Math.PI })
        }
      }
    }
    for (const s of this.game.world.parkingSpots) slots.push({ x: s.x, z: s.z, ry: s.ry, kind: s.kind })
    slots.forEach((s, i) => { s.i = i; s.kindPick = s.kind || TRAFFIC_MIX[Math.floor(rnd() * TRAFFIC_MIX.length)]; if (s.kindPick === 'rutiera' && !s.kind) s.kindPick = 'logan' })
    return slots
  }

  updateParked(px, pz) {
    const near = 110, far = 150
    for (const s of this.parkedSlots) {
      const d2 = (s.x - px) ** 2 + (s.z - pz) ** 2
      const v = this.parkedActive.get(s.i)
      if (!v && d2 < near * near) {
        if (s.taken || s.bad || s.reserved) continue
        if (s.ok === undefined) { s.ok = !this.blockedCar(s.x, s.z, s.ry); if (!s.ok) { s.bad = true; continue } }
        const nv = this.spawn(s.kindPick, s.x, s.z, s.ry, { parked: true })
        nv.slot = s
        this.parkedActive.set(s.i, nv)
      } else if (v && d2 > far * far) {
        if (v.driver || v.keep) { this.parkedActive.delete(s.i); s.taken = true; continue }
        this.parkedActive.delete(s.i)
        this.remove(v)
      }
    }
  }

  // ---- player <-> vehicle -------------------------------------------------------------
  nearestEnterable(px, pz, maxD = 3.2) {
    let best = null, bd = maxD * maxD
    for (const v of this.list) {
      if (v.def.trolley || v.locked) continue
      const dx = v.pos.x - px, dz = v.pos.z - pz
      const d2 = dx * dx + dz * dz
      const reach = (v.def.dims[2] + 1.2) ** 2
      if (d2 < reach && d2 < bd + reach) {
        // distance to the car's footprint rather than its centre
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
        const along = dx * fx + dz * fz, side = dx * -fz + dz * fx
        const ex = Math.max(0, Math.abs(along) - v.def.dims[2]), ey = Math.max(0, Math.abs(side) - v.def.dims[0])
        const dd = ex * ex + ey * ey
        if (dd < bd) { bd = dd; best = v }
      }
    }
    return best
  }

  enter(v) {
    const game = this.game, p = game.player
    if (v.driver && v.driver !== 'player') {
      // carjack: yank the driver out
      const ai = v.driver
      if (ai && ai.eject) ai.eject()
      game.events.emit('crime', { type: 'carjack', x: v.pos.x, z: v.pos.z, severity: v.def.police ? 3 : 1 })
    }
    game.input.consume('interact')
    v.driver = 'player'
    v.parked = false
    v.body.wakeUp()
    v.lights = false
    if (v.slot) { v.slot.taken = true; this.parkedActive.delete(v.slot.i); v.slot = null }
    p.vehicle = v
    p.char.setVisible(false)
    p.enableCollider(false)
    p.vel.set(0, 0, 0)
    game.audio?.sfx('door', { vol: 0.7 })
    game.events.emit('vehicle:enter', v)
  }

  exit(force = false) {
    const game = this.game, p = game.player, v = p.vehicle
    if (!v) return
    // too fast to step out: bail out (you tumble, the car rolls on without you)
    const bail = !force && Math.abs(v.speed) > 8
    const wasPassenger = p.passenger
    p.passenger = false
    // driver door is on the left (+x local); try left, right, behind, front
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading)
    const w = v.def.dims[0] + 0.7, l = v.def.dims[2] + 0.8
    // passengers get out on the kerb side (right), drivers on the left
    const tries = wasPassenger ? [[-lx * w, -lz * w], [lx * w, lz * w], [-fx * l, -fz * l], [fx * l, fz * l], [0, 0]] : [[lx * w, lz * w], [-lx * w, -lz * w], [-fx * l, -fz * l], [fx * l, fz * l], [0, 0]]
    let spot = tries[4]
    for (const [ox, oz] of tries) {
      const x = v.pos.x + ox, z = v.pos.z + oz
      if (!this.blocked(x, z)) { spot = [ox, oz]; break }
    }
    const x = v.pos.x + spot[0], z = v.pos.z + spot[1]
    const y = game.physics.groundHeight(x, z)
    v.driver = null
    v.throttle = 0; v.steer = 0; v.handbrake = true
    setTimeout(() => { if (!v.driver) v.handbrake = false }, 1500)
    p.vehicle = null
    p.teleport(x, y, z, v.heading)
    p.char.setVisible(true)
    p.enableCollider(true)
    v.siren = false
    this.exitedAt = performance.now()
    game.input.consume('interact')
    game.audio?.sfx('door', { vol: 0.6 })
    if (bail) {
      v.handbrake = false
      const k = Math.min(1, Math.abs(v.speed) / 30)
      p.vel.set(Math.sin(v.heading) * v.speed * 0.35, 0, Math.cos(v.heading) * v.speed * 0.35)
      p.char.ko = true
      p.bailT = 0.8 + k * 0.7
      p.hitStun = p.bailT + 0.7
      p.char.anim.play('knockdown')
      game.progress?.hurt?.(Math.round(4 + k * 10))
      game.cameraRig?.shake(0.35 + k * 0.3)
      game.audio?.sfx('land', { vol: 0.8 })
      game.fx?.dust(x, y + 0.2, z, 12)
    }
    game.events.emit('vehicle:exit', v)
  }

  // would a parked car at (x,z,ry) overlap buildings or props?
  blockedCar(x, z, ry) {
    const R = this.game.physics.R
    const shape = new R.Cuboid(1.0, 0.5, 2.3)
    let hit = false
    this.game.physics.world.intersectionsWithShape({ x, y: 1.0, z }, { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }, shape, () => { hit = true; return false }, undefined, FILTER.Q_CAMERA)
    return hit
  }

  blocked(x, z) {
    const R = this.game.physics.R
    const shape = new R.Capsule(0.5, 0.35)
    let hit = false
    this.game.physics.world.intersectionsWithShape({ x, y: 1.2, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, () => { hit = true; return false }, undefined, FILTER.Q_SOLID)
    return hit
  }

  // ---- crashes ---------------------------------------------------------------------------
  onContact(a, b, force) {
    const game = this.game
    for (const [x, other] of [[a, b], [b, a]]) {
      if (!(x instanceof Vehicle)) continue
      const f = force / x.def.mass
      if (f < 8) continue
      let dmg = Math.min(35, (f - 8) * 0.6)
      if (other && other.prop) {
        // street clutter dents a car, it never totals one (and a pile of melons is one hit, not twenty)
        const now = performance.now()
        if (now - (x.propHitAt || 0) < 450) continue
        x.propHitAt = now
        dmg = Math.min(other.type === 'dumpster' ? 8 : 2.5, dmg)
      }
      x.damage(dmg)
      if (x.driver === 'player') {
        game.cameraRig?.shake(Math.min(0.7, f / 60))
        game.audio?.sfx('impact', { vol: Math.min(1, f / 40), pitch: 0.8 + Math.random() * 0.3, at: x.pos })
        game.events.emit('player:crash', { force: f, other })
      } else if (f > 14) {
        game.audio?.sfx('impact', { vol: Math.min(0.8, f / 60), at: x.pos })
      }
      if (other && other.prop) game.events.emit('prop:hit', { prop: other, by: x })
    }
  }

  // ---- loop ------------------------------------------------------------------------------
  fixedUpdate(h) {
    const game = this.game, p = game.player, input = game.input
    const pv = p?.vehicle
    if (pv && !p.passenger) {
      const ctrl = p.control && !game.ui?.modalOpen
      pv.throttle = ctrl ? input.throttle() : 0
      pv.steer = ctrl ? input.steer() : 0
      pv.handbrake = ctrl ? input.act('handbrake') : true
      pv.boost = ctrl && input.act('sprint') && game.progress?.flags?.nitro
    }
    for (const v of this.list) v.fixedUpdate(h)
  }

  postPhysics() { for (const v of this.list) v.postPhysics() }

  update(dt) {
    const game = this.game, p = game.player
    for (const v of this.list) v.update(dt, game.alpha)
    if (!p) return
    const pos = this.game.focus()
    this.checkT -= dt
    if (this.checkT <= 0) { this.checkT = 0.5; this.updateParked(pos.x, pos.z) }
    if (p.vehicle) {
      const v = p.vehicle
      if (game.input.pressed('horn')) game.audio?.horn(v)
      if (game.input.pressed('interact') && p.control && !p.passenger && !game.cutscene && !game.ui?.modalOpen) this.exit()
      p.char.pos.set(v.pos.x, v.pos.y, v.pos.z)
    }
  }
}
