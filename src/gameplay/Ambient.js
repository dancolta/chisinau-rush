import { CAST, randomCivilian } from '../data/outfits.js'
import { NPC } from '../entities/NPC.js'
import { mulberry } from '../world/rng.js'
import { blockAt } from '../world/CityLayout.js'

// Static little scenes that make the city feel lived in, spawned only near the player:
// people on benches, a wedding photo shoot at the Arc, market vendors, card players.
const BRIDE = { ...CAST.vanzatoare, top: { style: 'shirt', color: 0xfbfaf4 }, bottom: { style: 'dress', color: 0xfbfaf4, long: true }, hair: { style: 'bun', color: 0x5a3a22 }, stockings: 0xf2e6da, shoes: 0xf2f2f2 }
const GROOM = { ...CAST.agent, top: { style: 'suit', color: 0x15171d, shirt: 0xffffff, tie: 0xe8e8e8 }, bottom: { color: 0x15171d }, sunglasses: false, hold: undefined }
const PHOTO = { ...CAST.plecat, sunglasses: false, hold: 'phone', top: { style: 'shirt', color: 0x3a3a44 } }
const OLDMAN = (c) => ({ ...CAST.vatman, top: { style: 'jacket', color: c, shirt: 0xd9c9a8 }, hat: { style: 'kepka', color: 0x3a3a3a } })
// tracksuits of the courtyard: three stripes, any colour as long as it's dark
const TRACK = [0x1c2a5a, 0x14161c, 0x6a1a1a, 0x24402a, 0x34343c, 0x1a3a6a, 0x4a2a5a]
const GOPNIK = (k, c) => { const b = CAST['gopnik' + (1 + (k % 3))]; return { ...b, top: { ...b.top, color: c }, bottom: { ...b.bottom, color: k % 2 ? c : 0x14161c } } }

export class Ambient {
  constructor(game) {
    this.game = game
    this.npcs = []
    this.spots = []
    this.t = 0
    const w = game.world, rnd = mulberry(4242)
    // people on benches (never on Tanti Zina's); the grannies among them have opinions
    const used = new Set()
    for (const b of w.benches) {
      if (b.special || rnd() > 0.3) continue
      used.add(b)
      const off = 0.45
      const granny = rnd() < 0.4
      this.spots.push({ x: b.x, z: b.z, hours: [7, 22], list: [{ spec: granny ? { ...CAST.zina, top: { style: 'coat', color: [0x4a5a7a, 0x6a3a4a, 0x3a5a4a][Math.floor(rnd() * 3)], lapel: 0x2a2a30 } } : null, x: b.x + Math.sin(b.ry) * off, z: b.z + Math.cos(b.ry) * off, ry: b.ry + Math.PI, state: 'sit', ...(granny ? { archetype: 'babushka', personality: 'babushka', voice: 'old' } : {}) }] })
    }
    // wedding photo shoot in front of the Arc (the Arc behind the couple, the Government across)
    const arc = w.places.arc
    if (arc) {
      const z0 = arc.z - 0.6   // just north of the arch
      this.spots.push({ x: arc.x, z: z0, hours: [10, 19], archetype: 'wedding', list: [
        { spec: BRIDE, x: arc.x - 0.5, z: z0, ry: Math.PI, voice: 'female', say: ['Mai zâmbim o dată!', 'Ține-mă de mână, nu de telefon!', 'Poza asta o punem pe Odnoklassniki!'] },
        { spec: GROOM, x: arc.x + 0.5, z: z0, ry: Math.PI },
        { spec: PHOTO, x: arc.x + 0.3, z: z0 - 4.6, ry: 0, state: 'phone', say: ['Mai aproape! Și acum sărutul!', 'Stați, că n-am prins Arcul!', 'Încă una, pentru nași!'] },
        { spec: null, x: arc.x - 2.8, z: z0 - 0.8, ry: Math.PI - 0.5 },
        { spec: null, x: arc.x + 3.0, z: z0 - 0.6, ry: Math.PI + 0.5, anim: 'cheer' },
      ] })
    }
    // market vendors behind every second stall
    w.stalls.forEach((s, i) => { if (i % 2 === 0) this.spots.push({ x: s.x, z: s.z, hours: [7, 18], covered: true, archetype: 'vendor', list: [{ spec: rnd() < 0.5 ? CAST.vanzatoare : null, x: s.x + (rnd() - 0.5), z: s.z - 3.5, ry: 0, state: rnd() < 0.5 ? 'talk' : 'idle', voice: 'female', say: ['Roșii de Moldova, nu din Turcia!', 'Hai, că dau ieftin! Azi-dimineață culese!', 'Cântarul e cinstit, maică, zău!'] }] }) })
    // old men playing cards in the Grădina Publică
    const al = w.places.aleea_clasicilor
    if (al) this.spots.push({ x: al.x, z: al.z, hours: [9, 20.5], archetype: 'cards', list: [0, 1, 2, 3].map((k) => { const a = k / 4 * Math.PI * 2; return { spec: OLDMAN([0x4a4a3a, 0x3a4a5a, 0x5a4a3a, 0x3a3a3a][k]), x: al.x - 6 + Math.cos(a) * 0.9, z: al.z + 4 + Math.sin(a) * 0.9, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), state: 'squat', say: k === 0 ? ['Iar ai trișat, Vasile!', 'Asul de treflă! Hai, dă banii!', 'Pe vremea lui Brejnev jucam pe mașini.'] : null } }) })
    this.buildHangouts(used)
  }

  // gopnik benches in the courtyards of the bloc districts, well away from Vitea's corner:
  // one on the bench, two or three on their heels in front of it, from late morning till 3 am
  buildHangouts(used) {
    const w = this.game.world, rnd = mulberry(7071)
    const gc = w.places.gopnici_curte
    const picked = []
    const yard = w.benches.filter((b) => b.yard && !used.has(b) && !b.special)
    for (const b of yard) {
      const blk = blockAt(b.x, b.z)
      if (!blk || !['soviet', 'acasa', 'garaje'].includes(blk.zone)) continue
      if (gc && Math.hypot(b.x - gc.x, b.z - gc.z) < 35) continue
      if (picked.some((h) => Math.hypot(h.x - b.x, h.z - b.z) < 70)) continue
      picked.push(b)
      if (picked.length >= 9) break
    }
    picked.forEach((b, k) => {
      const sx = Math.sin(b.ry), sz = Math.cos(b.ry)          // toward the seat
      const lx = Math.cos(b.ry), lz = -Math.sin(b.ry)         // along the bench
      const n = 3 + (rnd() < 0.4 ? 1 : 0)
      const list = [{ x: b.x + sx * 0.45, z: b.z + sz * 0.45, ry: b.ry + Math.PI, state: 'sit' }]
      for (let i = 1; i < n; i++) {
        const side = (i - (n - 1) / 2 - 0.5) * 1.1
        const x = b.x - sx * (1.5 + rnd() * 0.3) + lx * side, z = b.z - sz * (1.5 + rnd() * 0.3) + lz * side
        list.push({ x, z, ry: Math.atan2(b.x - x, b.z - z), state: i === n - 1 && rnd() < 0.5 ? 'phone' : 'squat' })
      }
      for (let i = 0; i < list.length; i++) Object.assign(list[i], { spec: GOPNIK(k + i, TRACK[Math.floor(rnd() * TRACK.length)]), archetype: 'gopnik', personality: 'tough', voice: 'gruff', pitch: 0.8 + rnd() * 0.35 })
      this.spots.push({ x: b.x, z: b.z, hours: [10, 27], archetype: 'gopnik', group: 'hang' + k, list })
    })
    this.hangouts = picked.length
  }

  spawn(spot) {
    const g = this.game
    spot.npcs = spot.list.map((d) => {
      const s = d.spec || randomCivilian(Math.random)
      const n = new NPC(g, s, { x: d.x, y: g.physics.groundHeight(d.x, d.z, 3), z: d.z, ry: d.ry, personality: d.personality || 'normal', voice: { pitch: d.pitch || 0.9 + Math.random() * 0.4, type: d.voice || (s.bottom?.style === 'skirt' || s.bottom?.style === 'dress' ? 'female' : 'male') }, walkSpeed: 1.2 })
      n.state = d.state || 'idle'
      n.ambient = d
      n.spot = spot
      n.archetype = d.archetype || spot.archetype || 'civilian'
      n.noTalk = !!d.noTalk
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
    // scenes keep their hours and go indoors when it pours (market stalls have roofs);
    // they pack up only once you're not right next to them
    const hr = g.renderer.tod.hour, wet = (g.weather?.k || 0) > 0.35
    // opening hours may run past midnight ([10, 27] = 10:00 to 03:00)
    const open = (s) => { const h = hr < s.hours[0] ? hr + 24 : hr; return h >= s.hours[0] && h < s.hours[1] && (!wet || s.covered) }
    for (const s of this.spots) {
      const d = Math.hypot(s.x - P.x, s.z - P.z)
      if (!s.npcs && d < 75 && open(s)) this.spawn(s)
      // a granny waiting for her bread, or a bench mid-fight, stays put
      else if (s.npcs && !s.keep && !s.npcs.some((n) => n.fightMemo) && (d > 105 || (d > 40 && !open(s)))) this.despawn(s)
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
