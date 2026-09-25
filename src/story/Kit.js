import * as THREE from 'three'
import { angleDiff } from '../entities/Character.js'
import { FILTER } from '../physics/Physics.js'
import { H_ROADS, V_ROADS, RAIL_Z, LANE_W } from '../world/CityLayout.js'
import { roadProfile } from '../world/Ground.js'
import { RoadGraph } from '../world/RoadGraph.js'
import { GeoBuilder } from '../render/GeoBuilder.js'

// Reusable mission building blocks: race rings, pickups, guard vision cones, scripted drivers,
// road helpers, the arriving train and a few set-dressing props.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ---------------------------------------------------------------------------
// a position in a lane of a named road: dir E/W on horizontal roads, N/S on vertical ones
export function lanePos(id, dir, along, { lane = 0, curb = false } = {}) {
  const r = H_ROADS.find((h) => h.id === id) || V_ROADS.find((v) => v.id === id)
  const p = roadProfile(r)
  const off = curb ? (p.parking >= 1.5 ? p.travel + p.parking / 2 : RoadGraph.laneOffset(p, r.lanes - 1)) : RoadGraph.laneOffset(p, Math.min(lane, r.lanes - 1))
  if (dir === 'E') return { x: along, z: r.z + off, ry: Math.PI / 2 }
  if (dir === 'W') return { x: along, z: r.z - off, ry: -Math.PI / 2 }
  if (dir === 'S') return { x: r.x - off, z: along, ry: 0 }
  return { x: r.x + off, z: along, ry: Math.PI }
}

// smooth lane-following path through a list of intersections [[vIndex, hIndex], ...]
// (consecutive nodes must share a road; intermediate intersections are filled in)
export function pathThrough(graph, nodes, { lane = 0, loop = false, speed = null } = {}) {
  const ids = []
  const push = (j, i) => { const id = `${j}:${i}`; if (ids[ids.length - 1] !== id) ids.push(id) }
  for (let k = 0; k < nodes.length; k++) {
    const [j, i] = nodes[k]
    if (k === 0) { push(j, i); continue }
    const [pj, pi] = nodes[k - 1]
    if (pj === j) { const s = Math.sign(i - pi); for (let t = pi + s; s && t !== i + s; t += s) push(j, t) }
    else { const s = Math.sign(j - pj); for (let t = pj + s; s && t !== j + s; t += s) push(t, i) }
  }
  if (loop && ids[0] !== ids[ids.length - 1]) ids.push(ids[0])
  const edges = []
  for (let k = 0; k < ids.length - 1; k++) {
    const a = graph.nodeAt.get(ids[k])
    const e = a.out.find((o) => o.to.id === ids[k + 1])
    if (e) edges.push(e)
  }
  if (loop && edges.length) edges.push(edges[0])
  const pts = []
  edges.forEach((e, k) => {
    const L = Math.min(lane, e.lanes - 1)
    if (k === 0) pts.push({ ...graph.lanePoint(e, L, 0), speed })
    if (k === edges.length - 1 && loop) return
    const mid = graph.lanePoint(e, L, 0.5)
    pts.push({ ...mid, speed })
    pts.push({ ...graph.lanePoint(e, L, 1), speed })
    const nx = edges[k + 1]
    if (nx) for (const t of graph.turnPoints(e, L, nx, Math.min(lane, nx.lanes - 1), 5)) pts.push({ ...t, r: 4, speed: t.turn ? Math.min(speed ?? 99, 11) : speed })
  })
  return pts
}

// ---------------------------------------------------------------------------
export class Ring {
  constructor(game, x, z, { r = 5, color = 0xffcf4a, y = null } = {}) {
    this.game = game
    this.x = x; this.z = z; this.r = r
    const gy = y ?? game.physics.groundHeight(x, z)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 8, 40), mat)
    this.mesh.position.set(x, gy + r * 0.72, z)
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }))
    this.beam.position.set(x, gy + 0.08, z)
    game.scene.add(this.mesh, this.beam)
    this.t = Math.random() * 6
    this.dim = false
  }
  face(x, z) { this.mesh.rotation.y = Math.atan2(x - this.x, z - this.z) }
  setDim(on) { this.dim = on }
  update(dt) {
    this.t += dt
    const base = this.dim ? 0.22 : 0.65
    this.mesh.material.opacity = base + Math.sin(this.t * 5) * (this.dim ? 0.05 : 0.2)
    this.beam.material.opacity = this.dim ? 0.08 : 0.25
    this.mesh.scale.setScalar(1 + Math.sin(this.t * 3) * 0.03)
  }
  inside(p) { return Math.hypot(p.x - this.x, p.z - this.z) < this.r }
  dispose() { this.game.scene.remove(this.mesh, this.beam); this.mesh.geometry.dispose(); this.beam.geometry.dispose(); this.mesh.material.dispose(); this.beam.material.dispose() }
}

// ---------------------------------------------------------------------------
// glowing floating item (documents, bread, matryoshka…)
const ITEM_GEO = {}
function itemGeo(kind) {
  if (ITEM_GEO[kind]) return ITEM_GEO[kind]
  const g = new GeoBuilder()
  if (kind === 'dosar') {
    g.box(0.44, 0.07, 0.32, { color: 0xd9c38a })
    g.box(0.4, 0.02, 0.28, { y: 0.07, color: 0xf4ecd6 })
    g.box(0.12, 0.012, 0.3, { x: -0.1, y: 0.09, color: 0xb0181e })
  } else if (kind === 'matrioska') {
    g.sphere(0.2, 12, 10, { y: 0.2, sy: 1.25, color: 0xcc2233 })
    g.sphere(0.13, 12, 10, { y: 0.52, color: 0xcc2233 })
    g.sphere(0.1, 10, 8, { y: 0.53, z: 0.05, color: 0xf2d0b0 })
    g.box(0.18, 0.12, 0.02, { y: 0.14, z: 0.2, color: 0xf2c94a })
  } else if (kind === 'baban') {
    g.box(0.62, 0.42, 0.46, { color: 0x8a6a44 })
    g.box(0.64, 0.05, 0.48, { y: 0.2, color: 0x5a4028 })
  } else if (kind === 'foto') {
    g.box(0.3, 0.2, 0.12, { color: 0x222222 })
    g.cyl(0.07, 0.07, 0.08, 12, { y: 0.1, z: 0.09, rx: Math.PI / 2, center: true, color: 0x444a52 })
  } else if (kind === 'paine') {
    g.sphere(0.2, 12, 8, { y: 0.1, sx: 1.6, sy: 0.7, color: 0xc98a3a })
  } else if (kind === 'pizza') {
    g.box(0.5, 0.07, 0.5, { color: 0xe8d7b0 })
    g.box(0.3, 0.005, 0.2, { y: 0.07, color: 0xc0392b })
  } else {
    g.add(new THREE.OctahedronGeometry(0.25), { color: 0xffffff })
  }
  ITEM_GEO[kind] = g.build()
  return ITEM_GEO[kind]
}

export class Pickup {
  constructor(game, x, z, { kind = 'dosar', r = 1.6, y = null, glow = 0xffcf4a, beam = true } = {}) {
    this.game = game; this.x = x; this.z = z; this.r = r; this.kind = kind
    const gy = y ?? game.physics.groundHeight(x, z)
    this.baseY = gy + 0.9
    this.mesh = new THREE.Mesh(itemGeo(kind), game.materials.vcol({ key: 'pickup' }))
    this.mesh.position.set(x, this.baseY, z)
    this.mesh.castShadow = true
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }))
    this.halo.rotation.x = -Math.PI / 2
    this.halo.position.set(x, gy + 0.05, z)
    game.scene.add(this.mesh, this.halo)
    if (beam) {
      this.beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 8, 1, true), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.18, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }))
      this.beamMesh.position.set(x, gy + 3.5, z)
      game.scene.add(this.beamMesh)
    }
    this.t = Math.random() * 6
  }
  update(dt) {
    this.t += dt
    this.mesh.position.y = this.baseY + Math.sin(this.t * 2.5) * 0.12
    this.mesh.rotation.y += dt * 1.8
    this.halo.material.opacity = 0.35 + Math.sin(this.t * 4) * 0.15
  }
  near(p) { return Math.hypot(p.x - this.x, p.z - this.z) < this.r && Math.abs((p.y ?? this.baseY) - this.baseY) < 3 }
  dispose() {
    this.game.scene.remove(this.mesh, this.halo)
    this.halo.geometry.dispose(); this.halo.material.dispose()
    if (this.beamMesh) { this.game.scene.remove(this.beamMesh); this.beamMesh.geometry.dispose(); this.beamMesh.material.dispose() }
  }
}

// ---------------------------------------------------------------------------
// guard vision cone drawn on the ground + detection test
export class VisionCone {
  constructor(game, npc, { range = 11, fov = 0.9, rate = 1.6 } = {}) {
    this.game = game; this.npc = npc; this.range = range; this.fov = fov; this.rate = rate
    const g = new THREE.CircleGeometry(range, 24, Math.PI / 2 - fov / 2, fov)
    g.rotateX(-Math.PI / 2)
    // after rotateX the wedge centre (angle PI/2 in XY) points toward -z; flip it to +z (the NPC's forward)
    g.rotateY(Math.PI)
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.renderOrder = 3
    game.scene.add(this.mesh)
    this.alert = 0
    this.enabled = true
  }
  update(dt) {
    const c = this.npc.char
    this.mesh.visible = this.enabled && !c.ko
    this.mesh.position.set(c.mesh.position.x, c.mesh.position.y + 0.06, c.mesh.position.z)
    this.mesh.rotation.y = c.mesh.rotation.y
    const sees = this.enabled && this.sees(this.game.player.pos)
    const d = Math.hypot(this.game.player.pos.x - c.pos.x, this.game.player.pos.z - c.pos.z)
    // closer = faster detection; sprinting players are louder
    const k = sees ? this.rate * (1.6 - d / this.range) * (this.game.player.sprinting ? 1.4 : 1) : -0.7
    this.alert = clamp(this.alert + dt * k, 0, 1)
    this.mat.color.setHex(this.alert > 0.05 ? 0xff5a4a : 0xffe08a)
    this.mat.opacity = 0.14 + this.alert * 0.3
    return this.alert >= 1
  }
  sees(p) {
    const c = this.npc.char
    if (c.ko) return false
    const dx = p.x - c.pos.x, dz = p.z - c.pos.z, d = Math.hypot(dx, dz)
    if (d > this.range || d < 0.01) return false
    if (Math.abs(angleDiff(c.heading, Math.atan2(dx, dz))) > this.fov / 2) return false
    const hit = this.game.physics.raycast(c.pos.x, c.pos.y + 1.5, c.pos.z, dx / d, 0, dz / d, d, FILTER.Q_CAMERA)
    return !hit
  }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose() }
}

// ---------------------------------------------------------------------------
// drives a vehicle along a list of points (tailing targets, fleeing villains, racers)
export class RouteDriver {
  constructor(game, v, points, { speed = 16, loop = false, onEnd = null, avoid = true, laps = 0, loopFrom = 0, priority = true, yieldPlayer = false } = {}) {
    this.game = game; this.v = v; this.points = points; this.i = 0; this.loopFrom = loopFrom
    this.yieldPlayer = yieldPlayer   // stop (and honk) for the hero on foot instead of driving through
    this.speed = speed; this.loop = loop || laps > 0; this.laps = laps; this.lap = 0; this.onEnd = onEnd; this.avoid = avoid
    this.speedMul = 1
    this.done = false
    this.stuck = 0
    this.blockedT = 0        // stopped behind another car
    this.best = Infinity     // closest we've been to the current waypoint, and how long ago
    this.noProgT = 0
    this.clearT = 0
    this.offset = 0          // lateral shift from the route (m, + = left): overtaking
    this.offsetTarget = 0
    this.passT = 0
    v.driver = this; v.ai = this
    v.parked = false
    v.body.wakeUp()
    // traffic yields to story cars and keeps off their road; nobody parks on it meanwhile
    this.slots = []
    if (priority && game.traffic) {
      game.traffic.priority.add(this)
      for (const sl of game.vehicles?.parkedSlots || []) if (!sl.reserved && this.nearRoute(sl.x, sl.z, 3.4)) { sl.reserved = true; this.slots.push(sl) }
      this.clearAhead(true)
    }
  }
  release() { for (const sl of this.slots) sl.reserved = false; this.slots = [] }
  // distance test against the whole route polyline
  nearRoute(x, z, r) {
    const pts = this.points
    for (let i = 0; i < pts.length - 1 + (this.loop ? 1 : 0); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / L2))
      if (Math.hypot(a.x + abx * t - x, a.z + abz * t - z) < r) return true
    }
    return false
  }
  // the hero is riding along: drive like a (Chișinău) human, never like a battering ram
  get chauffeur() { const p = this.game.player; return !!p && p.vehicle === this.v && p.passenger }
  // take the ordinary traffic the camera can't see off the next stretch of road
  clearAhead(all = false) {
    const tr = this.game.traffic
    if (!tr) return
    for (const d of [...tr.drivers]) {
      const o = d.v
      if (!tr.removable(o) || o === this.v) continue
      if (!all && Math.hypot(o.pos.x - this.v.pos.x, o.pos.z - this.v.pos.z) > 160) continue
      if (tr.visible(o.pos.x, o.pos.z)) continue
      if (tr.onPriorityPath(o.pos.x, o.pos.z, 7)) tr.despawn(d)
    }
    // parked cars already standing in the reserved bays
    const V = this.game.vehicles
    for (const sl of this.slots) {
      const o = V?.parkedActive?.get(sl.i)
      if (o && tr.removable(o) && !tr.visible(o.pos.x, o.pos.z)) V.remove(o)
    }
  }
  eject() { this.done = true; this.release() }
  finish() {
    this.done = true
    this.release()
    this.v.throttle = 0; this.v.handbrake = true
    if (this.onEnd) { const cb = this.onEnd; this.onEnd = null; cb() }
  }
  fixedUpdate(h) {
    const v = this.v
    if (this.done || v.disposed || v.driver !== this) return
    if (v.broken) { v.throttle = 0; v.handbrake = true; return }
    let w = this.points[this.i]
    if (!w) { this.finish(); return }
    const d = Math.hypot(w.x - v.pos.x, w.z - v.pos.z)
    if (d < (w.r || 7)) {
      this.i++; this.best = Infinity; this.noProgT = 0
      if (this.i >= this.points.length) {
        if (this.loop) {
          this.i = this.loopFrom; this.lap++
          if (this.laps && this.lap >= this.laps) { this.finish(); return }
        } else { this.finish(); return }
      }
      w = this.points[this.i]
    }
    const nx = this.points[this.i + 1] || (this.loop ? this.points[this.loopFrom] : w)
    const d2 = Math.hypot(w.x - v.pos.x, w.z - v.pos.z)
    // pure pursuit: aim at a point a short way ahead along the route (keeps to the lane instead
    // of drifting toward a waypoint far down the road), spilling onto the next leg at corners
    const pv = this.i > 0 ? this.points[this.i - 1] : this.lap > 0 ? this.points[this.points.length - 1] : (this.startPt ||= { x: v.pos.x, z: v.pos.z })
    const sl = Math.hypot(w.x - pv.x, w.z - pv.z) || 1
    const sx = (w.x - pv.x) / sl, sz = (w.z - pv.z) / sl
    const look = clamp(5 + Math.abs(v.speed) * 0.75, 6, 22)
    const along = clamp((v.pos.x - pv.x) * sx + (v.pos.z - pv.z) * sz, 0, sl)
    let tx, tz
    if (along + look < sl) { tx = pv.x + sx * (along + look); tz = pv.z + sz * (along + look) }
    else {
      const nl = Math.hypot(nx.x - w.x, nx.z - w.z) || 1
      const k2 = Math.min(1, (along + look - sl) / nl) * (nx === w ? 0 : 1)
      tx = w.x + (nx.x - w.x) * k2; tz = w.z + (nx.z - w.z) * k2
    }
    // overtaking: follow the route shifted a lane to the left
    this.offset += (this.offsetTarget - this.offset) * (1 - Math.exp(-1.8 * h))
    if (Math.abs(this.offset) > 0.05) { tx += sz * this.offset; tz += -sx * this.offset }
    const err = angleDiff(v.heading, Math.atan2(tx - v.pos.x, tz - v.pos.z))
    v.steer = clamp(-err * 2.5, -1, 1)
    let target = (w.speed ?? this.speed) * this.speedMul
    if (Math.abs(err) > 0.5) target = Math.min(target, 9)
    // with a passenger: ease off early for a slower leg ahead (≈3 m/s² instead of a slammed brake)
    if (this.chauffeur && nx !== w) {
      const ns = (nx.speed ?? this.speed) * this.speedMul
      target = Math.min(target, Math.sqrt(ns * ns + 6 * Math.max(0, d2 - (w.r || 7))))
    }
    const tr = this.game.traffic
    const chauffeur = this.chauffeur
    let blocker = null
    const passing = this.offsetTarget !== 0 ? this.passing : null
    if (this.avoid && tr) {
      const obs = tr.obstacleAhead(v, 8 + Math.abs(v.speed) * (chauffeur ? 1.2 : 1), passing, 0.2)
      const onFoot = obs?.player && this.yieldPlayer && !this.game.player.vehicle
      if (obs && (!obs.player || onFoot)) {
        // with a passenger (or the hero standing in the road): queue politely; otherwise shove
        // through at walking pace
        target = Math.min(target, chauffeur || onFoot ? Math.max(0, (obs.d - 3.2) * 0.9) : Math.max(3, obs.d * 0.9))
        blocker = obs.v
        this.honkT = (this.honkT || 0) - h
        if (onFoot && Math.abs(v.speed) < 1 && this.honkT <= 0) { this.honkT = 3.5; this.game.audio?.horn(v, 0.8) }
      }
    }
    // pulling out round a stopped car: ease out, then go
    if (passing) target = Math.min(target, 3.5 + 11 * clamp(this.offset / LANE_W, 0, 1))
    const e = target - v.speed
    v.throttle = e > 0 ? Math.min(1, e * 0.5 + 0.25) : Math.max(-1, e * 0.3)
    // and drive like there's a passenger: gentle on both pedals
    if (this.chauffeur) v.throttle = clamp(v.throttle, -0.35, 0.72)
    v.handbrake = chauffeur && target < 0.3 && Math.abs(v.speed) < 0.6
    // stuck behind slow or stopped traffic on a straight: pull out and pass when the next lane is
    // clear (Nea Grișa has never waited for anyone), then tuck back in once past
    const straight = d2 > 24 && Math.abs(err) < 0.35
    if (this.offsetTarget === 0 && blocker && Math.abs(blocker.speed || 0) < 1 && this.blockedT > 0.8 && straight && this.laneFree(LANE_W, sx, sz, 70)) {
      this.offsetTarget = LANE_W; this.passT = 0; this.passing = blocker
    } else if (this.offsetTarget !== 0) {
      this.passT += h
      const back = this.passT > 1.5 && this.laneFree(0, sx, sz, 14, -3.5)
      if (back || d2 < 16 || (this.passT > 14 && this.laneFree(0, sx, sz, 8, -3))) { this.offsetTarget = 0; this.passing = null }
    }
    // still stuck: once nobody is looking (or after a long wait) the blocker goes
    if (blocker && Math.abs(v.speed) < 1.2) {
      this.blockedT += h
      if (tr.removable(blocker) && (this.blockedT > 18 || (this.blockedT > 1.5 && !tr.visible(blocker.pos.x, blocker.pos.z)))) {
        const d = tr.drivers.find((dd) => dd.v === blocker)
        if (d) tr.despawn(d); else this.game.vehicles.remove(blocker)
        this.blockedT = 0
      }
    } else this.blockedT = 0
    if (!blocker && Math.abs(v.speed) < 0.8 && target > 3) {
      this.stuck += h
      if (this.stuck > 1.2) { v.throttle = -1; v.steer = -v.steer }
      if (this.stuck > 2.6) this.stuck = 0
    } else this.stuck = 0
    // keep the road ahead clear of traffic the camera can't see
    if ((this.clearT -= h) <= 0) { this.clearT = 1; this.clearAhead() }
    // no progress for a long time (wedged on a kerb, boxed in): hop to the next waypoint. With the
    // hero in the back it's a scripted ride, so a few seconds' stall already becomes a jump cut
    if (d2 < this.best - 1.5 || (w.speed ?? this.speed) * this.speedMul <= 3) { this.best = Math.min(this.best, d2); this.noProgT = 0 }
    else if ((this.noProgT += h) > (chauffeur ? 4 : 12)) this.rescue(w)
  }
  // no vehicle (or walker in the road) in the lane `off` metres left of the route, from `back`
  // metres behind us to `ahead` metres in front
  laneFree(off, sx, sz, ahead, back = -8) {
    const v = this.v, g = this.game
    const lx = sz, lz = -sx
    const test = (x, z, half) => {
      const dx = x - v.pos.x, dz = z - v.pos.z
      const along = dx * sx + dz * sz, side = dx * lx + dz * lz
      return along > back && along < ahead && Math.abs(side - off) < 1.6 + half
    }
    for (const o of g.vehicles.list) if (o !== v && test(o.pos.x, o.pos.z, o.def.dims[0])) return false
    const p = g.player
    if (p && !p.vehicle && test(p.pos.x, p.pos.z, 0.4)) return false
    for (const c of g.peds?.list || []) if (!c.ko && c.onRoad && test(c.pos.x, c.pos.z, 0.4)) return false
    return true
  }
  rescue(w) {
    const v = this.v, g = this.game
    this.noProgT = 0; this.best = Infinity
    if (!this.chauffeur && g.traffic?.visible(v.pos.x, v.pos.z)) return
    const go = () => {
      let x = w.x, z = w.z
      let ry = Math.atan2((this.points[this.i + 1] || w).x - w.x, (this.points[this.i + 1] || w).z - w.z) || v.heading
      if (this.chauffeur) {
        // a jump cut just past whatever is in the way (not a hop across town), on a spot where
        // nothing is parked (the trolleybus can't be cleared away, so it's stepped over)
        const dx = w.x - v.pos.x, dz = w.z - v.pos.z, d = Math.hypot(dx, dz) || 1
        ry = Math.atan2(dx, dz)
        for (let s = 30; s <= d; s += 12) {
          x = v.pos.x + dx / d * s; z = v.pos.z + dz / d * s
          if (!g.vehicles.list.some((o) => o !== v && Math.hypot(o.pos.x - x, o.pos.z - z) < 4 + o.def.dims[2])) break
          x = w.x; z = w.z
        }
      }
      g.vehicles.clearSpot?.(x, z, 7)
      v.teleport(x, (g.physics.groundHeight(x, z, 3) ?? v.pos.y) + 0.3, z, ry)
      // the passenger's camera lands behind the cab, not somewhere across town
      if (this.chauffeur && g.cameraRig) g.cameraRig.yaw = ry
    }
    if (this.chauffeur && g.ui?.fade) g.ui.fade(1, 250).then(() => { go(); g.cameraRig?.snap(); g.ui.fade(0, 400) })
    else go()
  }
  // 0..1 progress along the route (for rubber-banding and race positions)
  progress() {
    const n = this.points.length
    const w = this.points[Math.min(this.i, n - 1)], p = this.points[Math.max(0, this.i - 1)]
    const seg = Math.hypot(w.x - p.x, w.z - p.z) || 1
    const left = Math.hypot(w.x - this.v.pos.x, w.z - this.v.pos.z)
    return this.lap + (this.i - Math.min(1, left / seg)) / n
  }
}

// ---------------------------------------------------------------------------
// follows (or rams) a moving target: police pull-overs, escorts, angry gopniks
export class ChaseDriver {
  constructor(game, v, target, { speed = 24, keep = 0, ram = false } = {}) {
    this.game = game; this.v = v; this.target = target
    this.speed = speed; this.keep = keep; this.ram = ram
    this.path = null; this.ri = 1; this.routeT = 0; this.stuck = 0; this.reverseT = 0
    this.speedMul = 1
    this.done = false
    v.driver = this; v.ai = this
    v.parked = false
    v.body.wakeUp()
  }
  eject() { this.done = true }
  fixedUpdate(h) {
    const v = this.v, g = this.game
    if (this.done || v.driver !== this) return
    if (v.broken) { v.throttle = 0; v.handbrake = true; return }
    const t = this.target()
    if (!t) { v.throttle = 0; v.handbrake = true; return }
    const dx = t.x - v.pos.x, dz = t.z - v.pos.z, d = Math.hypot(dx, dz)
    let want = Math.atan2(dx, dz)
    if (d > 40) {
      this.routeT -= h
      if (this.routeT <= 0 || !this.path) { this.routeT = 1.5; this.path = g.traffic.graph.route(v.pos.x, v.pos.z, t.x, t.z); this.ri = 1 }
      const r = this.path
      if (r && r[this.ri]) {
        if (Math.hypot(r[this.ri].x - v.pos.x, r[this.ri].z - v.pos.z) < 12 && this.ri < r.length - 1) this.ri++
        want = Math.atan2(r[this.ri].x - v.pos.x, r[this.ri].z - v.pos.z)
      }
    }
    const err = angleDiff(v.heading, want)
    if (this.reverseT > 0) { this.reverseT -= h; v.throttle = -0.8; v.steer = Math.sign(err) || 1; v.handbrake = false; return }
    v.steer = clamp(-err * 2.2, -1, 1)
    let target = this.speed * this.speedMul
    if (this.keep > 0) target = Math.min(target, Math.max(0, (d - this.keep) * 0.9) + (t.speed || 0) * 0.8)
    if (Math.abs(err) > 1) target = Math.min(target, 9)
    const e = target - v.speed
    v.throttle = e > 0 ? Math.min(1, e * 0.4 + 0.3) : Math.max(-1, e * 0.35)
    v.handbrake = (Math.abs(err) > 1.2 && v.speed > 10) || (this.keep > 0 && d < this.keep * 0.8 && v.speed < 2)
    if (Math.abs(v.speed) < 1 && target > 3) { this.stuck += h; if (this.stuck > 1.5) { this.stuck = 0; this.reverseT = 1.1 } } else this.stuck = 0
  }
}

// ---------------------------------------------------------------------------
// the passenger train that brings the hero home (and leaves again)
export class Train {
  constructor(game, { cars = 3, track = RAIL_Z - 4 } = {}) {
    this.game = game
    this.group = new THREE.Group()
    const g = new GeoBuilder()
    const GREEN = 0x2e6a4a, CREAM = 0xe8dfc6, DARK = 0x1b1d20, RED = 0xb0302a
    // locomotive (front at -x, the direction of travel)
    const L = 17
    g.box(L, 3.3, 3.0, { x: -L / 2, y: 0.9, color: GREEN })
    g.box(L + 0.05, 0.35, 3.05, { x: -L / 2, y: 2.3, color: 0xe8c14a })
    g.box(2.2, 2.0, 3.02, { x: -L + 1.1, y: 2.2, color: RED })
    g.box(0.1, 0.9, 2.2, { x: -L - 0.02, y: 2.9, color: DARK, emit: 0.3 })
    g.box(L - 1, 0.5, 2.6, { x: -L / 2, y: 4.2, color: 0x3a3f44 })
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) g.cyl(0.5, 0.5, 0.25, 10, { x: -3 - k * 1.3, y: 0.5, z: s * 1.25, rx: Math.PI / 2, center: true, color: DARK })
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) g.cyl(0.5, 0.5, 0.25, 10, { x: -L + 3 + k * 1.3, y: 0.5, z: s * 1.25, rx: Math.PI / 2, center: true, color: DARK })
    // coaches
    let x = 0.8
    for (let c = 0; c < cars; c++) {
      const C = 23
      g.box(C, 3.1, 2.95, { x: x + C / 2, y: 0.9, color: GREEN })
      g.box(C + 0.02, 0.9, 3.0, { x: x + C / 2, y: 2.25, color: CREAM })
      for (let w = 0; w < 9; w++) g.box(1.5, 0.7, 3.04, { x: x + 2.4 + w * 2.3, y: 2.35, color: 0x26303a, emit: 0.55 })
      for (const dx of [1.1, C - 1.1]) g.box(1.0, 2.2, 3.04, { x: x + dx, y: 1.0, color: 0x3a4a3e })
      g.box(C - 0.5, 0.4, 2.7, { x: x + C / 2, y: 4.0, color: 0x6a6f74 })
      for (const s of [-1, 1]) for (const bx of [3, C - 3]) g.cyl(0.45, 0.45, 0.25, 10, { x: x + bx, y: 0.45, z: s * 1.2, rx: Math.PI / 2, center: true, color: DARK })
      x += C + 0.8
    }
    this.length = x + L
    this.mesh = new THREE.Mesh(g.build(), game.materials.vcol({ key: 'train' }))
    this.mesh.castShadow = true
    this.group.add(this.mesh)
    this.group.position.set(9999, 0.05, track)
    game.scene.add(this.group)
    this.x = 9999; this.v = 0; this.mode = 'idle'
  }
  // run in from the east and stop with the nose at stopX
  arrive(stopX, secs = 8) {
    this.stopX = stopX
    this.dist = 22 * secs / 2 // decelerating from 22 m/s to 0 over `secs`
    this.x = stopX + this.dist
    this.v = 22; this.decel = 22 / secs
    this.mode = 'arrive'
    this.game.audio?.sfx('train_horn', { vol: 0.8 })
  }
  depart() { this.mode = 'depart'; this.v = 0 }
  update(dt) {
    if (this.mode === 'arrive') {
      this.v = Math.max(0, this.v - this.decel * dt)
      this.x -= this.v * dt
      if (this.v <= 0 || this.x <= this.stopX) { this.x = this.stopX; this.mode = 'stopped' }
    } else if (this.mode === 'depart') {
      this.v = Math.min(24, this.v + 2.5 * dt)
      this.x -= this.v * dt
      if (this.x < -700) this.mode = 'gone'
    }
    this.group.position.x = this.x
    this.group.visible = this.mode !== 'idle' && this.mode !== 'gone'
  }
  dispose() { this.game.scene.remove(this.group); this.mesh.geometry.dispose() }
}

// ---------------------------------------------------------------------------
// simple set-dressing built for a mission (podium, ribbon, crates…) and removed afterwards
export class SetPiece {
  constructor(game, build, { x = 0, z = 0, ry = 0, y = null, collide = null } = {}) {
    this.game = game
    const g = new GeoBuilder()
    build(g)
    this.mesh = new THREE.Mesh(g.build(), game.materials.vcol({ key: 'setpiece' }))
    this.mesh.castShadow = true; this.mesh.receiveShadow = true
    this.mesh.position.set(x, y ?? game.physics.groundHeight(x, z), z)
    this.mesh.rotation.y = ry
    game.scene.add(this.mesh)
    this.bodies = []
    if (collide) for (const [cx, cy, cz, hx, hy, hz] of collide) {
      const c = Math.cos(ry), s = Math.sin(ry)
      this.bodies.push(game.physics.box(x + cx * c + cz * s, this.mesh.position.y + cy, z - cx * s + cz * c, hx, hy, hz, { rotY: ry }))
    }
  }
  dispose() {
    this.game.scene.remove(this.mesh); this.mesh.geometry.dispose()
    for (const b of this.bodies) this.game.physics.removeCollider(b)
  }
}

// ---------------------------------------------------------------------------
// fillable potholes: slow cars, cost suspension, give civic points when fixed
export const POTHOLE_SPOTS = [[-250, 5.5], [-120, -6], [60, 6], [190, -7], [330, 4], [-60, 138], [140, 141], [-180, -142], [250, -139], [-300, 60], [300, 200],
  [60, 80], [-60, -70], [180, 210], [-180, 200], [420, 100], [-420, -60], [0, 270], [120, -270], [-240, 270]]

export class Potholes {
  constructor(game) {
    this.game = game
    this.list = []
    const geo = new THREE.CircleGeometry(1.2, 18); geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 1, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4 })
    const fixedMat = new THREE.MeshStandardMaterial({ color: 0x2c2d31, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 })
    POTHOLE_SPOTS.forEach(([x, z], i) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, game.physics.groundHeight(x, z) + 0.02, z)
      m.scale.set(1 + (i % 3) * 0.2, 1, 0.8 + (i % 2) * 0.3)
      m.receiveShadow = true
      game.scene.add(m)
      this.list.push({ i, x, z, m, fixed: false })
    })
    this.fixedMat = fixedMat
  }
  syncFixed(ids) { for (const p of this.list) if (ids.includes(p.i)) { p.fixed = true; p.m.material = this.fixedMat } }
  fix(h) { h.fixed = true; h.m.material = this.fixedMat }
  update() {
    const g = this.game, p = g.player
    if (!p) return
    const v = p.vehicle
    const now = performance.now()
    for (const h of this.list) {
      if (h.fixed) continue
      for (const car of g.vehicles.list) {
        if (Math.abs(car.speed) < 4) continue
        if ((car.pos.x - h.x) ** 2 + (car.pos.z - h.z) ** 2 < 3.2) {
          if ((h.cool || 0) > now) continue
          h.cool = now + 700
          car.bump = 0.12; car.speed *= 0.82
          if (car === v) { car.damage(3); g.cameraRig.shake(0.35); g.audio?.sfx('bump', { vol: 0.9 }); g.ui.notify('Bum! Groapă. Suspensia plânge.', 1.8) }
        }
      }
    }
  }
  nearest(pos, r = 2.2) {
    let best = null, bd = r
    for (const h of this.list) { if (h.fixed) continue; const d = Math.hypot(h.x - pos.x, h.z - pos.z); if (d < bd) { bd = d; best = h } }
    return best
  }
}
