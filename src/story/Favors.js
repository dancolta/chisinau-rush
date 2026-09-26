import { NPC } from '../entities/NPC.js'
import { SPEAKERS } from './cast.js'
import { FAVORS } from './missions/favors.js'
import { OFFERS } from './hooks.js'

// Favours: short side missions that people ask you for on the phone between story missions
// (Tanti Maria's jars, a wedding convoy, the mayor's press conference…). One unlocks with a
// story mission; a little after it the caller rings, and from then on the favour waits on the
// map (an icon on the minimap's rim, the person standing there with a blue star over their
// head, [E] to start). Done ones go on the pause menu's list, to replay for stars.
// Save data: progress.story.favors = { offered: [ids], done: [ids] }.
export class Favors {
  constructor(game, story) {
    this.game = game
    this.story = story
    this.npcs = {}           // id -> the giver standing there (only while you're near)
    this.t = 0
  }

  get list() { return FAVORS }
  byId(id) { return FAVORS.find((f) => f.id === id) || null }
  get st() {
    const s = this.game.progress.story
    s.favors ||= { offered: [], done: [] }
    s.favors.offered ||= []; s.favors.done ||= []
    return s.favors
  }
  isOffered(id) { return this.st.offered.includes(id) }
  isDone(id) { return this.st.done.includes(id) }
  // on the map right now: offered, not done, not running
  open() { return FAVORS.filter((f) => this.isOffered(f.id) && !this.isDone(f.id) && this.story.active?.def !== f) }
  unlocked(f) { return !f.unlock || this.story.isDone(f.unlock) }

  offer(id) {
    const f = this.byId(id)
    if (!f || this.isOffered(id)) return
    this.st.offered.push(id)
    this.game.ui.notify(`${f.icon} {y}Favor nou pe hartă:{/y} ${f.title}`, 4, 'gold')
    this.game.events.emit('favor:offer', id)
    this.story.refreshSub()
  }

  markDone(id) { if (!this.isDone(id)) this.st.done.push(id) }

  // the phone rings for every favour that has just unlocked (after the story's own hook)
  check(delay = 28) {
    for (const f of FAVORS) {
      if (!this.unlocked(f) || this.isOffered(f.id) || this.isDone(f.id) || this.story.phone.has('offer:' + f.id)) continue
      const o = OFFERS[f.id]
      if (!o) { this.offer(f.id); continue }
      this.story.phone.call(o[0], o[1], { id: 'offer:' + f.id, delay, onEnd: () => this.offer(f.id) })
      delay += 30
    }
  }

  // a new game or a loaded save
  reset() { for (const id of Object.keys(this.npcs)) this.drop(id) }

  // the giver a favour's script starts with: the one standing there (taken over by the
  // mission), or null for the script to spawn its own (a replay, or you came by car too fast)
  take(id) {
    const n = this.npcs[id]
    if (!n) return null
    delete this.npcs[id]
    this.game.interaction.remove('favor_' + id)
    return n
  }

  drop(id) {
    const n = this.npcs[id]
    if (!n) return
    delete this.npcs[id]
    this.game.interaction.remove('favor_' + id)
    if (this.story.npcs.includes(n)) this.story.removeNpc(n)
  }

  spawn(f) {
    const g = this.game, s = this.story
    const gv = f.giver, pos = gv.pos(g.world.places)
    const sp = SPEAKERS[gv.speaker] || {}
    const npc = new NPC(g, gv.spec || sp.spec, { x: pos.x, y: g.physics.groundHeight(pos.x, pos.z, 3), z: pos.z, ry: pos.ry ?? 0, personality: 'story', persistent: true, name: sp.name, voice: sp.voice })
    npc.idleAnim = gv.anim || 'idle'
    if (gv.anim === 'phone' || gv.anim === 'sit') npc.state = gv.anim
    npc.lookAtPlayer = !gv.anim || gv.anim === 'idle'
    npc.noCrime = true
    npc.favorId = f.id
    s.npcs.push(npc)
    this.npcs[f.id] = npc
    g.interaction.add({
      id: 'favor_' + f.id, x: () => npc.pos.x, z: () => npc.pos.z, r: 2.8, priority: 5,
      label: `▶ Favor: ${f.title}`,
      enabled: () => !s.active || s.active.def.activity,
      onInteract: () => s.run(f),
    })
  }

  update(dt) {
    if ((this.t -= dt) > 0) return
    this.t = 0.5
    const s = this.story, P = s.P()
    const busy = s.active && !s.active.def.activity
    for (const f of FAVORS) {
      const want = !busy && this.isOffered(f.id) && !this.isDone(f.id)
      const pos = f.giver.pos(this.game.world.places)
      const d = Math.hypot(pos.x - P.x, pos.z - P.z)
      const have = this.npcs[f.id]
      if (want && !have && d < 150) this.spawn(f)
      else if (have && (!want || d > 175)) this.drop(f.id)
    }
  }

  tags() { return Object.values(this.npcs).filter((n) => !n.char.ko).map((n) => ({ npc: n, icon: '★', cls: 'favor' })) }

  blips() {
    const out = []
    for (const f of this.open()) { const p = f.giver.pos(this.game.world.places); out.push({ kind: 'icon', x: p.x, z: p.z, icon: f.icon, edge: true }) }
    return out
  }
}
