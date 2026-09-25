// Low-level helpers shared by the audio modules: maths, generated buffers (noise,
// reverb impulse), wave tables, shaping curves and seamless loop preparation.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const rand = (a, b) => a + Math.random() * (b - a)
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// 'C#4' / 'Bb3' / 'e5' -> MIDI number (C4 = 60), null when unparsable
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name)
  if (!m) return null
  let pc = PC[m[1].toUpperCase()]
  if (m[2] === '#') pc++
  else if (m[2] === 'b') pc--
  return pc + (parseInt(m[3], 10) + 1) * 12
}

// 'C#' / 'Bb' -> pitch class 0..11
export function pitchClass(name) {
  let pc = PC[name[0].toUpperCase()]
  if (name[1] === '#') pc++
  else if (name[1] === 'b') pc--
  return (pc + 12) % 12
}

// Equal-power crossfade of the last `n` samples into the first `n`; the returned copy
// (length - n) loops without a seam.
function loopify(src, n) {
  const len = src.length - n
  const dst = new Float32Array(len)
  dst.set(src.subarray(0, len))
  for (let i = 0; i < n; i++) {
    const x = (i / n) * Math.PI / 2
    dst[i] = src[i] * Math.sin(x) + src[len + i] * Math.cos(x)
  }
  return dst
}

// Loopable mono noise, normalised to a common RMS so colours are interchangeable.
export function makeNoise(ctx, color = 'white', seconds = 2) {
  const sr = ctx.sampleRate, fade = Math.floor(sr * 0.05), n = Math.floor(sr * seconds) + fade
  const d = new Float32Array(n)
  if (color === 'pink') {
    // Paul Kellet's refined pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
      b6 = w * 0.115926
    }
  } else if (color === 'brown') {
    let last = 0
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last }
  } else {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  }
  let sum = 0, mean = 0
  for (let i = 0; i < n; i++) mean += d[i]
  mean /= n
  for (let i = 0; i < n; i++) { d[i] -= mean; sum += d[i] * d[i] }
  const k = 0.35 / Math.sqrt(sum / n)
  for (let i = 0; i < n; i++) d[i] *= k
  const buf = ctx.createBuffer(1, n - fade, sr)
  buf.getChannelData(0).set(loopify(d, fade))
  return buf
}

// Synthetic stereo room: pre-delay, a few early reflections and a darkening exponential tail.
export function makeImpulse(ctx, seconds = 2.2, rt60 = 1.7) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, n, sr)
  const pre = Math.floor(sr * 0.014)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let lp = 0
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr
      const k = 0.9 - 0.75 * Math.min(1, t / seconds) // high frequencies die first
      lp += k * ((Math.random() * 2 - 1) - lp)
      d[i] = lp * Math.exp(-6.9 * t / rt60) * Math.min(1, t / 0.008)
    }
    for (let r = 0; r < 12; r++) {
      const at = pre + Math.floor(sr * (0.003 + Math.random() * 0.075))
      if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.55 - r * 0.035)
    }
  }
  return buf
}

// Transparent up to `knee`, then a smooth tanh shoulder that never reaches 1.0.
// The curve spans inputs of +-range (feed it through a 1/range gain first).
export function clipperCurve(range = 2, knee = 0.8, n = 8192) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range, a = Math.abs(x)
    const y = a <= knee ? a : knee + (1 - knee) * 0.98 * Math.tanh((a - knee) / (1 - knee))
    c[i] = Math.sign(x) * y
  }
  return c
}

// Symmetric tanh saturation normalised to +-1 (for grit on horns, engines, gruff voices).
export function driveCurve(amount = 2, n = 1024) {
  const c = new Float32Array(n), k = Math.tanh(amount)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / k }
  return c
}

// Delayed vibrato as a detune curve (cents) for setValueCurveAtTime.
export function vibratoCurve(dur, rate = 5.5, depth = 15, delay = 0.15) {
  const n = Math.max(3, Math.ceil(dur * 64))
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * dur
    c[i] = Math.sin(2 * Math.PI * rate * t) * depth * clamp((t - delay) / 0.3, 0, 1)
  }
  return c
}

// Wave tables for timbres that plain oscillator types can't do.
export function makeWaves(ctx) {
  const wave = (amps, phaseCos = false) => {
    const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1)
    amps.forEach((a, i) => { if (phaseCos) real[i + 1] = a; else imag[i + 1] = a })
    return ctx.createPeriodicWave(real, imag)
  }
  const reed = [], clar = [], pulse = [], brass = []
  for (let h = 1; h <= 28; h++) {
    // free-reed: bright 1/n spectrum, weaker even partials, nasal bump around 3..6
    reed.push((1 / h) * (h % 2 ? 1 : 0.62) * (h >= 3 && h <= 6 ? 1.5 : 1))
    // clarinet: odd harmonics dominate, soft top end
    clar.push(h % 2 ? 1 / Math.pow(h, 1.1) : (h < 8 ? 0.04 / h : 0))
    // 25% pulse (cheap phone buzzer): cosine series (2 / n pi) sin(n pi d)
    pulse.push((2 / (h * Math.PI)) * Math.sin(h * Math.PI * 0.25))
    brass.push(1 / Math.pow(h, 0.85))
  }
  return {
    reed: wave(reed),
    clar: wave(clar),
    pulse: wave(pulse, true),
    brass: wave(brass),
    flute: wave([1, 0.14, 0.06, 0.025, 0.01]),
    ep: wave([1, 0.42, 0.16, 0.09, 0.05, 0.035, 0.02, 0.015]),
  }
}

// Shared synthesis kit handed to instruments and recipes: noise buffers, wave tables,
// cached shaping / vibrato curves and a noise-source factory.
export function makeKit(ctx) {
  const noise = { white: makeNoise(ctx, 'white', 2), pink: makeNoise(ctx, 'pink', 2), brown: makeNoise(ctx, 'brown', 3) }
  const drives = new Map(), vibs = new Map()
  return {
    ctx,
    noise,
    waves: makeWaves(ctx),
    drive(a) {
      const key = Math.round(a * 10)
      if (!drives.has(key)) drives.set(key, driveCurve(key / 10))
      return drives.get(key)
    },
    vib(dur, rate, depth, delay) {
      const q = Math.max(1, Math.round(dur * 50)), key = `${q}|${rate}|${depth}|${delay}`
      if (!vibs.has(key)) {
        if (vibs.size > 300) vibs.clear()
        vibs.set(key, vibratoCurve(q / 50, rate, depth, delay))
      }
      return vibs.get(key)
    },
    // looping noise source started at t (random offset) and stopped after dur
    noiseSrc(color, t, dur) {
      const s = ctx.createBufferSource()
      s.buffer = noise[color] || noise.white
      s.loop = true
      s.start(t, Math.random() * (s.buffer.duration - 0.05))
      s.stop(t + dur + 0.02)
      return s
    },
  }
}

// Positions a PannerNode / AudioListener; `tau` smooths moving sources.
export function setPannerPos(p, x, y, z, t, tau) {
  if (p.positionX) {
    if (tau) { p.positionX.setTargetAtTime(x, t, tau); p.positionY.setTargetAtTime(y, t, tau); p.positionZ.setTargetAtTime(z, t, tau) }
    else { p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t) }
  } else if (p.setPosition) p.setPosition(x, y, z)
}

export function makePanner(ctx, ref = 6, max = 120) {
  const p = ctx.createPanner()
  p.panningModel = 'equalpower'
  p.distanceModel = 'inverse'
  p.refDistance = ref
  p.maxDistance = max
  p.rolloffFactor = 1
  return p
}

// Stereo panner with a graceful fallback for engines without StereoPannerNode.
export function makeStereo(ctx, pan = 0) {
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; return p }
  return ctx.createGain()
}
