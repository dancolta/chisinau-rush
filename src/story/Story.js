import { NPC } from '../entities/NPC.js'
import { CAST, randomCivilian } from '../data/outfits.js'
import { Ring, Pickup, VisionCone, RouteDriver, ChaseDriver, SetPiece, Potholes, lanePos } from './Kit.js'
import { SPEAKERS, HOMES } from './cast.js'
import { MISSIONS } from './missions.js'
import { ACTIVITIES, Activities } from './activities.js'
import { Happenings } from '../side/Happenings.js'
import { CURB_H } from '../world/CityLayout.js'
import { FILTER } from '../physics/Physics.js'
import { fmt } from '../ui/UI.js'

export class MissionFail extends Error {
  constructor(reason, { cancel = false } = {}) { super(reason); this.reason = reason; this.cancel = cancel }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ---------------------------------------------------------------------------
// Everything a mission script needs. Every await throws MissionFail once the mission fails,
// so scripts read top-to-bottom like a screenplay.
class MissionContext {
  constructor(story, def) {
    this.story = story
    this.game = story.game
    this.def = def
    this.waiters = []
    this.tracked = []
    this.failed = null
    this.timerT = null
    this.data = {}
    this.t = 0
  }
  get ui() { return this.game.ui }
  get player() { return this.game.player }
  get places() { return this.game.world.places }
  get progress() { return this.game.progress }
  // where the player "is" (their car if driving)
  get P() { return this.game.player.vehicle ? this.game.player.vehicle.pos : this.game.player.pos }
  get car() { return this.game.player.passenger ? null : this.game.player.vehicle }

  check() { if (this.failed) throw this.failed }

  fail(reason) {
    if (this.failed) return
    this.failed = reason instanceof MissionFail ? reason : new MissionFail(reason)
    for (const w of this.waiters) w.rej(this.failed)
    this.waiters = []
  }
  cancel(reason = '') { this.fail(new MissionFail(reason, { cancel: true })); throw this.failed }

  // hold [Space] during a cutscene (or a skippable ride) to fast-forward it
  get skipping() { return this.skipFlag && (this.game.cutscene || this.skippable) }

  // ---- timing -------------------------------------------------------------------------
  wait(sec) { this.check(); if (this.skipping) return Promise.resolve(); return new Promise((res, rej) => this.waiters.push({ t: sec, res, rej })) }
  until(cond, { timeout = null, onTimeout = 'Ai rămas fără timp.' } = {}) {
    this.check()
    if (cond()) return Promise.resolve()
    return new Promise((res, rej) => this.waiters.push({ cond, res, rej, timeout, onTimeout }))
  }
  // resolves with the index of the first condition to become true
  race(conds) {
    this.check()
    const i = conds.findIndex((c) => c())
    if (i >= 0) return Promise.resolve(i)
    return new Promise((res, rej) => this.waiters.push({ conds, res, rej }))
  }
  // fire-and-forget sub-script (chatter, background beats); failures are swallowed
  // fire-and-forget side script; fn gets live() so it can bail out once stop() is called
  task(fn) {
    const h = { on: true, stop: () => { h.on = false } }
    Promise.resolve().then(() => fn(() => h.on && !this.failed)).catch((e) => { if (!(e instanceof MissionFail)) console.error(e) })
    return h
  }
  // timed background lines (radio, phone calls, passengers): [[delay, who, text, secs?], ...]
  // stop() cuts them off (and clears the subtitle) when the scene they belong to is over
  chatter(lines) {
    const h = this.task(async (live) => {
      for (const [delay, who, text, secs] of lines) {
        await this.wait(delay)
        if (!live()) return
        h.talking = true
        await this.talk(who, text, secs)
        h.talking = false
      }
    })
    const stop = h.stop
    h.stop = () => { if (h.on && h.talking) this.ui.subtitle(null); stop() }
    return h
  }
  // per-frame callback for the lifetime of the mission; return true to remove it
  every(fn) { const o = { update: (dt) => { if (fn(dt) === true) o.update = null } }; this.tracked.push(o); return o }

  tick(dt) {
    this.t += dt
    if (this.timerT !== null) {
      this.timerT -= dt
      this.ui.setTimer(this.timerT)
      if (this.timerT <= 0) { this.timerT = null; this.ui.setTimer(null); this.fail(this.timerReason || 'Ai rămas fără timp.') }
    }
    const keep = []
    for (const w of this.waiters) {
      if (w.t !== undefined) { w.t -= dt; if (w.t <= 0) { w.res(); continue } }
      else if (w.conds) { const i = w.conds.findIndex((c) => c()); if (i >= 0) { w.res(i); continue } }
      else if (w.cond) {
        let ok = false
        try { ok = w.cond() } catch (e) { console.error(e) }
        if (ok) { w.res(); continue }
        if (w.timeout !== null) { w.timeout -= dt; if (w.timeout <= 0) { const f = new MissionFail(w.onTimeout); this.fail(f); w.rej(f); continue } }
      }
      keep.push(w)
    }
    if (!this.failed) this.waiters = keep
    for (const o of this.tracked) if (o.update) o.update(dt)
  }

  timer(secs, reason) { this.timerT = secs; this.timerReason = reason }
  music(track) { this.story.musicOverride = track || null }
  stopTimer() { this.timerT = null; this.ui.setTimer(null) }

  // ---- HUD ---------------------------------------------------------------------------------
  get title() { return (this.def.chapterName ? this.def.chapterName.toUpperCase() + ' · ' : '') + this.def.title.toUpperCase() }
  objective(text, opts = {}) { this.check(); this.ui.setObjective(text, { title: this.title, ...opts }) }
  sub(text) {
    const s = this.ui.objEl.querySelector('.sub')
    if (!s) return
    const h = text ? fmt(text) : ''
    if (s._h !== h) { s._h = h; s.innerHTML = h; s.style.display = text ? '' : 'none' }
  }
  marker(pos, label = '') {
    this.story.markerActive = !!pos
    this.ui.setMarker(pos ? { x: pos.x, z: pos.z, y: pos.y ?? CURB_H } : null, label)
  }
  tip(text, secs) { this.ui.tip(text, secs) }
  notify(text, secs, color) { this.ui.notify(text, secs, color) }

  async reach(pos, r = 3, { text = null, label = '', inVehicle = null, vehicle = null, stop = false, sub = '', brokenText = '' } = {}) {
    const target = typeof pos === 'string' ? this.places[pos] : pos
    if (text) this.objective(text, { sub })
    this.marker(target, label)
    // tell the player when they're in the wrong mode for this step (on foot / by car)
    let hint = null
    if (inVehicle === false) { this.onFootWanted = true; hint = this.every(() => this.sub(this.player.vehicle ? 'Coboară din mașină ({y}[E]{/y}) și mergi pe jos.' : sub)) }
    if (inVehicle === true) { this.carWanted = true; hint = this.every(() => this.sub(!this.car ? 'Ai nevoie de o mașină: urcă în una ({y}[E]{/y}).' : sub)) }
    // a specific car is needed: if the player leaves it, the waypoint points back to it
    if (vehicle) {
      let inIt = null
      hint = this.every(() => {
        const now = this.player.vehicle === vehicle
        if (now === inIt) return
        inIt = now
        if (now) { this.marker(target, label); this.sub(sub) }
        else { this.marker(vehicle.pos, vehicle.def.name); this.sub(`Urcă înapoi în ${vehicle.def.name} ({y}[E]{/y}).`) }
      })
    }
    await this.until(() => {
      const p = this.player
      // the car this step needs is a wreck: say so and end it (otherwise the marker would point
      // at a car that can't drive, and walking up to the goal would do nothing)
      if (vehicle && vehicle.broken) { this.fail(brokenText || `${vehicle.def.name} e praf. Mai încearcă.`); return false }
      if (inVehicle === true && (!p.vehicle || p.passenger)) return false
      if (inVehicle === false && p.vehicle) return false
      if (vehicle && p.vehicle !== vehicle) return false
      const q = p.vehicle ? p.vehicle.pos : p.pos
      if (stop && p.vehicle && Math.abs(p.vehicle.speed) > 1.5) return false
      return Math.hypot(q.x - target.x, q.z - target.z) < r
    })
    if (hint) { this.untrack(hint); this.onFootWanted = this.carWanted = false }
    this.marker(null)
  }

  // ---- talking -------------------------------------------------------------------------------
  speaker(who) {
    if (typeof who === 'string') {
      if (who === 'player') { const pr = this.progress; return { id: 'player', name: pr.name, role: 'tu', spec: this.game.player?.char?.spec || CAST[pr.type], voice: pr.perk.female ? { pitch: 1.05, type: 'female' } : { pitch: 1, type: 'male' } } }
      return SPEAKERS[who] || { name: who }
    }
    return who
  }
  npcFor(who) { return typeof who === 'string' ? (this.story.temp[who] || this.story.cast[who]) : null }

  // modal dialogue with portraits; lines: strings or { who, text }
  async say(who, lines, opts = {}) {
    this.check()
    const sp = this.speaker(who)
    let L = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? l : { who: this.speaker(l.who), text: l.text }))
    if (this.skipping) { if (!opts.choices) return null; L = L.slice(-1) }
    const npc = this.npcFor(who)
    const p = this.player
    if (npc && !opts.noTalk && !npc.char.ko && npc.char.visible) {
      if (!p.vehicle && dist(npc.pos, p.pos) < 6 && npc.state !== 'sit') { npc.char.lookAtNow(p.pos.x, p.pos.z); if (!p.scripted && !this.game.cutscene) p.char.lookAtNow(npc.pos.x, npc.pos.z) }
      if (!npc.char.anim.busy && (npc.state === 'idle' || npc.state === 'talk')) npc.char.anim.set('talk')
    }
    const r = await this.ui.dialogue(sp, L, opts)
    if (npc && !npc.char.ko && npc.state === 'idle') npc.char.anim.set(npc.idleAnim || 'idle')
    this.check()
    return r
  }
  choose(who, text, choices) { return this.say(who, [text], { choices }) }

  // non-modal line (subtitle + voice blip + bubble), then waits roughly the reading time
  async talk(who, text, secs = null) {
    this.check()
    if (this.skipping) return
    const sp = this.speaker(who)
    const s = secs ?? clamp(1.4 + text.length * 0.05, 2.2, 6.5)
    // the line stays up for as long as it lasts in game time (slow frames stretch both alike);
    // the real-time timeout is only a safety net
    this.ui.subtitle(sp.name, text, s * 4)
    const npc = this.npcFor(who)
    if (npc && npc.char.visible && !npc.riding) npc.say(text, s)
    else if (sp.voice && this.game.audio) { const stop = this.game.audio.voiceStart(sp.voice, text); setTimeout(() => stop && stop(), Math.min(s, 3) * 1000) }
    try { await this.wait(s) } finally { if (this.ui.subText === text) this.ui.subtitle(null) }
  }

  // big "new evidence" card; also stored in the save
  async evidence(id, title, text) {
    const pr = this.progress
    pr.flags.dovezi ||= []
    if (!pr.flags.dovezi.includes(id)) pr.flags.dovezi.push(id)
    pr.flags.doveziText ||= {}
    pr.flags.doveziText[id] = { title, text }
    this.game.audio?.sting('evidence')
    await this.ui.evidence(`DOVADA ${pr.flags.dovezi.indexOf(id) + 1}`, title, text)
    this.check()
  }

  // ---- people ----------------------------------------------------------------------------------
  track(o) { this.tracked.push(o); return o }
  spawn(id, spec, x, z, opts = {}) {
    const g = this.game
    const s = typeof spec === 'string' ? CAST[spec] : spec || randomCivilian(Math.random)
    const npc = new NPC(g, s, { x, y: g.physics.groundHeight(x, z, 3), z, persistent: true, personality: 'story', ...opts })
    npc.missionSpawned = true
    npc.noCrime = true
    npc.idleAnim = opts.anim || 'idle'
    if (opts.anim === 'sit' || opts.anim === 'squat' || opts.anim === 'phone') npc.state = opts.anim
    this.story.npcs.push(npc)
    if (id) this.story.temp[id] = npc
    this.track({ ref: npc, npc, dispose: () => { if (this.story.npcs.includes(npc)) this.story.removeNpc(npc) } })
    return npc
  }
  // hostile fighter that stays down once beaten
  enemy(spec, x, z, { hp = 45, runSpeed = 5.2, target = null, id = null, voice = { pitch: 0.8, type: 'gruff' } } = {}) {
    const n = this.spawn(id, spec, x, z, { personality: 'tough', hp, runSpeed, voice })
    n.hittable = true; n.stayDown = true; n.enemy = true
    n.hostile = true; n.state = 'fight'; n.target = target || this.player
    return n
  }
  ally(spec, x, z, { hp = 90, id = null } = {}) {
    const n = this.spawn(id, spec, x, z, { personality: 'story', hp, runSpeed: 5.6, voice: { pitch: 1, type: 'gruff' } })
    n.ally = true
    return n
  }
  down(n) { return n.char.ko && n.hp <= 0 }
  allDown(list) { return list.every((n) => this.down(n)) }
  // allies pick fights with standing enemies; idle enemies go back after the player
  brawl(enemies, allies = []) {
    let t = 0
    return this.every((dt) => {
      t -= dt
      if (t > 0) return
      t = 0.4
      const up = enemies.filter((e) => !this.down(e))
      for (const a of allies) {
        if (a.char.ko) continue
        if (!up.length) { if (a.state === 'fight') { a.state = 'idle'; a.char.anim.play('cheer') } continue }
        if (a.state !== 'fight' || !a.target || a.target.char.ko) {
          let best = null, bd = 1e9
          for (const e of up) { const d = dist(e.pos, a.pos); if (d < bd) { bd = d; best = e } }
          a.state = 'fight'; a.target = best
        }
      }
      for (const e of up) {
        if (e.state === 'knocked' || e.stun > 0) continue
        const tgt = e.target
        const bad = !tgt || (tgt.char && tgt.char.ko) || (tgt === this.player && this.player.vehicle)
        if (e.state !== 'fight' || bad) {
          e.state = 'fight'; e.hostile = true
          const standing = allies.filter((a) => !a.char.ko)
          e.target = (this.player.vehicle || (standing.length && Math.random() < 0.4)) && standing.length ? standing[Math.floor(Math.random() * standing.length)] : this.player
        }
      }
    })
  }

  // walk an NPC somewhere; resolves on arrival (teleports if it gets stuck)
  walk(npc, x, z, { run = false, face = null, timeout = null } = {}) {
    this.check()
    if (this.skipping) { npc.teleport(x, this.game.physics.groundHeight(x, z, 3), z, face ?? npc.char.heading); npc.state = 'idle'; npc.path = []; return Promise.resolve() }
    return new Promise((res, rej) => {
      const d = dist(npc.pos, { x, z })
      let done = false
      const finish = () => { if (done) return; done = true; if (face != null) { npc.char.heading = face; npc.home.ry = face }; res() }
      npc.walkTo(x, z, { run, face, onArrive: finish })
      const limit = timeout ?? d / (run ? 3 : 0.9) + 3
      this.waiters.push({ t: limit, res: () => { if (!done) { npc.teleport(x, this.game.physics.groundHeight(x, z, 3), z, face ?? npc.char.heading); npc.state = 'idle'; npc.path = []; finish() } }, rej })
    })
  }
  playerWalk(x, z, speed = 2.2) {
    this.check()
    const p = this.player
    if (this.skipping) { p.scripted = null; p.teleport(x, this.game.physics.groundHeight(x, z, 3), z); return Promise.resolve() }
    return new Promise((res, rej) => {
      let done = false
      p.scripted = { x, z, speed, onArrive: () => { done = true; res() } }
      this.waiters.push({ t: dist(p.pos, { x, z }) / speed * 1.6 + 2, res: () => { if (!done) { p.scripted = null; p.teleport(x, this.game.physics.groundHeight(x, z, 3), z); res() } }, rej })
    })
  }
  face(npc, x, z) { (npc.char || npc).lookAtNow(x, z) }
  hideCast(id) {
    this.story.hidden.add(id)
    const n = this.story.cast[id]
    if (n) { this.game.interaction.remove('talk_' + id); this.story.removeNpc(n) }
    this.track({ dispose: () => this.story.hidden.delete(id) })
  }

  // ---- vehicles -----------------------------------------------------------------------------
  vehicle(kind, x, z, ry, opts = {}) {
    this.game.vehicles.clearSpot(x, z)
    const v = this.game.vehicles.spawn(kind, x, z, ry, opts)
    v.keep = true
    v.missionSpawned = true
    this.track({
      ref: v,
      dispose: () => {
        const p = this.game.player
        if (p.vehicle === v && p.passenger) this.unboard()
        if (p.vehicle !== v && !opts.persist && !v.leaving && this.game.vehicles.list.includes(v)) this.game.vehicles.remove(v)
      },
    })
    return v
  }
  driver(v, points, opts) { const d = new RouteDriver(this.game, v, points, opts); this.addDriver(d); return d }
  chaser(v, target, opts) { const d = new ChaseDriver(this.game, v, target, opts); this.addDriver(d); return d }
  addDriver(d) {
    this.story.drivers.push(d)
    this.track({ dispose: () => { const i = this.story.drivers.indexOf(d); if (i >= 0) this.story.drivers.splice(i, 1); d.release?.(); d.done = true; if (d.v.driver === d) { d.v.driver = null; d.v.ai = null; d.v.throttle = 0; d.v.handbrake = true } } })
  }
  lane(id, dir, along, opts) { return lanePos(id, dir, along, opts) }
  // the player rides along as a passenger (camera follows the car, no controls)
  board(v) {
    const g = this.game, p = this.player
    if (p.vehicle) g.vehicles.exit(true)
    p.vehicle = v; p.passenger = true
    p.char.setVisible(false); p.enableCollider(false); p.vel.set(0, 0, 0)
    g.audio?.sfx('door', { vol: 0.6 })
  }
  unboard() {
    const g = this.game, p = this.player, v = p.vehicle
    if (!v || !p.passenger) return
    const drv = v.driver
    g.vehicles.exit(true)
    p.passenger = false
    if (drv && drv !== 'player') { v.driver = drv; v.handbrake = false }
  }
  seat(v) { const p = this.player; if (p.vehicle && p.vehicle !== v) this.game.vehicles.exit(true); if (p.vehicle !== v) this.game.vehicles.enter(v) }
  // a car for the player near (x, z): the one they're in, a free one close by, or a fresh one
  needCar(x, z, ry, kind = 'logan') {
    const g = this.game, p = this.player
    if (p.vehicle && !p.passenger && !p.vehicle.broken) return p.vehicle
    let best = null, bd = 45
    for (const v of g.vehicles.list) {
      if (v.def.trolley || v.locked || v.broken || v.def.police || (v.driver && v.driver !== 'player')) continue
      const d = dist(v.pos, p.pos)
      if (d < bd) { bd = d; best = v }
    }
    if (best) { best.keep = true; return best }
    return this.vehicle(kind, x, z, ry, { persist: true })
  }

  // ---- world objects ------------------------------------------------------------------------
  ring(x, z, opts) { return this.track(new Ring(this.game, x, z, opts)) }
  pickup(x, z, opts) { return this.track(new Pickup(this.game, x, z, opts)) }
  cone(npc, opts) { return this.track(new VisionCone(this.game, npc, opts)) }
  prop(build, opts) { return this.track(new SetPiece(this.game, build, opts)) }
  interact(item) {
    const id = 'm_' + (item.id || Math.random().toString(36).slice(2))
    this.game.interaction.add({ priority: 8, ...item, id })
    this.track({ dispose: () => this.game.interaction.remove(id) })
    return id
  }
  untrack(o) { const i = this.tracked.indexOf(o); if (i >= 0) this.tracked.splice(i, 1); if (o.dispose) o.dispose() }
  // hand objects over to the next mission (no cleanup here); adopt() takes them back
  detach(x) { this.tracked = this.tracked.filter((e) => e !== x && e.ref !== x); return x }
  adoptNpc(n) { if (!n) return n; this.track({ ref: n, dispose: () => { if (this.story.npcs.includes(n)) this.story.removeNpc(n) } }); return n }
  adoptVehicle(v) { if (!v) return v; v.keep = true; this.track({ ref: v, dispose: () => { if (this.game.player.vehicle !== v && !v.leaving && this.game.vehicles.list.includes(v)) this.game.vehicles.remove(v) } }); return v }

  // ---- cinematics ----------------------------------------------------------------------------
  shot(opts) { this.check(); if (this.skipping) return Promise.resolve(); return new Promise((res) => this.game.cameraRig.shot({ ...opts, onEnd: res })) }
  hold(opts) { this.game.cameraRig.shot({ dur: 9999, ...opts }) }
  // open, walkable spot near (x, z) for staging a scene, as far as possible from smoking wrecks
  stageSpot(x, z, { r = 6, avoid = [] } = {}) {
    const g = this.game
    const bad = [...avoid, ...g.vehicles.list.filter((v) => v.health < 45).map((v) => v.pos)]
    let best = { x, z }, bestS = -1
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2
      for (const rr of [r, r * 0.55]) {
        const cx = x + Math.sin(a) * rr, cz = z + Math.cos(a) * rr
        const gh = g.physics.groundHeight(cx, cz, 3)
        if (gh > 0.5) continue
        // wrecks far away, and kerb-high ground (pavements, squares) over traffic lanes
        const sc = Math.min(12, bad.length ? Math.min(...bad.map((b) => Math.hypot(b.x - cx, b.z - cz))) : 12) + (gh > CURB_H * 0.5 ? 4 : 0)
        if (sc > bestS + 0.5) { bestS = sc; best = { x: cx, z: cz } }
      }
    }
    return best
  }
  // camera spot around (x, z) with an unobstructed view of it: tries angles fanning out from `prefer`
  clearView(x, z, { dist = 5, h = 1.9, lookY = 1.1, prefer = 0, steps = 12 } = {}) {
    const P = this.game.physics
    for (let i = 0; i < steps; i++) {
      const a = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI * 2 / steps)
      const cx = x + Math.sin(a) * dist, cz = z + Math.cos(a) * dist
      const dx = cx - x, dy = h - lookY, dz = cz - z, L = Math.hypot(dx, dy, dz)
      if (!P.raycast(x, lookY, z, dx / L, dy / L, dz / L, L + 0.8, FILTER.Q_SOLID)) return { from: [cx, h, cz], look: [x, lookY, z] }
    }
    return { from: [x + Math.sin(prefer) * dist, h, z + Math.cos(prefer) * dist], look: [x, lookY, z] }
  }
  fade(to, ms = 600) { return this.ui.fade(to, ms) }
  tod(h) { this.game.renderer.tod.set(h); this.game.renderer.applyTimeOfDay(); this.game.renderer.updateEnvironment(true) }
  teleport(x, z, ry = null) {
    const g = this.game, p = this.player
    if (p.vehicle) { if (p.passenger) this.unboard(); else g.vehicles.exit(true) }
    p.teleport(x, g.physics.groundHeight(x, z, 3), z, ry ?? p.char.heading)
    g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
  }

  async cutscene(fn) {
    const g = this.game, p = this.player
    g.cutscene = true
    p.control = false
    this.ui.letterbox(true)
    this.ui.prompt(null)
    if (p.vehicle && !p.passenger) { p.vehicle.throttle = 0; p.vehicle.handbrake = true }
    try { await fn() }
    finally {
      this.skipFlag = false
      this.ui.skipHint(false)
      this.ui.letterbox(false)
      this.ui.subtitle(null)
      g.cutscene = false
      p.control = true
      p.scripted = null
      g.cameraRig.endShot(false)
      // back in control: the camera sits behind you (or looks where the scene asked it to)
      g.cameraRig.yaw = this.endYaw ?? (p.vehicle ? p.vehicle.heading : p.char.heading)
      this.endYaw = null
      g.cameraRig.userYawT = 0
      g.cameraRig.target.copy(p.vehicle ? p.vehicle.pos : p.pos)
      g.cameraRig.snap()
      g.input.clear()
    }
  }

  reward({ lei = 0, xp = 0, cred = 0, civic = 0 } = {}, why = '') {
    const pr = this.progress
    if (lei) pr.addLei(lei, why)
    if (cred) pr.addCred(cred)
    if (civic) pr.addCivic(civic)
    if (xp) pr.addXp(xp, why)
  }

  cleanup() {
    this.story.musicOverride = null
    this.stopTimer()
    this.ui.setObjective(null)
    this.marker(null)
    this.ui.subtitle(null)
    const p = this.player
    if (p.passenger) this.unboard()
    p.scripted = null
    p.control = true
    for (const o of this.tracked) { try { if (o.dispose) o.dispose() } catch (e) { console.error(e) } }
    this.tracked = []
    this.story.temp = {}
  }
}

// ---------------------------------------------------------------------------
export class Story {
  constructor(game) {
    this.game = game
    this.npcs = []
    this.cast = {}
    this.temp = {}
    this.drivers = []
    this.hidden = new Set()
    this.leavers = []
    this.active = null
    this.markerActive = false
    this.giverId = null
    this.potholes = new Potholes(game)
    this.acts = new Activities(game, this)
    this.events = new Happenings(game, this)   // random street events (src/side)
  }

  get done() { return this.game.progress.story.done }
  isDone(id) { return this.done.includes(id) }

  catalog() {
    const next = this.nextMission()
    let locked = false
    return MISSIONS.filter((m) => !m.activity).map((m) => {
      const done = this.isDone(m.id)
      const cur = this.active?.def === m || (!this.active && next === m)
      const row = { id: m.id, title: `${m.chapterName ? m.chapterName + ' · ' : ''}${m.title}`, desc: m.desc, done, current: cur, locked: locked && !done && !cur }
      if (!done && !cur) locked = true
      return row
    })
  }

  activities() { return ACTIVITIES.filter((a) => !a.unlock || this.isDone(a.unlock)) }
  evidence() { const f = this.game.progress.flags; return (f.dovezi || []).map((id) => ({ id, ...(f.doveziText?.[id] || { title: id, text: '' }) })) }

  nextMission() { return MISSIONS.find((m) => !m.activity && !this.isDone(m.id)) || null }
  byId(id) { return MISSIONS.find((m) => m.id === id) }

  // ---- cast -------------------------------------------------------------------------------
  removeNpc(npc) {
    const i = this.npcs.indexOf(npc)
    if (i >= 0) this.npcs.splice(i, 1)
    for (const [k, v] of Object.entries(this.cast)) if (v === npc) delete this.cast[k]
    npc.dispose()
  }

  setupCast() {
    const g = this.game
    for (const [id, h] of Object.entries(HOMES)) {
      const want = (!h.after || this.isDone(h.after)) && (!h.until || !this.isDone(h.until)) && !this.hidden.has(id)
      const have = this.cast[id]
      if (want && !have) {
        const pos = h.pos(g.world.places)
        const npc = new NPC(g, CAST[h.spec], { x: pos.x, y: g.physics.groundHeight(pos.x, pos.z, 3), z: pos.z, ry: pos.ry ?? 0, personality: 'story', persistent: true, name: SPEAKERS[id]?.name, voice: SPEAKERS[id]?.voice })
        npc.idleAnim = h.anim || 'idle'
        npc.state = h.anim === 'sit' || h.anim === 'squat' || h.anim === 'phone' ? h.anim : 'idle'
        npc.lookAtPlayer = !h.anim || h.anim === 'idle'
        npc.castId = id
        npc.noCrime = true
        this.cast[id] = npc
        this.npcs.push(npc)
        if (h.talk) g.interaction.add({ id: 'talk_' + id, x: () => npc.pos.x, z: () => npc.pos.z, r: 2.6, label: () => this.acts.talkLabel(id) || `Vorbește cu ${SPEAKERS[id]?.name || id}`, enabled: () => !this.active && this.giverId !== id, onInteract: () => this.chat(id) })
      } else if (!want && have) {
        g.interaction.remove('talk_' + id)
        this.removeNpc(have)
      }
    }
    this.acts.setupInteractions()
  }

  // idle chatter when there's no mission with them (and their services, if any)
  async chat(id) {
    const h = HOMES[id]
    const npc = this.cast[id]
    if (npc && npc.state === 'idle') npc.char.lookAtNow(this.game.player.pos.x, this.game.player.pos.z)
    const svc = this.acts.services(id)
    if (svc) return svc()
    const lines = h.chat ? h.chat(this.game, this) : null
    if (lines) await this.game.ui.dialogue(SPEAKERS[id], lines)
  }

  // ---- mission flow ---------------------------------------------------------------------------
  giverPos(m) {
    const g = this.game, gv = m.giver
    if (gv.npc && this.cast[gv.npc]) return this.cast[gv.npc].pos
    if (gv.npc && HOMES[gv.npc]) return HOMES[gv.npc].pos(g.world.places)
    return g.world.places[gv.place]
  }

  showNextGiver() {
    const g = this.game
    g.interaction.remove('mission_giver')
    this.giverId = null
    this.autoStart = null
    const m = this.nextMission()
    if (!m) {
      this.markerActive = false
      g.ui.setMarker(g.director.waypoint, g.director.waypoint ? 'GPS' : '')
      g.ui.setObjective('Chișinăul e al tău. Taxi, curse, gropi, dosare… primăria te așteaptă.', { title: 'JOC LIBER', flash: false })
      return
    }
    const gv = m.giver
    this.giverId = gv.npc || null
    const p0 = this.giverPos(m)
    this.markerActive = true
    g.ui.setMarker({ x: p0.x, z: p0.z, y: CURB_H }, gv.label || m.title)
    g.ui.setObjective(m.startText || `Mergi la {y}${gv.label}{/y}.`, { title: (m.chapterName ? m.chapterName.toUpperCase() + ' · ' : '') + m.title.toUpperCase(), sub: m.hint || '' })
    if (gv.auto) this.autoStart = { m, r: gv.r || 5, armed: Math.hypot(this.P().x - p0.x, this.P().z - p0.z) > (gv.r || 5) || m.id === 'sosire' }
    else g.interaction.add({ id: 'mission_giver', x: () => this.giverPos(m).x, z: () => this.giverPos(m).z, r: gv.r || 3, priority: 5, label: `▶ Misiune: ${m.title}`, enabled: () => !this.active || this.active.def.activity, onInteract: () => this.run(m) })
  }

  async startNew() {
    this.hidden.clear()
    this.setupCast()
    await this.run(MISSIONS[0])
  }

  async resume() {
    this.setupCast()
    this.potholes.syncFixed(this.game.progress.potholes)
    this.showNextGiver()
  }

  failActive(reason) { if (this.active) this.active.fail(reason) }

  async run(def) {
    const g = this.game
    if (this.starting) return
    if (this.active) {
      // story missions interrupt side jobs (taxi shift, pizza…); anything you start yourself
      // interrupts a random street event
      if (!this.active.def.activity || (def.activity && !this.active.def.event)) return
      this.starting = true
      this.active.fail(new MissionFail('', { cancel: true }))
      for (let i = 0; i < 60 && this.active; i++) await new Promise((r) => setTimeout(r, 50))
      this.starting = false
      if (this.active) return
    }
    g.interaction.remove('mission_giver')
    this.autoStart = null
    this.retryDef = null
    g.ui.tip(null)
    const ctx = new MissionContext(this, def)
    this.active = ctx
    ctx.marker(null)
    g.ui.setObjective(null)
    g.events.emit('mission:start', def)
    if (!def.activity) g.progress.story.current = def.id
    let ok = false
    try {
      if (def.intro) { await g.ui.chapter(def.intro[0], def.intro[1], def.intro[2], 3.6); ctx.check() }
      else if (!def.activity && !def.silentStart) g.ui.missionBanner(def.chapterName ? def.chapterName.toUpperCase() : 'MISIUNE', def.title)
      await def.script(ctx)
      ok = !ctx.failed
    } catch (e) {
      if (!(e instanceof MissionFail)) { console.error(e); ctx.failed = new MissionFail('Ceva a mers prost. Mai încearcă.') }
      else if (!ctx.failed) ctx.failed = e
    }
    ctx.cleanup()
    this.active = null
    g.progress.story.current = null
    g.events.emit(ok ? 'mission:pass' : 'mission:fail', def, ctx.failed?.reason || '')
    if (ok) {
      if (!def.activity && !this.done.includes(def.id)) this.done.push(def.id)
      if (def.reward) ctx.reward(def.reward, def.activity ? '' : def.title)
      if (!def.silentPass) {
        g.audio?.sting('mission_pass')
        g.ui.bigMessage(def.passTitle || 'MISIUNE REUȘITĂ', def.passText || def.title, { secs: 3.2 })
      }
      if (def.after) await def.after(g, this)
      if (def.chapterEnd) { await new Promise((r) => setTimeout(r, 3600)); await g.ui.chapter('SFÂRȘIT DE CAPITOL', def.chapterEnd, def.chapterEndText || '', 3.4) }
      g.progress.save()
    } else if (!ctx.failed?.cancel) {
      g.audio?.sting('mission_fail')
      g.ui.bigMessage(def.failTitle || 'MISIUNE EȘUATĂ', ctx.failed?.reason || '', { color: 'red', secs: 3 })
      if (def.onFail) def.onFail(g, this)
      if (!def.noRetry) this.offerRetry(def)
    }
    this.setupCast()
    if (ok && def.next === 'auto') {
      const nx = this.nextMission()
      if (nx) { this.showNextGiver(); await new Promise((r) => setTimeout(r, def.silentPass ? 400 : 2800)); if (!this.active) return this.run(nx) }
    }
    if (!this.active) this.showNextGiver()
  }

  offerRetry(def) {
    this.retryDef = def
    this.retryUntil = performance.now() + 14000
    setTimeout(() => { if (this.retryDef === def) this.game.ui.tip('Apasă {y}[R]{/y} ca să reîncerci misiunea.', 10) }, 3200)
  }

  async retry() {
    const def = this.retryDef
    this.retryDef = null
    const g = this.game
    g.ui.tip(null)
    await g.ui.fade(1, 450)
    g.police.clear()
    const pos = def.retryAt ? def.retryAt(g.world.places) : this.giverPos(def)
    const ang = Math.random() * Math.PI * 2
    const x = pos.x + Math.cos(ang) * 2.2, z = pos.z + Math.sin(ang) * 2.2
    if (g.player.vehicle) g.vehicles.exit(true)
    g.player.teleport(x, g.physics.groundHeight(x, z, 3), z, Math.atan2(pos.x - x, pos.z - z))
    g.cameraRig.target.copy(g.player.pos); g.cameraRig.snap()
    g.progress.hp = Math.max(g.progress.hp, g.progress.maxHp * 0.8)
    await g.ui.fade(0, 450)
    this.run(def)
  }

  blipList() {
    const out = []
    for (const [id, npc] of Object.entries(this.cast)) {
      const h = HOMES[id]
      if (!h?.blip) continue
      out.push({ kind: 'npc', x: npc.pos.x, z: npc.pos.z, label: h.blip, color: this.giverId === id ? '#ffcf4a' : '#7fd4ff' })
    }
    return out.concat(this.acts.blips())
  }

  // a scripted vehicle drives off (along points, or away via the road graph) and despawns out of sight
  leave(v, points = null) {
    const g = this.game
    if (!points) {
      const P = this.P()
      const ax = v.pos.x - P.x, az = v.pos.z - P.z, d = Math.hypot(ax, az) || 1
      const tx = Math.max(-480, Math.min(480, v.pos.x + ax / d * 300)), tz = Math.max(-330, Math.min(350, v.pos.z + az / d * 300))
      points = g.traffic.graph.route(v.pos.x, v.pos.z, tx, tz).slice(1)
    }
    const d = new RouteDriver(g, v, points.length ? points : [{ x: v.pos.x + Math.sin(v.heading) * 80, z: v.pos.z + Math.cos(v.heading) * 80 }], { speed: 12, priority: false, yieldPlayer: true })
    v.keep = true
    v.leaving = true
    v.locked = true
    this.drivers.push(d)
    this.leavers.push({ v, d, t: 0 })
  }

  updateLeavers(dt) {
    const g = this.game
    for (const l of [...this.leavers]) {
      l.t += dt
      const far = Math.hypot(l.v.pos.x - this.P().x, l.v.pos.z - this.P().z) > 130
      const gone = !g.vehicles.list.includes(l.v)
      if (gone || ((far || l.d.done || l.t > 70) && !g.traffic.visible(l.v.pos.x, l.v.pos.z)) || l.t > 120) {
        this.leavers.splice(this.leavers.indexOf(l), 1)
        const i = this.drivers.indexOf(l.d)
        if (i >= 0) this.drivers.splice(i, 1)
        if (!gone && g.player.vehicle !== l.v) g.vehicles.remove(l.v)
      }
    }
  }

  // ---- loop -----------------------------------------------------------------------------------
  fixedUpdate(h) {
    for (const d of this.drivers) d.fixedUpdate(h)
    for (const n of this.npcs) n.fixedUpdate(h)
  }

  update(dt) {
    const g = this.game
    for (const n of this.npcs) n.update(dt)
    if (g.state !== 'play') return
    if (this.active) {
      const a = this.active
      if ((g.cutscene || a.skippable) && !g.ui.modalOpen && !a.skipFlag) {
        this.skipHold = g.input.act('skip') || g.input.act('jump') ? (this.skipHold || 0) + dt : 0
        g.ui.skipHint(true, this.skipHold / 0.6)
        if (this.skipHold > 0.6) { a.skipFlag = true; this.skipHold = 0; g.ui.skipHint(false); a.waiters.filter((w) => w.t !== undefined).forEach((w) => { w.t = 0 }) }
      } else if (!g.cutscene && !a.skippable) g.ui.skipHint(false)
      a.tick(dt)
    }
    if (this.autoStart && (!this.active || this.active.def.activity) && !this.starting && !g.ui.modalOpen && !g.cutscene) {
      const a = this.autoStart
      const d = dist(this.P(), this.giverPos(a.m))
      if (!a.armed) { if (d > a.r + 4) a.armed = true }
      else if (d < a.r) this.run(a.m)
    }
    if (this.retryDef) {
      if (performance.now() > this.retryUntil || this.active) { this.retryDef = null }
      else if (g.input.pressed('retry') && !g.ui.modalOpen && !g.cutscene) this.retry()
    }
    this.updateLeavers(dt)
    this.potholes.update(dt)
    this.acts.update(dt)
    this.events.update(dt)
    const tags = []
    if (this.giverId && this.cast[this.giverId] && !this.active) tags.push({ npc: this.cast[this.giverId], icon: '!' })
    if (g.crew) tags.push(...g.crew.tags())
    if (g.street) tags.push(...g.street.tags())
    g.ui.setTags(tags)
  }

  P() { const p = this.game.player; return p.vehicle ? p.vehicle.pos : p.pos }
}

export { MissionContext }
