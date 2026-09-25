import { CAST } from '../../data/outfits.js'
import { pathThrough } from '../../story/Kit.js'
import { dist, pick, here, driving, leash, payout, speaker, lockPlayer, lose } from './common.js'

// Maxi-taxi 117 challenges you to a race to its next stop. Its driver leaves on "2" (they
// always do), the whole city knows the route, and whoever loses pays for the diesel.

const DRIVER = { ...CAST.taxist, top: { style: 'shirt', color: 0x3a4a6a, short: true }, hat: { style: 'kepka', color: 0x1a1a1a }, sunglasses: true }
const SOFER = speaker('Șoferul rutierei 117', 'Botanica - Gară, fără oprire la cerere', DRIVER, { pitch: 0.85, type: 'gruff' })
const TAUNT = ['Hai, hai, șmechere!', 'Rutiera nu frânează pentru nimeni!', 'Am 24 de pasageri și tot te bat!', 'Loc în picioare mai am, dacă vrei!']

// the route between two intersections, as lane points (the rutiera drives it, you drive how you like)
function plan(g, from, minD, maxD) {
  const G = g.traffic?.graph
  if (!G) return null
  const a = G.nearestNode(from.x, from.z)
  const ends = G.nodes.filter((n) => { const d = dist(n, a); return d >= minD && d <= maxD })
  for (let k = 0; k < 6 && ends.length; k++) {
    const b = pick(ends)
    const pts = G.route(a.x, a.z, b.x, b.z)
    const nodes = []
    for (let i = 1; i < pts.length - 1; i++) { const n = G.nearestNode(pts[i].x, pts[i].z); if (!nodes.length || nodes[nodes.length - 1] !== n) nodes.push(n) }
    if (nodes[0] !== a) nodes.unshift(a)
    if (nodes.length < 3) continue
    const path = pathThrough(G, nodes.map((n) => [n.j, n.i]), { lane: 0, speed: 21 })
    if (path.length < 4) continue
    return { a, b, path }
  }
  return null
}

function stopName(g, p) {
  let best = null, bd = 1e9
  for (const q of Object.values(g.world.places)) { if (q.kind !== 'landmark') continue; const d = dist(q, p); if (d < bd) { bd = d; best = q } }
  return best && bd < 160 ? best.name : 'stația următoare'
}

export const RUTIERA = {
  id: 'ev_rutiera', title: 'Rutiera 117', icon: '🚐', who: 'Vecinul de la etajul 3',
  viber: 'Șoferul de pe 117 zice că nimeni din blocul nostru nu-l bate până la stație. Cine are mașină, să-l facă de râs!',
  engage: 95,
  when: (g) => driving(g),
  where: (g, force) => {
    const G = g.traffic?.graph
    if (!G) return null
    const p = here(g)
    const starts = G.nodes.filter((n) => { const d = dist(n, p); return force ? d > 20 && d < 220 : d > 70 && d < 200 })
    for (let k = 0; k < 6 && starts.length; k++) {
      const s = pick(starts)
      const r = plan(g, s, 260, 430)
      if (r) return { x: s.x, z: s.z, plan: r }
    }
    return null
  },

  async script(m, spot) {
    const g = m.game, p = m.player
    const { path, b } = spot.plan
    const finish = { x: b.x, z: b.z }
    const name = stopName(g, finish)
    const s0 = path[0], s1 = path[1]
    const ry = Math.atan2(s1.x - s0.x, s1.z - s0.z)
    const bus = m.vehicle('rutiera', s0.x, s0.z, ry, { color: 0xf2c12e })
    bus.locked = true
    bus.handbrake = true
    m.data.bus = bus; m.data.finish = finish
    leash(m, bus.pos, { r: 220, text: 'Rutiera a plecat fără tine. Așa-s rutierele.' })
    // wait behind it
    const behind = { x: s0.x - Math.sin(ry) * 12, z: s0.z - Math.cos(ry) * 12 }
    m.task(async (live) => { while (live() && !m.data.go) { await m.wait(3.5); if (live() && !m.data.go) g.audio?.horn(bus, 0.7) } })
    await m.reach(behind, 16, { text: 'Rutiera 117 te provoacă la cursă. Oprește {y}lângă ea{/y}.', label: 'Rutiera 117', inVehicle: true })
    const c = await m.say(SOFER, [`Ce, te crezi Schumacher? Până la ${name}. Cine pierde plătește motorina.`], { choices: ['Davai. Pregătește banii.', 'Nu mă bag, am mașina de la nașu\'.'] })
    if (c === 1) { await m.talk(SOFER, 'Așa mă gândeam și eu. Hai, fugi.', 2.4); m.cancel() }
    const car = m.car
    if (!car) lose(m, 'Ai coborât din mașină. Rutiera a plecat râzând.')
    m.data.car = car
    m.objective(`Ajungi primul la {y}${name}{/y}!`, { sub: 'Rutiera nu așteaptă „1". Niciodată.' })
    const ring = m.ring(finish.x, finish.z, { r: 10, color: 0xffffff })
    m.marker(finish, name)
    lockPlayer(m, true)
    // 3… 2… (the rutiera is off) … 1… DAVAI
    let drv = null
    const ui = g.ui
    const cd = ui.countdown(['3', '2', '1', 'DAVAI!'])
    await m.wait(0.9)
    drv = m.driver(bus, path.slice(1), { speed: 21, avoid: true })
    bus.handbrake = false
    m.data.go = true
    await cd
    lockPlayer(m, false)
    m.timer(120, 'Ai rămas fără timp. Rutiera a ajuns demult.')
    let outT = 0, tauntT = 3, res = null
    m.every((dt) => {
      const v = m.car
      outT = v === car ? 0 : outT + dt
      const dR = dist(bus.pos, finish), dP = dist(car.pos, finish)
      if (outT > 10) res = 'out'
      else if (car.broken) res = 'broken'
      else if (v === car && dP < 11) res = 'won'
      else if (dR < 12 || drv.done) res = 'lost'
      if (res) return true
      // the rutiera keeps it close: faster when it's behind, easier when it's ahead
      drv.speedMul = Math.max(0.85, Math.min(1.25, 1 + (dR - dP) / 300))
      if ((tauntT -= dt) <= 0) { tauntT = 6 + Math.random() * 4; if (dist(bus.pos, car.pos) < 30) m.task(() => m.talk(SOFER, pick(TAUNT), 2)) }
    })
    await m.until(() => res)
    m.stopTimer()
    m.marker(null)
    m.untrack(ring)
    m.data.result = res
    if (res === 'out') lose(m, 'Ai coborât din mașină. Rutiera a plecat râzând.')
    if (res === 'broken') lose(m, 'Mașina e praf. Rutiera trece pe lângă tine și claxonează.')
    m.story.leave(bus)
    if (res === 'lost') {
      g.audio?.horn(bus, 1)
      lose(m, `Rutiera 117 a ajuns prima la ${name}. Cu 24 de pasageri în picioare.`)
    }
    g.audio?.sting('race_win')
    payout(m, { aura: 150, lei: 60, why: 'Ai bătut rutiera 117', title: 'PRIMUL LA STAȚIE!', sub: `Șoferul plătește motorina: 60 lei` })
    m.data.won = true
  },
}
