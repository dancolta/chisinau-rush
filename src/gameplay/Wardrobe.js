import * as THREE from 'three'
import { CLOTHES, SHOPS, BRANDS, SLOTS, SLOT_NAMES, NONE, ownItems, composeSpec, lookText } from '../data/wardrobe.js'
import { WEAPONS } from '../data/weapons.js'
import { CAST } from '../data/outfits.js'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { CURB_H } from '../world/CityLayout.js'
import { openListPanel } from '../ui/ListPanel.js'

// Clothes: what you wear (it shows, and the street reads it), trying things on in the shops
// with the camera in close, and the șifonier at home. Shops: Nicu's stall at Piața Centrală,
// the "Moda de Milano" boutiques and the "Second Hand" shops around town.

const NICU = { ...CAST.patan, top: { style: 'jacket', color: 0x2a2a30, shirt: 0x8a1a1a }, bottom: { color: 0x2a3548 }, hat: { style: 'kepka', color: 0x3a3a3a }, hold: null, chain: true, goldTooth: true }
const NICU_SPEAKER = { id: 'nicu', name: 'Nicu', role: 'Taraba de haine, Piața Centrală', spec: NICU, voice: { pitch: 0.95, type: 'male' } }
const NICU_SAYS = ['Abibas original! Doar azi, doar pentru tine!', 'Treninguri! Dungile-s incluse în preț!', 'Aur de Istanbul! Cel mai bun aur din Istanbul!', 'Ochelari Rey-Ban! Vezi lumea mai frumoasă, garantat!']
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export class Wardrobe {
  constructor(game) {
    this.game = game
    this.spots = []       // where clothes are sold (minimap, tests)
    this.busy = false
    this.registerShops()
  }

  // ---- what you wear -----------------------------------------------------------------------------
  spec(outfit = this.game.progress.outfit) { return composeSpec(this.game.progress.type, outfit) }
  apply(outfit) { this.game.player?.setLook(this.spec(outfit)) }
  owns(id) { return id.startsWith('own_') || id.startsWith('none_') || this.game.progress.clothes.includes(id) }

  wear(item) {
    const g = this.game
    g.progress.setOutfit({ [item.slot]: item.id })
    this.apply()
    g.events.emit('outfit', item)
  }

  buy(item) {
    const g = this.game, pr = g.progress
    if (this.owns(item.id)) return true
    const price = pr.price(item.price)
    if (!pr.spend(price)) return false
    pr.clothes.push(item.id)
    g.audio?.sfx('cash', { bus: 'ui' })
    return true
  }

  // ---- shops -------------------------------------------------------------------------------------
  registerShops() {
    const g = this.game, w = g.world
    w.shops.forEach((s, i) => {
      const kind = s.label === 'MODA DE MILANO' ? 'milano' : s.label === 'SECOND HAND' ? 'second' : null
      if (!kind) return
      this.spots.push({ kind, x: s.x, z: s.z, ry: s.ry })
      g.interaction.add({ id: 'clothes' + i, x: s.x, z: s.z, r: 2.6, label: `Intră la „${SHOPS[kind].name}"`, onInteract: () => this.openShop(kind, s.ry) })
    })
    // Nicu's stall: the empty stall nearest the middle of the market
    const piata = w.places.piata
    let st = null, bd = 1e9
    w.stalls.forEach((s, i) => { if (i % 2 === 1 && piata) { const d = Math.hypot(s.x - piata.x, s.z - piata.z); if (d < bd) { bd = d; st = s } } })
    if (!st) return
    this.stall = st
    this.buildStall(st)
    this.spots.push({ kind: 'piata', x: st.x, z: st.z, ry: 0 })
    g.interaction.add({ id: 'clothes_piata', x: st.x, z: st.z, r: 2.4, label: 'Taraba lui Nicu: haine „de firmă" și altele', onInteract: () => this.stallMenu() })
    g.ambient?.spots.push({ x: st.x, z: st.z - 3.4, hours: [7, 19], covered: true, archetype: 'vendor',
      list: [{ spec: NICU, x: st.x + 0.4, z: st.z - 3.4, ry: 0, state: 'idle', noTalk: true, voice: 'male', say: NICU_SAYS }] })
  }

  // tracksuits on hangers along the back of the stall, and a hand-painted sign
  buildStall(st) {
    const g = new GeoBuilder()
    const x = st.x, zc = st.z - 1.8, y = CURB_H
    const zb = zc - 1.05
    g.box(4.2, 0.05, 0.05, { x, y: y + 2.12, z: zb, color: 0x6a6a6a })
    const cols = [0x14161c, 0x1c2a5a, 0x6a1a1a, 0x24402a, 0x34343c]
    cols.forEach((c, i) => {
      const hx = x - 1.7 + i * 0.85
      g.box(0.02, 0.12, 0.02, { x: hx, y: y + 2.0, z: zb, color: 0x9a9a9a })
      g.box(0.56, 0.66, 0.05, { x: hx, y: y + 1.34, z: zb, color: c })
      for (const s of [-1, 1]) g.box(0.03, 0.66, 0.055, { x: hx + s * 0.2, y: y + 1.34, z: zb, color: 0xf2f2f2 })
      g.box(0.18, 0.4, 0.05, { x: hx - 0.37, y: y + 1.6, z: zb, rz: -0.5, color: c })
      g.box(0.18, 0.4, 0.05, { x: hx + 0.37, y: y + 1.6, z: zb, rz: 0.5, color: c })
    })
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
    mesh.castShadow = true
    this.game.scene.add(mesh)
    // the sign
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112
    const c = cv.getContext('2d')
    c.fillStyle = '#f4e7c4'; c.fillRect(0, 0, 512, 112)
    c.strokeStyle = '#8a1a1a'; c.lineWidth = 6; c.strokeRect(4, 4, 504, 104)
    c.fillStyle = '#8a1a1a'; c.font = 'bold 50px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('HAINE DE FIRMĂ*', 256, 50)
    c.font = '20px Rubik, sans-serif'; c.fillStyle = '#3a2a1a'; c.fillText('*aproape originale · ABIBAS · NAIK · PUMBA', 256, 92)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    sign.position.set(x, y + 2.9, zc + 1.25)
    this.game.scene.add(sign)
  }

  async stallMenu() {
    const g = this.game, pr = g.progress
    const choices = [{ text: '👕 Hainele „de firmă"', go: true }]
    for (const k of ['tigaie', 'umbrela', 'pistol']) {
      if (pr.weapons.includes(k)) continue
      const w = WEAPONS[k], price = pr.price(w.price)
      choices.push({ text: `${w.icon} ${w.name}`, cost: `${price} lei`, disabled: pr.lei < price, k, price })
    }
    choices.push({ text: 'Nimic, mersi.' })
    const i = await g.ui.dialogue(NICU_SPEAKER, [pick([SHOPS.piata.greet, 'Ce cauți, frate? Am de toate. Și ce n-am, aduc până mâine.', 'Tigăi, umbrele, pistoale cu apă… Și haine, frate. Haine de firmă!'])], { choices })
    const c = choices[i]
    if (c?.go) await this.openShop('piata', 0)
    else if (c?.k) g.gear.buy(c.k, c.price)
  }

  openShop(kind, faceYaw) {
    const s = SHOPS[kind]
    this.game.ui.subtitle(kind === 'piata' ? 'Nicu' : kind === 'milano' ? 'Vânzătoarea' : 'Vânzătorul', s.greet, 4)
    return this.tryOn({ title: s.name, sub: s.sub, mode: 'shop', shop: kind, faceYaw })
  }

  openWardrobe(faceYaw) {
    return this.tryOn({ title: 'Șifonierul', sub: 'Hainele tale · Blocul 7, ap. 43', mode: 'wardrobe', faceYaw })
  }

  // ---- the fitting: panel on the right, the hero in close-up on the left ------------------------------
  async tryOn({ title, sub, mode, shop = null, faceYaw = null }) {
    const g = this.game, p = g.player, pr = g.progress
    if (this.busy || p.vehicle) return
    this.busy = true
    if (faceYaw != null) { p.char.heading = faceYaw; p.char.prevHeading = faceYaw }
    p.vel.set(0, 0, 0)
    this.closeup(true)
    const slots = mode === 'shop' ? SLOTS.filter((s) => CLOTHES.some((c) => c.shop === shop && c.slot === s)) : SLOTS
    try {
      await openListPanel(g, {
        title, sub,
        tabs: slots.map((s) => ({ key: s, label: SLOT_NAMES[s] })),
        items: (slot) => this.listFor(mode, shop, slot),
        onFocus: (it) => this.apply({ ...pr.outfit, [it.slot]: it.id }),
        onPick: (it) => this.pickItem(it),
        onTurn: (dir, dt) => { p.char.heading += dir * 2.4 * dt; p.char.prevHeading = p.char.heading },
      })
    } finally {
      this.apply()
      this.closeup(false)
      this.busy = false
    }
  }

  listFor(mode, shop, slot) {
    const pr = this.game.progress
    const worn = pr.outfit[slot]
    const list = mode === 'shop'
      ? CLOTHES.filter((c) => c.shop === shop && c.slot === slot)
      : [...ownItems(pr.type).filter((c) => c.slot === slot), ...(NONE[slot] ? [NONE[slot]] : []), ...CLOTHES.filter((c) => c.slot === slot && pr.clothes.includes(c.id))]
    return list.map((c) => {
      const owned = this.owns(c.id), isWorn = worn === c.id
      const price = pr.price(c.price)
      const broke = !owned && pr.lei < price
      const meta = [lookText(c.look || {}), isWorn ? '{g}îmbrăcat{/g}' : owned ? 'al tău' : `{y}${price} lei{/y}`].filter(Boolean).join(' · ')
      return {
        id: c.id, slot: c.slot, item: c, brand: BRANDS[c.brand] || BRANDS.anon, name: c.name, meta, note: c.note,
        state: isWorn ? 'worn' : owned ? 'owned' : broke ? 'locked' : '',
        action: isWorn ? 'Îl porți.' : owned ? 'Enter: îmbracă' : broke ? `N-ajung banii: ${price} lei` : `Enter: cumpără și îmbracă · ${price} lei`,
      }
    })
  }

  pickItem(it) {
    const g = this.game, c = it.item
    if (!this.owns(c.id)) {
      if (!this.buy(c)) { g.audio?.sfx('error', { bus: 'ui' }); g.ui.notify('N-ajung banii.', 1.6, 'red'); return false }
      g.ui.notify(`🛍️ ${BRANDS[c.brand]?.name || ''} · ${c.name}. Al tău.`, 2.6, 'gold')
    }
    this.wear(c)
    g.audio?.sfx('confirm', { bus: 'ui' })
    return true
  }

  // the camera in front of the hero, the hero a little left of centre (the panel is on the right)
  closeup(on) {
    const g = this.game, rig = g.cameraRig, p = g.player
    if (!on) { rig.endShot(!g.home?.inside); return }
    const h = p.char.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h)
    const { x, y, z } = p.pos
    const c = g.camera.position
    rig.shot({ from: [c.x, c.y, c.z], to: [x + fx * 3.4 + lx * 0.3, y + 1.5, z + fz * 3.4 + lz * 0.3], lookFrom: [x, y + 1.3, z], lookTo: [x + lx * 0.65, y + 0.95, z + lz * 0.65], dur: 0.7, ease: 'out' })
  }

  // clothes shops nearby on the minimap
  blips() {
    const p = this.game.player, P = p.vehicle ? p.vehicle.pos : p.pos
    return this.spots.filter((s) => Math.hypot(s.x - P.x, s.z - P.z) < 90).map((s) => ({ kind: 'icon', x: s.x, z: s.z, icon: '👕' }))
  }
}
