import { CAST } from './outfits.js'

// Clothes, where they're sold, and what they say about you on the street.
// The brands are parodies on purpose (a game can't hang real trademarks on knock-offs and
// gopniks), sold the way Chișinău sells them: fakes at Piața Centrală, "Italian" labels in a
// boutique on Ștefan cel Mare, and English second-hand by the kilo.
//
// look: what the outfit does to how people treat you, added to your respect with each crowd
// (gop gopniks, bab grannies, pol police) and "rich" (the flashier, the more everyone wants).

export const SLOTS = ['top', 'bottom', 'shoes', 'hat', 'eyes', 'neck', 'hand', 'mouth']
export const SLOT_NAMES = { top: 'Sus', bottom: 'Jos', shoes: 'Încălțări', hat: 'Pe cap', eyes: 'Ochelari', neck: 'La gât', hand: 'În mână', mouth: 'Zâmbet' }

// brand plate colours for the shop/wardrobe list
export const BRANDS = {
  abibas: { name: 'ABIBAS', bg: '#111', fg: '#fff' },
  naik: { name: 'NAIK', bg: '#f2f2f2', fg: '#111' },
  pumba: { name: 'PUMBA', bg: '#c8102e', fg: '#fff' },
  reyban: { name: 'Rey-Ban', bg: '#1a1a1a', fg: '#e8c872' },
  istanbul: { name: 'Aur de Istanbul', bg: '#6a4a0a', fg: '#ffd96a' },
  bunica: { name: 'Mâna bunicii', bg: '#7a2a3a', fg: '#ffe0e8' },
  armeni: { name: 'ARMENI', bg: '#0e0e10', fg: '#e8e8e8' },
  versaci: { name: 'VERSACI', bg: '#111', fg: '#d4af37' },
  dolce: { name: 'Dolce & Banana', bg: '#fbf6e8', fg: '#1a1a1a' },
  guccy: { name: 'GUCCY', bg: '#123a24', fg: '#d4af37' },
  vuiton: { name: 'Lui Vuiton', bg: '#5a3a1e', fg: '#e8c872' },
  prado: { name: 'PRADO', bg: '#111', fg: '#fff' },
  borsaline: { name: 'Borsaline', bg: '#2a2a2a', fg: '#e0d0b0' },
  maxmarrah: { name: 'Max Marrah', bg: '#b8864a', fg: '#fff' },
  northfake: { name: 'The North Fake', bg: '#1a1a1a', fg: '#fff' },
  hilfinger: { name: 'Tommy Hilfinger', bg: '#0b2a5a', fg: '#fff' },
  levys: { name: "Levy's", bg: '#b0202a', fg: '#fff' },
  lord: { name: 'Lord (second-hand)', bg: '#3a4a3a', fg: '#e8e0c8' },
  anon: { name: 'Fără firmă', bg: '#444', fg: '#ddd' },
  own: { name: 'De acasă', bg: '#2a3a4a', fg: '#cfe0f0' },
}

// every piece: id, slot, brand, name, price, spec (patched onto the character), look, shop
const I = (id, slot, brand, name, price, spec, look = {}, shop = null, note = '') => ({ id, slot, brand, name, price, spec, look, shop, note })

export const CLOTHES = [
  // ---- Piața Centrală: Nicu's stall of "brand" clothes ------------------------------------------
  I('abibas_top_k', 'top', 'abibas', 'Bluză de trening, neagră', 45, { top: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 } }, { gop: 8 }, 'piata', 'Trei dungi. Una s-a dezlipit la spălat.'),
  I('abibas_top_b', 'top', 'abibas', 'Bluză de trening, albastră', 45, { top: { style: 'tracksuit', color: 0x1c2a5a, stripes: 0xf2f2f2 } }, { gop: 8 }, 'piata'),
  I('abibas_top_r', 'top', 'abibas', 'Bluză de trening, vișinie', 45, { top: { style: 'tracksuit', color: 0x6a1a1a, stripes: 0xf2f2f2 } }, { gop: 8 }, 'piata'),
  I('abibas_bot_k', 'bottom', 'abibas', 'Pantaloni de trening', 35, { bottom: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 } }, { gop: 5 }, 'piata', 'Cu buzunare în care încap semințe pentru o săptămână.'),
  I('abibas_bot_b', 'bottom', 'abibas', 'Pantaloni de trening, albaștri', 35, { bottom: { style: 'tracksuit', color: 0x1c2a5a, stripes: 0xf2f2f2 } }, { gop: 5 }, 'piata'),
  I('naik_air', 'shoes', 'naik', 'Adidași „Air", albi', 60, { shoes: 0xf4f4f4 }, { gop: 3 }, 'piata', 'Aer au. Talpă, mai puțin.'),
  I('abibas_kepka', 'hat', 'abibas', 'Șapcă de cartier', 20, { hat: { style: 'kepka', color: 0x1c1c22 } }, { gop: 5 }, 'piata'),
  I('pumba_beanie', 'hat', 'pumba', 'Căciulă', 15, { hat: { style: 'beanie', color: 0xc8102e } }, {}, 'piata'),
  I('reyban', 'eyes', 'reyban', 'Ochelari de soare', 25, { sunglasses: true }, { gop: 2, rich: 1 }, 'piata', 'Filtru UV: garantat verbal.'),
  I('lant', 'neck', 'istanbul', 'Lanț de aur (de la Istanbul)', 80, { chain: true }, { gop: 5, rich: 1 }, 'piata', 'Se înverzește doar la ploaie.'),
  I('seminte', 'hand', 'anon', 'Pahar de semințe', 5, { hold: 'seeds' }, { gop: 5 }, 'piata', 'Accesoriul numărul unu al cartierului.'),
  I('dinte', 'mouth', 'istanbul', 'Dinte de aur, montat pe loc', 150, { goldTooth: true }, { gop: 4, rich: 1 }, 'piata', 'Nicu are și clește. Nu întreba.'),
  I('geaca_piele', 'top', 'anon', 'Geacă de piele „ca la Milano"', 120, { top: { style: 'jacket', color: 0x1a1612, shirt: 0x2a2a2e } }, { gop: 3 }, 'piata'),
  I('pulover', 'top', 'bunica', 'Pulover împletit', 40, { top: { style: 'shirt', color: 0x8a3a3a, check: 0x5a1a1a } }, { bab: 10 }, 'piata', 'Babele îl recunosc de la o poștă. Și aprobă.'),
  I('basma', 'hat', 'bunica', 'Basma cu buline', 10, { hat: { style: 'basma', color: 0x2a4a8a, dots: 0xf2e6c8 } }, { bab: 8 }, 'piata'),

  // ---- boutique „Moda de Milano" ---------------------------------------------------------------
  I('armeni_suit', 'top', 'armeni', 'Costum cu cravată', 900, { top: { style: 'suit', color: 0x16181e, shirt: 0xf6f6f6, tie: 0x8a1a2a } }, { pol: 10, rich: 2 }, 'milano', 'În costumul ăsta, polițiștii îți zic „domnule deputat".'),
  I('versaci_shirt', 'top', 'versaci', 'Cămașă cu model auriu', 450, { top: { style: 'shirt', color: 0x14120e, check: 0xc9a23a } }, { rich: 2, gop: -3 }, 'milano', 'Aur pe negru. Discret ca o nuntă la Ialoveni.'),
  I('dolce_jacket', 'top', 'dolce', 'Sacou alb', 700, { top: { style: 'jacket', color: 0xf2efe6, shirt: 0x1a1a1a } }, { rich: 2, gop: -3 }, 'milano'),
  I('maxmarrah_coat', 'top', 'maxmarrah', 'Palton de cămilă', 950, { top: { style: 'coat', color: 0xb8864a, lapel: 0x8a5a2a } }, { rich: 2, bab: 5 }, 'milano', 'Babele zic: „Ce om serios!"'),
  I('guccy_pants', 'bottom', 'guccy', 'Pantaloni bej', 380, { bottom: { color: 0xc9b48a } }, { rich: 1 }, 'milano'),
  I('guccy_dress', 'bottom', 'guccy', 'Fustă lungă', 420, { bottom: { style: 'skirt', color: 0x123a24 } }, { rich: 1 }, 'milano'),
  I('vuiton_shoes', 'shoes', 'vuiton', 'Pantofi de piele', 520, { shoes: 0x4a2a14 }, { rich: 1, pol: 2 }, 'milano'),
  I('vuiton_bag', 'hand', 'vuiton', 'Geantă cu monograme', 650, { hold: 'bag', handbag: 0x6a4a24 }, { rich: 2 }, 'milano', 'Originală. Scrie pe ea.'),
  I('borsaline', 'hat', 'borsaline', 'Pălărie fedora', 300, { hat: { style: 'fedora', color: 0x2a2a2e, band: 0x8a1a2a } }, { pol: 3, rich: 1 }, 'milano'),
  I('prado', 'eyes', 'prado', 'Ochelari de soare mari', 280, { sunglasses: true }, { rich: 1 }, 'milano'),

  // ---- second-hand „din Anglia", by the kilo -----------------------------------------------------------
  I('northfake', 'top', 'northfake', 'Geacă de munte', 70, { top: { style: 'jacket', color: 0x1a1a1e, shirt: 0xc8102e } }, {}, 'second', 'A urcat pe Everest. Cel puțin fostul proprietar așa zicea.'),
  I('hilfinger', 'top', 'hilfinger', 'Geacă bleumarin', 65, { top: { style: 'jacket', color: 0x0b2a5a, shirt: 0xf2f2f2 } }, {}, 'second'),
  I('levys', 'bottom', 'levys', 'Blugi', 40, { bottom: { color: 0x2a4a7a } }, {}, 'second', 'Au venit la kilogram. Cu kilogramul altcuiva.'),
  I('lord_shirt', 'top', 'lord', 'Cămașă în carouri', 25, { top: { style: 'shirt', color: 0x2f6a4a, check: 0x1a2a1a } }, { bab: 3 }, 'second'),
  I('lord_coat', 'top', 'lord', 'Palton englezesc', 90, { top: { style: 'coat', color: 0x8a7a5a, lapel: 0x5a4a3a } }, { bab: 5, pol: 2 }, 'second'),
  I('lord_hat', 'hat', 'lord', 'Pălărie de lord', 35, { hat: { style: 'fedora', color: 0x5a5a5e, band: 0x2a2a2e } }, { pol: 2 }, 'second', 'Lordul a lăsat-o în autobuzul spre Stansted.'),
  I('ushanka', 'hat', 'anon', 'Ușanka', 30, { hat: { style: 'ushanka', color: 0x4a3a2a } }, { bab: 3 }, 'second', 'Adusă din Rusia prin Anglia. Nu întreba.'),
  I('vesta', 'top', 'anon', 'Vestă reflectorizantă', 15, { top: { style: 'vest', color: 0x3a3f4a, vest: 0xe4e030 } }, { pol: 5 }, 'second', 'Cu vestă intri oriunde. Toți cred că lucrezi acolo.'),
  I('mire', 'top', 'anon', 'Costum de mire (purtat o dată)', 150, { top: { style: 'suit', color: 0x0e0e12, shirt: 0xf8f8f8, tie: 0xe8e8e8 } }, { pol: 5, bab: 5 }, 'second', 'Purtat o singură dată. Nunta n-a ținut, costumul da.'),
  I('folie', 'hat', 'anon', 'Căciulă de folie „anti-5G"', 10, { hat: { style: 'tinfoil' } }, { bab: 5, pol: -5 }, 'second', 'Omul din parc ar fi mândru.'),
]

// what each shop is called and how its seller talks
export const SHOPS = {
  piata: { name: 'Taraba lui Nicu', sub: 'Piața Centrală · haine „de firmă"', greet: 'Firmă, frate! Originale! Cele originale-s la mine în mașină, astea-s de probă.' },
  milano: { name: 'Moda de Milano', sub: 'Butic · Ștefan cel Mare', greet: 'Buongiorno! Totul adus direct din Milano. Prin Ungheni.' },
  second: { name: 'Second Hand „Anglia"', sub: 'La kilogram · marfă nouă joia', greet: 'Marfă proaspătă din Anglia! Kilogramul – cincizeci. Căutați, că găsiți.' },
}

// your own clothes, whatever you came home in
export function ownItems(type) {
  const b = CAST[type] || CAST.patan
  const out = [
    I('own_top', 'top', 'own', 'Haina cu care ai venit', 0, { top: b.top }),
    I('own_bottom', 'bottom', 'own', b.bottom?.style === 'skirt' ? 'Fusta cu care ai venit' : 'Pantalonii cu care ai venit', 0, { bottom: b.bottom }),
    I('own_shoes', 'shoes', 'own', 'Încălțările tale', 0, { shoes: b.shoes }),
  ]
  if (b.hat) out.push(I('own_hat', 'hat', 'own', 'Ce aveai pe cap', 0, { hat: b.hat }))
  if (b.sunglasses || b.glasses) out.push(I('own_eyes', 'eyes', 'own', 'Ochelarii tăi', 0, { sunglasses: !!b.sunglasses, glasses: !!b.glasses }))
  if (b.chain) out.push(I('own_neck', 'neck', 'own', 'Lanțul tău', 0, { chain: true }, { gop: 3 }))
  if (b.hold) out.push(I('own_hand', 'hand', 'own', b.hold === 'bag' ? 'Geanta ta' : b.hold === 'phone' ? 'Telefonul tău' : 'Semințele tale', 0, { hold: b.hold, handbag: b.handbag }, b.hold === 'seeds' ? { gop: 3 } : {}))
  return out
}

// nothing in that slot (never for top, bottom, shoes)
export const NONE = Object.fromEntries(['hat', 'eyes', 'neck', 'hand', 'mouth'].map((s) => [s, I('none_' + s, s, 'anon', { hat: 'Nimic pe cap', eyes: 'Fără ochelari', neck: 'Nimic la gât', hand: 'Mâinile libere', mouth: 'Dinții tăi' }[s], 0, {})]))

export function defaultOutfit(type) {
  const own = ownItems(type)
  const o = {}
  for (const s of SLOTS) o[s] = own.find((it) => it.slot === s)?.id || (NONE[s] ? NONE[s].id : null)
  return o
}

export function itemById(type, id) {
  if (!id) return null
  if (id.startsWith('own_')) return ownItems(type).find((it) => it.id === id) || null
  if (id.startsWith('none_')) return NONE[id.slice(5)] || null
  return CLOTHES.find((it) => it.id === id) || null
}

const clone = (o) => JSON.parse(JSON.stringify(o))

// the hero's body (skin, hair, build) wearing an outfit
export function composeSpec(type, outfit) {
  const spec = clone(CAST[type] || CAST.patan)
  for (const k of ['hat', 'sunglasses', 'glasses', 'chain', 'hold', 'handbag', 'goldTooth', 'bag']) delete spec[k]
  const o = { ...defaultOutfit(type), ...(outfit || {}) }
  for (const s of SLOTS) {
    const it = itemById(type, o[s])
    if (it?.spec) Object.assign(spec, clone(it.spec))
  }
  // a skirt under a tracksuit top is fine; trousers need no stockings
  if (spec.bottom?.style !== 'skirt' && spec.bottom?.style !== 'dress') delete spec.stockings
  else spec.stockings ??= 0x3a3030
  return spec
}

// how an outfit reads on the street
export function lookOf(type, outfit) {
  const L = { gop: 0, bab: 0, pol: 0, rich: 0 }
  const o = { ...defaultOutfit(type), ...(outfit || {}) }
  for (const s of SLOTS) {
    const it = itemById(type, o[s])
    if (it?.look) for (const [k, v] of Object.entries(it.look)) L[k] += v
  }
  for (const k of ['gop', 'bab', 'pol']) L[k] = Math.max(-15, Math.min(20, L[k]))
  L.rich = Math.max(0, Math.min(6, L.rich))
  return L
}

export function lookText(look) {
  const parts = []
  if (look.gop) parts.push(`👊${look.gop > 0 ? '+' : ''}${look.gop}`)
  if (look.bab) parts.push(`🥧${look.bab > 0 ? '+' : ''}${look.bab}`)
  if (look.pol) parts.push(`👮${look.pol > 0 ? '+' : ''}${look.pol}`)
  if (look.rich) parts.push('💰'.repeat(Math.min(3, look.rich)))
  return parts.join(' ')
}
