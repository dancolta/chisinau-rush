import { CAST } from '../../data/outfits.js'
import { fill } from '../../story/hero.js'
import { Power, play } from '../Minigames.js'
import { dist, pick, rand, hourIn, sceneSpot, leash, payout, speaker, lockPlayer, face, lose, blocked } from './common.js'

// The courtyard's sunflower-seed spitting championship. Jora holds the record; three tries to beat
// it: hold [E] to wind up, let go in the white zone. Too hard and it lands on your own trainers.

const JORA_SPEC = { ...CAST.gopnik1, top: { style: 'tracksuit', color: 0x6a1a1a, stripes: 0xf2f2f2 }, hat: { style: 'kepka', color: 0x1a1a1a } }
const JORA = speaker('Jora', 'Campionul curții la semințe', JORA_SPEC, { pitch: 0.9, type: 'gruff' })
const LADS = [CAST.gopnik2, CAST.gopnik3]
const OOH = ['Uuuu!', 'Ooo, bratan!', 'Aproape, aproape!', 'Asta-i pe bune?', 'Ha! Pe adidași!']

export const SEMINTE = {
  id: 'ev_seminte', title: 'Campionatul de semințe', icon: '🌻', who: 'Jora de la scara 2',
  viber: 'Azi e campionatul curții la scuipat semințe. Recordul meu nu-l bate nimeni. Veniți să vedeți, sau să pierdeți.',
  engage: 45,
  when: (g) => hourIn(g, 10, 3),
  where: (g, force) => sceneSpot(g, force ? 4 : 50, force ? 80 : 220, { zones: force ? null : ['soviet', 'acasa', 'garaje', 'linella'], room: 3 }),

  async script(m, spot) {
    const g = m.game, p = m.player, pr = g.progress
    const c = { x: spot.x, z: spot.z }
    // which way is open: that's where the seeds fly
    let dir = 0, room = -1
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2
      let free = 0
      for (let d = 2; d <= 10; d += 2) { if (blocked(g, c.x + Math.sin(a) * d, c.z + Math.cos(a) * d)) break; free = d }
      if (free > room) { room = free; dir = a }
    }
    const fx = Math.sin(dir), fz = Math.cos(dir), rx = Math.cos(dir), rz = -Math.sin(dir)
    const record = Math.round(rand(5.2, 6.3) * 10) / 10
    const rec = String(record).replace('.', ',')
    m.data.record = record
    const jora = m.spawn('jora', JORA_SPEC, c.x + rx * 1.4 - fx * 0.8, c.z + rz * 1.4 - fz * 0.8, { voice: JORA.voice })
    const lads = LADS.map((s, i) => m.spawn(null, s, c.x - rx * (1.6 + i * 0.9) - fx * (1.2 + i * 0.4), c.z - rz * (1.6 + i * 0.9) - fz * (1.2 + i * 0.4), { anim: 'squat', voice: { pitch: 0.85, type: 'gruff' } }))
    for (const n of [jora, ...lads]) { n.char.lookAtNow(c.x + fx * 4, c.z + fz * 4); n.home.ry = n.char.heading }
    // the line, and the record flag out on the asphalt
    m.prop((b) => {
      b.box(1.8, 0.012, 0.08, { color: 0xf2f2f2 })
      b.box(0.05, 0.5, 0.05, { z: record, color: 0x8a6a44 })
      b.box(0.3, 0.2, 0.01, { y: 0.35, z: record, x: 0.15, color: 0xc8202a })
    }, { x: c.x, z: c.z, ry: dir })
    leash(m, c, { r: 130 })
    m.task(async (live) => { while (live()) { await m.wait(5); if (live() && !m.data.started) jora.say(fill(g, pick(['Cine-i următorul?', `${rec} metri, [[bratan|tanti]]. Record de cartier.`, 'Semințe prăjite, calibrate, de campion!'])), 2.6) } })
    await m.reach(c, 3.4, { text: 'Campionatul curții la scuipat semințe. Du-te la {y}Jora{/y}.', label: 'Jora', inVehicle: false })
    face(jora.char, p.pos.x, p.pos.z)
    const choice = await m.say(JORA, [fill(g, `Șo, [[bratan|tanti]]? Campionat de semințe. Recordul meu: ${rec} metri. Trei încercări. Dacă-l bați, iei potul: douăzeci de lei.`)], { choices: ['Dă-mi semințele. Țineți-vă bine.', 'Nu scuip, am manierele de la mama.'] })
    if (choice === 1) { await m.talk(JORA, fill(g, 'Manierele… Ha! Du-te, [[bratan|tanti]], du-te.'), 2.4); m.cancel() }
    m.data.started = true
    lockPlayer(m, true)
    p.teleport(c.x, g.physics.groundHeight(c.x, c.z, 3), c.z, dir)
    g.cameraRig.yaw = dir
    let best = 0
    for (let i = 0; i < 3; i++) {
      const res = await play(m, new Power(g.side, { title: 'SCUIPATUL DE CAMPION', sub: `Încercarea ${i + 1} din 3 · Recordul lui Jora: ${rec} m${best ? ` · Al tău: ${best.toFixed(1).replace('.', ',')} m` : ''}` }))
      const v = res.power
      let d = res.over ? rand(0.3, 0.9) : 1.2 + 6.4 * Math.pow(v, 1.3) + (res.sweet ? 0.6 : 0) + rand(-0.25, 0.25)
      d = Math.max(0.3, Math.round(d * 10) / 10)
      // the seed, on a real parabola
      const y0 = p.pos.y + 1.55, th = 0.5, gr = 9.8
      const v0 = Math.sqrt(d * gr / Math.sin(2 * th))
      const flight = d / (v0 * Math.cos(th))
      g.fx?.bits.emit(p.pos.x + fx * 0.3, y0, p.pos.z + fz * 0.3, { vx: fx * v0 * Math.cos(th), vy: v0 * Math.sin(th), vz: fz * v0 * Math.cos(th), life: flight + 0.25, size: 0.09, color: [0.12, 0.1, 0.08], grav: gr, drag: 0 })
      p.char.anim.play(res.over ? 'facepalm' : 'point')
      g.audio?.sfx('whoosh', { vol: 0.4, pitch: 2 })
      await m.wait(Math.min(1.2, flight + 0.1))
      const lx = p.pos.x + fx * d, lz = p.pos.z + fz * d
      g.ui.pow(lx, 0.6, lz, `${d.toFixed(1).replace('.', ',')} m`)
      g.fx?.dust(lx, 0.05, lz, 3, [0.3, 0.26, 0.2])
      best = Math.max(best, d)
      const beat = d > record
      for (const n of lads) if (Math.random() < 0.7) n.say(beat ? pick(['Nuuu!', 'Record nou!', 'Jora, ai pierdut!']) : res.over ? 'Ha! Pe adidași!' : pick(OOH), 2)
      if (beat) break
      await m.wait(0.6)
    }
    lockPlayer(m, false)
    m.data.best = best
    if (best <= record) {
      jora.char.anim.play('cheer')
      await m.talk(JORA, fill(g, 'Scuipi ca o bunică, [[bratan|tanti]]. Mai antrenează-te.'), 2.4)
      g.side?.aura.lose(10, 'Scuipi ca o bunică')
      lose(m, `Jora rămâne campion: ${rec} m. Tu: ${best.toFixed(1).replace('.', ',')} m.`)
    }
    jora.char.anim.play('facepalm')
    for (const n of lads) n.char.anim.play('cheer')
    await m.talk(JORA, fill(g, 'Nu se poate… Record nou! Respect, [[bratan|tanti]]. Na potul.'), 2.6)
    pr.addRespect('gop', 4, 'campion la semințe')
    payout(m, { aura: 100, lei: 20, why: 'Campion la semințe', title: 'RECORD NOU!', sub: `${best.toFixed(1).replace('.', ',')} m. Potul e al tău: 20 de lei.` })
    g.side?.linger(m, [jora, ...lads], c)
    m.data.won = true
  },
}
