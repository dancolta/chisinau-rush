import { NPC, BUMPED, pickLine } from '../entities/NPC.js'
import { buildCharacter } from '../entities/CharacterModel.js'
import { BLOCKS, H_ROADS, V_ROADS, block } from '../world/CityLayout.js'
import { randomCivilian, CAST } from '../data/outfits.js'
import { hourly } from '../render/TimeOfDay.js'

// share of the quality's people out on the street by the hour: the morning and evening rush,
// lunch, the long summer evening; after midnight it's taxis, night shifts and gopniks
const PEOPLE_BY_HOUR = [[0, 0.36], [4, 0.28], [6, 0.55], [7.5, 1], [9.5, 0.85], [12.5, 0.95], [15, 0.85], [17.5, 1], [20, 0.9], [21.5, 0.68], [23, 0.45], [24, 0.36]]
// where people appear: never closer than SPAWN_R0, never in plain view closer than VIEW_R
// (round a corner or behind a block is fine). They go once out of sight beyond GONE_R, or
// beyond FAR_R whatever (a speck under the haze isn't worth a slot the street near you needs)
const SPAWN_R0 = 24, SPAWN_R1 = 78, VIEW_R = 62, GONE_R = 96, FAR_R = 135
// people further off than this cast no shadow: at that size it's a smudge, and a draw call each
const SHADOW_R = 45
// spare bodies kept for new faces, per kind (a body takes longer to build than anything else a
// new passer-by needs)
const POOL_MAX = 14

// a kid from the blocks: short legs, a grown-up's head, a backpack half the time
function kidSpec() {
  const s = randomCivilian()
  const girl = s.bottom?.style === 'skirt' || s.bottom?.style === 'dress' || ['long', 'ponytail', 'bun'].includes(s.hair?.style)
  Object.assign(s, { height: 0.6 + Math.random() * 0.1, width: 0.8, belly: 0, headScale: 1.04 })
  for (const k of ['mustache', 'beard', 'glasses', 'sunglasses', 'hold', 'bag']) delete s[k]
  if (s.hat?.style === 'basma' || s.hat?.style === 'kepka') delete s.hat
  if (s.hair?.style === 'bald') s.hair.style = 'short'
  if (s.hair) s.hair.color = [0x2a1c12, 0x5a3a22, 0x7a5a3a, 0xc8a060][Math.floor(Math.random() * 4)]
  if (s.top?.style === 'suit' || s.top?.style === 'coat') s.top = { style: 'jacket', color: [0xc8102e, 0x2a5aa8, 0x3a8a3a, 0xe6b84a][Math.floor(Math.random() * 4)], shirt: 0xf2f2f2 }
  if (Math.random() < 0.5) s.backpack = [0xc8102e, 0x2a5aa8, 0xe6b84a, 0x8a3ab8][Math.floor(Math.random() * 4)]
  if (girl) s.stockings = 0xe8d8c8
  return s
}
export { kidSpec }

// Footpaths through the parks and across PMAN, laid out from the numbers the landmarks are built
// with (Landmarks.js): a ring round the fountain or the lake and alleys out to the pavement.
// An end that lies on a block's pavement line becomes a gate in it, so the walks join the streets
function parkPaths(world) {
  const out = []
  const zone = (z) => BLOCKS.find((b) => b.zone === z)
  const ring = (cx, cz, r, n) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return [cx + Math.sin(a) * r, cz - Math.cos(a) * r] })
  const fountain = (x, z) => world.fountains?.find((f) => Math.hypot(f.x - x, f.z - z) < 3) || { x, z }
  // Grădina Publică: round the fountain outside its benches, out along the four alleys (the
  // north one a step off the axis, clear of the card players and the busts of Aleea Clasicilor)
  let b = zone('gradina')
  if (b) {
    const F = fountain(b.cx, b.cz + 4), R = 17, nx = F.x - 2.2
    const r = ring(F.x, F.z, R, 12)
    r[0] = [nx, F.z - Math.sqrt(R * R - 2.2 * 2.2)]
    out.push({ b, pts: r, loop: true })
    out.push({ b, pts: [[b.x0 + b.roads.w.sw / 2, F.z], r[9]] })
    out.push({ b, pts: [r[3], [b.x1 - b.roads.e.sw / 2, F.z]] })
    out.push({ b, pts: [[nx, b.z0 + b.roads.n.sw / 2], r[0]] })
    out.push({ b, pts: [r[6], [F.x, b.z1 - b.roads.s.sw / 2]] })
  }
  // Parcul Valea Trandafirilor: round the lake between the benches and the roses; the east and
  // west alleys a step off the lake's axis, past the rose beds that sit on it
  b = zone('romasca')
  if (b) {
    const L = fountain(b.cx - 14, b.cz + 6), R = 21, off = 1.3, s = Math.sqrt(R * R - off * off)
    const r = ring(L.x, L.z, R, 16)
    r[4] = [L.x + s, L.z - off]; r[12] = [L.x - s, L.z - off]
    out.push({ b, pts: r, loop: true })
    out.push({ b, pts: [[b.x0 + b.roads.w.sw / 2, L.z - off], r[12]] })
    out.push({ b, pts: [r[4], [b.x1 - b.roads.e.sw / 2, L.z - off]] })
    out.push({ b, pts: [[L.x, b.z0 + b.roads.n.sw / 2], r[0]] })
    out.push({ b, pts: [r[8], [L.x, b.z1 - b.roads.s.sw / 2]] })
  }
  // Parcul Catedralei: two avenues either side of the Arc and the bell tower, the paved cross
  // path (on the far side of its benches), round the cathedral and out to Eminescu
  b = zone('catedrala')
  if (b) {
    const ax = (b.x0 + b.x1) / 2, n = b.z0 + b.roads.n.sw / 2, s = b.z1 - b.roads.s.sw / 2, cz = 70.5, back = 116
    out.push({ b, pts: [[ax - 11, n], [ax - 11, cz]] })
    out.push({ b, pts: [[ax + 11, n], [ax + 11, cz]] })
    out.push({ b, pts: [[b.x0 + b.roads.w.sw / 2, cz], [ax - 23, cz], [ax - 11, cz], [ax + 11, cz], [ax + 23, cz], [b.x1 - b.roads.e.sw / 2, cz]] })
    out.push({ b, pts: [[ax - 23, cz], [ax - 23, back], [ax, back], [ax + 23, back], [ax + 23, cz]] })
    out.push({ b, pts: [[ax, back], [ax, s]] })
  }
  // PMAN: a loose grid across the square (clear of the tribune and the flagpole), in from the
  // boulevard
  b = zone('guvern')
  if (b) {
    const pz0 = b.iz0 + 32.5, pz1 = b.iz1, xs = [-33, -11, 11, 33], zs = [pz1 - 9, (pz0 + pz1) / 2 + 1.25, pz0 + 15.5]
    for (const z of zs) out.push({ b, pts: xs.map((x) => [x, z]) })
    for (const x of xs) out.push({ b, pts: [[x, b.z1 - b.roads.s.sw / 2], ...zs.map((z) => [x, z])] })
  }
  return out
}

// which pavement line of block b the point (x, z) lies on, if any
function sideOf(b, x, z) {
  const { w, e, n, s } = b.roads
  const on = (a, c) => Math.abs(a - c) < 0.3
  if (on(z, b.z0 + n.sw / 2) && x > b.x0 && x < b.x1) return 'n'
  if (on(z, b.z1 - s.sw / 2) && x > b.x0 && x < b.x1) return 's'
  if (on(x, b.x0 + w.sw / 2) && z > b.z0 && z < b.z1) return 'w'
  if (on(x, b.x1 - e.sw / 2) && z > b.z0 && z < b.z1) return 'e'
  return null
}

// Sidewalk graph + ambient crowd management + car/pedestrian collisions.
export class Pedestrians {
  constructor(game) {
    this.game = game
    this.list = []
    // a ceiling scripts may lower; how many people there really are comes from budget()
    this.target = 90
    this.spawnT = 0
    this.cullT = 0
    this.pool = { civ: [], gop: [], kid: [] }
    this.buildGraph()
    game.events.on('npc:hit', ({ npc, attacker }) => this.panic(npc.pos, attacker, 14))
    game.events.on('crime', (c) => { if (c.type === 'carjack' || c.type === 'assault') this.panic({ x: c.x, z: c.z }, game.player, 16) })
  }

  // nodes = sidewalk corners of every block; edges = along block sides (split where a park alley
  // comes out), through the parks, and across zebra crossings. The park paths' points live apart
  // in parkNodes: this.nodes stays the corners alone, as the lost dossiers, the police backup and
  // the street events pick their spots from it (and a save remembers dossiers by those spots)
  buildGraph() {
    this.nodes = []
    this.parkNodes = []
    this.sides = []            // the walkable stretches (not the crossings): where people appear
    const corner = new Map()
    const gates = new Map()   // `${block id}:${side}` -> gate nodes
    const P = this.parkNodes
    for (const p of parkPaths(this.game.world)) {
      const pts = p.pts.map(([x, z]) => {
        let n = P.find((q) => Math.abs(q.x - x) < 0.5 && Math.abs(q.z - z) < 0.5)
        if (!n) { n = { id: 'p' + P.length, x, z, links: [], block: p.b, park: true }; P.push(n) }
        const side = sideOf(p.b, x, z)
        if (side) {
          n.gate = side
          const k = `${p.b.id}:${side}`
          if (!gates.has(k)) gates.set(k, [])
          if (!gates.get(k).includes(n)) gates.get(k).push(n)
        }
        return n
      })
      for (let i = 0; i < pts.length - 1 + (p.loop ? 1 : 0); i++) this.link(pts[i], pts[(i + 1) % pts.length], false, true)
    }
    for (const b of BLOCKS) {
      const { w, e, n, s } = b.roads
      const pts = {
        nw: { x: b.x0 + w.sw / 2, z: b.z0 + n.sw / 2 }, ne: { x: b.x1 - e.sw / 2, z: b.z0 + n.sw / 2 },
        sw: { x: b.x0 + w.sw / 2, z: b.z1 - s.sw / 2 }, se: { x: b.x1 - e.sw / 2, z: b.z1 - s.sw / 2 },
      }
      for (const [k, p] of Object.entries(pts)) { const node = { id: this.nodes.length, x: p.x, z: p.z, links: [], block: b, corner: k }; this.nodes.push(node); corner.set(`${b.id}:${k}`, node) }
      // a side of the block, corner to corner through the park gates on it (wider = busier)
      const side = (a, c, key, along, sw) => {
        const chain = [corner.get(`${b.id}:${a}`), ...(gates.get(`${b.id}:${key}`) || []), corner.get(`${b.id}:${c}`)].sort((p, q) => along(p) - along(q))
        for (let i = 0; i < chain.length - 1; i++) this.link(chain[i], chain[i + 1], false, false, sw)
      }
      side('nw', 'ne', 'n', (q) => q.x, n.sw)
      side('ne', 'se', 'e', (q) => q.z, e.sw)
      side('sw', 'se', 's', (q) => q.x, s.sw)
      side('nw', 'sw', 'w', (q) => q.z, w.sw)
    }
    // zebra crossings between neighbouring blocks
    const cols = V_ROADS.length - 1, rows = H_ROADS.length - 1
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const b = block(c, r)
      if (c + 1 < cols) { // across the vertical road to the east
        const e = block(c + 1, r)
        this.link(corner.get(`${b.id}:ne`), corner.get(`${e.id}:nw`), true)
        this.link(corner.get(`${b.id}:se`), corner.get(`${e.id}:sw`), true)
      }
      if (r + 1 < rows) { // across the horizontal road to the south
        const s = block(c, r + 1)
        this.link(corner.get(`${b.id}:sw`), corner.get(`${s.id}:nw`), true)
        this.link(corner.get(`${b.id}:se`), corner.get(`${s.id}:ne`), true)
      }
    }
  }

  // sw: the pavement's width, which sets how busy it is (the boulevard's 8 m are the busiest;
  // the blocks of flats are a little quieter than the centre, a park path quieter still)
  link(a, b, crossing, park = false, sw = 0) {
    a.links.push({ to: b, crossing, park })
    b.links.push({ to: a, crossing, park })
    if (crossing) return
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const zone = (a.block || b.block)?.zone
    const bloc = zone === 'soviet' || zone === 'acasa' || zone === 'garaje'
    if (len > 0.5) this.sides.push({ a, b, len, park, zone, w: park ? 0.6 : Math.min(1, sw / 8) * (bloc ? 0.85 : 1) })
  }

  nearestNode(x, z) {
    let best = null, bd = 1e12
    for (const L of [this.nodes, this.parkNodes]) for (const n of L) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n } }
    return best
  }

  // give a pedestrian a fresh random walk from where it stands
  repath(npc) {
    let n = npc.node || this.nearestNode(npc.pos.x, npc.pos.z)
    const pts = []
    let prev = npc.prevNode
    for (let i = 0; i < 4; i++) {
      const opts = n.links.filter((l) => l.to !== prev)
      const l = opts[Math.floor(Math.random() * opts.length)] || n.links[0]
      // walk along the side with a little lateral jitter so people don't share one line (less on
      // a park alley: benches and rose beds line them)
      const j = (npc.lane ??= (Math.random() - 0.5) * 1.6) * (l.park ? 0.3 : 1)
      const dx = l.to.x - n.x, dz = l.to.z - n.z, d = Math.hypot(dx, dz) || 1
      pts.push({ x: l.to.x + (-dz / d) * j, z: l.to.z + (dx / d) * j, node: l.to, crossing: l.crossing })
      prev = n; n = l.to
    }
    npc.prevNode = prev
    npc.node = n
    npc.path = pts
    npc.state = 'walk'
  }

  // ---- bodies -------------------------------------------------------------------------------
  // a spare body of this kind, if one is waiting (see remove())
  wardrobe(kind) {
    const p = this.pool[kind]
    return p && p.length ? p.pop() : null
  }

  spawn(x, z, spec = null, opts = {}) {
    // a plain passer-by (no look asked for) wears a body somebody left behind, when there is one
    let pooled = null
    if (!spec && !opts.mesh) pooled = this.wardrobe(opts.kind || 'civ')
    const s = pooled?.spec || spec || randomCivilian()
    const personality = opts.personality || (s.top?.style === 'tracksuit' ? 'tough' : s.hat?.style === 'basma' ? 'babushka' : Math.random() < 0.15 ? 'tough' : 'normal')
    const voiceType = s.hat?.style === 'basma' ? 'old' : s.bottom?.style === 'skirt' || s.bottom?.style === 'dress' || s.hair?.style === 'long' || s.hair?.style === 'ponytail' || s.hair?.style === 'bun' ? 'female' : personality === 'tough' ? 'gruff' : 'male'
    const npc = new NPC(this.game, s, { x, y: this.game.physics.groundHeight(x, z), z, personality, voice: { pitch: 0.85 + Math.random() * 0.4, type: voiceType }, ...opts, mesh: pooled?.mesh || opts.mesh })
    // who they are on the street: a tracksuit means a gopnik, a headscarf a granny
    npc.archetype = opts.archetype || (personality === 'cop' ? 'cop' : personality === 'babushka' ? 'babushka' : s.top?.style === 'tracksuit' ? 'gopnik' : 'civilian')
    // what kind of body it gives back when it leaves
    npc.kind = opts.kind || (!spec || pooled ? 'civ' : null)
    this.list.push(npc)
    return npc
  }

  remove(npc) {
    const i = this.list.indexOf(npc)
    if (i >= 0) this.list.splice(i, 1)
    this.release(npc)
  }

  // gone from the street: the body goes back to the wardrobe while there's room (nobody knocked
  // about in it: a body mid-fall keeps its pose for a frame), else to the bin
  release(npc) {
    const p = npc.kind && this.pool[npc.kind]
    if (p && p.length < POOL_MAX && !npc.disposed && !npc.char.ko) {
      npc.dispose(true)
      p.push({ spec: npc.char.spec, mesh: npc.char.mesh })
    } else npc.dispose()
  }

  // spare bodies built ahead, a few at a time, so the street can fill without a stutter
  prewarm(n = 1) {
    for (let i = 0; i < n; i++) {
      const spec = randomCivilian()
      this.pool.civ.push({ spec, mesh: buildCharacter(spec) })
    }
  }

  // how many people are out near you now: the quality's share, by the clock, fewer in the rain
  budget() {
    const g = this.game
    const wet = (g.weather?.k || 0) > 0.35
    return Math.round((g.renderer?.q?.peds ?? 44) * hourly(PEOPLE_BY_HOUR, g.renderer?.tod.hour ?? 12) * (wet ? 0.7 : 1))
  }

  // pavement stretches (and park alleys) that come within reach of p
  nearSides(px, pz) {
    const out = []
    let sum = 0
    for (const s of this.sides) {
      const abx = s.b.x - s.a.x, abz = s.b.z - s.a.z
      const t = Math.max(0, Math.min(1, ((px - s.a.x) * abx + (pz - s.a.z) * abz) / (s.len * s.len)))
      const d = Math.hypot(s.a.x + abx * t - px, s.a.z + abz * t - pz)
      if (d > SPAWN_R1) continue
      const wgt = s.len * s.w
      sum += wgt
      out.push([s, sum])
    }
    return { list: out, sum }
  }

  // somebody new on a pavement near you, walking one way or the other, where you wouldn't see
  // them appear
  spawnAmbient(px, pz) {
    const near = this.nearSides(px, pz)
    if (!near.list.length) return null
    const tr = this.game.traffic
    for (let tries = 0; tries < 10; tries++) {
      // a stretch, the longer and wider the likelier
      const r = Math.random() * near.sum
      const s = near.list.find(([, c]) => c >= r)?.[0] || near.list[near.list.length - 1][0]
      const fwd = Math.random() < 0.5
      const from = fwd ? s.a : s.b, to = fwd ? s.b : s.a
      const lane = (Math.random() - 0.5) * 1.6, j = lane * (s.park ? 0.3 : 1)
      const dx = (to.x - from.x) / s.len, dz = (to.z - from.z) / s.len, t = Math.random()
      const x = from.x + (to.x - from.x) * t - dz * j, z = from.z + (to.z - from.z) * t + dx * j
      const d = Math.hypot(x - px, z - pz)
      if (d < SPAWN_R0 || d > SPAWN_R1) continue
      if (d < VIEW_R && tr?.inSight(x, z)) continue
      if (this.list.some((q) => Math.abs(q.pos.x - x) < 1.2 && Math.abs(q.pos.z - z) < 1.2)) continue
      // district flavour: gopniks in the bloc districts, a cop on the beat in the centre
      let spec = null, opts = {}
      const bloc = s.zone === 'soviet' || s.zone === 'acasa' || s.zone === 'garaje'
      if (bloc && Math.random() < 0.2) { spec = this.wardrobe('gop'); opts = { personality: 'tough', archetype: 'gopnik', kind: 'gop', mesh: spec?.mesh }; spec = spec?.spec || CAST[['gopnik1', 'gopnik2', 'gopnik3'][Math.floor(Math.random() * 3)]] }
      else if (Math.random() < 0.07 && this.list.filter((q) => q.archetype === 'kid').length < 4) { const k = this.wardrobe('kid'); spec = k?.spec || kidSpec(); opts = { personality: 'coward', archetype: 'kid', kind: 'kid', mesh: k?.mesh, walkSpeed: 1.5, hp: 25, voice: { pitch: 1.5 + Math.random() * 0.25, type: 'female' } } }
      // (the officers on the Comisariat's door don't count against the beat)
      else if (!bloc && !s.park && Math.random() < 0.05 && !this.game.police?.level && this.list.filter((q) => q.personality === 'cop' && !q.post).length < 2) {
        spec = CAST.cop; opts = { personality: 'cop', archetype: 'cop', hp: 60, walkSpeed: 1.15, voice: { pitch: 0.85 + Math.random() * 0.2, type: 'gruff' } }
      }
      const npc = this.spawn(x, z, spec, opts)
      // on their way to the end of this stretch; from there, a walk like anybody else's
      npc.lane = lane
      npc.prevNode = from
      npc.node = to
      npc.path = [{ x: to.x - dz * j, z: to.z + dx * j, node: to }]
      npc.state = 'walk'
      return npc
    }
    return null
  }

  // pulled out of a carjacked car: lands on the ground, then flees or fights
  spawnEjected(v) {
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading)
    const x = v.pos.x + lx * 1.9, z = v.pos.z + lz * 1.9
    const npc = this.spawn(x, z)
    npc.knockDown(lx * 3, lz * 3, 1.6, 1.5)
    npc.hostile = npc.personality === 'tough'
    setTimeout(() => { if (npc.personality === 'tough') npc.say(pickLine(['Mașina mea, fraerule!', 'Stai, că te prind!', 'Bratan, ai încurcat mașina!'])); else npc.say(pickLine(['Hoțul! Mi-a furat mașina!', 'Poliția!!', 'Ajutor, mașina!'])) }, 900)
    return npc
  }

  // everyone near a violent event runs (or joins in, if they're the type); most grannies stay
  // put and give you a piece of their mind instead
  panic(pos, source, radius) {
    this.game.crowd?.scold(pos)
    for (const n of this.list) {
      if (n.state === 'knocked' || n.state === 'fight' || n.personality === 'cop' || n.crew) continue
      if (n.archetype === 'babushka' && Math.random() < 0.7) continue
      const d2 = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2
      if (d2 < radius * radius && Math.random() < 0.85) n.flee(pos)
    }
  }

  // cars hitting pedestrians (and the player on foot)
  vehicleHits() {
    const game = this.game
    for (const v of game.vehicles.list) {
      const sp = Math.abs(v.speed)
      if (sp < 2.2) continue
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading)
      const hw = v.def.dims[0] + 0.35, hl = v.def.dims[2] + 0.35
      const test = (who, isPlayer) => {
        if (who.char.ko) return
        const dx = who.pos.x - v.pos.x, dz = who.pos.z - v.pos.z
        const along = dx * fx + dz * fz, side = dx * -fz + dz * fx
        if (Math.abs(along) > hl || Math.abs(side) > hw) return
        if (Math.abs(who.pos.y - v.pos.y) > 1.5) return
        const dir = Math.sign(v.speed)
        const push = Math.min(14, sp * 0.8)
        const sideK = Math.sign(side || 1) * 0.5
        const kx = fx * dir * push + -fz * sideK * push * 0.4, kz = fz * dir * push + fx * sideK * push * 0.4
        if (isPlayer) game.combat?.playerRunOver(v, kx, kz, sp)
        else {
          who.hp -= sp * 3
          who.knockDown(kx, kz, 3 + Math.random() * 4, Math.min(6, 2 + sp * 0.25))
          game.audio?.sfx('hit_body', { at: who.pos, vol: Math.min(1, sp / 15) })
          if (v.driver === 'player') game.events.emit('crime', { type: 'runover', x: who.pos.x, z: who.pos.z, severity: sp > 12 ? 2 : 1, victim: who })
          v.speed *= 0.9
          this.panic(who.pos, v, 12)
        }
      }
      for (const n of this.list) test(n, false)
      if (game.ambient) for (const n of game.ambient.npcs) test(n, false)
      if (game.story?.npcs) for (const n of game.story.npcs) if (n.hittable) test(n, false)
      const p = game.player
      if (p && !p.vehicle && v.driver !== 'player') test(p, true)
    }
  }

  // light separation so the crowd doesn't clump / walk through the player
  separation() {
    const p = this.game.player
    const L = this.list
    for (let i = 0; i < L.length; i++) {
      const a = L[i]
      if (a.state === 'knocked') continue
      if (p && !p.vehicle) {
        const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, d2 = dx * dx + dz * dz
        if (d2 < 0.8 && d2 > 1e-4) {
          const d = Math.sqrt(d2)
          a.pushX = (a.pushX || 0) + (dx / d) * 1.2; a.pushZ = (a.pushZ || 0) + (dz / d) * 1.2
          if (p.char.speed > 4) { if (this.game.life) this.game.life.bump(a); else if (Math.random() < 0.05) a.say(pickLine(BUMPED)) }
        }
      }
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d2 = dx * dx + dz * dz
        if (d2 < 0.45 && d2 > 1e-4) {
          const d = Math.sqrt(d2), k = 0.4
          a.pushX = (a.pushX || 0) + (dx / d) * k; a.pushZ = (a.pushZ || 0) + (dz / d) * k
          b.pushX = (b.pushX || 0) - (dx / d) * k; b.pushZ = (b.pushZ || 0) - (dz / d) * k
        }
      }
    }
  }

  // who leaves: out of sight far off, or too far to matter; over the budget (night came, the
  // rain started, the quality went down) the farthest ones nobody can see. And nobody far off
  // bothers with a shadow
  cull(pos) {
    const tr = this.game.traffic
    const far = []
    for (const n of [...this.list]) {
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z)
      n.char.mesh.castShadow = d < SHADOW_R
      if (n.persistent) continue
      if (d > FAR_R || (d > GONE_R && !tr?.visible(n.pos.x, n.pos.z))) { this.remove(n); continue }
      if (d > 45) far.push([n, d])
    }
    let over = this.list.length - this.budget() - 3
    if (over <= 0) return
    far.sort((a, b) => b[1] - a[1])
    for (const [n] of far) {
      if (over <= 0) break
      if (n.persistent || n.crew || n.calling || n.debtor || n.post || tr?.visible(n.pos.x, n.pos.z)) continue
      this.remove(n); over--
    }
  }

  fixedUpdate(h) {
    for (const n of this.list) n.fixedUpdate(h)
    this.vehicleHits()
  }

  update(dt) {
    const game = this.game, p = game.player
    for (const n of this.list) n.update(dt)
    this.separation()
    if (!p) return
    const pos = this.game.focus()
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      const short = Math.min(this.target, this.budget()) - this.list.length
      const spare = this.pool.civ.length
      // with spare bodies waiting, a street that has just emptied (a cutscene took you across
      // town, you drove off) fills in a few seconds; a body built from scratch is the slow part,
      // so those come a few a second. At full strength a spare is built when the frame has time
      this.spawnT = spare ? 0.12 : 0.25
      if (short > 0) { this.spawnAmbient(pos.x, pos.z); if (short > 10 && spare > 1) this.spawnAmbient(pos.x, pos.z) }
      else if (spare < 4 && (game.rawDt || 0) < 1 / 45) this.prewarm(1)
    }
    this.cullT -= dt
    if (this.cullT <= 0) { this.cullT = 0.3; this.cull(pos) }
  }
}
