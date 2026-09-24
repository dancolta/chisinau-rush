// Vehicle sound: pooled engine voices for the nearest cars (the player's car is 2D, the rest
// are spatialized with Doppler), a synthesized electric whine for trolleybuses, the player's
// tyre skid, pooled police sirens and one-shot horns. Nodes are created only when a voice
// changes vehicle kind, never per frame.
import { clamp, smooth, rand, makePanner, setPannerPos } from './dsp.js'

const MAX_ENGINES = 4 // including the player's car
const POOL = 6 // spatial voices (spares let released ones fade out)
const ENGINE_RADIUS = 75
const SIREN_RADIUS = 150
const MAX_SIRENS = 2
const SOUND_SPEED = 343

const seeds = new WeakMap()
const seedOf = (v) => { let s = seeds.get(v); if (!s) { s = rand(0.94, 1.06); seeds.set(v, s) } return s }

// per-model character: loop pitch, loudness, brightness
function profileOf(v) {
  const d = v.def || {}
  if (d.trolley) return { kind: 'electric', gain: 1 }
  if (d.moto || /moto|scuter|bike/.test(d.proc || d.kay || '')) return { kind: 'moto', rate: 1, gain: 0.9, lp: 1.2 }
  switch (d.proc || d.kay) {
    case 'gwagon': return { kind: 'engine', rate: 0.8, gain: 1.2, lp: 0.85 } // lazy V8
    case 'rutiera': return { kind: 'engine', rate: 0.74, gain: 1.1, lp: 0.75 } // tired diesel
    case 'jiguli': return { kind: 'engine', rate: 0.93, gain: 1.1, lp: 1.15 } // rattly Lada
    case 'car_hatchback': return { kind: 'engine', rate: 1.12, gain: 0.9, lp: 1.1 }
    case 'car_police': return { kind: 'engine', rate: 1.04, gain: 1, lp: 1 }
    default: return { kind: 'engine', rate: 1, gain: 1, lp: 1 }
  }
}

// pseudo gearbox: engine speed 0..1 from speed as a fraction of top speed
const GEARS = [0, 0.15, 0.32, 0.52, 0.76, 1]
function gearRpm(sf) {
  if (sf < 0.02) return 0
  for (let i = GEARS.length - 2; i >= 0; i--) {
    if (sf >= GEARS[i]) {
      const x = clamp((sf - GEARS[i]) / (GEARS[i + 1] - GEARS[i]), 0, i === GEARS.length - 2 ? 1.15 : 1)
      return i === 0 ? 0.1 + 0.9 * x : 0.42 + 0.58 * x
    }
  }
  return 0
}

class EngineVoice {
  constructor(va, spatial) {
    const ctx = va.ctx
    this.va = va
    this.ctx = ctx
    this.spatial = spatial
    this.out = ctx.createGain()
    this.out.gain.value = 0
    if (spatial) {
      this.pan = makePanner(ctx, 6, 120)
      this.out.connect(this.pan)
      this.pan.connect(va.bus)
    } else this.out.connect(va.bus)
    this.lp = ctx.createBiquadFilter()
    this.lp.type = 'lowpass'
    this.lp.Q.value = 0.8
    this.lp.frequency.value = 2000
    this.lp.connect(this.out)
    if (!spatial) {
      // presence: saturated copy band-passed into the mids so the (very bassy) loop still
      // reads on laptop speakers
      this.sat = ctx.createWaveShaper()
      this.sat.curve = va.eng.kit.drive(3)
      const bp = ctx.createBiquadFilter(), g = ctx.createGain()
      bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.9
      g.gain.value = 0.22
      this.sat.connect(bp); bp.connect(g); g.connect(this.out)
    }
    this.v = null
    this.kind = null
    this.nodes = []
    this.freeAt = 0
    this.rpm = 0
    this.load = 0
    this.vr = 0
    this.lastD = null
  }

  assign(v, now) {
    this.v = v
    this.prof = profileOf(v)
    this.seed = seedOf(v)
    // combustion engines fall back to a synth voice until/unless the sample is decoded
    let kind = this.prof.kind
    if (kind !== 'electric' && !this.va.eng.loop(kind === 'moto' ? 'engine-motorcycle' : 'engine')) kind += '-synth'
    if (kind !== this.kind) this.build(kind, now)
    const top = (v.def && v.def.maxSpeed) || 40
    this.rpm = gearRpm(Math.abs(v.speed || 0) / top)
    this.load = 0
    this.lastD = null
    this.vr = 0
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(this.out.gain.value, now)
    if (this.spatial) setPannerPos(this.pan, v.pos.x, v.pos.y + 0.6, v.pos.z, now)
  }

  release(now) {
    this.v = null
    this.out.gain.setTargetAtTime(0, now, 0.1)
    this.freeAt = now + 0.6
  }

  // (re)create the sound source for this kind of vehicle
  build(kind, now) {
    this.kill(now)
    this.kind = kind
    const ctx = this.ctx, dest = [this.lp]
    if (this.sat) dest.push(this.sat)
    const link = (n) => { for (const d of dest) n.connect(d) }
    if (kind === 'electric') {
      // traction inverter whine (+ octave) and a low hum from the auxiliaries
      const a = ctx.createOscillator(), b = ctx.createOscillator(), h = ctx.createOscillator()
      const ga = ctx.createGain(), gb = ctx.createGain(), gh = ctx.createGain()
      a.type = 'sawtooth'; b.type = 'sine'; h.type = 'triangle'
      h.frequency.value = 100
      ga.gain.value = 0.1; gb.gain.value = 0.3; gh.gain.value = 0.28
      a.connect(ga); b.connect(gb); h.connect(gh)
      link(ga); link(gb); link(gh)
      for (const o of [a, b, h]) o.start(now)
      this.nodes = [a, b, h]
      this.whine = [a, b]
      this.whineGain = ga
    } else if (kind === 'engine' || kind === 'moto') {
      const loop = this.va.eng.loop(kind === 'moto' ? 'engine-motorcycle' : 'engine')
      const s = ctx.createBufferSource()
      s.buffer = loop.buffer
      s.loop = true
      s.loopEnd = loop.end
      s.playbackRate.value = 0.7
      link(s)
      s.start(now, Math.random() * loop.end)
      this.nodes = [s]
      this.rate = s.playbackRate
    } else {
      // no sample: sawtooth + square sub with a firing-rate flutter
      const a = ctx.createOscillator(), b = ctx.createOscillator(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain()
      a.type = 'sawtooth'; b.type = 'square'
      b.detune.value = -1200
      am.gain.value = 0.35
      lfo.frequency.value = 18
      lg.gain.value = 0.15
      lfo.connect(lg); lg.connect(am.gain)
      a.connect(am); b.connect(am)
      link(am)
      for (const o of [a, b, lfo]) o.start(now)
      this.nodes = [a, b, lfo]
      this.synth = [a, b, lfo]
    }
  }

  kill(now) {
    for (const n of this.nodes) { try { n.stop(now) } catch (e) { /* stopped */ } }
    this.nodes = []
    this.whine = this.synth = this.rate = null
    this.kind = null
  }

  update(now, dt, lis, isPlayer) {
    const v = this.v, p = this.prof, d = v.def || {}
    const speed = v.speed || 0, spd = Math.abs(speed), top = d.maxSpeed || 40, sf = spd / top
    const thr = clamp(v.throttle || 0, -1, 1)
    let load = Math.max(0, thr)
    let rpm
    if (speed < -0.4) { rpm = 0.05 + 0.6 * clamp(spd / (top * 0.3), 0, 1); load = Math.max(load, -thr) }
    else rpm = gearRpm(sf)
    if (sf < 0.06) rpm = Math.max(rpm, load * 0.5) // revving on the spot
    if (load < 0.05) rpm *= 0.9 // off throttle
    this.rpm += (rpm - this.rpm) * (1 - Math.exp(-dt * (rpm > this.rpm ? 9 : 4)))
    this.load += (load - this.load) * (1 - Math.exp(-dt * 7))
    let dop = 1, fade = 1
    if (this.spatial) {
      const dx = v.pos.x - lis.x, dy = v.pos.y - lis.y, dz = v.pos.z - lis.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (this.lastD !== null && dt > 0 && Math.abs(dist - this.lastD) < 6) {
        this.vr += (clamp((dist - this.lastD) / dt, -60, 60) - this.vr) * (1 - Math.exp(-dt * 5))
      }
      this.lastD = dist
      dop = clamp(SOUND_SPEED / (SOUND_SPEED + this.vr), 0.85, 1.15)
      fade = smooth(ENGINE_RADIUS, ENGINE_RADIUS - 20, dist)
      setPannerPos(this.pan, v.pos.x, v.pos.y + 0.6, v.pos.z, now, 0.03)
    }
    // real engine sample finished decoding after this voice fell back to the synth
    if (this.kind === 'engine-synth' || this.kind === 'moto-synth') {
      const k = this.kind.replace('-synth', '')
      if (this.va.eng.loop(k === 'moto' ? 'engine-motorcycle' : 'engine')) this.build(k, now)
    }
    let g
    if (this.kind === 'electric') {
      const f = (70 + spd * 34) * dop
      this.whine[0].frequency.setTargetAtTime(f, now, 0.08)
      this.whine[1].frequency.setTargetAtTime(f * 2, now, 0.08)
      this.whineGain.gain.setTargetAtTime(0.03 + 0.12 * clamp(this.load + sf, 0, 1), now, 0.1)
      this.lp.frequency.setTargetAtTime(3500, now, 0.1)
      g = p.gain * (0.35 + 0.35 * this.load + 0.4 * sf)
    } else {
      const rate = (0.7 + 1.4 * this.rpm) * (p.rate || 1) * this.seed * dop
      if (this.rate) this.rate.setTargetAtTime(rate, now, 0.03)
      if (this.synth) {
        this.synth[0].frequency.setTargetAtTime(38 * rate, now, 0.03)
        this.synth[1].frequency.setTargetAtTime(38 * rate, now, 0.03)
        this.synth[2].frequency.setTargetAtTime(19 * rate, now, 0.03)
      }
      this.lp.frequency.setTargetAtTime((600 + 4200 * (0.3 + 0.7 * this.load) * (0.35 + 0.65 * this.rpm)) * (p.lp || 1), now, 0.05)
      g = p.gain * (0.36 + 0.42 * this.load + 0.22 * this.rpm)
    }
    this.out.gain.setTargetAtTime(g * (isPlayer ? 0.4 : 0.6) * fade, now, 0.05)
  }

  // stop the source once a released voice has faded out
  idle(now) { if (!this.v && this.nodes.length && now > this.freeAt + 2) this.kill(now) }

  dispose() { this.kill(0); this.out.disconnect() }
}

class SirenVoice {
  constructor(va) {
    this.va = va
    this.ctx = va.ctx
    this.v = null
    this.alive = false
    this.freeAt = 0
  }

  build(now) {
    const ctx = this.ctx
    this.osc = ctx.createOscillator()
    this.osc.type = 'square'
    const sat = ctx.createWaveShaper(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter()
    sat.curve = this.va.eng.kit.drive(1.6)
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.55
    lp.type = 'lowpass'; lp.frequency.value = 3400
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.pan = makePanner(ctx, 14, 200)
    this.osc.connect(sat); sat.connect(bp); bp.connect(lp); lp.connect(this.out); this.out.connect(this.pan); this.pan.connect(this.va.bus)
    this.osc.start(now)
    this.alive = true
  }

  assign(v, now) {
    if (!this.alive) this.build(now)
    this.v = v
    this.mode = v.sirenMode === 'wail' ? 'wail' : 'twotone'
    this.hi = Math.random() < 0.5
    const f = this.mode === 'wail' ? 650 : this.hi ? 590 : 460
    const fr = this.osc.frequency
    fr.cancelScheduledValues(now)
    fr.setValueAtTime(f, now)
    this.next = now + rand(0.05, 0.4) // start out of phase with other sirens
    this.lastD = null
    this.vr = 0
    setPannerPos(this.pan, v.pos.x, v.pos.y + 1.6, v.pos.z, now)
  }

  release(now) {
    this.v = null
    if (this.alive) this.out.gain.setTargetAtTime(0, now, 0.08)
    this.freeAt = now + 0.5
  }

  update(now, dt, lis) {
    const v = this.v, fr = this.osc.frequency
    // keep ~0.3 s of the pattern scheduled ahead
    if (this.next < now) this.next = now
    while (this.next < now + 0.3) {
      if (this.mode === 'wail') {
        const seg = this.hi ? 1.7 : 2.1
        fr.exponentialRampToValueAtTime(this.hi ? 650 : 1350, this.next + seg)
        this.next += seg
      } else {
        // European two-tone "nee-naw": 460 / 590 Hz alternating every 0.45 s
        fr.setValueAtTime(this.hi ? 590 : 460, this.next)
        fr.linearRampToValueAtTime(this.hi ? 460 : 590, this.next + 0.025)
        this.next += 0.45
      }
      this.hi = !this.hi
    }
    const dx = v.pos.x - lis.x, dy = v.pos.y - lis.y, dz = v.pos.z - lis.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (this.lastD !== null && dt > 0 && Math.abs(dist - this.lastD) < 6) {
      this.vr += (clamp((dist - this.lastD) / dt, -60, 60) - this.vr) * (1 - Math.exp(-dt * 5))
    }
    this.lastD = dist
    this.osc.detune.setTargetAtTime(1200 * Math.log2(SOUND_SPEED / (SOUND_SPEED + this.vr)), now, 0.08)
    setPannerPos(this.pan, v.pos.x, v.pos.y + 1.6, v.pos.z, now, 0.03)
    this.out.gain.setTargetAtTime(0.3 * smooth(SIREN_RADIUS, SIREN_RADIUS - 30, dist), now, 0.06)
  }

  idle(now) {
    if (!this.v && this.alive && now > this.freeAt + 4) {
      try { this.osc.stop() } catch (e) { /* stopped */ }
      this.out.disconnect()
      this.alive = false
    }
  }

  dispose() { if (this.alive) { try { this.osc.stop() } catch (e) { /* stopped */ } this.out.disconnect(); this.alive = false } }
}

class Skid {
  constructor(va) {
    this.va = va
    this.ctx = va.ctx
    this.src = null
    this.amt = 0
    this.quietSince = 0
  }

  start(now) {
    const ctx = this.ctx
    this.g = ctx.createGain()
    this.g.gain.value = 0
    this.g.connect(this.va.bus)
    const loop = this.va.eng.loop('skid')
    if (loop) {
      const s = ctx.createBufferSource()
      s.buffer = loop.buffer
      s.loop = true
      s.loopEnd = loop.end
      s.connect(this.g)
      s.start(now, Math.random() * loop.end)
      this.src = s
      this.rate = s.playbackRate
    } else {
      // resonant band-passed noise squeal
      const s = this.va.eng.kit.noiseSrc('white', now, 1e6), bp = ctx.createBiquadFilter(), g = ctx.createGain()
      bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 7
      g.gain.value = 2.2
      s.connect(bp); bp.connect(g); g.connect(this.g)
      this.src = s
      this.rate = null
    }
  }

  stop() {
    try { this.src.stop() } catch (e) { /* stopped */ }
    this.g.disconnect()
    this.src = null
  }

  update(now, v) {
    let amt = 0
    if (v) {
      const lat = Math.abs(v.lateral || 0), spd = Math.abs(v.speed || 0)
      amt = clamp((lat - 3) / 7, 0, 1)
      if (v.handbrake && spd > 6) amt = Math.max(amt, clamp((spd - 6) / 14, 0, 1))
      if (amt > 0.01 && !this.src) this.start(now)
      if (this.rate) this.rate.setTargetAtTime(0.85 + 0.3 * clamp(spd / 30, 0, 1), now, 0.1)
    }
    if (!this.src) return
    this.g.gain.setTargetAtTime(0.38 * amt, now, amt > this.amt ? 0.04 : 0.12)
    this.amt = amt
    if (amt > 0.01) this.quietSince = 0
    else if (!this.quietSince) this.quietSince = now
    else if (now - this.quietSince > 2) this.stop()
  }

  dispose() { if (this.src) this.stop() }
}

// horn voicings: frequencies, note length, level, horn-body resonance, grit
const HORNS = {
  car: { f: [405, 510], dur: 0.45, gain: 0.2, bp: 1800, drive: 2.5 },
  trolley: { f: [196, 247], dur: 0.6, gain: 0.2, bp: 900, drive: 2 },
  rutiera: { f: [560, 700], dur: 0.11, gain: 0.24, bp: 2000, drive: 2.5, repeat: 2, gap: 0.075 },
  gwagon: { f: [280, 350], dur: 0.55, gain: 0.18, bp: 1100, drive: 3.5 },
  jiguli: { f: [370], dur: 0.4, gain: 0.22, bp: 1300, drive: 3 },
}

function hornRecipe(s, h) {
  const sum = s.gain(1, null)
  const grit = s.ctx.createWaveShaper()
  grit.curve = s.k.drive(h.drive)
  sum.connect(grit)
  grit.connect(s.node('bandpass', h.bp, 0.8))
  grit.connect(s.gain(0.45, s.node('lowpass', 1400, 0.7)))
  for (let r = 0; r < (h.repeat || 1); r++) {
    const at = r * (h.dur + (h.gap || 0))
    for (const f of h.f) s.tone({ type: 'sawtooth', f, at, dur: h.dur, a: 0.008, hold: h.dur - 0.05, gain: h.gain, dest: sum })
  }
}

export class VehicleAudio {
  constructor(eng) {
    this.eng = eng
    this.ctx = eng.ctx
    this.bus = eng.buses.sfx
    this.player = new EngineVoice(this, false)
    this.pool = Array.from({ length: POOL }, () => new EngineVoice(this, true))
    this.sirens = Array.from({ length: MAX_SIRENS + 1 }, () => new SirenVoice(this))
    this.skid = new Skid(this)
    this.hornT = new WeakMap()
    this.lastT = 0
  }

  update(list, pv, now) {
    const dt = this.lastT ? clamp(now - this.lastT, 0, 0.1) : 1 / 60
    this.lastT = now
    const lis = this.eng.lis
    const player = pv && pv.pos && !pv.broken ? pv : null
    // ---- player engine (2D)
    if (player) {
      if (this.player.v !== player) this.player.assign(player, now)
      this.player.update(now, dt, lis, true)
    } else if (this.player.v) this.player.release(now)
    this.player.idle(now)
    this.skid.update(now, pv && pv.pos ? pv : null)
    // ---- nearest running engines (assigned ones get a hysteresis bonus)
    const cands = [], sirenCands = []
    for (const v of list) {
      if (!v || !v.pos || v === pv || v.broken) continue
      const dx = v.pos.x - lis.x, dz = v.pos.z - lis.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (v.siren && d < SIREN_RADIUS) sirenCands.push({ v, d })
      if (v.driver && d < ENGINE_RADIUS) cands.push({ v, d: d * (this.pool.some((e) => e.v === v) ? 0.8 : 1) })
    }
    if (pv && pv.siren && !pv.broken && pv.pos) sirenCands.push({ v: pv, d: 0 })
    cands.sort((a, b) => a.d - b.d)
    const want = new Set(cands.slice(0, MAX_ENGINES - (player ? 1 : 0)).map((c) => c.v))
    this.assign(this.pool, want, now)
    for (const e of this.pool) { if (e.v) e.update(now, dt, lis, false); e.idle(now) }
    // ---- sirens: nearest two
    sirenCands.sort((a, b) => a.d - b.d)
    this.assign(this.sirens, new Set(sirenCands.slice(0, MAX_SIRENS).map((c) => c.v)), now)
    for (const s of this.sirens) { if (s.v) s.update(now, dt, lis); s.idle(now) }
  }

  // keep existing vehicle->voice pairs, release the rest, give newcomers the quietest free voice
  assign(voices, want, now) {
    for (const vc of voices) if (vc.v && !want.has(vc.v)) vc.release(now)
    for (const v of want) {
      if (voices.some((vc) => vc.v === v)) continue
      const free = voices.filter((vc) => !vc.v).sort((a, b) => a.freeAt - b.freeAt)[0]
      if (free) free.assign(v, now)
    }
  }

  horn(v, vol = 1) {
    if (!v || !v.pos) return
    const now = this.ctx.currentTime
    if (now - (this.hornT.get(v) || -1) < 0.3) return
    this.hornT.set(v, now)
    const d = v.def || {}
    const h = HORNS[d.trolley ? 'trolley' : d.proc === 'rutiera' ? 'rutiera' : d.proc === 'gwagon' ? 'gwagon' : d.proc === 'jiguli' ? 'jiguli' : 'car']
    this.eng._play('horn', { at: v.pos, vol, pitch: seedOf(v) }, (s) => hornRecipe(s, h))
  }

  active() { return !!(this.player.v || this.skid.src || this.pool.some((e) => e.v) || this.sirens.some((s) => s.v)) }

  stats() {
    return {
      engines: this.pool.filter((e) => e.v).length + (this.player.v ? 1 : 0),
      sirens: this.sirens.filter((s) => s.v).length,
      skid: this.skid.amt,
    }
  }

  dispose() {
    this.player.dispose()
    for (const e of this.pool) e.dispose()
    for (const s of this.sirens) s.dispose()
    this.skid.dispose()
  }
}
