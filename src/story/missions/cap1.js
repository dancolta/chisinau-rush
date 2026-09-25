import { CAST } from '../../data/outfits.js'
import { Train, pathThrough } from '../Kit.js'
import { dist, rand, banner, crowd, cheerAll, taxiFare, freeSpot } from './common.js'

const CH1 = 'Capitolul 1'

// =============================================================================
// PROLOG · Acasă — the train, Nea Grișa's taxi, Tanti Zina's bench
export const sosire = {
  id: 'sosire', chapterName: 'Prolog', title: 'Acasă',
  desc: 'Te întorci la Chișinău după șapte ani „afară". Orașul te-a așteptat. Gropile, la fel.',
  giver: { place: 'peron', label: 'Peronul 1', auto: true, r: 8 },
  intro: ['PROLOG', 'ACASĂ', 'Chișinău. Septembrie. Ora șase seara.'],
  next: 'auto', silentPass: true,
  async script(m) {
    const g = m.game, p = m.player
    m.tod(17.9)
    g.police.clear()
    // ---- the train pulls in ------------------------------------------------------------
    const train = m.track(new Train(g, { cars: 3 }))
    const grisaPos = { x: 315, z: 262.4 }
    const taxi = m.vehicle('taxi', 312, 265.25, -Math.PI / 2, { persist: true })
    taxi.locked = true
    const grisa = m.spawn('grisa', 'taxist', grisaPos.x, grisaPos.z, { ry: 0, name: 'Nea Grișa', voice: { pitch: 0.9, type: 'male' } })
    grisa.lookAtPlayer = true
    await m.cutscene(async () => {
      p.char.setVisible(false)
      p.teleport(321, 0.3, 311.6, Math.PI)
      train.arrive(298.3, 9)
      g.cameraRig.shot({ from: [292, 2.3, 309.6], to: [288, 2.8, 308.2], lookFrom: [392, 2.2, 314], lookTo: [312, 2.0, 314.2], dur: 9, ease: 'inout' })
      await m.wait(9.3)
      p.char.setVisible(true)
      g.audio?.sfx('door', { vol: 0.7 })
      g.cameraRig.shot({ from: [314.5, 2.3, 301.5], to: [316.5, 2.0, 302.6], look: [321.2, 1.35, 309.5], dur: 7, ease: 'inout' })
      await m.playerWalk(321, 308, 1.6)
      await m.talk('player', 'Șapte ani la Milano. Și gara tot aceeași.', 3.2)
      await m.talk('player', 'Mama zicea: „vino acasă, că aici e mai bine". Hai să vedem.', 3.6)
      train.depart()
    })
    // ---- to the taxi --------------------------------------------------------------------
    m.tip('{y}[W][A][S][D]{/y} mergi · {y}[⇧]{/y} fugi · {y}Click dreapta{/y} sau {y}[Z][X]{/y} rotește camera', 9)
    await m.reach(grisaPos, 3.2, { text: 'Ieși din gară. {y}Nea Grișa{/y} te așteaptă cu taxiul peste drum.', label: 'Nea Grișa' })
    grisa.char.anim.play('wave')
    await m.say('grisa', [
      'Tu ești băiatul Mariei? Maică-ta mi-a zis să te iau de la tren. Hai, urcă, că-i ora de vârf.',
      { who: 'player', text: 'Mersi, nea Grișa. La Botanica, la Blocul 7.' },
      'Știu, știu. Toată lumea știe unde-i Blocul 7. E ăla cu gaura în asfalt de la Brejnev.',
    ])
    // ---- the ride home ------------------------------------------------------------------
    m.story.removeNpc(grisa)
    taxi.locked = false
    m.board(taxi)
    const route = [
      { x: 296, z: 268.25 }, { x: 200, z: 268.25 }, { x: 100, z: 268.25 }, { x: 0, z: 268.25 },
      { x: -44, z: 268.25, speed: 9 }, { x: -52, z: 266.8, speed: 7, r: 4 }, { x: -56.8, z: 262, speed: 7, r: 4 },
      { x: -58.25, z: 252, speed: 11 }, { x: -58.25, z: 204, speed: 11 }, { x: -56.5, z: 191, speed: 5, r: 4 }, { x: -55.25, z: 182, speed: 2.2, r: 2.5 },
    ]
    g.vehicles.clearSpot(-55.25, 182, 9)
    const drv = m.driver(taxi, route, { speed: 14.5 })
    m.objective('Stai comod. Nea Grișa te duce acasă.', { sub: 'Mouse / [Z][X]: te uiți la oraș' })
    const G = { name: 'Nea Grișa', voice: { pitch: 0.9, type: 'male' }, spec: CAST.taxist }
    const ride = m.chatter([
      [2, G, 'Șapte ani, zici? S-o schimbat multe. Gropile s-au mărit. Prețurile la fel.'],
      [1.2, G, 'Primarul nostru, Ceon Eban… omul taie panglici cum taie alții semințe. Ieri o inaugurat un stâlp.'],
      [1.2, G, 'Și vorbește la telefon. Mereu. Tot în rusă. Zice că-i cu „investitorii".'],
      [1.5, G, 'Ține-te! Groapa asta o știu de pe vremea lui Snegur!', 2.6],
      [1.2, { name: 'Radio Chișinău' }, '„…primarul Ceon Eban a declarat că gropile vor fi astupate până în 2040. «Lucrăm la asta», a precizat edilul."', 5.2],
      [1, G, 'Lucrează. Ca mine la sală. Din 2004.'],
    ])
    m.skippable = true
    await m.until(() => drv.done || dist(taxi.pos, route[route.length - 1]) < 3.2 || m.skipFlag, { timeout: 150, onTimeout: 'Taxiul s-a rătăcit.' })
    m.skippable = false
    ride.stop()
    if (m.skipFlag) {
      m.skipFlag = false
      g.ui.subtitle(null)
      await m.fade(1, 400)
      const end = route[route.length - 1]
      drv.done = true
      taxi.teleport(end.x, g.physics.groundHeight(end.x, end.z, 3) + 0.3, end.z, Math.PI)
      g.cameraRig.target.copy(taxi.pos); g.cameraRig.snap()
      await m.wait(0.3)
      await m.fade(0, 500)
    }
    taxi.throttle = 0; taxi.handbrake = true
    await m.wait(0.6)
    await m.talk(G, 'Gata, Botanica. Blocul 7. Salut-o pe Tanti Zina, că ea știe tot ce mișcă în cartier.', 3.6)
    m.unboard()
    m.story.leave(taxi, [{ x: -58.25, z: 150 }, { x: -58.25, z: 60 }, { x: -58.25, z: -60 }])
    // ---- Tanti Zina ------------------------------------------------------------------------
    await m.reach('banca_zina', 3.4, { text: 'Mergi la {y}Blocul 7{/y}. Tanti Zina e pe bancă, ca întotdeauna.', label: 'Tanti Zina' })
    await m.cutscene(async () => {
      const z = m.story.cast.zina
      if (z) m.hold({ from: [z.pos.x + 3.6, 1.9, z.pos.z - 3.4], look: [z.pos.x - 0.4, 1.0, z.pos.z + 0.2], dur: 60 })
      await m.say('zina', [
        'Ia te uită cine-o venit! Băiatul Mariei! Cât ai crescut, maică… și cât ai slăbit. Nu v-o dat de mâncare în Italia?',
        { who: 'player', text: 'Bună seara, tanti Zina. Mama unde-i?' },
        'La țară, la Hâncești, cu roșiile. Te-o lăsat pe mâna mea. Și cheile de la garaj, de la unchiu\' Vasile.',
      ])
    })
  },
}

// =============================================================================
// Cap. 1 · Pâine de la Linella — errand + first fight
export const paine = {
  id: 'paine', chapterName: CH1, title: 'Pâine de la Linella',
  desc: 'Tanti Zina vrea o franzelă. Gopnicii din alt cartier vor și ei.',
  giver: { npc: 'zina', label: 'Tanti Zina' },
  intro: ['CAPITOLUL 1', 'BANI DE PÂINE', 'Primul lucru pe care-l faci acasă: te trimite cineva după pâine.'],
  reward: { lei: 30, xp: 150 },
  async script(m) {
    const g = m.game
    await m.say('zina', [
      'Până una-alta, fă-mi un bine, maică: adu-mi o pâine de la Linella. Franzelă albă, nu neagră, că nu-s în dietă.',
      'Uite zece lei. Restul e al tău, de bomboane.',
    ])
    g.progress.addLei(10, 'De la Tanti Zina')
    m.tip('Harta mare: {y}[M]{/y} · pe minimap urmezi linia galbenă', 7)
    // ---- buy the bread -----------------------------------------------------------------------
    const lin = m.places.linella
    let bread = false
    m.interact({
      id: 'bread', x: lin.x, z: lin.z, r: 4.5, label: 'Cumpără o franzelă (8 lei)', priority: 20,
      enabled: () => !bread,
      onInteract: async () => {
        const i = await g.ui.dialogue({ name: 'Vânzătoarea', role: 'Linella', spec: CAST.vanzatoare, id: 'vanzatoare', voice: { pitch: 1.2, type: 'female' } },
          ['Pachet luați? Card ori cash? Mai iute, că-i coadă.'], { choices: [{ text: 'O franzelă albă, vă rog.', cost: '8 lei' }, { text: 'Și un pachet, că tot întrebați.', cost: '9 lei' }] })
        if (g.progress.lei >= 8) g.progress.addLei(-(i === 1 ? 9 : 8)); else g.ui.notify('N-ai destui bani. Vânzătoarea oftează: „Lasă, îmi dai mâine."', 3)
        bread = true
        g.audio?.sfx('pickup', { bus: 'ui' })
        g.ui.notify('Ai o franzelă caldă. Miroase a copilărie.', 3, 'gold')
      },
    })
    await m.reach(lin, 5, { text: 'Cumpără pâine de la {y}Linella{/y}.', label: 'Linella' })
    m.marker(lin, 'Linella')
    await m.until(() => bread)
    // ---- the way back: gopnici from another district ------------------------------------------
    const zina = m.places.banca_zina
    m.objective('Du pâinea la {y}Tanti Zina{/y}.')
    m.marker(zina, 'Tanti Zina')
    await m.until(() => dist(m.P, zina) < 42 && !m.player.vehicle)
    const p = m.player
    const dx = zina.x - p.pos.x, dz = zina.z - p.pos.z, d = Math.hypot(dx, dz) || 1
    const fx = dx / d, fz = dz / d
    const a = m.spawn('gop_a', 'gopnik3', p.pos.x + fx * 9 - fz * 1.2, p.pos.z + fz * 9 + fx * 1.2, { voice: { pitch: 0.95, type: 'gruff' } })
    const b = m.spawn('gop_b', 'gopnik2', p.pos.x + fx * 9.5 + fz * 1.4, p.pos.z + fz * 9.5 - fx * 1.4, { voice: { pitch: 0.8, type: 'gruff' } })
    m.walk(a, p.pos.x + fx * 2.4 - fz * 0.7, p.pos.z + fz * 2.4 + fx * 0.7).catch(() => {})
    m.walk(b, p.pos.x + fx * 2.6 + fz * 0.8, p.pos.z + fz * 2.6 - fx * 0.8).catch(() => {})
    await m.wait(1.6)
    const GP = { name: 'Gopnicul din Râșcani', role: 'Nu-i din curtea ta', spec: CAST.gopnik3, voice: { pitch: 0.95, type: 'gruff' } }
    const i = await m.say(GP, ['Șo, bratan, ai o siga? Nu? Da\' pâinea ceea? Hai, dă-o încoace, că ne e foame.'], {
      choices: ['Pâinea-i pentru Tanti Zina. Mergeți acasă.', 'Luați-o, n-am chef de probleme.'],
    })
    if (i === 1) await m.say(GP, ['Ha! Și fraer, și cuminte. Da\' noi tot te batem. Pentru principiu.'])
    else await m.say(GP, ['Tanti Zina? Cine-i asta, fraere? Amu te învățăm noi manierele.'])
    for (const n of [a, b]) { n.personality = 'tough'; n.hittable = true; n.stayDown = true; n.enemy = true; n.hostile = true; n.hp = n.maxHp = 34; n.state = 'fight'; n.target = p }
    m.brawl([a, b])
    m.objective('Bate-i pe {r}gopnici{/r}!', { sub: 'Lovește: {y}Click{/y} / {y}[J]{/y} · lovituri repetate = combo · {y}[Space]{/y} sari' })
    m.tip('Combinația {y}pumn-pumn-croșeu-picior{/y} îi pune la pământ mai repede.', 8)
    await m.until(() => m.allDown([a, b]))
    g.audio?.sting('fight_win')
    m.task(() => m.talk('vitea', 'Jostko! Ai inimă, bratan. Ăștia-s din Râșcani, n-au ce căuta în curtea noastră.', 4))
    // ---- give the bread ------------------------------------------------------------------------
    await m.reach(zina, 3.4, { text: 'Du pâinea la {y}Tanti Zina{/y}.', label: 'Tanti Zina' })
    await m.cutscene(async () => {
      const z = m.story.cast.zina
      if (z) m.hold({ from: [z.pos.x + 3.4, 1.8, z.pos.z - 3.6], look: [z.pos.x - 0.4, 1.0, z.pos.z], dur: 60 })
      await m.say('zina', [
        'Mulțumesc, maică. Caldă încă! Am văzut de la geam cum i-ai altoit pe ăia. Ca taică-tu, Dumnezeu să-l ierte.',
        'Amu ascultă-ncoace. Primaru\' ăsta, Eban… vorbește prea des la telefon. Și tot în rusă. Eu-s bătrână, da\' nu surdă.',
        'Și noaptea umblă prin cartier niște mașini negre, fără numere. Nu-i a bună.',
        'Da\' tu n-ai lucru, n-ai bani. Ține cheile de la garaj. Jiguliul lui Vasile stă acolo de doi ani. Du-l la Vova, la service, poate-l învie.',
      ])
    })
  },
}

// =============================================================================
// Cap. 1 · Jiguliul unchiului — first drive + first cop
export const jiguli = {
  id: 'jiguli', chapterName: CH1, title: 'Jiguliul unchiului',
  desc: 'Scoate Jiguliul lui Vasile din garaj și du-l la Vova, la service. Pe drum, poliția e „vigilentă".',
  giver: { place: 'garaj_unchi', label: 'Garajul unchiului Vasile', auto: true, r: 6 },
  startText: 'Du-te la {y}garajul unchiului Vasile{/y}, în spatele blocului.',
  reward: { xp: 200 },
  next: 'auto',
  async script(m) {
    const g = m.game, p = m.player
    g.vehicles.clearSpot(-44, 242, 7)
    const jig = m.vehicle('jiguli', -36, 240.6, -Math.PI / 2, { color: 0xd8c9a0, persist: true })
    jig.stalled = true
    m.data.jig = jig
    await m.cutscene(async () => {
      g.fx?.dust(jig.pos.x, 0.5, jig.pos.z, 20)
      m.hold({ from: [-45.8, 1.9, 243.4], look: [-36, 0.9, 240.4], dur: 60 })
      await m.talk('player', 'Jiguliul lui Vasile. Doi ani n-a pornit. Hai, bătrâne, nu mă face de râs.', 3.6)
    })
    m.objective('Urcă în Jiguli ({y}[E]{/y}).')
    m.marker(jig.pos, 'Jiguli')
    await m.until(() => p.vehicle === jig)
    m.marker(null)
    // ---- cranky engine ---------------------------------------------------------------------
    m.objective('Pornește motorul: apasă {y}[W]{/y}.', { sub: 'Jiguliul pornește din a treia. Ca la carte.' })
    let tries = 0
    await m.until(() => {
      if (g.input.pressed('up')) {
        tries++
        g.audio?.sfx('engine_crank', { at: jig.pos, vol: 0.9 })
        g.fx?.smoke(jig.pos.x - Math.sin(jig.heading) * 2.2, 0.5, jig.pos.z - Math.cos(jig.heading) * 2.2, 0.15, 1 + tries)
        g.cameraRig.shake(0.08 * tries)
        if (tries === 1) m.notify('Hrrr… hrrr… nimic.', 1.6)
        if (tries === 2) m.notify('Hrrr-hrrr-PAC! Aproape…', 1.6)
      }
      return tries >= 3
    })
    jig.stalled = false
    g.audio?.sfx('backfire', { at: jig.pos, vol: 1 })
    g.fx?.smoke(jig.pos.x - Math.sin(jig.heading) * 2.2, 0.5, jig.pos.z - Math.cos(jig.heading) * 2.2, 0.05, 4)
    m.notify('{g}A pornit!{/g} Vecinii de la etajul cinci aplaudă. Sau înjură.', 3)
    m.tip('{y}[W]/[S]{/y} accelerezi / frânezi · {y}[A]/[D]{/y} virezi · {y}[Space]{/y} frână de mână · {y}[E]{/y} cobori · {y}[H]{/y} claxon', 10)
    // ---- drive to Vova; a cop pulls you over on the way --------------------------------------
    const vova = m.places.mecanic
    m.objective('Du Jiguliul la {y}Vova{/y}, la Auto Service (cooperativa de garaje).')
    m.marker(vova, 'Auto Service „La Vova"')
    const start = { x: jig.pos.x, z: jig.pos.z }
    await m.race([() => dist(jig.pos, start) > 75 && p.vehicle === jig, () => dist(jig.pos, vova) < 40])
    if (dist(jig.pos, vova) > 40) {
      // police car appears behind, on a lane
      const e = g.traffic.graph.nearestEdge(jig.pos.x - Math.sin(jig.heading) * 30, jig.pos.z - Math.cos(jig.heading) * 30)
      const lp = g.traffic.graph.lanePoint(e.edge, 0, e.t)
      const cop = m.vehicle('police', lp.x, lp.z, Math.atan2(e.edge.fx, e.edge.fz), { persist: true })
      let handedOff = false
      m.track({ dispose: () => { if (!handedOff && g.vehicles.list.includes(cop)) g.vehicles.remove(cop) } })
      cop.siren = true
      const chase = m.chaser(cop, () => ({ x: jig.pos.x, z: jig.pos.z, speed: Math.abs(jig.speed) }), { speed: 21, keep: 9 })
      g.audio?.sfx('siren_whoop', { at: cop.pos, vol: 1 })
      m.objective('{r}Poliția!{/r} Trage pe dreapta și oprește.', { sub: 'Frânează ({y}[S]{/y}) până la oprire completă.' })
      m.marker(null)
      m.task(async () => { await m.wait(2); await m.talk({ name: 'Megafonul poliției' }, '„Jiguli bej! Trageți pe dreapta!"', 3) })
      const t0 = m.t
      const r = await m.race([
        () => Math.abs(jig.speed) < 1 && dist(cop.pos, jig.pos) < 24,
        () => !p.vehicle && dist(cop.pos, p.pos) < 24,
        () => m.t - t0 > 32,
      ])
      if (r < 2) {
        // ---- the classic Chișinău traffic stop ----------------------------------------------------
        chase.done = true
        cop.throttle = 0; cop.handbrake = true
        const lx = Math.cos(cop.heading), lz = -Math.sin(cop.heading)
        const cal = m.spawn('caldare', 'caldare', cop.pos.x + lx * 1.8, cop.pos.z + lz * 1.8, { voice: { pitch: 0.8, type: 'gruff' } })
        const tgt = p.vehicle ? p.vehicle : p
        const jl = p.vehicle ? { x: Math.cos(tgt.heading) * 1.9 + Math.sin(tgt.heading) * 0.4, z: -Math.sin(tgt.heading) * 1.9 + Math.cos(tgt.heading) * 0.4 } : { x: 1.4, z: 0 }
        await m.walk(cal, tgt.pos.x + jl.x, tgt.pos.z + jl.z, { timeout: 7 })
        m.face(cal, tgt.pos.x, tgt.pos.z)
        await m.cutscene(async () => {
          m.hold({ from: [cal.pos.x + Math.cos(cal.char.heading) * 3 - Math.sin(cal.char.heading) * 2.5, 2.2, cal.pos.z - Math.sin(cal.char.heading) * 3 - Math.cos(cal.char.heading) * 2.5], look: [cal.pos.x, 1.4, cal.pos.z], dur: 60 })
          const pr = g.progress
          const ch = await m.say('caldare', [
            'Bună seara. Sergent Căldare, Poliția Chișinău. Documentele, vă rog.',
            'Jiguli fără număr, fără ITP, fără centură… și cu fum ca la crematoriu. Știți cât face asta?',
          ], { choices: [
            { text: 'Mită: „Pentru cafea, șefu\'"', cost: '50 lei', disabled: pr.lei < 50 },
            { text: 'E mașina lui Vasile de la Blocul 7. O duc la reparat.' },
            { text: 'Calci pedala și fugi', cost: '+★' },
          ] })
          if (ch === 0) {
            pr.addLei(-50); pr.stats.bribes++; pr.addCred(2)
            await m.say('caldare', ['Hm. Cafeaua e scumpă azi. Circulați, circulați.', 'Și… bun venit acasă. Se vede că ești de-al nostru.'])
            pr.flags.caldare = 'mita'
          } else if (ch === 1) {
            pr.addCivic(3)
            await m.say('caldare', ['Vasile? Vasile cu Jiguliul? Eram colegi de clasă! Mergi, mergi.', 'Da\' să-i zici să-mi dea înapoi cei 200 de lei din 2009. Cu dobândă.'])
            pr.flags.caldare = 'vasile'
          } else {
            pr.flags.caldare = 'fugit'
            m.data.flee = true
          }
        })
        if (m.data.flee) {
          m.story.removeNpc(cal)
          handedOff = true
          g.police.adopt(cop)
          g.police.setLevel(1)
        } else {
          await m.walk(cal, cop.pos.x + Math.cos(cop.heading) * 1.8, cop.pos.z - Math.sin(cop.heading) * 1.8, { timeout: 6 })
          m.story.removeNpc(cal)
          cop.siren = false
          handedOff = true
          m.story.leave(cop)
        }
      } else {
        await m.talk({ name: 'Megafonul poliției' }, '„Stai! Staaai! Bine… te-am notat, Jiguli bej!"', 3)
        chase.done = true
        handedOff = true
        g.police.adopt(cop)
        g.police.setLevel(1)
        g.progress.flags.caldare = 'fugit'
        m.data.flee = true
      }
      if (m.data.flee) {
        m.objective('{r}Scapă de poliție!{/r}', { sub: 'Rupe contactul vizual: ascunde-te pe străzi lăturalnice.' })
        await m.until(() => g.police.level === 0)
        m.notify('Ai scăpat. Sergentul o să-și amintească de tine…', 3)
      }
      m.objective('Du Jiguliul la {y}Vova{/y}, la Auto Service.')
    }
    await m.reach(vova, 10, { vehicle: jig, stop: true, label: 'Auto Service „La Vova"' })
    if (jig.broken) m.fail('Ai terminat Jiguliul. Vasile o să plângă.')
    // ---- Vova ----------------------------------------------------------------------------------
    await m.cutscene(async () => {
      g.vehicles.exit(true)
      const v = m.story.cast.vova
      const mx = p.pos.x + 1.6, mz = p.pos.z + 1.2
      m.hold({ from: [mx - 4.2, 2.1, mz + 3.6], look: [mx - 0.6, 1.2, mz - 0.4], dur: 60 })
      if (v) { await m.walk(v, mx, mz, { timeout: 5 }); m.face(v, p.pos.x, p.pos.z); m.face(p.char, v.pos.x, v.pos.z) }
      await m.say('vova', [
        'Ooo! Jiguliul lui Vasile! Ăsta-i tanc, bratan, nu mașină. L-a condus și Brejnev, cred.',
        'Îl fac ca nou. Ca nou-nou nu, da\' ca vechi-bun.',
        'Da\' tu, n-ai de lucru? Uite, am un Logan taxi, al cumnatului. Îl conduci tu. Împărțim: 70 la mine, 30 la tine.',
      ])
      const c = await m.choose('player', 'Ce-i zici lui Vova?', ['70 la tine?! Hai 50/50.', 'Bine, Vova. Dă cheile.'])
      if (c === 0) await m.say('vova', ['Bratan… 60/40 și-ți pun și brăduț parfumat. Ultimul preț.'])
      else await m.say('vova', ['Asta-i atitudinea! Primul client te așteaptă. Banii nu dorm.'])
    })
    g.progress.flags.taxi = true
    jig.locked = true
  },
}

// =============================================================================
// Cap. 1 · Prima tură — three fares; the third leaves something behind
export const taxi = {
  id: 'taxi', chapterName: CH1, title: 'Prima tură',
  desc: 'Trei clienți, un Logan și o mulțime de gropi. Ultimul client uită ceva pe bancheta din spate.',
  giver: { npc: 'vova', label: 'Vova (service)' },
  reward: { xp: 250 },
  async script(m) {
    const g = m.game, p = m.player
    const spot = freeSpot(g, [{ x: -200, z: 252.5 }, { x: -200, z: 256.5 }, { x: -226, z: 252.5 }])
    const cab = m.vehicle('taxi', spot.x, spot.z, Math.PI / 2, { persist: true })
    cab.keep = true
    g.progress.flags.taxiCar = true
    if (p.vehicle !== cab) {
      m.objective('Urcă în {y}taxi{/y}.')
      m.marker(cab.pos, 'Taxi')
      await m.until(() => p.vehicle === cab)
      m.marker(null)
    }
    m.tip('În taxi: oprești lângă client, îl duci, încasezi. Repede și fără bușituri = bacșiș.', 8)
    // fare 1: Linella -> Piața Centrală
    await taxiFare(m, {
      taxi: cab, spec: { ...CAST.vanzatoare, top: { style: 'coat', color: 0x5a6a8a, lapel: 0x4a5a7a }, hair: { style: 'bun', color: 0xb0a8a0 } },
      name: 'Doamna Tamara', voice: { pitch: 1.25, type: 'old' },
      from: { x: 125, z: 149.2, ry: Math.PI }, to: { x: 236, z: 13.5 }, toLabel: 'Piața Centrală',
      lines: ['Bună ziua, dragă! La Piața Centrală. Și nu prin gropi, că am ouă în sacoșă.', 'Pe vremea mea, taxiul costa doi lei. Și taximetristul îți căra sacoșele până la etaj.', 'Ai auzit? Primarul iar a tăiat panglica la o groapă. Zice că-i reparată. Au vopsit-o în negru.'],
      crashLines: ['Ouăle! Vai de ouăle mele!', 'Ușurel, dragă, că nu-s cartofi!', 'Doamne, iartă-l că nu știe ce face!'],
      arrive: ['Mulțumesc, dragă. Poftim. Și mănâncă, că ești slab.'],
    })
    // fare 2: Piața -> Primăria
    await taxiFare(m, {
      taxi: cab, spec: CAST.ionel, name: 'Ionel, student', voice: { pitch: 1.1, type: 'male' },
      from: { x: 243, z: 13.2, ry: Math.PI }, to: { x: -90, z: -13.5 }, toLabel: 'Primăria',
      lines: ['La Primărie, șefu\'. Am audiență. Vreau să întreb de ce căminul n-are apă caldă din 2019.', 'Mi-au zis să vin „săptămâna viitoare". De trei ani îmi zic asta.', 'Da\' io-s optimist. Am adus și o plăcintă pentru secretară.'],
      crashLines: ['Plăcinta! Mi-ai turtit plăcinta!', 'Bratan, eu vreau să ajung viu la audiență!'],
      arrive: ['Mersi! Dacă nu ies în două ore, sună la ambasada Italiei.'],
    })
    // fare 3: a clerk from the Primăria, on the phone in Russian, to the railway station
    const F = { name: 'Funcționarul', spec: CAST.deputat, voice: { pitch: 1.0, type: 'male' } }
    const r3 = await taxiFare(m, {
      taxi: cab, spec: CAST.deputat, name: 'Funcționarul', voice: F.voice,
      from: { x: -97, z: -13.6, ry: 0 }, to: { x: 356, z: 261.6 }, toLabel: 'Gara Feroviară',
      lines: ['La Gară. Repede. Și fără întrebări.', '(la telefon, în rusă) Da, Vasili Petrovici. Da. Vsio po planu.', '(la telefon) Dokumenty v piatnițu. Poezdom. Da, originalî. Kopii nam ne nujnî.', '(la telefon) Nu, nimeni nu știe. Primarul zice că-i „protocol". Ha.', 'Ce te uiți în oglindă? Condu. Și n-ai auzit nimic.'],
      crashLines: ['Atent, că ai în mașină un om important!', 'Te dau afară din… de unde lucrezi tu. Oriunde!'],
      arrive: ['Ține restul. Și… n-ai văzut nimic.'],
    })
    r3.npc.runSpeed = 5.5
    r3.npc.walkTo(361, 285, { run: true })
    await m.wait(1.2)
    m.notify('Funcționarul a uitat ceva pe bancheta din spate…', 3, 'gold')
    await m.wait(1.4)
    await m.cutscene(async () => {
      g.audio?.sfx('paper', { vol: 0.8 })
      await m.talk('player', 'Un dosar. „Strict secret". Ha. Cine lasă „strict secret" într-un taxi?', 3.4)
    })
    await m.evidence('dosar_taxi', 'Dosarul uitat în taxi', 'PRIMĂRIA MUN. CHIȘINĂU · STRICT SECRET · {y}„Proiectul Beznă"{/y}: iluminatul stradal se oprește „temporar" în 12 cartiere. 40 de parcuri trec la {y}„Beznă Invest SRL"{/y}. Semnat: {y}C. Eban{/y}.')
    await m.talk('player', '„Beznă Invest"… Hai să văd ce zice lumea. Mâine e o panglică de tăiat în PMAN, zicea radioul.', 4)
  },
}

// =============================================================================
// Cap. 1 · Panglica — ribbon cutting, the phone call in Russian, tailing the cortege
export const eban = {
  id: 'eban', chapterName: CH1, title: 'Panglica',
  desc: 'Primarul inaugurează o groapă „reparată" în PMAN. Apoi pleacă în grabă. Urmărește cortegiul.',
  giver: { place: 'pman', label: 'PMAN', auto: true, r: 22 },
  startText: 'Primarul taie o panglică în {y}Piața Marii Adunări Naționale{/y}. Du-te să vezi spectacolul.',
  reward: { xp: 300, cred: 10 },
  chapterEnd: 'CAPITOLUL 1 · ÎNCHEIAT', chapterEndText: 'Ai un dosar și o bănuială. Următorul pas: martori.',
  async script(m) {
    const g = m.game, p = m.player
    const RX = 0, RZ = -70
    // ---- the stage -------------------------------------------------------------------------
    m.prop((b) => {
      b.box(3.6, 0.02, 7, { x: 0, y: 0, z: 1.6, color: 0xa3141c })
      for (const s of [-1, 1]) { b.cyl(0.05, 0.05, 1.1, 8, { x: s * 1.7, y: 0, z: 0, color: 0xd9a93a }); b.sphere(0.08, 8, 6, { x: s * 1.7, y: 1.12, z: 0, color: 0xd9a93a }) }
      b.cyl(1.25, 1.25, 0.03, 20, { x: 0, y: 0.01, z: 0.9, color: 0x111114 })
      b.cyl(1.35, 1.35, 0.02, 20, { x: 0, y: 0.005, z: 0.9, color: 0xe8c14a })
    }, { x: RX, z: RZ })
    const ribbon = m.prop((b) => { b.box(3.4, 0.14, 0.02, { x: 0, y: 0.95, z: 0, color: 0xd11a1a }); b.box(0.5, 0.35, 0.05, { x: 0, y: 0.8, z: 0, color: 0xd11a1a }) }, { x: RX, z: RZ })
    banner(m, 'LUCRĂM LA ASTA', { x: RX, y: 3.1, z: RZ - 4.2, w: 7, h: 1.3, bg: '#1f3f8a', fg: '#ffd84a' })
    m.prop((b) => { for (const s of [-1, 1]) b.cyl(0.06, 0.06, 3.8, 8, { x: s * 3.4, y: 0, z: 0, color: 0x888888 }) }, { x: RX, z: RZ - 4.2 })
    const ebanN = m.spawn('eban', 'eban', RX, RZ - 2.4, { ry: 0, voice: { pitch: 1.05, type: 'male' } })
    const gA = m.spawn('bodyA', 'mascat', RX - 2.8, RZ - 3.2, { ry: 0 })
    const gB = m.spawn('bodyB', 'mascat', RX + 2.8, RZ - 3.2, { ry: 0 })
    const people = crowd(m, RX, RZ + 1.5, 10, { r0: 5.5, r1: 8.5, face: { x: RX, z: RZ - 1 } })
    const gw = m.vehicle('gwagon', 11, RZ - 1, 0, { color: 0x0c0c0e })
    const esc = m.vehicle('police', 11, RZ + 8, 0)
    gw.locked = true; esc.locked = true
    await m.reach({ x: RX, z: RZ + 9 }, 8, { text: 'Apropie-te de mulțime.', label: 'Ceremonia', inVehicle: false })
    // ---- the ceremony ----------------------------------------------------------------------------
    await m.cutscene(async () => {
      m.playerWalk(RX + 1.5, RZ + 9.5, 1.6).catch(() => {})
      g.cameraRig.shot({ from: [RX + 7, 2.6, RZ + 9], to: [RX + 5, 2.3, RZ + 7], look: [RX, 1.6, RZ - 2], dur: 12, ease: 'inout' })
      ebanN.char.anim.set('talk')
      await m.talk('eban', 'Dragi chișinăuieni! Astăzi e o zi istorică pentru capitala noastră!', 3.4)
      await m.talk('eban', 'Inaugurăm reparația gropii numărul o mie! Adică… am vopsit-o. Dar e un început!', 4)
      cheerAll(people)
      g.audio?.sfx('applause', { vol: 0.8 })
      await m.talk('eban', 'Lucrăm la asta! Mereu lucrăm la asta!', 2.8)
      g.cameraRig.shot({ from: [RX - 2.5, 1.9, RZ + 3], look: [RX, 1.1, RZ], dur: 5, ease: 'out' })
      ebanN.char.anim.play('swing')
      await m.wait(0.5)
      m.untrack(ribbon)
      g.fx?.confetti(RX, 2.2, RZ, 70)
      g.audio?.sfx('snip', { vol: 1 })
      cheerAll(people)
      await m.wait(1.6)
      g.audio?.sfx('phone_ring', { at: ebanN.pos, vol: 1 })
      ebanN.state = 'phone'
      g.cameraRig.shot({ from: [RX + 2.6, 1.8, RZ + 0.6], look: [RX, 1.55, RZ - 2.4], dur: 8, ease: 'inout' })
      await m.talk('eban', '(la telefon, în rusă) Da? Da, Vasili Petrovici. Da. Vsio po planu.', 3.6)
      await m.talk('eban', '(la telefon) Dokumenty v piatnițu. Ne volnuites. Tut vse svoi.', 3.6)
      await m.talk({ name: 'Cineva din mulțime' }, 'Iar vorbește în rusă…', 2.2)
      ebanN.state = 'idle'
      await m.talk('eban', 'Scuzați, dragi cetățeni! O ședință urgentă. Cu… investitorii!', 3)
    })
    // ---- the cortege leaves; Lilia appears ---------------------------------------------------------
    m.walk(ebanN, gw.pos.x - 1.8, gw.pos.z, { run: true, timeout: 5 }).then(() => { if (m.story.npcs.includes(ebanN)) m.story.removeNpc(ebanN) }).catch(() => {})
    m.walk(gA, esc.pos.x - 1.8, esc.pos.z, { run: true, timeout: 5 }).then(() => { if (m.story.npcs.includes(gA)) m.story.removeNpc(gA) }).catch(() => {})
    m.walk(gB, gw.pos.x + 1.8, gw.pos.z, { run: true, timeout: 5 }).then(() => { if (m.story.npcs.includes(gB)) m.story.removeNpc(gB) }).catch(() => {})
    for (const c of people) c.walkTo(c.pos.x + rand(-14, 14), c.pos.z + rand(6, 16))
    const lilia = m.spawn('lilia', 'jurnalista', p.pos.x - 2.2, p.pos.z + 1.5, { voice: { pitch: 1.2, type: 'female' } })
    m.face(lilia, p.pos.x, p.pos.z)
    await m.wait(1.2)
    await m.say('lilia', [
      'Ai auzit și tu? Iar vorbea în rusă. Eu-s Lilia, de la „Ochiul Chișinăului". Îl urmăresc de un an.',
      '„Documentele vineri, cu trenul"… Hai după cortegiu! Eu n-am mașină. Da\' tu ai, nu?',
    ])
    // ---- tail the cortege ------------------------------------------------------------------------
    const car = m.needCar(-14, RZ + 6, 0, 'hatch')
    m.objective('Urcă într-o mașină. Lilia vine cu tine.')
    if (m.car !== car) { m.marker(car.pos, 'Mașina'); await m.until(() => m.car && !m.car.broken); m.marker(null) }
    m.story.removeNpc(lilia)
    m.notify('Lilia s-a urcat lângă tine. Și-a scos carnețelul.', 2.6)
    const L = { name: 'Lilia', spec: CAST.jurnalista, voice: { pitch: 1.2, type: 'female' } }
    const graph = g.traffic.graph
    const mid = pathThrough(graph, [[4, 2], [6, 2], [6, 1], [7, 1]], { lane: 0, speed: 13 })
    const cut = mid.findIndex((q) => q.z < -130 && q.x > 350)
    const route = [
      { x: 11, z: RZ + 12, speed: 6 }, { x: 11, z: -28, speed: 8 }, { x: 13, z: -12, speed: 7, r: 5 }, { x: 20, z: 2.25, speed: 8, r: 5 }, { x: 40, z: 2.25, speed: 12 },
      ...mid.slice(0, cut > 0 ? cut : mid.length),
      { x: 358, z: -138.25, speed: 6, r: 4 }, { x: 361, z: -146, speed: 4, r: 3 }, { x: 361, z: -158, speed: 3, r: 2.5 },
    ]
    g.vehicles.clearSpot(361, -150, 10)
    const escRoute = route.map((q) => ({ ...q }))
    await m.wait(0.5)
    m.driver(esc, [{ x: 11, z: RZ + 20, speed: 7 }, ...escRoute.slice(1)], { speed: 13.5 })
    esc.siren = true
    await m.wait(0.8)
    const dGw = m.driver(gw, route, { speed: 13 })
    m.objective('Urmărește {y}cortegiul{/y}. Nu te apropia prea mult, nu-l pierde.', { sub: '' })
    let farT = 0, closeT = 0, said = 0
    const tail = m.every((dt) => {
      const d = dist(m.P, gw.pos)
      farT = d > 115 || !m.car ? farT + dt : Math.max(0, farT - dt)
      closeT = d < 14 && m.car ? closeT + dt : Math.max(0, closeT - dt * 0.5)
      if (farT > 12) m.fail('L-ai pierdut. Cortegiul a dispărut printre blocuri.')
      if (closeT > 4) m.fail('Te-au observat! Cortegiul a schimbat traseul.')
      const tag = d < 14 ? '{r}PREA APROAPE{/r}' : d > 90 ? '{r}ÎL PIERZI{/r}' : '{g}bine{/g}'
      m.sub(`Distanța: ${Math.round(d)} m · ${tag}`)
      if (d < 16 && said !== 1) { said = 1; m.task(() => m.talk(L, 'Mai încet, că ne vede!', 2)) }
      else if (d > 95 && said !== 2) { said = 2; m.task(() => m.talk(L, 'Nu-l pierde! Calcă!', 2)) }
      else if (d > 25 && d < 80) said = 0
    })
    const tailTalk = m.chatter([
      [8, L, 'Știi câte mașini are primăria? Nici eu. Nu-s în niciun registru.', 4],
      [10, L, 'Am scris despre el de trei ori. De trei ori mi-au închis site-ul. „Probleme tehnice."', 4.4],
      [10, L, 'Spre Ismail… spre ambasadă. Știam eu.', 3],
    ])
    await m.until(() => dGw.done || dist(gw.pos, route[route.length - 1]) < 4)
    m.untrack(tail)
    tailTalk.stop()
    m.sub('')
    // ---- at the embassy -------------------------------------------------------------------------
    m.objective('Oprește lângă gardul ambasadei și privește.', { sub: '' })
    await m.until(() => dist(m.P, gw.pos) < 50 && (!m.car || Math.abs(m.car.speed) < 2), { timeout: 40, onTimeout: 'Ai ratat momentul.' })
    await m.cutscene(async () => {
      const cx = 361, cz = m.places.ambasada_curte.z + 14
      const e2 = m.spawn('eban', 'eban', gw.pos.x - 1.8, gw.pos.z - 0.5, { voice: { pitch: 1.05, type: 'male' } })
      const mas = m.spawn('mascat', 'mascat', cx + 2, cz, { voice: { pitch: 0.7, type: 'gruff' } })
      m.face(mas, e2.pos.x, e2.pos.z)
      g.cameraRig.shot({ from: [cx - 16, 7.5, -150], to: [cx - 12, 6, -154], look: [cx, 1.2, (e2.pos.z + cz) / 2], dur: 12, ease: 'inout' })
      await m.walk(e2, cx - 0.4, cz + 1.4, { timeout: 7 })
      m.face(e2, mas.pos.x, mas.pos.z)
      e2.char.anim.play('pickup')
      await m.talk('eban', 'Vot. Vsio, kak dogovarivalis. Originalî.', 3)
      await m.talk('mascat', 'Kharașo. Poezd v piatnițu. I ni slova.', 3)
      await m.talk(L, 'Asta e. Dosare. Pleacă vineri, cu trenul. Da\' fără dovezi e cuvântul nostru contra lui.', 4.6)
    })
    await m.say(L, [
      'Tu ai găsit deja un dosar în taxi? Bun. Păstrează-l. Ne trebuie mai multe: martori, poze, acte.',
      'Începe cu gopnicii din curtea ta. Ei văd fiecare mașină care intră și iese din cartier.',
      'Eu stau în PMAN, la „Ochiul Chișinăului". Ai grijă de tine.',
    ])
  },
}
