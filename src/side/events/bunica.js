import { CAST } from '../../data/outfits.js'
import { gen } from '../../story/hero.js'
import { dist, pick, hourIn, sceneSpot, leash, payout, speaker, face } from './common.js'

// A granny with shopping bags from the market (cabbage, potatoes, a television) needs them
// carried home. She walks behind you, slowly, and talks the whole way.

export const BUNICA = {
  id: 'ev_granny', title: 'Bunica cu sacoșe', icon: '👵', who: 'Tanti Maria, scara 3',
  viber: 'Am cumpărat de toate la piață și acum nu le pot duce. Poate trece un tânăr cu mâini?',
  engage: 45,
  when: (g) => hourIn(g, 7, 21),
  where: (g, force) => sceneSpot(g, force ? 6 : 50, force ? 60 : 200),

  async script(m, spot) {
    const g = m.game, p = m.player
    const n0 = { x: spot.x, z: spot.z }
    const far = g.peds.nodes.filter((n) => { const d = dist(n, n0); return d > 70 && d < 130 })
    if (!far.length) m.cancel()
    const dest = pick(far)
    const spec = { ...CAST.zina, top: { style: 'coat', color: pick([0x3a5a7a, 0x5a3a6a, 0x4a5a3a]), lapel: 0x2a2a3a }, hat: { style: 'basma', color: pick([0x2a6a3a, 0x3a3a8a, 0x8a5a1a]), dots: 0xf2e6c8 } }
    const b = m.spawn('bunica', spec, n0.x, n0.z, { voice: { pitch: 1.35, type: 'old' }, anim: 'idle' })
    b.lookAtPlayer = true
    b.speed = 1.2
    const B = speaker('Tanti Maria', 'cu sacoșe de la piață', spec, { pitch: 1.35, type: 'old' })
    leash(m, n0, { r: 140 })
    b.say('Maică! Ajută-mă, că nu mai pot…', 4)
    await m.reach(n0, 3.4, { text: 'O bunică are nevoie de ajutor. Du-te la {y}Tanti Maria{/y}.', label: 'Bunica', inVehicle: false })
    face(b.char, p.pos.x, p.pos.z)
    const c = await m.say(B, ['Maică, ajută-mă cu sacoșele până la bloc. Am luat de toate de la piață: cartofi, varză, un televizor.'], { choices: ['Sigur, bunică. Dă-le încoace.', 'Scuze, mă grăbesc.'] })
    if (c === 1) { await m.talk(B, 'Tinerii din ziua de azi… Pe vremea mea, cărau și pianul.', 3); m.cancel() }
    b.state = 'follow'; b.target = p
    p.speedMul = 0.72
    m.track({ dispose: () => { p.speedMul = 1 } })
    m.objective('Du sacoșele bunicii acasă. Ea vine după tine.', { sub: 'Cu sacoșele mergi mai încet.' })
    m.marker(dest, 'Blocul bunicii')
    m.task(async () => { await m.wait(6); await m.talk(B, pick(['Știi ce scumpă-i varza? Ca un apartament în Centru.', 'Nepotul meu e în Germania. Programator. Nu știu ce programează, da\' programează.', 'Primarul ăsta… lasă, nu mai zic, că m-o auzit și data trecută.'])) })
    await m.until(() => dist(p.pos, dest) < 4 && dist(b.pos, dest) < 8, { timeout: 150, onTimeout: 'Bunica a obosit și s-a așezat pe o bancă.' })
    b.state = 'idle'
    await m.talk(B, `Mulțumesc, maică! Ține, o plăcintă caldă. Și niște bani, nu te supăra. Ești ${gen(g, 'un băiat', 'o fată')} de aur.`, 3.4)
    g.progress.feed(0.3)
    g.progress.addCivic(4)
    g.progress.addXp(35, 'Ai ajutat-o pe bunica')
    payout(m, { aura: 80, lei: 25, why: 'Ai cărat sacoșele bunicii', title: 'BUNICA E ACASĂ!', sub: 'O plăcintă caldă și 25 de lei „pentru drum"' })
    m.data.won = true
  },
}
