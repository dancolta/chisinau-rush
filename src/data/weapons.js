import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'

// Improvised, comedic, non-lethal arsenal (from the original game's Borea shop).
export const WEAPONS = {
  fist: { key: 'fist', name: 'Pumni', dmg: 9, range: 1.45, arc: 1.2, knock: 3.2, cooldown: 0.26, anim: 'jab', heat: 0, price: 0, icon: '👊' },
  covor: { key: 'covor', name: 'Covor rulat', dmg: 14, range: 2.0, arc: 1.5, knock: 6.5, cooldown: 0.5, anim: 'swing', heat: 8, price: 40, icon: '🧶' },
  sticla: { key: 'sticla', name: 'Sticlă de baban', dmg: 17, range: 1.55, arc: 1.1, knock: 4.5, cooldown: 0.42, anim: 'swing', heat: 10, price: 30, icon: '🍾' },
  par: { key: 'par', name: 'Parul de la gard', dmg: 21, range: 2.2, arc: 1.3, knock: 8, cooldown: 0.55, anim: 'swing', heat: 12, price: 60, icon: '🪵' },
  spray: { key: 'spray', name: 'Spray cu piper', dmg: 5, range: 3.4, arc: 0.75, knock: 1, cooldown: 0.7, anim: 'spray', heat: 14, price: 160, stun: 3.2, icon: '🧯' },
  suflanta: { key: 'suflanta', name: 'Suflantă de frunze', dmg: 7, range: 5.5, arc: 0.95, knock: 22, cooldown: 0.9, anim: 'spray', heat: 18, price: 380, icon: '🌪️' },
  // the second wave: every one of them from somebody in town
  cheie: { key: 'cheie', name: 'Cheie franceză', dmg: 15, range: 1.5, arc: 1.1, knock: 5, cooldown: 0.4, anim: 'swing', heat: 9, price: 45, icon: '🔧', seller: 'vova', desc: 'De la Vova. Strânge piulițe și conflicte.' },
  tigaie: { key: 'tigaie', name: 'Tigaie de fontă', dmg: 13, range: 1.55, arc: 1.2, knock: 5, cooldown: 0.5, anim: 'swing', heat: 8, price: 55, stun: 1.3, icon: '🍳', seller: 'piata', pow: 'BONG!', sfx: 'metal_hit', desc: 'BONG. Adversarul vede stele și clătite.' },
  umbrela: { key: 'umbrela', name: 'Umbrela bunicii', dmg: 7, range: 2.4, arc: 0.7, knock: 4, cooldown: 0.32, anim: 'jab', heat: 3, price: 25, icon: '☂️', seller: 'piata', desc: 'Lungă, iute și nu se strică niciodată. Ca bunica.' },
  matura: { key: 'matura', name: 'Mătura lui Nelu', dmg: 9, range: 2.3, arc: 2.0, knock: 7, cooldown: 0.55, anim: 'swing', heat: 5, price: 35, icon: '🧹', seller: 'nelu', desc: 'Mătură tot în jur. Oameni inclusiv.' },
  bata: { key: 'bata', name: 'Bâtă de oină', dmg: 23, range: 2.1, arc: 1.3, knock: 9, cooldown: 0.62, anim: 'swing', heat: 14, price: 140, icon: '🏏', seller: 'borea', desc: 'Sportul național. Mingea e opțională.' },
  pistol: { key: 'pistol', name: 'Pistol cu apă „Super Udător"', dmg: 2, range: 8, arc: 0.4, knock: 1.5, cooldown: 0.28, anim: 'spray', heat: 2, price: 30, stun: 1.6, water: true, ranged: true, icon: '🔫', seller: 'piata', desc: 'Udă, nu doare. Da\' jignește grav.' },
}
export const WEAPON_ORDER = ['fist', 'covor', 'sticla', 'cheie', 'tigaie', 'umbrela', 'matura', 'par', 'bata', 'pistol', 'spray', 'suflanta']
// how many weapons you carry besides your fists (the rest wait at home, in the chest)
export const CARRY_MAX = 4

// small mesh held in the right hand (child of the forearm bone)
export function makeWeaponMesh(key, heights) {
  if (key === 'fist') return null
  const g = new GeoBuilder()
  const handY = -0.29 * (heights?.H ?? 1) - 0.02
  if (key === 'covor') {
    g.cyl(0.07, 0.07, 1.3, 8, { x: 0, y: handY, z: 0.25, rx: Math.PI / 2 - 0.3, center: true, color: 0x8a2f2f })
    g.cyl(0.072, 0.072, 0.08, 8, { x: 0, y: handY - 0.18, z: 0.85, rx: Math.PI / 2 - 0.3, center: true, color: 0xc9a23a })
  } else if (key === 'sticla') {
    g.cyl(0.045, 0.045, 0.26, 8, { x: 0, y: handY, z: 0.14, rx: Math.PI / 2, center: true, color: 0x2f6b3a })
    g.cyl(0.02, 0.03, 0.12, 6, { x: 0, y: handY, z: 0.31, rx: Math.PI / 2, center: true, color: 0x2f6b3a })
    g.box(0.07, 0.08, 0.1, { x: 0, y: handY - 0.04, z: 0.14, color: 0xe8d9a0 })
  } else if (key === 'par') {
    g.box(0.07, 0.07, 1.25, { x: 0, y: handY - 0.02, z: 0.5, rx: -0.15, color: 0x7a5a36 })
    g.box(0.075, 0.075, 0.08, { x: 0, y: handY + 0.09, z: 1.05, rx: -0.15, color: 0x5a4028 })
  } else if (key === 'spray') {
    g.cyl(0.035, 0.035, 0.16, 8, { x: 0, y: handY - 0.02, z: 0.05, color: 0xd32f2f })
    g.box(0.03, 0.03, 0.04, { x: 0, y: handY + 0.08, z: 0.07, color: 0x111111 })
  } else if (key === 'suflanta') {
    g.box(0.22, 0.2, 0.28, { x: 0.02, y: handY + 0.05, z: 0.06, color: 0xf06a1a })
    g.cyl(0.055, 0.07, 0.8, 8, { x: 0, y: handY - 0.05, z: 0.55, rx: Math.PI / 2 + 0.25, center: true, color: 0x2a2a2a })
  } else if (key === 'cheie') {
    g.box(0.04, 0.025, 0.36, { x: 0, y: handY - 0.01, z: 0.16, color: 0x8a9098 })
    g.box(0.1, 0.03, 0.05, { x: 0, y: handY - 0.012, z: 0.35, color: 0x9aa0a8 })
    g.box(0.03, 0.03, 0.08, { x: -0.035, y: handY - 0.012, z: 0.4, color: 0x9aa0a8 })
  } else if (key === 'tigaie') {
    g.box(0.035, 0.03, 0.3, { x: 0, y: handY - 0.01, z: 0.14, color: 0x2a1a10 })
    g.cyl(0.15, 0.13, 0.04, 14, { x: 0, y: handY - 0.02, z: 0.42, rx: Math.PI / 2 - 0.2, center: true, color: 0x1c1c1e })
  } else if (key === 'umbrela') {
    g.cyl(0.012, 0.012, 0.95, 6, { x: 0, y: handY - 0.02, z: 0.42, rx: Math.PI / 2 - 0.1, center: true, color: 0x2a2a2a })
    g.cone(0.06, 0.62, 8, { x: 0, y: handY - 0.02, z: 0.5, rx: Math.PI / 2 - 0.1, center: true, color: 0x5a1a2a })
    g.box(0.03, 0.09, 0.03, { x: 0, y: handY - 0.06, z: -0.04, color: 0x3a2a1a })
  } else if (key === 'matura') {
    g.cyl(0.018, 0.018, 1.3, 6, { x: 0, y: handY - 0.02, z: 0.45, rx: Math.PI / 2 - 0.35, center: true, color: 0x9a7a4a })
    g.box(0.3, 0.1, 0.06, { x: 0, y: handY - 0.26, z: 1.06, rx: -0.35, color: 0xc9a45a })
  } else if (key === 'bata') {
    g.cyl(0.048, 0.022, 0.98, 10, { x: 0, y: handY, z: 0.42, rx: Math.PI / 2 - 0.3, center: true, color: 0xb8864a })
    g.cyl(0.024, 0.024, 0.16, 8, { x: 0, y: handY + 0.03, z: 0.02, rx: Math.PI / 2 - 0.3, center: true, color: 0x1a1a1a })
  } else if (key === 'pistol') {
    g.box(0.05, 0.1, 0.2, { x: 0, y: handY - 0.02, z: 0.08, color: 0x3ac43a })
    g.cyl(0.04, 0.04, 0.12, 10, { x: 0, y: handY + 0.1, z: 0.07, color: 0xf07a1a })
    g.cyl(0.012, 0.012, 0.12, 6, { x: 0, y: handY + 0.04, z: 0.23, rx: Math.PI / 2, center: true, color: 0x2a6ad8 })
    g.box(0.03, 0.09, 0.04, { x: 0, y: handY - 0.1, z: 0.02, color: 0x2a8a2a })
  }
  const m = new THREE.Mesh(g.build(), sharedPlainMat())
  m.castShadow = true
  return m
}

let _plain = null
function sharedPlainMat() {
  if (!_plain) _plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  return _plain
}
