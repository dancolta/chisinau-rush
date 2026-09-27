import { CAST, randomCivilian } from '../../data/outfits.js'
import { GOALS, mmss } from '../Rating.js'
import { LOOKS } from '../cast.js'
import { gen } from '../hero.js'
import { dist, rand, pickOne, banner, crowd, cheerAll, clamp } from './common.js'
import { GroundRect, lockPlayer } from '../../side/events/common.js'
import { SkillCheck, play } from '../../side/Minigames.js'

// Favours: short side missions people ring you about between story missions (see Favors.js
// for how they're offered). Each is a small story with its own mechanic, built from what the
// game already has: fragile cargo and potholes, a convoy that follows you, stealth under vision
// cones, a race against the city hall's "repair" crew, a trolleybus you have no licence for.
// They run through the same mission runner as the story, with ratings, checkpoints and replays.

const CH = 'Favor'

// a lane position as { x, z } (Kit lanePos through the mission context)
const lanePt = (m, id, dir, along, opts) => { const q = m.lane(id, dir, along, opts); return { x: q.x, z: q.z, ry: q.ry } }
// saying yes, with what it pays as chips on the choice (a replay only pays for new stars)
const yes = (m, text, out) => ({ text, out: m.replay ? { info: '↻ plătesc doar stelele noi' } : out })
// a patch in the road: a pothole (dark) or a filled one
function patch(b, x, z, { r = 1.05, color = 0x121214, rim = 0x3a3a3e } = {}) {
  b.cyl(r + 0.28, r + 0.28, 0.012, 16, { x, y: 0.012, z, color: rim })
  b.cyl(r, r, 0.02, 16, { x, y: 0.02, z, color })
}

// =============================================================================
// Favor · Borcanele Tantei Maria — 40 kg of jars to the market; every pothole costs a jar or three
const JAR_RIDE = [
  'Pe aici, maică, pe aici. Nu, pe aici. Lasă, tu știi mai bine. Ba nu.',
  'Zacusca asta am făcut-o cu vinetele de la Hâncești. Maică-ta mi le-a dat. Salut-o.',
  'Nepotul meu zice că zacusca se vinde acum pe internet. Io zic că pe internet nu-i piață, e numa\' scandal.',
  'Ai auzit? Primarul zice că astupă gropile până-n 2040. Până atunci am borcane.',
  'Groapa ceea e de pe vremea lui Snegur. O știu. Am spart în ea compot de cireșe în 1994.',
  'Nu te grăbi. Da\' grăbește-te. Dusea de la Ialoveni nu doarme.',
  '(la telefon) Dusea? Nu, nu-s încă. Ține-mi locul. NU, nu-l ține pentru tine!',
]
const JAR_CRASH = ['Vai, compotul!', 'Maică, murăturile!', 'Ușurel, că nu-s cartofi!', 'Dulceața de gutui! Era pentru nuntă!', '[[Doamne, iartă-l|Doamne, iart-o]], că nu știe ce face!']
// last night's potholes on the way to the market (no map has them yet)
const FRESH = [['S1', 'E', 95, 1], ['V4', 'N', 105, 0], ['V5', 'N', 60, 0], ['BD', 'E', 150, 1]]

export const borcane = {
  id: 'sm_borcane', side: true, chapterName: CH, title: 'Borcanele Tantei Maria', icon: '🫙',
  desc: 'Tanti Maria de la scara 3 duce 40 de kile de borcane la Piața Centrală. Fiecare groapă e un borcan spart; fiecare frână bruscă, o zacuscă.',
  unlock: 'jiguli',
  giver: { pos: () => ({ x: 22, z: 150.2, ry: Math.PI }), speaker: 'maria', label: 'Tanti Maria' },
  reward: { lei: 40, xp: 120, civic: 3 },
  stars: [
    GOALS.check('Minimum 36 de borcane întregi', (m) => (m.data.jars ?? 0) >= 36, (m) => `${m.data.jars ?? 0}/40`),
    GOALS.check('Drumul până la piață sub 1:10', (m) => (m.data.driveT ?? 999) <= 70, (m) => mmss(m.data.driveT)),
  ],
  async script(m) {
    const g = m.game, pr = g.progress
    const maria = m.giver('maria')
    const spot = { x: maria.pos.x, z: maria.pos.z }
    // the jars, stacked on the pavement beside her
    const stack = m.prop((b) => {
      for (let i = 0; i < 4; i++) b.box(0.55, 0.34, 0.4, { x: (i % 2) * 0.62, y: Math.floor(i / 2) * 0.35, z: 0, color: i % 2 ? 0x8a6a44 : 0x9a7a54 })
      const jc = [0xb8321f, 0xd98a1a, 0x7a2a4a, 0x5a8a3a]
      for (let k = 0; k < 6; k++) b.cyl(0.075, 0.075, 0.17, 8, { x: 0.05 + (k % 3) * 0.24, y: 0.7, z: -0.1 + Math.floor(k / 3) * 0.2, color: jc[k % 4] })
    }, { x: spot.x + 1.2, z: spot.z + 0.3 })
    const c = await m.say('maria', [
      `Maică, tu ești ${gen(g, 'băiatul de-l', 'fata de-o')} laudă Zina? Zice că ai mașină și inimă bună. Mașina mă interesează.`,
      'Am patruzeci de kile de borcane: zacuscă, murături, compot de vișine și dulceață de gutui din 2019. E ca vinul, se învechește.',
      'Trebuie să fiu la Piața Centrală până la prânz, că altfel îmi ia locul Dusea de la Ialoveni. Și Dusea vinde zacuscă din magazin, pusă în borcanul ei!',
    ], { choices: [yes(m, 'Urcați, tanti Maria. Le ducem întregi.', { lei: 40, xp: 120, bab: 3, info: '🫙 +1 leu pe borcan' }), 'Acum nu pot, tanti.'] })
    if (c === 1) { await m.say('maria', ['Bine, maică. Stau aici. Borcanele nu fug. Dusea fuge.']); m.cancel() }
    // a car: the one you came in, one close by, or Fiodor's Combi from the second floor
    if (!m.car) {
      const k = m.lane('S1', 'E', spot.x + 10, { curb: true })
      const car = m.needCar(k.x, k.z, k.ry, 'combi')
      if (car.missionSpawned) await m.say('maria', ['Ia Combi-ul lui Fiodor de la etajul doi. E descuiat: Fiodor zice că nimeni nu fură un Combi din 2003. Are dreptate.'])
      m.objective('Urcă în {y}mașină{/y}. Borcanele încap în portbagaj. Aproape.')
      m.marker(car.pos, car.def.name)
      await m.until(() => m.car && !m.car.broken)
    }
    m.objective('Oprește lângă {y}Tanti Maria{/y}, să încarce borcanele.', { sub: '' })
    m.marker(spot, 'Tanti Maria')
    await m.until(() => m.car && !m.car.broken && Math.abs(m.car.speed) < 1.5 && dist(m.car.pos, maria.pos) < 10)
    m.marker(null)
    const car = m.car
    await m.fade(1, 250)
    m.untrack(stack)
    maria.ride(car)
    g.audio?.sfx('door', { vol: 0.6 })
    await m.wait(0.2)
    await m.fade(0, 300)
    // ---- the drive: a jar for a knock, three for a pothole, one for a slide ------------------------------
    const dest = { x: 252, z: 9.25 }
    const holes = FRESH.map(([id, dir, along, lane]) => ({ ...lanePt(m, id, dir, along, { lane }), cool: 0 }))
    m.prop((b) => { for (const h of holes) patch(b, h.x, h.z) }, { x: 0, z: 0, y: 0 })
    m.data.jars = 40
    const lose = (n, why) => {
      n = Math.min(n, m.data.jars)
      if (n <= 0) return
      m.data.jars -= n
      g.audio?.sfx('glass', { vol: 0.8, pitch: 0.85 + Math.random() * 0.4 })
      m.notify(`🫙 {r}−${n} ${n === 1 ? 'borcan' : 'borcane'}{/r} · ${why}`, 1.8, 'red')
      if (Math.random() < 0.75) m.task(() => m.talk('maria', pickOne(JAR_CRASH), 2.2))
      if (m.data.jars < 20) m.fail('Jumate din borcane s-au spart. Tanti Maria plânge în zacuscă.')
    }
    const offCrash = g.events.on('player:crash', (e) => { if (m.car === car && (e.force || 0) >= 12) lose(clamp(Math.round(((e.dv || 5) - 2) * 0.8), 1, 8), 'bușitură') })
    const offHole = g.events.on('pothole:hit', (e) => { if (e.car === car) lose(3, 'groapă') })
    m.track({ dispose: () => { offCrash(); offHole() } })
    let slideT = 0, outT = 0
    m.every((dt) => {
      if (m.car !== car) { outT += dt; if (outT > 20) m.fail('Ai lăsat-o pe Tanti Maria în mașină. A plecat pe jos. Cu borcanele.'); return }
      outT = 0
      for (const h of holes) {
        h.cool -= dt
        if (h.cool <= 0 && Math.abs(car.speed) > 4 && dist(car.pos, h) < 1.7) {
          h.cool = 1.2
          car.bump = 0.12; car.damage(2)
          g.cameraRig.shake(0.35); g.audio?.sfx('bump', { vol: 0.9 })
          lose(3, 'groapă proaspătă')
        }
      }
      // sliding round a corner: the crates shift
      if (Math.abs(car.lateral) > 3.5 && Math.abs(car.speed) > 8) { slideT += dt; if (slideT > 0.6) { slideT = 0; lose(1, 'derapaj') } } else slideT = Math.max(0, slideT - dt)
      const j = m.data.jars, col = j >= 36 ? 'g' : j >= 28 ? 'y' : 'r'
      m.sub(`🫙 Borcane: {${col}}${j}/40{/${col}} · ocolește gropile`)
    })
    m.timer(140, 'Dusea de la Ialoveni i-a luat locul. Tanti Maria vinde acum la Autogară. Supărată.')
    m.objective('Du-o pe Tanti Maria la {y}Piața Centrală{/y}. {r}Borcanele sunt fragile.{/r}')
    m.marker(dest, 'Piața Centrală')
    const lines = [...JAR_RIDE].sort(() => Math.random() - 0.5).slice(0, 4)
    const ride = m.chatter(lines.map((l, i) => [i ? 6 : 3, 'maria', l]))
    const t0 = m.playT
    await m.until(() => m.car === car && dist(car.pos, dest) < 12 && Math.abs(car.speed) < 1.6)
    m.stopTimer()
    ride.stop()
    m.data.driveT = m.playT - t0
    m.marker(null)
    m.sub('')
    const j = m.data.jars
    await m.cutscene(async () => {
      g.vehicles.exit(true)
      const rx = -Math.cos(car.heading), rz = Math.sin(car.heading)
      const sx = car.pos.x + rx * 2.4, sz = car.pos.z + rz * 2.4
      maria.unride(sx, sz, car.heading - Math.PI / 2)
      m.prop((b) => {
        b.box(1.6, 0.8, 0.7, { y: 0, color: 0x6a4a2a })
        const jc = [0xb8321f, 0xd98a1a, 0x7a2a4a, 0x5a8a3a]
        for (let k = 0; k < Math.min(12, Math.ceil(j / 3)); k++) b.cyl(0.075, 0.075, 0.17, 8, { x: -0.6 + (k % 6) * 0.24, y: 0.8, z: -0.12 + Math.floor(k / 6) * 0.22, color: jc[k % 4] })
      }, { x: sx + rx * 1.4, z: sz + rz * 1.4, ry: car.heading })
      m.hold({ ...m.clearView(sx, sz, { dist: 4.4, lookY: 1.2, prefer: car.heading + Math.PI * 0.75 }), dur: 60 })
      m.face(maria, m.player.pos.x, m.player.pos.z)
      await m.say('maria', [
        j === 40 ? 'Toate patruzeci! Întregi! Maică, tu conduci mai bine ca Nea Grișa, și el ține volanul din \'89.'
          : j >= 30 ? 'S-au spart câteva, da\' zacusca e întreagă. Asta-i important. Murăturile oricum erau pentru Dusea.'
            : 'Jumate… Lasă, maică. Din murăturile sparte fac salată de iarnă. Vara.',
        `Ține ${j} de lei, câte unul de borcan. Și un borcan de zacuscă, pentru mama ta. Nu-l mânca tu. Mănâncă-l.`,
      ])
    })
    pr.addLei(j, `Tanti Maria: câte un leu de borcan (${j})`)
    pr.feed(0.35)
    pr.addRespect('bab', 3, 'Tanti Maria')
    g.side?.linger(m, [maria], { x: maria.pos.x, z: maria.pos.z })
  },
}

// =============================================================================
// Favor · Convoiul de nuntă — lead the wedding cars through town; the cake rides with you
const WED_TALK = [
  ['nasul', '[[Finule|Fino]], la nunta mea am avut trei sute de invitați și o singură găină. Ce vremuri!'],
  ['mireasa', 'Nașule, te rog, nu mai zice „casă de piatră" la fiecare semafor.'],
  ['nasul', 'Casă de piatră! …Ce? E semafor.'],
  ['mireasa', 'Mama zice că DJ-ul Fănel tot la Ialoveni e. A luat avans de la trei nunți deodată.'],
  ['nasul', 'Tortul e pe bancheta din spate. Cinci etaje. Dacă cade el, cad și eu.'],
  ['mireasa', 'Ionuț zice că se însoară doar dacă vine și Borea. Borea vine, dacă nu-l întreabă nimeni ce-i în portbagaj.'],
  ['nasul', 'Claxonează, [[finule|fino]]! O nuntă fără claxon e ca o înmormântare cu lăutari.'],
]
const CAKE = ['Tortul! Tortul, [[finule|fino]]!', 'Etajul trei s-a mutat pe etajul doi!', 'Frișca! Pe rochie!', 'Doamne, crema de vanilie!']
// the stops: in the order of a Chișinău wedding (civil, photos, church, the restaurant)
const WED_STOPS = [
  { x: -60, z: -70, r: 7.5, label: 'Primăria', say: ['mireasa', 'Primăria! Aici ne-am căsătorit civil. Funcționara vorbea la telefon în rusă tot timpul.'] },
  { x: 0, z: 4.5, r: 9, label: 'Arcul de Triumf (poze)', stop: true, say: ['mireasa', 'Poză! Zâmbiți! …Nașule, scoate-ți degetul din nas.'] },
  { x: 60, z: 72, r: 7.5, label: 'Catedrala', say: ['nasul', 'Catedrala! Faceți-vă cruce! Și tu, [[finule|fino]], nu cu mâna de pe volan!'] },
  { x: 180, z: 190, r: 8, label: 'Restaurantul „La Nașu"', stop: true, last: true },
]

export const nunta = {
  id: 'sm_nunta', side: true, chapterName: CH, title: 'Convoiul de nuntă', icon: '💍',
  desc: 'Șoferul mirilor s-a îmbătat de la zece dimineața. Tu conduci mașina de nuntă prin oraș, cu tot neamul claxonând după tine. Tortul de cinci etaje e pe bancheta din spate.',
  unlock: 'taxi',
  giver: { pos: () => ({ x: -118, z: -130.6, ry: Math.PI }), speaker: 'nasul', label: 'Nașul Grigore' },
  reward: { lei: 60, xp: 150 },
  stars: [
    GOALS.check('Tortul fără nicio fisură', (m) => (m.data.cake ?? 9) === 0, (m) => (m.data.cake ? `${m.data.cake} ${m.data.cake === 1 ? 'fisură' : 'fisuri'}` : '')),
    GOALS.check('Claxon la fiecare oprire', (m) => (m.data.honks ?? 0) >= WED_STOPS.length, (m) => `${m.data.honks ?? 0}/${WED_STOPS.length}`),
  ],
  async script(m) {
    const g = m.game, p = m.player, pr = g.progress
    const nas = m.giver('nasul')
    // the lead car with ribbons, the convoy behind it, the bride waiting by the car
    for (let k = 0; k < 4; k++) { const q = m.lane('N1', 'E', -100 - k * 12); g.vehicles.clearSpot(q.x, q.z, 6) }
    const q0 = m.lane('N1', 'E', -100)
    const lead = m.vehicle('logan', q0.x, q0.z, q0.ry, { color: 0xf4f4f0, persist: true })
    // ribbons along the roof and a bouquet up front, riding with the car
    const ribbon = m.prop((b) => {
      b.box(0.08, 0.05, 2.4, { x: -0.42, y: 1.46, z: -0.1, color: 0xd11a1a })
      b.box(0.08, 0.05, 2.4, { x: 0.42, y: 1.46, z: -0.1, color: 0xd11a1a })
      b.sphere(0.2, 10, 8, { x: 0, y: 1.52, z: 0.75, color: 0xfbfaf4 })
      b.sphere(0.14, 10, 8, { x: 0.25, y: 1.5, z: 0.6, color: 0xf2c0d0 })
    }, { x: lead.pos.x, z: lead.pos.z, ry: lead.heading })
    m.every(() => { ribbon.mesh.position.copy(lead.mesh.position); ribbon.mesh.quaternion.copy(lead.mesh.quaternion) })
    const cols = [0x1a1a1e, 0xb0b8c0, 0x7a1a24]
    const fol = [0, 1, 2].map((k) => { const q = m.lane('N1', 'E', -112 - k * 12); const v = m.vehicle(k === 1 ? 'logan' : 'hatch', q.x, q.z, q.ry, { color: cols[k] }); v.locked = true; return v })
    const bride = m.spawn('mireasa', LOOKS.mireasa, lead.pos.x + 1.5, -131, { voice: { pitch: 1.25, type: 'female' } })
    bride.lookAtPlayer = true
    const c = await m.say('nasul', [
      '[[Finule|Fino]]! Slavă Domnului. Șoferul nostru doarme în Mercedesul lui, cu cravata pe frunte.',
      'Traseul e simplu: Primăria, poze la Arc, Catedrala, și restaurantul „La Nașu", la Valea Trandafirilor. Convoiul vine după tine.',
      'Și claxonează la fiecare oprire, că altfel lumea crede că-i înmormântare. Tortul e pe bancheta din spate. Dacă-l strici, [[te însori|te măriți]] tu cu el.',
    ], { choices: [yes(m, 'Urcați. Casă de piatră!', { lei: 60, xp: 150, bab: 2, info: '💌 plicul nașului' }), 'Nu pot, am altă nuntă.'] })
    if (c === 1) { await m.say('nasul', ['Altă nuntă?! La Ialoveni, cu Fănel? [[Trădătorule|Trădătoareo]]!']); m.cancel() }
    m.objective('Urcă în {y}mașina mirilor{/y} (cea albă, cu panglici).')
    m.marker(lead.pos, 'Mașina mirilor')
    await m.until(() => m.car === lead, { timeout: 90, onTimeout: 'Nunta a plecat cu un taxi. Nașul nu-ți mai răspunde la telefon.' })
    m.marker(null)
    await m.fade(1, 220)
    for (const n of [nas, bride]) n.ride(lead)
    g.audio?.sfx('door', { vol: 0.6 })
    await m.fade(0, 280)
    // ---- the convoy follows; a car that falls far behind catches up out of sight -------------------------
    const trail = [{ x: lead.pos.x, z: lead.pos.z }]
    fol.forEach((v, k) => m.chaser(v, () => { const t = k ? fol[k - 1] : lead; return { x: t.pos.x, z: t.pos.z, speed: Math.abs(t.speed || 0) } }, { speed: 24, keep: 8.5 }))
    const behind = (d) => {
      // a point `d` metres back along the lead's track, and the heading there
      let acc = 0
      for (let i = trail.length - 1; i > 0; i--) {
        const a = trail[i], b = trail[i - 1], L = dist(a, b)
        if (acc + L >= d) { const k = (d - acc) / (L || 1); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, ry: Math.atan2(a.x - b.x, a.z - b.z) } }
        acc += L
      }
      return null
    }
    let bandT = 0, honkT = 3
    m.every((dt) => {
      const last = trail[trail.length - 1]
      if (dist(lead.pos, last) > 5) { trail.push({ x: lead.pos.x, z: lead.pos.z }); if (trail.length > 80) trail.shift() }
      if ((bandT -= dt) <= 0) {
        bandT = 0.6
        fol.forEach((v, k) => {
          const t = k ? fol[k - 1] : lead
          if (v.broken || dist(v.pos, t.pos) < 55 || g.traffic.visible(v.pos.x, v.pos.z)) return
          const q = behind(12 * (k + 1))
          if (q && !g.traffic.visible(q.x, q.z)) { g.vehicles.clearSpot(q.x, q.z, 5); v.teleport(q.x, g.physics.groundHeight(q.x, q.z, 3) + 0.3, q.z, q.ry) }
        })
      }
      // the whole family leans on the horn now and then
      if ((honkT -= dt) <= 0) { honkT = 2.5 + Math.random() * 2.5; const v = pickOne(fol); if (!v.broken && dist(v.pos, m.P) < 90) g.audio?.horn(v, 0.6) }
    })
    // ---- the cake and the horn ----------------------------------------------------------------------------
    m.data.cake = 0
    m.data.honks = 0
    let lastHonk = -99
    const offCrash = g.events.on('player:crash', (e) => {
      if (m.car !== lead || (e.force || 0) < 16 || m.t - (m.data.cakeT ?? -9) < 1.2) return
      m.data.cakeT = m.t
      m.data.cake++
      g.audio?.sfx('splat', { vol: 0.7 })
      m.notify(`🎂 {r}Tortul s-a crăpat!{/r} (${m.data.cake}/3)`, 2.2, 'red')
      m.task(() => m.talk(m.data.cake % 2 ? 'nasul' : 'mireasa', pickOne(CAKE), 2.2))
      if (m.data.cake >= 3) m.fail('Tortul s-a făcut clătită. Nunta se mută la Ialoveni, la Fănel.')
    })
    m.track({ dispose: offCrash })
    let outT = 0
    m.every((dt) => {
      if (m.car === lead && g.input.pressed('horn')) lastHonk = m.t
      outT = m.car === lead ? 0 : outT + dt
      if (outT > 15) m.fail('Ai lăsat mirii în mașină. Acum conduce nașul. Doamne ajută.')
    })
    m.timer(190, 'Preotul a plecat la altă nuntă. Cu tot cu tămâia.')
    const talk = m.chatter(WED_TALK.map(([who, text], i) => [i ? 7 : 5, who, text]))
    m.tip('Claxon: {y}[H]{/y}. Convoiul te urmează; tortul nu iartă bușiturile.', 7)
    for (let i = 0; i < WED_STOPS.length; i++) {
      const s = WED_STOPS[i]
      const ring = m.ring(s.x, s.z, { r: s.r, color: s.last ? 0xffffff : 0xffcf4a })
      m.objective(`${s.stop ? 'Oprește la' : 'Treci pe la'} {y}${s.label}{/y}${i ? '' : ', convoiul după tine'}. Claxonează ({y}[H]{/y})!`, { sub: `Oprirea ${i + 1}/${WED_STOPS.length} · 🎂 tort: ${m.data.cake ? `{r}${m.data.cake} ${m.data.cake === 1 ? 'fisură' : 'fisuri'}{/r}` : '{g}întreg{/g}'}` })
      m.marker({ x: s.x, z: s.z }, s.label)
      let holdT = 0
      await m.until(() => {
        if (m.car !== lead || !ring.inside(lead.pos)) { holdT = 0; return false }
        if (!s.stop) return true
        holdT = Math.abs(lead.speed) < 1.5 ? holdT + (g.rawDt || 0.016) : 0
        return holdT > 0.5
      })
      m.untrack(ring)
      m.marker(null)
      g.audio?.sfx('checkpoint', { bus: 'ui' })
      for (const v of fol) if (!v.broken) g.audio?.horn(v, 0.8)
      const tPass = m.t
      // a honk just before or just after the stop counts
      m.task(async (live) => {
        await m.until(() => lastHonk >= tPass - 4 || m.t - tPass > 3.5)
        if (!live()) return
        if (lastHonk >= tPass - 4) { m.data.honks++; m.notify(`📯 Claxon! (${m.data.honks}/${WED_STOPS.length})`, 1.4, 'gold') }
      })
      if (s.stop && !s.last) { g.ui.flash('#fff', 200); g.audio?.sfx('camera', { bus: 'ui', vol: 0.9 }); m.notify('📸 Poza de nuntă. Nașul a clipit.', 2) }
      if (s.say) m.task(() => m.talk(s.say[0], s.say[1], 3.2))
    }
    m.stopTimer()
    talk.stop()
    await m.wait(1)
    // ---- the restaurant ----------------------------------------------------------------------------------
    const cake = m.data.cake
    await m.cutscene(async () => {
      g.vehicles.exit(true)
      const rx = -Math.cos(lead.heading), rz = Math.sin(lead.heading)
      const cx = lead.pos.x + rx * 3, cz = lead.pos.z + rz * 3
      nas.unride(cx, cz, lead.heading)
      bride.unride(cx + Math.sin(lead.heading) * 1.4, cz + Math.cos(lead.heading) * 1.4, lead.heading)
      const guests = crowd(m, cx + rx * 3, cz + rz * 3, 7, { r0: 2.2, r1: 4, a0: 0, a1: Math.PI * 2, face: { x: cx, z: cz } })
      m.hold({ ...m.clearView(cx, cz, { dist: 6, lookY: 1.3, prefer: lead.heading + Math.PI / 2 }), dur: 60 })
      cheerAll(guests)
      g.audio?.sfx('crowd_cheer', { vol: 0.8 })
      g.fx?.confetti(cx, 2.6, cz, 80)
      m.face(nas, m.player.pos.x, m.player.pos.z)
      await m.say('nasul', [
        cake ? 'Tortul… lasă. Îl mâncăm cu lingura. Tot tort e. Casă de piatră!' : 'Tortul e întreg! Toate cinci etajele! [[Finule|Fino]], tu ești om serios. Casă de piatră!',
        'Ia plicul. Acolo-s bani și o poză cu mine, cu autograf. Poza valorează mai mult.',
      ])
      await m.say('mireasa', ['Și DJ-ul? …A venit Fănel! De la Ialoveni! Cu boxa în spate! Hora, oameni buni!'])
      for (const n of [...guests, nas, bride]) n.state = 'dance'
      m.music('chase')
      await m.wait(2.2)
      g.side?.linger(m, [...guests, nas, bride], { x: cx, z: cz })
    })
    pr.addLei(cake ? 30 : 60, cake ? 'Plicul de la naș (minus tortul)' : 'Plicul de la naș')
    pr.addRespect('bab', 2, 'nunta')
    for (const v of fol) if (!v.broken) m.story.leave(v)
  },
}

// =============================================================================
// Favor · Conferința de presă — sabotage the mayor's "new asphalt" press conference in PMAN
const PX = 0, PZ = -84
const SAB = [
  { id: 'discurs', x: PX, z: PZ + 0.9, hold: 1.2, label: 'Schimbă discursul cu lista de cumpărături a Tantei Zina', done: 'Discursul e acum o listă de cumpărături.' },
  { id: 'boxa', x: PX - 4.6, z: PZ + 0.8, hold: 1.0, label: 'Bagă stick-ul lui Vitea în boxă (manele)', done: 'Boxa are acum manele. Doar manele.' },
  { id: 'banner', x: PX + 4.2, z: PZ - 1.6, hold: 1.0, label: 'Întoarce bannerul pe partea cealaltă', done: 'Bannerul e întors. Pe spate scrie altceva.' },
]

export const conferinta = {
  id: 'sm_conferinta', side: true, chapterName: CH, title: 'Conferința de presă', icon: '🎤',
  desc: 'Eban ține o conferință de presă despre „asfaltul nou". Lilia și Ghenadie au pregătit o surpriză: lista de cumpărături a Tantei Zina, manelele lui Vitea și un banner cu două fețe. Paza să nu te vadă.',
  unlock: 'eban',
  giver: { pos: () => ({ x: -21, z: -54, ry: Math.PI / 2 }), speaker: 'ghenadie', label: 'Ghenadie (operator)' },
  reward: { xp: 200, cred: 8 },
  checkpoints: ['sabotaj'],
  stars: [
    GOALS.ghost('Nevăzut de pază'),
    GOALS.check('Toate trei sabotajele sub 1:40', (m) => (m.data.sabT ?? 999) <= 100, (m) => mmss(m.data.sabT)),
  ],
  async script(m) {
    const g = m.game, p = m.player
    const gh = m.giver('ghenadie')
    // ---- the stage: lectern, speaker, a banner on two poles, the press in front ----------------------------
    m.prop((b) => {
      b.box(9, 0.02, 5, { x: 0, y: 0.01, z: -1.2, color: 0x2a3a6a })
      b.box(1.0, 1.15, 0.6, { x: 0, y: 0, z: 0.2, color: 0x3a2a24 })
      b.box(1.1, 0.08, 0.7, { x: 0, y: 1.15, z: 0.2, color: 0x5a4034 })
      b.box(0.3, 0.3, 0.02, { x: 0, y: 0.6, z: 0.51, color: 0xd9a93a })
      b.cyl(0.02, 0.02, 0.45, 6, { x: 0, y: 1.2, z: 0.35, color: 0x1a1a1a })
      b.box(0.9, 1.6, 0.7, { x: -4.6, y: 0, z: 0.2, color: 0x1a1a1e })
      b.cyl(0.26, 0.26, 0.04, 14, { x: -4.6, y: 1.1, z: 0.56, rx: Math.PI / 2, center: true, color: 0x55585e })
      b.cyl(0.16, 0.16, 0.04, 12, { x: -4.6, y: 0.5, z: 0.56, rx: Math.PI / 2, center: true, color: 0x55585e })
      for (const s of [-1, 1]) b.cyl(0.06, 0.06, 4, 8, { x: s * 4.2, y: 0, z: -2.4, color: 0x8a8a8a })
    }, { x: PX, z: PZ, ry: 0 })
    let front = banner(m, 'ASFALT NOU · LUCRĂM LA ASTA', { x: PX, y: 3.3, z: PZ - 2.4, w: 8, h: 1.3, bg: '#1f3f8a', fg: '#ffd84a' })
    const press = crowd(m, PX, PZ + 12, 8, { r0: 3.5, r1: 6.5, a0: Math.PI + 0.5, a1: Math.PI * 2 - 0.5, face: { x: PX, z: PZ }, cheer: false })
    for (const n of press) n.char.anim.set(Math.random() < 0.5 ? 'phone' : 'idle')
    if (m.before('sabotaj')) {
      const c = await m.say('ghenadie', [
        'Tu ești [[ăla|aia]] de la Lilia? Io-s Ghenadie. Filmez tot ce mișcă. Și ce nu mișcă, filmez cu zoom.',
        'Eban vine în câteva minute să vorbească despre „asfaltul nou". Noi i-am pregătit trei surprize.',
        'Unu: lista de cumpărături a Tantei Zina, în locul discursului. Doi: stick-ul lui Vitea în boxă. Manele. Trei: bannerul. Are și o parte din spate.',
        'Paza să nu te vadă, că io nu pot să filmez și să fug în același timp. Am încercat. Am rupt un trepied.',
      ], { choices: [yes(m, 'Pregătește camera.', { xp: 200, aura: 80, info: '🕵️ paza nu trebuie să te vadă' }), 'Altă dată.'] })
      if (c === 1) { await m.say('ghenadie', ['Bine. Eban oricum mai ține o conferință săptămâna viitoare. Și cealaltă. Ține zilnic.']); m.cancel() }
      m.checkpoint('sabotaj')
    }
    // ---- the guards: two walking the stage, the chief of staff on the phone, looking round ------------------
    const guard = (x, z, pts, pause = 1.6) => {
      const n = m.spawn(null, 'mascat', x, z, { voice: { pitch: 0.7, type: 'gruff' } })
      n.speed = 1.2
      const cone = m.cone(n, { range: 8, fov: 1.05, rate: 1.4 })
      let i = 0, wait = 0
      m.every((dt) => {
        // the chief of staff stands on the phone, looking from the banner round to the lectern
        if (!pts) { n.char.heading = -Math.PI * 0.75 + Math.sin(m.t * 0.55) * 0.8; return }
        if (n.state === 'idle') { wait -= dt; if (wait <= 0) { i = (i + 1) % pts.length; n.walkTo(pts[i].x, pts[i].z, { onArrive: () => { wait = pause } }) } }
      })
      return { n, cone }
    }
    const guards = [
      guard(PX - 9, PZ + 3.6, [{ x: PX - 9, z: PZ + 3.6 }, { x: PX + 9, z: PZ + 3.6 }], 1.8),
      guard(PX - 8, PZ - 5, [{ x: PX - 8, z: PZ - 5 }, { x: PX - 8, z: PZ + 4 }], 1.4),
      guard(PX + 7, PZ + 2.5, null),
    ]
    let seen = false
    m.every(() => { if (seen) return; for (const q of guards) if (q.cone.alert >= 1) { seen = true; q.n.say('Stai! Tu ce cauți la tribună?!'); m.fail('Paza te-a văzut. Conferința s-a amânat „din motive tehnice".') } })
    // ---- three sabotages (the ones done before a fail stay done) ------------------------------------------------
    const done = new Set(m.cpData.sab || [])
    const rings = {}
    let back = null
    const flip = () => { m.untrack(front); front = null; back = banner(m, 'LUCRĂM LA ASTA · DIN 2004', { x: PX, y: 3.3, z: PZ - 2.4, w: 8, h: 1.3, bg: '#b0181e', fg: '#ffffff' }) }
    if (done.has('banner')) flip()
    for (const s of SAB) {
      if (done.has(s.id)) continue
      rings[s.id] = m.ring(s.x, s.z, { r: 1.1, color: 0x7fd4ff })
      m.interact({
        id: 'sab_' + s.id, x: s.x, z: s.z, r: 1.7, hold: s.hold, label: s.label, enabled: () => !done.has(s.id),
        onInteract: () => {
          if (done.has(s.id)) return
          done.add(s.id)
          m.untrack(rings[s.id])
          g.audio?.sfx(s.id === 'boxa' ? 'beep' : 'paper', { bus: 'ui', vol: 0.8 })
          if (s.id === 'banner') flip()
          m.notify(`✔ ${s.done} (${done.size}/3)`, 2.4, 'gold')
          m.cpData.sab = [...done]
          m.checkpoint('sabotaj')
        },
      })
    }
    m.objective('Sabotează conferința: {y}discursul{/y}, {y}boxa{/y} și {y}bannerul{/y}. {r}Nu te lăsa văzut.{/r}', { sub: `Sabotaje: ${done.size}/3 · ține {y}[E]{/y} pe cercurile albastre` })
    m.marker({ x: PX, z: PZ + 3 }, 'Tribuna')
    m.tip('Paza vede doar în față, în conurile de pe jos. Fuga ({y}[⇧]{/y}) face zgomot.', 8)
    const t0 = m.playT
    m.every(() => m.sub(`Sabotaje: ${done.size}/3 · ține {y}[E]{/y} pe cercurile albastre`))
    await m.until(() => dist(p.pos, { x: PX, z: PZ }) < 14 || done.size > 0)
    m.marker(null)
    await m.until(() => done.size >= 3)
    m.data.sabT = m.playT - t0
    for (const q of guards) q.cone.enabled = false
    // ---- blend in with the press, and watch ----------------------------------------------------------------------
    const spot = { x: PX + 6.5, z: PZ + 12.5 }
    await m.reach(spot, 2.6, { text: 'Gata. Amestecă-te printre {y}ziariști{/y} și privește spectacolul.', label: 'Ziariștii', inVehicle: false })
    await m.cutscene(async () => {
      p.char.heading = p.char.prevHeading = Math.atan2(PX - p.pos.x, PZ - p.pos.z)
      const eban = m.spawn('eban', 'eban', PX - 12, PZ + 2, { voice: { pitch: 1.05, type: 'male' } })
      g.cameraRig.shot({ from: [PX + 8, 2.6, PZ + 14], to: [PX + 6, 2.2, PZ + 10], look: [PX, 1.6, PZ], dur: 9, ease: 'inout' })
      await m.walk(eban, PX, PZ - 0.5, { face: 0, timeout: 7 })
      eban.char.anim.set('talk')
      await m.talk('eban', 'Stimați ziariști, dragi chișinăuieni! Astăzi vă prezint marele nostru proiect: ASFALTUL NOU!', 4)
      g.cameraRig.shot({ from: [PX + 1.6, 1.8, PZ + 3.2], look: [PX, 1.55, PZ - 0.4], dur: 12, ease: 'out' })
      await m.talk('eban', '(citește) „Două kile de cartofi. Un kil de zahăr. O franzelă albă de la Linella, nu neagră, că nu-s în dietă…"', 5)
      for (const n of press) if (Math.random() < 0.7) n.say(pickOne(['Hahaha!', 'Ce-a zis?!', 'Filmează, filmează!', 'Franzelă albă!']), 2)
      g.audio?.sfx('crowd_cheer', { vol: 0.5 })
      await m.talk('eban', '„…Și semințe pentru Vitea." Ăsta… ăsta NU-i discursul meu!', 3.4)
      await m.talk('eban', 'Muzică! Puneți muzică, până se liniștesc!', 2.4)
      m.music('chase')
      g.audio?.sfx('go', { bus: 'ui' })
      for (const q of guards) { q.n.state = 'dance' }
      for (const n of press) n.state = 'dance'
      g.cameraRig.shot({ from: [PX - 3, 2.2, PZ + 9], to: [PX + 3, 2.6, PZ + 9], look: [PX, 2.2, PZ - 1], dur: 8, ease: 'inout' })
      await m.talk({ name: 'Boxa' }, '♪ Ce frumoasă ești, Chișinău, cu gropile tale… ♪', 3)
      g.cameraRig.shot({ from: [PX + 2, 1.9, PZ + 5], look: [PX, 3.1, PZ - 2.4], dur: 6, ease: 'out' })
      await m.talk('ghenadie', 'Bannerul! Uitați-vă la banner! „Lucrăm la asta. Din 2004."', 3)
      eban.state = 'phone'
      await m.talk('eban', '(la telefon) Vasili Petrovici? Eto ne ia! Eto provokația! Asfaltul e bun! Adică… o să fie!', 3.8)
      await m.talk('ghenadie', 'Live! Patruzeci de mii de vizualizări! Cincizeci! Mama mă sună!', 3)
      await m.talk('player', 'Asfalt nou, zicea.', 2)
    })
    g.progress.addCred(4)
    g.side?.aura.gain(80, 'Conferința de presă, sabotată', { raw: true, big: true })
  },
}

// =============================================================================
// Favor · Cursa gropilor — fill five potholes before the city hall crew paints five
const HOLES = [['S1', 'E', -272], ['S1', 'W', -222], ['S1', 'E', -128], ['V2', 'S', 168], ['V2', 'N', 246], ['S2', 'E', -272], ['S2', 'W', -148], ['V1', 'N', 205]]
const CREW_LINES = ['Încă una! Pentru știrile de la ora opt!', 'Vopsea neagră, groapă nouă. Adică veche.', 'Reparat! Pentru televizor.', 'Cine se uită de aproape la gropi? Numa\' oamenii.']

export const gropi = {
  id: 'sm_gropi', side: true, chapterName: CH, title: 'Cursa gropilor', icon: '🕳️',
  desc: 'Echipa Primăriei „repară" gropile din Botanica cu vopsea neagră, pentru televizor. Vova a pariat o sută de lei că tu astupi mai multe, cu asfalt adevărat. Primul la cinci câștigă.',
  unlock: 'cursa',
  giver: { pos: () => ({ x: -188.6, z: 222, ry: Math.PI / 2 }), speaker: 'brigadier', label: 'Brigadierul Asfaltescu' },
  reward: { lei: 100, xp: 150, civic: 5 },
  stars: [
    GOALS.check('Echipa Primăriei: maximum două gropi', (m) => (m.data.crew ?? 9) <= 2, (m) => `${m.data.crew ?? 0} ${m.data.crew === 1 ? 'vopsită' : 'vopsite'}`),
    GOALS.check('Cinci gropi în sub 2:00', (m) => (m.data.raceT ?? 999) <= 120, (m) => mmss(m.data.raceT)),
  ],
  async script(m) {
    const g = m.game, pr = g.progress
    const brig = m.giver('brigadier')
    const vq = m.lane('V2', 'S', 232)
    g.vehicles.clearSpot(vq.x, vq.z, 7)
    const van = m.vehicle('rutiera', vq.x, vq.z, vq.ry, { color: 0xf06a1a })
    van.locked = true
    const c = await m.say('brigadier', [
      'Tu ești [[ăla de-l|aia de-o]] laudă Vova? Io-s brigadierul Asfaltescu. Treizeci de ani de „reparații". Toate filmate.',
      'Pariul e simplu: opt gropi prin Botanica. Cine termină primul cinci, câștigă. Voi cu asfalt, noi cu… tehnologie.',
      '(bate cu palma în găleată) Vopsea neagră. Se usucă în zece minute. Groapa rămâne, da\' la televizor arată impecabil.',
    ], { choices: [yes(m, 'Pe o sută. Davai.', { lei: 130, xp: 150, info: '🕳️ primul la cinci' }), 'Altă dată.'] })
    if (c === 1) { await m.say('brigadier', ['Normal. Și Vova zicea că ești om serios. Ha.']); m.cancel() }
    brig.ride(van)
    // ---- the holes ------------------------------------------------------------------------------------------------
    const holes = HOLES.map(([id, dir, along], i) => ({ i, ...lanePt(m, id, dir, along), owner: null, mesh: null }))
    const draw = (h) => {
      if (h.mesh) m.untrack(h.mesh)
      h.mesh = m.prop((b) => {
        if (h.owner === 'player') patch(b, 0, 0, { color: 0x4a4a50, rim: 0x5a5a60 })
        else if (h.owner === 'crew') { patch(b, 0, 0, { color: 0x050506, rim: 0x151517 }); b.cyl(0.14, 0.02, 0.5, 8, { x: 1.3, y: 0, z: 0.4, color: 0xf06a1a }) }
        else patch(b, 0, 0)
      }, { x: h.x, z: h.z, y: 0 })
    }
    for (const h of holes) { g.vehicles.clearSpot(h.x, h.z, 4); draw(h) }
    const count = (who) => holes.filter((h) => h.owner === who).length
    m.data.crew = 0
    let over = null
    const claim = (h, who) => {
      if (h.owner || over) return
      h.owner = who
      draw(h)
      if (who === 'player') {
        g.fx?.dust(h.x, 0.3, h.z, 14)
        g.audio?.sfx('shovel', { at: h, vol: 0.9 })
        m.notify(`🕳️ Groapă astupată cu asfalt adevărat ({y}${count('player')}/5{/y})`, 2, 'gold')
        pr.addCivic(1)
      } else {
        m.data.crew = count('crew')
        g.audio?.sfx('spray', { at: h, vol: 0.8 })
        m.notify(`🎨 {r}Echipa Primăriei a „reparat" una{/r} (${count('crew')}/5)`, 2, 'red')
        if (dist(van.pos, m.P) < 60) m.task(() => m.talk('brigadier', pickOne(CREW_LINES), 2.4))
      }
      if (count('player') >= 5) over = 'won'
      else if (count('crew') >= 5) over = 'lost'
    }
    for (const h of holes) m.interact({ id: 'groapa' + h.i, x: h.x, z: h.z, r: 2.6, hold: 1.1, label: 'Ține [E]: astupă groapa (asfalt adevărat)', enabled: () => !h.owner && !!m.data.go, onInteract: () => claim(h, 'player') })
    // ---- a car, the start ------------------------------------------------------------------------------------------
    if (!m.car) {
      const k = m.lane('V2', 'N', 214, { curb: true })
      const car = m.needCar(k.x, k.z, k.ry, 'jiguli')
      m.objective('Urcă într-o mașină. Gropile-s împrăștiate prin tot cartierul.')
      m.marker(car.pos, car.def.name)
      await m.until(() => m.car && !m.car.broken)
      m.marker(null)
    }
    m.objective('Pregătește-te: {y}cinci gropi{/y}, înaintea echipei Primăriei.', { sub: 'Oprești lângă groapă, cobori, ții [E]. Asfaltul e în portbagaj.' })
    g.audio?.horn(van, 0.8)
    await m.wait(1)
    await g.ui.countdown()
    m.data.go = true
    const t0 = m.playT
    // ---- the crew: to the nearest free hole, paint it (four seconds of "work"), the next one ----------------------------
    const graph = g.traffic.graph
    const crew = { target: null, paint: 0, drv: null, puff: 0 }
    const send = (h) => {
      if (crew.drv) crew.drv.done = true
      const pts = graph.route(van.pos.x, van.pos.z, h.x, h.z).slice(1)
      pts[pts.length - 1] = { x: h.x, z: h.z, speed: 3, r: 3 }
      crew.drv = m.driver(van, pts, { speed: 11.5, yieldPlayer: true })
    }
    m.every((dt) => {
      if (over) return
      if (crew.paint > 0) {
        crew.paint -= dt
        if ((crew.puff -= dt) <= 0) { crew.puff = 0.4; g.fx?.smoke(crew.target.x, 0.3, crew.target.z, 0.1, 0.5) }
        if (crew.paint <= 0) { claim(crew.target, 'crew'); crew.target = null }
        return
      }
      if (!crew.target || crew.target.owner) {
        let best = null, bd = 1e9
        for (const h of holes) if (!h.owner) { const d = dist(h, van.pos); if (d < bd) { bd = d; best = h } }
        crew.target = best
        if (best) send(best)
        return
      }
      if (dist(van.pos, crew.target) < 7 && Math.abs(van.speed) < 2.5) { crew.paint = 4.2; if (crew.drv) crew.drv.done = true; van.throttle = 0; van.handbrake = true }
    })
    m.every(() => {
      const mine = count('player'), theirs = count('crew')
      m.sub(`Tu: {g}${mine}/5{/g} · Primăria: {r}${theirs}/5{/r} · ține {y}[E]{/y} la groapă`)
    })
    m.objective('Astupă {y}cinci gropi{/y} înaintea echipei Primăriei!', { sub: '' })
    // the nearest free hole gets the marker
    m.every(() => {
      if (over) return
      let best = null, bd = 1e9
      for (const h of holes) if (!h.owner) { const d = dist(h, m.P); if (d < bd) { bd = d; best = h } }
      if (best && best !== m.data.mk) { m.data.mk = best; m.marker({ x: best.x, z: best.z }, 'Groapă') }
    })
    m.timer(240, 'Soarele a apus. Vopseaua s-a uscat. Pariul s-a anulat.')
    await m.until(() => over)
    m.stopTimer()
    m.marker(null)
    m.data.raceT = m.playT - t0
    if (crew.drv) crew.drv.done = true
    van.throttle = 0; van.handbrake = true
    if (over === 'lost') m.fail('Echipa Primăriei a „reparat" cinci gropi pentru televizor. Vova plânge după sută.')
    g.audio?.sting('race_win')
    await m.wait(0.8)
    await m.cutscene(async () => {
      if (m.player.vehicle) g.vehicles.exit(true)
      const bx = van.pos.x + Math.cos(van.heading) * 2.2, bz = van.pos.z - Math.sin(van.heading) * 2.2
      brig.unride(bx, bz, van.heading)
      m.face(brig, m.player.pos.x, m.player.pos.z)
      m.hold({ ...m.clearView(bx, bz, { dist: 4.6, lookY: 1.3, prefer: van.heading + Math.PI / 2 }), dur: 60 })
      await m.say('brigadier', [
        count('crew') ? 'Bine, bine. Ai câștigat. Da\' ale noastre-s mai negre. Mai lucioase. Mai… de televizor.' : 'Niciuna?! N-am apucat să vopsim niciuna? Ce le arăt eu la știri?!',
        'Ține suta. Și nu-i spune lui Vova că am plătit cu mărunțiș. Tot îi spui. Știu.',
      ])
    })
    pr.addLei(30, 'Partea ta din pariu (restul, la Vova)')
    // the crew drives off with the brigadier (he goes with the mission's cleanup, inside the van)
    brig.ride(van)
    m.story.leave(van)
  },
}

// =============================================================================
// Favor · Troleibuzul fără vatman — drive trolleybus 22 down Ștefan cel Mare, stop by stop
const LANE_Z = 9.25
const BUS_STOPS = [
  { x: -240, name: 'Muzeul de Istorie' },
  { x: -25, name: 'Catedrala' },
  { x: 100, name: 'Grădina Publică' },
  { x: 235, name: 'Piața Centrală', last: true },
]
const BUS_TALK = [
  '[[Domnule|Doamnă]] vatman, la Muzeu opriți? Am nepot la Muzeu. Lucrează ca exponat.',
  'Nu frânați ca Tolea, că am vărsat chefirul pe bunica.',
  'Taxa! Cine n-a plătit taxa? …Nimeni? Ca de obicei.',
  '[[Tinere|Domnișoară]], ai carnet de troleibuz? Nu? Lasă, nici troleibuzul n-are ITP.',
  'Pe vremea mea, troleibuzul avea și taxatoare. Și taxatoarea avea mustață.',
]
const BUS_CRASH = ['Ușor! Stau în picioare din 1994!', 'Mi-a căzut proteza!', 'Aoleu, sacoșa cu ouă!', 'Frânează, nu ne boteza!']
const PAX = { name: 'Pasagerii', role: 'Troleibuzul 22', voice: { pitch: 1.2, type: 'old' } }

// the depot's other trolleybuses cross to the far side of the boulevard for a while, so yours
// has the eastbound wires to itself (it happens in a fade)
function clearWires(g) {
  const tr = g.traffic
  let k = 0
  for (const d of tr.drivers) {
    if (!d.v?.def.trolley || d.v.disposed || d.dir < 0 || d.v.pos.x > 270) continue
    const x = 360 - 45 * k++
    d.dir = -1
    d.v.teleport(x, d.v.pos.y, -tr.bdLaneZ, -Math.PI / 2)
  }
}
const tips = (v) => ({ x: v.pos.x - Math.sin(v.heading) * 5.5, y: v.pos.y + 5.8, z: v.pos.z - Math.cos(v.heading) * 5.5 })

export const troleibuz = {
  id: 'sm_troleibuz', side: true, chapterName: CH, title: 'Troleibuzul fără vatman', icon: '🚎',
  desc: 'Nea Tolea a coborât „un minut" după o plăcintă. Troleibuzul 22 stă la Hotel Național cu 40 de oameni înăuntru. Tu ai carnet de troleibuz? Nu. Nici Tolea.',
  unlock: 'borea',
  giver: { pos: () => ({ x: -349, z: 16.4, ry: Math.PI }), speaker: 'ecaterina', label: 'Doamna Ecaterina' },
  reward: { lei: 60, xp: 180, civic: 4 },
  stars: [
    GOALS.check('Coarnele pe fir tot drumul', (m) => !m.data.dewires, (m) => (m.data.dewires ? (m.data.dewires === 1 ? 'au sărit o dată' : `au sărit de ${m.data.dewires} ori`) : '')),
    GOALS.check('Oprit fix în toate stațiile', (m) => (m.data.precise ?? 0) >= BUS_STOPS.length, (m) => `${m.data.precise ?? 0}/${BUS_STOPS.length}`),
  ],
  async script(m) {
    const g = m.game, p = m.player, pr = g.progress
    const eca = m.giver('ecaterina')
    const c = await m.say('ecaterina', [
      '[[Tinere|Domnișoară]]! Tu ești [[ăla de l-a|aia de-a]] trimis Tolea? Slavă Domnului. Stăm aici de douăzeci de minute. Am abonament din 1994, da\' răbdare n-am.',
      'Tolea s-a dus după o plăcintă. Plăcinta e la Piața Centrală. Noi suntem aici. Logic, nu?',
      'Știi să conduci troleibuzul? …Nu? Nici Tolea nu știe. Da\' conduce.',
    ], { choices: [yes(m, 'Urcați. Țineți-vă de bare.', { lei: 60, xp: 180, info: '🥟 o plăcintă de la Tolea' }), 'Nu mă bag.'] })
    if (c === 1) { await m.say('ecaterina', ['Așa-i tineretul. Pe jos, atunci. Ca în \'94.']); m.cancel() }
    await m.fade(1, 400)
    clearWires(g)
    g.vehicles.clearSpot(-352, LANE_Z, 9)
    const bus = m.vehicle('trolleybus', -352, LANE_Z, Math.PI / 2)
    eca.ride(bus)
    m.seat(bus)
    // the camera sits further back for twelve metres of trolleybus (getting in resets it, so a
    // frame later), and comes back for your own two feet when it's over
    const zoomOut = () => { if (g.cameraRig) g.cameraRig.zoom = Math.max(g.cameraRig.zoom, 1.9) }
    m.track({ dispose: () => { if (g.cameraRig) g.cameraRig.zoom = 1 } })
    await m.wait(0.1)
    zoomOut()
    g.cameraRig.yaw = Math.PI / 2; g.cameraRig.snap()
    await m.fade(0, 500)
    g.audio?.sfx('door', { vol: 0.7 })
    // getting back in: you can't hop into a trolleybus like a Logan
    m.interact({ id: 'troleibuz', x: () => bus.pos.x, z: () => bus.pos.z, r: 7.5, label: 'Urcă la volanul troleibuzului', enabled: () => p.vehicle !== bus && !bus.broken, onInteract: () => { m.seat(bus); m.task(async () => { await m.wait(0.1); zoomOut() }) } })
    // ---- passengers, the wires, the clock ---------------------------------------------------------------------
    m.data.dewires = 0
    m.data.precise = 0
    let offT = 0, warned = false, poles = false, outT = 0
    const dewire = async () => {
      poles = true
      m.data.dewires++
      bus.stalled = true
      const t = tips(bus)
      g.fx?.sparks(t.x, t.y, t.z, 30)
      g.audio?.sfx('glass', { vol: 0.8, pitch: 1.6 })
      g.cameraRig.shake(0.4)
      m.notify('{r}COARNELE AU SĂRIT!{/r} Pune-le înapoi pe fir.', 2.4, 'red')
      m.task(() => m.talk(PAX, 'Iar?! Ca la Tolea!', 2))
      lockPlayer(m, true)
      let res = null
      for (let k = 0; k < 4 && !res?.ok; k++) {
        res = await play(m, new SkillCheck(g.side, {
          title: 'COARNELE PE FIR', labels: ['Primul corn', 'Al doilea corn'], rounds: 2, zones: [0.24, 0.18], speeds: [0.6, 0.8], misses: 3,
          onHit: () => { const q = tips(bus); g.fx?.sparks(q.x, q.y, q.z, 16); g.audio?.sfx('metal_hit', { at: q, vol: 0.7 }) },
          onMiss: () => { g.fx?.sparks(p.pos.x, p.pos.y + 1.6, p.pos.z, 18); g.cameraRig.shake(0.3); pr.hurt(3) },
        }))
      }
      lockPlayer(m, false)
      bus.stalled = false
      offT = 0; warned = false; poles = false
      m.notify('Coarnele-s pe fir. Curent avem. Nervi, mai puțini.', 2)
    }
    m.every((dt) => {
      if (p.vehicle !== bus) {
        outT += dt
        if (outT > 25) m.fail('Ai lăsat troleibuzul cu patruzeci de oameni în el. Au plecat pe jos, cu tot cu bare.')
        m.sub('Urcă înapoi la volan ({y}[E]{/y} lângă troleibuz)!')
        return
      }
      outT = 0
      if (poles) return
      // under the wires: the trolley lane and the one next to it
      const off = Math.abs(bus.pos.z - LANE_Z)
      if (off > 4.2 && Math.abs(bus.speed) > 0.5) {
        offT += dt
        if (!warned && offT > 0.4) { warned = true; m.notify('{r}Te depărtezi de fire!{/r} Înapoi pe banda din dreapta.', 1.8, 'red') }
        if (offT > 1.4) m.task(dewire)
      } else { offT = Math.max(0, offT - dt * 2); if (offT === 0) warned = false }
    })
    const offCrash = g.events.on('player:crash', (e) => { if (p.vehicle === bus && (e.force || 0) >= 16 && Math.random() < 0.8) m.task(() => m.talk(PAX, pickOne(BUS_CRASH), 2.2)) })
    m.track({ dispose: offCrash })
    m.timer(210, 'Dispeceratul a trimis alt vatman. Nea Tolea iese la pensie. Forțat.')
    const talk = m.chatter([...BUS_TALK].sort(() => Math.random() - 0.5).slice(0, 3).map((l, i) => [i ? 9 : 6, PAX, l]))
    m.tip('Stai sub fire: banda din dreapta (și cea de lângă). Oprești {y}fix în chenar{/y}, ușile se deschid singure.', 8)
    for (let i = 0; i < BUS_STOPS.length; i++) {
      const s = BUS_STOPS[i]
      const box = m.track(new GroundRect(g, s.x, LANE_Z, Math.PI / 2, 1.7, 6.6, s.last ? 0xffffff : 0xffcf4a))
      m.objective(`Oprește în stația {y}${s.name}{/y}${s.last ? ', capătul drumului' : ''}.`, { sub: '' })
      m.marker({ x: s.x, z: LANE_Z }, s.name)
      let holdT = 0, dx = 99
      await m.until(() => {
        if (p.vehicle !== bus || poles) { holdT = 0; return false }
        dx = Math.abs(bus.pos.x - s.x)
        const inBox = dx < 2.4 && Math.abs(bus.pos.z - LANE_Z) < 1.7 && Math.cos(bus.heading - Math.PI / 2) > 0.8
        holdT = inBox && Math.abs(bus.speed) < 0.8 ? holdT + (g.rawDt || 0.016) : 0
        if (inBox) m.sub(Math.abs(bus.speed) < 0.8 ? '{g}Ușile se deschid…{/g}' : 'Frânează! Ești în stație.')
        return holdT > 1
      })
      m.untrack(box)
      m.marker(null)
      const fine = dx <= 1.2
      if (fine) m.data.precise++
      g.audio?.sfx('door', { vol: 0.8 })
      pr.addLei(8, `Stația ${s.name}: bilete (${fine ? 'oprire fixă' : `la ${dx.toFixed(1).replace('.', ',')} m de semn`})`)
      if (!s.last) { m.task(() => m.talk(PAX, pickOne(fine ? ['Fix la ușă! Ca la Paris!', 'Bravo, [[vatmanule|vatmanițo]]! Fix!'] : ['Mai încolo, mai încolo… lasă, sărim.', 'Am coborât în băltoacă, mersi.']), 2.2)); await m.wait(1) }
    }
    m.stopTimer()
    talk.stop()
    // ---- Nea Tolea, with plăcinte ----------------------------------------------------------------------------------
    await m.cutscene(async () => {
      g.vehicles.exit(true)
      eca.unride(bus.pos.x - 1, LANE_Z + 4.2, 0)
      const tol = m.spawn('tolea', 'vatman', bus.pos.x + 8, LANE_Z + 6, { voice: { pitch: 0.9, type: 'male' } })
      m.hold({ ...m.clearView(bus.pos.x + 3, LANE_Z + 4.5, { dist: 5.5, lookY: 1.3, prefer: Math.PI * 0.2 }), dur: 60 })
      await m.walk(tol, p.pos.x + 1.4, p.pos.z + 0.8, { run: true, timeout: 5 })
      m.face(tol, p.pos.x, p.pos.z)
      await m.say('tolea', [
        m.data.dewires ? 'Ai ajuns! …Ai sărit de pe fir, zice lumea? Lasă. Io sar de trei ori pe zi. Și de două ori pe noapte.' : 'Ai ajuns! Și nici n-ai sărit de pe fir! Tu ești [[născut|născută]] în depou, bratan.',
        'Dispeceratul n-a observat nimic. Adică a observat, da\' i-am zis că am avut „[[ucenic|ucenică]]". Tu ești [[ucenicul|ucenica]].',
        'Ține o plăcintă cu varză. Și asta, pentru benzină. Adică pentru curent. Adică ține.',
      ])
      await m.say('ecaterina', ['Mulțumesc, [[tinere|domnișoară]]. Ai condus mai bine ca Tolea. Da\' să nu-i spui. …Tolea, ai auzit? Nu i-am spus.'])
      tol.ride(bus)
    })
    pr.feed(0.4)
    // Tolea takes it on down the boulevard, under the wires
    m.story.leave(bus, [{ x: bus.pos.x + 60, z: LANE_Z }, { x: 330, z: LANE_Z }, { x: 400, z: LANE_Z }])
    eca.walkTo(eca.pos.x + 6, eca.pos.z + 6)
    g.side?.linger(m, [eca], { x: eca.pos.x, z: eca.pos.z })
  },
}

export const FAVORS = [borcane, nunta, conferinta, gropi, troleibuz]
