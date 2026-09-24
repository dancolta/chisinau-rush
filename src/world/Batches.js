import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { mergeSimple } from '../core/Assets.js'
import { FacadeBuilder } from './Facade.js'

export const CHUNK = 100
export const chunkKey = (x, z) => `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`

// Flat textured surfaces with world-space UVs (ground, sidewalks, plazas).
export class FlatBuilder {
  constructor(uvScale = 1) {
    this.pos = []; this.nor = []; this.uv = []
    this.s = uvScale
  }
  // horizontal quad [x0..x1]x[z0..z1] at height y
  rect(x0, z0, x1, z1, y = 0) {
    const s = this.s
    const P = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]
    for (const [x, z] of P) { this.pos.push(x, y, z); this.nor.push(0, 1, 0); this.uv.push(x / s, -z / s) }
    return this
  }
  // rotated rectangle (centre, size, angle) on the ground
  orect(cx, cz, w, d, ang, y = 0) {
    const c = Math.cos(ang), sn = Math.sin(ang), s = this.s
    const pts = [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2], [w / 2, d / 2], [w / 2, -d / 2]]
    for (const [lx, lz] of pts) {
      const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c
      this.pos.push(x, y, z); this.nor.push(0, 1, 0); this.uv.push(x / s, -z / s)
    }
    return this
  }
  // disc (for roundabouts / fountain surrounds)
  disc(cx, cz, r, y = 0, seg = 32) {
    const s = this.s
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2
      const p = [[cx, cz], [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r]]
      for (const [x, z] of p) { this.pos.push(x, y, z); this.nor.push(0, 1, 0); this.uv.push(x / s, -z / s) }
    }
    return this
  }
  // vertical wall strip from (x0,z0) to (x1,z1), y0..y1, facing outward (normal given)
  wall(x0, z0, x1, z1, y0, y1, nx, nz) {
    const s = this.s, L = Math.hypot(x1 - x0, z1 - z0)
    const P = [[x0, y0, z0, 0, y0], [x1, y0, z1, L, y0], [x1, y1, z1, L, y1], [x0, y0, z0, 0, y0], [x1, y1, z1, L, y1], [x0, y1, z0, 0, y1]]
    // choose winding so the face points along (nx,nz)
    const ex = x1 - x0, ez = z1 - z0
    // natural winding of (p0b, p1b, p1t) faces (-ez, 0, ex); flip if the requested normal disagrees
    const cross = ex * nz - ez * nx
    const order = cross > 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4]
    for (const i of order) { const p = P[i]; this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, 0, nz); this.uv.push(p[3] / s, p[4] / s) }
    return this
  }
  get empty() { return this.pos.length === 0 }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
}

// Collects geometry per (chunk, material kind) and turns it into meshes.
export class Batches {
  constructor() {
    this.vcols = new Map()   // key -> { builder, opts }
    this.atlases = new Map() // key -> { items: [{geometry, matrix}], opts }
    this.flats = new Map()   // key -> { builder, surface }
    this.facades = new Map() // key -> FacadeBuilder
  }

  facade(x, z) {
    const k = chunkKey(x, z)
    let f = this.facades.get(k)
    if (!f) { f = new FacadeBuilder(); this.facades.set(k, f) }
    return f
  }

  vcol(x, z, kind = 'static') {
    const k = `${kind}|${chunkKey(x, z)}`
    let e = this.vcols.get(k)
    if (!e) { e = { builder: new GeoBuilder(), kind }; this.vcols.set(k, e) }
    return e.builder
  }

  atlas(x, z, geometry, matrix, kind = 'props') {
    const k = `${kind}|${chunkKey(x, z)}`
    let e = this.atlases.get(k)
    if (!e) { e = { items: [], kind }; this.atlases.set(k, e) }
    e.items.push({ geometry, matrix })
  }

  flat(x, z, surface, uvScale) {
    const k = `${surface}|${chunkKey(x, z)}`
    let e = this.flats.get(k)
    if (!e) { e = { builder: new FlatBuilder(uvScale), surface }; this.flats.set(k, e) }
    return e.builder
  }

  // materials: { vcol: {kind: mat}, atlas: {kind: mat}, flat: {surface: mat} }
  finalize(scene, mats, shadowCfg = {}) {
    const meshes = []
    const add = (geo, mat, cast, recv, name) => {
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = cast; m.receiveShadow = recv; m.name = name
      m.matrixAutoUpdate = false; m.updateMatrix()
      scene.add(m); meshes.push(m)
    }
    for (const [k, e] of this.vcols) {
      if (!e.builder.count) continue
      const cfg = shadowCfg[e.kind] || { cast: true, recv: true }
      add(e.builder.build(), mats.vcol[e.kind] || mats.vcol.static, cfg.cast, cfg.recv, 'vcol:' + k)
    }
    for (const [k, e] of this.atlases) {
      const geos = e.items.map(({ geometry, matrix }) => geometry.clone().applyMatrix4(matrix))
      const g = mergeSimple(geos); g.computeBoundingSphere(); g.computeBoundingBox()
      const cfg = shadowCfg[e.kind] || { cast: true, recv: true }
      add(g, mats.atlas[e.kind] || mats.atlas.props, cfg.cast, cfg.recv, 'atlas:' + k)
    }
    for (const [k, f] of this.facades) {
      if (!f.count) continue
      add(f.build(), mats.facade, true, true, 'facade:' + k)
    }
    for (const [k, e] of this.flats) {
      if (e.builder.empty) continue
      add(e.builder.build(), mats.flat[e.surface], false, true, 'flat:' + k)
    }
    this.vcols.clear(); this.atlases.clear(); this.flats.clear(); this.facades.clear()
    return meshes
  }
}
