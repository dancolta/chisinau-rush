// Dev-only helpers for automated playthroughs: auto-advance dialogue and an "autopilot"
// that nudges the current mission forward (teleports to markers, knocks out enemies, …).
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

export class Debug {
  constructor(game) {
    this.game = game
    this.log = []
    this.auto = false
    this.t = 0
    window.addEventListener('error', (e) => this.log.push('error: ' + e.message))
    game.events.on('mission:fail', (d, r) => this.note(`FAIL ${d.id}: ${r}`))
    game.events.on('mission:pass', (d) => this.note(`PASS ${d.id}`))
    let lastObj = ''
    setInterval(() => { const o = game.ui?.objective || ''; if (o !== lastObj) { lastObj = o; if (o) this.note('obj: ' + o.replace(/\{\/?[a-z]\}/g, '').slice(0, 70)) } }, 200)
  }

  note(s) { this.log.push(`[${this.game.story.active?.def.id || '-'}] ${s}`); if (this.log.length > 400) this.log.shift() }

  autoplay(on = true) { this.auto = on; this.game.autoTalk = on }

  // jump straight into the story at mission `id` (everything before it counts as done)
  async startAt(id, { name = 'Dan', type = 'patan' } = {}) {
    const g = this.game, s = g.story
    const { MISSIONS } = await import('../story/missions.js')
    const idx = MISSIONS.findIndex((m) => m.id === id)
    g.progress.reset({ name, type })
    g.progress.story.done = MISSIONS.slice(0, Math.max(0, idx)).filter((m) => !m.activity).map((m) => m.id)
    const f = g.progress.flags
    const done = (k) => g.progress.story.done.includes(k)
    if (done('jiguli')) f.taxi = true
    if (done('borea')) f.boreaShop = true
    f.dovezi = ['dosar_taxi', 'filmare_vitea', 'act_cadastral', 'sim_matrioska', 'poze_beci', 'martora'].filter((d, i) => done(['taxi', 'cursa', 'borea', 'sergentul', 'beciul', 'rapirea'][i]))
    g.progress.lei = 400
    const m = MISSIONS[idx]
    const q = s.giverPos(m)
    g.director.spawnPlayer(type, q.x + 3, q.z + 3)
    g.menus.close()
    g.state = 'play'
    g.ui.showHud(true)
    g.ui.ticker(true)
    g.cameraRig.endShot()
    g.cameraRig.target.copy(g.player.pos); g.cameraRig.snap()
    await s.resume()
    this.note('startAt ' + id)
  }

  // advance the story one "beat"
  solve() {
    const g = this.game, s = g.story, a = s.active, p = g.player
    if (!a || g.ui.modalOpen || g.cutscene || g.paused) return 'wait'
    const obj = g.ui.objective || ''
    // start a stalled engine
    if (/Pornește motorul/.test(obj)) { setTimeout(() => g.input.pressedSet.add('KeyW'), 0); return 'crank' }
    // enemies: down they go
    const foes = s.npcs.filter((n) => n.enemy && !(n.char.ko && n.hp <= 0))
    if (foes.length) { for (const f of foes) { f.hp = 0; f.knockDown(0.1, 0.1, 5, 1) } this.note(`ko ${foes.length}`); return 'ko' }
    // stealth: nobody sees the autopilot
    for (const o of a.tracked) if (o.alert !== undefined) { o.alert = 0; o.enabled = false }
    // chase / tail targets: stay close behind, damage the villain's car when it's a takedown
    const gw = g.vehicles.list.find((v) => v.kind === 'gwagon' && v.driver && v.driver !== 'player' && !v.broken && v.driver.points)
    if (gw && p.vehicle && !p.passenger) {
      const back = /Cortegiul/i.test(a.def.title) ? 14 : 30
      p.vehicle.teleport(gw.pos.x - Math.sin(gw.heading) * back, gw.pos.y + 0.3, gw.pos.z - Math.cos(gw.heading) * back, gw.heading)
      if (/Cortegiul/i.test(a.def.title)) gw.damage(18)
      return 'tail'
    }
    // mission interactables (photos, bread…)
    for (const it of g.interaction.items.values()) {
      if (!it.id.startsWith('m_') || !it.enabled()) continue
      const x = typeof it.x === 'function' ? it.x() : it.x, z = typeof it.z === 'function' ? it.z() : it.z
      if (p.vehicle) g.vehicles.exit(true)
      p.teleport(x + 0.6, g.physics.groundHeight(x, z, 3), z + 0.6)
      Promise.resolve(it.onInteract()).catch(() => {})
      this.note('interact ' + it.id)
      return 'interact'
    }
    // pickups
    const pk = a.tracked.find((o) => o.kind && o.baseY !== undefined)
    if (pk) { if (p.vehicle) g.vehicles.exit(true); p.teleport(pk.x, g.physics.groundHeight(pk.x, pk.z, 3), pk.z); this.note('pickup ' + pk.kind); return 'pickup' }
    const mk = g.ui.marker
    if (g.police.level > 0) { g.police.clear(); this.note('lose cops'); return 'cops' }
    if (a.onFootWanted && p.vehicle && !p.passenger) { g.vehicles.exit(true); this.note('get out'); return 'exit' }
    if (a.carWanted && !p.vehicle) { const v = g.vehicles.nearestEnterable(p.pos.x, p.pos.z, 60) || g.vehicles.spawn('logan', p.pos.x + 3, p.pos.z, 0); g.vehicles.enter(v); this.note('need car'); return 'enter' }
    // shopping objectives: use the nearest shop/kiosk to the marker
    if (mk && /Cumpără/.test(obj)) {
      let best = null, bd = 8
      for (const it of g.interaction.items.values()) {
        if (!/^(kiosk|shop|linella)/.test(it.id)) continue
        const d = Math.hypot(it.x - mk.x, it.z - mk.z)
        if (d < bd) { bd = d; best = it }
      }
      if (best) {
        if (p.vehicle) g.vehicles.exit(true)
        p.teleport(best.x, g.physics.groundHeight(best.x, best.z, 3), best.z)
        Promise.resolve(best.onInteract()).catch(() => {})
        this.note('shop ' + best.id)
        return 'shop'
      }
    }
    if (mk) {
      // "get in" objectives: the marked car
      const car = g.vehicles.list.find((v) => dist(v.pos, mk) < 3.5 && !v.def.trolley)
      if (car && /Urcă/.test(obj) && p.vehicle !== car) { if (p.vehicle) g.vehicles.exit(true); car.locked = false; g.vehicles.enter(car); this.note('enter ' + car.kind); return 'enter' }
      if (/cu mașina|în taxi|Urcă/.test(obj) && !p.vehicle) {
        const v = g.vehicles.nearestEnterable(p.pos.x, p.pos.z, 60) || g.vehicles.spawn('logan', p.pos.x + 3, p.pos.z, 0)
        g.vehicles.enter(v); this.note('borrow ' + v.kind); return 'enter'
      }
      if (p.vehicle && !p.passenger) {
        const v = p.vehicle
        const ang = Math.atan2(mk.x - v.pos.x, mk.z - v.pos.z)
        v.teleport(mk.x - Math.sin(ang) * 2, g.physics.groundHeight(mk.x, mk.z, 3) + 0.4, mk.z - Math.cos(ang) * 2, ang)
      } else if (!p.passenger) {
        p.teleport(mk.x + 0.8, g.physics.groundHeight(mk.x + 0.8, mk.z, 3), mk.z + 0.8)
      }
      g.cameraRig.target.copy(p.vehicle ? p.vehicle.pos : p.pos); g.cameraRig.snap()
      this.note(`goto ${mk.label || ''} (${mk.x.toFixed(0)},${mk.z.toFixed(0)})`)
      return 'goto'
    }
    if (g.police.level > 0) { g.police.clear(); this.note('lose cops'); return 'cops' }
    return 'idle'
  }

  update(dt) {
    if (!this.auto) return
    this.t -= dt
    if (this.t > 0) return
    this.t = 0.5
    const g = this.game
    // start the next story mission when idle
    if (!g.story.active && g.state === 'play' && !g.ui.modalOpen && !g.cutscene) {
      if (this.noStory) return
      const m = g.story.nextMission()
      if (m) {
        const q = g.story.giverPos(m)
        if (g.player.vehicle) g.vehicles.exit(true)
        g.player.teleport(q.x + 1.5, g.physics.groundHeight(q.x + 1.5, q.z + 1.5, 3), q.z + 1.5)
        g.cameraRig.target.copy(g.player.pos); g.cameraRig.snap()
        setTimeout(() => { if (!g.story.active) g.story.run(m) }, 300)
        this.note('start ' + m.id)
      }
      return
    }
    this.solve()
  }
}
