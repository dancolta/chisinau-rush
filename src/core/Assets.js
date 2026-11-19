import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// KayKit City Builder Bits (CC0, Kay Lousberg) are authored at ~1 unit = 4.8 m.
export const KAY = 4.8
const BASE = import.meta.env.BASE_URL || './'

const KAY_MODELS = [
  'bench', 'box_A', 'box_B', 'bush', 'dumpster', 'firehydrant', 'streetlight',
  'trafficlight_A', 'trafficlight_B', 'trafficlight_C', 'trash_A', 'trash_B', 'watertower',
  'building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase',
  'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase',
  'car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi',
]

// Kenney Starter Kit Racing vehicles (MIT), moved onto the KayKit atlas by tools/kenney-convert.mjs;
// authored at 1 unit = 1 m but toy-sized, so each gets its own scale next to the KayKit cars
export const KENNEY_SCALE = {
  'vehicle-truck-red': 1.5, 'vehicle-truck-green': 1.5, 'vehicle-truck-purple': 1.5, 'vehicle-truck-yellow': 1.5,
  'vehicle-motorcycle': 0.9,
}

const AUDIO = [
  'engine', 'engine-motorcycle', 'skid', 'impact', 'jump', 'land', 'fall', 'walking', 'coin', 'break',
  'ambience', 'toggle', 'placement-a', 'rotate',
]

// palette atlas cells (8 x 4, v measured from the top like glTF)
export const CELL = {
  black: [0, 0], white: [1, 0], silver: [2, 0], graphite: [3, 0], tyre: [4, 0], terracotta: [5, 0], maroon: [6, 0], orange: [7, 0],
  sky: [0, 1], blue: [1, 1], steel: [2, 1], yellow: [3, 1], red: [4, 1], beige: [5, 1], taupe: [6, 1], mocha: [7, 1],
  lime: [0, 2], teal: [1, 2], green: [2, 2], forest: [3, 2], grey: [4, 2], cream: [5, 2], magenta: [6, 2], coral: [7, 2],
}

export class Assets {
  constructor() {
    this.gltf = new GLTFLoader()
    this.texLoader = new THREE.TextureLoader()
    this.kay = {}
    this.audioData = {}
    this.textures = {}
  }

  async load(onProgress = () => {}) {
    let done = 0
    const total = KAY_MODELS.length + Object.keys(KENNEY_SCALE).length + AUDIO.length + 4
    const tick = (label) => { done++; onProgress(done / total, label) }

    const atlas = await this.texLoader.loadAsync(BASE + 'assets/kaykit/citybits_texture.png')
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.flipY = false
    atlas.magFilter = THREE.LinearFilter
    atlas.minFilter = THREE.LinearMipmapLinearFilter
    atlas.anisotropy = 4
    this.textures.atlas = atlas
    tick('texturi')

    for (const name of ['smoke', 'particle', 'blob_shadow']) {
      const t = await this.texLoader.loadAsync(BASE + `assets/tex/${name}.png`)
      t.colorSpace = THREE.SRGBColorSpace
      this.textures[name] = t
      tick('texturi')
    }

    this.atlasPixels = readPixels(atlas.image)
    await Promise.all(KAY_MODELS.map(async (name) => {
      const g = await this.gltf.loadAsync(BASE + `assets/kaykit/${name}.gltf`)
      const k = this.bakeKay(g.scene, name)
      if (name.startsWith('building')) k.wallColor = this.wallColor(k.geometry)
      this.kay[name.replace('_withoutBase', '')] = k
      tick('modele 3D')
    }))
    await Promise.all(Object.entries(KENNEY_SCALE).map(async ([name, s]) => {
      const g = await this.gltf.loadAsync(BASE + `assets/kenney/${name}.gltf`)
      this.kay[name] = this.bakeKay(g.scene, name, s)
      tick('modele 3D')
    }))

    await Promise.all(AUDIO.map(async (name) => {
      try {
        const r = await fetch(BASE + `assets/audio/${name}.ogg`)
        this.audioData[name] = await r.arrayBuffer()
      } catch (e) { console.warn('audio missing', name) }
      tick('sunete')
    }))
  }

  // Bakes a KayKit scene into metre-scaled geometry. Cars keep their wheels separate.
  bakeKay(root, name, s = KAY) {
    root.updateMatrixWorld(true)
    const isCar = name.startsWith('car_') || name.startsWith('vehicle-')
    const body = []
    const wheels = []
    const scale = new THREE.Matrix4().makeScale(s, s, s)
    root.traverse((o) => {
      if (!o.isMesh) return
      if (o.material && o.material.map) { o.material.map.dispose() }
      const g = o.geometry.clone()
      if (isCar && /wheel/.test(o.name + (o.parent ? o.parent.name : ''))) {
        // wheel: keep geometry centred at its pivot; remember pivot offset in metres
        const node = /wheel/.test(o.name) ? o : o.parent
        const pivot = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).multiplyScalar(s)
        const local = new THREE.Matrix4().copy(o.matrixWorld)
        local.premultiply(new THREE.Matrix4().makeTranslation(-pivot.x / s, -pivot.y / s, -pivot.z / s))
        g.applyMatrix4(local).applyMatrix4(scale)
        wheels.push({ geometry: g, pivot, name: node.name })
      } else {
        g.applyMatrix4(o.matrixWorld).applyMatrix4(scale)
        body.push(g)
      }
    })
    const geometry = mergeSimple(body)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const k = { geometry, wheels, size: geometry.boundingBox.getSize(new THREE.Vector3()) }
    if (wheels.length) {
      // body lift that puts the tyres on the road (the KayKit cars were tuned by eye at 0.336)
      wheels[0].geometry.computeBoundingBox()
      k.wheelR = wheels[0].geometry.boundingBox.max.y
      k.lift = s === KAY ? 0.336 : k.wheelR - wheels[0].pivot.y + 0.03
    }
    return k
  }

  // dominant saturated colour of a model's vertical faces (for generated rear facades)
  wallColor(geo) {
    const px = this.atlasPixels
    if (!px) return 0xc9b8a0
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv
    const acc = new Map()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i < P.count; i += 3) {
      if (Math.abs(N.getY(i)) > 0.3) continue
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2)
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
      const u = (UV.getX(i) + UV.getX(i + 1) + UV.getX(i + 2)) / 3, v = (UV.getY(i) + UV.getY(i + 1) + UV.getY(i + 2)) / 3
      const x = Math.min(px.w - 1, Math.max(0, Math.floor(u * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h)))
      const o = (y * px.w + x) * 4
      const r = px.d[o], g = px.d[o + 1], bl = px.d[o + 2]
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl)
      if (mx - mn < 40) continue // skip greys / glass / frames
      const key = (r >> 4) << 8 | (g >> 4) << 4 | (bl >> 4)
      const e = acc.get(key) || { r: 0, g: 0, b: 0, w: 0 }
      e.r += r * area; e.g += g * area; e.b += bl * area; e.w += area
      acc.set(key, e)
    }
    let best = null
    for (const e of acc.values()) if (!best || e.w > best.w) best = e
    if (!best) return 0xc9b8a0
    return new THREE.Color(best.r / best.w / 255, best.g / best.w / 255, best.b / best.w / 255).convertSRGBToLinear().getHex()
  }

  // Returns a copy of a car body geometry with one palette cell remapped to another.
  recolor(geometry, fromCell, toCell) {
    const g = geometry.clone()
    const uv = g.attributes.uv
    const du = (toCell[0] - fromCell[0]) / 8, dv = (toCell[1] - fromCell[1]) / 4
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i)
      if (Math.floor(u * 8) === fromCell[0] && Math.floor(v * 4) === fromCell[1]) uv.setXY(i, u + du, v + dv)
    }
    uv.needsUpdate = true
    return g
  }
}

function readPixels(img) {
  try {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const x = c.getContext('2d', { willReadFrequently: true })
    x.drawImage(img, 0, 0)
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }
  } catch (e) { return null }
}

// merge non-indexed/indexed geometries with position/normal/uv only
export function mergeSimple(geos) {
  let n = 0
  const parts = geos.map((g) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng })
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2)
  let o = 0
  for (const g of parts) {
    const c = g.attributes.position.count
    pos.set(g.attributes.position.array, o * 3)
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3)
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2)
    o += c
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return out
}

// place many transformed copies of an atlas geometry into one merged geometry
export function mergeTransformed(items) {
  const geos = items.map(({ geometry, matrix }) => geometry.clone().applyMatrix4(matrix))
  const g = mergeSimple(geos)
  g.computeBoundingSphere(); g.computeBoundingBox()
  return g
}
