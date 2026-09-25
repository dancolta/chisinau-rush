import { H_ROADS, V_ROADS, BLOCKS, CURB_H, LANE_W, WORLD } from './CityLayout.js'
import { CHUNK } from './Batches.js'
import { FILTER } from '../physics/Physics.js'

// Road geometry parameters derived from each road definition
export function roadProfile(r) {
  const median = r.boulevard ? 0.5 : 0
  const travel = median + r.lanes * LANE_W // |offset| where travel lanes end
  const parking = r.w / 2 - travel         // leftover = parking strip
  return { median, travel, parking }
}

const WHITE = 0xe9e6dc
const YELLOW = 0xe8c14a
const MARK_Y = 0.014

// split a long rect into <= CHUNK pieces along its long axis
function split(x0, z0, x1, z1, fn) {
  const w = x1 - x0, d = z1 - z0
  if (w >= d) {
    const n = Math.max(1, Math.ceil(w / CHUNK))
    for (let i = 0; i < n; i++) fn(x0 + (w * i) / n, z0, x0 + (w * (i + 1)) / n, z1)
  } else {
    const n = Math.max(1, Math.ceil(d / CHUNK))
    for (let i = 0; i < n; i++) fn(x0, z0 + (d * i) / n, x1, z0 + (d * (i + 1)) / n)
  }
}

export function buildGround(world) {
  const B = world.batches
  const asphalt = (x0, z0, x1, z1) => split(x0, z0, x1, z1, (a, b, c, d) => B.flat((a + c) / 2, (b + d) / 2, 'asphalt', 12).rect(a, b, c, d, 0))
  const mark = (cx, cz) => B.vcol(cx, cz, 'markings')

  // ---- carriageways --------------------------------------------------------
  const vFirst = V_ROADS[0], vLast = V_ROADS[V_ROADS.length - 1]
  const hFirst = H_ROADS[0], hLast = H_ROADS[H_ROADS.length - 1]
  for (const h of H_ROADS) asphalt(vFirst.x - vFirst.w / 2, h.z - h.w / 2, vLast.x + vLast.w / 2, h.z + h.w / 2)
  for (const v of V_ROADS) {
    for (let i = 0; i < H_ROADS.length - 1; i++) {
      const a = H_ROADS[i], b = H_ROADS[i + 1]
      asphalt(v.x - v.w / 2, a.z + a.w / 2, v.x + v.w / 2, b.z - b.w / 2)
    }
  }

  // ---- blocks: raised slab with sidewalk band, curb and base interior -------
  for (const b of BLOCKS) {
    world.physics.box(b.cx, CURB_H / 2, b.cz, b.w / 2, CURB_H / 2, b.d / 2, { groups: FILTER.GROUND, friction: 0.9 })
    const y = CURB_H
    // sidewalk band (4 strips)
    const pave = (x0, z0, x1, z1) => split(x0, z0, x1, z1, (a, c, e, f) => B.flat((a + e) / 2, (c + f) / 2, 'paving', 4).rect(a, c, e, f, y))
    pave(b.x0, b.z0, b.x1, b.iz0)
    pave(b.x0, b.iz1, b.x1, b.z1)
    pave(b.x0, b.iz0, b.ix0, b.iz1)
    pave(b.ix1, b.iz0, b.x1, b.iz1)
    // curbstone strip on top edge + vertical curb face
    const cs = 0.28
    const curbTop = (x0, z0, x1, z1) => split(x0, z0, x1, z1, (a, c, e, f) => B.flat((a + e) / 2, (c + f) / 2, 'curb_o', 3).rect(a, c, e, f, y + 0.002))
    curbTop(b.x0, b.z0, b.x1, b.z0 + cs)
    curbTop(b.x0, b.z1 - cs, b.x1, b.z1)
    curbTop(b.x0, b.z0 + cs, b.x0 + cs, b.z1 - cs)
    curbTop(b.x1 - cs, b.z0 + cs, b.x1, b.z1 - cs)
    const face = (x0, z0, x1, z1, nx, nz) => B.flat((x0 + x1) / 2, (z0 + z1) / 2, 'curb', 3).wall(x0, z0, x1, z1, 0, y, nx, nz)
    face(b.x0, b.z0, b.x1, b.z0, 0, -1)
    face(b.x0, b.z1, b.x1, b.z1, 0, 1)
    face(b.x0, b.z0, b.x0, b.z1, -1, 0)
    face(b.x1, b.z0, b.x1, b.z1, 1, 0)
    // base interior surface (landmark builders add patches on top)
    const base = baseSurface(b.zone)
    split(b.ix0, b.iz0, b.ix1, b.iz1, (a, c, e, f) => B.flat((a + e) / 2, (c + f) / 2, base, base === 'grass' ? 22 : base === 'plaza' ? 8 : 12).rect(a, c, e, f, y))
  }

  // ---- outskirts (outside the ring roads) -----------------------------------
  const og = (x0, z0, x1, z1) => split(x0, z0, x1, z1, (a, c, e, f) => B.flat((a + e) / 2, (c + f) / 2, 'grass_o', 22).rect(a, c, e, f, 0.01))
  const nEdge = hFirst.z - hFirst.w / 2, sEdge = hLast.z + hLast.w / 2
  const wEdge = vFirst.x - vFirst.w / 2, eEdge = vLast.x + vLast.w / 2
  og(WORLD.x0, WORLD.z0, WORLD.x1, nEdge - 2)
  og(WORLD.x0, sEdge + 2, WORLD.x1, WORLD.z1)
  og(WORLD.x0, nEdge - 2, wEdge - 2, sEdge + 2)
  og(eEdge + 2, nEdge - 2, WORLD.x1, sEdge + 2)
  // gravel verge along the ring roads
  const verge = (x0, z0, x1, z1) => split(x0, z0, x1, z1, (a, c, e, f) => B.flat((a + e) / 2, (c + f) / 2, 'dirt_o', 6).rect(a, c, e, f, 0.006))
  verge(wEdge - 2, nEdge - 2, eEdge + 2, nEdge)
  verge(wEdge - 2, sEdge, eEdge + 2, sEdge + 2)
  verge(wEdge - 2, nEdge, wEdge, sEdge)
  verge(eEdge, nEdge, eEdge + 2, sEdge)

  // ---- markings --------------------------------------------------------------
  for (const h of H_ROADS) {
    const p = roadProfile(h)
    for (let j = 0; j < V_ROADS.length - 1; j++) {
      const va = V_ROADS[j], vb = V_ROADS[j + 1]
      const xs = va.x + va.w / 2 + 4.6, xe = vb.x - vb.w / 2 - 4.6
      linesAlong(mark, 'x', h.z, xs, xe, p, h)
      stopLine(mark, 'x', h.z, xe + 0.4, p, +1) // eastbound lanes (south side) stop before the east intersection
      stopLine(mark, 'x', h.z, xs - 0.4, p, -1) // westbound lanes (north side) stop before the west intersection
    }
  }
  for (const v of V_ROADS) {
    const p = roadProfile(v)
    for (let i = 0; i < H_ROADS.length - 1; i++) {
      const ha = H_ROADS[i], hb = H_ROADS[i + 1]
      const zs = ha.z + ha.w / 2 + 4.6, ze = hb.z - hb.w / 2 - 4.6
      linesAlong(mark, 'z', v.x, zs, ze, p, v)
      stopLine(mark, 'z', v.x, zs - 0.4, p, +1) // northbound (east side) stops before the north intersection
      stopLine(mark, 'z', v.x, ze + 0.4, p, -1) // southbound (west side) stops before the south intersection
    }
  }
  // zebra crossings on every arm of every intersection that leads into the grid
  for (const h of H_ROADS) for (const v of V_ROADS) {
    const arms = []
    if (v !== V_ROADS[0]) arms.push('w')
    if (v !== V_ROADS[V_ROADS.length - 1]) arms.push('e')
    if (h !== H_ROADS[0]) arms.push('n')
    if (h !== H_ROADS[H_ROADS.length - 1]) arms.push('s')
    for (const a of arms) zebra(mark, v, h, a)
  }
}

function baseSurface(zone) {
  switch (zone) {
    case 'guvern': case 'gara': case 'circ': return 'plaza'
    case 'piata': case 'autogara': return 'asphalt'
    default: return 'grass'
  }
}

function dashes(mark, axis, c, off, s, e, dash, gap, width, color) {
  for (let t = s; t < e; t += dash + gap) {
    const t1 = Math.min(e, t + dash), mid = (t + t1) / 2, len = t1 - t
    if (len < 0.3) continue
    if (axis === 'x') mark(mid, c + off).quad(len, width, { x: mid, y: MARK_Y, z: c + off, color })
    else mark(c + off, mid).quad(width, len, { x: c + off, y: MARK_Y, z: mid, color })
  }
}

function solid(mark, axis, c, off, s, e, width, color) {
  const n = Math.max(1, Math.ceil((e - s) / CHUNK))
  for (let i = 0; i < n; i++) {
    const a = s + ((e - s) * i) / n, b = s + ((e - s) * (i + 1)) / n, mid = (a + b) / 2
    if (axis === 'x') mark(mid, c + off).quad(b - a, width, { x: mid, y: MARK_Y, z: c + off, color })
    else mark(c + off, mid).quad(width, b - a, { x: c + off, y: MARK_Y, z: mid, color })
  }
}

function linesAlong(mark, axis, c, s, e, p, road) {
  if (e <= s) return
  if (road.boulevard) { solid(mark, axis, c, -0.22, s, e, 0.14, WHITE); solid(mark, axis, c, 0.22, s, e, 0.14, WHITE) }
  else if (road.lanes >= 2) { solid(mark, axis, c, -0.12, s, e, 0.12, YELLOW); solid(mark, axis, c, 0.12, s, e, 0.12, YELLOW) }
  else dashes(mark, axis, c, 0, s, e, 3, 4.5, 0.14, WHITE)
  for (let k = 1; k < road.lanes; k++) {
    const o = p.median + k * LANE_W
    dashes(mark, axis, c, o, s, e, 3, 6, 0.13, WHITE)
    dashes(mark, axis, c, -o, s, e, 3, 6, 0.13, WHITE)
  }
  if (p.parking > 0.5) {
    solid(mark, axis, c, p.travel, s, e, 0.12, WHITE)
    solid(mark, axis, c, -p.travel, s, e, 0.12, WHITE)
  }
}

// dir +1: lanes on the positive side of the centreline, -1: negative side
function stopLine(mark, axis, c, at, p, dir) {
  const a = p.median, b = p.travel
  const mid = c + dir * (a + b) / 2, len = b - a
  if (axis === 'x') mark(at, mid).quad(0.45, len, { x: at, y: MARK_Y, z: mid, color: WHITE })
  else mark(mid, at).quad(len, 0.45, { x: mid, y: MARK_Y, z: at, color: WHITE })
}

function zebra(mark, v, h, arm) {
  const stripeW = 0.55, gap = 0.6, len = 3.2
  if (arm === 'w' || arm === 'e') {
    const x = arm === 'w' ? v.x - v.w / 2 - 0.5 - len / 2 : v.x + v.w / 2 + 0.5 + len / 2
    for (let z = h.z - h.w / 2 + 0.6; z < h.z + h.w / 2 - 0.4; z += stripeW + gap) mark(x, z).quad(len, stripeW, { x, y: MARK_Y, z: z + stripeW / 2, color: WHITE })
  } else {
    const z = arm === 'n' ? h.z - h.w / 2 - 0.5 - len / 2 : h.z + h.w / 2 + 0.5 + len / 2
    for (let x = v.x - v.w / 2 + 0.6; x < v.x + v.w / 2 - 0.4; x += stripeW + gap) mark(x, z).quad(stripeW, len, { x: x + stripeW / 2, y: MARK_Y, z, color: WHITE })
  }
}
