import { CAST, randomCivilian } from '../data/outfits.js'
import { NPC } from '../entities/NPC.js'
import { mulberry } from '../world/rng.js'

// Static little scenes that make the city feel lived in, spawned only near the player:
// people on benches, a wedding photo shoot at the Arc, market vendors, card players.
const BRIDE = { ...CAST.vanzatoare, top: { style: 'shirt', color: 0xfbfaf4 }, bottom: { style: 'dress', color: 0xfbfaf4, long: true }, hair: { style: 'bun', color: 0x5a3a22 }, stockings: 0xf2e6da, shoes: 0xf2f2f2 }
const GROOM = { ...CAST.agent, top: { style: 'suit', color: 0x15171d, shirt: 0xffffff, tie: 0xe8e8e8 }, bottom: { color: 0x15171d }, sunglasses: false, hold: undefined }
const PHOTO = { ...CAST.plecat, sunglasses: false, hold: 'phone', top: { style: 'shirt', color: 0x3a3a44 } }
const OLDMAN = (c) => ({ ...CAST.vatman, top: { style: 'jacket', color: c, shirt: 0xd9c9a8 }, hat: { style: 'kepka', color: 0x3a3a3a } })

export class Ambient {
  constructor(game) {
    this.game = game
    this.npcs = []
    this.spots = []
    this.t = 0
    const w = game.world, rnd = mulberry(4242)
    // people on benches (never on Tanti Zina's)
    for (const b of w.benches) {
      if (b.special || rnd() > 0.3) continue
      const off = 0.45
      this.spots.push({ x: b.x, z: b.z, list: [{ spec: rnd() < 0.4 ? { ...CAST.zina, top: { style: 'coat', color: [0x4a5a7a, 0x6a3a4a, 0x3a5a4a][Math.floor(rnd() * 3)], lapel: 0x2a2a30 } } : null, x: b.x + Math.sin(b.ry) * off, z: b.z + Math.cos(b.ry) * off, ry: b.ry + Math.PI, state: 'sit' }] })
    }
    // wedding photo shoot in front of the Arc (the Arc behind the couple, the Government across)
    const arc = w.places.arc
    if (arc) {
      const z0 = arc.z - 0.6   // just north of the arch
      this.spots.push({ x: arc.x, z: z0, list: [
        { spec: BRIDE, x: arc.x - 0.5, z: z0, ry: Math.PI, voice: 'female', say: ['Mai zâmbim o dată!', 'Ține-mă de mână, nu de telefon!', 'Poza asta o punem pe Odnoklassniki!'] },
        { spec: GROOM, x: arc.x + 0.5, z: z0, ry: Math.PI },
        { spec: PHOTO, x: arc.x + 0.3, z: z0 - 4.6, ry: 0, state: 'phone', say: ['Mai aproape! Și acum sărutul!', 'Stați, că n-am prins Arcul!', 'Încă una, pentru nași!'] },
        { spec: null, x: arc.x - 2.8, z: z0 - 0.8, ry: Math.PI - 0.5 },
        { spec: null, x: arc.x + 3.0, z: z0 - 0.6, ry: Math.PI + 0.5, anim: 'cheer' },
      ] })
    }
    // market vendors behind every second stall
    w.stalls.forEach((s, i) => { if (i % 2 === 0) this.spots.push({ x: s.x, z: s.z, list: [{ spec: rnd() < 0.5 ? CAST.vanzatoare : null, x: s.x + (rnd() - 0.5), z: s.z - 3.5, ry: 0, state: rnd() < 0.5 ? 'talk' : 'idle', voice: 'female', say: ['Roșii de Moldova, nu din Turcia!', 'Hai, că dau ieftin! Azi-dimineață culese!', 'Cântarul e cinstit, maică, zău!'] }] }) })
    // old men playing cards in the Grădina Publică
    const al = w.places.aleea_clasicilor
    if (al) this.spots.push({ x: al.x, z: al.z, list: [0, 1, 2, 3].map((k) => { const a = k / 4 * Math.PI * 2; return { spec: OLDMAN([0x4a4a3a, 0x3a4a5a, 0x5a4a3a, 0x3a3a3a][k]), x: al.x - 6 + Math.cos(a) * 0.9, z: al.z + 4 + Math.sin(a) * 0.9, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), state: 'squat', say: k === 0 ? ['Iar ai trișat, Vasile!', 'Asul de treflă! Hai, dă banii!', 'Pe vremea lui Brejnev jucam pe mașini.'] : null } }) })
  }

  spawn(spot) {
    const g = this.game
    spot.npcs = spot.list.map((d) => {
      const s = d.spec || randomCivilian(Math.random)
      const n = new NPC(g, s, { x: d.x, y: g.physics.groundHeight(d.x, d.z, 3), z: d.z, ry: d.ry, personality: 'normal', voice: { pitch: 0.9 + Math.random() * 0.4, type: d.voice || (s.bottom?.style === 'skirt' || s.bottom?.style === 'dress' ? 'female' : 'male') }, walkSpeed: 1.2 })
      n.state = d.state || 'idle'
      n.ambient = d
      n.home.ry = d.ry
      if (d.anim) n.char.anim.play(d.anim)
      this.npcs.push(n)
      return n
    })
  }

  despawn(spot) {
    for (const n of spot.npcs) { const i = this.npcs.indexOf(n); if (i >= 0) this.npcs.splice(i, 1); n.dispose() }
    spot.npcs = null
  }

  fixedUpdate(h) { for (const n of this.npcs) n.fixedUpdate(h) }

  update(dt) {
    const g = this.game
    for (const n of this.npcs) n.update(dt)
    this.t -= dt
    if (this.t > 0) return
    this.t = 0.8
    const P = g.focus()
    for (const s of this.spots) {
      const d = Math.hypot(s.x - P.x, s.z - P.z)
      if (!s.npcs && d < 75) this.spawn(s)
      else if (s.npcs && d > 105) this.despawn(s)
    }
    // a line now and then from someone nearby
    const pp = g.player?.pos
    if (pp && Math.random() < 0.25) {
      const near = this.npcs.filter((n) => n.ambient?.say && !n.char.ko && Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 16)
      const n = near[Math.floor(Math.random() * near.length)]
      if (n && Math.random() < 0.35) n.say(n.ambient.say[Math.floor(Math.random() * n.ambient.say.length)], 3)
    }
  }
}
