import { CLOTHES, BRANDS } from './wardrobe.js'

// Goals: what the game counts and pays for on top of the story. What each currency is for, what a
// new rank and each respect tier bring, the achievements („Realizări"), the daily streak, the 30
// golden seed packets hidden around town, and the one-time cards that explain a currency the
// first time you earn it. Logic in src/side/Goals.js and Seeds.js, screens in Stage.js (the pop-up
// queue) and GoalsUI.js (pause pages, title screen); checks in tools/achievements.mjs.

// ---- the progression story: four things you collect, and what each one is for ---------------------
export const CURRENCIES = {
  xp: { icon: '⭐', name: 'Cariera', unit: 'XP', what: 'Povestea ta: de la „plecat peste hotare" la primar.', from: 'Misiuni, taxi, pizza, curse, gropi, dosare, scăpat de poliție.', gives: 'Fiecare rang nou: o primă în lei și unelte noi.' },
  aura: { icon: '✨', name: 'AURA', unit: 'AURA', what: 'Cât de tare pari pe cartier.', from: 'Chestii tari: bătăi câștigate, cascadorii, curse curate. Cringe-ul o scade.', gives: 'Nivelurile deblochează haine, perks și nitro.' },
  respect: { icon: '🤝', name: 'Respect', unit: '', what: 'Cum te tratează gopnicii, babele și poliția.', from: 'Vorbă bună, favoruri, haine potrivite. Și invers.', gives: 'Fiecare treaptă schimbă ceva: taxe, ponturi, mită.' },
  lei: { icon: '💵', name: 'Lei', unit: 'lei', what: 'Bani de cheltuit.', from: 'Joburi, misiuni, realizări, bonusul zilnic.', gives: 'Mâncare, haine, arme, reparații. Și „cafele".' },
}

// the first time you earn each one, a card says what it is (once per save)
export const EXPLAIN = {
  lei: { icon: '💵', title: 'LEI', text: 'Bani de cheltuit: mâncare, haine, arme, reparații la Vova. Și „cafele" pentru poliție.', foot: 'Dacă leșini, doctorul de gardă ia și el ceva.' },
  xp: { icon: '⭐', title: 'XP · CARIERA', text: 'Povestea ta, de la „plecat peste hotare" la primar. Vine din misiuni și joburi.', foot: 'Fiecare rang nou aduce o primă în lei și unelte noi.' },
  aura: { icon: '✨', title: 'AURA', text: 'Cât de tare pari pe cartier. Chestiile tari o cresc, cringe-ul o scade.', foot: 'Nivelurile deblochează haine, perks și nitro.' },
  respect: { icon: '🤝', title: 'RESPECT', text: 'Gopnicii, babele și poliția țin minte ce faci.', foot: 'Fiecare treaptă schimbă ceva: taxe, ponturi, mită mai ieftină.' },
  seeds: { icon: '🌻', title: 'SEMINȚE DE AUR', text: '30 de pachete ascunse prin oraș. Strălucesc de departe.', foot: 'La 10, 20 și 30 primești premii mari.' },
  ach: { icon: '🏆', title: 'REALIZĂRI', text: 'Tot ce faci prin oraș se numără. Și se plătește.', foot: 'Toate, cu progres: pauză ([Esc]) → Realizări.' },
}

// what a new rank brings (RANKS in gameplay/Progress.js). The weapons are the Director's rank-up
// gifts, listed so the progress page can say so.
export const RANK_REWARDS = [
  null,
  { lei: 75 },
  { lei: 150, weapon: 'covor' },
  { lei: 250, weapon: 'sticla' },
  { lei: 400, respect: ['pol', 5] },
  { lei: 600, respect: ['bab', 5] },
  { lei: 1000 },
]

// what each respect tier gets you (RESPECT_TIERS / RESPECT_NAMES in Progress.js), in the words the
// street would use; the numbers behind them live in Hood, StreetTalk, StreetLife, Police, Crew, Gear
export const RESPECT_PERKS = {
  gop: [
    'Îți cer „taxă de cartier". Împinge-i și sar la bătaie.',
    'Gata cu taxa. La bancă îți dau ponturi: dosare, gropi.',
    'Te salută și-ți dau joburi mai bune: pachete, datornici.',
    'Gașcă de 3, −10% la Borea, sar la bătaie pentru tine. Cadou: bâta de oină.',
  ],
  bab: [
    'Te ceartă pe stradă. Bârfele tot ți le spun.',
    'Din când în când îți scapă și un pont.',
    'Ponturi aproape mereu, roșii la jumătate de preț, te hrănesc pe stradă.',
    'Te pomenesc la biserică. Cadou: umbrela bunicii.',
  ],
  pol: [
    'Mita trece cam o dată din două.',
    'Mita trece mai des.',
    'Mita trece aproape mereu. Banii furați „se găsesc".',
    'Mita costă jumătate și trece mereu. Polițiștii te salută.',
  ],
}

// the two older street meters, renamed so they stop sounding like a third kind of respect
export const STREET_STATS = {
  cred: { icon: '😎', name: 'Tupeu', text: 'Cât de ușor scapi cu vorba: taxa gopnicilor, târgul, împrumuturile.' },
  civic: { icon: '🏅', name: 'Simț civic', text: 'Poliția te crede mai ușor când vorbești frumos. Vecinii te împrumută.' },
}

// ---- the daily streak: come back tomorrow, it grows for 7 days, then starts a new week ----------------
export const STREAK = [
  { lei: 50 },
  { lei: 75, aura: 25 },
  { lei: 100, aura: 50 },
  { lei: 150, aura: 75 },
  { lei: 200, aura: 100 },
  { lei: 300, aura: 150 },
  { lei: 500, aura: 250, mama: true },   // „pachetul de la mama": sarmale, a full stomach
]

// ---- golden seed packets: one pays a little, 10 / 20 / 30 pay a lot (the "seeds" achievement) ----------
export const SEEDS = { count: 30, lei: 10, aura: 15, r: 1.7, rCar: 2.8, near: 95, blip: 45 }

// ---- achievements -------------------------------------------------------------------------------------
export const TIERS = [
  { key: 'bronz', name: 'bronz', icon: '🥉' },
  { key: 'argint', name: 'argint', icon: '🥈' },
  { key: 'aur', name: 'aur', icon: '🥇' },
]

export const ACH_CATS = [
  { id: 'poveste', name: 'Povestea' },
  { id: 'strada', name: 'Pe stradă' },
  { id: 'volan', name: 'La volan' },
  { id: 'politie', name: 'Cu poliția' },
  { id: 'oras', name: 'Prin oraș' },
  { id: 'zilnic', name: 'Zi de zi' },
  { id: 'ascunse', name: 'Ascunse' },
]

// value: what's counted (see VALUES in src/side/Goals.js); tiers: [target, reward] per tier (three
// of them: bronze, silver, gold; one for a single achievement). unit: [one, many] for the nudges.
// max: a best-ever value, not a running count. hidden: '???' until you get it.
// Rewards are lei (paid the moment it unlocks) and, for a few, clothes nobody sells.
const T = (id, cat, icon, name, desc, value, unit, tiers, o = {}) => ({ id, cat, icon, name, desc, value, unit, tiers, ...o })
const S = (id, cat, icon, name, desc, value, reward, o = {}) => ({ id, cat, icon, name, desc, value, unit: o.unit || null, tiers: [[o.n || 1, reward]], single: true, ...o })

export const ACHIEVEMENTS = [
  // the story
  S('prolog', 'poveste', '🧳', 'Bratan, te-ai întors', 'Termină prologul. Chișinăul te-a primit înapoi. Cu gropi cu tot.', 'story:sosire', { lei: 50 }),
  S('cap1', 'poveste', '📂', 'Cu dosarul sub braț', 'Termină capitolul 1: un dosar și o bănuială.', 'story:eban', { lei: 100 }),
  S('cap2', 'poveste', '📱', 'Trei martori și o cartelă SIM', 'Termină capitolul 2.', 'story:sergentul', { lei: 150 }),
  S('cap3', 'poveste', '🕯️', 'Ieșit din beci', 'Termină capitolul 3.', 'story:rapirea', { lei: 200 }),
  S('final', 'poveste', '🏛️', 'Lucrăm la asta', 'Termină povestea. Prima ședință: lucrăm la asta.', 'story:alegeri', { lei: 1000, clothes: 'rz_primar' }, { gold: true }),
  S('stele', 'poveste', '⭐', 'Trei stele, ca la hotel', 'Termină o misiune din poveste cu trei stele.', 'stars3', { lei: 150 }),

  // the street
  T('ko', 'strada', '👊', 'Pumnul din Botanica', 'Oameni puși la pământ.', 'ko', ['om pus la pământ', 'oameni puși la pământ'],
    [[10, { lei: 40 }], [50, { lei: 120 }], [150, { lei: 300 }]]),
  T('events', 'strada', '📍', 'Vecinul de serviciu', 'Întâmplări de pe stradă rezolvate. Le anunță vecinii pe Viber.', 'events', ['întâmplare', 'întâmplări'],
    [[1, { lei: 40 }], [5, { lei: 150 }], [15, { lei: 400 }]]),
  S('bratan', 'strada', '🤝', 'Bratan de onoare', 'Ajungi „Bratan" la gopnici.', 'gopTier', { lei: 150 }, { n: 3 }),
  S('tigaie', 'strada', '🍳', 'Tanti Galea ar fi mândră', 'Lovește pe cineva cu tigaia. BONG!', 'tigaie', { lei: 40 }),
  S('water', 'strada', '🔫', 'Udă, nu doare', 'Udă pe cineva cu pistolul cu apă.', 'water', { lei: 20 }),
  S('drip', 'strada', '👕', 'Drip de Milano', 'Îmbracă cinci haine noi.', 'drip', { lei: 80 }, { n: 5, unit: ['haină nouă', 'haine noi'] }),

  // behind the wheel
  T('taxi', 'volan', '🚕', 'Taximetrist de 5 stele', 'Curse de taxi duse la capăt.', 'fares', ['cursă', 'curse'],
    [[3, { lei: 50 }], [15, { lei: 150 }], [40, { lei: 400, clothes: 'rz_taxi' }]]),
  T('combo', 'volan', '🛞', 'Drift pe Ștefan cel Mare', 'Cel mai tare combo de cascadorii, în AURA.', 'bestCombo', ['AURA', 'AURA'],
    [[25, { lei: 50 }], [100, { lei: 150 }], [300, { lei: 400 }]], { max: true }),
  T('near', 'volan', '💨', 'La un fir de păr', 'Treceri „la mustață" pe lângă mașini, în viteză.', 'nearMiss', ['trecere la mustață', 'treceri la mustață'],
    [[10, { lei: 40 }], [50, { lei: 120 }], [150, { lei: 300 }]]),
  S('race', 'volan', '🏁', 'Vitea plânge în Jiguli', 'Câștigă o cursă cu gopnicii.', 'races', { lei: 100 }),
  S('pizza', 'volan', '🍕', 'Pizza caldă, client fericit', 'Livrează trei pizze calde.', 'hotPizza', { lei: 80 }, { n: 3, unit: ['pizza caldă', 'pizze calde'] }),
  S('bail', 'volan', '🎬', 'Ca-n filme', 'Sari din mașină în plină viteză.', 'bails', { lei: 30 }),

  // with the police
  T('escape', 'politie', '🚨', 'Prinde-mă dacă poți', 'Scăpat de poliție.', 'escapes', ['scăpare de poliție', 'scăpări de poliție'],
    [[1, { lei: 40 }], [5, { lei: 120 }], [15, { lei: 300 }]]),
  S('fara_acte', 'politie', '🪪', 'Fără acte', 'Scapă de poliție cu trei stele sau mai multe.', 'escape3', { lei: 150 }),
  S('mita', 'politie', '☕', 'Mită la sergent', 'Dă o „cafea" unui polițist. Circulați, circulați.', 'bribes', { lei: 30 }),
  S('acte', 'politie', '🎩', 'Domnule deputat', 'Scapă de poliție cu actele false de la Borea.', 'papers', { lei: 100 }),

  // around town
  T('gropi', 'oras', '🕳️', 'Groapă cu groapă', 'Gropi astupate. Primăria plânge. La aur: toate 20.', 'potholes', ['groapă', 'gropi'],
    [[1, { lei: 30 }], [8, { lei: 120 }], [20, { lei: 400, clothes: 'rz_vesta' }]]),
  T('dosare', 'oras', '📁', 'Arhivarul Primăriei', 'Dosare pierdute găsite prin oraș.', 'dosare', ['dosar', 'dosare'],
    [[3, { lei: 40 }], [12, { lei: 120 }], [30, { lei: 400 }]]),
  T('seeds', 'oras', '🌻', 'Semințe de aur', 'Pachete de semințe de aur găsite. Sunt 30, ascunse prin tot orașul.', 'seeds', ['pachet', 'pachete'],
    [[10, { lei: 150 }], [20, { lei: 300 }], [30, { lei: 1000, clothes: 'rz_seminte' }]]),
  S('districts', 'oras', '🗺️', 'Turist în orașul tău', 'Treci prin toate cele patru sectoare: Centru, Râșcani, Botanica, Gara.', 'districts', { lei: 100 }, { n: 4, unit: ['sector', 'sectoare'] }),

  // day by day
  T('daily', 'zilnic', '📋', 'Om cu listă', 'Provocări zilnice îndeplinite.', 'challenges', ['provocare', 'provocări'],
    [[3, { lei: 50 }], [15, { lei: 150 }], [45, { lei: 400 }]]),
  S('ziua', 'zilnic', '🏆', 'Ziua perfectă', 'Toate trei provocările într-o zi.', 'fullDays', { lei: 100 }),
  T('streak', 'zilnic', '🔥', 'Vecinul de la geam', 'Zile la rând în care ai intrat în joc.', 'bestStreak', ['zi la rând', 'zile la rând'],
    [[2, { lei: 50 }], [4, { lei: 150 }], [7, { lei: 400, clothes: 'rz_papuci' }]], { max: true }),
  T('aura', 'zilnic', '✨', 'Aura de Chișinău', 'Nivelul de AURA.', 'auraLevel', ['nivel', 'niveluri'],
    [[5, { lei: 100 }], [10, { lei: 250 }], [20, { lei: 1000 }]], { max: true, nudge: false }),

  // the ones nobody tells you about
  S('trolley', 'ascunse', '🚎', 'Tot orașul a văzut', 'Ai bușit troleibuzul. Vatmanul încă povestește.', 'trolley', { lei: 10 }, { hidden: true }),
  S('granny', 'ascunse', '👵', 'Bunica are centură neagră', 'Te-a pus la pământ o bunică. Cu sacoșa.', 'byGranny', { lei: 10 }, { hidden: true }),
  S('fainted', 'ascunse', '💤', 'Somn de frumusețe pe asfalt', 'Ai leșinat în mijlocul străzii.', 'fainted', { lei: 10 }, { hidden: true }),
  S('jail', 'ascunse', '🚔', 'Trei ore de „discuții"', 'Ai ajuns la secție.', 'jail', { lei: 10 }, { hidden: true }),
  S('broke', 'ascunse', '🪙', 'Buzunare goale', 'Ai rămas cu zero lei. Mama ți-a trimis 25, „pentru pâine".', 'broke', { lei: 25 }, { hidden: true }),
]

// every tier counts as one achievement
export const ACH_TOTAL = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0)

// ---- clothes you only get from achievements ------------------------------------------------------------
BRANDS.realizari = { name: 'REALIZARE', bg: '#1d3a2a', fg: '#ffd95a' }
const C = (id, slot, name, spec, look, note) => ({ id, slot, brand: 'realizari', name, price: 0, spec, look, shop: 'realizari', note })
export const GOAL_CLOTHES = [
  C('rz_taxi', 'hat', 'Șapca de taximetrist', { hat: { style: 'kepka', color: 0xf2c200 } }, { bab: 3 }, 'Cinci stele. Patru de la clienți, una de la mama.'),
  C('rz_vesta', 'top', 'Vesta Asociației de Proprietari', { top: { style: 'vest', color: 0x3a3f4a, vest: 0xff8a1a } }, { bab: 6, pol: 3 }, 'Cine astupă gropi are voie peste tot.'),
  C('rz_seminte', 'top', 'Trening „Semința de aur"', { top: { style: 'tracksuit', color: 0xf2c21a, stripes: 0x2f5a1a } }, { gop: 10, rich: 1 }, 'Galben ca floarea-soarelui. Pacanii se ridică de pe vine.'),
  C('rz_papuci', 'shoes', 'Papucii de casă', { shoes: 0x7a2a3a }, { bab: 5 }, 'Pentru vecinul care nu lipsește o zi de la geam.'),
  C('rz_primar', 'top', 'Costumul de primar', { top: { style: 'suit', color: 0x1a2a5a, shirt: 0xf6f6f6, tie: 0xd4a017 } }, { pol: 10, bab: 6, rich: 2 }, 'Croit pentru ședințe. Buzunarele: pentru promisiuni.'),
]
// they live with the rest of the clothes (the wardrobe lists them once they're yours); nobody sells them
for (const c of GOAL_CLOTHES) if (!CLOTHES.some((x) => x.id === c.id)) CLOTHES.push(c)

// "1 cursă", "5 curse", "20 de curse": Romanian wants a "de" from twenty up
export function countWord(n, unit) {
  if (!unit) return String(n)
  const w = n === 1 ? unit[0] : unit[1]
  const r = n % 100
  return `${n} ${n >= 20 && (r === 0 || r >= 20) ? 'de ' : ''}${w}`
}
