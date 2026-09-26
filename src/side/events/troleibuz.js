import { CAST } from '../../data/outfits.js'
import { DOWN } from '../../data/aura.js'
import { SkillCheck, play } from '../Minigames.js'
import { dist, here, leash, payout, speaker, lockPlayer, face, pick, lose } from './common.js'

// Trolleybus 22 jumped off the wires on Ștefan cel Mare. The driver's back is from Brezhnev's
// time, so you pull the ropes at the back and drop the poles on the wire when the current
// hums: a timing bar, three rounds, and three shocks and it's over.

const VATMAN = speaker('Nea Tolea', 'Vatman, troleibuzul 22', CAST.vatman, { pitch: 0.9, type: 'male' })

function trolleyNear(g, min, max) {
  const p = here(g)
  let best = null, bd = 1e9
  for (const d of g.traffic?.drivers || []) {
    if (!d.v?.def.trolley || d.v.disposed || d.stalled) continue
    const k = dist(d.v.pos, p)
    if (k >= min && k <= max && k < bd) { bd = k; best = d }
  }
  return best
}

// behind the bus, where the ropes hang, and up at the pole tips
const back = (v, k = 7) => ({ x: v.pos.x - Math.sin(v.heading) * k, z: v.pos.z - Math.cos(v.heading) * k })
const tips = (v) => ({ x: v.pos.x - Math.sin(v.heading) * 8, y: v.pos.y + 5.8, z: v.pos.z - Math.cos(v.heading) * 8 })

export const TROLEIBUZ = {
  id: 'ev_troleibuz', title: 'Troleibuzul 22', icon: '🚎', who: 'Nea Tolea (vatman)',
  viber: 'Iar mi-au sărit coarnele de pe fir, pe Ștefan cel Mare! Stau cu 40 de pasageri și niciun electrician. Ajutați, oameni buni!',
  engage: 55,
  when: (g) => !!trolleyNear(g, 40, 260),
  where: (g, force) => { const d = trolleyNear(g, force ? 0 : 40, force ? 600 : 260); return d ? { x: d.v.pos.x, z: d.v.pos.z, d } : null },
  // the bus stops dead as soon as the news is out, and waits for you
  offer: (g, spot) => { spot.d.stalled = true; return () => { spot.d.stalled = false } },
  offerTick(g, spot, dt) {
    const v = spot.d.v
    spot.x = v.pos.x; spot.z = v.pos.z
    spot.sparkT = (spot.sparkT || 0) - dt
    if (spot.sparkT <= 0 && dist(v.pos, here(g)) < 120) { spot.sparkT = 1.2 + Math.random(); const t = tips(v); g.fx?.sparks(t.x, t.y, t.z, 8) }
  },

  async script(m, spot) {
    const g = m.game, pr = g.progress
    const d = spot.d, v = d.v
    if (!v || v.disposed) m.cancel()
    d.stalled = true
    m.track({ dispose: () => { d.stalled = false } })
    const kerb = { x: v.pos.x - Math.cos(v.heading) * 2.8, z: v.pos.z + Math.sin(v.heading) * 2.8 }
    const vat = m.spawn('vatman', CAST.vatman, kerb.x, kerb.z, { voice: VATMAN.voice })
    vat.char.anim.play('wave')
    m.data.bus = v
    leash(m, v.pos, { r: 150 })
    let spark = 0
    m.every((dt) => { if ((spark -= dt) <= 0) { spark = 1.4 + Math.random() * 1.4; const t = tips(v); g.fx?.sparks(t.x, t.y, t.z, 10); if (dist(m.P, v.pos) < 40) g.audio?.sfx('glass', { at: t, vol: 0.25, pitch: 1.6 }) } })
    m.task(async (live) => { while (live()) { await m.wait(5); if (live() && !vat.char.ko) vat.say(pick(['Hei! Aici! Ajutooor!', 'Coarneleee!', 'Pasagerii mă omoară!']), 2.4) } })
    await m.reach(kerb, 3.4, { text: 'Troleibuzul 22 a rămas fără curent. Ajută-l pe {y}vatman{/y}.', label: 'Vatmanul', inVehicle: false })
    face(vat.char, m.player.pos.x, m.player.pos.z)
    const c = await m.say(VATMAN, ['Bratan! Mi-au sărit coarnele de pe fir, și io am spatele de pe vremea lui Brejnev.', 'Tragi de frânghii în spate și le pui pe fir când bâzâie curentul. Doar să nu te curenteze, că-mi pierd și ultimul ajutor.'], { choices: ['Hai, le pun eu.', 'Nu mă bag, mi-e frică de curent.'] })
    if (c === 1) { await m.talk(VATMAN, 'Bine, bine. Stăm aici până vine primăria. Adică până la iarnă.', 3); m.cancel() }
    vat.walkTo(kerb.x + Math.sin(v.heading) * 4, kerb.z + Math.cos(v.heading) * 4)
    const b = back(v)
    await m.reach(b, 2.4, { text: 'Du-te în spatele troleibuzului, la {y}frânghii{/y}.', label: 'Frânghiile', inVehicle: false })
    face(m.player.char, v.pos.x, v.pos.z)
    lockPlayer(m, true)
    m.timer(60, 'Pasagerii au plecat pe jos. Troleibuzul rămâne acolo până mâine.')
    const res = await play(m, new SkillCheck(g.side, {
      title: 'COARNELE TROLEIBUZULUI', labels: ['Primul corn', 'Al doilea corn', 'Dă-i curent!'],
      onHit: (i) => { const t = tips(v); g.fx?.sparks(t.x, t.y, t.z, 16 + i * 8); g.audio?.sfx('metal_hit', { at: t, vol: 0.7 }); m.player.char.anim.play('cheer') },
      onMiss: () => {
        const t = tips(v)
        g.fx?.sparks(m.player.pos.x, m.player.pos.y + 1.6, m.player.pos.z, 22)
        g.fx?.sparks(t.x, t.y, t.z, 12)
        g.audio?.sfx('glass', { vol: 0.8, pitch: 0.7 })
        g.cameraRig?.shake(0.45)
        m.player.char.anim.play('hit', { side: 1 })
        pr.hurt(4)
        g.side?.aura.lose(DOWN.zap[0], DOWN.zap[1])
      },
    }))
    m.stopTimer()
    lockPlayer(m, false)
    if (!res?.ok) { vat.say('Lasă, bratan. Sun la depou.', 3); lose(m, 'Te-a curentat de trei ori. Vatmanul a sunat la depou. Vin mâine.') }
    d.stalled = false
    g.audio?.sfx('crowd_cheer', { at: v.pos, vol: 0.8 })
    const t = tips(v)
    g.fx?.sparks(t.x, t.y, t.z, 30)
    await m.talk(VATMAN, res.misses ? 'Merge! Te-a scuturat nițel, da\' merge! Pasagerii te aplaudă. În gând.' : 'Din prima! Tu ai mai lucrat la depou? Pasagerii te aplaudă. În gând.', 3)
    payout(m, { aura: res.misses ? 110 : 150, lei: 40, why: res.misses ? 'Troleibuzul 22 merge din nou' : 'Troleibuz reparat din prima', title: 'TROLEIBUZUL MERGE!' })
    pr.addCivic(5)
    m.data.won = true
  },
}
