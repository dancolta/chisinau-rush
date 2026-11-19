import * as THREE from 'three'
import { VEHICLES, TRAFFIC_MIX } from '../data/vehicles.js'
import { CELL, mergeTransformed } from '../core/Assets.js'
import { QUALITY } from '../render/Renderer.js'
import { SHARED } from '../render/Materials.js'
import { BOUNDS } from './CityLayout.js'
import { HIGHWAY_END, highwayLevel, terrainHeight } from './Terrain.js'
import { mulberry } from './rng.js'

// Traffic you can see and never reach: the Centura on its embankment past the east wall, and the
// two roads out beyond the closed checkpoints. No physics and no AI: each vehicle keeps its lane and
// follows the one ahead (the intelligent driver model), every model is one instanced draw, and the
// lights after dark are one draw of glowing points.

const { x0: X0, x1: X1 } = BOUNDS

// vehicles on the whole ring highway, and on each road out, per quality preset
export const CENTURA_COUNTS = {
  low: { highway: 44, road: 4 },
  medium: { highway: 72, road: 6 },
  high: { highway: 100, road: 8 },
  ultra: { highway: 128, road: 10 },
}
const MAX = Math.max(...Object.values(CENTURA_COUNTS).map((c) => c.highway + 2 * c.road))

// the deck's lanes, as Edge.highway() paints them (offsets from the wall): southbound (+z) on the
// city side of the median, northbound beyond it; the outer lane of each is the slow one
export const LANES = [
  { x0: 1.5, x1: 7.25, dir: 1, slow: true },
  { x0: 7.25, x1: 13, dir: 1, slow: false },
  { x0: 16, x1: 21.75, dir: -1, slow: false },
  { x0: 21.75, x1: 27.5, dir: -1, slow: true },
]

// the deck's surface: Edge lays the asphalt in 50 m pieces between highwayLevel's values
export function deckY(z) {
  const a = -HIGHWAY_END + Math.floor((z + HIGHWAY_END) / 50) * 50, t = (z - a) / 50
  return highwayLevel(14, a) * (1 - t) + highwayLevel(14, Math.min(HIGHWAY_END, a + 50)) * t + 0.01
}

// a road out, as Edge.roadOut() lays it: flat to 60 m, then 30 m pieces over the land
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function roadY(side, u, z) {
  if (u < 60) return 0.02
  const X = side < 0 ? X0 : X1, reg = side < 0 ? 'w' : 'e'
  const d0 = 60 + Math.floor((u - 60) / 30) * 30, t = (u - d0) / 30
  const h = (d) => terrainHeight(X + side * d, z, reg) + 0.04
  return h(d0) * (1 - t) + h(d0 + 30) * t
}
// keep right: the boulevard's second lane by the checkpoint, the one lane each way further out
const laneOff = (u) => 3.6 + 2.15 * (1 - smooth(60, 90, u))
export const ROAD = { turn: 46, far: 1450 }

// car following (IDM): comfortable acceleration and braking, standstill gap, time headway
const IDM = { b: 2.2, s0: 4, T: 1.25 }
const HEAD = [3.2, 3.0, 2.6], TAIL = [2.4, 0.12, 0.07], AMBER = [2.2, 1.0, 0.2]

const _m = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _sph = new THREE.Sphere()
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _cam = new THREE.Vector3(), _v2 = new THREE.Vector2()

export class HighwayTraffic {
  constructor(world) {
    this.world = world
    this.game = world.game
    this.group = new THREE.Group()
    this.group.name = 'centura-traffic'
    world.scene.add(this.group)
    this.buildModels()
    this.buildLights()
    this.hw = LANES.map((l) => ({
      x: X1 + (l.x0 + l.x1) / 2, half: (l.x1 - l.x0) / 2, dir: l.dir, slow: l.slow, len: 2 * HIGHWAY_END, cars: [],
      at(s, o) { const z = this.dir > 0 ? -HIGHWAY_END + s : HIGHWAY_END - s; return o.set(this.x, deckY(z), z) },
      cap: () => Infinity,
    }))
    this.roads = [-1, 1].map((side) => {
      const R = laneOff(ROAD.turn), A = ROAD.far - ROAD.turn, arc = Math.PI * R
      return {
        side, road: true, R, A, arc, len: 2 * A + arc, cars: [],
        // in toward the checkpoint, a U-turn short of it (the city is closed), and back out
        at(s, o) {
          let u, zp
          if (s < A) { u = ROAD.far - s; zp = -laneOff(u) }
          else if (s < A + arc) { const th = (s - A) / R; u = ROAD.turn - R * Math.sin(th); zp = -R * Math.cos(th) }
          else { u = ROAD.turn + (s - A - arc); zp = laneOff(u) }
          const z = side * zp
          return o.set((side < 0 ? X0 : X1) + side * u, roadY(side, u, z), z)
        },
        // slow for the turn and pick up speed after it
        cap(s) {
          if (s < A) return Math.sqrt(10 + 3.2 * (A - s))
          if (s < A + arc) return Math.sqrt(10)
          return Math.sqrt(10 + 3 * (s - A - arc))
        },
      }
    })
    this.lanes = [...this.hw, ...this.roads]
    this.cars = []
    this.preset = null
    this.night = 0
  }

  // every ordinary road vehicle that has a model: police, trolleybuses and the like stay in town
  buildModels() {
    const A = this.world.assets, M = this.world.materials
    this.models = new Map()
    this.variants = []
    const mats = new Map()
    const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)
    for (const [id, d] of Object.entries(VEHICLES)) {
      if (!d.kay || d.police || d.trolley || d.special) continue
      const k = A.kay[d.kay]
      if (!k?.geometry) continue
      const from = CELL[d.body]
      const key = d.kay + ':' + (d.body || '')
      let m = this.models.get(key)
      if (!m) {
        // body and wheels in one geometry, wheels on the ground, centred on the footprint
        const off = 0.336
        const geo = mergeTransformed([{ geometry: k.geometry, matrix: T(0, off, 0) }, ...k.wheels.map((w) => ({ geometry: w.geometry, matrix: T(w.pivot.x, w.pivot.y + off, w.pivot.z) }))])
        const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3())
        geo.translate(-c.x, -bb.min.y, -c.z)
        geo.computeBoundingBox(); geo.computeBoundingSphere()
        const size = geo.boundingBox.getSize(new THREE.Vector3())
        // which vertices are body paint: per instance, they read their colour from another cell
        const uv = geo.attributes.uv, body = new Float32Array(uv.count)
        if (from) for (let i = 0; i < uv.count; i++) body[i] = Math.floor(uv.getX(i) * 8) === from[0] && Math.floor(uv.getY(i) * 4) === from[1] ? 1 : 0
        geo.setAttribute('aBody', new THREE.BufferAttribute(body, 1))
        const shift = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2)
        shift.setUsage(THREE.DynamicDrawUsage)
        geo.setAttribute('aShift', shift)
        const tex = k.texture || A.textures.atlas
        if (!mats.has(tex)) mats.set(tex, this.material(M, tex, mats.size))
        const mesh = new THREE.InstancedMesh(geo, mats.get(tex), MAX)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.count = 0
        mesh.name = 'centura:' + d.kay
        mesh.matrixAutoUpdate = false
        mesh.castShadow = false; mesh.receiveShadow = false
        mesh.boundingSphere = new THREE.Sphere()
        this.group.add(mesh)
        const hw = size.x / 2, hl = size.z / 2, h = size.y
        const heavy = hl > 2.9 || h > 2.3
        // [x, y, z, kind]: 0 headlight, 1 taillight, 2 amber marker on a tall roof
        const lights = []
        for (const s of [-1, 1]) {
          lights.push([s * 0.63 * hw, Math.min(0.45 * h, 1.05), hl - 0.05, 0], [s * 0.72 * hw, Math.min(0.47 * h, 1.1), -hl + 0.05, 1])
          if (h > 2.4) lights.push([s * 0.85 * hw, h - 0.08, hl - 0.4, 2])
        }
        m = { key, mesh, shift, hw, hl, h, heavy, lights, tris: geo.attributes.position.count / 3, n: 0, lo: [0, 0, 0], hi: [0, 0, 0] }
        this.models.set(key, m)
      }
      const shifts = (d.colors || []).filter((c) => from && CELL[c]).map((c) => [(CELL[c][0] - from[0]) / 8, (CELL[c][1] - from[1]) / 4])
      this.variants.push({ id, model: m, shifts: shifts.length ? shifts : [[0, 0]], weight: Math.max(1, TRAFFIC_MIX.filter((t) => t === id).length) })
    }
  }

  // the atlas material, with the body cell moved per instance (the same remap as Assets.recolor)
  material(M, tex, i) {
    const mat = M.atlas(tex, { key: 'centura' + i })
    const base = mat.onBeforeCompile, cache = mat.customProgramCacheKey
    mat.onBeforeCompile = (shader, r) => {
      base.call(mat, shader, r)
      shader.vertexShader = 'attribute float aBody;\nattribute vec2 aShift;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv += aBody * (mapTransform * vec3(aShift, 0.0)).xy;')
    }
    mat.customProgramCacheKey = () => cache.call(mat) + ':centura'
    return mat
  }

  // head and tail lights: soft points, brightest seen head-on, faded by the haze more gently than
  // the cars are (lights carry further than shapes)
  buildLights() {
    const n = MAX * 6, geo = new THREE.BufferGeometry()
    for (const [name, size] of [['position', 3], ['aCol', 3], ['aDir', 3]]) {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size)
      a.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute(name, a)
    }
    geo.setDrawRange(0, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uNight: { value: 0 }, uFogNear: { value: 140 }, uFogFar: { value: 900 } },
      vertexShader: `
        attribute vec3 aCol;
        attribute vec3 aDir;
        uniform float uScale, uNight, uFogNear, uFogFar;
        varying vec3 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 1.0);
          float face = mix(0.22, 1.0, smoothstep(-0.3, 0.75, dot(aDir, normalize(cameraPosition - position))));
          vCol = aCol * face * uNight * (1.0 - smoothstep(uFogNear, uFogFar * 1.3, d));
          gl_PointSize = clamp(1.1 * uScale / d, 3.0, 48.0);
        }`,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          gl_FragColor = vec4(vCol * exp(-r2 * 3.5), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const pts = new THREE.Points(geo, mat)
    pts.name = 'centura:lights'
    pts.frustumCulled = false
    pts.matrixAutoUpdate = false
    pts.visible = false
    // points are sized in pixels: of whatever is being drawn into right now
    pts.onBeforeRender = (r, scene, cam) => {
      const rt = r.getRenderTarget()
      const h = rt ? rt.height : r.getDrawingBufferSize(_v2).y
      mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 42) / 2))
    }
    this.group.add(pts)
    this.lights = pts
  }

  presetName() {
    const q = this.game?.renderer?.q
    return Object.keys(QUALITY).find((k) => QUALITY[k] === q) || this.game?.settings?.quality || 'high'
  }

  pick(rnd, heavyOk) {
    const vs = this.variants.filter((v) => heavyOk || !v.model.heavy)
    const list = vs.length ? vs : this.variants
    let r = rnd() * list.reduce((s, v) => s + v.weight, 0)
    for (const v of list) if ((r -= v.weight) <= 0) return v
    return list[list.length - 1]
  }

  speedFor(c) {
    const r = this.rnd
    if (c.lane.road) return r.range(13, 18)
    if (c.model.heavy) return r.range(20.5, 23.5)
    return c.lane.slow ? r.range(21.5, 26) : r.range(25.5, 29)
  }

  // lay the vehicles out for a preset, evenly spaced with some jitter, at cruising speed
  populate(name) {
    const C = CENTURA_COUNTS[name] || CENTURA_COUNTS.high
    this.preset = name
    this.rnd = mulberry(9241)
    const rnd = this.rnd
    this.cars = []
    const per = [0, 0, 0, 0]
    for (let i = 0; i < C.highway; i++) per[[0, 3, 1, 2][i % 4]]++
    const fill = (L, n) => {
      L.cars = []
      const step = L.len / Math.max(1, n)
      for (let i = 0; i < n; i++) {
        const v = this.pick(rnd, L.road || L.slow), m = v.model
        const c = { lane: L, model: m, shift: rnd.pick(v.shifts), variant: v, hw: m.hw, hl: m.hl, h: m.h, s: (i + rnd.range(0, 0.5)) * step, a: m.heavy ? 0.6 : 1.1, ph: rnd.range(0, 6.3), w: rnd.range(0.07, 0.16), p: new THREE.Vector3(), f: new THREE.Vector3(0, 0, 1), vis: false }
        c.v0 = this.speedFor(c)
        c.vel = Math.min(c.v0, L.cap(c.s)) * 0.9
        L.cars.push(c)
        this.cars.push(c)
      }
    }
    this.hw.forEach((L, i) => fill(L, per[i]))
    for (const R of this.roads) fill(R, C.road)
    for (const c of this.cars) this.pose(c)
  }

  // one lane is a ring: each car follows the next one in the list, the last follows the first
  stepLane(L, dt) {
    const cars = L.cars, n = cars.length
    if (!n) return
    for (let i = 0; i < n; i++) {
      const c = cars[i], f = cars[(i + 1) % n]
      c.ph += dt * c.w
      const v0 = Math.min(c.v0 * (1 + 0.05 * Math.sin(c.ph)), L.cap(c.s))
      let acc = c.a * (1 - (c.vel / v0) ** 4)
      if (n > 1) {
        const gap = Math.max(0.3, ((f.s - c.s) % L.len + L.len) % L.len - c.hl - f.hl)
        const want = IDM.s0 + Math.max(0, c.vel * IDM.T + c.vel * (c.vel - f.vel) / (2 * Math.sqrt(c.a * IDM.b)))
        acc -= c.a * (want / gap) ** 2
      }
      c.acc = Math.max(-8, acc)
    }
    for (const c of cars) { c.vel = Math.max(0, c.vel + c.acc * dt); c.s += c.vel * dt }
    // never closer than a couple of metres, whatever the step was
    if (n > 1) for (let i = n - 1; i >= 0; i--) {
      const c = cars[i], f = cars[(i + 1) % n]
      const gap = ((f.s - c.s) % L.len + L.len) % L.len - c.hl - f.hl
      if (gap < 2) { c.s -= 2 - gap; c.vel = Math.min(c.vel, f.vel) }
    }
    // out past the end (well into the haze), round to the start with a new mood and paint
    for (const c of cars) {
      if (c.s < 0) c.s += L.len
      if (c.s >= L.len) { c.s -= L.len; c.v0 = this.speedFor(c); c.shift = this.rnd.pick(c.variant.shifts) }
    }
  }

  // position on the lane and the direction of travel (with the slope)
  pose(c) {
    const L = c.lane, s = Math.min(Math.max(c.s, 0.5), L.len - 0.5)
    L.at(c.s, c.p)
    L.at(s - 0.5, _a); L.at(s + 0.5, _b)
    c.f.subVectors(_b, _a).normalize()
  }

  step(dt) {
    if (!(dt > 0)) return
    dt = Math.min(dt, 1)
    const n = Math.ceil(dt / 0.05), h = dt / n
    for (let k = 0; k < n; k++) for (const L of this.lanes) this.stepLane(L, h)
  }

  update(dt, camera) {
    const name = this.presetName()
    if (name !== this.preset) this.populate(name)
    this.step(dt)
    if (!camera) return
    this.pack(camera)
    // a low roar from the Centura when you're near the east edge, quieter at night
    const amb = this.game?.audio?.amb
    if (amb?.setHighway) {
      const k = 0.2 * (1 - smooth(30, 340, Math.abs(camera.position.x - X1 - 14))) * (1 - 0.45 * this.night)
      if (Math.abs(k - (this.hum ?? -1)) > 0.004) { this.hum = k; amb.setHighway(k) }
    }
  }

  // the vehicles in view (within the haze and inside the frustum) into their model's instances
  pack(camera) {
    camera.updateMatrixWorld()
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    camera.getWorldPosition(_cam)
    const fog = this.world.scene.fog
    const far = (fog?.far ?? 900) * 1.3 + 30
    const night = SHARED.uNight.value
    const lit = night > 0.04
    this.night = night
    for (const m of this.models.values()) { m.n = 0; m.lo.fill(1e9); m.hi.fill(-1e9) }
    const L = this.lights.geometry.attributes, P = L.position.array, Cc = L.aCol.array, D = L.aDir.array
    let nl = 0
    for (const c of this.cars) {
      this.pose(c)
      const m = c.model, p = c.p, f = c.f
      _sph.center.set(p.x, p.y + c.h / 2, p.z)
      _sph.radius = Math.hypot(c.hl, c.hw, c.h / 2) + 0.5
      c.vis = _sph.center.distanceTo(_cam) < far + _sph.radius && _frustum.intersectsSphere(_sph)
      if (!c.vis) continue
      // basis: x across, y up, z the direction of travel
      _x.set(f.z, 0, -f.x).normalize()
      _y.crossVectors(f, _x)
      const e = m.mesh.instanceMatrix.array, o = m.n * 16
      e[o] = _x.x; e[o + 1] = _x.y; e[o + 2] = _x.z; e[o + 3] = 0
      e[o + 4] = _y.x; e[o + 5] = _y.y; e[o + 6] = _y.z; e[o + 7] = 0
      e[o + 8] = f.x; e[o + 9] = f.y; e[o + 10] = f.z; e[o + 11] = 0
      e[o + 12] = p.x; e[o + 13] = p.y; e[o + 14] = p.z; e[o + 15] = 1
      m.shift.array[m.n * 2] = c.shift[0]; m.shift.array[m.n * 2 + 1] = c.shift[1]
      m.n++
      const cc = _sph.center
      for (let k = 0; k < 3; k++) { const v = k ? (k > 1 ? cc.z : cc.y) : cc.x; if (v < m.lo[k]) m.lo[k] = v; if (v > m.hi[k]) m.hi[k] = v }
      if (lit) for (const [lx, ly, lz, kind] of m.lights) {
        const i = nl * 3, col = kind === 0 ? HEAD : kind === 1 ? TAIL : AMBER, sgn = kind === 1 ? -1 : 1
        P[i] = p.x + _x.x * lx + _y.x * ly + f.x * lz
        P[i + 1] = p.y + _x.y * lx + _y.y * ly + f.y * lz
        P[i + 2] = p.z + _x.z * lx + _y.z * ly + f.z * lz
        Cc[i] = col[0]; Cc[i + 1] = col[1]; Cc[i + 2] = col[2]
        D[i] = f.x * sgn; D[i + 1] = f.y * sgn; D[i + 2] = f.z * sgn
        nl++
      }
    }
    for (const m of this.models.values()) {
      const mesh = m.mesh
      mesh.count = m.n
      mesh.visible = m.n > 0
      if (!m.n) continue
      for (const a of [mesh.instanceMatrix, m.shift]) { a.clearUpdateRanges(); a.addUpdateRange(0, m.n * a.itemSize); a.needsUpdate = true }
      // one sphere round all of this model's instances in view, so the culling stays right
      const bs = mesh.boundingSphere
      bs.center.set((m.lo[0] + m.hi[0]) / 2, (m.lo[1] + m.hi[1]) / 2, (m.lo[2] + m.hi[2]) / 2)
      bs.radius = Math.hypot(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) / 2 + Math.hypot(m.hl, m.hw, m.h / 2) + 0.5
    }
    const pts = this.lights
    pts.visible = lit && nl > 0
    pts.geometry.setDrawRange(0, nl)
    if (nl) {
      for (const a of [L.position, L.aCol, L.aDir]) { a.clearUpdateRanges(); a.addUpdateRange(0, nl * 3); a.needsUpdate = true }
      const u = pts.material.uniforms
      u.uNight.value = Math.min(1, night * 1.2)
      u.uFogNear.value = fog?.near ?? 140; u.uFogFar.value = fog?.far ?? 900
    }
    this.litCount = nl
  }

  // for tools: where everything is
  snapshot() {
    return this.cars.map((c) => {
      this.pose(c)
      return { road: c.lane.road ? c.lane.side : 0, lane: this.hw.indexOf(c.lane), x: c.p.x, y: c.p.y, z: c.p.z, fx: c.f.x, fy: c.f.y, fz: c.f.z, hw: c.hw, hl: c.hl, h: c.h, v: c.vel, s: c.s, model: c.model.key, heavy: c.model.heavy, vis: c.vis }
    })
  }
}
