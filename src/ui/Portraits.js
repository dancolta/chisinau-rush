import * as THREE from 'three'
import { buildCharacter } from '../entities/CharacterModel.js'

// Renders character head-and-shoulders portraits (for dialogue) with the main renderer.
export class Portraits {
  constructor(game) {
    this.game = game
    this.cache = new Map()
    this.size = 256
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2a3a, 1.4))
    const key = new THREE.DirectionalLight(0xffe2b8, 2.4); key.position.set(1.5, 2.5, 2.5); this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4); rim.position.set(-2, 1.5, -1.5); this.scene.add(rim)
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20)
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { samples: 4 })
    this.rt.texture.colorSpace = THREE.SRGBColorSpace
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = this.size
    this.ctx = this.canvas.getContext('2d')
    this.buf = new Uint8Array(this.size * this.size * 4)
  }

  // who: { id, spec, name, bg? }
  get(who) {
    const key = who.id || who.name
    if (this.cache.has(key)) return this.cache.get(key)
    const url = this.render(who.spec, who.bg)
    this.cache.set(key, url)
    return url
  }

  render(spec, bg = null) {
    const r = this.game.renderer.renderer
    const mesh = buildCharacter(spec)
    const H = mesh.userData.heights
    this.scene.add(mesh)
    const hy = H.yHead
    this.camera.position.set(0.32, hy + 0.1, 1.55)
    this.camera.lookAt(0, hy - 0.07, 0)
    const prevTarget = r.getRenderTarget(), prevTM = r.toneMapping, prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha()
    const prevBg = this.scene.background
    this.scene.background = new THREE.Color(bg ?? 0x3a2f45)
    r.toneMapping = THREE.NoToneMapping
    r.setRenderTarget(this.rt)
    r.clear()
    r.render(this.scene, this.camera)
    r.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this.buf)
    r.setRenderTarget(prevTarget)
    r.toneMapping = prevTM
    r.setClearColor(prevClear, prevAlpha)
    this.scene.background = prevBg
    this.scene.remove(mesh)
    mesh.geometry.dispose(); mesh.skeleton.dispose()
    // flip rows into the 2D canvas, then add a soft vignette
    const img = this.ctx.createImageData(this.size, this.size)
    const S = this.size
    for (let y = 0; y < S; y++) img.data.set(this.buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4)
    this.ctx.putImageData(img, 0, 0)
    const g = this.ctx.createRadialGradient(S / 2, S * 0.45, S * 0.3, S / 2, S / 2, S * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)')
    this.ctx.fillStyle = g; this.ctx.fillRect(0, 0, S, S)
    return this.canvas.toDataURL('image/png')
  }
}
