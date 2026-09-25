import { HAPPENINGS } from './events/index.js'
import { dist, here } from './events/common.js'

// When something happens in free roam: every few minutes (counted only while you're actually
// free: no mission or side job, no stars, not at home, no cutscene or dialogue) the neighbours'
// Viber group announces a street event. It shows on the map; walk or drive up to it and it
// starts, ignore it and it goes away. Each event runs as an activity mission, so a story mission
// can always cut in. Tests switch it off with g.story.events.t = 1e9, like the old scheduler.
export class Happenings {
  constructor(game, story) {
    this.game = game
    this.story = story
    this.t = 55 + Math.random() * 35     // the first one about a minute into free roam
    this.offer = null
    this.recent = []
  }

  get side() { return this.game.side }
  get list() { return HAPPENINGS }
  byId(id) { return HAPPENINGS.find((h) => h.id === id) }

  // free roam, nothing else going on
  free() {
    const g = this.game, s = this.story, p = g.player
    return g.state === 'play' && !g.paused && !s.active && !s.starting && !g.ui.modalOpen && !g.cutscene &&
      (g.police?.level || 0) === 0 && !g.home?.inside && s.isDone('paine') && !!p && p.control && !p.passenger && !g.director?.handlingDown
  }

  update(dt) {
    if (this.offer) { this.tickOffer(dt); return }
    if (!this.free()) return
    this.t -= dt
    if (this.t > 0) return
    if (!this.makeOffer()) this.t = 12   // nothing fits here and now: look again soon
  }

  pick() {
    const g = this.game
    const ok = HAPPENINGS.filter((h) => !this.recent.includes(h.id) && safe(() => h.when(g)))
    let sum = 0
    for (const h of ok) sum += h.weight ?? 1
    let r = Math.random() * sum
    for (const h of ok) { r -= h.weight ?? 1; if (r <= 0) return h }
    return ok[ok.length - 1] || null
  }

  makeOffer(id = null) {
    const g = this.game
    const def = id ? this.byId(id) : this.pick()
    if (!def) return false
    const spot = safe(() => def.where(g, !!id))
    if (!spot) return false
    this.recent.push(def.id)
    if (this.recent.length > 3) this.recent.shift()
    const d0 = dist(here(g), spot)
    // it starts when you come up to it; if you're already inside the circle, walk out first
    this.offer = { def, spot, t: 0, lastD: d0, armed: d0 > (def.engage || 45), cleanup: safe(() => def.offer?.(g, spot)) || null }
    this.side?.ui.setMark({ x: spot.x, z: spot.z, icon: def.icon })
    if (def.viber) this.side?.ui.viber(def.who, def.viber)
    g.events.emit('happening:offer', def.id)
    return true
  }

  tickOffer(dt) {
    const o = this.offer, g = this.game
    if (!this.free()) { this.drop(35); return }
    o.t += dt
    safe(() => o.def.offerTick?.(g, o.spot, dt))
    if (this.side) { const mk = this.side.ui.markOn; if (mk) { mk.x = o.spot.x; mk.z = o.spot.z } }
    const d = dist(here(g), o.spot), R = o.def.engage || 45
    // a teleport (fainting, the flat's door, a retry) isn't coming up to it
    const jump = Math.abs(d - o.lastD) > 30
    o.lastD = d
    if (jump) o.armed = d > R
    else if (d > R + 5) o.armed = true
    if (o.t > (o.def.offerTime || 110) || d > 360) { this.drop(45); return }
    if (o.armed && d < R && (!o.def.ready || safe(() => o.def.ready(g)))) { const { def, spot } = o; this.clear(); this.start(def, spot) }
  }

  clear() {
    const o = this.offer
    this.offer = null
    safe(() => o?.cleanup?.())
    this.side?.ui.setMark(null)
  }

  // the offer lapsed (or something more important came up): the next one comes sooner
  drop(next) { this.clear(); this.side?.ui.hideViber(); this.t = next + Math.random() * 30 }

  start(def, spot) {
    this.t = 150 + Math.random() * 90    // then a few minutes of peace
    this.side?.ui.hideViber()            // the event's objective takes over from the message
    const run = {
      id: def.id, activity: true, event: true, chapterName: 'Întâmplare', title: def.title,
      failTitle: 'RATAT', silentPass: true, noRetry: true, silentStart: true,
      script: (m) => def.script(m, spot),
    }
    this.game.events.emit('happening:start', def.id)
    return this.story.run(run)
  }

  // dev/tests: start one right now, near the player (resolves when it's over)
  force(id) {
    const def = this.byId(id)
    if (!def) return null
    const spot = safe(() => def.where(this.game, true))
    if (!spot) return null
    if (this.offer) this.clear()
    return this.start(def, spot) || Promise.resolve()
  }

  blips() {
    const o = this.offer
    return o ? [{ kind: 'icon', x: o.spot.x, z: o.spot.z, icon: o.def.icon, edge: true }] : []
  }
}

function safe(fn) { try { return fn() } catch (e) { console.error('[happenings]', e); return null } }
