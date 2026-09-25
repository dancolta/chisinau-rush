import * as THREE from 'three'
import { SHARED } from './Materials.js'

// Real light after dark: the street lamps nearest to the action get point lights (they fade out
// and hop to other lamps as you move, so there is never a pop), a soft fill keeps the player
// readable, and the player's car throws a headlight beam. The light count never changes, so
// shaders compile once instead of hitching whenever a lamp comes into range.
export class NightLights {
  constructor(game, count) {
    this.game = game
    this.slots = []
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffc98a, 0, 24, 1.7)
      light.castShadow = false
      game.scene.add(light)
      this.slots.push({ light, lamp: null, k: 0 })
    }
    this.fill = new THREE.PointLight(0xc9d6ff, 0, 11, 1.6)
    game.scene.add(this.fill)
    this.head = new THREE.SpotLight(0xfff1d6, 0, 55, 0.5, 0.55, 1.4)
    game.scene.add(this.head, this.head.target)
    this.t = 0
    this.want = new Set()
  }

  update(dt) {
    const g = this.game
    const night = SHARED.uNight.value
    const focus = g.focus ? g.focus() : g.cameraRig?.target
    if (!focus) return
    // every few frames: which lamps deserve a real light
    this.t -= dt
    if (this.t <= 0 && this.slots.length) {
      this.t = 0.3
      const lamps = g.world.lamps
      const n = this.slots.length
      const best = []
      for (const l of lamps) {
        const d = (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2
        if (d > 70 * 70) continue
        if (best.length < n) { best.push([d, l]); if (best.length === n) best.sort((a, b) => a[0] - b[0]) }
        else if (d < best[n - 1][0]) { best[n - 1] = [d, l]; best.sort((a, b) => a[0] - b[0]) }
      }
      this.want = new Set(best.map((b) => b[1]))
      // free slots whose lamp dropped out go to lamps that don't have one yet
      const held = new Set(this.slots.map((s) => s.lamp))
      const queue = [...this.want].filter((l) => !held.has(l))
      for (const s of this.slots) {
        if (s.lamp && this.want.has(s.lamp)) continue
        if (s.k < 0.02 && queue.length) { s.lamp = queue.shift(); s.light.position.set(s.lamp.x, s.lamp.y - 0.35, s.lamp.z) }
      }
    }
    const fade = 1 - Math.exp(-4 * dt)
    for (const s of this.slots) {
      const target = s.lamp && this.want.has(s.lamp) ? 1 : 0
      s.k += (target - s.k) * fade
      // never toggle .visible: three.js recompiles every material when the light count changes
      s.light.intensity = 95 * s.k * night
    }
    // soft fill on the hero so the player never turns into a silhouette
    const p = g.player
    const cam = g.camera
    if (p && cam) {
      const pp = p.vehicle ? p.vehicle.pos : p.pos
      this.fill.position.set(pp.x + (cam.position.x - pp.x) * 0.35, pp.y + 2.6, pp.z + (cam.position.z - pp.z) * 0.35)
      this.fill.intensity = 7 * night * (g.cutscene ? 0.6 : 1)
      // headlights of the car you're driving
      const v = p.vehicle && !p.passenger ? p.vehicle : null
      const on = v && night > 0.2 && !v.broken
      this.head.intensity += ((on ? 420 * night : 0) - this.head.intensity) * fade
      if (v) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
        const L = v.def.dims[2]
        this.head.position.set(v.pos.x + fx * (L + 0.2), v.pos.y + 0.8, v.pos.z + fz * (L + 0.2))
        this.head.target.position.set(v.pos.x + fx * (L + 18), v.pos.y - 1.2, v.pos.z + fz * (L + 18))
        this.head.target.updateMatrixWorld()
      }
    }
  }
}
