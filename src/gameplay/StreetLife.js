import { GOP, BAB, CIV, COP, PAIRS, FILM } from '../data/streettalk.js'
import { fill } from '../story/hero.js'
import { Hood } from './Hood.js'
import { Crowd } from './Crowd.js'

// The street's own behaviour around you: whole-bench fights, people filming a brawl on their
// phones, two neighbours stopping to gossip, grannies who feed the grandchild they've adopted,
// bumps, and what happened to you (for the police report). The gopnik benches themselves live
// in Hood.

const pick = (a) => a[Math.floor(Math.random() * a.length)]

export class StreetLife {
  constructor(game) {
    this.game = game
    this.fights = []
    this.chats = []
    this.filmers = []
    this.angryList = []
    this.incidents = []
    this.nearT = 0
    this.chatT = 2
    this.hood = game.hood = new Hood(game)
    this.crowd = game.crowd = new Crowd(game)
    const ev = game.events
    ev.on('npc:hit', (e) => this.onHit(e))
    ev.on('player:down', () => { for (const f of this.fights) f.lost = true })
  }

  fill(s, vars) { return fill(this.game, s, vars) }
  story() { const a = this.game.story.active; return !!(a && !a.def.activity) }
  // a bench's man on his way over or talking to you (the old shakedown)
  get shake() { return this.hood.enc }
  shakeTalk(s, n) { return this.hood.tollNow(s, n) }

  // something done to you, for the police report (the last few, a few game minutes each)
  incident(kind, data = {}) {
    this.incidents = this.incidents.filter((i) => !i.reported).slice(-3)
    this.incidents.push({ kind, ...data, t: this.hood.clock, reported: false })
  }
  openIncident() { return this.incidents.find((i) => !i.reported && this.hood.clock - i.t < 600) || null }

  // ---- fights with a whole bench ------------------------------------------------------------------
  gopMates(n) {
    const g = this.game
    if (n.spot?.npcs) return n.spot.npcs.filter((m) => m.archetype === 'gopnik')
    return [n, ...g.peds.list.filter((m) => m !== n && m.archetype === 'gopnik' && Math.hypot(m.pos.x - n.pos.x, m.pos.z - n.pos.z) < 8)]
  }

  groupFight(members, { provoked = true } = {}) {
    const g = this.game, p = g.player
    members = members.filter((m) => m && !m.disposed && !m.crew)
    if (!members.length) return null
    const f0 = this.fights.find((f) => f.members.some((m) => members.includes(m)))
    const f = f0 || { members: [], provoked, t: 0, farT: 0, lost: false }
    for (const m of members) {
      if (!f.members.includes(m)) { f.members.push(m); m.fightMemo = { noCrime: m.noCrime, stayDown: m.stayDown } }
      if (m.chat) m.chat.t = 1e9
      m.noCrime = true
      m.stayDown = true
      m.hostile = true
      if (!m.char.ko) { m.state = 'fight'; m.target = p; m.path = []; m.fightCD = 0.3 + Math.random() * 0.9 }
    }
    if (!f0) { this.fights.push(f); g.progress.stats.fights = (g.progress.stats.fights || 0) + 1 }
    return f
  }

  updateFights(dt) {
    const g = this.game, p = g.player
    for (const f of [...this.fights]) {
      f.t += dt
      const standing = f.members.filter((m) => !m.disposed && !(m.char.ko && m.hp <= 0))
      const crew = g.crew.list.filter((c) => !c.char.ko && !c.riding)
      for (const m of standing) {
        if (m.char.ko || m.state === 'knocked' || m.stun > 0) continue
        const t = m.target
        if (m.state !== 'fight' || !t || t.disposed || (t.char && t.char.ko) || (t === p && p.vehicle)) {
          m.hostile = true; m.state = 'fight'
          m.target = crew.length && (p.vehicle || p.char.ko || Math.random() < 0.4) ? crew[Math.floor(Math.random() * crew.length)] : p
        }
      }
      let near = 1e9
      for (const m of standing) near = Math.min(near, Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z))
      f.farT = near > 30 || p.vehicle ? f.farT + dt : 0
      if (!standing.length) this.endFight(f, 'won')
      else if (f.lost) this.endFight(f, 'lost')
      else if (f.farT > 2.5 || f.t > 150) this.endFight(f, 'fled')
    }
  }

  endFight(f, how) {
    const g = this.game, pr = g.progress
    this.fights.splice(this.fights.indexOf(f), 1)
    let spoke = false
    for (const m of f.members) {
      if (m.disposed) continue
      const memo = m.fightMemo || {}
      m.fightMemo = null
      m.hostile = false
      m.noCrime = memo.noCrime ?? false
      if (m.char.ko) {
        // down: up again in a few seconds and back to the bench
        m.stayDown = false
        m.knockT = 2.5 + Math.random() * 3
        const say = !spoke && how === 'won'
        spoke = spoke || say
        m.onGetUp = (n) => { n.hostile = false; n.hp = n.maxHp; this.goHome(n); if (say) n.say(this.fill(pick(GOP.win)), 3.4) }
      } else {
        m.stayDown = memo.stayDown ?? false
        m.state = 'idle'
        this.goHome(m)
        if (!spoke) { spoke = true; m.say(this.fill(how === 'won' ? pick(GOP.win) : how === 'fled' ? pick(GOP.fled) : 'Du-te acasă, [[bratan|tanti]]. Și nu mai veni.'), 3) }
      }
    }
    if (how === 'won') {
      pr.addRespect('gop', f.provoked ? 8 : 10, 'ai câștigat bătaia')
      pr.addXp(40, 'Bătaie de cartier')
      pr.addCred(2)
    } else pr.addRespect('gop', -3, how === 'fled' ? 'ai fugit' : 'ai pierdut bătaia')
    // they started it and you lost: that's one for the police report
    if (how === 'lost' && !f.provoked) this.incident('beaten')
    g.events.emit('street:fight', { how, n: f.members.length })
  }

  // back to their spot on the bench, or on with their walk
  goHome(n) {
    const g = this.game
    if (n.disposed || n.crew) return
    const d = n.ambient
    if (d && n.spot?.npcs?.includes(n)) n.walkTo(d.x, d.z, { face: d.ry, onArrive: (m) => { m.state = d.state || 'idle'; m.vel.set(0, 0, 0) } })
    else if (!d) { n.state = 'walk'; n.path = []; g.peds.repath(n) }
    else n.state = 'idle'
  }

  // a granny with her bag for a few seconds, then she's had enough
  angry(n, secs = 8) {
    n.hostile = true; n.state = 'fight'; n.target = this.game.player; n.path = []
    n.calmT = secs
    if (!this.angryList.includes(n)) this.angryList.push(n)
  }

  updateAngry(dt) {
    for (const n of [...this.angryList]) {
      n.calmT -= dt
      if (n.disposed || n.calmT <= 0 || n.state !== 'fight') {
        this.angryList.splice(this.angryList.indexOf(n), 1)
        if (!n.disposed && !n.char.ko && n.state === 'fight') { n.hostile = false; n.state = 'idle'; this.goHome(n) }
      }
    }
  }

  onHit({ npc, attacker }) {
    const g = this.game
    if (!npc || attacker !== g.player || npc.ally) return
    const now = performance.now()
    if (npc.archetype === 'babushka' && now > (this.babHitT || 0)) { this.babHitT = now + 3000; g.progress.addRespect('bab', -8, 'ai lovit o bunică') }
    if (npc.personality === 'cop' && now > (this.copHitT || 0)) { this.copHitT = now + 3000; g.progress.addRespect('pol', -10) }
    // hit one gopnik and you've hit the whole bench
    if (npc.archetype === 'gopnik' && !npc.crew && !this.fights.some((f) => f.members.includes(npc))) this.groupFight(this.gopMates(npc), { provoked: true })
    if (now > (this.filmT || 0)) { this.filmT = now + 1500; this.film(npc.pos) }
  }

  // ---- people filming a fight -----------------------------------------------------------------------
  film(pos) {
    const g = this.game
    let k = this.filmers.length
    for (const n of g.peds.list) {
      if (k >= 3) break
      // (never standing still on a crossing: cars wait for anyone on the road)
      if (n.archetype === 'gopnik' || n.personality === 'cop' || n.char.ko || n.chat || n.onRoad || (n.state !== 'walk' && n.state !== 'idle')) continue
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z)
      if (d < 12 || d > 30 || Math.random() > 0.3) continue
      n.state = 'phone'; n.path = []; n.vel.set(0, 0, 0)
      n.char.lookAtNow(pos.x, pos.z)
      n.filmT = 6 + Math.random() * 4
      if (Math.random() < 0.45) n.say(pick(FILM), 2.6)
      this.filmers.push(n); k++
    }
  }

  updateFilmers(dt) {
    for (const n of [...this.filmers]) {
      n.filmT -= dt
      if (n.disposed || n.state !== 'phone' || n.filmT <= 0) {
        this.filmers.splice(this.filmers.indexOf(n), 1)
        if (!n.disposed && n.state === 'phone') { n.state = 'walk'; this.game.peds.repath(n) }
      }
    }
  }

  // ---- two neighbours stop for a chat ------------------------------------------------------------------
  startChat() {
    const g = this.game, p = g.player
    if (this.chats.length >= 2) return
    const L = g.peds.list, now = performance.now()
    const ok = (n) => n.state === 'walk' && !n.chat && !n.char.ko && !n.onRoad && (n.archetype === 'civilian' || n.archetype === 'babushka') && now > (n.chatCD || 0)
    for (let i = 0; i < L.length; i++) {
      const a = L[i]
      if (!ok(a)) continue
      const da = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z)
      if (da > 40 || da < 3) continue
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]
        if (!ok(b) || Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 2.6) continue
        a.chatCD = b.chatCD = now + 10000
        if (Math.random() > 0.4) continue
        const c = { who: [a, b], lines: pick(PAIRS), t: 0, dur: 6.5 + Math.random() * 2.5, said2: false }
        for (const n of c.who) { n.chat = c; n.state = 'talk'; n.path = []; n.vel.set(0, 0, 0) }
        a.char.lookAtNow(b.pos.x, b.pos.z); b.char.lookAtNow(a.pos.x, a.pos.z)
        a.say(c.lines[0], 3)
        this.chats.push(c)
        return
      }
    }
  }

  updateChats(dt) {
    for (const c of [...this.chats]) {
      c.t += dt
      const [a, b] = c.who
      const broken = a.disposed || b.disposed || a.state !== 'talk' || b.state !== 'talk'
      if (!c.said2 && c.t > 2.7 && !broken) { c.said2 = true; b.say(c.lines[1], 3.2) }
      if (broken || c.t > c.dur) {
        this.chats.splice(this.chats.indexOf(c), 1)
        const now = performance.now()
        for (const n of c.who) {
          n.chat = null; n.chatCD = now + 45000
          if (!n.disposed && n.state === 'talk' && this.game.street?.talking !== n) { n.state = 'walk'; this.game.peds.repath(n) }
        }
      }
    }
  }

  // ---- bumping into people ---------------------------------------------------------------------------------
  bump(n) {
    const g = this.game, now = performance.now()
    if (now < (n.bumpT || 0) || n.state === 'fight' || n.char.ko || n.crew) return
    n.bumpT = now + 4000
    const a = n.archetype, pr = g.progress
    if (a === 'gopnik') {
      const tier = pr.tier('gop')
      if (tier === 0 && Math.random() < 0.25 && !this.story()) { n.say(this.fill(pick(GOP.bumpAngry)), 2.4); this.groupFight(this.gopMates(n), { provoked: false }); return }
      n.say(this.fill(pick(tier >= 2 ? GOP.bumpFriend : GOP.bump)), 2.4)
    } else if (a === 'cop') n.say(pick(COP.bump), 2.2)
    // a second shove soon after: remembered, and maybe one shove too many
    else if (this.game.crowd?.shoved(n)) return
    else if (a === 'babushka') n.say(pick(['Obraznicule!', 'Uită-te pe unde mergi, maică!', 'Vai de capul tău!']), 2.2)
    else if (Math.random() < 0.6) n.say(pick(CIV.bump), 2.2)
  }

  // ---- benches and passers-by that react to you ---------------------------------------------------------------
  updateNear() {
    const g = this.game, p = g.player, pr = g.progress
    if (p.vehicle || g.ui.modalOpen || g.cutscene || p.char.ko || !p.control) return
    const now = performance.now()
    const tier = pr.tier('gop')
    // grannies who've adopted you
    if (pr.tier('bab') >= 2) {
      for (const n of g.ambient.npcs) {
        if (n.archetype !== 'babushka' || n.char.ko || n.state === 'fight' || now < (n.passT || 0)) continue
        if (Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) > 5) continue
        n.passT = now + 90000
        if (now > (this.feedT || 0) && Math.random() < 0.35) {
          this.feedT = now + 180000
          n.say(this.fill(pick(BAB.feed)), 3)
          pr.feed(0.2); pr.heal(4)
          g.ui.notify('🥧 O plăcintă de la bunica. Caldă.', 2.6, 'gold')
        } else n.say(this.fill(pick(BAB.pass)), 2.6)
      }
    }
    // gopniks walking past call out
    for (const n of g.peds.list) {
      if (n.archetype !== 'gopnik' || n.state !== 'walk' || n.char.ko || now < (n.barkT || 0)) continue
      if (Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) > 4.5) continue
      n.barkT = now + 30000
      if (Math.random() < 0.45) n.say(this.fill(pick(GOP.bark[tier])), 2.4)
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game
    if (g.state !== 'play') return
    this.updateFights(dt)
    this.updateAngry(dt)
    this.updateFilmers(dt)
    this.updateChats(dt)
    this.hood.update(dt)
    this.crowd.update(dt)
    this.nearT -= dt
    if (this.nearT <= 0) { this.nearT = 0.5; this.updateNear() }
    this.chatT -= dt
    if (this.chatT <= 0) { this.chatT = 0.8; this.startChat() }
  }
}
