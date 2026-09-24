import * as THREE from 'three'
import { RoadGraph } from '../world/RoadGraph.js'
import { TRAFFIC_MIX } from '../data/vehicles.js'
import { H_ROADS, V_ROADS, LANE_W } from '../world/CityLayout.js'
import { roadProfile } from '../world/Ground.js'
import { angleDiff } from '../entities/Character.js'

const COL = { r: new THREE.Color(0xff2a1a), y: new THREE.Color(0xffb400), g: new THREE.Color(0x2aff6a), off: new THREE.Color(0x1c1c1c) }
const CYCLE = [['g', 'r', 14], ['y', 'r', 2.5], ['r', 'r', 1.2], ['r', 'g', 10], ['r', 'y', 2.5], ['r', 'r', 1.2]] // [ew, ns, seconds]
const CYCLE_LEN = CYCLE.reduce((a, c) => a + c[2], 0)

// ---------------------------------------------------------------------------
class AIDriver {
  constructor(traffic, vehicle, edge, lane) {
    this.tr = traffic
    this.v = vehicle
    this.edge = edge
    this.lane = lane
    this.path = []
    this.wi = 0
    this.cruise = edge.speed * (0.85 + Math.random() * 0.3)
    this.stuckT = 0
    this.honkT = 0
    this.mode = 'drive'
    this.fleeT = 0
    vehicle.driver = this
    vehicle.ai = this
    this.appendEdge(edge, lane)
  }

  appendEdge(e, lane) {
    const g = this.tr.graph
    const end = g.lanePoint(e, lane, 1)
    this.path.push({ x: end.x, z: end.z, stop: e.to, axis: e.dir === 'E' || e.dir === 'W' ? 'ew' : 'ns', edge: e })
    this.lastEdge = e; this.lastLane = lane
  }

  extend() {
    // keep ~60 m of path ahead
    let ahead = 0
    for (let i = this.wi; i < this.path.length - 1; i++) ahead += Math.hypot(this.path[i + 1].x - this.path[i].x, this.path[i + 1].z - this.path[i].z)
    let guard = 0
    while (ahead < 60 && guard++ < 4) {
      const e = this.lastEdge
      const outs = e.to.out.filter((o) => !(o.to === e.from))
      if (!outs.length) break
      // prefer straight on long roads
      let next = outs[Math.floor(Math.random() * outs.length)]
      const straight = outs.find((o) => o.fx === e.fx && o.fz === e.fz)
      if (straight && Math.random() < 0.55) next = straight
      const kind = this.tr.graph.turnKind(e, next)
      const lane = kind === 'right' ? next.lanes - 1 : kind === 'left' ? 0 : Math.min(this.lastLane, next.lanes - 1)
      const pts = this.tr.graph.turnPoints(e, this.lastLane, next, lane)
      for (const p of pts) this.path.push(p)
      this.appendEdge(next, lane)
      ahead += next.len + 20
    }
    if (this.wi > 12) { this.path.splice(0, this.wi); this.wi = 0 }
  }

  eject() {
    const v = this.v
    this.tr.game.peds?.spawnEjected(v)
    this.tr.release(this)
  }

  fixedUpdate(h) {
    const v = this.v, tr = this.tr
    if (v.driver !== this) return
    this.extend()
    const px = v.pos.x, pz = v.pos.z
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
    // advance waypoints we've reached or passed
    while (this.wi < this.path.length - 1) {
      const w = this.path[this.wi]
      const dx = w.x - px, dz = w.z - pz
      if (dx * dx + dz * dz < 9 || dx * fx + dz * fz < -0.5) this.wi++
      else break
    }
    const w = this.path[this.wi]
    const nxt = this.path[Math.min(this.path.length - 1, this.wi + 1)]
    // lookahead target: blend toward the next point for smooth curves
    const dW = Math.hypot(w.x - px, w.z - pz)
    const k = Math.min(1, Math.max(0, (6 - dW) / 6))
    const tx = w.x + (nxt.x - w.x) * k, tz = w.z + (nxt.z - w.z) * k
    const want = Math.atan2(tx - px, tz - pz)
    const err = angleDiff(v.heading, want)
    v.steer = THREE.MathUtils.clamp(-err * 2.4, -1, 1)
    // ---- target speed ------------------------------------------------------------
    let target = this.cruise
    if (w.turn || Math.abs(err) > 0.35) target = Math.min(target, 7)
    // upcoming stop line
    const stopW = this.path.slice(this.wi, this.wi + 3).find((p) => p.stop)
    if (stopW) {
      const d = Math.hypot(stopW.x - px, stopW.z - pz)
      const next = this.path[this.path.indexOf(stopW) + 1]
      if (next && next.turn) target = Math.min(target, 6.5 + Math.max(0, d - 8) * 0.45)
      const ctl = stopW.stop.controlled
      if (ctl) {
        const light = ctl.state[stopW.axis]
        if (light === 'r' || (light === 'y' && d > 9)) target = Math.min(target, Math.max(0, (d - 1.2) * 0.55))
      }
    }
    // vehicles, player and pedestrians ahead
    const obs = tr.obstacleAhead(v, 7 + Math.abs(v.speed) * 1.3)
    if (obs) {
      target = Math.min(target, Math.max(0, (obs.d - 5.5) * 0.8))
      if (obs.player && Math.abs(v.speed) < 1 && (this.honkT -= h) < 0) { this.honkT = 2 + Math.random() * 3; tr.game.audio?.horn(v, 0.5) }
    }
    if (this.mode === 'flee') target = this.cruise * 1.6
    // ---- controls ------------------------------------------------------------------
    const sp = v.speed
    if (target < 0.3 && sp < 0.6) { v.throttle = 0; v.handbrake = true }
    else {
      v.handbrake = false
      const e = target - sp
      v.throttle = e > 0 ? Math.min(1, e * 0.45 + 0.15) : Math.max(-1, e * 0.35)
    }
    // stuck detection (blocked by the player's car etc.)
    if (Math.abs(sp) < 0.4 && target > 2) this.stuckT += h; else this.stuckT = 0
    if (this.stuckT > 18) this.tr.despawn(this)
  }
}

// ---------------------------------------------------------------------------
class TrolleyDriver {
  constructor(traffic, vehicle, dir, x) {
    this.tr = traffic
    this.v = vehicle
    this.dir = dir // +1 east (south side), -1 west (north side)
    this.stopT = 0
    this.lastStop = null
    vehicle.driver = this
    vehicle.ai = this
    vehicle.locked = true
    this.x = x
  }

  laneZ(dir) { return dir > 0 ? this.tr.bdLaneZ : -this.tr.bdLaneZ }

  fixedUpdate(h) {
    const v = this.v, tr = this.tr
    const px = v.pos.x, pz = v.pos.z
    const xEnd = tr.bdX1 - 30, xStart = tr.bdX0 + 30
    // U-turn loops at both ends of the boulevard
    let tx, tz
    if (this.dir > 0 && px > xEnd) { this.dir = -1 }
    else if (this.dir < 0 && px < xStart) { this.dir = 1 }
    tx = px + this.dir * 14; tz = this.laneZ(this.dir)
    const want = Math.atan2(tx - px, tz - pz)
    const err = angleDiff(v.heading, want)
    v.steer = THREE.MathUtils.clamp(-err * 2.2, -1, 1)
    let target = Math.abs(err) > 0.4 ? 4 : 11
    // stations
    if (this.stopT > 0) { this.stopT -= h; target = 0 }
    else {
      for (const s of tr.game.world.busStops) {
        if (Math.sign(s.side) !== this.dir || s === this.lastStop) continue
        const d = (s.x - px) * this.dir
        if (d > 0 && d < 30) target = Math.min(target, Math.max(0, (d - 1) * 0.5))
        if (d > -1 && d < 1.5 && Math.abs(v.speed) < 1.2) { this.stopT = 6; this.lastStop = s; tr.game.events.emit('trolley:stop', { v, stop: s }) }
      }
    }
    const obs = tr.obstacleAhead(v, 14)
    if (obs) target = Math.min(target, Math.max(0, (obs.d - 7) * 0.6))
    const sp = v.speed
    if (target < 0.3 && sp < 0.6) { v.throttle = 0; v.handbrake = true }
    else { v.handbrake = false; const e = target - sp; v.throttle = e > 0 ? Math.min(1, e * 0.4 + 0.1) : Math.max(-1, e * 0.3) }
  }

  eject() {}
}

// ---------------------------------------------------------------------------
export class Traffic {
  constructor(game) {
    this.game = game
    this.graph = new RoadGraph()
    this.drivers = []
    this.target = 22
    this.spawnT = 0
    this.time = 0
    const bd = H_ROADS.find((h) => h.boulevard)
    const p = roadProfile(bd)
    this.bdLaneZ = bd.z + p.median + LANE_W * (bd.lanes - 0.5)
    this.bdX0 = V_ROADS[0].x; this.bdX1 = V_ROADS[V_ROADS.length - 1].x
    // hook traffic lights to graph nodes
    this.controlled = game.world.controlled
    for (const c of this.controlled) {
      const n = this.graph.nodes.find((nn) => nn.x === c.x && nn.z === c.z)
      c.state = { ew: 'g', ns: 'r' }
      c.offset = c.h.boulevard ? (c.x + 420) / 13 : Math.random() * CYCLE_LEN
      if (n) n.controlled = c
    }
    this.lastLightSig = ''
    this.spawnTrolleys()
  }

  spawnTrolleys() {
    const xs = [-300, 40, 330]
    xs.forEach((x, i) => {
      const dir = i % 2 ? -1 : 1
      const z = dir > 0 ? this.bdLaneZ : -this.bdLaneZ
      const v = this.game.vehicles.spawn('trolleybus', x, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      v.keep = true
      this.drivers.push(new TrolleyDriver(this, v, dir, x))
    })
  }

  release(d) {
    const i = this.drivers.indexOf(d)
    if (i >= 0) this.drivers.splice(i, 1)
    if (d.v.driver === d) d.v.driver = null
    d.v.ai = null
    d.v.throttle = 0; d.v.handbrake = false
  }

  despawn(d) {
    this.release(d)
    this.game.vehicles.remove(d.v)
  }

  // nearest blocking thing in the vehicle's lane corridor
  obstacleAhead(v, range) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
    const w = v.def.dims[0] + 0.6
    let best = null
    const test = (x, z, halfW, player = false) => {
      const dx = x - v.pos.x, dz = z - v.pos.z
      const along = dx * fx + dz * fz
      if (along < 0.5 || along > range + v.def.dims[2]) return
      const side = Math.abs(dx * -fz + dz * fx)
      if (side > w + halfW) return
      const d = along - v.def.dims[2]
      if (!best || d < best.d) best = { d, player }
    }
    for (const o of this.game.vehicles.list) if (o !== v) test(o.pos.x, o.pos.z, o.def.dims[0], o.driver === 'player')
    const p = this.game.player
    if (p && !p.vehicle) test(p.pos.x, p.pos.z, 0.5, true)
    const peds = this.game.peds?.list
    if (peds) for (const c of peds) if (!c.ko && c.onRoad) test(c.pos.x, c.pos.z, 0.5)
    return best
  }

  updateLights(dt) {
    this.time += dt
    let sig = ''
    for (const c of this.controlled) {
      let t = (this.time + c.offset) % CYCLE_LEN
      let ph = CYCLE[0]
      for (const p of CYCLE) { if (t < p[2]) { ph = p; break } t -= p[2] }
      c.state.ew = ph[0]; c.state.ns = ph[1]
      sig += ph[0] + ph[1]
    }
    if (sig === this.lastLightSig) return
    this.lastLightSig = sig
    const heads = this.game.world.trafficHeads, lamps = this.game.world.trafficLamps
    if (!heads) return
    heads.forEach((hd, i) => {
      const st = hd.it.state ? hd.it.state[hd.axis] : 'g'
      lamps.r.setColorAt(i, st === 'r' ? COL.r : COL.off)
      lamps.y.setColorAt(i, st === 'y' ? COL.y : COL.off)
      lamps.g.setColorAt(i, st === 'g' ? COL.g : COL.off)
    })
    for (const k of ['r', 'y', 'g']) lamps[k].instanceColor.needsUpdate = true
  }

  spawnOne(px, pz) {
    const g = this.graph
    for (let tries = 0; tries < 10; tries++) {
      const e = g.edges[Math.floor(Math.random() * g.edges.length)]
      const t = 0.15 + Math.random() * 0.7
      const lane = Math.floor(Math.random() * e.lanes)
      const p = g.lanePoint(e, lane, t)
      const d = Math.hypot(p.x - px, p.z - pz)
      if (d < 75 || d > 190) continue
      // not right in front of the camera
      if (this.visible(p.x, p.z) && d < 140) continue
      if (this.game.vehicles.list.some((o) => (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < 100)) continue
      const kind = TRAFFIC_MIX[Math.floor(Math.random() * TRAFFIC_MIX.length)]
      const ry = Math.atan2(e.fx, e.fz)
      const v = this.game.vehicles.spawn(kind, p.x, p.z, ry, { y: 0 })
      const d0 = new AIDriver(this, v, e, lane)
      // start mid-edge: only the remaining part of this edge matters
      this.drivers.push(d0)
      v.body.setLinvel({ x: e.fx * d0.cruise * 0.8, y: 0, z: e.fz * d0.cruise * 0.8 }, true)
      return v
    }
    return null
  }

  visible(x, z) {
    const cam = this.game.camera
    const v = new THREE.Vector3(x, 1, z).project(cam)
    return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
  }

  fixedUpdate(h) {
    if (this.drivers.some((d) => d.v.disposed)) this.drivers = this.drivers.filter((d) => !d.v.disposed)
    for (const d of this.drivers) d.fixedUpdate(h)
  }

  update(dt) {
    this.updateLights(dt)
    const p = this.game.player
    if (!p) return
    const pos = this.game.focus()
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 0.35
      const cars = this.drivers.filter((d) => d instanceof AIDriver)
      if (cars.length < this.target) this.spawnOne(pos.x, pos.z)
      for (const d of cars) {
        const dd = Math.hypot(d.v.pos.x - pos.x, d.v.pos.z - pos.z)
        if (dd > 240 && !this.visible(d.v.pos.x, d.v.pos.z)) this.despawn(d)
      }
    }
  }
}
