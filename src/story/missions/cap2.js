import { KIOSK_MENU } from '../../data/shops.js'
import { gen } from '../hero.js'
import { dist, runRace } from './common.js'

const CH2 = 'Capitolul 2'

// =============================================================================
// Cap. 2 · Cursa gopnicilor — win a street race, get the first witness
export const cursa = {
  id: 'cursa', chapterName: CH2, title: 'Cursa gopnicilor',
  desc: 'Gopnicii din curte știu ce mașini negre umblă noaptea. Nu zic nimic gratis: întâi o cursă.',
  giver: { npc: 'vitea', label: 'Vitea' },
  intro: ['CAPITOLUL 2', 'FIRUL', 'Fiecare om din oraș știe o bucată. Nimeni nu știe tot.'],
  reward: { lei: 100, xp: 350, cred: 15 },
  async script(m) {
    const g = m.game, p = m.player
    const i = await m.say('vitea', [
      'Mașinile negre? Da, bratan, le vedem. În fiecare seară. Da\' informația costă.',
      'Hai o cursă: tu și băieții mei, un tur de cartier. Câștigi, îți zic tot. Pierzi, ne dai o siga. Un pachet.',
    ], { choices: ['Davai. Unde-i startul?', 'Mai încolo.'] })
    if (i === 1) { await m.say('vitea', ['Normalno. Noi tot aici stăm. Ca de obicei.']); m.cancel() }
    const startPos = { x: 114, z: 271.75 }
    if (!m.car) {
      const car = m.needCar(-55.25, 212, Math.PI, 'logan')
      if (dist(car.pos, p.pos) > 30) await m.say('vitea', ['N-ai mașină? Ia Loganul lui văru-meu, e pe Bănulescu-Bodoni. Da\' dacă-l zgârii, ne vedem.'])
      m.objective('Urcă într-o mașină. Loganul lui Gena e pe {y}Bănulescu-Bodoni{/y}.')
      m.marker(car.pos, 'Loganul')
      await m.until(() => m.car)
      m.marker(null)
    }
    await m.reach(startPos, 12, { text: 'Du-te la linia de start, pe {y}strada Alexandru cel Bun{/y} (cu mașina).', label: 'Start', inVehicle: true })
    const res = await runRace(m, {
      nodes: [[4, 4], [5, 4], [5, 3], [3, 3], [3, 4], [4, 4]], laps: 1, car: m.car, lapTime: 110, name: 'Cursa gopnicilor',
      rivals: [{ kind: 'jiguli', color: 0x9a1c1c, speed: 22.5, name: 'Vitea' }, { kind: 'logan', color: 0x16161a, speed: 21, name: 'Gena' }],
    })
    if (!res.won) m.fail(res.place > 3 ? 'Prea încet, bratan. Gopnicii au terminat semințele până ai ajuns.' : 'Ai pierdut cursa. Vitea râde de tine tot cartierul.')
    g.progress.stats.races++
    g.audio?.sting('race_win')
    await m.wait(1.2)
    // ---- Vitea talks ----------------------------------------------------------------------------
    await m.cutscene(async () => {
      const v = m.car
      if (v) { v.throttle = 0; v.handbrake = true }
      const pos = v ? v.pos : p.pos
      const vit = m.spawn('vitea', 'gopnik1', pos.x + 3, pos.z - 2.5, { voice: { pitch: 1, type: 'gruff' } })
      m.face(vit, pos.x, pos.z)
      m.hold({ from: [pos.x + 6.5, 2.4, pos.z - 6], look: [vit.pos.x, 1.3, vit.pos.z], dur: 60 })
      await m.say('vitea', [
        'Jostko, bratan! Ai inimă, nu glumă. Și volanu\' îl ții ca pe o siga: sigur.',
        'Ascultă: mașina neagră a primarului, G-Wagonul ăla, merge napastoi la ambasadă. În fiecare seară. Ca la serviciu.',
        'Și Borea — Borea Țigan, din Grădina Publică — el încarcă marfa. Cutii. Multe. Le duce la Gară.',
        'Uite, am filmat cu telefonul. Da\' să nu zici că de la noi, că-ți fărâm oasele amuș. Cu respect.',
      ])
    })
    await m.evidence('filmare_vitea', 'Filmarea lui Vitea', 'Un telefon ținut strâmb, noaptea: {y}G-Wagonul primarului{/y} intră în curtea {y}ambasadei{/y}. Din portbagaj se descarcă {y}cutii{/y}. Se aude: „bratan, filmează, filmează!"')
  },
}

// =============================================================================
// Cap. 2 · Babanul lui Borea — "wine" to the railway station, under police heat
export const borea = {
  id: 'borea', chapterName: CH2, title: 'Babanul lui Borea',
  desc: 'Borea Țigan îți dă o ladă cu „vin" de dus la Gară. Cineva îi toarnă pe gabori. Și în ladă nu-i vin.',
  giver: { npc: 'borea', label: 'Borea Țigan' },
  reward: { lei: 90, xp: 350 },
  async script(m) {
    const g = m.game, p = m.player
    await m.say('borea', [
      'Băi, tu pe mine a sculat? Știu de ce-ai venit. Vitea are gura mare.',
      'Vrei să știi ce car eu? Hai, lucrezi o zi la mine și vezi singur.',
      'Ține babanu\' ăsta. Du-l la Gară, la dubița albă de lângă peron. Și fugi de gabori, auzi, bratan? Io-ți dau bani pe urmă.',
    ])
    const bor = m.story.cast.borea
    const crate = m.pickup((bor ? bor.pos.x : 154) + 2.4, (bor ? bor.pos.z : 114) - 1.2, { kind: 'baban', r: 1.8 })
    m.vehicle('jiguli', 150, 145.25, Math.PI / 2, { color: 0x2f5a3a, persist: true })
    m.objective('Ia {y}lada cu baban{/y}.')
    m.marker({ x: crate.x, z: crate.z }, 'Lada')
    await m.until(() => crate.near(p.pos) && !p.vehicle)
    m.untrack(crate)
    g.audio?.sfx('pickup', { bus: 'ui' })
    m.notify('Ai luat lada. E grea. Și… foșnește? Vinul nu foșnește.', 3.2, 'gold')
    m.tip('Dacă te lovești tare cu mașina, lada se sparge. Condu ca la nuntă.', 7)
    // ---- deliver it -------------------------------------------------------------------------------
    const drop = { x: 306, z: 278.8 }
    const van = m.vehicle('rutiera', 297, 274.75, Math.PI / 2, { color: 0xe8e8e8 })
    van.locked = true
    const mas = m.spawn('mascat', 'mascat', drop.x + 1.5, drop.z + 0.6, { ry: -Math.PI / 2 })
    m.objective('Du lada la {y}dubița de la Gară{/y}.', { sub: 'Borea și-a lăsat Jiguliul verde peste drum.' })
    m.marker(drop, 'Dubița')
    let hits = 0
    let lastHit = 0
    const off = g.events.on('player:crash', (e) => {
      if (e.force < 30 || m.t - lastHit < 1.2) return
      lastHit = m.t
      hits++
      if (hits === 1) m.notify('{r}Lada a crăpat!{/r} Mai ai două bușituri până se sparge.', 3, 'red')
      else if (hits === 2) m.notify('{r}Lada abia se mai ține!{/r} Încă una și s-a zis cu ea.', 3, 'red')
      else m.fail('Ai spart lada. Borea o să te caute. Cu tot neamul.')
    })
    m.track({ dispose: off })
    await m.until(() => dist(m.P, bor ? bor.pos : m.places.borea) > 90)
    g.police.setLevel(2)
    g.audio?.sfx('siren_whoop', { vol: 0.9 })
    m.notify('{r}Cineva a turnat!{/r} Poliția știe de ladă.', 3.5, 'red')
    m.sub('{r}Scapă de poliție înainte de predare.{/r} Mascatul nu iese cu gaborii după tine.')
    let warned = false
    await m.until(() => {
      const near = dist(m.P, drop) < 11
      if (near && g.police.level > 0 && !warned) { warned = true; m.task(() => m.talk('mascat', 'Cu gaborii după tine?! Scapă de ei întâi!', 2.6)) }
      if (!near) warned = false
      return near && g.police.level === 0 && (!m.car || Math.abs(m.car.speed) < 2)
    })
    m.marker(null)
    // ---- the crate breaks ------------------------------------------------------------------------------
    await m.cutscene(async () => {
      if (p.vehicle) g.vehicles.exit(true)
      p.teleport(drop.x - 1.4, 0.16, drop.z, Math.PI / 2)
      m.face(mas, p.pos.x, p.pos.z)
      const box = m.prop((b) => { b.box(0.62, 0.42, 0.46, { color: 0x8a6a44 }); b.box(0.64, 0.05, 0.48, { y: 0.2, color: 0x5a4028 }) }, { x: drop.x, z: drop.z + 0.1, y: 0.18 })
      m.hold({ from: [drop.x - 3.5, 1.8, drop.z - 3.6], look: [drop.x, 0.8, drop.z], dur: 60 })
      await m.talk('mascat', 'Dă-ncoace. Și să n-o scapi…', 2.2)
      mas.char.anim.play('pickup')
      await m.wait(0.6)
      m.untrack(box)
      g.audio?.sfx('glass', { at: mas.pos, vol: 1 })
      g.fx?.paper(drop.x, 0.6, drop.z, 26)
      g.cameraRig.shake(0.2)
      await m.wait(0.8)
      await m.talk('player', 'Ăsta nu-i vin. Sunt… dosare. Cu ștampila Primăriei.', 3.2)
      await m.talk('mascat', 'N-ai văzut nimic. Pleacă. Acum.', 2.4)
      // he jogs to the van's side door and climbs in
      const door = { x: van.pos.x - Math.cos(van.heading) * 1.7, z: van.pos.z + Math.sin(van.heading) * 1.7 }
      m.hold({ from: [drop.x + 3, 2.4, drop.z - 6.8], look: [door.x + 1.5, 1.2, door.z + 0.6], dur: 60 })
      await m.walk(mas, door.x, door.z, { run: true, timeout: 5 })
      g.audio?.sfx('door', { at: van.pos, vol: 0.8 })
      mas.ride(van)
      await m.wait(0.5)
      van.locked = false
    })
    m.story.leave(van)
    await m.evidence('act_cadastral', 'Actul cadastral', 'O foaie scăpată din ladă: {y}Parcul Valea Morilor{/y} „vândut" firmei {y}„Beznă Invest SRL"{/y} pentru 1 leu. Semnat și ștampilat: {y}C. Eban{/y}.')
    // ---- back to Borea -------------------------------------------------------------------------------
    await m.reach(m.story.cast.borea ? m.story.cast.borea.pos : m.places.borea, 3.4, { text: 'Întoarce-te la {y}Borea{/y}. Are câteva explicații de dat.', label: 'Borea' })
    await m.say('borea', [
      { who: 'player', text: 'Babanul tău era plin de hârtii, Borea. Dosare de la primărie.' },
      'Hârtii?! Io credeam că-i vin de Purcari! Mi-a zis omul de la primărie: „vin pentru ambasadă, Borea, protocol".',
      'Băi… deci io i-am cărat primarului propriile hârtii spre Moscova? Pe banii mei, pe benzina mea?!',
      'Gata. Borea Țigan nu-i trădător. Ce-ți trebuie, la mine găsești: unelte, acte, nitro sub capotă. Preț de prieten.',
    ])
    g.progress.flags.boreaShop = true
    m.notify('{g}Magazinul lui Borea{/g} e deschis: arme, acte false, nitro. Vorbește cu el oricând.', 5)
  },
}

// =============================================================================
// Cap. 2 · Omul din parc — feed the prophet, night stakeout at the Arc, run
export const profetul = {
  id: 'profetul', chapterName: CH2, title: 'Omul din parc',
  desc: 'Omul cu folie pe cap știe ce se întâmplă noaptea la Arc. Pe stomacul gol, însă, vede în ceață.',
  giver: { npc: 'profet', label: 'Omul din parc' },
  reward: { xp: 400 },
  async script(m) {
    const g = m.game, p = m.player
    await m.say('profet', [
      'Și aiurești wai, șii cu tine?! Ai să mă arăți la televizor?',
      { who: 'player', text: 'Borea zice că tu vezi tot ce se întâmplă la Arc noaptea.' },
      'Văd. Da\' pe stomacul gol văd în ceață. Adu-mi ceva de mâncare. Un covrig, o plăcintă, ceva cu aluat.',
    ])
    // ---- food from a kiosk ---------------------------------------------------------------------------
    let fed = false
    const off = g.events.on('shop:buy', (e) => { if (e.item?.food) fed = true })
    m.track({ dispose: off })
    const food = g.world.kiosks.filter((k) => KIOSK_MENU[k.label]?.items.some((it) => it.food))
    const near = food.sort((a, b) => dist(a, p.pos) - dist(b, p.pos))[0]
    m.objective('Cumpără ceva de mâncare de la un {y}chioșc{/y}.', { sub: 'Orice chioșc cu mâncare merge.' })
    if (near) m.marker({ x: near.x, z: near.z }, near.label)
    await m.until(() => fed)
    const pr = m.story.cast.profet
    await m.reach(pr ? pr.pos : m.places.parc_catedrala, 3.2, { text: 'Du-i mâncarea {y}omului din parc{/y}.', label: 'Omul din parc' })
    const c = await m.say('profet', [
      'Mmm. Cald. Ca la mama.',
      'Ascultă. În fiecare noapte, pe la două, vine un om în negru la Arc. Lasă ceva sub a treia coloană din stânga și pleacă.',
      'Da\' săptămâna asta-i agitație mare. Stai la pândă. Și să nu te vadă, că ăștia n-au umor.',
    ], { choices: ['Aștept până la noapte.', 'Mai târziu.'] })
    if (c === 1) { await m.say('profet', ['Arcul nu fuge. Oamenii fug.']); m.cancel() }
    // ---- night --------------------------------------------------------------------------------------
    await m.fade(1, 700)
    m.tod(1.75)
    m.teleport(14, 44, Math.PI)
    g.police.clear()
    await m.wait(0.4)
    await m.fade(0, 900)
    await g.ui.overlay('01:45', 1.2, { tone: 'white' })
    const hide = { x: 12.5, z: 29 }
    const zone = m.ring(hide.x, hide.z, { r: 2.2, color: 0x7fe07f })
    await m.reach(hide, 2.2, { text: 'Ascunde-te lângă Arc, în {g}cercul verde{/g}, și așteaptă.', label: 'Ascunzătoare' })
    m.untrack(zone)
    m.objective('Așteaptă. Nu te mișca. Nu intra în {r}conul lui de vedere{/r}.', { sub: '' })
    await m.wait(2)
    // ---- the courier -----------------------------------------------------------------------------------
    const cur = m.spawn('mascat', 'mascat', -46, 13.5, { voice: { pitch: 0.7, type: 'gruff' } })
    cur.speed = 1.6
    const cone = m.cone(cur, { range: 13, fov: 1.25 })
    const spot = m.every(() => { if (cone.alert >= 1) m.fail('Te-a văzut! A fugit cu tot cu matrioșcă.') })
    await m.walk(cur, -9, 17.5)
    await m.walk(cur, -3.6, 23.9, { face: 0 })
    cur.char.anim.play('pickup')
    await m.wait(1.6)
    await m.walk(cur, -9, 17.5)
    await m.walk(cur, -48, 13)
    m.untrack(spot)
    m.untrack(cone)
    m.story.removeNpc(cur)
    // ---- the matryoshka ---------------------------------------------------------------------------------
    const doll = m.pickup(-3.6, 24.3, { kind: 'matrioska', r: 1.5, glow: 0xff5a4a })
    m.objective('Ia {y}matrioșca{/y} de sub a treia coloană.')
    m.marker({ x: doll.x, z: doll.z }, 'Matrioșca')
    await m.until(() => doll.near(p.pos) && !p.vehicle)
    m.untrack(doll)
    g.audio?.sfx('pickup', { bus: 'ui' })
    m.notify('Matrioșca… zdrăngăne. E ceva în ea.', 2.6, 'gold')
    // ---- run ---------------------------------------------------------------------------------------------
    const a = m.enemy('mascat', -24, 12.5, { hp: 55, runSpeed: 5.6 })
    const b = m.enemy('mascat', 22, 12.5, { hp: 55, runSpeed: 5.6 })
    m.brawl([a, b])
    a.say('Ei! Pune jos!'); b.say(`Stai, ${gen(m.game, 'băiete', 'fato')}!`)
    g.audio?.sfx('whistle', { vol: 0.8 })
    m.objective('{r}Fugi cu matrioșca!{/r} Rupe urmărirea.', { sub: 'Depărtează-te la 60 m (sau pune-i la pământ).' })
    let clearT = 0, escaped = false
    m.every((dt) => {
      const up = [a, b].filter((n) => !m.down(n))
      clearT = up.every((n) => dist(n.pos, m.P) > 60) ? clearT + dt : 0
      if (!up.length || clearT > 1.5) escaped = true
    })
    await m.until(() => escaped)
    g.progress.flags.matrioska = true
  },
}

// =============================================================================
// Cap. 2 · Sergentul Căldare — recover his stolen police car, he reads the SIM
export const sergentul = {
  id: 'sergentul', chapterName: CH2, title: 'Sergentul Căldare',
  desc: 'Căldare poate citi cartela SIM din matrioșcă. Doar că gopnicii din Râșcani i-au furat mașina de serviciu.',
  giver: { npc: 'caldare', label: 'Sergent Căldare' },
  reward: { xp: 400, civic: 5 },
  chapterEnd: 'CAPITOLUL 2 · ÎNCHEIAT', chapterEndText: 'Trei martori, două acte, o cartelă SIM. Firul duce în beciul Primăriei.',
  async script(m) {
    const g = m.game, p = m.player
    const met = g.progress.flags.caldare
    await m.say('caldare', [
      met === 'fugit' ? 'Tu?! Jiguliul bej! Ai noroc că n-am timp de tine azi.' : 'A, tu ești. Salută-l pe Vasile. Și zi-i de cei 200 de lei.',
      { who: 'player', text: 'Am o matrioșcă cu o cartelă SIM în ea. Poți s-o citești?' },
      'Io? Cu ce? Laptopul e în mașina de serviciu. Și mașina de serviciu…',
      '…mi-au furat-o. Ieri. Gopnicii din Râșcani. Dacă află șefii, mă trimit la Ocnița, la frontieră, să păzesc ciorile.',
      'Adu-mi mașina înapoi și-ți citesc ce vrei. Da\' fără zgârieturi, că-i dată în folosință. E la cooperativa de garaje, lângă Vova.',
    ])
    // ---- the garage cooperative ------------------------------------------------------------------------
    const PC = { x: -250, z: 214 }
    const pol = m.vehicle('police', PC.x, PC.z, Math.PI / 2, { persist: true })
    pol.health = 100
    const jig = m.vehicle('jiguli', -234, 214, Math.PI / 2, { color: 0x3a3a70 })
    jig.locked = true
    const gs = [
      m.spawn(null, 'gopnik2', PC.x + 2.5, PC.z - 2.6, { anim: 'squat', personality: 'story' }),
      m.spawn(null, 'gopnik3', PC.x - 3.2, PC.z + 2.8, { anim: 'phone', personality: 'story' }),
      m.spawn(null, 'gopnik1', PC.x + 5.5, PC.z + 2.4, { personality: 'story' }),
    ]
    m.objective('Recuperează {y}mașina de poliție{/y} de la cooperativa de garaje.', { sub: 'Gopnicii din Râșcani nu dau nimic de bunăvoie.' })
    m.marker(PC, 'Mașina lui Căldare')
    await m.until(() => dist(m.P, PC) < 24 || p.vehicle === pol)
    // they notice
    for (const n of gs) { n.personality = 'tough'; n.hittable = true; n.stayDown = true; n.enemy = true; n.hostile = true; n.hp = n.maxHp = 42; n.state = 'fight'; n.target = p; n.char.anim.set('idle') }
    m.brawl(gs)
    gs[0].say('Șo, gabor nou? Hai, vino-ncoace!')
    m.objective('Urcă în {y}mașina de poliție{/y}.', { sub: 'Gopnicii se bat. Poți să-i bați și tu. Sau doar să pleci.' })
    await m.until(() => p.vehicle === pol)
    m.marker(null)
    // ---- drive it back; the gopniks give chase if they still can ---------------------------------------
    const standing = gs.filter((n) => !m.down(n))
    if (standing.length) {
      for (const n of standing.slice(0, 2)) m.story.removeNpc(n)
      jig.locked = false
      m.chaser(jig, () => ({ x: pol.pos.x, z: pol.pos.z }), { speed: 20 })
      m.notify('{r}Gopnicii sar în Jiguli și vin după tine!{/r}', 3, 'red')
    }
    const cal = m.story.cast.caldare
    const dest = cal ? cal.pos : { x: -40, z: 13 }
    m.objective('Du mașina la {y}Sergentul Căldare{/y}. {r}Nu o strica!{/r}')
    m.marker(dest, 'Căldare')
    m.every(() => {
      m.sub(`Starea mașinii: ${pol.health > 60 ? '{g}' : pol.health > 40 ? '{y}' : '{r}'}${Math.round(pol.health)}%{/${pol.health > 60 ? 'g' : pol.health > 40 ? 'y' : 'r'}}`)
      if (pol.health < 22) m.fail('Ai făcut mașina praf. Căldare pleacă la Ocnița.')
    })
    await m.until(() => p.vehicle === pol && dist(pol.pos, dest) < 14 && Math.abs(pol.speed) < 1.5)
    m.marker(null)
    await m.cutscene(async () => {
      g.vehicles.exit(true)
      pol.locked = true
      const c2 = m.story.cast.caldare
      const cx = pol.pos.x + Math.cos(pol.heading) * 1.8, cz = pol.pos.z - Math.sin(pol.heading) * 1.8
      m.hold({ from: [cx + 3.5, 2.1, cz - 3.4], look: [cx, 1.2, cz], dur: 60 })
      if (c2) { await m.walk(c2, cx, cz, { timeout: 6 }); m.face(c2, pol.pos.x, pol.pos.z) }
      await m.say('caldare', [
        pol.health > 85 ? 'Mașina mea! Frumoasa mea! Nici o zgârietură. Tu ești om serios.' : 'Mașina mea! …Ce-i cu zgârietura asta? Lasă. Zic că-i de la grindină.',
        'Hai să vedem matrioșca asta.',
      ])
      g.audio?.sfx('typewriter', { bus: 'ui', vol: 0.7 })
      await m.say('caldare', [
        'Cartela… apeluri: Moscova. Moscova. Moscova. Patruzeci și șapte de apeluri.',
        'Și un număr local. Stai… ăsta-i numărul de la Primărie. Biroul primarului.',
        'Și un SMS: „Arhiva din beci pleacă vineri cu trenul. Paza dublată. Nimeni nu intră."',
        'Io… io n-am văzut nimic. Deocamdată. Da\' dacă ai nevoie de poliție când e să fie… mă știi unde stau.',
      ])
    })
    await m.evidence('sim_matrioska', 'Cartela SIM din matrioșcă', '{y}47 de apeluri spre Moscova{/y} și un număr local: {y}biroul primarului{/y}. Un SMS: „Arhiva din {y}beci{/y} pleacă vineri cu trenul. Paza dublată."')
  },
}

