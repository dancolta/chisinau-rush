import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'

// Procedural stylised humans: one SkinnedMesh per character (rigid skinning, 12 bones),
// built from an outfit spec. Facing +z. Left side = +x.

export const BONE = { root: 0, hips: 1, spine: 2, head: 3, armL: 4, foreL: 5, armR: 6, foreR: 7, legL: 8, shinL: 9, legR: 10, shinR: 11 }
const BONE_NAMES = Object.keys(BONE)

class SkinBuilder extends GeoBuilder {
  constructor() { super(); this.skin = []; this.cur = 0 }
  bone(i) { this.cur = i; return this }
  add(geo, o) {
    const before = this.pos.length / 3
    super.add(geo, o)
    const added = this.pos.length / 3 - before
    for (let i = 0; i < added; i++) this.skin.push(this.cur)
    return this
  }
  build() {
    const g = super.build()
    const n = this.skin.length
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) { si[i * 4] = this.skin[i]; sw[i * 4] = 1 }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4))
    return g
  }
}

const SPHERE = new THREE.SphereGeometry(1, 12, 9).toNonIndexed()
const SPHERE_LO = new THREE.SphereGeometry(1, 8, 6).toNonIndexed()
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).toNonIndexed()
const CAP = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.36).toNonIndexed()
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed()
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed()
const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
const CONE = new THREE.ConeGeometry(1, 1, 8).toNonIndexed()

function tapered(rTop, rBot, seg = 8) {
  const k = `${rTop}:${rBot}:${seg}`
  if (!tapered.cache.has(k)) tapered.cache.set(k, new THREE.CylinderGeometry(rTop, rBot, 1, seg).toNonIndexed())
  return tapered.cache.get(k)
}
tapered.cache = new Map()

// ---------------------------------------------------------------------------
export function buildCharacter(spec) {
  const H = spec.height ?? 1
  const Wd = spec.width ?? 1
  const belly = spec.belly ?? 0
  const skin = spec.skin ?? 0xe0ae8a
  const top = spec.top ?? { color: 0x3a6ea5 }
  const bottom = spec.bottom ?? { color: 0x2d2f36 }
  const shoes = spec.shoes ?? 0x1e1e22
  const hairC = spec.hair?.color ?? 0x3a2a1c
  const sleeveC = top.sleeve ?? top.color
  const b = new SkinBuilder()

  // key heights
  const yHip = 0.92 * H, yKnee = 0.49 * H, yAnkle = 0.07
  const yWaist = 0.98 * H, yShoulder = 1.42 * H, yNeck = 1.48 * H, yHead = 1.66 * H
  const sx = 0.255 * Wd, lx = 0.105 * Wd

  // ---- legs ------------------------------------------------------------------
  const legC = bottom.style === 'skirt' || bottom.style === 'dress' ? (spec.stockings ?? skin) : bottom.color
  for (const [side, legB, shinB] of [[1, BONE.legL, BONE.shinL], [-1, BONE.legR, BONE.shinR]]) {
    const x = side * lx
    b.bone(legB).add(tapered(0.1 * Wd, 0.082 * Wd), { x, y: (yHip + yKnee) / 2, z: 0, sy: yHip - yKnee, color: legC })
    b.bone(shinB).add(tapered(0.08 * Wd, 0.066 * Wd), { x, y: (yKnee + yAnkle) / 2 + 0.02, z: 0, sy: yKnee - yAnkle, color: legC })
    b.add(SPHERE_LO, { x, y: yKnee, z: 0, sx: 0.084 * Wd, sy: 0.08, sz: 0.084 * Wd, color: legC })
    // shoe
    b.add(BOX, { x, y: 0.05, z: 0.05, sx: 0.13 * Wd, sy: 0.1, sz: 0.27, color: shoes })
    b.add(BOX, { x, y: 0.005, z: 0.05, sx: 0.135 * Wd, sy: 0.02, sz: 0.28, color: shadeHex(shoes, 0.6) })
    if (bottom.stripes) {
      b.bone(legB).add(BOX, { x: x + side * 0.097 * Wd, y: (yHip + yKnee) / 2, z: 0, sx: 0.012, sy: yHip - yKnee, sz: 0.03, color: bottom.stripes })
      b.bone(shinB).add(BOX, { x: x + side * 0.078 * Wd, y: (yKnee + yAnkle) / 2 + 0.03, z: 0, sx: 0.012, sy: yKnee - yAnkle - 0.02, sz: 0.03, color: bottom.stripes })
    }
  }

  // ---- pelvis / skirt ------------------------------------------------------------
  b.bone(BONE.hips)
  b.add(tapered(0.215 * Wd, 0.2 * Wd), { x: 0, y: yHip + 0.02, z: 0, sy: 0.17, sz: 0.68, color: bottom.color })
  if (bottom.style === 'skirt' || bottom.style === 'dress') {
    const len = bottom.long ? 0.5 : 0.36
    const col = bottom.style === 'dress' ? top.color : bottom.color
    b.add(tapered(0.19 * Wd, 0.3 * Wd, 10), { x: 0, y: yHip + 0.06 - len / 2, z: 0, sy: len, sz: 0.75, color: col })
  }
  if (spec.belt) b.add(tapered(0.195 * Wd, 0.195 * Wd), { x: 0, y: yHip + 0.08, z: 0, sy: 0.04, sz: 0.64, color: spec.belt })

  // ---- torso -----------------------------------------------------------------
  b.bone(BONE.spine)
  const torsoH = yShoulder - yWaist + 0.05
  const topC = top.style === 'dress' ? top.color : top.color
  b.add(tapered(0.245 * Wd, 0.215 * Wd + belly * 0.04), { x: 0, y: yWaist + torsoH / 2, z: 0, sy: torsoH, sz: 0.7 + belly * 0.12, color: topC })
  if (belly > 0) b.add(SPHERE, { x: 0, y: yWaist + 0.13, z: 0.05 + belly * 0.04, sx: 0.2 * Wd, sy: 0.17, sz: 0.13 + belly * 0.05, color: topC })
  // shoulders
  for (const s of [1, -1]) b.add(SPHERE_LO, { x: s * (sx - 0.035), y: yShoulder - 0.03, z: 0, sx: 0.1 * Wd, sy: 0.09, sz: 0.1, color: sleeveC })
  // clothing details
  if (top.style === 'tracksuit' || top.stripes) {
    const st = top.stripes ?? 0xf2f2f2
    b.add(BOX, { x: 0, y: yWaist + torsoH / 2, z: 0.165, sx: 0.022, sy: torsoH * 0.95, sz: 0.01, color: st }) // zipper
    b.add(BOX, { x: 0, y: yShoulder - 0.02, z: 0.02, sx: 0.3 * Wd, sy: 0.06, sz: 0.24, color: top.color }) // collar
  }
  if (top.style === 'suit' || top.style === 'jacket' || top.style === 'coat') {
    // open jacket: shirt V + lapels
    b.add(BOX, { x: 0, y: yShoulder - 0.13, z: 0.158, sx: 0.11, sy: 0.24, sz: 0.012, color: top.shirt ?? 0xf2f2f2 })
    for (const s of [1, -1]) b.add(BOX, { x: s * 0.062, y: yShoulder - 0.12, z: 0.162, rz: s * 0.35, sx: 0.04, sy: 0.25, sz: 0.012, color: top.lapel ?? shadeHex(top.color, 0.8) })
    if (top.tie) b.add(BOX, { x: 0, y: yShoulder - 0.2, z: 0.167, sx: 0.04, sy: 0.3, sz: 0.012, color: top.tie })
    if (top.style === 'coat') b.add(tapered(0.25 * Wd, 0.3 * Wd, 8), { x: 0, y: yWaist - 0.2, z: 0, sy: 0.42, sz: 0.72, color: top.color })
  }
  if (top.style === 'vest') b.add(tapered(0.252 * Wd, 0.222 * Wd), { x: 0, y: yWaist + torsoH * 0.45, z: 0, sy: torsoH * 0.85, sz: 0.72, color: top.vest ?? 0xf06a1a })
  if (top.style === 'uniform') {
    b.add(BOX, { x: 0.09, y: yShoulder - 0.17, z: 0.162, sx: 0.065, sy: 0.075, sz: 0.012, color: 0xd9b33a }) // badge
    b.add(BOX, { x: 0, y: yWaist + 0.06, z: 0, sx: 0.47 * Wd, sy: 0.055, sz: 0.33, color: 0x1a1a1a }) // belt
  }
  if (top.check) { // checkered shirt: a few darker bands
    for (let i = 0; i < 4; i++) b.add(BOX, { x: 0, y: yWaist + 0.08 + i * 0.12, z: 0.16, sx: 0.4 * Wd, sy: 0.025, sz: 0.012, color: top.check })
  }
  if (spec.chain) b.add(tapered(0.07, 0.07, 10), { x: 0, y: yShoulder - 0.09, z: 0.06, rx: 0.5, sy: 0.012, sz: 1.2, color: 0xe6c04a })
  if (spec.bag) b.add(BOX, { x: -0.23 * Wd, y: yWaist + 0.02, z: 0.02, sx: 0.08, sy: 0.24, sz: 0.28, color: spec.bag })
  if (spec.backpack) b.add(BOX, { x: 0, y: yWaist + 0.22, z: -0.17, sx: 0.3, sy: 0.36, sz: 0.14, color: spec.backpack })

  // ---- arms --------------------------------------------------------------------
  const forearmC = top.short ? skin : sleeveC
  for (const [s, armB, foreB] of [[1, BONE.armL, BONE.foreL], [-1, BONE.armR, BONE.foreR]]) {
    const x = s * sx
    const yE = yShoulder - 0.29 * H, yW = yE - 0.27 * H
    b.bone(armB).add(tapered(0.078 * Wd, 0.066 * Wd), { x, y: (yShoulder + yE) / 2, z: 0, sy: yShoulder - yE, color: sleeveC })
    if (top.stripes || top.style === 'tracksuit') b.add(BOX, { x: x + s * 0.075 * Wd, y: (yShoulder + yE) / 2, z: 0, sx: 0.012, sy: yShoulder - yE, sz: 0.028, color: top.stripes ?? 0xf2f2f2 })
    b.bone(foreB).add(tapered(0.066 * Wd, 0.056 * Wd), { x, y: (yE + yW) / 2, z: 0, sy: yE - yW, color: forearmC })
    b.add(SPHERE_LO, { x, y: yE, z: 0, sx: 0.07 * Wd, sy: 0.06, sz: 0.07 * Wd, color: sleeveC })
    b.add(SPHERE_LO, { x, y: yW - 0.055, z: 0.005, sx: 0.064, sy: 0.08, sz: 0.056, color: skin }) // hand
    if (top.stripes || top.style === 'tracksuit') b.add(BOX, { x: x + s * 0.064 * Wd, y: (yE + yW) / 2, z: 0, sx: 0.012, sy: yE - yW, sz: 0.026, color: top.stripes ?? 0xf2f2f2 })
    if (s === -1 && spec.hold === 'phone') b.add(BOX, { x, y: yW - 0.08, z: 0.04, sx: 0.035, sy: 0.12, sz: 0.06, color: 0x1a1a1a })
    if (s === -1 && spec.hold === 'mic') { b.add(CYL6, { x, y: yW - 0.1, z: 0.05, rx: 1.2, sx: 0.018, sy: 0.18, sz: 0.018, color: 0x222 }); b.add(SPHERE_LO, { x, y: yW - 0.06, z: 0.14, sx: 0.035, sy: 0.035, sz: 0.035, color: 0x555 }) }
    if (s === 1 && spec.hold === 'seeds') b.add(BOX, { x, y: yW - 0.06, z: 0.04, sx: 0.07, sy: 0.08, sz: 0.05, color: 0xf2e6c8 })
    if (s === 1 && spec.hold === 'bag') b.add(BOX, { x, y: yW - 0.2, z: 0, sx: 0.16, sy: 0.26, sz: 0.08, color: spec.handbag ?? 0x7a4a2a })
  }

  // ---- head ----------------------------------------------------------------------
  b.bone(BONE.head)
  const hr = 0.178 * (spec.headScale ?? 1)
  b.add(CYL8, { x: 0, y: (yShoulder + yNeck) / 2 + 0.03, z: 0, sx: 0.07, sy: 0.12, sz: 0.07, color: skin })
  b.add(SPHERE, { x: 0, y: yHead, z: 0, sx: hr, sy: hr * 1.06, sz: hr * 1.0, color: skin })
  // face
  const fz = hr * 0.93
  const eyeC = spec.eyes ?? 0x1c1c1c
  for (const s of [1, -1]) {
    b.add(SPHERE_LO, { x: s * 0.062, y: yHead + 0.02, z: fz - 0.012, sx: 0.034, sy: 0.04, sz: 0.022, color: 0xf6f3ee })
    b.add(SPHERE_LO, { x: s * 0.06, y: yHead + 0.016, z: fz + 0.004, sx: 0.019, sy: 0.024, sz: 0.012, color: eyeC })
    b.add(BOX, { x: s * 0.064, y: yHead + 0.075, z: fz - 0.004, rz: s * (spec.angry ? -0.3 : 0.12), sx: 0.058, sy: 0.014, sz: 0.018, color: spec.brows ?? hairC })
  }
  b.add(BOX, { x: 0, y: yHead - 0.02, z: fz + 0.012, sx: 0.034, sy: 0.055, sz: 0.04, color: shadeHex(skin, 0.92) })
  b.add(BOX, { x: 0, y: yHead - 0.085, z: fz - 0.012, rz: spec.angry ? 0 : 0, sx: 0.06, sy: 0.013, sz: 0.014, color: 0x7a3a33 })
  for (const s of [1, -1]) b.add(SPHERE_LO, { x: s * hr * 0.98, y: yHead - 0.005, z: 0, sx: 0.026, sy: 0.046, sz: 0.034, color: skin }) // ears
  if (spec.mustache) b.add(BOX, { x: 0, y: yHead - 0.058, z: fz, sx: 0.1, sy: 0.026, sz: 0.022, color: spec.mustache })
  if (spec.beard) b.add(SPHERE, { x: 0, y: yHead - 0.085, z: 0.05, sx: hr * 0.95, sy: hr * (spec.beardLong ? 1.2 : 0.7), sz: hr * 0.7, color: spec.beard })
  if (spec.glasses || spec.sunglasses) {
    const gc = spec.sunglasses ? 0x111111 : 0x2a2a2a
    for (const s of [1, -1]) b.add(BOX, { x: s * 0.062, y: yHead + 0.02, z: fz + 0.014, sx: 0.07, sy: spec.sunglasses ? 0.045 : 0.05, sz: 0.008, color: spec.sunglasses ? gc : 0x9ec0dc })
    b.add(BOX, { x: 0, y: yHead + 0.024, z: fz + 0.014, sx: 0.15, sy: 0.01, sz: 0.008, color: gc })
  }
  if (spec.goldTooth) b.add(BOX, { x: 0.012, y: yHead - 0.07, z: fz + 0.003, sx: 0.014, sy: 0.012, sz: 0.01, color: 0xe6c04a, emit: 0.3 })

  // hair
  const hs = spec.hair?.style ?? 'short'
  if (hs !== 'none' && hs !== 'bald') {
    // cap of hair tilted back so it never covers the eyes, plus the back of the head
    b.add(CAP, { x: 0, y: yHead + 0.005, z: -0.012, rx: -0.32, sx: hr * 1.07, sy: hr * 1.1, sz: hr * 1.08, color: hairC })
    b.add(SPHERE_LO, { x: 0, y: yHead - 0.01, z: -hr * 0.36, sx: hr * 0.98, sy: hr * 0.98, sz: hr * 0.72, color: hairC })
    if (hs === 'long') b.add(BOX, { x: 0, y: yHead - 0.16, z: -hr * 0.7, sx: hr * 1.9, sy: 0.3, sz: hr * 0.5, color: hairC })
    if (hs === 'bun') b.add(SPHERE_LO, { x: 0, y: yHead + 0.1, z: -hr * 0.85, sx: 0.065, sy: 0.065, sz: 0.065, color: hairC })
    if (hs === 'ponytail') b.add(BOX, { x: 0, y: yHead - 0.08, z: -hr * 1.08, rx: 0.3, sx: 0.06, sy: 0.24, sz: 0.06, color: hairC })
    if (hs === 'slick') b.add(BOX, { x: 0, y: yHead + hr * 0.95, z: 0.02, sx: hr * 1.8, sy: 0.03, sz: hr * 1.6, color: hairC })
  } else if (hs === 'bald') {
    for (const s of [1, -1]) b.add(BOX, { x: s * hr * 0.9, y: yHead + 0.01, z: -0.03, sx: 0.03, sy: 0.07, sz: 0.14, color: hairC })
  }

  // hats
  const hat = spec.hat
  if (hat) {
    const hc = hat.color ?? 0x2a2a2a
    const top0 = yHead + hr * 0.62
    if (hat.style === 'kepka') {
      b.add(CYL8, { x: 0, y: top0 + 0.03, z: 0.01, sx: hr * 1.15, sy: 0.07, sz: hr * 1.25, color: hc })
      b.add(BOX, { x: 0, y: top0 - 0.005, z: hr * 1.02, rx: 0.12, sx: hr * 1.6, sy: 0.02, sz: 0.1, color: shadeHex(hc, 0.8) })
    } else if (hat.style === 'police') {
      b.add(CYL8, { x: 0, y: top0 + 0.04, z: 0, sx: hr * 1.08, sy: 0.1, sz: hr * 1.08, color: hat.band ?? 0x1a3a7a })
      b.add(CYL8, { x: 0, y: top0 + 0.1, z: 0.01, sx: hr * 1.35, sy: 0.035, sz: hr * 1.4, color: hc })
      b.add(BOX, { x: 0, y: top0 - 0.005, z: hr * 1.02, rx: 0.3, sx: hr * 1.5, sy: 0.02, sz: 0.1, color: 0x111111 })
      b.add(BOX, { x: 0, y: top0 + 0.06, z: hr * 1.09, sx: 0.05, sy: 0.05, sz: 0.012, color: 0xd9b33a })
    } else if (hat.style === 'basma') {
      // headscarf: covers crown, back and sides, frames the face, knot under the chin
      b.add(CAP, { x: 0, y: yHead + 0.01, z: -0.02, rx: -0.42, sx: hr * 1.2, sy: hr * 1.22, sz: hr * 1.18, color: hc })
      b.add(SPHERE_LO, { x: 0, y: yHead - 0.02, z: -hr * 0.34, sx: hr * 1.12, sy: hr * 1.1, sz: hr * 0.84, color: hc })
      for (const s of [1, -1]) b.add(BOX, { x: s * hr * 0.98, y: yHead - 0.03, z: hr * 0.1, rz: s * 0.08, sx: 0.05, sy: hr * 1.7, sz: hr * 1.1, color: hc })
      b.add(CONE, { x: 0, y: yHead - 0.14, z: -hr * 0.95, rx: Math.PI + 0.3, sx: 0.13, sy: 0.2, sz: 0.06, color: hc })
      b.add(SPHERE_LO, { x: 0, y: yHead - hr * 1.02, z: hr * 0.5, sx: 0.05, sy: 0.04, sz: 0.04, color: hc })
      if (hat.dots) for (let i = 0; i < 9; i++) { const a = -1.6 + i * 0.4; b.add(SPHERE_LO, { x: Math.sin(a) * hr * 1.15, y: yHead + 0.06 + (i % 3) * 0.03, z: Math.cos(a) * -hr * 0.6 - 0.02, sx: 0.024, sy: 0.024, sz: 0.024, color: hat.dots }) }
    } else if (hat.style === 'tinfoil') {
      b.add(CONE, { x: 0, y: top0 + 0.11, z: -0.01, sx: hr * 1.05, sy: 0.3, sz: hr * 1.05, color: 0xc9ced4 })
    } else if (hat.style === 'beanie') {
      b.add(CAP, { x: 0, y: yHead + 0.02, z: -0.01, rx: -0.2, sx: hr * 1.12, sy: hr * 1.25, sz: hr * 1.12, color: hc })
    } else if (hat.style === 'fedora') {
      b.add(CYL8, { x: 0, y: top0 + 0.02, z: 0, sx: hr * 1.9, sy: 0.02, sz: hr * 1.9, color: hc })
      b.add(tapered(0.13, 0.15, 8), { x: 0, y: top0 + 0.1, z: 0, sy: 0.14, color: hc })
      b.add(tapered(0.152, 0.152, 8), { x: 0, y: top0 + 0.05, z: 0, sy: 0.03, color: hat.band ?? 0x5a1a1a })
    } else if (hat.style === 'ushanka') {
      b.add(SPHERE, { x: 0, y: yHead + 0.04, z: 0, sx: hr * 1.3, sy: hr * 1.05, sz: hr * 1.25, color: hc })
      for (const s of [1, -1]) b.add(BOX, { x: s * hr * 1.15, y: yHead - 0.04, z: 0, sx: 0.04, sy: 0.14, sz: 0.14, color: hc })
    } else if (hat.style === 'hardhat') {
      b.add(CAP, { x: 0, y: yHead + 0.03, z: 0, sx: hr * 1.2, sy: hr * 1.05, sz: hr * 1.25, color: hc })
      b.add(CYL8, { x: 0, y: yHead + 0.05, z: 0.02, sx: hr * 1.35, sy: 0.015, sz: hr * 1.45, color: hc })
    }
  }

  const geometry = b.build()

  // ---- skeleton ------------------------------------------------------------------
  const bones = BONE_NAMES.map((n) => { const bn = new THREE.Bone(); bn.name = n; return bn })
  const [root, hips, spine, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR] = bones
  root.add(hips); hips.position.set(0, yHip, 0)
  hips.add(spine); spine.position.set(0, yWaist - yHip, 0)
  spine.add(head); head.position.set(0, yNeck - yWaist, 0)
  spine.add(armL); armL.position.set(sx, yShoulder - yWaist, 0)
  armL.add(foreL); foreL.position.set(0, -0.29 * H, 0)
  spine.add(armR); armR.position.set(-sx, yShoulder - yWaist, 0)
  armR.add(foreR); foreR.position.set(0, -0.29 * H, 0)
  hips.add(legL); legL.position.set(lx, 0, 0)
  legL.add(shinL); shinL.position.set(0, yKnee - yHip, 0)
  hips.add(legR); legR.position.set(-lx, 0, 0)
  legR.add(shinR); shinR.position.set(0, yKnee - yHip, 0)

  const mesh = new THREE.SkinnedMesh(geometry, sharedMaterial())
  mesh.add(root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = true
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6)
  mesh.userData.bones = Object.fromEntries(BONE_NAMES.map((n, i) => [n, bones[i]]))
  mesh.userData.rest = bones.map((bn) => bn.position.clone())
  mesh.userData.heights = { yHip, yKnee, yShoulder, yHead, H }
  return mesh
}

let _mat = null
export function sharedMaterial() {
  if (!_mat) {
    _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 })
    _mat.envMapIntensity = 0.6
  }
  return _mat
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex()
}
