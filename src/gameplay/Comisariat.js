import { CAST } from '../data/outfits.js'

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const NEAR = 100   // the officers are on the door when you're this close (Pedestrians drops them past 115)

// The Comisariatul de Poliție Centru (the building is Landmarks.comisariat): two officers on the
// door, the patrol cars out front and the steps you walk down after an arrest (Director.jail).
// The officers are ordinary patrol cops from the pedestrian list, so they do what any cop on the
// street does: talk, take a coffee, see a crime and blow the whistle, chase you. The station only
// puts them on the door, and sends them back to it once the fuss is over.
export class Comisariat {
  constructor(game) {
    this.game = game
    this.site = game.world.comisariat || null
    this.posts = (this.site?.posts || []).map((p) => ({ ...p, cop: null }))
    this.t = 0
  }

  // where you're let out: the top of the steps outside the door, facing the street (foot: where
  // you've walked down them to)
  get out() { const s = this.site; return s && { x: s.out.x, y: this.floor(s.out), z: s.out.z, ry: s.ry, foot: s.foot } }

  update(dt) {
    const s = this.site, g = this.game
    if (!s || !g.player) return
    this.t -= dt
    if (this.t > 0) return
    this.t = 0.5
    const P = g.focus(), d = dist(P, s.door)
    // a cut (the game starting, a loaded save, a retry, a teleport): nobody was looking at the
    // door a moment ago
    const cut = !this.last || dist(P, this.last) > 40
    this.last = { x: P.x, z: P.z }
    for (const post of this.posts) {
      const n = post.cop
      if (n && (n.disposed || n.post !== post)) post.cop = null
      if (!post.cop) {
        // a new face on the door, never popping up right in front of you
        if (d < NEAR && (cut || d > 60 || !g.traffic.visible(post.x, post.z))) this.man(post)
        continue
      }
      this.tend(n, post)
    }
    if (d > 170) this.rearm()
  }

  // the landing's floor at a post: looked for from under the canopy, which from higher up is the
  // first thing a ray finds (and where a fresh officer would stand otherwise)
  floor(post) { return this.game.physics.groundHeight(post.x, post.z, 2.4) }

  man(post) {
    const g = this.game
    const n = g.peds.spawn(post.x, post.z, CAST.cop, { personality: 'cop', archetype: 'cop', hp: 60, walkSpeed: 1.15, ry: this.site.ry, voice: { pitch: 0.85 + Math.random() * 0.2, type: 'gruff' } })
    n.teleport(post.x, this.floor(post), post.z, this.site.ry)
    post.cop = n
    this.station(n, post)
    return n
  }

  // on duty: standing at the post, facing the street, turning to watch you when you come close
  station(n, post) {
    n.post = post
    n.returning = false
    n.state = 'idle'; n.path = []; n.onArrive = null; n.vel.set(0, 0, 0)
    n.lookAtPlayer = true
    n.home = { x: post.x, z: post.z, ry: this.site.ry }
  }

  // off the post: an ordinary cop on the beat from now on
  release(n) {
    const post = n.post
    if (post && post.cop === n) post.cop = null
    n.post = null
    n.lookAtPlayer = false
    if (!n.disposed && n.returning) { n.returning = false; n.state = 'walk'; n.path = []; this.game.peds.repath(n) }
  }

  // after a chase, a scuffle or a shove: back to the door (from further off, up the steps rather
  // than through the canopy's columns). Anyone who ended up across town is off the post
  tend(n, post) {
    const g = this.game
    if (g.police.officers.includes(n) || n.hostile || n.char.ko || n.riding || g.street?.talking === n) return
    if (n.state === 'fight' || n.state === 'flee' || n.state === 'knocked') return
    const d = dist(n.pos, post)
    if (d > 60) { this.release(n); return }
    if (n.returning) { if (n.state !== 'walk') this.station(n, post); return }
    if (d < 0.7) return
    n.returning = true
    const back = { onArrive: (m) => { if (m.post === post) this.station(m, post) } }
    if (d < 2.5) n.walkTo(post.x, post.z, back)
    else n.followPath([{ x: this.site.foot.x, z: post.z }, { x: post.x, z: post.z }], back)
  }

  // everybody at their post right now: the screen is black while you're let out, so nobody sees
  // them get there. Whoever is far away, down or still angry is replaced
  fill() {
    const g = this.game
    for (const post of this.posts) {
      let n = post.cop
      if (n && (n.disposed || n.post !== post || n.char.ko || n.hostile || g.police.officers.includes(n) || dist(n.pos, post) > 30)) {
        if (!n.disposed) this.release(n)
        n = post.cop = null
      }
      if (!n) { this.man(post); continue }
      n.teleport(post.x, this.floor(post), post.z, this.site.ry)
      this.station(n, post)
    }
    this.rearm()
  }

  // a bay whose car was driven off (stolen, as a rule) gets a new one while nobody's looking
  rearm() {
    const V = this.game.vehicles
    for (const s of V.parkedSlots) {
      if (s.kind !== 'police' || !s.taken || V.parkedActive.has(s.i)) continue
      if (V.list.some((v) => dist(v.pos, s) < 3)) continue
      s.taken = false
    }
  }

  blips() {
    const s = this.site
    return s ? [{ kind: 'icon', x: s.door.x + 4, z: s.door.z, icon: '🚔' }] : []
  }
}
