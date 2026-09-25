import { CAST, randomCivilian } from '../data/outfits.js'
import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js'
import { SPEAKERS } from './cast.js'
import { Pickup } from './Kit.js'
import { mulberry } from '../world/rng.js'
import { dist, taxiFare, runRace, rand, pickOne } from './missions/common.js'

// Shown in the pause menu once unlocked
export const ACTIVITIES = [
  { id: 'gropi', title: '🕳️ Astupă gropile', desc: 'Ține {y}[E]{/y} lângă o groapă ca s-o astupi. Asociația de proprietari plătește 15 lei. Respect civic.', unlock: 'paine' },
  { id: 'dosare', title: '📁 Dosare pierdute', desc: 'Primăria „pierde" dosare prin tot orașul: 30 în total. Borea le cumpără.', unlock: 'paine' },
  { id: 'taxi', title: '🚕 Tura de taxi', desc: 'Urcă într-un taxi și apasă {y}[T]{/y}. Clienții apar pe hartă. Coboară ca să închei tura.', unlock: 'taxi' },
  { id: 'pizza', title: "🍕 Livrări Andy's Pizza", desc: "Ia comenzi de la Andy's Pizza (Str. 31 August) și livrează-le calde.", unlock: 'taxi' },
  { id: 'vova', title: '🔧 Service-ul lui Vova', desc: 'Vova îți repară mașina pentru 40 de lei. Și-ți dă un taxi dacă n-ai.', unlock: 'jiguli' },
  { id: 'curse', title: '🏁 Curse cu Vitea', desc: 'Cursă pe bani cu gopnicii din curte. Miza: 50 de lei.', unlock: 'cursa' },
  { id: 'borea', title: '🧶 Magazinul lui Borea', desc: 'Arme, acte false, nitro. Și cumpără dosarele pierdute.', unlock: 'borea' },
]

const PLACES = [
  ['Piața Centrală', 236, 13.5], ['Catedrala', -25, 13.5], ['Primăria', -90, -13.5], ['Opera', -240, -13.5], ['Universitate', 361, -13.5],
  ['Muzeul de Istorie', -240, 13.5], ['Autogara', 361, 13.5], ['Linella', 125, 149.2], ['Gara', 356, 261.6], ['Circul', -240, -151.5],
  ['Parlament', 120, -13.5], ['Grădina Publică', 100, 13.5], ['Hotel Național', -360, 13.5], ['Botanica', -53.8, 180], ['Ambasada', 355, -146.8],
]

// ---------------------------------------------------------------------------
// taxi shift: fares until you step out of the cab
export const TAXI_SHIFT = {
  id: 'act_taxi', activity: true, title: 'Tura de taxi', silentPass: true, noRetry: true,
  async script(m) {
    const g = m.game
    const cab = m.car
    let earned = 0, fares = 0
    m.notify('Tura a început. Clienții apar pe hartă. {y}Coboară{/y} ca să închei.', 3.4, 'gold')
    let outT = 0
    m.every((dt) => { outT = m.car === cab ? 0 : outT + dt })
    for (;;) {
      if (outT > 3) break
      const here = m.P
      const cands = PLACES.filter(([, x, z]) => { const d = Math.hypot(x - here.x, z - here.z); return d > 35 && d < 220 })
      const [fromName, fx, fz] = cands.length ? pickOne(cands) : pickOne(PLACES)
      const far = PLACES.filter(([n, x, z]) => n !== fromName && Math.hypot(x - fx, z - fz) > 120)
      const [toName, tx, tz] = pickOne(far)
      const spec = randomCivilian(Math.random)
      const who = pickOne(['Clientul', 'Clienta', 'Un domn grăbit', 'O doamnă cu sacoșe', 'Un student', 'Un turist'])
      const r = await Promise.race([
        taxiFare(m, {
          taxi: cab, spec, name: who, voice: { pitch: rand(0.85, 1.25), type: who.startsWith('Client') || who.includes('domn') ? 'male' : 'female' },
          from: { x: fx, z: fz }, to: { x: tx, z: tz }, toLabel: toName, patience: 4,
          lines: [pickOne([`La ${toName}, șefu'. Și dacă se poate, fără gropi.`, `${toName}, vă rog. Am întârziat deja.`, `Mă duceți la ${toName}? Cât costă? …Bine, bine.`]), pickOne(['Ați auzit ce-a mai zis primarul? Nici eu. Nu mai ascult.', 'Pe vremea mea, drumul ăsta era mai bun. Pe vremea mea era și eu mai tânăr.', 'Aveți încărcător de telefon? Nu? Nici eu.', 'Muzica asta… e Zdob și Zdub? Dați mai tare!'])],
          crashLines: ['Ușor, domnule!', 'Doamne ferește!', 'Io am plătit pentru o cursă, nu pentru montagne russe!'],
          arrive: [pickOne(['Mersi, șefu\'. Drum bun!', 'Mulțumesc. Păstrați restul. Care rest? Glumesc.', 'Merci! Vă dau cinci stele. Dacă găsesc aplicația.'])],
        }).catch(() => null),
        m.until(() => outT > 3).then(() => null),
      ])
      if (!r) break
      earned += r.total; fares++
    }
    if (fares) m.notify(`Tura s-a încheiat: ${fares} curse, {g}${earned} lei{/g}.`, 4, 'green')
    else m.notify('Tura s-a încheiat. Fără clienți azi.', 2.5)
    m.cancel()
  },
}

// ---------------------------------------------------------------------------
export const STREET_RACE = {
  id: 'act_race', activity: true, title: 'Cursă pe bani', silentPass: true, noRetry: true,
  async script(m) {
    const g = m.game, pr = g.progress
    const bet = 50
    if (pr.lei < bet) { await m.say('vitea', ['Fără bani nu se bagă nimeni, bratan. Vino cu cincizeci de lei.']); m.cancel() }
    const c = await m.say('vitea', ['Cursă? Cincizeci de lei miza. Tura de cartier, ca data trecută.'], { choices: ['Davai. Pune banii.', 'Altă dată.'] })
    if (c === 1) m.cancel()
    if (!m.car) { await m.say('vitea', ['Da\' pe jos vrei să alergi? Vino cu mașina, bratan.']); m.cancel() }
    pr.addLei(-bet, 'Miza la cursă')
    await m.reach({ x: 114, z: 271.75 }, 12, { text: 'Du-te la linia de start, pe {y}Alexandru cel Bun{/y}.', label: 'Start', inVehicle: true })
    const res = await runRace(m, {
      nodes: pickOne([[[4, 4], [5, 4], [5, 3], [3, 3], [3, 4], [4, 4]], [[4, 4], [6, 4], [6, 3], [3, 3], [3, 4], [4, 4]]]),
      laps: 1, car: m.car, lapTime: 120, name: 'Cursă pe bani',
      rivals: [{ kind: 'jiguli', color: 0x9a1c1c, speed: 23.5, name: 'Vitea' }, { kind: 'logan', color: 0x16161a, speed: 22.5, name: 'Gena' }],
    })
    if (res.won) { pr.addLei(bet * 2, 'Ai câștigat cursa!'); pr.addXp(80, 'Cursă câștigată'); pr.addCred(3); pr.stats.races++; g.audio?.sting('race_win'); g.ui.bigMessage('PRIMUL!', `+${bet * 2} lei`, { secs: 2.6 }) }
    else g.ui.bigMessage('AI PIERDUT', `Locul ${res.place}. Miza rămâne la Vitea.`, { color: 'red', secs: 2.6 })
    m.cancel()
  },
}

// ---------------------------------------------------------------------------
export const PIZZA = {
  id: 'act_pizza', activity: true, title: "Livrări Andy's Pizza", silentPass: true, noRetry: true,
  async script(m) {
    const g = m.game, pr = g.progress
    const c = await m.say({ name: 'Andy', role: "Andy's Pizza", spec: CAST.plecat, voice: { pitch: 1.05, type: 'male' } },
      ['Trei comenzi, trei adrese. Pizza trebuie să ajungă caldă, altfel nu plătesc. Și nu-mi zgâria cutiile.'], { choices: ['Dă-le încoace.', 'Altă dată.'] })
    if (c === 1) m.cancel()
    let paid = 0
    for (let k = 0; k < 3; k++) {
      const here = m.P
      const opts = PLACES.filter(([, x, z]) => { const d = Math.hypot(x - here.x, z - here.z); return d > 90 && d < 300 })
      const [name, x, z] = pickOne(opts.length ? opts : PLACES)
      const secs = Math.round(Math.hypot(x - here.x, z - here.z) / 6.5 + 25)
      m.timer(secs, 'Pizza s-a răcit. Clientul a comandat sushi.')
      m.objective(`Livrează pizza {y}${k + 1}/3{/y} la {y}${name}{/y}.`, { title: "ANDY'S PIZZA" })
      m.marker({ x, z }, name)
      await m.until(() => dist(m.P, { x, z }) < 9 && (!m.car || Math.abs(m.car.speed) < 3))
      const left = Math.max(0, m.timerT || 0)
      m.stopTimer()
      const pay = 30 + Math.round(left * 0.8)
      paid += pay
      pr.addLei(pay, left > 10 ? `Pizza caldă! +${pay} lei` : `Pizza livrată: +${pay} lei`)
      pr.addXp(30, 'Livrare')
      g.audio?.sfx('cash', { bus: 'ui' })
      m.marker(null)
    }
    g.ui.bigMessage('LIVRĂRI GATA', `Ai câștigat ${paid} lei. Andy zice că revii mâine.`, { secs: 3 })
    m.cancel()
  },
}

// ---------------------------------------------------------------------------
export class Activities {
  constructor(game, story) {
    this.game = game
    this.story = story
    this.itemsAdded = false
    this.dosare = null
    this.taxiHint = 0
  }

  get pr() { return this.game.progress }

  // hold-E potholes and Andy's job board
  setupInteractions() {
    const g = this.game, s = this.story
    if (this.itemsAdded) return
    this.itemsAdded = true
    for (const h of s.potholes.list) {
      g.interaction.add({
        id: 'pothole' + h.i, x: h.x, z: h.z, r: 2.4, hold: 2.2, label: 'Ține [E]: astupă groapa',
        enabled: () => !h.fixed && s.isDone('paine') && !(s.active && !s.active.def.activity),
        onInteract: () => this.fixPothole(h),
      })
    }
    const andy = g.world.shops.find((x) => x.label === "ANDY'S PIZZA")
    if (andy) g.interaction.add({ id: 'pizza_job', x: andy.x + 2.2, z: andy.z, r: 2.2, priority: 2, label: "Livrări Andy's Pizza (job)", enabled: () => s.isDone('taxi') && !s.active, onInteract: () => s.run(PIZZA) })
  }

  fixPothole(h) {
    const g = this.game, pr = this.pr
    this.story.potholes.fix(h)
    if (!pr.potholes.includes(h.i)) pr.potholes.push(h.i)
    g.fx?.dust(h.x, 0.3, h.z, 14)
    g.audio?.sfx('shovel', { at: h, vol: 0.9 })
    pr.addCivic(3)
    pr.addLei(15, `Groapă astupată (${pr.potholes.length}/${this.story.potholes.list.length}). Asociația plătește.`)
    pr.addXp(25)
    if (pr.potholes.length === this.story.potholes.list.length) g.ui.bigMessage('ORAȘ FĂRĂ GROPI', 'Ai astupat toate gropile. Primăria o să spună că a fost ideea ei.', { secs: 4 })
  }

  // 30 lost dossiers at fixed spots on the pedestrian network
  dosarSpots() {
    if (this.dosare) return this.dosare
    const nodes = [...(this.game.peds?.nodes || [])].sort((a, b) => a.x - b.x || a.z - b.z)
    const rnd = mulberry(3030)
    const out = []
    for (let tries = 0; tries < 4000 && out.length < 30; tries++) {
      const n = nodes[Math.floor(rnd() * nodes.length)]
      if (!n) break
      const x = n.x + (rnd() - 0.5) * 3, z = n.z + (rnd() - 0.5) * 3
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 55)) continue
      out.push({ i: out.length, x, z, obj: null })
    }
    this.dosare = out
    return out
  }

  updateDosare() {
    const g = this.game, pr = this.pr, p = g.player
    if (!this.story.isDone('paine')) return
    const P = p.vehicle ? p.vehicle.pos : p.pos
    for (const d of this.dosarSpots()) {
      const got = pr.dosare.includes(d.i)
      const near = Math.hypot(d.x - P.x, d.z - P.z) < 80
      if (!got && near && !d.obj) d.obj = new Pickup(g, d.x, d.z, { kind: 'dosar', r: 1.4, glow: 0xffe08a })
      if (d.obj && (got || !near)) { d.obj.dispose(); d.obj = null }
      if (d.obj) {
        d.obj.update(1 / 60)
        if (!p.vehicle && d.obj.near(p.pos)) {
          pr.dosare.push(d.i)
          d.obj.dispose(); d.obj = null
          g.audio?.sfx('paper', { vol: 0.8 })
          pr.addXp(15)
          g.ui.notify(`📁 Dosar pierdut găsit ({y}${pr.dosare.length}/30{/y}). ${this.story.isDone('borea') ? 'Borea îl cumpără.' : 'Poate-l vrea cineva…'}`, 3.2)
        }
      }
    }
  }

  // ---- characters with services -----------------------------------------------------------------
  talkLabel(id) {
    const s = this.story
    if (id === 'borea' && s.isDone('borea')) return 'Magazinul lui Borea'
    if (id === 'vova' && s.isDone('jiguli')) return 'Vova: reparații și taxi'
    if (id === 'vitea' && s.isDone('cursa')) return 'Vitea: cursă pe bani'
    return null
  }

  services(id) {
    const s = this.story
    if (id === 'borea' && s.isDone('borea')) return () => this.boreaShop()
    if (id === 'vova' && s.isDone('jiguli')) return () => this.vovaService()
    if (id === 'vitea' && s.isDone('cursa')) return () => s.run(STREET_RACE)
    return null
  }

  async boreaShop() {
    const g = this.game, pr = this.pr
    for (;;) {
      const offers = []
      for (const k of WEAPON_ORDER) {
        const w = WEAPONS[k]
        if (!w.price || pr.weapons.includes(k)) continue
        offers.push({ text: `${w.icon} ${w.name}`, cost: `${w.price} lei`, disabled: pr.lei < w.price, buy: () => { pr.addLei(-w.price); pr.giveWeapon(k); pr.weapon = k; g.player.setWeapon(k); g.ui.notify(`Ai ${w.icon} ${w.name}. {y}[Q]{/y} schimbi arma.`, 3, 'gold') } })
      }
      if (!pr.flags.acteFalse) offers.push({ text: '🪪 Acte false („de deputat")', cost: '150 lei', disabled: pr.lei < 150, buy: () => { pr.addLei(-150); pr.flags.acteFalse = true; g.ui.notify('Ai acte false. La prima oprire, poliția te salută.', 3.4, 'gold') } })
      if (!pr.flags.nitro) offers.push({ text: '🔥 Nitro sub capotă ([⇧] la volan)', cost: '300 lei', disabled: pr.lei < 300, buy: () => { pr.addLei(-300); pr.flags.nitro = true; g.ui.notify('Nitro montat. Ține {y}[⇧]{/y} la volan. „Aproape legal", zice Borea.', 3.8, 'gold') } })
      const sold = pr.flags.dosareVandute || 0
      const unsold = pr.dosare.length - sold
      const price = Math.round(25 * (pr.perk.sell || 1))
      if (unsold > 0) offers.push({ text: `📁 Vinde dosarele pierdute (${unsold})`, cost: `+${unsold * price} lei`, buy: () => { pr.flags.dosareVandute = pr.dosare.length; pr.addLei(unsold * price, `Borea a luat ${unsold} dosare`) } })
      offers.push({ text: 'Nimic, mersi.' })
      const i = await g.ui.dialogue(SPEAKERS.borea, [pickOne(['Băi, tu pe mine a sculat? Hai, zi, vinzi ori cumperi?', 'Marfă proaspătă, bratan. Căzută de pe camion. Proaspăt.', 'Preț de prieten. Pentru tine, prietene, dublu. Glumesc!'])], { choices: offers })
      const o = offers[i]
      if (!o || !o.buy) return
      o.buy()
      g.audio?.sfx('cash', { bus: 'ui' })
    }
  }

  async vovaService() {
    const g = this.game, pr = this.pr, p = g.player
    const nearCar = p.vehicle || g.vehicles.list.filter((v) => !v.def.trolley && !v.locked && (!v.driver || v.driver === 'player') && dist(v.pos, p.pos) < 14).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]
    const choices = []
    if (nearCar) choices.push({ text: `Repară ${nearCar.def.name} (${Math.round(nearCar.health)}%)`, cost: '40 lei', disabled: pr.lei < 40 || nearCar.health >= 99, act: () => { pr.addLei(-40); nearCar.health = 100; nearCar.broken = false; g.ui.notify('Ca nouă. Ca veche-bună, adică.', 2.6, 'green') } })
    const hasTaxi = g.vehicles.list.some((v) => v.def.name && v.kind === 'taxi' && dist(v.pos, p.pos) < 40)
    if (!hasTaxi && this.story.isDone('taxi')) choices.push({ text: 'Dă-mi un taxi', cost: 'gratis', act: () => { const v = g.vehicles.spawn('taxi', -200, 252.5, Math.PI / 2); v.keep = true; g.ui.notify('Loganul cumnatului e al tău. Apasă {y}[T]{/y} în taxi pentru clienți.', 3.4, 'gold') } })
    choices.push({ text: 'Nimic, mersi.' })
    const i = await g.ui.dialogue(SPEAKERS.vova, [pickOne(['Ce bate? Motorul sau inima?', 'Adu-o, bratan. Ce nu repară Vova, nu se repară.', 'Iar ai sărit prin gropi? Toată lumea sare.'])], { choices })
    choices[i]?.act?.()
  }

  // ---- per frame --------------------------------------------------------------------------------
  update(dt) {
    const g = this.game, s = this.story, p = g.player
    this.updateDosare()
    // taxi shift on [T]
    const v = p.vehicle
    if (v && !p.passenger && v.kind === 'taxi' && s.isDone('taxi') && !s.active && !g.ui.modalOpen) {
      if (this.taxiHint !== v) { this.taxiHint = v; g.ui.tip('Apasă {y}[T]{/y} ca să începi tura de taxi.', 6) }
      if (g.input.pressed('job')) s.run(TAXI_SHIFT)
    } else if (!v) this.taxiHint = 0
  }

  blips() {
    const out = []
    const s = this.story, pr = this.pr
    const P = s.P()
    if (s.isDone('paine')) {
      for (const h of s.potholes.list) if (!h.fixed && Math.hypot(h.x - P.x, h.z - P.z) < 140) out.push({ kind: 'dot', x: h.x, z: h.z, color: '#9a8f80', r: 2.5 })
      for (const d of this.dosarSpots()) if (!pr.dosare.includes(d.i) && Math.hypot(d.x - P.x, d.z - P.z) < 70) out.push({ kind: 'icon', x: d.x, z: d.z, icon: '📁' })
    }
    return out
  }
}
