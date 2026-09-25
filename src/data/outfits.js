// Outfit specs for every named character + generators for civilians.
// Consumed by buildCharacter() in entities/CharacterModel.js.

export const SKIN = [0xf1c7a4, 0xe7b48f, 0xdca37c, 0xc98b64, 0xb37552, 0xf3d0b5]
const HAIR = [0x2a1c12, 0x3a2a1c, 0x5a3a22, 0x7a5a3a, 0x1a1a1a, 0x8a7a6a, 0xb8a888, 0xc8a060]

export const CAST = {
  // ---- playable: the four who came back from "afară" ----------------------------
  stroitor: { skin: 0xdca37c, top: { style: 'vest', color: 0x4a5a6a, vest: 0xe4e030, short: true }, bottom: { color: 0x3a3f4a }, shoes: 0x5a4028, hat: { style: 'hardhat', color: 0xf0b21e }, hair: { style: 'short', color: 0x3a2a1c }, mustache: 0x3a2a1c, width: 1.12, belly: 0.3 },
  badanta: { skin: 0xf1c7a4, height: 0.95, width: 1.02, belly: 0.3, top: { style: 'coat', color: 0xa8286a, lapel: 0x7a1a4a }, bottom: { style: 'skirt', color: 0x1e1a22 }, stockings: 0x3a3030, shoes: 0x1a1a1e, hair: { style: 'bun', color: 0xd8b25a }, sunglasses: true, chain: true, hold: 'bag', handbag: 0xc9a24a },
  hot: { skin: 0xe7b48f, top: { style: 'jacket', color: 0x23262e, shirt: 0x5a5e66 }, bottom: { color: 0x2a3548 }, shoes: 0xf2f2f2, hat: { style: 'beanie', color: 0x16171c }, hair: { style: 'short', color: 0x2a1c12 }, bag: 0x2a2a2e, hold: 'phone' },
  // ---- older playable types (still valid in old saves; also used for NPCs) -----------
  patan: { skin: 0xe7b48f, top: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 }, bottom: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 }, shoes: 0xf2f2f2, hat: { style: 'kepka', color: 0x1c1c22 }, hair: { style: 'short', color: 0x2a1c12 }, angry: true, chain: true, hold: 'seeds' },
  taxist: { skin: 0xdca37c, top: { style: 'jacket', color: 0x5a3a24, shirt: 0xd9c9a8 }, bottom: { color: 0x2a3548 }, hat: { style: 'kepka', color: 0x4a4a4a }, mustache: 0x2a1c12, hair: { style: 'short', color: 0x2a1c12 }, belly: 0.5 },
  conductor: { skin: 0xe7b48f, top: { style: 'vest', color: 0x5a7a9a, vest: 0x39485c, short: false }, bottom: { color: 0x2d2f36 }, hat: { style: 'police', color: 0x39485c, band: 0x2f7d5c }, bag: 0x5a3a24, hair: { style: 'short', color: 0x5a3a22 } },
  agent: { skin: 0xf1c7a4, top: { style: 'suit', color: 0x1f2c48, shirt: 0xf2f2f2 }, bottom: { color: 0x1f2c48 }, shoes: 0x3a2a1c, hair: { style: 'slick', color: 0x1a1a1a }, sunglasses: true, hold: 'phone' },
  director: { skin: 0xdca37c, top: { style: 'suit', color: 0x55585e, shirt: 0xe8e4d8, tie: 0x7a1a1a }, bottom: { color: 0x55585e }, hair: { style: 'bald', color: 0x3a2a1c }, belly: 1.0, width: 1.1, chain: true },
  ionel: { skin: 0xe7b48f, top: { style: 'shirt', color: 0xb03a2e, check: 0x6a1a14 }, bottom: { color: 0x3a3a44 }, hat: { style: 'ushanka', color: 0x5a4a3a }, hair: { style: 'short', color: 0x7a5a3a }, bag: 0x9a8a6a },

  // ---- story cast ------------------------------------------------------------
  zina: { skin: 0xf1c7a4, height: 0.9, width: 1.08, belly: 0.6, top: { style: 'coat', color: 0x6a2a3a, lapel: 0x5a1f2e }, bottom: { style: 'skirt', color: 0x2e2a36, long: true }, stockings: 0x8a6a5a, shoes: 0x2a1f1a, hat: { style: 'basma', color: 0xc0392b, dots: 0xf2e6c8 }, hair: { style: 'none' }, hold: 'bag', handbag: 0x6a4a2a },
  gopnik1: { skin: 0xe7b48f, top: { style: 'tracksuit', color: 0x1c2a5a, stripes: 0xf2f2f2 }, bottom: { style: 'tracksuit', color: 0x1c2a5a, stripes: 0xf2f2f2 }, shoes: 0xf2f2f2, hat: { style: 'kepka', color: 0x1a1a1a }, hair: { style: 'short', color: 0x2a1c12 }, hold: 'seeds', angry: true },
  gopnik2: { skin: 0xdca37c, top: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 }, bottom: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 }, shoes: 0x1e1e22, hair: { style: 'bald', color: 0x2a1c12 }, angry: true, chain: true },
  gopnik3: { skin: 0xe7b48f, top: { style: 'tracksuit', color: 0x6a1a1a, stripes: 0xf2f2f2 }, bottom: { style: 'tracksuit', color: 0x14161c, stripes: 0xf2f2f2 }, shoes: 0xf2f2f2, hat: { style: 'beanie', color: 0x2a2a2a }, hair: { style: 'short' }, angry: true },
  borea: { skin: 0xc98b64, top: { style: 'jacket', color: 0x1a1a1a, shirt: 0x8a2a2a }, bottom: { color: 0x2a2a30 }, hat: { style: 'fedora', color: 0x2a2220, band: 0x8a2a2a }, mustache: 0x1a1a1a, chain: true, goldTooth: true, hair: { style: 'short', color: 0x1a1a1a }, belly: 0.4 },
  profet: { skin: 0xdca37c, top: { style: 'coat', color: 0x5a5a3a, lapel: 0x4a4a2e }, bottom: { color: 0x4a3f33 }, shoes: 0x3a2f24, hat: { style: 'tinfoil' }, beard: 0xb8b0a0, beardLong: true, hair: { style: 'long', color: 0x9a9080 }, width: 0.92 },
  caldare: { skin: 0xe7b48f, top: { style: 'uniform', color: 0x2a3f6a }, bottom: { color: 0x1f2a44 }, hat: { style: 'police', color: 0x1f2a44, band: 0x3a5aa8 }, mustache: 0x3a2a1c, belly: 0.9, width: 1.08, hair: { style: 'short', color: 0x3a2a1c } },
  cop: { skin: 0xe7b48f, top: { style: 'uniform', color: 0x2a3f6a }, bottom: { color: 0x1f2a44 }, hat: { style: 'police', color: 0x1f2a44, band: 0x3a5aa8 }, hair: { style: 'short', color: 0x2a1c12 } },
  eban: { skin: 0xf1c7a4, top: { style: 'suit', color: 0x141a2a, shirt: 0xf2f2f2, tie: 0xb0181e }, bottom: { color: 0x141a2a }, shoes: 0x0e0e10, hair: { style: 'slick', color: 0x3a2a1c }, hold: 'phone', height: 1.03 },
  mascat: { skin: 0xdca37c, top: { style: 'suit', color: 0x0e0e12, shirt: 0x0e0e12, tie: 0x0e0e12 }, bottom: { color: 0x0e0e12 }, shoes: 0x0e0e10, hair: { style: 'bald', color: 0x1a1a1a }, sunglasses: true, width: 1.15, height: 1.05 },
  jurnalista: { skin: 0xf1c7a4, top: { style: 'coat', color: 0xc9b48a, lapel: 0xb89f72 }, bottom: { color: 0x2a2a30 }, hair: { style: 'ponytail', color: 0x7a4a2a }, glasses: true, hold: 'mic', height: 0.96 },
  vatman: { skin: 0xdca37c, top: { style: 'shirt', color: 0x7a9aba, short: true }, bottom: { color: 0x2a3548 }, hat: { style: 'kepka', color: 0x2a3548 }, mustache: 0x5a4a3a, belly: 0.6, hair: { style: 'short', color: 0x6a6a6a } },
  gunoier: { skin: 0xc98b64, top: { style: 'vest', color: 0x3a4a3a, vest: 0xf06a1a }, bottom: { color: 0x2a3a2a }, hat: { style: 'beanie', color: 0xf06a1a }, hair: { style: 'short' } },
  mecanic: { skin: 0xdca37c, top: { style: 'shirt', color: 0x2f4f6f, short: true }, bottom: { color: 0x2f4f6f }, hat: { style: 'kepka', color: 0x2f4f6f }, mustache: 0x1a1a1a, hair: { style: 'short', color: 0x1a1a1a } },
  plecat: { skin: 0xe7b48f, top: { style: 'shirt', color: 0xf2f2f2 }, bottom: { color: 0x3a5a8a }, sunglasses: true, chain: true, hair: { style: 'slick', color: 0x2a1c12 } },
  vanzatoare: { skin: 0xf1c7a4, top: { style: 'shirt', color: 0x2f9a5a }, bottom: { style: 'skirt', color: 0x2a2a30 }, hair: { style: 'bun', color: 0x8a5a2a }, width: 1.05 },
  preot: { skin: 0xe7b48f, top: { style: 'coat', color: 0x111114, lapel: 0x111114 }, bottom: { style: 'dress', color: 0x111114, long: true }, beard: 0x3a2a1c, beardLong: true, hair: { style: 'long', color: 0x3a2a1c }, hat: { style: 'beanie', color: 0x111114 } },
  deputat: { skin: 0xf1c7a4, top: { style: 'suit', color: 0x3a2a4a, shirt: 0xf2f2f2, tie: 0xd9a93a }, bottom: { color: 0x3a2a4a }, hair: { style: 'bald', color: 0x5a5a5a }, belly: 1.1, width: 1.12, glasses: true },
}

// playable-type metadata (names/perks follow the original game)
export const PLAYER_TYPES = [
  { key: 'stroitor', name: 'Vasea „Stroika"', defName: 'Vasea', blurb: 'Opt ani pe șantiere la Londra și Moscova. Cară saci de ciment cum cară alții semințe.', perk: 'Stamina de fier · mai multă viață · pumni de betonist' },
  { key: 'badanta', name: 'Tanti Valea, badanta', defName: 'Valea', female: true, blurb: 'Doisprezece ani la Padova, lângă Signor Giuseppe. Giuseppe s-o dus. Averea a rămas… la ea.', perk: 'Moștenirea (+1500 lei) · se tocmește: -20% peste tot · babele o respectă' },
  { key: 'hot', name: 'Marcel „Scoțianu\'"', defName: 'Marcel', blurb: 'Zice că a lucrat în Anglia „la logistică". Logistica ieșea din magazin fără casă de marcat.', perk: 'Fură mașini fără scandal · buzunărește · poliția îl uită repede' },
  { key: 'patan', name: 'Vitalik, pațanul de pe raion', defName: 'Vitalik', blurb: 'Trei ani la o spălătorie din Portugalia. S-a întors cu treningul, lanțul și respectul intacte.', perk: 'Pumni grei · gopnicii îl știu din start · semințe din belșug' },
]

// ---- civilians ---------------------------------------------------------------
const MEN_TOPS = [
  () => ({ style: 'jacket', color: pick([0x3a3a44, 0x5a3a24, 0x2a3548, 0x4a4a3a, 0x1a1a1e]), shirt: pick([0xd9c9a8, 0xf2f2f2, 0x8aa0b8]) }),
  () => ({ style: 'shirt', color: pick([0xf2f2f2, 0x8aa0b8, 0xc9b48a, 0x7a9a6a, 0xb8745a]), short: Math.random() < 0.5 }),
  () => ({ style: 'shirt', color: pick([0x3a6ea5, 0xb03a2e, 0x2f7d5c]), check: 0x1a1a1a }),
  () => ({ style: 'tracksuit', color: pick([0x14161c, 0x1c2a5a, 0x3a3a44]), stripes: 0xf2f2f2 }),
  () => ({ style: 'suit', color: pick([0x2a2a30, 0x3a3f4a, 0x2a3548]), shirt: 0xf2f2f2, tie: pick([0x7a1a1a, 0x1a3a7a, null]) }),
  () => ({ style: 'coat', color: pick([0x4a4a3a, 0x3a3a44, 0x5a4a3a]) }),
]
const WOMEN_TOPS = [
  () => ({ style: 'shirt', color: pick([0xd96a8a, 0xf2f2f2, 0x8a6ab8, 0xe6b84a, 0x5aa0b8]), short: Math.random() < 0.6 }),
  () => ({ style: 'coat', color: pick([0xb8745a, 0x5a3a4a, 0xc9b48a, 0x3a4a5a]) }),
  () => ({ style: 'jacket', color: pick([0x1a1a1e, 0x8a2a3a, 0x3a5a7a]), shirt: 0xf2f2f2 }),
]
export function pick(a) { return a[Math.floor(Math.random() * a.length)] }

export function randomCivilian(rnd = Math.random) {
  const r = () => rnd()
  const old = r() < 0.28
  const woman = r() < 0.5
  const skin = SKIN[Math.floor(r() * SKIN.length)]
  const hairColor = old ? pick([0x8a8a8a, 0xb8b0a0, 0xd0ccc4]) : HAIR[Math.floor(r() * HAIR.length)]
  if (woman) {
    const dress = r() < 0.35
    const spec = {
      skin, height: old ? 0.92 : 0.95 + r() * 0.06, width: old ? 1.05 : 0.95, belly: old ? 0.4 : 0,
      top: dress ? { style: 'dress', color: pick([0x8a2a4a, 0x2a5a8a, 0x5a8a3a, 0xb8745a, 0x3a3a44]) } : pick(WOMEN_TOPS)(),
      bottom: dress ? { style: 'dress', color: 0x000000 } : r() < 0.5 ? { style: 'skirt', color: pick([0x2a2a30, 0x5a3a4a, 0x3a4a6a]) } : { color: pick([0x2a3548, 0x1a1a1e, 0x5a5a66]) },
      stockings: pick([0xc9a88a, 0x3a3030, skin]),
      hair: { style: pick(old ? ['bun', 'short'] : ['long', 'ponytail', 'bun', 'long']), color: hairColor },
      shoes: pick([0x1a1a1e, 0x5a3a24, 0x8a2a2a]),
      hold: r() < 0.4 ? 'bag' : r() < 0.2 ? 'phone' : null,
      handbag: pick([0x7a4a2a, 0x1a1a1e, 0xb03a2e, 0xc9b48a]),
    }
    if (old && r() < 0.6) spec.hat = { style: 'basma', color: pick([0x8a2a3a, 0x3a4a6a, 0x6a5a3a, 0xc0392b]), dots: r() < 0.5 ? 0xf2e6c8 : null }
    if (r() < 0.15) spec.glasses = true
    return spec
  }
  const spec = {
    skin, height: 0.97 + r() * 0.08, width: 0.95 + r() * 0.12, belly: old ? 0.4 + r() * 0.6 : r() < 0.2 ? 0.5 : 0,
    top: pick(MEN_TOPS)(),
    bottom: { color: pick([0x2a3548, 0x1a1a1e, 0x3a3a44, 0x4a4a3a, 0x2d2f36]) },
    hair: { style: old ? pick(['bald', 'short']) : pick(['short', 'short', 'slick', 'bald']), color: hairColor },
    shoes: pick([0x1a1a1e, 0x3a2a1c, 0xf2f2f2]),
    hold: r() < 0.15 ? 'phone' : null,
  }
  if (spec.top.style === 'tracksuit') spec.bottom = { style: 'tracksuit', color: spec.top.color, stripes: 0xf2f2f2 }
  if (r() < (old ? 0.55 : 0.12)) spec.hat = { style: pick(['kepka', 'kepka', 'beanie']), color: pick([0x3a3a3a, 0x4a4a3a, 0x2a2a30]) }
  if (r() < (old ? 0.5 : 0.2)) spec.mustache = hairColor
  if (r() < 0.08) spec.beard = hairColor
  if (r() < 0.12) spec.sunglasses = true
  if (!old && r() < 0.15) spec.backpack = pick([0x2a3548, 0xb03a2e, 0x1a1a1e])
  return spec
}
