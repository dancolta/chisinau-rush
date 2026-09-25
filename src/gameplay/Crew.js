import { pickLine } from '../entities/NPC.js'
import { FILTER } from '../physics/Physics.js'
import { CREW } from '../data/streettalk.js'
import { fill } from '../story/hero.js'

// Gopniks you talked into tagging along. They walk in a loose pack behind you, jump into any
// fight picked with you, hop into your car, and go home when they've had enough, when you
// hit a granny, or the moment the cops get serious.
// Followers live in their own list: outside the crowd's panic, culling and car hits, and
// outside the player's punches.

// crew slots around you: x to your right, z ahead (negative = behind)
const SLOTS = [[-1.3, -1.4], [1.3, -1.4], [0, -2.5]]

export class Crew {
  constructor(game) {
    this.game = game
    this.list = []
    this.trail = []
    this.brainT = 0
    this.barkT = 40
    this.rideT = 30
    const ev = game.events
    ev.on('vehicle:enter', (v) => this.board(v))
    ev.on('vehicle:exit', (v) => this.alight(v))
    ev.on('player:down', () => this.dismissAll(CREW.home))
    ev.on('mission:start', (def) => { if (!def.activity && this.list.length) this.dismissAll(CREW.mission) })
    ev.on('npc:hit', ({ npc, attacker }) => { if (attacker === game.player && npc.archetype === 'babushka' && this.list.length) this.babaRule() })
  }

  get max() { return this.game.progress.tier('gop') >= 3 ? 3 : 2 }
  get full() { return this.list.length >= this.max }
  has(n) { return this.list.includes(n) }
  line(s, vars) { return fill(this.game, s, vars) }

  recruit(n, secs = 300) {
    const g = this.game
    if (this.has(n)) return
    this.detach(n)
    n.ally = true; n.crew = true; n.persistent = true; n.noCrime = true
    n.personality = 'tough'; n.hostile = false; n.enemy = false; n.stayDown = false
    n.maxHp = n.hp = 80; n.dmg = 9; n.runSpeed = 7; n.speed = 1.6
    n.path = []; n.onArrive = null; n.lookAtPlayer = false
    n.slot = [0, 1, 2].find((i) => !this.list.some((m) => m.slot === i)) ?? 0
    n.followOff = SLOTS[n.slot]
    n.followGoal = null
    n.crewT = secs
    n.waiting = false
    n.fought = false
    n.state = 'follow'; n.target = g.player
    this.list.push(n)
    g.progress.stats.recruits = (g.progress.stats.recruits || 0) + 1
    g.events.emit('crew:join', n)
  }

  // out of whichever crowd owned it (a street walker or somebody at a hangout)
  detach(n) {
    const g = this.game
    const i = g.peds.list.indexOf(n); if (i >= 0) g.peds.list.splice(i, 1)
    const a = g.ambient.npcs.indexOf(n); if (a >= 0) g.ambient.npcs.splice(a, 1)
    const sp = n.spot?.npcs
    if (sp) { const k = sp.indexOf(n); if (k >= 0) sp.splice(k, 1) }
    n.spot = null
  }

  // back to being a face in the crowd
  release(n, line = null, flee = false) {
    const g = this.game
    const i = this.list.indexOf(n)
    if (i < 0) return
    this.list.splice(i, 1)
    n.boarding = null
    if (n.riding) { const v = n.riding; const [x, z] = this.doorSpot(v, 0); n.unride(x, z, v.heading) }
    n.ally = false; n.crew = false; n.persistent = false; n.noCrime = false
    n.followOff = null; n.followGoal = null; n.waiting = false; n.hostile = false; n.target = null
    g.events.emit('crew:leave', n)
    if (n.disposed) return
    g.peds.list.push(n)
    if (line) n.say(this.line(line), 3.4)
    if (flee) n.flee(g.player.pos)
    else if (!n.char.ko) { n.node = null; n.prevNode = null; g.peds.repath(n) }
  }

  dismissAll(line = null, flee = false) { for (const n of [...this.list]) this.release(n, line, flee) }

  // you hit a granny: the one rule of the street
  babaRule() {
    const now = performance.now()
    if (now < (this.babaT || 0)) return
    this.babaT = now + 4000
    this.dismissAll(CREW.baba)
    this.game.progress.addRespect('gop', -10, 'ai lovit o babă')
  }

  setWaiting(n, on) {
    n.waiting = on
    n.path = []
    if (on) { n.state = 'idle'; n.home = { x: n.pos.x, z: n.pos.z, ry: n.char.heading }; n.lookAtPlayer = true; n.followGoal = null }
    else { n.lookAtPlayer = false; n.state = 'follow'; n.target = this.game.player }
  }

  // ---- cars ------------------------------------------------------------------------------------
  board(v) {
    const p = this.game.player
    if (p.passenger) return
    for (const n of this.list) {
      if (n.char.ko || n.riding || n.waiting || n.state === 'knocked') continue
      if (Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z) > 32) continue
      n.boarding = { v, t: 0 }
    }
  }

  // where someone gets out: the kerb side first, then behind, then the driver's side
  doorSpot(v, k = 0) {
    const g = this.game
    const h = v.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h)
    const w = v.def.dims[0] + 0.8, l = v.def.dims[2] + 0.9
    const tries = [[-lx * w + fx * 0.6, -lz * w + fz * 0.6], [-lx * w - fx * 1.2, -lz * w - fz * 1.2], [-fx * l, -fz * l], [lx * w - fx * 1.2, lz * w - fz * 1.2]]
    for (let i = 0; i < tries.length; i++) {
      const [ox, oz] = tries[(k + i) % tries.length]
      const x = v.pos.x + ox, z = v.pos.z + oz
      if (!g.vehicles.blocked(x, z)) return [x, z]
    }
    return [v.pos.x - fx * l, v.pos.z - fz * l]
  }

  alight(v) {
    let k = 0
    for (const n of this.list) {
      if (n.boarding?.v === v) n.boarding = null
      if (n.riding !== v) continue
      const [x, z] = this.doorSpot(v, k++)
      n.unride(x, z, v.heading)
      n.state = 'follow'; n.target = this.game.player; n.followGoal = null
    }
  }

  stepBoarding(n, dt) {
    const g = this.game, b = n.boarding, v = b.v
    b.t += dt
    if (v.disposed || g.player.vehicle !== v) { n.boarding = null; return }
    const d = Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z)
    const moving = Math.abs(v.speed) > 2
    // close enough (or off-screen): hop in; the car pulled away from far: stay behind
    if (d < v.def.dims[2] + 1.6 || ((moving || b.t > 4) && (d < 9 || !g.traffic.visible(n.pos.x, n.pos.z)))) { n.boarding = null; n.ride(v); return }
    if (moving && d > 9) { n.boarding = null; return }
    const [x, z] = this.doorSpot(v, n.slot)
    n.walkTo(x, z, { run: true })
    n.state = 'run'
  }

  // ---- fights ------------------------------------------------------------------------------------
  // anyone fighting you or one of the lads (cops excluded: the crew doesn't do cops)
  threats() {
    const g = this.game, p = g.player
    const out = []
    const mine = (t) => t === p || !!(t && t.crew)
    const scan = (arr) => {
      for (const n of arr) {
        if (n.crew || n.char.ko || n.state !== 'fight' || !n.hostile || n.personality === 'cop' || !mine(n.target)) continue
        if (Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 18) out.push(n)
      }
    }
    scan(g.peds.list); scan(g.ambient.npcs)
    if (g.story?.npcs) scan(g.story.npcs.filter((n) => n.enemy && n.hittable))
    return out
  }

  // ---- getting around ------------------------------------------------------------------------------
  clear(a, x, z) {
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz)
    if (d < 0.5) return true
    return !this.game.physics.raycast(a.x, a.y + 1.0, a.z, dx / d, 0, dz / d, d, FILTER.Q_CAMERA)
  }

  // straight to the slot when nothing's in the way, otherwise along your trail around the corner
  route(n) {
    const p = this.game.player
    const th = p.char.heading, [ox, oz] = n.followOff
    const sx = p.pos.x - Math.cos(th) * ox + Math.sin(th) * oz, sz = p.pos.z + Math.sin(th) * ox + Math.cos(th) * oz
    if (this.clear(n.pos, sx, sz)) { n.followGoal = null; return }
    const T = this.trail
    for (let i = T.length - 1, k = 0; i >= 0 && k < 24; i -= 1, k++) if (this.clear(n.pos, T[i].x, T[i].z)) { n.followGoal = T[i]; return }
    n.followGoal = T[0] || null
  }

  // fell far behind while nobody was looking: turn up a few steps behind you
  catchUp(n) {
    const g = this.game, p = g.player
    const T = this.trail
    for (let i = T.length - 3; i >= 0; i--) {
      const q = T[i]
      if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 3) continue
      if (g.traffic.visible(q.x, q.z)) continue
      n.teleport(q.x, g.physics.groundHeight(q.x, q.z, p.pos.y + 2), q.z, p.char.heading)
      n.state = 'follow'; n.target = p; n.followGoal = null; n.path = []
      if (Math.random() < 0.5) setTimeout(() => { if (this.has(n)) n.say(this.line(pickLine(CREW.caught)), 2.4) }, 500)
      return
    }
  }

  // ---- the brain, a few times a second -----------------------------------------------------------------
  brain(dt) {
    const g = this.game, p = g.player
    const pv = p.vehicle
    // two stars: the lads have never met you
    if (g.police.level >= 2) { this.dismissAll(CREW.cops, true); return }
    const threats = this.threats()
    for (const n of [...this.list]) {
      if (n.disposed) { this.list.splice(this.list.indexOf(n), 1); continue }
      if (n.riding) {
        if (n.riding.disposed || !g.vehicles.list.includes(n.riding)) { n.unride(p.pos.x + 1, p.pos.z + 1, p.char.heading); n.state = 'follow'; n.target = p }
        continue
      }
      if (n.char.ko || n.state === 'knocked' || g.street?.talking === n) continue
      if (n.boarding) { this.stepBoarding(n, dt); continue }
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z)
      // left waiting and you never came back
      if (n.waiting && d > 140) { this.release(n); continue }
      if (threats.length && !pv && (!n.waiting || d < 18)) {
        const cur = n.target
        const busy = n.state === 'fight' && cur && cur !== p && !cur.char.ko && threats.includes(cur)
        if (!busy) {
          let best = null, bd = 1e9
          for (const t of threats) { const k = Math.hypot(t.pos.x - n.pos.x, t.pos.z - n.pos.z); if (k < bd) { bd = k; best = t } }
          n.state = 'fight'; n.hostile = true; n.target = best; n.path = []
          if (!n.fought && Math.random() < 0.6) n.say(this.line(pickLine(CREW.fight)), 2)
          n.fought = true
        }
        continue
      }
      if (n.fought) {
        n.fought = false
        n.hostile = false
        if (Math.random() < 0.7) { n.char.anim.play('cheer'); n.say(this.line(pickLine(CREW.won)), 2.2) }
      }
      if (n.waiting) { if (n.state !== 'idle') { n.state = 'idle'; n.path = []; n.hostile = false } continue }
      if (n.state !== 'follow') { n.state = 'follow'; n.target = p; n.path = []; n.hostile = false }
      if (!pv && d > 28 && !g.traffic.visible(n.pos.x, n.pos.z)) this.catchUp(n)
      else if (!pv) this.route(n)
    }
  }

  fixedUpdate(h) { for (const n of this.list) n.fixedUpdate(h) }

  update(dt) {
    const g = this.game, p = g.player
    for (const n of this.list) n.update(dt)
    if (!this.list.length || g.state !== 'play' || !p) return
    // your trail, so the lads can follow you around corners
    if (!p.vehicle) {
      const last = this.trail[this.trail.length - 1]
      const d = last ? Math.hypot(p.pos.x - last.x, p.pos.z - last.z) : 1e9
      if (d > 8) this.trail = [{ x: p.pos.x, z: p.pos.z }]
      else if (d > 1.4) { this.trail.push({ x: p.pos.x, z: p.pos.z }); if (this.trail.length > 40) this.trail.shift() }
    }
    // mama's sarmale wait for no one (they finish the drive first)
    for (const n of [...this.list]) {
      n.crewT -= dt
      if (n.crewT <= 0 && !n.riding && n.state !== 'fight') this.release(n, CREW.sarmale)
    }
    this.brainT -= dt
    if (this.brainT <= 0) { this.brain(0.25 - this.brainT); this.brainT = 0.25 }
    // chatter: in the car it comes over the subtitles, on foot as a bubble
    const riders = p.vehicle ? this.list.filter((n) => n.riding === p.vehicle) : []
    if (riders.length) {
      this.rideT -= dt
      if (this.rideT <= 0 && !g.ui.modalOpen && !g.cutscene) {
        this.rideT = 40 + Math.random() * 40
        const n = riders[Math.floor(Math.random() * riders.length)]
        const text = this.line(pickLine(CREW.ride))
        g.ui.subtitle(n.stName || 'Gopnicul', text, 3.6)
        const stop = g.audio?.voiceStart?.(n.voice, text)
        if (stop) setTimeout(stop, 2400)
      }
    } else {
      this.barkT -= dt
      if (this.barkT <= 0) {
        this.barkT = 35 + Math.random() * 30
        const idle = this.list.filter((n) => n.state === 'follow' && !n.char.ko)
        const n = idle[Math.floor(Math.random() * idle.length)]
        if (n && !g.ui.modalOpen) n.say(this.line(pickLine(CREW.idle)), 2.6)
      }
    }
  }

  tags() { return this.list.filter((n) => !n.riding && !n.char.ko && n.char.visible !== false).map((n) => ({ npc: n, icon: n.stName || '•', cls: 'crew' })) }
  blips() { return this.list.filter((n) => !n.riding).map((n) => ({ kind: 'dot', x: n.pos.x, z: n.pos.z, color: '#8ef07a', r: 3.2 })) }
}
