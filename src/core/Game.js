import * as THREE from 'three'
import { Events } from './Events.js'
import { Input } from './Input.js'
import { Assets } from './Assets.js'
import { loadSettings } from './Settings.js'
import { Physics } from '../physics/Physics.js'
import { Renderer } from '../render/Renderer.js'
import { Materials } from '../render/Materials.js'
import { World } from '../world/World.js'
import { CameraRig } from './CameraRig.js'
import { Player } from '../entities/Player.js'
import { Character } from '../entities/Character.js'
import { CAST } from '../data/outfits.js'
import { Vehicles } from '../gameplay/Vehicles.js'
import { Traffic } from '../gameplay/Traffic.js'

const STEP = 1 / 60
if (import.meta.env.DEV) { window.THREE = THREE; window.__CR = { Character, CAST } }

export class Game {
  constructor({ viewport, ui }) {
    this.viewport = viewport
    this.uiRoot = ui
    this.events = new Events()
    this.state = 'loading'
    this.timeScale = 1
    this.acc = 0
    this.last = 0
    this.frame = 0
    this.systems = []
  }

  async boot(progress) {
    this.settings = loadSettings()
    progress(0.02, 'Pornim motorul…')
    this.renderer = new Renderer(this.viewport, this.settings)
    this.scene = this.renderer.scene
    this.camera = this.renderer.camera
    this.input = new Input(this.renderer.renderer.domElement)
    this.materials = new Materials()
    progress(0.05, 'Fizică…')
    this.physics = await Physics.create()
    this.physics.ground()
    this.assets = new Assets()
    await this.assets.load((p, l) => progress(0.05 + p * 0.55, 'Se încarcă ' + l + '…'))
    progress(0.65, 'Construim Chișinăul…')
    this.world = new World(this)
    await this.world.build((p, l) => progress(0.65 + p * 0.3, l ? 'Construim: ' + l + '…' : undefined))
    this.systems.push(this.world)
    this.cameraRig = new CameraRig(this)
    const spawn = this.world.places.acasa
    this.player = new Player(this, CAST.patan, { x: spawn.x, z: spawn.z + 3, ry: Math.PI })
    this.npcs = []
    this.vehicles = new Vehicles(this)
    this.traffic = new Traffic(this)
    this.systems.push(this.traffic, this.vehicles)
    if (import.meta.env.DEV && location.search.includes('lineup')) this.debugLineup()
    this.cameraRig.target.copy(this.player.pos)
    this.cameraRig.snap()
    this.renderer.applyTimeOfDay()
    this.renderer.updateEnvironment(true)
    progress(1, 'Gata')
  }

  debugLineup() {
    const keys = Object.keys(CAST)
    const p = this.player.pos
    keys.forEach((k, i) => {
      const c = new Character(this, CAST[k], { x: p.x - 12 + (i % 9) * 3, z: p.z - 4 - Math.floor(i / 9) * 3.5, ry: 0, name: k })
      if (k.startsWith('gopnik') && i % 2) c.anim.set('squat')
      if (k === 'zina') c.anim.set('sit')
      if (k === 'eban') c.anim.set('phone')
      if (k === 'jurnalista') c.anim.set('talk')
      this.npcs.push(c)
    })
  }

  // debug / screenshot helper: place the camera
  lookAt(x, y, z, tx, ty, tz) {
    this.freeCam = true
    this.camera.position.set(x, y, z)
    this.camera.lookAt(tx, ty, tz)
    this.renderer.updateShadowFocus(new THREE.Vector3(tx, ty, tz))
    this.renderer.sky.follow(this.camera)
  }

  start() {
    this.state = 'playing'
    this.last = performance.now()
    const loop = (now) => {
      requestAnimationFrame(loop)
      this.tick(now)
    }
    requestAnimationFrame(loop)
  }

  tick(now) {
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.1) dt = 0.1
    this.frame++
    this.renderer.trackFrame(dt * 1000)
    this.input.pollGamepad()

    const scaled = dt * this.timeScale
    this.acc += scaled
    let steps = 0
    while (this.acc >= STEP && steps < 4) {
      this.fixedUpdate(STEP)
      this.acc -= STEP
      steps++
    }
    if (steps >= 4) this.acc = 0
    this.alpha = this.acc / STEP

    this.update(scaled, dt)
    this.renderer.tod.update(scaled)
    this.renderer.applyTimeOfDay()
    this.renderer.updateEnvironment()
    this.renderer.render(dt)
    this.input.endFrame()
  }

  fixedUpdate(h) {
    if (this.player) this.player.fixedUpdate(h)
    for (const s of this.systems) if (s.fixedUpdate) s.fixedUpdate(h)
    this.physics.step()
    for (const s of this.systems) if (s.postPhysics) s.postPhysics(h)
  }

  update(dt, rawDt) {
    if (this.player && !this.player.vehicle && this.input.pressed('interact') && this.player.control) {
      const v = this.vehicles.nearestEnterable(this.player.pos.x, this.player.pos.z)
      if (v) this.vehicles.enter(v)
    }
    if (this.player) { this.player.update(dt); this.player.sync(this.alpha) }
    for (const n of this.npcs) n.update(dt)
    for (const s of this.systems) if (s.update) s.update(dt, rawDt)
    if (this.cameraRig && !this.freeCam) {
      this.cameraRig.update(dt, rawDt)
      this.renderer.updateShadowFocus(this.player ? this.player.char.mesh.position : this.cameraRig.target)
    }
  }
}
