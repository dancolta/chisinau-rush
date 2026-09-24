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
  t.anisotropy = 8
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

export function makeAsphalt() {
  const S = 512
  const [c, x] = canvas(S, S)
  const r = rng(7)
  x.fillStyle = '#44464b'; x.fillRect(0, 0, S, S)
  // large tonal patches (repairs, wear)
  for (let i = 0; i < 26; i++) {
    const g = x.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 40 + r() * 120)
    const l = 58 + Math.floor(r() * 18)
    g.addColorStop(0, `rgba(${l},${l + 1},${l + 4},0.35)`); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, S, S)
  }
  // a couple of faint repair patches (typical Chișinău), low contrast so tiling doesn't show
  for (let i = 0; i < 3; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(52,53,57,0.35)' : 'rgba(74,75,80,0.22)'
    const w = 40 + r() * 90, h = 30 + r() * 70
    x.fillRect(r() * S, r() * S, w, h)
  }
  speckle(x, S, S, r, 9000, ['#3a3c40', '#505257', '#5c5e63', '#36373b', '#6a6b6f'], [1, 2.2])
  // cracks
  x.strokeStyle = 'rgba(25,25,28,0.55)'; x.lineWidth = 1.2
  for (let i = 0; i < 14; i++) {
    let px = r() * S, py = r() * S
    x.beginPath(); x.moveTo(px, py)
    for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; x.lineTo(px, py) }
    x.stroke()
  }
  return toTex(c)
}

export function makePaving() {
  const S = 512, T = 64
  const [c, x] = canvas(S, S)
  const r = rng(11)
  x.fillStyle = '#8b8b88'; x.fillRect(0, 0, S, S)
  for (let ty = 0; ty < S / T; ty++) for (let tx = 0; tx < S / T; tx++) {
    const l = 150 + Math.floor((r() - 0.5) * 26)
    x.fillStyle = `rgb(${l},${l - 2},${l - 6})`
    x.fillRect(tx * T + 2, ty * T + 2, T - 4, T - 4)
    if (r() < 0.06) { // broken tile
      x.fillStyle = `rgb(${l - 30},${l - 32},${l - 34})`
      x.beginPath(); x.moveTo(tx * T + 2, ty * T + 2 + r() * T); x.lineTo(tx * T + T - 2, ty * T + 2); x.lineTo(tx * T + T - 2, ty * T + T - 2); x.fill()
    }
  }
  speckle(x, S, S, r, 5000, ['rgba(60,60,60,0.25)', 'rgba(210,210,200,0.2)'], [1, 2])
  return toTex(c)
}

export function makePlaza() {
  const S = 512, T = 128
  const [c, x] = canvas(S, S)
  const r = rng(23)
  x.fillStyle = '#9d8f78'; x.fillRect(0, 0, S, S)
  for (let ty = 0; ty < S / T; ty++) for (let tx = 0; tx < S / T; tx++) {
    const l = Math.floor((r() - 0.5) * 22)
    x.fillStyle = `rgb(${196 + l},${184 + l},${160 + l})`
    x.fillRect(tx * T + 2, ty * T + 2, T - 4, T - 4)
    // subtle inner granite grain
    speckle(x, T - 6, T - 6, r, 80, ['rgba(120,110,95,0.18)', 'rgba(250,245,230,0.18)'], [1, 3])
  }
  speckle(x, S, S, r, 3000, ['rgba(120,110,95,0.18)', 'rgba(250,245,230,0.15)'], [1, 2.5])
  return toTex(c)
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
