// Procedural animation for the rigid-skinned characters.
// Looping states (idle/walk/run/squat/sit/talk/…) produce a target pose every frame;
// one-shot actions (punches, hits, knockdowns, gestures) overlay on top; the current
// pose eases toward the target so every transition is smooth.

const BONES = ['root', 'hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR']
const TAU = Math.PI * 2
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (t) => t * t * (3 - 2 * t)

// one-shot action definitions: duration, key time when the "hit" lands, blend rate
export const ACTIONS = {
  jab: { dur: 0.32, hit: 0.12, rate: 38 },
  cross: { dur: 0.36, hit: 0.14, rate: 38 },
  hook: { dur: 0.42, hit: 0.18, rate: 34 },
  kick: { dur: 0.5, hit: 0.22, rate: 30 },
  swing: { dur: 0.5, hit: 0.24, rate: 30 },   // weapon swing (bottle, fence post…)
  spray: { dur: 0.6, hit: 0.15, rate: 26 },
  hit: { dur: 0.32, rate: 34 },
  stagger: { dur: 0.6, rate: 24 },
  knockdown: { dur: 0.55, rate: 22, hold: true },
  getup: { dur: 0.75, rate: 16 },
  wave: { dur: 1.4, rate: 14 },
  point: { dur: 1.6, rate: 14 },
  cheer: { dur: 1.6, rate: 12 },
  shrug: { dur: 1.0, rate: 14 },
  jump: { dur: 0.5, rate: 20 },
  land: { dur: 0.22, rate: 26 },
  enter: { dur: 0.45, rate: 18 },
  pickup: { dur: 0.6, rate: 18 },
  facepalm: { dur: 1.3, rate: 14 },
}

export class Animator {
  constructor(mesh) {
    this.bones = mesh.userData.bones
    this.rest = mesh.userData.rest
    this.h = mesh.userData.heights
    this.t = Math.random() * 10
    this.phase = Math.random() * TAU
    this.state = 'idle'
    this.speed = 0
    this.action = null
    this.cur = {}
    this.tgt = {}
    for (const b of BONES) { this.cur[b] = [0, 0, 0]; this.tgt[b] = [0, 0, 0] }
    this.hipOff = 0; this.hipTgt = 0
    this.rootLift = 0
    this.lie = 0 // 0 standing … 1 lying on the back
    this.lieTgt = 0
    this.fidget = 0
    this.lookYaw = 0
  }

  set(state) { this.state = state }

  play(name, opts = {}) {
    const def = ACTIONS[name]
    if (!def) return
    this.action = { name, t: 0, dur: opts.dur ?? def.dur, hit: def.hit, rate: def.rate, hitFired: false, onHit: opts.onHit, onEnd: opts.onEnd, hold: def.hold, side: opts.side ?? 1 }
    if (name === 'knockdown') this.lieTgt = 1
    if (name === 'getup') this.lieTgt = 0
  }

  get busy() { return !!this.action && !this.action.hold }

  pose(b, x, y = 0, z = 0) { const t = this.tgt[b]; t[0] = x; t[1] = y; t[2] = z }

  update(dt, speed = 0) {
    this.t += dt
    this.speed = speed
    for (const b of BONES) { const t = this.tgt[b]; t[0] = 0; t[1] = 0; t[2] = 0 }
    this.hipTgt = 0
    let rate = 14

    // ---- base state ------------------------------------------------------------
    const s = this.state
    if (s === 'walk' || s === 'run' || s === 'sprint' || (s === 'idle' && speed > 0.3)) this.locomotion(dt, speed)
    else if (s === 'squat') this.squat()
    else if (s === 'sit') this.sit()
    else if (s === 'talk') this.talk()
    else if (s === 'phone') this.phone()
    else if (s === 'dance') this.dance()
    else if (s === 'handsup') this.handsup()
    else if (s === 'drive') this.drive()
    else if (s === 'carry') { this.idle(); this.pose('armL', -0.9, 0, 0.25); this.pose('armR', -0.9, 0, -0.25); this.pose('foreL', -0.9); this.pose('foreR', -0.9) }
    else if (s === 'fall') this.falling()
    else if (s === 'cower') this.cower()
    else this.idle()

    // ---- action overlay --------------------------------------------------------
    const a = this.action
    if (a) {
      a.t += dt
      const k = clamp01(a.t / a.dur)
      rate = a.rate
      this.actionPose(a.name, k, a)
      if (a.hit !== undefined && !a.hitFired && a.t >= a.hit) { a.hitFired = true; if (a.onHit) a.onHit() }
      if (a.t >= a.dur && !a.hold) {
        const cb = a.onEnd
        this.action = null
        if (cb) cb()
      }
    }

    // ---- blend + apply ---------------------------------------------------------
    const f = 1 - Math.exp(-rate * dt)
    for (const b of BONES) {
      const c = this.cur[b], t = this.tgt[b]
      c[0] += (t[0] - c[0]) * f; c[1] += (t[1] - c[1]) * f; c[2] += (t[2] - c[2]) * f
      this.bones[b].rotation.set(c[0], c[1], c[2])
    }
    this.hipOff += (this.hipTgt - this.hipOff) * f
    this.lie += (this.lieTgt - this.lie) * (1 - Math.exp(-(this.lieTgt > this.lie ? 9 : 5) * dt))
    const hips = this.bones.hips
    hips.position.y = this.rest[1].y + this.hipOff
    // lying down: rotate the root back around the feet and lift so the body rests on the ground
    const root = this.bones.root
    root.rotation.x = this.cur.root[0] - this.lie * 1.52
    root.position.y = this.lie * 0.14
    root.position.z = -this.lie * 0.05
  }

  // ---------------------------------------------------------------------------
  idle() {
    const t = this.t
    const br = Math.sin(t * 1.7) * 0.025
    this.pose('spine', br, Math.sin(t * 0.37) * 0.04, 0)
    this.pose('head', -br * 0.6, Math.sin(t * 0.23) * 0.25 + this.lookYaw, 0)
    this.pose('armL', 0.04, 0, 0.09 + br * 0.5)
    this.pose('armR', 0.04, 0, -0.09 - br * 0.5)
    this.pose('foreL', -0.14); this.pose('foreR', -0.14)
    this.pose('hips', 0, 0, Math.sin(t * 0.5) * 0.025)
    this.pose('legL', 0, 0, -0.02); this.pose('legR', 0, 0, 0.02)
    this.hipTgt = br * 0.2
  }

  locomotion(dt, speed) {
    const run = clamp01((speed - 2.4) / 2.6)
    const sprint = clamp01((speed - 5.2) / 2)
    const stride = 1.45 + run * 1.1 + sprint * 0.5 + clamp01((speed - 7.2) / 2) * 0.55
    this.phase = (this.phase + (speed / stride) * TAU * dt) % TAU
    const ph = this.phase
    const sn = Math.sin(ph), cs = Math.cos(ph)
    const walkK = clamp01(speed / 1.5)
    const legA = (0.42 + run * 0.35 + sprint * 0.15) * walkK
    const knee = (0.55 + run * 0.75) * walkK
    const armA = (0.4 + run * 0.45 + sprint * 0.25) * walkK
    this.pose('legL', -sn * legA, 0, 0)
    this.pose('legR', sn * legA, 0, 0)
    this.pose('shinL', Math.max(0, cs) * knee + 0.05 + run * 0.25 * Math.max(0, -sn))
    this.pose('shinR', Math.max(0, -cs) * knee + 0.05 + run * 0.25 * Math.max(0, sn))
    this.pose('armL', sn * armA, 0, 0.1 + run * 0.08)
    this.pose('armR', -sn * armA, 0, -0.1 - run * 0.08)
    this.pose('foreL', -(0.25 + run * 1.05) - Math.max(0, -sn) * 0.3 * run)
    this.pose('foreR', -(0.25 + run * 1.05) - Math.max(0, sn) * 0.3 * run)
    const lean = 0.05 + run * 0.16 + sprint * 0.12
    this.pose('spine', lean, sn * (0.1 + run * 0.08), 0)
    this.pose('hips', 0, -sn * 0.12 * walkK, 0)
    this.pose('head', -lean * 0.6, -sn * 0.05, 0)
    this.hipTgt = (Math.cos(ph * 2) * 0.025 - 0.015) * walkK - run * 0.04
  }

  squat() {
    // the classic slav squat: heels down, elbows on knees
    const t = this.t
    this.hipTgt = -(this.h.yHip - 0.37)
    this.pose('legL', -1.72, 0.32, 0.14); this.pose('legR', -1.72, -0.32, -0.14)
    this.pose('shinL', 2.2); this.pose('shinR', 2.2)
    this.pose('spine', 0.55, 0, 0)
    this.pose('head', -0.35 + Math.sin(t * 0.8) * 0.05, Math.sin(t * 0.3) * 0.4, 0)
    this.pose('armL', -0.95, 0, 0.18); this.pose('armR', -0.95, 0, -0.18)
    const eat = Math.max(0, Math.sin(t * 1.3)) > 0.93
    this.pose('foreL', eat ? -2.1 : -0.55); this.pose('foreR', -0.55)
  }

  sit() {
    this.hipTgt = -(this.h.yHip - 0.5)
    this.pose('legL', -1.5, 0, 0.05); this.pose('legR', -1.5, 0, -0.05)
    this.pose('shinL', 1.5); this.pose('shinR', 1.5)
    this.pose('spine', -0.06 + Math.sin(this.t * 1.6) * 0.02)
    this.pose('head', 0.05, Math.sin(this.t * 0.25) * 0.35, 0)
    this.pose('armL', -0.45, 0, 0.12); this.pose('armR', -0.45, 0, -0.12)
    this.pose('foreL', -0.55); this.pose('foreR', -0.55)
  }

  talk() {
    const t = this.t
    this.idle()
    const g = Math.sin(t * 3.1), g2 = Math.sin(t * 2.3 + 1)
    this.pose('armR', -0.35 + g * 0.2, 0, -0.25 - g2 * 0.12)
    this.pose('foreR', -1.1 + g2 * 0.25)
    this.pose('armL', -0.2 + g2 * 0.12, 0, 0.2)
    this.pose('foreL', -0.8 - g * 0.2)
    this.pose('head', Math.sin(t * 4.2) * 0.06, Math.sin(t * 0.6) * 0.15, 0)
  }

  phone() {
    this.idle()
    this.pose('armR', -0.25, 0.1, -0.55)
    this.pose('foreR', -2.35, 0, 0)
    this.pose('head', 0.05, -0.2, -0.18)
    this.pose('armL', 0.05, 0, 0.25)
    this.pose('foreL', -1.4)
  }

  dance() {
    const t = this.t * 5.2
    this.pose('armL', -0.2, 0, 1.25 + Math.sin(t) * 0.1); this.pose('armR', -0.2, 0, -1.25 - Math.sin(t) * 0.1)
    this.pose('foreL', -0.2); this.pose('foreR', -0.2)
    const step = Math.sin(t)
    this.pose('legL', -Math.max(0, step) * 0.6); this.pose('legR', -Math.max(0, -step) * 0.6)
    this.pose('shinL', Math.max(0, step) * 0.9); this.pose('shinR', Math.max(0, -step) * 0.9)
    this.pose('spine', 0.05, Math.sin(t * 0.5) * 0.2, Math.sin(t) * 0.08)
    this.pose('head', 0, Math.sin(t * 0.5) * 0.2, 0)
    this.hipTgt = -Math.abs(Math.sin(t)) * 0.06
  }

  handsup() {
    this.idle()
    this.pose('armL', -0.2, 0, 2.7); this.pose('armR', -0.2, 0, -2.7)
    this.pose('foreL', 0, 0, -0.3); this.pose('foreR', 0, 0, 0.3)
  }

  cower() {
    this.hipTgt = -0.25
    this.pose('legL', -0.7); this.pose('legR', -0.7); this.pose('shinL', 1.3); this.pose('shinR', 1.3)
    this.pose('spine', 0.6); this.pose('head', 0.3)
    this.pose('armL', -1.9, 0, 0.3); this.pose('armR', -1.9, 0, -0.3)
    this.pose('foreL', -1.8); this.pose('foreR', -1.8)
  }

  drive() {
    this.sit()
    this.pose('armL', -1.1, 0, 0.1); this.pose('armR', -1.1, 0, -0.1)
    this.pose('foreL', -0.6); this.pose('foreR', -0.6)
  }

  falling() {
    const t = this.t * 12
    this.pose('armL', -0.6 + Math.sin(t) * 0.5, 0, 1.2); this.pose('armR', -0.6 - Math.sin(t) * 0.5, 0, -1.2)
    this.pose('legL', -0.5 + Math.sin(t) * 0.4); this.pose('legR', -0.2 - Math.sin(t) * 0.4)
    this.pose('shinL', 0.8); this.pose('shinR', 0.6)
    this.pose('spine', -0.2)
  }

  // ---------------------------------------------------------------------------
  actionPose(name, k, a) {
    const side = a.side // 1 = right hand leads
    const R = side > 0 ? 'R' : 'L', L = side > 0 ? 'L' : 'R', sg = side > 0 ? 1 : -1
    // wind-up (0..0.3) → strike (0.3..0.55) → recover
    const strike = k < 0.3 ? -ease(k / 0.3) * 0.35 : k < 0.55 ? ease((k - 0.3) / 0.25) : 1 - ease((k - 0.55) / 0.45)
    switch (name) {
      case 'jab':
      case 'cross': {
        const s = Math.max(0, strike)
        this.pose('arm' + R, -0.3 - s * 1.3, 0, sg * (-0.15 + s * 0.15))
        this.pose('fore' + R, -1.6 + s * 1.5)
        this.pose('arm' + L, -1.0, 0, sg * 0.3); this.pose('fore' + L, -1.9)
        this.pose('spine', 0.12 + s * 0.08, sg * (0.1 + s * 0.45), 0)
        this.pose('legL', -0.2); this.pose('legR', 0.25); this.pose('shinL', 0.2); this.pose('shinR', 0.25)
        this.hipTgt = -0.06
        break
      }
      case 'hook': {
        const s = Math.max(0, strike)
        this.pose('arm' + R, -1.2, 0, sg * (-0.4 - s * 0.9))
        this.pose('fore' + R, -1.5)
        this.pose('arm' + L, -1.0, 0, sg * 0.3); this.pose('fore' + L, -1.9)
        this.pose('spine', 0.18, sg * (-0.4 + s * 1.1), 0)
        this.pose('legL', -0.25); this.pose('legR', 0.3); this.pose('shinL', 0.3); this.pose('shinR', 0.3)
        this.hipTgt = -0.1
        break
      }
      case 'kick': {
        const s = Math.max(0, strike)
        this.pose('leg' + R, -0.3 - s * 1.2, 0, 0); this.pose('shin' + R, 1.2 - s * 1.1)
        this.pose('leg' + L, 0.1); this.pose('shin' + L, 0.25)
        this.pose('spine', -0.15 - s * 0.2, sg * 0.1, 0)
        this.pose('armL', -0.5, 0, 0.7); this.pose('armR', -0.5, 0, -0.7); this.pose('foreL', -0.8); this.pose('foreR', -0.8)
        break
      }
      case 'swing': {
        // overhead weapon swing with the right hand: raise, smash down, recover
        let armX, down = 0
        if (k < 0.35) armX = -0.2 - 2.4 * ease(k / 0.35)
        else if (k < 0.6) { down = ease((k - 0.35) / 0.25); armX = -2.6 + 1.7 * down }
        else { down = 1 - ease((k - 0.6) / 0.4); armX = -0.9 + 0.7 * (1 - down) }
        this.pose('arm' + R, armX, 0, sg * -0.2)
        this.pose('fore' + R, k < 0.35 ? -0.8 : -0.2)
        this.pose('spine', 0.1 + down * 0.35, sg * (0.25 - down * 0.5), 0)
        this.pose('arm' + L, -0.6, 0, sg * 0.3); this.pose('fore' + L, -1.2)
        this.pose('legL', -0.25); this.pose('legR', 0.25); this.pose('shinL', 0.3); this.pose('shinR', 0.2)
        this.hipTgt = -0.08
        break
      }
      case 'spray': {
        this.pose('arm' + R, -1.55, 0, sg * -0.1); this.pose('fore' + R, -0.1)
        this.pose('arm' + L, -0.3, 0, sg * 0.2); this.pose('fore' + L, -0.4)
        this.pose('spine', 0.08, sg * 0.25, 0)
        break
      }
      case 'hit': {
        const s = 1 - k
        this.pose('spine', -0.35 * s, sg * 0.2 * s, 0.1 * s)
        this.pose('head', -0.45 * s, 0, 0)
        this.pose('armL', -0.4 * s, 0, 0.5 * s); this.pose('armR', -0.4 * s, 0, -0.5 * s)
        this.hipTgt = -0.06 * s
        break
      }
      case 'stagger': {
        const w = Math.sin(k * Math.PI * 3) * (1 - k)
        this.pose('spine', -0.25 + w * 0.2, w * 0.4, w * 0.2)
        this.pose('head', -0.3, w * 0.4, 0)
        this.pose('armL', -0.8, 0, 1.0); this.pose('armR', -0.8, 0, -1.0)
        this.pose('legL', -0.3 * w); this.pose('legR', 0.3 * w)
        break
      }
      case 'knockdown': {
        this.pose('armL', -0.4, 0, 1.2); this.pose('armR', -0.4, 0, -1.2)
        this.pose('foreL', -0.3); this.pose('foreR', -0.3)
        this.pose('legL', -0.25, 0, -0.1); this.pose('legR', -0.1, 0, 0.1)
        this.pose('shinL', 0.4); this.pose('shinR', 0.2)
        this.pose('head', 0.25)
        break
      }
      case 'getup': {
        const s = 1 - ease(k)
        this.pose('legL', -1.2 * s); this.pose('legR', -1.0 * s); this.pose('shinL', 1.6 * s); this.pose('shinR', 1.4 * s)
        this.pose('spine', 0.5 * s)
        this.pose('armL', -0.6 * s, 0, 0.3); this.pose('armR', -0.6 * s, 0, -0.3)
        break
      }
      case 'wave': {
        this.pose('armR', -0.2, 0, -2.6); this.pose('foreR', 0, 0, 0.35 * Math.sin(k * 22))
        break
      }
      case 'point': {
        this.pose('armR', -1.55, -0.2, -0.05); this.pose('foreR', -0.05)
        this.pose('spine', 0.05, 0.2, 0); this.pose('head', 0, 0.15, 0)
        break
      }
      case 'cheer': {
        const b = Math.abs(Math.sin(k * 16))
        this.pose('armL', -0.3, 0, 2.6 + b * 0.2); this.pose('armR', -0.3, 0, -2.6 - b * 0.2)
        this.pose('foreL', 0, 0, -0.3); this.pose('foreR', 0, 0, 0.3)
        this.hipTgt = b * 0.08
        break
      }
      case 'shrug': {
        const s = Math.sin(k * Math.PI)
        this.pose('armL', -0.5 * s, 0, 0.5 * s); this.pose('armR', -0.5 * s, 0, -0.5 * s)
        this.pose('foreL', -1.6 * s, 0.8 * s, 0); this.pose('foreR', -1.6 * s, -0.8 * s, 0)
        this.pose('head', 0, 0, 0.2 * s)
        break
      }
      case 'facepalm': {
        const s = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5)
        this.pose('armR', -1.2 * s, 0, -0.35 * s); this.pose('foreR', -2.3 * s)
        this.pose('head', 0.35 * s, 0, 0); this.pose('spine', 0.1 * s)
        break
      }
      case 'jump': {
        this.pose('armL', -0.5, 0, 0.6); this.pose('armR', -0.5, 0, -0.6)
        this.pose('legL', -0.7); this.pose('legR', -0.2); this.pose('shinL', 1.1); this.pose('shinR', 0.6)
        break
      }
      case 'land': {
        this.hipTgt = -0.18 * (1 - k)
        this.pose('legL', -0.4 * (1 - k)); this.pose('legR', -0.4 * (1 - k)); this.pose('shinL', 0.8 * (1 - k)); this.pose('shinR', 0.8 * (1 - k))
        break
      }
      case 'enter': {
        this.pose('armR', -1.2, 0, -0.3); this.pose('foreR', -0.3)
        this.pose('spine', 0.25)
        break
      }
      case 'pickup': {
        const s = Math.sin(k * Math.PI)
        this.hipTgt = -0.35 * s
        this.pose('legL', -0.9 * s); this.pose('legR', -0.9 * s); this.pose('shinL', 1.5 * s); this.pose('shinR', 1.5 * s)
        this.pose('spine', 0.7 * s)
        this.pose('armR', -0.9 * s, 0, -0.1); this.pose('armL', -0.9 * s, 0, 0.1)
        break
      }
    }
  }
}
