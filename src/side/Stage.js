import { fmt } from '../ui/UI.js'
import { TIERS, STREAK } from '../data/goals.js'
import '../styles/goals.css'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const nf = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// what a card must never sit on or share the screen with: dialogues and shop panels, the big
// banners (mission passed, rank up, chapter cards, WASTED), the AURA level-up, a minigame,
// the race countdown, the district name along the bottom
const TOP_BUSY = '.bigmsg, .chapter, .evidence, .lvlup, .overlay-msg, .countdown, .district-banner, .dialog, .credits, .mbanner, .lp, .savepick, .confirm'

// The one slot where the side content's cards appear: an achievement unlocked, the daily bonus, a
// currency explained the first time you earn it, a new respect tier. One card at a time, in the
// order they came, each once there's been a calm second (no dialogue, cutscene, pause or photo
// mode, nothing big on screen). Anything that turns up while a card is showing puts it on hold
// (hidden, its clock stopped) until it's gone again. Cards sit low in the middle, in the widest
// free stretch between the minimap and whatever is on the right (the speedo, touch buttons).
export class Stage {
  constructor(side) {
    this.side = side
    this.game = side.game
    this.root = el('div', 'gstage')
    this.game.ui.hud.appendChild(this.root)
    this.queue = []
    this.cur = null
    this.calmT = 0
    this.gapT = 0
    this.frozen = false
  }

  get busy() { return !!this.cur || this.queue.length > 0 }

  push(card) { this.queue.push(card); return card }

  // dev/screenshots: the current card stays up, without its animations
  freeze(on) { this.frozen = !!on; this.root.classList.toggle('freeze', this.frozen) }

  blocked() {
    const g = this.game, ui = g.ui
    if (g.paused || ui.modalOpen || ui.panel || g.cutscene || g.photoMode || !g.player?.control || g.director?.handlingDown || !ui.hudVisible) return true
    // the prologue has its own pacing: its lessons come first
    if (g.story?.active?.def.id === 'sosire') return true
    return !!(ui.top.querySelector(TOP_BUSY) || this.side.ui.root.querySelector('.mg:not(.over)'))
  }

  update(dt) {
    const c = this.cur
    // nothing to show: nothing to look at (a new card still waits for a calm second)
    if (!c && !this.queue.length) { this.calmT = 0; return }
    const raw = this.game.rawDt || dt
    const blocked = this.blocked()
    if (c) {
      // (a tall card also steps aside for a subtitle that starts under it)
      const hold = blocked || (c.tall && this.game.ui.subText)
      if (hold && !this.frozen) { if (!c.held) { c.held = true; c.el.classList.add('held') } return }
      if (c.held) { c.held = false; c.el.classList.remove('held') }
      // got into a car (or out of one) while it's up: out of the speedo's way
      const car = this.carOn()
      if (car !== c.car) { c.car = car; this.place(c.el) }
      if (this.frozen) return
      c.t += raw
      if (c.roll) this.roll(c)
      if (c.t > c.dur) this.dismiss()
      return
    }
    this.calmT = blocked ? 0 : this.calmT + raw
    if (this.gapT > 0) this.gapT -= raw
    // tall cards also wait for a subtitle to finish (they'd reach up into it)
    const next = this.queue[0]
    if (!next || this.calmT < 0.9 || this.gapT > 0 || (next.tall && this.game.ui.subText)) return
    this.show(this.merged() || this.queue.shift())
  }

  // four or more achievements waiting in a row (a long cutscene, a big payday): one card for all
  merged() {
    let n = 0
    while (this.queue[n]?.kind === 'ach') n++
    if (n < 4) return null
    const list = this.queue.splice(0, n)
    const lei = list.reduce((s, c) => s + (c.reward?.lei || 0), 0)
    return { kind: 'summary', kick: 'REALIZĂRI DEBLOCATE', title: `${n} realizări noi!`, icons: list.map((c) => c.icon), lei, roll: true, dur: 5, onShow: list.find((c) => c.gold)?.onShow || list[0].onShow }
  }

  show(c) {
    c.t = 0
    c.dur = c.dur || 4.2
    // several achievements waiting: move them along a little faster
    if (c.kind === 'ach' && this.queue.filter((q) => q.kind === 'ach').length >= 2) c.dur = Math.min(c.dur, 2.8)
    c.el = el('div', `gcard ${c.kind}${c.tone ? ' ' + c.tone : ''}`, this.html(c))
    if (this.frozen) c.el.classList.add('freeze')
    this.root.innerHTML = ''
    this.root.appendChild(c.el)
    c.car = this.carOn()
    this.place(c.el)
    this.cur = c
    // (frozen for a screenshot: the numbers at their final value)
    if (this.frozen && c.roll) { c.t = 1; this.roll(c); c.t = 0 }
    c.onShow?.(c)
  }

  dismiss() {
    const c = this.cur
    if (!c) return
    this.cur = null
    this.gapT = 0.35
    c.el.classList.add('out')
    setTimeout(() => c.el.remove(), 450)
  }

  clear() { this.queue = []; if (this.cur) { this.cur.el.remove(); this.cur = null } }

  carOn() { const v = this.game.ui.vehEl; return !!v && !v.classList.contains('hidden') }

  // the widest free stretch along the bottom: right of the minimap column, left of the speedo
  // (driving) or the touch buttons; centred on the screen when it fits there
  place(e) {
    const ui = this.game.ui, W = window.innerWidth
    const bl = ui.hud.querySelector('.hud-bl')?.getBoundingClientRect()
    let x0 = bl && bl.width ? bl.right + 12 : 12, x1 = W - 12
    const car = this.carOn() ? ui.vehEl.getBoundingClientRect() : null
    if (car && car.width) x1 = Math.min(x1, car.left - 12)
    const tb = document.querySelector('.touch-ui .tbtns')?.getBoundingClientRect()
    if (tb && tb.width) x1 = Math.min(x1, tb.left - 8)
    let w = Math.max(220, Math.min(460, x1 - x0)), left
    // centred on the screen if it still reads well there (a little narrower), else in the gap
    const cw = Math.min(w, 2 * Math.min(W / 2 - x0, x1 - W / 2))
    if (cw >= 340) { w = cw; left = W / 2 - w / 2 } else left = Math.max(8, x0 + (x1 - x0 - w) / 2)
    e.style.width = Math.round(w) + 'px'
    e.style.left = Math.round(left) + 'px'
  }

  // ---- the cards ---------------------------------------------------------------------------------------
  html(c) {
    if (c.kind === 'ach') {
      const tier = c.tiers > 1 ? TIERS[c.tier] : null
      const kick = c.hidden ? 'REALIZARE ASCUNSĂ' : 'REALIZARE DEBLOCATĂ'
      const rw = this.rewardLine(c.reward)
      return `<div class="shine"></div><div class="medal ${tier ? tier.key : c.gold ? 'aur' : 'single'}"><span>${c.icon}</span></div>
        <div class="bd"><div class="k">${kick}${tier ? ` · <b>${tier.icon} ${tier.name.toUpperCase()}</b>` : ''}</div>
        <div class="t">${c.name}</div>
        <div class="r">${rw}<span class="n">${c.count}/${c.total}</span></div></div>`
    }
    if (c.kind === 'summary') {
      return `<div class="shine"></div><div class="medal aur"><span>🏆</span></div>
        <div class="bd"><div class="k">${c.kick || 'REALIZĂRI DEBLOCATE'}</div>
        <div class="t">${c.title}</div>
        <div class="r"><span class="icons">${c.icons.slice(0, 8).join(' ')}</span>${c.lei ? `<span class="g roll" data-to="${c.lei}">+0</span> <i>lei</i>` : ''}</div></div>`
    }
    if (c.kind === 'explain') {
      return `<div class="ic">${c.icon}</div><div class="bd"><div class="k">NOU · <b>${c.title}</b></div>
        <div class="x">${fmt(c.text)}</div><div class="f">${fmt(c.foot || '')}</div></div>`
    }
    if (c.kind === 'respect') {
      return `<div class="ic">${c.icon}</div><div class="bd"><div class="k">RESPECT NOU · <b>${c.who.toUpperCase()}</b></div>
        <div class="t">${c.tierName}</div><div class="x">${fmt(c.text)}</div></div>`
    }
    if (c.kind === 'streak') {
      const days = STREAK.map((r, i) => {
        const cls = i + 1 < c.day ? 'got' : i + 1 === c.day ? 'now' : ''
        return `<div class="d ${cls}"><small>${i + 1}</small><b>${i + 1 < c.day ? '✔' : r.mama ? '🎁' : nf(r.lei)}</b></div>`
      }).join('')
      const r = c.reward
      return `<div class="shine"></div><div class="bd"><div class="k">🔥 BONUS ZILNIC · <b>ZIUA ${c.day}</b>${c.week > 1 ? ` · săptămâna ${c.week}` : ''}</div>
        <div class="days">${days}</div>
        <div class="r"><span class="g roll" data-to="${r.lei}">+0</span> <i>lei</i>${r.aura ? ` · <span class="a roll" data-to="${r.aura}">+0</span> <i>AURA</i>` : ''}${r.mama ? ' · 🎁 pachetul de la mama' : ''}</div>
        <div class="f">${c.next}</div></div>`
    }
    return ''
  }

  rewardLine(r) {
    if (!r) return ''
    const parts = []
    if (r.lei) parts.push(`<span class="g roll" data-to="${r.lei}">+0</span> <i>lei</i>`)
    if (r.clothesName) parts.push(`👕 ${r.clothesName}`)
    return parts.join(' · ') + ' '
  }

  // numbers on a card count up from zero while it slides in
  roll(c) {
    const k = Math.min(1, c.t / 0.8), e = 1 - (1 - k) ** 3
    for (const n of c.el.querySelectorAll('.roll')) {
      const to = +n.dataset.to
      const v = '+' + nf(to * e)
      if (n.textContent !== v) n.textContent = v
    }
  }
}
