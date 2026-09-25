import { NPC, BUMPED, pickLine } from '../entities/NPC.js'
import { BLOCKS, H_ROADS, V_ROADS, block } from '../world/CityLayout.js'
import { randomCivilian, CAST } from '../data/outfits.js'

// Sidewalk graph + ambient crowd management + car/pedestrian collisions.
export class Pedestrians {
  constructor(game) {
    this.game = game
    this.list = []
    this.target = 34
    this.spawnT = 0
    this.buildGraph()
    game.events.on('npc:hit', ({ npc, attacker }) => this.panic(npc.pos, attacker, 14))
    game.events.on('crime', (c) => { if (c.type === 'carjack' || c.type === 'assault') this.panic({ x: c.x, z: c.z }, game.player, 16) })
  }

  // nodes = sidewalk corners of every block; edges = along block sides + across zebra crossings
  buildGraph() {
    this.nodes = []
    const corner = new Map()
    for (const b of BLOCKS) {
      const { w, e, n, s } = b.roads
      const pts = {
        nw: { x: b.x0 + w.sw / 2, z: b.z0 + n.sw / 2 }, ne: { x: b.x1 - e.sw / 2, z: b.z0 + n.sw / 2 },
        sw: { x: b.x0 + w.sw / 2, z: b.z1 - s.sw / 2 }, se: { x: b.x1 - e.sw / 2, z: b.z1 - s.sw / 2 },
      }
      for (const [k, p] of Object.entries(pts)) { const node = { id: this.nodes.length, x: p.x, z: p.z, links: [], block: b, corner: k }; this.nodes.push(node); corner.set(`${b.id}:${k}`, node) }
      const L = (a, c) => { const A = corner.get(`${b.id}:${a}`), C = corner.get(`${b.id}:${c}`); A.links.push({ to: C }); C.links.push({ to: A }) }
      L('nw', 'ne'); L('ne', 'se'); L('se', 'sw'); L('sw', 'nw')
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

  link(a, b, crossing) { a.links.push({ to: b, crossing }); b.links.push({ to: a, crossing }) }

  nearestNode(x, z) {
    let best = null, bd = 1e12
    for (const n of this.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n } }
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
      // walk along the side with a little lateral jitter so people don't share one line
      const j = (npc.lane ??= (Math.random() - 0.5) * 1.6)
      const dx = l.to.x - n.x, dz = l.to.z - n.z, d = Math.hypot(dx, dz) || 1
      pts.push({ x: l.to.x + (-dz / d) * j, z: l.to.z + (dx / d) * j, node: l.to, crossing: l.crossing })
      prev = n; n = l.to
    }
    npc.prevNode = prev
    npc.node = n
    npc.path = pts
    npc.state = 'walk'
  }

  spawn(x, z, spec = null, opts = {}) {
    const s = spec || randomCivilian()
    const personality = opts.personality || (s.top?.style === 'tracksuit' ? 'tough' : s.hat?.style === 'basma' ? 'babushka' : Math.random() < 0.15 ? 'tough' : 'normal')
    const voiceType = s.hat?.style === 'basma' ? 'old' : s.bottom?.style === 'skirt' || s.bottom?.style === 'dress' || s.hair?.style === 'long' || s.hair?.style === 'ponytail' || s.hair?.style === 'bun' ? 'female' : personality === 'tough' ? 'gruff' : 'male'
    const npc = new NPC(this.game, s, { x, y: this.game.physics.groundHeight(x, z), z, personality, voice: { pitch: 0.85 + Math.random() * 0.4, type: voiceType }, ...opts })
    // who they are on the street: a tracksuit means a gopnik, a headscarf a granny
    npc.archetype = opts.archetype || (personality === 'cop' ? 'cop' : personality === 'babushka' ? 'babushka' : s.top?.style === 'tracksuit' ? 'gopnik' : 'civilian')
    this.list.push(npc)
    return npc
  }

  remove(npc) {
    const i = this.list.indexOf(npc)
    if (i >= 0) this.list.splice(i, 1)
    npc.dispose()
  }

  spawnAmbient(px, pz) {
    for (let tries = 0; tries < 8; tries++) {
      const n = this.nodes[Math.floor(Math.random() * this.nodes.length)]
      const d = Math.hypot(n.x - px, n.z - pz)
      if (d < 35 || d > 95) continue
      if (this.game.traffic?.visible(n.x, n.z) && d < 70) continue
      // district flavour: gopniks in the bloc districts, a cop on the beat in the centre
      let spec = null, opts = {}
      const zone = n.block.zone
      const bloc = zone === 'soviet' || zone === 'acasa' || zone === 'garaje'
      if (bloc && Math.random() < 0.2) { spec = CAST[['gopnik1', 'gopnik2', 'gopnik3'][Math.floor(Math.random() * 3)]]; opts = { personality: 'tough', archetype: 'gopnik' } }
      else if (!bloc && Math.random() < 0.05 && !this.game.police?.level && this.list.filter((q) => q.personality === 'cop').length < 2) {
        spec = CAST.cop; opts = { personality: 'cop', archetype: 'cop', hp: 60, walkSpeed: 1.15, voice: { pitch: 0.85 + Math.random() * 0.2, type: 'gruff' } }
      }
      const npc = this.spawn(n.x + (Math.random() - 0.5) * 2, n.z + (Math.random() - 0.5) * 2, spec, opts)
      npc.node = n
      this.repath(npc)
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

  // everyone near a violent event runs (or joins in, if they're the type)
  panic(pos, source, radius) {
    for (const n of this.list) {
      if (n.state === 'knocked' || n.state === 'fight' || n.personality === 'cop') continue
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
      this.spawnT = 0.3
      if (this.list.length < this.target) this.spawnAmbient(pos.x, pos.z)
      for (const n of [...this.list]) {
        if (n.persistent) continue
        const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z)
        if (d > 115 && !game.traffic?.visible(n.pos.x, n.pos.z)) this.remove(n)
      }
    }
  }
}

