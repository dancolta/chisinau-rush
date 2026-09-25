// Ambience beds. One persistent graph whose layers morph between presets, so switching
// city -> night -> interior is a smooth crossfade rather than a restart:
//   Kenney ambience loop + synthesized distant traffic + random distant events
//   -> "muffle" lowpass -> ambience bus;  crickets bypass the muffle.
import { rand, makeStereo } from './dsp.js'

const PRESETS = {
  city: { bed: 0.34, cut: 6000, traffic: 0.22, crickets: 0, events: 1, birds: 1, horns: 1 },
  night: { bed: 0.22, cut: 3000, traffic: 0.13, crickets: 1, events: 0.45, birds: 0, horns: 0.3 },
  interior: { bed: 0.24, cut: 420, traffic: 0.25, crickets: 0, events: 0.5, birds: 0, horns: 0.5 },
  none: { bed: 0, cut: 6000, traffic: 0, crickets: 0, events: 0, birds: 0, horns: 0 },
}
const TAU = 0.45 // crossfade time constant (~1.4 s to settle)
const CRICKETS = [[4300, -0.6], [4750, 0.15], [5200, 0.7]]

export class Ambience {
  constructor(eng) {
    this.eng = eng
    this.ctx = eng.ctx
    this.kind = 'none'
    this.p = PRESETS.none
    this.n = null
    this.crk = null
    this.idle = 0
    this.nextEv = 0
    this.nextBird = 0
    this.nextHorn = 0
    this.fallback = null
  }

  set(kind) {
    if (!PRESETS[kind]) kind = 'none'
    if (kind === this.kind) return
    const now = this.ctx.currentTime
    this.kind = kind
    this.p = PRESETS[kind]
    if (kind !== 'none') this.build(now)
    if (!this.n) return
    const n = this.n, p = this.p
    n.bed.gain.setTargetAtTime(p.bed, now, TAU)
    n.muffle.frequency.setTargetAtTime(p.cut, now, TAU)
    n.traffic.gain.setTargetAtTime(p.traffic, now, TAU)
    if (p.crickets) this.buildCrickets(now)
    if (this.crk) this.crk.gain.gain.setTargetAtTime(p.crickets, now, TAU)
    this.idle = kind === 'none' ? now : 0
    this.nextEv = now + rand(2, 6)
    this.nextBird = now + rand(1, 4)
    this.nextHorn = now + rand(8, 20)
  }

  build(now) {
    if (this.n) return
    const ctx = this.ctx, eng = this.eng, k = eng.kit
    const gain = (v, dest) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g }
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = this.p.cut
    muffle.Q.value = 0.5
    muffle.connect(eng.buses.amb)
    const srcs = []
    const bed = gain(0, muffle)
    const loop = eng.loop('ambience')
    if (loop) {
      const s = ctx.createBufferSource()
      s.buffer = loop.buffer
      s.loop = true
      s.loopEnd = loop.end
      s.connect(bed)
      s.start(now, rand(0, loop.end))
      srcs.push(s)
    } else {
      // fallback bed until (unless) the recording arrives: low wind
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 500
      const s = k.noiseSrc('brown', now, 1e6)
      this.fallback = { src: s, gain: gain(0.5, bed) }
      s.connect(lp); lp.connect(this.fallback.gain)
      srcs.push(s)
    }
    // distant traffic: tyre/engine wash in the low mids, slowly swelling
    const traffic = gain(0, muffle)
    const swell = gain(0.65, traffic)
    const bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.5
    lp.type = 'lowpass'; lp.frequency.value = 1200
    const tn = k.noiseSrc('pink', now, 1e6)
    tn.connect(bp); bp.connect(lp); lp.connect(swell)
    srcs.push(tn)
    for (const [rate, depth] of [[0.09, 0.25], [0.23, 0.1]]) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = rate
      lfo.connect(gain(depth, swell.gain))
      lfo.start(now)
      srcs.push(lfo)
    }
    const events = gain(1, muffle)
    this.n = { muffle, bed, traffic, events, srcs }
  }

  // the ambience recording finished decoding after a fallback bed was built: swap it in
  refresh() {
    if (!this.n || !this.fallback) return
    const loop = this.eng.loop('ambience')
    if (!loop) return
    const ctx = this.ctx, now = ctx.currentTime
    this.fallback.gain.gain.setTargetAtTime(0, now, 0.3)
    this.fallback.src.stop(now + 2)
    const s = ctx.createBufferSource()
    s.buffer = loop.buffer
    s.loop = true
    s.loopEnd = loop.end
    s.connect(this.n.bed)
    s.start(now, rand(0, loop.end))
    this.n.srcs.push(s)
    this.fallback = null
  }

  buildCrickets(now) {
    if (this.crk) return
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.value = 0
    g.connect(this.eng.buses.amb)
    const list = CRICKETS.map(([f, pan]) => {
      const o = ctx.createOscillator(), e = ctx.createGain(), p = makeStereo(ctx, pan)
      o.frequency.value = f
      e.gain.value = 0
      o.connect(e); e.connect(p); p.connect(g)
      o.start(now)
      return { o, e, next: now + rand(0.1, 0.8), period: rand(0.55, 0.85) }
    })
    this.crk = { gain: g, list, quietSince: 0 }
  }

  // chirp = 3-4 quick pulses; scheduled a little ahead like music notes
  scheduleCrickets(now) {
    for (const c of this.crk.list) {
      if (c.next < now) c.next = now + 0.05
      while (c.next < now + 0.25) {
        if (Math.random() < 0.85) {
          const n = Math.random() < 0.3 ? 4 : 3
          for (let i = 0; i < n; i++) {
            const t = c.next + i * 0.024
            c.e.gain.setValueAtTime(0, t)
            c.e.gain.linearRampToValueAtTime(0.045, t + 0.004)
            c.e.gain.linearRampToValueAtTime(0, t + 0.014)
          }
        }
        c.next += c.period * rand(0.9, 1.12)
      }
    }
  }

  // a car passing somewhere down the street
  passBy(t, level) {
    const ctx = this.ctx, dur = rand(2.5, 4.5), dir = Math.random() < 0.5 ? -1 : 1
    const src = this.eng.kit.noiseSrc('pink', t, dur)
    const bp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = makeStereo(ctx, -0.9 * dir)
    bp.type = 'bandpass'
    bp.Q.value = 1.1
    bp.frequency.setValueAtTime(260, t)
    bp.frequency.exponentialRampToValueAtTime(680, t + dur * 0.5)
    bp.frequency.exponentialRampToValueAtTime(280, t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.4 * level, t + dur * 0.5)
    g.gain.linearRampToValueAtTime(0, t + dur)
    if (pan.pan) { pan.pan.setValueAtTime(-0.9 * dir, t); pan.pan.linearRampToValueAtTime(0.9 * dir, t + dur) }
    src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(this.n.events)
  }

  // far-away double honk
  distantHorn(t, level) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = makeStereo(ctx, rand(-0.8, 0.8))
    lp.type = 'lowpass'
    lp.frequency.value = 900
    lp.connect(g); g.connect(pan); pan.connect(this.n.events)
    const twice = Math.random() < 0.5, len = rand(0.2, 0.4)
    g.gain.value = 0
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      const t0 = t + i * (len + 0.08)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.035 * level, t0 + 0.01)
      g.gain.setValueAtTime(0.035 * level, t0 + len)
      g.gain.linearRampToValueAtTime(0, t0 + len + 0.03)
    }
    const end = t + (twice ? 2 : 1) * (len + 0.08) + 0.05
    for (const f of [400, 505].map((x) => x * rand(0.9, 1.1))) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(lp)
      o.start(t)
      o.stop(end)
    }
  }

  // sparrow: a few quick upward chirps
  bird(t) {
    const ctx = this.ctx, pan = makeStereo(ctx, rand(-0.9, 0.9)), n = 2 + Math.floor(Math.random() * 3)
    pan.connect(this.eng.buses.amb)
    const base = rand(3000, 3800)
    for (let i = 0; i < n; i++) {
      const t0 = t + i * rand(0.08, 0.13), o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.setValueAtTime(base, t0)
      o.frequency.exponentialRampToValueAtTime(base * 1.45, t0 + 0.045)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.018, t0 + 0.006)
      g.gain.linearRampToValueAtTime(0, t0 + 0.05)
      o.connect(g); g.connect(pan)
      o.start(t0)
      o.stop(t0 + 0.06)
    }
  }

  tick(now) {
    if (this.crk) {
      if (this.p.crickets) { this.crk.quietSince = 0; this.scheduleCrickets(now) }
      else if (!this.crk.quietSince) this.crk.quietSince = now
      else if (now - this.crk.quietSince > 3) this.dropCrickets()
    }
    if (!this.n) return
    if (this.kind === 'none') { if (now - this.idle > 3) this.teardown(); return }
    const p = this.p
    if (now > this.nextEv) { this.passBy(now + 0.05, p.events); this.nextEv = now + rand(5, 13) / Math.max(0.3, p.events) }
    if (p.birds && now > this.nextBird) { this.bird(now + 0.05); this.nextBird = now + rand(2.5, 9) }
    if (p.horns && now > this.nextHorn) { this.distantHorn(now + 0.05, p.horns); this.nextHorn = now + rand(18, 45) }
  }

  dropCrickets() {
    for (const c of this.crk.list) { try { c.o.stop() } catch (e) { /* stopped */ } }
    this.crk.gain.disconnect()
    this.crk = null
  }

  teardown() {
    for (const s of this.n.srcs) { try { s.stop() } catch (e) { /* stopped */ } }
    this.n.muffle.disconnect()
    this.n = null
    this.fallback = null
  }

  dispose() {
    if (this.crk) this.dropCrickets()
    if (this.n) this.teardown()
    this.kind = 'none'
  }
}
