import { Progress, RANKS } from './Progress.js'
import { CAST } from '../data/outfits.js'
import { CURB_H } from '../world/CityLayout.js'
import { composeSpec } from '../data/wardrobe.js'
import { gen } from '../story/hero.js'

// Top-level game flow: new game / continue, fainting, getting busted, waypoints, autosave.
export class Director {
  constructor(game) {
    this.game = game
    this.waypoint = null
    this.saveT = 0
    game.events.on('player:down', () => this.fainted())
    game.events.on('rankup', (r, idx) => this.rankUp(r, idx))
  }

  spawnPlayer(type, x, z, ry = Math.PI) {
    const g = this.game
    g.player.char.dispose()
    const old = g.player
    g.physics.remove(old.body)
    const P = g.Player
    // the hero in whatever they last put on
    g.player = new P(g, composeSpec(type, g.progress.outfit), { x, z, y: g.physics.groundHeight(x, z), ry })
    g.player.setWeapon(g.progress.weapon)
  }

  async newGame(pl) {
    const g = this.game
    Progress.clearSave()
    g.progress.reset(pl)
    this.spawnPlayer(pl.type, g.world.places.peron.x, g.world.places.peron.z, Math.PI)
    g.menus.close()
    g.state = 'play'
    g.ui.showHud(true)
    g.ui.ticker(true)
    g.cameraRig.endShot()
    g.cameraRig.target.copy(g.player.pos); g.cameraRig.snap()
    this.musicNow = null
    await g.story.startNew()
  }

  async continueGame(save) {
    const g = this.game
    g.progress.load(save)
    const pos = save.pos && Math.abs(save.pos.x) < 480 ? save.pos : g.world.places.acasa
    this.spawnPlayer(save.type, pos.x, pos.z)
    g.renderer.tod.set(save.hour ?? 17.6)
    g.menus.close()
    g.state = 'play'
    g.ui.showHud(true)
    g.ui.ticker(true)
    g.cameraRig.endShot()
    g.cameraRig.target.copy(g.player.pos); g.cameraRig.snap()
    this.musicNow = null
    g.ui.notify(`Bine ai revenit, ${g.progress.name}.`, 3, 'gold')
    await g.story.resume()
  }

  setWaypoint(pos) {
    this.waypoint = pos
    if (!this.game.story.markerActive) this.game.ui.setMarker(pos, pos ? 'GPS' : '')
  }

  // everything that shows on the minimap
  blips() {
    const g = this.game, out = []
    const mk = g.ui.marker
    if (mk) out.push({ kind: 'target', x: mk.x, z: mk.z, edge: true })
    for (const t of g.story.blipList()) out.push(t)
    if (g.street) out.push(...g.street.blips())
    if (g.home) out.push(...g.home.blips())
    if (g.wardrobe) out.push(...g.wardrobe.blips())
    if (g.crew) out.push(...g.crew.blips())
    if (g.side) out.push(...g.side.blips())
    if (g.comisariat) out.push(...g.comisariat.blips())
    if (g.police) {
      for (const o of g.police.officers) if (!o.char.ko) out.push({ kind: 'police', x: o.pos.x, z: o.pos.z })
      for (const c of g.police.cars) out.push({ kind: 'police', x: c.v.pos.x, z: c.v.pos.z })
    }
    return out
  }

  async fainted() {
    const g = this.game
    if (this.handlingDown) return
    this.handlingDown = true
    const p = g.player
    g.progress.stats.fainted++
    p.control = false
    if (p.vehicle) g.vehicles.exit(true)
    p.char.anim.play('knockdown')
    g.audio?.sting('mission_fail')
    const wasModal = g.ui.modalOpen
    g.ui.modalOpen = true // nobody arrests or robs you while you're on the floor
    await g.ui.overlay(gen(g, 'LEȘINAT', 'LEȘINATĂ'), 2.6, { gray: true, slow: 0.3 })
    g.ui.modalOpen = wasModal
    await g.ui.fade(1, 700)
    g.story.failActive('Ai leșinat.')
    g.police.clear()
    const lost = Math.min(g.progress.lei, Math.round(g.progress.lei * 0.1) + 10)
    g.progress.lei -= lost
    g.progress.hp = g.progress.maxHp * 0.7
    g.progress.hunger = Math.max(g.progress.hunger, 0.5)
    const home = g.world.places.acasa
    p.teleport(home.x, CURB_H, home.z + 2, Math.PI)
    p.char.ko = false; p.char.anim.play('getup')
    g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
    g.renderer.tod.set((g.renderer.tod.hour + 6) % 24)
    await g.ui.fade(0, 900)
    g.ui.notify(`Te-ai trezit acasă, la Blocul 7. Doctorul de gardă a luat „pentru cafea": {r}-${lost} lei{/r}.`, 5)
    p.control = true
    this.handlingDown = false
  }

  // caught by the police: the classic Chișinău negotiation
  async busted() {
    const g = this.game, pr = g.progress, lvl = g.police.level
    const p = g.player
    p.control = false
    if (p.vehicle) p.vehicle.throttle = 0
    // a held pose: the player's own animation state is rewritten every frame
    if (!p.vehicle) p.char.anim.play('surrender')
    g.audio?.sting('busted')
    // the card is part of the arrest: the cops hold still and nothing else can start (the
    // sergeant's dialogue then takes over the modal and closes it)
    g.ui.modalOpen = true
    await g.ui.overlay(gen(g, 'REȚINUT', 'REȚINUTĂ'), 1.9, { tone: 'blue', gray: true, slow: 0.4 })
    const sgt = { name: 'Sergentul', role: 'Poliția Chișinău', spec: CAST.cop, id: 'cop_generic', voice: { pitch: 0.85, type: 'gruff' } }
    const bribe = Math.round((30 + lvl * 45) * (pr.tier('pol') >= 3 ? 0.5 : 1))
    const actsFalse = pr.flags.acteFalse
    const choices = [
      { text: `Mită: „Pentru cafea, șefu'"`, cost: `${bribe} lei`, disabled: pr.lei < bribe },
      { text: 'Vorbă frumoasă: „N-am văzut semnul, sincer…"' },
      { text: 'Calci pedala și fugi', cost: '+1 ★' },
    ]
    if (actsFalse) choices.unshift({ text: 'Arăți „actele" de la Borea', cost: 'acte false' })
    let i = await g.ui.dialogue(sgt, [lvl >= 3 ? 'Stai pe loc! Mâinile pe capotă! Tu știi cât m-ai alergat?!' : 'Documentele. Știți de ce v-am oprit?'], { choices })
    if (actsFalse) { if (i === 0) { pr.flags.acteFalse = false; await g.ui.dialogue(sgt, [`…Totul e în regulă, ${gen(g, 'domnule deputat', 'doamnă deputat')}. Scuzați deranjul. Drum bun!`]); g.police.clear(); g.events.emit('police:deal', { how: 'papers' }); this.release(); return } i-- }
    if (i === 0) {
      pr.spend(bribe); pr.stats.bribes++
      await g.ui.dialogue(sgt, ['Hm. Cafeaua e bună azi. Circulați, circulați.'])
      g.police.clear()
      g.events.emit('police:deal', { how: 'bribe' })
    } else if (i === 1) {
      const chance = 0.25 + pr.civic / 250 + (pr.respect?.pol || 0) / 250 + (pr.type === 'conductor' ? 0.25 : 0) - lvl * 0.06
      if (Math.random() < chance) { await g.ui.dialogue(sgt, ['…Bine, bine. Ai noroc că-s bine dispus azi. Să nu te mai văd!']); g.police.clear(); g.events.emit('police:deal', { how: 'talk' }) }
      else {
        const fine = Math.min(pr.lei, 60 + lvl * 40)
        await g.ui.dialogue(sgt, [`Frumos vorbești. Amendă: ${fine} lei. Și plimbare până la secție.`])
        pr.addLei(-fine, 'Amendă la poliție')
        pr.stats.busted++
        g.events.emit('police:deal', { how: 'jail' })
        g.story.failActive(gen(g, 'Ai fost reținut de poliție.', 'Ai fost reținută de poliție.'))
        await this.jail(fine)
        return
      }
    } else {
      g.police.addHeat(20)
      g.events.emit('police:deal', { how: 'run' })
      g.cameraRig.shake(0.3)
      g.ui.notify('{r}Fugi!{/r}', 2, 'red')
      for (const o of g.police.officers) if (o.pos.distanceTo(p.pos) < 3) o.stun = 1.2
    }
    this.release()
  }

  release() {
    const p = this.game.player
    p.control = true
    p.char.anim.stop('surrender')
    this.game.input.clear()
  }

  // how long they keep you: brought in after dark, you're let out in the morning; by day it's
  // three hours of „discuții"
  custody() {
    const h = this.game.renderer.tod.hour, night = h >= 20 || h < 5
    return { night, until: night ? 7 + Math.random() * 0.5 : h + 3 }
  }

  // every arrest ends here: the lights go out, the hours pass, and you walk out of the
  // Comisariatul Centru onto its steps, on foot and with a clean slate. Whatever you were driving
  // stays at the pound. beat: seconds to let the officer's last line land before the fade
  async jail(fine = 0, beat = 0) {
    const g = this.game, p = g.player
    const out = g.comisariat?.out || { x: g.world.places.arc.x + 6, z: g.world.places.arc.z - 4, ry: Math.PI }
    const stay = this.custody()
    // taken in: nobody else starts anything on you, and you're not going anywhere
    const wasModal = g.ui.modalOpen
    g.ui.modalOpen = true
    p.control = false
    if (beat) await new Promise((r) => setTimeout(r, beat * 1000))
    await g.ui.fade(1, 700)
    g.police.clear()
    const v = p.vehicle
    if (v && p.passenger) g.vehicles.exit(true)
    else if (v) g.vehicles.remove(v)
    p.char.ko = false; p.hitStun = 0; p.bailT = 0
    p.char.anim.stop()
    p.teleport(out.x, out.y ?? g.physics.groundHeight(out.x, out.z, 3), out.z, out.ry)
    // the officers on the door and the patrol cars out front are there when the lights come up
    g.comisariat?.fill()
    g.vehicles.updateParked(out.x, out.z)
    g.renderer.tod.set(stay.until)
    g.cameraRig.yaw = out.ry
    g.cameraRig.target.copy(p.pos); g.cameraRig.snap()
    // out the door: the camera comes down from the sign to you on the steps while you walk down
    // them, then it's behind you and the street is yours (from the top step the wall would leave
    // it no room behind you)
    const foot = out.foot || out
    const fx = Math.sin(out.ry), fz = Math.cos(out.ry), sx = -Math.cos(out.ry), sz = Math.sin(out.ry)
    const y0 = g.physics.groundHeight(foot.x, foot.z, 2.4)
    const at = (f, s, y) => [foot.x + fx * f + sx * s, y0 + y, foot.z + fz * f + sz * s]
    const shot = new Promise((r) => g.cameraRig.shot({ from: at(16, 9, 13.5), to: at(6, 6, 2.6), lookFrom: at(-4, 0, 11.5), lookTo: at(0, 0, 1.3), dur: 3.6, onEnd: r }))
    await new Promise((r) => setTimeout(r, 250))
    g.audio?.sfx('door', { vol: 0.6, pitch: 0.7 })
    await g.ui.fade(0, 900)
    const amenda = fine > 0 ? ` Amendă: {r}${fine} lei{/r}.` : ' N-ai avut din ce plăti amenda.'
    g.ui.notify((stay.night ? 'Ai petrecut noaptea la Comisariatul Centru.' : 'Trei ore de „discuții" la Comisariatul Centru.') + amenda, 6)
    if (foot !== out) p.scripted = { x: foot.x, z: foot.z, speed: 1.4 }
    await shot
    // (a mission failed by the arrest stops any walk when it cleans up: then it's the camera cut
    // that takes you the rest of the way)
    p.scripted = null
    if (Math.hypot(p.pos.x - foot.x, p.pos.z - foot.z) > 0.6) p.teleport(foot.x, y0, foot.z, out.ry)
    g.cameraRig.yaw = out.ry
    g.cameraRig.endShot()
    g.ui.modalOpen = wasModal
    this.release()
  }

  rankUp(r, idx) {
    const g = this.game
    // hold the banner until the cutscene is over (the last rank is the epilogue's own moment)
    if ((g.cutscene || g.ui.modalOpen) && idx < RANKS.length - 1) { this.pendingRank = [r, idx]; return }
    this.pendingRank = null
    g.audio?.sting('levelup')
    g.ui.bigMessage(`RANG NOU: ${r.name.toUpperCase()}`, r.joke, { secs: 4 })
    g.fx?.confetti(g.player.pos.x, g.player.pos.y + 2, g.player.pos.z, 40)
    if (idx >= 2) g.progress.giveWeapon('covor')
    if (idx >= 3) g.progress.giveWeapon('sticla')
  }

  // soundtrack: mission override > police chase > time of day
  updateMusic(dt) {
    const g = this.game
    this.musicT = (this.musicT || 0) - dt
    if (this.musicT > 0) return
    this.musicT = 1.5
    const want = g.story.musicOverride || (g.police.level >= 2 ? 'chase' : g.renderer.tod.isNight ? 'city_night' : 'city_day')
    if (want !== this.musicNow) { this.musicNow = want; g.audio?.music(want) }
    const amb = g.renderer.tod.isNight ? 'night' : 'city'
    if (amb !== this.ambNow) { this.ambNow = amb; g.audio?.ambience(amb) }
  }

  update(dt) {
    const g = this.game
    if (g.state !== 'play') return
    this.updateMusic(dt)
    if (this.pendingRank && !g.cutscene && !g.ui.modalOpen) this.rankUp(...this.pendingRank)
    g.progress.update(dt)
    // distance driven
    const v = g.player.vehicle
    if (v) g.progress.stats.km += Math.abs(v.speed) * dt
    this.saveT += dt
    if (this.saveT > 45 && !g.story.active && !g.ui.modalOpen) { this.saveT = 0; g.progress.save() }
    // waypoint reached
    if (this.waypoint && !g.story.markerActive) {
      const pp = v ? v.pos : g.player.pos
      if (Math.hypot(pp.x - this.waypoint.x, pp.z - this.waypoint.z) < 12) this.setWaypoint(null)
    }
  }
}
