// Procedural music: a lookahead scheduler (Chris Wilson style) that plays the tracks in
// tracks.js on a step grid, crossfades between them, and fires one-shot stingers.
import { TRACKS } from './tracks.js'
import { INSTRUMENTS, OSC_COST, DRUMS, DRUM_OSC, Pad, brass, tuba, bell, pluck, accordion, softlead, subbass, policeWhistle } from './Instruments.js'
import { progression, chordAt, seq } from './Theory.js'
import { makeStereo, mtof } from './dsp.js'

const DEV = !!(import.meta.env && import.meta.env.DEV)
export const LOOKAHEAD = 0.12 // seconds of audio scheduled ahead of currentTime
const MAX_VOICES = 12 // simultaneously sounding oscillators per track
const LEVEL = 0.85 // overall music trim so the score sits under effects and dialogue
const NONE = []

function compile(def) {
  if (def._c) return def._c
  const spb = def.steps || def.beats * def.sub
  const c = { spb, prog: progression(def.chords, spb), mel: {} }
  for (const [name, str] of Object.entries(def.mel || {})) c.mel[name] = seq(str, spb)
  def._c = c
  if (DEV) {
    const bad = validateTrack(def)
    if (bad.length) console.warn('[audio] score problems', bad)
  }
  return c
}

function validateTrack(def) {
  const c = compile(def), issues = []
  if (c.prog.length !== def.bars && c.prog.length !== 1) issues.push(`chords span ${c.prog.length} bars`)
  for (const [m, s] of Object.entries(c.mel)) {
    if (s.bad.length) issues.push(`${m}: ${s.bad.join(', ')}`)
    if (s.length !== def.bars * c.spb) issues.push(`${m}: ${s.length / c.spb} bars long`)
  }
  return issues
}

// { trackName: [problems] } - used by tests to check every bar adds up
export function validateTracks() {
  const out = {}
  for (const [name, def] of Object.entries(TRACKS)) out[name] = validateTrack(def)
  return out
}

// One running instance of a track: its own mix, sustained layers and step clock.
class TrackPlayer {
  constructor(music, name, def, t0) {
    const ctx = music.ctx
    this.m = music
    this.ctx = ctx
    this.kit = music.kit
    this.def = def
    this.name = name
    this.c = compile(def)
    this.spb = this.c.spb
    this.stepDur = 60 / def.bpm / def.sub
    this.barDur = this.stepDur * this.spb
    this.total = this.spb * def.bars
    this.next = t0
    this.k = 0
    this.notes = [] // end times of sounding oscillators
    this.base = 0 // oscillators held by sustained layers
    this.st = {} // per-track state for step()
    this.pads = []
    this.stopAt = Infinity
    this.endAt = Infinity
    this.level = (def.gain ?? 1) * LEVEL // per-track loudness match
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(music.input)
    this.wet = ctx.createGain()
    this.wet.gain.value = 0
    this.wet.connect(music.wetIn)
    this.extra = []
    if (def.delay) this.makeDelay(def.delay)
    this.parts = {}
    for (const [n, cfg] of Object.entries(def.mix)) this.parts[n] = this.makePart(cfg)
    if (def.setup) def.setup(this, t0)
  }

  makePart(cfg) {
    const ctx = this.ctx
    const input = ctx.createGain()
    input.gain.value = cfg.gain ?? 0.3
    let node = input
    if (cfg.lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = cfg.lp
      f.Q.value = 0.5
      node.connect(f)
      node = f
    }
    const pan = makeStereo(ctx, cfg.pan || 0)
    node.connect(pan)
    pan.connect(this.out)
    const send = (amount, dest) => { const g = ctx.createGain(); g.gain.value = amount; pan.connect(g); g.connect(dest) }
    if (cfg.rev) send(cfg.rev, this.wet)
    if (cfg.delay && this.delayIn) send(cfg.delay, this.delayIn)
    return input
  }

  // tempo-synced feedback echo (time in beats)
  makeDelay({ time, feedback }) {
    const ctx = this.ctx
    const d = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter()
    d.delayTime.value = Math.min(1.9, (time * 60) / this.def.bpm)
    fb.gain.value = feedback
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    this.delayIn = ctx.createGain()
    this.delayIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d)
    lp.connect(this.out)
    this.extra.push(this.delayIn, d, fb, lp)
  }

  fadeIn(t, dur) {
    for (const p of [this.out.gain, this.wet.gain]) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(this.level, t + dur) }
  }

  fadeOut(t, dur) {
    for (const p of [this.out.gain, this.wet.gain]) {
      p.cancelScheduledValues(t)
      p.setValueAtTime(p.value, t)
      p.linearRampToValueAtTime(0, t + dur)
    }
    this.stopAt = t + dur
    this.endAt = t + dur + 0.5
    for (const pd of this.pads) pd.stop(t + dur + 0.05)
  }

  schedule(now, until) {
    // fell far behind (long stall): jump ahead on the grid instead of cramming notes
    if (this.next < now - 0.25) {
      const skip = Math.ceil((now - this.next) / this.stepDur)
      this.next += skip * this.stepDur
      this.k += skip
    }
    let guard = 0
    while (this.next < until && guard++ < 64) {
      if (this.next < this.stopAt) this.step()
      this.next += this.stepDur
      this.k++
    }
  }

  step() {
    const i = this.k % this.total, st = i % this.spb
    const swing = this.def.swing && st % 2 ? this.def.swing * this.stepDur : 0
    const s = { t: this.next + swing, k: this.k, i, st, bar: Math.floor(i / this.spb), loop: Math.floor(this.k / this.total) }
    try { this.def.step(this, s) } catch (e) { if (DEV) console.warn('[audio] step failed', this.name, e) }
  }

  // ---- helpers used by track step() functions ----
  chord(s) { return chordAt(this.c.prog, s.bar, s.st) }
  chordAt(bar, st) { return chordAt(this.c.prog, bar, st) }
  mel(name, s) { const m = this.c.mel[name]; return (m && m.at.get(s.i)) || NONE }

  budget(t, cost, prio) {
    this.notes = this.notes.filter((e) => e > t)
    return this.base + this.notes.length + cost <= MAX_VOICES + (prio >= 2 ? 2 : 0)
  }

  note(part, inst, midi, len, vel, t, o = {}) {
    const fn = INSTRUMENTS[inst]
    const cost = OSC_COST[inst] || 1
    if (!fn || !this.budget(t, cost, o.prio ?? 1)) return
    const end = fn(this.kit, this.parts[part] || this.out, t, midi, len * this.stepDur, vel, o)
    for (let j = 0; j < cost; j++) this.notes.push(end)
  }

  hit(kind, vel, t, o) {
    const fn = DRUMS[kind]
    const cost = DRUM_OSC[kind] || 0
    if (!fn || (cost && !this.budget(t, cost, 1))) return
    const end = fn(this.kit, this.parts.drums || this.out, t, vel, o)
    for (let j = 0; j < cost; j++) this.notes.push(Math.min(end, t + 0.3)) // short, mostly decayed tails
  }

  pad(part, n, o) {
    const pd = new Pad(this.kit, this.parts[part] || this.out, n, o)
    this.pads.push(pd)
    return pd
  }

  voices(now) { return this.base + this.notes.filter((e) => e > now).length }

  dispose() {
    for (const pd of this.pads) pd.stop(0)
    for (const n of [this.out, this.wet, ...this.extra]) { try { n.disconnect() } catch (e) { /* gone */ } }
  }
}

// ---- stingers ------------------------------------------------------------------------------
// (k, dest, t, transpose) -> end time. Also used by the musical sfx (levelup, mission_*).
function trombone(k, d, t, tr) {
  const ctx = k.ctx
  const notes = [50, 49, 48, 47].map((m) => mtof(m + tr)), durs = [0.4, 0.4, 0.4, 1.25]
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain()
  o.type = 'sawtooth'
  lp.type = 'lowpass'
  lp.Q.value = 3.5
  g.gain.value = 0
  o.connect(lp); lp.connect(g); g.connect(d)
  let ti = t
  o.frequency.setValueAtTime(notes[0], t)
  notes.forEach((f, i) => {
    const di = durs[i], last = i === notes.length - 1
    if (i) { o.frequency.setValueAtTime(notes[i - 1], ti - 0.04); o.frequency.exponentialRampToValueAtTime(f, ti + 0.03) }
    // "wah": the filter opens and settles on every note
    lp.frequency.setValueAtTime(320, ti)
    lp.frequency.linearRampToValueAtTime(1700, ti + 0.1)
    lp.frequency.linearRampToValueAtTime(last ? 520 : 720, ti + (last ? di : 0.32))
    g.gain.setValueAtTime(i ? 0.06 : 0, ti)
    g.gain.linearRampToValueAtTime(0.5, ti + 0.05)
    g.gain.linearRampToValueAtTime(last ? 0.45 : 0.42, ti + di - (last ? 0.35 : 0.06))
    g.gain.linearRampToValueAtTime(last ? 0 : 0.06, ti + di - 0.01)
    if (last) o.detune.setValueCurveAtTime(k.vib(di - 0.1, 5.2, 45, 0.1), ti + 0.05, di - 0.1)
    ti += di
  })
  o.start(t)
  o.stop(ti + 0.05)
  return ti + 0.05
}

export const STINGERS = {
  levelup(k, d, t, tr = 0) {
    const arp = [72, 76, 79, 84]
    arp.forEach((m, i) => pluck(k, d, t + i * 0.065, m + tr, 0.1, 0.75, { wave: 'square', decay: 0.08 }))
    const t2 = t + 0.27
    let end = t2
    for (const m of [84, 88, 91]) end = Math.max(end, bell(k, d, t2, m + tr, 0.6, 0.8, { decay: 0.32 }))
    for (const m of [60, 67]) end = Math.max(end, brass(k, d, t2, m + tr, 0.42, 0.7))
    return end
  },

  mission_pass(k, d, t, tr = 0) {
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.13
      brass(k, d, ti, 67 + tr, 0.085, 0.9, { stab: true })
      brass(k, d, ti, 64 + tr, 0.085, 0.6, { stab: true })
      DRUMS.snare(k, d, ti, 0.45)
    }
    const t2 = t + 0.39
    let end = t2
    for (const [m, v] of [[72, 1], [76, 0.75], [79, 0.75], [84, 0.85]]) end = Math.max(end, brass(k, d, t2, m + tr, 1.2, v))
    end = Math.max(end, tuba(k, d, t2, 48 + tr, 1.15, 1))
    DRUMS.timp(k, d, t2, 1, { midi: 36 + tr })
    DRUMS.crash(k, d, t2, 0.7)
    const sparkle = [84, 88, 91, 96]
    sparkle.forEach((m, i) => bell(k, d, t2 + 0.55 + i * 0.07, m + tr, 0.3, 0.45, { decay: 0.25 }))
    return Math.max(end, t2 + 1.6)
  },

  mission_fail(k, d, t, tr = 0) { return trombone(k, d, t, tr) },

  chapter(k, d, t, tr = 0) {
    DRUMS.boom(k, d, t, 1)
    DRUMS.timp(k, d, t, 1, { midi: 38 + tr })
    DRUMS.crash(k, d, t, 0.9)
    let end = t + 2.2
    for (const m of [38, 45, 50, 53]) end = Math.max(end, brass(k, d, t, m + tr, 1.5, 0.85, { bright: 0.8 }))
    for (const m of [74, 81]) brass(k, d, t + 0.01, m + tr, 0.3, 0.55, { stab: true })
    tuba(k, d, t, 26 + tr, 1.6, 0.9)
    return end
  },

  wanted(k, d, t, tr = 0) {
    const hits = [[0, [74, 80]], [0.15, [74, 80]], [0.3, [77, 83]], [0.45, [80, 86]]]
    for (const [dt, ms] of hits) {
      for (const m of ms) brass(k, d, t + dt, m + tr, dt > 0.4 ? 0.5 : 0.09, 0.9, { stab: true })
      DRUMS.snare(k, d, t + dt, 0.55)
    }
    DRUMS.tapan(k, d, t, 1)
    DRUMS.tapan(k, d, t + 0.45, 1)
    DRUMS.crash(k, d, t + 0.45, 0.45)
    tuba(k, d, t + 0.45, 38 + tr, 0.5, 1)
    return t + 1.4
  },

  busted(k, d, t, tr = 0) {
    const hits = [[0, [46, 52], 0.2], [0.3, [45, 51], 0.2], [0.6, [44, 50, 56], 1.1]]
    let end = t
    for (const [dt, ms, len] of hits) {
      for (const m of ms) end = Math.max(end, brass(k, d, t + dt, m + tr, len, 0.9, { bright: 0.7 }))
      DRUMS.timp(k, d, t + dt, 0.9, { midi: ms[0] - 12 + tr })
    }
    DRUMS.crash(k, d, t + 0.6, 0.7)
    DRUMS.boom(k, d, t + 0.6, 0.7)
    return Math.max(end, policeWhistle(k, d, t + 1.05, 0.52))
  },

  // clue found: mysterious minor(add9) bell arpeggio resolving to a bright major chord
  evidence(k, d, t, tr = 0) {
    const arp = [69, 72, 76, 83]
    arp.forEach((m, i) => bell(k, d, t + i * 0.11, m + tr, 0.4, 0.6, { decay: 0.35 }))
    pluck(k, d, t, 45 + tr, 0.3, 0.7, { wave: 'triangle', decay: 0.25 })
    const t2 = t + 0.52
    let end = t2
    for (const m of [81, 85, 88]) end = Math.max(end, bell(k, d, t2, m + tr, 0.8, 0.55, { decay: 0.45 }))
    end = Math.max(end, softlead(k, d, t2, 69 + tr, 0.7, 0.6))
    end = Math.max(end, subbass(k, d, t2, 45 + tr, 0.6, 0.6))
    return Math.max(end, t2 + 1)
  },

  // big reveal: dissonant orchestral stab (minor + tritone), then a rising riser tail
  unmask(k, d, t, tr = 0) {
    DRUMS.boom(k, d, t, 1)
    DRUMS.timp(k, d, t, 1, { midi: 36 + tr })
    DRUMS.crash(k, d, t, 0.9)
    for (const m of [36, 43, 48, 51, 54]) brass(k, d, t, m + tr, 0.45, 0.85, { bright: 0.9 })
    for (const m of [72, 78]) brass(k, d, t + 0.01, m + tr, 0.25, 0.55, { stab: true })
    const ctx = k.ctx, t1 = t + 0.35, dur = 1.6
    const lp = ctx.createBiquadFilter(), g = ctx.createGain()
    lp.type = 'lowpass'
    lp.Q.value = 4
    lp.frequency.setValueAtTime(400, t1)
    lp.frequency.exponentialRampToValueAtTime(4000, t1 + dur)
    g.gain.setValueAtTime(0.0001, t1)
    g.gain.exponentialRampToValueAtTime(0.12, t1 + dur - 0.05)
    g.gain.linearRampToValueAtTime(0, t1 + dur)
    lp.connect(g); g.connect(d)
    for (const [m, det] of [[48, -8], [55, 8]]) {
      const o = ctx.createOscillator(), f = mtof(m + tr)
      o.type = 'sawtooth'
      o.detune.value = det
      o.frequency.setValueAtTime(f, t1)
      o.frequency.exponentialRampToValueAtTime(f * 2, t1 + dur)
      o.connect(lp)
      o.start(t1)
      o.stop(t1 + dur + 0.02)
    }
    DRUMS.swell(k, d, t1, 0.8, { dur })
    return t1 + dur + 0.05
  },

  // takedown: punchy hit, then a short triumphant major brass chord
  takedown(k, d, t, tr = 0) {
    DRUMS.boom(k, d, t, 0.8)
    DRUMS.tapan(k, d, t, 1)
    DRUMS.snare(k, d, t, 1)
    const t2 = t + 0.14
    let end = t2
    for (const m of [60, 64, 67, 72]) end = Math.max(end, brass(k, d, t2, m + tr, 0.4, 0.95))
    DRUMS.crash(k, d, t2, 0.6)
    return Math.max(end, t2 + 0.8)
  },

  // race won: a G-major scale run up to a held chord, snare pickup, bells on top
  race_win(k, d, t, tr = 0) {
    const run = [67, 69, 71, 72, 74, 76, 78, 79]
    run.forEach((m, i) => brass(k, d, t + i * 0.045, m + tr, 0.05, 0.75, { stab: true }))
    for (let i = 0; i < 4; i++) DRUMS.snare(k, d, t + 0.18 + i * 0.045, 0.3 + i * 0.1)
    const t2 = t + 0.38
    let end = t2
    for (const m of [71, 74, 79, 83]) end = Math.max(end, brass(k, d, t2, m + tr, 0.8, 0.85))
    end = Math.max(end, tuba(k, d, t2, 43 + tr, 0.75, 1))
    DRUMS.crash(k, d, t2, 0.7)
    const top = [91, 95, 98]
    top.forEach((m, i) => bell(k, d, t2 + 0.3 + i * 0.08, m + tr, 0.3, 0.45))
    return Math.max(end, t2 + 1.1)
  },

  // fight won: accordion flourish, then a brassy "ta-da!" (A7 -> D)
  fight_win(k, d, t, tr = 0) {
    const run = [62, 66, 69, 74, 73, 74]
    run.forEach((m, i) => accordion(k, d, t + i * 0.06, m + tr, 0.07, 0.85))
    const t1 = t + 0.42, t2 = t + 0.6
    for (const m of [61, 64, 67, 69]) brass(k, d, t1, m + tr, 0.12, 0.8, { stab: true })
    let end = t2
    for (const m of [62, 66, 69, 74]) end = Math.max(end, brass(k, d, t2, m + tr, 0.55, 0.9))
    DRUMS.snare(k, d, t1, 0.6)
    DRUMS.tapan(k, d, t2, 1)
    DRUMS.crash(k, d, t2, 0.5)
    return Math.max(end, t2 + 0.7)
  },
}

// ---- music director --------------------------------------------------------------------------
export class Music {
  constructor(eng) {
    this.eng = eng
    this.ctx = eng.ctx
    this.kit = eng.kit
    this.input = eng.buses.musicIn
    this.wetIn = eng.buses.musicWetIn
    this.cur = null
    this.name = 'none'
    this.old = []
  }

  play(name, fade = 1.5) {
    if (!TRACKS[name]) name = 'none'
    if (name === this.name) return
    const now = this.ctx.currentTime
    if (this.cur) {
      this.cur.fadeOut(now, fade)
      this.old.push(this.cur)
      this.cur = null
    }
    this.name = name
    if (name === 'none') return
    const t0 = now + 0.05
    this.cur = new TrackPlayer(this, name, TRACKS[name], t0)
    this.cur.fadeIn(t0, this.old.length ? fade : 0.8)
  }

  tick() {
    const now = this.ctx.currentTime, until = now + LOOKAHEAD
    if (this.cur) this.cur.schedule(now, until)
    for (let i = this.old.length - 1; i >= 0; i--) {
      const p = this.old[i]
      if (now > p.endAt) { p.dispose(); this.old.splice(i, 1) } else p.schedule(now, until)
    }
  }

  voices() {
    const now = this.ctx.currentTime
    return (this.cur ? this.cur.voices(now) : 0) + this.old.reduce((a, p) => a + p.voices(now), 0)
  }

  dispose() {
    if (this.cur) this.cur.dispose()
    for (const p of this.old) p.dispose()
    this.cur = null
    this.old = []
    this.name = 'none'
  }
}
