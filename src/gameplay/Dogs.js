import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'

// A few people near you walk a dog: a little mongrel on the pavement beside its owner, legs
// going, tail going faster when you come close, and an opinion about you ("Ham!"). Never more
// than three at a time, only near you, gone with their owner. The dog is scenery: no physics.

const COATS = [[0xc8a070, 0xf2e6d0], [0x3a3028, 0xc8a070], [0xe8e0d0, 0x8a6a4a], [0x6a4a2a, 0x3a2a1c], [0x9a9a9a, 0xe8e8e8]]
const BARK = ['Ham! Ham!', 'Hrrr… ham!', 'Ham!', 'Mrrr?']
const OWNER = ['Nu mușcă. De obicei.', 'Stai, Bobik! Scuzați, e tânăr.', 'Nu-i da nimic, că-i la dietă.', 'Bobik, lasă omul în pace!']
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const MAX = 3

let geos = null
function build() {
  if (geos) return geos
  geos = COATS.map(([coat, patch]) => {
    const b = new GeoBuilder()
    b.box(0.2, 0.2, 0.52, { y: 0.28, color: coat })
    b.box(0.21, 0.08, 0.3, { y: 0.4, z: -0.04, color: patch })
    b.box(0.17, 0.17, 0.2, { y: 0.44, z: 0.32, color: coat })
    b.box(0.1, 0.08, 0.12, { y: 0.44, z: 0.46, color: patch })
    b.box(0.04, 0.035, 0.03, { y: 0.49, z: 0.52, color: 0x151515 })
    for (const s of [-1, 1]) b.box(0.05, 0.09, 0.03, { x: s * 0.07, y: 0.56, z: 0.28, rz: s * 0.4, color: coat })
    const leg = new GeoBuilder().box(0.055, 0.26, 0.055, { y: -0.26, color: coat })
    const tail = new GeoBuilder().box(0.04, 0.04, 0.2, { z: -0.1, rx: -0.5, color: coat })
    return { body: b.build(), leg: leg.build(), tail: tail.build() }
  })
  return geos
}

export class Dogs {
  constructor(game) {
    this.game = game
    this.list = []
    this.t = 3
  }

  spawn(owner) {
    const g = this.game, k = Math.floor(Math.random() * COATS.length), G = build()[k]
    const mat = g.materials.vcol({ key: 'dog' })
    const group = new THREE.Group()
    const body = new THREE.Mesh(G.body, mat)
    body.castShadow = true
    group.add(body)
    const legs = [[-0.07, 0.19], [0.07, 0.19], [-0.07, -0.19], [0.07, -0.19]].map(([x, z]) => {
      const m = new THREE.Mesh(G.leg, mat)
      m.position.set(x, 0.3, z)
      group.add(m)
      return m
    })
    const tail = new THREE.Mesh(G.tail, mat)
    tail.position.set(0, 0.38, -0.26)
    group.add(tail)
    g.scene.add(group)
    const side = Math.random() < 0.5 ? 1 : -1
    const d = { owner, group, legs, tail, side, x: owner.pos.x, z: owner.pos.z, heading: owner.char.heading, phase: 0, wag: 0, barkT: 0, speed: 0, char: null }
    // what the speech bubble needs to follow it
    d.char = { mesh: group, visible: true }
    owner.dog = d
    this.list.push(d)
    return d
  }

  remove(d) {
    const i = this.list.indexOf(d)
    if (i >= 0) this.list.splice(i, 1)
    if (d.owner && d.owner.dog === d) d.owner.dog = null
    this.game.ui?.removeBubble(d)
    this.game.scene.remove(d.group)
  }

  // a walker a street away gets a dog (never one popping up in front of the camera)
  recruit() {
    const g = this.game, P = g.focus()
    if (this.list.length >= MAX) return
    for (const n of g.peds.list) {
      if (n.dog || n.archetype !== 'civilian' || n.personality === 'tough' || n.state !== 'walk' || n.char.ko || n.persistent || n.debtor) continue
      const d = Math.hypot(n.pos.x - P.x, n.pos.z - P.z)
      if (d < 25 || d > 70 || g.traffic.visible(n.pos.x, n.pos.z)) continue
      if (Math.random() < 0.25) { this.spawn(n); return }
    }
  }

  update(dt) {
    const g = this.game, p = g.player
    this.t -= dt
    if (this.t <= 0) { this.t = 4; this.recruit() }
    const P = g.focus()
    for (const d of [...this.list]) {
      const o = d.owner
      if (!o || o.disposed || !o.char.visible || Math.hypot(d.x - P.x, d.z - P.z) > 110) { this.remove(d); continue }
      // heel: beside the owner and half a step behind
      const oh = o.char.heading
      const tx = o.pos.x + Math.cos(oh) * 0.75 * d.side - Math.sin(oh) * 0.35
      const tz = o.pos.z - Math.sin(oh) * 0.75 * d.side - Math.cos(oh) * 0.35
      const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz)
      const want = dd > 0.08 ? Math.min(9, dd * 4 + o.char.speed * 0.5) : 0
      d.speed += (want - d.speed) * Math.min(1, dt * 8)
      if (dd > 0.01) { const k = Math.min(dd, d.speed * dt) / dd; d.x += dx * k; d.z += dz * k }
      if (dd > 6) { d.x = tx; d.z = tz }
      // look where it goes; at you when you're close
      const pd = p && !p.vehicle ? Math.hypot(p.pos.x - d.x, p.pos.z - d.z) : 1e9
      const face = pd < 3.5 ? Math.atan2(p.pos.x - d.x, p.pos.z - d.z) : d.speed > 0.3 ? Math.atan2(dx, dz) : oh
      let a = face - d.heading
      a = Math.atan2(Math.sin(a), Math.cos(a))
      d.heading += a * Math.min(1, dt * 6)
      // legs and tail
      d.phase += d.speed * dt * 9
      const swing = Math.min(0.7, d.speed * 0.25)
      d.legs.forEach((m, i) => { m.rotation.x = Math.sin(d.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * swing })
      d.wag += dt * (pd < 5 ? 22 : 8)
      d.tail.rotation.y = Math.sin(d.wag) * (pd < 5 ? 0.7 : 0.35)
      const sit = d.speed < 0.2 && o.state !== 'walk' && o.state !== 'run' && o.state !== 'flee'
      d.group.position.set(d.x, o.pos.y + (sit ? -0.06 : Math.abs(Math.sin(d.phase)) * 0.02 * Math.min(1, d.speed)), d.z)
      d.group.rotation.set(sit ? -0.25 : 0, d.heading, 0)
      // an opinion about you
      d.barkT -= dt
      if (pd < 3.2 && d.barkT <= 0) {
        d.barkT = 9 + Math.random() * 8
        g.ui?.bubble(d, pick(BARK), 1.8)
        if (Math.random() < 0.5) setTimeout(() => { if (!o.disposed) o.say(pick(OWNER), 2.6) }, 900)
      }
    }
  }
}
