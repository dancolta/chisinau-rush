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
export const WORLD = { x0: -500, x1: 500, z0: -350, z1: 380 }
export const RAIL_Z = 318

// what fills each block: [row][col]
export const ZONES = [
  ['soviet', 'circ', 'soviet', 'soviet', 'soviet', 'soviet', 'ambasada'],
  ['hotel', 'opera', 'primaria', 'guvern', 'parlament', 'presedintia', 'usm'],
  ['teatru', 'muzeu', 'istoric', 'catedrala', 'gradina', 'piata', 'autogara'],
  ['soviet', 'garaje', 'soviet', 'acasa', 'linella', 'soviet', 'gara'],
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
