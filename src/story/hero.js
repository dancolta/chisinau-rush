import { PLAYER_TYPES } from '../data/outfits.js'

// Who came back: gender, how long and where they were "afară", for the lines that mention it.
// Older saves may carry a pre-returnee type; they get a neutral "seven years abroad".
const HERO = {
  stroitor: { female: false, years: 'Opt ani', where: 'pe șantiere, la Londra', country: 'Anglia', food: 'fish and chips' },
  badanta: { female: true, years: 'Doisprezece ani', where: 'la Padova, lângă Signor Giuseppe', country: 'Italia', food: 'paste' },
  hot: { female: false, years: 'Cinci ani', where: 'în Anglia, „la logistică"', country: 'Anglia', food: 'sandvișuri de la Tesco' },
  patan: { female: false, years: 'Trei ani', where: 'la o spălătorie de mașini în Portugalia', country: 'Portugalia', food: 'bacalhau' },
}
const DEFAULT = { female: false, years: 'Șapte ani', where: 'la Milano', country: 'Italia', food: 'pizza' }

export function hero(g) { return HERO[g?.progress?.type] || DEFAULT }
// gendered word: gen(g, 'băiatul', 'fata')
export function gen(g, m, f) { return hero(g).female ? f : m }
export function typeInfo(key) { return PLAYER_TYPES.find((t) => t.key === key) }

// street lines: [[his|hers]] by the hero's gender, {country}/{name}/{anything in vars} filled in
export function fill(g, s, vars = {}) {
  const h = hero(g)
  return String(s)
    .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, (_, a, b) => (h.female ? b : a))
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : k === 'country' ? h.country : k === 'name' ? (g?.progress?.name || '') : m))
}
