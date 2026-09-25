import { H_ROADS, V_ROADS, LANE_W } from './CityLayout.js'
import { roadProfile } from './Ground.js'

// Directed lane graph for AI drivers and GPS routing.
// Node = intersection. Edge = one travel direction of a road segment between two intersections.
export class RoadGraph {
  constructor() {
    this.nodes = []
    this.nodeAt = new Map()
    for (let i = 0; i < H_ROADS.length; i++) for (let j = 0; j < V_ROADS.length; j++) {
      const h = H_ROADS[i], v = V_ROADS[j]
      const n = { id: `${j}:${i}`, i, j, x: v.x, z: h.z, h, v, out: [], in: [], controlled: null }
      this.nodes.push(n); this.nodeAt.set(n.id, n)
    }
    this.edges = []
    const node = (j, i) => this.nodeAt.get(`${j}:${i}`)
    // horizontal roads: east (+x) and west (-x)
    for (let i = 0; i < H_ROADS.length; i++) {
      const h = H_ROADS[i], p = roadProfile(h)
      for (let j = 0; j < V_ROADS.length - 1; j++) {
        const a = node(j, i), b = node(j + 1, i)
        this.addEdge(a, b, 'E', h, p)
        this.addEdge(b, a, 'W', h, p)
      }
    }
    for (let j = 0; j < V_ROADS.length; j++) {
      const v = V_ROADS[j], p = roadProfile(v)
      for (let i = 0; i < H_ROADS.length - 1; i++) {
        const a = node(j, i), b = node(j, i + 1)
        this.addEdge(a, b, 'S', v, p)
        this.addEdge(b, a, 'N', v, p)
      }
    }
  }

  // lane offset from the road centreline (right-hand traffic, lane 0 = inner)
  static laneOffset(p, k) { return p.median + LANE_W * (k + 0.5) }

  addEdge(from, to, dir, road, prof) {
    const e = { id: this.edges.length, from, to, dir, road, prof, lanes: road.lanes, speed: road.boulevard ? 15 : road.lanes >= 2 ? 13 : 10.5 }
    // unit direction + right-hand vector (-fz, fx): east -> +z, north -> +x
    const dx = Math.sign(to.x - from.x), dz = Math.sign(to.z - from.z)
    e.fx = dx; e.fz = dz
    e.rx = -dz; e.rz = dx
    // start just after the far side of the 'from' intersection (+ zebra), end at the stop line of 'to'
    const halfFrom = dir === 'E' || dir === 'W' ? from.v.w / 2 : from.h.w / 2
    const halfTo = dir === 'E' || dir === 'W' ? to.v.w / 2 : to.h.w / 2
    const cx0 = from.x, cz0 = from.z, cx1 = to.x, cz1 = to.z
    e.sx = cx0 + dx * (halfFrom + 4.2); e.sz = cz0 + dz * (halfFrom + 4.2)
    e.ex = cx1 - dx * (halfTo + 4.2); e.ez = cz1 - dz * (halfTo + 4.2)
    e.len = Math.abs(e.ex - e.sx) + Math.abs(e.ez - e.sz)
    this.edges.push(e)
    from.out.push(e); to.in.push(e)
    return e
  }

  lanePoint(e, lane, t) {
    const off = RoadGraph.laneOffset(e.prof, lane)
    return { x: e.sx + (e.ex - e.sx) * t + e.rx * off, z: e.sz + (e.ez - e.sz) * t + e.rz * off }
  }

  // choose the lane to use on the next edge after a turn: right turns take the outer lane, lefts the inner
  turnKind(a, b) {
    const cross = a.fx * b.fz - a.fz * b.fx // >0 left turn? (east -> north: (1,0)x(0,-1) = -1)
    if (a.fx === b.fx && a.fz === b.fz) return 'straight'
    if (a.fx === -b.fx && a.fz === -b.fz) return 'uturn'
    return cross < 0 ? 'left' : 'right'
  }

  // bezier curve points through the intersection from the end of lane la on a to lane lb on b
  turnPoints(a, la, b, lb, n = 7) {
    const p0 = this.lanePoint(a, la, 1), p2 = this.lanePoint(b, lb, 0)
    const kind = this.turnKind(a, b)
    if (kind === 'straight') return [p2]
    // control point: intersection of the two lane lines
    let cx, cz
    if (a.fx !== 0) { cx = p2.x; cz = p0.z } else { cx = p0.x; cz = p2.z }
    const pts = []
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t
      pts.push({ x: u * u * p0.x + 2 * u * t * cx + t * t * p2.x, z: u * u * p0.z + 2 * u * t * cz + t * t * p2.z, turn: true })
    }
    return pts
  }

  nearestEdge(x, z) {
    let best = null, bd = 1e9, bt = 0
    for (const e of this.edges) {
      const vx = e.ex - e.sx, vz = e.ez - e.sz, L2 = vx * vx + vz * vz
      let t = ((x - e.sx) * vx + (z - e.sz) * vz) / L2
      t = Math.max(0, Math.min(1, t))
      const off = RoadGraph.laneOffset(e.prof, 0)
      const px = e.sx + vx * t + e.rx * off, pz = e.sz + vz * t + e.rz * off
      const d = (px - x) ** 2 + (pz - z) ** 2
      if (d < bd) { bd = d; best = e; bt = t }
    }
    return { edge: best, t: bt, dist: Math.sqrt(bd) }
  }

  // A* over intersections; returns a list of points (road centre-ish) for the GPS line
  route(x0, z0, x1, z1) {
    const a = this.nearestNode(x0, z0), b = this.nearestNode(x1, z1)
    if (!a || !b) return []
    const open = new Map([[a.id, { n: a, g: 0, f: 0, prev: null }]])
    const closed = new Map()
    const h = (n) => Math.abs(n.x - b.x) + Math.abs(n.z - b.z)
    while (open.size) {
      let cur = null
      for (const o of open.values()) if (!cur || o.f < cur.f) cur = o
      open.delete(cur.n.id); closed.set(cur.n.id, cur)
      if (cur.n === b) break
      for (const e of cur.n.out) {
        if (closed.has(e.to.id)) continue
        const g = cur.g + e.len + 10
        const o = open.get(e.to.id)
        if (!o || g < o.g) open.set(e.to.id, { n: e.to, g, f: g + h(e.to), prev: cur })
      }
    }
    const end = closed.get(b.id)
    const pts = []
    let c = end
    while (c) { pts.unshift({ x: c.n.x, z: c.n.z }); c = c.prev }
    pts.unshift({ x: x0, z: z0 })
    pts.push({ x: x1, z: z1 })
    return pts
  }

  nearestNode(x, z) {
    let best = null, bd = 1e18
    for (const n of this.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n } }
    return best
  }
}
