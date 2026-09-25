import * as THREE from 'three'
import { SHARED } from '../render/Materials.js'
import { FILTER } from '../physics/Physics.js'

// Real grass tufts on the lawns around the player: short solid blades (no alpha test, so no
// shimmer) that sway in the wind and lean away from whoever walks through them. They sit on a
// fixed world grid, so moving only adds and drops tufts at the edge, where the shader shrinks
// them smoothly to nothing. Only where the top-most ground surface is grass.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0)
const _c = new THREE.Color()
const MAX = 14000

function tuftGeometry() {
  const pos = [], col = [], nor = []
  const base = new THREE.Color(0x2f5522), mid = new THREE.Color(0x4f7a36), tip = new THREE.Color(0x93b45a)
  const blades = 10
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.9
    const r = 0.02 + ((i * 5) % 4) * 0.03
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const h = 0.13 + (((i * 37) % 11) / 10) * 0.19
    const w = 0.022 + (i % 2) * 0.01
    const lean = 0.05 + (i % 3) * 0.035
    const tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean
    // a bent blade: two quads' worth of taper in 3 triangles, sideways to its lean
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w
    const mx = x + (tx - x) * 0.4, mz = z + (tz - z) * 0.4, my = h * 0.55
    pos.push(x - px, 0, z - pz, x + px, 0, z + pz, mx + px * 0.7, my, mz + pz * 0.7)
    pos.push(x - px, 0, z - pz, mx + px * 0.7, my, mz + pz * 0.7, mx - px * 0.7, my, mz - pz * 0.7)
    pos.push(mx - px * 0.7, my, mz - pz * 0.7, mx + px * 0.7, my, mz + pz * 0.7, tx, h, tz)
    for (const c of [base, base, mid, base, mid, mid, mid, mid, tip]) col.push(c.r, c.g, c.b)
    for (let k = 0; k < 9; k++) nor.push(0, 1, 0) // lit like the lawn under it
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
  return g
}

export class GrassField {
  constructor(game) {
    this.game = game
    const w = game.world
    // spatial index over ground records, building footprints and fountains
    this.cell = 16
    this.grid = new Map()
    const add = (x0, z0, x1, z1, item) => {
      for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
        for (let j = Math.floor(z0 / this.cell); j <= Math.floor(z1 / this.cell); j++) {
          const k = i + ',' + j
          let l = this.grid.get(k); if (!l) this.grid.set(k, l = [])
          l.push(item)
        }
    }
    for (const r of w.batches.surfaces) {
      if (r.k === 0) add(r.x0, r.z0, r.x1, r.z1, r)
      else if (r.k === 1) add(r.cx - r.r, r.cz - r.r, r.cx + r.r, r.cz + r.r, r)
      else { const e = Math.hypot(r.w, r.d) / 2; add(r.cx - e, r.cz - e, r.cx + e, r.cz + e, r) }
    }
    for (const f of w.footprints) { const e = Math.hypot(f.hx, f.hz) + 0.5; add(f.x - e, f.z - e, f.x + e, f.z + e, { k: 3, f }) }
    for (const f of w.fountains || []) { const e = f.r + 1.5; add(f.x - e, f.z - e, f.x + e, f.z + e, { k: 4, f }) }
    // the grid of candidate cells only changes with the quality preset, so cache the lookups
    this.lawn = new Map()

    this.uCenter = { value: new THREE.Vector3() }
    this.uRadius = { value: 20 }
    this.uPush = { value: new THREE.Vector4(0, -100, 0, 0) }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide })
    mat.envMapIntensity = 0.35
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = SHARED.uTime
      sh.uniforms.uCenter = this.uCenter
      sh.uniforms.uRadius = this.uRadius
      sh.uniforms.uPush = this.uPush
      sh.vertexShader = 'uniform float uTime; uniform vec3 uCenter; uniform float uRadius; uniform vec4 uPush;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 ip = instanceMatrix[3].xyz;
    mat3 im = mat3(instanceMatrix);
    // shrink to nothing toward the edge of the field, so nothing pops as you move
    transformed *= 1.0 - smoothstep(uRadius - 7.0, uRadius, length(ip.xz - uCenter.xz));
    float hw = transformed.y * length(im[1]); // height above the lawn, in metres
    float sway = sin(uTime * 1.6 + ip.x * 0.55 + ip.z * 0.4) * 0.55 + sin(uTime * 3.3 + ip.x * 1.9 - ip.z * 0.7) * 0.2;
    vec3 wo = vec3(sway * 0.16, 0.0, sway * 0.09) * hw;
    // lean away from the player's feet / wheels
    vec2 away = ip.xz - uPush.xz;
    float pd = length(away);
    float push = (1.0 - smoothstep(uPush.w * 0.3, uPush.w, pd)) * step(abs(ip.y - uPush.y), 1.5);
    wo.xz += away / max(pd, 0.001) * push * hw * 0.45;
    wo.y -= push * hw * 0.35;
    // world offset -> instance space (columns are orthogonal: yaw + scale only)
    transformed += vec3(dot(im[0], wo) / dot(im[0], im[0]), dot(im[1], wo) / dot(im[1], im[1]), dot(im[2], wo) / dot(im[2], im[2]));
  }`)
      // both sides of a blade are lit like the lawn (no back-face normal flip)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
    }
    mat.customProgramCacheKey = () => 'grass-tufts-v1'
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, MAX)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1))
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.castShadow = false
    this.mesh.count = 0
    this.mesh.name = 'grass-tufts'
    game.scene.add(this.mesh)
    this.cx = Infinity; this.cz = Infinity
    this.cfg = ''
  }

  // top-most ground surface at (x, z) if it is grass and nothing stands on it: its height, else -1
  lawnAt(x, z) {
    const l = this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell))
    if (!l) return -1
    let top = null, ty = -1
    for (const r of l) {
      let inside = false
      if (r.k === 0) inside = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
      else if (r.k === 1) inside = (x - r.cx) ** 2 + (z - r.cz) ** 2 <= r.r * r.r
      else if (r.k === 2) {
        const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.ang), s = Math.sin(r.ang)
        inside = Math.abs(dx * c - dz * s) <= r.w / 2 && Math.abs(dx * s + dz * c) <= r.d / 2
      } else if (r.k === 3) {
        const f = r.f, dx = x - f.x, dz = z - f.z, c = Math.cos(f.ry || 0), s = Math.sin(f.ry || 0)
        if (Math.abs(dx * c - dz * s) <= f.hx + 0.4 && Math.abs(dx * s + dz * c) <= f.hz + 0.4) return -1
        continue
      } else {
        if ((x - r.f.x) ** 2 + (z - r.f.z) ** 2 < (r.f.r + 1.2) ** 2) return -1
        continue
      }
      if (inside && r.y >= ty) { ty = r.y; top = r }
    }
    if (!top || !top.s.startsWith('grass')) return -1
    // something solid sits on the lawn here (a platform, steps, a plinth, a tree trunk)
    const hit = this.game.physics.raycast(x, top.y + 6, z, 0, -1, 0, 7, FILTER.Q_WORLD)
    if (hit && hit.point.y > top.y + 0.06) return -1
    return top.y
  }

  settings() {
    const q = this.game.renderer.q
    // radius, spacing per preset; low turns the tufts off
    return q === undefined ? [22, 0.5] : !q.shadows ? [0, 1] : q.shadowMap >= 4096 ? [30, 0.42] : q.ao ? [24, 0.46] : [17, 0.55]
  }

  update() {
    const g = this.game
    const f = g.focus ? g.focus() : null
    if (!f) return
    const [R, sp] = this.settings()
    const cfg = R + ':' + sp
    this.uCenter.value.set(f.x, f.y, f.z)
    this.uRadius.value = R
    const p = g.player
    if (p && !p.vehicle) this.uPush.value.set(p.pos.x, p.pos.y, p.pos.z, 0.9)
    else if (p?.vehicle) this.uPush.value.set(p.vehicle.pos.x, p.vehicle.pos.y - 0.5, p.vehicle.pos.z, 2.4)
    if (cfg !== this.cfg) { this.cfg = cfg; this.lawn.clear(); this.cx = Infinity }
    this.mesh.visible = R > 0
    if (R <= 0) return
    if (Math.hypot(f.x - this.cx, f.z - this.cz) < 3) return
    this.layout(f.x, f.z, R, sp)
  }

  layout(cx, cz, R, sp) {
    this.cx = cx; this.cz = cz
    const L = R + 3.5, m = this.mesh
    const i0 = Math.floor((cx - L) / sp), i1 = Math.ceil((cx + L) / sp)
    const j0 = Math.floor((cz - L) / sp), j1 = Math.ceil((cz + L) / sp)
    let n = 0
    for (let i = i0; i <= i1 && n < MAX; i++) for (let j = j0; j <= j1 && n < MAX; j++) {
      // stable per-cell jitter/rotation/size from an integer hash
      let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663)
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15
      const r1 = ((h >>> 0) % 1000) / 1000, r2 = ((h >>> 10) % 1000) / 1000, r3 = ((h >>> 20) % 1000) / 1000
      const x = (i + 0.1 + r1 * 0.8) * sp, z = (j + 0.1 + r2 * 0.8) * sp
      if ((x - cx) ** 2 + (z - cz) ** 2 > L * L) continue
      const key = i * 131071 + j
      let y = this.lawn.get(key)
      if (y === undefined) { y = this.lawnAt(x, z); this.lawn.set(key, y) }
      if (y < 0) continue
      // thinner at the edge of a lawn so it doesn't end in a hard line of tufts
      const sc = 0.7 + r3 * 0.65
      _q.setFromAxisAngle(_up, r1 * 6.283 + r2 * 3.1)
      _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc * (0.75 + r2 * 0.6), sc))
      m.setMatrixAt(n, _m)
      const v = 0.82 + r3 * 0.3, dry = r1 > 0.86 ? 1.12 : 1
      m.setColorAt(n, _c.setRGB(v * dry, v * (0.98 + r2 * 0.05), v * (dry > 1 ? 0.8 : 0.93)))
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    // the lookup cache only needs what's near; drop it when it grows large
    if (this.lawn.size > 120000) this.lawn.clear()
  }
}
