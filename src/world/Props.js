import * as THREE from 'three'
import { H_ROADS, V_ROADS, CURB_H, BLOCKS, LANE_W } from './CityLayout.js'
import { roadProfile } from './Ground.js'
import { mulberry } from './rng.js'
import { makeGlow } from '../render/Textures.js'
import { SHARED } from '../render/Materials.js'

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler()
const mat4 = (x, y, z, ry = 0, s = 1) => { _q.setFromEuler(_e.set(0, ry, 0)); return _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s)).clone() }

const LEAF = [0x3f7a34, 0x4a8a3c, 0x356d2f, 0x5a9444, 0x46803a]
const LEAF_AUTUMN = [0xc9a23a, 0xd98a2e, 0xb8b03e]

// ---------------------------------------------------------------------------
// Trees: procedural low-poly, merged into chunk batches (tree kind = flat shaded + cutout)
// lumpy leaf clusters: subdivided spheres pushed around by smooth noise (same noise for shared
// vertices, so no cracks); a few variants are enough for a whole city of trees
const BLOBS = []
function blob(i) {
  if (!BLOBS.length) {
    for (let k = 0; k < 6; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 1)
      const P = geo.attributes.position, N = geo.attributes.normal
      const a = 2.1 + k * 0.37, b = 1.7 + k * 0.21, c = k * 1.3
      for (let j = 0; j < P.count; j++) {
        const px = P.getX(j), py = P.getY(j), pz = P.getZ(j)
        const d = 1 + 0.16 * Math.sin(px * a + c) * Math.sin(py * b + c * 0.7) + 0.1 * Math.sin(pz * (a + 1.1) + py * 1.9 + c) + 0.06 * Math.sin((px + pz) * 4.3 + c)
        P.setXYZ(j, px * d, py * d * 0.92, pz * d)
        N.setXYZ(j, px, py, pz) // smooth radial normals (the geometry is non-indexed)
      }
      BLOBS.push(geo)
    }
  }
  return BLOBS[i % BLOBS.length]
}

// spruce tiers: a star-shaped skirt whose branch tips droop below the valleys between them,
// closed underneath so it never looks hollow from a low camera
const SKIRTS = []
function skirt(i) {
  if (!SKIRTS.length) {
    for (let k = 0; k < 4; k++) {
      const n = 8 + k, rnd = mulberry(77 + k)
      const ring = (rT, rV, yT, yV) => {
        const r = []
        for (let j = 0; j < n * 2; j++) {
          const a = (j / (n * 2)) * Math.PI * 2, tip = j % 2 === 0, jit = tip ? 0.85 + rnd() * 0.3 : 1
          r.push(new THREE.Vector3(Math.cos(a) * (tip ? rT : rV) * jit, tip ? yT - (jit - 1) * 0.3 : yV, Math.sin(a) * (tip ? rT : rV) * jit))
        }
        return r
      }
      const apex = new THREE.Vector3(0, 1, 0)
      const mid = ring(0.6, 0.4, 0.46, 0.56), rim = ring(1.0, 0.56, -0.22, 0.05), under = ring(0.28, 0.28, 0.14, 0.14)
      const pos = []
      const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _o = new THREE.Vector3()
      const tri = (a, b, c, up) => {
        _n.crossVectors(_a.subVectors(b, a), _b.subVectors(c, a))
        _o.set(a.x + b.x + c.x, 0, a.z + b.z + c.z).normalize(); _o.y = up
        if (_n.dot(_o) < 0) [b, c] = [c, b]
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
      }
      for (let j = 0; j < n * 2; j++) {
        const j2 = (j + 1) % (n * 2)
        tri(apex, mid[j], mid[j2], 0.6)
        tri(mid[j], rim[j], rim[j2], 0.4); tri(mid[j], rim[j2], mid[j2], 0.4)
        tri(rim[j], under[j], under[j2], -3); tri(rim[j], under[j2], rim[j2], -3)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
      SKIRTS.push(g)
    }
  }
  return SKIRTS[i % SKIRTS.length]
}

// shading baked into the vertex colours: dark underside and core, sunlit crown, a little dapple
function foliageShade(cy, h) {
  return (p, n) => {
    const t = Math.min(1, Math.max(0, (p.y - (cy - h)) / (2 * h)))
    const dapple = 0.94 + 0.12 * (Math.sin(p.x * 3.1 + p.z * 1.7) * Math.sin(p.y * 2.3 - p.x * 1.3) * 0.5 + 0.5)
    return (0.5 + 0.62 * t) * (0.88 + 0.16 * Math.max(0, n.y)) * dapple
  }
}

export function addTreeGeometry(g, x, z, rnd, kind = null) {
  const y = CURB_H
  const k = kind ?? (rnd() < 0.62 ? 'broad' : rnd() < 0.55 ? 'poplar' : rnd() < 0.5 ? 'small' : 'spruce')
  const s = rnd.range(0.85, 1.25)
  const autumn = rnd() < 0.12
  const base = autumn ? rnd.pick(LEAF_AUTUMN) : rnd.pick(LEAF)
  const leaf = () => { const c = new THREE.Color(base); const v = 0.9 + rnd() * 0.2; return c.setRGB(c.r * v, c.g * v, c.b * v).getHex() }
  const bark = rnd.pick([0x4e3a2b, 0x5b4331, 0x463429])
  const trunkShade = (p) => 0.7 + 0.3 * Math.min(1, (p.y - y) / 2.5)
  if (k === 'broad') {
    const th = 2.7 * s
    g.cyl(0.16 * s, 0.27 * s, th + 0.8 * s, 8, { x, y, z, color: bark, shade: trunkShade })
    // limbs reaching into the crown
    for (let i = 0; i < 2; i++) {
      const a = i * 3.1 + rnd() * 0.8
      g.cyl(0.05 * s, 0.11 * s, 1.9 * s, 5, { x: x + Math.cos(a) * 0.35 * s, y: y + th - 0.2 * s, z: z + Math.sin(a) * 0.35 * s, rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7, color: bark })
    }
    const cy = y + th + 1.9 * s, R = 2.5 * s, Hh = 1.9 * s
    const center = { x, y: cy, z }
    const shade = foliageShade(cy, Hh)
    const n = 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.7, rr = rnd.range(0.55, 1.0) * R * 0.58
      const bs = rnd.range(1.45, 1.85) * s
      g.add(blob(Math.floor(rnd() * 6)), { x: x + Math.cos(a) * rr, y: cy + rnd.range(-0.5, 0.7) * s, z: z + Math.sin(a) * rr, sx: bs, sy: bs * 0.9, sz: bs, ry: rnd() * 6, color: leaf(), shade, bendTo: center, bend: 0.72 })
    }
    g.add(blob(Math.floor(rnd() * 6)), { x, y: cy + 0.95 * s, z, sx: 1.75 * s, sy: 1.45 * s, sz: 1.75 * s, ry: rnd() * 6, color: leaf(), shade, bendTo: center, bend: 0.72 })
  } else if (k === 'poplar') {
    g.cyl(0.13 * s, 0.24 * s, 3.4 * s, 7, { x, y, z, color: bark, shade: trunkShade })
    const cy = y + 5.6 * s, center = { x, y: cy, z }
    const shade = foliageShade(cy, 3.4 * s)
    for (let i = 0; i < 4; i++) {
      const bs = (1.3 - Math.abs(i - 1.3) * 0.2) * s
      g.add(blob(i + Math.floor(rnd() * 3)), { x: x + rnd.range(-0.2, 0.2) * s, y: y + (3.0 + i * 1.6) * s, z: z + rnd.range(-0.2, 0.2) * s, sx: bs, sy: bs * 1.45, sz: bs, ry: rnd() * 6, color: leaf(), shade, bendTo: center, bend: 0.7 })
    }
  } else if (k === 'small') {
    g.cyl(0.09 * s, 0.15 * s, 1.9 * s, 6, { x, y, z, color: bark, shade: trunkShade })
    const cy = y + 2.6 * s, center = { x, y: cy, z }
    const shade = foliageShade(cy, 1.1 * s)
    for (let i = 0; i < 2; i++) {
      const a = i * 3.1 + rnd(), rr = 0.4 * s
      g.add(blob(Math.floor(rnd() * 6)), { x: x + Math.cos(a) * rr, y: cy + rnd.range(-0.2, 0.3) * s, z: z + Math.sin(a) * rr, sx: 1.1 * s, sy: 0.95 * s, sz: 1.1 * s, ry: rnd() * 6, color: leaf(), shade, bendTo: center, bend: 0.72 })
    }
  } else {
    // spruce: tiers of drooping star skirts, darker toward the trunk and the ground
    g.cyl(0.12 * s, 0.2 * s, 2.2 * s, 7, { x, y, z, color: 0x46342a, shade: trunkShade })
    const tiers = 6, H = 7.6 * s
    const dark = rnd() < 0.5 ? 0x264c2c : 0x2b5431
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1)
      const r = (2.35 - t * 1.85) * s * rnd.range(0.93, 1.07)
      const h = (1.75 - t * 0.55) * s
      const yy = y + (1.25 + t * (H - 2.6 * s) / s) * s
      const shade = (p, n) => (0.5 + 0.55 * Math.min(1, (p.y - y) / H)) * (0.84 + 0.22 * Math.max(0, n.y)) * (0.72 + 0.4 * Math.min(1, Math.hypot(p.x - x, p.z - z) / r))
      g.add(skirt(i + Math.floor(rnd() * 4)), { x, y: yy, z, sx: r, sy: h, sz: r, ry: rnd() * 6.3, color: i % 2 ? dark : 0x2e5a34, shade, bendTo: { x, y: yy - h * 0.6, z }, bend: 0.3 })
    }
    g.cone(0.3 * s, 1.3 * s, 7, { x, y: y + H - 0.6 * s, z, color: 0x315f37, shade: () => 1.05 })
  }
  return k
}

export class Props {
  constructor(world) {
    this.w = world
    this.B = world.batches
    this.P = world.physics
    this.kay = world.assets.kay
    this.signs = world.signs
    this.rnd = mulberry(4242)
    this.signQuads = [] // { x,y,z, ry, w, h, rect, lit }
  }

  build() {
    this.boulevardFurniture()
    this.streetLamps()
    this.trolleyWires()
    this.trafficLights()
    this.busStops()
    this.streetPlates()
    this.kiosks()
    this.shopSigns()
    this.trees()
    this.lightPools()
    this.buildSigns()
  }

  tree(x, z, kind) {
    const g = this.B.vcol(x, z, 'tree')
    const k = addTreeGeometry(g, x, z, this.rnd, kind)
    this.P.cylinder(x, CURB_H + 1.5, z, 1.5, k === 'spruce' ? 0.35 : 0.3)
  }

  trees() {
    for (const t of this.w.treeSpots) this.tree(t.x, t.z, t.kind)
  }

  // ---- boulevard: double row of chestnut trees + benches + bins -----------
  boulevardFurniture() {
    const bd = H_ROADS.find((h) => h.boulevard)
    const rnd = mulberry(99)
    for (const side of [-1, 1]) {
      const z = bd.z + side * (bd.w / 2 + bd.sw * 0.62)
      for (let j = 0; j < V_ROADS.length - 1; j++) {
        const a = V_ROADS[j].x + V_ROADS[j].w / 2 + 6, b = V_ROADS[j + 1].x - V_ROADS[j + 1].w / 2 - 6
        for (let x = a; x < b; x += 11) {
          if (this.w.keepClear(x, z)) continue
          this.w.treeSpots.push({ x: x + rnd.range(-0.6, 0.6), z: z + rnd.range(-0.3, 0.3), kind: 'broad' })
          if (rnd() < 0.35) {
            const bx = x + 5.5, bz = z + side * 1.4
            if (!this.w.keepClear(bx, bz)) {
              this.B.atlas(bx, bz, this.kay.bench.geometry, mat4(bx, CURB_H, bz, side > 0 ? Math.PI : 0), 'props')
              this.w.benches.push({ x: bx, z: bz, ry: side > 0 ? Math.PI : 0 })
            }
          }
          if (rnd() < 0.2) this.w.dynamicProps.push({ type: 'bin', x: x + 3, z: z - side * 1.6, ry: 0 })
        }
      }
    }
  }

  // ---- street lamps (KayKit streetlight, CC0) with sodium light pools --------
  streetLamps() {
    const lamp = this.kay.streetlight
    const g = (x, z) => this.B.vcol(x, z, 'static')
    const put = (x, z, armDir) => {
      if (this.w.keepClear(x, z)) return
      // arm of the model points to local -x; rotate so it reaches over the road
      const ry = { '+z': Math.PI / 2, '-z': -Math.PI / 2, '+x': Math.PI, '-x': 0 }[armDir]
      this.B.atlas(x, z, lamp.geometry, mat4(x, CURB_H, z, ry), 'props')
      const head = { '+z': [0, 1.05], '-z': [0, -1.05], '+x': [1.05, 0], '-x': [-1.05, 0] }[armDir]
      const hx = x + head[0], hz = z + head[1]
      g(hx, hz).box(0.42, 0.08, 0.42, { x: hx, y: CURB_H + 4.28, z: hz, color: 0xffc27a, emit: 1 })
      this.P.cylinder(x, CURB_H + 2.2, z, 2.2, 0.14)
      this.w.lamps.push({ x: hx, z: hz, y: CURB_H + 4.3 })
    }
    for (const h of H_ROADS) {
      const off = h.w / 2 + 0.7
      const step = h.boulevard ? 26 : 32
      for (let j = 0; j < V_ROADS.length - 1; j++) {
        const a = V_ROADS[j].x + V_ROADS[j].w / 2 + 8, b = V_ROADS[j + 1].x - V_ROADS[j + 1].w / 2 - 8
        for (let x = a; x <= b; x += step) {
          if (h.id !== 'N2') put(x, h.z - off, '+z')
          if (h.id !== 'S2') put(x + step / 2, h.z + off, '-z')
        }
      }
    }
    for (const v of V_ROADS) {
      const off = v.w / 2 + 0.7
      for (let i = 0; i < H_ROADS.length - 1; i++) {
        const a = H_ROADS[i].z + H_ROADS[i].w / 2 + 9, b = H_ROADS[i + 1].z - H_ROADS[i + 1].w / 2 - 9
        for (let z = a; z <= b; z += 34) {
          if (v.id !== 'VW') put(v.x - off, z, '+x')
          if (v.id !== 'VE') put(v.x + off, z + 17, '-x')
        }
      }
    }
  }

  // ---- trolleybus catenary along the boulevard (the most Chișinău thing ever) --
  trolleyWires() {
    const bd = H_ROADS.find((h) => h.boulevard)
    const p = roadProfile(bd)
    const wiresPos = []
    const yW = CURB_H + 5.7
    const laneZ = p.median + (bd.lanes - 0.5) * LANE_W // outer lane centre
    const x0 = V_ROADS[0].x, x1 = V_ROADS[V_ROADS.length - 1].x
    let prevPoles = null
    for (let x = x0 + 14; x <= x1 - 10; x += 32) {
      const onCross = V_ROADS.some((v) => Math.abs(x - v.x) < v.w / 2 + 5)
      if (onCross) continue
      const zn = bd.z - bd.w / 2 - 0.45, zs = bd.z + bd.w / 2 + 0.45
      for (const z of [zn, zs]) {
        this.B.vcol(x, z, 'static').cyl(0.1, 0.14, 8.2, 8, { x, y: CURB_H, z, color: 0x55605a })
        this.P.cylinder(x, CURB_H + 4, z, 4, 0.16)
      }
      // span wire between the poles
      wiresPos.push(x, yW + 1.3, zn, x, yW + 1.3, zs)
      // hangers down to the contact wires
      for (const lz of [-laneZ - 0.3, -laneZ + 0.3, laneZ - 0.3, laneZ + 0.3]) wiresPos.push(x, yW + 1.3, bd.z + lz, x, yW, bd.z + lz)
      if (prevPoles !== null) {
        for (const lz of [-laneZ - 0.3, -laneZ + 0.3, laneZ - 0.3, laneZ + 0.3]) wiresPos.push(prevPoles, yW, bd.z + lz, x, yW, bd.z + lz)
      }
      prevPoles = x
    }
    // wires continue across intersections: connect consecutive pole positions regardless of gaps
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(wiresPos, 3))
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1c1d20, transparent: true, opacity: 0.85, fog: true }))
    lines.frustumCulled = false
    this.w.scene.add(lines)
    this.w.trolleyLaneZ = laneZ
  }

  // ---- traffic lights on controlled intersections -------------------------
  trafficLights() {
    const heads = []
    for (const it of this.w.controlled) {
      const { v, h } = it
      // one pole per approach, on the right-hand far corner as seen by the approaching driver
      const cfg = [
        { x: v.x + v.w / 2 + 1.2, z: h.z + h.w / 2 + 1.2, face: '+z', axis: 'ns' }, // for northbound (moving -z), stands on SE corner facing +z
        { x: v.x - v.w / 2 - 1.2, z: h.z - h.w / 2 - 1.2, face: '-z', axis: 'ns' }, // southbound
        { x: v.x - v.w / 2 - 1.2, z: h.z + h.w / 2 + 1.2, face: '-x', axis: 'ew' }, // eastbound
        { x: v.x + v.w / 2 + 1.2, z: h.z - h.w / 2 - 1.2, face: '+x', axis: 'ew' }, // westbound
      ]
      for (const c of cfg) {
        const g = this.B.vcol(c.x, c.z, 'static')
        g.cyl(0.08, 0.1, 3.4, 8, { x: c.x, y: CURB_H, z: c.z, color: 0x2e3238 })
        const ry = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[c.face]
        g.box(0.42, 1.25, 0.34, { x: c.x, y: CURB_H + 2.7, z: c.z, ry, color: 0x23262b })
        const fx = Math.sin(ry) * 0.18, fz = Math.cos(ry) * 0.18
        heads.push({ x: c.x + fx, z: c.z + fz, y: CURB_H + 2.7, ry, axis: c.axis, it })
        this.P.cylinder(c.x, CURB_H + 1.7, c.z, 1.7, 0.12)
      }
    }
    // instanced lamps: red / yellow / green discs; colours updated by the traffic system
    const disc = new THREE.CircleGeometry(0.13, 12)
    const mk = () => {
      const im = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true }), heads.length)
      im.frustumCulled = false
      this.w.scene.add(im)
      return im
    }
    const lamps = { r: mk(), y: mk(), g: mk() }
    heads.forEach((hd, i) => {
      ;[['r', 1.08], ['y', 0.72], ['g', 0.36]].forEach(([k, dy]) => {
        const m = mat4(hd.x, hd.y + dy + 0.08, hd.z, hd.ry)
        lamps[k].setMatrixAt(i, m)
        lamps[k].setColorAt(i, new THREE.Color(0x222222))
      })
    })
    for (const k of ['r', 'y', 'g']) { lamps[k].instanceMatrix.needsUpdate = true; lamps[k].instanceColor.needsUpdate = true }
    this.w.trafficHeads = heads
    this.w.trafficLamps = lamps
  }

  // ---- bus / trolleybus shelters -----------------------------------------
  busStops() {
    const bd = H_ROADS.find((h) => h.boulevard)
    const stops = [
      [-250, -1, 'Teatrul de Operă'], [-110, -1, 'Primăria'], [25, -1, 'Piața Marii Adunări Naționale'], [130, -1, 'Parlament'], [250, -1, 'Președinție'], [370, -1, 'Universitate'],
      [-360, 1, 'Hotel Național'], [-240, 1, 'Muzeul de Istorie'], [-25, 1, 'Catedrala'], [100, 1, 'Grădina Publică'], [235, 1, 'Piața Centrală'], [360, 1, 'Autogara Centrală'],
    ]
    for (const [x, side, name] of stops) {
      const z = bd.z + side * (bd.w / 2 + 2.6)
      this.shelter(x, z, side > 0 ? 0 : Math.PI, name)
      this.w.busStops.push({ x, z, side, name, laneZ: bd.z + side * this.w.trolleyLaneZ })
      this.w.clearZones.push({ x, z, r: 5 })
    }
  }

  shelter(x, z, ry, name) {
    const g = this.B.vcol(x, z, 'static')
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)]
    const y = CURB_H
    // back wall (glass) is on the far side from the road: local +z faces the road
    const [bx, bz] = W(0, -0.9)
    g.box(4.6, 2.3, 0.08, { x: bx, y: y + 0.1, z: bz, ry, color: 0x7f9fb0 })
    for (const lx of [-2.3, 2.3]) {
      const [px, pz] = W(lx, -0.9); g.box(0.1, 2.6, 0.1, { x: px, y, z: pz, ry, color: 0x2c3036 })
      const [sx, sz] = W(lx, -0.35); g.box(0.06, 2.1, 1.1, { x: sx, y: y + 0.3, z: sz, ry, color: 0x8fb0c0 })
    }
    const [rx, rz] = W(0, -0.2)
    g.box(5, 0.14, 1.9, { x: rx, y: y + 2.6, z: rz, ry, color: 0x3a4f63 })
    const [kx, kz] = W(0, -0.55)
    g.box(3.2, 0.1, 0.5, { x: kx, y: y + 0.48, z: kz, ry, color: 0x9a7a55 })
    // route sign pole
    const [sx, sz] = W(2.9, 0.4)
    g.cyl(0.05, 0.05, 2.8, 6, { x: sx, y, z: sz, color: 0x2c3036 })
    g.box(0.55, 0.55, 0.05, { x: sx, y: y + 2.55, z: sz, ry, color: 0x2f7d5c })
    // name board on the roof edge
    const rect = this.signs.sign(name.toUpperCase(), { bg: '#1f4f9c', fg: '#ffffff', w: 512, h: 64, weight: '700' })
    const [nx, nz] = W(0, 0.76)
    this.signQuads.push({ x: nx, y: y + 2.5, z: nz, ry, w: 4.2, h: 0.46, rect, lit: 0.6 })
    this.P.box(bx, y + 1.3, bz, 2.3, 1.2, 0.1, { rotY: ry })
  }

  // ---- blue street plates at intersections --------------------------------
  streetPlates() {
    for (const h of H_ROADS) for (const v of V_ROADS) {
      if (h.ring && v.ring) continue
      const x = v.x + v.w / 2 + 2.2, z = h.z + h.w / 2 + 2.2
      if (this.w.keepClear(x, z)) continue
      const g = this.B.vcol(x, z, 'static')
      g.cyl(0.05, 0.05, 3.1, 6, { x, y: CURB_H, z, color: 0x2c3036 })
      const rh = this.signs.street(h.name)
      const rv = this.signs.street(v.name)
      this.signQuads.push({ x, y: CURB_H + 2.85, z: z + 0.04, ry: 0, w: 2.1, h: 0.36, rect: rh, double: true })
      this.signQuads.push({ x: x + 0.04, y: CURB_H + 2.42, z, ry: Math.PI / 2, w: 2.1, h: 0.36, rect: rv, double: true })
    }
  }

  // ---- kiosks (presa, flori, covrigi…) on sidewalks near corners ------------
  kiosks() {
    const kinds = [
      ['PRESA', '#c0392b'], ['FLORI', '#8e44ad'], ['COVRIGI', '#d68910'], ['LOTO', '#1f7a4a'], ['CAFEA', '#6e4b2a'],
      ['ȘAURMA', '#b8471f'], ['SCHIMB VALUTAR', '#1f4f9c'], ['PLĂCINTE', '#a0522d'], ['CVAS', '#c9a227'], ['SEMINȚE', '#556b2f'],
    ]
    const rnd = mulberry(314)
    let i = 0
    for (const b of BLOCKS) {
      if (!['istoric', 'soviet', 'linella', 'acasa', 'piata', 'autogara', 'gara', 'muzeu', 'teatru', 'usm'].includes(b.zone)) continue
      const corners = [[b.x0 + 3.5, b.z0 + 2.4], [b.x1 - 3.5, b.z1 - 2.4]]
      for (const [x, z] of corners) {
        if (rnd() < 0.35 || this.w.keepClear(x, z)) continue
        const k = kinds[i++ % kinds.length]
        this.kiosk(x, z, z < b.cz ? Math.PI : 0, k[0], k[1])
      }
    }
  }

  kiosk(x, z, ry, label, color) {
    const g = this.B.vcol(x, z, 'static')
    const y = CURB_H
    g.box(2.4, 2.4, 1.8, { x, y, z, ry, color: 0xd9d4c8 })
    g.box(2.6, 0.18, 2.1, { x, y: y + 2.4, z, ry, color: 0x3a3f46 })
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)]
    const [wx, wz] = W(0, 0.91)
    g.box(1.8, 1.0, 0.04, { x: wx, y: y + 1.0, z: wz, ry, color: 0x9ec0d0, emit: 0.6 })
    const rect = this.signs.sign(label, { bg: color, fg: '#ffffff', w: 384, h: 96 })
    const [sx, sz] = W(0, 0.93)
    this.signQuads.push({ x: sx, y: y + 2.1, z: sz, ry, w: 2.3, h: 0.5, rect, lit: 1 })
    this.P.box(x, y + 1.2, z, 1.2, 1.2, 0.9, { rotY: ry })
    this.w.kiosks.push({ x, z, ry, label })
    this.w.clearZones.push({ x, z, r: 2.2 })
  }

  // ---- brand signs above KayKit shop awnings -------------------------------
  shopSigns() {
    const brands = [
      ['LINELLA', '#009640', '#fff'], ["ANDY'S PIZZA", '#111111', '#ffd200'], ['LA PLĂCINTE', '#21336a', '#ebc372'],
      ['FARMACIE', '#1a8f4a', '#fff'], ['NR. 1', '#e0322b', '#fff'], ['FRANZELUȚA', '#c3812d', '#fff'],
      ['TUCANO COFFEE', '#f9b200', '#1b1b1b'], ['GUSTOK', '#6d3b1f', '#ffe8c0'], ['DAVIDAN', '#8a4f2a', '#fff4dc'],
      ['LOMBARD', '#5b2d86', '#ffd24a'], ['MODA DE MILANO', '#111111', '#d4af37'], ['FLORĂRIE', '#b0306a', '#fff'],
      ['BAR „LA COLȚ"', '#3a2a1a', '#ffcf4a'], ['MOBILE & SIM', '#e05a00', '#fff'], ['SECOND HAND', '#2a5a2a', '#fff'],
      ['CAFENEA', '#4a2f1f', '#f0d9b0'], ['BERE LA HALBĂ', '#b8860b', '#1b1b1b'], ['OPTICA', '#1f6f8f', '#fff'],
    ]
    const rnd = mulberry(777)
    let i = 0
    for (const s of this.w.signSlots) {
      if (rnd() < 0.45) continue
      const [label, bg, fg] = brands[i++ % brands.length]
      const rect = this.signs.sign(label, { bg, fg, w: 512, h: 96 })
      this.signQuads.push({ x: s.x, y: s.y ?? CURB_H + 3.35 * s.sy, z: s.z, ry: s.ry, w: Math.min(6.4, 5.6 * s.sx), h: 0.95, rect, lit: 1 })
      this.w.shops.push({ x: s.fx, z: s.fz, label, ry: s.ry })
    }
  }

  // one mesh for every sign quad in the city (single draw call, glows at night)
  buildSigns() {
    const pos = [], uv = [], nor = [], lit = []
    for (const q of this.signQuads) {
      const c = Math.cos(q.ry), s = Math.sin(q.ry)
      const faces = q.double ? [1, -1] : [1]
      for (const f of faces) {
        const hw = q.w / 2, hh = q.h / 2
        // local quad in XY plane, facing +z (or -z for the back)
        const P = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, -hh], [hw, hh], [-hw, hh]]
        const order = f > 0 ? [0, 1, 2, 3, 4, 5] : [1, 0, 5, 1, 5, 4]
        for (const k of order) {
          let [lx, ly] = P[k]
          const lz = f * 0.04
          const x = q.x + lx * c + lz * s, z = q.z - lx * s + lz * c
          pos.push(x, q.y + ly, z)
          nor.push(s * f, 0, c * f)
          const u = f > 0 ? (lx + hw) / q.w : 1 - (lx + hw) / q.w
          uv.push(q.rect.u0 + (q.rect.u1 - q.rect.u0) * u, q.rect.v0 + (q.rect.v1 - q.rect.v0) * ((ly + hh) / q.h))
          lit.push(q.lit ?? 0.4)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('emit', new THREE.Float32BufferAttribute(lit, 1))
    g.computeBoundingSphere()
    const m = new THREE.MeshStandardMaterial({ map: this.signs.texture, roughness: 0.6, metalness: 0.0, emissive: 0xffffff, emissiveMap: this.signs.texture, emissiveIntensity: 1 })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = SHARED.uNight
      sh.vertexShader = 'attribute float emit;\nvarying float vEmit;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvEmit = emit;')
      sh.fragmentShader = 'uniform float uNight;\nvarying float vEmit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance *= vEmit * (0.08 + uNight * 0.9);`)
    }
    m.customProgramCacheKey = () => 'signs-v1'
    const mesh = new THREE.Mesh(g, m)
    mesh.receiveShadow = true
    this.w.scene.add(mesh)
    this.w.signMesh = mesh
  }

  // ---- ground light pools under street lamps (additive, night only) -------
  lightPools() {
    const tex = makeGlow('rgba(255,178,96,1)', 'rgba(255,150,70,0)')
    const pos = [], uv = []
    for (const l of this.w.lamps) {
      const r = 5.5, y = CURB_H + 0.03
      const P = [[-r, -r], [-r, r], [r, r], [-r, -r], [r, r], [r, -r]]
      const T = [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]
      for (let k = 0; k < 6; k++) { pos.push(l.x + P[k][0], y, l.z + P[k][1]); uv.push(T[k][0], T[k][1]) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffb070, fog: true })
    m.polygonOffset = true; m.polygonOffsetFactor = -4
    // near lamps get real point lights (NightLights); the painted pools only fill in the distance
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying float vPoolDist;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vPoolDist = -mvPosition.z;')
      sh.fragmentShader = 'varying float vPoolDist;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a *= smoothstep(36.0, 58.0, vPoolDist);')
    }
    m.customProgramCacheKey = () => 'pools-v2'
    const mesh = new THREE.Mesh(g, m)
    mesh.renderOrder = 2
    mesh.frustumCulled = false
    this.w.scene.add(mesh)
    this.w.poolMesh = mesh
  }
}
