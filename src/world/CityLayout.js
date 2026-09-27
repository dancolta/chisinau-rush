// Chișinău Centru, compressed into a drivable grid. Pure data + geometry helpers.
// x = east, z = south, metres. Bd. Ștefan cel Mare is the E-W spine at z = 0.

export const H_ROADS = [
  { id: 'N2', z: -270, w: 12, sw: 4.5, lanes: 1, name: 'Str. Alexei Mateevici', ring: true },
  { id: 'N1', z: -140, w: 14, sw: 5, lanes: 2, name: 'Str. 31 August 1989' },
  { id: 'BD', z: 0, w: 22, sw: 8, lanes: 3, name: 'Bd. Ștefan cel Mare și Sfânt', boulevard: true },
  { id: 'S1', z: 140, w: 14, sw: 5, lanes: 2, name: 'Str. Mihai Eminescu' },
  { id: 'S2', z: 270, w: 12, sw: 4.5, lanes: 1, name: 'Str. Alexandru cel Bun', ring: true },
]

export const V_ROADS = [
  { id: 'VW', x: -420, w: 12, sw: 4.5, lanes: 1, name: 'Str. Pan Halippa', ring: true },
  { id: 'V1', x: -300, w: 12, sw: 4.5, lanes: 1, name: 'Str. Petru Movilă' },
  { id: 'V2', x: -180, w: 12, sw: 4.5, lanes: 1, name: 'Str. Vlaicu Pârcălab' },
  { id: 'V3', x: -60, w: 12, sw: 4.5, lanes: 1, name: 'Str. Bănulescu-Bodoni' },
  { id: 'V4', x: 60, w: 12, sw: 4.5, lanes: 1, name: 'Str. Alexandru Pușkin' },
  { id: 'V5', x: 180, w: 12, sw: 4.5, lanes: 1, name: 'Str. Armenească' },
  { id: 'V6', x: 300, w: 14, sw: 5, lanes: 2, name: 'Str. Ismail' },
  { id: 'VE', x: 420, w: 12, sw: 4.5, lanes: 1, name: 'Bd. Iurie Gagarin', ring: true },
]

export const LANE_W = 3.5
export const CURB_H = 0.16
export const RAIL_Z = 318

// The playable city ends at a barrier you can see on every side (Edge.js builds them): the Bîc's
// parapet in the north, the Valea Morilor retaining wall in the west, the ring highway's wall in
// the east and the railway's concrete fence in the south. These are their inner faces, and the
// colliders stand exactly there.
export const BOUNDS = { x0: -478, x1: 478, z0: -330, z1: 336 }

// What's built and drawn on the map: the city plus a strip of what lies beyond the edge (the
// river, the wooded slope, the highway, the old combinat). Past it there's only the horizon.
export const WORLD = { x0: BOUNDS.x0 - 60, x1: BOUNDS.x1 + 60, z0: BOUNDS.z0 - 60, z1: BOUNDS.z1 + 60 }

// how far inside the playable limit (x, z) is; negative once past it
export function edgeDistance(x, z) {
  return Math.min(x - BOUNDS.x0, BOUNDS.x1 - x, z - BOUNDS.z0, BOUNDS.z1 - z)
}

// what fills each block: [row][col]
export const ZONES = [
  ['soviet', 'circ', 'soviet', 'soviet', 'soviet', 'soviet', 'ambasada'],
  ['hotel', 'opera', 'primaria', 'guvern', 'parlament', 'presedintia', 'usm'],
  ['teatru', 'muzeu', 'istoric', 'catedrala', 'gradina', 'piata', 'autogara'],
  ['soviet', 'garaje', 'soviet', 'acasa', 'linella', 'romasca', 'gara'],
]

export function blockRect(col, row) {
  const W = V_ROADS[col], E = V_ROADS[col + 1], N = H_ROADS[row], S = H_ROADS[row + 1]
  const x0 = W.x + W.w / 2, x1 = E.x - E.w / 2, z0 = N.z + N.w / 2, z1 = S.z - S.w / 2
  return {
    id: `C${col}R${row}`, col, row, zone: ZONES[row][col],
    x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0,
    // inner edges (inside the sidewalk band)
    ix0: x0 + W.sw, ix1: x1 - E.sw, iz0: z0 + N.sw, iz1: z1 - S.sw,
    roads: { w: W, e: E, n: N, s: S },
  }
}

export const BLOCKS = []
for (let r = 0; r < H_ROADS.length - 1; r++) for (let c = 0; c < V_ROADS.length - 1; c++) BLOCKS.push(blockRect(c, r))
export const block = (c, r) => BLOCKS[r * (V_ROADS.length - 1) + c]

export const INTERSECTIONS = []
for (const h of H_ROADS) for (const v of V_ROADS) INTERSECTIONS.push({ id: `${v.id}x${h.id}`, x: v.x, z: h.z, v, h, w: v.w, d: h.w })

export const GRID = {
  x0: V_ROADS[0].x, x1: V_ROADS[V_ROADS.length - 1].x,
  z0: H_ROADS[0].z, z1: H_ROADS[H_ROADS.length - 1].z,
}

// Roads that leave the grid and end at the edge: the boulevard both ways (a police post at each
// end), Pușkin north onto the Bîc bridge that has been "under repair" for years, and Vlaicu
// Pârcălab south over the level crossing to the gate of the old combinat.
// Each stub runs from the ring road to the limit; `c` is its centreline, `half` half its
// carriageway, `open` half the gap it leaves in the barrier (carriageway plus kerbside).
export const EXITS = [
  { id: 'vest', side: 'w', road: 'BD', name: 'Calea Ieșilor', shoulder: 1.5 },
  { id: 'est', side: 'e', road: 'BD', name: 'Bd. Dacia', shoulder: 1.5 },
  { id: 'pod', side: 'n', road: 'V4', name: 'Str. Alexandru Pușkin', shoulder: 3 },
  { id: 'combinat', side: 's', road: 'V2', name: 'Str. Uzinelor', shoulder: 1 },
].map((e) => {
  const r = H_ROADS.find((h) => h.id === e.road) || V_ROADS.find((v) => v.id === e.road)
  const ring = { w: V_ROADS[0], e: V_ROADS[V_ROADS.length - 1], n: H_ROADS[0], s: H_ROADS[H_ROADS.length - 1] }[e.side]
  const horizontal = e.side === 'w' || e.side === 'e'
  const c = horizontal ? r.z : r.x, half = r.w / 2
  // from the ring road's outer edge to the limit
  const from = horizontal ? ring.x + (e.side === 'w' ? -1 : 1) * ring.w / 2 : ring.z + (e.side === 'n' ? -1 : 1) * ring.w / 2
  const to = { w: BOUNDS.x0, e: BOUNDS.x1, n: BOUNDS.z0, s: BOUNDS.z1 }[e.side]
  const a = Math.min(from, to), b = Math.max(from, to)
  const rect = horizontal ? { x0: a, x1: b, z0: c - half, z1: c + half } : { x0: c - half, x1: c + half, z0: a, z1: b }
  return { ...e, r, horizontal, c, half, open: half + e.shoulder, from, to, rect }
})

export function exitAt(x, z, pad = 0) {
  for (const e of EXITS) {
    const R = e.rect, o = e.open - e.half + pad
    if (e.horizontal ? x >= R.x0 - pad && x <= R.x1 + pad && z >= R.z0 - o && z <= R.z1 + o : x >= R.x0 - o && x <= R.x1 + o && z >= R.z0 - pad && z <= R.z1 + pad) return e
  }
  return null
}

// Is (x,z) on a road carriageway?
export function onRoad(x, z, pad = 0) {
  for (const h of H_ROADS) if (Math.abs(z - h.z) <= h.w / 2 + pad && x >= GRID.x0 - 6 && x <= GRID.x1 + 6) return h
  for (const v of V_ROADS) if (Math.abs(x - v.x) <= v.w / 2 + pad && z >= GRID.z0 - 6 && z <= GRID.z1 + 6) return v
  return null
}

export function blockAt(x, z) {
  for (const b of BLOCKS) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b
  return null
}

// Named street for the HUD location readout
export function streetName(x, z) {
  const ex = exitAt(x, z, 2)
  if (ex) return ex.name
  // the promenade along the river
  if (z < BOUNDS.z0 + 12) return 'Str. Albișoara'
  let best = null, bd = 1e9
  for (const h of H_ROADS) { const d = Math.abs(z - h.z) - h.w / 2 - h.sw; if (d < bd && x >= GRID.x0 - 20 && x <= GRID.x1 + 20) { bd = d; best = h.name } }
  for (const v of V_ROADS) { const d = Math.abs(x - v.x) - v.w / 2 - v.sw; if (d < bd && z >= GRID.z0 - 20 && z <= GRID.z1 + 20) { bd = d; best = v.name } }
  return best
}

export const DISTRICTS = [
  { name: 'Centru', test: (x, z) => z > -150 && z < 150 },
  { name: 'Râșcani', test: (x, z) => z <= -150 },
  { name: 'Botanica', test: (x, z) => z >= 150 && x < 300 },
  { name: 'Gara', test: (x, z) => z >= 150 && x >= 300 },
]
export function districtAt(x, z) { const d = DISTRICTS.find((k) => k.test(x, z)); return d ? d.name : 'Chișinău' }
