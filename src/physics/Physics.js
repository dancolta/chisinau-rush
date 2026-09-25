import RAPIER from '@dimforge/rapier3d-compat'

// Collision layers (membership bits). A contact happens only when each side's
// membership intersects the other side's filter.
export const GROUP = {
  STATIC: 0x0001,
  GROUND: 0x0002,
  VEHICLE: 0x0004,
  PLAYER: 0x0008,
  PED: 0x0010,
  PROP: 0x0020,
  SENSOR: 0x0040,
  DEBRIS: 0x0080,
}
const ALL = 0xffff
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff)

export const FILTER = {
  STATIC: groups(GROUP.STATIC, ALL & ~GROUP.SENSOR),
  GROUND: groups(GROUP.GROUND, ALL & ~GROUP.SENSOR),
  VEHICLE: groups(GROUP.VEHICLE, ALL & ~GROUP.SENSOR),
  PLAYER: groups(GROUP.PLAYER, GROUP.STATIC | GROUP.GROUND | GROUP.VEHICLE | GROUP.PROP | GROUP.PED),
  // peds don't physically block cars (hits are resolved in code so nobody becomes a concrete wall)
  PED: groups(GROUP.PED, GROUP.STATIC | GROUP.GROUND | GROUP.PLAYER),
  PROP: groups(GROUP.PROP, ALL & ~GROUP.SENSOR),
  DEBRIS: groups(GROUP.DEBRIS, GROUP.STATIC | GROUP.GROUND),
  // queries
  Q_GROUND: groups(ALL, GROUP.GROUND | GROUP.STATIC),
  Q_FLOOR: groups(ALL, GROUP.GROUND),
  Q_WORLD: groups(ALL, GROUP.GROUND | GROUP.STATIC | GROUP.PROP),
  Q_SOLID: groups(ALL, GROUP.STATIC | GROUP.VEHICLE | GROUP.PROP),
  Q_CAMERA: groups(ALL, GROUP.STATIC),
  Q_CHAR_MOVE: groups(GROUP.PLAYER, GROUP.STATIC | GROUP.GROUND | GROUP.VEHICLE | GROUP.PROP),
}

export class Physics {
  static async create() {
    await RAPIER.init()
    return new Physics()
  }

  constructor() {
    this.R = RAPIER
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 })
    this.world.timestep = 1 / 60
    this.events = new RAPIER.EventQueue(true)
    this.user = new Map() // collider handle -> owner object
    this.contactHandlers = new Set()
    this.fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  }

  _rot(rotY) {
    const h = rotY * 0.5
    return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) }
  }

  // static box collider (x,y,z = centre; hx,hy,hz = half extents)
  box(x, y, z, hx, hy, hz, opts = {}) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRotation(this._rot(opts.rotY || 0))
      .setFriction(opts.friction ?? 0.6)
      .setRestitution(opts.restitution ?? 0.05)
      .setCollisionGroups(opts.groups ?? FILTER.STATIC)
    const c = this.world.createCollider(d, this.fixed)
    if (opts.user) this.user.set(c.handle, opts.user)
    return c
  }

  cylinder(x, y, z, halfH, r, opts = {}) {
    const d = RAPIER.ColliderDesc.cylinder(halfH, r)
      .setTranslation(x, y, z)
      .setFriction(opts.friction ?? 0.5)
      .setCollisionGroups(opts.groups ?? FILTER.STATIC)
    const c = this.world.createCollider(d, this.fixed)
    if (opts.user) this.user.set(c.handle, opts.user)
    return c
  }

  // arbitrary convex hull from flat [x,y,z,...] points (static)
  hull(points, opts = {}) {
    const d = RAPIER.ColliderDesc.convexHull(new Float32Array(points))
    if (!d) return null
    d.setCollisionGroups(opts.groups ?? FILTER.STATIC).setFriction(opts.friction ?? 0.6)
    return this.world.createCollider(d, this.fixed)
  }

  // an exact infinite plane at y = 0 (a giant box made the character controller's contact
  // maths lose ~0.15-0.35 m of precision, so people sank into the roads)
  ground() {
    const d = new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 }))
      .setFriction(0.9).setRestitution(0.05)
      .setCollisionGroups(FILTER.GROUND)
    return this.world.createCollider(d, this.fixed)
  }

  dynamicBox({ x, y, z, rotY = 0, hx, hy, hz, mass = 20, groups: g = FILTER.PROP, friction = 0.6, restitution = 0.15, linDamp = 0.3, angDamp = 0.6, user, ccd = false, sleeping = true }) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation(this._rot(rotY))
      .setLinearDamping(linDamp)
      .setAngularDamping(angDamp)
      .setCcdEnabled(ccd)
      .setSleeping(sleeping)
    const body = this.world.createRigidBody(bd)
    const vol = hx * hy * hz * 8
    const cd = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setDensity(mass / Math.max(vol, 0.0001))
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(g)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(mass * 25)
    const col = this.world.createCollider(cd, body)
    if (user) this.user.set(col.handle, user)
    return { body, col }
  }

  kinematicCapsule({ x, y, z, halfH = 0.5, r = 0.35, groups: g = FILTER.PED, user }) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z))
    const col = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfH, r).setCollisionGroups(g).setFriction(0.2), body)
    if (user) this.user.set(col.handle, user)
    return { body, col }
  }

  // removal is idempotent: touching a removed Rapier handle panics the whole WASM world
  remove(body) {
    if (!body || body.__removed) return
    body.__removed = true
    for (let i = 0; i < body.numColliders(); i++) this.user.delete(body.collider(i).handle)
    this.world.removeRigidBody(body)
  }

  removeCollider(col) {
    if (!col || col.__removed) return
    col.__removed = true
    this.user.delete(col.handle)
    this.world.removeCollider(col, true)
  }

  onContact(fn) { this.contactHandlers.add(fn); return () => this.contactHandlers.delete(fn) }

  step() {
    this.world.step(this.events)
    if (this.contactHandlers.size) {
      this.events.drainContactForceEvents((ev) => {
        const a = this.user.get(ev.collider1())
        const b = this.user.get(ev.collider2())
        const f = ev.totalForceMagnitude()
        const dir = ev.maxForceDirection()
        for (const h of this.contactHandlers) h(a, b, f, dir, ev)
      })
    } else {
      this.events.clear()
    }
  }

  // returns { dist, point:{x,y,z}, normal:{x,y,z}, collider, user } or null
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = FILTER.Q_WORLD, excludeBody = null) {
    const r = this._ray
    r.origin.x = ox; r.origin.y = oy; r.origin.z = oz
    r.dir.x = dx; r.dir.y = dy; r.dir.z = dz
    const hit = this.world.castRayAndGetNormal(r, maxDist, true, undefined, filter, undefined, excludeBody || undefined)
    if (!hit) return null
    const t = hit.timeOfImpact
    return {
      dist: t,
      point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
      normal: hit.normal,
      collider: hit.collider,
      user: this.user.get(hit.collider.handle),
    }
  }

  groundHeight(x, z, fromY = 50) {
    const h = this.raycast(x, fromY, z, 0, -1, 0, fromY + 5, FILTER.Q_GROUND)
    return h ? h.point.y : 0
  }

  characterController(offset = 0.03) {
    const cc = this.world.createCharacterController(offset)
    cc.setUp({ x: 0, y: 1, z: 0 })
    cc.enableAutostep(0.32, 0.15, false)
    cc.enableSnapToGround(0.35)
    cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    cc.setMinSlopeSlideAngle((60 * Math.PI) / 180)
    cc.setApplyImpulsesToDynamicBodies(true)
    cc.setCharacterMass(80)
    return cc
  }
}
