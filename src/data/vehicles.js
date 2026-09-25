import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'

// Vehicle catalogue. KayKit cars (CC0) are recoloured through the palette atlas;
// Chișinău-specific vehicles (trolleybus, rutieră, G-Wagon, Jiguli) are procedural.

export const VEHICLES = {
  logan: { name: 'Dacia Logan', kay: 'car_sedan', body: 'steel', colors: ['white', 'silver', 'grey', 'steel', 'maroon', 'beige'], mass: 1150, maxSpeed: 42, accel: 10.5, grip: 7.5, steer: 0.62, dims: [0.98, 0.62, 2.2], ride: 0.34, price: 0 },
  hatch: { name: 'Hatchback', kay: 'car_hatchback', body: 'red', colors: ['red', 'blue', 'yellow', 'white', 'teal', 'orange'], mass: 1000, maxSpeed: 40, accel: 11.5, grip: 8, steer: 0.66, dims: [0.98, 0.62, 1.9], ride: 0.34 },
  combi: { name: 'Combi', kay: 'car_stationwagon', body: 'green', colors: ['green', 'silver', 'beige', 'blue', 'maroon', 'forest'], mass: 1250, maxSpeed: 40, accel: 9.5, grip: 7.2, steer: 0.6, dims: [0.98, 0.62, 2.2], ride: 0.34 },
  taxi: { name: 'Taxi', kay: 'car_taxi', body: 'yellow', colors: ['yellow'], mass: 1150, maxSpeed: 43, accel: 10.5, grip: 7.6, steer: 0.62, dims: [0.98, 0.62, 2.2], ride: 0.34, taxi: true },
  police: { name: 'Poliția', kay: 'car_police', body: 'black', colors: ['blue'], mass: 1300, maxSpeed: 48, accel: 13, grip: 8.2, steer: 0.64, dims: [0.98, 0.62, 2.2], ride: 0.34, police: true },
  jiguli: { name: 'Jiguli 2107', proc: 'jiguli', colors: [0xd8c8a0, 0x8a2a2a, 0x2a4a7a, 0xe8e4d8, 0x3a6a4a], mass: 1050, maxSpeed: 36, accel: 8.5, grip: 7, steer: 0.6, dims: [0.86, 0.6, 2.05], ride: 0.3 },
  gwagon: { name: 'Mercedes G', proc: 'gwagon', colors: [0x121316], mass: 2400, maxSpeed: 46, accel: 11, grip: 8, steer: 0.55, dims: [1.0, 0.95, 2.3], ride: 0.42 },
  rutiera: { name: 'Rutieră', proc: 'rutiera', colors: [0xf2c12e], mass: 3000, maxSpeed: 34, accel: 7, grip: 6.8, steer: 0.5, dims: [1.05, 1.2, 3.4], ride: 0.4 },
  trolleybus: { name: 'Troleibuz', proc: 'trolleybus', colors: [0xf1f1ec], mass: 11000, maxSpeed: 20, accel: 3.8, grip: 7, steer: 0.4, dims: [1.25, 1.35, 6.0], ride: 0.45, trolley: true },
}

export const TRAFFIC_MIX = ['logan', 'logan', 'logan', 'hatch', 'combi', 'taxi', 'jiguli', 'jiguli', 'logan', 'hatch', 'gwagon', 'rutiera']

function wheel(g, x, y, z, r = 0.34, w = 0.26) {
  g.cyl(r, r, w, 16, { x, y, z, rz: Math.PI / 2, center: true, color: 0x151518 })
  g.cyl(r * 0.6, r * 0.6, w + 0.02, 12, { x, y, z, rz: Math.PI / 2, center: true, color: 0x9aa0a6 })
  g.cyl(r * 0.22, r * 0.22, w + 0.04, 8, { x, y, z, rz: Math.PI / 2, center: true, color: 0x5a5e62 })
}

// ---- helpers for profiled bodies ----------------------------------------------------------
// GeoBuilder.extrude lays a polygon [[u, v]] in X/Z and extrudes along +Y; this matrix turns it
// into a car side profile: u -> Z (length), v -> Y (height), extrusion -> X (width), centred on x
const _M = new THREE.Matrix4()
function sideM(x, w) { return _M.clone().set(0, 1, 0, x - w / 2, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1) }
function profile(b, pts, w, color, x = 0, emit = 0) { b.extrude(pts, w, { matrix: sideM(x, w), color, emit }) }
// a thin panel of the same kind laid on both flanks (windows, wheel arches, trim)
function flanks(b, pts, halfW, color, t = 0.012, emit = 0) {
  profile(b, pts, t, color, halfW + t / 2, emit)
  profile(b, pts, t, color, -halfW - t / 2, emit)
}
const GLASS = -1 // emit flag: the vehicle material renders these vertices as glass
function glassFlanks(b, pts, halfW, color) { flanks(b, pts, halfW, color, 0.012, GLASS) }
// glass laid on a sloped part of the profile, between points A and B, inset from the edges
function slopeGlass(b, A, B, w, color, inset = 0.06, lift = 0.012) {
  const du = B[0] - A[0], dv = B[1] - A[1], L = Math.hypot(du, dv)
  const cu = (A[0] + B[0]) / 2, cv = (A[1] + B[1]) / 2
  // outward normal of the profile edge (A -> B runs around the outline)
  let nz = dv / L, ny = -du / L
  if (ny < 0) { nz = -nz; ny = -ny }
  b.box(w, 0.012, L - inset * 2, { x: 0, y: cv + ny * lift, z: cu + nz * lift, rx: Math.atan2(-dv, du), center: true, color, emit: GLASS })
}
function semicircle(r, n = 10) {
  const pts = []
  for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]) }
  return pts
}
function arches(b, wheels, halfW, r, color = 0x121214) {
  for (const [, y, z] of wheels) {
    if (z === undefined) continue
    const pts = semicircle(r + 0.06).map(([u, v]) => [z + u, y + v - 0.02])
    flanks(b, pts, halfW, color, 0.014)
  }
}
function uniqZ(wheels) { const seen = new Set(); return wheels.filter(([x, , z]) => (x > 0 && !seen.has(z) && seen.add(z))) }

// builds { body, wheel, wheelPos[], lights{head,tail}, poles }
export function buildProcVehicle(kind, color) {
  const b = new GeoBuilder()
  const glass = 0x2c3a46, dark = 0x1a1a1c, chrome = 0xc9ced4, rubber = 0x202022
  let wheels = [], head = [], tail = [], r = 0.34, extra = {}
  if (kind === 'jiguli') {
    // VAZ-2107: three-box saloon, long bonnet, upright glasshouse, chrome and square lamps
    const W = 1.62, hw = W / 2
    const body = [[-2.06, 0.3], [2.06, 0.3], [2.06, 0.8], [1.98, 0.86], [1.05, 0.92], [0.5, 1.39], [-0.9, 1.39], [-1.28, 0.95], [-1.98, 0.9], [-2.06, 0.82]]
    profile(b, body, W, color)
    // glasshouse: windscreen, rear screen, side windows with pillars left in body colour
    slopeGlass(b, [1.05, 0.92], [0.5, 1.39], W - 0.16, glass)
    slopeGlass(b, [-1.28, 0.95], [-0.9, 1.39], W - 0.16, glass)
    glassFlanks(b, [[0.98, 0.97], [0.47, 1.33], [0.02, 1.33], [0.02, 0.97]], hw, glass)
    glassFlanks(b, [[-0.08, 0.97], [-0.08, 1.33], [-0.84, 1.33], [-1.17, 0.99]], hw, glass)
    // chrome belt line and rubber rub strip
    flanks(b, [[-2.0, 0.9], [1.98, 0.88], [1.98, 0.92], [-2.0, 0.94]], hw, chrome, 0.01)
    flanks(b, [[-2.05, 0.58], [2.05, 0.58], [2.05, 0.64], [-2.05, 0.64]], hw, rubber, 0.018)
    // door seams and handles
    for (const [z, top] of [[1.0, 0.9], [-0.05, 1.3], [-1.2, 0.92]]) flanks(b, [[z, 0.36], [z + 0.012, 0.36], [z + 0.012, top], [z, top]], hw, 0x2a2a2c, 0.004)
    for (const z of [0.2, -0.95]) flanks(b, [[z, 0.8], [z + 0.14, 0.8], [z + 0.14, 0.83], [z, 0.83]], hw, chrome, 0.02)
    // grille with slats between square headlamps, chrome bumpers
    b.box(0.72, 0.26, 0.04, { y: 0.48, z: 2.07, color: dark })
    for (let i = 0; i < 4; i++) b.box(0.7, 0.02, 0.05, { y: 0.51 + i * 0.06, z: 2.08, color: chrome })
    for (const s of [-1, 1]) b.box(0.42, 0.26, 0.04, { x: s * 0.58, y: 0.48, z: 2.065, color: chrome })
    b.box(1.72, 0.12, 0.14, { y: 0.28, z: 2.1, color: chrome }); b.box(1.72, 0.05, 0.16, { y: 0.34, z: 2.1, color: rubber })
    b.box(1.72, 0.12, 0.14, { y: 0.28, z: -2.1, color: chrome }); b.box(1.72, 0.05, 0.16, { y: 0.34, z: -2.1, color: rubber })
    b.box(0.5, 0.12, 0.02, { y: 0.52, z: -2.07, color: 0xe8e2c8 }) // number plate
    // mirrors
    for (const s of [-1, 1]) b.box(0.08, 0.1, 0.14, { x: s * (hw + 0.06), y: 1.0, z: 0.88, color: dark })
    head = [[-0.58, 0.61, 2.075], [0.58, 0.61, 2.075]]
    tail = [[-0.6, 0.68, -2.07], [0.6, 0.68, -2.07]]
    wheels = [[0.78, 0.3, 1.3], [-0.78, 0.3, 1.3], [0.78, 0.3, -1.3], [-0.78, 0.3, -1.3]]; r = 0.3
    arches(b, uniqZ(wheels), hw, r)
  } else if (kind === 'gwagon') {
    // Mercedes G: a brick with round lamps, flared arches, spare wheel on the back door
    const W = 1.86, hw = W / 2
    const body = [[-2.3, 0.4], [2.3, 0.4], [2.32, 1.05], [2.2, 1.18], [1.22, 1.22], [1.05, 2.02], [-2.2, 2.02], [-2.3, 1.95]]
    profile(b, body, W, color)
    slopeGlass(b, [1.22, 1.22], [1.05, 2.02], W - 0.18, glass, 0.05)
    // tinted side glass in three panes and the rear door window
    glassFlanks(b, [[1.0, 1.3], [0.9, 1.92], [0.2, 1.92], [0.2, 1.3]], hw, 0x10161c)
    glassFlanks(b, [[0.08, 1.3], [0.08, 1.92], [-0.95, 1.92], [-0.95, 1.3]], hw, 0x10161c)
    glassFlanks(b, [[-1.07, 1.3], [-1.07, 1.92], [-2.12, 1.92], [-2.12, 1.3]], hw, 0x10161c)
    b.box(1.3, 0.55, 0.02, { y: 1.35, z: -2.31, color: 0x10161c, emit: GLASS })
    // flared black arches and side steps
    wheels = [[0.86, 0.42, 1.55], [-0.86, 0.42, 1.55], [0.86, 0.42, -1.5], [-0.86, 0.42, -1.5]]; r = 0.42
    arches(b, uniqZ(wheels), hw, r, 0x0a0a0b)
    for (const s of [-1, 1]) b.box(0.18, 0.06, 2.2, { x: s * (hw + 0.08), y: 0.42, z: 0.02, color: 0x2a2a2c })
    // grille, round lamps with chrome rings, bumper, indicators on the wings
    b.box(1.0, 0.42, 0.04, { y: 0.62, z: 2.33, color: dark })
    for (let i = 0; i < 3; i++) b.box(0.96, 0.03, 0.05, { y: 0.7 + i * 0.12, z: 2.35, color: chrome })
    for (const s of [-1, 1]) b.cyl(0.13, 0.13, 0.05, 14, { x: s * 0.72, y: 0.93, z: 2.33, rx: Math.PI / 2, center: true, color: chrome })
    for (const s of [-1, 1]) b.box(0.14, 0.1, 0.1, { x: s * 0.8, y: 1.28, z: 2.1, color: 0xf0a030, emit: 0.2 })
    b.box(2.0, 0.18, 0.2, { y: 0.3, z: 2.36, color: 0x2a2a2c })
    b.box(2.0, 0.18, 0.2, { y: 0.3, z: -2.34, color: 0x2a2a2c })
    b.cyl(0.4, 0.4, 0.25, 16, { y: 1.05, z: -2.45, rx: Math.PI / 2, center: true, color: dark })
    b.cyl(0.24, 0.24, 0.27, 12, { y: 1.05, z: -2.45, rx: Math.PI / 2, center: true, color: 0x9aa0a6 })
    for (const s of [-1, 1]) b.box(0.1, 0.14, 0.2, { x: s * (hw + 0.07), y: 1.55, z: 1.0, color: dark })
    head = [[-0.72, 0.93, 2.36], [0.72, 0.93, 2.36]]
    tail = [[-0.82, 0.9, -2.31], [0.82, 0.9, -2.31]]
    extra.flags = true
  } else if (kind === 'rutiera') {
    // Mercedes Sprinter minibus: raked nose, high roof, a row of windows, route board
    const W = 2.0, hw = W / 2
    const body = [[-3.3, 0.36], [3.3, 0.36], [3.35, 0.9], [3.1, 1.2], [2.35, 1.42], [1.75, 2.45], [-3.25, 2.5], [-3.3, 2.35]]
    profile(b, body, W, color)
    slopeGlass(b, [2.35, 1.42], [1.75, 2.45], W - 0.2, glass, 0.08)
    // cab door window, sliding door, passenger windows
    glassFlanks(b, [[2.25, 1.45], [1.8, 2.3], [1.25, 2.3], [1.25, 1.45]], hw, glass)
    const wins = [[1.1, 0.45], [0.5, -0.35], [-0.5, -1.35], [-1.5, -2.35], [-2.5, -3.15]]
    for (const [z0, z1] of wins) glassFlanks(b, [[z0, 1.5], [z0, 2.25], [z1, 2.25], [z1, 1.5]], hw, glass)
    flanks(b, [[1.2, 0.45], [1.2, 2.3], [1.17, 2.3], [1.17, 0.45]], hw, 0x3a3a3a, 0.006)
    flanks(b, [[-3.3, 0.9], [3.3, 0.9], [3.3, 1.02], [-3.3, 1.02]], hw, 0x2f5bb0, 0.01) // blue stripe
    b.box(1.8, 0.8, 0.02, { y: 1.55, z: -3.31, color: glass, emit: GLASS })
    b.box(1.0, 0.32, 0.05, { y: 2.18, z: 1.98, rx: -0.95, color: 0xf2f2f2, emit: 0.8 }) // route board behind the windscreen
    b.box(0.9, 0.34, 0.04, { y: 0.66, z: 3.34, color: dark })
    b.box(2.04, 0.16, 0.18, { y: 0.36, z: 3.36, color: 0x3a3a3c })
    b.box(2.04, 0.16, 0.18, { y: 0.36, z: -3.34, color: 0x3a3a3c })
    for (const s of [-1, 1]) b.box(0.08, 0.26, 0.12, { x: s * (hw + 0.07), y: 1.7, z: 2.2, color: dark })
    head = [[-0.72, 0.9, 3.28], [0.72, 0.9, 3.28]]
    tail = [[-0.9, 0.9, -3.31], [0.9, 0.9, -3.31]]
    wheels = [[0.9, 0.38, 2.3], [-0.9, 0.38, 2.3], [0.9, 0.38, -2.2], [-0.9, 0.38, -2.2]]; r = 0.38
    arches(b, uniqZ(wheels), hw, r)
  } else if (kind === 'trolleybus') {
    // Chișinău white-green trolleybus, route 22
    b.box(2.5, 2.55, 11.8, { y: 0.45, color })
    b.box(2.52, 1.05, 10.6, { y: 1.55, z: -0.4, color: glass, emit: GLASS })
    b.box(2.3, 1.3, 0.08, { y: 1.35, z: 5.9, color: glass, emit: GLASS })
    b.box(2.53, 0.34, 11.82, { y: 1.12, color: 0x2f8a5a })
    b.box(2.53, 0.2, 11.82, { y: 0.45, color: 0x5a6068 })
    b.box(2.2, 0.35, 8.5, { y: 3.0, z: -1, color: 0xd9dcd6 })
    b.box(1.1, 0.32, 0.06, { y: 2.72, z: 5.92, color: 0x111111 })
    b.box(0.45, 0.24, 0.05, { y: 2.72, z: 5.95, color: 0xffb020, emit: 1 }) // "22"
    for (const dz of [2.8, -0.5, -3.9]) b.box(0.06, 2.1, 1.3, { x: -1.27, y: 0.55, z: dz, color: 0x3a4652 })
    // trolley poles reaching up to the overhead wires
    for (const dx of [-0.3, 0.3]) {
      b.box(0.07, 0.07, 6.2, { x: dx, y: 3.4 + 1.2, z: -2.6 - 2.6, rx: 0.4, color: 0x2a2a2a })
    }
    head = [[-0.85, 0.85, 5.91], [0.85, 0.85, 5.91]]
    tail = [[-1.0, 0.95, -5.91], [1.0, 0.95, -5.91]]
    wheels = [[1.1, 0.5, 3.9], [-1.1, 0.5, 3.9], [1.1, 0.5, -3.4], [-1.1, 0.5, -3.4]]; r = 0.5
  }
  const body = b.build()
  const wb = new GeoBuilder()
  wheel(wb, 0, 0, 0, r, r * 0.75)
  return { body, wheelGeo: wb.build(), wheels, head, tail, r, ...extra }
}
