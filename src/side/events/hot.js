import { CAST, randomCivilian } from '../../data/outfits.js'
import { onFoot, sceneSpot, leash, payout, speaker } from './common.js'

// A purse snatcher on the pavement. He runs, you run faster (or not): put him down, bring the
// lady her purse. He only strikes once you're close, on foot.

export const HOT = {
  id: 'ev_thief', title: 'Hoțul de poșete', icon: '👜', who: 'Doamna Vera, etajul 5',
  viber: 'Atenție, iar umblă hoțul ăla de poșete pe la noi. Trening negru, fuge ca un iepure!',
  engage: 32,
  ready: (g) => onFoot(g),
  when: () => true,
  where: (g, force) => sceneSpot(g, force ? 8 : 50, force ? 50 : 200),

  async script(m, spot) {
    const g = m.game, p = m.player
    const n0 = { x: spot.x, z: spot.z }
    const vspec = randomCivilian(Math.random)
    const victim = m.spawn('victima', vspec, n0.x + 1, n0.z, { voice: { pitch: 1.2, type: 'female' } })
    const thief = m.spawn('hot', { ...CAST.gopnik3, top: { style: 'tracksuit', color: 0x2a2a2a, stripes: 0xd0d0d0 } }, n0.x - 0.6, n0.z + 0.4, { personality: 'tough', hp: 26, runSpeed: 6.2 })
    thief.hittable = true; thief.stayDown = true; thief.enemy = true; thief.noCrime = true
    victim.say('Poșeta! Hoțul! Prindeți-l!', 3)
    thief.state = 'flee'; thief.stateT = 999; thief.fleeFrom = { x: p.pos.x, z: p.pos.z }
    g.audio?.sfx('whistle', { vol: 0.6 })
    leash(m, n0, { r: 160 })
    m.objective('{r}Prinde hoțul de poșete!{/r} Pune-l la pământ.')
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
    await m.reach(victim.pos, 3, { text: 'Du-i poșeta înapoi doamnei.', label: 'Doamna', inVehicle: false })
    await m.talk(speaker('Doamna', 'fără poșetă (până acum)', vspec, { pitch: 1.2, type: 'female' }), 'Vai, mulțumesc! Poliția n-ar fi venit nici până mâine.', 3)
    g.progress.addCivic(5); g.progress.addCred(3)
    g.progress.addXp(50, 'Hoț prins')
    payout(m, { aura: 90, lei: 50, why: 'Hoț de poșete prins', title: 'HOȚ PRINS!', sub: 'Doamna îți dă 50 de lei. Poliția, nimic.' })
    m.data.won = true
  },
}
