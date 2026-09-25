import { KIOSK_MENU, SHOP_MENU } from '../data/shops.js'

// Context-sensitive "E" interactions: story NPCs, kiosks, shops, vehicles, custom triggers.
export class Interaction {
  constructor(game) {
    this.game = game
    this.items = new Map() // id -> { id, x, z, r, label, enabled(), onInteract(), priority }
    this.current = null
    this.busy = false
  }

  add(item) { this.items.set(item.id, { r: 2.2, priority: 0, enabled: () => true, ...item }); return item.id }
  remove(id) { this.items.delete(id) }

  registerWorld() {
    const w = this.game.world
    w.kiosks.forEach((k, i) => {
      const menu = KIOSK_MENU[k.label]
      if (!menu) return
      const fx = k.x + Math.sin(k.ry) * 1.8, fz = k.z + Math.cos(k.ry) * 1.8
      this.add({ id: 'kiosk' + i, x: fx, z: fz, r: 2.4, label: `Cumpără de la chioșc „${k.label}"`, onInteract: () => this.shop(k.label, menu) })
    })
    w.shops.forEach((s, i) => {
      const menu = SHOP_MENU[s.label]
      if (!menu) return
      this.add({ id: 'shop' + i, x: s.x, z: s.z, r: 2.6, label: `Intră la „${s.label}"`, onInteract: () => this.shop(s.label, menu) })
    })
    const lin = w.places.linella
    if (lin) this.add({ id: 'linella', x: lin.x, z: lin.z, r: 4, label: 'Intră în Linella', onInteract: () => this.shop('LINELLA', SHOP_MENU.LINELLA) })
  }

  async shop(name, menu) {
    const g = this.game, pr = g.progress
    const cost = (it) => pr.price(it.price || 0)
    const choices = menu.items.map((it) => ({ text: it.name, cost: it.price ? cost(it) + ' lei' : 'gratis', disabled: pr.lei < cost(it) }))
    choices.push({ text: 'Nimic, mersi.' })
    const i = await g.ui.dialogue({ name: menu.seller || name, role: name }, [menu.greet || 'Ce doriți?'], { choices, portrait: false })
    const it = menu.items[i]
    if (!it) return
    if (it.price && !pr.spend(cost(it))) return
    if (it.food) pr.feed(it.food)
    if (it.hp) pr.heal(it.hp)
    if (it.stamina) g.player.stamina = 1
    if (it.action) await it.action(g)
    g.audio?.sfx(it.food ? 'pickup' : 'cash', { bus: 'ui' })
    if (it.say) g.ui.notify(it.say, 3.5, 'gold')
    g.events.emit('shop:buy', { shop: name, item: it })
  }

  update(dt = 1 / 60) {
    const g = this.game, p = g.player
    if (!p || g.state !== 'play' || g.ui.modalOpen || g.paused || !p.control || g.cutscene) { g.ui.prompt(null); this.current = null; this.holdT = 0; return }
    if (p.vehicle) {
      const v = p.vehicle
      g.ui.prompt(p.passenger ? null : Math.abs(v.speed) < 8 ? 'Coboară din mașină' : 'Sari din mașină')
      return
    }
    let best = null, bs = 1e9
    for (const it of this.items.values()) {
      if (!it.enabled()) continue
      const x = typeof it.x === 'function' ? it.x() : it.x, z = typeof it.z === 'function' ? it.z() : it.z
      const d = Math.hypot(x - p.pos.x, z - p.pos.z)
      if (d > it.r) continue
      const score = d - (it.priority || 0) * 10
      if (score < bs) { bs = score; best = it }
    }
    let veh = null
    // just stepped out: don't offer the same car straight back for a moment
    const justOut = performance.now() - (g.vehicles.exitedAt || -1e9) < 450
    if (!best && !justOut) veh = g.vehicles.nearestEnterable(p.pos.x, p.pos.z, 1.6)
    if (best !== this.current?.item) this.holdT = 0
    this.current = best ? { item: best, onInteract: best.onInteract } : veh ? { vehicle: veh } : null
    const label = best ? (typeof best.label === 'function' ? best.label() : best.label) : null
    // hold-to-use items (filling potholes, taking photos…)
    if (best && best.hold) {
      if (g.input.act('interact') && !this.busy) {
        this.holdT = (this.holdT || 0) + dt
        g.ui.prompt(`${label} · ${Math.min(100, Math.round(this.holdT / best.hold * 100))}%`)
        if (this.holdT >= best.hold) {
          this.holdT = 0
          this.busy = true
          Promise.resolve(best.onInteract()).finally(() => { this.busy = false })
        }
      } else { this.holdT = 0; g.ui.prompt(label) }
      return
    }
    if (best) g.ui.prompt(label)
    else if (veh) g.ui.prompt(veh.driver && veh.driver !== 'player' ? `Fură mașina (${veh.def.name})` : `Urcă în ${veh.def.name}`)
    else g.ui.prompt(null)
    if (g.input.pressed('interact') && !this.busy && !p.char.ko) {
      const cur = this.current
      if (!cur) return
      g.input.consume('interact')
      if (cur.vehicle) { g.vehicles.enter(cur.vehicle); if (cur.vehicle.driver === 'player') g.progress.stats.cars++; return }
      // a press only blocks E for a beat: whatever it opened (dialogue, shop) guards itself with
      // modalOpen, and a mission it started can run for minutes while E must keep working
      this.busy = true
      setTimeout(() => { this.busy = false }, 250)
      try { Promise.resolve(cur.onInteract()).catch((e) => console.error(e)) } catch (e) { console.error(e) }
    }
  }
}
