import { fmt } from '../ui/UI.js'

// Small skill games the street events are built from: a timing bar (hit the green), button
// mashing, a hold-and-release power meter and an arrow-key rhythm lane. Each one owns a bit of
// HUD, reads the game's input (E, click and the touch buttons all work; arrows/WASD/d-pad for
// the rhythm) and resolves `result` when it's over. In a mission, `play(m, mg)` runs one and
// cleans it up if the event fails midway. g.side.auto = 'win' | 'lose' plays them by itself
// (automated tests), through the same logic a player would.

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const HIT = ['interact', 'attack', 'jump']

class Minigame {
  constructor(side, cls, html) {
    this.side = side
    this.game = side.game
    this.el = el('div', 'mg ' + cls, html)
    side.ui.root.appendChild(this.el)
    this.done = false
    this.result = null
    this.t = 0
    this.lock = 0.3        // the key that started it doesn't count
  }
  get auto() { return this.side.auto }
  $(s) { return this.el.querySelector(s) }
  // a key press counts once, even when a frame is played in several slices
  pressed() {
    const g = this.game
    if (this.pf === g.frame) return false
    const hit = HIT.some((a) => g.input.pressed(a))
    if (hit) this.pf = g.frame
    return hit
  }
  held() { const i = this.game.input; return HIT.some((a) => i.act(a)) }
  say(text, cls = '') { const s = this.$('.mg-say'); if (!s) return; s.textContent = text; s.className = 'mg-say ' + cls; this.side.ui.bump(s) }
  finish(result) {
    if (this.done) return
    this.done = true
    this.result = result
    this.el.classList.add('over')
    setTimeout(() => this.dispose(), 650)
  }
  dispose() { this.el.remove() }
  update(dt) { this.t += dt; if (this.lock > 0) this.lock -= dt }
}

// ---- a needle sweeps a bar: press when it's on the green, round after round ------------------------------------------
export class SkillCheck extends Minigame {
  constructor(side, { title, labels = [], rounds = 3, zones = [0.24, 0.17, 0.12], speeds = [0.55, 0.75, 0.95], misses = 3, hint = 'Apasă [E] când acul e pe verde', onHit, onMiss } = {}) {
    super(side, 'mg-skill', `<div class="mg-title">${title}</div><div class="mg-sub"></div><div class="mg-say"></div>
      <div class="mg-track"><div class="mg-zone"><div class="core"></div></div><div class="mg-needle"></div></div>
      <div class="mg-pips">${'<i></i>'.repeat(rounds)}</div><div class="mg-hint">${fmt(hint)}</div>`)
    Object.assign(this, { labels, rounds, zones, speeds, maxMiss: misses, onHit, onMiss })
    this.round = 0; this.misses = 0; this.pos = 0; this.dir = 1; this.freeze = 0
    this.newZone()
  }
  newZone() {
    const w = this.zones[Math.min(this.round, this.zones.length - 1)]
    this.z0 = 0.12 + Math.random() * (0.76 - w)
    this.zw = w
    const z = this.$('.mg-zone')
    z.style.left = (this.z0 * 100).toFixed(1) + '%'; z.style.width = (w * 100).toFixed(1) + '%'
    this.$('.mg-sub').textContent = this.labels[this.round] || `${this.round + 1} / ${this.rounds}`
  }
  update(dt) {
    super.update(dt)
    if (this.done) return
    const sp = this.speeds[Math.min(this.round, this.speeds.length - 1)] * (1 + this.misses * 0.08)
    if (this.freeze > 0) this.freeze -= dt
    else {
      this.pos += this.dir * sp * 2 * dt
      if (this.pos > 1) { this.pos = 2 - this.pos; this.dir = -1 }
      if (this.pos < 0) { this.pos = -this.pos; this.dir = 1 }
    }
    this.$('.mg-needle').style.left = (this.pos * 100).toFixed(2) + '%'
    if (this.lock > 0 || this.freeze > 0) return
    let press = this.pressed()
    // tests: every half second the needle is put in (or well out of) the zone and "pressed"
    if (this.auto && (this.autoT = (this.autoT || 0) + dt) > 0.5) {
      this.autoT = 0
      this.pos = this.auto === 'win' ? this.z0 + this.zw / 2 : (this.z0 > 0.5 ? 0.05 : 0.95)
      press = true
    } else if (this.auto) press = false
    const inZone = this.pos >= this.z0 && this.pos <= this.z0 + this.zw
    const centre = Math.abs(this.pos - (this.z0 + this.zw / 2)) < this.zw * 0.2
    if (!press) return
    const pips = this.el.querySelectorAll('.mg-pips i')
    if (inZone) {
      this.say(centre ? 'PERFECT!' : 'BUN!', centre ? '' : 'ok')
      pips[this.round]?.classList.add('ok')
      this.onHit?.(this.round, centre)
      this.round++
      this.freeze = 0.45
      if (this.round >= this.rounds) { this.finish({ ok: true, misses: this.misses }); return }
      this.newZone()
    } else {
      this.misses++
      this.say('RATAT!', 'bad')
      this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake')
      this.onMiss?.(this.misses)
      this.freeze = 0.55
      if (this.misses >= this.maxMiss) this.finish({ ok: false, misses: this.misses })
    }
  }
}

// ---- press, press, press before the time runs out ---------------------------------------------------------------------
export class Mash extends Minigame {
  constructor(side, { title, sub = '', secs = 12, per = 0.06, decay = 0.18, hint = 'Apasă repede [E] (sau click)!', onPress } = {}) {
    super(side, 'mg-mash', `<div class="mg-title">${title}</div><div class="mg-sub">${fmt(sub)}</div><div class="mg-say"></div>
      <div class="mg-track"><div class="mg-fill"></div><div class="mg-time"></div></div><div class="mg-key">E</div><div class="mg-hint">${fmt(hint)}</div>`)
    Object.assign(this, { secs, per, decay, onPress })
    this.fill = 0; this.presses = 0; this.autoT = 0
  }
  update(dt) {
    super.update(dt)
    if (this.done) return
    this.fill = Math.max(0, this.fill - this.decay * dt)
    let press = this.lock <= 0 && this.pressed()
    if (this.auto === 'win') { this.autoT -= dt; if (this.autoT <= 0) { this.autoT = 0.09; press = true } }
    else if (this.auto === 'lose') press = false
    const key = this.$('.mg-key')
    if (press) {
      this.presses++
      this.fill = Math.min(1, this.fill + this.per)
      key.classList.add('hit'); clearTimeout(this.keyT); this.keyT = setTimeout(() => key.classList.remove('hit'), 70)
      this.onPress?.(this.fill)
      if (this.presses % 6 === 0) this.say(['HAI!', 'ÎNCĂ!', 'HOP!', 'HAIDA!'][(this.presses / 6) % 4 | 0], 'ok')
    }
    this.$('.mg-fill').style.transform = `scaleX(${this.fill.toFixed(3)})`
    const left = Math.max(0, this.secs - this.t)
    this.$('.mg-time').textContent = left.toFixed(1).replace('.', ',') + ' s'
    if (this.fill >= 1) this.finish({ ok: true, presses: this.presses, secs: this.t })
    else if (left <= 0) this.finish({ ok: false, presses: this.presses, fill: this.fill })
  }
}

// ---- hold to charge, let go in the white zone ------------------------------------------------------------------------------
export class Power extends Minigame {
  constructor(side, { title, sub = '', sweet = [0.84, 0.95], period = 1.3, hint = 'Ține apăsat [E] și dă drumul în zona albă' } = {}) {
    super(side, 'mg-power-box', `<div class="mg-title">${title}</div><div class="mg-sub">${fmt(sub)}</div><div class="mg-say"></div>
      <div class="mg-power"><div class="sweet" style="left:${sweet[0] * 100}%;width:${(sweet[1] - sweet[0]) * 100}%"></div><div class="mg-needle"></div></div><div class="mg-hint">${fmt(hint)}</div>`)
    Object.assign(this, { sweet, period })
    this.charging = false; this.v = 0; this.ct = 0
  }
  update(dt) {
    super.update(dt)
    if (this.done) return
    let hold = this.lock <= 0 && this.held()
    if (this.auto) {
      // tests: let go right in the middle of the white zone (or far too early)
      hold = this.t < 0.6
      if (!hold && this.charging) this.v = this.auto === 'win' ? (this.sweet[0] + this.sweet[1]) / 2 : 0.3
    }
    if (hold && this.t > 0.35) {
      this.charging = true
      this.ct += dt
      const ph = (this.ct / this.period) % 1
      this.v = ph < 0.5 ? ph * 2 : 2 - ph * 2
    } else if (this.charging) {
      const v = this.v
      const sweet = v >= this.sweet[0] && v <= this.sweet[1]
      this.say(sweet ? 'PERFECT!' : v > this.sweet[1] ? 'PREA TARE!' : v > 0.6 ? 'BUN!' : 'SLAB…', sweet ? '' : v > this.sweet[1] || v < 0.6 ? 'bad' : 'ok')
      this.finish({ power: v, sweet, over: v > this.sweet[1] })
    }
    this.$('.mg-needle').style.left = (this.v * 100).toFixed(2) + '%'
  }
}

// ---- the dance battle: arrows fall, hit them on the line ---------------------------------------------------------------------------
const LANES = [
  { icon: '←', keys: ['ArrowLeft', 'KeyA', 'Pad14', 'TouchL0'] },
  { icon: '↓', keys: ['ArrowDown', 'KeyS', 'Pad13', 'TouchL1'] },
  { icon: '↑', keys: ['ArrowUp', 'KeyW', 'Pad12', 'TouchL2'] },
  { icon: '→', keys: ['ArrowRight', 'KeyD', 'Pad15', 'TouchL3'] },
]
// a hora in beats: two-beat steps to warm up, then the quick part, then a flourish
const PATTERN = [2, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2]

export class Rhythm extends Minigame {
  constructor(side, { title, sub = '', bpm = 156, lead = 2.4, travel = 1.5, perfect = 0.09, good = 0.17, onHit, onMiss } = {}) {
    super(side, 'mg-rhythm', `<div class="mg-title">${title}</div><div class="mg-sub">${fmt(sub)}</div>
      <div class="mg-lanes">${LANES.map((l, i) => `<div class="mg-lane" data-l="${i}"><div class="tgt">${l.icon}</div></div>`).join('')}</div>
      <div class="mg-say"></div><div class="mg-combo"></div><div class="mg-hype"><i></i></div>
      <div class="mg-pad">${LANES.map((l, i) => `<button data-l="${i}">${l.icon}</button>`).join('')}</div>
      <div class="mg-hint">${fmt('Săgețile (sau [W][A][S][D]) când săgeata ajunge pe linie')}</div>`)
    Object.assign(this, { travel, perfect, good, onHit, onMiss })
    const beat = 60 / bpm
    this.notes = []
    let t = lead, last = -1, same = 0
    // (a self-playing test run only needs the first bars)
    for (const b of side.auto ? PATTERN.slice(0, 10) : PATTERN) {
      let lane = Math.floor(Math.random() * 4)
      if (lane === last && ++same > 1) lane = (lane + 1 + Math.floor(Math.random() * 3)) % 4
      else if (lane !== last) same = 0
      last = lane
      const n = { t, lane, el: el('div', 'mg-note l' + lane, LANES[lane].icon), state: 0 }
      this.$(`.mg-lane[data-l="${lane}"]`).appendChild(n.el)
      this.notes.push(n)
      t += b * beat
    }
    this.end = t + 0.6
    this.hits = 0; this.perfects = 0; this.combo = 0; this.best = 0; this.hype = 0.4; this.score = 0
    this.laneH = 0
    // touch: the arrow buttons press virtual keys
    for (const b of this.el.querySelectorAll('.mg-pad button')) {
      const code = 'TouchL' + b.dataset.l
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.game.input.pressedSet.add(code) }, { passive: false })
      b.addEventListener('mousedown', () => this.game.input.pressedSet.add(code))
    }
    this.say('PREGĂTEȘTE-TE…', 'ok')
  }
  update(dt) {
    super.update(dt)
    if (this.done) return
    const now = this.t
    if (!this.laneH) this.laneH = this.$('.mg-lane')?.clientHeight || 250
    const H = this.laneH - 60, input = this.game.input
    const fresh = this.pf !== this.game.frame
    this.pf = this.game.frame
    // presses per lane (once per frame)
    for (let l = 0; l < 4; l++) {
      let press = this.auto || !fresh ? false : LANES[l].keys.some((k) => input.keyPressed(k))
      if (this.auto === 'win') press = this.notes.some((n) => n.lane === l && !n.state && n.t <= now + 0.02 && now - n.t < this.good)
      if (!press) continue
      const lane = this.$(`.mg-lane[data-l="${l}"]`)
      lane.classList.add('hit'); setTimeout(() => lane.classList.remove('hit'), 90)
      let best = null, bd = 9
      for (const n of this.notes) { if (n.state || n.lane !== l) continue; const d = Math.abs(n.t - now); if (d < bd) { bd = d; best = n } }
      if (best && bd <= this.good) {
        best.state = 1
        best.el.classList.add('gone')
        const perfect = bd <= this.perfect
        this.hits++; this.combo++; this.best = Math.max(this.best, this.combo)
        if (perfect) this.perfects++
        this.score += perfect ? 100 : 50
        this.hype = Math.min(1, this.hype + (perfect ? 0.07 : 0.04))
        this.say(perfect ? 'PERFECT!' : 'BINE!', perfect ? '' : 'ok')
        this.onHit?.(l, perfect, this.combo)
      } else if (bd > 0.3) {
        // a press on nothing: the crowd noticed
        this.combo = 0
        this.hype = Math.max(0, this.hype - 0.03)
      }
    }
    // notes falling; the ones nobody hit
    for (const n of this.notes) {
      if (n.state) continue
      const k = 1 - (n.t - now) / this.travel
      if (now - n.t > this.good) {
        n.state = 2
        n.el.classList.add('gone')
        this.combo = 0
        this.hype = Math.max(0, this.hype - 0.09)
        this.say('RATAT!', 'bad')
        this.onMiss?.(n.lane)
        continue
      }
      n.el.style.display = k < -0.05 ? 'none' : ''
      if (k >= -0.05) n.el.style.transform = `translateY(${(Math.min(1.1, k) * H).toFixed(1)}px)`
    }
    this.$('.mg-combo').textContent = this.combo >= 3 ? `COMBO ×${this.combo}` : ''
    this.$('.mg-hype i').style.transform = `scaleX(${this.hype.toFixed(3)})`
    if (now > this.end) {
      const total = this.notes.length
      this.finish({ hits: this.hits, perfects: this.perfects, total, ratio: this.hits / total, full: this.hits === total, best: this.best, score: this.score })
    }
  }
}

// run a minigame inside a mission step; gone with the mission if it fails. It runs on real time
// in small slices, so a slow frame (or the dev turbo) never skips a note or a needle's sweep.
export async function play(m, mg) {
  const g = m.game
  // tracked for the cleanup only (a tracked object with update() would also get the whole frame)
  m.track({ dispose: () => mg.dispose() })
  const tick = m.every(() => {
    let dt = Math.min(0.5, g.rawDt || 1 / 60)
    while (dt > 1e-4 && !mg.done) { const h = Math.min(0.05, dt); mg.update(h); dt -= h }
    return mg.done
  })
  await m.until(() => mg.done)
  m.untrack(tick)
  return mg.result
}
