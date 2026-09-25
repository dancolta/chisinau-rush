import { pickLine, TOUGH_ANGRY } from '../entities/NPC.js'
import { angleDiff } from '../entities/Character.js'
import { streetName } from '../world/CityLayout.js'
import { GOP, BAB, CIV, COP, VEND, CARDS, WED, CREW, NAMES, ROLES } from '../data/streettalk.js'
import { fill } from '../story/hero.js'

// Walk up to almost anyone on the street and press E: gopniks (make friends, buy them seeds,
// recruit them, or pick a fight with the whole bench), grannies (gossip, errands, tips),
// passers-by, patrol cops (a coffee goes a long way), market vendors, the card players in the
// park and the wedding at the Arc. What you say moves your respect with each crowd.

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const BYE = {
  gopnik: 'Nimic. Pa, pacani.', babushka: 'Pa, bunică. Sănătate!', civilian: 'Nimic, scuzați.', cop: 'Nimic, șefu\'. Spor la treabă.',
  vendor: 'Nimic, mersi.', cards: 'Altă dată, moșule.', wedding: 'Casă de piatră! Pa.', crew: 'Nimic, hai.',
}
const BREAD = /pâine|franzel|chifl|covrig|cozonac/i
// respect the story earns you on the street
const STORY_GAIN = { paine: { bab: 5 }, cursa: { gop: 15 }, rapirea: { bab: 20, gop: 10 }, sergentul: { pol: 5 }, mitingul: { pol: 10, bab: 10 }, cortegiul: { pol: 10 } }

export class StreetTalk {
  constructor(game) {
    this.game = game
    this.cand = null
    this.talking = null
    this.day = 0
    this.lastHour = null
    this.daily = {}
    this.tips = []
    this.errand = null
    game.interaction.add({
      id: 'street_talk', r: 2.3, priority: -0.3, // kiosks, shops and story people win when they're as close
      x: () => this.cand?.pos.x ?? 1e9, z: () => this.cand?.pos.z ?? 1e9,
      label: () => this.label(this.cand), enabled: () => !!this.cand && !this.talking,
      onInteract: () => this.talk(this.cand),
    })
    game.events.on('mission:pass', (def) => { const r = STORY_GAIN[def?.id]; if (r) for (const [k, n] of Object.entries(r)) game.progress.addRespect(k, n) })
    game.events.on('shop:buy', ({ item }) => {
      const e = this.errand
      if (!e || e.bought || !BREAD.test(item?.name || '')) return
      e.bought = true
      this.addTip(e.npc.pos.x, e.npc.pos.z, 'Bunica', '🥖', false)
      game.ui.tip('Du {y}pâinea{/y} bunicii de pe bancă.', 6)
    })
  }

  fill(s, vars) { return fill(this.game, s, vars) }

  // ---- game days and daily caps ------------------------------------------------------------------
  tickDay() {
    const h = this.game.renderer.tod.hour
    if (this.lastHour != null && h < this.lastHour - 12) { this.day++; this.daily = {} }
    this.lastHour = h
  }
  cap(key, n) { const d = this.daily; d[key] = (d[key] || 0) + 1; return d[key] <= n }
  // what someone (or their whole bench) remembers about you
  mem(n, own = false) { return !own && n.spot ? (n.spot.mem ||= {}) : (n.mem ||= {}) }

  arch(n) {
    if (n.crew) return 'crew'
    return n.archetype || (n.personality === 'babushka' ? 'babushka' : n.personality === 'cop' ? 'cop' : 'civilian')
  }

  // ---- who you'd talk to ------------------------------------------------------------------------------
  underAttack() {
    const g = this.game, p = g.player
    const hot = (n) => !n.char.ko && n.state === 'fight' && n.target === p && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 15
    return g.peds.list.some(hot) || g.ambient.npcs.some(hot) || g.police.officers.some(hot) || (g.story?.npcs || []).some((n) => n.enemy && hot(n))
  }

  update(dt) {
    const g = this.game, p = g.player
    this.tickDay()
    this.updateTips()
    this.updateErrand(dt)
    this.cand = null
    if (!p || g.state !== 'play' || g.ui.modalOpen || g.cutscene || p.vehicle || !p.control || p.char.ko || this.talking) return
    const act = g.story.active
    if (act && !act.def.activity) return
    let best = null, bd = 2.3
    const now = performance.now()
    const test = (n) => {
      if (n.disposed || n.char.ko || n.riding || n.personality === 'story' || n.noTalk) return
      if (n.hostile || n.state === 'flee' || n.state === 'fight' || n.state === 'knocked' || n.state === 'scripted' || n.state === 'riding' || n.state === 'run') return
      if (n.talkCD && now < n.talkCD) return
      const dx = n.pos.x - p.pos.x, dz = n.pos.z - p.pos.z, d = Math.hypot(dx, dz)
      if (d > bd || Math.abs(n.pos.y - p.pos.y) > 1.5) return
      if (d > 0.9 && Math.abs(angleDiff(p.char.heading, Math.atan2(dx, dz))) > 1.4) return
      best = n; bd = d
    }
    for (const n of g.peds.list) test(n)
    for (const n of g.ambient.npcs) test(n)
    for (const n of g.crew.list) test(n)
    if (!best || this.underAttack()) return
    // right against a car door, E gets you in the car
    if (g.vehicles.nearestEnterable(p.pos.x, p.pos.z, 0.9)) return
    this.cand = best
  }

  label(n) {
    if (!n) return ''
    const a = this.arch(n)
    if (a === 'crew') return `Vorbește cu ${n.stName || 'omul tău'}`
    if (a === 'cards') return 'Joacă o tură de cărți cu moșnegii'
    if (a === 'wedding') return 'Felicită mirii'
    const who = { gopnik: 'gopnicul', babushka: 'bunica', cop: 'polițistul', vendor: 'vânzătoarea' }[a] || (n.voice?.type === 'female' ? 'trecătoarea' : 'trecătorul')
    return `Vorbește cu ${who}`
  }

  name(n) {
    if (n.stName) return n.stName
    const a = this.arch(n)
    const pool = a === 'gopnik' || a === 'crew' ? NAMES.gopnik : a === 'babushka' ? NAMES.babushka : a === 'cop' ? NAMES.cop : a === 'vendor' ? NAMES.vendor
      : a === 'cards' ? NAMES.oldman : n.voice?.type === 'female' ? NAMES.woman : NAMES.man
    n.stName = pick(pool)
    return n.stName
  }

  speaker(n) {
    const a = this.arch(n), pr = this.game.progress
    let role = ROLES[a] || ROLES.civilian
    if (a === 'gopnik') role = `Gopnic de cartier · te știe: ${pr.tierName('gop')}`
    else if (a === 'babushka') role = `${ROLES.babushka} · ${pr.tierName('bab')}`
    else if (a === 'cop') role = `${ROLES.cop} · ${pr.tierName('pol')}`
    else if (a === 'crew') role = `Din gașca ta · mai stă ${Math.max(1, Math.ceil(n.crewT / 60))} min`
    return { id: 'st' + n.char.mesh.id, name: this.name(n), role, spec: n.char.spec, voice: n.voice }
  }

  // ---- a conversation -------------------------------------------------------------------------------------
  async talk(n) {
    const g = this.game, p = g.player
    if (!n || this.talking || n.disposed) return
    this.talking = n
    const a = this.arch(n)
    const prev = { state: n.state, path: n.path, onArrive: n.onArrive, heading: n.char.heading }
    const seated = n.state === 'sit' || n.state === 'squat'
    n.path = []; n.onArrive = null; n.vel.set(0, 0, 0)
    if (!seated) { n.state = 'talk'; n.char.lookAtNow(p.pos.x, p.pos.z) }
    p.char.lookAtNow(n.pos.x, n.pos.z)
    const pr = g.progress
    pr.stats.talks = (pr.stats.talks || 0) + 1
    try {
      await this.converse(n, a)
    } catch (e) { console.error(e) } finally {
      this.talking = null
      n.talkCD = performance.now() + 1500
      // back to whatever they were doing, unless the talk changed that (a fight, a recruit…)
      if (!n.disposed && !n.crew && (n.state === 'talk' || (seated && n.state === prev.state))) {
        n.state = prev.state
        if (!seated) {
          if (prev.state === 'walk' || prev.state === 'run') { n.path = prev.path; n.onArrive = prev.onArrive; if (!n.path.length && !n.ambient) g.peds.repath(n) }
          else if (n.ambient) n.turnBack = prev.heading
        }
      }
      if (!n.disposed && n.crew && n.state === 'talk') n.state = n.waiting ? 'idle' : 'follow'
    }
  }

  async converse(n, a) {
    const g = this.game
    const sp = this.speaker(n)
    let text = this.greet(n, a)
    for (let k = 0; k < 10; k++) {
      const opts = (this[a]?.(n) || []).filter(Boolean)
      opts.push({ text: BYE[a] || 'Pa.', run: () => ({ end: true }) })
      const shown = opts.map((o) => ({ ...o, text: this.fill(o.text) }))
      const i = await g.ui.dialogue(sp, [text], { choices: shown })
      const o = opts[i]
      if (!o || n.disposed) return
      const r = (await o.run()) || { end: true }
      if (r.end) { if (r.line && !n.disposed) n.say(this.fill(r.line, r.vars), r.secs || 3.2); return }
      text = this.fill(r.line || '…', r.vars)
      sp.role = this.speaker(n).role // the respect tier may have just moved
    }
  }

  greet(n, a) {
    const g = this.game, pr = g.progress
    if (a === 'gopnik') return this.fill(pick(GOP.greet[pr.tier('gop')]))
    if (a === 'babushka') {
      const e = this.errand
      if (e && e.npc === n) return this.fill(e.bought ? 'A, ai adus pâinea, maică? Ce bun ești!' : BAB.errandWait)
      return this.fill(pick(BAB.greet))
    }
    if (a === 'cop') return this.fill(pick(COP.greet))
    if (a === 'vendor') return this.fill(pick(VEND.greet))
    if (a === 'cards') return this.fill(pick(CARDS.greet))
    if (a === 'wedding') return this.fill(pick(WED.greet))
    if (a === 'crew') return this.fill(pick(CREW.greet))
    return this.fill(pick(CIV.greet))
  }

  // ---- gopniks ---------------------------------------------------------------------------------------------
  gopnik(n) {
    const g = this.game, pr = g.progress, tier = pr.tier('gop')
    const seeds = pr.price(5)
    const hire = tier >= 3 ? 0 : 30
    return [
      { text: 'Salut, pacani. Ce se aude?', run: () => this.gopChat(n) },
      { text: 'Serviți semințe, [[bratan|băieți]].', cost: `${seeds} lei`, disabled: pr.lei < seeds, run: () => this.gopSeeds(n, seeds) },
      { text: 'Hai cu mine, am o treabă.', cost: tier < 2 ? '🔒 respect 40' : hire ? `${hire} lei` : 'gratis', disabled: tier < 2 || pr.lei < hire, run: () => this.gopRecruit(n, hire) },
      pr.perk.pickpocket ? { text: '(Buzunărește-l)', cost: 'hoț', run: () => this.pickpocket(n, 'gopnik') } : null,
      { text: 'Ce te uiți, fraere?', cost: '👊', run: () => this.gopProvoke(n) },
    ]
  }

  gopChat(n) {
    const pr = this.game.progress, st = this.mem(n)
    if (st.chatDay !== this.day && this.cap('gopChat', 4)) { st.chatDay = this.day; pr.addRespect('gop', 2) }
    // friends let you in on things: one tip per bench a day
    if (pr.tier('gop') >= 2 && st.tipDay !== this.day && Math.random() < 0.6) {
      const t = this.tipDosar()
      if (t) { st.tipDay = this.day; return { line: pick(GOP.tip), vars: { place: t } } }
    }
    return { line: pick(GOP.chat) }
  }

  gopSeeds(n, cost) {
    const g = this.game, pr = g.progress, st = this.mem(n)
    if (st.seedsDay === this.day) return { line: pick(GOP.seedsFull) }
    if (!pr.spend(cost)) return { line: '…' }
    st.seedsDay = this.day
    pr.addRespect('gop', 4, 'semințe')
    pr.feed(0.05)
    if (n.state !== 'sit' && n.state !== 'squat') n.char.anim.play('cheer')
    g.audio?.sfx('pickup', { bus: 'ui', vol: 0.6 })
    return { line: pick(GOP.seeds) }
  }

  gopRecruit(n, cost) {
    const g = this.game, pr = g.progress
    if (g.crew.full) return { line: pick(GOP.crewFull) }
    if (cost && !pr.spend(cost)) return { line: '…' }
    this.name(n)
    g.crew.recruit(n, 300)
    g.ui.notify(`👊 ${n.stName} vine cu tine. Te apără, urcă în mașină cu tine. {y}[E]{/y} lângă el: ordine.`, 4.5, 'gold')
    return { end: true, line: pick(GOP.recruit), secs: 4 }
  }

  gopGroup(n) {
    const g = this.game
    if (n.spot?.npcs) return n.spot.npcs.filter((m) => m.archetype === 'gopnik' && !m.char.ko && !m.crew)
    return [n, ...g.peds.list.filter((m) => m !== n && m.archetype === 'gopnik' && !m.char.ko && Math.hypot(m.pos.x - n.pos.x, m.pos.z - n.pos.z) < 8)]
  }

  gopProvoke(n) {
    this.game.life.groupFight(this.gopGroup(n), { provoked: true })
    return { end: true, line: pick(GOP.provoke), secs: 2.4 }
  }

  // ---- grannies -----------------------------------------------------------------------------------------------
  babushka(n) {
    const pr = this.game.progress, st = this.mem(n)
    const e = this.errand
    const out = []
    if (e && e.npc === n) out.push(e.bought ? { text: 'Poftiți pâinea, bunică.', run: () => this.errandDone(n) } : { text: 'Încă n-am luat pâinea…', run: () => ({ line: BAB.errandWait }) })
    out.push({ text: 'Sărut-mâna! Ce se mai aude?', run: () => this.babGossip(n) })
    out.push({ text: 'Pensia v-o venit?', run: () => ({ line: pick(BAB.pension) }) })
    if (!e && n.ambient && n.spot) out.push({ text: 'Vă ajut cu ceva?', run: () => this.errandStart(n) })
    if (pr.type === 'badanta' && !st.badanta) out.push({ text: 'Și eu am fost badantă, doamnă. Doișpe ani.', run: () => this.babBadanta(n) })
    if (pr.perk.pickpocket) out.push({ text: '(Buzunărește sacoșa)', cost: 'hoț', run: () => this.pickpocket(n, 'babushka') })
    out.push({ text: 'Hai, bunico, fă-mi loc.', cost: '😠', run: () => this.babRude(n) })
    return out
  }

  babGossip(n) {
    const pr = this.game.progress, st = this.mem(n, true)
    if (st.gossipDay !== this.day && this.cap('babGossip', 4)) { st.gossipDay = this.day; pr.addRespect('bab', 2) }
    if (st.tipDay !== this.day && Math.random() < (pr.tier('bab') >= 2 ? 0.8 : 0.4)) {
      const hole = Math.random() < 0.5
      const t = hole ? this.tipPothole() : this.tipDosar()
      if (t) { st.tipDay = this.day; return { line: hole ? BAB.tipPothole : BAB.tipDosar, vars: { place: t } } }
    }
    return { line: pick(BAB.gossip) }
  }

  babBadanta(n) {
    const pr = this.game.progress
    this.mem(n).badanta = true
    pr.feed(0.25); pr.heal(8)
    pr.addRespect('bab', 6, 'între badante')
    return { line: BAB.badanta }
  }

  babRude(n) {
    this.game.progress.addRespect('bab', -5, 'obrăznicie')
    this.game.life.angry(n, 9)
    return { end: true, line: BAB.rude, secs: 2.6 }
  }

  // fetch her a loaf: she waits on her bench (the scene is kept alive until you're back)
  errandStart(n) {
    const g = this.game, pr = g.progress, P = g.player.pos
    let best = null, bd = 1e9
    const cands = []
    g.world.kiosks.forEach((k) => { if (k.label === 'FRANZELUȚA' || k.label === 'COVRIGI') cands.push({ x: k.x + Math.sin(k.ry) * 1.8, z: k.z + Math.cos(k.ry) * 1.8 }) })
    const lin = g.world.places.linella
    if (lin) cands.push(lin)
    for (const c of cands) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd) { bd = d; best = c } }
    this.errand = { npc: n, spot: n.spot, bought: false, t: 0 }
    n.spot.keep = true
    pr.addLei(10, 'De la bunica, pentru pâine')
    if (best) this.addTip(best.x, best.z, 'Pâine pentru bunica', '🥖', false)
    g.ui.tip('Cumpără {y}o pâine{/y} (chioșc „Franzeluța", covrigi sau Linella) și du-o bunicii.', 8)
    return { end: true, line: BAB.errandAsk, secs: 4.5 }
  }

  errandDone(n) {
    const pr = this.game.progress
    this.endErrand()
    pr.feed(0.3); pr.heal(10)
    pr.addCivic(3)
    pr.addRespect('bab', 6, 'ai ajutat o bunică')
    pr.addXp(25, 'Ai ajutat-o pe bunica')
    this.game.audio?.sfx('pickup', { bus: 'ui' })
    return { line: BAB.errandDone }
  }

  endErrand() {
    const e = this.errand
    if (!e) return
    if (e.spot) e.spot.keep = false
    this.tips = this.tips.filter((t) => t.icon !== '🥖')
    this.errand = null
  }

  updateErrand(dt) {
    const e = this.errand
    if (!e) return
    e.t += dt
    if (e.t > 300 || e.npc.disposed || e.npc.char.ko) {
      this.endErrand()
      this.game.ui.notify('🥖 Bunica n-a mai așteptat pâinea și s-a dus acasă.', 3.5)
    }
  }

  // ---- passers-by ----------------------------------------------------------------------------------------------
  civilian(n) {
    const pr = this.game.progress, st = this.mem(n, true)
    return [
      { text: 'Ce mai faceți?', run: () => this.civChat() },
      { text: 'Unde-i ceva de văzut prin oraș?', run: () => this.civWhere() },
      { text: 'Împrumutați-mi zece lei de rutieră?', run: () => this.civLend(n) },
      !st.given ? { text: 'Uitați douăzeci de lei. Sănătate.', cost: '20 lei', disabled: pr.lei < 20, run: () => this.civGive(n) } : null,
      pr.perk.pickpocket ? { text: '(Buzunărește-l)', cost: 'hoț', run: () => this.pickpocket(n, 'civilian') } : null,
      { text: 'Ce te holbezi?', cost: '😠', run: () => this.civProvoke(n) },
    ]
  }

  civChat() {
    if (this.cap('civXp', 8)) this.game.progress.addXp(5)
    return { line: pick(CIV.chat) }
  }

  civWhere() {
    const g = this.game, P = g.player.pos
    const L = Object.values(g.world.places).filter((p) => p.kind === 'landmark' && Math.hypot(p.x - P.x, p.z - P.z) > 60)
    const q = pick(L.length ? L : Object.values(g.world.places).filter((p) => p.kind === 'landmark'))
    this.addTip(q.x, q.z, q.name, '📍')
    return { line: CIV.where, vars: { place: q.name } }
  }

  civLend(n) {
    const pr = this.game.progress, st = this.mem(n, true)
    if (st.lent) return { line: CIV.lendAgain }
    st.lent = true
    if (Math.random() < 0.3 + pr.cred / 400 + pr.civic / 400 + (pr.type === 'badanta' ? 0.15 : 0)) { pr.addLei(5, 'Împrumut „până joi"'); return { line: CIV.lendYes } }
    return { line: CIV.lendNo }
  }

  civGive(n) {
    const pr = this.game.progress
    if (!pr.spend(20)) return { line: '…' }
    this.mem(n, true).given = true
    pr.addCivic(2)
    if (this.cap('give', 5)) pr.addXp(10, 'Omenie')
    return { line: pr.type === 'badanta' ? CIV.giveBadanta : CIV.give }
  }

  civProvoke(n) {
    const g = this.game
    if (n.personality === 'tough') { this.fightMe(n); return { end: true, line: pickLine(TOUGH_ANGRY), secs: 2.4 } }
    g.events.emit('crime', { type: 'harass', x: n.pos.x, z: n.pos.z, severity: 1 })
    g.progress.addCivic(-1)
    n.flee(g.player.pos)
    return { end: true, line: pick(CIV.provokeScared), secs: 2.4 }
  }

  fightMe(n) {
    n.hostile = true; n.state = 'fight'; n.target = this.game.player; n.path = []
  }

  // Marcel's trade, abroad and at home
  pickpocket(n, a) {
    const g = this.game, pr = g.progress, st = this.mem(n, true)
    if (st.picked) { g.ui.notify('Buzunarele-s goale. Ai fost deja pe-aici.', 2.4); return { end: true } }
    st.picked = true
    if (Math.random() < ({ gopnik: 0.5, babushka: 0.6 }[a] ?? 0.75)) {
      const lei = a === 'babushka' ? 3 : 8 + Math.floor(Math.random() * 28)
      pr.addLei(lei, 'Din buzunarul altuia')
      g.ui.notify(this.fill(a === 'babushka' ? BAB.pickOk : CIV.pickOk, { n: lei }), 3.6, 'gold')
      pr.addXp(5)
      return { end: true }
    }
    g.events.emit('crime', { type: 'theft', x: n.pos.x, z: n.pos.z, severity: 1 })
    if (a === 'gopnik') { g.life.groupFight(this.gopGroup(n), { provoked: false }); return { end: true, line: 'Mâna din buzunar, fraere! Pacani!', secs: 2.4 } }
    if (a === 'babushka') { pr.addRespect('bab', -10, 'prins la furat'); g.life.angry(n, 10); return { end: true, line: BAB.pickFail, secs: 3 } }
    if (n.personality === 'tough') this.fightMe(n)
    else n.flee(g.player.pos)
    return { end: true, line: CIV.pickFail, secs: 2.4 }
  }

  // ---- patrol cops -------------------------------------------------------------------------------------------------
  cop(n) {
    const pr = this.game.progress
    const coffee = pr.price(20)
    return [
      { text: 'Totul liniștit, șefu\'?', run: () => this.copChat() },
      { text: 'O cafea, șefu\'? Din partea mea.', cost: `${coffee} lei`, disabled: pr.lei < coffee, run: () => this.copCoffee(n, coffee) },
      { text: 'Știu unde stau gopnicii…', cost: '−respect gopnici', run: () => this.copSnitch() },
      { text: 'Ce te uiți, gabor?', cost: '★', run: () => this.copInsult(n) },
    ]
  }

  copChat() {
    if (this.cap('polChat', 3)) this.game.progress.addRespect('pol', 1)
    return { line: pick(COP.chat) }
  }

  copCoffee(n, cost) {
    const g = this.game, pr = g.progress, st = this.mem(n, true)
    if (st.coffee) return { line: COP.coffeeAgain }
    if (!pr.spend(cost)) return { line: '…' }
    st.coffee = true
    pr.stats.bribes++
    pr.addRespect('pol', 4, 'o cafea')
    g.police.coffeeUntil = performance.now() + 300000
    g.ui.notify('☕ Poliția închide un ochi cinci minute: jumătate de urmărire pentru orice prostie.', 4, 'gold')
    return { line: COP.coffee }
  }

  copSnitch() {
    const g = this.game, pr = g.progress
    if (this.daily.snitched) return { line: 'Ai zis deja. Am notat. Sertarul, știi.' }
    this.daily.snitched = true
    pr.addCivic(3)
    pr.addRespect('pol', 3)
    pr.addRespect('gop', -15, 'turnător')
    if (g.crew.list.length) g.crew.dismissAll(CREW.snitch)
    return { line: pick(COP.snitch) }
  }

  copInsult(n) {
    const g = this.game
    g.progress.addRespect('pol', -5)
    g.police.addHeat(12)
    g.police.adoptOfficer(n)
    return { end: true, line: COP.insult, secs: 3 }
  }

  // ---- the market --------------------------------------------------------------------------------------------------
  vendor(n) {
    const pr = this.game.progress, st = this.mem(n, true)
    const price = st.cheap ? 5 : pr.price(10)
    return [
      { text: 'Un kil de roșii, vă rog.', cost: `${price} lei`, disabled: pr.lei < price, run: () => this.vendBuy(price) },
      !st.haggled ? { text: 'Dă mai ieftin!', run: () => this.vendHaggle(n) } : null,
      { text: 'Ce se aude prin piață?', run: () => ({ line: pick(VEND.gossip) }) },
      { text: 'Iau un măr și fug.', cost: '🍎', run: () => this.vendSteal(n) },
    ]
  }

  vendBuy(price) {
    const g = this.game, pr = g.progress
    if (!pr.spend(price)) return { line: '…' }
    pr.feed(0.15); pr.heal(5)
    g.audio?.sfx('pickup', { bus: 'ui' })
    return { line: VEND.buy }
  }

  vendHaggle(n) {
    const pr = this.game.progress, st = this.mem(n, true)
    st.haggled = true
    const badanta = pr.type === 'badanta'
    // haggling in a designer coat doesn't convince anybody
    if (Math.random() < 0.35 + pr.cred / 200 + (badanta ? 0.4 : 0) - (pr.look?.rich || 0) * 0.08) { st.cheap = true; return { line: badanta ? VEND.haggleOkBadanta : VEND.haggleOk } }
    return { line: VEND.haggleNo }
  }

  vendSteal(n) {
    const g = this.game, pr = g.progress
    pr.feed(0.05)
    pr.addCivic(-1)
    g.events.emit('crime', { type: 'theft', x: n.pos.x, z: n.pos.z, severity: 1 })
    g.peds.panic(n.pos, g.player, 8)
    return { end: true, line: VEND.thief, secs: 3 }
  }

  // ---- the card players in the park ------------------------------------------------------------------------------------
  cards() {
    const pr = this.game.progress, stake = 20
    return [
      { text: 'Intru și eu la o tură.', cost: `${stake} lei`, disabled: pr.lei < stake, run: () => this.cardsPlay(stake) },
      { text: 'Cine câștigă azi?', run: () => ({ line: pick(CARDS.chat) }) },
    ]
  }

  cardsPlay(stake) {
    const g = this.game, pr = g.progress
    if (!pr.spend(stake)) return { line: '…' }
    // Marcel „Scoțianu'" has quick hands
    if (Math.random() < (pr.perk.pickpocket ? 0.62 : 0.45)) { pr.addLei(stake * 2, 'Ai câștigat la cărți'); if (this.cap('cards', 6)) pr.addXp(10); return { line: CARDS.win } }
    return { line: CARDS.lose }
  }

  // ---- the wedding at the Arc --------------------------------------------------------------------------------------------
  wedding(n) {
    return [
      { text: 'Casă de piatră!', run: () => this.wedToast(n) },
      { text: 'Pot să fac o poză cu mirii?', run: () => this.wedPhoto(n) },
    ]
  }

  wedToast(n) {
    const g = this.game, pr = g.progress, st = this.mem(n)
    if (st.toasted) return { line: WED.toastAgain }
    st.toasted = true
    pr.addLei(20, 'Plicul, invers'); pr.heal(10); pr.addXp(15, 'Casă de piatră!')
    g.audio?.sfx('applause', { vol: 0.6 })
    return { line: WED.toast }
  }

  wedPhoto(n) {
    const g = this.game, st = this.mem(n)
    g.audio?.sfx('camera')
    if (!st.photo) { st.photo = true; g.progress.addXp(10, 'Poză cu mirii') }
    return { line: WED.photo }
  }

  // ---- your own crew -------------------------------------------------------------------------------------------------------
  crew(n) {
    const c = this.game.crew
    return [
      n.waiting ? { text: 'Hai, vino după mine.', run: () => { c.setWaiting(n, false); return { end: true, line: CREW.come } } }
        : { text: 'Așteaptă-mă aici.', run: () => { c.setWaiting(n, true); return { end: true, line: CREW.wait } } },
      { text: 'Du-te acasă. Mersi, [[bratan|frate]].', run: () => { c.release(n); return { end: true, line: CREW.home } } },
    ]
  }

  // ---- tips: a pin on the minimap and in the world ---------------------------------------------------------------------------
  placeName(x, z) {
    let best = null, bd = 75
    for (const p of Object.values(this.game.world.places)) {
      if (!p.name || p.kind === 'district' || p.kind === 'npc') continue
      const d = Math.hypot(p.x - x, p.z - z)
      if (d < bd) { bd = d; best = p }
    }
    return best ? best.name : (streetName(x, z) || 'colțul ăla')
  }

  tipDosar() {
    const g = this.game, s = g.story, pr = g.progress, P = g.player.pos
    if (!s.isDone('paine')) return null
    let best = null, bd = 1e9
    for (const d of s.acts.dosarSpots()) {
      if (pr.dosare.includes(d.i)) continue
      const k = Math.hypot(d.x - P.x, d.z - P.z)
      if (k > 25 && k < bd) { bd = k; best = d }
    }
    if (!best) return null
    this.addTip(best.x, best.z, 'Dosar pierdut?', '📁')
    return this.placeName(best.x, best.z)
  }

  tipPothole() {
    const g = this.game, P = g.player.pos
    let best = null, bd = 1e9
    for (const h of g.story.potholes.list) {
      if (h.fixed) continue
      const k = Math.hypot(h.x - P.x, h.z - P.z)
      if (k > 20 && k < bd) { bd = k; best = h }
    }
    if (!best) return null
    this.addTip(best.x, best.z, 'Groapă', '🕳️')
    return this.placeName(best.x, best.z)
  }

  addTip(x, z, label, icon = '📍', say = true) {
    const g = this.game
    this.tips = this.tips.filter((t) => Math.hypot(t.x - x, t.z - z) > 5).slice(-2)
    this.tips.push({ x, z, y: g.physics.groundHeight(x, z, 6), label, icon, until: performance.now() + 300000 })
    if (say) g.ui.notify(`${icon} Pe hartă: {y}${label}{/y}`, 3)
  }

  updateTips() {
    if (!this.tips.length) return
    const p = this.game.player, P = p.vehicle ? p.vehicle.pos : p.pos, now = performance.now()
    this.tips = this.tips.filter((t) => now < t.until && Math.hypot(t.x - P.x, t.z - P.z) > 7)
  }

  tags() { return this.tips.map((t) => ({ x: t.x, y: t.y, z: t.z, icon: t.icon, label: t.label })) }
  blips() { return this.tips.map((t) => ({ kind: 'icon', x: t.x, z: t.z, icon: t.icon })) }
}
