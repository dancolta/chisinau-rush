import * as THREE from 'three'
import { SHARED } from '../render/Materials.js'
import { FILTER } from '../physics/Physics.js'
import { saveSettings } from './Settings.js'

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _look = new THREE.Vector3()
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3()
const TAU = Math.PI * 2
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a }
// a character's face in world space, from the head bone (a gopnik on a bench has his a metre lower)
function faceOf(ch, out) {
  const m = ch.mesh, hb = m.userData?.bones?.head
  if (hb) { hb.getWorldPosition(out); out.y += 0.16 * m.scale.y } else out.set(m.position.x, m.position.y + 1.6, m.position.z)
  return out
}

// [V] / d-pad up: how far back the camera sits. On foot and in a car each remember their own.
// Car distances grow a little with speed (k per m/s).
export const FOOT_CAM = [{ d: 4.5, p: 0.2, name: 'aproape' }, { d: 5.8, p: 0.24, name: 'departe' }, { d: 8.6, p: 0.34, name: 'foarte departe' }]
export const CAR_CAM = [{ d: 6.2, k: 0.07, p: 0.15, name: 'aproape' }, { d: 8.4, k: 0.1, p: 0.21, name: 'departe' }, { d: 12.8, k: 0.12, p: 0.3, name: 'foarte departe' }]

// Angled third-person camera (Chinatown-Wars style) with car chase mode,
// cutscene paths, trauma shake and the building see-through cutout.
export class CameraRig {
  constructor(game) {
    this.game = game
    this.cam = game.camera
    this.mode = 'foot'
    this.yaw = Math.PI        // camera looks toward -z (north) = map-up
    this.pitch = 0.24         // radians above the horizon
    this.dist = 5.8
    this.zoom = 1
    this.target = new THREE.Vector3()
    this.smoothTarget = new THREE.Vector3()
    this.pos = new THREE.Vector3(0, 30, 30)
    this.trauma = 0
    this.fovKick = 0
    this.baseFov = game.settings.fov || 42
    this.cut = null           // active cutscene shot
    this.room = null          // indoors: a fixed-height camera outside the open fourth wall
    this.userYawT = 0
    this.userTurnT = 0        // > 0 right after the player turned the camera themselves
    this.pivot = new THREE.Vector3()   // the hero's head, eased: what the camera orbits
    this.pitchOff = 0         // tilt the player added (mouse / right stick)
    this.pitchT = 0
    this.pitchLift = 0        // automatic tilt when a wall leaves no room behind
    this.enterT = 0           // just got into a car: swing behind it quickly
    this.lastCar = null
    this.lookAhead = new THREE.Vector3()
    this.noiseT = 0
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount * (this.game.settings.shake ?? 1)) }

  // jump straight to the resting position behind the hero (after teleports and cutscenes)
  snap() {
    if (this.room) { this.roomPos(this.pos); this.cam.position.copy(this.pos); return }
    const p = this.game.player
    if (p) {
      const car = p.vehicle
      const o = car ? car.pos : p.pos
      this.pivot.set(o.x, o.y + (car ? 1.7 : 1.65), o.z)
    } else this.pivot.copy(this.target)
    this.lookAhead.set(0, 0, 0)
    this.pitchOff = 0; this.pitchLift = 0
    this.footHeading = this.carHeading = null
    this.smoothTarget.copy(this.pivot)
    this.computeDesired(_v)
    this.collide(_v)
    this.pos.copy(_v)
  }

  computeDesired(out, yaw = this.yaw) {
    const d = this.dist * this.zoom
    const hd = Math.cos(this.pitch) * d, vd = Math.sin(this.pitch) * d
    out.set(this.pivot.x - Math.sin(yaw) * hd, this.pivot.y + vd, this.pivot.z - Math.cos(yaw) * hd)
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
    if (input.pressed('camMode') && !game.ui?.modalOpen && !this.cut && !this.room && game.player) {
      const s = game.settings, car = !!game.player.vehicle && !game.player.passenger
      const key = car ? 'camCar' : 'camFoot', list = car ? CAR_CAM : FOOT_CAM
      s[key] = ((s[key] ?? 1) + 1) % list.length
      saveSettings(s)
      game.ui?.notify(`Cameră: ${list[s[key]].name}`, 1.2)
    }
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
    if (this.room) { this.updateRoom(rawDt); return }
    if (this.talk && !p.vehicle && this.updateTalk(rawDt)) return
    const car = p.vehicle
    // getting in: the camera goes straight behind the car, whatever you'd done with it on foot
    if (car !== this.lastCar) {
      if (car) { this.enterT = 0.7; this.userYawT = 0; this.userTurnT = 0; this.pitchOff = 0; this.pitchT = 0; this.zoom = 1 }
      this.lastCar = car
    }
    // driving, the camera is fixed behind the car: the mouse only looks round while you hold a
    // button (a locked pointer twitches all the time), the stick and Z/X always can
    const driving = !!car && !p.passenger
    // ---- user look controls: mouse (locked pointer, or right/middle drag), right stick, Z/X ---------
    const sens = game.settings.camSensitivity ?? 1
    const inv = game.settings.invertCam ? -1 : 1
    // riding in the back you're sightseeing: the view you picked stays put for longer
    const turned = () => { this.userYawT = p.passenger ? 6 : car ? 1.5 : 2.5; this.userTurnT = 0.12 }
    if (this.userTurnT > 0) this.userTurnT -= rawDt
    const locked = input.locked
    if (locked || input.key('Mouse2') || input.key('Mouse1') || input.touchCam) {
      const k = locked ? 0.0026 : 0.0055
      const free = !driving || input.key('Mouse2') || input.key('Mouse1') || input.touchCam
      if (free && input.mouse.dx) { this.yaw -= input.mouse.dx * k * sens; turned() }
      if (free && input.mouse.dy) { this.pitchOff = THREE.MathUtils.clamp(this.pitchOff + input.mouse.dy * k * 0.8 * sens * inv, -0.3, 0.95); this.pitchT = 2.5 }
    }
    const look = input.lookAxes()
    if (Math.abs(look.x) > 0) { this.yaw -= look.x * 2.4 * rawDt * sens; turned() }
    if (Math.abs(look.y) > 0) { this.pitchOff = THREE.MathUtils.clamp(this.pitchOff + look.y * 1.5 * rawDt * sens * inv, -0.3, 0.95); this.pitchT = 2.5 }
    if (input.act('camLeft')) { this.yaw += 1.8 * rawDt; turned() }
    if (input.act('camRight')) { this.yaw -= 1.8 * rawDt; turned() }
    if (input.mouse.wheel) this.zoom = THREE.MathUtils.clamp(this.zoom * (input.mouse.wheel > 0 ? 1.12 : 0.89), 0.7, 2.2)
    if (this.userYawT > 0) this.userYawT -= rawDt
    // a tilt you gave it eases back after a while, like the yaw
    if (this.pitchT > 0) this.pitchT -= rawDt
    else this.pitchOff *= Math.exp(-1.6 * rawDt)

    // ---- follow ------------------------------------------------------------------------------
    let speed = 0, wantDist, basePitch
    const lookBack = !!car && input.act('lookBack')
    if (car) {
      const cp = car.mesh.position
      const ride = p.passenger
      speed = Math.abs(car.speed || 0)
      _t.set(cp.x, cp.y + 1.7, cp.z)
      // look a little ahead along the motion (never more than 5 m, eased so spins and crashes
      // don't whip the view around)
      _look.set(Math.sin(car.heading), 0, Math.cos(car.heading)).multiplyScalar(Math.min(5, speed * 0.2) * Math.sign(car.speed || 1))
      this.lookAhead.lerp(_look, 1 - Math.exp(-(ride ? 1.2 : 10) * rawDt))
      // the camera turns with the car (same rate, so nothing keeps swinging after you straighten
      // up), and a spring settles it in behind: briskly right after you get in, gently while you
      // drive. A passenger gets a lazy three-quarter view from the kerb side, so the city goes by
      const rh = car.mesh.rotation.y
      if (this.userYawT <= 0 || this.enterT > 0) {
        const dh = this.carHeading == null ? 0 : wrap(rh - this.carHeading)
        if (ride) {
          if (Math.abs(dh) < 0.5) this.yaw += dh * 0.8
          if (speed > 0.5) this.yaw += wrap(rh + 0.32 - this.yaw) * (1 - Math.exp(-0.9 * rawDt))
        } else {
          // driving, the camera is fixed straight behind the car: it turns with the car one to one
          // (a softer follow left the view pointing 30-50 degrees off the nose in a hard turn), and
          // anything left over (getting in, after you looked round) closes in a few frames
          if (Math.abs(dh) < 0.5) this.yaw += dh
          this.yaw += wrap(rh - this.yaw) * (1 - Math.exp(-(this.enterT > 0 ? 9 : 12) * rawDt))
        }
      }
      this.carHeading = rh
      const cc = CAR_CAM[game.settings.camCar ?? 1]
      wantDist = ride ? 6.6 + Math.min(2, speed * 0.06) : cc.d + Math.min(4, speed * cc.k)
      basePitch = ride ? 0.14 : cc.p
    } else {
      const cp = p.char.mesh.position
      speed = Math.abs(p.char.speed)
      _t.set(cp.x, cp.y + 1.65, cp.z)
      _look.set(p.vel.x, 0, p.vel.z).multiplyScalar(0.16)
      this.lookAhead.lerp(_look, 1 - Math.exp(-3 * rawDt))
      const fc = FOOT_CAM[game.settings.camFoot ?? 1]
      wantDist = fc.d
      basePitch = fc.p
      const rh = p.char.mesh.rotation.y
      if (this.userYawT <= 0 && game.settings.camFollow !== false) {
        if (p.steering) {
          // steering: the camera turns with the hero at the hero's own rate, so it starts and
          // stops turning exactly when you do (still smooth: the turn itself eases in and out),
          // and a quick spring takes out any offset that's left
          const dh = this.footHeading == null ? 0 : wrap(rh - this.footHeading)
          if (Math.abs(dh) < 0.5) this.yaw += dh
          this.yaw += wrap(rh - this.yaw) * (1 - Math.exp(-6 * rawDt))
        } else if (speed > 1.5) {
          // camera-relative: swing in behind the run. With keys the run direction is held while
          // the camera turns, so it can follow any heading except straight at the lens; a stick
          // reads the camera continuously, so there it only drifts while you run roughly ahead
          const diff = wrap(Math.atan2(p.vel.x, p.vel.z) - this.yaw)
          const keys = p.moveKey != null
          if (Math.abs(diff) < (keys ? 2.2 : 0.9)) this.yaw += diff * (1 - Math.exp(-(keys ? 1.8 + speed * 0.08 : 0.8) * rawDt))
        }
      }
      this.footHeading = rh
      this.carHeading = null
    }
    if (car) this.footHeading = null
    if (this.enterT > 0) this.enterT -= rawDt
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-2 * rawDt))
    this.pitch += (this.wantPitch(basePitch) + this.pitchOff + this.pitchLift - this.pitch) * (1 - Math.exp(-4 * rawDt))
    // the camera orbits the hero's head (no look-ahead in the orbit, so it can't swing wide)
    this.pivot.lerp(_t, 1 - Math.exp(-(driving ? 40 : car ? 10 : 14) * rawDt))
    this.target.copy(_t)
    this.smoothTarget.copy(this.pivot)
    const yawView = lookBack ? car.heading + Math.PI : this.yaw
    this.computeDesired(_v, yawView)
    // walls between the hero and the camera pull it in at once; it eases back out, and when there's
    // hardly any room it rises to look over the shoulder instead
    const free = this.collide(_v)
    const dNow = this.pos.distanceTo(this.pivot), dWant = _v.distanceTo(this.pivot)
    if (free !== null && dWant < dNow) this.pos.copy(_v)
    else this.pos.lerp(_v, 1 - Math.exp(-(lookBack ? 30 : driving ? 25 : 5) * rawDt))
    this.pitchLift += ((free !== null && free < 2.2 ? 0.5 : 0) - this.pitchLift) * (1 - Math.exp(-3 * rawDt))
    this.cam.position.copy(this.pos)
    this.applyShake(rawDt)
    _look.copy(this.pivot).add(this.lookAhead)
    this.cam.lookAt(_look)

    // speed FOV kick
    const kick = car ? Math.min(p.passenger ? 5 : 12, Math.max(0, speed - 12) * 0.35) : p.sprinting ? 6.5 : 0
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-3 * rawDt))
    const fov = this.baseFov + this.fovKick
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix() }
    this.updateCutout(car ? car.mesh.position : p.char.mesh.position, !!car)
  }

  // a conversation on foot: the camera goes over the hero's shoulder and frames the other face in
  // the upper part of the screen, clear of the dialogue box. talkTo(null) hands back to the follow
  // camera, which eases in from here already looking the way the hero faces.
  talkTo(who) {
    if (who && who === this.talk?.who) return
    if (this.talk) { this.yaw = this.talk.yaw; this.userYawT = 0; this.pitchOff = 0; this.footHeading = null }
    this.talk = who ? { who, side: 0, yaw: this.yaw, look: null } : null
  }

  updateTalk(rawDt) {
    const T = this.talk, ch = T.who.char || T.who, p = this.game.player
    if (!ch?.mesh || T.who.disposed || ch.ko) { this.talkTo(null); return false }
    const A = faceOf(ch, _fa), B = faceOf(p.char, _fb)
    const L = Math.hypot(A.x - B.x, A.z - B.z)
    if (L > 9) { this.talkTo(null); return false }
    T.yaw = L > 0.05 ? Math.atan2(A.x - B.x, A.z - B.z) : p.char.heading
    // the camera stands where the other face looks, so you always see it: for someone facing you
    // that's over your shoulder, for a gopnik who can't turn round on his bench it's in front of
    // him. Off to one side, wide enough that the hero never covers the face; the side with room
    // for it (picked once, no flips)
    const h = ch.mesh.rotation.y, fx = Math.sin(h), fz = Math.cos(h)
    const facing = L > 0.05 && ((B.x - A.x) * fx + (B.z - A.z) * fz) / L > 0.3
    // (head-on to someone sitting: his neighbours on the bench stay at the edges of the frame)
    const d = Math.max(1.2, L) + 1.5, off = facing ? 1.25 : 0.55, y = (A.y + B.y) / 2 + 0.2
    const spot = (s, out) => out.set(A.x + fx * d + fz * off * s, y, A.z + fz * d - fx * off * s)
    const room = (s) => { this.pivot.copy(A); const f = this.collide(spot(s, _v)); return f === null ? 99 : f }
    // how close anybody else stands to the line from that spot to the face
    const clear = (s) => {
      spot(s, _v)
      const sx = A.x - _v.x, sz = A.z - _v.z, l2 = sx * sx + sz * sz || 1
      let c = 9
      for (const q of this.game.peds?.list || []) {
        if (q === T.who || q.disposed || !q.pos) continue
        const qx = q.pos.x - _v.x, qz = q.pos.z - _v.z, t = Math.max(0, Math.min(1, (qx * sx + qz * sz) / l2))
        c = Math.min(c, Math.hypot(qx - sx * t, qz - sz * t))
      }
      return c
    }
    if (!T.side) {
      const r1 = room(1), r2 = room(-1)
      T.side = r1 < 1.6 && r2 > r1 ? -1 : r2 < 1.6 ? 1 : clear(-1) > clear(1) + 0.25 ? -1 : 1
    }
    this.pivot.copy(A)
    spot(T.side, _v)
    this.collide(_v)
    // frame the pair when they face each other (the face a little off centre, the hero's shoulder
    // at the side), aimed low enough that the face sits a quarter of the way down the screen,
    // above the dialogue box
    const w = facing ? 0.75 : 1
    const lx = B.x + (A.x - B.x) * w, lz = B.z + (A.z - B.z) * w
    const pitch = Math.atan2(A.y - _v.y, Math.hypot(A.x - _v.x, A.z - _v.z)) - Math.atan(0.42 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)))
    _look.set(lx, _v.y + Math.hypot(lx - _v.x, lz - _v.z) * Math.tan(pitch), lz)
    const k = 1 - Math.exp(-6 * rawDt)
    if (!T.look) T.look = this.cam.getWorldDirection(_t).multiplyScalar(4).add(this.cam.position).clone()
    this.pos.lerp(_v, k)
    T.look.lerp(_look, k)
    this.cam.position.copy(this.pos)
    this.applyShake(rawDt)
    this.cam.lookAt(T.look)
    this.updateCutout(null)
    return true
  }

  // indoors: the camera slides along outside the open wall, looking in at the hero
  roomPos(out) {
    const r = this.room, cp = this.game.player.char.mesh.position
    const tx = THREE.MathUtils.clamp(cp.x, r.x0 + 2.2, r.x1 - 2.2)
    return out.set(r.cx + (tx - r.cx) * 0.7, r.camY, r.camZ)
  }

  updateRoom(rawDt) {
    const r = this.room, cp = this.game.player.char.mesh.position
    this.yaw = Math.PI // W walks away from the camera, into the room
    this.roomPos(_v)
    this.pos.lerp(_v, 1 - Math.exp(-3 * rawDt))
    this.cam.position.copy(this.pos)
    this.applyShake(rawDt)
    _look.set(cp.x * 0.75 + r.cx * 0.25, cp.y + 1.0, cp.z * 0.6 + r.cz * 0.4)
    if (!this.roomLook) this.roomLook = _look.clone()
    this.roomLook.lerp(_look, 1 - Math.exp(-5 * rawDt))
    this.cam.lookAt(this.roomLook)
    if (Math.abs(this.cam.fov - r.fov) > 0.01) { this.cam.fov += (r.fov - this.cam.fov) * (1 - Math.exp(-6 * rawDt)); this.cam.updateProjectionMatrix() }
    this.updateCutout(null)
  }

  // low cinematic angle by default; zooming out with the wheel lifts toward the classic top view
  wantPitch(base) {
    const z = THREE.MathUtils.clamp((this.zoom - 1) / 0.9, 0, 1)
    return base + z * 0.6
  }

  // cast from the hero's head (never from a look-ahead point that may be inside a building);
  // poles and trunks don't count. Returns the free distance when something is in the way.
  collide(out) {
    const P = this.game.physics
    if (!P) return null
    const t = this.pivot
    const dx = out.x - t.x, dy = out.y - t.y, dz = out.z - t.z, L = Math.hypot(dx, dy, dz)
    if (L < 0.01) return null
    const hit = P.raycast(t.x, t.y, t.z, dx / L, dy / L, dz / L, L + 0.3, FILTER.Q_CAMERA)
    if (!hit) return null
    const free = Math.max(1.1, hit.dist - 0.35)
    const k = free / L
    out.set(t.x + dx * k, t.y + dy * k, t.z + dz * k)
    return free
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
    SHARED.uCutRadius.value = (inCar ? 0.2 : 0.15) * (15 / Math.max(6, this.dist * this.zoom)) * 0.55
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
