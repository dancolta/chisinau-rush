// Synth instruments shared by the music tracks, stingers and musical sound effects.
// Signature: (k, dest, t, midi, dur, vel, o) -> time the last node stops.
// `k` is the engine kit: { ctx, noise, waves, vib(), drive(), noiseSrc() }.
import { mtof } from './dsp.js'

function osc(k, wave, f, t) {
  const o = k.ctx.createOscillator()
  if (typeof wave === 'string') o.type = wave
  else o.setPeriodicWave(wave)
  o.frequency.setValueAtTime(f, t)
  return o
}

function vca(k, dest) {
  const g = k.ctx.createGain()
  g.gain.value = 0
  g.connect(dest)
  return g
}

function filter(k, type, f, q, dest) {
  const n = k.ctx.createBiquadFilter()
  n.type = type
  n.frequency.value = f
  n.Q.value = q
  if (dest) n.connect(dest)
  return n
}

// Linear attack, decay to sustain (time constant d), release (time constant r) at t + dur.
// Returns the stop time (5 time constants into the release: -43 dB).
function adsr(p, t, dur, peak, a, d, s, r) {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + a)
  if (s < 1) p.setTargetAtTime(peak * s, t + a, d)
  const off = t + Math.max(dur, a + 0.005)
  p.setTargetAtTime(0, off, r)
  return off + r * 5
}

// Percussive: linear attack then exponential decay (time constant tau).
function perc(p, t, peak, a, tau) {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + a)
  p.setTargetAtTime(0, t + a, tau)
  return t + a + tau * 5
}

function vibrato(k, o, t, dur, rate, depth, delay) {
  if (dur > 0.25) o.detune.setValueCurveAtTime(k.vib(dur, rate, depth, delay), t, dur)
}

// ---- melodic -------------------------------------------------------------------------------

// Musette accordion: two reed oscillators tuned +-10 cents apart beat at ~6 Hz.
export function accordion(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const a = osc(k, k.waves.reed, f, t), b = osc(k, k.waves.reed, f, t)
  a.detune.setValueAtTime(-10, t)
  b.detune.setValueAtTime(10, t)
  a.connect(g); b.connect(g)
  const end = adsr(g.gain, t, dur, 0.34 * vel, 0.022, 0.12, 0.82, 0.03)
  a.start(t); b.start(t); a.stop(end); b.stop(end)
  return end
}

// Single-reed accordion voice for accompaniment (chords and bass buttons).
export function reed(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const a = osc(k, k.waves.reed, f, t)
  a.connect(g)
  const end = adsr(g.gain, t, dur, 0.4 * vel, 0.015, 0.08, 0.7, 0.03)
  a.start(t); a.stop(end)
  return end
}

// Clarinet: odd-harmonic table, delayed vibrato.
export function clarinet(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const a = osc(k, k.waves.clar, f, t)
  vibrato(k, a, t, dur, 5.4, 16, 0.12)
  a.connect(g)
  const end = adsr(g.gain, t, dur, 0.5 * vel, 0.025, 0.1, 0.85, 0.028)
  a.start(t); a.stop(end)
  return end
}

// Brass (trumpet / horn): sawtooth through a lowpass that "blooms" on the attack,
// with a small lip scoop into pitch. o.stab = short chord hit, o.bright scales the bloom.
export function brass(k, dest, t, midi, dur, vel = 1, o = {}) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', 400, o.q ?? 1.3, g)
  const a = osc(k, 'sawtooth', f * 0.982, t)
  a.frequency.exponentialRampToValueAtTime(f, t + 0.035)
  if (!o.stab) vibrato(k, a, t, dur, 5.2, 11, 0.22)
  a.connect(lp)
  const bright = o.bright ?? 1
  const lo = Math.min(180 + f * 1.1, 1800), hi = Math.min(700 + f * (2.5 + 4 * vel) * bright, 9000)
  const off = t + Math.max(dur, 0.06)
  lp.frequency.setValueAtTime(lo, t)
  lp.frequency.linearRampToValueAtTime(hi, t + 0.045)
  lp.frequency.setTargetAtTime(lo + (hi - lo) * 0.45, t + 0.05, 0.12)
  lp.frequency.setTargetAtTime(lo, off, 0.05)
  const end = adsr(g.gain, t, dur, 0.4 * vel, o.stab ? 0.01 : 0.02, 0.15, o.stab ? 0.6 : 0.8, 0.04)
  a.start(t); a.stop(end)
  return end
}

// Tuba / sousaphone "oom".
export function tuba(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', f * 7 + 150, 0.8, g)
  lp.frequency.setTargetAtTime(f * 3.2 + 110, t + 0.03, 0.08)
  const a = osc(k, k.waves.brass, f, t)
  a.connect(lp)
  const end = adsr(g.gain, t, dur, 0.62 * vel, 0.014, 0.1, 0.62, 0.04)
  a.start(t); a.stop(end)
  return end
}

// FM electric piano (Rhodes-like bark that mellows out).
export function keys(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const car = osc(k, 'sine', f, t), mod = osc(k, 'sine', f, t)
  const mg = k.ctx.createGain()
  mg.gain.setValueAtTime(f * (1.2 + 1.3 * vel), t)
  mg.gain.setTargetAtTime(f * 0.22, t, 0.14)
  mod.connect(mg); mg.connect(car.frequency)
  car.connect(g)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.003)
  g.gain.setTargetAtTime(0.14 * vel, t + 0.003, 0.35)
  const off = t + Math.max(dur, 0.05)
  g.gain.setTargetAtTime(0, off, 0.07)
  const end = off + 0.35
  car.start(t); mod.start(t); car.stop(end); mod.stop(end)
  return end
}

// Electric-piano comping on one oscillator: tine-like wave table, brightness barks on the attack.
export function ep(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', Math.min(f * 9 + 1800, 10000), 0.9, g)
  lp.frequency.setTargetAtTime(f * 2.5 + 400, t, 0.12)
  const a = osc(k, k.waves.ep, f, t)
  a.connect(lp)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.4 * vel, t + 0.003)
  g.gain.setTargetAtTime(0.16 * vel, t + 0.003, 0.28)
  const off = t + Math.max(dur, 0.05)
  g.gain.setTargetAtTime(0, off, 0.06)
  const end = off + 0.3
  a.start(t); a.stop(end)
  return end
}

// Filtered plucked synth (arpeggios). o.wave, o.decay.
export function pluck(k, dest, t, midi, dur, vel = 1, o = {}) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', Math.min(f * 7 + 1400, 9000), 2, g)
  lp.frequency.setTargetAtTime(f * 1.6 + 250, t, 0.1)
  const a = osc(k, o.wave || 'sawtooth', f, t)
  a.connect(lp)
  const tau = o.decay ?? 0.22
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.36 * vel, t + 0.003)
  g.gain.setTargetAtTime(0, t + 0.003, tau)
  const end = t + tau * 5
  a.start(t); a.stop(end)
  return end
}

// Țambal (cimbalom): bright hammered string with a felt-less "tick".
export function cimbalom(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', Math.min(f * 10 + 2500, 11000), 1.2, g)
  lp.frequency.setTargetAtTime(f * 2.2 + 500, t, 0.07)
  const a = osc(k, 'sawtooth', f, t)
  a.detune.setValueAtTime(4, t)
  a.connect(lp)
  const end = perc(g.gain, t, 0.36 * vel, 0.002, 0.17)
  const n = k.noiseSrc('white', t, 0.02)
  const hp = filter(k, 'bandpass', 3200, 1.5)
  const ng = vca(k, dest)
  perc(ng.gain, t, 0.12 * vel, 0.001, 0.004)
  n.connect(hp); hp.connect(ng)
  a.start(t); a.stop(end)
  return end
}

// Nai (pan flute): soft sine-ish tone plus breath noise that "chiffs" on the attack.
export function nai(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const a = osc(k, k.waves.flute, f, t)
  vibrato(k, a, t, dur, 5.6, 18, 0.1)
  a.connect(g)
  const end = adsr(g.gain, t, dur, 0.5 * vel, 0.03, 0.15, 0.78, 0.05)
  const n = k.noiseSrc('pink', t, end - t)
  const bp = filter(k, 'bandpass', f * 2, 1.4)
  const ng = vca(k, dest)
  ng.gain.setValueAtTime(0, t)
  ng.gain.linearRampToValueAtTime(0.5 * vel, t + 0.015)
  ng.gain.setTargetAtTime(0.1 * vel, t + 0.015, 0.05)
  ng.gain.setTargetAtTime(0, t + Math.max(dur, 0.03), 0.03)
  n.connect(bp); bp.connect(ng)
  a.start(t); a.stop(end)
  return end
}

// Glockenspiel-ish bell: fundamental + fast-decaying inharmonic partial.
export function bell(k, dest, t, midi, dur, vel = 1, o = {}) {
  const f = mtof(midi), g = vca(k, dest), g2 = vca(k, dest)
  const a = osc(k, 'sine', f, t), b = osc(k, 'sine', f * 2.76, t)
  a.connect(g); b.connect(g2)
  const tau = o.decay ?? 0.3
  const end = perc(g.gain, t, 0.3 * vel, 0.002, tau)
  perc(g2.gain, t, 0.09 * vel, 0.001, tau * 0.3)
  a.start(t); b.start(t); a.stop(end); b.stop(end)
  return end
}

// Soft night lead: triangle with slow attack and vibrato.
export function softlead(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const a = osc(k, 'triangle', f, t)
  vibrato(k, a, t, dur, 4.8, 14, 0.25)
  a.connect(g)
  const end = adsr(g.gain, t, dur, 0.5 * vel, 0.09, 0.3, 0.85, 0.18)
  a.start(t); a.stop(end)
  return end
}

// Finger bass: sawtooth with a closing filter.
export function bass(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', 1100, 1.6, g)
  lp.frequency.setTargetAtTime(f * 2.5 + 140, t, 0.07)
  const a = osc(k, 'sawtooth', f, t)
  a.connect(lp)
  const end = adsr(g.gain, t, dur, 0.55 * vel, 0.006, 0.18, 0.55, 0.045)
  a.start(t); a.stop(end)
  return end
}

// Round sustained bass for slow tracks.
export function subbass(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', f * 4 + 120, 0.7, g)
  const a = osc(k, 'triangle', f, t)
  a.connect(lp)
  const end = adsr(g.gain, t, dur, 0.7 * vel, 0.03, 0.4, 0.8, 0.15)
  a.start(t); a.stop(end)
  return end
}

// Staccato low sawtooth ostinato (tension).
export function ostinato(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', 900, 2.5, g)
  lp.frequency.setTargetAtTime(220, t, 0.05)
  const a = osc(k, 'sawtooth', f, t)
  a.connect(lp)
  const end = adsr(g.gain, t, dur, 0.6 * vel, 0.004, 0.06, 0.4, 0.03)
  a.start(t); a.stop(end)
  return end
}

// Slow string swell (one sawtooth, darkened).
export function strings(k, dest, t, midi, dur, vel = 1) {
  const f = mtof(midi), g = vca(k, dest)
  const lp = filter(k, 'lowpass', 1600, 0.5, g)
  const a = osc(k, 'sawtooth', f, t)
  vibrato(k, a, t, dur, 4.5, 9, 0.6)
  a.connect(lp)
  const end = adsr(g.gain, t, dur, 0.4 * vel, Math.min(1.6, dur * 0.4), 1, 1, 0.5)
  a.start(t); a.stop(end)
  return end
}

// Police / referee pea whistle: ~2.9 kHz with the pea's 27 Hz trill. Returns end time.
export function policeWhistle(k, dest, t, dur = 0.5, pitch = 1, level = 0.13) {
  const ctx = k.ctx
  const o = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain()
  o.frequency.value = 2900 * pitch
  mod.frequency.value = 27
  mg.gain.value = 170 * pitch
  mod.connect(mg); mg.connect(o.frequency)
  o.connect(g); g.connect(dest)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 0.02)
  g.gain.setValueAtTime(level, t + dur - 0.07)
  g.gain.linearRampToValueAtTime(0, t + dur)
  o.start(t); mod.start(t); o.stop(t + dur + 0.02); mod.stop(t + dur + 0.02)
  return t + dur + 0.02
}

export const INSTRUMENTS = { accordion, reed, clarinet, brass, tuba, keys, ep, pluck, cimbalom, nai, bell, softlead, bass, subbass, ostinato, strings }
// oscillators each instrument keeps alive (for the music voice budget)
export const OSC_COST = { accordion: 2, keys: 2, bell: 2 }

// ---- percussion ----------------------------------------------------------------------------

function noiseHit(k, dest, t, color, type, f, q, peak, tau, a = 0.001) {
  const n = k.noiseSrc(color, t, a + tau * 6)
  const fl = filter(k, type, f, q)
  const g = vca(k, dest)
  n.connect(fl); fl.connect(g)
  return perc(g.gain, t, peak, a, tau)
}

function thump(k, dest, t, f1, f2, sweep, peak, tau) {
  const g = vca(k, dest)
  const a = osc(k, 'sine', f1, t)
  a.frequency.exponentialRampToValueAtTime(f2, t + sweep)
  a.connect(g)
  const end = perc(g.gain, t, peak, 0.002, tau)
  a.start(t); a.stop(end)
  return end
}

export const DRUMS = {
  kick(k, d, t, v = 1, o = {}) {
    noiseHit(k, d, t, 'white', 'highpass', 2500, 0.7, 0.12 * v, 0.004)
    return thump(k, d, t, o.soft ? 95 : 140, 44, 0.09, 0.95 * v, o.soft ? 0.07 : 0.085)
  },
  // Balkan tapan: boomy bass drum on the beat
  tapan(k, d, t, v = 1) {
    noiseHit(k, d, t, 'brown', 'lowpass', 400, 0.8, 0.5 * v, 0.03)
    return thump(k, d, t, 115, 48, 0.14, 0.95 * v, 0.1)
  },
  bassdrum(k, d, t, v = 1) {
    noiseHit(k, d, t, 'brown', 'lowpass', 300, 0.8, 0.45 * v, 0.04)
    return thump(k, d, t, 90, 42, 0.16, 0.9 * v, 0.14)
  },
  snare(k, d, t, v = 1, o = {}) {
    const end = noiseHit(k, d, t, 'white', 'bandpass', o.lofi ? 1800 : 2600, 0.6, 0.45 * v, o.lofi ? 0.035 : 0.045)
    thump(k, d, t, 210, 170, 0.04, 0.35 * v, 0.03)
    return end
  },
  rim(k, d, t, v = 1) {
    noiseHit(k, d, t, 'white', 'bandpass', 2400, 2, 0.25 * v, 0.006)
    return thump(k, d, t, 1750, 1650, 0.01, 0.3 * v, 0.006)
  },
  hat(k, d, t, v = 1, o = {}) { return noiseHit(k, d, t, 'white', 'highpass', 7500, 0.6, 0.3 * v, o.open ? 0.07 : 0.011) },
  shaker(k, d, t, v = 1) { return noiseHit(k, d, t, 'white', 'bandpass', 6500, 1.1, 0.26 * v, 0.018, 0.008) },
  tamb(k, d, t, v = 1) {
    noiseHit(k, d, t, 'white', 'bandpass', 9500, 2, 0.22 * v, 0.03)
    return noiseHit(k, d, t, 'white', 'highpass', 5500, 0.7, 0.16 * v, 0.012)
  },
  brush(k, d, t, v = 1) { return noiseHit(k, d, t, 'pink', 'bandpass', 3500, 0.5, 0.3 * v, 0.05, 0.02) },
  clap(k, d, t, v = 1) {
    const n = k.noiseSrc('white', t, 0.5)
    const fl = filter(k, 'bandpass', 1400, 1.1)
    const g = vca(k, d)
    n.connect(fl); fl.connect(g)
    for (const dt of [0, 0.011, 0.022]) { g.gain.setValueAtTime(0.4 * v, t + dt); g.gain.setTargetAtTime(0.05 * v, t + dt + 0.001, 0.003) }
    g.gain.setValueAtTime(0.35 * v, t + 0.033)
    g.gain.setTargetAtTime(0, t + 0.034, 0.03)
    return t + 0.25
  },
  crash(k, d, t, v = 1, o = {}) {
    noiseHit(k, d, t, 'white', 'bandpass', 7000, 0.6, 0.18 * v, o.choke ? 0.05 : 0.5)
    return noiseHit(k, d, t, 'white', 'highpass', 4500, 0.7, 0.2 * v, o.choke ? 0.04 : 0.35)
  },
  timp(k, d, t, v = 1, o = {}) {
    const f = mtof(o.midi ?? 38)
    noiseHit(k, d, t, 'brown', 'lowpass', 500, 0.7, 0.35 * v, 0.02)
    return thump(k, d, t, f * 1.04, f, 0.06, 0.8 * v, 0.28)
  },
  tick(k, d, t, v = 1, o = {}) { return thump(k, d, t, o.tock ? 1500 : 2300, o.tock ? 1400 : 2200, 0.01, 0.2 * v, 0.006) },
  heart(k, d, t, v = 1) {
    noiseHit(k, d, t, 'brown', 'lowpass', 180, 0.7, 0.4 * v, 0.03, 0.005)
    return thump(k, d, t, 62, 38, 0.08, 0.95 * v, 0.06)
  },
  boom(k, d, t, v = 1) {
    noiseHit(k, d, t, 'brown', 'lowpass', 160, 0.7, 0.6 * v, 0.25, 0.004)
    return thump(k, d, t, 58, 27, 0.9, 1 * v, 0.35)
  },
  // reversed-cymbal riser that cuts off exactly at t + dur
  swell(k, d, t, v = 1, o = {}) {
    const dur = o.dur ?? 1.5
    const n = k.noiseSrc('white', t, dur)
    const fl = filter(k, 'highpass', 1800, 0.7)
    fl.frequency.setValueAtTime(1800, t)
    fl.frequency.exponentialRampToValueAtTime(5000, t + dur)
    const g = vca(k, d)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25 * v, t + dur - 0.01)
    g.gain.linearRampToValueAtTime(0, t + dur)
    n.connect(fl); fl.connect(g)
    return t + dur
  },
}
export const DRUM_OSC = { kick: 1, tapan: 1, bassdrum: 1, snare: 1, rim: 1, timp: 1, tick: 1, heart: 1, boom: 1 }

// ---- persistent layers ---------------------------------------------------------------------

// A section of sustained oscillators that glide between chords (pads, drones).
export class Pad {
  constructor(k, dest, n, o = {}) {
    const ctx = k.ctx
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.lp = filter(k, 'lowpass', o.cutoff ?? 900, o.q ?? 0.5, this.out)
    this.lfo = ctx.createOscillator()
    this.lfo.frequency.value = o.lfoRate ?? 0.07
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = o.lfoDepth ?? 250
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.lp.frequency)
    this.nodes = [this.lfo]
    if (o.chorus && ctx.createStereoPanner) {
      // dry left, modulated short delay right: cheap ensemble width
      const dl = ctx.createDelay(0.05), mod = ctx.createOscillator(), mg = ctx.createGain()
      dl.delayTime.value = 0.017
      mod.frequency.value = 0.33
      mg.gain.value = 0.0045
      mod.connect(mg); mg.connect(dl.delayTime)
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner()
      pl.pan.value = -0.55; pr.pan.value = 0.55
      this.out.connect(pl); pl.connect(dest)
      this.out.connect(dl); dl.connect(pr); pr.connect(dest)
      this.nodes.push(mod)
    } else this.out.connect(dest)
    this.lines = []
    for (let i = 0; i < n; i++) {
      const a = ctx.createOscillator()
      if (o.wave && typeof o.wave !== 'string') a.setPeriodicWave(o.wave)
      else a.type = o.wave || 'sawtooth'
      a.detune.value = (i % 2 ? 1 : -1) * (o.spread ?? 6)
      const g = ctx.createGain()
      g.gain.value = (o.gain ?? 0.5) / n
      a.connect(g); g.connect(this.lp)
      this.lines.push({ a, midi: null })
      this.nodes.push(a)
    }
  }

  start(t) { for (const n of this.nodes) n.start(t) }

  // glide every line to its note of the new chord
  set(t, midis, glide = 0.05) {
    this.lines.forEach((l, i) => {
      const m = midis[i % midis.length]
      if (l.midi === null) l.a.frequency.setValueAtTime(mtof(m), t)
      else if (m !== l.midi) l.a.frequency.setTargetAtTime(mtof(m), t, glide)
      l.midi = m
    })
  }

  level(t, v, tau = 0.4) { this.out.gain.setTargetAtTime(v, t, tau) }
  cutoff(t, f, tau = 2) { this.lp.frequency.setTargetAtTime(f, t, tau) }
  stop(t) { for (const n of this.nodes) { try { n.stop(t) } catch (e) { /* already stopped */ } } }
}
