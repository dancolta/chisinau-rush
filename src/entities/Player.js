import * as THREE from 'three'
import { Character } from './Character.js'
import { FILTER } from '../physics/Physics.js'
import { CURB_H } from '../world/CityLayout.js'
import { WEAPONS, makeWeaponMesh } from '../data/weapons.js'
import { angleDiff } from './Character.js'

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
    this.winded = false      // ran the stamina dry: no sprint until it has recovered a bit
    this.moveKey = null      // keyboard direction being held, and the camera yaw it was read against
    this.moveYaw = 0
    this.steering = false    // keyboard steering: A/D turn, W/S go forward/back
    this.turnV = 0           // current turn rate (rad/s), eased
    this.backward = false
    this.attackBuf = 0       // a punch pressed during the previous one fires as soon as it can
    this.lunge = null
    this.bailT = 0
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
      const rig = game.cameraRig
      this.steering = m.digital && game.settings.moveMode !== 'camera'
      if (this.steering) {
        // Keyboard: A/D turn you for as long as they're held (smoothly spun up and down), W/S
        // walk you forward/back along where you face, and the camera stays behind you. Turning
        // the camera yourself (mouse) and pushing forward steers you toward where it looks.
        const turn = -Math.sign(m.x) // +1 = left
        const fwd = Math.sign(m.y)
        const rate = fwd === 0 ? 3.4 : this.sprinting ? 2.3 : 2.9
        this.turnV += (turn * rate - this.turnV) * (1 - Math.exp(-12 * h))
        if (Math.abs(this.turnV) > 0.002) c.heading += this.turnV * h
        if (fwd > 0 && rig && rig.userYawT > 0 && turn === 0) c.heading += angleDiff(c.heading, rig.yaw) * (1 - Math.exp(-7 * h))
        this.backward = fwd < 0
        mx = Math.sin(c.heading) * fwd
        my = Math.cos(c.heading) * fwd
        this.moveKey = null
      } else {
        this.turnV = 0; this.backward = false
        let yaw = rig ? rig.yaw : Math.PI
        // camera-relative: keys are read against the camera once, when the combination changes,
        // and held, so the camera can swing in behind you without bending the run into a circle
        if (m.digital && (m.x || m.y)) {
          const key = Math.sign(m.x) + 3 * Math.sign(m.y)
          if (key !== this.moveKey || (rig && rig.userTurnT > 0)) { this.moveKey = key; this.moveYaw = yaw }
          yaw = this.moveYaw
        } else this.moveKey = null
        const fx = Math.sin(yaw), fz = Math.cos(yaw)
        const rx = -Math.cos(yaw), rz = Math.sin(yaw)
        mx = fx * m.y + rx * m.x
        my = fz * m.y + rz * m.x
      }
    } else { this.moveKey = null; this.turnV = 0; this.backward = false }
    const mag = Math.min(1, Math.hypot(mx, my))
    // speed: run by default, hold Shift to sprint while the stamina lasts (~10 s)
    const wantSprint = canMove && !this.scripted && !this.backward && input.act('sprint') && mag > 0.2
    if (this.stamina <= 0.01 && !this.winded) { this.winded = true; game.ui?.notify?.('Ți s-a tăiat respirația…', 1.6) }
    if (this.winded && this.stamina > 0.3) this.winded = false
    // the stroika worker's lungs: sprint drains much slower and comes back faster
    const lungs = game.progress?.perk?.stamina || 1
    if (wantSprint && !this.winded) { this.sprinting = true; this.stamina = Math.max(0, this.stamina - h * 0.1 / lungs) }
    else { this.sprinting = false; this.stamina = Math.min(1, this.stamina + h * (mag > 0.1 ? 0.16 : 0.3) * Math.sqrt(lungs)) }
    let speed = this.scripted ? (this.scripted.speed ?? 2.2) : this.backward ? 2.6 : this.sprinting ? 9.2 : 5.0
    speed *= this.speedMul
    const busy = c.anim.busy && ['jab', 'cross', 'hook', 'kick', 'swing', 'spray'].includes(c.anim.action?.name)
    if (busy) speed *= 0.25
    let tvx = mx * speed, tvz = my * speed
    // lunge: step into the punch so it connects
    if (this.lunge && this.lunge.t > 0) { tvx = this.lunge.vx; tvz = this.lunge.vz; this.lunge.t -= h; this.vel.x = tvx; this.vel.z = tvz }
    const accel = this.grounded ? (this.sprinting ? 9 : 14) : 3
    const k = 1 - Math.exp(-accel * h)
    this.vel.x += (tvx - this.vel.x) * k
    this.vel.z += (tvz - this.vel.z) * k

    // jump / gravity (a short grace after stepping off a ledge still counts as grounded)
    if (this.jumpBuffered > 0) this.jumpBuffered -= h
    const canJump = this.grounded || this.airT < 0.12
    if (canJump && this.vy <= 0.5 && this.jumpBuffered > 0 && canMove) { this.vy = 6.2; this.grounded = false; this.airT = 0.2; this.jumpBuffered = 0; c.anim.play('jump'); game.audio?.sfx('jump', { vol: 0.5 }) }
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
    if (!this.grounded) this.airT += h; else { if (!wasGrounded && this.airT > 0.35 && !c.ko) { c.anim.play('land'); game.audio?.sfx('land', { vol: 0.5 }) } this.airT = 0 }
    // real velocity after collisions (for animation speed; the camera leads with it too, so it
    // mustn't keep pointing into a wall you're pressed against)
    const realV = Math.hypot(mv.x, mv.z) / h
    if (this.grounded && !(this.lunge && this.lunge.t > 0)) { this.vel.x = mv.x / h; this.vel.z = mv.z / h }
    c.speed = Math.min(realV, speed + 0.5) * (this.backward ? -1 : 1)
    c.pos.set(nx, ny - CAP_Y, nz)
    if (this.grounded && c.pos.y < 1) this.lastSafe.copy(c.pos)
    if (c.pos.y < -20) this.teleport(this.lastSafe.x, CURB_H + 0.5, this.lastSafe.z)

    // facing: toward the target while a swing plays, else where you're going (steering sets it
    // directly)
    if (this.aimYaw !== null && busy) c.turnTo(this.aimYaw, h, 22)
    else if (mag > 0.15 && !this.steering) c.turnTo(Math.atan2(mx, my), h, 12)
  }

  // ---- per-frame logic -----------------------------------------------------------
  update(dt) {
    const c = this.char
    const input = this.game.input
    // combat timers run on real time, so hitstop doesn't stretch them
    const rdt = this.game.rawDt ?? dt
    if (this.attackCD > 0) this.attackCD -= rdt
    if (this.comboT > 0) { this.comboT -= rdt; if (this.comboT <= 0) this.combo = 0 }
    if (this.attackBuf > 0) { this.attackBuf -= rdt; if (this.attackCD <= 0 && this.control && !c.ko && !this.vehicle) { this.attackBuf = 0; this.attack() } }
    if (this.hitStun > 0) this.hitStun -= dt
    // tumbling after bailing out of a moving car: back on your feet
    if (this.bailT > 0) { this.bailT -= dt; if (this.bailT <= 0 && c.ko) { c.ko = false; c.anim.play('getup') } }
    if (!this.vehicle) {
      const canAct = this.control && !c.ko && !this.scripted && !this.game.ui?.modalOpen
      if (canAct && input.pressed('jump')) this.jumpBuffered = 0.15
      if (canAct && input.pressed('attack')) { if (this.attackCD > 0) this.attackBuf = 0.22; else this.attack() }
      if (canAct && input.pressed('swap')) this.game.combat?.cycleWeapon(this)
      // animation state
      if (c.ko) { /* animator holds the knockdown */ }
      else if (!this.grounded && this.airT > 0.25) c.anim.set('fall')
      else c.anim.set(Math.abs(c.speed) > 0.3 ? 'walk' : 'idle')
    }
    c.update(dt)
  }

  sync(alpha) { this.char.sync(alpha) }

  attack() {
    if (this.attackCD > 0) return
    const w = WEAPONS[this.weapon] || WEAPONS.fist
    const game = this.game
    const tgt = game.combat ? game.combat.aimTarget(this) : null
    this.aimYaw = tgt ? Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : this.char.heading
    // close the gap to a locked target so the swing lands
    if (tgt) {
      const d = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z)
      const reach = (w.range || 1.4) * 0.85
      if (d > reach) { const v = Math.min(9, (d - reach) / 0.13); this.lunge = { t: 0.13, vx: Math.sin(this.aimYaw) * v, vz: Math.cos(this.aimYaw) * v } }
    }
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
