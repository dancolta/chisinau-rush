import * as THREE from 'three'
import { BOUNDS, EXITS, RAIL_Z, edgeDistance, exitAt } from './CityLayout.js'
import { RIVER, WALL_W, HIGHWAY, HIGHWAY_END, PORTAL, GATE_HALF, westWallTop, terrainHeight, highwayLevel } from './Terrain.js'
import { addTreeGeometry, signMesh } from './Props.js'
import { mulberry } from './rng.js'
import { FILTER } from '../physics/Physics.js'
import { CELL } from '../core/Assets.js'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { SHARED } from '../render/Materials.js'
import { SignAtlas } from '../render/Textures.js'

// Where the city ends. Every side closes with something you can see and touch, and the collider
// stands exactly on its face: the Bîc's parapet in the north, the limestone retaining wall under
// Valea Morilor's woods in the west, the ring highway's wall in the east and the old combinat's
// concrete fence behind the railway in the south. The roads that lead out end at a police post
// (the boulevard, both ways), a bridge that's been "under repair" since 2019 (Pușkin) and the
// combinat's locked gate (Vlaicu Pârcălab, over the level crossing). The railway leaves through
// a tunnel in the west and under the highway in the east, both behind steel gates.
// Beyond the barriers the scenery carries on (the far bank, the woods, the highway, the yard)
// on the land Terrain.js lays out, and past that the horizon (Horizon.js).
//
// What stands past the barriers (and the small props) uses the '_far' kinds, one batch each for the
// whole map (shared with the horizon's): same materials, but no shadows, since the shadow map only
// ever covers the ground round the player, who is always inside. The barriers and what's next to
// them cast shadows, and come in 250 m batches so the shadow pass only draws the ones nearby.

const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = BOUNDS
const C = 250, CF = 1e5
const MARK_Y = 0.016
const WHITE = 0xe9e6dc, ASPHALT = 0x3d3f43
const STONE = [0xcdbf98, 0xc2b28a, 0xd4c7a2, 0xbca982] // Cricova limestone courses
const CONC = 0xa7a49c, CONC_D = 0x77746d, RAIL = 0x2d4536, RUST = 0x6b3d24, RED = 0xb8322a

// what the city says when you reach it (one line per visit, taking turns)
const LINES = {
  vest: ['Vameșul zice că fără acte nu treci.', 'Chișinăul nu te lasă să pleci așa ușor.', 'Postul de poliție: „Unde, mă, așa grăbit? Hai înapoi în oraș."'],
  est: ['Chișinăul nu te lasă să pleci așa ușor.', 'Vameșul zice că fără acte nu treci.', 'Spre aeroport? Întâi termină ce-ai început aici.'],
  pod: ['Podul e în reparație din 2019. Primăria zice că „se lucrează".', 'Termen de finalizare: 2019. Care 2019, n-a precizat nimeni.'],
  combinat: ['Combinatul „Viitorul Luminos". Închis din \'91, păzit și azi.', 'Poarta e încuiată. Câinele rău e în concediu, dar tot rău.'],
  bic: ['Bîcul. Apa din el nu se bea și nici nu se înoată.', 'Pe malul celălalt e tot Chișinăul. Doar că podul e în reparație.'],
  padure: ['Valea Morilor. Mai departe doar pădure, țânțari și un pescar care nu prinde nimic.', 'Zidul ține dealul pe loc. Tu ține-te de oraș.'],
  centura: ['Centura. Pe jos nu treci, iar cu mașina te oprește poliția.', 'Zidul Centurii: mai înalt decât promisiunile din campanie.'],
  gard: ['Gardul combinatului. Paznicul doarme, dar gardul e treaz.', 'Beton sovietic. A rezistat la tot, o să reziste și la tine.'],
  tunel: ['Tunelul CFM. Trenul spre Ungheni trece o dată pe zi, și nu azi.', 'Poarta tunelului e încuiată. Pe jos, până la Ungheni e oricum cam departe.'],
  cfm: ['Poarta CFM e închisă. Trenul spre Odesa a plecat de mult.', '„Accesul persoanelor străine interzis." Tu ești de-al casei, dar tot nu.'],
}

// ---- geometry helpers ------------------------------------------------------------------------
const _c = new THREE.Color()

// axis-aligned box between two corners
function box(g, x0, y0, z0, x1, y1, z1, color, emit = 0) {
  g.box(x1 - x0, y1 - y0, z1 - z0, { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, color, emit })
}

// a flat face through four corners (one colour, or one per corner); `toward` picks the side it faces
function quad(g, a, b, c, d, color, toward = null, emit = 0) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const L = Math.hypot(nx, ny, nz)
  if (L < 1e-9) return
  nx /= L; ny /= L; nz /= L
  let ord = [0, 1, 2, 0, 2, 3]
  if (toward && nx * toward[0] + ny * toward[1] + nz * toward[2] < 0) { nx = -nx; ny = -ny; nz = -nz; ord = [0, 2, 1, 0, 3, 2] }
  const P = [a, b, c, d]
  const cols = Array.isArray(color) ? color : [color, color, color, color]
  for (const i of ord) {
    _c.set(cols[i])
    g.pos.push(P[i][0], P[i][1], P[i][2]); g.nor.push(nx, ny, nz); g.col.push(_c.r, _c.g, _c.b); g.emit.push(emit); g.uv.push(0, 0)
  }
}
const tri = (g, a, b, c, color, toward) => quad(g, a, b, c, c, color, toward)

// a convex cross-section [[u, y], ...] swept along x or z from s0 to s1; u runs across the sweep
// from `at`, in the direction `out`. caps: close the ends
function sweep(g, axis, s0, s1, at, out, prof, color, caps = true) {
  const P = (s, u, y) => axis === 'x' ? [s, y, at + out * u] : [at + out * u, y, s]
  const n = prof.length
  const cu = prof.reduce((a, p) => a + p[0], 0) / n, cy = prof.reduce((a, p) => a + p[1], 0) / n
  for (let i = 0; i < n; i++) {
    const p = prof[i], q = prof[(i + 1) % n]
    const mu = ((p[0] + q[0]) / 2 - cu) * out, my = (p[1] + q[1]) / 2 - cy
    if (my < -0.3 && Math.abs(mu) < 0.05) continue // the underside sits on something
    quad(g, P(s0, p[0], p[1]), P(s1, p[0], p[1]), P(s1, q[0], q[1]), P(s0, q[0], q[1]), color, axis === 'x' ? [0, my, mu] : [mu, my, 0])
  }
  if (!caps) return
  for (const [s, dir] of [[s0, -1], [s1, 1]]) {
    for (let i = 1; i < n - 1; i++) tri(g, P(s, prof[0][0], prof[0][1]), P(s, prof[i][0], prof[i][1]), P(s, prof[i + 1][0], prof[i + 1][1]), color, axis === 'x' ? [dir, 0, 0] : [0, 0, dir])
  }
}

// the concrete safety barrier's profile (inner face at u = 0). Its faces kink in at 0.33 m, so
// for a collider it's two convex pieces: a hull over the whole profile would fill the kink and
// stand 9 cm proud of the face you see
const JERSEY = [[0, 0], [0.6, 0], [0.6, 0.08], [0.43, 0.33], [0.375, 0.81], [0.225, 0.81], [0.17, 0.33], [0, 0.08]]
const JERSEY_HULLS = [[[0, 0], [0.6, 0], [0.6, 0.08], [0.43, 0.33], [0.17, 0.33], [0, 0.08]], [[0.17, 0.33], [0.43, 0.33], [0.375, 0.81], [0.225, 0.81]]]
// the highway's parapet: vertical at the back (u = 0, the wall's face), shaped toward the traffic
const PARAPET = [[0, 0], [0.6, 0], [0.6, 0.08], [0.43, 0.33], [0.375, 0.9], [0, 0.9]]

export class Edge {
  constructor(world) {
    this.w = world
    this.B = world.batches
    this.P = world.physics
    this.kay = world.assets.kay
    this.rnd = mulberry(4711)
    this.recolored = new Map()
    // the city's sign atlas is full: the edge has its own, drawn as one more mesh
    this.signs = new SignAtlas(1024, 1280)
    this.quads = []
    this.gates = []          // the railway's steel gates (they slide open when a train comes through)
    this.visit = null        // at the edge right now: the stretches that have had their line this visit
    this.turn = {}           // whose turn it is in each stretch's lines
    this.safe = null         // the last spot well inside, for the out-of-bounds guard
    this.trainT = 0
  }

  g(x, z, kind = 'static') { return this.B.vcol(x, z, kind, kind.endsWith('_far') ? CF : C) }
  far(x, z) { return this.B.vcol(x, z, 'static_far', CF) }

  build() {
    this.exits()
    this.north()
    this.west()
    this.east()
    this.south()
    const m = signMesh(this.quads, this.signs)
    m.name = 'edge-signs'
    this.w.scene.add(m)
  }

  // a static collider over an axis-aligned box, cut into pieces of 40 m at most (long boxes make
  // the character controller's contact maths imprecise)
  solid(x0, y0, z0, x1, y1, z1, groups = FILTER.STATIC) {
    const lx = x1 - x0, lz = z1 - z0
    const n = Math.max(1, Math.ceil(Math.max(lx, lz) / 40))
    for (let i = 0; i < n; i++) {
      let a0 = x0, a1 = x1, b0 = z0, b1 = z1
      if (lx >= lz) { a0 = x0 + (lx * i) / n; a1 = x0 + (lx * (i + 1)) / n } else { b0 = z0 + (lz * i) / n; b1 = z0 + (lz * (i + 1)) / n }
      this.P.box((a0 + a1) / 2, (y0 + y1) / 2, (b0 + b1) / 2, (a1 - a0) / 2, (y1 - y0) / 2, (b1 - b0) / 2, { groups })
    }
  }

  sign(text, opts, at) { this.quads.push({ lit: 0.5, ...at, rect: this.signs.sign(text, opts) }) }
  drawn(w, h, draw, at) { this.quads.push({ lit: 0.5, ...at, rect: this.signs.custom(w, h, draw) }) }

  // a KayKit street lamp (where you can walk up to it) on the ground at gy, arm along (dx, dz)
  lamp(x, z, dx, dz, gy = 0) {
    const ry = Math.atan2(dz, -dx)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1))
    this.B.atlas(x, z, this.kay.streetlight.geometry, m, 'props_far', CF)
    const hx = x + dx * 1.05, hz = z + dz * 1.05
    this.g(hx, hz).box(0.42, 0.08, 0.42, { x: hx, y: gy + 4.12, z: hz, color: 0xffc27a, emit: 1 })
    this.P.cylinder(x, gy + 2.2, z, 2.2, 0.14)
    this.w.lamps.push({ x: hx, z: hz, y: gy + 4.14, gy })
  }

  // a plain lamp post out of reach (across the river, in the yard, along the roads out)
  post(x, z, dx, dz, gy = 0, h = 7, pool = true) {
    const g = this.far(x, z), hx = x + dx * 1.6, hz = z + dz * 1.6
    g.box(0.16, h, 0.16, { x, y: gy, z, color: 0x5d6368 })
    g.box(Math.abs(dx) * 1.6 + 0.08, 0.08, Math.abs(dz) * 1.6 + 0.08, { x: (x + hx) / 2, y: gy + h - 0.1, z: (z + hz) / 2, color: 0x5d6368 })
    g.box(0.34, 0.1, 0.34, { x: hx, y: gy + h - 0.22, z: hz, color: 0xffd9a0, emit: 1 })
    if (pool) this.w.lamps.push({ x: hx, z: hz, y: gy + h - 0.3, gy })
  }

  // a trodden dirt path from (x0, z0) to (x1, z1), w wide, with softer edges
  path(x0, z0, x1, z1, w) {
    const g = this.g((x0 + x1) / 2, (z0 + z1) / 2), L = Math.hypot(x1 - x0, z1 - z0)
    const nx = -(z1 - z0) / L * w / 2, nz = (x1 - x0) / L * w / 2
    const mid = 0x9a8662, edge = 0x7d8a52
    quad(g, [x0 - nx * 1.35, 0.013, z0 - nz * 1.35], [x1 - nx * 1.35, 0.013, z1 - nz * 1.35], [x1 - nx * 0.7, 0.014, z1 - nz * 0.7], [x0 - nx * 0.7, 0.014, z0 - nz * 0.7], [edge, edge, mid, mid], [0, 1, 0])
    quad(g, [x0 - nx * 0.7, 0.014, z0 - nz * 0.7], [x1 - nx * 0.7, 0.014, z1 - nz * 0.7], [x1 + nx * 0.7, 0.014, z1 + nz * 0.7], [x0 + nx * 0.7, 0.014, z0 + nz * 0.7], mid, [0, 1, 0])
    quad(g, [x0 + nx * 0.7, 0.014, z0 + nz * 0.7], [x1 + nx * 0.7, 0.014, z1 + nz * 0.7], [x1 + nx * 1.35, 0.013, z1 + nz * 1.35], [x0 + nx * 1.35, 0.013, z0 + nz * 1.35], [mid, mid, edge, edge], [0, 1, 0])
  }

  // a tree you can walk into: its trunk is solid
  treeAt(x, z, kind, y = 0) {
    const t = addTreeGeometry(this.g(x, z, 'tree'), x, z, this.rnd, kind, { y })
    this.P.cylinder(x, y + 1.5, z, 1.5, t.r)
  }

  // a low round shrub
  shrub(x, z, s = 1) {
    const g = this.g(x, z), rnd = this.rnd
    const col = rnd.pick([0x3c6130, 0x46703a, 0x355a2c, 0x52753c])
    g.sphere(0.9 * s, 6, 4, { x, y: 0.35 * s, z, sy: 0.7, color: col })
    g.sphere(0.6 * s, 5, 3, { x: x + 0.5 * s, y: 0.55 * s, z: z - 0.3 * s, sy: 0.8, color: col })
  }

  // a parked KayKit car (body and wheels) in a colour from the palette atlas
  car(x, z, ry, model = 'car_sedan', color = null, gy = 0, extra = null) {
    const k = this.kay[model]
    const body0 = { car_sedan: 'steel', car_hatchback: 'red', car_stationwagon: 'green', car_taxi: 'yellow', car_police: 'black' }[model]
    const to = model === 'car_police' ? 'blue' : model === 'car_taxi' ? null : color
    let geo = k.geometry
    if (to && to !== body0) {
      const key = model + ':' + to
      if (!this.recolored.has(key)) this.recolored.set(key, this.w.assets.recolor(k.geometry, CELL[body0], CELL[to]))
      geo = this.recolored.get(key)
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1))
    const off = 0.336, T = new THREE.Matrix4()
    this.B.atlas(x, z, geo, m.clone().multiply(T.makeTranslation(0, off, 0)), 'props_far', CF)
    for (const wh of k.wheels) this.B.atlas(x, z, wh.geometry, m.clone().multiply(T.makeTranslation(wh.pivot.x, wh.pivot.y + off, wh.pivot.z)), 'props_far', CF)
    if (extra) extra(m)
  }

  // the dark inside of a tunnel or culvert from x0 (its mouth) to x1: walls, roof and floor facing
  // in, fading to black with depth
  tunnel(x0, x1, z0, z1, y0, y1, floor = true) {
    const n = 6
    for (let i = 0; i < n; i++) {
      const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n
      const ka = Math.max(0.03, 0.4 * (1 - i / n) ** 2.4), kb = Math.max(0.02, 0.4 * (1 - (i + 1) / n) ** 2.4)
      const ca = _c.setRGB(ka, ka * 0.98, ka * 0.94).getHex(), cb = _c.setRGB(kb, kb * 0.98, kb * 0.94).getHex()
      const g = this.far(x0, (z0 + z1) / 2)
      quad(g, [a, y0, z0], [b, y0, z0], [b, y1, z0], [a, y1, z0], [ca, cb, cb, ca], [0, 0, 1])
      quad(g, [a, y0, z1], [b, y0, z1], [b, y1, z1], [a, y1, z1], [ca, cb, cb, ca], [0, 0, -1])
      quad(g, [a, y1, z0], [b, y1, z0], [b, y1, z1], [a, y1, z1], [ca, cb, cb, ca], [0, -1, 0])
      if (floor) quad(g, [a, y0 + 0.01, z0], [b, y0 + 0.01, z0], [b, y0 + 0.01, z1], [a, y0 + 0.01, z1], [ca, cb, cb, ca], [0, 1, 0])
    }
    quad(this.far(x0, (z0 + z1) / 2), [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 0x050505, [Math.sign(x0 - x1), 0, 0])
  }

  // ---- the roads that lead out ------------------------------------------------------------------
  exits() {
    const B = this.B
    for (const e of EXITS) {
      const R = e.rect, side = e.open - e.half
      // carriageway, laid over the outskirts grass
      const L = e.horizontal ? R.x1 - R.x0 : R.z1 - R.z0, n = Math.max(1, Math.ceil(L / 50))
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n
        const r = e.horizontal ? [R.x0 + L * t0, R.z0, R.x0 + L * t1, R.z1] : [R.x0, R.z0 + L * t0, R.x1, R.z0 + L * t1]
        B.flat((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 'asphalt_o', 12).rect(r[0], r[1], r[2], r[3], 0.012)
        // the kerbside: pavement along the boulevard and Pușkin, gravel down to the combinat
        const surf = e.id === 'combinat' ? 'dirt_o' : 'paving_o', us = e.id === 'combinat' ? 6 : 4
        for (const s of [-1, 1]) {
          const q = e.horizontal ? [r[0], s < 0 ? r[1] - side : r[3], r[2], s < 0 ? r[1] : r[3] + side] : [s < 0 ? r[0] - side : r[2], r[1], s < 0 ? r[0] : r[2] + side, r[3]]
          B.flat((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, surf, us).rect(q[0], q[1], q[2], q[3], 0.013)
        }
      }
      // markings
      const mark = (cx, cz, w, d) => B.vcol(cx, cz, 'markings').quad(w, d, { x: cx, y: MARK_Y, z: cz, color: WHITE })
      const along = (off, dash, gap, width) => {
        for (let t = 2; t < L - 2; t += dash + gap) {
          const len = Math.min(dash, L - 2 - t), mid = (e.horizontal ? R.x0 : R.z0) + t + len / 2
          if (len < 0.4) continue
          if (e.horizontal) mark(mid, e.c + off, len, width); else mark(e.c + off, mid, width, len)
        }
      }
      if (e.r.boulevard) {
        for (const o of [-0.22, 0.22]) along(o, 1e4, 0, 0.14)
        for (const o of [-7.5, -4, 4, 7.5]) along(o, 3, 6, 0.13)
        for (const o of [-10.8, 10.8]) along(o, 1e4, 0, 0.14)
        // stop line a car's length before the barrier, across the outbound lanes
        const sx = e.to - (e.side === 'w' ? -1 : 1) * 6, sz = e.side === 'w' ? -5.75 : 5.75
        mark(sx, sz, 0.45, 10.5)
      } else along(0, 3, 4.5, 0.14)
    }
  }

  // ---- north: the Bîc -----------------------------------------------------------------------
  north() {
    const B = this.B, rnd = this.rnd
    const pod = EXITS.find((e) => e.id === 'pod')
    const gap0 = pod.c - pod.open, gap1 = pod.c + pod.open
    const road0 = pod.c - pod.half, road1 = pod.c + pod.half
    const pz1 = Z0 + 7
    // the promenade: paving from the parapet to a low kerb, lamps, benches facing the water, and
    // a row of lindens behind it
    for (let x = X0; x < X1; x += 50) {
      const a = x, b = Math.min(X1, x + 50)
      const lay = (u0, u1) => { if (u1 - u0 > 0.1) B.flat((u0 + u1) / 2, Z0 + 3, 'paving_o', 4, CF).rect(u0, Z0, u1, pz1, 0.012) }
      if (b <= road0 || a >= road1) lay(a, b)
      else { lay(a, road0); lay(road1, b) }
      for (const [u0, u1] of [[a, Math.min(b, gap0)], [Math.max(a, gap1), b]]) if (u1 - u0 > 0.1) box(this.g((u0 + u1) / 2, pz1), u0, 0, pz1, u1, 0.07, pz1 + 0.16, 0x9d9a92)
    }
    for (let x = X0 + 14; x < X1 - 8; x += 32) {
      if (Math.abs(x - pod.c) < pod.open + 4) continue
      this.lamp(x, Z0 + 6.2, 0, -1)
      const bx = x + 16
      if (Math.abs(bx - pod.c) > pod.open + 4 && bx < X1 - 6) {
        this.B.atlas(bx, Z0 + 1.7, this.kay.bench.geometry, new THREE.Matrix4().compose(new THREE.Vector3(bx, 0, Z0 + 1.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(1, 1, 1)), 'props_far', CF)
        this.w.benches.push({ x: bx, z: Z0 + 1.7, ry: Math.PI })
        if (rnd() < 0.4) this.w.dynamicProps.push({ type: 'bin', x: bx + 2.2, z: Z0 + 1.2, ry: 0 })
      }
    }
    for (let x = X0 + 12; x < X1 - 8; x += rnd.range(30, 44)) {
      if (Math.abs(x - pod.c) < pod.open + 6) continue
      this.treeAt(x, pz1 + 1.8 + rnd.range(0, 1.2), rnd() < 0.8 ? 'broad' : 'small')
    }

    // the parapet: concrete with a coping, a steel railing on top; the collider is its face
    const parapet = (a, b, z, face, near) => {
      for (let x = a; x < b - 0.01; x += 50) {
        const u0 = x, u1 = Math.min(b, x + 50), g = near ? this.g((u0 + u1) / 2, z) : this.far((u0 + u1) / 2, z)
        const zo = z - face * 0.4
        box(g, u0, 0, Math.min(z, zo), u1, 1.0, Math.max(z, zo), 0xb3ada0)
        box(g, u0, 1.0, Math.min(z, zo - face * 0.02), u1, 1.08, Math.max(z, zo - face * 0.02), 0xc9c3b4)
        const rz = z - face * 0.21
        for (let px = u0 + 1.25; px < u1; px += near ? 2.5 : 5) box(g, px - 0.03, 1.08, rz - 0.03, px + 0.03, 1.5, rz + 0.03, RAIL)
        if (near) box(g, u0, 1.26, rz - 0.022, u1, 1.3, rz + 0.022, RAIL)
        box(g, u0, 1.48, rz - 0.04, u1, 1.54, rz + 0.04, RAIL)
      }
      if (near) this.solid(a, 0, z - 0.6, b, 1.54, z)
    }
    parapet(X0 - 0.6, gap0, Z0, 1, true)
    parapet(gap1, X1 + 0.6, Z0, 1, true)

    // the channel: sloped concrete banks, darker and green where the water licks them, on east
    // under the highway and out into the fields
    const river = RIVER, xEnd = X1 + 1000
    for (let x = X0; x < xEnd; x += 80) {
      const a = x, b = Math.min(xEnd, x + 80), g = this.far((a + b) / 2, (river.top0 + river.top1) / 2)
      const mid = -1.8, k = mid / river.bed, zm0 = river.top0 - river.run * k, zm1 = river.top1 + river.run * k
      const top = 0xa9a497, midC = 0x8d897b, low = 0x4a5140
      quad(g, [a, 0, river.top0], [b, 0, river.top0], [b, mid, zm0], [a, mid, zm0], [top, top, midC, midC], [0, 1, -1])
      quad(g, [a, mid, zm0], [b, mid, zm0], [b, river.bed, river.top0 - river.run], [a, river.bed, river.top0 - river.run], [midC, midC, low, low], [0, 1, -1])
      quad(g, [a, 0, river.top1], [b, 0, river.top1], [b, mid, zm1], [a, mid, zm1], [top, top, midC, midC], [0, 1, 1])
      quad(g, [a, mid, zm1], [b, mid, zm1], [b, river.bed, river.top1 + river.run], [a, river.bed, river.top1 + river.run], [midC, midC, low, low], [0, 1, 1])
    }
    this.water(X0 - 40, xEnd)
    // the far bank's parapet (no collider: you can't get there)
    parapet(X0, gap0, river.far, -1, false)
    parapet(gap1, X1, river.far, -1, false)

    // the west end: the river comes out of a culvert under the hill
    {
      const mid = (river.top0 + river.top1) / 2, hw = 5, top = -0.45, g = this.g(X0, mid)
      box(g, X0 - 0.5, top, river.top1, X0, westWallTop(Z0 - 10) + 0.1, river.top0, STONE[1])
      box(g, X0 - 0.5, river.bed - 0.2, mid + hw, X0, top, river.top0, STONE[1])
      box(g, X0 - 0.5, river.bed - 0.2, river.top1, X0, top, mid - hw, STONE[1])
      box(g, X0 - 0.02, top, mid - hw - 0.3, X0 + 0.12, top + 0.35, mid + hw + 0.3, STONE[2])
      this.tunnel(X0 - 0.5, X0 - 40, mid - hw, mid + hw, river.bed, top, false)
      // a rusty trash rack across the mouth, and what the city has sent down the river
      for (let z = mid - hw + 0.2; z < mid + hw; z += 0.32) box(g, X0 + 0.2, river.bed, z - 0.025, X0 + 0.25, top, z + 0.025, RUST)
      box(g, X0 + 0.16, top - 0.2, mid - hw, X0 + 0.3, top - 0.1, mid + hw, RUST)
      const junk = [0xd23a2a, 0x2a6ad2, 0xe8e0c8, 0x2f8a3a, 0xf0c020, 0x1e1e20]
      for (let i = 0; i < 26; i++) {
        const z = mid + rnd.range(-hw + 0.4, hw - 0.4)
        g.box(rnd.range(0.12, 0.4), rnd.range(0.08, 0.2), rnd.range(0.1, 0.3), { x: X0 + 0.45 + rnd() * 1.4, y: river.water - 0.06, z, ry: rnd() * 3, color: rnd.pick(junk) })
      }
      // a Linella trolley that went for a swim
      const tz = mid + 2.3, tx = X0 + 3.4, ty = river.water - 0.35
      for (const [w, h, d] of [[0.9, 0.04, 0.55], [0.9, 0.55, 0.04], [0.04, 0.55, 0.55]]) g.box(w, h, d, { x: tx, y: ty, z: tz, rz: 0.4, color: 0x9aa3a8 })
      g.box(0.95, 0.05, 0.6, { x: tx, y: ty + 0.55, z: tz, rz: 0.4, color: 0x009640 })
    }

    // the bridge on Pușkin: fenced off at the limit; beyond, the deck stops short over the water
    // and starts again five metres on, rebar sticking out of both ends
    this.closure('x', Z0, gap0, gap1, -1)
    {
      const g = this.g(pod.c, Z0 - 10), a = gap0, b = gap1
      const half = (z0, z1) => {
        box(g, a, -0.75, z0, b, -0.02, z1, CONC)
        box(g, a + 3, -0.02, z0, b - 3, 0.012, z1, 0x3c3e42)
        for (const [s0, s1] of [[a, a + 3], [b - 3, b]]) box(g, s0, -0.02, z0, s1, 0.16, z1, 0x8e8b84)
        for (const [s0, s1] of [[a, a + 0.35], [b - 0.35, b]]) {
          box(g, s0, 0, z0, s1, 1.05, z1, 0xb3ada0)
          for (let z = z0 + 0.8; z < z1; z += 2) box(g, (s0 + s1) / 2 - 0.03, 1.05, z - 0.03, (s0 + s1) / 2 + 0.03, 1.5, z + 0.03, RAIL)
          box(g, (s0 + s1) / 2 - 0.04, 1.47, z0, (s0 + s1) / 2 + 0.04, 1.53, z1, RAIL)
        }
        box(g, a + 1, river.bed, (z0 + z1) / 2 - 0.4, a + 1.8, -0.75, (z0 + z1) / 2 + 0.4, CONC_D)
        box(g, b - 1.8, river.bed, (z0 + z1) / 2 - 0.4, b - 1, -0.75, (z0 + z1) / 2 + 0.4, CONC_D)
      }
      half(Z0 - 8, Z0)
      half(river.far, Z0 - 13)
      for (const [z, dir] of [[Z0 - 8, -1], [Z0 - 13, 1]]) {
        for (let x = a + 0.6; x < b - 0.4; x += 0.7) {
          const len = rnd.range(0.4, 1.3)
          g.box(0.035, 0.035, len, { x, y: -rnd.range(0.15, 0.6), z: z + dir * len / 2, rx: rnd.range(-0.5, 0.35) * dir, ry: rnd.range(-0.2, 0.2), color: RUST })
        }
      }
      // the works: a mixer, sand, bricks, cones and a site cabin on the far half, an excavator
      // parked on the far bank, nobody working
      const fz = Z0 - 17
      g.cyl(0.55, 0.7, 1.2, 10, { x: pod.c - 4, y: 0.9, z: fz, rz: 1.1, color: 0xe07a1a })
      box(g, pod.c - 4.8, 0.02, fz - 0.6, pod.c - 3.4, 0.9, fz + 0.6, 0x3a3f46)
      g.cone(1.6, 1.1, 10, { x: pod.c + 3, y: 0.02, z: fz + 1, color: 0xc2a36b })
      box(g, pod.c + 1, 0.02, fz - 2.6, pod.c + 2.4, 0.9, fz - 1.4, 0xa65f45)
      for (let i = 0; i < 5; i++) g.cone(0.18, 0.7, 8, { x: a + 3.5 + i * 2.6, y: 0.02, z: Z0 - 13.6, color: 0xf06a1a })
      box(g, b + 6, 0, river.far - 9, b + 12, 2.6, river.far - 6.4, 0x2f5f9a)
      this.excavator(a - 9, river.far - 7, 0.5)
      this.sign('ȘANTIER · SRL „GROAPA MARE"', { bg: '#f2c318', fg: '#1b1b1b', w: 384, h: 48 }, { x: b + 9, y: 1.7, z: river.far - 6.38, ry: 0, w: 5, h: 0.62, lit: 0.3 })
    }
    // what the barrier says, on the city side
    this.sign('DRUM ÎNCHIS', { bg: '#c0262d', fg: '#ffffff', w: 256, h: 64, border: '#ffffff' }, { x: pod.c, y: 1.45, z: Z0 - 0.66, ry: 0, w: 2.6, h: 0.65, lit: 0.8 })
    for (const [x, t, sub, bg, fg] of [[gap1 + 2.6, 'PODUL ÎN REPARAȚIE', 'TERMEN DE FINALIZARE: 2019', '#f2c318', '#1b1b1b'], [gap0 - 2.6, 'PRIMĂRIA CHIȘINĂU', 'VĂ MULȚUMEȘTE PENTRU ÎNȚELEGERE', '#1f4f9c', '#ffffff']]) {
      const g = this.g(x, Z0 + 1)
      for (const s of [-1, 1]) { g.box(0.08, 2.9, 0.08, { x: x + s * 1.3, y: 0, z: Z0 + 1.2, color: 0x3a3f46 }); this.P.cylinder(x + s * 1.3, 1.45, Z0 + 1.2, 1.45, 0.06) }
      this.sign(t, { bg, fg, w: 384, h: 128, sub, border: fg }, { x, y: 2.35, z: Z0 + 1.25, ry: 0, w: 3.0, h: 1.0, lit: 0.6, double: true })
    }

    // the far bank: Str. Albișoara with its lamps, a few parked cars and trees, and Râșcani's
    // blocks behind
    const fz0 = river.far
    for (let x = X0; x < X1; x += 80) {
      const a = x, b = Math.min(X1, x + 80), g = this.far((a + b) / 2, fz0 - 6)
      quad(g, [a, 0.02, fz0 - 2.4], [b, 0.02, fz0 - 2.4], [b, 0.02, fz0], [a, 0.02, fz0], 0x8a8781, [0, 1, 0])
      box(g, a, 0, fz0 - 2.55, b, 0.14, fz0 - 2.4, 0x9d9a92)
      quad(g, [a, 0.02, fz0 - 12.4], [b, 0.02, fz0 - 12.4], [b, 0.02, fz0 - 2.55], [a, 0.02, fz0 - 2.55], ASPHALT, [0, 1, 0])
      for (let t = a + 1; t < b - 3; t += 7.5) g.quad(3, 0.14, { x: t + 1.5, y: 0.05, z: fz0 - 7.4, color: WHITE })
    }
    for (let x = X0 + 10; x < X1 - 6; x += 36) if (Math.abs(x - pod.c) > pod.open + 3) this.post(x, fz0 - 1.8, 0, -1)
    const models = ['car_sedan', 'car_hatchback', 'car_stationwagon', 'car_taxi']
    const paints = ['white', 'silver', 'grey', 'maroon', 'beige', 'red', 'blue', 'green']
    for (const dx of [-31, 32]) this.car(pod.c + dx + rnd.range(-2, 2), fz0 - 3.9, rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2, rnd.pick(models), rnd.pick(paints))
    for (let x = X0 + 6; x < X1 - 4; x += rnd.range(14, 20)) {
      const z = fz0 - 15 - rnd.range(0, 2.5)
      addTreeGeometry(this.g(x, z, 'tree_far'), x, z, rnd, rnd() < 0.85 ? 'broad' : 'poplar', { y: 0, lod: true })
    }
    const Bd = this.w.buildings
    for (let x = X0 + 30; x < X1 - 26; x += rnd.range(44, 70)) {
      const len = rnd.range(30, 58)
      if (Math.abs(x - pod.c) < len / 2 + 10) continue
      Bd.panel({ cx: x, cz: fz0 - 30 - rnd.range(0, 6), len, depth: 12, floors: rnd.pick([9, 9, 9, 12, 16]), ry: 0, seed: 3100 + x | 0, y0: 0, entrances: false, balconySides: [1], chunk: CF })
    }
    for (let x = X0 + 50; x < X1 - 40; x += rnd.range(80, 130)) {
      Bd.panel({ cx: x, cz: fz0 - 78 - rnd.range(0, 12), len: rnd.range(18, 40), depth: 14, floors: rnd.pick([12, 16, 16]), ry: 0, seed: 3500 + x | 0, y0: 0, entrances: false, balconySides: [1], chunk: CF })
    }
  }

  // the river's water: a long strip between the banks that ripples and drifts downstream
  water(x0, x1) {
    const pos = [], z0 = RIVER.top1 + 3.4, z1 = RIVER.top0 - 3.4, y = RIVER.water
    for (let x = x0; x < x1; x += 100) {
      const a = x, b = Math.min(x1, x + 100)
      pos.push(a, y, z0, a, y, z1, b, y, z1, a, y, z0, b, y, z1, b, y, z0)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    geo.computeBoundingSphere()
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a3d, roughness: 0.1, metalness: 0.05 })
    mat.envMapIntensity = 0.95
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = SHARED.uTime
      sh.vertexShader = 'varying vec3 vWaterW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vWaterW;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // the Bîc drifts east: ripples sliding downstream over a slow swell
    vec2 p = vWaterW.xz;
    float t = uTime;
    vec2 d = vec2(sin(p.x * 0.8 - t * 1.4 + sin(p.y * 0.9) * 1.2), cos(p.y * 1.3 + p.x * 0.35 - t * 0.9)) * 0.05;
    d += vec2(sin(p.x * 2.9 + p.y * 1.7 - t * 3.1), cos(p.x * 2.3 - p.y * 2.6 - t * 2.7)) * 0.025;
    normal = normalize(normal + (viewMatrix * vec4(d.x, 0.0, d.y, 0.0)).xyz);
  }`)
    }
    mat.customProgramCacheKey = () => 'river-v1'
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'river'
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false; mesh.updateMatrix()
    this.w.scene.add(mesh)
    this.river = mesh
  }

  // a yellow excavator, parked for the season
  excavator(x, z, ry) {
    const g = this.far(x, z)
    const W = (lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)]
    for (const s of [-1, 1]) { const [tx, tz] = W(s * 1.25, 0); g.box(0.6, 0.8, 4.2, { x: tx, y: 0, z: tz, ry, color: 0x2a2a2c }) }
    const [bx, bz] = W(0, -0.3)
    g.box(2.6, 1.0, 3.2, { x: bx, y: 0.8, z: bz, ry, color: 0xe6b21e })
    const [cx, cz] = W(-0.6, 0.4)
    g.box(1.2, 1.5, 1.4, { x: cx, y: 1.8, z: cz, ry, color: 0xe6b21e })
    g.box(1.1, 0.9, 1.42, { x: cx, y: 2.25, z: cz, ry, color: 0x2c3a46, emit: -1 })
    const [ax, az] = W(0.5, 2.0)
    g.box(0.45, 0.45, 3.6, { x: ax, y: 2.6, z: az, ry, rx: -0.55, color: 0xe6b21e })
    const [ex, ez] = W(0.5, 4.2)
    g.box(0.35, 0.35, 2.6, { x: ex, y: 2.2, z: ez, ry, rx: 0.9, color: 0xe6b21e })
    const [kx, kz] = W(0.5, 5.0)
    g.box(1.1, 0.7, 0.8, { x: kx, y: 0.05, z: kz, ry, color: 0x3a3a3a })
  }

  // ---- west: Valea Morilor ---------------------------------------------------------------------
  west() {
    const rnd = this.rnd, X = X0
    // the retaining wall: limestone in courses under a lighter coping, buttresses every 12 m.
    // It runs from the hill's foot north of the river to past the railway in the south; toward the
    // city it's never lower than WALL_W.min
    const topAt = (z) => z >= Z0 - 0.6 && z <= Z1 + 0.6 ? Math.max(westWallTop(z) + 0.1, WALL_W.min) : westWallTop(z) + 0.1
    const cuts = new Set([Z0 - 100, Z1 + 90, RIVER.top1, RIVER.top0, -GATE_HALF, GATE_HALF, PORTAL.z0, PORTAL.z1, Z0 - 0.6, Z1 + 0.6])
    for (let z = Z0 - 100; z < Z1 + 90; z += 4) cuts.add(z)
    const zs = [...cuts].sort((a, b) => a - b)
    // the culvert's headwall (north()) and the police post's barrier fill the two gaps
    const segs = []
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2
      const hole = (zm > RIVER.top1 && zm < RIVER.top0) || Math.abs(zm) < GATE_HALF
      const ta = topAt(za), tb = topAt(zb)
      segs.push({ za, zb, zm, ta, tb, hole: hole || Math.max(ta, tb) < 0.25 })
    }
    let run = null
    const flush = () => { if (run) { this.solid(X - 1, 0, run.z0, X, run.top, run.z1); run = null } }
    segs.forEach((sg, i) => {
      const { za, zb, zm, ta, tb } = sg
      if (sg.hole) { flush(); return }
      const portal = zm > PORTAL.z0 && zm < PORTAL.z1
      const y0 = portal ? 7.2 : 0
      const g = this.g(X, zm)
      // courses on the face, the coping band at the top in a lighter stone
      for (let k = 0, y = y0; y < Math.max(ta, tb) - 0.001; k++, y += 0.55) {
        const ya = Math.min(y + 0.55, ta - 0.14), yb = Math.min(y + 0.55, tb - 0.14)
        if (Math.min(y, ta - 0.14) >= ya && Math.min(y, tb - 0.14) >= yb) break
        const col = STONE[(k + Math.floor(za / 4)) % 4]
        quad(g, [X, Math.min(y, ta - 0.14), za], [X, Math.min(y, tb - 0.14), zb], [X, yb, zb], [X, ya, za], col, [1, 0, 0])
      }
      quad(g, [X, ta - 0.14, za], [X, tb - 0.14, zb], [X, tb, zb], [X, ta, za], 0xe0d6bb, [1, 0, 0])
      quad(g, [X - 0.55, ta, za], [X - 0.55, tb, zb], [X, tb, zb], [X, ta, za], 0xd8ceb2, [0, 1, 0])
      // the back, where the ground behind is lower than the wall (the valley, the tapering ends)
      const ba = terrainHeight(X - 0.55, za, 'w'), bb = terrainHeight(X - 0.55, zb, 'w')
      if (ta - ba > 0.05 || tb - bb > 0.05) quad(g, [X - 0.55, Math.min(ba, ta), za], [X - 0.55, Math.min(bb, tb), zb], [X - 0.55, tb, zb], [X - 0.55, ta, za], STONE[1], [-1, 0, 0])
      // the ends, where the wall stops at an opening
      if (i === 0 || segs[i - 1].hole) quad(g, [X - 0.55, 0, za], [X, 0, za], [X, ta, za], [X - 0.55, ta, za], STONE[0], [0, 0, -1])
      if (i === segs.length - 1 || segs[i + 1].hole) quad(g, [X - 0.55, 0, zb], [X, 0, zb], [X, tb, zb], [X - 0.55, tb, zb], STONE[0], [0, 0, 1])
      // colliders only toward the city
      if (zb > Z0 - 0.6 && za < Z1 + 0.6 && !portal) {
        const top = Math.min(ta, tb)
        if (run && Math.abs(run.top - top) < 0.02 && Math.abs(run.z1 - za) < 1e-6 && zb - run.z0 < 40) run.z1 = zb
        else { flush(); run = { z0: za, z1: zb, top } }
      } else flush()
    })
    flush()
    // buttresses
    for (let z = Z0 + 8; z < Z1 - 8; z += 12) {
      if (Math.abs(z) < GATE_HALF + 3 || (z > PORTAL.z0 - 14 && z < PORTAL.z1 + 4)) continue
      const t = topAt(z) - 0.3, g = this.g(X, z)
      box(g, X, 0, z - 0.35, X + 0.3, t, z + 0.35, STONE[3])
      quad(g, [X, t, z - 0.35], [X + 0.3, t - 0.25, z - 0.35], [X + 0.3, t - 0.25, z + 0.35], [X, t, z + 0.35], 0xd8ceb2, [1, 1, 0])
      this.solid(X - 0.2, 0, z - 0.35, X + 0.3, t, z + 0.35)
    }
    // a dirt path along the foot of the wall, a bench or two
    for (const [a, b] of [[Z0 + 7, -GATE_HALF - 6], [GATE_HALF + 6, PORTAL.z0 - 10]]) {
      for (let z = a; z < b; z += 50) this.path(X + 1.65, z, X + 1.65, Math.min(b, z + 50), 3.3)
    }
    for (const z of [-190, -75, 95, 210]) {
      this.B.atlas(X + 1.2, z, this.kay.bench.geometry, new THREE.Matrix4().compose(new THREE.Vector3(X + 1.2, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)), 'props_far', CF)
      this.w.benches.push({ x: X + 1.2, z, ry: Math.PI / 2 })
    }
    this.sign('REZERVAȚIA „VALEA MORILOR"', { bg: '#2f5a34', fg: '#f2ecd8', w: 384, h: 96, sub: 'NU ARUNCAȚI GUNOIUL · NU HRĂNIȚI ȚÂNȚARII', border: '#f2ecd8' }, { x: X + 0.02, y: 1.6, z: -120, ry: Math.PI / 2, w: 2.8, h: 0.7, lit: 0.2 })
    {
      // ...and the rubbish, right under the sign
      const g = this.g(X + 1, -120)
      const bag = [0x1e1e20, 0x2a2a2e, 0x3a5a8a, 0xd8d0c0]
      for (let i = 0; i < 9; i++) g.sphere(rnd.range(0.25, 0.45), 8, 6, { x: X + 0.5 + rnd() * 1.2, y: 0.18, z: -120 + rnd.range(-1.6, 1.6), sy: 0.75, color: rnd.pick(bag) })
    }

    this.checkpoint(EXITS.find((e) => e.id === 'vest'), -1)
    this.railGate(-1)

    // the woods come down to the wall: a row of full trees along it (the canopy behind them is
    // Terrain.js's), and lighter ones along the valley road
    let k = 0
    for (let z = Z0 - 50; z < Z1 + 60; z += rnd.range(9, 13), k++) {
      if (Math.abs(z) < 22) continue
      const x = X - rnd.range(3.2, 6.5)
      addTreeGeometry(this.g(x, z, 'tree'), x, z, rnd, rnd() < 0.78 ? 'broad' : 'spruce', { y: terrainHeight(x, z, 'w') - 0.1, lod: k % 2 === 1 })
    }
    for (let x = X - 8; x > X - 170; x -= rnd.range(12, 16)) {
      for (const s of [-1, 1]) {
        const z = s * rnd.range(19, 26)
        addTreeGeometry(this.g(x, z, 'tree_far'), x, z, rnd, rnd() < 0.8 ? 'broad' : 'spruce', { y: terrainHeight(x, z, 'w') - 0.1, lod: true })
      }
    }
    this.roadOut(-1)
  }

  // ---- east: the ring highway -----------------------------------------------------------------
  east() {
    const X = X1, rnd = this.rnd, U = HIGHWAY.deck, HY = HIGHWAY.y, R = RIVER
    const opening = (z) => Math.abs(z) < GATE_HALF || (z > PORTAL.z0 && z < PORTAL.z1) || (z > R.top1 && z < R.top0)
    const ceil = 5.3
    const nearZ = (z) => z > Z0 - 60 && z < Z1 + 60
    // the wall: concrete panels with their joints showing, a darker splash band at the foot and the
    // highway's parapet on top; openings for Bd. Dacia, the railway and the Bîc. In 6 m panels by
    // the city, in long runs out of reach
    const cuts = new Set([-HIGHWAY_END, HIGHWAY_END, -GATE_HALF, GATE_HALF, PORTAL.z0, PORTAL.z1, R.top1, R.top0, Z0 - 0.6, Z1 + 0.6])
    for (let z = -HIGHWAY_END; z < HIGHWAY_END; z += nearZ(z) ? 6 : 50) cuts.add(z)
    const zs = [...cuts].sort((a, b) => a - b)
    let run = null
    const flush = () => { if (run) { this.solid(X, 0, run.z0, X + 1, HY + HIGHWAY.parapet, run.z1); run = null } }
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2
      const ta = highwayLevel(0, za), tb = highwayLevel(0, zb)
      if (Math.max(ta, tb) < 0.2) continue
      const near = nearZ(zm), g = near ? this.g(X, zm) : this.far(X, zm)
      // (over the openings the deck's own edge is the face: see under())
      if (!opening(zm)) {
        quad(g, [X, 0, za], [X, 0, zb], [X, 0.7, zb], [X, 0.7, za], [0x6e6b62, 0x6e6b62, 0x8f8c84, 0x8f8c84], [-1, 0, 0])
        quad(g, [X, 0.7, za], [X, 0.7, zb], [X, tb, zb], [X, ta, za], [0x8f8c84, 0x8f8c84, 0x9f9c95, 0x9f9c95], [-1, 0, 0])
        if (near) box(g, X - 0.012, 0.05, za - 0.03, X, ta - 0.05, za + 0.03, 0x5f5c56)
      }
      if (ta > 5 && tb > 5) sweep(g, 'z', za, zb, X, 1, PARAPET.map(([u, y]) => [u, y + Math.min(ta, tb)]), 0xa4a19a, false)
      if (zb > Z0 - 0.6 && za < Z1 + 0.6 && !opening(zm)) {
        if (run && Math.abs(run.z1 - za) < 1e-6 && zb - run.z0 < 40) run.z1 = zb
        else { flush(); run = { z0: za, z1: zb } }
      } else flush()
    }
    flush()
    // graffiti on the stretch by the city
    const tags = [['EBAN = GROAPĂ', '#e8452f'], ['VIVA MOLDOVA', '#2f7de8'], ['ZINA TE VEDE', '#b04ad8'], ['BOTANICA 4EVER', '#28b35a'], ['UNDE-I TROLEIBUZUL?', '#f0b62a']]
    tags.forEach(([t, col], i) => {
      const z = -250 + i * 118 + rnd.range(-12, 12)
      if (opening(z) || Math.abs(z) < 30) return
      this.drawn(256, 80, (x, w, h) => {
        x.fillStyle = '#9f9c95'; x.fillRect(0, 0, w, h)
        x.save(); x.translate(w / 2, h / 2); x.rotate(-0.05)
        x.font = '900 32px Rubik'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'
        x.lineWidth = 6; x.strokeStyle = 'rgba(20,20,24,0.9)'; x.strokeText(t, 0, 0)
        x.fillStyle = col; x.fillText(t, 0, 0)
        x.restore()
      }, { x: X - 0.02, y: 2.1 + (i % 2) * 0.6, z, ry: -Math.PI / 2, w: 5.2, h: 1.6, lit: 0 })
    })

    // Bd. Dacia's underpass: side walls, the deck overhead with strip lights, wing walls down the
    // embankment
    const under = (z0, z1, lights) => {
      const g = this.g(X + U / 2, (z0 + z1) / 2)
      // (the side walls start a hair behind the wall's face, so the two never fight)
      box(g, X + 0.01, 0, z0 - 0.6, X + U, ceil, z0, CONC_D)
      box(g, X + 0.01, 0, z1, X + U, ceil, z1 + 0.6, CONC_D)
      box(g, X, ceil, z0, X + U, HY, z1, CONC)
      quad(g, [X, ceil - 0.01, z0], [X + U, ceil - 0.01, z0], [X + U, ceil - 0.01, z1], [X, ceil - 0.01, z1], 0x3a3936, [0, -1, 0])
      if (lights) for (let x = X + 3; x < X + U - 2; x += 5) for (const z of [z0 + 0.3, z1 - 0.3]) box(g, x - 0.8, ceil - 0.5, z - 0.08, x + 0.8, ceil - 0.36, z + 0.08, 0xfff2c4, 1)
      for (let x = X + U; x < X + HIGHWAY.foot; x += 2) {
        const h0 = highwayLevel(x - X), h1 = highwayLevel(x + 2 - X)
        for (const [za, zb, dir] of [[z0 - 0.6, z0, -1], [z1, z1 + 0.6, 1]]) {
          const zf = dir < 0 ? zb : za
          quad(g, [x, 0, zf], [x + 2, 0, zf], [x + 2, h1, zf], [x, h0, zf], CONC_D, [0, 0, -dir])
          quad(g, [x, h0, za], [x + 2, h1, za], [x + 2, h1, zb], [x, h0, zb], CONC, [0, 1, 0])
        }
      }
    }
    under(-GATE_HALF, GATE_HALF, true)
    under(PORTAL.z0, PORTAL.z1, false)
    // the Bîc goes under the highway: abutments on the banks, the deck above
    {
      const g = this.far(X + U / 2, (R.top0 + R.top1) / 2)
      for (let x = X; x < X + HIGHWAY.foot; x += 2) {
        const h0 = x - X < U ? HY : highwayLevel(x - X), h1 = x + 2 - X < U ? HY : highwayLevel(x + 2 - X)
        quad(g, [x, 0, R.top0], [x + 2, 0, R.top0], [x + 2, h1, R.top0], [x, h0, R.top0], CONC_D, [0, 0, -1])
        quad(g, [x, 0, R.top1], [x + 2, 0, R.top1], [x + 2, h1, R.top1], [x, h0, R.top1], CONC_D, [0, 0, 1])
      }
      box(g, X, ceil, R.top1, X + U, HY, R.top0, CONC)
      quad(g, [X, ceil - 0.01, R.top1], [X + U, ceil - 0.01, R.top1], [X + U, ceil - 0.01, R.top0], [X, ceil - 0.01, R.top0], 0x3a3936, [0, -1, 0])
    }
    this.checkpoint(EXITS.find((e) => e.id === 'est'), 1)
    this.railGate(1)
    this.roadOut(1)
    this.highway()
  }

  // the ring highway on its embankment: two carriageways, a median barrier, lamps and gantries
  highway() {
    const X = X1, HY = HIGHWAY.y, U = HIGHWAY.deck
    const lvl = (z) => highwayLevel(14, z)
    for (let z = -HIGHWAY_END; z < HIGHWAY_END; z += 50) {
      const a = z, b = Math.min(HIGHWAY_END, z + 50), ya = lvl(a), yb = lvl(b)
      if (ya < 0.5 && yb < 0.5) continue
      const g = this.far(X + U / 2, (a + b) / 2)
      quad(g, [X + 0.6, ya + 0.01, a], [X + U - 0.6, ya + 0.01, a], [X + U - 0.6, yb + 0.01, b], [X + 0.6, yb + 0.01, b], ASPHALT, [0, 1, 0])
      if (Math.abs(a) < 900) {
        for (const off of [1.5, 13, 16, 27.5]) g.quad(0.15, b - a, { x: X + off, y: HY + 0.04, z: (a + b) / 2, color: WHITE })
        for (let t = a; t < b; t += 12) for (const off of [7.25, 21.75]) g.quad(0.14, 4, { x: X + off, y: HY + 0.04, z: t + 2, color: WHITE })
      }
      // the median barrier and the outer parapet
      if (ya > 1 && yb > 1) {
        sweep(g, 'z', a, b, X + 14.2, 1, JERSEY.map(([u, y]) => [u - 0.3, y + Math.min(ya, yb)]), 0xa4a19a, false)
        sweep(g, 'z', a, b, X + U, -1, PARAPET.map(([u, y]) => [u, y + Math.min(ya, yb)]), 0xa4a19a, false)
      }
    }
    // lamps on the median, two arms each
    for (let z = -1080; z < 1080; z += 45) {
      const g = this.far(X + 14, z)
      g.box(0.24, 11, 0.24, { x: X + 14, y: HY + 0.8, z, color: 0x6d7378 })
      for (const s of [-1, 1]) {
        g.box(2.2, 0.12, 0.12, { x: X + 14 + s * 1.1, y: HY + 11.6, z, color: 0x6d7378 })
        g.box(0.7, 0.14, 0.34, { x: X + 14 + s * 2.2, y: HY + 11.5, z, color: 0xffd9a0, emit: 1 })
        if (Math.abs(z) < 700) this.w.lamps.push({ x: X + 14 + s * 2.2, z, y: HY + 11.4, gy: HY })
      }
    }
    // gantries: which way the ring goes
    for (const [z, face, main, sub] of [[-95, 0, '↑ BĂLȚI · SOROCA', 'CENTURA · E58'], [95, Math.PI, '↓ TIRASPOL · ODESA', 'CENTURA · M14']]) {
      const g = this.far(X + U / 2, z)
      for (const px of [X + 0.9, X + U - 0.9]) g.box(0.4, 8.2, 0.4, { x: px, y: HY + 0.8, z, color: 0x7d8387 })
      g.box(U, 1.1, 0.5, { x: X + U / 2, y: HY + 8.4, z, color: 0x7d8387 })
      for (const [ox, t, st] of [[U * 0.27, main, sub], [U * 0.73, 'IEȘIRE 12', 'BD. DACIA · AEROPORT']]) {
        this.sign(t, { bg: '#1f6f3a', fg: '#ffffff', w: 320, h: 108, sub: st, border: '#ffffff' }, { x: X + ox, y: HY + 7.3, z: z + (face ? -0.3 : 0.3), ry: face, w: 8.6, h: 2.9, lit: 0.55 })
      }
    }
  }

  // the road on out past a closed exit, following the land: Calea Ieșilor up the valley in the
  // west, Bd. Dacia toward the airport in the east; street lamps all the way into the haze
  roadOut(s) {
    const X = s < 0 ? X0 : X1, region = s < 0 ? 'w' : 'e', B = this.B
    const far = 1500, hw = 7.5
    const at = (d) => X + s * d
    // textured where you can see it up close through the barrier, then following the ground
    {
      const a = at(0.8), b = at(60)
      B.flat((a + b) / 2, 0, 'asphalt_o', 12, CF).rect(Math.min(a, b), -11, Math.max(a, b), 11, 0.02)
    }
    const hgt = (d, z) => terrainHeight(at(d), z, region) + 0.04
    for (let d = 60; d < far; d += 30) {
      const w0 = d < 90 ? 11 : hw, g = this.far(at(d + 15), 0)
      quad(g, [at(d), hgt(d, -w0), -w0], [at(d + 30), hgt(d + 30, -hw), -hw], [at(d + 30), hgt(d + 30, hw), hw], [at(d), hgt(d, w0), w0], ASPHALT, [0, 1, 0])
    }
    for (let d = 45; d < far; d += 9) {
      const g = this.far(at(d), 0), y = (d < 60 ? 0.02 : hgt(d, 0)) + 0.03
      g.quad(3, 0.14, { x: at(d + 1.5), y, z: 0, color: WHITE })
      if (d > 90) for (const o of [-hw + 0.4, hw - 0.4]) g.quad(9, 0.13, { x: at(d + 4.5), y, z: o, color: WHITE })
    }
    for (let d = 30; d < 900; d += 40) {
      const z = (Math.floor(d / 40) % 2 ? 1 : -1) * (hw + 1.2)
      this.post(at(d), z, 0, -Math.sign(z), d < 60 ? 0 : hgt(d, z) - 0.04, 8.5, false)
    }
  }

  // a police post on a road out: red and white jersey blocks and fence panels across the road
  // (the limit), a booth with its boom up, a patrol car, and the signs you pass on the way
  checkpoint(e, s) {
    const X = s < 0 ? X0 : X1
    const at = (u) => X + s * u // u > 0: outward, u < 0: inside
    this.closure('z', X, -e.open, e.open, s)
    const ry = s < 0 ? Math.PI / 2 : -Math.PI / 2 // facing the city
    // the booth, on the verge on the drivers' right going out
    const bz = s < 0 ? -15.6 : 15.6, bu = -9.5, bx = at(bu)
    {
      const g = this.g(bx, bz)
      box(g, bx - 1.3, 0, bz - 1.3, bx + 1.3, 0.25, bz + 1.3, 0x8e8b84)
      box(g, bx - 1.2, 0.25, bz - 1.2, bx + 1.2, 2.6, bz + 1.2, 0xe8e6de)
      box(g, bx - 1.22, 1.9, bz - 1.22, bx + 1.22, 2.2, bz + 1.22, 0x1f4f9c)
      for (const [dx, dz, w, d] of [[0, 1.21, 1.9, 0.02], [0, -1.21, 1.9, 0.02], [1.21, 0, 0.02, 1.9], [-1.21, 0, 0.02, 1.9]]) box(g, bx + dx - w / 2, 1.0, bz + dz - d / 2, bx + dx + w / 2, 1.85, bz + dz + d / 2, 0xffe2a8, 0.9)
      box(g, bx - 1.5, 2.6, bz - 1.5, bx + 1.5, 2.8, bz + 1.5, 0x3a3f46)
      this.solid(bx - 1.3, 0, bz - 1.3, bx + 1.3, 2.8, bz + 1.3)
      this.sign('POST DE POLIȚIE', { bg: '#1f4f9c', fg: '#ffffff', w: 256, h: 48, weight: '900' }, { x: bx, y: 3.15, z: bz - Math.sign(bz) * 1.25, ry: bz < 0 ? 0 : Math.PI, w: 2.6, h: 0.5, lit: 0.9, double: true })
      this.sign('MITĂ NU SE PRIMEȘTE*', { bg: '#f2c318', fg: '#1b1b1b', w: 256, h: 80, sub: '*DUPĂ ORA 18:00' }, { x: at(bu - 1.23), y: 1.5, z: bz, ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, w: 1.5, h: 0.46, lit: 0.4 })
      // the boom, raised: the post is closed anyway
      const px = at(bu + 2.2), pz = bz - Math.sign(bz) * 1.9
      g.box(0.3, 1.0, 0.3, { x: px, y: 0, z: pz, color: 0x3a3f46 })
      this.P.cylinder(px, 0.5, pz, 0.5, 0.2)
      for (let i = 0; i < 7; i++) g.box(0.1, 0.9, 0.1, { x: px, y: 1.0 + i * 0.9, z: pz, rz: 0.12 * s, color: i % 2 ? WHITE : RED })
    }
    this.lamp(at(-6), s < 0 ? -14 : 14, 0, s < 0 ? 1 : -1)
    this.lamp(at(-18), s < 0 ? 14 : -14, 0, s < 0 ? -1 : 1)
    // the patrol car, lights on
    const cz = s < 0 ? 15.4 : -15.4
    this.car(at(-15), cz, s < 0 ? -Math.PI / 2 : Math.PI / 2, 'car_police', null, 0, (m) => {
      const g = this.g(at(-15), cz)
      const p = new THREE.Vector3()
      for (const [lx, col] of [[-0.3, 0xff2a2a], [0.3, 0x2a5aff]]) { p.set(lx, 1.82, -0.2).applyMatrix4(m); g.box(0.5, 0.14, 0.26, { x: p.x, y: p.y, z: p.z, ry: s < 0 ? -Math.PI / 2 : Math.PI / 2, color: col, emit: 1.2 }) }
    })
    this.solid(at(-15) - 2.3, 0, cz - 1.05, at(-15) + 2.3, 1.55, cz + 1.05)
    // cones in front of the blocks
    for (let z = -e.half + 1.5; z < e.half; z += 3.2) this.g(at(-1.6), z).cone(0.2, 0.75, 8, { x: at(-1.6), y: 0.012, z, color: 0xf06a1a })
    // signs going out: the end of Chișinău, where the road goes, and the police
    const rz = s < 0 ? -14.2 : 14.2
    this.g(at(-26), rz).box(0.1, 2.2, 0.1, { x: at(-26), y: 0, z: rz, color: 0x3a3f46 })
    this.drawn(256, 128, (x, w, h) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h)
      x.strokeStyle = '#111111'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10)
      x.font = '900 43px Rubik'; x.fillStyle = '#111111'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CHIȘINĂU', w / 2, h / 2 + 2)
      x.strokeStyle = '#d0202a'; x.lineWidth = 15; x.beginPath(); x.moveTo(20, h - 17); x.lineTo(w - 20, 17); x.stroke()
    }, { x: at(-26), y: 2.2, z: rz, ry, w: 1.9, h: 0.95, lit: 0.35 })
    this.P.cylinder(at(-26), 1.1, rz, 1.1, 0.06)
    const dz = -rz, g2 = this.g(at(-40), dz)
    for (const o of [-1.2, 1.2]) { g2.box(0.12, 3.6, 0.12, { x: at(-40), y: 0, z: dz + o, color: 0x3a3f46 }); this.P.cylinder(at(-40), 1.8, dz + o, 1.8, 0.07) }
    const dest = s < 0 ? [['UNGHENI', '107'], ['IAȘI', '160'], ['STRĂȘENI', '24']] : [['AEROPORT', '13'], ['TIRASPOL', '72'], ['ODESA', '180']]
    this.drawn(256, 150, (x, w, h) => {
      x.fillStyle = '#1f4f9c'; x.fillRect(0, 0, w, h)
      x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.strokeRect(5, 5, w - 10, h - 10)
      x.fillStyle = '#ffffff'; x.textBaseline = 'middle'
      dest.forEach(([t, km], i) => {
        const y = 31 + i * 44
        x.font = '900 29px Rubik'; x.textAlign = 'left'; x.fillText(t, 18, y)
        x.font = '700 29px Rubik'; x.textAlign = 'right'; x.fillText(km, w - 18, y)
      })
    }, { x: at(-40), y: 3.0, z: dz, ry, w: 3.0, h: 1.75, lit: 0.45 })
  }

  // a line of red and white jersey blocks with mobile fence panels behind it, closing a road at the
  // limit. axis: what it runs along ('x' or 'z'); at: the limit line; out: which way is outside
  closure(axis, at, from, to, out) {
    const P = (s, u) => axis === 'x' ? [s, at + out * u] : [at + out * u, s]
    let k = 0
    for (let s = from; s < to - 0.01; s += 2, k++) {
      const s1 = Math.min(to, s + 2) - 0.03
      const [cx, cz] = P((s + s1) / 2, 0.3)
      sweep(this.g(cx, cz), axis, s + 0.03, s1, at, out, JERSEY, k % 2 ? WHITE : RED)
    }
    // fence panels: galvanised frame and mesh on concrete feet
    for (let s = from; s < to - 0.01; s += 3.5) {
      const s1 = Math.min(to, s + 3.5), [cx, cz] = P((s + s1) / 2, 0.75), g = this.g(cx, cz)
      const bar = (a, b, y0, y1, w) => {
        const [x0, z0] = P(a, 0.75 - w / 2), [x1, z1] = P(b, 0.75 + w / 2)
        box(g, Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), 0x9aa0a4)
      }
      bar(s + 0.05, s + 0.1, 0.12, 2.2, 0.045); bar(s1 - 0.1, s1 - 0.05, 0.12, 2.2, 0.045)
      bar(s + 0.05, s1 - 0.05, 2.15, 2.2, 0.045); bar(s + 0.05, s1 - 0.05, 0.12, 0.17, 0.045)
      for (let t = s + 0.45; t < s1 - 0.2; t += 0.45) bar(t, t + 0.018, 0.17, 2.15, 0.018)
      for (let y = 0.8; y < 2.1; y += 0.65) bar(s + 0.1, s1 - 0.1, y, y + 0.018, 0.018)
      const [fx, fz] = P(s, 0.75)
      g.box(axis === 'x' ? 0.22 : 0.7, 0.14, axis === 'x' ? 0.7 : 0.22, { x: fx, y: 0, z: fz, color: 0x8e8b84 })
    }
    // colliders: the blocks' own shape (their face slopes back, a box would stand proud of it),
    // and the fence behind them
    for (let s = from; s < to - 0.01; s += 12.5) {
      const s1 = Math.min(to, s + 12.5)
      for (const prof of JERSEY_HULLS) {
        const pts = []
        for (const t of [s, s1]) for (const [u, y] of prof) { const [x, z] = P(t, u); pts.push(x, y, z) }
        this.P.hull(pts)
      }
    }
    const [cx, cz] = P(from, 0.72), [dx, dz] = P(to, 0.78)
    this.solid(Math.min(cx, dx), 0, Math.min(cz, dz), Math.max(cx, dx), 2.2, Math.max(cz, dz))
    // STOP, facing the city
    const [sx, sz] = P((from + to) / 2, 0.72)
    this.drawn(128, 128, (x, w, h) => {
      x.clearRect(0, 0, w, h)
      for (const [r, col] of [[0.5, '#ffffff'], [0.45, '#c0262d']]) {
        x.fillStyle = col; x.beginPath()
        for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; x.lineTo(w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r) }
        x.fill()
      }
      x.font = '900 35px Rubik'; x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STOP', w / 2, h / 2 + 2)
    }, { x: sx, y: 1.45, z: sz, ry: axis === 'x' ? (out < 0 ? 0 : Math.PI) : (out < 0 ? Math.PI / 2 : -Math.PI / 2), w: 0.9, h: 0.9, lit: 0.5 })
  }

  // the railway's gate at one end: steel leaves across the opening that slide aside for a train
  railGate(s) {
    const X = s < 0 ? X0 : X1, z0 = PORTAL.z0, z1 = PORTAL.z1, H = 5.4, mid = (z0 + z1) / 2
    const g0 = this.g(X, mid)
    if (s < 0) {
      // the tunnel under the hill: a stone portal with a stepped arch, the year on the lintel
      const top = 7.2
      for (let i = 0; i < 5; i++) {
        const inset = (i + 1) * 1.6, y = top - 0.9 + i * 0.22
        box(g0, X - 0.5, y, z0, X, top + 0.6, z0 + inset, STONE[i % 4])
        box(g0, X - 0.5, y, z1 - inset, X, top + 0.6, z1, STONE[(i + 2) % 4])
      }
      box(g0, X - 0.04, 0, z0 - 1.2, X + 0.22, top + 1.2, z0, STONE[3])
      box(g0, X - 0.04, 0, z1, X + 0.22, top + 1.2, z1 + 1.2, STONE[3])
      box(g0, X - 0.04, top + 0.6, z0 - 1.2, X + 0.22, top + 1.4, z1 + 1.2, STONE[3])
      this.solid(X - 0.5, 0, z0 - 1.2, X + 0.22, top + 1.2, z0)
      this.solid(X - 0.5, 0, z1, X + 0.22, top + 1.2, z1 + 1.2)
      this.sign('CFM · 1871', { bg: '#cdbf98', fg: '#4a3a2a', w: 256, h: 48, weight: '900' }, { x: X + 0.24, y: top + 1.0, z: mid, ry: Math.PI / 2, w: 2.6, h: 0.5, lit: 0 })
      this.tunnel(X - 0.5, X - 240, z0, z1, 0, top + 0.6)
    }
    // the leaves: a mesh each, so they can slide
    const mat = this.w.materials.vcol({ roughness: 0.85, detail: 'plaster' })
    const leaves = []
    for (const side of [-1, 1]) {
      const g = new GeoBuilder()
      const a = side < 0 ? z0 : mid + 0.02, b = side < 0 ? mid - 0.02 : z1
      const x0 = Math.min(X + s * 0.05, X + s * 0.17), x1 = Math.max(X + s * 0.05, X + s * 0.17)
      box(g, x0, 0.05, a, x1, 0.2, b, 0x2f4636)
      box(g, x0, H - 0.15, a, x1, H, b, 0x2f4636)
      box(g, x0, 2.6, a, x1, 2.72, b, 0x2f4636)
      for (const e of [a, b - 0.12]) box(g, x0, 0.05, e, x1, H, e + 0.12, 0x2f4636)
      for (let z = a + 0.3; z < b - 0.15; z += 0.28) box(g, x0 + 0.03, 0.2, z, x1 - 0.03, H - 0.15, z + 0.05, (Math.floor(z * 7) % 5) ? 0x35503d : RUST)
      const m = new THREE.Mesh(g.build(), mat)
      m.castShadow = true; m.receiveShadow = true
      m.name = 'rail-gate'
      this.w.scene.add(m)
      leaves.push(m)
    }
    box(g0, X + s * 0.11 - 0.1, H, z0 - 0.4, X + s * 0.11 + 0.1, H + 0.2, z1 + 0.4, 0x3a3f46)
    this.gates.push({ x: X, s, k: 0, want: 0, leaves, span: (z1 - z0) / 2 - 0.2 })
    this.solid(Math.min(X + s * 0.05, X + s * 0.3), 0, z0 - 0.6, Math.max(X + s * 0.05, X + s * 0.3), H, z1 + 0.6)
    this.sign('CFM · ZONĂ DE PAZĂ', { bg: '#ffffff', fg: '#c0262d', w: 384, h: 96, sub: 'ACCESUL PERSOANELOR STRĂINE INTERZIS', border: '#c0262d' }, { x: X - s * 0.02, y: 2.0, z: mid - 3.5, ry: s < 0 ? Math.PI / 2 : -Math.PI / 2, w: 2.6, h: 0.65, lit: 0.3 })
  }

  // ---- south: the railway and the combinat ----------------------------------------------------
  south() {
    const rnd = this.rnd, Z = Z1, B = this.B
    const gate = EXITS.find((e) => e.id === 'combinat')
    const g0 = gate.c - gate.open, g1 = gate.c + gate.open
    // the fence: PO-2 concrete panels between posts, textured both sides
    const panelRun = (a, b) => {
      for (let x = a; x < b - 0.01; x += 4) {
        const p0 = x, p1 = Math.min(b, x + 4), f = B.flat((p0 + p1) / 2, Z, 'fence', 4, C)
        // now and then a panel somebody has sprayed
        const tagged = ((Math.floor(x / 4) * 2654435761) >>> 0) % 17 === 3
        const u0 = tagged ? 0.5 : 0, du = ((p1 - p0) / 4) * 0.5
        const push = (P, N, UV) => { for (let i = 0; i < 6; i++) { f.pos.push(...P[i]); f.nor.push(...N); f.uv.push(...UV[i]) } }
        // city side, seen looking south: the texture runs right to left in x
        push([[p1, 0, Z], [p0, 0, Z], [p0, 2.4, Z], [p1, 0, Z], [p0, 2.4, Z], [p1, 2.4, Z]], [0, 0, -1],
          [[u0, 0], [u0 + du, 0], [u0 + du, 1], [u0, 0], [u0 + du, 1], [u0, 1]])
        push([[p0, 0, Z + 0.16], [p1, 0, Z + 0.16], [p1, 2.4, Z + 0.16], [p0, 0, Z + 0.16], [p1, 2.4, Z + 0.16], [p0, 2.4, Z + 0.16]], [0, 0, 1],
          [[u0, 0], [u0 + du, 0], [u0 + du, 1], [u0, 0], [u0 + du, 1], [u0, 1]])
        const g = this.g(p0, Z)
        box(g, p0 - 0.13, 0, Z + 0.16, p0 + 0.13, 2.72, Z + 0.42, 0x928f87)
        box(g, p0, 2.4, Z, p1, 2.46, Z + 0.16, 0x8d8a82)
      }
      this.solid(a, 0, Z, b, 2.4, Z + 1)
    }
    panelRun(X0 - 0.6, g0)
    panelRun(g1, X1 + 0.6)

    // the combinat's gate: two steel leaves between brick pillars, its name in an arch above
    {
      const g = this.g(gate.c, Z)
      for (const [a, b] of [[g0 - 0.8, g0], [g1, g1 + 0.8]]) {
        box(g, a, 0, Z - 0.2, b, 3.2, Z + 0.6, 0x9a4a34)
        box(g, a - 0.06, 3.2, Z - 0.26, b + 0.06, 3.35, Z + 0.66, 0x7f7a70)
        this.solid(a, 0, Z - 0.2, b, 3.2, Z + 0.6)
      }
      for (const [a, b] of [[g0, gate.c - 0.02], [gate.c + 0.02, g1]]) {
        box(g, a, 0.05, Z + 0.02, b, 2.6, Z + 0.1, 0x3f6e4a)
        box(g, a, 2.5, Z - 0.02, b, 2.6, Z + 0.14, 0x2f5a3a)
        box(g, a, 0.05, Z - 0.02, b, 0.15, Z + 0.14, 0x2f5a3a)
        box(g, a, 1.25, Z - 0.01, b, 1.33, Z + 0.13, 0x2f5a3a)
      }
      this.solid(g0, 0, Z - 0.02, g1, 2.6, Z + 0.6)
      for (const x of [g0 - 0.4, g1 + 0.4]) g.box(0.16, 3.0, 0.16, { x, y: 3.35, z: Z + 0.2, color: 0x3a3f46 })
      g.box(g1 - g0 + 1.2, 0.14, 0.12, { x: gate.c, y: 6.2, z: Z + 0.2, color: 0x3a3f46 })
      this.sign('COMBINATUL „VIITORUL LUMINOS"', { bg: '#7a2a20', fg: '#f2d890', w: 512, h: 56 }, { x: gate.c, y: 5.4, z: Z + 0.12, ry: Math.PI, w: 11.5, h: 1.2, lit: 0.25, double: true })
      this.drawn(128, 128, (x, w, h) => {
        x.fillStyle = '#3f6e4a'; x.fillRect(0, 0, w, h)
        x.fillStyle = '#c0262d'; x.beginPath()
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? w * 0.19 : w * 0.46; x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 4 + Math.sin(a) * r) }
        x.fill()
        const r = mulberry(77)
        x.fillStyle = 'rgba(90,50,30,0.45)'; for (let i = 0; i < 30; i++) x.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 3)
      }, { x: gate.c, y: 1.85, z: Z - 0.025, ry: Math.PI, w: 1.3, h: 1.3, lit: 0 })
      this.sign('PAZĂ · CÂINE RĂU', { bg: '#ffffff', fg: '#c0262d', w: 256, h: 48, border: '#c0262d' }, { x: gate.c + 3, y: 1.0, z: Z - 0.025, ry: Math.PI, w: 1.2, h: 0.24, lit: 0.1 })
      // the guard's hut inside, a light always on
      const hx = g1 + 5, hz = Z + 5
      box(g, hx - 1.3, 0, hz - 1.3, hx + 1.3, 2.5, hz + 1.3, 0xd9cfb8)
      box(g, hx - 1.45, 2.5, hz - 1.45, hx + 1.45, 2.7, hz + 1.45, 0x4a4f55)
      box(g, hx - 0.7, 1.0, hz - 1.32, hx + 0.7, 1.8, hz - 1.3, 0xffd48a, 1)
    }

    // between the tracks and the fence: scrub, a path, a few trees, old sleepers
    for (const [a, b] of [[X0 + 2, g0 - 3], [g1 + 3, X1 - 2]]) {
      for (let x = a; x < b; x += 50) this.path(x, Z - 2.6, Math.min(b, x + 50), Z - 2.6, 2.8)
    }
    for (let x = X0 + 14; x < X1 - 10; x += rnd.range(38, 56)) {
      if (Math.abs(x - gate.c) < gate.open + 6) continue
      this.treeAt(x, Z - rnd.range(6.5, 9.5), rnd() < 0.55 ? 'small' : 'broad')
    }
    for (let i = 0; i < 24; i++) {
      const x = rnd.range(X0 + 4, X1 - 4), z = Z - rnd.range(4.8, 10.5)
      if (Math.abs(x - gate.c) < gate.open + 3) continue
      this.shrub(x, z, rnd.range(0.6, 1.1))
    }
    {
      const g = this.g(120, Z - 8)
      for (let i = 0; i < 9; i++) g.box(2.6, 0.2, 0.28, { x: 120 + rnd.range(-0.2, 0.2), y: Math.floor(i / 3) * 0.2, z: Z - 8 + (i % 3) * 0.34, ry: rnd.range(-0.05, 0.05), color: 0x4a3a2c })
    }
    // the level crossing on Str. Uzinelor: rubber panels flush with the rails, St Andrew's crosses
    {
      const c = gate.c, hw = gate.half, g = this.g(c, RAIL_Z)
      const za = RAIL_Z - 4 - 2.4, zb = RAIL_Z + 4 + 2.4
      for (const t of [RAIL_Z - 4, RAIL_Z + 4]) {
        for (const [p, q] of [[t - 1.6, t - 0.8], [t - 0.64, t + 0.64], [t + 0.8, t + 1.6]]) box(g, c - hw, 0, p, c + hw, 0.14, q, 0x2c2d30)
      }
      box(g, c - hw, 0, za, c + hw, 0.12, RAIL_Z - 4 - 1.6, 0x3a3b3e)
      box(g, c - hw, 0, RAIL_Z - 4 + 1.6, c + hw, 0.12, RAIL_Z + 4 - 1.6, 0x3a3b3e)
      box(g, c - hw, 0, RAIL_Z + 4 + 1.6, c + hw, 0.12, zb, 0x3a3b3e)
      this.solid(c - hw, 0, za, c + hw, 0.12, zb, FILTER.GROUND)
      for (const [x, z, flip] of [[c - hw - 1.6, za - 1.2, 1], [c + hw + 1.6, zb + 1.2, -1]]) {
        g.box(0.1, 2.6, 0.1, { x, y: 0, z, color: 0xe9e6dc })
        this.P.cylinder(x, 1.3, z, 1.3, 0.06)
        for (const r of [0.8, -0.8]) {
          for (let k = -2; k <= 2; k++) g.box(0.24, 0.16, 0.04, { x: x + Math.cos(r) * k * 0.24 * flip, y: 2.3 + Math.sin(r) * k * 0.24, z: z - 0.07 * flip, rz: r * flip, color: k % 2 ? WHITE : RED })
        }
        // the barrier arm, up
        const bx = x + flip * 0.6
        g.box(0.26, 1.1, 0.26, { x: bx, y: 0, z, color: 0x3a3f46 })
        this.P.cylinder(bx, 0.55, z, 0.55, 0.16)
        for (let i = 0; i < 6; i++) g.box(0.09, 0.8, 0.09, { x: bx, y: 1.1 + i * 0.8, z, color: i % 2 ? WHITE : RED })
      }
    }
    this.combinat()
  }

  // what's behind the fence: the old works, sheds, a chimney, silos, a water tower, garages and
  // a freight siding with a crane
  combinat() {
    const rnd = this.rnd, Z = Z1, B = this.B
    const fac = (cx, cz, w, d, h, color, style, roof = 0x5d5a55) => {
      B.facade(cx, cz, C).box(cx, cz, w, d, 0, h, 0, color, [4.2, 3.6, rnd() * 100, style], roof, [1, 1, 1, 1], 0)
      this.w.footprints.push({ x: cx, z: cz, hx: w / 2, hz: d / 2, ry: 0 })
    }
    // yard: cracked concrete from the gate in
    const gate = EXITS.find((e) => e.id === 'combinat')
    const yard = this.far(gate.c, Z + 20)
    quad(yard, [gate.c - 6, 0.03, Z + 0.3], [gate.c + 6, 0.03, Z + 0.3], [gate.c + 6, 0.03, Z + 60], [gate.c - 6, 0.03, Z + 60], 0x6c6a64, [0, 1, 0])
    quad(yard, [-300, 0.025, Z + 8], [60, 0.025, Z + 8], [60, 0.025, Z + 16], [-300, 0.025, Z + 16], 0x66645e, [0, 1, 0])
    // the main hall, windows long gone, with a saw-tooth roof
    fac(-120, Z + 44, 84, 26, 14, 0xa89c86, 3)
    {
      const g = this.far(-120, Z + 44)
      for (let x = -162; x < -78 - 0.1; x += 7) {
        const a = x, b = x + 7, z0 = Z + 31, z1 = Z + 57
        quad(g, [a, 14, z0], [a, 14, z1], [b, 17.5, z1], [b, 17.5, z0], 0x6a6660, [-0.4, 1, 0])
        quad(g, [b, 14, z0], [b, 14, z1], [b, 17.5, z1], [b, 17.5, z0], 0x55606a, [1, 0, 0], -1)
        for (const [z, dir] of [[z0, -1], [z1, 1]]) tri(g, [a, 14, z], [b, 14, z], [b, 17.5, z], 0x9a8e7a, [0, 0, dir])
      }
    }
    this.sign('SLAVĂ MUNCII!', { bg: '#a01e1a', fg: '#f7e7b0', w: 384, h: 64 }, { x: -120, y: 11.5, z: Z + 30.9, ry: Math.PI, w: 14, h: 2.3, lit: 0.15 })
    // offices by the gate
    fac(-222, Z + 26, 38, 12, 13, 0xcbbd9f, 1, 0x6f6a62)
    // boiler house and its chimney
    fac(-48, Z + 58, 20, 14, 10, 0xa65f45, 7)
    {
      const g = this.far(-34, Z + 64)
      g.cyl(1.4, 2.3, 44, 12, { x: -34, y: 0, z: Z + 64, color: 0x9a4a34 })
      g.cyl(1.55, 1.55, 1.2, 12, { x: -34, y: 38, z: Z + 64, color: 0xe9e6dc })
      g.cyl(1.5, 1.5, 0.8, 12, { x: -34, y: 43.4, z: Z + 64, color: 0x3a2a24 })
    }
    // sheds and a warehouse
    fac(40, Z + 30, 60, 18, 8, 0x8d9aa0, 0)
    fac(118, Z + 36, 44, 22, 10, 0x9aa39a, 2)
    // silos with a head house
    {
      const g = this.far(205, Z + 44)
      for (let i = 0; i < 3; i++) g.cyl(3.2, 3.2, 22, 14, { x: 196 + i * 7, y: 0, z: Z + 44, color: 0xb9b4a8 })
      box(g, 192, 22, Z + 41, 214, 26, Z + 47, 0xa8a398)
      g.box(1.2, 1.2, 28, { x: 214, y: 14, z: Z + 30, rx: 0.5, color: 0x6a6660 })
    }
    this.w.footprints.push({ x: 203, z: Z + 44, hx: 11, hz: 3.2, ry: 0 })
    // the water tower
    {
      const s = 2.4
      this.B.atlas(268, Z + 26, this.kay.watertower.geometry, new THREE.Matrix4().compose(new THREE.Vector3(268, 0, Z + 26), new THREE.Quaternion(), new THREE.Vector3(s, s, s)), 'props_far', CF)
    }
    // the garage cooperative, every door a different colour
    {
      const g = this.far(-380, Z + 26)
      const doors = [0x6a7f8e, 0x8e3b2f, 0x3f6e4a, 0xb08a3a, 0x5a5e66, 0x7a4a2a, 0x2f4f7a, 0x9aa2a8]
      box(g, -452, 0, Z + 22, -318, 2.7, Z + 30, 0xa7a196)
      box(g, -452.3, 2.7, Z + 21.7, -317.7, 2.9, Z + 30.3, 0x4a4a48)
      for (let x = -451; x < -319; x += 3.3) box(g, x + 0.3, 0.05, Z + 21.97, x + 3.0, 2.3, Z + 22, rnd.pick(doors))
      this.w.footprints.push({ x: -385, z: Z + 26, hx: 67, hz: 4, ry: 0 })
    }
    // the freight siding: a track, wagons, a gantry crane
    {
      const g = this.far(390, Z + 14)
      for (const dz of [-0.72, 0.72]) box(g, 290, 0.03, Z + 14 + dz - 0.045, 474, 0.17, Z + 14 + dz + 0.045, 0x8a8f96)
      box(g, 290, 0.0, Z + 12.4, 474, 0.04, Z + 15.6, 0x5a534b)
      const wag = [[308, 'box'], [323, 'box'], [338, 'tank'], [352, 'tank'], [367, 'box'], [420, 'box']]
      for (const [x, kind] of wag) {
        if (kind === 'box') { box(g, x - 6.8, 0.9, Z + 12.55, x + 6.8, 4.6, Z + 15.45, rnd.pick([0x6b3a28, 0x5a4232, 0x7a4a30])); box(g, x - 6.9, 4.6, Z + 12.5, x + 6.9, 4.8, Z + 15.5, 0x4a4442) }
        else { g.cyl(1.45, 1.45, 11.5, 12, { x, y: 2.4, z: Z + 14, rz: Math.PI / 2, center: true, color: 0x2a2a2c }); g.cyl(0.4, 0.4, 0.5, 8, { x, y: 3.9, z: Z + 14, color: 0x2a2a2c }) }
        box(g, x - 6.9, 0.55, Z + 12.8, x + 6.9, 0.9, Z + 15.2, 0x1e1e20)
        for (const dx of [-4.8, 4.8]) for (const dz of [-0.72, 0.72]) g.cyl(0.45, 0.45, 0.2, 8, { x: x + dx, y: 0.45, z: Z + 14 + dz, rx: Math.PI / 2, center: true, color: 0x1e1e20 })
      }
      for (const x of [372, 408]) {
        for (const dz of [-6, 7]) box(g, x - 0.35, 0, Z + 14 + dz - 0.35, x + 0.35, 13, Z + 14 + dz + 0.35, 0x2f5f9a)
        box(g, x - 0.5, 12.2, Z + 7, x + 0.5, 13.4, Z + 22, 0x2f5f9a)
      }
      box(g, 370, 12.6, Z + 12, 410, 13.6, Z + 13.2, 0xd8a020)
      box(g, 388, 10.8, Z + 12.2, 391, 12.6, Z + 15, 0xd8a020)
    }
    // yard lamps
    for (const [x, z] of [[-170, Z + 20], [-60, Z + 22], [60, Z + 16], [180, Z + 22], [330, Z + 24]]) this.post(x, z, 0, -1, 0, 8)
  }

  // ---- per frame: the line you get at the edge, the out-of-bounds guard, the railway gates ------
  update(dt) {
    const g = this.w.game
    this.gatesUpdate(dt)
    if (!g || g.state !== 'play' || g.paused || g.cutscene || !g.player || g.home?.inside) return
    const p = g.player, v = p.vehicle, pos = v ? v.pos : p.pos
    const d = edgeDistance(pos.x, pos.z)
    // the barriers are solid, but should anything ever get past one (a scripted jump, a physics
    // hiccup), the city puts you straight back where you last stood well inside it
    if (d > 3 && pos.y > -2 && pos.y < 12) this.safe = { x: pos.x, y: pos.y, z: pos.z, h: v ? v.heading : p.char.heading }
    if (d < -0.8 && this.safe && !p.passenger) {
      const s = this.safe
      if (v) v.teleport(s.x, s.y + 0.3, s.z, s.h)
      else p.teleport(s.x, s.y, s.z, s.h)
      g.cameraRig?.snap()
      g.ui?.notify('Hopa. Orașul te-a tras înapoi.', 2.4)
      return
    }
    // one line per visit: when you get to the barrier, and not again until you've walked away (a
    // different stretch of the edge in the same visit, say the police post along the wall, still
    // gets its own)
    const near = v ? 3.6 : 1.3
    if (d < near) {
      const k = this.stretch(pos.x, pos.z)
      this.visit ||= new Set()
      if (!this.visit.has(k)) { this.visit.add(k); this.say(k) }
    } else if (this.visit && d > 30) this.visit = null
  }

  // which stretch of the edge (x, z) is at
  stretch(x, z) {
    const ex = exitAt(x, z, 8)
    if (ex) return ex.id
    const dW = x - X0, dE = X1 - x, dN = z - Z0, dS = Z1 - z
    const m = Math.min(dW, dE, dN, dS)
    if ((m === dW || m === dE) && z > PORTAL.z0 - 5 && z < PORTAL.z1 + 5) return m === dW ? 'tunel' : 'cfm'
    return m === dN ? 'bic' : m === dS ? 'gard' : m === dW ? 'padure' : 'centura'
  }

  say(k) {
    const lines = LINES[k]
    const i = this.turn[k] ?? 0
    this.turn[k] = (i + 1) % lines.length
    this.lastLine = { stretch: k, text: lines[i] }
    this.w.game.ui?.notify(lines[i], 4.2)
  }

  gatesUpdate(dt) {
    if (!this.gates.length) return
    // a train anywhere near a gate? (Kit.js names the train's group)
    this.trainT -= dt
    if (this.trainT <= 0) {
      this.trainT = 0.25
      const trains = this.w.scene.children.filter((o) => o.name === 'train' && o.visible)
      for (const gt of this.gates) {
        gt.want = trains.some((t) => {
          const a = t.position.x - 20, b = t.position.x + 75
          return t.position.z > PORTAL.z0 && t.position.z < PORTAL.z1 && b > gt.x - 170 && a < gt.x + 170
        }) ? 1 : 0
      }
    }
    for (const gt of this.gates) {
      if (Math.abs(gt.want - gt.k) < 1e-4) continue
      gt.k += Math.sign(gt.want - gt.k) * Math.min(Math.abs(gt.want - gt.k), dt * 0.35)
      const e = gt.k * gt.k * (3 - 2 * gt.k)
      gt.leaves[0].position.z = -e * gt.span
      gt.leaves[1].position.z = e * gt.span
      for (const m of gt.leaves) m.updateMatrix()
    }
  }
}
