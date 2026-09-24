// Dialogue "voices" in the Animal Crossing / Undertale tradition: every syllable of the
// text becomes a short pitched blip whose two formant filters follow the vowel. One
// oscillator + a few filters per line; all blips are scheduled up front as automation.
import { clamp, makePanner, setPannerPos } from './dsp.js'

const RATE = 13 // blips per second
const BLIP = 0.055 // blip length (s)
const MAX_LINES = 4

const TYPES = {
  male: { f0: 118, wave: 'sawtooth', fm: 1, gain: 1 },
  female: { f0: 215, wave: 'sawtooth', fm: 1.17, gain: 0.95 },
  old: { f0: 150, wave: 'sawtooth', fm: 0.97, gain: 0.9, wobble: 38 },
  gruff: { f0: 86, wave: 'sawtooth', fm: 0.9, gain: 0.9, drive: 3 },
  kid: { f0: 290, wave: 'sawtooth', fm: 1.3, gain: 0.9 },
  robot: { f0: 140, wave: 'square', fm: 1, gain: 0.6, flat: true, ring: 70 },
}

// F1 / F2 (Hz, adult male) and a pitch lean per vowel; Romanian ă â î included
const VOWELS = {
  a: [730, 1090, 0], e: [530, 1840, 1], i: [300, 2250, 2.5], o: [570, 850, -1], u: [320, 870, -2],
  ă: [520, 1480, -0.5], â: [350, 1450, 1], î: [350, 1450, 1], y: [300, 2100, 2],
}
const FRICATIVE = new Set('sșşzjfvhxțţ')
const LONG_PAUSE = '.!?…'
const SHORT_PAUSE = ',;:—–'

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// text -> [{ v, c, syl, pause, q, ex, pos }]; exported for tests
export function syllables(text) {
  const out = []
  let cons = '', pend = 0, prevVowel = false, wordVowel = false, sentence = 0
  const push = (v) => { out.push({ v, c: cons, syl: cons + v, pause: pend, q: false, ex: false, pos: 0 }); cons = ''; pend = 0 }
  const endWord = () => { if (cons && !wordVowel) push('ă'); cons = ''; wordVowel = false }
  const endSentence = (ch) => {
    const run = out.slice(sentence)
    run.forEach((b, i) => { b.pos = run.length > 1 ? i / (run.length - 1) : 0; if (ch === '!') b.ex = true })
    if (ch === '?') run.slice(-3).forEach((b) => { b.q = true })
    sentence = out.length
  }
  for (const raw of String(text || '').toLowerCase()) {
    const base = VOWELS[raw] ? raw : raw.normalize('NFD')[0]
    if (VOWELS[base]) {
      if (!prevVowel) push(base) // diphthongs ("ea", "ău") stay one blip
      prevVowel = true
      wordVowel = true
      continue
    }
    prevVowel = false
    if (raw >= '0' && raw <= '9') { push('a'); wordVowel = true; continue }
    if (/\p{L}/u.test(raw)) { cons += raw; continue }
    endWord()
    if (LONG_PAUSE.includes(raw)) { pend = Math.max(pend, 0.3); endSentence(raw) }
    else if (SHORT_PAUSE.includes(raw)) pend = Math.max(pend, 0.13)
  }
  endWord()
  endSentence('.')
  return out
}

class Line {
  constructor(vox, voice, text, opts) {
    const eng = vox.eng, ctx = eng.ctx, k = eng.kit
    this.vox = vox
    this.ctx = ctx
    const type = TYPES[voice.type] || TYPES.male
    const mul = clamp(Number.isFinite(voice.pitch) ? voice.pitch : 1, 0.4, 2.5)
    const blips = syllables(text)
    this.srcs = []
    this.dead = !blips.length
    if (this.dead) return
    const now = ctx.currentTime, t0 = now + 0.03
    // graph: osc -> [drive] -> F1 + F2 band-passes (+ a little body) -> env -> [ring] -> out
    this.out = ctx.createGain()
    this.out.gain.value = clamp(Number.isFinite(opts.vol) ? opts.vol : 1, 0, 2)
    let dest = eng.buses.voice
    if (opts.at && Number.isFinite(opts.at.x)) {
      this.pan = makePanner(ctx, 6, 60)
      setPannerPos(this.pan, opts.at.x, (opts.at.y || 0) + 1.6, opts.at.z || 0, now)
      this.pan.connect(dest)
      dest = this.pan
    }
    this.out.connect(dest)
    const osc = ctx.createOscillator()
    osc.type = type.wave
    let src = osc
    if (type.drive) { const w = ctx.createWaveShaper(); w.curve = k.drive(type.drive); osc.connect(w); src = w }
    const bp = (q) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; return f }
    const f1 = bp(5), f2 = bp(7), body = ctx.createBiquadFilter(), env = ctx.createGain()
    body.type = 'lowpass'
    body.frequency.value = 700
    const g1 = ctx.createGain(), g2 = ctx.createGain(), gb = ctx.createGain()
    g1.gain.value = 1.6; g2.gain.value = 1.1; gb.gain.value = 0.22
    src.connect(f1); src.connect(f2); src.connect(body)
    f1.connect(g1); f2.connect(g2); body.connect(gb)
    g1.connect(env); g2.connect(env); gb.connect(env)
    env.gain.value = 0
    if (type.ring) {
      const rg = ctx.createGain(), ro = ctx.createOscillator()
      rg.gain.value = 0
      ro.frequency.value = type.ring
      ro.connect(rg.gain)
      env.connect(rg); rg.connect(this.out)
      this.srcs.push(ro)
    } else env.connect(this.out)
    if (type.wobble) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain()
      lfo.frequency.value = 6.2
      lg.gain.value = type.wobble
      lfo.connect(lg); lg.connect(osc.detune)
      this.srcs.push(lfo)
    }
    // consonant hiss / tick layer
    const nf = ctx.createBiquadFilter(), ng = ctx.createGain()
    nf.type = 'bandpass'
    nf.Q.value = 1.2
    ng.gain.value = 0
    nf.connect(ng); ng.connect(this.out)

    let t = t0
    for (const b of blips) {
      t += b.pause
      const [F1, F2, lean] = VOWELS[b.v]
      let semi = type.flat ? 0 : lean + ((hash(b.syl) % 7) - 3) * 0.55 - b.pos * 1.5
      if (b.q) semi += 3
      if (b.ex) semi += 1.5
      const f = type.f0 * mul * Math.pow(2, semi / 12)
      const peak = 0.8 * type.gain * (b.ex ? 1.2 : 1)
      if (b.c) {
        const fric = FRICATIVE.has(b.c[b.c.length - 1])
        nf.frequency.setValueAtTime(fric ? 5200 : 1900, t)
        ng.gain.setValueAtTime(0, t)
        ng.gain.linearRampToValueAtTime(fric ? 0.09 : 0.14, t + 0.003)
        ng.gain.exponentialRampToValueAtTime(0.0005, t + (fric ? 0.03 : 0.012))
        ng.gain.setValueAtTime(0, t + (fric ? 0.031 : 0.013))
      }
      const on = t + (b.c ? 0.012 : 0)
      osc.frequency.setValueAtTime(f * 1.05, on)
      osc.frequency.exponentialRampToValueAtTime(f, on + 0.035)
      f1.frequency.setValueAtTime(F1 * type.fm, on)
      f2.frequency.setValueAtTime(F2 * type.fm, on)
      env.gain.setValueAtTime(0, on)
      env.gain.linearRampToValueAtTime(peak, on + 0.008)
      env.gain.exponentialRampToValueAtTime(peak * 0.03, on + BLIP)
      env.gain.linearRampToValueAtTime(0, on + BLIP + 0.004)
      t += 1 / RATE
    }
    this.end = t + 0.05
    const noise = k.noiseSrc('white', t0, this.end - t0)
    noise.connect(nf)
    this.srcs.push(osc, noise)
    for (const s of this.srcs) { if (s !== noise) { s.start(t0); s.stop(this.end) } }
    this.timer = setTimeout(() => this.dispose(), (this.end - now + 0.1) * 1000)
  }

  stop() {
    if (this.dead) return
    const now = this.ctx.currentTime, g = this.out.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0, now + 0.03)
    for (const s of this.srcs) { try { s.stop(now + 0.05) } catch (e) { /* already stopped */ } }
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.dispose(), 120)
    this.dead = true
  }

  dispose() {
    this.dead = true
    try { this.out.disconnect(); if (this.pan) this.pan.disconnect() } catch (e) { /* gone */ }
    const i = this.vox.lines.indexOf(this)
    if (i >= 0) this.vox.lines.splice(i, 1)
  }
}

export class Voices {
  constructor(eng) {
    this.eng = eng
    this.lines = []
  }

  start(voice, text, opts = {}) {
    const v = typeof voice === 'number' ? { pitch: voice } : typeof voice === 'string' ? { type: voice } : (voice || {})
    while (this.lines.length >= MAX_LINES) this.lines.shift().stop() // oldest line gives way
    const line = new Line(this, v, text, opts || {})
    if (line.dead) return () => {}
    this.lines.push(line)
    return () => line.stop()
  }

  active() { return this.lines.filter((l) => !l.dead).length }

  stopAll() { for (const l of this.lines.slice()) l.stop() }
}
