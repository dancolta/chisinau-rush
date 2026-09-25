// The procedural score. Each track: tempo grid, chord chart, melodies (note strings, one
// token per grid step unless ':len' is given, '|' marks bars), a per-part mix, optional
// setup() for sustained layers, and step(p, s) which the scheduler calls on every grid step.
// p = TrackPlayer (note/hit/chord/mel helpers), s = { t, k, i, bar, st, loop }.
import { voicing, bassOf, voiceLead, diatonic, SCALES } from './Theory.js'

const repeatRest = (bars, steps) => Array(bars).fill(`-:${steps}`).join(' | ')

// ---- chase: Moldovan/Balkan brass-band sârbă, D harmonic minor, 2/4 -------------------------
const chase = {
  gain: 0.5,
  bpm: 156, sub: 4, beats: 2, bars: 32,
  mix: {
    acc: { gain: 0.3, pan: 0.12, lp: 3600, rev: 0.12 },
    clar: { gain: 0.34, pan: -0.12, lp: 3000, rev: 0.12 },
    bass: { gain: 0.5, lp: 1200 },
    stab: { gain: 0.15, pan: -0.3, lp: 2600 },
    drums: { gain: 0.5 },
  },
  chords: 'Dm | Dm | A7 | Dm | Gm | Dm | A7 | Dm | Dm | Dm | A7 | Dm | Gm | Dm | A7 | Dm | ' +
    'F | C7 | F | A7 | Gm | Dm | A7 | Dm | Bb | A7 | Dm | Dm | Gm | A7 | Dm | A7',
  mel: {
    lead: `A4 D5 F5 E5 D5 C#5 D5 A4 | F4 A4 D5 F5 A5:2 F5:2 | E5 C#5 A4 C#5 E5 G5 F5 E5 | F5 E5 D5 C#5 D5:2 -:2 |
      D5 G5 Bb5 A5 G5 F5 E5 D5 | A4 D5 F5 A5 Bb5 A5 G5 F5 | E5 F5 E5 D5 C#5 Bb4 A4 G4 | F5 E5 D5:2 A4:2 D5:2 |
      D5:2 F5:2 A5:3 G5 | F5 G5 A5 G5 F5 E5 F5 D5 | C#5:2 E5:2 G5:2 E5:2 | F5 E5 D5 E5 F5 G5 A5:2 |
      Bb5:2 A5 G5 D5:2 G5:2 | A5:2 F5 E5 D5:2 F5:2 | E5 D5 C#5 D5 E5 F5 G5 E5 | D5:4 -:2 A4:2 |
      C5 F5 A5 F5 C5 F5 A5 C6 | Bb5 A5 G5 A5 Bb5 G5 E5 C5 | A5:2 G5 F5 C5:2 F5:2 | E5 F5 E5 D5 C#5:2 A4:2 |
      G4 Bb4 D5 G5 F5 E5 D5 Bb4 | A4 D5 F5 A5 G5 F5 E5 D5 | C#5 E5 A5 G5 F5 E5 D5 C#5 | D5:2 A4:2 D5:2 -:2 |
      F5 D5 Bb4 D5 F5 Bb5 A5 G5 | A5 G5 F5 E5 C#5 E5 A5:2 | D6:2 C#6 D6 A5:2 F5:2 | E5 F5 G5 A5 Bb5 A5 G5 F5 |
      G5:2 D5:2 Bb4:2 G4:2 | A4 C#5 E5 G5 A5 G5 F5 E5 | D5 E5 F5 E5 D5 C#5 D5 A4 | C#5:2 E5:2 A4:2 -:2`,
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    // tuba oom-pah: root on beat one, fifth on beat two
    if (st === 0) p.note('bass', 'tuba', bassOf(ch), 1.7, 1, t)
    else if (st === 4) p.note('bass', 'tuba', bassOf(ch, 'fifth'), 1.7, 0.85, t)
    // brass "pah" on every off-beat
    if (st === 2 || st === 6) for (const m of voicing(ch, 60, 2)) p.note('stab', 'brass', m, 0.9, 0.6, t, { stab: true, prio: 1 })
    // tapan on the beats, snare on the off-beats, a roll into every 8-bar phrase
    if (st === 0 || st === 4) p.hit('tapan', st === 0 ? 1 : 0.8, t)
    if (bar % 8 === 7 && st >= 4) p.hit('snare', 0.32 + (st - 4) * 0.09, t)
    else if (st === 2 || st === 6) p.hit('snare', 0.5, t)
    else if (st === 7 && bar % 2) p.hit('snare', 0.18, t)
    if (bar === 0 && st === 0 && loop > 0) p.hit('crash', 0.5, t)
    // accordion and clarinet trade 8-bar phrases (roles swap every loop); both in the last one
    const sec = bar >> 3
    const acc = (sec % 2 === 0) === (loop % 2 === 0)
    for (const e of p.mel('lead', s)) {
      if (acc || sec === 3) p.note('acc', 'accordion', e.midi - (acc ? 0 : 12), e.len * 0.9, 1, t, { prio: 2 })
      if (!acc) p.note('clar', 'clarinet', e.midi, e.len * 0.92, 1, t, { prio: 2 })
    }
  },
}

// ---- city_day: laid-back 90 BPM groove, F major, swung 16ths --------------------------------
const COMP = new Map([[0, 3], [7, 2], [10, 2], [14, 1]]) // step -> length
const cityDay = {
  gain: 0.85,
  bpm: 90, sub: 4, beats: 4, bars: 16, swing: 0.16,
  mix: {
    keys: { gain: 0.2, pan: -0.25, lp: 4200, rev: 0.2 },
    hook: { gain: 0.3, pan: 0.2, lp: 5200, rev: 0.25, delay: 0.18 },
    bass: { gain: 0.46, lp: 1400 },
    drums: { gain: 0.42 },
  },
  delay: { time: 3 / 4, feedback: 0.3 }, // in beats
  chords: 'Fmaj7 | Dm7 | Gm7 | C7 | Am7 | Dm7 | Gm7 C7 | F6 | Bbmaj7 | Am7 | Gm7 | Fmaj7 | Bbmaj7 | Am7 D7 | Gm7 | C7sus4 C7',
  mel: {
    hook: `-:4 C5:2 D5:2 F5:3 E5:1 -:4 | D5:2 C5:2 A4:4 -:8 | -:4 Bb4:2 C5:2 D5:3 F5:1 -:4 | E5:2 D5:2 C5:4 -:8 |
      -:4 C5:2 D5:2 E5:3 G5:1 -:2 A5:2 | G5:2 F5:2 D5:4 -:4 C5:2 D5:2 | F5:3 E5:1 D5:2 C5:2 Bb4:2 C5:2 E5:4 | F5:6 -:10 |
      -:2 D5:2 F5:2 A5:4 G5:2 F5:2 D5:2 | E5:4 C5:2 A4:2 -:8 | -:2 Bb4:2 D5:2 F5:4 E5:2 D5:2 Bb4:2 | C5:4 A4:4 -:8 |
      -:2 F5:2 G5:2 A5:3 C6:1 A5:2 G5:2 F5:2 | G5:2 E5:2 C5:4 F#5:2 D5:2 C5:4 | Bb4:3 D5:1 F5:4 D5:2 Bb4:2 G4:4 | F5:4 -:4 E5:2 D5:2 C5:2 Bb4:2`,
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    if (COMP.has(st)) for (const m of voicing(ch, 57, 3)) p.note('keys', 'ep', m, COMP.get(st), st === 14 ? 0.45 : 0.65, t, { prio: 1 })
    // bass: root / ghost root / fifth per half bar, chromatic approach into the next chord
    const next = p.chordAt(bar + 1, 0)
    const half = st & 7
    if (st === 14 && next.bass !== ch.bass) p.note('bass', 'bass', bassOf(next, 'root', 36) - 1, 2, 0.75, t)
    else if (half === 0) p.note('bass', 'bass', bassOf(ch, 'root', 36), 3, 1, t)
    else if (half === 3) p.note('bass', 'bass', bassOf(ch, 'root', 36), 1, 0.5, t)
    else if (half === 6) p.note('bass', 'bass', bassOf(ch, 'fifth', 36), 2, 0.8, t)
    // soft drums
    if (st === 0 || st === 10) p.hit('kick', 0.8, t, { soft: true })
    else if (st === 7) p.hit('kick', 0.45, t, { soft: true })
    if (st === 4 || st === 12) p.hit('snare', 0.42, t, { lofi: true })
    if (st % 2 === 0) p.hit('shaker', st % 4 === 2 ? 0.55 : 0.32, t)
    if (st === 14 && bar % 2) p.hit('hat', 0.3, t, { open: true })
    if (st === 15 && bar % 8 === 7) p.hit('snare', 0.2, t, { lofi: true })
    // hook enters after a 4-bar intro; FM keys first time round, țambal the next
    if (loop === 0 && bar < 4) return
    for (const e of p.mel('hook', s)) p.note('hook', loop % 2 ? 'cimbalom' : 'keys', e.midi, e.len * 0.95, 0.9, t, { prio: 2 })
  },
}

// ---- city_night: moody pads + slow arpeggio, C minor, 80 BPM ---------------------------------
const cityNight = {
  gain: 0.46,
  bpm: 80, sub: 4, beats: 4, bars: 16, swing: 0.08,
  mix: {
    pad: { gain: 0.36, rev: 0.35 },
    arp: { gain: 0.16, pan: 0.3, lp: 3000, rev: 0.3, delay: 0.4 },
    lead: { gain: 0.24, pan: -0.15, lp: 3500, rev: 0.4, delay: 0.3 },
    bass: { gain: 0.5, lp: 600 },
    drums: { gain: 0.34 },
  },
  delay: { time: 3 / 4, feedback: 0.38 },
  chords: 'Cm9 | Abmaj7 | Ebmaj7 | Bb6 | Cm9 | Abmaj7 | Fm9 | G7sus4 G7 | Abmaj7 | Bb6 | Gm7 | Cm9 | Fm9 | Bb7 | Ebmaj7 Abmaj7 | G7',
  mel: {
    lead: repeatRest(8, 16) + ` | G5:8 Eb5:4 C5:4 | D5:12 F5:4 | G5:8 F5:4 D5:4 | Eb5:12 -:4 |
      C6:8 Ab5:4 G5:4 | F5:8 D5:4 Bb4:4 | G5:6 Bb5:2 C6:8 | B5:8 G5:4 -:4`,
  },
  setup(p, t) {
    p.st.pad = p.pad('pad', 4, { cutoff: 1100, lfoDepth: 420, lfoRate: 0.045, chorus: true, gain: 0.55 })
    p.st.pad.start(t)
    p.st.pad.level(t, 1, 1.5)
    p.base = 4
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    if (ch !== p.st.ch) {
      p.st.voices = voiceLead(p.st.voices, ch, 4, 55, 77)
      p.st.pad.set(t, p.st.voices, 0.12)
      p.st.ch = ch
    }
    const intro = loop === 0 && bar < 2
    // two-octave up/down arpeggio in 8ths
    if (st % 2 === 0 && !intro) {
      const one = voicing(ch, 60, Math.min(4, ch.ivs.length))
      const notes = one.concat(one.map((m) => m + 12))
      const cyc = notes.length * 2 - 2, i = (s.k / 2) % cyc
      p.note('arp', 'pluck', notes[i < notes.length ? i : cyc - i], 1.5, 0.6, t, { prio: 1, wave: 'square', decay: 0.2 })
    }
    if (st === 0) p.note('bass', 'subbass', bassOf(ch, 'root', 36), p.chordAt(bar, 8) !== ch ? 7.5 : 11.5, 1, t)
    else if (st === 8 && p.chordAt(bar, 8) !== p.chordAt(bar, 0)) p.note('bass', 'subbass', bassOf(ch, 'root', 36), 7.5, 1, t)
    else if (st === 12 && p.chordAt(bar, 8) === p.chordAt(bar, 0)) p.note('bass', 'subbass', bassOf(ch, 'fifth', 36), 3.5, 0.8, t)
    if (!intro && !(loop === 0 && bar < 4)) {
      if (st === 0) p.hit('kick', 0.85, t, { soft: true })
      if (st === 10) p.hit('kick', 0.5, t, { soft: true })
      if (st === 8) p.hit('clap', 0.5, t)
      if (st % 2 === 0) p.hit('hat', st % 4 === 2 ? 0.35 : 0.2, t)
      if (st === 14 && bar % 4 === 3) p.hit('hat', 0.3, t, { open: true })
    }
    for (const e of p.mel('lead', s)) p.note('lead', 'softlead', e.midi, e.len * 0.95, 0.9, t, { prio: 2 })
  },
}

// ---- menu: nostalgic accordion waltz, A minor, 3/4 (eighth-note grid) -----------------------
const menu = {
  gain: 0.81,
  bpm: 152, sub: 2, beats: 3, bars: 32,
  mix: {
    lead: { gain: 0.34, pan: 0.1, lp: 3200, rev: 0.25 },
    bass: { gain: 0.34, pan: -0.1, lp: 900 },
    chords: { gain: 0.13, pan: -0.2, lp: 2200 },
    drums: { gain: 0.3 },
  },
  chords: 'Am | Am | Dm | Dm | G7 | G7 | C | C | F | F | Dm | Dm | E7 | E7 | Am | Am | ' +
    'A7 | A7 | Dm | Dm | G7 | G7 | C | E7 | Am | Am | Dm | F | E7 | E7 | Am | E7',
  mel: {
    lead: `E5:4 A5:2 | C6:4 B5:2 | A5:4 F5:2 | D5:6 | D5:2 G5:2 B5:2 | D6:4 C6:2 | B5:2 C6:2 G5:2 | E5:6 |
      C6:4 A5:2 | F5:4 A5:2 | D6:4 C6:2 | A5:4 F5:2 | E5:2 G#5:2 B5:2 | D6:4 B5:2 | C6:2 B5:2 A5:2 | A5:6 |
      A4:2 C#5:2 E5:2 | G5:4 F5:1 E5:1 | F5:4 D5:2 | A5:4 G5:1 F5:1 | F5:2 D5:2 B4:2 | G5:4 F5:1 E5:1 | E5:4 G5:2 | G#5:4 E5:2 |
      A5:4 C6:2 | E6:4 D6:1 C6:1 | D6:4 A5:2 | C6:4 A5:2 | B5:2 G#5:2 E5:2 | D6:2 B5:2 G#5:2 | A5:6 | -:2 B4:2 D5:2`,
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    // oom-pah-pah: bass button (root / fifth alternating), chord buttons on beats 2 and 3
    if (st === 0) p.note('bass', 'reed', bassOf(ch, bar % 2 ? 'fifth' : 'root', 40), 1.7, 1, t)
    if (st === 2 || st === 4) for (const m of voicing(ch, 55, 3)) p.note('chords', 'reed', m, 1.1, st === 2 ? 0.85 : 0.7, t, { prio: 1 })
    const b = bar >= 16
    if (b && (st === 2 || st === 4)) p.hit('brush', st === 2 ? 0.35 : 0.25, t)
    for (const e of p.mel('lead', s)) p.note('lead', b && loop % 2 ? 'clarinet' : 'accordion', e.midi, e.len * 0.96, 0.95, t, { prio: 2 })
  },
}

// ---- tension: drone, heartbeat, ticking clock; ostinato + dissonance in the B half ----------
const OST = [38, 38, 38, 39, 38, 38, 38, 36]
const tension = {
  gain: 0.37,
  bpm: 66, sub: 4, beats: 4, bars: 16,
  mix: {
    drone: { gain: 0.5 },
    ost: { gain: 0.3, lp: 1500 },
    str: { gain: 0.1, pan: 0.2, rev: 0.5 },
    drums: { gain: 0.55, rev: 0.15 },
  },
  chords: 'Dm',
  setup(p, t) {
    p.st.drone = p.pad('drone', 2, { cutoff: 300, q: 2, lfoRate: 0.06, lfoDepth: 140, spread: 5, gain: 0.8 })
    p.st.drone.set(t, [38, 45])
    p.st.drone.start(t)
    p.st.drone.level(t, 1, 1.5)
    p.st.sub = p.pad('drone', 1, { wave: 'sine', cutoff: 200, lfoDepth: 0, gain: 0.5 })
    p.st.sub.set(t, [26])
    p.st.sub.start(t)
    p.st.sub.level(t, 1, 2)
    p.base = 3
  },
  step(p, s) {
    const { st, bar, t } = s
    const B = bar >= 8
    if (st % 4 === 0) p.hit('heart', 1, t)
    else if (st % 4 === 1) p.hit('heart', 0.6, t)
    if (st % 2 === 0) p.hit('tick', st % 4 ? 0.45 : 0.6, t, { tock: st % 4 === 2 })
    if (B && st % 2 === 0) p.note('ost', 'ostinato', OST[st / 2], 1.2, st === 0 ? 1 : 0.75, t, { prio: 2 })
    if (B && st === 0 && bar % 4 === 0) {
      const lo = bar === 8 ? 74 : 69
      p.note('str', 'strings', lo, 62, 0.8, t, { prio: 1 })
      p.note('str', 'strings', lo + 1, 62, 0.7, t, { prio: 1 })
    }
    if (st === 0 && bar % 4 === 3) p.hit('swell', 0.8, t, { dur: p.barDur })
    if (st === 0 && bar % 4 === 0) p.hit('boom', 1, t)
    if (st === 0 && (bar === 0 || bar === 8)) p.st.drone.cutoff(t, B ? 560 : 300)
  },
}

// ---- finale: triumphant brass march, B-flat major -------------------------------------------
const SNARE = [1, 0, 0.45, 0, 0.8, 0, 0.45, 0.35, 0.9, 0, 0.45, 0, 0.8, 0, 0.55, 0.45]
const BB = SCALES.of(10)
const finale = {
  gain: 0.82,
  bpm: 116, sub: 4, beats: 4, bars: 16,
  mix: {
    lead: { gain: 0.3, pan: 0.05, lp: 5000, rev: 0.22 },
    lead2: { gain: 0.22, pan: -0.2, lp: 3500, rev: 0.22 },
    horns: { gain: 0.14, pan: 0.25, lp: 2400, rev: 0.2 },
    bass: { gain: 0.46, lp: 1000 },
    drums: { gain: 0.46, rev: 0.12 },
  },
  chords: 'Bb | Bb | Eb | Bb | Gm | Cm7 F7 | Bb | F7 | Eb | Bb | Cm7 F7 | Bb | Gm | Eb | F7 | Bb',
  mel: {
    lead: `F4:3 Bb4:1 D5:4 F5:6 D5:2 | Bb5:8 F5:4 D5:4 | Eb5:3 F5:1 G5:4 Bb5:6 G5:2 | F5:8 D5:4 Bb4:4 |
      D5:3 D5:1 G5:4 Bb5:4 A5:2 G5:2 | G5:4 Eb5:4 F5:4 A5:4 | Bb5:6 A5:1 G5:1 F5:4 D5:4 | C5:3 D5:1 Eb5:4 F5:4 A4:4 |
      G5:3 G5:1 G5:4 Bb5:4 G5:4 | F5:3 F5:1 F5:4 D5:8 | Eb5:3 Eb5:1 G5:4 C5:4 A4:4 | Bb4:3 D5:1 F5:4 Bb5:8 |
      D6:6 C6:1 Bb5:1 A5:4 G5:4 | G5:6 F5:1 Eb5:1 Bb5:8 | A5:3 Bb5:1 C6:4 A5:4 F5:4 | Bb5:12 -:4`,
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    const split = p.chordAt(bar, 8) !== p.chordAt(bar, 0)
    if (st === 0) p.note('bass', 'tuba', bassOf(ch), 3.4, 1, t)
    if (st === 8) p.note('bass', 'tuba', bassOf(ch, split ? 'root' : 'fifth'), 3.4, 0.85, t)
    if (st === 4 || st === 12) {
      for (const m of voicing(ch, 58, 3)) p.note('horns', 'brass', m, 2, 0.5, t, { stab: true, prio: 1, bright: 0.6 })
      p.hit('crash', 0.22, t, { choke: true })
    }
    if (st === 0 || st === 8) p.hit('bassdrum', st ? 0.8 : 1, t)
    if (SNARE[st]) p.hit('snare', SNARE[st] * 0.5, t)
    if ((bar === 0 || bar === 8) && st === 0) p.hit('crash', 0.55, t)
    if (bar === 15 && st >= 8) p.hit('timp', 0.35 + (st - 8) * 0.08, t, { midi: 41 })
    for (const e of p.mel('lead', s)) {
      p.note('lead', 'brass', e.midi, e.len * 0.9, 1, t, { prio: 2 })
      if (bar >= 8 || loop % 2) p.note('lead2', 'brass', diatonic(e.midi, -2, BB), e.len * 0.9, 0.75, t, { prio: 2, bright: 0.7 })
    }
  },
}

// ---- credits: fast hora in 7/8 (2+2+3), D major; nai, accordion and țambal take turns --------
const credits = {
  gain: 0.62,
  bpm: 165, sub: 2, steps: 7, bars: 32,
  mix: {
    lead: { gain: 0.3, pan: 0.1, lp: 5000, rev: 0.22 },
    lead2: { gain: 0.2, pan: -0.15, lp: 3000, rev: 0.15 },
    chords: { gain: 0.12, pan: -0.25, lp: 2400 },
    bass: { gain: 0.46, lp: 1100 },
    drums: { gain: 0.42 },
  },
  chords: 'D | D | G | D | Bm | Em | A7 | D | D | D | G | D | Bm | Em | A7 | D | ' +
    'G | G | D | D | A7 | A7 | D | D | G | G | D | Bm | Em | A7 | D | D',
  mel: {
    lead: `F#5 A5 D6 A5 F#5 A5 F#5 | E5 F#5 G5 F#5 E5:2 D5 | D5 G5 B5 G5 D6:2 B5 | A5:2 F#5:2 D5:3 |
      D5 F#5 B5 A5 G5 F#5 E5 | E5 G5 B5 G5 E5:3 | C#5 E5 A5 G5 F#5 E5 C#5 | D5:2 A4:2 D5:3 |
      A5 F#5 A5 D6 C#6 D6 A5 | F#5 E5 D5 E5 F#5 G5 A5 | B5 D6 B5 G5 B5:2 G5 | A5 F#5 D5 F#5 A5:3 |
      B5 A5 G5 F#5 D5 F#5 B5 | G5 F#5 E5 D5 E5 G5 B5 | A5 G5 E5 C#5 E5 G5 E5 | D5:2 F#5:2 D5:2 - |
      B4 D5 G5 B5 A5 G5 F#5 | G5:2 D5:2 B4 D5 G5 | A5 F#5 D5 F#5 A5 B5 A5 | F#5:2 A5:2 D6:3 |
      C#6 B5 A5 G5 E5 G5 A5 | G5 F#5 E5 D5 C#5 E5 G5 | F#5 A5 D6 C#6 B5 A5 F#5 | D5:2 D6:2 D5:3 |
      D6 B5 G5 B5 D6 E6 D6 | B5:2 G5:2 D5 E5 F#5 | A5 F#5 D5 F#5 A5 F#5 D5 | B4 D5 F#5 B5 A5 F#5 D5 |
      E5 G5 B5 E6 D6 B5 G5 | A5 C#6 E6 C#6 A5 G5 E5 | F#5 A5 D6 A5 F#5 E5 D5 | D5:2 A4:2 D5:2 -`,
  },
  step(p, s) {
    const { st, bar, t, loop } = s
    const ch = p.chord(s)
    if (st === 0 || st === 4) p.note('bass', 'tuba', bassOf(ch), st ? 2.4 : 1.6, 1, t)
    if (st === 2) p.note('bass', 'tuba', bassOf(ch, 'fifth'), 1.6, 0.85, t)
    if (st === 1 || st === 3 || st === 5 || st === 6) for (const m of voicing(ch, 62, 2)) p.note('chords', 'reed', m, 0.75, st === 6 ? 0.5 : 0.7, t, { prio: 1 })
    if (st === 0 || st === 2 || st === 4) p.hit('kick', st ? 0.75 : 1, t)
    else p.hit('rim', st === 6 ? 0.35 : 0.5, t)
    p.hit('tamb', st === 0 || st === 2 || st === 4 ? 0.5 : 0.3, t)
    if (bar % 8 === 0 && st === 0) p.hit('crash', 0.4, t)
    const sec = bar >> 3
    const lead = sec === 2 ? 'cimbalom' : (sec + loop) % 2 ? 'accordion' : 'nai'
    for (const e of p.mel('lead', s)) {
      p.note('lead', lead, e.midi, e.len * 0.9, 1, t, { prio: 2 })
      if (sec === 3) p.note('lead2', 'accordion', e.midi - 12, e.len * 0.9, 0.7, t, { prio: 2 })
    }
  },
}

export const TRACKS = { chase, city_day: cityDay, city_night: cityNight, menu, tension, finale, credits }
