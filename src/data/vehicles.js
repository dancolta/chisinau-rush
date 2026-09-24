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
  g.cyl(r, r, w, 14, { x, y, z, rz: Math.PI / 2, center: true, color: 0x151518 })
  g.cyl(r * 0.55, r * 0.55, w + 0.02, 10, { x, y, z, rz: Math.PI / 2, center: true, color: 0x9aa0a6 })
}

// builds { body, wheel, wheelPos[], lights{head,tail}, poles }
export function buildProcVehicle(kind, color) {
  const b = new GeoBuilder()
  const glass = 0x1e2a36, dark = 0x1a1a1c, chrome = 0xc9ced4
  let wheels = [], head = [], tail = [], r = 0.34, extra = {}
  if (kind === 'jiguli') {
    // boxy VAZ-2107: long bonnet, square lamps, chrome everywhere
    b.box(1.66, 0.62, 4.1, { y: 0.2, color })
    b.box(1.5, 0.52, 2.0, { y: 0.82, z: -0.2, color })
    b.box(1.52, 0.44, 1.9, { y: 0.84, z: -0.2, color: glass })
    b.box(1.54, 0.08, 2.02, { y: 1.34, z: -0.2, color })
    b.box(1.5, 0.3, 0.06, { y: 0.35, z: 2.06, color: chrome })  // grille
    b.box(1.7, 0.12, 0.12, { y: 0.2, z: 2.05, color: chrome })  // bumpers
    b.box(1.7, 0.12, 0.12, { y: 0.2, z: -2.05, color: chrome })
    head = [[-0.55, 0.52, 2.07], [0.55, 0.52, 2.07]]
    tail = [[-0.6, 0.55, -2.06], [0.6, 0.55, -2.06]]
    wheels = [[0.78, 0.3, 1.3], [-0.78, 0.3, 1.3], [0.78, 0.3, -1.3], [-0.78, 0.3, -1.3]]; r = 0.3
  } else if (kind === 'gwagon') {
    // government-issue black brick
    b.box(1.9, 0.9, 4.6, { y: 0.35, color })
    b.box(1.84, 0.8, 2.9, { y: 1.24, z: -0.45, color })
    b.box(1.86, 0.62, 2.8, { y: 1.3, z: -0.45, color: glass })
    b.box(1.9, 0.1, 3.0, { y: 2.04, z: -0.45, color })
    b.box(1.5, 0.5, 0.06, { y: 0.62, z: 2.31, color: dark })
    for (let i = 0; i < 4; i++) b.box(1.3, 0.035, 0.07, { y: 0.66 + i * 0.1, z: 2.33, color: chrome })
    b.cyl(0.4, 0.4, 0.25, 14, { y: 1.05, z: -2.4, rx: Math.PI / 2, center: true, color: dark }) // spare wheel
    b.box(2.0, 0.16, 0.18, { y: 0.28, z: 2.32, color: 0x2a2a2c })
    head = [[-0.7, 0.95, 2.32], [0.7, 0.95, 2.32]]
    tail = [[-0.8, 0.9, -2.31], [0.8, 0.9, -2.31]]
    wheels = [[0.86, 0.42, 1.55], [-0.86, 0.42, 1.55], [0.86, 0.42, -1.5], [-0.86, 0.42, -1.5]]; r = 0.42
    extra.flags = true
  } else if (kind === 'rutiera') {
    // Mercedes Sprinter: yellow, high roof, route board, always one more seat
    b.box(2.0, 1.6, 6.6, { y: 0.35, color })
    b.box(1.96, 0.7, 5.0, { y: 1.95, z: -0.7, color })
    b.box(2.02, 0.7, 4.6, { y: 1.35, z: -0.9, color: glass })
    b.box(1.8, 0.8, 0.08, { y: 1.25, z: 3.3, rx: -0.25, color: glass })
    b.box(1.9, 0.9, 1.0, { y: 0.35, z: 2.9, color })
    b.box(0.9, 0.3, 0.05, { y: 1.75, z: 3.22, color: 0xf2f2f2, emit: 0.8 }) // route number board
    b.box(2.02, 0.1, 6.5, { y: 0.95, color: 0x2f5bb0 })
    head = [[-0.7, 0.75, 3.41], [0.7, 0.75, 3.41]]
    tail = [[-0.85, 0.8, -3.31], [0.85, 0.8, -3.31]]
    wheels = [[0.9, 0.38, 2.3], [-0.9, 0.38, 2.3], [0.9, 0.38, -2.2], [-0.9, 0.38, -2.2]]; r = 0.38
  } else if (kind === 'trolleybus') {
    // Chișinău white-green trolleybus, route 22
    b.box(2.5, 2.55, 11.8, { y: 0.45, color })
    b.box(2.52, 1.05, 10.6, { y: 1.55, z: -0.4, color: glass })
    b.box(2.3, 1.3, 0.08, { y: 1.35, z: 5.9, color: glass })
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
