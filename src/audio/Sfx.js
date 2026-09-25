// One-shot sound effects. Each recipe receives a Shot: a small builder that schedules
// oscillators, noise and sample layers into one voice output (which the engine has already
// routed to a bus, optionally through a 3D panner, at the requested volume).
import { rand, mtof } from './dsp.js'
import { STINGERS } from './Music.js'
import { policeWhistle } from './Instruments.js'

export const UI_SOUNDS = new Set(['click', 'hover', 'confirm', 'back', 'error', 'toggle', 'notify', 'typewriter', 'beep', 'go'])

export class Shot {
  constructor(eng, out, t, pitch, opts) {
    this.eng = eng
    this.k = eng.kit
    this.ctx = eng.ctx
    this.out = out
    this.t = t
    this.p = pitch
    this.tr = 12 * Math.log2(pitch) // pitch as semitones, for musical recipes
    this.o = opts
    this.end = t
    this.lfos = []
    this.dist = 0 // listener distance (set by the engine for positional sounds)
  }

  done(t) { if (t > this.end) this.end = t }

  node(type, f, q = 0.7, dest = this.out) {
    const n = this.ctx.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    if (dest) n.connect(dest)
    return n
  }

  gain(v, dest = this.out) {
    const g = this.ctx.createGain()
    g.gain.value = v
    if (dest) g.connect(dest)
    return g
  }

  drive(amount, dest = this.out) {
    const w = this.ctx.createWaveShaper()
    w.curve = this.k.drive(amount)
    w.connect(dest)
    return w
  }

  // extra reverb send for the whole voice (post volume); far sounds get relatively wetter,
  // but the send still fades with distance
  wet(amount) {
    const g = this.gain(amount / (1 + this.dist / 40), this.eng.buses.sfxWet)
    this.out.connect(g)
  }

  // gain stage wobbling with a sine LFO (crowd murmur)
  am(rate, depth, dest = this.out) {
    const g = this.gain(1 - depth, dest), lfo = this.ctx.createOscillator(), lg = this.gain(depth, g.gain)
    lfo.frequency.value = rate
    lfo.connect(lg)
    lfo.start(this.t)
    this.lfos.push(lfo)
    return g
  }

  // linear attack, optional hold, exponential decay that lands at t0 + dur
  env(p, t0, dur, peak, a = 0.002, hold = 0) {
    const end = t0 + Math.max(dur, a + hold + 0.004)
    p.setValueAtTime(0, t0)
    p.linearRampToValueAtTime(Math.max(peak, 0.0002), t0 + a)
    if (hold > 0) p.setValueAtTime(Math.max(peak, 0.0002), t0 + a + hold)
    p.exponentialRampToValueAtTime(0.0001, end)
    p.setValueAtTime(0, end + 0.001)
    return end
  }

  // frequency automation: [[hz, time], ...] (time relative to t0, exponential moves)
  points(param, t0, pts, scale) {
    param.setValueAtTime(pts[0][0] * scale, t0 + pts[0][1])
    for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(pts[i][0] * scale, t0 + pts[i][1])
  }

  // optional filter stage described by o.type/o.f/o.q/o.fs (+ o.hp extra highpass)
  chain(o, dest, t0) {
    let d = dest
    if (o.hp) d = this.node('highpass', o.hp * this.p, 0.7, d)
    if (!o.type) return d
    const n = this.node(o.type, (o.f ?? 1000) * this.p, o.q ?? 0.7, d)
    if (o.fs) this.points(n.frequency, t0, o.fs, this.p)
    return n
  }

  tone(o) {
    const ctx = this.ctx, t0 = this.t + (o.at || 0), dur = o.dur ?? 0.2
    const osc = ctx.createOscillator()
    if (o.wave) osc.setPeriodicWave(o.wave)
    else osc.type = o.type || 'sine'
    const s = o.fixed ? 1 : this.p
    if (o.fpts) this.points(osc.frequency, t0, o.fpts, s)
    else {
      osc.frequency.setValueAtTime(o.f * s, t0)
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * s, t0 + (o.glide ?? dur))
    }
    if (o.vib) osc.detune.setValueCurveAtTime(this.k.vib(dur, o.vib[0], o.vib[1], 0.05), t0, dur)
    const g = ctx.createGain()
    const end = this.env(g.gain, t0, dur, o.gain ?? 0.5, o.a ?? 0.002, o.hold ?? 0)
    osc.connect(g)
    const dest = o.filter ? this.chain(o.filter, o.dest || this.out, t0) : (o.dest || this.out)
    g.connect(dest)
    osc.start(t0)
    osc.stop(end + 0.01)
    this.done(end + 0.01)
    return osc
  }

  noise(o) {
    const t0 = this.t + (o.at || 0), dur = o.dur ?? 0.1
    const g = this.ctx.createGain()
    const end = this.env(g.gain, t0, dur, o.gain ?? 0.5, o.a ?? 0.001, o.hold ?? 0)
    const src = this.k.noiseSrc(o.color || 'white', t0, end - t0 + 0.01)
    src.connect(this.chain(o, g, t0))
    g.connect(o.dest || this.out)
    this.done(end + 0.01)
    return src
  }

  // many short bursts from one noise source (crackles, rustles, claps, debris)
  pulses(o) {
    const times = o.times.slice().sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.004)
    if (!times.length) return
    const g = this.ctx.createGain()
    g.gain.value = 0
    const first = this.t + times[0], len = o.dur ?? 0.03
    let last = first
    times.forEach((ti, i) => {
      const t0 = this.t + ti
      const next = i + 1 < times.length ? this.t + times[i + 1] : Infinity
      const d = Math.max(0.004, Math.min(len, (next - t0) * 0.9))
      const peak = (o.gain ?? 0.4) * (o.gains ? o.gains[i] : rand(0.45, 1))
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(peak, t0 + 0.0015)
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + d)
      g.gain.setValueAtTime(0, t0 + d + 0.0002)
      last = t0 + d
    })
    const src = this.k.noiseSrc(o.color || 'white', first, last - first + 0.02)
    src.connect(this.chain(o, g, first))
    g.connect(o.dest || this.out)
    this.done(last + 0.02)
  }

  // sample layer; returns false when the buffer isn't available (caller can synthesize)
  buf(name, o = {}) {
    const b = this.eng.buffers[name]
    if (!b) return false
    const t0 = this.t + (o.at || 0)
    const src = this.ctx.createBufferSource()
    src.buffer = b
    const rate = (o.rate ?? 1) * (o.fixed ? 1 : this.p)
    src.playbackRate.value = rate
    const g = this.gain(o.gain ?? 1, o.dest || this.out)
    src.connect(o.type ? this.chain(o, g, t0) : g)
    const offset = Math.max(0, Math.min(o.offset || 0, b.duration - 0.005))
    const len = Math.min(o.dur ?? b.duration - offset, b.duration - offset)
    if (o.dur) { // fade the slice out to avoid a click at the cut
      const e = t0 + len / rate
      g.gain.setValueAtTime(o.gain ?? 1, Math.max(t0, e - 0.02))
      g.gain.linearRampToValueAtTime(0, e)
    }
    src.start(t0, offset, len)
    this.done(t0 + len / rate + 0.02)
    return true
  }

  finish() { for (const l of this.lfos) l.stop(this.end) }
}

// ---- small building blocks -------------------------------------------------------------------
const grains = (n, from, to, bias = 1) => Array.from({ length: n }, () => from + (to - from) * Math.pow(Math.random(), bias))

function chime(s, at, f, gain, decay = 0.5) {
  s.tone({ f, at, dur: decay, gain })
  s.tone({ f: f * 2.76, at, dur: decay * 0.45, gain: gain * 0.3 })
  s.tone({ f: f * 5.4, at, dur: decay * 0.2, gain: gain * 0.12 })
}

function tinkles(s, n, from, to, gain = 0.1) {
  for (let i = 0; i < n; i++) {
    s.tone({ type: Math.random() < 0.5 ? 'sine' : 'triangle', f: rand(2600, 7600), at: from + (to - from) * Math.pow(Math.random(), 1.6), dur: rand(0.04, 0.13), gain: gain * rand(0.4, 1) })
  }
}

// cartoon spring: gliding sine with a fast, fading vibrato
function boing(s, at, f1, f2, dur, gain) {
  const ctx = s.ctx, t = s.t + at
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain()
  o.frequency.setValueAtTime(f1 * s.p, t)
  o.frequency.exponentialRampToValueAtTime(f2 * s.p, t + dur)
  lfo.frequency.value = 13
  lg.gain.setValueAtTime(f1 * s.p * 0.14, t)
  lg.gain.exponentialRampToValueAtTime(1, t + dur)
  lfo.connect(lg); lg.connect(o.frequency)
  o.connect(g); g.connect(s.out)
  const end = s.env(g.gain, t, dur, gain, 0.005, dur * 0.3)
  o.start(t); lfo.start(t); o.stop(end); lfo.stop(end)
  s.done(end)
}

// one recorded footstep from the Kenney "walking" take (sliced at init)
function stepSample(s, gain, lp) {
  const list = s.eng.steps
  if (!list || !list.length) return false
  const st = list[Math.floor(Math.random() * list.length)]
  return s.buf('walking', { offset: st.start, dur: st.dur, gain: gain * st.gain, rate: rand(0.94, 1.06), type: lp ? 'lowpass' : undefined, f: lp })
}

// ---- recipes -----------------------------------------------------------------------------------
export const RECIPES = {
  jump(s) {
    if (!s.buf('jump', { gain: 0.8 })) s.tone({ type: 'square', f: 240, f2: 560, dur: 0.16, gain: 0.16, filter: { type: 'lowpass', f: 2500 } })
    s.noise({ color: 'pink', dur: 0.12, a: 0.03, gain: 0.08, type: 'bandpass', fs: [[600, 0], [1600, 0.1]], q: 1 })
  },

  land(s) {
    s.buf('land', { gain: 3.2 })
    s.tone({ f: 120, f2: 55, dur: 0.12, gain: 0.5 })
    s.noise({ color: 'pink', dur: 0.08, gain: 0.22, type: 'bandpass', f: 900, q: 0.8 })
  },

  fall(s) {
    if (!s.buf('fall', { gain: 0.9 })) s.tone({ f: 90, f2: 45, dur: 0.25, gain: 0.8 })
    s.noise({ color: 'brown', dur: 0.25, gain: 0.45, type: 'lowpass', f: 400 })
    s.noise({ color: 'pink', at: 0.01, dur: 0.12, gain: 0.2, type: 'bandpass', f: 1200, q: 0.7 })
  },

  // car crash: recorded thud + synthesized crunch, debris and a metallic ring
  impact(s) {
    const hard = Math.min(1, s.o.vol ?? 1)
    s.buf('impact', { gain: 0.8 })
    s.tone({ f: 85, f2: 38, dur: 0.35, gain: 0.7 })
    s.noise({ color: 'brown', dur: 0.26, gain: 0.6, type: 'lowpass', fs: [[900, 0], [200, 0.25]] })
    s.pulses({ times: grains(8 + Math.round(8 * hard), 0, 0.22, 1.6), dur: 0.035, gain: 0.45, type: 'bandpass', f: 2200, q: 1.4 })
    s.pulses({ times: grains(6, 0.01, 0.16), dur: 0.02, gain: 0.3, type: 'highpass', f: 3500 })
    s.tone({ type: 'triangle', f: 523, dur: 0.45, gain: 0.05 })
    s.tone({ f: 1231, dur: 0.3, gain: 0.035 })
    s.tone({ f: 2011, dur: 0.2, gain: 0.025 })
    if (hard > 0.7) tinkles(s, 5, 0.03, 0.3, 0.06)
  },

  coin(s) {
    if (!s.buf('coin', { gain: 1.4 })) {
      s.tone({ type: 'square', f: 988, dur: 0.07, hold: 0.05, gain: 0.1 })
      s.tone({ type: 'square', f: 1319, at: 0.07, dur: 0.35, hold: 0.08, gain: 0.1, filter: { type: 'lowpass', f: 5000 } })
    }
    s.tone({ f: 2637, at: 0.02, dur: 0.18, gain: 0.03 })
  },

  coins_many(s) {
    for (let i = 0; i < 10; i++) {
      const at = i ? rand(0.03, 0.8) * Math.sqrt(i / 10) : 0
      const g = rand(0.55, 1) * (1 - i / 16)
      if (!s.buf('coin', { at, rate: rand(0.85, 1.35), gain: 1.3 * g })) chime(s, at, rand(1800, 2600), 0.1 * g, 0.2)
    }
    s.pulses({ times: grains(8, 0.02, 0.8), dur: 0.03, gain: 0.12, type: 'bandpass', f: 6500, q: 2 })
  },

  break(s) {
    if (!s.buf('break', { gain: 0.85 })) s.noise({ dur: 0.3, gain: 0.5, type: 'bandpass', f: 900, q: 0.8 })
    s.pulses({ times: grains(6, 0, 0.12), dur: 0.02, gain: 0.2, type: 'highpass', f: 3000 })
    tinkles(s, 4, 0.02, 0.25, 0.05)
  },

  toggle(s) { if (!s.buf('toggle', { gain: 0.5 })) s.tone({ type: 'square', f: 1800, dur: 0.02, gain: 0.08 }) },

  click(s) {
    s.noise({ dur: 0.012, gain: 0.28, type: 'bandpass', f: 3500, q: 1.2 })
    s.tone({ f: 1900, f2: 1500, dur: 0.035, gain: 0.14 })
    s.buf('rotate', { gain: 0.22, rate: 1.4 })
  },

  hover(s) {
    s.tone({ f: 2600, f2: 2750, dur: 0.045, a: 0.004, gain: 0.11 })
    s.tone({ type: 'triangle', f: 1300, dur: 0.03, gain: 0.055 })
  },

  confirm(s) {
    s.noise({ dur: 0.01, gain: 0.14, type: 'bandpass', f: 3000, q: 1 })
    s.tone({ type: 'triangle', f: 659, dur: 0.13, gain: 0.24 })
    s.tone({ f: 1318, dur: 0.1, gain: 0.06 })
    s.tone({ type: 'triangle', f: 988, at: 0.075, dur: 0.28, gain: 0.26 })
    s.tone({ f: 1976, at: 0.075, dur: 0.2, gain: 0.06 })
  },

  back(s) {
    s.tone({ type: 'triangle', f: 784, dur: 0.1, gain: 0.2 })
    s.tone({ type: 'triangle', f: 523, at: 0.065, dur: 0.18, gain: 0.2, filter: { type: 'lowpass', f: 3000 } })
  },

  error(s) {
    for (const at of [0, 0.13]) {
      const f = at ? 165 : 196
      s.tone({ type: 'square', f, at, dur: 0.1, hold: 0.07, gain: 0.11, filter: { type: 'lowpass', f: 1400 } })
      s.tone({ type: 'sawtooth', f: f * 1.012, at, dur: 0.1, hold: 0.07, gain: 0.07, filter: { type: 'lowpass', f: 1400 } })
    }
  },

  // car door: latch click, body thunk, panel resonance, the catch
  door(s) {
    s.noise({ dur: 0.015, gain: 0.4, type: 'highpass', f: 2500 })
    s.tone({ f: 130, f2: 55, at: 0.008, dur: 0.17, gain: 0.75 })
    s.noise({ color: 'brown', at: 0.005, dur: 0.14, gain: 0.55, type: 'lowpass', f: 600 })
    s.noise({ color: 'pink', at: 0.005, dur: 0.12, gain: 0.4, type: 'bandpass', f: 320, q: 4 })
    s.buf('placement-a', { at: 0.004, gain: 0.45, rate: 0.8 })
    s.tone({ type: 'triangle', f: 780, at: 0.01, dur: 0.08, gain: 0.035 })
    s.noise({ at: 0.035, dur: 0.012, gain: 0.2, type: 'bandpass', f: 4000, q: 2 })
  },

  // swing: band-passed air sweeping up then down
  whoosh(s) {
    s.noise({ color: 'pink', dur: 0.24, a: 0.09, gain: 0.75, type: 'bandpass', fs: [[350, 0], [1800, 0.11], [650, 0.24]], q: 1.3 })
    s.noise({ dur: 0.2, a: 0.08, gain: 0.1, type: 'highpass', f: 3500 })
  },

  punch(s) {
    s.noise({ dur: 0.012, gain: 0.7, type: 'highpass', f: 1800 })
    s.noise({ color: 'pink', dur: 0.06, gain: 0.55, type: 'bandpass', f: 1000, q: 1.5 })
    s.tone({ f: 170, f2: 60, dur: 0.14, gain: 0.8 })
    s.noise({ color: 'brown', dur: 0.1, gain: 0.45, type: 'lowpass', f: 500 })
  },

  punch_heavy(s) {
    const d = s.drive(2.2, s.gain(0.8))
    s.noise({ dur: 0.02, gain: 0.8, type: 'highpass', f: 2200, dest: d })
    s.noise({ color: 'pink', dur: 0.1, gain: 0.55, type: 'bandpass', f: 700, q: 1.2, dest: d })
    s.tone({ f: 130, f2: 40, dur: 0.26, gain: 0.7, dest: d })
    s.tone({ f: 62, f2: 34, dur: 0.32, gain: 0.45 })
    s.noise({ color: 'brown', dur: 0.2, gain: 0.5, type: 'lowpass', f: 420 })
  },

  kick(s) {
    s.noise({ dur: 0.03, gain: 0.22, type: 'bandpass', f: 2500, q: 1 })
    s.tone({ f: 140, f2: 50, at: 0.01, dur: 0.16, gain: 0.8 })
    s.noise({ color: 'pink', at: 0.01, dur: 0.08, gain: 0.45, type: 'bandpass', f: 600, q: 1 })
    s.noise({ at: 0.01, dur: 0.01, gain: 0.45, type: 'highpass', f: 1500 })
    s.buf('land', { at: 0.01, gain: 2.2, rate: 0.9 })
  },

  hit_body(s) {
    s.noise({ color: 'brown', dur: 0.13, gain: 0.7, type: 'lowpass', f: 350 })
    s.tone({ f: 95, f2: 50, dur: 0.13, gain: 0.7 })
    s.noise({ color: 'pink', dur: 0.045, gain: 0.28, type: 'bandpass', f: 750, q: 1 })
    s.buf('fall', { gain: 0.4, rate: 1.25 })
  },

  // comic knock-out: wood-block bonk, spring boing, birdies
  ko(s) {
    s.noise({ dur: 0.01, gain: 0.3, type: 'bandpass', f: 2000, q: 2 })
    s.tone({ type: 'triangle', f: 700, f2: 240, dur: 0.18, gain: 0.32 })
    s.tone({ f: 1400, f2: 480, dur: 0.08, gain: 0.12 })
    s.tone({ f: 90, f2: 45, dur: 0.2, gain: 0.45 })
    boing(s, 0.07, 330, 210, 0.7, 0.17)
    for (let i = 0; i < 3; i++) s.tone({ f: 2400, f2: 3100, at: 0.4 + i * 0.11, dur: 0.06, gain: 0.05 })
  },

  // document pickup: paper crinkle + two-note chime
  pickup(s) {
    s.pulses({ times: grains(7, 0, 0.18), dur: 0.03, gain: 0.28, type: 'bandpass', f: 4200, q: 0.8 })
    s.noise({ color: 'pink', dur: 0.16, a: 0.03, gain: 0.1, type: 'highpass', f: 2000 })
    chime(s, 0.06, 1568, 0.2)
    chime(s, 0.14, 2093, 0.18)
  },

  // cash register: lever click, drawer thunk, bell "ching" with shimmer, coins
  cash(s) {
    s.noise({ dur: 0.02, gain: 0.35, type: 'highpass', f: 3000 })
    s.tone({ type: 'square', f: 1800, dur: 0.025, gain: 0.04, filter: { type: 'lowpass', f: 5000 } })
    s.tone({ f: 180, f2: 90, at: 0.04, dur: 0.08, gain: 0.22 })
    s.noise({ color: 'brown', at: 0.04, dur: 0.06, gain: 0.25, type: 'lowpass', f: 400 })
    const ching = [[2093, 0.1, 0.9], [2101, 0.07, 0.8], [2637, 0.08, 0.75], [3136, 0.06, 0.6], [4186, 0.04, 0.45]]
    for (const [f, g, d] of ching) s.tone({ f, at: 0.07, dur: d, gain: g })
    s.pulses({ times: grains(5, 0.09, 0.35), dur: 0.03, gain: 0.1, type: 'bandpass', f: 7000, q: 3 })
  },

  // the musical ones share the stinger scores, a little quieter than on the music bus
  levelup(s) { s.done(STINGERS.levelup(s.k, s.gain(0.45), s.t, s.tr)) },
  mission_pass(s) { s.done(STINGERS.mission_pass(s.k, s.gain(0.45), s.t, s.tr)) },
  mission_fail(s) { s.done(STINGERS.mission_fail(s.k, s.gain(0.45), s.t, s.tr)) },

  // race ring: two bright bell strikes a fifth apart
  checkpoint(s) {
    s.tone({ type: 'triangle', f: 880, f2: 1760, dur: 0.06, gain: 0.07 })
    chime(s, 0, 1760, 0.26, 0.6)
    chime(s, 0.085, 2637, 0.22, 0.55)
  },

  spray(s) {
    s.noise({ dur: 0.008, gain: 0.28, type: 'bandpass', f: 3000, q: 2 })
    s.noise({ at: 0.05, dur: 0.008, gain: 0.24, type: 'bandpass', f: 3200, q: 2 })
    s.noise({ at: 0.06, dur: 0.5, a: 0.02, hold: 0.36, gain: 0.3, type: 'bandpass', f: 5500, q: 0.7, hp: 2500 })
  },

  // leaf blower: two-stroke motor revving up and down, putter AM, rush of air, impeller whine
  blower(s) {
    const ctx = s.ctx, t = s.t, dur = 1.25
    const motor = ctx.createOscillator(), lp = s.node('lowpass', 900, 3, null), putter = s.gain(0.7, s.out)
    const lfo = ctx.createOscillator(), lg = s.gain(0.3, putter.gain), g = ctx.createGain()
    motor.type = 'sawtooth'
    s.points(motor.frequency, t, [[85, 0], [150, 0.25], [150, 0.95], [95, dur]], s.p)
    lfo.type = 'square'
    lfo.frequency.value = 31
    lfo.connect(lg)
    motor.connect(lp); lp.connect(g); g.connect(putter)
    const end = s.env(g.gain, t, dur, 0.22, 0.06, 0.9)
    motor.start(t); lfo.start(t); motor.stop(end); lfo.stop(end)
    s.noise({ color: 'pink', dur, a: 0.25, hold: 0.65, gain: 0.4, type: 'bandpass', fs: [[800, 0], [1800, 0.25], [1700, 0.95], [900, dur]], q: 0.8 })
    s.tone({ fpts: [[2400, 0], [3600, 0.25], [3500, 0.95], [2600, dur]], dur, a: 0.2, hold: 0.7, gain: 0.02 })
    s.done(end)
  },

  // bottle smash: crack, shatter wash, thick-glass knock, shards and tinkles
  glass(s) {
    s.noise({ dur: 0.015, gain: 0.75, type: 'highpass', f: 2000 })
    s.noise({ dur: 0.32, gain: 0.35, type: 'bandpass', f: 4500, q: 0.8 })
    s.tone({ f: 320, f2: 150, dur: 0.06, gain: 0.28 })
    s.pulses({ times: grains(10, 0.005, 0.25, 1.5), dur: 0.025, gain: 0.32, type: 'highpass', f: 5000 })
    tinkles(s, 12, 0.01, 0.45, 0.1)
  },

  // watermelon: rind crack, thud, wet burst, squelch, droplets
  splat(s) {
    s.noise({ dur: 0.01, gain: 0.32, type: 'bandpass', f: 2500, q: 1 })
    s.tone({ f: 110, f2: 45, dur: 0.15, gain: 0.7 })
    s.noise({ color: 'pink', dur: 0.24, gain: 0.7, type: 'lowpass', fs: [[3000, 0], [250, 0.2]], q: 2 })
    s.noise({ at: 0.02, dur: 0.13, gain: 0.45, type: 'bandpass', fs: [[900, 0], [380, 0.13]], q: 6 })
    for (let i = 0; i < 5; i++) { const f = rand(700, 1500); s.tone({ f, f2: f * 0.6, at: rand(0.05, 0.35), dur: rand(0.03, 0.05), gain: rand(0.05, 0.11) }) }
  },

  // pothole: suspension thump, chassis rattle, spring
  bump(s) {
    s.tone({ f: 65, f2: 32, dur: 0.22, gain: 0.8 })
    s.noise({ color: 'brown', dur: 0.18, gain: 0.6, type: 'lowpass', f: 250 })
    s.pulses({ times: grains(3, 0.02, 0.1), dur: 0.025, gain: 0.22, type: 'bandpass', f: 1200, q: 3 })
    s.tone({ type: 'triangle', f: 180, f2: 120, at: 0.03, dur: 0.12, gain: 0.07 })
    s.buf('placement-a', { gain: 0.45, rate: 0.7 })
  },

  camera_shutter(s) {
    s.noise({ dur: 0.008, gain: 1, type: 'highpass', f: 3000 })
    s.noise({ color: 'pink', dur: 0.022, gain: 0.75, type: 'bandpass', f: 1400, q: 2 })
    s.noise({ at: 0.055, dur: 0.006, gain: 0.9, type: 'highpass', f: 3500 })
    s.noise({ color: 'pink', at: 0.055, dur: 0.028, gain: 0.85, type: 'bandpass', f: 1100, q: 2 })
    s.tone({ type: 'square', f: 90, at: 0.06, dur: 0.05, gain: 0.06, filter: { type: 'lowpass', f: 800 } })
  },

  // old-phone monophonic ringtone (an original tune), 25% pulse through a tiny speaker
  phone_ring(s) {
    const spk = s.node('highpass', 500, 0.7, s.node('lowpass', 4200, 1))
    const notes = [88, 85, 81, 85, 83, 80, 76, 80, 81, 85, 88], lens = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3]
    let at = 0
    notes.forEach((m, i) => {
      const d = lens[i] * 0.13
      s.tone({ wave: s.k.waves.pulse, f: mtof(m), at, dur: d * 0.88, a: 0.004, hold: d * 0.7, gain: 0.13, dest: spk })
      at += d
    })
  },

  // stadium roar through vowel formants, individual "woo!"s, a whistle, claps
  crowd_cheer(s) {
    const dur = 2.2, am = s.am(3.3, 0.25)
    for (const [f, q, g] of [[700, 3, 0.65], [1200, 4, 0.42], [2600, 5, 0.2]]) s.noise({ color: 'pink', dur, a: 0.25, hold: 0.9, gain: g, type: 'bandpass', f, q, dest: am })
    for (let i = 0; i < 3; i++) {
      const f = rand(280, 420)
      s.tone({
        type: 'sawtooth', fpts: [[f, 0], [f * 1.55, 0.4], [f * 1.35, 1]], at: rand(0, 0.35), dur: rand(0.8, 1.2),
        a: 0.1, hold: 0.3, gain: 0.05, vib: [6, 25], filter: { type: 'bandpass', f: 900, q: 1.5 },
      })
    }
    s.tone({ fpts: [[2200, 0], [2900, 0.15], [2500, 0.5]], at: 0.5, dur: 0.6, hold: 0.35, gain: 0.045 })
    s.pulses({ times: grains(22, 0.05, 1.9, 1.3), dur: 0.018, gain: 0.24, type: 'bandpass', f: 1500, q: 1.2 })
  },

  crowd_boo(s) {
    const dur = 1.9, am = s.am(2.7, 0.2)
    for (const [f, q, g] of [[320, 3, 0.75], [800, 4, 0.32]]) s.noise({ color: 'pink', dur, a: 0.3, hold: 0.8, gain: g, type: 'bandpass', f, q, dest: am })
    const lp = s.node('lowpass', 650, 0.8)
    for (let i = 0; i < 4; i++) {
      const f = rand(105, 170)
      s.tone({ type: 'sawtooth', fpts: [[f, 0], [f * 0.9, 1.6]], at: rand(0, 0.25), dur: 1.6, a: 0.25, hold: 0.9, gain: 0.07, vib: [5, 20], dest: lp })
    }
  },

  // footstep: recorded step (if sliced) + a heel tick so it reads on small speakers
  footstep(s) {
    const v = rand(0.92, 1.08)
    if (s.o.surface === 'grass') {
      s.noise({ dur: 0.09, a: 0.01, gain: 0.26, type: 'bandpass', f: 3500 * v, q: 0.6 })
      s.pulses({ times: grains(3, 0, 0.06), dur: 0.015, gain: 0.1, type: 'highpass', f: 4000 })
      if (!stepSample(s, 0.4, 900)) s.tone({ f: 80 * v, f2: 50, dur: 0.05, gain: 0.2 })
    } else {
      s.noise({ dur: 0.03, gain: 0.26, type: 'bandpass', f: 1800 * v, q: 1.2 })
      s.noise({ color: 'pink', at: 0.01, dur: 0.05, gain: 0.07, type: 'highpass', f: 1200 })
      if (!stepSample(s, 0.8)) s.tone({ f: 100 * v, f2: 60, dur: 0.05, gain: 0.28 })
    }
  },

  // police "whoop": sawtooth swept up and back through a horn-speaker band
  siren_blip(s) {
    const bp = s.node('bandpass', 1300, 0.7, s.drive(1.8))
    s.tone({ type: 'sawtooth', fpts: [[560, 0], [1450, 0.26], [780, 0.44]], dur: 0.46, a: 0.012, hold: 0.36, gain: 0.13, dest: bp })
  },

  // ---- story-mission extras ----

  // distant two-tone diesel horn (Soviet typhon style): high chord then low chord, reverberant
  train_horn(s) {
    s.wet(0.9)
    const body = s.drive(1.6, s.node('lowpass', 2600, 0.7))
    const tones = [[[311, 392], 0, 0.8], [[262, 330], 0.72, 1.1]]
    for (const [fs, at, dur] of tones) {
      for (const f of fs) s.tone({ type: 'sawtooth', fpts: [[f * 0.97, 0], [f, 0.08]], at, dur, a: 0.06, hold: dur - 0.2, gain: 0.08, dest: body })
    }
    s.noise({ color: 'pink', dur: 1.8, a: 0.1, hold: 1.4, gain: 0.04, type: 'bandpass', f: 800, q: 0.8 })
  },

  // tired Lada starter: solenoid click, three labouring "rrr" cycles, it never catches
  engine_crank(s) {
    const ctx = s.ctx, t = s.t, end = t + 0.9
    s.noise({ dur: 0.012, gain: 0.3, type: 'highpass', f: 2000 })
    s.tone({ f: 150, f2: 80, dur: 0.05, gain: 0.25 })
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), g = ctx.createGain()
    const rr = s.gain(0.55), lg = s.gain(0.45, rr.gain), lp = s.node('lowpass', 1100, 1.5, g)
    o.type = 'sawtooth'
    lfo.type = 'square'
    lfo.frequency.value = 23 // starter gear teeth rattle
    lfo.connect(lg)
    o.connect(lp); g.connect(rr)
    const cycles = [[0.05, 105], [0.33, 96], [0.61, 84]] // each compression stroke slows it more
    o.frequency.setValueAtTime(cycles[0][1] * 0.8 * s.p, t)
    g.gain.setValueAtTime(0, t)
    for (const [at, f] of cycles) {
      const t0 = t + at
      o.frequency.setValueAtTime(f * 0.8 * s.p, t0)
      o.frequency.linearRampToValueAtTime(f * s.p, t0 + 0.12)
      g.gain.linearRampToValueAtTime(0.05, t0)
      g.gain.linearRampToValueAtTime(0.3, t0 + 0.06)
      g.gain.linearRampToValueAtTime(0.24, t0 + 0.2)
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.27)
    }
    g.gain.linearRampToValueAtTime(0, end)
    o.start(t); lfo.start(t); o.stop(end + 0.02); lfo.stop(end + 0.02)
    const times = []
    for (const [at] of cycles) for (let i = 0; i < 6; i++) times.push(at + 0.02 + i / 23)
    s.pulses({ times, dur: 0.02, gain: 0.16, type: 'bandpass', f: 1600, q: 1.2 })
    s.done(end + 0.02)
  },

  // exhaust backfire: sharp saturated bang, two after-pops, crackle
  backfire(s) {
    s.wet(0.4)
    const d = s.drive(3, s.gain(0.6))
    s.noise({ dur: 0.09, gain: 0.9, type: 'lowpass', fs: [[2500, 0], [300, 0.08]], dest: d })
    s.tone({ f: 95, f2: 38, dur: 0.16, gain: 0.9, dest: d })
    for (const [at, g] of [[0.13, 0.45], [0.24, 0.3]]) {
      s.noise({ at, dur: 0.04, gain: g, type: 'lowpass', f: 1400, dest: d })
      s.tone({ f: 120, f2: 60, at, dur: 0.06, gain: g, dest: d })
    }
    s.pulses({ times: grains(9, 0.05, 0.45, 1.3), dur: 0.012, gain: 0.28, type: 'bandpass', f: 3000, q: 1 })
  },

  // police "whoop": a longer, fuller rise-and-fall than siren_blip
  siren_whoop(s) {
    const bp = s.node('bandpass', 1200, 0.6, s.drive(2))
    const pts = [[480, 0], [1500, 0.45], [1350, 0.55], [620, 0.8]]
    s.tone({ type: 'sawtooth', fpts: pts, dur: 0.82, a: 0.02, hold: 0.62, gain: 0.085, dest: bp })
    s.tone({ type: 'square', fpts: pts.map(([f, x]) => [f / 2, x]), dur: 0.82, a: 0.02, hold: 0.62, gain: 0.035, dest: bp })
  },

  // ceremonial scissors: blades scrape shut, the snip, a metallic ring, the ribbon flutters
  snip(s) {
    s.noise({ dur: 0.07, a: 0.05, gain: 0.5, type: 'bandpass', fs: [[4200, 0], [6800, 0.07]], q: 3 })
    s.noise({ at: 0.07, dur: 0.01, gain: 1, type: 'highpass', f: 4000 })
    s.tone({ f: 3150, at: 0.07, dur: 0.18, gain: 0.14 })
    s.tone({ f: 4730, at: 0.07, dur: 0.12, gain: 0.1 })
    s.tone({ f: 1890, at: 0.07, dur: 0.1, gain: 0.08 })
    s.noise({ color: 'pink', at: 0.1, dur: 0.3, a: 0.08, gain: 0.16, type: 'bandpass', f: 1400, q: 0.8 })
  },

  // applause: three overlapping clap layers (different hand timbres) over a warm wash
  applause(s) {
    const dur = 2.5
    for (const [f, q, n] of [[1100, 1.1, 45], [2000, 1.3, 45], [3300, 1.5, 40]]) {
      s.pulses({ times: grains(n, 0.02, dur - 0.3, 1.25), dur: 0.02, gain: 0.45, type: 'bandpass', f, q })
    }
    s.noise({ color: 'pink', dur, a: 0.3, hold: 1.4, gain: 0.22, type: 'bandpass', f: 2200, q: 0.6 })
    const am = s.am(2.6, 0.2)
    s.noise({ color: 'pink', dur: 2, a: 0.35, hold: 0.8, gain: 0.34, type: 'bandpass', f: 800, q: 2, dest: am })
    s.tone({ fpts: [[2300, 0], [2950, 0.15], [2600, 0.45]], at: 0.6, dur: 0.5, hold: 0.25, gain: 0.05 })
  },

  camera(s) { RECIPES.camera_shutter(s) },

  // shovel: gritty scrape over gravel/asphalt, then the blade thuds down and rings
  shovel(s) {
    s.noise({ dur: 0.5, a: 0.15, hold: 0.2, gain: 0.28, type: 'bandpass', fs: [[1400, 0], [2200, 0.45]], q: 0.9 })
    s.pulses({ times: grains(28, 0.02, 0.5), dur: 0.012, gain: 0.24, type: 'highpass', f: 2800 })
    s.tone({ f: 105, f2: 50, at: 0.55, dur: 0.16, gain: 0.75 })
    s.noise({ color: 'brown', at: 0.55, dur: 0.14, gain: 0.5, type: 'lowpass', f: 450 })
    s.tone({ type: 'triangle', f: 520, at: 0.55, dur: 0.3, gain: 0.06 })
    s.tone({ f: 1310, at: 0.55, dur: 0.2, gain: 0.04 })
  },

  // a bundle of documents: the stack flops down, sheets slide and rustle apart
  paper(s) {
    s.tone({ f: 160, f2: 90, dur: 0.07, gain: 0.45 })
    s.noise({ color: 'brown', dur: 0.08, gain: 0.45, type: 'lowpass', f: 700 })
    s.noise({ color: 'pink', at: 0.03, dur: 0.6, a: 0.12, hold: 0.2, gain: 0.24, type: 'bandpass', f: 2500, q: 0.7 })
    s.pulses({ times: grains(26, 0.02, 0.75, 1.2), dur: 0.035, gain: 0.45, type: 'bandpass', f: 4200, q: 0.9 })
    s.pulses({ times: grains(12, 0.05, 0.6), dur: 0.05, gain: 0.24, type: 'bandpass', f: 1800, q: 1 })
  },

  // heavy car-on-car crunch: bigger than impact - tearing metal, a bending groan, ringing panels
  metal_hit(s) {
    s.wet(0.35)
    const d = s.drive(2.5, s.gain(0.7))
    s.buf('impact', { gain: 1, rate: 0.8 })
    s.buf('impact', { at: 0.06, gain: 0.6, rate: 0.62 })
    s.tone({ f: 70, f2: 30, dur: 0.6, gain: 0.9 })
    s.noise({ color: 'brown', dur: 0.5, gain: 0.7, type: 'lowpass', fs: [[1200, 0], [200, 0.45]], dest: d })
    s.pulses({ times: grains(26, 0, 0.45, 1.4), dur: 0.045, gain: 0.55, type: 'bandpass', f: 1700, q: 1.3, dest: d })
    s.pulses({ times: grains(12, 0.01, 0.3), dur: 0.025, gain: 0.28, type: 'highpass', f: 3200 })
    s.tone({ type: 'sawtooth', fpts: [[190, 0], [125, 0.45]], at: 0.05, dur: 0.5, a: 0.04, hold: 0.25, gain: 0.07, filter: { type: 'bandpass', f: 900, q: 5 } })
    for (const [f, g, dur] of [[420, 0.06, 0.8], [910, 0.045, 0.6], [1650, 0.03, 0.45]]) s.tone({ type: 'triangle', f, dur, gain: g })
    tinkles(s, 6, 0.03, 0.35, 0.07)
  },

  // police whistle: two short blasts with the pea's trill
  whistle(s) {
    policeWhistle(s.k, s.out, s.t, 0.26, s.p, 0.09)
    s.done(policeWhistle(s.k, s.out, s.t + 0.38, 0.3, s.p, 0.09))
  },

  // race countdown "pip" and the higher, longer start tone
  beep(s) {
    s.tone({ type: 'square', f: 880, dur: 0.14, a: 0.003, hold: 0.1, gain: 0.07, filter: { type: 'lowpass', f: 3500 } })
    s.tone({ f: 880, dur: 0.14, a: 0.003, hold: 0.1, gain: 0.12 })
  },

  go(s) {
    s.tone({ type: 'square', f: 1760, dur: 0.6, a: 0.003, hold: 0.45, gain: 0.04, filter: { type: 'lowpass', f: 5000 } })
    s.tone({ f: 1760, dur: 0.6, a: 0.003, hold: 0.45, gain: 0.07 })
    s.tone({ f: 880, dur: 0.6, a: 0.003, hold: 0.45, gain: 0.035 })
  },

  notify(s) {
    s.tone({ f: 1400, f2: 520, dur: 0.05, gain: 0.22 })
    s.tone({ type: 'triangle', f: 1568, at: 0.025, dur: 0.26, gain: 0.14 })
    s.tone({ f: 3136, at: 0.025, dur: 0.12, gain: 0.035 })
  },

  typewriter(s) {
    const v = rand(0.9, 1.1)
    s.noise({ dur: 0.008, gain: 1.1, type: 'bandpass', f: 3000 * v, q: 1.5 })
    s.tone({ f: 2200 * v, dur: 0.016, gain: 0.14 })
  },
}
