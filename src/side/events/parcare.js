import { CAST } from '../../data/outfits.js'
import { dist, pick, driving, kerbSpot, leash, payout, speaker, lose, GroundRect } from './common.js'

// Parking "la moldovenește": the naș wants his spot held, right on the pavement in front of the
// shop, like serious people do. Stop inside the box, lined up with the kerb, before the timer runs
// out. The closer and straighter, the more deputy-like (and the more aura).

const GRANNY = { ...CAST.zina, top: { style: 'coat', color: 0x5a3a6a, lapel: 0x2a2a3a }, hat: { style: 'basma', color: 0x2a4a8a, dots: 0xf2e6c8 } }
const BABA = speaker('Bunica de la parter', 'a notat numărul', GRANNY, { pitch: 1.35, type: 'old' })
const HW = 1.3, HL = 2.9

export const PARCARE = {
  id: 'ev_parcare', title: 'Parcare la moldovenește', icon: '🅿️', who: 'Nașul',
  viber: 'Finule, ține-mi locul pe trotuar, în fața magazinului. Parchează fix acolo, ca oamenii serioși. Vin în cinci minute. Sau în douăzeci.',
  engage: 85,
  when: (g) => driving(g),
  where: (g, force) => kerbSpot(g, force ? 18 : 90, force ? 420 : 260),

  async script(m, spot) {
    const g = m.game, pr = g.progress
    const c = { x: spot.x, z: spot.z }
    const ry = spot.ry
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry)
    m.data.spot = spot
    const box = m.track(new GroundRect(g, c.x, c.z, ry, HW, HL))
    // the sign, of course: no parking
    m.prop((b) => {
      b.cyl(0.045, 0.045, 2.3, 8, { color: 0x8a8f96 })
      b.cyl(0.36, 0.36, 0.04, 20, { y: 2.2, rx: Math.PI / 2, center: true, color: 0xc8202a })
      b.cyl(0.29, 0.29, 0.05, 20, { y: 2.2, z: 0.005, rx: Math.PI / 2, center: true, color: 0x1f5fb8 })
      b.box(0.5, 0.06, 0.06, { y: 2.2, z: 0.03, rz: 0.785, center: true, color: 0xc8202a })
      b.box(0.5, 0.06, 0.06, { y: 2.2, z: 0.03, rz: -0.785, center: true, color: 0xc8202a })
    }, { x: c.x + fx * (HL + 0.8), z: c.z + fz * (HL + 0.8), ry: ry + Math.PI / 2 })
    leash(m, c, { r: 320, secs: 8, text: 'Nașul a găsit singur loc. Pe trecerea de pietoni.' })
    m.objective('Parchează „la moldovenește": fix în {y}chenarul de pe trotuar{/y}.', { sub: 'Oprește în chenar, drept pe lângă bordură. Ai 45 de secunde.' })
    m.marker(c, 'Parcarea')
    m.timer(45, 'Locul l-a luat un Gelik negru. Evident.')
    // inside, lined up and stopped for a moment
    let hold = 0, best = null
    m.every((dt) => {
      const v = m.car
      if (!v) { hold = 0; return }
      // tests: the car lands in the box as if parked by a deputy
      if (g.side?.auto === 'win' && !m.data.autoParked) { m.data.autoParked = true; v.teleport(c.x, g.physics.groundHeight(c.x, c.z, 3) + 0.2, c.z, ry) }
      const dx = v.pos.x - c.x, dz = v.pos.z - c.z
      const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz
      const align = Math.abs(Math.cos(v.heading - ry))
      const inside = Math.abs(lx) < HW + 0.35 && Math.abs(lz) < HL + 0.6 && align > 0.86
      if (inside && Math.abs(v.speed) < 0.7) {
        hold += dt
        const q = Math.max(0, 1 - (Math.abs(lx) / HW) * 0.5 - (Math.abs(lz) / HL) * 0.5) * 0.7 + (align - 0.86) / 0.14 * 0.3
        best = Math.max(best ?? 0, q)
      } else hold = 0
      m.sub(inside ? (Math.abs(v.speed) < 0.7 ? '{g}Perfect… nu mișca!{/g}' : 'Frânează! Ești în chenar.') : 'Oprește în chenar, drept pe lângă bordură.')
    })
    await m.until(() => hold > 1.2)
    m.stopTimer()
    m.marker(null)
    if (best == null) best = 0.8
    m.data.quality = best
    // the pavement reacts
    const bx = c.x + rx * (HW + 2.2), bz = c.z + rz * (HW + 2.2)
    const baba = m.spawn('baba', GRANNY, bx, bz, { voice: BABA.voice })
    baba.lookAtPlayer = true
    baba.char.anim.play('point')
    m.task(() => m.talk(BABA, pick(['Unde-ai parcat, măi?! Pe trotuar?! Io pe unde merg cu căruciorul?', 'Obraznicule! Am notat numărul! Îl dau la televizor!', 'Asta-i trotuarul meu de 40 de ani!']), 3.4))
    pr.addRespect('bab', -2, 'ai parcat pe trotuar')
    const grade = best >= 0.8 ? ['ca un deputat', 180] : best >= 0.5 ? ['ca un taximetrist', 130] : ['ca tata la piață', 90]
    box.mat.color.setHex(0x7ee07a)
    payout(m, { aura: grade[1], lei: 30, why: `Parcat ${grade[0]}`, title: 'PARCAT!', sub: `Parcat ${grade[0]}. Nașul îți dă 30 de lei „pentru loc".` })
    g.side?.linger(m, [baba], c)
    m.data.won = true
    await m.wait(0.5)
  },
}
