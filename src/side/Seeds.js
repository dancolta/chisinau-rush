import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { mulberry } from '../world/rng.js'
import { onRoad } from '../world/CityLayout.js'
import { POTHOLE_SPOTS } from '../story/Kit.js'
import { GROUP, groups } from '../physics/Physics.js'
import { SEEDS } from '../data/goals.js'

// what blocks the way to a packet: buildings, walls, fences, poles (not cars or props, which move)
const WALLS = groups(0xffff, GROUP.STATIC | GROUP.THIN)

// The 30 golden seed packets hidden around town: off the pavement corners, a few steps into the
// courtyards, parks and squares behind them. Each one glows, bobs and sparkles so you can spot it
// from the street, and shows on the minimap once you're close. Walk or drive into one: lei, AURA,
// a burst of gold. Like the lost dossiers they only exist near you, and landing on one (a
// teleport, a retry, the flat's door) doesn't pick it up: you have to come up to it.
// The spots are worked out once from the pedestrian network, the same on every load.

let GEO = null
function packetGeo() {
  if (GEO) return GEO
  const g = new GeoBuilder()
  // the packet: gold foil, a crimped top, a sunflower on the front (and on the back)
  g.box(0.36, 0.44, 0.08, { y: -0.22, color: 0xf2b418, emit: 0.35 })
  g.box(0.37, 0.06, 0.09, { y: 0.2, color: 0xc98a12, emit: 0.2 })
  for (const s of [1, -1]) {
    g.cyl(0.085, 0.085, 0.012, 14, { y: -0.02, z: 0.046 * s, rx: Math.PI / 2, center: true, color: 0x4a2a10 })
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2
      g.box(0.05, 0.075, 0.01, { x: Math.cos(a) * 0.12, y: -0.02 + Math.sin(a) * 0.12 - 0.037, z: 0.047 * s, rz: a - Math.PI / 2, color: 0xffd23a, emit: 0.5 })
    }
    g.box(0.24, 0.05, 0.01, { y: -0.2, z: 0.047 * s, color: 0x2f5a1a })
  }
  GEO = g.build()
  return GEO
}

export class Seeds {
  constructor(goals) {
    this.goals = goals
    this.game = goals.game
    this.list = null            // [{ i, x, z, obj, armed }]
    this.last = null            // where the player was last frame (teleports don't collect)
    this.sparkT = 0
  }

  get found() { return this.goals.state.seeds }
  // before the prologue is over they stay hidden; the trailer capture films the city without them
  get on() { const g = this.game; return !g.capture && !this.off && !!g.story?.isDone('sosire') }

  reset() { if (this.list) for (const s of this.list) this.drop(s); this.last = null }

  // 30 spots a few steps in from pavement corners, on open ground, well apart from each other,
  // the lost dossiers, the potholes and the places missions (and tests) send you to
  spots() {
    if (this.list) return this.list
    const g = this.game
    const nodes = [...(g.peds?.nodes || [])].sort((a, b) => a.x - b.x || a.z - b.z)
    const rnd = mulberry(7373)
    const avoid = [
      ...(g.story?.acts?.dosarSpots() || []).map((d) => [d.x, d.z, 14]),
      ...POTHOLE_SPOTS.map(([x, z]) => [x, z, 8]),
      ...Object.values(g.world?.places || {}).map((p) => [p.x, p.z, 12]),
    ]
    const out = []
    for (let tries = 0; tries < 6000 && out.length < SEEDS.count && nodes.length; tries++) {
      const n = nodes[Math.floor(rnd() * nodes.length)]
      const b = n.block
      // into the block, towards its middle
      const cx = b ? (b.x0 + b.x1) / 2 : n.x, cz = b ? (b.z0 + b.z1) / 2 : n.z
      const dx = cx - n.x, dz = cz - n.z, dl = Math.hypot(dx, dz) || 1
      const step = 3 + rnd() * 7, side = (rnd() - 0.5) * 6
      const x = n.x + dx / dl * step - dz / dl * side, z = n.z + dz / dl * step + dx / dl * side
      if (onRoad(x, z, 1.5)) continue
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 48)) continue
      if (avoid.some(([ax, az, r]) => Math.hypot(ax - x, az - z) < r)) continue
      // open ground only: not on a roof, a wall top or inside something solid…
      const gy = g.physics.groundHeight(x, z, 4)
      if (!(gy > -0.5 && gy < 0.55)) continue
      // …and a straight walk from the pavement corner, no wall, fence or pole in the way
      const L = Math.hypot(x - n.x, z - n.z)
      if (g.physics.raycast(n.x, gy + 0.6, n.z, (x - n.x) / L, 0, (z - n.z) / L, L + 0.6, WALLS)) continue
      out.push({ i: out.length, x, z, y: gy, from: { x: n.x, z: n.z }, obj: null, armed: true })
    }
    this.list = out
    return out
  }

  update(dt) {
    const g = this.game, p = g.player
    if (!p || !this.on || g.home?.inside) { if (this.list) for (const s of this.list) this.drop(s); return }
    const P = p.vehicle ? p.vehicle.pos : p.pos
    const moved = this.last ? Math.hypot(P.x - this.last.x, P.z - this.last.z) : 0
    const jumped = !this.last || moved > 20
    this.last = { x: P.x, z: P.z }
    const got = this.found
    const r = p.vehicle ? SEEDS.rCar : SEEDS.r
    this.sparkT -= dt
    const spark = this.sparkT <= 0
    if (spark) this.sparkT = 0.22
    for (const s of this.spots()) {
      if (got.includes(s.i)) { this.drop(s); continue }
      const d = Math.hypot(s.x - P.x, s.z - P.z)
      // a teleport onto it doesn't count: walk out and back in
      if (jumped) s.armed = d > r
      else if (d > r + 2) s.armed = true
      if (d < SEEDS.near) this.show(s); else this.drop(s)
      if (!s.obj) continue
      const o = s.obj
      o.t += dt
      o.mesh.position.y = s.y + 0.95 + Math.sin(o.t * 2.4) * 0.12
      o.mesh.rotation.y += dt * 2.2
      o.halo.material.opacity = 0.35 + Math.sin(o.t * 4) * 0.15
      if (spark && d < 45) g.fx?.glow.emit(s.x + (Math.random() - 0.5) * 0.7, s.y + 0.7 + Math.random() * 0.7, s.z + (Math.random() - 0.5) * 0.7, { vy: 0.5 + Math.random() * 0.6, life: 0.7, size: 0.16, color: [1, 0.85, 0.3], alpha: 0.9, drag: 1 })
      if (s.armed && d < r && Math.abs((p.vehicle ? P.y : p.pos.y) - s.y) < 3) this.collect(s)
    }
  }

  show(s) {
    if (s.obj) return
    const g = this.game
    const mesh = new THREE.Mesh(packetGeo(), g.materials.vcol({ key: 'seedpack', roughness: 0.35, metalness: 0.35 }))
    mesh.position.set(s.x, s.y + 0.95, s.z)
    mesh.castShadow = true
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.72, 24), new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }))
    halo.rotation.x = -Math.PI / 2
    halo.position.set(s.x, s.y + 0.05, s.z)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 8, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.16, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }))
    beam.position.set(s.x, s.y + 4, s.z)
    g.scene.add(mesh, halo, beam)
    s.obj = { mesh, halo, beam, t: s.i * 0.7 }
  }

  drop(s) {
    const o = s.obj
    if (!o) return
    s.obj = null
    this.game.scene.remove(o.mesh, o.halo, o.beam)
    o.halo.geometry.dispose(); o.halo.material.dispose()
    o.beam.geometry.dispose(); o.beam.material.dispose()
  }

  collect(s) {
    const g = this.game
    const y = s.y + 1
    // a burst of gold where it was
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4
      g.fx?.glow.emit(s.x, y, s.z, { vx: Math.cos(a) * v, vy: 1.5 + Math.random() * 4, vz: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, size: 0.22, color: [1, 0.82, 0.25], grav: 6, drag: 1.5 })
    }
    g.fx?.confetti(s.x, y, s.z, 18)
    g.audio?.sfx('coins_many', { bus: 'ui', vol: 0.8 })
    g.audio?.sfx('pickup', { bus: 'ui', vol: 0.7, pitch: 1.3 })
    g.cameraRig?.shake(0.14)
    this.drop(s)
    this.goals.found(s.i)
  }

  // on the minimap only when you're close: they're meant to be found
  blips() {
    if (!this.on || !this.list) return []
    const p = this.game.player, P = p.vehicle ? p.vehicle.pos : p.pos, got = this.found
    return this.list.filter((s) => !got.includes(s.i) && Math.hypot(s.x - P.x, s.z - P.z) < SEEDS.blip).map((s) => ({ kind: 'icon', x: s.x, z: s.z, icon: '🌻' }))
  }
}
