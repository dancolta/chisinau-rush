import { CHALLENGES, CHALLENGE_REWARD, DAILY_BONUS, DAY_HOURS } from '../data/aura.js'

const BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]))
export const challengeDef = (id) => BY_ID.get(id)

// Three challenges per game day (24 game hours = 24 real minutes): one easy, one medium, one
// hard, tracked from what already happens in the game. One free reroll a day, a bonus for
// finishing all three. They start once the story has let you out on the street (after
// "Bani de pâine").
export class Challenges {
  constructor(side) {
    this.side = side
    this.game = side.game
    this.shown = new Map()   // id -> game time of the last progress toast
  }

  get d() { return this.side.state.daily }
  get list() { return this.d.list }
  get unlocked() { return this.game.story?.isDone('paine') }
  get rerollsLeft() { return Math.max(0, (this.side.perk('reroll2') ? 2 : 1) - this.d.rerolls) }
  // game hours until the next set
  get hoursLeft() { return Math.max(0, this.d.until - this.side.state.clock) }

  update() {
    if (!this.unlocked) return
    const d = this.d
    if (!d.list.length || this.side.state.clock >= d.until) this.issue()
  }

  // a fresh set: one per tier, story-appropriate, nothing from yesterday if it can be helped
  issue(ids = null) {
    const d = this.d, st = this.side.state
    const before = d.list.map((c) => c.id)
    // two challenges counting the same thing would progress together: one of each kind
    const kinds = new Set()
    const pick = (tier) => {
      const ok = CHALLENGES.filter((c) => c.tier === tier && this.available(c) && !kinds.has(c.kind))
      const fresh = ok.filter((c) => !before.includes(c.id))
      const pool = fresh.length ? fresh : ok
      const c = pool[Math.floor(Math.random() * pool.length)]
      if (c) kinds.add(c.kind)
      return c
    }
    const defs = ids ? ids.map((id) => BY_ID.get(id)).filter(Boolean) : [pick(1), pick(2), pick(3)].filter(Boolean)
    d.list = defs.map((c) => ({ id: c.id, n: 0, done: false }))
    d.until = st.clock + DAY_HOURS
    d.rerolls = 0
    d.bonus = false
    d.day = (d.day || 0) + 1
    st.today = { aura: 0 }
    if (d.day > 1 || before.length) this.side.ui.feed('📋 {y}Provocări noi{/y} pentru azi. Le vezi în pauză, la {y}Aură{/y}.', 4.5)
    this.side.hint('daily')
    this.game.events.emit('daily:new', d.list.map((c) => c.id))
  }

  available(c) { return !c.after || this.game.story?.isDone(c.after) }

  // something happened: kind with an amount (sums) or a value (best-of challenges)
  track(kind, amount = 1) {
    if (!this.unlocked || !(amount > 0)) return
    for (const c of this.d.list) {
      if (c.done) continue
      const def = BY_ID.get(c.id)
      if (!def || def.kind !== kind) continue
      const before = c.n
      c.n = def.max ? Math.max(c.n, amount) : c.n + amount
      if (c.n === before) continue
      if (c.n >= def.n) this.complete(c, def)
      else this.progressToast(c, def)
    }
  }

  progressToast(c, def) {
    const t = this.side.aura.clock
    if (t - (this.shown.get(c.id) || -99) < 6) return
    this.shown.set(c.id, t)
    this.side.ui.feed(`${def.icon} ${def.text}: {y}${this.fmtN(def, c.n)}/${this.fmtN(def, def.n)}{/y}`, 2.6, 'small')
  }

  fmtN(def, n) { return def.unit === 'm' && def.n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' km' : String(Math.floor(n)) }

  complete(c, def) {
    c.done = true
    c.n = def.n
    const r = CHALLENGE_REWARD[def.tier]
    const st = this.side.state.stats
    st.challenges++
    this.side.reward({ kind: 'challenge', title: def.text, icon: def.icon, aura: r.aura, lei: r.lei })
    this.game.events.emit('daily:done', c.id)
    if (this.d.list.every((x) => x.done) && !this.d.bonus) {
      this.d.bonus = true
      st.fullDays++
      this.side.reward({ kind: 'bonus', title: 'Toate provocările zilei', icon: '🏆', aura: DAILY_BONUS.aura, lei: DAILY_BONUS.lei })
    }
  }

  // swap one unfinished challenge for another of the same tier
  reroll(i) {
    const d = this.d, c = d.list[i]
    if (!c || c.done || this.rerollsLeft <= 0) return false
    const def = BY_ID.get(c.id)
    const taken = new Set(d.list.map((x) => BY_ID.get(x.id)?.kind))
    const pool = CHALLENGES.filter((x) => x.tier === def.tier && x.id !== c.id && this.available(x) && !taken.has(x.kind))
    if (!pool.length) return false
    const nx = pool[Math.floor(Math.random() * pool.length)]
    d.list[i] = { id: nx.id, n: 0, done: false }
    d.rerolls++
    this.game.audio?.sfx('toggle', { bus: 'ui' })
    return true
  }
}
