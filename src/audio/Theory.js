// Tiny music-theory toolkit for the procedural score: chord symbols, note sequences,
// voicings and voice-leading. Pure functions, no Web Audio.
import { noteToMidi, pitchClass } from './dsp.js'

const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], '7b9': [0, 4, 7, 10, 13],
}

// 'F#m7' / 'Bb' / 'C/E' -> { sym, root, bass, ivs, pcs }
export function parseChord(sym) {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym)
  const ivs = m && QUALITY[m[2]]
  if (!ivs) throw new Error(`audio: bad chord "${sym}"`)
  const root = pitchClass(m[1])
  return { sym, root, bass: m[3] ? pitchClass(m[3]) : root, ivs, pcs: ivs.map((i) => (root + i) % 12) }
}

// 'Dm | Gm7 C7 | F' -> per bar: [{ at: stepInBar, chord }]
export function progression(str, stepsPerBar) {
  return str.split('|').map((bar) => {
    const syms = bar.trim().split(/\s+/).filter(Boolean)
    return syms.map((s, i) => ({ at: Math.round((i * stepsPerBar) / syms.length), chord: parseChord(s) }))
  })
}

export function chordAt(prog, bar, st) {
  const b = prog[((bar % prog.length) + prog.length) % prog.length]
  let c = b[0].chord
  for (const e of b) if (e.at <= st) c = e.chord
  return c
}

// Note sequence: 'A4 D5:2 -:2 ~:1 | ...' (len in grid steps, '-' rest, '~' tie, '|' bar check)
export function seq(str, stepsPerBar) {
  const at = new Map(), bad = []
  let pos = 0, barStart = 0, last = null, bar = 0
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') {
      if (pos - barStart !== stepsPerBar) bad.push(`bar ${bar + 1}: ${pos - barStart} steps`)
      barStart = pos; bar++
      continue
    }
    const [n, l] = tok.split(':')
    const len = l ? Number(l) : 1
    if (n === '-') last = null
    else if (n === '~') { if (last) last.len += len }
    else {
      const midi = noteToMidi(n)
      if (midi === null || !(len > 0)) throw new Error(`audio: bad note "${tok}"`)
      last = { midi, len }
      if (!at.has(pos)) at.set(pos, [])
      at.get(pos).push(last)
    }
    pos += len
  }
  if (pos !== barStart && pos - barStart !== stepsPerBar) bad.push(`bar ${bar + 1}: ${pos - barStart} steps`)
  return { at, length: pos, bad }
}

// Chord tones worth keeping when only n voices are available. Every arrangement has a bass
// on the root, so voicings go rootless first, then drop the 5th. Two voices get the guide
// tones: 3rd (or sus) + 7th/6th (or 5th for plain triads).
function thin(ivs, n) {
  if (ivs.length <= n) return ivs.slice()
  if (n === 2) {
    const third = ivs.find((i) => i === 3 || i === 4) ?? ivs.find((i) => i === 5 || i === 2) ?? ivs[0]
    const top = ivs.find((i) => i === 9 || i === 10 || i === 11) ?? ivs.find((i) => i >= 6 && i <= 8) ?? ivs[ivs.length - 1]
    return [third, top]
  }
  const pick = ivs.filter((i) => i !== 0)
  while (pick.length > n) {
    const i5 = pick.indexOf(7)
    if (i5 >= 0) pick.splice(i5, 1)
    else pick.pop()
  }
  return pick
}

// Close-position voicing: n chord tones stacked upward from `lo`.
export function voicing(ch, lo, n = 3) {
  return thin(ch.ivs, n).map((iv) => {
    const pc = (ch.root + iv) % 12
    return lo + ((pc - lo) % 12 + 12) % 12
  }).sort((a, b) => a - b)
}

// Bass note (root or fifth) folded into [lo, lo + 12).
export function bassOf(ch, which = 'root', lo = 34) {
  const pc = which === 'fifth' ? (ch.root + (ch.ivs.includes(6) ? 6 : 7)) % 12 : ch.bass
  return lo + ((pc - lo) % 12 + 12) % 12
}

// Open voicing for pads: ascending chord tones at least `gap` semitones apart.
export function spread(ch, lo, n, gap = 3) {
  const pcs = thin(ch.ivs, n).map((iv) => (ch.root + iv) % 12)
  const out = []
  let m = lo
  while (out.length < n && pcs.length) {
    let best = null
    for (const pc of pcs) { const c = m + ((pc - m) % 12 + 12) % 12; if (best === null || c < best) best = c }
    out.push(best)
    pcs.splice(pcs.indexOf(best % 12), 1)
    m = best + gap
  }
  return out
}

// Move each of the previous voices to the nearest free chord tone in [lo, hi],
// avoiding doubled pitch classes and semitone rubs between voices.
export function voiceLead(prev, ch, n, lo, hi) {
  const pcs = thin(ch.ivs, n).map((iv) => (ch.root + iv) % 12)
  if (!prev) return spread(ch, lo, n)
  const out = new Array(prev.length), usedPc = new Set(), used = new Set()
  const order = prev.map((_, i) => i).sort((a, b) => prev[a] - prev[b])
  for (const i of order) {
    let best = prev[i], bd = Infinity
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12
      if (!pcs.includes(pc) || used.has(m)) continue
      let d = Math.abs(m - prev[i]) + (usedPc.has(pc) ? 3 : 0)
      for (const u of used) if (Math.abs(u - m) === 1) d += 1.5
      if (d < bd) { bd = d; best = m }
    }
    out[i] = best; used.add(best); usedPc.add(best % 12)
  }
  return out
}

// Diatonic transposition by `steps` scale degrees (negative = down).
export function diatonic(midi, steps, scale) {
  const notes = []
  for (let m = midi - 36; m <= midi + 36; m++) if (scale.includes(m % 12)) notes.push(m)
  let i = notes.findIndex((m) => m >= midi)
  if (i < 0) i = notes.length - 1
  if (notes[i] !== midi && i > 0) i--
  return notes[Math.max(0, Math.min(notes.length - 1, i + steps))]
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  of(root, kind = 'major') { return SCALES[kind].map((x) => (x + root) % 12) },
}
