import * as THREE from 'three'
import { BOUNDS } from './CityLayout.js'
import { terrainHeight, HIGHWAY } from './Terrain.js'
import { mulberry } from './rng.js'
import { SHARED } from '../render/Materials.js'

// The far horizon, past the edge scenery: the rest of Chișinău on the hills round the bowl (the
// panel-block districts of Râșcani, Ciocana, Botanica, Buiucani and Telecentru), the TV tower,
// the chimneys of CET-2, and the two towers of Porțile Orașului over the road to the airport.
// They stand on the land Terrain.js lays out and fade into the haze; at night their windows
// light up and the tall ones blink red for the planes.

const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = BOUNDS
const PANEL = [0xd3ccbc, 0xdcd5c3, 0xc0c6ca, 0xcab9a2, 0xaec0c3, 0xdfcca8, 0xcbc2cb, 0xe3dccc]

// districts: centre, spread, how many blocks, storeys
const DISTRICTS = [
  { x: -120, z: -900, r: 280, n: 38, floors: [9, 9, 12, 16] },   // Râșcani, Poșta Veche
  { x: 380, z: -760, r: 200, n: 24, floors: [9, 12, 16] },
  { x: 1060, z: -380, r: 260, n: 34, floors: [9, 9, 16] },       // Ciocana
  { x: 1180, z: 360, r: 210, n: 24, floors: [9, 12] },
  { x: -80, z: 960, r: 290, n: 40, floors: [9, 9, 12, 16] },     // Botanica
  { x: 440, z: 880, r: 190, n: 22, floors: [9, 12, 16] },
  { x: -1100, z: -430, r: 250, n: 30, floors: [9, 12, 16] },     // Buiucani
  { x: -1020, z: 400, r: 220, n: 24, floors: [9, 12] },
  { x: -640, z: 1060, r: 210, n: 22, floors: [9, 12, 16] },      // Telecentru
  { x: -820, z: -900, r: 210, n: 20, floors: [9, 16] },          // Sculeni
]

// keep the roads, the railway, the river and the highway clear
function blocked(x, z, e) {
  if (x > X1 - 20 && x < X1 + HIGHWAY.foot + 30) return true
  if ((x < X0 - 20 || x > X1 + 20) && Math.abs(z) < 60 + e) return true
  if (x > X1 && Math.abs(z - 318) < 45 + e) return true
  if (x > X1 && Math.abs(z - (Z0 - 10)) < 45 + e) return true
  // nothing out there right behind the edge scenery
  const dx = Math.max(X0 - x, x - X1, 0), dz = Math.max(Z0 - z, z - Z1, 0)
  return Math.hypot(dx, dz) < 330
}

const ground = (x, z, hw, hd, ry) => {
  const c = Math.cos(ry), s = Math.sin(ry)
  let lo = Infinity
  for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) lo = Math.min(lo, terrainHeight(x + a * c + b * s, z - a * s + b * c))
  return lo
}

export function buildHorizon(world) {
  const B = world.batches
  const rnd = mulberry(1918)
  const lights = [] // [x, y, z, phase]
  // one batch for all of it: out there it's always in view anyway
  const FAR = 1e5
  for (const d of DISTRICTS) {
    const ry0 = rnd() * Math.PI
    for (let i = 0; i < d.n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * d.r
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r
      const tower = rnd() < 0.18
      const len = tower ? rnd.range(16, 22) : rnd.range(30, 70), dep = tower ? rnd.range(15, 20) : 12
      if (blocked(x, z, len / 2)) continue
      const floors = tower ? 16 + rnd.int(0, 6) : rnd.pick(d.floors)
      const h = floors * 2.8 + 0.7
      const ry = ry0 + (rnd() < 0.5 ? 0 : Math.PI / 2) + rnd.range(-0.08, 0.08)
      const y0 = ground(x, z, len / 2, dep / 2, ry) - 1.5
      B.facade(0, 0, FAR).box(x, z, len, dep, y0, h + 1.5, ry, rnd.pick(PANEL), [2.8, 3.2, rnd() * 100, 1], 0x57534e)
      if (floors >= 16) lights.push([x, y0 + h + 3, z, rnd()])
    }
  }
  const g = () => B.vcol(0, 0, 'static_far', FAR)

  // the TV tower on the Telecentru hill: a lattice mast, red and white toward the top
  {
    const x = -760, z = 1160, y0 = terrainHeight(x, z) - 1, H = 190, v = g(x, z)
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // legs lean in toward the top
      const bx = sx * 9, bz = sz * 9, tx = sx * 1.4, tz = sz * 1.4
      const len = Math.hypot(bx - tx, H, bz - tz)
      v.box(0.9, len, 0.9, { x: x + (bx + tx) / 2, y: y0 + H / 2, z: z + (bz + tz) / 2, rx: Math.atan2(tz - bz, H), rz: -Math.atan2(tx - bx, H), center: true, color: 0x9aa0a4 })
    }
    for (let k = 1; k < 10; k++) {
      const t = k / 10, w = 18 * (1 - t) + 2.8 * t, y = y0 + H * t
      v.box(w, 0.5, 0.5, { x, y, z: z - w / 2, color: 0x9aa0a4 }); v.box(w, 0.5, 0.5, { x, y, z: z + w / 2, color: 0x9aa0a4 })
      v.box(0.5, 0.5, w, { x: x - w / 2, y, z, color: 0x9aa0a4 }); v.box(0.5, 0.5, w, { x: x + w / 2, y, z, color: 0x9aa0a4 })
    }
    v.box(9, 4, 9, { x, y: y0 + 120, z, color: 0xe9e6dc })
    for (let k = 0; k < 6; k++) v.box(3.4, 8, 3.4, { x, y: y0 + H + k * 8, z, color: k % 2 ? 0xe9e6dc : 0xc0262d })
    v.box(0.6, 26, 0.6, { x, y: y0 + H + 48, z, color: 0x9aa0a4 })
    lights.push([x, y0 + H + 74, z, 0.1], [x, y0 + H + 2, z + 1.8, 0.6], [x, y0 + 122, z + 4.6, 0.35])
  }

  // CET-2's chimneys, south-east: tall, banded red and white at the top
  for (const [x, z, H] of [[1150, 980, 180], [1195, 1010, 150], [1105, 1040, 110]]) {
    const y0 = terrainHeight(x, z) - 1, v = g(x, z)
    v.cyl(4.2, 8.5, H * 0.72, 16, { x, y: y0, z, color: 0xb8b2a6 })
    for (let k = 0; k < 6; k++) v.cyl(4.2 - 0.25 * k, 4.2 - 0.25 * (k + 1), H * 0.28 / 6, 16, { x, y: y0 + H * 0.72 + k * H * 0.28 / 6, z, color: k % 2 ? 0xe9e6dc : 0xc0262d })
    lights.push([x, y0 + H + 1, z, rnd()], [x, y0 + H * 0.55, z + 7, rnd()])
  }
  // and the power station itself at their feet
  {
    const x = 1150, z = 930, y0 = terrainHeight(x, z) - 1
    B.facade(0, 0, FAR).box(x, z, 110, 40, y0, 34, 0.2, 0xa9a397, [4.8, 4.0, 11, 2], 0x5a5752)
    B.facade(0, 0, FAR).box(x - 70, z + 40, 50, 30, y0, 22, 0.2, 0xb4ada0, [4.8, 4.0, 12, 0], 0x5a5752)
  }

  // Porțile Orașului: the city's gates, twin towers either side of Bd. Dacia on the way to the
  // airport
  for (const s of [-1, 1]) {
    const x = X1 + 560, z = s * 42, y0 = terrainHeight(x, z) - 1
    const f = B.facade(0, 0, FAR)
    f.box(x, z, 30, 16, y0, 62, 0, 0xd8d2c6, [2.8, 3.2, 40 + s, 1], 0x6a655e)
    f.box(x - 4, z + s * 2, 18, 12, y0 + 62, 8, 0, 0xcfc8ba, [2.8, 3.2, 44 + s, 1], 0x6a655e)
    g(x, z).box(2, 6, 2, { x: x - 4, y: y0 + 70, z: z + s * 2, color: 0xc0262d })
    lights.push([x - 4, y0 + 77, z + s * 2, s > 0 ? 0.5 : 0])
  }

  // aviation lights: red, blinking, seen through the haze
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lights.flatMap((l) => [l[0], l[1], l[2]]), 3))
  geo.setAttribute('phase', new THREE.Float32BufferAttribute(lights.map((l) => l[3]), 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uNight: SHARED.uNight, uScale: { value: 1 } },
    vertexShader: `
      attribute float phase;
      uniform float uTime; uniform float uNight; uniform float uScale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float on = step(0.45, fract(uTime * 0.55 + phase));
        vA = on * (0.35 + 0.65 * uNight);
        gl_PointSize = clamp(uScale * 900.0 / -mv.z, 2.0, 9.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float k = smoothstep(0.5, 0.0, length(d));
        if (vA * k < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.16, 0.08) * (1.2 + 1.6 * k), vA * k);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.name = 'aviation-lights'
  pts.frustumCulled = false
  pts.renderOrder = 3
  world.scene.add(pts)
  return pts
}
