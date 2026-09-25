import * as THREE from 'three'
import { SHARED } from './Materials.js'

// Passing rain showers: falling streaks around the camera (all in the vertex shader),
// darker sky and lights, denser fog, wet reflective roads and a rain bed in the audio mix.
const N = 2600
const BOX = new THREE.Vector3(46, 26, 46)

export class Weather {
  constructor(game) {
    this.game = game
    this.k = 0            // current rain amount 0..1
    this.target = 0
    this.timer = 260 + Math.random() * 280
    const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 3), tip = new Float32Array(N * 2)
    for (let i = 0; i < N; i++) {
      const s = [Math.random(), Math.random(), Math.random()]
      for (let j = 0; j < 2; j++) { seed.set(s, (i * 2 + j) * 3); tip[i * 2 + j] = j }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3))
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1))
    this.uniforms = { uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmount: { value: 0 }, uBox: { value: BOX }, uColor: { value: new THREE.Color(0xb8c4d4) } }
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 seed; attribute float tip;
        uniform vec3 uCenter; uniform float uTime; uniform vec3 uBox; uniform float uAmount;
        varying float vA;
        void main() {
          vec3 p;
          p.x = uCenter.x + (fract(seed.x - uCenter.x / uBox.x) - 0.5) * uBox.x;
          p.z = uCenter.z + (fract(seed.z - uCenter.z / uBox.z) - 0.5) * uBox.z;
          float fall = fract(seed.y - uTime * (0.75 + seed.x * 0.25) * 21.0 / uBox.y);
          p.y = uCenter.y - 6.0 + fall * uBox.y;
          p += vec3(0.9, -1.0, 0.25) * tip * 0.55;           // streak with a little wind slant
          vA = step(seed.z, uAmount) * (0.35 + 0.65 * tip);  // fewer drops when it drizzles
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uAmount; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA * 0.42 * min(1.0, uAmount * 2.0)); }`,
    })
    this.mesh = new THREE.LineSegments(g, m)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.visible = false
    game.scene.add(this.mesh)
  }

  set(on) { this.target = on ? 1 : 0; this.timer = on ? 150 + Math.random() * 150 : 320 + Math.random() * 400 }

  update(dt) {
    const g = this.game
    if (g.state === 'play' && !g.story?.active?.def.dry) {
      this.timer -= dt
      if (this.timer <= 0) this.set(this.target === 0 && Math.random() < 0.45)
    }
    this.k += (this.target - this.k) * Math.min(1, dt / 9)
    if (this.k < 0.002) this.k = 0
    const k = this.k
    this.mesh.visible = k > 0.01
    const u = this.uniforms
    u.uAmount.value = k
    u.uTime.value += dt
    const c = g.camera.position, t = g.cameraRig?.target
    u.uCenter.value.set(t ? (t.x * 0.6 + c.x * 0.4) : c.x, t ? t.y + 4 : c.y, t ? (t.z * 0.6 + c.z * 0.4) : c.z)
    // wet surfaces
    const s = g.world.surf
    if (s && Math.abs((this.lastK ?? -1) - k) > 0.01) {
      this.lastK = k
      for (const suf of ['', '_o']) {
        const a = s['asphalt' + suf], p = s['paving' + suf], z = s['plaza' + suf]
        if (a) { a.roughness = 0.88 - 0.52 * k; a.envMapIntensity = 0.35 + 0.9 * k }
        if (p) { p.roughness = 0.84 - 0.4 * k; p.envMapIntensity = 0.35 + 0.6 * k }
        if (z) z.roughness = 0.74 - 0.35 * k
      }
    }
    g.audio?.rain?.(k)
  }

  // darker, greyer light while it rains (called after the time-of-day palette is applied)
  apply(renderer) {
    const k = this.k
    if (k <= 0) return
    // overcast grey by day, a dark wet blue at night
    const day = 1 - SHARED.uNight.value
    const grey = _c.setRGB(0.08 + 0.34 * day, 0.09 + 0.36 * day, 0.12 + 0.38 * day)
    renderer.sun.intensity *= 1 - 0.7 * k
    renderer.hemi.intensity *= 1 - 0.25 * k
    renderer.scene.fog.color.lerp(grey, 0.55 * k)
    renderer.scene.fog.far = 900 - 480 * k
    const u = renderer.sky.uniforms
    u.uTop.value.lerp(grey, 0.6 * k); u.uHorizon.value.lerp(grey, 0.6 * k)
    u.uCloud.value = Math.min(1, u.uCloud.value + 0.5 * k)
    u.uSunColor.value.multiplyScalar(1 - 0.8 * k)
    renderer.renderer.setClearColor(renderer.scene.fog.color)
  }
}
const _c = new THREE.Color()
