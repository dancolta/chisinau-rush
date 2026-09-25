import * as THREE from 'three'
import { CURB_H } from './CityLayout.js'
import { mulberry, hashStr } from './rng.js'

export const PANEL_COLORS = [0xd3ccbc, 0xdcd5c3, 0xc0c6ca, 0xcab9a2, 0xaec0c3, 0xdfcca8, 0xcbc2cb, 0xe3dccc, 0xc9b79a, 0xbfb5aa]
const GARAGE_DOORS = [0x6a7f8e, 0x8e3b2f, 0x3f6e4a, 0xb08a3a, 0x5a5e66, 0x7a4a2a, 0x2f4f7a, 0x9aa2a8]
// period plasters of central Chișinău: creams, ochres, pale blues and pinks
const PLASTER_COLORS = [0xe6dcc3, 0xdcc393, 0xe9d99c, 0xbfcdd6, 0xe0b9aa, 0xece6da, 0xc3cba8, 0xd6a98a, 0xd9cfe0, 0xf0e2c8]
const BRICK_COLORS = [0xa65f45, 0x9a5a44, 0xb57258]
const ROOF_COLORS = [0x7d8388, 0x6f7479, 0x8c4a3a, 0x3f5f4a, 0x93735a, 0x5d6268]
const AWNINGS = [0x2f7a3e, 0xb3302e, 0x1f4f9c, 0xd9a520, 0x6b3f2a, 0x3a3a3a]

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler()

export function shade(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex() }

export class Buildings {
  constructor(world) {
    this.w = world
    this.B = world.batches
    this.P = world.physics
    this.kay = world.assets.kay
  }

  // local -> world helper for a rotated frame
  frame(cx, cz, ry) {
    const c = Math.cos(ry), s = Math.sin(ry)
    return (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
  }

  // ---------------------------------------------------------------------------
  // Soviet panel block. Front (street side) = local +z.
  panel(o) {
    const { cx, cz, len, depth = 12, floors = 9, ry = 0, seed = 1, shop = false, balconySides = [1, -1], entrances = true, y0 = CURB_H } = o
    const rnd = mulberry(seed)
    const color = o.color ?? rnd.pick(PANEL_COLORS)
    const fh = 2.8, h = floors * fh + 0.7
    const fb = this.B.facade(cx, cz)
    fb.box(cx, cz, len, depth, y0, h, ry, color, [fh, 3.2, rnd() * 100, shop ? 5 : 1], 0x57534e, [1, 0, 1, 0], 10)
    const g = this.B.vcol(cx, cz, 'bld')
    const W = this.frame(cx, cz, ry)
    g.box(len + 0.3, 0.75, depth + 0.3, { x: cx, y: y0, z: cz, ry, color: shade(color, 0.6) })
    const top = y0 + h
    const pc = shade(color, 0.9)
    for (const [lx, lz, w, d] of [[0, depth / 2, len + 0.3, 0.3], [0, -depth / 2, len + 0.3, 0.3], [len / 2, 0, 0.3, depth], [-len / 2, 0, 0.3, depth]]) {
      const [x, z] = W(lx, lz); g.box(w, 0.5, d, { x, y: top - 0.1, z, ry, color: pc })
    }
    // loggia stacks (shader draws the per-floor chaos)
    const cols = Math.floor(len / 3.2)
    const x0 = -len / 2 + (len - cols * 3.2) / 2
    const gaps = []
    for (const side of balconySides) {
      for (let k = 0; k < cols; k++) {
        if (k % 3 === 1) { if (side === -1) gaps.push(x0 + 3.2 * (k + 0.5)); continue }
        if (rnd() < 0.2) continue
        const lx = x0 + 3.2 * (k + 0.5)
        const [x, z] = W(lx, side * (depth / 2 + 0.55))
        fb.box(x, z, 2.95, 1.1, y0, floors * fh, ry, color, [fh, 3.2, rnd() * 100, 6], shade(color, 0.75))
      }
    }
    // entrances on the back (courtyard) side
    if (entrances) {
      const ents = gaps.filter((_, i) => i % 2 === 0)
      if (!ents.length) ents.push(0)
      for (const lx of ents) {
        const [dx, dz] = W(lx, -(depth / 2 + 0.06))
        g.box(1.5, 2.2, 0.16, { x: dx, y: y0, z: dz, ry, color: rnd.pick([0x4a3a2a, 0x5a4a3a, 0x3a3f46, 0x6a3a2a]) })
        const [cx2, cz2] = W(lx, -(depth / 2 + 0.7))
        g.box(2.6, 0.16, 1.4, { x: cx2, y: y0 + 2.55, z: cz2, ry, color: shade(color, 0.7) })
        const [sx2, sz2] = W(lx, -(depth / 2 + 0.6))
        g.box(2.2, 0.28, 1.2, { x: sx2, y: y0, z: sz2, ry, color: 0x8a8782 })
        this.w.doors.push({ x: dx, z: dz, ry: ry + Math.PI, kind: 'scara' })
      }
    }
    // roof clutter: lift machine rooms, antennas, a dish or two
    if (floors >= 9) {
      for (const f of [-0.28, 0.28]) {
        const [x, z] = W(len * f, 0)
        g.box(4, 2.6, 5, { x, y: top, z, ry, color: shade(color, 0.82) })
      }
    }
    const nAnt = rnd.int(2, 6)
    for (let i = 0; i < nAnt; i++) {
      const [x, z] = W(rnd.range(-len / 2 + 2, len / 2 - 2), rnd.range(-depth / 2 + 1.5, depth / 2 - 1.5))
      const ah = rnd.range(1.6, 3.2)
      g.box(0.07, ah, 0.07, { x, y: top, z, color: 0x3a3a3a })
      g.box(1.3, 0.05, 0.05, { x, y: top + ah * 0.8, z, ry: rnd() * 3, color: 0x3a3a3a })
    }
    this.P.box(cx, y0 + h / 2, cz, len / 2, h / 2, depth / 2, { rotY: ry })
    this.w.footprints.push({ x: cx, z: cz, hx: len / 2, hz: depth / 2, ry })
    return { top, color }
  }

  // ---------------------------------------------------------------------------
  // Terraced row of period townhouses along a street. side: which street the fronts face.
  // line = coordinate of the building front edge; from..to along the row.
  kayRow({ side, from, to, line, seed = 1, tall = 1, only = null }) {
    const rnd = mulberry(seed)
    const len = to - from
    if (len < 8) return
    const n = Math.max(1, Math.round(len / 9.6))
    const w = len / n
    const rot = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[side]
    let maxH = 0
    for (let i = 0; i < n; i++) {
      const t = from + w * (i + 0.5)
      let x, z
      if (side === 's') { x = t; z = line - 4.8 }
      else if (side === 'n') { x = t; z = line + 4.8 }
      else if (side === 'e') { x = line - 4.8; z = t }
      else { x = line + 4.8; z = t }
      const floors = Math.max(1, Math.round((rnd.int(1, 3) + (rnd() < 0.3 ? 1 : 0)) * tall))
      const h = this.townhouse({ cx: x, cz: z, w: w - 0.04, d: 9.6, ry: rot, floors, seed: seed * 31 + i * 7, shop: only ? true : rnd() < 0.72, rnd })
      maxH = Math.max(maxH, h)
    }
    const hh = maxH / 2
    if (side === 's' || side === 'n') {
      const zc = side === 's' ? line - 4.8 : line + 4.8
      this.P.box((from + to) / 2, CURB_H + hh, zc, len / 2, hh, 4.7)
      this.w.footprints.push({ x: (from + to) / 2, z: zc, hx: len / 2, hz: 4.8 })
    } else {
      const xc = side === 'e' ? line - 4.8 : line + 4.8
      this.P.box(xc, CURB_H + hh, (from + to) / 2, 4.7, hh, len / 2)
      this.w.footprints.push({ x: xc, z: (from + to) / 2, hx: 4.8, hz: len / 2 })
    }
  }

  // one 19th/early-20th century plastered house: shop ground floor, classical windows above,
  // string course, cornice and a tin gable roof. Front (street side) = local +z.
  townhouse({ cx, cz, w, d, ry, floors, seed, shop, rnd }) {
    const brick = rnd() < 0.18
    const color = brick ? rnd.pick(BRICK_COLORS) : rnd.pick(PLASTER_COLORS)
    const gh = shop ? 4.2 : 3.3, fh = 3.3
    const H = gh + floors * fh + 0.5
    const W = this.frame(cx, cz, ry)
    const fb = this.B.facade(cx, cz)
    const bays = Math.max(2, Math.round(w / 2.9)), ws = w / bays
    const front = shop ? (brick ? 9 : 8) : (brick ? 7 : 4)
    const plainSides = [ws, fh, seed % 97, brick ? 7 : 4]
    // walls clockwise: front, right side, back, left side
    const A = W(-w / 2, d / 2), B = W(w / 2, d / 2), C = W(w / 2, -d / 2), D = W(-w / 2, -d / 2)
    fb.wall(A[0], A[1], B[0], B[1], CURB_H, H, color, [fh, ws, seed % 97, front])
    fb.wall(B[0], B[1], C[0], C[1], CURB_H, H, color, [fh, 2.9, (seed + 3) % 97, 0])
    fb.wall(C[0], C[1], D[0], D[1], CURB_H, H, color, plainSides)
    fb.wall(D[0], D[1], A[0], A[1], CURB_H, H, color, [fh, 2.9, (seed + 5) % 97, 0])
    const g = this.B.vcol(cx, cz, 'bld')
    const light = shade(color, 1.1), dark = shade(color, 0.72)
    // plinth, string course over the ground floor, cornice under the roof
    const [px, pz] = W(0, d / 2 + 0.06)
    g.box(w + 0.02, 0.45, 0.14, { x: px, y: CURB_H, z: pz, ry, color: dark })
    const [sx, sz] = W(0, d / 2 + 0.1)
    g.box(w + 0.02, 0.22, 0.2, { x: sx, y: CURB_H + gh - 0.1, z: sz, ry, color: light })
    const [kx, kz] = W(0, d / 2 + 0.2)
    g.box(w + 0.3, 0.26, 0.42, { x: kx, y: CURB_H + H - 0.5, z: kz, ry, color: light })
    g.box(w + 0.36, 0.14, 0.52, { x: kx, y: CURB_H + H - 0.26, z: kz, ry, color: shade(color, 1.16) })
    // pilasters at the corners of the front
    for (const e of [-1, 1]) {
      const [lx, lz] = W(e * (w / 2 - 0.2), d / 2 + 0.06)
      g.box(0.4, H - gh - 0.5, 0.12, { x: lx, y: CURB_H + gh + 0.12, z: lz, ry, color: light })
    }
    // gable roof, ridge along the street
    const roofC = rnd.pick(ROOF_COLORS)
    const rh = Math.min(3.2, d * 0.28)
    g.prism(d + 0.9, rh, w + 0.3, { x: cx, y: CURB_H + H - 0.12, z: cz, ry: ry + Math.PI / 2, color: roofC })
    if (rnd() < 0.7) {
      const [chx, chz] = W((rnd() - 0.5) * w * 0.6, (rnd() - 0.5) * d * 0.3)
      g.box(0.55, rh + 0.9, 0.55, { x: chx, y: CURB_H + H - 0.2, z: chz, ry, color: shade(color, 0.8) })
      g.box(0.7, 0.12, 0.7, { x: chx, y: CURB_H + H + rh + 0.68, z: chz, ry, color: 0x55524e })
    }
    if (shop) {
      // an awning over the shopfront now and then, and a slot for the brand sign
      if (rnd() < 0.45) {
        const [ax, az] = W(0, d / 2 + 0.75)
        const ac = rnd.pick(AWNINGS)
        g.box(w * 0.86, 0.06, 1.5, { x: ax, y: CURB_H + 3.05, z: az, ry, rx: -0.32, color: ac })
        const [vx, vz] = W(0, d / 2 + 1.46)
        g.box(w * 0.86, 0.28, 0.04, { x: vx, y: CURB_H + 2.62, z: vz, ry, color: shade(ac, 0.8) })
      }
      const ffx = Math.sin(ry), ffz = Math.cos(ry)
      this.w.signSlots.push({ x: cx + ffx * (d / 2 + 0.07), z: cz + ffz * (d / 2 + 0.07), ry, sx: w / 9.6, sy: 1, y: CURB_H + 3.62, fx: cx + ffx * 7, fz: cz + ffz * 7 })
    }
    return H + rh
  }

  // KayKit rows around a block's perimeter; returns the courtyard rect
  historic(b, { sides = ['n', 's', 'e', 'w'], inset = 0.3, courtyard = true, tall = 1, exclude = [] } = {}) {
    const seed = hashStr(b.id)
    const L = b.ix0 + inset, R = b.ix1 - inset, T = b.iz0 + inset, Bo = b.iz1 - inset
    const segs = (a0, a1) => {
      // split [a0,a1] around excluded ranges
      let out = [[a0, a1]]
      for (const [e0, e1] of exclude) {
        out = out.flatMap(([s0, s1]) => (e1 <= s0 || e0 >= s1) ? [[s0, s1]] : [[s0, Math.max(s0, e0)], [Math.min(s1, e1), s1]].filter(([p, q]) => q - p > 8))
      }
      return out
    }
    if (sides.includes('n')) for (const [a, c] of segs(L, R)) this.kayRow({ side: 'n', from: a, to: c, line: T, seed: seed + 1 + a, tall })
    if (sides.includes('s')) for (const [a, c] of segs(L, R)) this.kayRow({ side: 's', from: a, to: c, line: Bo, seed: seed + 2 + a, tall })
    const eT = sides.includes('n') ? T + 9.8 : T, eB = sides.includes('s') ? Bo - 9.8 : Bo
    if (sides.includes('w')) this.kayRow({ side: 'w', from: eT, to: eB, line: L, seed: seed + 3, tall })
    if (sides.includes('e')) this.kayRow({ side: 'e', from: eT, to: eB, line: R, seed: seed + 4, tall })
    const rect = {
      x0: L + (sides.includes('w') ? 10.5 : 1), x1: R - (sides.includes('e') ? 10.5 : 1),
      z0: T + (sides.includes('n') ? 10.5 : 1), z1: Bo - (sides.includes('s') ? 10.5 : 1),
    }
    if (courtyard) this.courtyard(rect, mulberry(seed ^ 0x51ed))
    return rect
  }

  // ---------------------------------------------------------------------------
  // Soviet micro-district block
  soviet(b, opts = {}) {
    const rnd = mulberry(hashStr(b.id) ^ 0x9e37)
    const variant = opts.variant ?? rnd.int(0, 2)
    const L = b.ix0 + 2, R = b.ix1 - 2, T = b.iz0 + 2, Bo = b.iz1 - 2
    const W = R - L, D = Bo - T
    const seed = hashStr(b.id)
    let yard
    if (variant === 0) {
      const len = Math.min(W - 8, 88)
      this.panel({ cx: (L + R) / 2, cz: T + 7, len, depth: 12, floors: 9, ry: Math.PI, seed: seed + 1, shop: !!opts.shops })
      this.panel({ cx: (L + R) / 2, cz: Bo - 7, len, depth: 12, floors: 9, ry: 0, seed: seed + 2, shop: !!opts.shops })
      if (!opts.noTower) this.panel({ cx: R - 13, cz: (T + Bo) / 2, len: 18, depth: 16, floors: 16, ry: Math.PI / 2, seed: seed + 3, balconySides: [1] })
      yard = { x0: L + 2, x1: opts.noTower ? R - 2 : R - 24, z0: T + 16, z1: Bo - 16 }
    } else if (variant === 1) {
      const n = W > 90 ? 4 : 3
      const len = Math.min(D - 18, 70)
      for (let k = 0; k < n; k++) {
        const cx = L + (W * (k + 0.5)) / n
        this.panel({ cx, cz: (T + Bo) / 2, len, depth: 11, floors: 5, ry: Math.PI / 2 * (k % 2 ? 1 : -1), seed: seed + 10 + k })
      }
      yard = { x0: L + 2, x1: R - 2, z0: T + 2, z1: T + (D - len) / 2 - 2 }
      this.courtyard({ x0: L + 2, x1: R - 2, z0: Bo - (D - len) / 2 + 2, z1: Bo - 2 }, mulberry(seed + 77), { playground: false })
    } else {
      const len = Math.min(W - 6, 90)
      this.panel({ cx: (L + R) / 2, cz: T + 7, len, depth: 12, floors: 9, ry: Math.PI, seed: seed + 21, shop: !!opts.shops })
      this.panel({ cx: L + 6.5, cz: (T + Bo) / 2 + 8, len: D - 34, depth: 11, floors: 5, ry: -Math.PI / 2, seed: seed + 22 })
      this.panel({ cx: R - 6.5, cz: (T + Bo) / 2 + 8, len: D - 34, depth: 11, floors: 5, ry: Math.PI / 2, seed: seed + 23 })
      yard = { x0: L + 16, x1: R - 16, z0: T + 17, z1: Bo - 4 }
    }
    if (yard && yard.x1 - yard.x0 > 12 && yard.z1 - yard.z0 > 12) this.courtyard(yard, mulberry(seed + 5), opts)
    return yard
  }

  // ---------------------------------------------------------------------------
  // Courtyard life: trees, garages, playground, benches, parking
  courtyard(r, rnd, opts = {}) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0
    if (w < 8 || d < 8) return
    // garages along one long edge
    if (opts.garages !== false && w > 30 && rnd.chance(0.6)) {
      const gz = rnd.chance(0.5) ? r.z0 + 3.2 : r.z1 - 3.2
      const n = Math.min(10, Math.floor((w - 6) / 3.3))
      this.garageRow(r.x0 + 3, gz, n, gz === r.z0 + 3.2 ? 0 : Math.PI, rnd)
      if (gz === r.z0 + 3.2) r = { ...r, z0: r.z0 + 7 }; else r = { ...r, z1: r.z1 - 7 }
    }
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2
    if (opts.playground !== false && w > 18 && d > 14) this.playground(cx, cz, rnd)
    // benches around the playground
    const bench = this.kay.bench
    for (const [bx, bz, br] of [[cx - 7, cz, Math.PI / 2], [cx + 7, cz, -Math.PI / 2]]) {
      if (w < 20) break
      _q.setFromEuler(_e.set(0, br, 0)); _m.compose(_p.set(bx, CURB_H, bz), _q, _s.set(1, 1, 1))
      this.B.atlas(bx, bz, bench.geometry, _m.clone(), 'props')
      this.w.benches.push({ x: bx, z: bz, ry: br })
    }
    // trees scattered away from the centre
    const nTrees = Math.floor((w * d) / 170)
    for (let i = 0; i < nTrees; i++) {
      const x = rnd.range(r.x0 + 2, r.x1 - 2), z = rnd.range(r.z0 + 2, r.z1 - 2)
      if (Math.abs(x - cx) < 9 && Math.abs(z - cz) < 7) continue
      this.w.addTree(x, z, rnd)
    }
    // parking along the yard edge
    for (let x = r.x0 + 4; x < r.x1 - 4; x += 6.5) {
      if (rnd.chance(0.35)) this.w.parkingSpots.push({ x, z: r.z1 - 2.5, ry: Math.PI / 2 + (rnd.chance(0.5) ? Math.PI : 0), yard: true })
    }
    // dumpster corner
    const dx = r.x1 - 3, dz = r.z0 + 2
    this.w.dynamicProps.push({ type: 'dumpster', x: dx, z: dz, ry: 0 })
  }

  garageRow(x0, z, n, ry, rnd) {
    const g = this.B.vcol(x0, z, 'static')
    const W = 3.2
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (W + 0.05) + W / 2
      const body = rnd.pick([0x8c8a86, 0x7d7b77, 0x9a948a, 0x6f6c68])
      g.box(W, 2.5, 5.8, { x, y: CURB_H, z, ry, color: body })
      g.box(W + 0.15, 0.12, 6.0, { x, y: CURB_H + 2.5, z, ry, color: 0x4a4744 })
      const [fx, fz] = this.frame(x, z, ry)(0, 2.92)
      g.box(2.6, 2.1, 0.08, { x: fx, y: CURB_H, z: fz, ry, color: rnd.pick(GARAGE_DOORS) })
      if (rnd.chance(0.3)) { // rust streak
        const [rx, rz] = this.frame(x, z, ry)(rnd.range(-1, 1), 2.97)
        g.box(0.4, 1.4, 0.03, { x: rx, y: CURB_H + 0.5, z: rz, ry, color: 0x7a4a2a })
      }
    }
    const len = n * (W + 0.05)
    const [cx, cz] = [x0 + len / 2, z]
    this.P.box(cx, CURB_H + 1.3, cz, len / 2, 1.3, 2.95)
    this.w.footprints.push({ x: cx, z: cz, hx: len / 2, hz: 2.95 })
    this.w.garages.push({ x0, z, n, ry, w: W })
  }

  playground(cx, cz, rnd) {
    const g = this.B.vcol(cx, cz, 'static')
    // sandbox
    g.box(4, 0.3, 4, { x: cx - 3.5, y: CURB_H, z: cz + 1, color: 0xb05a30 })
    g.box(3.6, 0.32, 3.6, { x: cx - 3.5, y: CURB_H, z: cz + 1, color: 0xd9c08a })
    // swing frame
    const sx = cx + 3, sz = cz - 1
    for (const dx of [-1.6, 1.6]) {
      g.box(0.12, 2.6, 0.12, { x: sx + dx, y: CURB_H, z: sz - 0.6, rx: 0.2, color: 0x3f6fb0 })
      g.box(0.12, 2.6, 0.12, { x: sx + dx, y: CURB_H, z: sz + 0.6, rx: -0.2, color: 0x3f6fb0 })
    }
    g.box(3.4, 0.12, 0.12, { x: sx, y: CURB_H + 2.5, z: sz, color: 0x3f6fb0 })
    for (const dx of [-0.7, 0.7]) {
      g.box(0.03, 1.8, 0.03, { x: sx + dx - 0.25, y: CURB_H + 0.65, z: sz, color: 0x222 })
      g.box(0.03, 1.8, 0.03, { x: sx + dx + 0.25, y: CURB_H + 0.65, z: sz, color: 0x222 })
      g.box(0.6, 0.06, 0.3, { x: sx + dx, y: CURB_H + 0.62, z: sz, color: rnd.pick([0xd94a3a, 0xf2c02e, 0x3a9a5a]) })
    }
    // slide
    g.box(1.2, 1.6, 1.2, { x: cx, y: CURB_H, z: cz + 4.5, color: 0xd94a3a })
    g.box(0.9, 0.08, 3.2, { x: cx, y: CURB_H + 0.8, z: cz + 6.3, rx: -0.45, color: 0xc9ced4 })
    this.P.box(cx, CURB_H + 0.8, cz + 5, 0.7, 0.8, 1.8)
    this.w.playgrounds.push({ x: cx, z: cz })
  }
}
