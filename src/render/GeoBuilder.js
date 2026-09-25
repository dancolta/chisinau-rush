import * as THREE from 'three'

// Accumulates many primitive parts into ONE vertex-coloured BufferGeometry.
// Every procedural thing in the game (landmarks, panel blocks, characters, cars)
// is built with this so it renders in a single draw call per object/batch.

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _c = new THREE.Color()
const _nm = new THREE.Matrix3()

const GEO_CACHE = new Map()
function cached(key, make) {
  let g = GEO_CACHE.get(key)
  if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); GEO_CACHE.set(key, g) }
  return g
}

export function hex(c) { return _c.set(c).getHex() }

export class GeoBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.emit = []; this.uv = []
    this.groundAO = 0 // darken vertices near y=0 (fake contact occlusion)
    this.aoHeight = 2.5
  }

  get count() { return this.pos.length / 3 }

  // add a geometry transformed by (x,y,z, rotation, scale) with a flat colour
  // bendTo/bend: pull normals toward "away from this point" (soft, volumetric foliage lighting)
  add(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, emit = 0, matrix = null, shade = null, bendTo = null, bend = 0 } = {}) {
    if (matrix) _m.copy(matrix)
    else {
      _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'))
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
    }
    _nm.getNormalMatrix(_m)
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv
    const base = _c.set(color)
    const br = base.r, bg = base.g, bb = base.b
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(_m)
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize()
      if (bendTo) {
        const bx = _p.x - bendTo.x, by = _p.y - bendTo.y, bz = _p.z - bendTo.z, bl = Math.hypot(bx, by, bz) || 1
        _n.set(_n.x + (bx / bl - _n.x) * bend, _n.y + (by / bl - _n.y) * bend, _n.z + (bz / bl - _n.z) * bend).normalize()
      }
      this.pos.push(_p.x, _p.y, _p.z)
      this.nor.push(_n.x, _n.y, _n.z)
      let k = 1
      if (this.groundAO > 0) k *= 1 - this.groundAO * (1 - Math.min(1, Math.max(0, _p.y / this.aoHeight)))
      if (shade) k *= shade(_p, _n)
      this.col.push(br * k, bg * k, bb * k)
      this.emit.push(emit)
      if (UV) this.uv.push(UV.getX(i), UV.getY(i)); else this.uv.push(0, 0)
    }
    return this
  }

  box(w, h, d, o = {}) {
    const g = cached('box', () => new THREE.BoxGeometry(1, 1, 1))
    // origin at the box bottom-centre unless o.center
    const y = (o.y || 0) + (o.center ? 0 : h / 2)
    return this.add(g, { ...o, y, sx: w, sy: h, sz: d })
  }

  cyl(rTop, rBot, h, seg = 12, o = {}) {
    const g = cached(`cyl:${rTop}:${rBot}:${seg}:${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, !!o.open))
    const y = (o.y || 0) + (o.center ? 0 : h / 2)
    return this.add(g, { ...o, y, sy: h })
  }

  sphere(r, ws = 14, hs = 10, o = {}) {
    const g = cached(`sph:${ws}:${hs}:${o.phiLen || 0}:${o.thetaLen || 0}`, () => new THREE.SphereGeometry(1, ws, hs, 0, o.phiLen || Math.PI * 2, 0, o.thetaLen || Math.PI))
    return this.add(g, { ...o, sx: r * (o.sx || 1), sy: r * (o.sy || 1), sz: r * (o.sz || 1) })
  }

  // half-sphere dome sitting on y
  dome(r, o = {}) { return this.sphere(r, o.seg || 16, 8, { ...o, thetaLen: Math.PI / 2 }) }

  cone(r, h, seg = 12, o = {}) {
    const g = cached(`cone:${seg}`, () => new THREE.ConeGeometry(1, 1, seg))
    const y = (o.y || 0) + (o.center ? 0 : h / 2)
    return this.add(g, { ...o, y, sx: r, sy: h, sz: r })
  }

  // triangular prism (gable roof / pediment). Width along X, depth along Z, apex up.
  prism(w, h, d, o = {}) {
    const g = cached('prism', () => {
      const s = new THREE.Shape()
      s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0)
      const e = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
      e.translate(0, 0, -0.5)
      return e
    })
    return this.add(g, { ...o, sx: w, sy: h, sz: d })
  }

  // partial torus (arch mouldings, wheel arches); lies in the XY plane
  torusArc(r, tube, arc = Math.PI, o = {}) {
    const ratio = +(tube / r).toFixed(3)
    const g = cached(`tor:${arc}:${ratio}`, () => new THREE.TorusGeometry(1, ratio, 6, 18, arc))
    return this.add(g, { ...o, sx: r, sy: r, sz: r })
  }

  // extruded 2D polygon (points [[x,z]...]) from y0 to y0+h
  extrude(points, h, o = {}) {
    const key = 'ex:' + points.map((p) => p.join(',')).join(';') + ':' + h
    const g = cached(key, () => {
      const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
      const e = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false })
      e.rotateX(-Math.PI / 2)
      return e
    })
    return this.add(g, o)
  }

  // flat quad on XZ plane (for decals/ground patches) centred at x,z at height y
  quad(w, d, o = {}) {
    const g = cached('quad', () => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p })
    return this.add(g, { ...o, sx: w, sz: d })
  }

  merge(other) {
    this.pos.push(...other.pos); this.nor.push(...other.nor); this.col.push(...other.col)
    this.emit.push(...other.emit); this.uv.push(...other.uv)
    return this
  }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('emit', new THREE.Float32BufferAttribute(this.emit, 1))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

// merge several built geometries that share the same attribute layout
export function mergeBuilt(geos) {
  const b = new GeoBuilder()
  for (const g of geos) {
    const n = g.attributes.position.count
    for (let i = 0; i < n; i++) {
      b.pos.push(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i))
      b.nor.push(g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i))
      b.col.push(g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i))
      b.emit.push(g.attributes.emit ? g.attributes.emit.getX(i) : 0)
      b.uv.push(g.attributes.uv ? g.attributes.uv.getX(i) : 0, g.attributes.uv ? g.attributes.uv.getY(i) : 0)
    }
  }
  return b.build()
}
