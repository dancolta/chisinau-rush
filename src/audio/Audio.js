// Chișinău Rush audio engine (Web Audio). Owns the AudioContext, the bus graph, decoded
// Kenney samples and the subsystems: one-shot sfx, vehicles, procedural music, ambience
// and dialogue voices. Every public method is safe to call at any time: without a running
// context it quietly does nothing.
//
//   sfx, ui, voice, ambience buses ──────────────┐
//   music tracks → duck → sting duck → music bus ─┼→ master → glue comp → limiter → soft clipper → out
//   stingers ───────────────────────→ music bus   │
//   sfx + music reverb sends → convolver (generated room) ┘
import { clamp, makeKit, makeImpulse, clipperCurve, makePanner, setPannerPos } from './dsp.js'
import { Shot, RECIPES, UI_SOUNDS } from './Sfx.js'
import { Music, STINGERS } from './Music.js'
import { VehicleAudio } from './VehicleAudio.js'
import { Ambience } from './Ambience.js'
import { Voices } from './Voice.js'

const DEV = !!(import.meta.env && import.meta.env.DEV)
const MAX_PER_NAME = 6 // overlapping voices of one sound
const MIN_GAP = 0.025 // seconds between triggers of one sound
const MAX_DIST = 125 // positional one-shots further than this are skipped
const LOOPS = { engine: 0.08, 'engine-motorcycle': 0.08, skid: 0.06, ambience: 0.6 }
const NOOP = () => {}
const GESTURES = ['pointerdown', 'keydown', 'touchend']

function warn(...a) { if (DEV) console.warn('[audio]', ...a) }

// Crossfade a sample's tail into its head in place; returns the seamless loop end (s).
function prepareLoop(buf, fade) {
  const n = Math.floor(fade * buf.sampleRate), len = buf.length - n
  if (len < n * 3) return buf.duration
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) {
      const x = (i / n) * Math.PI / 2
      d[i] = d[i] * Math.sin(x) + d[len + i] * Math.cos(x)
    }
  }
  return len / buf.sampleRate
}

// Find the individual footsteps in the Kenney "walking" take.
function sliceSteps(buf) {
  if (!buf) return []
  const d = buf.getChannelData(0), sr = buf.sampleRate, w = Math.floor(sr * 0.005)
  const env = []
  for (let i = 0; i + w <= d.length; i += w) {
    let s = 0
    for (let j = i; j < i + w; j++) s += d[j] * d[j]
    env.push(Math.sqrt(s / w))
  }
  const max = Math.max(0, ...env)
  if (!max) return []
  const steps = []
  let quiet = 99
  env.forEach((e, i) => {
    if (e > max * 0.25 && quiet >= 6) { steps.push({ start: Math.max(0, (i - 2) * w) / sr }); quiet = 0 }
    quiet = e < max * 0.08 ? quiet + 1 : 0
  })
  steps.forEach((st, i) => {
    const next = i + 1 < steps.length ? steps[i + 1].start : buf.duration
    st.dur = Math.min(0.2, next - st.start - 0.005)
    let pk = 0
    for (let j = Math.floor(st.start * sr); j < Math.min(d.length, (st.start + st.dur) * sr); j++) pk = Math.max(pk, Math.abs(d[j]))
    st.gain = pk > 0 ? Math.min(12, 0.7 / pk) : 1
  })
  return steps.filter((st) => st.dur > 0.04)
}

export class AudioEngine {
  constructor(game) {
    this.game = game || null
    this.ctx = null
    this.ready = false
    this.buffers = {}
    this.loops = {}
    this.steps = []
    this.lis = { x: 0, y: 0, z: 0 }
    this.vol = { master: 0.9, music: 0.6, sfx: 0.85, voice: 0.8 }
    this.wantMusic = 'none'
    this.wantAmb = 'none'
    this.last = new Map()
    this.count = new Map()
    this.timer = null
    this.beats = 0
    this.lastVehCall = 0
    this.seen = new Set() // audio data entries already decoded (or failed)
    this.onVisibility = () => this.visibility()
    this.onGesture = () => this.resume()
  }

  get running() { return !!this.ctx && this.ready && this.ctx.state === 'running' }

  // ---- lifecycle ---------------------------------------------------------------------------
  async init() {
    if (this.ctx) return this.ready
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (!AC) return false
      try { this.ctx = new AC({ latencyHint: 'interactive' }) } catch (e) { this.ctx = new AC() }
      this.build()
    } catch (e) {
      warn('no audio context', e)
      this.ctx = null
      return false
    }
    await this.decode(this.game && this.game.assets && this.game.assets.audioData)
    try {
      this.mus = new Music(this)
      this.amb = new Ambience(this)
      this.veh = new VehicleAudio(this)
      this.vox = new Voices(this)
      this.setVolumes((this.game && this.game.settings) || this.vol)
      this.ctx.onstatechange = () => this.stateChanged()
      this.timer = setInterval(() => { if (++this.beats % 10 === 0) this.syncAssets(); this.tick() }, 25)
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility)
      this.ready = true
      if (this.wantResume) this.resume()
      this.stateChanged()
    } catch (e) {
      warn('init failed', e)
      this.ready = false
    }
    return this.ready
  }

  build() {
    const ctx = this.ctx
    const g = (v, dest) => { const n = ctx.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n }
    // master: gentle glue compression, a fast limiter, then a transparent-below-0.8
    // soft clipper that guarantees the output never reaches full scale
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2; comp.attack.value = 0.01; comp.release.value = 0.25
    const lim = ctx.createDynamicsCompressor()
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1
    const trim = g(0.5)
    const clip = ctx.createWaveShaper()
    clip.curve = clipperCurve(2)
    this.master = g(this.vol.master)
    this.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(clip); clip.connect(ctx.destination)
    this.output = clip
    // shared room reverb
    this.reverb = ctx.createConvolver()
    this.reverb.buffer = makeImpulse(ctx)
    this.reverbIn = g(1)
    this.reverbIn.connect(this.reverb)
    this.reverb.connect(g(0.8, this.master))
    // buses
    const b = this.buses = {}
    b.sfx = g(1, this.master)
    b.sfx.connect(g(0.14, this.reverbIn))
    b.sfxWet = g(1, this.reverbIn) // extra reverb send for distant / roomy one-shots
    b.ui = g(1, this.master)
    b.voice = g(1, this.master)
    b.amb = g(1, this.master)
    b.music = g(1, this.master)
    b.musicWet = g(1, this.reverbIn)
    b.sduck = g(1, b.music) // automatic dip under stingers
    b.sduckWet = g(1, b.musicWet)
    b.duck = g(1, b.sduck) // duck() from the game (dialogue, pause menu)
    b.duckWet = g(1, b.sduckWet)
    b.musicIn = b.duck
    b.musicWetIn = b.duckWet
    b.sting = g(0.6, b.music)
    b.sting.connect(g(0.3, b.musicWet))
    this.kit = makeKit(ctx)
  }

  // Decode ArrayBuffers ({ name: ArrayBuffer | AudioBuffer }) into samples; failures are skipped.
  async decode(data) {
    if (!this.ctx || !data) return
    await Promise.all(Object.keys(data).map((name) => { this.seen.add(name); return this.decodeOne(name, data[name]) }))
  }

  async decodeOne(name, ab) {
    try {
      let buf = ab
      if (!(typeof AudioBuffer !== 'undefined' && ab instanceof AudioBuffer)) {
        if (!ab || !ab.byteLength) return
        buf = await new Promise((resolve, reject) => {
          const p = this.ctx.decodeAudioData(ab.slice(0), resolve, reject)
          if (p && p.then) p.then(resolve, reject)
        })
      }
      if (!this.ctx) return
      if (LOOPS[name]) this.loops[name] = { buffer: buf, end: prepareLoop(buf, LOOPS[name]) }
      this.buffers[name] = buf
      if (name === 'walking') this.steps = sliceSteps(buf)
      if (name === 'ambience' && this.amb) this.amb.refresh()
    } catch (e) { warn('could not decode', name) }
  }

  // The game may create the engine before its assets load: pick up late audio data.
  syncAssets() {
    const data = this.game && this.game.assets && this.game.assets.audioData
    if (!data || !this.ctx) return
    for (const name of Object.keys(data)) {
      if (this.seen.has(name)) continue
      this.seen.add(name)
      this.decodeOne(name, data[name])
    }
  }

  loop(name) { return this.loops[name] || null }

  // Call from a user gesture (click / key). Idempotent.
  resume() {
    try {
      const ctx = this.ctx
      if (!ctx) { this.wantResume = true; return }
      if (ctx.state === 'running' || ctx.state === 'closed') return
      this.hiddenPause = false
      const p = ctx.resume()
      if (p && p.then) p.then(() => this.stateChanged(), NOOP)
      // older iOS only unlocks when something starts inside the gesture
      const s = ctx.createBufferSource()
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      s.connect(ctx.destination)
      s.start(0)
    } catch (e) { warn('resume failed', e) }
  }

  stateChanged() {
    if (!this.ready || !this.ctx) return
    const state = this.ctx.state
    // safety net: any gesture resumes a context that is blocked (autoplay policy, iOS
    // interruption) - but not one we suspended ourselves for a hidden tab
    this.gestureHook(state !== 'running' && state !== 'closed' && !this.hiddenPause)
    if (state === 'running') {
      // requests made while suspended take effect now
      if (this.mus.name !== this.wantMusic) this.mus.play(this.wantMusic)
      if (this.amb.kind !== this.wantAmb) this.amb.set(this.wantAmb)
    }
  }

  gestureHook(on) {
    if (typeof window === 'undefined' || on === !!this.hooked) return
    this.hooked = on
    for (const ev of GESTURES) {
      if (on) window.addEventListener(ev, this.onGesture, true)
      else window.removeEventListener(ev, this.onGesture, true)
    }
  }

  // pause audio with the tab; resume only what we paused
  visibility() {
    const ctx = this.ctx
    if (!ctx || ctx.state === 'closed') return
    if (document.hidden) {
      if (ctx.state === 'running') { this.hiddenPause = true; ctx.suspend().catch(NOOP) }
    } else if (this.hiddenPause) {
      this.hiddenPause = false
      ctx.resume().catch(NOOP)
    }
  }

  dispose() {
    clearInterval(this.timer)
    this.timer = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility)
    this.gestureHook(false)
    try {
      if (this.vox) this.vox.stopAll()
      if (this.mus) this.mus.dispose()
      if (this.amb) this.amb.dispose()
      if (this.veh) this.veh.dispose()
    } catch (e) { warn('dispose', e) }
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(NOOP)
    this.ready = false
    this.ctx = null
  }

  // ---- mix ---------------------------------------------------------------------------------
  setVolumes(s) {
    if (s) for (const k of ['master', 'music', 'sfx', 'voice']) if (Number.isFinite(s[k])) this.vol[k] = clamp(s[k], 0, 1)
    if (!this.ctx || !this.buses) return
    const now = this.ctx.currentTime, v = this.vol, b = this.buses
    const set = (node, val) => node.gain.setTargetAtTime(val, now, 0.06)
    set(this.master, v.master)
    set(b.music, v.music); set(b.musicWet, v.music)
    set(b.sfx, v.sfx); set(b.sfxWet, v.sfx); set(b.ui, v.sfx)
    set(b.amb, v.sfx * 0.7)
    set(b.voice, v.voice)
  }

  // Music level for dialogue / menus: ramp to `amount` (0..1, 1 = normal) over `seconds`
  // and stay there until the next call; duck(1) restores. Optional `hold` restores
  // automatically after that many seconds.
  duck(amount = 0.5, seconds = 0.3, hold = 0) {
    if (!this.ctx || !this.buses) return
    const level = clamp(Number.isFinite(amount) ? amount : 0.5, 0, 1)
    const ramp = Math.max(0.02, Number.isFinite(seconds) ? seconds : 0.3)
    const now = this.ctx.currentTime
    for (const node of [this.buses.duck, this.buses.duckWet]) {
      const p = node.gain
      p.cancelScheduledValues(now)
      p.setTargetAtTime(level, now, ramp / 3)
      if (hold > 0) p.setTargetAtTime(1, now + ramp + hold, 0.2)
    }
  }

  // ---- one-shots ---------------------------------------------------------------------------
  sfx(name, opts) {
    if (!this.running || typeof name !== 'string') return
    try {
      const o = opts || {}
      const recipe = RECIPES[name]
      if (recipe) this._play(name, o, recipe)
      else if (STINGERS[name]) this._play(name, o, (s) => s.done(STINGERS[name](s.k, s.gain(0.45), s.t, s.tr)))
      else if (this.buffers[name] && this.buffers[name].duration < 3) this._play(name, o, (s) => s.buf(name))
    } catch (e) { warn('sfx', name, e) }
  }

  // shared one-shot path: rate limit, distance cull, bus routing, spatialization, cleanup
  _play(name, o, build) {
    const ctx = this.ctx, now = ctx.currentTime
    if (now - (this.last.get(name) ?? -1) < MIN_GAP) return false
    const n = this.count.get(name) || 0
    if (n >= MAX_PER_NAME) return false
    const at = o.at && Number.isFinite(o.at.x) ? o.at : null
    let pan = null, dist = 0
    if (at) {
      const dx = at.x - this.lis.x, dy = (at.y || 0) - this.lis.y, dz = (at.z || 0) - this.lis.z
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > MAX_DIST) return false
      pan = makePanner(ctx, 6, 120)
      setPannerPos(pan, at.x, (at.y || 0) + 0.5, at.z || 0, now)
    }
    const b = this.buses
    const bus = o.bus === 'ui' ? b.ui : o.bus === 'sfx' ? b.sfx : UI_SOUNDS.has(name) ? b.ui : b.sfx
    const out = ctx.createGain()
    out.gain.value = clamp(Number.isFinite(o.vol) ? o.vol : 1, 0, 4)
    if (pan) { out.connect(pan); pan.connect(bus) } else out.connect(bus)
    const shot = new Shot(this, out, now + 0.005, clamp(Number.isFinite(o.pitch) ? o.pitch : 1, 0.25, 4), o)
    shot.dist = dist
    try { build(shot) } catch (e) { warn('recipe', name, e) }
    shot.finish()
    this.last.set(name, now)
    this.count.set(name, n + 1)
    setTimeout(() => {
      try { out.disconnect(); if (pan) pan.disconnect() } catch (e) { /* gone */ }
      this.count.set(name, Math.max(0, (this.count.get(name) || 1) - 1))
    }, (Math.max(0.05, shot.end - now) + 0.2) * 1000)
    return true
  }

  horn(vehicle, vol = 1) {
    if (!this.running) return
    try { this.veh.horn(vehicle, Number.isFinite(vol) ? vol : 1) } catch (e) { warn('horn', e) }
  }

  sting(name) {
    if (!this.running || !STINGERS[name]) return
    try {
      const now = this.ctx.currentTime
      if (now - (this.last.get('sting:' + name) ?? -1) < 0.3) return
      this.last.set('sting:' + name, now)
      const end = STINGERS[name](this.kit, this.buses.sting, now + 0.02, 0)
      // dip the running track under the stinger, then bring it back
      for (const node of [this.buses.sduck, this.buses.sduckWet]) {
        const p = node.gain
        p.cancelScheduledValues(now)
        p.setTargetAtTime(0.28, now, 0.04)
        p.setTargetAtTime(1, Math.max(now + 0.3, end - 0.3), 0.35)
      }
    } catch (e) { warn('sting', name, e) }
  }

  // ---- continuous layers ---------------------------------------------------------------------
  music(track) {
    this.wantMusic = typeof track === 'string' ? track : 'none'
    if (!this.running) return
    try { this.mus.play(this.wantMusic) } catch (e) { warn('music', e) }
  }

  ambience(kind) {
    this.wantAmb = typeof kind === 'string' ? kind : 'none'
    if (!this.running) return
    try { this.amb.set(this.wantAmb) } catch (e) { warn('ambience', e) }
  }

  // Dialogue blips for `text`; returns stop(). voice = { pitch, type } (or a bare pitch).
  // opts: { vol, at } (at = world position for speech bubbles).
  voiceStart(voice, text, opts) {
    if (!this.running || !text) return NOOP
    try { return this.vox.start(voice, text, opts) } catch (e) { warn('voice', e); return NOOP }
  }

  // Per frame. While the game is paused the world falls silent (voices fade out).
  updateVehicles(vehicles, playerVehicle) {
    if (!this.running) return
    try {
      const paused = !!(this.game && this.game.paused)
      const list = paused ? [] : Array.isArray(vehicles) ? vehicles : (vehicles && Array.isArray(vehicles.list) ? vehicles.list : [])
      this.lastVehCall = this.ctx.currentTime
      this.veh.update(list, paused ? null : playerVehicle || null, this.lastVehCall)
    } catch (e) { warn('vehicles', e) }
  }

  // ---- per frame -----------------------------------------------------------------------------
  update(dt, camera) {
    if (!this.ready) return
    try {
      if (camera && camera.position && camera.quaternion) this.listen(camera)
      this.tick()
    } catch (e) { warn('update', e) }
  }

  // Listener: orientation from the camera; position pulled 70% of the way toward the
  // player so the third-person camera distance doesn't muffle everything near the hero.
  listen(cam) {
    const ctx = this.ctx, L = ctx.listener, p = cam.position, q = cam.quaternion
    let x = p.x, y = p.y, z = p.z
    const g = this.game, pl = g && g.player
    const focus = pl && !g.freeCam && !(g.cameraRig && g.cameraRig.cut) ? (pl.vehicle ? pl.vehicle.pos : pl.pos) : null
    if (focus && Number.isFinite(focus.x)) {
      const dx = focus.x - x, dy = focus.y - y, dz = focus.z - z
      if (dx * dx + dy * dy + dz * dz < 45 * 45) { x += dx * 0.7; y += dy * 0.7; z += dz * 0.7 }
    }
    this.lis.x = x; this.lis.y = y; this.lis.z = z
    // camera looks down its local -Z, up is local +Y
    const fx = -2 * (q.x * q.z + q.w * q.y), fy = -2 * (q.y * q.z - q.w * q.x), fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
    const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x)
    if (L.positionX) {
      const t = ctx.currentTime, tc = 0.02
      L.positionX.setTargetAtTime(x, t, tc); L.positionY.setTargetAtTime(y, t, tc); L.positionZ.setTargetAtTime(z, t, tc)
      L.forwardX.setTargetAtTime(fx, t, tc); L.forwardY.setTargetAtTime(fy, t, tc); L.forwardZ.setTargetAtTime(fz, t, tc)
      L.upX.setTargetAtTime(ux, t, tc); L.upY.setTargetAtTime(uy, t, tc); L.upZ.setTargetAtTime(uz, t, tc)
    } else {
      L.setPosition(x, y, z)
      L.setOrientation(fx, fy, fz, ux, uy, uz)
    }
  }

  // scheduler heartbeat (setInterval + every update): music and ambience lookahead
  tick() {
    if (!this.running) return
    try {
      const now = this.ctx.currentTime
      this.mus.tick()
      this.amb.tick(now)
      // updateVehicles stopped being called (menus, cutscenes): let the engines die away.
      // Generous timeout so slow frames / hitches never cause dropouts.
      if (now - this.lastVehCall > 1.5 && this.veh.active()) this.veh.update([], null, now)
    } catch (e) { warn('tick', e) }
  }

  // ---- debugging -----------------------------------------------------------------------------
  // AnalyserNode on the final output (after compressor, limiter and clipper).
  debugTap(fftSize = 2048) {
    if (!this.output || !this.ctx) return null
    if (!this.tap) {
      this.tap = this.ctx.createAnalyser()
      this.tap.fftSize = fftSize
      this.output.connect(this.tap)
    }
    return this.tap
  }

  debugInfo() {
    if (!this.ctx) return { state: 'none' }
    return {
      state: this.ctx.state,
      sampleRate: this.ctx.sampleRate,
      buffers: Object.keys(this.buffers),
      steps: this.steps.length,
      music: this.mus ? this.mus.name : 'none',
      musicVoices: this.mus ? this.mus.voices() : 0,
      ambience: this.amb ? this.amb.kind : 'none',
      voiceLines: this.vox ? this.vox.active() : 0,
      sfxActive: [...this.count.values()].reduce((a, b) => a + b, 0),
      ...(this.veh ? this.veh.stats() : {}),
    }
  }
}

export default AudioEngine
