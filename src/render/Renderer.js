import * as THREE from 'three'
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, VignetteEffect,
  ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BrightnessContrastEffect, SMAAPreset,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { Sky } from './Sky.js'
import { TimeOfDay } from './TimeOfDay.js'
import { SHARED, RES } from './Materials.js'

export const QUALITY = {
  low: { label: 'Scăzută', post: false, shadows: false, shadowMap: 1024, shadowSize: 50, ao: false, bloom: false, smaa: false, maxDpr: 1, antialias: false, lamps: 2 },
  medium: { label: 'Medie', post: true, shadows: true, shadowMap: 1024, shadowSize: 60, ao: false, bloom: true, smaa: true, maxDpr: 1.25, antialias: false, lamps: 4 },
  high: { label: 'Înaltă', post: true, shadows: true, shadowMap: 2048, shadowSize: 70, ao: true, bloom: true, smaa: true, maxDpr: 1.5, antialias: false, lamps: 8 },
  ultra: { label: 'Ultra', post: true, shadows: true, shadowMap: 4096, shadowSize: 90, ao: true, bloom: true, smaa: true, maxDpr: 2, antialias: false, lamps: 12 },
}

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4()

export class Renderer {
  constructor(container, settings) {
    this.container = container
    this.settings = settings
    this.q = QUALITY[settings.quality] || QUALITY.high
    this.dynScale = 1
    this.frameTimes = []

    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false, preserveDrawingBuffer: false })
    r.outputColorSpace = THREE.SRGBColorSpace
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    r.setClearColor(0x0e0f13, 1)
    r.info.autoReset = false
    container.appendChild(r.domElement)
    r.domElement.id = 'game-canvas'
    this.renderer = r

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.7, 2400)
    this.camera.position.set(0, 40, 40)

    // sky + time of day
    this.tod = new TimeOfDay()
    this.sky = new Sky()
    this.scene.add(this.sky.mesh)
    this.scene.fog = new THREE.Fog(0xd29a66, 140, 900)

    // lights
    this.hemi = new THREE.HemisphereLight(0x8fb0bd, 0x5e3f2c, 0.7)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffae62, 2.5)
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.00035
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.focus = new THREE.Vector3()

    // environment map from the sky (refreshed as the time changes)
    this.pmrem = new THREE.PMREMGenerator(r)
    this.envScene = new THREE.Scene()
    this.envScene.add(new THREE.Mesh(this.sky.mesh.geometry, this.sky.mesh.material))
    this._envHour = -99
    this.envRT = null

    this.composer = null
    this.applyQuality(settings.quality)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  applyQuality(name) {
    this.q = QUALITY[name] || QUALITY.high
    const q = this.q
    const r = this.renderer
    r.shadowMap.enabled = q.shadows
    this.sun.castShadow = q.shadows
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null }
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap)
    const s = q.shadowSize
    const sc = this.sun.shadow.camera
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 500
    sc.updateProjectionMatrix()
    this.dynScale = 1

    if (this.composer) { this.composer.dispose(); this.composer = null }
    if (q.post) {
      r.toneMapping = THREE.NoToneMapping
      const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
      composer.addPass(new RenderPass(this.scene, this.camera))
      if (q.ao) {
        const ao = new N8AOPostPass(this.scene, this.camera, 1, 1)
        ao.configuration.aoRadius = 3.2
        ao.configuration.distanceFalloff = 1.2
        ao.configuration.intensity = 2.2
        ao.configuration.halfRes = true
        ao.configuration.depthAwareUpsampling = true
        ao.setQualityMode('Low')
        this.ao = ao
        composer.addPass(ao)
      } else this.ao = null
      const effects = []
      if (q.bloom) {
        this.bloom = new BloomEffect({ luminanceThreshold: 0.92, luminanceSmoothing: 0.12, intensity: 1.05, mipmapBlur: true, radius: 0.72 })
        effects.push(this.bloom)
      }
      this.toneMap = new ToneMappingEffect({ mode: ToneMappingMode.AGX })
      effects.push(this.toneMap)
      // AgX keeps highlights graceful and night shadows readable; it also greys things out,
      // so the grade puts saturation and contrast back
      this.hueSat = new HueSaturationEffect({ saturation: 0.3 })
      this.bc = new BrightnessContrastEffect({ contrast: 0.13, brightness: 0.0 })
      this.vignette = new VignetteEffect({ darkness: 0.42, offset: 0.32 })
      effects.push(this.hueSat, this.bc, this.vignette)
      composer.addPass(new EffectPass(this.camera, ...effects))
      if (q.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })))
      this.composer = composer
    } else {
      r.toneMapping = THREE.AgXToneMapping
      r.toneMappingExposure = 1.0
      this.ao = null
    }
    this.resize()
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr) * this.dynScale
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) this.composer.setSize(w, h)
    RES.value.set(w * dpr, h * dpr)
    SHARED.uCutAspect.value = w / h
    this.w = w; this.h = h
  }

  // adaptive resolution: keeps the frame rate smooth on weaker GPUs
  trackFrame(dtMs) {
    if (!this.settings.autoRes) return
    this.frameTimes.push(dtMs)
    if (this.frameTimes.length < 120) return
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    const p75 = sorted[Math.floor(sorted.length * 0.75)]
    this.frameTimes.length = 0
    // needs two slow windows in a row to drop, four fast ones to climb back, so the
    // resolution settles instead of pumping (a visible shimmer on its own)
    this.slowN = p75 > 24 ? (this.slowN || 0) + 1 : 0
    this.fastN = p75 < 13 ? (this.fastN || 0) + 1 : 0
    let s = this.dynScale
    if (this.slowN >= 2) { s = Math.max(0.6, s - 0.1); this.slowN = 0 }
    else if (this.fastN >= 4 && s < 1) { s = Math.min(1, s + 0.1); this.fastN = 0 }
    if (s !== this.dynScale) { this.dynScale = s; this.resize() }
  }

  updateEnvironment(force = false) {
    const h = this.tod.hour
    if (!force && Math.abs(h - this._envHour) < 0.04) return
    this._envHour = h
    const old = this.envRT
    this.envRT = this.pmrem.fromScene(this.envScene, 0.04, 1, 3000)
    this.scene.environment = this.envRT.texture
    if (old) old.dispose()
  }

  applyTimeOfDay() {
    const t = this.tod, s = t.state
    const u = this.sky.uniforms
    u.uTop.value.copy(s.top); u.uHorizon.value.copy(s.hor); u.uBottom.value.copy(s.bot)
    u.uSunDir.value.copy(t.sunDir); u.uMoonDir.value.copy(t.moonDir)
    u.uSunColor.value.copy(s.sun).multiplyScalar(Math.min(1, s.sunI / 1.5 + 0.25))
    u.uCloudLit.value.copy(s.cloudLit); u.uCloudShade.value.copy(s.cloudShade)
    u.uStars.value = s.stars; u.uCloud.value = s.cloud; u.uMoon.value = s.moonI > 0.05 ? 1 : 0
    this.scene.fog.color.copy(s.fog)
    this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGnd); this.hemi.intensity = s.hemiI
    this.sun.color.copy(t.lightColor); this.sun.intensity = t.lightIntensity
    this.renderer.setClearColor(s.fog)
    SHARED.uNight.value = s.lamps
    this.renderer.toneMappingExposure = s.exposure * (this.settings?.brightness ?? 1)
    this.scene.fog.far = 900
    this.weather?.apply(this)
  }

  // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer.
  // The sun's direction only moves in small steps: re-aiming the shadow map every frame
  // makes every shadow edge in the city crawl.
  updateShadowFocus(focus) {
    this.focus.copy(focus)
    const L = this.sun
    this.shadowDir ||= this.tod.lightDir.clone()
    if (this.shadowDir.angleTo(this.tod.lightDir) > 0.006) this.shadowDir.copy(this.tod.lightDir)
    const dir = this.shadowDir
    const size = this.q.shadowSize * 2
    const texel = size / this.q.shadowMap
    _m.lookAt(_v.set(0, 0, 0), _v.copy(dir).negate(), THREE.Object3D.DEFAULT_UP)
    _mi.copy(_m).invert()
    const p = _v.copy(focus).applyMatrix4(_mi)
    p.x = Math.round(p.x / texel) * texel
    p.y = Math.round(p.y / texel) * texel
    p.applyMatrix4(_m)
    L.target.position.copy(p)
    L.position.copy(p).addScaledVector(dir, 220)
    L.target.updateMatrixWorld()
  }

  render(dt) {
    this.sky.follow(this.camera)
    SHARED.uTime.value += dt
    this.sky.uniforms.uTime.value += dt
    this.renderer.info.reset()
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }
}
