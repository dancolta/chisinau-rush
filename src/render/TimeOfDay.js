import * as THREE from 'three'

// Palette keyframes (sRGB hex). The 18:00 key is tuned to the title art:
// teal zenith, burnt-orange horizon, long warm light.
const KEYS = [
  { h: 0.0, top: 0x060a1a, hor: 0x1a2140, bot: 0x0b0d16, sun: 0x8fa6ff, sunI: 0.0, moonI: 0.9, hemiSky: 0x4f60a0, hemiGnd: 0x2a2a3a, hemiI: 1.0, fog: 0x141a30, stars: 1.0, cloudLit: 0x39436a, cloudShade: 0x12162a, cloud: 0.45, exposure: 1.3, lamps: 1 },
  { h: 4.8, top: 0x0b1230, hor: 0x2b2a52, bot: 0x0e0f1a, sun: 0xff8f6b, sunI: 0.0, moonI: 0.75, hemiSky: 0x4f5a94, hemiGnd: 0x262434, hemiI: 0.95, fog: 0x1d2140, stars: 0.8, cloudLit: 0x4c4a78, cloudShade: 0x15172c, cloud: 0.45, exposure: 1.26, lamps: 1 },
  { h: 5.8, top: 0x23306a, hor: 0xe98a6c, bot: 0x2b2334, sun: 0xff9868, sunI: 0.9, moonI: 0.1, hemiSky: 0x7f7fb0, hemiGnd: 0x2c2126, hemiI: 0.6, fog: 0x9c7c8c, stars: 0.2, cloudLit: 0xffb08c, cloudShade: 0x55406a, cloud: 0.5, exposure: 1.0, lamps: 0.6 },
  { h: 7.5, top: 0x3a70bf, hor: 0xf3cfa6, bot: 0x4a4a4a, sun: 0xffd4a8, sunI: 2.2, moonI: 0, hemiSky: 0xa8c0e0, hemiGnd: 0x4f4a40, hemiI: 0.7, fog: 0xc9c1b8, stars: 0, cloudLit: 0xfff0e0, cloudShade: 0x9aa4b8, cloud: 0.45, exposure: 1.0, lamps: 0 },
  { h: 12.0, top: 0x2d72d8, hor: 0xa9cbef, bot: 0x55585c, sun: 0xfff3e2, sunI: 3.0, moonI: 0, hemiSky: 0xb9d4f2, hemiGnd: 0x5a554a, hemiI: 0.75, fog: 0xbfd2e4, stars: 0, cloudLit: 0xffffff, cloudShade: 0xb4c2d4, cloud: 0.4, exposure: 1.0, lamps: 0 },
  { h: 15.5, top: 0x3170c6, hor: 0xc9d3d0, bot: 0x55524c, sun: 0xffe6c0, sunI: 2.8, moonI: 0, hemiSky: 0xb4c8e0, hemiGnd: 0x5c5448, hemiI: 0.72, fog: 0xcfcfc4, stars: 0, cloudLit: 0xfff6ea, cloudShade: 0xaab4c4, cloud: 0.45, exposure: 1.0, lamps: 0 },
  { h: 17.6, top: 0x2d6f88, hor: 0xf1a553, bot: 0x3d2c28, sun: 0xffae62, sunI: 2.5, moonI: 0, hemiSky: 0x8fb0bd, hemiGnd: 0x5e3f2c, hemiI: 0.7, fog: 0xd29a66, stars: 0, cloudLit: 0xffc27a, cloudShade: 0x7a5a6a, cloud: 0.62, exposure: 1.02, lamps: 0.15 },
  { h: 19.2, top: 0x243d6a, hor: 0xe5643c, bot: 0x2e2026, sun: 0xff7442, sunI: 1.3, moonI: 0.05, hemiSky: 0x6f7aa8, hemiGnd: 0x3a2622, hemiI: 0.62, fog: 0x93586a, stars: 0.05, cloudLit: 0xff8a52, cloudShade: 0x4c3558, cloud: 0.6, exposure: 1.05, lamps: 0.7 },
  { h: 20.4, top: 0x121b40, hor: 0x5a3e6e, bot: 0x16131e, sun: 0xff6a4a, sunI: 0.15, moonI: 0.65, hemiSky: 0x5a62a0, hemiGnd: 0x2a2432, hemiI: 0.92, fog: 0x2f2a4a, stars: 0.5, cloudLit: 0x7a5a8a, cloudShade: 0x1e1a30, cloud: 0.5, exposure: 1.26, lamps: 1 },
  { h: 22.0, top: 0x080d22, hor: 0x1f2446, bot: 0x0c0d16, sun: 0x8fa6ff, sunI: 0.0, moonI: 0.9, hemiSky: 0x4f60a0, hemiGnd: 0x2a2a3a, hemiI: 1.0, fog: 0x161b32, stars: 1.0, cloudLit: 0x3a4470, cloudShade: 0x12162a, cloud: 0.45, exposure: 1.3, lamps: 1 },
  { h: 24.0, top: 0x060a1a, hor: 0x1a2140, bot: 0x0b0d16, sun: 0x8fa6ff, sunI: 0.0, moonI: 0.9, hemiSky: 0x4f60a0, hemiGnd: 0x2a2a3a, hemiI: 1.0, fog: 0x141a30, stars: 1.0, cloudLit: 0x39436a, cloudShade: 0x12162a, cloud: 0.45, exposure: 1.3, lamps: 1 },
]

const COLOR_KEYS = ['top', 'hor', 'bot', 'sun', 'hemiSky', 'hemiGnd', 'fog', 'cloudLit', 'cloudShade']
const NUM_KEYS = ['sunI', 'moonI', 'hemiI', 'stars', 'cloud', 'exposure', 'lamps']

const _ca = new THREE.Color(), _cb = new THREE.Color()

export class TimeOfDay {
  constructor() {
    this.hour = 17.8
    this.speed = 1 / 60 // game hours per real second (1 real minute = 1 game hour)
    this.paused = false
    this.override = null // weather overlay { fog, dark }
    this.state = {}
    for (const k of COLOR_KEYS) this.state[k] = new THREE.Color()
    this.sunDir = new THREE.Vector3()
    this.moonDir = new THREE.Vector3()
    this.lightDir = new THREE.Vector3()
    this.lightColor = new THREE.Color()
    this.lightIntensity = 1
    this.evaluate()
  }

  set(h) { this.hour = ((h % 24) + 24) % 24; this.evaluate() }

  update(dt) {
    if (!this.paused) this.hour = (this.hour + dt * this.speed) % 24
    this.evaluate()
  }

  get isNight() { return this.hour < 5.6 || this.hour > 20.2 }
  get clock() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  evaluate() {
    const h = this.hour
    let i = 0
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++
    const a = KEYS[i], b = KEYS[i + 1]
    let t = (h - a.h) / Math.max(0.0001, b.h - a.h)
    t = t * t * (3 - 2 * t)
    for (const k of COLOR_KEYS) {
      _ca.setHex(a[k]); _cb.setHex(b[k])
      this.state[k].copy(_ca).lerp(_cb, t)
    }
    for (const k of NUM_KEYS) this.state[k] = a[k] + (b[k] - a[k]) * t

    // sun path: rises in the east (+x), sets in the west (-x), slightly south
    const dayT = (h - 5.6) / (20.3 - 5.6)
    const ang = dayT * Math.PI
    const elev = Math.sin(ang) * 1.05
    this.sunDir.set(Math.cos(ang), Math.max(-0.4, Math.sin(ang) * 0.9 + (elev > 0 ? 0.02 : 0)), 0.38).normalize()
    // moon: opposite side of the day, high in the sky at midnight
    const nightT = ((h + 24 - 20.3) % 24) / (24 - (20.3 - 5.6))
    const mAng = nightT * Math.PI
    this.moonDir.set(-Math.cos(mAng) * 0.8, Math.max(0.15, Math.sin(mAng) * 0.85), -0.35).normalize()

    const sunUp = this.state.sunI > 0.02 && this.sunDir.y > -0.05
    if (sunUp) {
      this.lightDir.copy(this.sunDir)
      if (this.lightDir.y < 0.12) this.lightDir.y = 0.12
      this.lightDir.normalize()
      this.lightColor.copy(this.state.sun)
      this.lightIntensity = this.state.sunI
    } else {
      this.lightDir.copy(this.moonDir)
      this.lightColor.set(0x9fb2ff)
      this.lightIntensity = this.state.moonI
    }
    // blend sun->moon around the transitions so shadows don't pop
    if (this.state.sunI < 0.4 && this.state.moonI > 0.01 && sunUp) {
      const k = this.state.sunI / 0.4
      this.lightDir.lerp(this.moonDir, 1 - k).normalize()
      this.lightIntensity = Math.max(this.state.sunI, this.state.moonI * (1 - k))
    }
  }
}
