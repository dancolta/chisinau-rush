import * as THREE from 'three'
import { VEHICLES, buildProcVehicle } from '../data/vehicles.js'
import { CELL } from '../core/Assets.js'
import { FILTER } from '../physics/Physics.js'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { SHARED } from '../render/Materials.js'
import { angleDiff } from './Character.js'

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3()
const bodyGeoCache = new Map()
let lightMat = null

function getLightMat() {
  if (!lightMat) {
    lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 })
    lightMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float emit;\nvarying float vEmit;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvEmit = emit;')
      sh.fragmentShader = 'varying float vEmit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * vEmit * 3.0;')
    }
  }
  return lightMat
}

// Arcade car on a yaw-only Rapier body with raycast "suspension".
export class Vehicle {
  constructor(game, kind, opts = {}) {
    this.game = game
    this.id = ++Vehicle.count
    this.kind = kind
    this.def = VEHICLES[kind]
    const d = this.def
    this.color = opts.color ?? d.colors[Math.floor(Math.random() * d.colors.length)]
    this.speed = 0
    this.heading = opts.ry ?? 0
    this.prevHeading = this.heading
    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0.16, opts.z ?? 0)
    this.prev = this.pos.clone()
    this.throttle = 0; this.steer = 0; this.handbrake = false
    this.steerVis = 0; this.spin = 0; this.pitch = 0; this.roll = 0; this.bump = 0
    this.lastV = new THREE.Vector3()
    this.health = 100
    this.broken = false
    this.driver = null     // 'player' | ai object
    this.siren = false
    this.lights = false
    this.braking = false
    this.lateral = 0
    this.parked = !!opts.parked
    this.ai = null
    this.hornT = 0
    this.buildVisual()
    this.createBody()
  }

  // ---- visuals -----------------------------------------------------------------
  buildVisual() {
    const d = this.def, game = this.game
    const group = new THREE.Group()
    const lb = new GeoBuilder()
    let head = [], tail = []
    if (d.kay) {
      const kay = game.assets.kay[d.kay]
      const key = `${d.kay}:${this.color}`
      let geo = bodyGeoCache.get(key)
      if (!geo) {
        geo = CELL[this.color] && d.body !== this.color ? game.assets.recolor(kay.geometry, CELL[d.body], CELL[this.color]) : kay.geometry
        if (d.police) geo = game.assets.recolor(geo, CELL.black, CELL.blue)
        bodyGeoCache.set(key, geo)
      }
      const body = new THREE.Mesh(geo, game.materials.atlas(game.assets.textures.atlas))
      body.castShadow = true; body.receiveShadow = true
      const off = 0.336
      body.position.y = off
      group.add(body)
      this.wheelDefs = kay.wheels.map((w) => ({ x: w.pivot.x, y: w.pivot.y + off, z: w.pivot.z, front: w.pivot.z > 0, geo: w.geometry, kay: true }))
      const L = kay.size.z / 2
      head = [[-0.62, 0.62 + off * 0.2, L - 0.02], [0.62, 0.62 + off * 0.2, L - 0.02]]
      tail = [[-0.7, 0.66 + off * 0.2, -L + 0.02], [0.7, 0.66 + off * 0.2, -L + 0.02]]
      if (d.police) {
        lb.box(0.5, 0.14, 0.26, { x: -0.3, y: 1.82, z: -0.2, color: 0xff2a2a, emit: 0.2 })
        lb.box(0.5, 0.14, 0.26, { x: 0.3, y: 1.82, z: -0.2, color: 0x2a5aff, emit: 0.2 })
      }
    } else {
      const p = buildProcVehicle(d.proc, this.color)
      const body = new THREE.Mesh(p.body, game.materials.vcol({ roughness: 0.45, metalness: 0.15, key: 'veh' }))
      body.castShadow = true; body.receiveShadow = true
      group.add(body)
      this.wheelDefs = p.wheels.map(([x, y, z]) => ({ x, y, z, front: z > 0, geo: p.wheelGeo }))
      head = p.head; tail = p.tail
      if (p.flags) {
        for (const s of [1, -1]) lb.box(0.02, 0.28, 0.4, { x: s * 0.96, y: 1.35, z: 1.9, color: s > 0 ? 0x0046ae : 0xcc092f })
      }
    }
    for (const [x, y, z] of head) lb.box(0.34, 0.16, 0.06, { x, y, z, color: 0xfff2d0, emit: 0 })
    for (const [x, y, z] of tail) lb.box(0.3, 0.14, 0.06, { x, y, z, color: 0xd01818, emit: 0 })
    const lg = lb.build()
    this.lightsMesh = new THREE.Mesh(lg, getLightMat())
    group.add(this.lightsMesh)
    this.headCount = head.length; this.tailCount = tail.length
    this.lightVerts = { headStart: d.police ? 72 : 0, per: 36 }
    // wheels: individual meshes (few vehicles are close at any time)
    this.wheels = this.wheelDefs.map((w) => {
      const m = new THREE.Mesh(w.geo, w.kay ? game.materials.atlas(game.assets.textures.atlas) : game.materials.vcol({ roughness: 0.6, key: 'wheel' }))
      m.position.set(w.x, w.y, w.z)
      m.castShadow = true
      m.rotation.order = 'YXZ'
      group.add(m)
      return m
    })
    this.mesh = group
    this.mesh.userData.vehicle = this
    game.scene.add(group)
  }

  // emissive per light group (headlights / taillights / police bar)
  setLightLevels(head, tail, barR = 0, barB = 0) {
    const attr = this.lightsMesh.geometry.attributes.emit
    const arr = attr.array
    let o = 0
    const fill = (n, v) => { for (let i = 0; i < n; i++) arr[o + i] = v; o += n }
    if (this.def.police) { fill(36, barR); fill(36, barB) }
    else if (this.def.proc === 'gwagon') { fill(72, 0.05) }
    for (let i = 0; i < this.headCount; i++) fill(36, head)
    for (let i = 0; i < this.tailCount; i++) fill(36, tail)
    attr.needsUpdate = true
  }

  // ---- physics ---------------------------------------------------------------------
  createBody() {
    const P = this.game.physics, R = P.R, d = this.def
    const [hx, hy, hz] = d.dims
    const q = { x: 0, y: Math.sin(this.heading / 2), z: 0, w: Math.cos(this.heading / 2) }
    this.body = P.world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(q)
      .setGravityScale(0).setLinearDamping(0.05).setAngularDamping(0.6)
      .setCcdEnabled(true).enabledRotations(false, true, false)
      .setCanSleep(true).setSleeping(this.parked))
    this.collider = P.world.createCollider(R.ColliderDesc.roundCuboid(hx - 0.08, hy - 0.08, hz - 0.08, 0.08)
      .setTranslation(0, d.ride + hy, 0)
      .setMass(d.mass).setFriction(0.3).setRestitution(0.12)
      .setCollisionGroups(FILTER.VEHICLE)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(d.mass * 18), this.body)
    P.user.set(this.collider.handle, this)
  }

  get forwardX() { return Math.sin(this.heading) }
  get forwardZ() { return Math.cos(this.heading) }

  teleport(x, y, z, ry) {
    this.game.world?.dyn?.clearBox(x, z, ry ?? this.heading, this.def.dims[0], this.def.dims[2])
    this.body.setTranslation({ x, y, z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.heading = ry ?? this.heading
    this.body.setRotation({ x: 0, y: Math.sin(this.heading / 2), z: 0, w: Math.cos(this.heading / 2) }, true)
    this.pos.set(x, y, z); this.prev.copy(this.pos); this.prevHeading = this.heading; this.speed = 0
  }

  groundAt(x, z, fromY) {
    const h = this.game.physics.raycast(x, fromY + 1.2, z, 0, -1, 0, 3.5, FILTER.Q_FLOOR)
    return h ? h.point.y : null
  }

  fixedUpdate(h) {
    this.prev.copy(this.pos); this.prevHeading = this.heading
    const b = this.body
    if (b.isSleeping() && !this.driver) return
    const d = this.def
    const t = b.translation(), r = b.rotation()
    this.heading = 2 * Math.atan2(r.y, r.w)
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading)
    const rx = -Math.cos(this.heading), rz = Math.sin(this.heading)
    const v = b.linvel()
    let vf = v.x * fx + v.z * fz
    let vr = v.x * rx + v.z * rz
    const human = this.driver === 'player'
    let throttle = this.broken || this.stalled ? 0 : this.throttle
    // keys are all-or-nothing: for the player the pedals travel in over ~0.1 s, and reverse only
    // engages once the brake has been held at a standstill (so stopping at a light isn't backing up)
    if (human) {
      this.pedal = (this.pedal || 0) + (throttle - (this.pedal || 0)) * (1 - Math.exp(-(Math.abs(throttle) > Math.abs(this.pedal || 0) ? 10 : 16) * h))
      throttle = this.pedal
      if (throttle < -0.02 && Math.abs(vf) < 0.6) this.revT = (this.revT || 0) + h
      else if (throttle >= -0.02) this.revT = 0
    }
    const brakeDecel = human ? 17 : 28
    const steer = this.steer
    this.braking = false
    // longitudinal
    const maxF = d.maxSpeed * (this.boost ? 1.18 : 1)
    if (throttle > 0.02) {
      if (vf < -0.5) { vf += (human ? 17 : 26) * throttle * h; this.braking = true }
      else vf += d.accel * throttle * (1 - Math.min(1, Math.max(0, vf) / maxF) ** 2) * h * (this.boost ? 1.35 : 1)
    } else if (throttle < -0.02) {
      if (vf > 0.5) { vf -= brakeDecel * -throttle * h; this.braking = true }
      else if (!human || this.revT > 0.3) vf = Math.max(-d.maxSpeed * 0.3, vf - d.accel * 0.7 * -throttle * h)
      else { vf *= Math.exp(-8 * h); this.braking = true }
    } else {
      vf -= vf * (0.22 + (this.driver ? 0 : 1.5)) * h
      if (Math.abs(vf) < 0.2) vf = 0
    }
    if (this.handbrake) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * h); this.braking = true }
    // lateral grip (low grip + handbrake = drift)
    // grip comes back gradually after a handbrake slide instead of snapping the car straight
    const fullGrip = d.grip * (Math.abs(vf) > 25 ? 0.85 : 1)
    this.gripK = this.handbrake ? 0 : Math.min(1, (this.gripK ?? 1) + h / 0.35)
    const grip = this.handbrake ? 1.3 : 1.3 + (fullGrip - 1.3) * this.gripK
    vr *= Math.exp(-grip * h)
    this.lateral = vr
    // steering: bicycle model, less lock at speed
    const lock = d.steer / (1 + Math.abs(vf) / 22)
    // keys are all-or-nothing, so for the player the wheel eases in and snaps back to centre
    const rate = !human ? 10 : Math.abs(steer * lock) > Math.abs(this.steerVis) ? 6 : 12
    this.steerVis += (steer * lock - this.steerVis) * (1 - Math.exp(-rate * h))
    const L = d.dims[2] * 1.25
    let yawRate = -vf * Math.tan(this.steerVis) / L
    // the player's car can't out-turn its tyres at speed (~2.6 g): no more twitchy flicks on
    // the motorway; the handbrake still swings the tail round
    if (human) { const maxYaw = 26 / Math.max(4, Math.abs(vf)); yawRate = Math.max(-maxYaw, Math.min(maxYaw, yawRate)) }
    if (this.handbrake && Math.abs(vf) > 4) yawRate *= 1.55
    const av = b.angvel()
    const wy = av.y + (yawRate - av.y) * (1 - Math.exp(-(this.handbrake ? 5 : 11) * h))
    // vertical: follow the ground (curbs, sidewalks) with a stiff spring
    const gy = this.groundAt(t.x, t.z, t.y)
    let vy = 0
    if (gy !== null) vy = (gy - t.y) * 18
    else vy = -6
    b.setLinvel({ x: fx * vf + rx * vr, y: vy, z: fz * vf + rz * vr }, true)
    b.setAngvel({ x: 0, y: wy, z: 0 }, true)
    this.speed = vf
    // curb bump for visuals
    if (gy !== null && Math.abs(gy - t.y) > 0.06) this.bump = Math.max(this.bump, Math.min(0.08, Math.abs(gy - t.y)))
  }

  postPhysics() {
    const t = this.body.translation(), r = this.body.rotation()
    this.pos.set(t.x, t.y, t.z)
    this.heading = 2 * Math.atan2(r.y, r.w)
  }

  // ---- per-frame -------------------------------------------------------------------
  update(dt, alpha) {
    const m = this.mesh
    m.position.lerpVectors(this.prev, this.pos, alpha)
    const hd = this.prevHeading + angleDiff(this.prevHeading, this.heading) * alpha
    // body motion: pitch from acceleration, roll from cornering, curb bounce
    const acc = (this.speed - (this.lastSpeed ?? this.speed)) / Math.max(dt, 1e-3)
    this.lastSpeed = this.speed
    const tp = THREE.MathUtils.clamp(-acc * 0.004, -0.06, 0.06)
    const tr = THREE.MathUtils.clamp(this.steerVis * this.speed * 0.006 + this.lateral * 0.012, -0.08, 0.08)
    this.pitch += (tp - this.pitch) * (1 - Math.exp(-6 * dt))
    this.roll += (tr - this.roll) * (1 - Math.exp(-6 * dt))
    this.bump *= Math.exp(-8 * dt)
    _e.set(this.pitch + Math.sin(performance.now() * 0.05) * this.bump, hd, this.roll, 'YXZ')
    // scripted pose override (e.g. nose-down in a crater)
    if (this.pose) { _e.x += this.pose.pitch || 0; _e.z += this.pose.roll || 0; m.position.y += this.pose.dy || 0 }
    m.quaternion.setFromEuler(_e)
    // wheels
    const r0 = this.def.kay ? 0.34 : 0.35
    this.spin += (this.speed * dt) / r0
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i], def = this.wheelDefs[i]
      w.rotation.set(this.spin, def.front ? this.steerVis * 1.1 : 0, 0)
    }
    // lights
    const night = SHARED.uNight.value > 0.35
    const headOn = night || this.lights ? 1 : 0.0
    const tailOn = this.braking ? 1 : night ? 0.35 : 0
    let br = 0, bb = 0
    if (this.siren) { const ph = Math.floor(performance.now() / 160) % 4; br = ph < 2 ? 1.2 : 0.05; bb = ph < 2 ? 0.05 : 1.2 }
    const sig = `${headOn}|${tailOn}|${br}|${bb}`
    if (sig !== this._lightSig) { this._lightSig = sig; this.setLightLevels(headOn, tailOn, br, bb) }
  }

  damage(amount) {
    if (this.broken) return
    this.health = Math.max(0, this.health - amount)
    if (this.health <= 0) { this.broken = true; this.game.events.emit('vehicle:broken', this) }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.game.scene.remove(this.mesh)
    this.game.physics.remove(this.body)
    this.lightsMesh.geometry.dispose()
  }
}
Vehicle.count = 0
