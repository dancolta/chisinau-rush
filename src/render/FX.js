import * as THREE from 'three'
import { RES, SHARED } from './Materials.js'

// Lightweight particle system (one THREE.Points per texture) + skid mark ribbons.
const MAX = 1400

const vert = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
attribute float rot;
uniform vec2 uRes;
varying float vAlpha;
varying vec3 vTint;
varying float vRot;
void main() {
  vAlpha = alpha; vTint = tint; vRot = rot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // size is a world-space diameter: true perspective at any resolution / pixel ratio
  gl_PointSize = size * projectionMatrix[1][1] * uRes.y * 0.5 / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const frag = /* glsl */ `
uniform sampler2D map;
uniform float uNight;
uniform float uNightDim;
varying float vAlpha;
varying vec3 vTint;
varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), co = cos(vRot);
  vec2 uv = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;
  vec4 t = texture2D(map, uv);
  // smoke and dust aren't lit, so dim them at night instead of letting them glow grey
  gl_FragColor = vec4(vTint * t.rgb * (1.0 - uNightDim * uNight), t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}
`

class Emitter {
  constructor(scene, texture, blending, nightDim = 0, max = MAX) {
    const N = this.n = max
    this.pos = new Float32Array(N * 3)
    this.vel = new Float32Array(N * 3)
    this.life = new Float32Array(N)
    this.maxLife = new Float32Array(N)
    this.size = new Float32Array(N)
    this.size0 = new Float32Array(N)
    this.grow = new Float32Array(N)
    this.alpha = new Float32Array(N)
    this.alpha0 = new Float32Array(N)
    this.tint = new Float32Array(N * 3)
    this.rot = new Float32Array(N)
    this.spin = new Float32Array(N)
    this.grav = new Float32Array(N)
    this.drag = new Float32Array(N)
    this.cursor = 0
    const g = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage)
    this.aTint = new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage)
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.aPos); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha); g.setAttribute('tint', this.aTint); g.setAttribute('rot', this.aRot)
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: texture }, uRes: RES, uNight: SHARED.uNight, uNightDim: { value: nightDim } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending })
    this.points = new THREE.Points(g, m)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    this.active = 0
  }

  emit(x, y, z, o) {
    this.idle = false
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.n
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0
    this.life[i] = this.maxLife[i] = o.life || 1
    this.size0[i] = this.size[i] = o.size || 1
    this.grow[i] = o.grow || 0
    this.alpha0[i] = this.alpha[i] = o.alpha ?? 1
    const c = o.color || [1, 1, 1]
    this.tint[i * 3] = c[0]; this.tint[i * 3 + 1] = c[1]; this.tint[i * 3 + 2] = c[2]
    this.rot[i] = o.rot ?? Math.random() * 6.28
    this.spin[i] = o.spin || 0
    this.grav[i] = o.grav ?? 0
    this.drag[i] = o.drag ?? 1
    this.active = Math.min(this.n, this.active + 1)
  }

  update(dt) {
    if (this.idle) return
    let alive = 0
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue }
      alive++
      this.life[i] -= dt
      const k = Math.max(0, this.life[i] / this.maxLife[i])
      const d = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.pos[i * 3 + 1] < 0.18 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.18; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6 }
      this.size[i] = this.size0[i] + this.grow[i] * (1 - k)
      this.alpha[i] = this.alpha0[i] * Math.min(1, k * 2.5)
      this.rot[i] += this.spin[i] * dt
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aTint.needsUpdate = true; this.aRot.needsUpdate = true
    // nothing alive: this pass zeroed the last alphas, skip work (and uploads) until the next emit
    if (!alive) this.idle = true
  }
}

// skid marks: a ring buffer of dark quads on the ground
class Skids {
  constructor(scene) {
    this.max = 900
    this.pos = new Float32Array(this.max * 6 * 3)
    this.alpha = new Float32Array(this.max * 6)
    const g = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.aPos); g.setAttribute('alpha', this.aAlpha)
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.05,0.05,0.06, vA * 0.55); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    })
    this.mesh = new THREE.Mesh(g, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    scene.add(this.mesh)
    this.cursor = 0
    this.last = new Map()
  }

  add(key, x, y, z, w = 0.26, strength = 1) {
    const prev = this.last.get(key)
    this.last.set(key, { x, z, t: performance.now() })
    if (!prev || performance.now() - prev.t > 120) return
    const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz)
    if (d < 0.05 || d > 3) return
    const nx = (-dz / d) * w * 0.5, nz = (dx / d) * w * 0.5
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.max
    const Y = y + 0.02
    const P = [[prev.x - nx, prev.z - nz], [x - nx, z - nz], [x + nx, z + nz], [prev.x - nx, prev.z - nz], [x + nx, z + nz], [prev.x + nx, prev.z + nz]]
    for (let k = 0; k < 6; k++) {
      const o = (i * 6 + k) * 3
      this.pos[o] = P[k][0]; this.pos[o + 1] = Y; this.pos[o + 2] = P[k][1]
      this.alpha[i * 6 + k] = strength
    }
    this.aPos.needsUpdate = true; this.aAlpha.needsUpdate = true
  }

  end(key) { this.last.delete(key) }
}

// flat little sprites for things that aren't smoke: a sheet of paper (lines of text) and a confetti square
function flatTexture(lines) {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const x = c.getContext('2d')
  x.fillStyle = '#fff'
  if (lines) {
    x.fillRect(7, 3, 18, 26)
    x.fillStyle = 'rgba(40,40,60,0.35)'
    for (let i = 0; i < 6; i++) x.fillRect(10, 8 + i * 3.4, i % 3 === 2 ? 7 : 12, 1.3)
  } else x.fillRect(9, 5, 14, 22)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class FX {
  constructor(game) {
    this.game = game
    const tex = game.assets.textures
    this.soft = new Emitter(game.scene, tex.smoke, THREE.NormalBlending, 0.6)
    this.glow = new Emitter(game.scene, tex.particle, THREE.AdditiveBlending)
    this.sheets = new Emitter(game.scene, flatTexture(true), THREE.NormalBlending, 0.5, 160)
    this.bits = new Emitter(game.scene, flatTexture(false), THREE.NormalBlending, 0.4, 420)
    this.skids = new Skids(game.scene)
    this.t = 0
  }

  hit(x, y, z, heavy = false) {
    for (let i = 0; i < (heavy ? 14 : 8); i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 4
      this.glow.emit(x, y, z, { vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.25 + Math.random() * 0.2, size: 0.35, color: [1, 0.9, 0.5], grav: 6, drag: 4 })
    }
    this.glow.emit(x, y, z, { life: 0.12, size: heavy ? 2.4 : 1.6, grow: 0.6, color: [1, 0.95, 0.8], alpha: 0.9 })
  }

  dust(x, y, z, n = 8, color = [0.72, 0.68, 0.6]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2
      this.soft.emit(x + Math.cos(a) * 0.3, y + 0.15, z + Math.sin(a) * 0.3, { vx: Math.cos(a) * s, vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * s, life: 0.8 + Math.random() * 0.6, size: 0.7, grow: 1.6, alpha: 0.45, color, drag: 2, spin: (Math.random() - 0.5) * 2 })
    }
  }

  smoke(x, y, z, dark = 0.3, amt = 1) {
    this.soft.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, { vx: (Math.random() - 0.5) * 0.5, vy: 1.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.5, life: 1.6 + Math.random(), size: 0.8 * amt, grow: 2.8 * amt, alpha: 0.55, color: [dark, dark, dark * 1.05], drag: 0.6, spin: (Math.random() - 0.5) })
  }

  tireSmoke(x, y, z) {
    this.soft.emit(x, y + 0.2, z, { vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.8, life: 0.9 + Math.random() * 0.5, size: 0.6, grow: 2.2, alpha: 0.35, color: [0.92, 0.92, 0.94], drag: 1.2 })
  }

  sparks(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 6
      this.glow.emit(x, y, z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, life: 0.3 + Math.random() * 0.4, size: 0.18, color: [1, 0.7, 0.3], grav: 14, drag: 1.5 })
    }
  }

  paper(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.6
      this.sheets.emit(x, y + 0.4, z, { vx: Math.cos(a) * s, vy: 2.2 + Math.random() * 2.4, vz: Math.sin(a) * s, life: 1.8 + Math.random() * 0.8, size: 0.26, color: [1, 0.98, 0.92], alpha: 1, grav: 3.2, drag: 1.8, spin: (Math.random() - 0.5) * 9 })
    }
  }

  splat(x, y, z, color = [0.9, 0.15, 0.2]) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4
      this.soft.emit(x, y + 0.3, z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.7, size: 0.25, color: i % 3 ? color : [0.2, 0.6, 0.2], alpha: 0.95, grav: 12, drag: 1 })
    }
  }

  confetti(x, y, z, n = 60) {
    const cols = [[1, 0.8, 0.1], [0.1, 0.4, 1], [1, 0.1, 0.2], [1, 1, 1]]
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5
      this.bits.emit(x, y, z, { vx: Math.cos(a) * s, vy: 4 + Math.random() * 6, vz: Math.sin(a) * s, life: 2.5 + Math.random(), size: 0.16, color: cols[i % 4], grav: 4, drag: 1.2, spin: (Math.random() - 0.5) * 14 })
    }
  }

  water(x, y, z, r = 1) {
    this.glow.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, { vx: (Math.random() - 0.5) * r, vy: 3.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * r, life: 1.1, size: 0.25, color: [0.55, 0.75, 1], alpha: 0.5, grav: 9, drag: 0.4 })
  }

  update(dt) {
    this.t += dt
    // ambient fountains
    const w = this.game.world
    const p = this.game.player?.pos
    if (w && p) for (const f of w.fountains) {
      if ((f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 90 * 90 && Math.random() < 0.7) this.water(f.x, f.y, f.z, f.r * 0.3)
    }
    this.soft.update(dt)
    this.glow.update(dt)
    this.sheets.update(dt)
    this.bits.update(dt)
  }
}
