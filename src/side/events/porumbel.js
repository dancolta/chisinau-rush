import * as THREE from 'three'
import { CAST } from '../../data/outfits.js'
import { GeoBuilder } from '../../render/GeoBuilder.js'
import { dist, pick, rand, hourIn, sceneSpot, leash, payout, speaker, face, lose, blocked } from './common.js'

// A pigeon stole a granny's plăcintă (with cheese!). It hops away every time you get close, but
// it's a Chișinău pigeon: fat, and it tires after a few flights. Grab it ([E]) or dive at it
// (jump when it's close).

const GRANNY = { ...CAST.zina, top: { style: 'coat', color: 0x4a5a3a, lapel: 0x2a2a3a }, hat: { style: 'basma', color: 0x8a2a5a, dots: 0xf2e6c8 } }
const BUNICA = speaker('Tanti Nadea', 'a copt plăcinte pentru nepoți', GRANNY, { pitch: 1.35, type: 'old' })
const CHEER = ['Prinde-l, maică!', 'Pe-aici, pe-aici!', 'Hoțul cu pene!', 'Nu-l lăsa, că-i cu brânză!', 'Mai repede, maică!']

let GEO = null
function pigeonGeo() {
  if (GEO) return GEO
  const b = new GeoBuilder()
  b.sphere(0.1, 12, 8, { y: 0.14, sx: 0.9, sy: 0.8, sz: 1.5, color: 0x8a9099 })
  b.sphere(0.072, 10, 8, { y: 0.2, z: 0.09, color: 0x5f8a7a })
  b.sphere(0.052, 10, 8, { y: 0.27, z: 0.15, color: 0x6a7078 })
  b.cone(0.014, 0.04, 6, { y: 0.268, z: 0.205, rx: Math.PI / 2, center: true, color: 0xd8b060 })
  for (const s of [-1, 1]) {
    b.sphere(0.009, 6, 5, { x: s * 0.032, y: 0.285, z: 0.18, color: 0xff7a2a })
    b.box(0.012, 0.09, 0.012, { x: s * 0.03, y: 0, z: 0.02, color: 0xd87a6a })
  }
  b.box(0.1, 0.02, 0.12, { y: 0.14, z: -0.17, rx: 0.25, color: 0x55595f })
  // the stolen plăcintă, in its beak
  b.cyl(0.058, 0.058, 0.022, 12, { y: 0.258, z: 0.25, center: true, color: 0xe2b55a })
  const wing = new GeoBuilder()
  wing.box(0.13, 0.016, 0.15, { x: 0.065, center: true, color: 0x747a82 })
  wing.box(0.05, 0.018, 0.1, { x: 0.12, z: -0.02, center: true, color: 0x3a3e44 })
  GEO = { body: b.build(), wing: wing.build() }
  return GEO
}

class Pigeon {
  constructor(game, x, z) {
    this.game = game
    const geo = pigeonGeo(), mat = game.materials.vcol({ key: 'pigeon' })
    this.group = new THREE.Group()
    this.body = new THREE.Mesh(geo.body, mat)
    this.body.castShadow = true
    this.wings = [1, -1].map((s) => { const w = new THREE.Mesh(geo.wing, mat); w.position.set(s * 0.07, 0.19, 0.02); w.scale.x = s; this.group.add(w); return w })
    this.group.add(this.body)
    this.group.scale.setScalar(1.8)
    game.scene.add(this.group)
    this.home = { x, z }
    this.x = x; this.z = z; this.y = game.physics.groundHeight(x, z, 3)
    this.heading = Math.random() * Math.PI * 2
    this.state = 'peck'
    this.flights = 0
    this.react = 0
    this.t = 0
    this.caught = null
    this.active = false     // flies off only once the chase is on
    this.sync()
  }
  sync() { this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.heading }
  get pos() { return { x: this.x, y: this.y, z: this.z } }

  takeOff(from) {
    const g = this.game
    const tired = this.flights >= 5
    let best = null
    for (let k = 0; k < 8 && !best; k++) {
      let a = Math.atan2(this.x - from.x, this.z - from.z) + rand(-0.9, 0.9)
      if (dist(this, this.home) > 22) a = Math.atan2(this.home.x - this.x, this.home.z - this.z) + rand(-0.8, 0.8)
      const d = rand(6, 11) * (tired ? 0.6 : 1)
      const x = this.x + Math.sin(a) * d, z = this.z + Math.cos(a) * d
      if (Math.abs(g.physics.groundHeight(x, z, 6)) > 0.6 || blocked(g, x, z)) continue
      best = { x, z, d }
    }
    if (!best) best = { x: this.home.x + rand(-3, 3), z: this.home.z + rand(-3, 3), d: dist(this, this.home) }
    this.from = { x: this.x, z: this.z, y: this.y }
    this.to = best
    this.dur = Math.max(0.45, best.d / 9)
    this.peak = 1.1 + best.d * 0.1
    this.t = 0
    this.state = 'fly'
    this.flights++
    this.heading = Math.atan2(best.x - this.x, best.z - this.z)
    g.audio?.sfx('whoosh', { at: this.pos, vol: 0.5, pitch: 1.6 })
  }

  update(dt) {
    const g = this.game, p = g.player
    this.t += dt
    if (this.state === 'gone') {
      this.y += dt * 4; this.x += Math.sin(this.heading) * dt * 6; this.z += Math.cos(this.heading) * dt * 6
      this.flap(dt, 30)
      this.sync()
      return
    }
    if (this.state === 'fly') {
      const k = Math.min(1, this.t / this.dur)
      this.x = this.from.x + (this.to.x - this.from.x) * k
      this.z = this.from.z + (this.to.z - this.from.z) * k
      const gy = g.physics.groundHeight(this.x, this.z, this.y + 3)
      this.y = gy + Math.sin(k * Math.PI) * this.peak
      this.flap(dt, 26)
      if (k >= 1) { this.state = 'peck'; this.t = 0; this.react = 0 }
    } else {
      // pecking at the stolen pie, one eye on you
      this.flap(dt, 0)
      this.body.rotation.x = Math.max(0, Math.sin(this.t * 7)) * 0.35
      const d = dist(p.pos, this)
      const run = Math.abs(p.char.speed)
      const R = p.vehicle ? 14 : run > 7 ? 5.5 : run > 3 ? 4.2 : 2.6
      if (this.active && d < R) {
        this.react += dt
        if (this.react > Math.min(0.95, 0.22 + this.flights * 0.09)) this.takeOff(p.pos)
      } else this.react = 0
    }
    this.sync()
    // grab it, or dive at it
    if (!this.active || this.caught || p.vehicle || p.char.ko) return
    const d = dist(p.pos, this)
    const low = this.state === 'peck' || (this.state === 'fly' && this.t < 0.12)
    const i = g.input
    if (low && d < 1.6 && (i.pressed('interact') || i.pressed('attack'))) this.caught = 'grab'
    else if (!p.grounded && d < 2.3 && this.y - p.pos.y < 1.4) this.caught = 'dive'
    else if (g.side?.auto === 'win' && d < 2.5) this.caught = 'grab'
  }

  flap(dt, speed) {
    const a = speed ? Math.sin(this.t * speed) * 0.9 : -0.1
    this.wings[0].rotation.z = a
    this.wings[1].rotation.z = -a
  }

  flyAway() { this.state = 'gone'; this.t = 0 }
  dispose() { this.game.scene.remove(this.group) }
}

export const PORUMBEL = {
  id: 'ev_porumbel', title: 'Hoțul cu pene', icon: '🐦', who: 'Tanti Nadea',
  viber: 'Un porumbel mi-a furat plăcinta cu brânză de pe bancă!!! Era pentru nepoți. Cine-l prinde primește jumătate.',
  engage: 45,
  when: (g) => hourIn(g, 7, 20.5),
  where: (g, force) => sceneSpot(g, force ? 4 : 50, force ? 60 : 220, { room: 3 }),

  async script(m, spot) {
    const g = m.game, p = m.player, pr = g.progress
    const c = { x: spot.x, z: spot.z }
    const nana = m.spawn('bunica', GRANNY, c.x, c.z, { voice: BUNICA.voice })
    nana.lookAtPlayer = true
    const bird = m.track(new Pigeon(g, c.x + 2.2, c.z + 1.4))
    m.data.bird = bird
    leash(m, c, { r: 130 })
    m.task(async (live) => { while (live()) { await m.wait(4); if (live() && !bird.active) nana.say(pick(['Hoțule! Cu pene!', 'Porumbelul! Plăcinta mea!', 'Ajutați, oameni buni!']), 2.4) } })
    await m.reach(c, 4, { text: 'Un porumbel a furat o plăcintă. Du-te la {y}Tanti Nadea{/y}.', label: 'Tanti Nadea', inVehicle: false })
    face(nana.char, p.pos.x, p.pos.z)
    const choice = await m.say(BUNICA, ['Maică! Porumbelul ăla mi-a furat plăcinta! Cu brânză era, pentru nepoți!', 'E gras, maică, abia zboară. Prinde-l, și-ți dau jumătate!'], { choices: ['Stai liniștită, bunico. E al meu.', 'E doar un porumbel, bunico…'] })
    if (choice === 1) { await m.talk(BUNICA, 'Doar un porumbel… Așa ziceau și de primar. Na, du-te.', 3); m.cancel() }
    bird.active = true
    g.audio?.sfx('whistle', { vol: 0.5 })
    m.objective('Prinde {y}porumbelul{/y}: apropie-te și apasă {y}[E]{/y}, sau sari pe el ({y}[␣]{/y}).', { sub: 'Obosește după câteva zboruri. Pe furiș, se sperie mai greu.' })
    m.timer(55, 'Porumbelul a mâncat plăcinta. Cu tot cu brânză.')
    let mk = 0, cheer = 3
    m.every((dt) => {
      if ((mk -= dt) <= 0) { mk = 0.35; if (!bird.caught) m.marker(bird.pos, 'Porumbelul') }
      if ((cheer -= dt) <= 0) { cheer = 4 + Math.random() * 3; if (!bird.caught) nana.say(pick(CHEER), 2.2) }
    })
    await m.until(() => bird.caught)
    m.stopTimer()
    m.marker(null)
    const dive = bird.caught === 'dive'
    p.char.anim.play(dive ? 'land' : 'pickup')
    g.fx?.paper(bird.x, bird.y + 0.4, bird.z, 10)
    g.audio?.sfx('pickup', { vol: 0.8 })
    bird.flyAway()
    g.side?.ui.feed(dive ? '🧤 {y}Săritură de portar!{/y} Plăcinta e a ta.' : '🥧 Ai recuperat {y}plăcinta{/y}. Încă e caldă.', 3)
    await m.reach(nana.pos, 3, { text: 'Du-i plăcinta {y}bunicii{/y}.', label: 'Tanti Nadea', inVehicle: false })
    face(nana.char, p.pos.x, p.pos.z)
    nana.char.anim.play('cheer')
    await m.talk(BUNICA, dive ? 'Vai, maică, ca Rinat Dasaev ai sărit! Na, jumătate e a ta.' : 'Mulțumesc, maică! Na, jumătate e a ta. Și nu spune la nepoți.', 3.2)
    pr.feed(0.3); pr.heal(10)
    payout(m, { aura: dive ? 140 : 100, lei: 20, why: dive ? 'Porumbel prins din zbor' : 'Porumbel prins cu mâna goală', title: 'PLĂCINTA E SALVATĂ!', sub: 'Jumătate de plăcintă cu brânză și 20 de lei' })
    m.data.won = true
  },
}
