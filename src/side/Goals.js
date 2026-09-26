import { ACHIEVEMENTS, ACH_TOTAL, TIERS, EXPLAIN, RANK_REWARDS, RESPECT_PERKS, STREAK, SEEDS, countWord } from '../data/goals.js'
import { LEVEL_REWARDS, TITLES, MAX_LEVEL, PERKS, FLAGS, levelLei, levelCost } from '../data/aura.js'
import { RESPECT_NAMES, RESPECT_WHO, RESPECT_ICON } from '../gameplay/Progress.js'
import { districtAt } from '../world/CityLayout.js'
import { CLOTHES } from '../data/wardrobe.js'
import { WEAPONS } from '../data/weapons.js'
import { challengeDef } from './Challenges.js'
import { Stage } from './Stage.js'
import { Seeds } from './Seeds.js'

// Goals, g.side.goals: the layer that makes progress legible and worth coming back for.
// - Achievements („Realizări"): counted from what the game already does (events, stats) and a
//   few counters of its own; a tier unlocks the moment its number is reached, pays its lei right
//   away and gets a card in the Stage queue.
// - The daily streak: the first time you play on a calendar day (after the prologue), a bonus
//   that grows for 7 days in a row; miss a day and it starts over.
// - The 30 golden seed packets (Seeds.js).
// - The progression story: a card the first time you earn each currency, a nudge when the next
//   reward is close, the HUD line under the AURA bar (hints()), a rank's bonus.
// Save data: progress.meta (defaultMeta). An old save (none yet) counts what's already been done
// once, quietly, and pays it as one summary card.

export function defaultMeta() {
  return {
    v: 1,
    ach: {},           // id -> { n: tiers unlocked, at: [when, per tier] }
    c: {},             // counters nobody else keeps: escapes, pan hits, hot pizzas…
    districts: [],     // the districts you've been in
    seeds: [],         // golden seed packets found (their numbers)
    login: { day: 0, streak: 0, best: 0, days: 0 },   // day: the last day the bonus was paid (local days since 1970)
    seen: {},          // explainer cards already shown
    nudged: {},        // "almost there" nudges already given
    lei: 0,            // lei earned since the counting started (the progress page's total)
    fresh: true,       // just created: what's already been done gets counted once, quietly
  }
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const num = (v, d = 0) => (Number.isFinite(v) ? v : d)
export function normalizeMeta(m) {
  const d = defaultMeta()
  if (!m || typeof m !== 'object') return d
  const out = { ...d, ...m, ach: {}, c: {}, seen: { ...obj(m.seen) }, nudged: { ...obj(m.nudged) } }
  for (const [k, r] of Object.entries(obj(m.ach))) if (r && Number.isFinite(r.n)) out.ach[k] = { n: Math.max(0, Math.floor(r.n)), at: Array.isArray(r.at) ? r.at.slice() : [] }
  for (const [k, v] of Object.entries(obj(m.c))) if (Number.isFinite(v)) out.c[k] = v
  out.districts = Array.isArray(m.districts) ? m.districts.filter((x) => typeof x === 'string') : []
  out.seeds = Array.isArray(m.seeds) ? [...new Set(m.seeds.filter((i) => Number.isInteger(i) && i >= 0 && i < SEEDS.count))] : []
  const L = obj(m.login)
  out.login = { day: num(L.day), streak: Math.max(0, num(L.streak)), best: Math.max(0, num(L.best)), days: Math.max(0, num(L.days)) }
  out.lei = Math.max(0, num(m.lei))
  out.fresh = !!m.fresh
  return out
}

// local calendar days since 1970: the streak counts days the way the player's clock does
export const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)

// what the title screen says about today's bonus, from a save that isn't loaded yet
export function loginPreview(save) {
  const L = obj(save?.meta?.login)
  const now = today(), last = num(L.day), streak = num(L.streak)
  if (!save) return { state: 'new', day: 1, streak: 0 }
  if (last === now && streak > 0) return { state: 'taken', day: ((streak - 1) % STREAK.length) + 1, streak }
  const cont = last === now - 1 && streak > 0
  return { state: cont ? 'waiting' : streak > 0 ? 'lost' : 'new', day: cont ? (streak % STREAK.length) + 1 : 1, streak: cont ? streak : 0 }
}

const isGranny = (n) => n && (n.archetype === 'babushka' || n.personality === 'babushka')
// the ones that get a small progress chip when they move ("🚕 4/15"): slow counts you work at
const PROGRESS_CHIPS = new Set(['taxi', 'gropi', 'dosare', 'seeds', 'escape', 'events', 'daily', 'pizza', 'drip', 'districts'])

export class Goals {
  constructor(side) {
    this.side = side
    this.game = side.game
    this.stage = new Stage(side)
    this.seeds = new Seeds(this)
    this.clock = 0
    this.pollT = 0
    this.nudgeT = 8
    this.lastHit = null
    this.last = {}         // achievement id -> the value at the last check (progress chips)
    this.chipT = {}        // achievement id -> clock of its last progress chip
    this.wire()
  }

  // progress.meta, filled in for old saves; a new game or a load swaps the object under us
  get state() {
    const pr = this.game.progress
    if (!pr.meta || pr.meta !== this._m) {
      pr.meta = normalizeMeta(pr.meta)
      this._m = pr.meta
      this.swapped()
    }
    return this._m
  }

  swapped() {
    this.stage.clear()
    this.seeds.reset()
    this.last = {}
    this.lastResp = null
  }

  // ---- what's counted --------------------------------------------------------------------------------
  value(a) {
    const g = this.game, pr = g.progress, s = this.side.state, m = this.state
    const v = a.value
    if (v.startsWith('story:')) return pr.story.done.includes(v.slice(6)) ? 1 : 0
    switch (v) {
      case 'fares': return pr.stats.fares || 0
      case 'potholes': return pr.potholes.length
      case 'dosare': return pr.dosare.length
      case 'ko': return pr.stats.ko || 0
      case 'races': return pr.stats.races || 0
      case 'bribes': return pr.stats.bribes || 0
      case 'fainted': return pr.stats.fainted || 0
      case 'jail': return pr.stats.busted || 0
      case 'gopTier': return pr.tier('gop')
      case 'bestCombo': return s.stats.bestCombo || 0
      case 'nearMiss': return s.stats.nearMiss || 0
      case 'challenges': return s.stats.challenges || 0
      case 'events': return s.stats.events || 0
      case 'fullDays': return s.stats.fullDays || 0
      case 'auraLevel': return s.aura.level
      case 'drip': return s.drip.length
      case 'seeds': return m.seeds.length
      case 'bestStreak': return m.login.best
      case 'districts': return m.districts.length
      default: return m.c[v] || 0
    }
  }

  count(k, n = 1) {
    const m = this.state
    m.c[k] = (m.c[k] || 0) + n
    this.check()
  }

  // how many tiers are unlocked, in all
  get unlocked() { let n = 0; for (const r of Object.values(this.state.ach)) n += r.n; return n }

  // unlock whatever has been reached; the first check on a fresh save does it quietly (retro)
  check() {
    if (this.checking || this.game.state !== 'play') return
    this.checking = true
    const m = this.state
    const retro = m.fresh ? [] : null
    try {
      for (const a of ACHIEVEMENTS) {
        const rec = m.ach[a.id] || { n: 0, at: [] }
        const v = this.value(a)
        const was = this.last[a.id]
        this.last[a.id] = v
        if (rec.n >= a.tiers.length) continue
        let unlocked = false
        while (rec.n < a.tiers.length && v >= a.tiers[rec.n][0]) {
          const t = rec.n
          rec.at[t] = Date.now()
          rec.n++
          m.ach[a.id] = rec
          this.unlock(a, t, retro)
          unlocked = true
        }
        if (!unlocked && !retro && was != null && v > was) this.progressChip(a, rec.n, v)
      }
    } finally {
      this.checking = false
    }
    if (retro) {
      m.fresh = false
      if (retro.length) this.retroCard(retro)
    }
  }

  unlock(a, t, retro) {
    const g = this.game, pr = g.progress
    const reward = { ...a.tiers[t][1] }
    // clothes nobody sells: straight into the wardrobe
    if (reward.clothes) {
      const c = CLOTHES.find((x) => x.id === reward.clothes)
      if (c) { reward.clothesName = c.name; if (!pr.clothes.includes(c.id)) pr.clothes.push(c.id) }
    }
    if (retro) { retro.push({ a, t, reward }); return }
    const tiers = a.tiers.length
    const gold = a.gold || (tiers > 1 && t === 2)
    // the card first, so the cards it sets off (what lei are, what achievements are) come after it
    this.stage.push({
      kind: 'ach', id: a.id, tier: t, tiers, icon: a.icon, name: a.name, hidden: a.hidden, gold, tone: gold ? 'aur' : '',
      reward, count: this.unlocked, total: ACH_TOTAL, dur: 4.2, roll: true,
      onShow: (c) => this.celebrate(c.gold ? 0.32 : tiers > 1 ? 0.14 + t * 0.06 : 0.16, c.gold),
    })
    if (reward.lei) pr.addLei(reward.lei, `🏆 ${a.name}`)
    g.events.emit('achievement', { id: a.id, tier: t })
    this.explain('ach')
  }

  // the juice: the jingle, a jolt of the camera, confetti for the gold ones
  celebrate(shake, big) {
    const g = this.game
    g.audio?.sting('achievement')
    g.cameraRig?.shake(shake)
    const p = g.player
    if (!big) return
    g.ui.flash?.('#ffcf4a', 180)
    if (p && !g.home?.inside) g.fx?.confetti(p.pos.x, p.pos.y + 2.2, p.pos.z, 50)
  }

  // an old save (or a jump into the story): everything already earned, in one card
  retroCard(list) {
    const g = this.game, pr = g.progress
    const lei = list.reduce((n, r) => n + (r.reward.lei || 0), 0)
    this.stage.push({
      kind: 'summary', kick: 'REALIZĂRI DIN CE-AI FĂCUT DEJA', title: `Ai deja ${list.length} ${list.length === 1 ? 'realizare' : 'realizări'}!`,
      icons: list.map((r) => r.a.icon), lei, roll: true, dur: 5,
      onShow: () => this.celebrate(0.2, false),
    })
    if (lei) pr.addLei(lei, '🏆 Realizări din ce-ai făcut deja')
    this.explain('ach')
  }

  // a golden seed packet picked up (Seeds.js): a little money, a little AURA, the count
  found(i) {
    const g = this.game, pr = g.progress, m = this.state
    if (m.seeds.includes(i)) return
    m.seeds.push(i)
    const n = m.seeds.length
    pr.addLei(SEEDS.lei, `🌻 Semințe de aur ${n}/${SEEDS.count}`)
    this.side.aura.gain(SEEDS.aura, `🌻 Semințe de aur ${n}/${SEEDS.count}`, { key: 'seed' })
    this.explain('seeds')
    g.events.emit('seed', { i, n })
    this.check()
  }

  // a count you're working at moved: a small chip, not more than one every few seconds per goal
  progressChip(a, n, v) {
    if (!PROGRESS_CHIPS.has(a.id) || a.hidden || a.max) return
    if (this.clock - (this.chipT[a.id] ?? -99) < 10) return
    this.chipT[a.id] = this.clock
    const target = a.tiers[n][0]
    const tier = a.tiers.length > 1 ? TIERS[n].icon + ' ' : ''
    this.game.ui.chip?.('goal', 1, { text: `${a.icon} ${Math.min(v, target)}/${target}`, sub: `${tier}${a.name}` })
  }

  // ---- the progression story -----------------------------------------------------------------------------
  // the first time you earn each currency, a card says what it's for (once per save)
  explain(k) {
    const m = this.state
    if (m.seen[k] || !EXPLAIN[k]) return
    m.seen[k] = true
    this.stage.push({ kind: 'explain', ...EXPLAIN[k], dur: 7, tall: true, onShow: () => this.game.audio?.sfx('notify', { bus: 'ui', vol: 0.8 }) })
  }

  // what AURA level L brings, in a few words (the HUD line, the progress page)
  levelPrize(L) {
    if (L > MAX_LEVEL) return `★ + ${levelLei(L)} lei`
    const title = TITLES.find((t) => t.from === L)
    for (const r of LEVEL_REWARDS[L] || []) {
      if (r.clothes) { const c = CLOTHES.find((x) => x.id === r.clothes); if (c) return `👕 ${c.name}` }
      if (r.weapon) return `${WEAPONS[r.weapon].icon} ${WEAPONS[r.weapon].name}`
      if (r.flag) return `${FLAGS[r.flag].icon} ${r.flag === 'nitro' ? 'Nitro' : 'Acte false'}`
      if (r.perk) return `${PERKS[r.perk].icon} ${PERKS[r.perk].name}`
      if (r.respect) return `${RESPECT_ICON[r.respect[0]]} +${r.respect[1]} respect`
    }
    if (title) return `🏷️ „${title.name}"`
    return `💵 ${levelLei(L)} lei`
  }

  rankPrize(idx) {
    const r = RANK_REWARDS[idx]
    if (!r) return ''
    const parts = [`+${r.lei} lei`]
    if (r.weapon) parts.push(`${WEAPONS[r.weapon].icon} ${WEAPONS[r.weapon].name}`)
    if (r.respect) parts.push(`${RESPECT_ICON[r.respect[0]]} +${r.respect[1]} respect`)
    return parts.join(' · ')
  }

  // the HUD line under the AURA bar takes turns: the next AURA level, the next rank, the day's
  // closest challenge. Each: what you get, how far it is, how far along you are (0..1).
  hints() {
    const g = this.game, pr = g.progress, a = this.side.aura
    const out = []
    const lv = a.level
    out.push({ key: 'aura', icon: '✨', label: `Nv ${lv + 1}`, prize: this.levelPrize(lv + 1), left: `${a.toNext} AURA`, k: a.progress })
    const nr = pr.nextRank
    if (nr) {
      const span = nr.xp - pr.rank.xp
      out.push({ key: 'xp', icon: '⭐', label: nr.name, prize: `+${RANK_REWARDS[pr.rankIdx + 1]?.lei || 0} lei`, left: `${Math.max(0, nr.xp - pr.xp)} XP`, k: Math.max(0, Math.min(1, (pr.xp - pr.rank.xp) / span)) })
    }
    const ch = this.side.challenges
    if (ch.unlocked) {
      let best = null
      for (const c of ch.list) {
        const def = challengeDef(c.id)
        if (!def || c.done) continue
        const k = Math.min(1, c.n / def.n)
        if (!best || k > best.k) best = { key: 'daily', icon: def.icon, label: def.text, prize: '', left: `${ch.fmtN(def, c.n)}/${ch.fmtN(def, def.n)}`, k }
      }
      if (best) out.push(best)
    }
    return out
  }

  // "almost there": one nudge in the feed at a time, once per goal and tier
  nudge() {
    const g = this.game, m = this.state, pr = g.progress, a = this.side.aura
    if ((this.nudgeT -= 0.5) > 0 || g.ui.modalOpen || g.cutscene || g.story?.active?.def.id === 'sosire') return
    const say = (key, html) => { m.nudged[key] = 1; this.nudgeT = 30; this.side.ui.feed(html, 4.5, 'nudge') }
    // the next AURA level
    if (a.toNext > 0 && a.toNext <= levelCost(a.level) * 0.15 && !m.nudged['lv' + (a.level + 1)]) {
      return say('lv' + (a.level + 1), `✨ Încă {y}${a.toNext} AURA{/y} până la nivelul ${a.level + 1}: ${this.levelPrize(a.level + 1)}`)
    }
    // the next rank
    const nr = pr.nextRank
    if (nr) {
      const left = nr.xp - pr.xp, span = nr.xp - pr.rank.xp
      if (left > 0 && left <= span * 0.15 && !m.nudged['rank' + (pr.rankIdx + 1)]) return say('rank' + (pr.rankIdx + 1), `⭐ Încă {y}${left} XP{/y} până la rangul „${nr.name}" (+${RANK_REWARDS[pr.rankIdx + 1]?.lei || 0} lei)`)
    }
    // an achievement tier within reach
    for (const d of ACHIEVEMENTS) {
      if (d.hidden || d.max || d.nudge === false || !d.unit) continue
      const rec = m.ach[d.id], n = rec ? rec.n : 0
      if (n >= d.tiers.length) continue
      const target = d.tiers[n][0], left = target - this.value(d)
      const key = `${d.id}:${n}`
      if (left <= 0 || left > Math.max(1, Math.round(target * 0.1)) || m.nudged[key]) continue
      const tier = d.tiers.length > 1 ? TIERS[n] : null
      return say(key, `🎯 Încă {y}${countWord(left, d.unit)}{/y} până la ${tier ? tier.icon + ' ' : ''}{y}${d.name}{/y}${tier ? ` (${tier.name})` : ''}!`)
    }
  }

  // ---- the daily streak ----------------------------------------------------------------------------------
  today() { return today() }

  // the first time you play on a calendar day, once you're out of the prologue
  checkLogin() {
    const g = this.game, pr = g.progress
    if (!g.story?.isDone('sosire')) return
    const L = this.state.login
    const now = today()
    if (L.day === now) return
    if (now < L.day) { L.day = now; return }    // a clock set back: nothing owed, nothing lost
    L.streak = L.day === now - 1 ? L.streak + 1 : 1
    L.day = now
    L.best = Math.max(L.best, L.streak)
    L.days++
    const i = (L.streak - 1) % STREAK.length, r = STREAK[i]
    const nx = STREAK[(i + 1) % STREAK.length]
    // queued before the money moves, so the card comes ahead of the cards the money sets off; the
    // money is paid now (right as you arrive), the card shows at the first calm moment
    this.stage.push({
      kind: 'streak', day: i + 1, week: Math.floor((L.streak - 1) / STREAK.length) + 1, reward: r, roll: true, tall: true, dur: 6,
      next: i + 1 < STREAK.length ? `Revino mâine: <b>+${nx.lei} lei${nx.aura ? ` · +${nx.aura} AURA` : ''}</b>. O zi ratată și o iei de la capăt.` : 'Săptămână completă! Mâine începe una nouă.',
      onShow: () => { g.audio?.sting('streak'); g.cameraRig?.shake(0.18); const p = g.player; if (p && !g.home?.inside) g.fx?.confetti(p.pos.x, p.pos.y + 2.2, p.pos.z, 40) },
    })
    pr.addLei(r.lei, `🔥 Bonus zilnic, ziua ${i + 1}`)
    if (r.aura) this.side.aura.gain(r.aura, `🔥 Bonus zilnic, ziua ${i + 1}`, { raw: true, quiet: true })
    // day 7: mama's parcel (sarmale): fed and healed
    if (r.mama) { pr.hunger = 1; pr.heal(pr.maxHp) }
    this.check()
  }

  // ---- listening to the game -------------------------------------------------------------------------------
  wire() {
    const g = this.game, ev = g.events
    // money and XP come at the end of most things worth counting (a pothole, a dossier, a job):
    // a good moment to look
    ev.on('lei', ({ n }) => {
      if (g.state !== 'play') return
      const m = this.state
      if (n > 0) { m.lei += n; this.explain('lei') }
      if (g.progress.lei <= 0) this.count('broke')
      else this.check()
    })
    ev.on('xp', ({ n }) => { if (n > 0 && g.state === 'play') { this.explain('xp'); this.side.ui.hintFocus?.('xp'); this.check() } })
    ev.on('rankup', (r, idx) => {
      const rw = RANK_REWARDS[idx], pr = g.progress
      if (!rw) return
      pr.addLei(rw.lei, `⭐ Prima de rang: ${r.name}`)
      if (rw.respect) pr.addRespect(rw.respect[0], rw.respect[1], 'rang nou')
    })
    ev.on('respect', ({ k, tier, up }) => {
      if (!up) return
      this.explain('respect')
      this.stage.push({ kind: 'respect', icon: RESPECT_ICON[k], who: RESPECT_WHO[k], tierName: RESPECT_NAMES[k][tier], text: RESPECT_PERKS[k][tier], dur: 5.5, tall: true, onShow: () => g.audio?.sfx('confirm', { bus: 'ui' }) })
      this.check()
    })
    ev.on('police:escape', ({ level } = {}) => { this.state.c.escapes = (this.state.c.escapes || 0) + 1; if ((level || 0) >= 3) this.state.c.escape3 = (this.state.c.escape3 || 0) + 1; this.check() })
    ev.on('police:deal', ({ how } = {}) => { if (how === 'papers') this.count('papers'); else this.check() })
    ev.on('pizza:delivered', ({ hot } = {}) => { if (hot) this.count('hotPizza'); else this.check() })
    // a story mission's rating (Story emits it when one passes)
    ev.on('mission:rated', ({ stars } = {}) => { if (stars >= 3) this.count('stars3') })
    ev.on('npc:hit', ({ attacker } = {}) => {
      if (!attacker || attacker !== g.player) return
      const w = g.player.weapon
      if (w === 'tigaie') this.count('tigaie')
      else if (w === 'pistol') this.count('water')
    })
    ev.on('vehicle:exit', (v) => { const p = g.player; if (p?.bailT > 0 && v && Math.abs(v.speed) > 15) this.count('bails') })
    ev.on('player:crash', ({ force, other } = {}) => {
      if (!other?.def?.trolley || (force || 0) < 12 || this.clock - (this.trolleyT ?? -9) < 8) return
      this.trolleyT = this.clock
      this.count('trolley')
    })
    ev.on('player:hit', ({ by } = {}) => { this.lastHit = { by, t: this.clock } })
    ev.on('player:down', () => {
      const h = this.lastHit
      if (h && this.clock - h.t < 4 && isGranny(h.by)) this.count('byGranny')
      else this.check()
    })
    for (const e of ['npc:ko', 'taxi:fare', 'race:end', 'mission:pass', 'daily:done', 'side:levelup', 'stunt:bank', 'outfit', 'crew:join']) ev.on(e, () => this.check())
  }

  // ---- per frame -----------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game
    this.clock += dt
    const m = this.state
    // what nothing announces: districts, a respect gain, empty pockets; the daily bonus
    if ((this.pollT -= dt) <= 0) {
      this.pollT = 0.5
      this.poll(m)
      this.checkLogin()
      this.check()
      this.nudge()
    }
    this.seeds.update(dt)
    this.stage.update(dt)
  }

  poll(m) {
    const g = this.game, pr = g.progress, p = g.player
    if (p && !g.home?.inside && !g.cutscene) {
      const P = p.vehicle ? p.vehicle.pos : p.pos
      const d = districtAt(P.x, P.z)
      if (d !== 'Chișinău' && !m.districts.includes(d)) m.districts.push(d)
    }
    const resp = pr.respect.gop + pr.respect.bab + pr.respect.pol
    if (this.lastResp != null && resp > this.lastResp) this.explain('respect')
    this.lastResp = resp
    if (pr.lei <= 0 && !m.c.broke) m.c.broke = 1
  }

  blips() { return this.seeds.blips() }
}
