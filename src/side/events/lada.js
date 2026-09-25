import { CAST } from '../../data/outfits.js'
import { onRoad } from '../../world/CityLayout.js'
import { Mash, play } from '../Minigames.js'
import { dist, pick, here, leash, payout, speaker, lockPlayer, face, lose } from './common.js'

// Nea Petrică's Lada went nose-first into one of the city's famous potholes. Again. He revs, you
// push: mash [E] until it pops out before the clutch gives up.

const PETRICA_SPEC = { ...CAST.vatman, top: { style: 'jacket', color: 0x4a3a2a, shirt: 0xd9c9a8 }, hat: { style: 'kepka', color: 0x3a3a3a }, belly: 0.8 }
const PETRICA = speaker('Nea Petrică', 'Lada 2107, din 1989, „ca nouă"', PETRICA_SPEC, { pitch: 0.95, type: 'old' })
const GRUMBLE = ['Iar groapa asta! A treia oară săptămâna asta!', 'Primăria zice că „lucrează la asta"!', 'Cine m-ajută, bre?!', 'Am roșii în portbagaj, se strică!']

// a road spot for it: one of the city's unfixed potholes (they're all on roads), or a kerb lane
function holeSpot(g, min, max) {
  const p = here(g)
  const list = (g.story?.potholes?.list || []).filter((h) => { const d = dist(h, p); return !h.fixed && d >= min && d <= max && onRoad(h.x, h.z) })
  if (list.length) { const h = pick(list); return { x: h.x, z: h.z } }
  return null
}

// along the lane the hole is in (right-hand traffic: east on the south side of an E-W road…)
function laneHeading(x, z) {
  const r = onRoad(x, z)
  if (!r) return 0
  if (r.z !== undefined) return z >= r.z ? Math.PI / 2 : -Math.PI / 2
  return x <= r.x ? 0 : Math.PI
}

export const LADA = {
  id: 'ev_lada', title: 'Lada în groapă', icon: '🕳️', who: 'Nea Petrică',
  viber: 'Am căzut cu Lada în groapă, iar. Cea de lângă chioșc. Aștept un om cu brațe, nu un om cu telefon.',
  engage: 60,
  when: (g) => !!holeSpot(g, 60, 240),
  where: (g, force) => holeSpot(g, force ? 8 : 60, force ? 600 : 240),

  async script(m, spot) {
    const g = m.game, p = m.player, pr = g.progress
    const ry = laneHeading(spot.x, spot.z)
    const fx = Math.sin(ry), fz = Math.cos(ry)
    // the front wheels in the hole
    const cx = spot.x - fx * 1.5, cz = spot.z - fz * 1.5
    const car = m.vehicle('jiguli', cx, cz, ry, { parked: true, color: pick([0xd8c8a0, 0x8a2a2a, 0x2a4a7a, 0x3a6a4a]) })
    car.locked = true
    car.handbrake = true
    car.pose = { pitch: 0.17, roll: 0.05, dy: -0.12 }
    m.data.car = car
    const side = { x: cx + Math.cos(ry) * 1.9, z: cz - Math.sin(ry) * 1.9 }
    const nea = m.spawn('petrica', PETRICA_SPEC, side.x, side.z, { voice: PETRICA.voice })
    nea.lookAtPlayer = true
    leash(m, spot, { r: 140 })
    let smoke = 0
    m.every((dt) => { if ((smoke -= dt) <= 0) { smoke = 0.5; g.fx?.smoke(car.pos.x - fx * 2.3, car.pos.y + 0.4, car.pos.z - fz * 2.3, 0.35, 0.5) } })
    m.task(async (live) => { while (live()) { await m.wait(4.5); if (live()) nea.say(pick(GRUMBLE), 2.6) } })
    await m.reach(side, 3.2, { text: 'O Lada a căzut în groapă. Ajută-l pe {y}nea Petrică{/y}.', label: 'Nea Petrică', inVehicle: false })
    face(nea.char, p.pos.x, p.pos.z)
    const c = await m.say(PETRICA, ['Măi băiete, uite! Iar groapa asta. Eu am plătit impozitul pe drum, drumul a plătit pe mine.', 'Împinge din spate, că eu apăs pe gaz. Tare, că Lada-i bătrână, da\' încăpățânată!'], { choices: ['Hai, la trei!', 'Sun la primărie, poate vine cineva.'] })
    if (c === 1) { await m.talk(PETRICA, 'La primărie… Hahaha! Bună asta. Na, du-te.', 2.6); m.cancel() }
    nea.ride(car)
    g.audio?.sfx('door', { at: car.pos, vol: 0.6 })
    const back = { x: cx - fx * 3.2, z: cz - fz * 3.2 }
    await m.reach(back, 1.8, { text: 'Treci {y}în spatele Ladei{/y} și împinge.', label: 'Împinge', inVehicle: false })
    face(p.char, car.pos.x, car.pos.z)
    lockPlayer(m, true)
    g.audio?.sfx('engine_crank', { at: car.pos, vol: 0.8 })
    const res = await play(m, new Mash(g.side, {
      title: 'ÎMPINGE LADA!', sub: 'Nea Petrică apasă pe gaz. Tu împingi.',
      onPress: (k) => {
        p.char.anim.play('enter')
        car.pose.pitch = 0.17 - k * 0.1 + (Math.random() - 0.5) * 0.05
        if (Math.random() < 0.5) g.fx?.dust(car.pos.x + fx * 1.3, car.pos.y + 0.1, car.pos.z + fz * 1.3, 4, [0.45, 0.4, 0.34])
        if (Math.random() < 0.25) g.audio?.sfx('engine_crank', { at: car.pos, vol: 0.5, pitch: 0.9 + k * 0.4 })
      },
    }))
    lockPlayer(m, false)
    m.data.result = res
    if (!res?.ok) {
      nea.unride(side.x, side.z, ry)
      lose(m, 'Lada a rămas în groapă. Primăria zice că „lucrează la asta".')
    }
    // out it pops, backfire and all
    car.pose = null
    g.audio?.sfx('backfire', { at: car.pos, vol: 1 })
    g.fx?.smoke(car.pos.x - fx * 2.3, car.pos.y + 0.4, car.pos.z - fz * 2.3, 0.15, 1.4)
    g.cameraRig?.shake(0.3)
    car.locked = false
    m.story.leave(car)
    g.side?.linger(m, [nea], spot)
    g.audio?.horn(car, 0.9)
    pr.feed(0.25)
    payout(m, { aura: 110, lei: 40, why: 'Lada scoasă din groapă', title: 'LADA E LIBERĂ!', sub: 'Nea Petrică îți lasă 40 de lei și un borcan de murături.' })
    m.data.won = true
    await m.wait(0.3)
  },
}
