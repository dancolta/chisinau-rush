import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { WEAPONS, CARRY_MAX } from '../data/weapons.js'
import { openListPanel } from '../ui/ListPanel.js'

// Home: flat 43 in Blocul 7. Step through the stairwell door in the courtyard and you're in a
// cutaway set, the fourth wall open to the camera like a doll's house: the carpet on the wall,
// the divan (sleep, save), the lacquered șifonier (your clothes), grandpa's chest (the weapons
// you're not carrying), a fridge with mama's sarmale and a TV that only shows the news.
// The flat is built out past the hills where nobody walks by.

const R = { x: 2600, z: 2600 }
const HW = 4.5, HD = 3, H = 2.8          // half width, half depth, height
const SARMALE_EVERY = 10 * 60 * 1000     // mama restocks roughly every ten minutes (≈ ten game hours)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

// ---- textures: the look of every flat in Chișinău -------------------------------------------------
const TEX = {
  wallpaper: () => canvas(256, 256, (c, w, h) => {
    c.fillStyle = '#d6c69e'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#cbb98f'; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 9, h)
    c.fillStyle = '#b29b6c'
    for (let y = 16; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x < w; x += 32) {
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + 20 + Math.cos(k * Math.PI / 2) * 4, y + Math.sin(k * Math.PI / 2) * 4, 3, 0, Math.PI * 2); c.fill() }
    }
  }),
  parquet: () => canvas(256, 256, (c, w, h) => {
    const shades = ['#8a5a32', '#7a4c28', '#9a6a3c', '#a8764a', '#83532e']
    for (let y = 0; y < h; y += 16) for (let x = -((y / 16) % 2) * 32; x < w; x += 64) {
      c.fillStyle = shades[Math.floor(Math.random() * shades.length)]; c.fillRect(x, y, 64, 16)
      c.fillStyle = 'rgba(40,20,8,0.55)'; c.fillRect(x, y, 64, 1); c.fillRect(x, y, 1, 16)
      c.fillStyle = 'rgba(255,230,190,0.06)'; c.fillRect(x + 4, y + 5, 50, 2)
    }
  }),
  carpet: () => canvas(512, 320, (c, w, h) => {
    c.fillStyle = '#7a1a24'; c.fillRect(0, 0, w, h)
    const band = (m, col, t) => { c.strokeStyle = col; c.lineWidth = t; c.strokeRect(m, m, w - 2 * m, h - 2 * m) }
    band(10, '#1a2a5a', 20); band(24, '#d9b35a', 5); band(40, '#1a2a5a', 8)
    c.fillStyle = '#d9b35a'
    for (let x = 32; x < w - 24; x += 22) { c.save(); c.translate(x, 32); c.rotate(Math.PI / 4); c.fillRect(-4, -4, 8, 8); c.restore(); c.save(); c.translate(x, h - 32); c.rotate(Math.PI / 4); c.fillRect(-4, -4, 8, 8); c.restore() }
    const dia = (s, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(w / 2, h / 2 - s * 0.62); c.lineTo(w / 2 + s, h / 2); c.lineTo(w / 2, h / 2 + s * 0.62); c.lineTo(w / 2 - s, h / 2); c.fill() }
    dia(170, '#1a2a5a'); dia(140, '#9a2a2a'); dia(110, '#d9b35a'); dia(84, '#1a2a5a'); dia(52, '#e8d8b0'); dia(26, '#9a2a2a')
    for (const [x, y] of [[90, 90], [w - 90, 90], [90, h - 90], [w - 90, h - 90]]) { c.fillStyle = '#d9b35a'; c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a2a5a'; c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill() }
  }),
  cloth: () => canvas(128, 128, (c, w, h) => {
    c.fillStyle = '#ece4d2'; c.fillRect(0, 0, w, h)
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * w, y = Math.random() * h
      c.fillStyle = pick(['#c8384a', '#e07a2a', '#d84a8a']); for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.26) * 4, y + Math.sin(k * 1.26) * 4, 3, 0, Math.PI * 2); c.fill() }
      c.fillStyle = '#4a8a3a'; c.fillRect(x - 1, y + 5, 2, 7)
    }
  }),
  view: (night) => canvas(256, 256, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, night ? '#0b1224' : '#7fb2e0'); sky.addColorStop(1, night ? '#1a2238' : '#d8e6f0')
    c.fillStyle = sky; c.fillRect(0, 0, w, h)
    c.fillStyle = night ? '#1a1a22' : '#a8a296'; c.fillRect(30, 60, 190, h - 60)
    for (let y = 72; y < h - 10; y += 20) for (let x = 40; x < 212; x += 18) { c.fillStyle = night ? (Math.random() < 0.35 ? '#f2c66a' : '#23232c') : (Math.random() < 0.2 ? '#6a7a8a' : '#4a5260'); c.fillRect(x, y, 10, 12) }
    c.fillStyle = night ? '#0e1a10' : '#3e6a2e'; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(10 + i * 40, h - 8, 34, 0, Math.PI * 2); c.fill() }
  }),
  screen: (on) => canvas(128, 96, (c, w, h) => {
    if (!on) { c.fillStyle = '#1e2622'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(14, 10, 30, 70); return }
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a4a8a'); g.addColorStop(1, '#0e1a3a'); c.fillStyle = g; c.fillRect(0, 0, w, h)
    c.fillStyle = '#e8c872'; c.fillRect(0, h - 24, w, 16)
    c.fillStyle = '#10131c'; c.font = 'bold 12px sans-serif'; c.fillText('ȘTIRI · 20:00', 6, h - 12)
    c.fillStyle = '#d8b09a'; c.beginPath(); c.arc(w / 2, 34, 12, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#222'; c.fillRect(w / 2 - 18, 46, 36, 26)
  }),
}

export class Safehouse {
  constructor(game) {
    this.game = game
    this.inside = false
    this.built = false
    this.moving = false
    // the stairwell door of Blocul 7 nearest "home"
    const w = game.world, home = w.places.acasa
    let door = null, bd = 1e9
    for (const d of w.doors || []) { const k = Math.hypot(d.x - home.x, d.z - home.z); if (k < bd) { bd = k; door = d } }
    door ||= { x: home.x, z: home.z - 3, ry: Math.PI }
    this.door = { x: door.x + Math.sin(door.ry) * 1.3, z: door.z + Math.cos(door.ry) * 1.3, ry: door.ry }
    const g = game
    g.interaction.add({ id: 'home_enter', x: this.door.x, z: this.door.z, r: 2, priority: 1, label: '🏠 Intră acasă (Blocul 7, ap. 43)', enabled: () => !this.inside && !g.story.active, onInteract: () => this.enter() })
    const spot = (id, lx, lz, r, label, fn) => g.interaction.add({ id: 'home_' + id, x: R.x + lx, z: R.z + lz, r, priority: 2, label, enabled: () => this.inside && !this.moving, onInteract: fn })
    spot('door', 3.6, -2.15, 1.3, 'Ieși în curte', () => this.exit())
    spot('wardrobe', 3.3, -0.3, 1.3, 'Șifonierul: hainele tale', () => g.wardrobe.openWardrobe(-Math.PI / 2))
    spot('chest', 1.0, -1.95, 1.2, 'Lada bunicului: armele tale', () => this.chest())
    spot('bed', -1.2, -1.75, 1.5, 'Divanul: dormi (salvează jocul)', () => this.sleep())
    spot('fridge', -3.5, -2.0, 1.2, 'Frigiderul', () => this.fridge())
    spot('tv', -3.35, 0.2, 1.4, 'Televizorul', () => this.tv())
    g.events.on('player:down', () => { if (this.inside) this.leaveNow() })
  }

  // ---- the set ---------------------------------------------------------------------------------------
  build() {
    if (this.built) return
    this.built = true
    const g = this.game, P = g.physics
    const grp = this.group = new THREE.Group()
    grp.position.set(R.x, 0, R.z)
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o })
    const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = true; grp.add(m); return m }
    // floor, walls, ceiling
    const parquet = TEX.parquet(); parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping; parquet.repeat.set(4.5, 3)
    // the floor runs out to the cut line of the open wall
    parquet.repeat.set(4.5, 3.2)
    plane(HW * 2, HD * 2 + 0.36, std({ map: parquet, roughness: 0.55 }), 0, 0.004, 0.18, 0, -Math.PI / 2)
    const paper = TEX.wallpaper(); paper.wrapS = paper.wrapT = THREE.RepeatWrapping
    const wallMat = (rep) => { const t = paper.clone(); t.needsUpdate = true; t.repeat.set(rep, 2.4); return std({ map: t }) }
    const walls = [
      plane(HW * 2, H, wallMat(7.5), 0, H / 2, -HD),
      plane(HD * 2, H, wallMat(5), -HW, H / 2, 0, Math.PI / 2),
      plane(HD * 2, H, wallMat(5), HW, H / 2, 0, -Math.PI / 2),
      plane(HW * 2, HD * 2, std({ color: 0xe9e3d6 }), 0, H, 0, 0, Math.PI / 2),
    ]
    for (const m of walls) m.castShadow = true
    // the open fourth wall still throws its shadow (so the sun stays outside)
    const shade = plane(HW * 2, H, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), 0, H / 2, HD, Math.PI)
    shade.castShadow = true; shade.receiveShadow = false
    // the cut through the building around the opening, and the ground in front of it
    const face = new THREE.Shape([new THREE.Vector2(-30, -8), new THREE.Vector2(30, -8), new THREE.Vector2(30, 16), new THREE.Vector2(-30, 16)])
    face.holes.push(new THREE.Path([new THREE.Vector2(-HW, 0), new THREE.Vector2(-HW, H), new THREE.Vector2(HW, H), new THREE.Vector2(HW, 0)]))
    const facade = new THREE.Mesh(new THREE.ShapeGeometry(face), std({ color: 0x2a2b30, roughness: 1 }))
    facade.position.set(0, 0, HD + 0.32)
    grp.add(facade)
    plane(60, 24, std({ color: 0x232428, roughness: 1 }), 0, 0.001, HD + 12.2, 0, -Math.PI / 2)
    // pictures that need a texture: the wall carpet, the rug, the tablecloth, the window, the TV
    const carpet = TEX.carpet()
    plane(2.7, 1.55, std({ map: carpet, roughness: 1 }), -1.2, 1.75, -HD + 0.02)
    plane(3.3, 2.2, std({ map: carpet, roughness: 1 }), -0.5, 0.012, -0.2, 0, -Math.PI / 2)
    plane(1.36, 0.96, std({ map: TEX.cloth(), roughness: 0.4 }), -2.4, 0.782, 1.6, 0, -Math.PI / 2)
    this.viewDay = TEX.view(false); this.viewNight = TEX.view(true)
    this.window = plane(1.1, 1.25, new THREE.MeshBasicMaterial({ map: this.viewDay, toneMapped: true }), 2.0, 1.65, -HD + 0.03)
    this.screenOff = TEX.screen(false); this.screenOn = TEX.screen(true)
    this.screen = plane(0.46, 0.34, new THREE.MeshBasicMaterial({ map: this.screenOff }), -3.9, 0.93, 0.2, Math.PI / 2)
    // furniture: one vertex-coloured mesh
    const b = new GeoBuilder()
    const box = (w, h, d, x, y, z, color, o = {}) => b.box(w, h, d, { x, y, z, color, ...o })
    const rim = 0x3a3b40
    box(HW * 2 + 0.6, 0.32, 0.34, 0, H, HD + 0.16, rim); box(0.3, H + 0.3, 0.34, -HW - 0.15, 0, HD + 0.16, rim); box(0.3, H + 0.3, 0.34, HW + 0.15, 0, HD + 0.16, rim)
    for (const [w, d, x, z] of [[HW * 2, 0.04, 0, -HD + 0.02], [0.04, HD * 2, -HW + 0.02, 0], [0.04, HD * 2, HW - 0.02, 0]]) box(w, 0.1, d, x, 0, z, 0x5a3a22)
    // the divan, with a crocheted blanket and a cushion
    box(2.8, 0.26, 0.95, -1.2, 0.08, -2.55, 0x4a3020)
    box(2.7, 0.18, 0.86, -1.2, 0.34, -2.52, 0x5f6b3c)
    box(2.8, 0.52, 0.22, -1.2, 0.34, -2.93, 0x55603a)
    for (const s of [-1, 1]) box(0.14, 0.62, 0.95, -1.2 + s * 1.43, 0.08, -2.55, 0x4a3020)
    for (let i = 0; i < 6; i++) box(0.42, 0.03, 0.8, -2.25 + i * 0.42, 0.52, -2.5, [0xc84a3a, 0xe8c85a, 0x4a8a5a, 0xc84a3a, 0x3a5a9a, 0xe8c85a][i])
    box(0.5, 0.22, 0.32, -0.25, 0.5, -2.75, 0xd8c8a8, { rx: -0.3 })
    // the șifonier: dark lacquered wood, a mirror on the middle door
    box(0.62, 2.2, 1.9, 4.18, 0, -0.3, 0x5a2e16)
    box(0.66, 0.1, 1.98, 4.17, 2.2, -0.3, 0x4a2410)
    box(0.02, 1.6, 0.52, 3.86, 0.35, -0.3, 0xbcd4e0, { emit: 0.25 })
    for (const dz of [-0.62, 0.02]) box(0.03, 2.0, 0.02, 3.865, 0.1, -0.3 + dz, 0x2a1408)
    for (const dz of [-0.75, 0.15]) box(0.04, 0.16, 0.03, 3.85, 1.0, -0.3 + dz, 0xd9b35a)
    // the fridge "SUD" (the northern one was too expensive)
    box(0.66, 1.62, 0.64, -4.1, 0, -2.6, 0xebe7de)
    box(0.02, 0.02, 0.62, -3.77, 1.12, -2.6, 0x9a9a9a)
    box(0.04, 0.34, 0.04, -3.76, 1.2, -2.35, 0xb8b8b8)
    box(0.02, 0.07, 0.2, -3.765, 1.46, -2.72, 0x1a3a8a)
    // TV on its stand, two framed photos over it
    box(0.52, 0.56, 1.1, -4.2, 0, 0.2, 0x6a4424)
    box(0.56, 0.5, 0.62, -4.16, 0.58, 0.2, 0x26262a)
    box(0.02, 0.36, 0.02, -4.1, 1.08, 0.33, 0x1a1a1a, { rx: -0.4 }); box(0.02, 0.36, 0.02, -4.1, 1.08, 0.07, 0x1a1a1a, { rx: 0.4 })
    for (const [dz, c] of [[-0.35, 0x8a6a4a], [0.55, 0x4a6a8a]]) { box(0.03, 0.42, 0.34, -HW + 0.03, 1.55, dz, 0xd9b35a); box(0.035, 0.34, 0.26, -HW + 0.04, 1.59, dz, c) }
    // the table under the flowery oilcloth, two chairs
    box(1.3, 0.05, 0.9, -2.4, 0.72, 1.6, 0x7a4a26)
    for (const [dx, dz] of [[-0.58, -0.38], [0.58, -0.38], [-0.58, 0.38], [0.58, 0.38]]) box(0.05, 0.72, 0.05, -2.4 + dx, 0, 1.6 + dz, 0x6a3e1e)
    for (const s of [-1, 1]) { box(0.44, 0.04, 0.42, -2.4 + s * 0.95, 0.44, 1.6, 0x7a4a26); box(0.44, 0.5, 0.04, -2.4 + s * 1.15, 0.46, 1.6, 0x7a4a26, { ry: Math.PI / 2 }); for (const dz of [-0.18, 0.18]) box(0.04, 0.44, 0.04, -2.4 + s * 0.95, 0, 1.6 + dz, 0x6a3e1e) }
    box(0.3, 0.08, 0.3, -2.4, 0.78, 1.55, 0xe8e8e8)
    // grandpa's chest
    box(0.9, 0.46, 0.5, 1.0, 0, -2.6, 0x7a4a24)
    for (const dx of [-0.3, 0.3]) box(0.06, 0.48, 0.52, 1.0 + dx, 0, -2.6, 0x3a3a3a)
    box(0.12, 0.1, 0.03, 1.0, 0.3, -2.34, 0xd9b35a)
    // the window: frame, sill, curtains
    box(1.26, 0.07, 0.12, 2.0, 1.0, -HD + 0.06, 0xf2f0ea); box(1.26, 0.07, 0.08, 2.0, 2.28, -HD + 0.04, 0xf2f0ea)
    for (const s of [-1, 1]) box(0.07, 1.34, 0.08, 2.0 + s * 0.6, 0.98, -HD + 0.04, 0xf2f0ea)
    box(0.04, 1.25, 0.05, 2.0, 1.02, -HD + 0.04, 0xf2f0ea)
    for (const s of [-1, 1]) box(0.34, 1.7, 0.05, 2.0 + s * 0.78, 0.7, -HD + 0.12, 0xe8dcc0)
    box(1.9, 0.06, 0.06, 2.0, 2.42, -HD + 0.1, 0x9a8a6a)
    // the door to the stairwell
    box(1.0, 2.14, 0.08, 3.6, 0, -HD + 0.04, 0x5a3a22)
    box(0.08, 0.08, 0.06, 3.25, 1.0, -HD + 0.1, 0xd9b35a)
    box(1.12, 0.08, 0.1, 3.6, 2.14, -HD + 0.05, 0x4a2a14)
    // a ficus, a calendar, the chandelier
    b.cyl(0.2, 0.15, 0.36, 10, { x: 4.0, y: 0, z: 2.4, color: 0x9a4a2a })
    for (let i = 0; i < 7; i++) b.sphere(0.2 + (i % 3) * 0.04, 8, 6, { x: 4.0 + Math.cos(i * 0.9) * 0.18, y: 0.55 + i * 0.13, z: 2.4 + Math.sin(i * 0.9) * 0.18, color: i % 2 ? 0x2f6a2e : 0x3a7a36 })
    box(0.4, 0.55, 0.02, 2.95, 1.3, -HD + 0.03, 0xf2eee4); box(0.36, 0.14, 0.022, 2.95, 1.66, -HD + 0.03, 0xc8384a)
    b.cyl(0.015, 0.015, 0.34, 6, { x: 0, y: H - 0.34, z: -0.2, color: 0x8a7a4a })
    b.cyl(0.24, 0.24, 0.03, 12, { x: 0, y: H - 0.38, z: -0.2, color: 0xb8964a })
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; b.cone(0.1, 0.13, 8, { x: Math.cos(a) * 0.24, y: H - 0.52, z: -0.2 + Math.sin(a) * 0.24, color: 0xf2e6c8, emit: 0.9 }) }
    const furn = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }))
    furn.castShadow = true; furn.receiveShadow = true
    grp.add(furn)
    // the lamp
    const lamp = this.light = new THREE.PointLight(0xffd6a0, 12, 13, 1.3)
    lamp.position.set(0, H - 0.75, -0.2)
    grp.add(lamp)
    const fill = new THREE.PointLight(0xffe6c8, 2.5, 9, 1.6)
    fill.position.set(0, 1.9, HD - 0.8)
    grp.add(fill)
    grp.visible = false
    g.scene.add(grp)
    // colliders: the walls (the open side too) and the furniture
    const B = (x, y, z, hx, hy, hz) => P.box(R.x + x, y, R.z + z, hx, hy, hz)
    B(0, 1.4, -HD - 0.1, HW + 0.2, 1.4, 0.1); B(0, 1.4, HD + 0.1, HW + 0.2, 1.4, 0.1)
    B(-HW - 0.1, 1.4, 0, 0.1, 1.4, HD + 0.2); B(HW + 0.1, 1.4, 0, 0.1, 1.4, HD + 0.2)
    B(-1.2, 0.35, -2.55, 1.42, 0.35, 0.48); B(4.18, 1.1, -0.3, 0.31, 1.1, 0.95); B(-4.1, 0.81, -2.6, 0.33, 0.81, 0.32)
    B(-4.2, 0.55, 0.2, 0.26, 0.55, 0.55); B(-2.4, 0.4, 1.6, 0.66, 0.4, 0.45); B(1.0, 0.24, -2.6, 0.45, 0.24, 0.25); B(4.0, 0.5, 2.4, 0.25, 0.5, 0.25)
    this.roomCam = { cx: R.x, cz: R.z, x0: R.x - HW, x1: R.x + HW, camY: 2.45, camZ: R.z + HD + 4.2, fov: 50 }
  }

  // ---- coming and going ---------------------------------------------------------------------------------
  async enter() {
    const g = this.game, p = g.player
    if (this.inside || this.moving || p.vehicle) return
    if (g.police.level > 0) { g.ui.notify('{r}Nu duce poliția acasă.{/r} Scapă de ei întâi.', 3.4, 'red'); return }
    this.moving = true
    this.build()
    g.audio?.sfx('door', { vol: 0.7 })
    await g.ui.fade(1, 350)
    this.inside = true
    this.group.visible = true
    g.crew?.holdAll(true)
    p.teleport(R.x + 3.3, 0, R.z - 1.7, -Math.PI / 2)
    p.vel.set(0, 0, 0)
    g.cameraRig.room = this.roomCam
    g.cameraRig.snap()
    g.renderer.indoors = true
    g.ui.setIndoors?.(true)
    g.progress.save()
    await g.ui.fade(0, 450)
    this.moving = false
    if (!g.progress.flags.homeSeen) { g.progress.flags.homeSeen = true; g.ui.notify('🏠 {y}Acasă.{/y} Divanul (dormi, salvezi), șifonierul (haine), lada (arme), frigiderul. {y}[E]{/y} lângă ele.', 6, 'gold') }
  }

  async exit() {
    const g = this.game
    if (!this.inside || this.moving) return
    this.moving = true
    g.audio?.sfx('door', { vol: 0.7 })
    await g.ui.fade(1, 350)
    this.leaveNow()
    await g.ui.fade(0, 450)
    this.moving = false
  }

  // back in the courtyard at once (also when you faint at home)
  leaveNow() {
    const g = this.game, p = g.player, d = this.door
    this.inside = false
    if (this.group) this.group.visible = false
    g.cameraRig.room = null
    g.renderer.indoors = false
    g.ui.setIndoors?.(false)
    const x = d.x + Math.sin(d.ry) * 0.6, z = d.z + Math.cos(d.ry) * 0.6
    p.teleport(x, g.physics.groundHeight(x, z, 6), z, d.ry)
    g.cameraRig.target.copy(p.pos)
    g.cameraRig.yaw = d.ry
    g.cameraRig.snap()
    g.crew?.holdAll(false)
  }

  // ---- the furniture ------------------------------------------------------------------------------------
  async sleep() {
    const g = this.game, pr = g.progress
    const i = await g.ui.dialogue({ name: 'Divanul', role: 'Blocul 7, ap. 43' }, ['Divanul scârțâie ca în copilărie. Cât dormi?'], { choices: ['Până dimineață (08:00)', 'Până seara (20:00)', 'Doar o oră', 'Nu, mai stau treaz.'] })
    if (i == null || i === 3) return
    const h = g.renderer.tod.hour
    const to = i === 0 ? 8 : i === 1 ? 20 : (h + 1) % 24
    this.moving = true
    await g.ui.fade(1, 700)
    g.renderer.tod.set(to)
    pr.hp = pr.maxHp
    pr.hunger = Math.max(0.05, pr.hunger - (i === 2 ? 0.02 : 0.12))
    g.player.stamina = 1
    pr.save()
    await new Promise((r) => setTimeout(r, 450))
    await g.ui.fade(0, 900)
    this.moving = false
    g.ui.notify(`😴 Te-ai odihnit. E ${g.renderer.tod.clock}. {g}Jocul e salvat.{/g}`, 3.6, 'green')
    g.events.emit('home:sleep', to)
  }

  async fridge() {
    const g = this.game, pr = g.progress
    const who = { name: 'Frigiderul „Sud"', role: 'Din 1987. Merge.' }
    const now = Date.now()
    if (pr.flags.sarmaleAt && now - pr.flags.sarmaleAt < SARMALE_EVERY) {
      await g.ui.dialogue(who, ['Frigiderul e gol. O conservă din 2014 și un borcan de muștar. Mama mai aduce sarmale diseară.'])
      return false
    }
    pr.flags.sarmaleAt = now
    pr.feed(1); pr.heal(20)
    g.audio?.sfx('pickup', { bus: 'ui' })
    await g.ui.dialogue(who, ['Sarmale de la mama, cu smântână. Reci, dar tot bune. Ai mâncat ca la nuntă.'])
    return true
  }

  async tv() {
    const g = this.game, pr = g.progress
    this.screen.material.map = this.screenOn; this.screen.material.needsUpdate = true
    const news = (g.ui.tickerRun?.textContent || '').split('◆').map((s) => s.trim()).filter(Boolean)
    const a = news.length ? pick(news) : 'Primăria anunță că lucrează la asta.'
    let b = news.length > 1 ? pick(news) : 'Gropile orașului au fost numărate. Au ieșit mai multe decât ieri.'
    if (b === a && news.length > 1) b = news.find((s) => s !== a)
    await g.ui.dialogue({ name: 'Știrile de la ora 20', role: 'Canalul „Moldova Unu și Jumătate"' }, ['Bună seara. Principalele știri ale zilei.', a + '.', b + '.', pick(['Vremea: mâine va fi vreme. Rămâneți cu noi.', 'Și acum, publicitate. De fapt, nu mai avem bani nici de ea.', 'Cursul valutar: nu vă uitați. Noapte bună.'])])
    this.screen.material.map = this.screenOff; this.screen.material.needsUpdate = true
    if (!pr.flags.tvDay || Date.now() - pr.flags.tvDay > SARMALE_EVERY) { pr.flags.tvDay = Date.now(); pr.addXp(5, 'Te-ai informat') }
  }

  // what you carry and what waits in the chest
  chest() {
    const g = this.game, pr = g.progress
    const row = (k, tab) => {
      const w = WEAPONS[k], full = pr.carry.length >= CARRY_MAX
      return {
        id: k, brand: { name: w.icon, bg: '#24242a', fg: '#fff' }, name: w.name,
        meta: `forță ${w.dmg} · rază ${w.range} m${w.stun ? ' · amețește' : ''}${w.ranged ? ' · de la distanță' : ''}${pr.weapon === k ? ' · {g}în mână{/g}' : ''}`,
        note: w.desc || '', state: tab === 'home' && full ? 'locked' : '',
        action: tab === 'carry' ? 'Enter: las-o în ladă' : full ? `Ai deja ${CARRY_MAX} arme la tine. Lasă una.` : 'Enter: ia-o cu tine',
      }
    }
    return openListPanel(g, {
      title: 'Lada bunicului', sub: () => `La tine: ${pr.carry.length} din ${CARRY_MAX} · [Q] le schimbi pe drum`,
      tabs: [{ key: 'carry', label: 'La tine' }, { key: 'home', label: 'În ladă' }],
      items: (tab) => (tab === 'carry' ? pr.carry : pr.weapons.filter((k) => k !== 'fist' && !pr.carry.includes(k))).map((k) => row(k, tab)),
      onPick: (it) => this.toggleCarry(it.id),
      hint: '<b>↑↓</b> alege · <b>←→</b> la tine / în ladă · <b>Enter</b> mută · <b>Esc</b> închide',
    })
  }

  toggleCarry(k) {
    const g = this.game, pr = g.progress
    if (pr.carry.includes(k)) {
      pr.carry = pr.carry.filter((x) => x !== k)
      if (pr.weapon === k) { pr.weapon = 'fist'; g.player.setWeapon('fist') }
    } else {
      if (pr.carry.length >= CARRY_MAX) { g.audio?.sfx('error', { bus: 'ui' }); return false }
      pr.carry.push(k); pr.sortCarry()
    }
    g.audio?.sfx('toggle', { bus: 'ui' })
    return true
  }

  update() {
    if (!this.inside || !this.window) return
    const night = this.game.renderer.tod.isNight
    const want = night ? this.viewNight : this.viewDay
    if (this.window.material.map !== want) { this.window.material.map = want; this.window.material.needsUpdate = true }
  }

  blips() { return [{ kind: 'icon', x: this.door.x, z: this.door.z, icon: '🏠' }] }
}
