import * as THREE from 'three'
import { Events } from './Events.js'
import { Input } from './Input.js'
import { Assets } from './Assets.js'
import { loadSettings } from './Settings.js'
import { Physics } from '../physics/Physics.js'
import { Renderer } from '../render/Renderer.js'
import { Materials, SHARED } from '../render/Materials.js'
import { FX } from '../render/FX.js'
import { World } from '../world/World.js'
import { CameraRig } from './CameraRig.js'
import { Player } from '../entities/Player.js'
import { Character } from '../entities/Character.js'
import { CAST } from '../data/outfits.js'
import { WEAPONS } from '../data/weapons.js'
import { Vehicles } from '../gameplay/Vehicles.js'
import { Traffic } from '../gameplay/Traffic.js'
import { Pedestrians } from '../gameplay/Pedestrians.js'
import { Police } from '../gameplay/Police.js'
import { Combat } from '../gameplay/Combat.js'
import { Progress } from '../gameplay/Progress.js'
import { Interaction } from '../gameplay/Interaction.js'
import { Director } from '../gameplay/Director.js'
import { UI } from '../ui/UI.js'
import { Menus } from '../ui/Menus.js'
import { Portraits } from '../ui/Portraits.js'
import { Story } from '../story/Story.js'
import { AudioEngine } from '../audio/Audio.js'
import { Debug } from './Debug.js'
import { Touch, isTouchDevice } from '../ui/Touch.js'

const STEP = 1 / 60
if (import.meta.env.DEV) { window.THREE = THREE; window.__CR = { Character, CAST } }

export class Game {
  constructor({ viewport, ui }) {
    this.viewport = viewport
    this.uiRoot = ui
    this.events = new Events()
    this.state = 'loading'   // loading | menu | create | play
    this.paused = false
    this.cutscene = false
    this.timeScale = 1
    this.hitstopT = 0
    this.acc = 0
    this.last = 0
    this.frame = 0
    this.alpha = 0
    this.npcs = []           // loose characters (menu preview, debug lineup)
    this.Player = Player
    this.weapons = WEAPONS
    // dev: ?turbo=4 runs the simulation 4x faster (automated playthrough tests on slow machines)
    this.turbo = import.meta.env.DEV ? Math.max(1, +(new URLSearchParams(location.search).get('turbo') || 1)) : 1
  }

  async boot(progress) {
    this.settings = loadSettings()
    progress(0.02, 'Pornim motorul…')
    this.renderer = new Renderer(this.viewport, this.settings)
    this.scene = this.renderer.scene
    this.camera = this.renderer.camera
    this.input = new Input(this.renderer.renderer.domElement)
    this.materials = new Materials()
    progress(0.04, 'Sunet…')
    this.audio = new AudioEngine(this)
    try { await this.audio.init() } catch (e) { console.warn('[audio] init failed', e) }
    this.audio.setVolumes?.(this.settings)
    progress(0.05, 'Fizică…')
    this.physics = await Physics.create()
    this.physics.ground()
    this.assets = new Assets()
    await this.assets.load((p, l) => progress(0.05 + p * 0.5, 'Se încarcă ' + l + '…'))
    progress(0.6, 'Construim Chișinăul…')
    this.world = new World(this)
    await this.world.build((p, l) => progress(0.6 + p * 0.3, l ? 'Construim: ' + l + '…' : undefined))
    progress(0.92, 'Oameni, mașini, polițiști…')
    this.fx = new FX(this)
    this.progress = new Progress(this)
    this.ui = new UI(this)
    this.portraits = new Portraits(this)
    this.cameraRig = new CameraRig(this)
    const home = this.world.places.acasa
    this.player = new Player(this, CAST.patan, { x: home.x, z: home.z + 3, ry: Math.PI })
    this.vehicles = new Vehicles(this)
    this.traffic = new Traffic(this)
    this.peds = new Pedestrians(this)
    this.police = new Police(this)
    this.combat = new Combat(this)
    this.interaction = new Interaction(this)
    this.interaction.registerWorld()
    this.story = new Story(this)
    this.director = new Director(this)
    this.menus = new Menus(this, this.ui)
    if (isTouchDevice() || location.search.includes('touch')) this.touch = new Touch(this)
    if (import.meta.env.DEV && location.search.includes('lineup')) this.debugLineup()
    if (import.meta.env.DEV) this.debug = new Debug(this)
    this.cameraRig.target.copy(this.player.pos)
    this.cameraRig.snap()
    this.renderer.applyTimeOfDay()
    this.renderer.updateEnvironment(true)
    this.bindGlobalKeys()
    progress(1, 'Gata')
  }

  bindGlobalKeys() {
    // the audio context may only start after a user gesture
    const kick = () => { this.audio?.resume(); window.removeEventListener('pointerdown', kick, true); window.removeEventListener('keydown', kick, true) }
    window.addEventListener('pointerdown', kick, true)
    window.addEventListener('keydown', kick, true)
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play' && !this.paused && !this.ui.modalOpen && !this.cutscene) this.menus.showPause() })
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
    this.renderer.sky.follow?.(this.camera)
  }

  start() {
    this.last = performance.now()
    this.menus.showMain()
    const loop = (now) => {
      requestAnimationFrame(loop)
      try { this.tick(now) } catch (e) { console.error(e) }
    }
    requestAnimationFrame(loop)
  }

  // photo mode: no HUD, no prompts, just the city (O to toggle)
  setPhotoMode(on) {
    this.photoMode = on
    this.ui.showHud(!on)
    this.ui.top.style.visibility = on ? 'hidden' : ''
    if (this.touch) this.touch.root.style.visibility = on ? 'hidden' : ''
    if (!on) this.ui.notify('Mod foto oprit.', 1.2)
  }

  // brief freeze on heavy hits: sells the impact
  hitstop(ms) { this.hitstopT = Math.max(this.hitstopT, ms / 1000) }

  blips() { return this.director.blips() }

  // where the world should be alive: the player, or the camera during the title flyover
  focus() {
    if (this.state !== 'play' && this.cameraRig?.cut) return this.camera.position
    const p = this.player
    return p.vehicle ? p.vehicle.pos : p.pos
  }

  tick(now) {
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.1) dt = 0.1
    dt *= this.turbo
    this.frame++
    this.renderer.trackFrame(dt * 1000)
    this.input.pollGamepad()
    this.handleGlobalInput()

    let scale = this.paused ? 0 : this.timeScale
    if (this.hitstopT > 0) { this.hitstopT -= dt; scale *= 0.06 }
    const scaled = dt * scale
    this.acc += scaled
    let steps = 0
    const maxSteps = 4 * this.turbo
    while (this.acc >= STEP && steps < maxSteps) {
      this.fixedUpdate(STEP)
      this.acc -= STEP
      steps++
    }
    if (steps >= maxSteps) this.acc = 0
    this.alpha = this.acc / STEP

    this.update(scaled, dt)
    if (!this.paused) this.renderer.tod.update(scaled)
    this.renderer.applyTimeOfDay()
    this.renderer.updateEnvironment()
    if (this.world.poolMesh) this.world.poolMesh.material.opacity = SHARED.uNight.value * 0.3
    this.renderer.render(dt)
    this.input.endFrame()
  }

  handleGlobalInput() {
    const i = this.input
    if (this.state !== 'play') return
    if (this.photoMode && (i.pressed('photo') || i.pressed('pause'))) { this.setPhotoMode(false); return }
    if (i.pressed('photo') && !this.paused && !this.ui.modalOpen && !this.cutscene) { this.setPhotoMode(true); return }
    if (i.pressed('pause') && !this.cutscene) {
      if (this.paused || !this.ui.modalOpen) this.menus.togglePause()
    } else if (i.pressed('map') && !this.paused && !this.ui.modalOpen && !this.cutscene) {
      this.menus.showPause('map')
    }
  }

  // run one system step; errors are reported once and never take the frame down with them
  safe(name, fn) {
    try { fn() } catch (e) {
      this.errs ||= new Set()
      const k = name + ':' + e.message
      if (!this.errs.has(k)) { this.errs.add(k); console.error(`[${name}]`, e) }
    }
  }

  fixedUpdate(h) {
    this.safe('player', () => this.player?.fixedUpdate(h))
    this.safe('traffic', () => this.traffic.fixedUpdate(h))
    this.safe('police', () => this.police.fixedUpdate(h))
    this.safe('story', () => this.story.fixedUpdate(h))
    this.safe('vehicles', () => this.vehicles.fixedUpdate(h))
    this.safe('peds', () => this.peds.fixedUpdate(h))
    this.physics.step()
    this.safe('postPhysics', () => this.vehicles.postPhysics(h))
  }

  update(dt, rawDt) {
    const playing = this.state === 'play'
    if (!this.paused) {
      this.safe('player', () => { if (this.player) { this.player.update(dt); this.player.sync(this.alpha) } })
      this.safe('npcs', () => { for (const n of this.npcs) n.update(dt) })
      this.safe('world', () => this.world.update(dt))
      this.safe('traffic', () => this.traffic.update(dt))
      this.safe('vehicles', () => this.vehicles.update(dt))
      this.safe('peds', () => this.peds.update(dt))
      if (playing) this.safe('police', () => this.police.update(dt))
      this.safe('story', () => this.story.update(dt))
      if (playing) this.safe('interaction', () => this.interaction.update(dt))
      if (playing) this.safe('director', () => this.director.update(dt))
      this.safe('fx', () => { this.fx.update(dt); this.vehicleFX(dt) })
      this.debug?.update(rawDt)
    }
    this.safe('ui', () => { this.ui.update(rawDt); this.touch?.update() })
    if (this.audio) this.safe('audio', () => {
      this.audio.updateVehicles?.(this.vehicles.list, this.player?.vehicle || null)
      this.audio.update?.(rawDt, this.camera)
    })
    if (this.cameraRig && !this.freeCam) {
      this.cameraRig.update(dt, rawDt)
      this.renderer.updateShadowFocus(this.player ? (this.player.vehicle ? this.player.vehicle.mesh.position : this.player.char.mesh.position) : this.cameraRig.target)
    }
  }

  // skid marks, tyre smoke and a smoking bonnet when a car is hurt
  vehicleFX(dt) {
    const fx = this.fx
    this.fxT = (this.fxT || 0) + dt
    const puff = this.fxT > 0.05
    if (puff) this.fxT = 0
    for (const v of this.vehicles.list) {
      const sp = Math.abs(v.speed)
      const slide = Math.abs(v.lateral || 0)
      const skidding = (slide > 3.2 && sp > 4) || (v.handbrake && sp > 7) || (v.braking && sp > 13)
      const fx0 = Math.sin(v.heading), fz0 = Math.cos(v.heading)
      const rx = -Math.cos(v.heading), rz = Math.sin(v.heading)
      const back = v.def.dims[2] * 0.72, side = v.def.dims[0] * 0.78
      for (const s of [-1, 1]) {
        const key = v.id + ':' + s
        if (skidding) {
          const x = v.pos.x - fx0 * back + rx * side * s, z = v.pos.z - fz0 * back + rz * side * s
          fx.skids.add(key, x, v.pos.y + 0.03, z, 0.24, Math.min(1, slide / 8 + 0.35))
          if (puff && Math.random() < 0.5) fx.tireSmoke(x, v.pos.y + 0.2, z)
        } else fx.skids.end(key)
      }
      if (puff && v.health < 45) {
        const k = v.broken ? 1 : (45 - v.health) / 45
        if (Math.random() < 0.1 + k * 0.3) fx.smoke(v.pos.x + fx0 * v.def.dims[2] * 0.7, v.pos.y + v.def.dims[1] * 1.6, v.pos.z + fz0 * v.def.dims[2] * 0.7, v.broken ? 0.14 : 0.35, 0.45 + k * 0.45)
      }
    }
  }
}
