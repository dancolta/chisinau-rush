import * as THREE from 'three'

// Facade modules painted once at load time into a mipmapped texture array. Each layer is one
// module (one window bay x one floor, a loggia, a shopfront...). RGB = albedo, A = surface kind:
//   ~1.0  wall  (tinted by the building colour in the shader)
//   ~0.75 solid (frames, sills, railings, AC units: keep their own colour)
//   ~0.25 glass (reflective by day, can light up at night)
// Real texture filtering (mipmaps + anisotropy) is what keeps windows from shimmering.

export const FACADE_RES = 256
const S = FACADE_RES
const WALL = 255, SOLID = 191, GLASS = 64

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// paints albedo and surface-kind mask in lockstep; module size in metres, origin bottom-left
class Painter {
  constructor(mw, mh, seed) {
    this.mw = mw; this.mh = mh
    this.r = rng(seed)
    const a = document.createElement('canvas'); a.width = a.height = S
    const m = document.createElement('canvas'); m.width = m.height = S
    this.a = a.getContext('2d', { willReadFrequently: true })
    this.m = m.getContext('2d', { willReadFrequently: true })
    this.m.fillStyle = `rgb(${WALL},${WALL},${WALL})`; this.m.fillRect(0, 0, S, S)
  }
  X(m) { return m / this.mw * S }
  Y(m) { return S - m / this.mh * S }
  // rect in metres (x, y = bottom), kind null = albedo only
  rect(x, y, w, h, color, kind = SOLID) {
    const px = this.X(x), py = this.Y(y + h), pw = this.X(x + w) - px, ph = this.Y(y) - py
    this.a.fillStyle = color; this.a.fillRect(px, py, pw, ph)
    if (kind !== null) { this.m.fillStyle = `rgb(${kind},${kind},${kind})`; this.m.fillRect(px, py, pw, ph) }
  }
  // vertical gradient rect (albedo), kind mask
  grad(x, y, w, h, top, bottom, kind = GLASS) {
    const px = this.X(x), py = this.Y(y + h), pw = this.X(x + w) - px, ph = this.Y(y) - py
    const g = this.a.createLinearGradient(0, py, 0, py + ph)
    g.addColorStop(0, top); g.addColorStop(1, bottom)
    this.a.fillStyle = g; this.a.fillRect(px, py, pw, ph)
    if (kind !== null) { this.m.fillStyle = `rgb(${kind},${kind},${kind})`; this.m.fillRect(px, py, pw, ph) }
  }
  // soft blotches for concrete / plaster (albedo only, low contrast, low frequency)
  blotches(n, dark, light, rMin = 10, rMax = 50) {
    const x = this.a, r = this.r
    for (let i = 0; i < n; i++) {
      const cx = r() * S, cy = r() * S, rad = rMin + r() * (rMax - rMin)
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad)
      g.addColorStop(0, r() < 0.5 ? dark : light); g.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
    }
  }
  // fine grain (albedo only), kept faint so it mips cleanly
  grain(n, a = 0.06) {
    const x = this.a, r = this.r
    for (let i = 0; i < n; i++) {
      const l = r() < 0.5 ? 0 : 255
      x.fillStyle = `rgba(${l},${l},${l},${a * (0.5 + r())})`
      x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2)
    }
  }
  // dirty streak running down from a point (albedo only)
  streak(xm, ym, len, w, alpha) {
    const px = this.X(xm), py = this.Y(ym), pl = len / this.mh * S, pw = this.X(w) - this.X(0)
    const g = this.a.createLinearGradient(0, py, 0, py + pl)
    g.addColorStop(0, `rgba(60,52,44,${alpha})`); g.addColorStop(1, 'rgba(60,52,44,0)')
    this.a.fillStyle = g; this.a.fillRect(px - pw / 2, py, pw, pl)
  }
  line(x0, y0, x1, y1, color, wpx, kind = SOLID) {
    for (const [c, col] of [[this.a, color], kind !== null ? [this.m, `rgb(${kind},${kind},${kind})`] : null].filter(Boolean)) {
      c.strokeStyle = col; c.lineWidth = wpx
      c.beginPath(); c.moveTo(this.X(x0), this.Y(y0)); c.lineTo(this.X(x1), this.Y(y1)); c.stroke()
    }
  }
  pixels() {
    const A = this.a.getImageData(0, 0, S, S).data, M = this.m.getImageData(0, 0, S, S).data
    const out = new Uint8Array(S * S * 4)
    // flip rows: texture row 0 is the module bottom
    for (let y = 0; y < S; y++) {
      const src = (S - 1 - y) * S * 4, dst = y * S * 4
      for (let i = 0; i < S * 4; i += 4) {
        out[dst + i] = A[src + i]; out[dst + i + 1] = A[src + i + 1]; out[dst + i + 2] = A[src + i + 2]; out[dst + i + 3] = M[src + i]
      }
    }
    return out
  }
}

// ---- building blocks -------------------------------------------------------------------------

const NEUTRAL = '#a0a0a0' // tinted wall base (the shader rescales it to the building colour)

function concreteWall(p, { seams = true, seamX = true, stains = 0.5 } = {}) {
  p.rect(0, 0, p.mw, p.mh, NEUTRAL, WALL)
  p.blotches(10, 'rgba(70,70,70,0.10)', 'rgba(220,220,220,0.10)', 20, 70)
  p.grain(900, 0.05)
  if (seams) {
    // horizontal joint at the floor line, vertical joint at the bay edge
    p.rect(0, 0, p.mw, 0.05, '#6d6d6d', WALL)
    p.rect(0, 0.05, p.mw, 0.025, '#b4b4b4', WALL)
    if (seamX) { p.rect(0, 0, 0.045, p.mh, '#727272', WALL); p.rect(0.045, 0, 0.02, p.mh, '#b0b0b0', WALL) }
  }
  if (stains > 0 && p.r() < stains) p.streak(p.mw * (0.2 + p.r() * 0.6), p.mh * 0.3, p.mh * 0.3, 0.5, 0.12)
}

function plasterWall(p) {
  p.rect(0, 0, p.mw, p.mh, NEUTRAL, WALL)
  p.blotches(14, 'rgba(80,76,70,0.10)', 'rgba(230,226,215,0.10)', 16, 60)
  p.grain(1400, 0.045)
}

function brickWall(p) {
  p.rect(0, 0, p.mw, p.mh, '#8f8f8f', WALL)
  const bh = 0.075, bw = 0.25
  for (let row = 0, y = 0; y < p.mh; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0
    for (let x = -off; x < p.mw; x += bw) {
      const l = 150 + Math.floor((p.r() - 0.5) * 30)
      p.rect(x + 0.01, y + 0.01, bw - 0.02, bh - 0.02, `rgb(${l},${l},${l})`, WALL)
    }
  }
}

const FRAMES = {
  pvc: { frame: '#eceeed', edge: '#b9bcbc' },
  wood: { frame: '#7a5337', edge: '#4e3322' },
  woodWhite: { frame: '#d8d2c4', edge: '#9b9383' },
  grey: { frame: '#8d9296', edge: '#5f6468' },
  alu: { frame: '#b8bcc0', edge: '#7c8084' },
}

// glass with sky reflection and something behind it
function glass(p, x, y, w, h, behind = 'none') {
  const r = p.r
  const t = 88 + Math.floor(r() * 30)
  p.grad(x, y, w, h, `rgb(${t + 40},${t + 58},${t + 80})`, `rgb(${Math.floor(t * 0.42)},${Math.floor(t * 0.48)},${Math.floor(t * 0.55)})`, GLASS)
  const X = p.X.bind(p), Y = p.Y.bind(p)
  const ctx = p.a
  // what's inside the room
  if (behind === 'tulle') {
    ctx.fillStyle = 'rgba(235,232,222,0.55)'; ctx.fillRect(X(x), Y(y + h), X(x + w) - X(x), Y(y) - Y(y + h))
    ctx.strokeStyle = 'rgba(180,176,166,0.5)'; ctx.lineWidth = 1
    for (let i = 1; i < 9; i++) { const px = X(x + w * i / 9); ctx.beginPath(); ctx.moveTo(px, Y(y + h)); ctx.lineTo(px, Y(y)); ctx.stroke() }
  } else if (behind === 'drapes') {
    const c = ['rgba(150,60,50,0.9)', 'rgba(70,90,130,0.9)', 'rgba(170,140,80,0.9)', 'rgba(90,110,70,0.9)'][Math.floor(r() * 4)]
    ctx.fillStyle = c
    ctx.fillRect(X(x), Y(y + h), (X(x + w) - X(x)) * 0.28, Y(y) - Y(y + h))
    ctx.fillRect(X(x + w * 0.72), Y(y + h), (X(x + w) - X(x)) * 0.28, Y(y) - Y(y + h))
    ctx.fillStyle = 'rgba(235,230,215,0.45)'; ctx.fillRect(X(x + w * 0.28), Y(y + h), (X(x + w) - X(x)) * 0.44, Y(y) - Y(y + h))
  } else if (behind === 'blinds') {
    ctx.fillStyle = 'rgba(210,205,190,0.8)'
    for (let yy = y + h * 0.35; yy < y + h; yy += 0.06) ctx.fillRect(X(x), Y(yy + 0.035), X(x + w) - X(x), Y(yy) - Y(yy + 0.035))
  } else if (behind === 'room') {
    ctx.fillStyle = 'rgba(60,48,38,0.55)'; ctx.fillRect(X(x), Y(y + h * 0.55), X(x + w) - X(x), Y(y) - Y(y + h * 0.55))
    ctx.fillStyle = 'rgba(250,236,200,0.25)'; ctx.fillRect(X(x + w * 0.1), Y(y + h * 0.95), (X(x + w) - X(x)) * 0.35, (Y(y) - Y(y + h)) * 0.25)
  } else if (behind === 'plants') {
    ctx.fillStyle = 'rgba(60,110,50,0.9)'
    for (let i = 0; i < 3; i++) { const cx = X(x + w * (0.2 + i * 0.3)), cy = Y(y + 0.18); ctx.beginPath(); ctx.arc(cx, cy, (X(0.16) - X(0)), 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = 'rgba(150,80,50,0.95)'
    for (let i = 0; i < 3; i++) ctx.fillRect(X(x + w * (0.2 + i * 0.3) - 0.07), Y(y + 0.1), X(0.14) - X(0), Y(0) - Y(0.1))
  }
  // diagonal sky reflection
  ctx.save()
  ctx.beginPath(); ctx.rect(X(x), Y(y + h), X(x + w) - X(x), Y(y) - Y(y + h)); ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.beginPath()
  const k = X(x) + (X(x + w) - X(x)) * (0.2 + r() * 0.4)
  ctx.moveTo(k, Y(y + h)); ctx.lineTo(k + (X(0.35) - X(0)), Y(y + h)); ctx.lineTo(k - (X(0.25) - X(0)), Y(y)); ctx.lineTo(k - (X(0.6) - X(0)), Y(y))
  ctx.fill()
  ctx.restore()
}

// window opening: recess shadow, frame with casements, sill
function windowUnit(p, x, y, w, h, { frame = 'pvc', panes = 2, transom = true, behind = 'none', sill = true } = {}) {
  const F = FRAMES[frame]
  // reveal shadow (the opening is recessed)
  p.rect(x - 0.04, y - 0.02, w + 0.08, h + 0.06, '#5c5c5c', SOLID)
  const fw = 0.065
  p.rect(x, y, w, h, F.frame, SOLID)
  // casements
  const top = transom ? h * 0.3 : 0
  const paneW = (w - fw * (panes + 1)) / panes
  for (let i = 0; i < panes; i++) {
    const px = x + fw + i * (paneW + fw)
    glass(p, px, y + fw, paneW, h - top - fw * (transom ? 1.5 : 2), behind)
    if (transom) glass(p, px, y + h - top + fw * 0.5, paneW, top - fw * 1.5, behind === 'drapes' ? 'drapes' : 'none')
  }
  // frame edge lines for depth
  p.line(x, y + h, x + w, y + h, F.edge, 2)
  p.line(x + w, y, x + w, y + h, F.edge, 2)
  // shadow cast by the lintel onto the top of the glass
  p.a.fillStyle = 'rgba(0,0,0,0.18)'
  p.a.fillRect(p.X(x), p.Y(y + h), p.X(x + w) - p.X(x), (p.Y(y) - p.Y(y + h)) * 0.08)
  if (sill) {
    p.rect(x - 0.1, y - 0.07, w + 0.2, 0.07, '#c9c6bf', SOLID)
    p.rect(x - 0.1, y - 0.1, w + 0.2, 0.03, '#77746e', SOLID)
    if (p.r() < 0.6) p.streak(x + w * (0.2 + p.r() * 0.6), y - 0.1, 0.6 + p.r() * 0.6, 0.25, 0.14)
  }
}

function acUnit(p, x, y) {
  p.rect(x, y, 0.75, 0.5, '#e4e5e2', SOLID)
  p.rect(x + 0.05, y + 0.06, 0.4, 0.38, '#bfc2c0', SOLID)
  for (let i = 0; i < 5; i++) p.line(x + 0.08, y + 0.1 + i * 0.07, x + 0.42, y + 0.1 + i * 0.07, '#8f9290', 1.2)
  p.a.fillStyle = 'rgba(40,40,40,0.35)'; p.a.beginPath(); p.a.arc(p.X(x + 0.6), p.Y(y + 0.25), p.X(0.11) - p.X(0), 0, Math.PI * 2); p.a.fill()
  p.streak(x + 0.35, y, 0.8, 0.12, 0.18)
}

function bars(p, x, y, w, h) {
  for (let i = 0; i <= 6; i++) p.line(x + w * i / 6, y, x + w * i / 6, y + h, '#2f3033', 2.5)
  for (const f of [0.02, 0.5, 0.98]) p.line(x, y + h * f, x + w, y + h * f, '#2f3033', 2.5)
}

// ---- modules ---------------------------------------------------------------------------------

// panel block bay: 3.2 x 2.8 m
function panelWindow(seed, o) {
  const p = new Painter(3.2, 2.8, seed)
  concreteWall(p)
  windowUnit(p, 0.8, 0.9, 1.6, 1.45, o)
  if (o.ac) acUnit(p, 2.45, 1.1)
  if (o.bars) bars(p, 0.78, 0.88, 1.64, 1.49)
  return p
}

// loggia: 3.2 x 2.8 m, parapet + glazing or open
function loggia(seed, o) {
  const p = new Painter(3.2, 2.8, seed)
  const r = p.r
  // slab edge (tinted concrete) at the top and the bottom
  p.rect(0, 0, 3.2, 2.8, NEUTRAL, WALL)
  p.blotches(6, 'rgba(70,70,70,0.1)', 'rgba(230,230,230,0.1)', 20, 60)
  // back of the loggia (room wall + balcony door) seen through
  const inside = o.open
  if (inside) {
    p.rect(0.08, 1.02, 3.04, 1.6, '#2c2a28', SOLID)
    p.rect(0.5, 1.02, 0.8, 1.55, '#4b3a2c', SOLID) // balcony door
    p.rect(1.5, 1.35, 1.3, 1.1, '#39434c', GLASS)
    if (o.laundry) {
      p.line(0.1, 2.3, 3.1, 2.3, '#9a9a9a', 1.5)
      const cols = ['#d94a3a', '#f2f2f2', '#3a6fd9', '#f2c94c', '#5aa35a', '#e28ad0']
      let x = 0.25
      while (x < 2.9) { const w = 0.25 + r() * 0.35, h = 0.3 + r() * 0.5; p.rect(x, 2.3 - h, w, h, cols[Math.floor(r() * cols.length)], SOLID); x += w + 0.12 + r() * 0.25 }
    }
  } else {
    // glazing
    const fr = o.frame || 'pvc'
    const F = FRAMES[fr]
    p.rect(0.05, 1.0, 3.1, 1.62, F.frame, SOLID)
    const n = o.panes || 4, fw = 0.06
    const pw = (3.1 - fw * (n + 1)) / n
    for (let i = 0; i < n; i++) glass(p, 0.05 + fw + i * (pw + fw), 1.0 + fw, pw, 1.62 - fw * 2, o.behind || (r() < 0.5 ? 'tulle' : 'room'))
    p.line(0.05, 2.62, 3.15, 2.62, F.edge, 2)
  }
  // parapet (the front of the balcony slab)
  const pk = o.parapet
  if (pk === 'metal') {
    const c = o.metal || '#6e8fa6'
    p.rect(0, 0.08, 3.2, 0.95, c, SOLID)
    for (let x = 0.08; x < 3.2; x += 0.16) p.line(x, 0.08, x, 1.03, 'rgba(0,0,0,0.25)', 2, null)
  } else if (pk === 'rail') {
    // open railing: see the loggia floor/back through it
    p.rect(0, 0.08, 3.2, 0.95, '#2c2a28', SOLID)
    for (let x = 0.05; x < 3.2; x += 0.12) p.line(x, 0.1, x, 1.0, '#3a3c3e', 2.2)
    p.rect(0, 0.98, 3.2, 0.06, '#3a3c3e', SOLID)
  } else {
    // concrete parapet (tinted), slightly different panel tone
    p.rect(0, 0.08, 3.2, 0.95, '#a8a8a8', WALL)
    p.rect(0, 0.98, 3.2, 0.05, '#7d7d7d', WALL)
    p.blotches(4, 'rgba(60,60,60,0.12)', 'rgba(240,240,240,0.08)', 10, 30)
  }
  // slab lines
  p.rect(0, 0, 3.2, 0.08, '#8a8a8a', WALL)
  p.rect(0, 2.66, 3.2, 0.14, '#8e8e8e', WALL)
  if (r() < 0.5) p.streak(0.3 + r() * 2.6, 0.08, 0.5, 0.3, 0.12)
  return p
}

function loggiaGround(seed) {
  const p = new Painter(3.2, 2.8, seed)
  concreteWall(p, { seamX: false })
  p.rect(0, 0, 3.2, 0.5, '#8a8a8a', WALL)
  return p
}

// ground-floor shopfront: 3.0 x 4.2 m
function shopfront(seed, kind) {
  const p = new Painter(3.0, 4.2, seed)
  const r = p.r
  p.rect(0, 0, 3.0, 4.2, NEUTRAL, WALL)
  p.blotches(8, 'rgba(70,70,70,0.1)', 'rgba(230,230,230,0.1)', 16, 50)
  // plinth
  p.rect(0, 0, 3.0, 0.35, '#6f6f6f', WALL)
  // fascia band above the glazing (where signs usually hang)
  p.rect(0, 3.35, 3.0, 0.5, '#8c8c8c', WALL)
  if (kind === 'shutter') {
    p.rect(0.12, 0.35, 2.76, 2.95, '#9aa0a4', SOLID)
    for (let y = 0.4; y < 3.3; y += 0.09) p.line(0.12, y, 2.88, y, '#7a8084', 1.5)
    p.rect(0.12, 3.18, 2.76, 0.17, '#6d7276', SOLID)
    // graffiti tag
    p.a.fillStyle = ['rgba(210,40,60,0.8)', 'rgba(40,120,220,0.8)', 'rgba(30,30,30,0.7)'][Math.floor(r() * 3)]
    p.a.font = `bold ${Math.floor(S * 0.13)}px sans-serif`; p.a.fillText(['BRATAN', 'ZDF', 'CHIȘI', 'TOP'][Math.floor(r() * 4)], p.X(0.35), p.Y(1.3))
    return p
  }
  const F = FRAMES.alu
  p.rect(0.1, 0.35, 2.8, 2.98, F.frame, SOLID)
  if (kind === 'door') {
    glass(p, 0.2, 0.45, 1.3, 2.8, 'room')
    p.rect(1.6, 0.35, 1.2, 2.9, '#5b6066', SOLID) // door leaf
    glass(p, 1.7, 0.5, 1.0, 2.2, 'room')
    p.rect(1.72, 1.45, 0.08, 0.35, '#d0d0d0', SOLID)
  } else {
    glass(p, 0.18, 0.43, 2.64, 2.82, 'room')
    // goods on shelves
    const ctx = p.a
    const cols = kind === 'pharmacy' ? ['#2e9a57', '#f2f2f2', '#9ad0b0'] : kind === 'cafe' ? ['#6b4a34', '#e9d9b8', '#b33a2e'] : ['#e8b33a', '#d94a3a', '#3a6fd9', '#f2f2f2', '#5aa35a']
    for (let sh = 0; sh < 3; sh++) {
      const y = 0.7 + sh * 0.75
      ctx.fillStyle = 'rgba(40,40,40,0.35)'; ctx.fillRect(p.X(0.25), p.Y(y), p.X(2.75) - p.X(0.25), 3)
      for (let x = 0.3; x < 2.7; x += 0.12 + r() * 0.1) { ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.fillRect(p.X(x), p.Y(y + 0.15 + r() * 0.2), p.X(0.08) - p.X(0), p.Y(y) - p.Y(y + 0.15 + r() * 0.2)) }
    }
    if (kind === 'pharmacy') { ctx.fillStyle = '#2fbf5f'; ctx.fillRect(p.X(1.35), p.Y(3.1), p.X(0.3) - p.X(0), p.Y(0) - p.Y(0.9)); ctx.fillRect(p.X(1.1), p.Y(2.8), p.X(0.8) - p.X(0), p.Y(0) - p.Y(0.3)) }
  }
  p.line(0.1, 3.33, 2.9, 3.33, F.edge, 2)
  return p
}

// office / administrative ribbon windows: module 3.0 x 3.4 m
function office(seed, o) {
  const p = new Painter(3.0, 3.4, seed)
  concreteWall(p, { seamX: false, stains: 0.3 })
  // spandrel + ribbon
  const F = FRAMES[o.frame || 'alu']
  p.rect(0, 1.0, 3.0, 2.0, F.frame, SOLID)
  const n = 3, fw = 0.06, pw = (3.0 - fw * (n + 1)) / n
  for (let i = 0; i < n; i++) glass(p, fw + i * (pw + fw), 1.0 + fw, pw, 2.0 - fw * 2, o.behind || (p.r() < 0.5 ? 'blinds' : 'room'))
  p.rect(0, 0.92, 3.0, 0.08, '#c3c3bd', SOLID)
  return p
}

// ruined / abandoned: 3.2 x 2.8
function ruin(seed, o) {
  const p = new Painter(3.2, 2.8, seed)
  concreteWall(p, { stains: 1 })
  p.blotches(10, 'rgba(30,26,22,0.25)', 'rgba(30,26,22,0.1)', 10, 50)
  const x = 0.8, y = 0.9, w = 1.6, h = 1.45
  p.rect(x - 0.04, y - 0.02, w + 0.08, h + 0.06, '#3b3b3b', SOLID)
  if (o.boarded) {
    p.rect(x, y, w, h, '#1c1a18', SOLID)
    for (let i = 0; i < 5; i++) p.rect(x - 0.05, y + 0.1 + i * 0.28, w + 0.1, 0.2, i % 2 ? '#8a6a48' : '#7a5b3c', SOLID)
  } else {
    p.rect(x, y, w, h, '#141312', GLASS)
    // broken shards
    p.a.fillStyle = 'rgba(120,140,150,0.6)'
    p.a.beginPath(); p.a.moveTo(p.X(x), p.Y(y + h)); p.a.lineTo(p.X(x + w * 0.4), p.Y(y + h)); p.a.lineTo(p.X(x), p.Y(y + h * 0.5)); p.a.fill()
    p.a.beginPath(); p.a.moveTo(p.X(x + w), p.Y(y)); p.a.lineTo(p.X(x + w * 0.7), p.Y(y)); p.a.lineTo(p.X(x + w), p.Y(y + h * 0.4)); p.a.fill()
    // soot above the opening
    const g = p.a.createLinearGradient(0, p.Y(y + h + 0.8), 0, p.Y(y + h))
    g.addColorStop(0, 'rgba(20,18,16,0)'); g.addColorStop(1, 'rgba(20,18,16,0.55)')
    p.a.fillStyle = g; p.a.fillRect(p.X(x), p.Y(y + h + 0.8), p.X(x + w) - p.X(x), p.Y(y + h) - p.Y(y + h + 0.8))
  }
  return p
}

// 19th-century plastered facade bay: 2.7 x 3.3 m, tall window with moulded surround
function classical(seed, o) {
  const p = new Painter(2.7, 3.3, seed)
  if (o.brick) brickWall(p); else plasterWall(p)
  // string course at the floor line
  p.rect(0, 0, 2.7, 0.14, '#b8b8b8', WALL)
  p.rect(0, 0.14, 2.7, 0.04, '#7e7e7e', WALL)
  const x = 0.8, y = 0.75, w = 1.1, h = 2.0
  // moulded surround (lighter, tinted) + pediment
  p.rect(x - 0.14, y - 0.06, w + 0.28, h + 0.2, '#c2c2c2', WALL)
  p.rect(x - 0.22, y + h + 0.14, w + 0.44, 0.12, '#cdcdcd', WALL)
  p.rect(x - 0.18, y + h + 0.26, w + 0.36, 0.06, '#8a8a8a', WALL)
  if (o.pediment) {
    p.a.fillStyle = '#c8c8c8'
    p.a.beginPath(); p.a.moveTo(p.X(x - 0.2), p.Y(y + h + 0.32)); p.a.lineTo(p.X(x + w / 2), p.Y(y + h + 0.62)); p.a.lineTo(p.X(x + w + 0.2), p.Y(y + h + 0.32)); p.a.fill()
  }
  windowUnit(p, x, y, w, h, { frame: o.frame || 'woodWhite', panes: 2, transom: true, behind: o.behind || 'tulle', sill: true })
  if (o.shutters) {
    p.rect(x - 0.52, y, 0.44, h, o.shutters, SOLID)
    p.rect(x + w + 0.08, y, 0.44, h, o.shutters, SOLID)
    for (let yy = y + 0.1; yy < y + h; yy += 0.09) { p.line(x - 0.5, yy, x - 0.1, yy, 'rgba(0,0,0,0.25)', 1.2, null); p.line(x + w + 0.1, yy, x + w + 0.5, yy, 'rgba(0,0,0,0.25)', 1.2, null) }
  }
  if (o.balcony) {
    p.rect(x - 0.35, y - 0.15, w + 0.7, 0.12, '#6a6a6a', SOLID)
    for (let xx = x - 0.3; xx < x + w + 0.35; xx += 0.1) p.line(xx, y - 0.03, xx, y + 0.85, '#2c2d2f', 2)
    p.rect(x - 0.35, y + 0.82, w + 0.7, 0.05, '#2c2d2f', SOLID)
  }
  return p
}

function plain(seed) { const p = new Painter(3.2, 2.8, seed); concreteWall(p, { seams: false, stains: 0.3 }); return p }

// gable end of a panel block: bare panels with sealed joints and weather streaks
function panelEnd(seed) {
  const p = new Painter(3.2, 2.8, seed)
  concreteWall(p, { seams: true, stains: 0.7 })
  if (p.r() < 0.4) p.streak(0.2 + p.r() * 2.8, 2.8, 1.4, 0.15, 0.1)
  return p
}

function roof(seed) {
  const p = new Painter(4, 4, seed)
  p.rect(0, 0, 4, 4, NEUTRAL, WALL)
  p.blotches(26, 'rgba(40,40,40,0.18)', 'rgba(200,200,200,0.12)', 10, 60)
  p.grain(3000, 0.08)
  // bitumen sheet seams
  for (let x = 0.9; x < 4; x += 1.0) p.line(x, 0, x, 4, 'rgba(30,30,30,0.35)', 2, null)
  return p
}

// ---- layer table -----------------------------------------------------------------------------

// style -> [first layer, count, average layer]; the shader mirrors this table
export const FACADE_LAYERS = {}

export function buildFacadeTextures() {
  const layers = []
  const style = (name, painters) => {
    const first = layers.length
    for (const pp of painters) layers.push(pp.pixels())
    FACADE_LAYERS[name] = { first, count: painters.length }
  }
  let sd = 1
  const s = () => sd++ * 7919
  style('plain', [plain(s())])
  style('panelEnd', [panelEnd(s()), panelEnd(s()), panelEnd(s())])
  style('roof', [roof(s())])
  style('panel', [
    panelWindow(s(), { frame: 'pvc', behind: 'tulle' }),
    panelWindow(s(), { frame: 'wood', behind: 'drapes' }),
    panelWindow(s(), { frame: 'pvc', behind: 'blinds', ac: true }),
    panelWindow(s(), { frame: 'woodWhite', behind: 'tulle' }),
    panelWindow(s(), { frame: 'pvc', behind: 'room' }),
    panelWindow(s(), { frame: 'grey', behind: 'plants' }),
    panelWindow(s(), { frame: 'pvc', behind: 'drapes', ac: true }),
    panelWindow(s(), { frame: 'wood', behind: 'none' }),
  ])
  style('panelGround', [
    panelWindow(s(), { frame: 'wood', behind: 'tulle', bars: true }),
    panelWindow(s(), { frame: 'pvc', behind: 'blinds', bars: true }),
    panelWindow(s(), { frame: 'pvc', behind: 'room' }),
  ])
  style('loggia', [
    loggia(s(), { frame: 'pvc', parapet: 'concrete' }),
    loggia(s(), { frame: 'wood', parapet: 'concrete' }),
    loggia(s(), { frame: 'pvc', parapet: 'metal', metal: '#6e8fa6' }),
    loggia(s(), { open: true, parapet: 'concrete', laundry: true }),
    loggia(s(), { open: true, parapet: 'rail' }),
    loggia(s(), { frame: 'pvc', parapet: 'metal', metal: '#8a9a6e', behind: 'plants' }),
    loggia(s(), { frame: 'woodWhite', parapet: 'concrete', panes: 5 }),
    loggia(s(), { frame: 'pvc', parapet: 'metal', metal: '#b9b3a4' }),
  ])
  style('loggiaGround', [loggiaGround(s())])
  style('shop', [
    shopfront(s(), 'grocery'), shopfront(s(), 'door'), shopfront(s(), 'shutter'),
    shopfront(s(), 'pharmacy'), shopfront(s(), 'cafe'), shopfront(s(), 'grocery'),
  ])
  style('office', [office(s(), { frame: 'alu' }), office(s(), { frame: 'grey', behind: 'blinds' }), office(s(), { frame: 'alu', behind: 'room' })])
  style('ruin', [ruin(s(), { boarded: false }), ruin(s(), { boarded: true }), ruin(s(), { boarded: false })])
  style('classical', [
    classical(s(), { frame: 'woodWhite', pediment: true }),
    classical(s(), { frame: 'wood', shutters: '#5f7a5a' }),
    classical(s(), { frame: 'woodWhite', balcony: true }),
    classical(s(), { frame: 'pvc', behind: 'drapes' }),
    classical(s(), { frame: 'woodWhite', pediment: true, behind: 'room' }),
  ])
  style('brick', [
    classical(s(), { brick: true, frame: 'wood' }),
    classical(s(), { brick: true, frame: 'pvc', behind: 'blinds' }),
  ])
  // per-style average layers: what a whole wall of that style looks like from far away
  for (const [name, L] of Object.entries(FACADE_LAYERS)) {
    const avg = new Float32Array(S * S * 4)
    for (let i = 0; i < L.count; i++) { const d = layers[L.first + i]; for (let k = 0; k < d.length; k++) avg[k] += d[k] }
    const out = new Uint8Array(S * S * 4)
    for (let k = 0; k < out.length; k++) out[k] = Math.round(avg[k] / L.count)
    L.avg = layers.length
    layers.push(out)
  }
  const n = layers.length
  const data = new Uint8Array(S * S * 4 * n)
  layers.forEach((d, i) => data.set(d, i * S * S * 4))
  const tex = new THREE.DataArrayTexture(data, S, S, n)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}
