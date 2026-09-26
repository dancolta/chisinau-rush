import { Aura } from './Aura.js'
import { Stunts } from './Stunts.js'
import { Challenges, challengeDef } from './Challenges.js'
import { SideUI } from './SideUI.js'
import { UP, DOWN, AURA, LEVEL_REWARDS, levelLei, levelOf, levelStart, titleOf, PERKS, FLAGS } from '../data/aura.js'
import { CLOTHES } from '../data/wardrobe.js'
import { WEAPONS } from '../data/weapons.js'
import { RESPECT_WHO } from '../gameplay/Progress.js'

// The side-content layer, g.side: AURA (the meme currency and its levels), car stunts, the daily
// challenges and the random street events (their scheduler is g.story.events). It listens to
// what the rest of the game already does (fights, KOs, fares, crashes, cops…) and never takes
// control away: rewards and the level-up wait for a calm moment, events are offers you walk up to.
// Save data lives in progress.side (see defaultState); older saves just start from zero.

export function defaultState() {
  return {
    v: 1,
    aura: { total: 0, level: 1, rewarded: 1, lifetime: 0, lost: 0 },
    clock: 0,                  // game hours played (sleeping and fainting count), for the daily reset
    today: { aura: 0 },
    daily: { list: [], until: 0, rerolls: 0, bonus: false, day: 0 },
    stats: { events: 0, eventsFailed: 0, byEvent: {}, combos: 0, bestCombo: 0, bestMult: 0, nearMiss: 0, challenges: 0, fullDays: 0, levelUps: 0 },
    seen: {},                  // one-time hints
    kioskDay: -1,              // the day the free kiosk item was last used
    drip: [],                  // clothes already celebrated
  }
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d)
export function normalizeState(s) {
  const d = defaultState()
  if (!s || typeof s !== 'object') return d
  const out = {
    ...d, ...s,
    aura: { ...d.aura, ...(s.aura || {}) },
    today: { ...d.today, ...(s.today || {}) },
    daily: { ...d.daily, ...(s.daily || {}) },
    stats: { ...d.stats, ...(s.stats || {}), byEvent: { ...(s.stats?.byEvent || {}) } },
    seen: { ...(s.seen || {}) },
    drip: Array.isArray(s.drip) ? s.drip.slice() : [],
  }
  const a = out.aura
  a.total = Math.max(0, num(a.total))
  a.level = Math.max(1, Math.round(num(a.level, 1)))
  a.total = Math.max(a.total, levelStart(a.level))
  a.level = Math.max(a.level, levelOf(a.total))
  a.rewarded = Math.max(1, Math.min(a.level, Math.round(num(a.rewarded, a.level))))
  out.clock = Math.max(0, num(out.clock))
  out.daily.list = Array.isArray(s.daily?.list) ? s.daily.list.filter((c) => c && challengeDef(c.id)).map((c) => ({ id: c.id, n: num(c.n), done: !!c.done })) : []
  out.daily.until = num(out.daily.until)
  return out
}

export class SideContent {
  constructor(game) {
    this.game = game
    this.queue = []            // rewards waiting for a calm moment
    this.calmT = 0
    this.gapT = 0
    this.lastHour = null
    this.lastHit = null
    this.watch = null
    this.watchT = 0
    this.auto = null           // dev/tests: 'win' | 'lose' makes the minigames play themselves
    this.lingering = []        // event extras that stay a while after the event (the wedding keeps dancing)
    this.ui = new SideUI(this)
    this.aura = new Aura(this)
    this.stunts = new Stunts(this)
    this.challenges = new Challenges(this)
    this.wire()
  }

  get events() { return this.game.story?.events }

  // progress.side, filled in for old saves; a new game or a load swaps the object under us
  get state() {
    const pr = this.game.progress
    if (!pr.side || pr.side !== this._s) {
      pr.side = normalizeState(pr.side)
      this._s = pr.side
      this.fresh()
    }
    return this._s
  }

  fresh() {
    this.lastHour = null
    this.queue = []
    this.watch = null
    this.dropLingering()
    if (this.stunts) { this.stunts.combo = null; this.stunts.reset(); this.ui?.stuntClear() }
    if (this.aura) { this.aura.streak = 0; this.aura.streakT = 0 }
    // a level-up saved before its rewards were handed out gets them now
    const a = this._s.aura
    if (a.rewarded < a.level) this.queue.push({ kind: 'level', from: a.rewarded, to: a.level })
  }

  perk(id) { const p = PERKS[id]; return !!p && this.state.aura.level >= p.at }

  // ---- what the street thinks of what you do --------------------------------------------------------------
  wire() {
    const g = this.game, ev = g.events
    const up = (k, opts, n) => this.aura.gain(n ?? UP[k][0], UP[k][1], { key: k, ...opts })
    const down = (k, opts, n) => this.aura.lose(n ?? DOWN[k][0], DOWN[k][1], { key: k, ...opts })
    ev.on('npc:ko', (n) => {
      if (!n) return
      this.challenges.track('ko', 1)
      if (n.archetype === 'babushka' || n.personality === 'babushka') down('koGranny')
      else if (n.personality === 'cop') up('koCop')
      else if (n.archetype === 'gopnik' || n.personality === 'tough') up('koGop')
      else up('ko')
    })
    ev.on('npc:hit', ({ npc, attacker }) => {
      if (attacker === g.player && npc && (npc.archetype === 'babushka' || npc.personality === 'babushka') && !npc.char?.ko) down('hitGranny', { cool: 5 })
    })
    ev.on('player:hit', ({ by }) => { this.lastHit = { by, t: this.aura.clock } })
    ev.on('player:down', () => {
      const h = this.lastHit
      const granny = h && this.aura.clock - h.t < 4 && (h.by?.archetype === 'babushka' || h.by?.personality === 'babushka')
      if (granny) down('byGranny')
      else down('fainted')
    })
    ev.on('street:fight', ({ how, n }) => {
      if (how === 'won') { this.aura.gain(UP.fightWon[0] + UP.fightPer * (n || 1), UP.fightWon[1], { key: 'fight' }); this.challenges.track('fight', 1) }
      else if (how === 'lost') down('fightLost')
      else if (how === 'fled') down('fightFled')
    })
    ev.on('police:escape', ({ level }) => { this.aura.gain(UP.escape[0] * Math.max(1, level || 1), UP.escape[1], { key: 'escape' }); this.challenges.track('escape', 1) })
    ev.on('police:deal', ({ how }) => {
      if (how === 'talk') up('talkedOut')
      else if (how === 'papers') up('papers')
      else if (how === 'run') up('ranAway')
      else if (how === 'bribe') down('bribe')
      else if (how === 'jail') down('jail')
    })
    ev.on('crime', (c) => { if (c?.type === 'carjack') { up('carjack'); this.challenges.track('car', 1) } })
    ev.on('taxi:fare', ({ crashes } = {}) => {
      this.challenges.track('fare', 1)
      if (!crashes) { up('fareClean'); this.challenges.track('cleanfare', 1) } else up('fare')
    })
    ev.on('race:end', ({ won }) => { if (won) { up('raceWon'); this.challenges.track('race', 1) } else down('raceLost') })
    ev.on('pizza:delivered', ({ hot }) => { this.challenges.track('pizza', 1); up(hot ? 'pizzaHot' : 'pizza') })
    ev.on('respect', ({ k, up: better }) => { if (better) this.aura.gain(UP.respect[0], `${UP.respect[1]} ${RESPECT_WHO[k] || k}`, { key: 'respect' + k }) })
    ev.on('crew:join', () => up('crew'))
    ev.on('mission:pass', (def) => {
      if (!def) return
      if (def.event) { this.eventDone(def, true); return }
      if (!def.activity) this.aura.gain(UP.story[0], `${UP.story[1]}: ${def.title}`, { raw: true, big: true })
    })
    ev.on('mission:fail', (def, reason) => { if (def?.event && reason) this.eventDone(def, false) })
    ev.on('player:crash', ({ force, other } = {}) => {
      this.stunts.crash(force || 0, other)
      if (!other?.def || (force || 0) < 12) return
      if (other.def.trolley) down('trolley', { cool: 8 })
      else if (other.def.police) down('copCar', { cool: 8 })
    })
    ev.on('vehicle:broken', (v) => { if (v && v === g.player?.vehicle) down('wreck') })
    ev.on('player:runover', () => down('runOver'))
    ev.on('vehicle:exit', (v) => {
      const p = g.player
      if (p?.bailT > 0 && v && Math.abs(v.speed) > 15) up('bail')
    })
    ev.on('outfit', (item) => {
      const st = this.state
      if (!item?.id || item.id.startsWith('own_') || item.id.startsWith('none_') || st.drip.includes(item.id)) return
      st.drip.push(item.id)
      this.aura.gain(UP.drip[0], `${UP.drip[1]}: ${item.name}`, { key: 'drip' })
    })
    ev.on('shop:buy', ({ shop, item } = {}) => this.onShop(shop, item))
  }

  // the kiosk perk: the first thing of the day is on the house
  onShop(shop, item) {
    const g = this.game, st = this.state
    if (!item) return
    this.challenges.track('shop', 1)
    const kiosk = g.world?.kiosks?.some((k) => k.label === shop)
    if (!kiosk || !this.perk('kiosk') || !(item.price > 0)) return
    const day = st.daily.day || 0
    if (st.kioskDay === day) return
    st.kioskDay = day
    const back = g.progress.price(item.price)
    g.progress.addLei(back)
    this.ui.feed(`🥨 {y}Din partea casei{/y}: „Pentru tine, gratis." (+${back} lei)`, 3.4)
  }

  eventDone(def, ok) {
    const st = this.state.stats
    if (ok) {
      st.events++
      st.byEvent[def.id] = (st.byEvent[def.id] || 0) + 1
      this.challenges.track('event', 1)
    } else st.eventsFailed++
  }

  // ---- rewards: queued, handed out when you're free to enjoy them -----------------------------------------
  reward(item) { this.queue.push(item) }

  levelUp(from, to) {
    this.state.stats.levelUps += to - from
    this.queue.push({ kind: 'level', from, to })
    this.game.events.emit('side:levelup', { from, to })
  }

  flush() {
    const it = this.queue.shift()
    if (!it) return
    const g = this.game, pr = g.progress
    if (it.kind === 'level') {
      // several levels at once (a monster combo, an old save) come as one moment
      while (this.queue[0]?.kind === 'level') { const nx = this.queue.shift(); it.to = Math.max(it.to, nx.to) }
      const a = this.state.aura
      if (it.to <= a.rewarded) return
      const lines = []
      let lei = 0
      for (let L = a.rewarded + 1; L <= it.to; L++) lei += this.grantLevel(L, lines)
      a.rewarded = it.to
      if (lei) pr.addLei(lei)
      lines.unshift(`💵 +${lei} lei`)
      const t0 = titleOf(it.from), t1 = titleOf(it.to)
      this.ui.levelUp(it.to, t1, t0.name !== t1.name, lines)
      g.audio?.sting('levelup')
      const p = g.player
      if (p && !g.home?.inside) g.fx?.confetti(p.pos.x, p.pos.y + 2.2, p.pos.z, 70)
      g.ui.flash?.('#b58cff', 260)
      this.gapT = 4.2
      return
    }
    // a challenge (or all three of them)
    if (it.lei) pr.addLei(it.lei)
    this.ui.challengeDone(it)
    if (it.aura) this.aura.gain(it.aura, it.kind === 'bonus' ? 'Toate provocările zilei!' : `Provocare: ${it.title}`, { raw: true, big: true })
    if (it.kind === 'bonus') g.audio?.sting('fight_win')
    else g.audio?.sfx('confirm', { bus: 'ui' })
    this.gapT = it.kind === 'bonus' ? 3 : 1.6
  }

  // what level L brings; returns its lei, pushes the lines for the level-up card
  grantLevel(L, lines) {
    const g = this.game, pr = g.progress
    let lei = levelLei(L)
    for (const r of LEVEL_REWARDS[L] || []) {
      if (r.lei) lei += r.lei
      if (r.clothes) {
        const c = CLOTHES.find((x) => x.id === r.clothes)
        if (!c) continue
        if (pr.clothes.includes(c.id)) lei += c.price || 50
        else { pr.clothes.push(c.id); lines.push(`👕 ${c.name} {w}(în șifonier){/w}`) }
      }
      if (r.weapon) {
        const w = WEAPONS[r.weapon]
        if (!w) continue
        if (pr.weapons.includes(r.weapon)) lei += w.price || 30
        else {
          const onYou = g.gear ? g.gear.give(r.weapon, { equip: false, quiet: true }) : pr.giveWeapon(r.weapon)
          lines.push(`${w.icon} ${w.name} {w}(${onYou ? 'la tine, [Q]' : 'acasă, în ladă'}){/w}`)
        }
      }
      if (r.flag) { pr.flags[r.flag] = true; lines.push(`${FLAGS[r.flag].icon} ${FLAGS[r.flag].text}`) }
      if (r.perk) { const p = PERKS[r.perk]; lines.push(`${p.icon} ${p.name}: ${p.text}`) }
      if (r.respect) { const [k, n] = r.respect; pr.addRespect(k, n, 'aura'); lines.push(`${k === 'gop' ? '👊' : k === 'bab' ? '🥧' : '👮'} +${n} respect la ${RESPECT_WHO[k]}`) }
    }
    return lei
  }

  // ---- one-time hints ------------------------------------------------------------------------------------------
  hint(k) {
    const st = this.state
    if (st.seen[k]) return
    st.seen[k] = true
    const text = {
      aura: '✨ {y}AURA{/y}: cât de tare te vede strada. Chestii tari o cresc, cringe-ul o scade. Nivelurile aduc bani, haine și arme.',
      stunt: '🚗 {y}Cascadorii{/y}: drift ([␣] frâna de mână), treceri la mustață, contrasens. Leagă-le în combo; o bușitură îl pierde.',
      daily: '📋 {y}3 provocări pe zi{/y}. Le vezi în pauză ([Esc]), la {y}Aură{/y}. Una o poți schimba gratis.',
    }[k]
    if (text) this.ui.feed(text, 7, 'hint')
  }

  // ---- per frame ----------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game
    if (g.state !== 'play') return
    const st = this.state
    // the game clock, with sleep and fainting counted forward
    const h = g.renderer.tod.hour
    if (this.lastHour != null) { let d = h - this.lastHour; if (d < -1e-4) d += 24; st.clock += d }
    this.lastHour = h
    this.aura.update(dt)
    this.stunts.update(dt)
    this.challenges.update(dt)
    this.watchStats(dt)
    this.updateLingering(dt)
    // rewards once you've had a calm second (no dialogue, cutscene, pause, shop panel)
    const busy = g.ui.modalOpen || g.cutscene || g.paused || g.photoMode || !g.player?.control || g.director?.handlingDown
    this.calmT = busy ? 0 : this.calmT + (g.rawDt || dt)
    if (this.gapT > 0) this.gapT -= g.rawDt || dt
    // (and not over another big banner: a rank-up, a mission pass, a chapter card)
    if (this.queue.length && this.calmT > AURA.calm && this.gapT <= 0 && !g.ui.top.querySelector('.bigmsg, .chapter, .evidence, .lvlup')) this.flush()
    this.ui.update(dt)
  }

  // things the game counts but doesn't announce: talks, food, kilometres, potholes, dossiers, photos, horns
  watchStats(dt) {
    const g = this.game, pr = g.progress
    const p = g.player
    // a real fall (a jump is half a second in the air; this is a ledge)
    if (p && !p.vehicle) {
      if (p.grounded && this.airT > 0.95 && !p.scripted) this.aura.lose(DOWN.fell[0], DOWN.fell[1], { key: 'fell' })
      this.airT = p.grounded ? 0 : p.airT
    }
    if (p?.vehicle && !p.passenger && g.input.pressed('horn')) this.challenges.track('honk', 1)
    // a photo counts when you take it; the aura shows once the HUD is back
    if (g.photoMode && !this.wasPhoto) this.challenges.track('photo', 1)
    if (!g.photoMode && this.wasPhoto) this.aura.gain(UP.photo[0], UP.photo[1], { key: 'photo' })
    this.wasPhoto = !!g.photoMode
    if ((this.watchT -= dt) > 0) return
    this.watchT = 0.5
    const s = pr.stats
    const now = { talks: s.talks || 0, eaten: s.eaten || 0, km: s.km || 0, potholes: pr.potholes.length, dosare: pr.dosare.length }
    const w = this.watch
    this.watch = now
    if (!w) return
    if (now.talks > w.talks) { this.challenges.track('talk', now.talks - w.talks); this.aura.gain(UP.talk[0], UP.talk[1], { key: 'talk' }) }
    if (now.eaten > w.eaten) this.challenges.track('eat', now.eaten - w.eaten)
    if (now.km > w.km) this.challenges.track('km', now.km - w.km)
    if (now.potholes > w.potholes) { this.aura.gain(UP.pothole[0], UP.pothole[1], { key: 'pothole' }); this.challenges.track('pothole', now.potholes - w.potholes) }
    if (now.dosare > w.dosare) { this.aura.gain(UP.dosar[0], UP.dosar[1], { key: 'dosar' }); this.challenges.track('dosar', now.dosare - w.dosare) }
  }

  // ---- after an event: its people stay around until you've walked off -----------------------------------------
  linger(m, npcs, centre) {
    for (const n of npcs) {
      if (!n || n.disposed) continue
      m.detach(n)
      this.lingering.push({ n, t: 0, centre })
    }
  }

  updateLingering(dt) {
    if (!this.lingering.length || (this.lingerT = (this.lingerT || 0) - dt) > 0) return
    this.lingerT = 1
    const s = this.game.story, p = this.game.player, P = p.vehicle ? p.vehicle.pos : p.pos
    const story = s.active && !s.active.def.activity
    for (const L of [...this.lingering]) {
      L.t += 1
      const n = L.n
      const gone = n.disposed || !s.npcs.includes(n)
      if (gone || story || L.t > 150 || (n.riding && n.riding.disposed) || Math.hypot(n.pos.x - P.x, n.pos.z - P.z) > 75) {
        this.lingering.splice(this.lingering.indexOf(L), 1)
        if (!gone) s.removeNpc(n)
      }
    }
  }

  dropLingering() {
    const s = this.game.story
    for (const { n } of this.lingering || []) if (!n.disposed && s?.npcs.includes(n)) s.removeNpc(n)
    this.lingering = []
  }

  // ---- map and menus -----------------------------------------------------------------------------------------
  blips() { return this.events?.blips?.() || [] }
  renderPause(body) { this.ui.renderPause(body) }
}
