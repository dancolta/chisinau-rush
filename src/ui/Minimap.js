import { H_ROADS, V_ROADS, BLOCKS, WORLD, RAIL_Z } from '../world/CityLayout.js'

const ZONE_FILL = {
  soviet: '#3a3d38', acasa: '#3d3a33', garaje: '#3a3834', linella: '#3a3d38',
  catedrala: '#2f4a2c', gradina: '#2c4a2a', guvern: '#4a4538', piata: '#4a4034', autogara: '#3e3f44', gara: '#4a4538', circ: '#48443a', ambasada: '#3a3a34',
}
const PX = 1.2 // static map pixels per metre

// Renders the city once to an offscreen canvas; the minimap and the big map sample it.
export function renderStaticMap(world) {
  const W = Math.ceil((WORLD.x1 - WORLD.x0) * PX), H = Math.ceil((WORLD.z1 - WORLD.z0) * PX)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')
  const X = (wx) => (wx - WORLD.x0) * PX, Z = (wz) => (wz - WORLD.z0) * PX
  x.fillStyle = '#2a3a27'; x.fillRect(0, 0, W, H)
  // blocks
  for (const b of BLOCKS) {
    x.fillStyle = '#6d6a64'; x.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * PX, (b.z1 - b.z0) * PX)
    x.fillStyle = ZONE_FILL[b.zone] || '#45423c'
    x.fillRect(X(b.ix0), Z(b.iz0), (b.ix1 - b.ix0) * PX, (b.iz1 - b.iz0) * PX)
  }
  // parks greener
  for (const b of BLOCKS) if (b.zone === 'gradina' || b.zone === 'catedrala') { x.fillStyle = '#35602f'; x.fillRect(X(b.ix0), Z(b.iz0), (b.ix1 - b.ix0) * PX, (b.iz1 - b.iz0) * PX) }
  // building footprints
  x.fillStyle = '#8e8a82'
  for (const f of world.footprints) {
    x.save(); x.translate(X(f.x), Z(f.z)); x.rotate(-(f.ry || 0))
    x.fillRect(-f.hx * PX, -f.hz * PX, f.hx * 2 * PX, f.hz * 2 * PX)
    x.restore()
  }
  // roads
  x.fillStyle = '#1c1d21'
  for (const h of H_ROADS) x.fillRect(X(V_ROADS[0].x - 6), Z(h.z - h.w / 2), (V_ROADS[V_ROADS.length - 1].x - V_ROADS[0].x + 12) * PX, h.w * PX)
  for (const v of V_ROADS) x.fillRect(X(v.x - v.w / 2), Z(H_ROADS[0].z - 6), v.w * PX, (H_ROADS[H_ROADS.length - 1].z - H_ROADS[0].z + 12) * PX)
  // boulevard centre line
  x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1
  x.beginPath(); x.moveTo(X(V_ROADS[0].x), Z(0)); x.lineTo(X(V_ROADS[V_ROADS.length - 1].x), Z(0)); x.stroke()
  // rails
  x.strokeStyle = '#5a5048'; x.lineWidth = 3
  for (const z of [RAIL_Z - 4, RAIL_Z + 4]) { x.beginPath(); x.moveTo(0, Z(z)); x.lineTo(W, Z(z)); x.stroke() }
  return { canvas: c, X, Z, W, H }
}

export class Minimap {
  constructor(game, canvas, northEl) {
    this.game = game
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.northEl = northEl
    this.size = 236
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = this.size * this.dpr; canvas.height = this.size * this.dpr
    this.route = null
    this.routeTarget = null
    this.routeT = 0
    this.zoom = 1
    this.t = 0
  }

  ensureStatic() {
    if (!this.static && this.game.world?.footprints) this.static = renderStaticMap(this.game.world)
    return this.static
  }

  setRoute(target) {
    this.routeTarget = target
    this.route = null
    this.routeT = 0
  }

  computeRoute() {
    const g = this.game, t = this.routeTarget
    if (!t || !g.traffic) { this.route = null; return }
    const p = g.player.vehicle ? g.player.vehicle.pos : g.player.pos
    this.route = g.traffic.graph.route(p.x, p.z, t.x, t.z)
  }

  update(dt) {
    this.t += dt
    const g = this.game, st = this.ensureStatic()
    if (!st || !g.player) return
    this.routeT -= dt
    if (this.routeTarget && this.routeT <= 0) { this.routeT = 1.5; this.computeRoute() }
    const c = this.ctx, S = this.size, d = this.dpr
    const p = g.player.vehicle ? g.player.vehicle.pos : g.player.pos
    const yaw = g.cameraRig ? g.cameraRig.yaw : Math.PI
    const speed = g.player.vehicle ? Math.abs(g.player.vehicle.speed) : 0
    const wantZoom = 1 / (1 + Math.min(0.9, speed / 30))
    this.zoom += (wantZoom - this.zoom) * Math.min(1, dt * 2)
    const scale = 0.95 * this.zoom // screen px per metre
    c.setTransform(d, 0, 0, d, 0, 0)
    c.clearRect(0, 0, S, S)
    c.save()
    c.translate(S / 2, S / 2)
    // camera forward (sin yaw, cos yaw) must point up on screen
    const rot = yaw - Math.PI
    c.rotate(rot)
    c.scale(scale / PX, scale / PX)
    c.drawImage(st.canvas, -st.X(p.x), -st.Z(p.z))
    c.restore()
    const toScreen = (wx, wz) => {
      const dx = (wx - p.x) * scale, dz = (wz - p.z) * scale
      const cs = Math.cos(rot), sn = Math.sin(rot)
      return [S / 2 + dx * cs - dz * sn, S / 2 + dx * sn + dz * cs]
    }
    // GPS route
    if (this.route && this.route.length > 1) {
      c.strokeStyle = 'rgba(190,120,255,0.95)'; c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round'
      c.beginPath()
      this.route.forEach((pt, i) => { const [sx, sy] = toScreen(pt.x, pt.z); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy) })
      c.stroke()
    }
    // blips
    const blips = g.blips ? g.blips() : []
    for (const b of blips) {
      let [sx, sy] = toScreen(b.x, b.z)
      const dx = sx - S / 2, dy = sy - S / 2, dist = Math.hypot(dx, dy), R = S / 2 - 10
      if (dist > R) { if (!b.edge) continue; sx = S / 2 + (dx / dist) * R; sy = S / 2 + (dy / dist) * R }
      this.drawBlip(c, sx, sy, b)
    }
    // player arrow
    const hd = g.player.vehicle ? g.player.vehicle.heading : g.player.char.heading
    c.save(); c.translate(S / 2, S / 2); c.rotate(-(hd - yaw))
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 1.5
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.fill(); c.stroke()
    c.restore()
    // north marker on the rim (world -z projected through the rotation)
    const R = S / 2 - 12
    const north = toScreen(p.x, p.z - 1000)
    const ndx = north[0] - S / 2, ndy = north[1] - S / 2, nd = Math.hypot(ndx, ndy) || 1
    this.northEl.style.left = (S / 2 + (ndx / nd) * R) + 'px'
    this.northEl.style.top = (S / 2 + (ndy / nd) * R - 7) + 'px'
  }

  drawBlip(c, x, y, b) {
    const t = this.t
    c.save()
    if (b.kind === 'target') {
      const r = 7 + Math.sin(t * 5) * 1.5
      c.fillStyle = '#ffcf4a'; c.strokeStyle = '#2a1a00'; c.lineWidth = 2
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke()
    } else if (b.kind === 'police') {
      c.fillStyle = Math.floor(t * 6) % 2 ? '#ff3a3a' : '#3a7aff'
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill()
    } else if (b.kind === 'npc') {
      c.fillStyle = b.color || '#7fd4ff'; c.strokeStyle = '#111'; c.lineWidth = 1.5
      c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fill(); c.stroke()
      c.fillStyle = '#111'; c.font = 'bold 9px Rubik'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.label || '!', x, y + 0.5)
    } else if (b.kind === 'icon') {
      c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText(b.icon, x, y)
    } else {
      c.fillStyle = b.color || '#fff'
      c.beginPath(); c.arc(x, y, b.r || 3, 0, Math.PI * 2); c.fill()
    }
    c.restore()
  }
}
