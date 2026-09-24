import * as THREE from 'three'
import { Batches } from './Batches.js'
import { buildGround } from './Ground.js'
import { Buildings } from './Buildings.js'
import { Landmarks } from './Landmarks.js'
import { Props, addTreeGeometry } from './Props.js'
import { DynamicProps } from './DynamicProps.js'
import { makeFacadeMaterial } from './Facade.js'
import { makeAsphalt, makePaving, makePlaza, makeGrass, makeDirt, makeConcrete, SignAtlas } from '../render/Textures.js'
import { H_ROADS, V_ROADS, CURB_H, WORLD, RAIL_Z, onRoad } from './CityLayout.js'
import { mulberry } from './rng.js'

// Builds and owns the static city: ground, buildings, landmarks, props, colliders,
// plus registries (named places, lamps, parking, benches…) used by every other system.
export class World {
  constructor(game) {
    this.game = game
    this.scene = game.scene
    this.physics = game.physics
    this.assets = game.assets
    this.materials = game.materials
    this.batches = new Batches()
    this.places = {}
    this.lamps = []
    this.parkingSpots = []
    this.treeSpots = []
    this.benchSpots = []
    this.benches = []
    this.dynamicProps = []
    this.busStops = []
    this.kiosks = []
    this.signSlots = []
    this.pendingSigns = []
    this.shops = []
    this.doors = []
    this.garages = []
    this.playgrounds = []
    this.fountains = []
    this.flags = []
    this.clocks = []
    this.stalls = []
    this.clearZones = [] // circles { x, z, r }
    this.clearRects = [] // rects
    this.meshes = []
    this.footprints = [] // { x, z, hx, hz, ry } for the map
    this.trolleyLaneZ = 9.25
    // intersections with traffic lights: the boulevard crossings + a few busy ones
    this.controlled = []
    for (const h of H_ROADS) for (const v of V_ROADS) {
      if (v.ring || h.ring) continue
      if (h.boulevard || ['V3', 'V4', 'V6'].includes(v.id)) this.controlled.push({ id: `${v.id}x${h.id}`, v, h, x: v.x, z: h.z })
    }
  }

  place(id, name, x, z, extra = {}) {
    const p = { id, name, x, z, y: extra.y ?? CURB_H, ...extra }
    this.places[id] = p
    return p
  }

  keepClear(x, z) {
    if (onRoad(x, z, 0.5)) return true
    for (const c of this.clearZones) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true
    for (const r of this.clearRects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true
    return false
  }

  addTree(x, z) { this.treeSpots.push({ x, z }) }

  surfaceMaterials() {
    const tex = this.tex
    const mk = (map, opts = {}) => {
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...opts })
      m.envMapIntensity = 0.35
      return m
    }
    return {
      asphalt: mk(tex.asphalt, { roughness: 0.9 }),
      paving: mk(tex.paving, { roughness: 0.86 }),
      curb: mk(tex.concrete, { color: 0xd8d6d0, roughness: 0.9 }),
      grass: mk(tex.grass, { roughness: 1 }),
      plaza: mk(tex.plaza, { roughness: 0.8 }),
      dirt: mk(tex.dirt, { roughness: 1 }),
      concrete: mk(tex.concrete, { roughness: 0.9 }),
    }
  }

  async build(progress = () => {}) {
    this.tex = {
      asphalt: makeAsphalt(), paving: makePaving(), plaza: makePlaza(),
      grass: makeGrass(), dirt: makeDirt(), concrete: makeConcrete(),
    }
    this.signs = new SignAtlas(2048, 2048)
    progress(0.05, 'drumuri și trotuare')
    buildGround(this)
    await tick()
    progress(0.2, 'blocuri și monumente')
    this.buildings = new Buildings(this)
    new Landmarks(this, this.buildings).build()
    await tick()
    progress(0.55, 'copaci, felinare, troleibuze')
    const props = new Props(this)
    props.signQuads.push(...this.pendingSigns)
    for (const b of this.benchSpots) {
      if (onRoad(b.x, b.z)) continue
      this.batches.atlas(b.x, b.z, this.assets.kay.bench.geometry, new THREE.Matrix4().compose(new THREE.Vector3(b.x, CURB_H, b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.ry, 0)), new THREE.Vector3(1, 1, 1)), 'props')
      this.benches.push(b)
    }
    props.build()
    this.buildRails()
    this.buildOutskirts()
    await tick()
    progress(0.8, 'finisaje')
    this.dyn = new DynamicProps(this)
    this.dyn.build(this.dynamicProps)
    this.finalize()
    progress(1)
  }

  // two tracks along the southern edge with a textured ballast bed
  buildRails() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const x = c.getContext('2d')
    x.fillStyle = '#6b6259'; x.fillRect(0, 0, 256, 64)
    for (let i = 0; i < 900; i++) { x.fillStyle = ['#5a534b', '#7d7368', '#8a8176', '#4f4943'][i % 4]; x.fillRect(Math.random() * 256, Math.random() * 64, 2, 2) }
    for (let s = 0; s < 256; s += 32) { x.fillStyle = '#4a3a2c'; x.fillRect(s + 4, 6, 14, 52) }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    const len = WORLD.x1 - WORLD.x0 + 40
    t.repeat.set(len / 5.6, 1)
    const bedMat = new THREE.MeshStandardMaterial({ map: t, roughness: 1 })
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 })
    for (const z of [RAIL_Z - 4, RAIL_Z + 4]) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), bedMat)
      bed.rotation.x = -Math.PI / 2; bed.position.set((WORLD.x0 + WORLD.x1) / 2, 0.03, z)
      bed.receiveShadow = true
      this.scene.add(bed)
      for (const dz of [-0.72, 0.72]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.09), railMat)
        r.position.set((WORLD.x0 + WORLD.x1) / 2, 0.1, z + dz)
        r.receiveShadow = true
        this.scene.add(r)
      }
    }
    this.railTracks = [RAIL_Z - 4, RAIL_Z + 4]
  }

  // skyline of tall panel blocks + tree belts outside the ring road
  buildOutskirts() {
    const rnd = mulberry(8888)
    const B = this.buildings
    const nz = H_ROADS[0].z - H_ROADS[0].w / 2 - 22
    for (let x = WORLD.x0 + 30; x < WORLD.x1 - 30; x += rnd.range(34, 52)) {
      B.panel({ cx: x, cz: nz - rnd.range(0, 14), len: rnd.range(28, 60), depth: 12, floors: rnd.pick([9, 9, 12, 16]), ry: Math.PI, seed: 900 + x | 0, y0: 0, entrances: false })
    }
    const wx = V_ROADS[0].x - V_ROADS[0].w / 2 - 22, ex = V_ROADS[V_ROADS.length - 1].x + V_ROADS[V_ROADS.length - 1].w / 2 + 22
    for (let z = H_ROADS[0].z + 30; z < H_ROADS[H_ROADS.length - 1].z; z += rnd.range(38, 56)) {
      B.panel({ cx: wx - rnd.range(0, 10), cz: z, len: rnd.range(28, 50), depth: 12, floors: rnd.pick([9, 12, 16]), ry: -Math.PI / 2, seed: 1300 + z | 0, y0: 0, entrances: false })
      B.panel({ cx: ex + rnd.range(0, 10), cz: z, len: rnd.range(28, 50), depth: 12, floors: rnd.pick([9, 12, 16]), ry: Math.PI / 2, seed: 1700 + z | 0, y0: 0, entrances: false })
    }
    // tree belt south of the rails and along the ring roads
    const g = (x, z) => this.batches.vcol(x, z, 'tree')
    for (let x = WORLD.x0 + 5; x < WORLD.x1 - 5; x += rnd.range(5, 9)) {
      const z = RAIL_Z + 14 + rnd.range(0, 30)
      addTreeGeometry(g(x, z), x, z, rnd)
    }
  }

  finalize() {
    const atlasTex = this.assets.textures.atlas
    const M = this.materials
    const surf = this.surfaceMaterials()
    this.surf = surf
    const markings = M.vcol({ roughness: 0.7, emissive: false, key: 'markings' })
    markings.polygonOffset = true; markings.polygonOffsetFactor = -2; markings.polygonOffsetUnits = -2
    const mats = {
      vcol: {
        static: M.vcol({ roughness: 0.85 }),
        bld: M.vcol({ roughness: 0.86, cutout: true }),
        tree: M.vcol({ roughness: 0.95, cutout: true, flat: true, emissive: false, key: 'tree' }),
        markings,
      },
      atlas: {
        props: M.atlas(atlasTex),
        bld: M.atlas(atlasTex, { cutout: true, key: 'bld' }),
      },
      flat: surf,
      facade: makeFacadeMaterial(),
    }
    this.meshes.push(...this.batches.finalize(this.scene, mats, {
      markings: { cast: false, recv: true },
    }))
  }

  update(dt) {
    if (this.dyn) this.dyn.update(dt)
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
