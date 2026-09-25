import * as THREE from 'three'
import { buildCharacter } from './CharacterModel.js'
import { Animator } from './Animator.js'
import { CURB_H } from '../world/CityLayout.js'

const TAU = Math.PI * 2
export function angleDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d }

// Visual + animation wrapper shared by the player, story NPCs and pedestrians.
export class Character {
  constructor(game, spec, opts = {}) {
    this.game = game
    this.spec = spec
    this.id = opts.id || null
    this.name = opts.name || ''
    this.mesh = buildCharacter(spec)
    this.mesh.userData.character = this
    this.anim = new Animator(this.mesh)
    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? CURB_H, opts.z ?? 0)
    this.prev = this.pos.clone()
    this.heading = opts.ry ?? 0
    this.prevHeading = this.heading
    this.speed = 0
    this.vel = new THREE.Vector3()
    this.hp = opts.hp ?? 100
    this.maxHp = this.hp
    this.ko = false
    this.koT = 0
    this.voice = opts.voice ?? 1
    this.visible = true
    game.scene.add(this.mesh)
    this.syncNow()
  }

  get fx() { return Math.sin(this.heading) }
  get fz() { return Math.cos(this.heading) }

  setPos(x, y, z) { this.pos.set(x, y, z); this.prev.copy(this.pos); this.syncNow() }

  faceTowards(x, z, dt, rate = 10) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z)
    this.turnTo(target, dt, rate)
  }

  turnTo(target, dt, rate = 10) {
    const d = angleDiff(this.heading, target)
    this.heading += d * (1 - Math.exp(-rate * dt))
  }

  lookAtNow(x, z) { this.heading = Math.atan2(x - this.pos.x, z - this.pos.z); this.prevHeading = this.heading }

  setVisible(v) { this.visible = v; this.mesh.visible = v }

  syncNow() {
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.y = this.heading
  }

  // interpolate between the last two fixed steps for buttery motion
  sync(alpha) {
    this.mesh.position.lerpVectors(this.prev, this.pos, alpha)
    this.mesh.rotation.y = this.prevHeading + angleDiff(this.prevHeading, this.heading) * alpha
  }

  beginStep() { this.prev.copy(this.pos); this.prevHeading = this.heading }

  update(dt) {
    if (!this.visible) return
    this.anim.update(dt, this.speed)
  }

  dispose() {
    this.game.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.skeleton.dispose()
  }
}
