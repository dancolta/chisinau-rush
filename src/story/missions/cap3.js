import { pathThrough } from '../Kit.js'
import { dist, banner } from './common.js'

const CH3 = 'Capitolul 3'

// =============================================================================
// Cap. 3 · Beciul Primăriei — night stealth: three photos, three guards
export const beciul = {
  id: 'beciul', chapterName: CH3, title: 'Beciul Primăriei',
  desc: 'Nelu Gunoierul te bagă noaptea în curtea din spate a Primăriei. Fă poze. Nu te lăsa văzut.',
  giver: { npc: 'nelu', label: 'Nelu Gunoierul' },
  intro: ['CAPITOLUL 3', 'BECIUL', 'Orice primărie are un beci. Unele au și ceva în el.'],
  reward: { xp: 500 },
  async script(m) {
    const g = m.game, p = m.player
    await m.say('nelu', [
      'Tu ești ăla care umblă cu matrioșca? Lilia mi-a zis de tine.',
      'Io-s Nelu. Mătur curtea Primăriei de douăzeci de ani. Noaptea, în beci, e mișcare mare: cutii, dube, oameni în negru.',
      'Intri pe la containere, prin spate. Fă poze la tot: la arhivă, la dubă și la telefonul roșu din geam.',
      'Și nu te lăsa văzut, că io am trei copii și o soacră.',
    ])
    const h = g.renderer.tod.hour
    if (h > 5 && h < 21) {
      await m.fade(1, 700)
      m.tod(23.6)
      g.police.clear()
      await m.wait(0.3)
      await m.fade(0, 800)
      await g.ui.overlay('23:40', 1.2, { tone: 'white' })
    }
    // ---- the back yard -----------------------------------------------------------------------------
    const DOOR = { x: -100, z: -37.6 }
    m.prop((b) => {
      b.box(2.4, 2.8, 0.25, { x: 0, y: 0, z: 0, color: 0x14110f })
      b.box(2.9, 0.25, 0.4, { x: 0, y: 2.8, z: 0.05, color: 0x5a4a44 })
      b.box(0.5, 0.18, 0.28, { x: 0, y: 3.2, z: 0.3, color: 0xffd98a, emit: 1 })
      for (let i = 0; i < 7; i++) b.box(0.8, 0.6, 0.6, { x: -3.2 + (i % 3) * 0.9, y: Math.floor(i / 3) * 0.6, z: -2.4 - (i % 2) * 0.2, color: i % 2 ? 0x8a6a44 : 0x9a7a54 })
      for (let i = 0; i < 5; i++) b.box(0.8, 0.6, 0.6, { x: 2.6 + (i % 2) * 0.9, y: Math.floor(i / 2) * 0.6, z: -2.6, color: 0x8a6a44 })
    }, { x: DOOR.x, z: DOOR.z, ry: Math.PI })
    m.prop((b) => { b.box(1.5, 1.2, 0.12, { x: 0, y: 3.1, z: 0, color: 0xff2a2a, emit: 1.4 }); b.box(1.7, 0.1, 0.3, { x: 0, y: 3.05, z: -0.1, color: 0x6a5a54 }) }, { x: -80, z: -37.55, ry: Math.PI })
    const van = m.vehicle('rutiera', -87, -47, -Math.PI / 2, { color: 0x1a1a1e })
    van.locked = true
    banner(m, 'BEZNĂ INVEST', { x: -87, y: 1.9, z: -48.25, ry: Math.PI, w: 3.6, h: 0.7, bg: '#141418', fg: '#e8c14a' })
    // guards with patrol routes
    const guard = (x, z, pts, wait = 1.4) => {
      const n = m.spawn(null, 'mascat', x, z, { voice: { pitch: 0.7, type: 'gruff' } })
      n.speed = 1.25
      const cone = m.cone(n, { range: 10.5, fov: 1.15, rate: 1.9 })
      let i = 0, pause = 0
      m.every((dt) => {
        if (!pts.length) { n.char.heading = pts.base + Math.sin(m.t * 0.55) * 0.9; return }
        if (n.state === 'idle') {
          pause -= dt
          if (pause <= 0) { i = (i + 1) % pts.length; n.walkTo(pts[i].x, pts[i].z, { onArrive: () => { pause = wait } }) }
        }
      })
      return { n, cone }
    }
    const still = []; still.base = Math.PI / 2
    const guards = [
      guard(-110, -44, [{ x: -110, z: -44 }, { x: -110, z: -60 }], 1.8),
      guard(-96, -55, [{ x: -96, z: -55 }, { x: -76, z: -55 }], 1.5),
      guard(-97.2, -40.3, still),
    ]
    guards[2].n.char.heading = Math.PI / 2
    let seen = false
    m.every(() => {
      if (seen) return
      for (const q of guards) if (q.cone.alert >= 1) { seen = true; q.n.say('Stai! Cine-i acolo?!'); m.fail('Te-au prins. Nelu o să nege că te cunoaște.') }
    })
    // photo spots
    const shots = [
      { id: 'arhiva', x: -100, z: -41.8, label: 'Fotografiază {y}arhiva{/y}' },
      { id: 'duba', x: -87, z: -51.4, label: 'Fotografiază {y}duba „Beznă Invest"{/y}' },
      { id: 'telefon', x: -80, z: -41.4, label: 'Fotografiază {y}telefonul roșu{/y}' },
    ]
    let taken = 0
    const rings = []
    for (const s of shots) {
      const r = m.ring(s.x, s.z, { r: 1.2, color: 0x7fd4ff })
      rings.push(r)
      m.interact({
        id: 'foto_' + s.id, x: s.x, z: s.z, r: 1.8, hold: 1.1, label: s.label, enabled: () => !s.done,
        onInteract: () => {
          s.done = true
          taken++
          m.untrack(r)
          g.audio?.sfx('camera', { bus: 'ui', vol: 0.9 })
          g.ui.flash('#fff', 180)
          m.notify(`Poză făcută (${taken}/3)`, 2, 'gold')
        },
      })
    }
    m.objective('Intră în curtea din spate a Primăriei. {r}Nu te lăsa văzut.{/r}', { sub: 'Poze: 0/3 · ține {y}[E]{/y} pe cercurile albastre' })
    m.marker({ x: -72, z: -56 }, 'Intrarea din spate')
    m.tip('Stai în afara conurilor de lumină. Fuga ({y}⇧{/y}) face zgomot: te observă mai repede.', 9)
    await m.until(() => dist(p.pos, { x: -72, z: -56 }) < 9 || taken > 0)
    m.marker(null)
    m.every(() => { m.sub(`Poze: ${taken}/3 · ține {y}[E]{/y} pe cercurile albastre`) })
    await m.until(() => taken >= 3)
    // ---- get out -------------------------------------------------------------------------------------
    const nelu = m.story.cast.nelu
    const exit = nelu ? nelu.pos : { x: -68, z: -64 }
    await m.reach(exit, 3.4, { text: 'Ieși din curte. Înapoi la {y}Nelu{/y}.', label: 'Nelu' })
    for (const q of guards) q.cone.enabled = false
    await m.say('nelu', ['Ai ieșit? Viu? Bravo. Io am stat cu mătura pregătită. Pentru tine sau pentru ei, nu știu nici io.', 'Du pozele la Lilia. Ea știe ce să facă cu ele.'])
    await m.evidence('poze_beci', 'Pozele din beci', 'Arhiva orașului împachetată în cutii, o dubă {y}„Beznă Invest"{/y} gata de plecare și un {y}telefon roșu{/y} cu linie directă. Într-un colț, un calendar: {y}„Vineri. Trenul de Moscova."{/y}')
  },
}

// =============================================================================
// Cap. 3 · Răpirea — Tanti Zina is taken; chase the G-Wagon to the circus, brawl with the gopniks at your side
export const rapirea = {
  id: 'rapirea', chapterName: CH3, title: 'Răpirea',
  desc: 'Cineva a vorbit prea mult. Tanti Zina a dispărut într-un G-Wagon negru. Gopnicii din curte sunt cu tine.',
  giver: { place: 'acasa', label: 'Acasă (Blocul 7)', auto: true, r: 16 },
  startText: 'Lilia așteaptă pozele, dar întâi treci pe {y}acasă{/y}. Ceva nu-i în regulă în curte.',
  reward: { xp: 600, cred: 20 },
  chapterEnd: 'CAPITOLUL 3 · ÎNCHEIAT', chapterEndText: 'Ai dovezi, martori și o curte întreagă în spate. E timpul să vorbească piața.',
  async script(m) {
    const g = m.game, p = m.player
    m.hideCast('zina')
    const vitea = m.story.cast.vitea
    const V = vitea || m.spawn('vitea', 'gopnik1', 12, 205)
    await m.walk(V, p.pos.x + 2, p.pos.z + 1.5, { run: true, timeout: 6 })
    await m.say('vitea', [
      'Bratan! Bratan! Au luat-o pe Tanti Zina! Un G-Wagon negru, acu\' un minut!',
      'Au zis: „babele care vorbesc prea mult merg la plimbare". Au luat-o spre centru, pe Bănulescu-Bodoni!',
      'Fugi după ei! Noi venim după tine cu Jiguliul!',
    ])
    // ---- the chase ---------------------------------------------------------------------------------
    const graph = g.traffic.graph
    const mid = pathThrough(graph, [[3, 3], [2, 3], [2, 1], [1, 1]], { lane: 0, speed: 17 })
    const cut = mid.findIndex((q) => q.z < -130 && q.x < -228)
    const route = [
      { x: -58.25, z: 196, speed: 12 }, { x: -58.25, z: 158, speed: 14 }, { x: -60, z: 146, speed: 9, r: 5 },
      ...mid.slice(0, cut > 0 ? cut : mid.length),
      { x: -238, z: -141.75, speed: 8, r: 4 }, { x: -240, z: -150, speed: 6, r: 4 }, { x: -240, z: -157, speed: 3, r: 2.5 },
    ]
    g.vehicles.clearSpot(-240, -150, 12)
    const gw = m.vehicle('gwagon', -58.25, 205, Math.PI, { color: 0x0c0c0e })
    gw.locked = true
    gw.health = 100
    const car = m.needCar(-55.25, 222, Math.PI, 'logan')
    m.objective('Urcă într-o mașină și {r}urmărește G-Wagonul!{/r}')
    if (m.car !== car) { m.marker(car.pos, 'Mașina'); await m.until(() => m.car && !m.car.broken, { timeout: 45, onTimeout: 'Au dispărut cu Tanti Zina…' }); m.marker(null) }
    const drv = m.driver(gw, route, { speed: 17, avoid: true })
    // Vitea and the boys follow in their own car
    const crew = m.vehicle('jiguli', -55.25, 232, Math.PI, { color: 0x9a1c1c })
    crew.locked = true
    m.chaser(crew, () => ({ x: gw.pos.x, z: gw.pos.z, speed: Math.abs(gw.speed) }), { speed: 19, keep: 14 })
    if (vitea) { m.hideCast('vitea') } else m.story.removeNpc(V)
    let lostT = 0
    const chase = m.every((dt) => {
      const d = dist(m.P, gw.pos)
      lostT = d > 150 || !m.car ? lostT + dt : Math.max(0, lostT - dt)
      if (lostT > 12) m.fail('I-ai pierdut. Tanti Zina… Doamne ferește.')
      drv.speedMul = d > 90 ? 0.82 : d < 30 ? 1.1 : 1
      m.sub(`Distanța: ${Math.round(d)} m${d > 110 ? ' · {r}îi pierzi!{/r}' : ''}`)
    })
    m.objective('Urmărește {r}G-Wagonul{/r}. Nu-l pierde!')
    await m.until(() => drv.done || gw.broken || dist(gw.pos, route[route.length - 1]) < 3.5)
    m.untrack(chase)
    gw.throttle = 0; gw.handbrake = true
    m.sub('')
    const at = { x: gw.pos.x, z: gw.pos.z }
    const circus = dist(at, { x: -240, z: -157 }) < 30
    // ---- the brawl -----------------------------------------------------------------------------------
    const fx = Math.sin(gw.heading), fz = Math.cos(gw.heading)
    const zina = m.spawn('zina', 'zina', at.x + fx * 5, at.z + fz * 5, { voice: { pitch: 1.3, type: 'old' }, anim: 'idle' })
    zina.state = 'cower'
    const foes = [
      m.enemy('mascat', at.x - fz * 2.4, at.z + fx * 2.4, { hp: 58 }),
      m.enemy('mascat', at.x + fz * 2.4, at.z - fx * 2.4, { hp: 58 }),
    ]
    if (circus) {
      foes.push(m.enemy('mascat', -231, -167, { hp: 58 }), m.enemy('mascat', -249, -167, { hp: 58 }))
    }
    const allies = [
      m.ally('gopnik1', crew.pos.x + 2, crew.pos.z + 1, { id: 'vitea' }),
      m.ally('gopnik2', crew.pos.x - 2, crew.pos.z + 1),
      m.ally('gopnik3', crew.pos.x, crew.pos.z + 3),
    ]
    m.brawl(foes, allies)
    m.notify(circus ? 'Au băgat-o spre Circ! Mascații ies din clădire!' : 'G-Wagonul s-a oprit! Mascații sar din mașină!', 3, 'red')
    allies[0].say('Pentru Tanti Zina! Davai, băieți!')
    m.objective('Bate-i pe {r}mascați{/r} și salveaz-o pe {y}Tanti Zina{/y}!', { sub: `Mascați rămași: ${foes.length}` })
    m.every(() => m.sub(`Mascați rămași: ${foes.filter((f) => !m.down(f)).length}`))
    await m.until(() => m.allDown(foes))
    g.audio?.sting('fight_win')
    await m.wait(1)
    await m.cutscene(async () => {
      // stage the reunion on open ground, away from wrecks and their smoke
      await m.fade(1, 350)
      if (p.vehicle) g.vehicles.exit(true)
      const s = m.stageSpot(p.pos.x, p.pos.z, { r: 6 })
      const za = Math.atan2(zina.pos.x - s.x, zina.pos.z - s.z)
      m.teleport(s.x, s.z, za)
      zina.state = 'idle'
      zina.char.anim.set('idle')
      zina.teleport(s.x + Math.sin(za) * 4.5, g.physics.groundHeight(s.x + Math.sin(za) * 4.5, s.z + Math.cos(za) * 4.5, 3), s.z + Math.cos(za) * 4.5, za + Math.PI)
      const zx = s.x + Math.sin(za) * 1.3, zz = s.z + Math.cos(za) * 1.3
      const vi = allies[0]
      if (vi && !vi.char.ko) {
        const vx = s.x - Math.cos(za) * 1.9 + Math.sin(za) * 0.4, vz = s.z + Math.sin(za) * 1.9 + Math.cos(za) * 0.4
        vi.state = 'idle'
        vi.teleport(vx, g.physics.groundHeight(vx, vz, 3), vz, za)
      }
      m.hold({ ...m.clearView((s.x + zx) / 2, (s.z + zz) / 2, { dist: 4.6, lookY: 1.2, prefer: za + Math.PI / 2 }), dur: 60 })
      await m.fade(0, 450)
      await m.walk(zina, zx, zz, { timeout: 5 })
      m.face(zina, p.pos.x, p.pos.z)
      await m.say('zina', [
        'Maică, știam că vii! Ăștia m-au întrebat ce-am văzut. Le-am zis că văd prost. Ha! Văd tot.',
        { who: 'vitea', text: 'Nimeni nu se atinge de babele din curtea noastră, bratan. Nimeni.' },
        'Și să știi: în mașină vorbeau. Sâmbătă, primarul face „miting de sprijin" în PMAN.',
        'Acolo e momentul, maică. În fața la toată lumea. Cu tot ce-ai strâns.',
      ])
    })
    await m.evidence('martora', 'Martora: Tanti Zina', 'Răpită de oamenii primarului, în {y}G-Wagonul{/y} lui. A auzit tot: dosarele pleacă vineri, iar sâmbătă Eban face {y}miting în PMAN{/y}. Acum vrea să vorbească. Tare.')
  },
}

