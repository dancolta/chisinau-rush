import * as THREE from 'three'

// Canvas-generated tiling textures + a text sign atlas.
// Everything is generated at load time, so no downloads and every surface tiles cleanly.

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d')]
}

function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
  t.anisotropy = 16
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

function speckle(ctx, w, h, r, n, colors, size = [1, 2]) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)]
    const s = size[0] + r() * (size[1] - size[0])
    ctx.fillRect(r() * w, r() * h, s, s)
  }
}

// height canvas -> tangent-space normal map (Sobel), for surfaces that should catch the light
function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data
  const [c, x] = canvas(w, h)
  const out = x.createImageData(w, h)
  const H = (i, j) => src[(((j + h) % h) * w + ((i + w) % w)) * 4] / 255
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j - 1) + 2 * H(i + 1, j) + H(i + 1, j + 1)) - (H(i - 1, j - 1) + 2 * H(i - 1, j) + H(i - 1, j + 1))
    const dy = (H(i - 1, j + 1) + 2 * H(i, j + 1) + H(i + 1, j + 1)) - (H(i - 1, j - 1) + 2 * H(i, j - 1) + H(i + 1, j - 1))
    let nx = -dx * strength, ny = dy * strength, nz = 1
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
    const o = (j * w + i) * 4
    out.data[o] = (nx * 0.5 + 0.5) * 255; out.data[o + 1] = (ny * 0.5 + 0.5) * 255; out.data[o + 2] = (nz * 0.5 + 0.5) * 255; out.data[o + 3] = 255
  }
  x.putImageData(out, 0, 0)
  return toTex(c, true, false)
}

// soft tonal blotches (low frequency: mips well, hides tiling)
function blotch(x, r, S, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const cx = r() * S, cy = r() * S, rad = rMin + r() * (rMax - rMin)
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad)
      g.addColorStop(0, colorFn()); g.addColorStop(1, 'rgba(0,0,0,0)')
      x.fillStyle = g; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2)
    }
  }
}

// value noise grain drawn as tiny low-contrast dots in both albedo and height
function grainPair(a, hgt, r, S, n, amp) {
  for (let i = 0; i < n; i++) {
    const px = r() * S, py = r() * S, sz = 1 + r() * 1.6, v = r()
    const l = Math.floor(128 + (v - 0.5) * amp)
    a.fillStyle = `rgba(${l},${l},${l},0.18)`; a.fillRect(px, py, sz, sz)
    if (hgt) { hgt.fillStyle = `rgba(255,255,255,${0.25 * v})`; hgt.fillRect(px, py, sz, sz) }
  }
}

export function makeAsphalt() {
  const S = 512
  const [c, x] = canvas(S, S)
  const [hc, hx] = canvas(S, S)
  const r = rng(7)
  x.fillStyle = '#3d3f43'; x.fillRect(0, 0, S, S)
  hx.fillStyle = '#707070'; hx.fillRect(0, 0, S, S)
  // wear and old repairs: broad, low-contrast tone changes
  blotch(x, r, S, 30, 40, 150, () => { const l = 50 + Math.floor(r() * 26); return `rgba(${l},${l + 1},${l + 3},0.28)` })
  // a couple of patched rectangles (typical Chișinău), barely darker
  for (let i = 0; i < 3; i++) {
    const w = 50 + r() * 110, h = 36 + r() * 80, px = r() * S, py = r() * S
    x.fillStyle = 'rgba(40,41,45,0.35)'; x.fillRect(px, py, w, h)
    hx.fillStyle = 'rgba(0,0,0,0.12)'; hx.fillRect(px, py, w, h)
  }
  // aggregate: fine, low contrast (no bright specks: they sparkle)
  grainPair(x, hx, r, S, 16000, 60)
  // sealed cracks: thin dark lines that sink into the height map
  for (let i = 0; i < 10; i++) {
    let px = r() * S, py = r() * S
    const pts = [[px, py]]
    for (let k = 0; k < 8; k++) { px += (r() - 0.5) * 44; py += (r() - 0.5) * 44; pts.push([px, py]) }
    for (const [ctx, col, w] of [[x, 'rgba(22,22,24,0.55)', 1.4], [hx, 'rgba(0,0,0,0.6)', 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
      for (const q of pts) ctx.lineTo(q[0], q[1])
      ctx.stroke()
    }
  }
  // oil drips
  blotch(x, r, S, 5, 6, 18, () => 'rgba(15,15,18,0.25)')
  const t = toTex(c)
  t.userData = { normal: heightToNormal(hc, 1.6) }
  return t
}

export function makePaving() {
  // 0.5 m concrete slabs (128 px per metre), bevelled joints
  const S = 512, T = 64
  const [c, x] = canvas(S, S)
  const [hc, hx] = canvas(S, S)
  const r = rng(11)
  x.fillStyle = '#6d6c69'; x.fillRect(0, 0, S, S)
  hx.fillStyle = '#202020'; hx.fillRect(0, 0, S, S)
  for (let ty = 0; ty < S / T; ty++) for (let tx = 0; tx < S / T; tx++) {
    const l = 146 + Math.floor((r() - 0.5) * 18)
    const warm = Math.floor((r() - 0.5) * 6)
    x.fillStyle = `rgb(${l + warm},${l},${l - 4 - warm})`
    x.fillRect(tx * T + 2, ty * T + 2, T - 4, T - 4)
    // bevel: light top-left edge, dark bottom-right edge
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(tx * T + 2, ty * T + 2, T - 4, 2); x.fillRect(tx * T + 2, ty * T + 2, 2, T - 4)
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(tx * T + 2, ty * T + T - 4, T - 4, 2); x.fillRect(tx * T + T - 4, ty * T + 2, 2, T - 4)
    const g = hx.createLinearGradient(tx * T, ty * T, tx * T + T, ty * T + T)
    g.addColorStop(0, '#c8c8c8'); g.addColorStop(1, '#b4b4b4')
    hx.fillStyle = g; hx.fillRect(tx * T + 2, ty * T + 2, T - 4, T - 4)
    // the odd stained or cracked slab
    if (r() < 0.12) { x.fillStyle = 'rgba(60,55,48,0.12)'; x.beginPath(); x.arc(tx * T + T * r(), ty * T + T * r(), 8 + r() * 14, 0, Math.PI * 2); x.fill() }
    if (r() < 0.05) {
      const ax = tx * T + 4 + r() * (T - 8), ay = ty * T + 3
      for (const [ctx, col] of [[x, 'rgba(40,40,40,0.5)'], [hx, 'rgba(0,0,0,0.8)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ax, ay)
        ctx.lineTo(ax + (r() - 0.5) * 20, ay + T * 0.45); ctx.lineTo(ax + (r() - 0.5) * 24, ty * T + T - 3); ctx.stroke()
      }
    }
  }
  grainPair(x, hx, r, S, 7000, 40)
  blotch(x, r, S, 12, 30, 90, () => `rgba(${r() < 0.5 ? '40,38,34' : '220,216,206'},0.06)`)
  const t = toTex(c)
  t.userData = { normal: heightToNormal(hc, 2.4) }
  return t
}

export function makePlaza() {
  // 1 m granite slabs laid in a running bond (64 px per metre)
  const S = 512, T = 64
  const [c, x] = canvas(S, S)
  const [hc, hx] = canvas(S, S)
  const r = rng(23)
  x.fillStyle = '#8a7f6e'; x.fillRect(0, 0, S, S)
  hx.fillStyle = '#303030'; hx.fillRect(0, 0, S, S)
  for (let ty = 0; ty < S / T; ty++) {
    const off = (ty % 2) * T / 2
    for (let tx = -1; tx < S / T; tx++) {
      const px = tx * T + off, py = ty * T
      const l = Math.floor((r() - 0.5) * 16)
      x.fillStyle = `rgb(${192 + l},${181 + l},${160 + l})`
      x.fillRect(px + 1.5, py + 1.5, T - 3, T - 3)
      hx.fillStyle = '#c0c0c0'; hx.fillRect(px + 1.5, py + 1.5, T - 3, T - 3)
    }
  }
  // granite grain, very fine and soft
  for (let i = 0; i < 14000; i++) {
    const v = r()
    x.fillStyle = v < 0.5 ? 'rgba(95,86,74,0.12)' : 'rgba(250,244,230,0.12)'
    x.fillRect(r() * S, r() * S, 1 + r(), 1 + r())
  }
  blotch(x, r, S, 14, 30, 110, () => `rgba(${r() < 0.5 ? '70,64,56' : '235,228,212'},0.07)`)
  const t = toTex(c)
  t.userData = { normal: heightToNormal(hc, 1.8) }
  return t
}

export function makeGrass() {
  const S = 512
  const [c, x] = canvas(S, S)
  const r = rng(5)
  x.fillStyle = '#4f7a36'; x.fillRect(0, 0, S, S)
  for (let i = 0; i < 40; i++) {
    const cx = r() * S, cy = r() * S, rad = 30 + r() * 110
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad)
    const dark = r() < 0.5
    g.addColorStop(0, dark ? 'rgba(58,90,38,0.22)' : 'rgba(112,142,66,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, S, S)
  }
  // blades
  for (let i = 0; i < 16000; i++) {
    const px = r() * S, py = r() * S
    const l = r()
    x.strokeStyle = l < 0.33 ? 'rgba(40,70,28,0.6)' : l < 0.66 ? 'rgba(96,136,58,0.55)' : 'rgba(130,160,80,0.45)'
    x.lineWidth = 1
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py - 2 - r() * 4); x.stroke()
  }
  // worn dirt patches (desire paths)
  for (let i = 0; i < 6; i++) {
    const cx = r() * S, cy = r() * S
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 20 + r() * 40)
    g.addColorStop(0, 'rgba(120,98,66,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, S, S)
  }
  return toTex(c)
}

export function makeDirt() {
  const S = 256
  const [c, x] = canvas(S, S)
  const r = rng(99)
  x.fillStyle = '#b39b6e'; x.fillRect(0, 0, S, S)
  speckle(x, S, S, r, 4000, ['#a58c60', '#c4ad80', '#8f7a52', '#d0bc92'], [1, 3])
  return toTex(c)
}

export function makeConcrete() {
  const S = 256
  const [c, x] = canvas(S, S)
  const r = rng(3)
  x.fillStyle = '#a3a19c'; x.fillRect(0, 0, S, S)
  speckle(x, S, S, r, 5000, ['#98968f', '#aeaca6', '#8c8a84'], [1, 2])
  x.strokeStyle = 'rgba(80,80,80,0.35)'; x.lineWidth = 2
  x.strokeRect(0, 0, S, S)
  return toTex(c)
}

// soft round blob for light pools / shadows / glows (not tiling)
export function makeGlow(inner = 'rgba(255,220,160,1)', outer = 'rgba(255,200,120,0)') {
  const S = 128
  const [c, x] = canvas(S, S)
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, inner); g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, outer)
  x.fillStyle = g; x.fillRect(0, 0, S, S)
  return toTex(c, false)
}

// ---------------------------------------------------------------------------
// Sign atlas: every shop sign / street sign / billboard lives in one texture,
// so all signage renders in a single draw call.
export class SignAtlas {
  constructor(w = 2048, h = 2048) {
    const [c, x] = canvas(w, h)
    this.canvas = c; this.ctx = x; this.W = w; this.H = h
    this.cx = 0; this.cy = 0; this.rowH = 0
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h)
    this.texture = toTex(c, false)
    this.texture.anisotropy = 8
  }

  alloc(w, h) {
    if (this.cx + w > this.W) { this.cx = 0; this.cy += this.rowH + 2; this.rowH = 0 }
    if (this.cy + h > this.H) { console.warn('sign atlas full'); return { x: 0, y: 0, w, h, u0: 0, v0: 1, u1: 0.01, v1: 0.99 } }
    const r = { x: this.cx, y: this.cy, w, h }
    this.cx += w + 2; this.rowH = Math.max(this.rowH, h)
    r.u0 = r.x / this.W; r.u1 = (r.x + w) / this.W
    r.v0 = 1 - (r.y + h) / this.H; r.v1 = 1 - r.y / this.H
    return r
  }

  fitText(text, maxW, size, weight = '900', family = 'Rubik') {
    const x = this.ctx
    let s = size
    do { x.font = `${weight} ${s}px ${family}`; s -= 2 } while (x.measureText(text).width > maxW && s > 10)
    return s + 2
  }

  // flat shop sign: background colour + centred text (+ optional accent stripe)
  // identical signs share one atlas slot
  sign(text, opts = {}) {
    const key = text + '|' + JSON.stringify(opts)
    this.cache ||= new Map()
    if (this.cache.has(key)) return this.cache.get(key)
    const r = this.drawSign(text, opts)
    this.cache.set(key, r)
    return r
  }

  drawSign(text, { bg = '#1c7a3e', fg = '#ffffff', w = 512, h = 96, family = 'Rubik', weight = '900', stripe = null, border = null, sub = null } = {}) {
    const r = this.alloc(w, h)
    const x = this.ctx
    x.save(); x.translate(r.x, r.y)
    x.fillStyle = bg; x.fillRect(0, 0, w, h)
    if (stripe) { x.fillStyle = stripe; x.fillRect(0, h - h * 0.14, w, h * 0.14) }
    if (border) { x.strokeStyle = border; x.lineWidth = Math.max(3, h * 0.05); x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth) }
    const size = this.fitText(text, w * 0.9, sub ? h * 0.5 : h * 0.62, weight, family)
    x.font = `${weight} ${size}px ${family}`
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillText(text, w / 2, sub ? h * 0.4 : h * 0.54)
    if (sub) {
      const s2 = this.fitText(sub, w * 0.9, h * 0.24, '500', family)
      x.font = `500 ${s2}px ${family}`
      x.fillText(sub, w / 2, h * 0.78)
    }
    x.restore()
    this.texture.needsUpdate = true
    return r
  }

  // blue Moldovan street-name plate
  street(text) {
    return this.sign(text, { bg: '#1f4f9c', fg: '#ffffff', w: 512, h: 80, weight: '700', border: '#ffffff' })
  }

  // arbitrary drawing callback
  custom(w, h, draw) {
    const r = this.alloc(w, h)
    const x = this.ctx
    x.save(); x.translate(r.x, r.y); x.beginPath(); x.rect(0, 0, w, h); x.clip()
    draw(x, w, h)
    x.restore()
    this.texture.needsUpdate = true
    return r
  }
}
