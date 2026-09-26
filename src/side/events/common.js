import * as THREE from 'three'
import { blockAt, CURB_H, H_ROADS, V_ROADS } from '../../world/CityLayout.js'

// Shared bits for the random street events: finding a spot near the player, the leash that
// ends an event you walked away from, the payout, speakers.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const pick = (a) => a[Math.floor(Math.random() * a.length)]
export const rand = (a, b) => a + Math.random() * (b - a)
export const here = (g) => (g.player.vehicle ? g.player.vehicle.pos : g.player.pos)
export const onFoot = (g) => !g.player.vehicle
export const driving = (g) => { const v = g.player.vehicle; return !!v && !g.player.passenger && !v.def.trolley && !v.broken }
export const hourIn = (g, a, b) => { const h = g.renderer.tod.hour; return a <= b ? h >= a && h < b : h >= a || h < b }

// solid stuff (walls, props, cars) where a person would stand
export function blocked(g, x, z) { try { return g.vehicles.blocked(x, z) } catch (e) { return true } }

// a pavement node of the pedestrian network in a distance band (optionally in some zones), with
// room around it for a small scene
export function sceneSpot(g, min, max, { zones = null, room = 2.2, tries = 40 } = {}) {
  const p = here(g)
  const nodes = (g.peds?.nodes || []).filter((n) => {
    const d = dist(n, p)
    if (d < min || d > max) return false
    if (zones) { const b = blockAt(n.x, n.z); if (!b || !zones.includes(b.zone)) return false }
    return true
  })
  for (let k = 0; k < tries && nodes.length; k++) {
    const n = pick(nodes)
    if (Math.abs(g.physics.groundHeight(n.x, n.z, 6)) > 0.6) continue
    let ok = !blocked(g, n.x, n.z)
    for (let a = 0; a < 4 && ok; a++) ok = !blocked(g, n.x + Math.cos(a * Math.PI / 2) * room, n.z + Math.sin(a * Math.PI / 2) * room)
    if (ok) return { x: n.x, z: n.z }
  }
  return null
}

// a named place (landmark) in a distance band, nudged to open ground next to it
export function placeSpot(g, ids, min, max) {
  const p = here(g)
  const P = g.world.places
  const cands = ids.map((id) => P[id]).filter((q) => q && dist(q, p) >= min && dist(q, p) <= max)
  for (let k = 0; k < 8 && cands.length; k++) {
    const q = pick(cands)
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 8
      const x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r
      if (Math.abs(g.physics.groundHeight(x, z, 6)) > 0.6 || blocked(g, x, z)) continue
      let ok = true
      for (let j = 0; j < 6 && ok; j++) ok = !blocked(g, x + Math.cos(j) * 3.2, z + Math.sin(j) * 3.2)
      if (ok) return { x, z, place: q }
    }
  }
  return null
}

// a stretch of pavement along a street (for parking where you shouldn't); ry along the kerb
export function kerbSpot(g, min, max, tries = 60) {
  const p = here(g)
  for (let k = 0; k < tries; k++) {
    const h = Math.random() < 0.6
    const r = h ? pick(H_ROADS) : pick(V_ROADS)
    const side = Math.random() < 0.5 ? -1 : 1
    const off = r.w / 2 + Math.min(r.sw, 5) * 0.5
    let x, z, ry
    if (h) {
      const j = Math.floor(Math.random() * (V_ROADS.length - 1))
      const a = V_ROADS[j].x + V_ROADS[j].w / 2 + 16, b = V_ROADS[j + 1].x - V_ROADS[j + 1].w / 2 - 16
      x = a + Math.random() * (b - a); z = r.z + side * off; ry = Math.PI / 2
    } else {
      const i = Math.floor(Math.random() * (H_ROADS.length - 1))
      const a = H_ROADS[i].z + H_ROADS[i].w / 2 + 16, b = H_ROADS[i + 1].z - H_ROADS[i + 1].w / 2 - 16
      z = a + Math.random() * (b - a); x = r.x + side * off; ry = 0
    }
    const d = dist({ x, z }, p)
    if (d < min || d > max) continue
    if (Math.abs(g.physics.groundHeight(x, z, 6) - CURB_H) > 0.25) continue
    let clear = true
    try { clear = !g.vehicles.blockedCar(x, z, ry) } catch (e) { clear = false }
    const fx = Math.sin(ry), fz = Math.cos(ry)
    for (const s of [-2.6, 0, 2.6]) if (clear && blocked(g, x + fx * s, z + fz * s)) clear = false
    if (!clear) continue
    if ((g.world.busStops || []).some((b) => dist(b, { x, z }) < 12) || (g.world.kiosks || []).some((b) => dist(b, { x, z }) < 6)) continue
    return { x, z, ry }
  }
  return null
}

// walked (or drove) away: the event goes on without you
export function leash(m, centre, { r = 140, secs = 6, text = 'Ai plecat. Întâmplarea s-a rezolvat fără tine.' } = {}) {
  let t = 0
  return m.every((dt) => { t = dist(m.P, centre) > r ? t + dt : 0; if (t > secs) m.fail(text) })
}

// the event is lost (the fail banner shows the reason)
export function lose(m, text) { m.fail(text); m.check() }

// the payout, with a banner
export function payout(m, { aura, lei = 0, why, title = 'REZOLVAT!', sub = '' }) {
  const g = m.game
  g.audio?.sting('mission_pass')
  g.ui.bigMessage(title, sub || why, { secs: 2.8 })
  if (lei) g.progress.addLei(lei)
  g.side?.aura.gain(aura, why, { raw: true, big: true })
}

// a speaker for m.say / m.talk; the NPC turns to the player while they talk
export const speaker = (name, role, spec, voice) => ({ name, role, spec, voice })

// hand control back and let the camera follow again (also on a failed event)
export function lockPlayer(m, on) {
  const p = m.player
  p.control = !on
  if (on) { p.vel.set(0, 0, 0); if (p.vehicle && !p.passenger) { p.vehicle.throttle = 0; p.vehicle.handbrake = true } }
}

// face a point (the hero)
export function face(char, x, z) { char.heading = char.prevHeading = Math.atan2(x - char.pos.x, z - char.pos.z) }

// a flat glowing outline on the ground (the parking box), cleaned up with the event
export class GroundRect {
  constructor(game, x, z, ry, hw, hl, color = 0xffcf4a) {
    this.game = game
    const g = new THREE.BufferGeometry()
    const w = 0.14, pts = []
    const edge = (x0, z0, x1, z1) => {
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), nx = -dz / L * w, nz = dx / L * w
      pts.push(x0 + nx, 0, z0 + nz, x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x0 + nx, 0, z0 + nz, x1 - nx, 0, z1 - nz, x0 - nx, 0, z0 - nz)
    }
    edge(-hw, -hl, hw, -hl); edge(hw, -hl, hw, hl); edge(hw, hl, -hw, hl); edge(-hw, hl, -hw, -hl)
    // a big P in the middle, made of the same stripes
    edge(-0.35, 0.8, -0.35, -0.9); edge(-0.35, 0.8, 0.3, 0.8); edge(0.3, 0.8, 0.3, 0); edge(0.3, 0, -0.35, 0)
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.position.set(x, game.physics.groundHeight(x, z, 3) + 0.04, z)
    this.mesh.rotation.y = ry
    this.mesh.renderOrder = 3
    game.scene.add(this.mesh)
    this.t = 0
  }
  update(dt) { this.t += dt; this.mat.opacity = 0.6 + Math.sin(this.t * 5) * 0.25 }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose() }
}
