import * as THREE from 'three'
import { Character, angleDiff } from './Character.js'
import { FILTER } from '../physics/Physics.js'
import { onRoad } from '../world/CityLayout.js'

const CAP_HALF = 0.55, CAP_R = 0.32

// A walking, talking, punchable person. Used for pedestrians, cops, gopniks and story NPCs.
export class NPC {
  constructor(game, spec, opts = {}) {
    this.game = game
    this.char = new Character(game, spec, opts)
    this.char.mesh.userData.npc = this
    this.personality = opts.personality || 'normal' // normal | coward | tough | babushka | cop | story
    this.name = opts.name || ''
    this.voice = opts.voice || { pitch: 1, type: 'male' }
    this.hp = opts.hp ?? 40
    this.maxHp = this.hp
    this.state = opts.state || 'idle'   // idle | walk | flee | fight | knocked | sit | squat | talk | scripted | follow
    this.path = []
    this.target = null
    this.speed = opts.walkSpeed ?? 1.35 + Math.random() * 0.35
    this.runSpeed = opts.runSpeed ?? 5.2
    this.stateT = 0
    this.fightCD = 0
    this.knockT = 0
    this.hitCount = 0
    this.hostile = false
    this.stun = 0
    this.onRoad = false
    this.persistent = !!opts.persistent
    this.interact = opts.interact || null // { label, onInteract } for story NPCs
    this.home = { x: this.char.pos.x, z: this.char.pos.z, ry: this.char.heading }
    this.vel = new THREE.Vector3()
    this.fly = null // knocked-back flight { vx, vy, vz }
    const P = game.physics, R = P.R
    this.body = P.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.char.pos.x, this.char.pos.y + CAP_HALF + CAP_R, this.char.pos.z))
    this.collider = P.world.createCollider(R.ColliderDesc.capsule(CAP_HALF, CAP_R).setCollisionGroups(FILTER.PED), this.body)
    P.user.set(this.collider.handle, this)
    if (opts.anim) this.char.anim.set(opts.anim)
  }

  get pos() { return this.char.pos }
  get ko() { return this.char.ko }

  say(text, dur = 2.6) { this.game.ui?.bubble(this, text, dur) }

  walkTo(x, z, opts = {}) {
    this.path = [{ x, z }]
    this.state = opts.run ? 'run' : 'walk'
    this.onArrive = opts.onArrive || null
    this.arriveFace = opts.face ?? null
  }

  followPath(points, opts = {}) {
    this.path = points.slice()
    this.state = opts.run ? 'run' : 'walk'
    this.onArrive = opts.onArrive || null
  }

  // ---- damage / reactions --------------------------------------------------------
  takeHit(dmg, fromX, fromZ, knock = 3, attacker = null, opts = {}) {
    if (this.char.ko && this.state === 'knocked') return
    this.hp -= dmg
    this.hitCount++
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ, d = Math.hypot(dx, dz) || 1
    if (opts.stun) { this.stun = opts.stun; this.char.anim.set('cower') }
    this.game.fx?.hit(this.pos.x, this.pos.y + 1.3, this.pos.z)
    if (this.hp <= 0 || knock > 7) {
      this.knockDown(dx / d * knock, dz / d * knock, this.hp <= 0 ? 7 + Math.random() * 5 : 2.5)
    } else {
      this.char.anim.play('hit', { side: Math.random() < 0.5 ? 1 : -1 })
      this.pushX = dx / d * knock * 0.6; this.pushZ = dz / d * knock * 0.6
    }
    this.game.events.emit('npc:hit', { npc: this, attacker, dmg })
    this.react(attacker)
  }

  knockDown(vx, vz, secs = 4, vy = 2.5) {
    const c = this.char
    c.ko = true
    this.state = 'knocked'
    this.knockT = secs
    this.fly = { vx, vy, vz }
    c.heading = Math.atan2(-vx, -vz) // fall on the back, facing where the hit came from
    c.anim.play('knockdown')
    this.collider.setEnabled(false)
    this.game.audio?.sfx('ko', { at: this.pos, vol: 0.7 })
  }

  react(attacker) {
    if (this.state === 'knocked' || this.personality === 'story') return
    const p = this.personality
    if (p === 'tough' || p === 'cop' || (p === 'babushka' && this.hitCount === 1) || this.hostile) {
      this.hostile = true
      this.state = 'fight'
      this.target = attacker
      if (p === 'babushka') this.say(pickLine(BABUSHKA_ANGRY))
      else if (p === 'tough') this.say(pickLine(TOUGH_ANGRY))
    } else {
      this.flee(attacker ? attacker.pos : null)
    }
  }

  flee(from) {
    if (this.state === 'knocked' || this.personality === 'story') return
    this.state = 'flee'
    this.stateT = 6 + Math.random() * 4
    this.fleeFrom = from ? { x: from.x, z: from.z } : { x: this.pos.x + 1, z: this.pos.z }
    if (Math.random() < 0.5) this.say(pickLine(SCARED))
  }

  // sit inside a vehicle (taxi fares, kidnapped babushkas…)
  ride(v) {
    this.riding = v
    this.char.setVisible(false)
    this.collider.setEnabled(false)
    this.state = 'riding'
    this.path = []
    this.vel.set(0, 0, 0)
  }

  unride(x, z, ry) {
    this.riding = null
    this.teleport(x, this.game.physics.groundHeight(x, z, 3), z, ry)
    this.char.setVisible(true)
    this.collider.setEnabled(true)
    this.state = 'idle'
  }

  // ---- per fixed step -----------------------------------------------------------------
  fixedUpdate(h) {
    const c = this.char
    c.beginStep()
    if (this.riding) { c.pos.copy(this.riding.pos); c.heading = this.riding.heading; this.moveBody(); return }
    this.stateT -= h
    if (this.fightCD > 0) this.fightCD -= h
    let mx = 0, mz = 0, spd = 0
    if (this.fly) {
      const f = this.fly
      c.pos.x += f.vx * h; c.pos.z += f.vz * h; c.pos.y += f.vy * h
      f.vy -= 18 * h
      f.vx *= Math.exp(-2.2 * h); f.vz *= Math.exp(-2.2 * h)
      const gy = this.game.physics.groundHeight(c.pos.x, c.pos.z, c.pos.y + 1)
      if (c.pos.y <= gy) { c.pos.y = gy; if (Math.abs(f.vy) < 3 && Math.hypot(f.vx, f.vz) < 0.8) this.fly = null; else f.vy = Math.abs(f.vy) * 0.25 }
      c.speed = 0
      this.moveBody()
      return
    }
    if (this.state === 'knocked') {
      this.knockT -= h
      if (this.knockT <= 0 && !(this.stayDown && this.hp <= 0)) {
        c.ko = false
        c.anim.play('getup')
        this.collider.setEnabled(true)
        this.hp = Math.max(this.hp, this.maxHp * 0.5)
        this.state = this.hostile ? 'fight' : this.personality === 'story' ? 'idle' : 'flee'
        if (this.state === 'flee' && !this.fleeFrom) this.fleeFrom = { x: c.pos.x - Math.sin(c.heading), z: c.pos.z - Math.cos(c.heading) }
        this.stateT = 5
        // whoever knocked them down may have plans for when they're up (back to the bench…)
        if (this.onGetUp) { const f = this.onGetUp; this.onGetUp = null; f(this) }
      }
      c.speed = 0
      this.moveBody()
      return
    }
    if (this.stun > 0) { this.stun -= h; c.speed = 0; if (this.stun <= 0) c.anim.set('idle'); this.moveBody(); return }
    const p = this.game.player
    switch (this.state) {
      case 'walk':
      case 'run':
      case 'scripted': {
        const w = this.path[0]
        if (!w) { this.arrive(); break }
        const dx = w.x - c.pos.x, dz = w.z - c.pos.z, d = Math.hypot(dx, dz)
        if (d < (this.path.length > 1 ? 0.8 : 0.3)) { this.path.shift(); if (!this.path.length) this.arrive(); break }
        mx = dx / d; mz = dz / d
        spd = this.state === 'run' ? this.runSpeed : this.speed
        break
      }
      case 'flee': {
        const f = this.fleeFrom || (this.fleeFrom = { x: c.pos.x - Math.sin(c.heading), z: c.pos.z - Math.cos(c.heading) })
        let dx = c.pos.x - f.x, dz = c.pos.z - f.z
        const d = Math.hypot(dx, dz) || 1
        mx = dx / d; mz = dz / d
        spd = this.runSpeed
        if (this.stateT <= 0 || d > 45) { this.state = 'walk'; this.path = []; this.game.peds?.repath(this) }
        break
      }
      case 'fight': {
        const t = this.target || p
        if (!t || (t.char && t.char.ko) || (t === p && p.vehicle)) { this.state = 'idle'; this.hostile = this.personality === 'cop' || !!this.enemy; break }
        const tp = t.pos
        const dx = tp.x - c.pos.x, dz = tp.z - c.pos.z, d = Math.hypot(dx, dz)
        if (d > 40) { this.state = 'idle'; this.hostile = false; break }
        c.faceTowards(tp.x, tp.z, h, 12)
        if (d > 1.25) { mx = dx / d; mz = dz / d; spd = this.runSpeed * 0.9 }
        else if (this.fightCD <= 0 && !c.anim.busy) {
          this.fightCD = 0.9 + Math.random() * 0.7
          const anim = this.personality === 'babushka' ? 'swing' : Math.random() < 0.6 ? 'jab' : 'hook'
          c.anim.play(anim, { side: Math.random() < 0.5 ? 1 : -1, onHit: () => this.game.combat?.npcStrike(this, t) })
        }
        break
      }
      case 'follow': {
        const t = this.target
        if (!t) break
        if (this.followOff) {
          // a crew slot around the leader (x = to their right, z = ahead), or a breadcrumb
          // on the leader's trail when a wall is in the way
          const th = t.char ? t.char.heading : 0, [ox, oz] = this.followOff
          const g = this.followGoal || { x: t.pos.x - Math.cos(th) * ox + Math.sin(th) * oz, z: t.pos.z + Math.sin(th) * ox + Math.cos(th) * oz }
          const dx = g.x - c.pos.x, dz = g.z - c.pos.z, d = Math.hypot(dx, dz)
          if (d > (this.followGoal ? 0.6 : 0.45)) { mx = dx / d; mz = dz / d; spd = Math.min(this.runSpeed, 0.9 + d * 1.7) }
          else c.turnTo(th, h, 5)
          break
        }
        const dx = t.pos.x - c.pos.x, dz = t.pos.z - c.pos.z, d = Math.hypot(dx, dz)
        if (d > 2.2) { mx = dx / d; mz = dz / d; spd = d > 6 ? this.runSpeed : this.speed * 1.4 }
        else c.faceTowards(t.pos.x, t.pos.z, h, 6)
        break
      }
      default:
        if (this.lookAtPlayer && p) {
          const d2 = (p.pos.x - c.pos.x) ** 2 + (p.pos.z - c.pos.z) ** 2
          if (d2 < 36) c.faceTowards(p.pos.x, p.pos.z, h, 4)
          else c.turnTo(this.home.ry, h, 2)
        } else if (this.turnBack != null) {
          // after a chat: slowly back to what they were looking at
          c.turnTo(this.turnBack, h, 2.5)
          if (Math.abs(angleDiff(c.heading, this.turnBack)) < 0.03) this.turnBack = null
        }
    }
    // separation from the player and other peds
    if (this.pushX) { mx += this.pushX; mz += this.pushZ; this.pushX *= 0.8; this.pushZ *= 0.8; if (Math.abs(this.pushX) < 0.05) this.pushX = this.pushZ = 0 }
    const k = 1 - Math.exp(-10 * h)
    this.vel.x += (mx * spd - this.vel.x) * k
    this.vel.z += (mz * spd - this.vel.z) * k
    c.pos.x += this.vel.x * h
    c.pos.z += this.vel.z * h
    if (spd > 0.1 && (mx || mz)) c.turnTo(Math.atan2(mx, mz), h, 9)
    c.speed = Math.hypot(this.vel.x, this.vel.z)
    // follow the ground height (curbs)
    const gy = this.game.physics.groundHeight(c.pos.x, c.pos.z, c.pos.y + 1.2)
    c.pos.y += (gy - c.pos.y) * Math.min(1, 18 * h)
    this.onRoad = !!onRoad(c.pos.x, c.pos.z, -0.3)
    this.moveBody()
  }

  arrive() {
    const cb = this.onArrive
    this.onArrive = null
    this.state = this.personality === 'story' ? 'idle' : 'walk'
    this.vel.set(0, 0, 0)
    if (this.arriveFace != null) { this.char.heading = this.arriveFace; this.home.ry = this.arriveFace }
    if (cb) cb(this)
    else if (this.state === 'walk') this.game.peds?.repath(this)
  }

  moveBody() {
    const p = this.char.pos
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + CAP_HALF + CAP_R, z: p.z })
  }

  update(dt) {
    const c = this.char
    if (this.riding) { c.update(dt); c.sync(this.game.alpha); return }
    if (!c.ko && !c.anim.action && this.stun <= 0) {
      if (this.state === 'sit') c.anim.set('sit')
      else if (this.state === 'squat') c.anim.set('squat')
      else if (this.state === 'talk') c.anim.set('talk')
      else if (this.state === 'phone') c.anim.set('phone')
      else if (this.state === 'dance') c.anim.set('dance')
      else if (this.state === 'cower') c.anim.set('cower')
      else if (this.state === 'handsup') c.anim.set('handsup')
      else c.anim.set(c.speed > 0.3 ? 'walk' : 'idle')
    }
    c.update(dt)
    c.sync(this.game.alpha)
  }

  teleport(x, y, z, ry) {
    this.char.setPos(x, y, z)
    if (ry !== undefined) { this.char.heading = ry; this.char.prevHeading = ry }
    this.body.setTranslation({ x, y: y + CAP_HALF + CAP_R, z }, true)
    this.home = { x, z, ry: this.char.heading }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.game.physics.remove(this.body)
    this.char.dispose()
    this.game.ui?.removeBubble(this)
  }
}

export const SCARED = ['Ajutooor!', 'Mămăăă!', 'Poliția! Sunați la poliție!', 'Fugiți, oameni buni!', 'Nebunul, nebunul!', 'Doamne ferește!', 'Ce faci, măi?!']
export const TOUGH_ANGRY = ['Șo, bratan, vrei probleme?', 'Hai, vino-ncoace!', 'Îți fărâm fasonu\'!', 'Tu pe cine ai lovit, fraer?', 'Ai rămas fără dinți, bratan.']
export const BABUSHKA_ANGRY = ['Obraznicule! Ți-ar fi rușine!', 'Te lovesc cu geanta, maică!', 'Pe vremea mea nu era așa!', 'Unde-i mama ta să te vadă?!']
export const BUMPED = ['Ai grijă pe unde calci!', 'Șo te împingi?', 'Uită-te pe unde mergi, bre!', 'Măi, măi, măi…', 'Scuzați-mă, da nu.']
export function pickLine(arr) { return arr[Math.floor(Math.random() * arr.length)] }
