import { pathThrough } from '../Kit.js'
import { dist, banner, crowd, cheerAll, clamp } from './common.js'

const CH4 = 'Capitolul 4'

function stage(m, { X = 0, Z = -86.5, slogan = 'EBAN = STABILITATE' } = {}) {
  m.prop((b) => {
    b.box(1.0, 1.15, 0.6, { x: 0, y: 0, z: 1.0, color: 0x3a2a24 })
    b.box(1.1, 0.08, 0.7, { x: 0, y: 1.15, z: 1.0, color: 0x5a4034 })
    b.box(0.3, 0.3, 0.02, { x: 0, y: 0.6, z: 1.31, color: 0xd9a93a })
    for (const s of [-1, 1]) b.cyl(0.06, 0.06, 4.2, 8, { x: s * 4.2, y: 0, z: -2.6, color: 0x8a8a8a })
    b.box(9, 0.02, 5, { x: 0, y: 0.01, z: 0, color: 0x7a1016 })
  }, { x: X, z: Z })
  banner(m, slogan, { x: X, y: 3.4, z: Z - 2.6, w: 8, h: 1.4, bg: '#1f3f8a', fg: '#ffd84a' })
}

// =============================================================================
// Cap. 4 · Mitingul — the unmasking in PMAN
export const mitingul = {
  id: 'mitingul', chapterName: CH4, title: 'Mitingul',
  desc: 'Eban face „miting de sprijin" în PMAN. Tu vii cu martorii, dovezile și presa. În fața la toată lumea.',
  giver: { npc: 'lilia', label: 'Lilia (PMAN)' },
  intro: ['CAPITOLUL 4', 'DEMASCAREA', 'Adevărul spus în piață e greu de îngropat.'],
  next: 'auto', silentPass: true,
  async script(m) {
    const g = m.game, p = m.player
    const n = (g.progress.flags.dovezi || []).length
    const c = await m.say('lilia', [
      `Ai tot? Filmarea lui Vitea, actul cadastral, SIM-ul, pozele din beci… ${n} dovezi. Bun.`,
      'Primarul face acum miting de „sprijin popular", aici. Eu transmit live. Tu urci și spui tot. Cu martori.',
      'Am vorbit cu toți: Tanti Zina, Vitea, Borea, omul din parc. Și Căldare… el a zis „vedem".',
    ], { choices: ['Hai să terminăm cu asta.', 'Mai am o treabă. Revin.'] })
    if (c === 1) { await m.say('lilia', ['Nu întârzia. Mitingurile lui țin cât o panglică.']); m.cancel() }
    // ---- set the stage --------------------------------------------------------------------------------
    await m.fade(1, 600)
    m.tod(19.4)
    g.police.clear()
    const X = 0, Z = -86.5
    stage(m, { X, Z })
    banner(m, 'LUCRĂM LA ASTA', { x: -12, y: 2.8, z: -83, ry: 0.5, w: 4.6, h: 0.9, bg: '#b0181e', fg: '#fff' })
    const eban = m.spawn('eban', 'eban', X, Z, { ry: 0, voice: { pitch: 1.05, type: 'male' } })
    const gA = m.spawn(null, 'mascat', X - 3.2, Z - 1, { ry: 0 })
    const gB = m.spawn(null, 'mascat', X + 3.2, Z - 1, { ry: 0 })
    const people = crowd(m, X, Z + 9, 14, { r0: 2.5, r1: 8, a0: 0.25, a1: Math.PI - 0.25, face: { x: X, z: Z } })
    const W = {
      zina: m.spawn('zina', 'zina', X - 7.5, Z + 6.2, { ry: Math.PI, voice: { pitch: 1.3, type: 'old' } }),
      vitea: m.spawn('vitea', 'gopnik1', X - 4.6, Z + 6.8, { ry: Math.PI }),
      borea: m.spawn('borea', 'borea', X + 4.6, Z + 6.8, { ry: Math.PI }),
      profet: m.spawn('profet', 'profet', X + 7.5, Z + 6.2, { ry: Math.PI }),
    }
    const lilia = m.spawn('lilia', 'jurnalista', X + 10.5, Z + 4, { ry: -2.2, voice: { pitch: 1.2, type: 'female' } })
    const gw = m.vehicle('gwagon', X - 13, Z + 1, 0, { color: 0x0c0c0e, persist: true })
    gw.locked = true
    const pol = m.vehicle('police', X + 13, Z + 3, 0, { persist: true })
    pol.locked = true
    m.teleport(X, Z + 9.5, Math.PI)
    await m.wait(0.3)
    await m.fade(0, 700)
    // ---- the rally --------------------------------------------------------------------------------------
    await m.cutscene(async () => {
      g.cameraRig.shot({ from: [X + 12, 4.5, Z + 18], to: [X + 6, 3.2, Z + 12], look: [X, 1.5, Z], dur: 11, ease: 'inout' })
      eban.char.anim.set('talk')
      await m.talk('eban', 'Dragi chișinăuieni! Mulțumesc pentru sprijin! Voi ați venit singuri, nimeni nu v-a plătit!', 4)
      cheerAll(people.slice(0, 5))
      await m.talk('eban', '…Autobuzele înapoi pleacă la ora opt. Nu întârziați, că nu vă mai dăm pachetul.', 3.8)
      await m.talk({ name: 'Cineva din mulțime' }, 'Pachetul e cu salam?', 2)
      await m.talk('eban', 'Chișinăul merge înainte! Avem planuri mari! Lucrăm la asta!', 3.4)
      // the hero steps forward
      g.cameraRig.shot({ from: [X - 4, 1.8, Z + 13], look: [X, 1.4, Z + 4], dur: 5, ease: 'out' })
      await m.playerWalk(X, Z + 4.2, 1.8)
      m.face(p.char, X, Z)
      await m.talk('player', 'Domnule primar! Am niște întrebări. Și niște răspunsuri.', 3.2)
      g.cameraRig.shot({ from: [X + 2.5, 1.9, Z + 3.5], look: [X, 1.55, Z], dur: 5, ease: 'out' })
      await m.talk('eban', 'Cine-i ăsta? Paza! …Ah, presa filmează. Bine, bine. Spune, tinere. Suntem o democrație.', 4.2)
      // accusers, one by one
      const turn = async (id, text, pose = 'point') => {
        const w = W[id]
        g.cameraRig.shot({ from: [w.pos.x + (w.pos.x < X ? 1.6 : -1.6), 1.75, w.pos.z - 3.1], to: [w.pos.x + (w.pos.x < X ? 1.2 : -1.2), 1.7, w.pos.z - 2.7], look: [w.pos.x, 1.45, w.pos.z], dur: 7, ease: 'out' })
        w.char.anim.play(pose)
        await m.say(id, [text], { noTalk: true })
        eban.char.mesh.scale.multiplyScalar(0.975)
      }
      await turn('zina', 'Io ți-am zis de la bun început, maică. Primarul ăsta vorbește prea des la telefon… în rusă. Și oamenii lui m-au răpit. Cu G-Wagonul ăla.')
      await turn('vitea', 'Bratan, mașina ceea neagră a lui merge napastoi la ambasadă. În fiecare seară. Avem și filmare, jostko.')
      await turn('borea', 'Hârtiile pe care le-am cărat la Gară, crezând că-i vin? Erau dosarele orașului. Parcuri, clădiri, circul. Vândute pe un leu.')
      await turn('profet', 'Matrioșca sub coloană… telefonul care sună noaptea… beciul unde nu intră nimeni. Io vă spun de ani de zile, da\' mă credeați nebun. Acu vedeți?', 'shrug')
      // Căldare turns up
      const cal = m.spawn('caldare', 'caldare', X + 20, Z + 14, { voice: { pitch: 0.8, type: 'gruff' } })
      g.cameraRig.shot({ from: [X + 14, 2.2, Z + 10], look: [X + 9, 1.4, Z + 6], dur: 7, ease: 'out' })
      await m.walk(cal, X + 9.5, Z + 5.5, { timeout: 6 })
      m.face(cal, X, Z)
      await m.say('caldare', [
        'Stop. Documentele. Tu cine ești, bre, să acuzi primarul în plină piață?',
        '…Stai. Asta-i semnătura lui. Pe toate hârtiile. Pe toate. Și cartela a sunat la Moscova de patruzeci și șapte de ori.',
        'Io… io sunt cu oamenii. Davai, dați-vă la o parte.',
      ])
      eban.char.mesh.scale.multiplyScalar(0.96)
      g.cameraRig.shot({ from: [X - 3.1, 1.85, Z + 7.4], look: [X + 0.4, 1.45, Z], dur: 6, ease: 'out' })
      await m.talk('player', 'Și dosarul uitat în taxiul meu: „Proiectul Beznă". Semnat de mâna lui. Negru pe alb, oameni buni.', 4.4)
      // the question
      g.cameraRig.shot({ from: [X + 6, 3, Z + 14], look: [X, 1.2, Z + 3], dur: 20, ease: 'inout' })
      let pick = -1
      while (pick !== 0) {
        pick = await m.choose('player', 'Scoți toate hârtiile pe masă, în fața lumii. Cine ține Chișinăul în beznă?', [
          'Ceon Eban, omul Moscovei.', 'Deputații, ca de obicei.', 'Gropile. Gropile sunt de vină.',
        ])
        if (pick === 1) await m.say('borea', ['Nu, bratan. Uită-te la semnătură. E Eban.'])
        if (pick === 2) await m.say('zina', ['Gropile n-au semnătură, maică. El are.'])
      }
      g.audio?.sting('unmask')
      g.ui.bigMessage('DEMASCAT', 'Ceon Eban, primarul care „lucra la asta"', { secs: 3.4 })
      cheerAll(people)
      g.cameraRig.shake(0.2)
      await m.wait(1.2)
      await m.talk('zina', 'Așa-i, am văzut și io!', 1.8)
      await m.talk('vitea', 'Confirm, bratan.', 1.6)
      await m.talk('borea', 'Io v-am spus.', 1.6)
      await m.talk('profet', 'În sfârșit mă crede cineva!', 2)
      await m.talk({ name: 'Mulțimea' }, 'Hoțu\'! Spionu\'! Afară cu el!', 2.4)
      g.cameraRig.shot({ from: [X - 4, 2, Z + 4], look: [gw.pos.x, 1.2, gw.pos.z], dur: 6, ease: 'out' })
      await m.talk('eban', 'Cortegiul mă așteaptă. Paka, fraierilor!', 2.6)
      m.walk(eban, gw.pos.x + 1.9, gw.pos.z + 0.4, { run: true, timeout: 4 }).catch(() => {})
      await m.wait(1.6)
    })
    // hand the scene over to the chase
    if (m.story.npcs.includes(eban)) m.story.removeNpc(eban)
    for (const x of [gw, pol, lilia, gA, gB, ...people, ...Object.values(W)]) m.detach(x)
    const cal = m.story.temp.caldare
    if (cal) m.detach(cal)
    m.story.handoff = { gw, pol, cal, npcs: [lilia, gA, gB, ...people, ...Object.values(W)] }
    g.progress.flags.demascat = true
  },
}

// =============================================================================
// Cap. 4 · Cortegiul — the final chase; takedown meter; the pothole he never fixed
export const cortegiul = {
  id: 'cortegiul', chapterName: CH4, title: 'Cortegiul',
  desc: 'Eban fuge cu G-Wagonul. Tu ai mașina lui Căldare și un oraș întreg de gropi de partea ta.',
  giver: { place: 'pman', label: 'PMAN', auto: true, r: 14 },
  startText: 'Eban a fugit! Întoarce-te în {y}PMAN{/y} și ia-o de la capăt.',
  reward: { xp: 800, cred: 20, civic: 25 },
  next: 'auto',
  passTitle: 'PRINS!', passText: 'Ceon Eban, la răcoare. Normalno.',
  chapterEnd: 'CAPITOLUL 4 · ÎNCHEIAT', chapterEndText: 'Orașul respiră. Gropile rămân. Deocamdată.',
  async script(m) {
    const g = m.game, p = m.player
    const X = 0, Z = -86.5
    const h = m.story.handoff
    m.story.handoff = null
    let gw, pol, cal
    if (h) {
      gw = m.adoptVehicle(h.gw); pol = m.adoptVehicle(h.pol); cal = m.adoptNpc(h.cal)
      for (const n of h.npcs) m.adoptNpc(n)
      if (cal) m.story.temp.caldare = cal
      m.every(() => { for (const n of h.npcs) if (n.crowd && n.state === 'idle' && Math.random() < 0.004) n.walkTo(n.pos.x + (Math.random() - 0.5) * 30, n.pos.z + 12 + Math.random() * 20) })
    } else {
      m.tod(19.8)
      gw = m.vehicle('gwagon', X - 13, Z + 1, 0, { color: 0x0c0c0e })
      pol = m.vehicle('police', X + 13, Z + 3, 0)
      cal = m.spawn('caldare', 'caldare', X + 10.5, Z + 5, { voice: { pitch: 0.8, type: 'gruff' } })
      if (dist(p.pos, pol.pos) > 25) m.teleport(X + 9, Z + 9, Math.PI)
    }
    gw.locked = true; gw.health = 100; gw.broken = false
    pol.locked = false; pol.health = 100; pol.broken = false
    if (cal) { m.face(cal, p.pos.x, p.pos.z); cal.char.anim.play('point') }
    await m.talk('caldare', 'Ia mașina mea! Sirena e pe butonul roșu! Io vin după tine cu restul!', 3.2)
    m.objective('Urcă în {y}mașina de poliție{/y}!')
    m.marker(pol.pos, 'Mașina lui Căldare')
    // Eban drives off after a short head start either way
    const graph = g.traffic.graph
    const loop = pathThrough(graph, [[3, 2], [2, 2], [2, 3], [5, 3], [5, 2], [3, 2]], { loop: true, lane: 1, speed: 21 })
    const prefix = [{ x: gw.pos.x, z: Z + 14, speed: 9 }, { x: gw.pos.x, z: -34, speed: 12 }, { x: gw.pos.x, z: -22, speed: 10 }, { x: gw.pos.x - 6, z: -8, speed: 9, r: 5 }, { x: gw.pos.x - 18, z: -5.75, speed: 15 }]
    const startIn = m.t + 7
    await m.until(() => m.car === pol || m.t > startIn)
    const drv = m.driver(gw, [...prefix, ...loop], { speed: 21, loop: true, loopFrom: prefix.length, avoid: true })
    await m.until(() => m.car === pol || m.t > startIn + 20, { timeout: 40, onTimeout: 'Eban a scăpat. Ai stat prea mult pe gânduri.' })
    if (m.car !== pol) m.notify('Ai luat altă mașină. Merge și așa!', 2.4)
    m.marker(null)
    pol.siren = true
    if (g.progress.flags.nitro) m.tip('{y}[⇧]{/y} Nitro! Borea ți l-a montat „aproape legal".', 6)
    m.tip('Lovește G-Wagonul cu mașina până îl oprești. {y}Nu-l pierde!{/y}', 7)
    // ---- the chase ---------------------------------------------------------------------------------------
    const off = g.events.on('player:crash', (e) => { if (e.other === gw && !gw.broken) { gw.damage(7 + e.force * 0.28); g.cameraRig.shake(0.35); g.audio?.sfx('metal_hit', { vol: 1 }) } })
    m.track({ dispose: off })
    const bar = (v) => { const k = Math.round(clamp(v, 0, 100) / 10); return '▰'.repeat(k) + '▱'.repeat(10 - k) }
    let lostT = 0, noCarT = 0, escorts = false
    const chase = m.every((dt) => {
      const d = dist(m.P, gw.pos)
      lostT = d > 210 ? lostT + dt : Math.max(0, lostT - dt)
      noCarT = !m.car || m.car.broken ? noCarT + dt : 0
      if (lostT > 10) m.fail('Eban a scăpat… deocamdată.')
      if (noCarT > 20) m.fail('Fără mașină nu-l mai prinzi.')
      drv.speedMul = d > 80 ? 0.84 : d < 18 ? 1.08 : 1
      m.sub(`G-Wagon: {r}${bar(gw.health)}{/r} ${Math.round(gw.health)}% · distanța ${Math.round(d)} m`)
      if (!escorts && m.t > startIn + 12) {
        escorts = true
        for (let k = 0; k < 2; k++) {
          const e = graph.nearestEdge(m.P.x - Math.sin(m.car ? m.car.heading : 0) * (40 + k * 12), m.P.z - Math.cos(m.car ? m.car.heading : 0) * (40 + k * 12))
          const lp = graph.lanePoint(e.edge, Math.min(k, e.edge.lanes - 1), e.t)
          const esc = m.vehicle('logan', lp.x, lp.z, Math.atan2(e.edge.fx, e.edge.fz), { color: 0x101012 })
          esc.locked = true
          m.chaser(esc, () => { const t = m.car || m.player; return { x: t.pos.x, z: t.pos.z } }, { speed: 24 })
        }
        m.notify('{r}Escorta lui Eban vine după tine!{/r} Mașini negre, fără numere.', 3.4, 'red')
      }
    })
    m.objective('{r}Oprește-l pe Eban!{/r} Izbește G-Wagonul până cedează.')
    const radio = m.chatter([
      [10, 'eban', '(la telefon) Vasili Petrovici! Mă urmăresc! Trimiteți pe cineva!', 3.4],
      [14, { name: 'Radio poliție' }, '„Toate echipajele: G-Wagon negru, primarul la volan. Nu, nu glumesc."', 4],
      [16, 'eban', 'Voi nu înțelegeți! Eu… eu lucram la asta!', 2.8],
    ])
    await m.until(() => gw.health <= 12 || gw.broken)
    m.untrack(chase)
    radio.stop()
    drv.done = true
    gw.broken = true
    g.audio?.sting('takedown')
    g.ui.bigMessage('TAKEDOWN!', '', { secs: 1.6 })
    await m.wait(1.2)
    // ---- the pothole he never fixed ---------------------------------------------------------------------------
    await m.fade(1, 500)
    const C = { x: -93, z: -5.75 }
    g.vehicles.clearSpot(C.x, C.z, 32)
    for (const d of [...g.traffic.drivers]) if (d.v && !d.v.def.trolley && dist(d.v.pos, C) < 45) g.traffic.despawn(d)
    m.prop((b) => {
      b.cyl(3.6, 3.2, 0.03, 24, { y: 0.012, color: 0x0b0b0c })
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.box(0.9, 0.22, 0.6, { x: Math.cos(a) * 3.9, y: 0, z: Math.sin(a) * 3.7, ry: a, color: 0x3a3b3f }) }
    }, { x: C.x, z: C.z })
    gw.teleport(C.x + 1.2, 0.5, C.z, -Math.PI / 2)
    gw.pose = { pitch: 0.45, dy: -0.95 }
    gw.throttle = 0; gw.handbrake = true
    const mine = m.car || pol
    if (p.vehicle) g.vehicles.exit(true)
    mine.teleport(C.x + 17, 0.5, C.z - 1.5, -Math.PI / 2)
    mine.siren = true
    m.teleport(C.x + 11, C.z - 3.5, -Math.PI / 2)
    await m.wait(0.4)
    await m.fade(0, 700)
    await m.cutscene(async () => {
      g.cameraRig.shot({ from: [C.x + 9, 3.6, C.z + 9], to: [C.x + 6, 2.6, C.z + 7], look: [C.x - 0.5, 0.5, C.z], dur: 9, ease: 'inout' })
      await m.wait(1.4)
      const e = m.spawn('eban', 'eban', C.x + 1.5, C.z - 2.4, { voice: { pitch: 1.05, type: 'male' } })
      e.knockDown(0.5, -1, 1.2, 1)
      await m.wait(1.6)
      await m.talk('eban', 'Groapa asta… trebuia astupată în 2019…', 3)
      const c2 = m.spawn('caldare2', 'caldare', C.x + 24, C.z - 12, { voice: { pitch: 0.8, type: 'gruff' } })
      const c3 = m.spawn(null, 'cop', C.x + 26, C.z - 10)
      c2.speed = 2.2
      g.cameraRig.shot({ from: [C.x + 7.5, 2.0, C.z + 4.5], look: [C.x + 2, 1.1, C.z - 2.5], dur: 12, ease: 'out' })
      m.walk(c3, C.x + 3.8, C.z - 3.8, { run: true }).catch(() => {})
      await m.walk(c2, C.x + 3, C.z - 2.8, { run: true, timeout: 7 })
      m.face(c2, e.pos.x, e.pos.z)
      e.state = 'handsup'
      await m.say({ ...m.speaker('caldare') }, [
        'Gata, dom\' primar. Cu propriile lui hârtii l-am prins. La răcoare, normalno.',
        'Ceon Eban, sunteți reținut pentru trădare, delapidare și… pentru groapa asta. Mai ales pentru groapa asta.',
      ])
      await m.talk('eban', 'Voi nu înțelegeți! Eu lucram la asta! Lucram la asta!', 2.8)
      const l2 = m.spawn('lilia2', 'jurnalista', C.x + 8, C.z - 6, { voice: { pitch: 1.2, type: 'female' } })
      m.face(l2, C.x, C.z)
      l2.char.anim.set('talk')
      g.cameraRig.shot({ from: [C.x + 5.6, 1.65, C.z - 3.4], to: [C.x + 6, 1.65, C.z - 3.7], look: [l2.pos.x, 1.5, l2.pos.z], dur: 7, ease: 'out' })
      await m.talk({ ...m.speaker('lilia') }, 'Și asta a fost, dragi telespectatori. Groapa pe care a promis-o zece ani… l-a înghițit.', 4.4)
      const pd = Math.atan2(C.x - p.pos.x, C.z - p.pos.z)
      m.face(p.char, C.x, C.z)
      g.cameraRig.shot({ from: [p.pos.x + Math.sin(pd) * 2.4 - Math.cos(pd) * 0.9, 1.7, p.pos.z + Math.cos(pd) * 2.4 + Math.sin(pd) * 0.9], look: [p.pos.x, 1.5, p.pos.z], dur: 4, ease: 'out' })
      await m.talk('player', 'Lucrăm la asta.', 2.2)
      m.walk(e, C.x + 40, C.z - 16).catch(() => {})
      m.walk(c2, C.x + 40, C.z - 15).catch(() => {})
      await m.wait(1.2)
    })
    g.progress.flags.eban = 'arestat'
  },
}

// =============================================================================
// EPILOG · Alegerile — election night, the first decree, credits
export const alegeri = {
  id: 'alegeri', chapterName: 'Epilog', title: 'Alegerile',
  desc: 'O lună mai târziu. Orașul are nevoie de un primar. Și cineva trebuie să astupe gropile.',
  giver: { place: 'pman', label: 'PMAN', auto: true, r: 14 },
  intro: ['EPILOG', 'ALEGERILE', 'O lună mai târziu.'],
  silentPass: true,
  async script(m) {
    const g = m.game, p = m.player, pr = g.progress
    await m.fade(1, 500)
    m.tod(20.3)
    g.police.clear()
    const X = 0, Z = -86.5
    stage(m, { X, Z, slogan: `${pr.name.toUpperCase()} · PRIMAR` })
    const people = crowd(m, X, Z + 10, 18, { r0: 3, r1: 10, a0: 0.2, a1: Math.PI - 0.2, face: { x: X, z: Z } })
    const row = [['zina', 'zina'], ['vitea', 'gopnik1'], ['borea', 'borea'], ['profet', 'profet'], ['caldare', 'caldare'], ['vova', 'mecanic'], ['nelu', 'gunoier']]
    const W = {}
    row.forEach(([id, spec], i) => { W[id] = m.spawn(id, spec, X - 9 + i * 3, Z + 6.5 + (i % 2) * 0.6, { ry: Math.PI }) })
    const lil = m.spawn('lilia', 'jurnalista', X + 6, Z + 2, { ry: -1.9, voice: { pitch: 1.2, type: 'female' } })
    m.teleport(X, Z + 0.2, 0)
    await m.wait(0.3)
    await m.fade(0, 900)
    await m.cutscene(async () => {
      g.cameraRig.shot({ from: [X + 14, 6, Z + 22], to: [X + 6, 3, Z + 12], look: [X, 1.6, Z], dur: 12, ease: 'inout' })
      lil.char.anim.set('talk')
      await m.talk('lilia', 'Ultima oră! Alegeri anticipate la Chișinău. Cu 71 la sută din voturi, noul primar al capitalei este…', 4.6)
      await m.talk('lilia', `…un om care a venit acasă după pâine și a rămas să facă ordine: ${pr.name}!`, 3.6)
      cheerAll(people); cheerAll(Object.values(W))
      g.audio?.sfx('applause', { vol: 1 })
      for (let i = 0; i < 4; i++) setTimeout(() => g.fx?.confetti(X + (Math.random() - 0.5) * 12, 4 + Math.random() * 3, Z + 4 + Math.random() * 8, 80), i * 500)
      const need = Math.max(0, 5200 - pr.xp)
      if (need) pr.addXp(need, 'Ales primar')
      await m.wait(2.4)
      g.cameraRig.shot({ from: [X + 1.8, 1.8, Z + 3.4], look: [X, 1.5, Z], dur: 30, ease: 'out' })
      const d = await m.choose('player', 'Primul tău decret, domnule primar:', ['Astupăm toate gropile. Toate. De mâine.', 'Lumină pe fiecare stradă. Gata cu bezna.', 'Troleibuze noi. Pe bune, nu din 1978.'])
      pr.flags.decret = d
      if (d === 0) await m.say('borea', ['Și io unde mă mut?!', { who: 'zina', text: 'Lasă, maică, îți facem loc la noi pe bancă.' }])
      else if (d === 1) await m.say('profet', ['Lumina! Acum văd tot. Și nu-mi place ce văd. Glumesc. Glumesc.'])
      else await m.say('vova', ['Și dacă se strică, le repar io. Preț de prieten: tot ăla.'])
      await m.say('caldare', ['Și dom\' primar… dacă vorbiți la telefon, vorbiți în română, da?', { who: 'player', text: 'Normalno.' }])
      cheerAll(people)
      // credits over the city
      const shots = [
        { from: [X + 20, 14, Z + 30], to: [X + 40, 40, Z + 70], look: [X, 2, Z] },
        { from: [-120, 45, 60], to: [60, 45, 40], look: [0, 5, 20] },
        { from: [260, 30, 80], to: [180, 36, 10], look: [240, 3, 60] },
        { from: [-60, 70, 260], to: [60, 70, 200], look: [0, 5, 170] },
      ]
      let k = 0
      const next = () => { if (k >= shots.length) return; const s = shots[k++]; g.cameraRig.shot({ ...s, dur: 10, ease: 'inout', onEnd: next }) }
      next()
      await g.ui.credits([
        { big: 'CHIȘINĂU RUSH' },
        { h: 'O SATIRĂ DESPRE UN ORAȘ CU O SUTĂ DE GROPI' },
        `În rolul principal: ${pr.name}`,
        'Tanti Zina · Vitea și băieții · Borea Țigan · Omul din parc',
        'Sergent Căldare · Lilia · Vova · Nelu Gunoierul · Nea Grișa',
        'și Ceon Eban, în rolul groapei',
        { h: 'IDEE ȘI PRODUCȚIE' }, 'Dan Colta',
        { h: 'MOTOR' }, 'Three.js · Rapier · postprocessing · N8AO · Vite',
        { h: 'ASSET-URI (CC0)' }, 'KayKit City Builder Bits (Kay Lousberg)', 'Kenney: sunete și texturi',
        { h: 'FONTURI' }, 'Bungee · Bangers · Paytone One · Rubik',
        { h: 'MULȚUMIRI SPECIALE' }, 'Tuturor gropilor din Chișinău, fără de care jocul n-ar fi fost posibil.',
        { h: '' }, 'Orice asemănare cu primari reali e… lucrăm la asta.',
      ], 40)
    })
    await m.fade(1, 400)
    for (const c of people) c.state = 'idle'
    m.teleport(X + 3, Z + 12, Math.PI)
    await m.wait(0.3)
    await m.fade(0, 700)
    g.audio?.sting('mission_pass')
    await g.ui.bigMessage('JOC LIBER', 'Chișinăul e al tău. Taxi, curse, gropi, dosare… primăria te așteaptă.', { secs: 4 })
  },
}
