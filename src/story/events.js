import { gen } from './hero.js'
import { CAST, randomCivilian } from '../data/outfits.js'
import { dist, pickOne, rand } from './missions/common.js'

// Random street encounters in free roam: small, optional, rewarding.
// Each one is an activity mission, so a story mission can always interrupt it.

const TROLLEY = {
  id: 'ev_trolley', activity: true, title: 'Troleibuzul fără curent', failTitle: 'RATAT', silentPass: true, noRetry: true, silentStart: true,
  async script(m) {
    const g = m.game, P = m.P
    const d = g.traffic.drivers.find((x) => x.v?.def.trolley && dist(x.v.pos, P) < 150 && dist(x.v.pos, P) > 25)
    if (!d) m.cancel()
    d.stalled = true
    m.track({ dispose: () => { d.stalled = false } })
    const v = d.v
    const side = { x: v.pos.x - Math.cos(v.heading) * 2.6, z: v.pos.z + Math.sin(v.heading) * 2.6 } // kerb side
    const vat = m.spawn('vatman', 'vatman', side.x, side.z, { voice: { pitch: 0.9, type: 'male' } })
    vat.char.anim.set('wave')
    m.notify('🚎 Un troleibuz a rămas fără curent pe bulevard. Vatmanul face semne disperate.', 4)
    m.objective('Ajută-l pe {y}vatman{/y}: au sărit coarnele troleibuzului.', { title: 'ÎNTÂMPLARE' })
    m.marker(side, 'Vatmanul')
    const t0 = m.t
    await m.until(() => (dist(m.player.pos, vat.pos) < 4 && !m.player.vehicle) || m.t - t0 > 120)
    if (m.t - t0 > 120) m.cancel()
    await m.say({ name: 'Vatmanul', role: 'Troleibuzul 22', spec: CAST.vatman, voice: { pitch: 0.9, type: 'male' } }, ['Ajută-mă, bratan! Au sărit coarnele de pe fir. Io singur nu ajung, am spatele de la Brejnev.', 'Trage de frânghia din spate până se prind. Ușor, că dă scântei!'])
    let done = false
    const back = { x: v.pos.x - Math.sin(v.heading) * 6.2, z: v.pos.z - Math.cos(v.heading) * 6.2 }
    m.interact({ id: 'poles', x: back.x, z: back.z, r: 2.4, hold: 2.2, label: 'Ține [E]: pune coarnele pe fir', enabled: () => !done, onInteract: () => { done = true; g.fx?.sparks(back.x, 5, back.z, 18); g.audio?.sfx('glass', { vol: 0.4 }) } })
    m.objective('Pune coarnele troleibuzului pe fir (ține {y}[E]{/y} în spatele lui).', { title: 'ÎNTÂMPLARE' })
    m.marker(back, 'Coarnele')
    await m.until(() => done)
    d.stalled = false
    await m.talk('vatman', `Merge! Bravo, ${gen(m.game, 'băiete', 'fată')}! Pasagerii te aplaudă. În gând.`, 3)
    m.reward({ lei: 40, civic: 5, xp: 40 }, 'Troleibuzul merge din nou')
    vat.walkTo(v.pos.x + Math.sin(v.heading) * 5, v.pos.z + Math.cos(v.heading) * 5)
    await m.wait(1.5)
  },
}

const GRANNY = {
  id: 'ev_granny', activity: true, title: 'Bunica cu sacoșe', failTitle: 'RATAT', silentPass: true, noRetry: true, silentStart: true,
  async script(m) {
    const g = m.game, p = m.player
    const nodes = g.peds.nodes.filter((n) => { const d = dist(n, p.pos); return d > 10 && d < 55 })
    if (!nodes.length || p.vehicle) m.cancel()
    const n0 = pickOne(nodes)
    const far = g.peds.nodes.filter((n) => { const d = dist(n, n0); return d > 70 && d < 130 })
    if (!far.length) m.cancel()
    const dest = pickOne(far)
    const spec = { ...CAST.zina, top: { style: 'coat', color: pickOne([0x3a5a7a, 0x5a3a6a, 0x4a5a3a]), lapel: 0x2a2a3a }, hat: { style: 'basma', color: pickOne([0x2a6a3a, 0x3a3a8a, 0x8a5a1a]), dots: 0xf2e6c8 } }
    const b = m.spawn('bunica', spec, n0.x, n0.z, { voice: { pitch: 1.35, type: 'old' }, anim: 'idle' })
    b.lookAtPlayer = true
    b.speed = 1.2
    const B = { name: 'Bunica', role: 'cu sacoșe de la piață', spec, voice: { pitch: 1.35, type: 'old' } }
    m.objective('O bunică are nevoie de ajutor.', { title: 'ÎNTÂMPLARE' })
    m.marker(n0, 'Bunica')
    b.say('Maică! Ajută-mă, că nu mai pot…', 4)
    const t0 = m.t
    await m.until(() => dist(p.pos, b.pos) < 3.2 || m.t - t0 > 90)
    if (m.t - t0 > 90 || p.vehicle) m.cancel()
    const c = await m.say(B, ['Maică, ajută-mă cu sacoșele până la bloc. Am luat de toate de la piață: cartofi, varză, un televizor.'], { choices: ['Sigur, bunică. Dă-le încoace.', 'Scuze, mă grăbesc.'] })
    if (c === 1) { await m.talk(B, 'Tinerii din ziua de azi… Pe vremea mea, cărau și pianul.', 3); m.cancel() }
    b.state = 'follow'; b.target = p
    p.speedMul = 0.72
    m.track({ dispose: () => { p.speedMul = 1 } })
    m.objective('Du sacoșele bunicii acasă. Ea vine după tine.', { title: 'ÎNTÂMPLARE', sub: 'Cu sacoșele mergi mai încet.' })
    m.marker(dest, 'Blocul bunicii')
    m.task(async () => { await m.wait(6); await m.talk(B, pickOne(['Știi ce scumpă-i varza? Ca un apartament în Centru.', 'Nepotul meu e în Germania. Programator. Nu știu ce programează, da\' programează.', 'Primarul ăsta… lasă, nu mai zic, că m-o auzit și data trecută.'])) })
    await m.until(() => dist(p.pos, dest) < 4 && dist(b.pos, dest) < 8, { timeout: 150, onTimeout: 'Bunica a obosit și s-a așezat pe o bancă.' })
    b.state = 'idle'
    await m.talk(B, 'Mulțumesc, maică! Ține, o plăcintă caldă. Și niște bani, nu te supăra.', 3.4)
    g.progress.feed(0.3)
    m.reward({ lei: 25, civic: 4, xp: 35 }, 'Ai ajutat-o pe bunica')
  },
}

const THIEF = {
  id: 'ev_thief', activity: true, title: 'Hoțul de poșete', failTitle: 'RATAT', silentPass: true, noRetry: true, silentStart: true,
  async script(m) {
    const g = m.game, p = m.player
    if (p.vehicle) m.cancel()
    const nodes = g.peds.nodes.filter((n) => { const d = dist(n, p.pos); return d > 12 && d < 50 })
    if (!nodes.length) m.cancel()
    const n0 = pickOne(nodes)
    const victim = m.spawn('victima', randomCivilian(Math.random), n0.x + 1, n0.z, { voice: { pitch: 1.2, type: 'female' } })
    const thief = m.spawn('hot', { ...CAST.gopnik3, top: { style: 'tracksuit', color: 0x2a2a2a, stripes: 0xd0d0d0 } }, n0.x - 0.6, n0.z + 0.4, { personality: 'tough', hp: 26, runSpeed: 6.2 })
    thief.hittable = true; thief.stayDown = true; thief.enemy = true; thief.noCrime = true
    victim.say('Poșeta! Hoțul! Prindeți-l!', 3)
    thief.state = 'flee'; thief.stateT = 999; thief.fleeFrom = { x: p.pos.x, z: p.pos.z }
    g.audio?.sfx('whistle', { vol: 0.6 })
    m.objective('{r}Prinde hoțul de poșete!{/r} Pune-l la pământ.', { title: 'ÎNTÂMPLARE' })
    let mk = 0
    m.every((dt) => {
      if (thief.char.ko) return true
      thief.fleeFrom = { x: p.pos.x, z: p.pos.z }; thief.state = 'flee'; thief.stateT = 999
      mk -= dt
      if (mk <= 0) { mk = 0.5; m.marker({ x: thief.pos.x, z: thief.pos.z }, 'Hoțul') }
    })
    m.timer(45, 'Hoțul a dispărut printre blocuri.')
    await m.until(() => thief.char.ko)
    m.stopTimer()
    thief.hp = 0
    m.marker(null)
    await m.reach(victim.pos, 3, { text: 'Du-i poșeta înapoi doamnei.', label: 'Doamna' })
    await m.talk(victim.name ? victim : { name: 'Doamna', voice: { pitch: 1.2, type: 'female' } }, 'Vai, mulțumesc! Poliția n-ar fi venit nici până mâine.', 3)
    m.reward({ lei: 50, civic: 5, cred: 3, xp: 50 }, 'Hoț prins')
  },
}

export const STREET_EVENTS = [TROLLEY, GRANNY, THIEF]

// decides when something happens in free roam
export class StreetEvents {
  constructor(game, story) {
    this.game = game
    this.story = story
    this.t = 70 + Math.random() * 60
  }
  update(dt) {
    const g = this.game, s = this.story
    if (g.state !== 'play' || s.active || g.ui.modalOpen || g.cutscene || g.police.level > 0 || g.home?.inside) return
    if (!s.isDone('paine')) return
    this.t -= dt
    if (this.t > 0) return
    this.t = 90 + Math.random() * 90
    const p = g.player
    const pool = STREET_EVENTS.filter((e) => e.id !== 'ev_trolley' || Math.abs(p.pos.z) < 60)
    const ev = pool[Math.floor(rand(0, pool.length))]
    if (ev.id !== 'ev_trolley' && p.vehicle) return
    s.run(ev)
  }
}
