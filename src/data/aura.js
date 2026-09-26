import { CLOTHES, BRANDS } from './wardrobe.js'

// AURA: how cool the street thinks you are, in points (the meme, made a meter). Tuning tables
// for the side-content layer in src/side: what earns and costs aura, the level ladder and its
// rewards, the daily challenge pool and the clothes you only get by being somebody.
// docs/SIDE_CONTENT.md explains the numbers.

export const AURA = {
  streakWindow: 7,     // s to chain the next cool moment into the streak
  streakStep: 0.25,    // multiplier added per link (×1, ×1.25, ×1.5 … )
  streakMax: 3,
  repeatWindow: 25,    // s: the same thing again and again pays less (no farming one granny)
  repeatDecay: 0.2,    // each repeat inside the window pays 20% less…
  repeatFloor: 0.3,    // …down to 30%
  calm: 1.2,           // s of free play (no dialogue, no cutscene) before rewards are handed out
}

// the ups: [aura, what the pop says]
export const UP = {
  ko: [10, 'Pus la pământ'],
  koGop: [15, 'Gopnic adormit pe asfalt'],
  koCop: [10, 'Polițist trimis la odihnă'],
  fightWon: [30, 'Bătaie de cartier câștigată'],   // + fightPer for each of them
  fightPer: 8,
  escape: [25, 'Ai scăpat de poliție'],          // × the stars you had
  talkedOut: [40, 'Scăpat cu vorbă frumoasă'],
  papers: [25, '„Scuzați, domnule deputat"'],
  ranAway: [10, 'Ai fugit de la control'],
  carjack: [8, 'Mașină „împrumutată"'],
  fareClean: [25, 'Cursă fără nicio bușitură'],
  fare: [8, 'Cursă de taxi'],
  raceWon: [60, 'Primul la cursă'],
  pizzaHot: [20, 'Pizza caldă, client fericit'],
  pizza: [8, 'Pizza livrată'],
  pothole: [15, 'Groapă astupată. Primăria plânge'],
  dosar: [10, 'Dosar pierdut găsit'],
  respect: [40, 'Respect nou la'],
  crew: [20, 'Gașca ta crește'],
  talk: [3, 'Vorbă bună cu lumea'],
  story: [100, 'Misiune'],
  drip: [15, 'Drip nou'],
  photo: [5, 'Poză pentru Insta'],
  bail: [20, 'Sărit din mers, ca-n filme'],
}

// the downs (cringe): [aura, what the pop says]
export const DOWN = {
  koGranny: [40, 'Ai bătut o bunică. Rușine!'],
  hitGranny: [8, 'Ai lovit o bunică'],
  byGranny: [60, 'Te-a bătut o bunică'],
  fainted: [25, 'Ai leșinat în mijlocul străzii'],
  fightLost: [25, 'Te-au bătut pacanii'],
  fightFled: [10, 'Ai fugit de bătaie'],
  bribe: [10, 'Mită pentru „cafea"'],
  jail: [30, 'Trei ore de „discuții" la secție'],
  raceLost: [10, 'Vitea te-a lăsat în urmă'],
  trolley: [20, 'Ai bușit troleibuzul. Tot orașul a văzut'],
  copCar: [10, 'Ai bușit poliția. Curaj sau prostie?'],
  wreck: [15, 'Ai făcut mașina praf'],
  comboCrash: [10, 'Combo bușit'],
  zap: [8, 'Te-a curentat'],
  fell: [10, 'Ai căzut ca un sac de cartofi'],
  runOver: [15, 'Te-a lovit o mașină. Te uitai în telefon?'],
}

// car stunts (src/side/Stunts.js): every trick adds points and one step of multiplier; the combo
// is banked as aura (points × multiplier / perAura) after `window` quiet seconds, lost on a crash
export const STUNT = {
  window: 2.2,
  maxMult: 8,
  perAura: 25,
  crash: 16,                                   // contact force that counts as a crash
  driftSpeed: 8, driftLat: 3, driftRate: 12, driftMin: 50,
  nearSpeed: 11, nearGap: 1.1, nearTight: 0.5, near: 60, nearTightPts: 100,
  airMin: 0.35, airRate: 220, airHeight: 0.6,
  wrongSpeed: 10, wrongMin: 1.2, wrongRate: 1.5,
  fast: 28, fastT: 2, fastPts: 80,
}
export const TRICK = { drift: 'DRIFT', near: 'LA MUSTAȚĂ', tight: 'LA UN FIR DE PĂR', air: 'ZBOR', wrong: 'CONTRASENS', fast: 'FĂRĂ FRÂNĂ' }

// ---- the ladder ---------------------------------------------------------------------------------------
export const MAX_LEVEL = 20
// aura needed to go from level n to n+1; after the top the levels keep coming (the ★ ones)
export function levelCost(n) { return n < MAX_LEVEL ? 150 + 100 * (n - 1) : 2500 }
// total aura at which level n starts
export function levelStart(n) {
  let s = 0
  for (let k = 1; k < n; k++) s += levelCost(k)
  return s
}
export function levelOf(total) {
  let n = 1, s = 0
  while (total >= s + levelCost(n)) { s += levelCost(n); n++ }
  return n
}

export const TITLES = [
  { from: 1, name: 'NPC de fundal', joke: 'Lumea trece prin tine ca prin ceață. Nici porumbeii nu te bagă în seamă.' },
  { from: 3, name: 'Venit de-afară', joke: 'Adidași noi, accent de Italia. Blocul a observat.' },
  { from: 5, name: 'Cunoscut la chioșc', joke: 'Vânzătoarea îți zice pe nume. Și-ți dă semințe pe datorie.' },
  { from: 7, name: 'Șmecher de cartier', joke: 'Pacanii aproape că se ridică de pe vine când treci.' },
  { from: 10, name: 'Boss de scară', joke: 'Tu decizi cine spală scările și cine plătește becul.' },
  { from: 13, name: 'Legendă din Botanica', joke: 'Bunicile spun povești despre tine. Unele sunt chiar adevărate.' },
  { from: 16, name: 'Sigma de Chișinău', joke: 'Nu zâmbești, nu te grăbești. Rutiera te așteaptă pe tine.' },
  { from: 20, name: 'Nașul Chișinăului', joke: 'Tot orașul te vrea naș la nuntă. Plicurile sunt ale tale.' },
]
export function titleOf(level) {
  let t = TITLES[0]
  for (const x of TITLES) if (level >= x.from) t = x
  return level > MAX_LEVEL ? { ...t, name: `${t.name} ★${level - MAX_LEVEL + 1}` } : t
}

// what a level brings besides lei: clothes (ids below or from the shops), weapons (from the
// chest if you already own them you get their price instead), flags, perks, respect
export const LEVEL_REWARDS = {
  2: [{ clothes: 'aura_npc' }],
  3: [{ clothes: 'aura_milano' }],
  4: [{ weapon: 'pistol' }],
  5: [{ perk: 'kiosk' }],
  6: [{ clothes: 'aura_kepka' }],
  7: [{ clothes: 'aura_trening' }, { respect: ['gop', 10] }],
  8: [{ weapon: 'tigaie' }],
  9: [{ perk: 'combo' }],
  10: [{ flag: 'acteFalse' }, { clothes: 'aura_lant' }],
  11: [{ weapon: 'par' }],
  12: [{ respect: ['bab', 10] }, { weapon: 'umbrela' }],
  13: [{ clothes: 'aura_geaca' }, { perk: 'magnet' }],
  14: [{ weapon: 'spray' }],
  15: [{ flag: 'nitro' }],
  16: [{ clothes: 'aura_sigma' }, { clothes: 'aura_sigma_jos' }, { perk: 'reroll2' }],
  17: [{ weapon: 'suflanta' }],
  18: [{ clothes: 'dinte' }],
  19: [{ clothes: 'aura_nas' }],
  20: [{ clothes: 'aura_palarie' }, { lei: 1000 }],
}
export function levelLei(n) { return n > MAX_LEVEL ? 300 : 20 * n + 30 }

export const PERKS = {
  kiosk: { at: 5, icon: '🥨', name: 'Din partea casei', text: 'Primul lucru de la chioșc, în fiecare zi, e gratis.' },
  combo: { at: 9, icon: '⛓️', name: 'Combo mai lung', text: 'Încă 0,6 secunde ca să legi cascadoriile.' },
  magnet: { at: 13, icon: '🧲', name: 'Magnet de aură', text: '+10% la toată aura adunată.' },
  reroll2: { at: 16, icon: '🎲', name: 'Două schimbări', text: 'Poți schimba două provocări pe zi.' },
}
export const FLAGS = {
  acteFalse: { icon: '🪪', text: 'Acte false „de deputat", cadou de la Borea' },
  nitro: { icon: '🔥', text: 'Nitro sub capotă ([⇧] la volan), montat de Vova' },
}

// ---- clothes you can't buy -----------------------------------------------------------------------------
BRANDS.aura = { name: 'AURA', bg: '#2a1454', fg: '#ffcf4a' }
const C = (id, slot, name, spec, look, note) => ({ id, slot, brand: 'aura', name, price: 0, spec, look, shop: 'aura', note })
export const AURA_CLOTHES = [
  C('aura_npc', 'top', 'Tricoul NPC-ului', { top: { style: 'shirt', color: 0x8a8c90 } }, { bab: 2 }, 'Gri. Fără logo, fără personalitate. Ca tine până acum.'),
  C('aura_milano', 'eyes', 'Ochelari „Milano"', { sunglasses: true }, { gop: 2, rich: 1 }, 'Aduși de-afară. Mă rog, din Piața Centrală.'),
  C('aura_kepka', 'hat', 'Șapcă de aur', { hat: { style: 'kepka', color: 0xc9a23a } }, { gop: 6 }, 'Strălucește ca un dinte de la Istanbul.'),
  C('aura_trening', 'top', 'Trening „Șmecher"', { top: { style: 'tracksuit', color: 0x3a1a5a, stripes: 0xd4af37 } }, { gop: 10 }, 'Mov cu dungi de aur. Pacanii plâng de invidie.'),
  C('aura_lant', 'neck', 'Lanț „AURA"', { chain: true }, { gop: 6, rich: 1 }, 'Cântărește cât o sacoșă de cartofi.'),
  C('aura_geaca', 'top', 'Geaca de Legendă', { top: { style: 'jacket', color: 0x3a1a0e, shirt: 0xd4af37 } }, { gop: 6, bab: 4 }, 'Piele adevărată. Se jură Nicu.'),
  C('aura_sigma', 'top', 'Trening de aur „Sigma"', { top: { style: 'tracksuit', color: 0xc9a23a, stripes: 0x111114 } }, { gop: 12, rich: 2 }, 'Nu-l porți. El te poartă pe tine.'),
  C('aura_sigma_jos', 'bottom', 'Pantaloni de aur „Sigma"', { bottom: { style: 'tracksuit', color: 0xc9a23a, stripes: 0x111114 } }, { gop: 6, rich: 1 }, 'Perechea trebuie purtată împreună. E regulă.'),
  C('aura_nas', 'top', 'Costumul alb al nașului', { top: { style: 'suit', color: 0xf2efe6, shirt: 0x1a1a1a, tie: 0xd4af37 } }, { bab: 10, pol: 6, rich: 2 }, 'Pentru nunți, botezuri și ședințe la primărie.'),
  C('aura_palarie', 'hat', 'Pălăria Nașului', { hat: { style: 'fedora', color: 0xf2efe6, band: 0xd4af37 } }, { pol: 3, rich: 1 }, 'O porți și orchestra începe singură.'),
]
// they live with the rest of the clothes (the wardrobe at home lists them once they're yours);
// shop 'aura' is never a shop, so nobody sells them
for (const c of AURA_CLOTHES) if (!CLOTHES.some((x) => x.id === c.id)) CLOTHES.push(c)

// ---- daily challenges --------------------------------------------------------------------------------------
// kind: what counts (see Challenges.track); max: best single value instead of a running sum.
// tier 1 easy, 2 medium, 3 hard: every day brings one of each. after: the story mission it needs.
const Q = (id, tier, kind, n, text, o = {}) => ({ id, tier, kind, n, text, ...o })
export const CHALLENGES = [
  Q('ko3', 1, 'ko', 3, 'Pune la pământ 3 oameni', { icon: '👊' }),
  Q('talk3', 1, 'talk', 3, 'Vorbește cu 3 oameni de pe stradă', { icon: '💬' }),
  Q('near5', 1, 'nearmiss', 5, '5 treceri „la mustață" pe lângă mașini', { icon: '💨' }),
  Q('drift300', 1, 'drift', 300, 'Un drift de 300 de puncte', { icon: '🛞', max: true }),
  Q('km2', 1, 'km', 2000, 'Condu 2 km prin oraș', { icon: '🚗', unit: 'm' }),
  Q('eat2', 1, 'eat', 2, 'Mănâncă ceva de două ori', { icon: '🥟' }),
  Q('honk10', 1, 'honk', 10, 'Claxonează de 10 ori, ca un șofer de rutieră', { icon: '📯' }),
  Q('photo1', 1, 'photo', 1, 'Fă o poză în modul foto ([O])', { icon: '📸' }),
  Q('pothole1', 1, 'pothole', 1, 'Astupă o groapă', { icon: '🕳️' }),
  Q('shop1', 1, 'shop', 1, 'Cumpără ceva de la un chioșc', { icon: '🥨' }),
  Q('fight1', 2, 'fight', 1, 'Câștigă o bătaie de cartier', { icon: '🥊' }),
  Q('combo100', 2, 'combo', 100, 'Un combo de cascadorii de 100 de AURA', { icon: '🔥', max: true }),
  Q('wrong300', 2, 'wrongway', 300, '300 m pe contrasens, ca un deputat', { icon: '⛔', unit: 'm' }),
  Q('fare2', 2, 'fare', 2, 'Două curse de taxi', { icon: '🚕', after: 'taxi' }),
  Q('event1', 2, 'event', 1, 'Rezolvă o întâmplare de pe stradă', { icon: '📍' }),
  Q('car2', 2, 'car', 2, '„Împrumută" două mașini', { icon: '🔑' }),
  Q('streak2', 2, 'streak', 2, 'Prinde o serie de aură de ×2', { icon: '⚡', max: true }),
  Q('dosar2', 2, 'dosar', 2, 'Găsește două dosare pierdute', { icon: '📁' }),
  Q('aura300', 2, 'aura', 300, 'Adună 300 de AURA azi', { icon: '✨' }),
  Q('escape1', 3, 'escape', 1, 'Scapă de poliție', { icon: '🚨' }),
  Q('clean3', 3, 'cleanfare', 3, 'Trei curse de taxi fără nicio bușitură', { icon: '🧼', after: 'taxi' }),
  Q('ko10', 3, 'ko', 10, 'Zece oameni puși la pământ', { icon: '💥' }),
  Q('combo300', 3, 'combo', 300, 'Un combo de cascadorii de 300 de AURA', { icon: '🌋', max: true }),
  Q('event2', 3, 'event', 2, 'Două întâmplări de pe stradă rezolvate', { icon: '🗺️' }),
  Q('race1', 3, 'race', 1, 'Câștigă o cursă cu Vitea', { icon: '🏁', after: 'cursa' }),
  Q('pizza3', 3, 'pizza', 3, 'Trei pizze livrate', { icon: '🍕', after: 'taxi' }),
  Q('near20', 3, 'nearmiss', 20, '20 de treceri „la mustață"', { icon: '🌪️' }),
]
export const CHALLENGE_REWARD = { 1: { aura: 60, lei: 40 }, 2: { aura: 120, lei: 80 }, 3: { aura: 200, lei: 150 } }
export const DAILY_BONUS = { aura: 250, lei: 200 }
export const DAY_HOURS = 24   // a set of challenges lasts one game day (24 real minutes at normal speed)
