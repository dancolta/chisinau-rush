import * as THREE from 'three'
import { Character, angleDiff } from './Character.js'
import { FILTER } from '../physics/Physics.js'
import { CURB_H } from '../world/CityLayout.js'
import { WEAPONS, makeWeaponMesh } from '../data/weapons.js'

const HALF_H = 0.55, RADIUS = 0.3
const CAP_Y = HALF_H + RADIUS // capsule centre above the feet

export class Player {
  constructor(game, spec, opts = {}) {
    this.game = game
    this.char = new Character(game, spec, { x: opts.x, z: opts.z, ry: opts.ry, name: 'player' })
    this.char.mesh.userData.isPlayer = true
    const P = game.physics
    const R = P.R
    this.body = P.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(opts.x ?? 0, (opts.y ?? CURB_H) + CAP_Y, opts.z ?? 0))
    this.collider = P.world.createCollider(R.ColliderDesc.capsule(HALF_H, RADIUS).setCollisionGroups(FILTER.PLAYER).setFriction(0), this.body)
    P.user.set(this.collider.handle, this)
    this.cc = P.characterController(0.02)
    this.vel = new THREE.Vector3()
    this.vy = 0
    this.grounded = true
    this.airT = 0
    this.stamina = 1
    this.sprinting = false
    this.control = true      // player input enabled
    this.vehicle = null
    this.scripted = null     // { x, z, speed, onArrive } for cutscene walking
    this.combo = 0
    this.comboT = 0
    this.attackCD = 0
    this.hitStun = 0
    this.weapon = 'fist'
    this.weaponMesh = null
    this.aimYaw = null
    this.isPlayer = true
    this.speedMul = 1
    this.jumpBuffered = 0
    this.lastSafe = new THREE.Vector3(opts.x ?? 0, CURB_H, opts.z ?? 0)
  }

  get pos() { return this.char.pos }
  get heading() { return this.char.heading }

  teleport(x, y, z, ry) {
    this.body.setTranslation({ x, y: y + CAP_Y, z }, true)
    this.body.setNextKinematicTranslation({ x, y: y + CAP_Y, z })
    this.char.setPos(x, y, z)
    if (ry !== undefined) { this.char.heading = ry; this.char.prevHeading = ry }
    this.vel.set(0, 0, 0); this.vy = 0
  }

  setWeapon(key) {
    this.weapon = key
    const hand = this.char.mesh.userData.bones.foreR
    if (this.weaponMesh) { hand.remove(this.weaponMesh); this.weaponMesh.geometry.dispose(); this.weaponMesh = null }
    const m = makeWeaponMesh(key, this.char.mesh.userData.heights)
    if (m) { hand.add(m); this.weaponMesh = m }
  }

  enableCollider(on) {
    this.collider.setEnabled(on)
  }

  // ---- fixed-step movement -----------------------------------------------------
  fixedUpdate(h) {
    const c = this.char
    c.beginStep()
    if (this.vehicle) return
    const game = this.game
    const input = game.input
    let mx = 0, my = 0
    const canMove = this.control && !c.ko && this.hitStun <= 0 && !game.ui?.modalOpen
    if (this.scripted) {
      const s = this.scripted
      const dx = s.x - c.pos.x, dz = s.z - c.pos.z, d = Math.hypot(dx, dz)
      if (d < 0.35) { const cb = s.onArrive; this.scripted = null; if (cb) cb() }
      else { mx = dx / d; my = dz / d }
    } else if (canMove) {
      const m = input.move()
      const yaw = game.cameraRig ? game.cameraRig.yaw : Math.PI
      const fx = Math.sin(yaw), fz = Math.cos(yaw)
      const rx = -Math.cos(yaw), rz = Math.sin(yaw)
      mx = fx * m.y + rx * m.x
      my = fz * m.y + rz * m.x
    }
    const mag = Math.min(1, Math.hypot(mx, my))
    // speed: jog by default, sprint on Shift with stamina
    const wantSprint = canMove && !this.scripted && input.act('sprint') && mag > 0.2
    if (wantSprint && this.stamina > 0.05) { this.sprinting = true; this.stamina = Math.max(0, this.stamina - h * 0.22) }
    else { this.sprinting = false; this.stamina = Math.min(1, this.stamina + h * (mag > 0.1 ? 0.18 : 0.32)) }
    let speed = this.scripted ? (this.scripted.speed ?? 2.2) : this.sprinting ? 7.4 : 4.7
    speed *= this.speedMul
    const busy = c.anim.busy && ['jab', 'cross', 'hook', 'kick', 'swing', 'spray'].includes(c.anim.action?.name)
    if (busy) speed *= 0.25
    const tvx = mx * speed, tvz = my * speed
    const accel = this.grounded ? 14 : 3
    const k = 1 - Math.exp(-accel * h)
    this.vel.x += (tvx - this.vel.x) * k
    this.vel.z += (tvz - this.vel.z) * k

    // jump / gravity
    if (this.jumpBuffered > 0) this.jumpBuffered -= h
    if (this.grounded && this.jumpBuffered > 0 && canMove) { this.vy = 6.2; this.grounded = false; this.jumpBuffered = 0; c.anim.play('jump'); game.audio?.sfx('jump', { vol: 0.5 }) }
    this.vy -= 22 * h
    if (this.grounded && this.vy < 0) this.vy = -2

    const desired = { x: this.vel.x * h, y: this.vy * h, z: this.vel.z * h }
    this.cc.computeColliderMovement(this.collider, desired, undefined, FILTER.PLAYER)
    const mv = this.cc.computedMovement()
    const t = this.body.translation()
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
    const wasGrounded = this.grounded
    this.grounded = this.cc.computedGrounded()
    if (!this.grounded) this.airT += h; else { if (!wasGrounded && this.airT > 0.35) { c.anim.play('land'); game.audio?.sfx('land', { vol: 0.5 }) } this.airT = 0 }
    // real velocity after collisions (for animation speed)
    const realV = Math.hypot(mv.x, mv.z) / h
    c.speed = Math.min(realV, speed + 0.5)
    c.pos.set(nx, ny - CAP_Y, nz)
    if (this.grounded && c.pos.y < 1) this.lastSafe.copy(c.pos)
    if (c.pos.y < -20) this.teleport(this.lastSafe.x, CURB_H + 0.5, this.lastSafe.z)

    // facing: aim direction while attacking, else movement direction
    if (this.aimYaw !== null && (busy || this.comboT > 0)) c.turnTo(this.aimYaw, h, 22)
    else if (mag > 0.15) c.turnTo(Math.atan2(mx, my), h, 12)
  }

  // ---- per-frame logic -----------------------------------------------------------
  update(dt) {
    const c = this.char
    const input = this.game.input
    if (this.attackCD > 0) this.attackCD -= dt
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0 }
    if (this.hitStun > 0) this.hitStun -= dt
    if (!this.vehicle) {
      const canAct = this.control && !c.ko && !this.scripted && !this.game.ui?.modalOpen
      if (canAct && input.pressed('jump')) this.jumpBuffered = 0.15
      if (canAct && input.pressed('attack')) this.attack()
      if (canAct && input.pressed('swap')) this.game.combat?.cycleWeapon(this)
      // animation state
      if (c.ko) { /* animator holds the knockdown */ }
      else if (!this.grounded && this.airT > 0.25) c.anim.set('fall')
      else c.anim.set(c.speed > 0.3 ? 'walk' : 'idle')
    }
    c.update(dt)
  }

  sync(alpha) { this.char.sync(alpha) }

  attack() {
    if (this.attackCD > 0) return
    const w = WEAPONS[this.weapon] || WEAPONS.fist
    const game = this.game
    this.aimYaw = game.combat ? game.combat.aimYaw(this) : this.char.heading
    let anim = w.anim
    if (w.key === 'fist') {
      anim = ['jab', 'cross', 'hook'][this.combo % 3]
      if (this.combo === 3) anim = 'kick'
    }
    const side = anim === 'cross' ? -1 : 1
    this.char.anim.play(anim, {
      side,
      onHit: () => game.combat?.strike(this, { ...w, comboStep: this.combo, heavy: anim === 'hook' || anim === 'kick' }),
    })
    this.combo = (this.combo + 1) % 4
    this.comboT = 0.9
    this.attackCD = w.cooldown * (anim === 'kick' ? 1.4 : 1)
    game.audio?.sfx('whoosh', { vol: 0.35, pitch: 0.9 + Math.random() * 0.3 })
  }
}

export { CAP_Y }
