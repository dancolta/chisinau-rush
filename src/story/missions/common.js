import * as THREE from 'three'
import { randomCivilian } from '../../data/outfits.js'
import { pathThrough } from '../Kit.js'

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const rand = (a, b) => a + Math.random() * (b - a)
export const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]

// first candidate spot not occupied by another vehicle
export function freeSpot(game, cands, r = 5) {
  for (const c of cands) if (!game.vehicles.list.some((v) => dist(v.pos, c) < r)) return c
  return cands[cands.length - 1]
}

// a line of text on a panel in the world (banners, placards)
export function banner(m, text, { x, y, z, ry = 0, w = 6, h = 1.2, bg = '#b0181e', fg = '#ffffff', font = 'Bangers' } = {}) {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = Math.round(1024 * h / w)
  const g = c.getContext('2d')
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20)
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  let size = c.height * 0.62
  g.font = `${size}px ${font}`
  while (g.measureText(text).width > c.width * 0.9 && size > 10) { size -= 4; g.font = `${size}px ${font}` }
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.04)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }))
  mesh.position.set(x, y, z); mesh.rotation.y = ry
  mesh.castShadow = true
  m.game.scene.add(mesh)
  return m.track({ mesh, dispose: () => { m.game.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); tex.dispose() } })
}

// people standing around facing a point (rallies, ribbon cuttings)
export function crowd(m, cx, cz, n, { r0 = 6, r1 = 9, a0 = 0.35, a1 = Math.PI - 0.35, face = null, cheer = true } = {}) {
  const list = []
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n > 1 ? i / (n - 1) : 0.5) + rand(-0.06, 0.06)
    const r = rand(r0, r1)
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
    const npc = m.spawn(null, randomCivilian(Math.random), x, z)
    const fx = face ? face.x : cx, fz = face ? face.z : cz
    npc.char.lookAtNow(fx, fz)
    npc.home.ry = npc.char.heading
    npc.crowd = true
    list.push(npc)
  }
  if (cheer) m.every(() => { if (Math.random() < 0.01) { const c = pickOne(list); if (c && !c.char.anim.busy && !c.char.ko) c.char.anim.play(Math.random() < 0.6 ? 'cheer' : 'point') } })
  return list
}
export function cheerAll(list, anim = 'cheer') { for (const c of list) if (!c.char.ko) setTimeout(() => c.char.anim.play(anim), Math.random() * 500) }

// ---------------------------------------------------------------------------
// taxi fare: passenger waits at `from`, rides to `to`, pays on arrival
export async function taxiFare(m, { taxi = null, spec = null, name = 'Clientul', voice = { pitch: 1, type: 'male' }, from, to, toLabel, lines = [], arrive = [], crashLines = null, patience = 25, pay = null }) {
  const g = m.game
  const sp = { name, voice, spec }
  const npc = m.spawn(null, spec || randomCivilian(Math.random), from.x, from.z, { name, voice, ry: from.ry ?? 0 })
  npc.lookAtPlayer = true
  const inTaxi = () => { const v = m.car; return !!v && (!taxi || v === taxi) && !v.broken }
  let offT = 0, phase = 'pickup', was = null
  const watch = m.every((dt) => {
    const inside = inTaxi()
    if (!inside && !g.cutscene) { offT += dt; if (offT > patience) m.fail('Ai lăsat taxiul. Clientul a plecat supărat.') } else offT = 0
    // out of the cab: point back to it; back in: point to the fare
    if (taxi && inside !== was) {
      was = inside
      if (!inside) { m.marker(taxi.pos, 'Taxiul'); m.sub('Întoarce-te în taxi ({y}[E]{/y}), clientul așteaptă!') }
      else if (phase === 'pickup') { m.marker({ x: from.x, z: from.z }, name); m.sub('Oprește lângă el cu taxiul.') }
      else { m.marker(to, toLabel); m.sub('Bacșiș dacă ajungi repede și fără bușituri.') }
    }
  })
  m.objective(`Ia clientul: {y}${name}{/y}.`, { sub: 'Oprește lângă el cu taxiul.' })
  m.marker({ x: from.x, z: from.z }, name)
  let waved = false
  await m.until(() => {
    const v = m.car
    if (v && !waved && dist(v.pos, npc.pos) < 40) { waved = true; npc.char.anim.play('wave'); npc.say(pickOne(['Taxi! Taxiii!', 'Șefu\'! Aici!', 'Ei, taxi!'])) }
    return inTaxi() && Math.abs(m.car.speed) < 1.5 && dist(m.car.pos, npc.pos) < 9
  })
  m.marker(null)
  let v = m.car
  const rx = -Math.cos(v.heading), rz = Math.sin(v.heading)
  await m.walk(npc, v.pos.x + rx * 1.7 - Math.sin(v.heading) * 0.6, v.pos.z + rz * 1.7 - Math.cos(v.heading) * 0.6, { run: true, timeout: 4 })
  npc.ride(v)
  g.audio?.sfx('door', { vol: 0.6 })
  const t0 = m.t
  const d0 = dist(v.pos, to)
  let crashes = 0
  const off = g.events.on('player:crash', (e) => {
    if (e.force < 16 || !inTaxi()) return
    crashes++
    if (crashLines && Math.random() < 0.7) m.task(() => m.talk(sp, pickOne(crashLines), 2.4))
  })
  m.track({ dispose: off })
  phase = 'ride'
  m.objective(`Du clientul la {y}${toLabel}{/y}.`, { sub: 'Bacșiș dacă ajungi repede și fără bușituri.' })
  m.marker(to, toLabel)
  m.task(async () => { await m.wait(2.5); for (const l of lines) { await m.talk(sp, l); await m.wait(2.2) } })
  await m.until(() => inTaxi() && Math.abs(m.car.speed) < 1.6 && dist(m.car.pos, to) < 13)
  m.marker(null)
  v = m.car
  const secs = m.t - t0
  const rx2 = -Math.cos(v.heading), rz2 = Math.sin(v.heading)
  npc.unride(v.pos.x + rx2 * 1.9, v.pos.z + rz2 * 1.9, v.heading + Math.PI / 2)
  g.audio?.sfx('door', { vol: 0.6 })
  const par = d0 / 8 + 14
  const base = Math.round((18 + d0 / 11) * (g.progress.perk.fareBonus || 1))
  const tip = secs < par ? Math.round((par - secs) * 0.9) : 0
  const pen = Math.min(base - 6, crashes * 6)
  const total = pay ?? Math.max(6, base + tip - pen)
  for (const l of arrive) await m.talk(sp, l, 2.6)
  g.progress.addLei(total, tip && !pen ? `Cursă ${base} lei + bacșiș ${tip}` : pen ? `Cursă: ${total} lei (minus bușituri)` : `Cursă: ${total} lei`)
  g.progress.stats.fares++
  g.progress.addXp(25, 'Cursă de taxi')
  npc.walkTo(to.x + rand(-6, 6), to.z + rand(-6, 6))
  const walker = npc
  setTimeout(() => { if (m.story.npcs.includes(walker)) m.story.removeNpc(walker) }, 9000)
  m.untrack(watch)
  return { total, secs, crashes, npc }
}

// ---------------------------------------------------------------------------
// arc-length progress along a (looping) polyline
export class PathTracker {
  constructor(points, loop = true) {
    this.p = points; this.loop = loop
    this.segs = loop ? points.length : points.length - 1
    this.len = []; this.cum = []
    let s = 0
    for (let i = 0; i < this.segs; i++) {
      const a = points[i], b = points[(i + 1) % points.length]
      const L = Math.hypot(b.x - a.x, b.z - a.z)
      this.cum.push(s); this.len.push(L); s += L
    }
    this.total = s
    this.seg = 0; this.lap = 0; this.s = 0
  }
  update(pos) {
    let best = null, bd = 1e18
    for (let k = -1; k <= 6; k++) {
      let i = this.seg + k
      if (this.loop) i = (i + this.segs) % this.segs
      else if (i < 0 || i >= this.segs) continue
      const a = this.p[i], b = this.p[(i + 1) % this.p.length]
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1
      const t = clamp(((pos.x - a.x) * vx + (pos.z - a.z) * vz) / L2, 0, 1)
      const d = (a.x + vx * t - pos.x) ** 2 + (a.z + vz * t - pos.z) ** 2
      if (d < bd) { bd = d; best = { i, t } }
    }
    if (best) {
      if (this.loop && best.i < this.seg - this.segs / 2) this.lap++
      else if (this.loop && best.i > this.seg + this.segs / 2) this.lap--
      this.seg = best.i
      this.s = this.lap * this.total + this.cum[best.i] + best.t * this.len[best.i]
    }
    return this.s
  }
  pointAt(s) {
    s = ((s % this.total) + this.total) % this.total
    for (let i = 0; i < this.segs; i++) {
      if (s <= this.cum[i] + this.len[i]) {
        const a = this.p[i], b = this.p[(i + 1) % this.p.length], t = (s - this.cum[i]) / (this.len[i] || 1)
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dir: Math.atan2(b.x - a.x, b.z - a.z) }
      }
    }
    return { ...this.p[0], dir: 0 }
  }
}

// ---------------------------------------------------------------------------
// street race around a loop of intersections. Returns { won, place }.
export async function runRace(m, { nodes, laps = 1, rivals = [], car, ringEvery = 95, lapTime = 95, name = 'Cursa' }) {
  const g = m.game
  const graph = g.traffic.graph
  const path = pathThrough(graph, nodes, { loop: true, lane: 0 })
  const T = new PathTracker(path, true)
  const s0 = T.cum[1]                      // start line: the middle of the first road
  const start = T.pointAt(s0)
  const back = (d, side) => {
    const p = T.pointAt(s0 - d)
    return { x: p.x + Math.cos(p.dir) * side, z: p.z - Math.sin(p.dir) * side, ry: p.dir }
  }
  // clear the circuit of traffic for a clean start
  const traffic = g.traffic
  const oldTarget = traffic.target
  traffic.target = 7
  m.track({ dispose: () => { traffic.target = oldTarget } })
  for (const d of [...traffic.drivers]) if (d.v && !d.v.def.trolley && dist(d.v.pos, start) < 140) traffic.despawn(d)
  // grid: player in lane, rivals beside and behind
  await m.fade(1, 350)
  const pg = back(6, 0)
  car.teleport(pg.x, g.physics.groundHeight(pg.x, pg.z, 3), pg.z, pg.ry)
  car.health = Math.max(car.health, 70); car.broken = false
  m.seat(car)
  const slots = [back(6, 3.4), back(14, 0), back(14, 3.4)]
  const cars = rivals.map((r, i) => {
    const s = slots[i % slots.length]
    const v = m.vehicle(r.kind, s.x, s.z, s.ry, { color: r.color })
    v.raceName = r.name
    return { v, r, T: new PathTracker(path, true), done: false }
  })
  g.cameraRig.target.copy(car.pos); g.cameraRig.snap()
  m.player.control = false
  await m.wait(0.3)
  await m.fade(0, 350)
  await g.ui.countdown()
  m.player.control = true
  const drivers = cars.map((c) => {
    const d = m.driver(c.v, path, { speed: c.r.speed, laps: laps + 1, avoid: true })
    d.i = 1
    return d
  })
  // rings for the player
  const total = T.total * laps
  const rings = []
  for (let s = ringEvery; s < total - 20; s += ringEvery) rings.push(s)
  rings.push(total)
  let ri = 0
  const ringAt = (k) => { const p = T.pointAt(s0 + rings[k]); return m.ring(p.x, p.z, { r: 7, color: k === rings.length - 1 ? 0xffffff : 0xffcf4a }) }
  let cur = ringAt(0), nxt = rings.length > 1 ? ringAt(1) : null
  if (nxt) nxt.setDim(true)
  m.marker({ x: cur.x, z: cur.z }, 'Inel')
  const pT = new PathTracker(path, true)
  let finishedRivals = 0, place = 0
  let t = 0
  const loop = m.every((dt) => {
    t += dt
    const v = m.car
    const pp = v ? v.pos : m.player.pos
    const ps = pT.update(pp) - s0
    // rivals: progress + rubber band
    let ahead = 0
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      const s = c.T.update(c.v.pos) - s0
      c.s = s
      if (!c.done && s >= total) { c.done = true; finishedRivals++ }
      if (!c.done) drivers[i].speedMul = clamp(1 + (ps - s) / 450, 0.84, 1.14)
      if (c.done || s > ps) ahead++
    }
    m.sub(`Poziția {y}${ahead + 1}/${cars.length + 1}{/y} · Inel ${Math.min(ri + 1, rings.length)}/${rings.length} · Tur ${Math.min(laps, Math.floor(Math.max(0, ps) / T.total) + 1)}/${laps}`)
    if (finishedRivals > 0 && !place) { place = finishedRivals + 1; return true }
    if (v && cur.inside(v.pos)) {
      g.audio?.sfx('checkpoint', { bus: 'ui' })
      m.untrack(cur)
      ri++
      if (ri >= rings.length) { place = ahead + 1; return true }
      cur = nxt || ringAt(ri); cur.setDim(false)
      nxt = ri + 1 < rings.length ? ringAt(ri + 1) : null
      if (nxt) nxt.setDim(true)
      m.marker({ x: cur.x, z: cur.z }, ri === rings.length - 1 ? 'Sosire' : 'Inel')
    }
    if (t > lapTime * laps) { place = cars.length + 1; return true }
  })
  m.objective(`${name}: treci prin {y}inele{/y} și ajungi primul!`, { sub: '' })
  await m.until(() => place > 0)
  m.untrack(loop)
  m.marker(null)
  if (cur) m.untrack(cur)
  if (nxt) m.untrack(nxt)
  for (const d of drivers) { d.speedMul = 0.6 }
  return { won: place === 1, place, time: t }
}
