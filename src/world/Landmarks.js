import * as THREE from 'three'
import { CURB_H, block, H_ROADS, RAIL_Z } from './CityLayout.js'
import { mulberry } from './rng.js'
import { shade } from './Buildings.js'

// Palette
const STONE = 0xebe3cf, STONE_D = 0xd2c6aa, STONE_L = 0xf6f2e8, BRICK = 0xb24a33, ROOF = 0x5e5a55
const DOME = 0x3d7a68, GOLD = 0xdcae42, BRONZE = 0x506b5a, GLASS = 0x2b3e50, DARK = 0x2a2b30
const FLAG = [0x0046ae, 0xffd200, 0xcc092f]

const Y = CURB_H

export class Landmarks {
  constructor(world, buildings) {
    this.w = world
    this.B = world.batches
    this.P = world.physics
    this.bld = buildings
    this.kay = world.assets.kay
  }

  g(x, z) { return this.B.vcol(x, z, 'bld') }
  st(x, z) { return this.B.vcol(x, z, 'static') }
  fac(x, z) { return this.B.facade(x, z) }
  solid(cx, cy, cz, hx, hy, hz, ry = 0) {
    if (hy > 1.2) this.w.footprints.push({ x: cx, z: cz, hx, hz, ry })
    return this.P.box(cx, cy, cz, hx, hy, hz, { rotY: ry })
  }
  patch(surface, x0, z0, x1, z1, lift = 0.012) {
    const s = surface === 'plaza' ? 8 : surface === 'dirt' ? 6 : surface === 'paving' ? 4 : 12
    this.B.flat((x0 + x1) / 2, (z0 + z1) / 2, lift > 0 ? surface + '_o' : surface, s).rect(x0, z0, x1, z1, Y + lift)
  }
  clear(x0, z0, x1, z1) { this.w.clearRects.push({ x0, z0, x1, z1 }) }

  build() {
    this.guvern(block(3, 1))
    this.catedrala(block(3, 2))
    this.gradina(block(4, 2))
    this.primaria(block(2, 1))
    this.opera(block(1, 1))
    this.parlament(block(4, 1))
    this.presedintia(block(5, 1))
    this.usm(block(6, 1))
    this.hotel(block(0, 1))
    this.teatru(block(0, 2))
    this.muzeu(block(1, 2))
    this.istoric(block(2, 2))
    this.piata(block(5, 2))
    this.autogara(block(6, 2))
    this.circ(block(1, 0))
    this.ambasada(block(6, 0))
    this.acasa(block(3, 3))
    this.garaje(block(1, 3))
    this.linella(block(4, 3))
    this.gara(block(6, 3))
    this.romasca(block(5, 3))
    for (const b of [block(0, 0), block(2, 0), block(3, 0), block(4, 0), block(5, 0), block(0, 3), block(2, 3)]) {
      this.bld.soviet(b, { shops: b.row === 3 && b.col === 2 })
      this.w.place('bloc_' + b.id, 'Blocuri ' + (b.row === 0 ? 'Râșcani' : 'Botanica'), b.cx, b.cz, { kind: 'district' })
    }
  }

  // ---------------------------------------------------------------------------
  flag(x, y, z, h = 9, s = 1) {
    const g = this.st(x, z)
    g.cyl(0.07 * s, 0.09 * s, h, 6, { x, y, z, color: 0xc9c9c9 })
    g.sphere(0.16 * s, 6, 4, { x, y: y + h, z, color: GOLD })
    const fw = 1.1 * s, fh = 1.9 * s
    FLAG.forEach((c, i) => g.box(fw, fh, 0.04, { x: x + 0.1 + fw * (i + 0.5), y: y + h - fh - 0.2, z, color: c }))
    this.w.flags.push({ x, y: y + h - fh / 2 - 0.2, z })
  }

  column(g, x, z, y, h, r = 0.4, color = STONE_L) {
    g.box(r * 2.6, 0.5, r * 2.6, { x, y, z, color: shade(color, 0.9) })
    g.cyl(r * 0.92, r, h - 1, 12, { x, y: y + 0.5, z, color })
    g.box(r * 2.5, 0.5, r * 2.5, { x, y: y + h - 0.5, z, color: shade(color, 0.94) })
  }

  // portico: n columns along x (centred at cx), pediment on top, facing +z (ry rotates)
  portico(cx, cz, w, colH, n, ry = 0, color = STONE_L, depth = 3.2) {
    const g = this.g(cx, cz)
    const c = Math.cos(ry), s = Math.sin(ry)
    const W = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + 0.6 + ((w - 1.2) * i) / (n - 1)
      const [x, z] = W(lx, depth - 0.6)
      this.column(g, x, z, Y + 0.6, colH, 0.42, color)
    }
    const [sx, sz] = W(0, depth / 2)
    g.box(w + 0.6, 0.6, depth + 0.8, { x: sx, y: Y, z: sz, ry, color: shade(color, 0.85) })
    g.box(w + 0.4, 1.0, depth + 0.4, { x: sx, y: Y + 0.6 + colH, z: sz, ry, color })
    g.prism(w + 0.6, colH * 0.32, depth + 0.6, { x: sx, y: Y + 1.6 + colH, z: sz, ry, color: shade(color, 0.96) })
    return Y + 1.6 + colH
  }

  // bronze figure on a pedestal, arm raised with a cross (Ștefan cel Mare)
  statue(x, z, ry, { pedH = 5.5, figure = 'stefan' } = {}) {
    const g = this.g(x, z)
    g.box(3.2, 0.6, 3.2, { x, y: Y, z, color: 0x8f8a80 })
    g.box(2.2, pedH, 2.2, { x, y: Y + 0.6, z, color: 0x9a948a })
    g.box(2.6, 0.4, 2.6, { x, y: Y + 0.6 + pedH, z, color: 0x8a857a })
    const fy = Y + 1 + pedH
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)]
    if (figure === 'stefan') {
      g.cyl(0.55, 0.85, 2.6, 8, { x, y: fy, z, color: BRONZE })            // robe
      g.cyl(0.45, 0.55, 0.9, 8, { x, y: fy + 2.6, z, color: BRONZE })      // chest
      g.sphere(0.36, 8, 6, { x, y: fy + 3.85, z, color: BRONZE })          // head
      g.cyl(0.38, 0.3, 0.4, 8, { x, y: fy + 4.1, z, color: 0x6a7f5a })     // crown
      const [ax, az] = W(0.55, 0.2)
      g.box(0.24, 1.3, 0.24, { x: ax, y: fy + 2.9, z: az, ry, rz: -0.35, color: BRONZE }) // raised arm
      const [cx2, cz2] = W(0.95, 0.25)
      g.box(0.1, 1.6, 0.1, { x: cx2, y: fy + 3.9, z: cz2, color: 0x6a8a6a })
      g.box(0.7, 0.1, 0.1, { x: cx2, y: fy + 4.95, z: cz2, ry, color: 0x6a8a6a })
      const [sx, sz] = W(-0.6, 0.1)
      g.box(0.22, 1.6, 0.22, { x: sx, y: fy + 1.8, z: sz, ry, rz: 0.2, color: BRONZE }) // sword arm
    } else if (figure === 'rider') {
      g.box(3.4, 1.4, 1.1, { x, y: fy + 1.5, z, ry, color: BRONZE })
      const [hx, hz] = W(1.8, 0); g.box(0.8, 1.4, 0.7, { x: hx, y: fy + 2.2, z: hz, ry, rz: -0.5, color: BRONZE })
      for (const [lx, lz] of [[1.2, 0.35], [1.2, -0.35], [-1.2, 0.35], [-1.2, -0.35]]) { const [lxw, lzw] = W(lx, lz); g.box(0.25, 1.6, 0.25, { x: lxw, y: fy, z: lzw, color: BRONZE }) }
      g.cyl(0.35, 0.45, 1.4, 8, { x, y: fy + 2.8, z, color: BRONZE })
      g.sphere(0.3, 8, 6, { x, y: fy + 4.5, z, color: BRONZE })
    } else if (figure === 'wolf') {
      g.cyl(0.6, 0.7, 4, 12, { x, y: fy - 0.5, z, color: 0xd9d1bd })
      g.box(1.8, 0.7, 0.6, { x, y: fy + 3.6, z, ry, color: BRONZE })
      const [hx, hz] = W(1.0, 0); g.box(0.5, 0.5, 0.45, { x: hx, y: fy + 4.1, z: hz, ry, color: BRONZE })
    }
    this.solid(x, Y + pedH / 2 + 0.4, z, 1.5, pedH / 2 + 0.4, 1.5)
  }

  // arch shaped opening extruded along z (for the Arc and gates)
  archGeometry(w, h, depth, openW, openH) {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0)
    const r = openW / 2, spring = openH - r
    const hole = new THREE.Path()
    hole.moveTo(-r, 0); hole.lineTo(r, 0); hole.lineTo(r, spring)
    hole.absarc(0, spring, r, 0, Math.PI, false)
    hole.lineTo(-r, 0)
    s.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 })
    geo.translate(0, 0, -depth / 2)
    return geo.toNonIndexed()
  }

  // ===========================================================================
  guvern(b) {
    const cx = 0, bz0 = b.iz0 + 2, depth = 24, len = 92
    const cz = bz0 + depth / 2
    // main slab with rhythmic tall windows
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 27, 0, 0xdedbd3, [3.3, 2.4, 3.3, 1], 0x6c6862)
    const g = this.g(cx, cz)
    // vertical stone piers in pairs across the front, plinth and heavy attic
    for (let x = -len / 2 + 2.4; x <= len / 2 - 2.4; x += 4.8) g.box(0.42, 25, 0.7, { x, y: Y + 1.2, z: cz + depth / 2 + 0.25, color: 0xf1eee7 })
    g.box(len + 0.6, 1.2, depth + 0.6, { x: cx, y: Y, z: cz, color: 0x8e8a82 })
    g.box(len + 1.4, 1.6, depth + 1.4, { x: cx, y: Y + 26.2, z: cz, color: 0xcfcac0 })
    f.box(cx, cz, 30, depth + 1, Y + 27.8, 6.2, 0, 0xdedbd3, [3.1, 2.4, 9.1, 1], 0x6c6862)
    g.box(32, 0.8, depth + 2, { x: cx, y: Y + 34, z: cz, color: 0xcfcac0 })
    // coat of arms panel above the entrance
    g.box(5, 5, 0.3, { x: cx, y: Y + 19, z: cz + depth / 2 + 0.7, color: 0x2a4a8a })
    g.box(2.2, 2.6, 0.35, { x: cx, y: Y + 20.2, z: cz + depth / 2 + 0.72, color: 0xd9a93a })
    // entrance canopy + steps
    g.box(22, 0.5, 5, { x: cx, y: Y + 5.4, z: cz + depth / 2 + 2.6, color: 0xd9d2c3 })
    for (let i = 0; i < 4; i++) g.box(26 - i * 1.2, 0.18, 6 - i * 0.7, { x: cx, y: Y + i * 0.18, z: cz + depth / 2 + 3.2, color: 0xbdb7aa })
    this.solid(cx, Y + 17, cz, len / 2, 17, depth / 2)
    this.flag(cx, Y + 34.8, cz, 7, 1.2)
    // PMAN: the great square
    const pz0 = cz + depth / 2 + 6.5, pz1 = b.iz1
    this.patch('plaza', b.ix0, pz0 - 6, b.ix1, pz1 + 0.5)
    this.clear(b.ix0, pz0 - 6, b.ix1, pz1 + 8.5)
    // big flagpole + tribune
    this.flag(cx, Y, (pz0 + pz1) / 2 + 6, 22, 2.2)
    this.st(cx, pz0 + 4).box(18, 1.2, 4, { x: cx, y: Y, z: pz0 + 4, color: 0xb9b2a4 })
    this.solid(cx, Y + 0.6, pz0 + 4, 9, 0.6, 2)
    // rows of trees along the square's sides
    for (let z = pz0; z < pz1 - 4; z += 10) { this.w.treeSpots.push({ x: b.ix0 + 3, z, kind: 'spruce' }); this.w.treeSpots.push({ x: b.ix1 - 3, z, kind: 'spruce' }) }
    // side streets frontage behind the government (north)
    this.bld.kayRow({ side: 'n', from: b.ix0 + 1, to: -len / 2 - 3, line: b.iz0 + 0.3, seed: 11 })
    this.bld.kayRow({ side: 'n', from: len / 2 + 3, to: b.ix1 - 1, line: b.iz0 + 0.3, seed: 12 })
    this.w.place('guvern', 'Casa Guvernului', cx, cz + depth / 2 + 6, { kind: 'landmark' })
    this.w.place('pman', 'Piața Marii Adunări Naționale', cx, (pz0 + pz1) / 2, { kind: 'landmark' })
    this.w.place('tribuna', 'Tribuna din PMAN', cx, pz0 + 7.5, { kind: 'spot' })
  }

  // ===========================================================================
  catedrala(b) {
    const ax = 0
    // paths: main axis + cross path, grass elsewhere (base)
    this.patch('plaza', -5, b.iz0 - 0.5, 5, b.iz1)
    this.patch('plaza', b.ix0, 64, b.ix1, 72)
    this.patch('plaza', -22, 80, 22, 112)
    this.clear(-7, b.z0, 7, b.iz1)
    this.clear(-24, 78, 24, 114)
    // ---- Arcul de Triumf (1840): walk-through arch facing the Government House
    const az = 30
    const g = this.g(ax, az)
    const arch = this.archGeometry(13.4, 10.2, 8.6, 5.0, 7.6)
    g.add(arch, { x: ax, y: Y, z: az, color: STONE })
    for (const side of [-1, 1]) {
      const fz = az + side * 4.5
      for (const dx of [-5.6, -3.6, 3.6, 5.6]) this.column(g, ax + dx, fz, Y + 0.9, 8.4, 0.34, STONE_L)
      g.box(13.4, 0.9, 0.9, { x: ax, y: Y, z: fz, color: STONE_D })
      // keystone + archivolt
      g.torusArc(2.75, 0.28, Math.PI, { x: ax, y: Y + 5.1, z: fz, color: STONE_L })
    }
    g.box(14.4, 0.8, 9.8, { x: ax, y: Y + 10.2, z: az, color: STONE_L })     // cornice
    g.box(11.6, 3.0, 7.8, { x: ax, y: Y + 11.0, z: az, color: STONE })         // attic
    g.box(12.2, 0.5, 8.4, { x: ax, y: Y + 14.0, z: az, color: STONE_L })
    for (const side of [-1, 1]) {                                               // clock faces
      g.cyl(1.05, 1.05, 0.12, 20, { x: ax, y: Y + 12.5, z: az + side * 3.95, rx: Math.PI / 2, center: true, color: 0xf7f3e6 })
      g.box(0.08, 0.8, 0.05, { x: ax, y: Y + 12.5, z: az + side * 4.02, color: DARK })
      g.box(0.55, 0.08, 0.05, { x: ax + 0.25, y: Y + 12.5, z: az + side * 4.02, color: DARK })
    }
    g.box(4, 1.6, 3, { x: ax, y: Y + 14.5, z: az, color: STONE })
    this.flag(ax, Y + 16.1, az, 4.5, 0.9)
    this.solid(ax - 4.8, Y + 5.1, az, 1.9, 5.1, 4.3)
    this.solid(ax + 4.8, Y + 5.1, az, 1.9, 5.1, 4.3)
    this.solid(ax, Y + 12.5, az, 7, 3.5, 4.8)
    this.w.place('arc', 'Arcul de Triumf', ax, az - 7, { kind: 'landmark' })

    // ---- Clopotnița: 4-tier bell tower on the axis
    const tz = 52
    const t = this.g(ax, tz)
    let y = Y
    const tiers = [[8, 8.5], [7, 6.5], [6, 5], [5, 4]]
    for (const [s, h] of tiers) {
      t.box(s, h, s, { x: ax, y, z: tz, color: STONE })
      t.box(s + 0.5, 0.45, s + 0.5, { x: ax, y: y + h - 0.2, z: tz, color: STONE_L })
      for (const side of [0, 1, 2, 3]) {
        const a = side * Math.PI / 2
        const ox = Math.sin(a) * (s / 2 + 0.02), oz = Math.cos(a) * (s / 2 + 0.02)
        t.box(s * 0.28, h * 0.5, 0.1, { x: ax + ox, y: y + h * 0.28, z: tz + oz, ry: a, color: 0x5a574f })
        for (const px of [-s / 2 + 0.3, s / 2 - 0.3]) t.box(0.35, h, 0.12, { x: ax + ox + Math.cos(a) * px, y, z: tz + oz - Math.sin(a) * px, ry: a, color: STONE_L })
      }
      y += h
    }
    t.cyl(1.8, 2.1, 1.6, 12, { x: ax, y, z: tz, color: STONE })
    t.dome(2.1, { x: ax, y: y + 1.6, z: tz, color: GOLD })
    t.cyl(0.08, 0.12, 3.2, 6, { x: ax, y: y + 3.4, z: tz, color: GOLD })
    t.box(1.1, 0.12, 0.12, { x: ax, y: y + 5.8, z: tz, color: GOLD })
    this.solid(ax, Y + 12, tz, 4, 12, 4)
    this.w.place('clopotnita', 'Clopotnița', ax, tz - 6, { kind: 'landmark' })

    // ---- Catedrala Nașterea Domnului
    const cz = 96
    const c = this.g(ax, cz)
    c.box(26, 15, 26, { x: ax, y: Y, z: cz, color: STONE })
    c.box(27, 1, 27, { x: ax, y: Y + 15, z: cz, color: STONE_L })
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2
      this.portico(ax + Math.sin(a) * 13, cz + Math.cos(a) * 13, 14, 10, 6, a, STONE_L, 3.6)
      // tall windows between pilasters on each face
      for (const px of [-9, 9]) {
        const ox = Math.sin(a) * 13.02 + Math.cos(a) * px, oz = Math.cos(a) * 13.02 - Math.sin(a) * px
        c.box(1.4, 4.5, 0.1, { x: ax + ox, y: Y + 5, z: cz + oz, ry: a, color: 0x4a5058 })
      }
    }
    c.cyl(8.2, 8.2, 6.5, 24, { x: ax, y: Y + 16, z: cz, color: STONE })
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      c.box(1.1, 3.2, 0.2, { x: ax + Math.sin(a) * 8.25, y: Y + 17.5, z: cz + Math.cos(a) * 8.25, ry: a, color: 0x4a5058 })
    }
    c.box(18, 0.6, 18, { x: ax, y: Y + 22.5, z: cz, color: STONE_L, ry: Math.PI / 4 })
    c.dome(8.6, { x: ax, y: Y + 22.5, z: cz, color: DOME, seg: 20 })
    c.cyl(1.2, 1.4, 2.8, 10, { x: ax, y: Y + 30.8, z: cz, color: STONE_L })
    c.dome(1.4, { x: ax, y: Y + 33.6, z: cz, color: GOLD })
    c.cyl(0.1, 0.14, 3.6, 6, { x: ax, y: Y + 34.8, z: cz, color: GOLD })
    c.box(1.6, 0.16, 0.16, { x: ax, y: Y + 37.6, z: cz, color: GOLD })
    this.solid(ax, Y + 10, cz, 13.2, 10, 13.2)
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; this.solid(ax + Math.sin(a) * 15, Y + 6, cz + Math.cos(a) * 15, k % 2 ? 2.2 : 7.4, 6, k % 2 ? 7.4 : 2.2) }
    this.w.place('catedrala', 'Catedrala Nașterea Domnului', ax, cz - 20, { kind: 'landmark' })
    // park trees and benches
    const rnd = mulberry(1836)
    for (let i = 0; i < 70; i++) {
      const x = rnd.range(b.ix0 + 3, b.ix1 - 3), z = rnd.range(b.iz0 + 12, b.iz1 - 3)
      if (Math.abs(x) < 10 || (Math.abs(x) < 26 && z > 76 && z < 116) || (z > 60 && z < 76) || (Math.abs(x) < 14 && z < 64)) continue
      this.w.treeSpots.push({ x, z, kind: rnd() < 0.2 ? 'spruce' : 'broad' })
    }
    for (const [x, z, r] of [[-8, 45, -Math.PI / 2], [8, 45, Math.PI / 2], [-8, 58, -Math.PI / 2], [8, 58, Math.PI / 2], [-18, 68, 0], [18, 68, 0], [-30, 68, 0], [30, 68, 0]]) this.w.benchSpots.push({ x, z, ry: r })
    this.w.place('parc_catedrala', 'Parcul Catedralei', ax + 20, 68, { kind: 'park' })
  }

  // ===========================================================================
  gradina(b) {
    // Grădina Publică Ștefan cel Mare
    const rnd = mulberry(1818)
    // entrance plaza at the NW corner with the monument
    this.patch('plaza', b.ix0 - 0.5, b.iz0 - 0.5, b.ix0 + 22, b.iz0 + 20)
    this.statue(b.ix0 + 9, b.iz0 + 9, Math.PI * 0.8, { pedH: 6 })
    this.w.place('stefan', 'Monumentul lui Ștefan cel Mare', b.ix0 + 9, b.iz0 + 16, { kind: 'landmark' })
    // paths: diagonal + ring around the fountain
    const fx = b.cx, fz = b.cz + 4
    this.B.flat(fx, fz, 'dirt_o', 6).disc(fx, fz, 17, Y + 0.012, 40)
    this.patch('dirt', b.ix0, fz - 2.5, b.ix1, fz + 2.5, 0.011)
    this.patch('dirt', fx - 2.5, b.iz0, fx + 2.5, b.iz1, 0.011)
    this.B.flat(fx, fz, 'dirt_o', 6).orect((b.ix0 + fx) / 2 + 4, (b.iz0 + fz) / 2 + 4, 4, Math.hypot(fx - b.ix0, fz - b.iz0) - 10, Math.atan2(fx - b.ix0, fz - b.iz0), Y + 0.011)
    // fountain
    const g = this.g(fx, fz)
    g.cyl(8, 8.3, 0.7, 36, { x: fx, y: Y, z: fz, color: 0xa39d92 })
    g.cyl(7.4, 7.4, 0.72, 36, { x: fx, y: Y + 0.02, z: fz, color: 0x3f7fa8 })
    g.cyl(1.6, 2, 1.8, 12, { x: fx, y: Y, z: fz, color: 0xb5afa3 })
    g.cyl(3, 3, 0.3, 16, { x: fx, y: Y + 1.8, z: fz, color: 0xa39d92 })
    g.cyl(0.4, 0.5, 1.4, 8, { x: fx, y: Y + 2.1, z: fz, color: 0xb5afa3 })
    this.P.cylinder(fx, Y + 0.4, fz, 0.4, 8.3)
    this.w.fountains.push({ x: fx, z: fz, y: Y + 3.4, r: 7.2 })
    this.clear(fx - 18, fz - 18, fx + 18, fz + 18)
    this.w.place('fantana', 'Fântâna din Grădina Publică', fx, fz + 11, { kind: 'spot' })
    // Aleea Clasicilor: busts along the north-south path
    for (let i = 0; i < 8; i++) {
      const z = b.iz0 + 26 + i * 5.2
      for (const side of [-1, 1]) {
        const x = fx + side * 5
        if (Math.abs(z - fz) < 20) continue
        g.box(0.9, 1.5, 0.9, { x, y: Y, z, color: 0x9a948a })
        g.sphere(0.36, 8, 6, { x, y: Y + 1.95, z, sy: 1.15, color: BRONZE })
        g.box(0.6, 0.35, 0.4, { x, y: Y + 1.5, z, color: BRONZE })
        this.P.box(x, Y + 0.9, z, 0.45, 0.9, 0.45)
      }
    }
    this.w.place('aleea_clasicilor', 'Aleea Clasicilor', fx + 7, b.iz0 + 30, { kind: 'spot' })
    // Borea Țigan's giant pothole camp (south-east)
    const bx = b.ix1 - 16, bz = b.iz1 - 14
    this.B.flat(bx, bz, 'dirt_o', 6).disc(bx, bz, 5.5, Y + 0.013, 24)
    const k = this.st(bx, bz)
    k.cyl(3.4, 3.1, 0.2, 20, { x: bx, y: Y - 0.05, z: bz, color: 0x2b2622 })
    k.box(2.6, 2.1, 2.2, { x: bx + 5.4, y: Y, z: bz - 1.5, color: 0x6a4a8a })
    k.prism(3, 1.2, 2.6, { x: bx + 5.4, y: Y + 2.1, z: bz - 1.5, color: 0x8a3a3a })
    k.box(1.6, 0.9, 1.0, { x: bx + 3.2, y: Y, z: bz + 3.5, color: 0x8a6a3a })
    k.box(1.0, 0.6, 0.8, { x: bx + 4.4, y: Y, z: bz + 4.2, color: 0x5a7a4a })
    this.P.box(bx + 5.4, Y + 1.1, bz - 1.5, 1.3, 1.1, 1.1)
    this.w.place('borea', 'Groapa lui Borea Țigan', bx, bz, { kind: 'npc' })
    // dense park trees + benches along paths
    for (let i = 0; i < 90; i++) {
      const x = rnd.range(b.ix0 + 3, b.ix1 - 3), z = rnd.range(b.iz0 + 3, b.iz1 - 3)
      if (Math.hypot(x - fx, z - fz) < 20 || Math.abs(x - fx) < 7 || Math.abs(z - fz) < 5 || (x < b.ix0 + 24 && z < b.iz0 + 22) || Math.hypot(x - bx, z - bz) < 10) continue
      this.w.treeSpots.push({ x, z, kind: rnd() < 0.25 ? 'poplar' : 'broad' })
    }
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + 0.39
      this.w.benchSpots.push({ x: fx + Math.cos(ang) * 14, z: fz + Math.sin(ang) * 14, ry: -ang - Math.PI / 2 })
    }
    this.w.place('gradina', 'Grădina Publică Ștefan cel Mare', fx - 20, fz, { kind: 'park' })
  }

  // ===========================================================================
  primaria(b) {
    // Primăria (1902): red brick + cream stone, corner clock tower toward PMAN
    const x1 = b.ix1 - 1, len = 44, depth = 17
    const cx = x1 - len / 2, cz = b.iz1 - depth / 2 - 1.5
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 15, 0, 0xe6d6b4, [4.6, 3.4, 5.1, 4], 0x5a4a44)
    const g = this.g(cx, cz)
    for (const yy of [Y + 0.2, Y + 4.8, Y + 9.4]) g.box(len + 0.2, 0.9, depth + 0.2, { x: cx, y: yy, z: cz, color: BRICK })
    g.box(len + 1, 1.2, depth + 1, { x: cx, y: Y + 15, z: cz, color: 0xd9c9a4 })
    // clock tower at the east corner
    const tx = x1 - 4, tz = b.iz1 - 5.5
    g.box(8, 26, 8, { x: tx, y: Y, z: tz, color: 0xe6d6b4 })
    for (const yy of [Y + 6, Y + 13, Y + 20]) g.box(8.3, 0.9, 8.3, { x: tx, y: yy, z: tz, color: BRICK })
    g.box(8.6, 1, 8.6, { x: tx, y: Y + 26, z: tz, color: 0xd9c9a4 })
    g.cone(6.4, 9, 4, { x: tx, y: Y + 27, z: tz, ry: Math.PI / 4, color: 0x8e3424 })
    g.cyl(0.07, 0.1, 2.5, 6, { x: tx, y: Y + 36, z: tz, color: GOLD })
    for (const [ox, oz, ry] of [[0, 4.06, 0], [4.06, 0, Math.PI / 2], [0, -4.06, Math.PI], [-4.06, 0, -Math.PI / 2]]) {
      g.cyl(1.35, 1.35, 0.1, 20, { x: tx + ox, y: Y + 23, z: tz + oz, rx: Math.PI / 2, ry, center: true, color: 0xf7f0dc })
      g.box(0.1, 1.0, 0.06, { x: tx + ox * 1.01, y: Y + 23.1, z: tz + oz * 1.01, ry, color: DARK })
      g.box(0.7, 0.1, 0.06, { x: tx + ox * 1.01, y: Y + 23, z: tz + oz * 1.01, ry, color: DARK })
    }
    this.solid(cx, Y + 8, cz, len / 2, 8, depth / 2)
    this.solid(tx, Y + 13, tz, 4, 13, 4)
    this.w.clocks.push({ x: tx, y: Y + 23, z: tz })
    // entrance + ribbon-cutting stage in front (the mayor's favourite activity)
    g.box(6, 4.2, 0.5, { x: cx - 4, y: Y, z: cz + depth / 2 + 0.2, color: 0x5a3a2a })
    this.patch('plaza', cx - 20, b.iz1 - 1.2, x1, b.z1 - 0.3, 0.013)
    this.w.place('primaria', 'Primăria Chișinău', cx - 4, b.iz1 + 3.5, { kind: 'landmark' })
    // Sala cu Orgă next door (neoclassical, columns)
    const ox = b.ix0 + 22, oz = b.iz1 - 10
    const o = this.g(ox, oz)
    o.box(34, 13, 18, { x: ox, y: Y, z: oz - 1, color: 0xefe6d2 })
    o.box(35, 1, 19, { x: ox, y: Y + 13, z: oz - 1, color: STONE_L })
    this.portico(ox, oz + 8, 16, 9, 6, 0, STONE_L, 3)
    this.solid(ox, Y + 7, oz, 17, 7, 10)
    this.w.place('sala_orga', 'Sala cu Orgă', ox, b.iz1 + 3, { kind: 'landmark' })
    // back: historic rows along the north and west streets
    this.bld.historic(b, { sides: ['n', 'w'], courtyard: true })
  }

  // ===========================================================================
  opera(b) {
    const cx = b.cx, len = 64, depth = 30, cz = b.iz1 - depth / 2 - 10
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 20, 0, 0xf1efe8, [20, 3, 2.2, 0], 0x7a7670)
    const g = this.g(cx, cz)
    // tall white fins + glass curtain
    g.box(len - 4, 16, 0.3, { x: cx, y: Y + 1.5, z: cz + depth / 2 + 0.05, color: 0x33495c })
    for (let x = -len / 2 + 2; x <= len / 2 - 2; x += 2.6) g.box(0.7, 19, 1.4, { x: cx + x, y: Y, z: cz + depth / 2 + 0.4, color: 0xfaf8f2 })
    g.box(len + 2, 1.2, depth + 3, { x: cx, y: Y + 20, z: cz + 1, color: 0xe2ded4 })
    g.box(24, 2.2, 1, { x: cx, y: Y + 16.8, z: cz + depth / 2 + 1.3, color: 0xb59a4a, emit: 0.5 })
    this.solid(cx, Y + 10, cz, len / 2, 10, depth / 2 + 1.2)
    // forecourt with fountain
    this.patch('plaza', b.ix0 + 6, cz + depth / 2 + 2, b.ix1 - 6, b.iz1 + 0.5)
    this.clear(b.ix0 + 6, cz + depth / 2 + 2, b.ix1 - 6, b.z1)
    const fz = cz + depth / 2 + 6.5
    g.cyl(4, 4.2, 0.6, 24, { x: cx, y: Y, z: fz, color: 0xa39d92 })
    g.cyl(3.6, 3.6, 0.62, 24, { x: cx, y: Y + 0.02, z: fz, color: 0x3f7fa8 })
    this.P.cylinder(cx, Y + 0.3, fz, 0.3, 4.2)
    this.w.fountains.push({ x: cx, z: fz, y: Y + 1.4, r: 3.4 })
    const sign = this.w.signs.sign('TEATRUL DE OPERĂ ȘI BALET', { bg: '#f1efe8', fg: '#8a6a2a', w: 1024, h: 96, family: 'Rubik', weight: '700' })
    this.w.pendingSigns.push({ x: cx, y: Y + 17.9, z: cz + depth / 2 + 1.82, ry: 0, w: 22, h: 2.0, rect: sign, lit: 0.8 })
    this.bld.historic(b, { sides: ['n', 'w', 'e'], courtyard: false })
    this.w.place('opera', 'Teatrul de Operă și Balet', cx, b.iz1 + 3, { kind: 'landmark' })
  }

  // ===========================================================================
  parlament(b) {
    // the "open book": two wings angled toward the boulevard, white ribs + dark glass
    const cx = b.cx, cz = b.iz1 - 30
    const f = this.fac(cx, cz)
    const g = this.g(cx, cz)
    for (const side of [-1, 1]) {
      const ang = side * 0.32
      const wx = cx + side * 21, wz = cz - 3
      f.box(wx, wz, 38, 20, Y, 30, ang, 0xe8eaec, [3.3, 1.6, 7.7 + side, 2], 0x62666b)
      const c = Math.cos(ang), s = Math.sin(ang)
      for (let lx = -18; lx <= 18; lx += 1.6) {
        const x = wx + lx * c + 10.4 * s, z = wz - lx * s + 10.4 * c
        g.box(0.45, 30, 0.7, { x, y: Y, z, ry: ang, color: 0xf7f8f8 })
      }
      g.box(40, 1.2, 21, { x: wx, y: Y + 30, z: wz, ry: ang, color: 0xd8dadd })
      this.solid(wx, Y + 15, wz, 19, 15, 10, ang)
    }
    // low podium in front with the entrance
    g.box(30, 5, 10, { x: cx, y: Y, z: cz + 12, color: 0xd5d8dc })
    g.box(20, 3.8, 0.3, { x: cx, y: Y + 0.4, z: cz + 17.1, color: GLASS })
    this.solid(cx, Y + 2.5, cz + 12, 15, 2.5, 5)
    this.flag(cx - 12, Y + 5, cz + 15, 8, 1)
    this.flag(cx + 12, Y + 5, cz + 15, 8, 1)
    this.patch('plaza', b.ix0 + 4, cz + 17, b.ix1 - 4, b.iz1 + 0.5)
    this.clear(b.ix0 + 4, cz + 17, b.ix1 - 4, b.z1)
    this.bld.historic(b, { sides: ['n'], courtyard: false })
    this.w.place('parlament', 'Parlamentul Republicii Moldova', cx, b.iz1 + 2, { kind: 'landmark' })
  }

  // ===========================================================================
  presedintia(b) {
    const cx = b.cx + 14, len = 52, depth = 26, cz = b.iz1 - depth / 2 - 12
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 22, 0, 0xdcd6c8, [3.6, 3, 4.4, 4], 0x6c6862)
    const g = this.g(cx, cz)
    for (let x = -len / 2 + 2; x <= len / 2 - 2; x += 4) this.column(g, cx + x, cz + depth / 2 + 1.5, Y + 0.6, 16, 0.5, 0xeee9dd)
    g.box(len + 2, 1.4, 4, { x: cx, y: Y + 16.6, z: cz + depth / 2 + 1.4, color: 0xe4dfd3 })
    g.box(len + 1, 0.6, depth + 5, { x: cx, y: Y, z: cz + 2, color: 0xc9c3b6 })
    // glass dome on top
    g.box(18, 3, 12, { x: cx, y: Y + 22, z: cz, color: 0xd0cabc })
    g.dome(6, { x: cx, y: Y + 25, z: cz, color: 0x8fb4c8, sy: 0.6 })
    this.solid(cx, Y + 11, cz, len / 2, 11, depth / 2 + 3)
    this.flag(cx, Y + 28.6, cz, 5, 1)
    this.patch('plaza', cx - len / 2 - 2, cz + depth / 2 + 3.5, cx + len / 2 + 2, b.iz1 + 0.5)
    this.clear(cx - len / 2 - 2, cz + depth / 2 + 3.5, cx + len / 2 + 2, b.z1)
    this.w.place('presedintia', 'Președinția', cx, b.iz1 + 2, { kind: 'landmark' })
    // Biserica Schimbarea la Față (small church) at the west part
    const chx = b.ix0 + 14, chz = b.iz1 - 14
    const c = this.g(chx, chz)
    c.box(10, 8, 14, { x: chx, y: Y, z: chz, color: 0xf0ebe0 })
    c.prism(10.4, 2.4, 14.4, { x: chx, y: Y + 8, z: chz, ry: Math.PI / 2, color: 0x4f7d6c })
    c.cyl(2.2, 2.2, 3, 12, { x: chx, y: Y + 8.5, z: chz, color: 0xf0ebe0 })
    c.dome(2.4, { x: chx, y: Y + 11.5, z: chz, color: 0x4f7d6c })
    c.cyl(0.07, 0.1, 2.4, 6, { x: chx, y: Y + 13.8, z: chz, color: GOLD })
    c.box(1, 0.1, 0.1, { x: chx, y: Y + 15.6, z: chz, color: GOLD })
    c.box(3.2, 12, 3.2, { x: chx, y: Y, z: chz + 8.2, color: 0xf0ebe0 })
    c.cone(2.3, 4.5, 4, { x: chx, y: Y + 12, z: chz + 8.2, ry: Math.PI / 4, color: 0x4f7d6c })
    this.solid(chx, Y + 5, chz + 1.5, 5, 5, 8.8)
    this.w.place('biserica', 'Biserica Schimbarea la Față', chx, chz + 13, { kind: 'landmark' })
    this.bld.historic(b, { sides: ['n'], courtyard: false })
  }

  // ===========================================================================
  usm(b) {
    const cx = b.cx, len = 70, depth = 18, cz = b.iz1 - depth / 2 - 4
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 19, 0, 0xd8c8a8, [3.8, 3.2, 6.6, 4], 0x6c6862)
    this.portico(cx, cz + depth / 2, 22, 13, 8, 0, 0xefe6d0, 3.2)
    this.g(cx, cz).box(len + 1, 1.2, depth + 1, { x: cx, y: Y + 19, z: cz, color: 0xc9b894 })
    this.solid(cx, Y + 9.5, cz, len / 2, 9.5, depth / 2 + 3)
    const sign = this.w.signs.sign('UNIVERSITATEA DE STAT DIN MOLDOVA', { bg: '#d8c8a8', fg: '#3a2a1a', w: 1024, h: 80, weight: '700' })
    this.w.pendingSigns.push({ x: cx, y: Y + 15.2, z: cz + depth / 2 + 3.5, ry: 0, w: 18, h: 1.4, rect: sign, lit: 0.4 })
    this.bld.historic(b, { sides: ['n', 'e', 'w'], courtyard: true })
    this.w.place('usm', 'Universitatea de Stat', cx, b.iz1 + 3, { kind: 'landmark' })
  }

  // ===========================================================================
  hotel(b) {
    // Hotel Național: brutalist ruin on a podium, fenced off, abandoned since forever
    const cx = b.cx + 6, cz = b.cz + 8
    const f = this.fac(cx, cz)
    f.box(cx, cz, 44, 30, Y, 6, 0, 0x9a9da0, [6, 4, 2.2, 3], 0x55585c)
    f.box(cx, cz - 2, 28, 18, Y + 6, 48, 0, 0xa3a5a6, [3, 2.6, 8.9, 3], 0x55585c)
    const g = this.g(cx, cz)
    for (let x = -13; x <= 13; x += 2.6) g.box(0.35, 48, 0.6, { x: cx + x, y: Y + 6, z: cz + 7.2, color: 0x8e9194 })
    g.box(29, 3, 19, { x: cx, y: Y + 54, z: cz - 2, color: 0x8e9194 })
    this.solid(cx, Y + 3, cz, 22, 3, 15)
    this.solid(cx, Y + 30, cz - 2, 14, 24, 9)
    // construction fence all around
    const fence = this.st(cx, cz)
    const r = { x0: cx - 27, x1: cx + 27, z0: cz - 19, z1: cz + 19 }
    for (let x = r.x0; x < r.x1; x += 2.5) { fence.box(2.4, 2.2, 0.08, { x: x + 1.25, y: Y, z: r.z1, color: (x | 0) % 5 ? 0x3f6f4a : 0x46704f }); fence.box(2.4, 2.2, 0.08, { x: x + 1.25, y: Y, z: r.z0, color: 0x3f6f4a }) }
    for (let z = r.z0; z < r.z1; z += 2.5) { fence.box(0.08, 2.2, 2.4, { x: r.x0, y: Y, z: z + 1.25, color: 0x3f6f4a }); fence.box(0.08, 2.2, 2.4, { x: r.x1, y: Y, z: z + 1.25, color: 0x3f6f4a }) }
    this.solid(cx, Y + 1.1, r.z1, 27, 1.1, 0.1); this.solid(cx, Y + 1.1, r.z0, 27, 1.1, 0.1)
    this.solid(r.x0, Y + 1.1, cz, 0.1, 1.1, 19); this.solid(r.x1, Y + 1.1, cz, 0.1, 1.1, 19)
    const sign = this.w.signs.sign('HOTEL NAȚIONAL', { bg: '#a3a5a6', fg: '#2a2a2a', w: 640, h: 96, weight: '900' })
    this.w.pendingSigns.push({ x: cx, y: Y + 55.5, z: cz + 7.55, ry: 0, w: 16, h: 2.4, rect: sign, lit: 0.1 })
    // Kotovsky, on horseback, at the west end of the boulevard
    this.statue(b.ix0 + 8, b.iz1 - 8, -Math.PI / 2, { pedH: 3.5, figure: 'rider' })
    this.patch('plaza', b.ix0 - 0.5, b.iz1 - 16, b.ix0 + 16, b.iz1 + 0.5, 0.013)
    this.w.place('kotovski', 'Monumentul lui Kotovski', b.ix0 + 8, b.iz1 - 1, { kind: 'landmark' })
    this.w.place('hotel', 'Hotel Național (ruină)', cx, r.z1 + 3, { kind: 'landmark' })
    for (let i = 0; i < 18; i++) this.w.treeSpots.push({ x: b.ix0 + 4 + (i % 6) * 4, z: b.iz0 + 4 + Math.floor(i / 6) * 9, kind: 'small' })
  }

  // ===========================================================================
  teatru(b) {
    const cx = b.cx, len = 40, depth = 22, cz = b.iz0 + depth / 2 + 3
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 15, Math.PI, 0xeadcc0, [4.4, 3.4, 12.1, 4], 0x6a5f50)
    this.portico(cx, cz - depth / 2, 18, 10.5, 6, Math.PI, 0xf2ead8, 3.2)
    const g = this.g(cx, cz)
    g.box(len + 1, 1, depth + 1, { x: cx, y: Y + 15, z: cz, color: 0xdccdaf })
    for (const dx of [-12, 12]) g.box(1.2, 2.4, 1.2, { x: cx + dx, y: Y + 16, z: cz - depth / 2 + 0.6, color: 0x9a8f72 })
    this.solid(cx, Y + 7.5, cz, len / 2, 7.5, depth / 2 + 3.4)
    this.patch('plaza', cx - len / 2, b.iz0 - 0.5, cx + len / 2, cz - depth / 2 - 3.5)
    this.clear(cx - len / 2, b.z0, cx + len / 2, cz - depth / 2 - 3.5)
    this.bld.historic(b, { sides: ['s', 'w', 'e'], courtyard: true })
    this.w.place('teatru', 'Teatrul Național „Mihai Eminescu"', cx, b.iz0 - 3, { kind: 'landmark' })
  }

  // ===========================================================================
  muzeu(b) {
    const cx = b.cx, len = 46, depth = 22, cz = b.iz0 + depth / 2 + 8
    const f = this.fac(cx, cz)
    f.box(cx, cz, len, depth, Y, 14, Math.PI, 0xe8e2d2, [4.2, 3.6, 3.7, 4], 0x6a655c)
    this.portico(cx, cz - depth / 2, 22, 10, 8, Math.PI, STONE_L, 3.6)
    this.g(cx, cz).box(len + 1, 1, depth + 1, { x: cx, y: Y + 14, z: cz, color: 0xd6cfbd })
    this.solid(cx, Y + 7, cz, len / 2, 7, depth / 2 + 3.8)
    this.patch('plaza', cx - 14, b.iz0 - 0.5, cx + 14, cz - depth / 2 - 3.8)
    this.clear(cx - 14, b.z0, cx + 14, cz - depth / 2 - 3.8)
    this.statue(cx, b.iz0 + 3.4, 0, { pedH: 1.5, figure: 'wolf' })
    this.bld.historic(b, { sides: ['s', 'w', 'e'], courtyard: true })
    this.w.place('muzeu', 'Muzeul Național de Istorie', cx, b.iz0 - 3, { kind: 'landmark' })
  }

  // ===========================================================================
  istoric(b) {
    // the old town: continuous rows of houses, cafés with terraces on the boulevard
    this.bld.historic(b, { sides: ['n', 's', 'e', 'w'], courtyard: true })
    const g = this.st(b.cx, b.iz0)
    const rnd = mulberry(55)
    for (let x = b.ix0 + 6; x < b.ix1 - 6; x += 7.5) {
      const z = b.z0 + 3.2
      const col = rnd.pick([0xc0392b, 0x1f7a4a, 0x2f5f9f, 0xd68910, 0xf2f2ee])
      g.cyl(0.04, 0.04, 2.3, 6, { x, y: Y, z, color: 0x444 })
      g.cone(1.5, 0.6, 8, { x, y: Y + 2.1, z, color: col })
      g.cyl(0.45, 0.45, 0.06, 10, { x, y: Y + 0.72, z, color: 0x3a3a3a })
      for (const dx of [-0.9, 0.9]) g.box(0.45, 0.45, 0.45, { x: x + dx, y: Y, z, color: 0x6a4a2a })
    }
    this.w.place('istoric', 'Centrul Istoric', b.cx, b.iz0 - 2, { kind: 'district' })
  }

  // ===========================================================================
  piata(b) {
    // Piața Centrală: arch, market hall, stall alleys, chaos
    const cx = b.cx
    const hz = b.cz + 22
    const f = this.fac(cx, hz)
    f.box(cx, hz, 70, 28, Y, 9, 0, 0xe1d3b0, [9, 6, 2.1, 4], 0x7a6a55)
    const g = this.g(cx, hz)
    // vaulted roof segments
    for (let x = -30; x <= 30; x += 10) g.cyl(5.2, 5.2, 9.8, 12, { x: cx + x, y: Y + 9, z: hz, rx: Math.PI / 2, center: true, color: 0x8a9aa2, open: false })
    g.box(72, 0.5, 30, { x: cx, y: Y + 8.8, z: hz, color: 0xc9b894 })
    this.solid(cx, Y + 6, hz, 35, 6, 14)
    // entrance arch on the boulevard with the name banner
    const az = b.iz0 + 2
    const arch = this.archGeometry(18, 8, 2.4, 9, 6.4)
    g.add(arch, { x: cx, y: Y, z: az, color: 0xcdbb94 })
    g.box(18.6, 0.6, 3, { x: cx, y: Y + 8, z: az, color: 0xb9a680 })
    this.solid(cx - 7, Y + 4, az, 2.2, 4, 1.2); this.solid(cx + 7, Y + 4, az, 2.2, 4, 1.2); this.solid(cx, Y + 7.3, az, 9, 0.9, 1.2)
    const banner = this.w.signs.sign('PIAȚA CENTRALĂ', { bg: '#8f2f1f', fg: '#f4ecd6', w: 768, h: 110, border: '#e6c75a' })
    this.w.pendingSigns.push({ x: cx, y: Y + 7.0, z: az + 1.23, ry: 0, w: 10, h: 1.4, rect: banner, lit: 0.9, double: true })
    // stall alleys between the arch and the hall
    const rnd = mulberry(2021)
    const colors = [0xcc3b30, 0x2f7d5c, 0x2f5bb0, 0xe6b800, 0xd35400, 0x8e44ad]
    for (let row = 0; row < 3; row++) {
      const z = az + 10 + row * 11
      for (let x = b.ix0 + 6; x < b.ix1 - 6; x += 5.4) {
        if (Math.abs(x - cx) < 5) continue
        const c = rnd.pick(colors)
        const s = this.st(x, z)
        s.box(4.4, 0.9, 2.2, { x, y: Y, z, color: 0x8a6a44 })
        s.box(4.8, 0.1, 2.8, { x, y: Y + 2.4, z: z - 0.1, rx: 0.12, color: c })
        for (const dx of [-2.1, 2.1]) s.box(0.08, 2.4, 0.08, { x: x + dx, y: Y, z: z - 1.1, color: 0x555 })
        // produce on the counter
        const goods = rnd.pick([[0x2f9a44, 0x6b8e23], [0xcc3b30, 0xe74c3c], [0xe6b800, 0xf39c12], [0x7b3f99, 0x5b2d86], [0xd35400, 0xe67e22]])
        for (let k = 0; k < 5; k++) s.sphere(0.2, 6, 4, { x: x - 1.6 + k * 0.8, y: Y + 1.05, z: z + (rnd() - 0.5) * 0.8, color: rnd.pick(goods) })
        this.P.box(x, Y + 0.6, z, 2.2, 0.6, 1.1)
        this.w.stalls.push({ x, z: z + 1.8 })
      }
    }
    // watermelon mountain (drive into it)
    for (let i = 0; i < 26; i++) this.w.dynamicProps.push({ type: 'watermelon', x: b.ix1 - 10 + (i % 5) * 0.75, z: b.iz0 + 8 + Math.floor(i / 5) * 0.75, ry: 0 })
    for (let i = 0; i < 12; i++) this.w.dynamicProps.push({ type: 'crate', x: b.ix0 + 8 + (i % 4) * 0.9, z: b.iz0 + 7 + Math.floor(i / 4) * 0.9, ry: rnd() })
    this.clear(b.ix0, b.iz0, b.ix1, b.iz1)
    this.bld.kayRow({ side: 'e', from: b.iz0 + 2, to: b.iz1 - 2, line: b.ix1 - 0.3, seed: 90 })
    this.w.place('piata', 'Piața Centrală', cx, b.iz0 - 3, { kind: 'landmark' })
    this.w.place('piata_hala', 'Hala Piața Centrală', cx, hz - 17, { kind: 'spot' })
  }

  // ===========================================================================
  autogara(b) {
    const cx = b.cx
    const tz = b.iz1 - 12
    const f = this.fac(cx, tz)
    f.box(cx, tz, 50, 16, Y, 8, 0, 0xd7d2c4, [4, 3.2, 1.3, 5], 0x5a5a5a)
    const g = this.g(cx, tz)
    g.box(52, 0.6, 20, { x: cx, y: Y + 8, z: tz + 1, color: 0x9aa5ad })
    this.solid(cx, Y + 4, tz, 25, 4, 8)
    const sign = this.w.signs.sign('AUTOGARA CENTRALĂ', { bg: '#1f4f9c', fg: '#ffffff', w: 768, h: 96 })
    this.w.pendingSigns.push({ x: cx, y: Y + 7, z: tz - 8.1, ry: Math.PI, w: 14, h: 1.6, rect: sign, lit: 1 })
    // platforms with shelters
    for (let i = 0; i < 4; i++) {
      const z = b.iz0 + 12 + i * 16
      const s = this.st(cx, z)
      s.box(60, 0.25, 3, { x: cx, y: Y, z, color: 0xa7a39a })
      for (let x = -26; x <= 26; x += 13) {
        s.box(0.15, 3.2, 0.15, { x: cx + x, y: Y, z, color: 0x3a4f63 })
        this.P.cylinder(cx + x, Y + 1.6, z, 1.6, 0.12)
      }
      s.box(58, 0.15, 3.8, { x: cx, y: Y + 3.2, z, color: 0x2f7d5c })
      for (let k = 0; k < 3; k++) this.w.parkingSpots.push({ x: cx - 20 + k * 20, z: z + 5, ry: Math.PI / 2, kind: 'rutiera' })
    }
    this.clear(b.ix0, b.iz0, b.ix1, b.iz1 - 22)
    this.w.place('autogara', 'Autogara Centrală', cx, b.iz0 - 3, { kind: 'landmark' })
  }

  // ===========================================================================
  circ(b) {
    // the State Circus: round, proud, abandoned. Villain hangout.
    const cx = b.cx, cz = b.cz + 6
    const g = this.g(cx, cz)
    g.cyl(24, 25, 3, 40, { x: cx, y: Y, z: cz, color: 0xbdb6a8 })
    g.cyl(22, 22, 14, 40, { x: cx, y: Y + 3, z: cz, color: 0xe9e2d2 })
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2
      g.box(1.4, 13, 0.9, { x: cx + Math.cos(a) * 22.6, y: Y + 3, z: cz + Math.sin(a) * 22.6, ry: -a + Math.PI / 2, color: k % 2 ? 0xf5f1e8 : 0xb73a2f })
    }
    g.cyl(23.5, 23.5, 1, 40, { x: cx, y: Y + 17, z: cz, color: 0xd8d0bf })
    g.sphere(22, 32, 10, { x: cx, y: Y + 17.5, z: cz, sy: 0.32, thetaLen: Math.PI / 2, color: 0x9aa3a8 })
    g.cyl(2, 2, 3, 12, { x: cx, y: Y + 24, z: cz, color: 0xe9e2d2 })
    this.P.cylinder(cx, Y + 12, cz, 12, 24.6)
    // faded sign + broken letters
    const sign = this.w.signs.sign('C I R C', { bg: '#e9e2d2', fg: '#b73a2f', w: 512, h: 128, weight: '900' })
    this.w.pendingSigns.push({ x: cx, y: Y + 20.5, z: cz + 23.7, ry: 0, w: 10, h: 2.5, rect: sign, lit: 0.2 })
    this.patch('plaza', b.ix0 + 2, b.iz0 + 2, b.ix1 - 2, b.iz1 + 0.5)
    this.clear(b.ix0, b.iz0, b.ix1, b.iz1)
    // back entrance (service door) used in the finale
    g.box(3, 3.4, 0.4, { x: cx, y: Y + 3, z: cz - 22.5, color: 0x5a3a2a })
    this.w.place('circ', 'Circul (abandonat)', cx, cz + 30, { kind: 'landmark' })
    this.w.place('circ_spate', 'Intrarea din spate a Circului', cx, cz - 26, { kind: 'spot' })
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2
      this.w.treeSpots.push({ x: cx + Math.cos(a) * 38, z: cz + Math.sin(a) * 34, kind: i % 3 ? 'broad' : 'poplar' })
    }
  }

  // ===========================================================================
  ambasada(b) {
    // walled compound with a gate on the south (N1 street) side
    const x0 = b.ix0 + 4, x1 = b.ix1 - 4, z0 = b.iz0 + 4, z1 = b.iz1 - 3
    const s = this.st(b.cx, b.cz)
    const wallH = 3.2, gate = 10
    s.box(x1 - x0, wallH, 0.6, { x: (x0 + x1) / 2, y: Y, z: z0, color: 0xcfc8ba })
    s.box(0.6, wallH, z1 - z0, { x: x0, y: Y, z: (z0 + z1) / 2, color: 0xcfc8ba })
    s.box(0.6, wallH, z1 - z0, { x: x1, y: Y, z: (z0 + z1) / 2, color: 0xcfc8ba })
    const gx = b.cx
    s.box(gx - gate / 2 - x0, wallH, 0.6, { x: (x0 + gx - gate / 2) / 2, y: Y, z: z1, color: 0xcfc8ba })
    s.box(x1 - gx - gate / 2, wallH, 0.6, { x: (gx + gate / 2 + x1) / 2, y: Y, z: z1, color: 0xcfc8ba })
    this.solid((x0 + x1) / 2, Y + wallH / 2, z0, (x1 - x0) / 2, wallH / 2, 0.3)
    this.solid(x0, Y + wallH / 2, (z0 + z1) / 2, 0.3, wallH / 2, (z1 - z0) / 2)
    this.solid(x1, Y + wallH / 2, (z0 + z1) / 2, 0.3, wallH / 2, (z1 - z0) / 2)
    this.solid((x0 + gx - gate / 2) / 2, Y + wallH / 2, z1, (gx - gate / 2 - x0) / 2, wallH / 2, 0.3)
    this.solid((gx + gate / 2 + x1) / 2, Y + wallH / 2, z1, (x1 - gx - gate / 2) / 2, wallH / 2, 0.3)
    // guard booth + barrier
    s.box(2.4, 2.6, 2.4, { x: gx + gate / 2 + 2, y: Y, z: z1 - 2, color: 0xd9d4c8 })
    this.solid(gx + gate / 2 + 2, Y + 1.3, z1 - 2, 1.2, 1.3, 1.2)
    const f = this.fac(b.cx, b.cz - 10)
    f.box(b.cx, b.cz - 12, 44, 22, Y, 16, 0, 0xe6e0d2, [3.4, 3, 6.1, 4], 0x6a655c)
    this.solid(b.cx, Y + 8, b.cz - 12, 22, 8, 11)
    this.patch('plaza', gx - 6, b.cz, gx + 6, z1 + 3.5)
    this.w.flags.push({ x: b.cx, y: Y + 20, z: b.cz - 1, neutral: true })
    this.st(b.cx, b.cz).cyl(0.08, 0.1, 12, 6, { x: b.cx, y: Y, z: b.cz - 1, color: 0xc9c9c9 })
    this.st(b.cx, b.cz).box(3, 1.8, 0.05, { x: b.cx + 1.55, y: Y + 10, z: b.cz - 1, color: 0xf2f2f2 })
    const sign = this.w.signs.sign('AMBASADA', { bg: '#caa94a', fg: '#1a1a1a', w: 512, h: 96, weight: '900' })
    this.w.pendingSigns.push({ x: gx - gate / 2 - 4, y: Y + 2.2, z: z1 + 0.32, ry: 0, w: 4, h: 0.75, rect: sign, lit: 0.6 })
    for (let x = x0 + 5; x < x1 - 4; x += 9) this.w.treeSpots.push({ x, z: z0 + 5, kind: 'spruce' })
    this.w.place('ambasada', 'Ambasada', gx, z1 + 6, { kind: 'landmark' })
    this.w.place('ambasada_curte', 'Curtea Ambasadei', gx, b.cz + 6, { kind: 'spot' })
  }

  // ===========================================================================
  // Romanița, "Romașca": Oleg Vronski's 22-storey concrete daisy (1978-86), once the tallest
  // building in town, in Parcul Valea Trandafirilor. Four utility floors on a slim drum, sixteen
  // floors of flats cantilevered round it in petals, a "flying saucer" on the roof.
  romasca(b) {
    const rnd = mulberry(1986)
    const tx = b.ix1 - 20, tz = b.iz1 - 22
    const fb = this.fac(tx, tz), g = this.g(tx, tz)
    const CONC = 0xc9c3b6, CONC_D = 0x9d978b
    // the drum: utility floors, glazed at the bottom, ribs that carry the petals above
    const baseH = 12.4
    g.cyl(6.4, 6.6, 0.6, 32, { x: tx, y: Y, z: tz, color: CONC_D })
    g.cyl(6.1, 6.1, 3.2, 32, { x: tx, y: Y + 0.6, z: tz, color: GLASS })
    g.cyl(6.3, 6.3, baseH - 3.8, 32, { x: tx, y: Y + 3.8, z: tz, color: CONC })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      g.box(0.7, baseH, 1.2, { x: tx + Math.sin(a) * 6.5, y: Y, z: tz + Math.cos(a) * 6.5, ry: a, color: CONC_D })
    }
    // the petals: a lobed plan (12 bays) walled with the same window shader as every block, so the
    // flats light up at night like the rest of the city; the window grid runs on round the drum
    const fh = 3.1, floors = 16, y0 = Y + baseH, H = floors * fh
    const N = 96, LOBES = 12
    const R = (a) => 7.2 + 1.5 * Math.pow(0.5 + 0.5 * Math.cos(LOBES * a), 0.8)
    const params = [fh, 1.6, 44.5, 1]
    let u = 0
    const pt = (k) => { const a = (k / N) * Math.PI * 2; return [tx + Math.sin(a) * R(a), tz + Math.cos(a) * R(a)] }
    for (let k = 0; k < N; k++) {
      // clockwise from above, so every wall faces out (see FacadeBuilder.wall)
      const [x1, z1] = pt(N - k), [x0, z0] = pt(N - k - 1)
      fb.wall(x1, z1, x0, z0, y0, H, 0xd8d2c4, params, u)
      u += Math.hypot(x0 - x1, z0 - z1)
    }
    // slab edges every floor: the "corn cob" rings
    for (let f = 0; f <= floors; f++) g.cyl(8.95, 8.95, 0.22, 48, { x: tx, y: y0 + f * fh - 0.11, z: tz, color: f % 4 ? CONC : CONC_D })
    g.cyl(8.9, 8.9, 0.3, 48, { x: tx, y: y0 + H, z: tz, color: CONC_D })
    // technical floors and the saucer
    const ty = y0 + H + 0.3
    g.cyl(5.8, 5.8, 3.6, 32, { x: tx, y: ty, z: tz, color: CONC })
    g.cyl(11.5, 6, 1.6, 40, { x: tx, y: ty + 3.6, z: tz, color: CONC_D })
    g.cyl(11.5, 11.5, 1.1, 40, { x: tx, y: ty + 5.2, z: tz, color: 0xe4ded2 })
    g.cyl(11.6, 11.6, 0.35, 40, { x: tx, y: ty + 5.55, z: tz, color: GLASS })
    g.cyl(7.5, 11.5, 0.9, 40, { x: tx, y: ty + 6.3, z: tz, color: 0xd2ccbf })
    g.dome(3.2, { x: tx, y: ty + 7.2, z: tz, color: 0xbdb7aa, seg: 20 })
    g.cyl(0.12, 0.2, 9, 6, { x: tx, y: ty + 10, z: tz, color: 0x3a3a3a })
    g.box(2.6, 0.08, 0.08, { x: tx, y: ty + 15, z: tz, color: 0x3a3a3a })
    // entrance canopy toward the park
    g.box(5, 0.3, 3.2, { x: tx - 7.4, y: Y + 3.2, z: tz, ry: Math.PI / 2, color: CONC_D })
    for (const s of [-1, 1]) g.box(0.3, 3.2, 0.3, { x: tx - 8.8, y: Y, z: tz + s * 2.2, color: CONC_D })
    this.P.cylinder(tx, Y + baseH / 2, tz, baseH / 2, 6.7)
    this.P.cylinder(tx, y0 + H / 2, tz, H / 2, 8.9)
    this.w.footprints.push({ x: tx, z: tz, hx: 9, hz: 9 })
    this.clear(tx - 12, tz - 12, tx + 12, tz + 12)
    this.patch('plaza', tx - 13, tz - 11, tx + 8, tz + 11)
    this.w.place('romasca', 'Romașca (Floarea de Piatră)', tx - 12, tz, { kind: 'landmark' })

    // Parcul Valea Trandafirilor: a lake, paths round it, roses, benches, plenty of trees
    const lx = b.cx - 14, lz = b.cz + 6, lr = 17
    this.B.flat(lx, lz, 'dirt_o', 6).disc(lx, lz, lr + 4, Y + 0.012, 48)
    const w = this.st(lx, lz)
    w.cyl(lr + 0.6, lr + 0.6, 0.35, 48, { x: lx, y: Y - 0.1, z: lz, color: 0x9d978b })
    w.cyl(lr, lr, 0.32, 48, { x: lx, y: Y - 0.08, z: lz, color: 0x3a6f8f })
    this.P.cylinder(lx, Y + 0.5, lz, 0.5, lr + 0.4)
    this.w.fountains.push({ x: lx, z: lz, y: Y + 1.5, r: 3 })
    this.clear(lx - lr - 5, lz - lr - 5, lx + lr + 5, lz + lr + 5)
    this.patch('dirt', b.ix0, lz - 2, lx - lr - 2, lz + 2, 0.011)
    this.patch('dirt', lx + lr + 2, lz - 2, tx - 9, lz + 2, 0.011)
    this.patch('dirt', lx - 2, b.iz0, lx + 2, lz - lr - 2, 0.011)
    this.patch('dirt', lx - 2, lz + lr + 2, lx + 2, b.iz1, 0.011)
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2 + 0.3
      this.w.benchSpots.push({ x: lx + Math.cos(ang) * (lr + 2.6), z: lz + Math.sin(ang) * (lr + 2.6), ry: -ang - Math.PI / 2 })
    }
    // rose beds: low green mounds with red and pink blooms
    const roses = this.st(lx, lz)
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2
      const x = lx + Math.cos(ang) * (lr + 5.6), z = lz + Math.sin(ang) * (lr + 5.6)
      roses.sphere(0.9, 8, 6, { x, y: Y + 0.2, z, sy: 0.55, color: 0x2f5a2a })
      for (let k = 0; k < 3; k++) roses.sphere(0.2, 6, 4, { x: x + rnd.range(-0.5, 0.5), y: Y + 0.62, z: z + rnd.range(-0.5, 0.5), color: rnd() < 0.5 ? 0xc0263a : 0xe07aa0 })
    }
    for (let i = 0; i < 110; i++) {
      const x = rnd.range(b.ix0 + 3, b.ix1 - 3), z = rnd.range(b.iz0 + 3, b.iz1 - 3)
      if (Math.hypot(x - lx, z - lz) < lr + 8 || Math.hypot(x - tx, z - tz) < 16 || Math.abs(z - lz) < 4 || Math.abs(x - lx) < 4) continue
      this.w.treeSpots.push({ x, z, kind: rnd() < 0.3 ? 'poplar' : 'broad' })
    }
    this.w.place('valea_trandafirilor', 'Parcul Valea Trandafirilor', lx, lz - lr - 6, { kind: 'park' })
  }

  // ===========================================================================
  acasa(b) {
    // the player's home courtyard: block 7, the babushka bench, the gopnik corner, the garage
    this.bld.soviet(b, { variant: 0 })
    const zina = { x: b.cx - 18, z: b.iz0 + 23.5 }
    this.w.place('banca_zina', 'Banca Pensionarei', zina.x, zina.z, { kind: 'npc' })
    this.w.place('acasa', 'Acasă (Blocul 7)', b.cx - 14, b.iz0 + 21, { kind: 'home' })
    this.w.place('gopnici_curte', 'Colțul gopnicilor', b.cx + 12, b.cz + 4, { kind: 'npc' })
    this.w.benchSpots.push({ x: zina.x, z: zina.z - 0.8, ry: 0, special: 'zina' })
    this.w.place('garaj_unchi', 'Garajul unchiului Vasile', b.ix0 + 14, b.iz1 - 22, { kind: 'spot' })
    this.bld.garageRow(b.ix0 + 5, b.iz1 - 26, 6, 0, mulberry(7))
  }

  garaje(b) {
    // garage cooperative + the mechanic's workshop
    const rnd = mulberry(1990)
    for (let r = 0; r < 5; r++) {
      const z = b.iz0 + 12 + r * 20
      this.bld.garageRow(b.ix0 + 8, z, 14, r % 2 ? Math.PI : 0, rnd)
    }
    this.patch('asphalt', b.ix0 + 2, b.iz0 + 2, b.ix1 - 2, b.iz1 - 2, 0.012)
    const mx = b.ix1 - 20, mz = b.iz1 - 22
    const g = this.g(mx, mz)
    g.box(18, 6, 14, { x: mx, y: Y, z: mz, color: 0x9c9890 })
    g.box(19, 0.4, 15, { x: mx, y: Y + 6, z: mz, color: 0x5a5854 })
    g.box(7, 4.6, 0.3, { x: mx - 3, y: Y, z: mz + 7.05, color: 0x2f4f6f })
    for (let i = 0; i < 6; i++) g.cyl(0.4, 0.4, 0.28, 10, { x: mx + 6 + (i % 2) * 0.9, y: Y + (Math.floor(i / 2)) * 0.28, z: mz + 8.5, color: 0x1c1c1e })
    this.solid(mx, Y + 3, mz, 9, 3, 7)
    const sign = this.w.signs.sign('AUTO SERVICE „LA VOVA"', { bg: '#2f4f6f', fg: '#ffd24a', w: 768, h: 96 })
    this.w.pendingSigns.push({ x: mx, y: Y + 5.2, z: mz + 7.25, ry: 0, w: 9, h: 1.1, rect: sign, lit: 1 })
    this.w.place('mecanic', 'Auto Service „La Vova"', mx - 3, mz + 11, { kind: 'shop' })
    this.w.place('garaje', 'Cooperativa de garaje', b.cx, b.cz, { kind: 'district' })
  }

  linella(b) {
    this.bld.soviet(b, { variant: 1 })
    const lx = b.cx, lz = b.iz0 + 9
    const f = this.fac(lx, lz)
    f.box(lx, lz, 36, 14, Y, 5.5, Math.PI, 0xeef0ee, [5.5, 4, 3.3, 0], 0x6a6a6a)
    const g = this.g(lx, lz)
    g.box(30, 3, 0.2, { x: lx, y: Y + 0.3, z: lz - 7.05, color: 0x6a9ab0, emit: 0.7 })
    g.box(38, 0.5, 16, { x: lx, y: Y + 5.5, z: lz, color: 0x009640 })
    this.solid(lx, Y + 2.8, lz, 18, 2.8, 7)
    const sign = this.w.signs.sign('LINELLA', { bg: '#009640', fg: '#ffffff', w: 512, h: 110 })
    this.w.pendingSigns.push({ x: lx, y: Y + 4.4, z: lz - 7.16, ry: Math.PI, w: 8, h: 1.7, rect: sign, lit: 1 })
    this.w.place('linella', 'Linella', lx, lz - 10, { kind: 'shop' })
  }

  // ===========================================================================
  gara(b) {
    // Piața Gării (square) in the block; station building + platforms south of the ring road
    this.patch('plaza', b.ix0, b.iz0, b.ix1, b.iz1, 0.012)
    this.clear(b.ix0, b.iz0, b.ix1, b.iz1)
    const s2 = H_ROADS[H_ROADS.length - 1]
    const gz = s2.z + s2.w / 2 + 12, gx = b.cx
    const f = this.fac(gx, gz)
    f.box(gx, gz, 76, 16, 0, 12, 0, 0xe4d5b2, [4.4, 3.6, 7.3, 4], 0x7a5a44)
    const g = this.g(gx, gz)
    g.box(78, 1, 18, { x: gx, y: 12, z: gz, color: BRICK })
    g.box(14, 22, 14, { x: gx, y: 0, z: gz - 1, color: 0xe4d5b2 })
    g.box(14.6, 1, 14.6, { x: gx, y: 22, z: gz - 1, color: BRICK })
    g.cone(10.5, 7, 4, { x: gx, y: 23, z: gz - 1, ry: Math.PI / 4, color: 0x8e3424 })
    g.cyl(1.6, 1.6, 0.12, 20, { x: gx, y: 18, z: gz - 8.05, rx: Math.PI / 2, center: true, color: 0xf7f0dc })
    g.box(0.1, 1.2, 0.06, { x: gx, y: 18.1, z: gz - 8.12, color: DARK })
    g.box(9, 3.6, 0.4, { x: gx, y: 0, z: gz - 8.1, color: 0x5a3a2a })
    this.solid(gx, 6, gz, 38, 6, 8)
    this.solid(gx, 11, gz - 1, 7, 11, 7)
    const sign = this.w.signs.sign('GARA CHIȘINĂU', { bg: '#e4d5b2', fg: '#8e3424', w: 768, h: 110 })
    this.w.pendingSigns.push({ x: gx, y: 14.4, z: gz - 8.12, ry: Math.PI, w: 11, h: 1.6, rect: sign, lit: 0.8 })
    // platforms + rails along the south edge
    const pz = RAIL_Z - 8.5
    const pl = this.st(gx, pz)
    pl.box(200, 0.3, 6, { x: gx - 20, y: 0, z: pz, color: 0xa7a39a })
    pl.box(200, 0.05, 0.4, { x: gx - 20, y: 0.3, z: pz + 2.8, color: 0xe8c14a })
    // the canopy only runs along the station building: where you step off the train (its west
    // end) there's open sky, so the opening and your first steps aren't under a roof
    const c0 = gx - 28, c1 = gx + 72
    for (let x = c0 + 2; x <= c1 - 2; x += 12) {
      pl.box(0.2, 4, 0.2, { x, y: 0.3, z: pz - 1.5, color: 0x3a4f63 })
      this.P.cylinder(x, 2.3, pz - 1.5, 2, 0.14)
    }
    pl.box(c1 - c0, 0.2, 5, { x: (c0 + c1) / 2, y: 4.3, z: pz - 0.5, color: 0x6a7f8e })
    // in 50 m pieces: one 200 m box is too coarse for the character controller's contact maths
    for (let i = 0; i < 4; i++) this.P.box(gx - 120 + 25 + i * 50, 0.15, pz, 25, 0.15, 3)
    this.w.place('gara', 'Gara Feroviară Chișinău', gx, b.iz1 + 2, { kind: 'landmark' })
    this.w.place('peron', 'Peronul 1', gx - 40, pz, { kind: 'spot', y: 0.3 })
    this.w.rails = { z: RAIL_Z, x0: -520, x1: 520 }
  }
}
