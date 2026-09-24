import * as THREE from 'three'
import { SHARED } from '../render/Materials.js'

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _look = new THREE.Vector3()
const TAU = Math.PI * 2
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a }

// Angled third-person camera (Chinatown-Wars style) with car chase mode,
// cutscene paths, trauma shake and the building see-through cutout.
export class CameraRig {
  constructor(game) {
    this.game = game
    this.cam = game.camera
    this.mode = 'foot'
    this.yaw = Math.PI        // camera looks toward -z (north) = map-up
    this.pitch = 0.92         // radians above the horizon
    this.dist = 15
    this.zoom = 1
    this.target = new THREE.Vector3()
    this.smoothTarget = new THREE.Vector3()
    this.pos = new THREE.Vector3(0, 30, 30)
    this.trauma = 0
    this.fovKick = 0
    this.baseFov = game.settings.fov || 42
    this.cut = null           // active cutscene shot
    this.userYawT = 0
    this.lookAhead = new THREE.Vector3()
    this.noiseT = 0
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount * (this.game.settings.shake ?? 1)) }

  snap() {
    this.smoothTarget.copy(this.target)
    this.computeDesired(_v)
    this.pos.copy(_v)
  }

  computeDesired(out) {
    const d = this.dist * this.zoom
    const hd = Math.cos(this.pitch) * d, vd = Math.sin(this.pitch) * d
    out.set(this.smoothTarget.x - Math.sin(this.yaw) * hd, this.smoothTarget.y + vd, this.smoothTarget.z - Math.cos(this.yaw) * hd)
    return out
  }

  // cutscene shot: from/to positions and look targets, duration, easing
  shot(opts) {
    this.cut = { t: 0, dur: opts.dur ?? 3, from: opts.from, to: opts.to ?? opts.from, lookFrom: opts.lookFrom ?? opts.look, lookTo: opts.lookTo ?? opts.look ?? opts.lookFrom, ease: opts.ease ?? 'inout', onEnd: opts.onEnd, fov: opts.fov }
  }

  endShot(snapBack = true) { this.cut = null; if (snapBack) this.snap() }

  update(dt, rawDt) {
    const game = this.game
    const input = game.input
    this.noiseT += rawDt
    // ---- cutscene camera -------------------------------------------------------
    if (this.cut) {
      const c = this.cut
      c.t += rawDt
      let k = Math.min(1, c.t / c.dur)
      if (c.ease === 'inout') k = k * k * (3 - 2 * k)
      else if (c.ease === 'out') k = 1 - (1 - k) * (1 - k)
      _v.set(...c.from).lerp(_t.set(...c.to), k)
      _look.set(...c.lookFrom).lerp(_t.set(...c.lookTo), k)
      this.cam.position.copy(_v)
      this.applyShake(rawDt)
      this.cam.lookAt(_look)
      if (c.fov) { this.cam.fov += (c.fov - this.cam.fov) * (1 - Math.exp(-4 * rawDt)); this.cam.updateProjectionMatrix() }
      if (c.t >= c.dur && c.onEnd) { const cb = c.onEnd; c.onEnd = null; cb() }
      this.updateCutout(null)
      return
    }

    const p = game.player
    if (!p) return
    const car = p.vehicle
    // ---- user orbit controls -----------------------------------------------------
    const sens = game.settings.camSensitivity ?? 1
    if (input.key('Mouse2') || input.key('Mouse1') || input.touchCam) { this.yaw -= input.mouse.dx * 0.0055 * sens; if (input.mouse.dx) this.userYawT = 2.5 }
    const look = input.lookAxes()
    if (Math.abs(look.x) > 0) { this.yaw -= look.x * 2.4 * rawDt * sens; this.userYawT = 2.5 }
    if (input.act('camLeft')) { this.yaw += 1.8 * rawDt; this.userYawT = 2.5 }
    if (input.act('camRight')) { this.yaw -= 1.8 * rawDt; this.userYawT = 2.5 }
    if (input.mouse.wheel) this.zoom = THREE.MathUtils.clamp(this.zoom * (input.mouse.wheel > 0 ? 1.12 : 0.89), 0.55, 1.9)
    if (this.userYawT > 0) this.userYawT -= rawDt

    // ---- follow target -------------------------------------------------------------
    let speed = 0
    if (car) {
      const cp = car.mesh.position
      speed = Math.abs(car.speed || 0)
      this.lookAhead.set(Math.sin(car.heading), 0, Math.cos(car.heading)).multiplyScalar(Math.min(14, speed * 0.45) * Math.sign(car.speed || 1))
      this.target.set(cp.x, cp.y + 1.2, cp.z).add(this.lookAhead)
      // swing behind the car unless the player is steering the camera
      if (this.userYawT <= 0 && speed > 2) {
        const want = car.speed >= 0 ? car.heading : car.heading
        this.yaw += wrap(want - this.yaw) * (1 - Math.exp(-1.6 * rawDt))
      }
      const lookBack = input.act('lookBack')
      if (lookBack) this.yaw = car.heading + Math.PI
      const wantDist = 16 + Math.min(10, speed * 0.28)
      this.dist += (wantDist - this.dist) * (1 - Math.exp(-2 * rawDt))
      this.pitch += (0.78 - this.pitch) * (1 - Math.exp(-2 * rawDt))
    } else {
      const cp = p.char.mesh.position
      speed = p.char.speed
      this.lookAhead.lerp(_t.set(p.vel.x, 0, p.vel.z).multiplyScalar(0.35), 1 - Math.exp(-3 * rawDt))
      this.target.set(cp.x, cp.y + 1.25, cp.z).add(this.lookAhead)
      this.dist += (14.5 - this.dist) * (1 - Math.exp(-2 * rawDt))
      this.pitch += (0.94 - this.pitch) * (1 - Math.exp(-2 * rawDt))
    }
    const follow = car ? 7 : 9
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-follow * rawDt))
    this.computeDesired(_v)
    this.pos.lerp(_v, 1 - Math.exp(-12 * rawDt))
    this.cam.position.copy(this.pos)
    this.applyShake(rawDt)
    this.cam.lookAt(this.smoothTarget)

    // speed FOV kick
    const kick = car ? Math.min(12, Math.max(0, speed - 12) * 0.35) : p.sprinting ? 3 : 0
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-3 * rawDt))
    const fov = this.baseFov + this.fovKick
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix() }
    this.updateCutout(car ? car.mesh.position : p.char.mesh.position, !!car)
  }

  applyShake(dt) {
    if (this.trauma <= 0) return
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    const s = this.trauma * this.trauma
    const t = this.noiseT * 28
    this.cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5) * s * 0.45
    this.cam.position.y += (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.3) * 0.5) * s * 0.35
    this.cam.position.z += (Math.sin(t * 1.1 + 4) + Math.sin(t * 2.3) * 0.5) * s * 0.45
  }

  // see-through circle around the player for buildings between camera and player
  updateCutout(worldPos, inCar = false) {
    if (!worldPos) { SHARED.uCutOn.value = 0; return }
    _v.set(worldPos.x, worldPos.y + 1.1, worldPos.z)
    const viewZ = -_v.clone().applyMatrix4(this.cam.matrixWorldInverse).z
    _v.project(this.cam)
    SHARED.uCutCenter.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5)
    SHARED.uCutDepth.value = viewZ - (inCar ? 3.5 : 1.8)
    SHARED.uCutRadius.value = (inCar ? 0.2 : 0.15) * (15 / Math.max(6, this.dist * this.zoom))
    SHARED.uCutOn.value = 1
  }

  // ground point under the mouse cursor (for aiming)
  mouseGround(y = 0.16) {
    const m = this.game.input.mouse
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(m.nx, m.ny), this.cam)
    const t = (y - ray.ray.origin.y) / ray.ray.direction.y
    if (!(t > 0)) return null
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t)
  }
}
