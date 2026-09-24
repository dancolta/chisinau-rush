import * as THREE from 'three'
import { GeoBuilder } from '../render/GeoBuilder.js'
import { FILTER } from '../physics/Physics.js'
import { CURB_H } from './CityLayout.js'

// Knock-over-able street clutter: bins, crates, cones, dumpsters, a mountain of
// watermelons at the market. Rapier bodies (asleep until hit) + one InstancedMesh per type.

function buildBin() {
  const g = new GeoBuilder()
  g.cyl(0.3, 0.26, 0.85, 10, { y: -0.45, color: 0x3f6b4f })
  g.cyl(0.33, 0.33, 0.08, 10, { y: 0.4, color: 0x2f5a3f })
  return g.build()
}
function buildCrate() {
  const g = new GeoBuilder()
  g.box(0.8, 0.55, 0.6, { y: -0.275, color: 0xa87a44 })
  g.box(0.82, 0.08, 0.62, { y: -0.05, color: 0x8a6034 })
  for (let i = 0; i < 4; i++) g.sphere(0.12, 6, 4, { x: -0.25 + (i % 2) * 0.5, y: 0.02, z: -0.12 + Math.floor(i / 2) * 0.24, color: i % 2 ? 0xd9442b : 0xe6a82a })
  return g.build()
}
function buildMelon() {
  const g = new GeoBuilder()
  g.sphere(0.3, 10, 8, { sy: 0.88, color: 0x2f6b2c })
  g.sphere(0.302, 10, 8, { sy: 0.885, sx: 0.4, color: 0x5d9a3c })
  return g.build()
}
function buildCone() {
  const g = new GeoBuilder()
  g.box(0.42, 0.05, 0.42, { y: -0.35, color: 0x222222 })
  g.cone(0.16, 0.7, 10, { y: -0.3, color: 0xf06a1a })
  g.cyl(0.11, 0.13, 0.12, 10, { y: -0.08, color: 0xf2f2f2 })
  return g.build()
}

export class DynamicProps {
  constructor(world) {
    this.w = world
    this.P = world.physics
    this.R = world.physics.R
    this.types = {}
    this.items = []
    this.dummy = new THREE.Object3D()
  }

  build(list) {
    const kayMat = this.w.materials.atlas(this.w.assets.textures.atlas)
    const vmat = this.w.materials.vcol({ roughness: 0.75 })
    const kayDumpster = this.w.assets.kay.dumpster.geometry.clone()
    kayDumpster.computeBoundingBox()
    const db = kayDumpster.boundingBox
    kayDumpster.translate(0, -(db.max.y - db.min.y) / 2, 0)
    const defs = {
      dumpster: { geo: kayDumpster, mat: kayMat, shape: 'box', hx: (db.max.x - db.min.x) / 2, hy: (db.max.y - db.min.y) / 2, hz: (db.max.z - db.min.z) / 2, mass: 160 },
      bin: { geo: buildBin(), mat: vmat, shape: 'box', hx: 0.3, hy: 0.45, hz: 0.3, mass: 14 },
      crate: { geo: buildCrate(), mat: vmat, shape: 'box', hx: 0.4, hy: 0.3, hz: 0.3, mass: 9 },
      watermelon: { geo: buildMelon(), mat: vmat, shape: 'ball', r: 0.28, mass: 5 },
      cone: { geo: buildCone(), mat: vmat, shape: 'box', hx: 0.2, hy: 0.35, hz: 0.2, mass: 3 },
    }
    const byType = {}
    for (const it of list) (byType[it.type] ||= []).push(it)
    for (const [type, arr] of Object.entries(byType)) {
      const d = defs[type]
      if (!d) continue
      const im = new THREE.InstancedMesh(d.geo, d.mat, arr.length)
      im.castShadow = true; im.receiveShadow = true
      im.frustumCulled = false
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.w.scene.add(im)
      this.types[type] = { ...d, mesh: im }
      arr.forEach((it, i) => {
        const hy = d.shape === 'ball' ? d.r : d.hy
        const y = CURB_H + hy + 0.01
        const body = this.P.world.createRigidBody(this.R.RigidBodyDesc.dynamic()
          .setTranslation(it.x, y, it.z)
          .setRotation({ x: 0, y: Math.sin((it.ry || 0) / 2), z: 0, w: Math.cos((it.ry || 0) / 2) })
          .setLinearDamping(0.4).setAngularDamping(0.8).setSleeping(true))
        const cd = d.shape === 'ball' ? this.R.ColliderDesc.ball(d.r) : this.R.ColliderDesc.cuboid(d.hx, d.hy, d.hz)
        cd.setMass(d.mass).setFriction(0.7).setRestitution(d.shape === 'ball' ? 0.35 : 0.1).setCollisionGroups(FILTER.PROP)
          .setActiveEvents(this.R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(d.mass * 30)
        const col = this.P.world.createCollider(cd, body)
        const item = { type, body, col, index: i, home: { x: it.x, y, z: it.z, ry: it.ry || 0 }, prop: true }
        this.P.user.set(col.handle, item)
        this.items.push(item)
        this.write(item)
      })
      im.instanceMatrix.needsUpdate = true
    }
  }

  write(item) {
    const t = item.body.translation(), r = item.body.rotation()
    const d = this.dummy
    d.position.set(t.x, t.y, t.z)
    d.quaternion.set(r.x, r.y, r.z, r.w)
    d.updateMatrix()
    this.types[item.type].mesh.setMatrixAt(item.index, d.matrix)
  }

  update() {
    const dirty = new Set()
    for (const it of this.items) {
      if (it.body.isSleeping()) continue
      const t = it.body.translation()
      if (t.y < -5) { // fell through the world: put it back home
        it.body.setTranslation({ x: it.home.x, y: it.home.y, z: it.home.z }, true)
        it.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
      this.write(it)
      dirty.add(it.type)
    }
    for (const t of dirty) this.types[t].mesh.instanceMatrix.needsUpdate = true
  }
}
