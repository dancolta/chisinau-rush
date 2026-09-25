import { onRoad } from '../world/CityLayout.js'
import { STUNT, TRICK, DOWN } from '../data/aura.js'

// Car stunts, scored like a skate game: drifts, near misses, airtime, wrong-way runs and flat-out
// speed are tricks; every trick adds its points and one step of multiplier to the combo. A few
// quiet seconds bank the combo as aura, a crash loses it. Everything here is plain arithmetic on
// the player's car (one ground ray ten times a second), no allocations per frame.
export class Stunts {
  constructor(side) {
    this.side = side
    this.game = side.game
    this.combo = null
    this.v = null
    this.t = 0
    this.near = new Map()      // vehicle -> { on, gap, cool }
    this.lastCrash = -9
    this.lastCrashWith = null
    this.reset()
  }

  reset() {
    this.drift = 0; this.driftT = 0; this.driftOff = 0
    this.wrong = 0; this.wrongT = 0; this.wrongOff = 0
    this.airT = 0; this.airNow = false; this.rayT = 0
    this.fastT = 0
  }

  // a trick in progress keeps the combo open
  get busy() { return this.driftT > 0 || this.wrongT > 0 || this.airT > 0 }
  get live() { return Math.round(this.drift + this.wrong * STUNT.wrongRate + this.airT * STUNT.airRate) }

  update(dt) {
    const g = this.game, p = g.player
    this.t += dt
    const v = p && !p.passenger ? p.vehicle : null
    if (!v || v.def.trolley || g.cutscene || g.ui.modalOpen || g.state !== 'play') {
      if (this.v) { this.bank(); this.reset(); this.v = null }
      return
    }
    if (v !== this.v) { this.bank(); this.reset(); this.v = v }
    this.sample(v, dt)
    this.tickCombo(dt)
    if ((this.cleanT = (this.cleanT || 0) - dt) <= 0) { this.cleanT = 5; for (const o of this.near.keys()) if (o.disposed) this.near.delete(o) }
  }

  // one step of detection on a car (also driven with plain objects by tools/aura.mjs)
  sample(v, dt) {
    const sp = Math.abs(v.speed), lat = Math.abs(v.lateral || 0)
    // ---- drift: sliding sideways at speed
    if (!v.broken && sp > STUNT.driftSpeed && lat > STUNT.driftLat) {
      this.drift += dt * sp * Math.min(1, lat / 9) * STUNT.driftRate
      this.driftT += dt; this.driftOff = 0
      this.open()
    } else if (this.driftT > 0 && (this.driftOff += dt) > 0.35) this.endDrift()
    // ---- wrong way: against the lane you're in (right-hand traffic)
    let wrong = false
    if (sp > STUNT.wrongSpeed && this.game.state === 'play') {
      const r = onRoad(v.pos.x, v.pos.z, -0.5)
      if (r) {
        const s = v.speed < 0 ? -1 : 1
        const fx = Math.sin(v.heading) * s, fz = Math.cos(v.heading) * s
        if (r.z !== undefined) { const d = fx > 0.6 ? 1 : fx < -0.6 ? -1 : 0; wrong = d !== 0 && (v.pos.z - r.z) * d < -1.2 }
        else { const d = fz > 0.6 ? 1 : fz < -0.6 ? -1 : 0; wrong = d !== 0 && (v.pos.x - r.x) * d > 1.2 }
      }
    }
    if (wrong) { this.wrong += sp * dt; this.wrongT += dt; this.wrongOff = 0; this.open() }
    else if (this.wrongT > 0 && (this.wrongOff += dt) > 0.5) this.endWrong()
    // ---- airtime: the car off the ground (the vehicle can say so itself with `airborne`)
    if ((this.rayT -= dt) <= 0) {
      this.rayT = 0.1
      if (v.airborne !== undefined) this.airNow = !!v.airborne
      else if (this.game.physics && sp > 4) this.airNow = v.pos.y - this.game.physics.groundHeight(v.pos.x, v.pos.z, v.pos.y + 1) > STUNT.airHeight
      else this.airNow = false
    }
    if (this.airNow) { this.airT += dt; this.open() }
    else if (this.airT > 0) {
      if (this.airT >= STUNT.airMin) this.trick(TRICK.air, Math.round(this.airT * STUNT.airRate))
      this.airT = 0
    }
    // ---- flat out
    if (sp > STUNT.fast) { if ((this.fastT += dt) > STUNT.fastT && !this.combo?.fast) { this.trick(TRICK.fast, STUNT.fastPts); this.combo.fast = true } }
    else this.fastT = 0
    this.nearMisses(v)
  }

  endDrift() {
    const pts = Math.round(this.drift)
    this.drift = 0; this.driftT = 0; this.driftOff = 0
    this.side.challenges?.track('drift', pts)
    if (pts >= STUNT.driftMin) this.trick(TRICK.drift, pts)
  }

  endWrong() {
    const m = this.wrong, secs = this.wrongT
    this.wrong = 0; this.wrongT = 0; this.wrongOff = 0
    this.side.challenges?.track('wrongway', Math.round(m))
    if (secs >= STUNT.wrongMin) this.trick(TRICK.wrong, Math.round(m * STUNT.wrongRate))
  }

  // moving traffic passing within a hand's width, in the car's own frame
  nearMisses(v) {
    const sp = Math.abs(v.speed)
    const h = v.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h)
    const L0 = v.def.dims[2], W0 = v.def.dims[0]
    for (const o of this.game.vehicles.list) {
      if (o === v || o.disposed) continue
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z
      let st = this.near.get(o)
      if (dx > 18 || dx < -18 || dz > 18 || dz < -18) { if (st && st.on) this.passed(o, st); continue }
      const moving = o.def.trolley || Math.abs(o.speed) > 1.5
      if (!moving && !st) continue
      const dh = o.heading - h, c = Math.abs(Math.cos(dh)), s = Math.abs(Math.sin(dh))
      const oL = c * o.def.dims[2] + s * o.def.dims[0], oW = s * o.def.dims[2] + c * o.def.dims[0]
      const along = dx * fx + dz * fz, gap = Math.abs(dx * rx + dz * rz) - W0 - oW
      const side = Math.abs(along) < L0 + oL + 0.4
      const rel = Math.abs(v.speed - o.speed * Math.cos(dh))
      if (side && gap < STUNT.nearGap && sp > STUNT.nearSpeed && rel > 8 && moving) {
        if (!st) { st = { on: false, gap: 9, cool: 0 }; this.near.set(o, st) }
        st.on = true
        if (gap < st.gap) st.gap = gap
        this.open()
      } else if (st && st.on && (Math.abs(along) > L0 + oL + 1.5 || gap > 3)) this.passed(o, st)
    }
  }

  passed(o, st) {
    st.on = false
    const gap = st.gap
    st.gap = 9
    if (gap < -0.05 || this.t < st.cool) return
    if (this.lastCrashWith === o && this.t - this.lastCrash < 1.5) return
    st.cool = this.t + 3
    this.side.state.stats.nearMiss++
    this.side.challenges?.track('nearmiss', 1)
    if (gap < STUNT.nearTight) this.trick(TRICK.tight, STUNT.nearTightPts)
    else this.trick(TRICK.near, STUNT.near)
  }

  // ---- the combo ------------------------------------------------------------------------------------
  open() {
    if (!this.combo) this.combo = { pts: 0, mult: 0, tricks: [], idle: 0, fast: false, n: 0 }
    this.combo.idle = 0
  }

  trick(name, pts) {
    this.open()
    const c = this.combo
    c.pts += pts
    c.mult = Math.min(STUNT.maxMult, c.mult + 1)
    c.n++
    c.tricks.push(name)
    if (c.tricks.length > 5) c.tricks.shift()
    this.side.ui.stuntTrick(c, name, pts)
    this.game.audio?.sfx('coin', { bus: 'ui', vol: 0.45, pitch: 0.9 + c.mult * 0.08 })
    this.side.hint('stunt')
  }

  tickCombo(dt) {
    const c = this.combo
    if (!c) return
    const win = STUNT.window + (this.side.perk('combo') ? 0.6 : 0)
    if (!this.busy) c.idle += dt
    if (c.idle > win) { this.bank(); return }
    this.side.ui.stuntTick(c, this.live, 1 - c.idle / win)
  }

  // the combo pays out
  bank() {
    if (this.driftT > 0) this.endDrift()
    if (this.wrongT > 0) this.endWrong()
    if (this.airT >= STUNT.airMin) this.trick(TRICK.air, Math.round(this.airT * STUNT.airRate))
    this.airT = 0
    const c = this.combo
    this.combo = null
    if (!c) return 0
    if (!c.n) { this.side.ui.stuntClear(); return 0 }
    const aura = Math.round(c.pts * c.mult / STUNT.perAura)
    const st = this.side.state.stats
    st.combos++
    if (aura > st.bestCombo) st.bestCombo = aura
    if (c.mult > st.bestMult) st.bestMult = c.mult
    this.side.ui.stuntBank(c, aura)
    if (aura > 0) this.side.aura.gain(aura, `Combo ×${c.mult}: ${[...new Set(c.tricks)].slice(-3).join(' + ')}`, { raw: true })
    this.side.challenges?.track('combo', aura)
    this.game.events.emit('stunt:bank', { pts: c.pts, mult: c.mult, aura })
    return aura
  }

  // a real crash: the combo is gone
  crash(force, other) {
    this.lastCrash = this.t
    this.lastCrashWith = other || null
    if (force < STUNT.crash) return
    const c = this.combo
    if (!c) return
    const pending = Math.round((c.pts + this.live) * Math.max(1, c.mult) / STUNT.perAura)
    this.combo = null
    this.reset()
    this.side.ui.stuntFail(c)
    if (pending >= 20) this.side.aura.lose(DOWN.comboCrash[0], DOWN.comboCrash[1])
  }
}
