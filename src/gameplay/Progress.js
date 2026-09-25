// Player progression, economy and save data.

export const RANKS = [
  { xp: 0, name: 'Plecat peste hotare', joke: 'Ai adus euro și un frigider în rate. Acasă-i mai bine, de la distanță.' },
  { xp: 250, name: 'Băiat de cartier', joke: 'Te știe toată curtea. Și ăia cu care ai datorii.' },
  { xp: 700, name: 'Om cu relații', joke: 'Ai un cumătru la primărie. Acuma ai și tu pe cineva.' },
  { xp: 1400, name: 'Om de afaceri', joke: 'SRL pe numele soacrei. Birou euroreparat, vedere la groapă.' },
  { xp: 2400, name: 'Consilier', joke: 'Votezi ce zice partidul. Parcarea pe trotuar, inclusă.' },
  { xp: 3700, name: 'Candidat', joke: 'Promiți drumuri și apă caldă. Lumea a mai auzit, da\' votează.' },
  { xp: 5200, name: 'Primar de Chișinău', joke: 'Ai ajuns sus. Prima ședință: lucrăm la asta.' },
]

export const PERKS = {
  stroitor: { stamina: 3, maxHp: 140, dmg: 1.3 },
  badanta: { lei: 1500, discount: 0.8, female: true, bab: 30 },
  hot: { steal: true, pickpocket: true, heatDecay: 1.8 },
  patan: { dmg: 1.6, cred: 25, lei: 0, gop: 40 },
  taxist: { lei: 30, fareBonus: 1.5 },
  conductor: { passive: 0.25, heatDecay: 1.6 },
  agent: { lei: 20, sell: 1.4 },
  director: { lei: 160 },
  ionel: { maxHp: 130, hunger: 0.6 },
}

const SAVE_KEY = 'cr3d-save'

// street respect, 0-100 per crowd: the gopniks, the grannies, the cops
export const RESPECT_TIERS = [0, 15, 40, 70]
export const RESPECT_NAMES = {
  gop: ['Străin', 'Cunoscut', 'De-al nostru', 'Bratan'],
  bab: ['Străin', 'Cuminte', 'Ca un nepot', 'Sfânt'],
  pol: ['Necunoscut', 'Cunoscut', 'Om de încredere', 'Cumătru'],
}
export const RESPECT_WHO = { gop: 'gopnici', bab: 'babe', pol: 'poliție' }
export const RESPECT_ICON = { gop: '👊', bab: '🥧', pol: '👮' }
export function respectTier(v) { let t = 0; for (let i = 1; i < RESPECT_TIERS.length; i++) if (v >= RESPECT_TIERS[i]) t = i; return t }

export class Progress {
  constructor(game) {
    this.game = game
    this.reset()
  }

  reset(player = { name: 'Vasea', type: 'stroitor' }) {
    this.name = player.name || 'Vasea'
    this.type = player.type || 'stroitor'
    const perk = PERKS[this.type] || {}
    this.perk = perk
    this.lei = 45 + (perk.lei || 0)
    this.maxHp = perk.maxHp || 100
    this.hp = this.maxHp
    this.hunger = 1
    this.xp = 0
    this.rankIdx = 0
    this.cred = perk.cred || 0
    this.civic = 0
    this.weapons = ['fist']
    this.weapon = 'fist'
    this.flags = {}
    this.story = { done: [], current: null, chapter: 0 }
    this.dosare = []
    this.potholes = []
    this.respect = { gop: perk.gop ?? (perk.cred ? 20 : 0), bab: perk.bab || 0, pol: 0 }
    this.stats = { km: 0, ko: 0, cars: 0, fares: 0, bribes: 0, busted: 0, fainted: 0, eaten: 0, races: 0, talks: 0, recruits: 0, fights: 0 }
    this.hour = 17.6
    this.passiveAcc = 0
  }

  get rank() { return RANKS[this.rankIdx] }
  get nextRank() { return RANKS[this.rankIdx + 1] || null }
  get dmgMul() { return this.perk.dmg || 1 }
  // what something costs this character (the badanta haggles everything down)
  price(n) { return n > 0 ? Math.max(1, Math.round(n * (this.perk.discount || 1))) : n }

  addLei(n, reason = '') {
    n = Math.round(n)
    if (!n) return
    this.lei = Math.max(0, this.lei + n)
    this.game.ui?.money(n, reason)
    if (n > 0) this.game.audio?.sfx(n >= 50 ? 'coins_many' : 'cash', { bus: 'ui', vol: 0.7 })
  }

  spend(n) {
    if (this.lei < n) return false
    this.addLei(-n)
    return true
  }

  addXp(n, why) {
    this.xp += Math.round(n)
    this.game.ui?.xp(n, why)
    let idx = this.rankIdx
    while (RANKS[idx + 1] && this.xp >= RANKS[idx + 1].xp) idx++
    if (idx > this.rankIdx) {
      this.rankIdx = idx
      this.game.events.emit('rankup', RANKS[idx], idx)
    }
  }

  addCred(n) { this.cred = Math.max(0, Math.min(100, this.cred + n)) }

  tier(k) { return respectTier(this.respect[k] || 0) }
  tierName(k) { return RESPECT_NAMES[k][this.tier(k)] }
  // respect with a crowd; a toast for anything noticeable and a bigger one on a new tier
  addRespect(k, n, why = '') {
    n = Math.round(n)
    if (!n || !(k in this.respect)) return
    const before = this.respect[k], t0 = respectTier(before)
    this.respect[k] = Math.max(0, Math.min(100, before + n))
    const d = this.respect[k] - before
    if (!d) return
    const t1 = respectTier(this.respect[k])
    const ui = this.game.ui
    if (t1 !== t0) {
      ui?.notify(`${RESPECT_ICON[k]} ${t1 > t0 ? '{g}' : '{r}'}Respect la ${RESPECT_WHO[k]}: ${RESPECT_NAMES[k][t1]}${t1 > t0 ? '{/g}' : '{/r}'}`, 3.6, t1 > t0 ? 'green' : 'red')
      if (t1 > t0) this.game.audio?.sfx('confirm', { bus: 'ui', vol: 0.7 })
      this.game.events.emit('respect', { k, tier: t1, up: t1 > t0 })
    } else if (Math.abs(d) >= 2) ui?.notify(`${RESPECT_ICON[k]} ${d > 0 ? '+' : ''}${d} respect la ${RESPECT_WHO[k]}${why ? ' · ' + why : ''}`, 2.4, d > 0 ? '' : 'red')
  }
  addCivic(n) { this.civic = Math.max(0, Math.min(100, this.civic + n)) }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n) }
  feed(n) { this.hunger = Math.min(1, this.hunger + n); this.stats.eaten++ }

  hurt(n) {
    if (this.game.cheats?.god) return
    this.hp = Math.max(0, this.hp - n)
    if (this.hp <= 0) this.game.events.emit('player:down')
  }

  giveWeapon(k) { if (!this.weapons.includes(k)) this.weapons.push(k) }

  update(dt) {
    // hunger drains slowly; an empty stomach slowly eats HP
    const rate = (this.perk.hunger || 1) / 960
    const before = this.hunger
    this.hunger = Math.max(0, this.hunger - dt * rate)
    if (before >= 0.2 && this.hunger < 0.2) this.game.ui?.notify('🍞 Ți-e foame. Un chioșc, o plăcintă, o șaurma… ceva.', 4, 'gold')
    if (before >= 0.06 && this.hunger < 0.06) this.game.ui?.notify('{r}Mori de foame!{/r} Mănâncă ceva până nu leșini.', 4, 'red')
    if (this.hunger <= 0) this.hurt(dt * 0.35)
    else if (this.hunger > 0.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 0.35)
    if (this.perk.passive) {
      this.passiveAcc += dt * this.perk.passive
      if (this.passiveAcc >= 5) { this.passiveAcc -= 5; this.lei += 5 }
    }
  }

  // ---- persistence -------------------------------------------------------------------------
  serialize() {
    const g = this.game
    const p = g.player
    return {
      v: 3, name: this.name, type: this.type, lei: this.lei, hp: this.hp, maxHp: this.maxHp, hunger: this.hunger,
      xp: this.xp, rankIdx: this.rankIdx, cred: this.cred, civic: this.civic, weapons: this.weapons, weapon: this.weapon,
      flags: this.flags, story: this.story, dosare: this.dosare, potholes: this.potholes, stats: this.stats, respect: this.respect,
      hour: g.renderer.tod.hour, pos: p ? { x: p.pos.x, z: p.pos.z } : null, t: Date.now(),
    }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())) } catch (e) { /* storage blocked */ }
  }

  static hasSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.v === 3 ? s : null } catch (e) { return null }
  }

  static clearSave() { try { localStorage.removeItem(SAVE_KEY) } catch (e) { /* noop */ } }

  load(d) {
    this.reset({ name: d.name, type: d.type })
    const fresh = this.respect
    for (const k of ['lei', 'hp', 'maxHp', 'hunger', 'xp', 'rankIdx', 'cred', 'civic', 'weapons', 'weapon', 'flags', 'story', 'dosare', 'potholes', 'stats', 'hour', 'respect']) if (d[k] !== undefined) this[k] = d[k]
    // saves from before street respect start where a new game of that character would
    this.respect = { ...fresh, ...this.respect }
    this.stats = { km: 0, ko: 0, cars: 0, fares: 0, bribes: 0, busted: 0, fainted: 0, eaten: 0, races: 0, talks: 0, recruits: 0, fights: 0, ...this.stats }
    this.story = { done: [], current: null, chapter: 0, ...this.story }
  }
}
