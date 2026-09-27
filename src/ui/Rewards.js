import '../styles/rewards.css'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const nf = (n) => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const LIFE = 2.5        // s a chip stays up (a merge adds a little)
const STAGGER = 150     // ms between two chips coming in: a cascade, not a pile
const MAX = 4           // chips on screen at once; the rest wait their turn
const ROLL = 480        // ms for the number to count up

// The reward chips under the money: "+25 XP", "−50 lei", "+2 👊 respect gopnici", "+60 AURA".
// Every gain or loss of lei, XP, respect (and AURA handed out quietly: bonuses, achievements) shows
// here the moment it happens, dialogue or not. Chips come in one after another, the same kind
// within a blink merges into one, and none is ever drawn over the dialogue box: while one is open,
// only as many as fit above it are shown, the others wait (and the notifications under the chips
// that would reach into it step aside until it closes).
export class RewardStack {
  // fmt: UI's little markup ({y}…{/y}, [E]), passed in so this file doesn't import UI.js back
  constructor(ui, parent, before, fmt) {
    this.ui = ui
    this.game = ui.game
    this.fmt = fmt
    this.root = el('div', 'rw-stack')
    parent.insertBefore(this.root, before)
    this.queue = []
    this.live = []
    this.nextAt = 0
  }

  // kind: lei | xp | respect | aura | goal | seed; n: the amount (signed)
  push(kind, n, o = {}) {
    n = Math.round(n)
    if (!n && kind !== 'goal' && kind !== 'seed') return
    const key = kind + (o.k || '') + (n < 0 ? '-' : '+') + (o.tier ? '!' : '')
    const now = performance.now()
    // the same thing again within a blink: one chip with the sum (three fines, a fare and its tip)
    const same = [...this.queue, ...this.live].reverse().find((c) => c.key === key && now - c.t0 < 700 && !c.out && kind !== 'goal' && kind !== 'seed')
    if (same) {
      same.n += n
      same.t0 = now
      if (o.why) same.why = o.why
      if (same.el) { same.life += 0.4; this.paint(same, true) }
      return
    }
    this.queue.push({ kind, n, key, t0: now, why: o.why || '', o, life: LIFE + (o.tier ? 1.2 : 0) })
  }

  // where the dialogue box starts (chips must stay above it); null when there's none. The card,
  // not .dialog: that's a full-screen layer (the shade behind the box)
  dialogTop() {
    const d = this.ui.top.querySelector('.dialog .card') || this.ui.top.querySelector('.dialog')
    return d ? d.getBoundingClientRect().top : null
  }

  // dev/screenshots: chips stay up, numbers at their final value (a slow capture would miss them)
  freeze(on) { this.frozen = !!on; this.root.classList.toggle('freeze', this.frozen) }

  update() {
    const now = performance.now()
    // chips that have had their time fade out, then fold away
    for (const c of [...this.live]) {
      if (this.frozen) { if (c.roll) { c.born = now - ROLL - 100; this.paint(c) } continue }
      if (!c.out && now - c.born > c.life * 1000) {
        c.out = true
        c.el.classList.add('out')
        setTimeout(() => { c.el.remove(); this.live.splice(this.live.indexOf(c), 1) }, 380)
      }
      if (c.roll && now - c.born < ROLL + 60) this.paint(c)
    }
    const toasts = this.ui.toastsEl?.children || []
    const dTop = this.live.length || this.queue.length || toasts.length ? this.dialogTop() : null
    // a dialogue opened under chips (or the notifications below them) that were already up: tuck
    // away the ones in its way until it's gone
    for (const e of [...this.live.map((c) => c.el), ...toasts]) {
      if (dTop != null) e.classList.toggle('tuck', e.getBoundingClientRect().bottom > dTop - 6)
      else if (e.classList.contains('tuck')) e.classList.remove('tuck')
    }
    if (!this.queue.length || (now < this.nextAt && !this.frozen)) return
    if (this.live.filter((c) => !c.out).length >= MAX) return
    // room check: the next chip must end above the dialogue box
    if (dTop != null) {
      const r = this.root.getBoundingClientRect()
      if (r.bottom + 34 > dTop - 6) return
    }
    const c = this.queue.shift()
    this.show(c, now)
    this.nextAt = now + STAGGER
  }

  show(c, now) {
    const o = c.o
    c.born = now
    c.roll = Math.abs(c.n) >= 10
    const tone = c.kind === 'lei' ? (c.n > 0 ? 'lei' : 'lei neg') : c.kind === 'respect' ? `resp ${o.k || ''}${c.n < 0 ? ' neg' : ''}` : c.kind
    c.el = el('div', `rw-chip ${tone}${o.tier ? ' big' : ''}`, '<b class="v"></b><span class="w"></span>')
    this.root.appendChild(c.el)
    this.live.push(c)
    this.paint(c)
    // a soft blip for what has no sound of its own (lei rings the till already)
    const au = this.game.audio
    if (c.kind === 'xp') au?.sfx('coin', { bus: 'ui', vol: 0.28, pitch: 1.5 })
    else if (c.kind === 'aura') au?.sfx('coin', { bus: 'ui', vol: 0.3, pitch: 1.25 })
    else if (c.kind === 'respect' && !o.tier) au?.sfx(c.n > 0 ? 'toggle' : 'error', { bus: 'ui', vol: c.n > 0 ? 0.4 : 0.25 })
  }

  // the chip's text; the number counts up over its first half second
  paint(c, bump = false) {
    const o = c.o
    const k = c.roll ? Math.min(1, (performance.now() - c.born) / ROLL) : 1
    const e = 1 - (1 - k) ** 3
    const v = c.n * e
    const sign = c.n < 0 ? '−' : '+'
    let big = '', small = c.why
    if (c.kind === 'lei') big = `${sign}${nf(v)} <i>lei</i>`
    else if (c.kind === 'xp') big = `⭐ ${sign}${nf(v)} <i>XP</i>`
    else if (c.kind === 'aura') big = `✨ ${sign}${nf(v)} <i>AURA</i>`
    else if (c.kind === 'respect') {
      big = `${o.icon || '🤝'} ${sign}${nf(v)} <i>respect ${o.who || ''}</i>`
      small = o.tier ? `${o.down ? '▼' : '▲'} ${o.tier}${c.why ? ' · ' + c.why : ''}` : c.why
    } else if (c.kind === 'goal' || c.kind === 'seed') { big = o.text || ''; small = o.sub || '' }
    const w = c.el.querySelector('.w'), b = c.el.querySelector('.v')
    const html = this.fmt(big)
    if (b._h !== html) { b._h = html; b.innerHTML = html }
    if (w._h !== small) { w._h = small; w.innerHTML = small ? this.fmt(small) : ''; w.style.display = small ? '' : 'none' }
    if (bump) { c.el.classList.remove('bump'); void c.el.offsetWidth; c.el.classList.add('bump') }
  }

  clear() {
    this.queue = []
    for (const c of this.live) c.el.remove()
    this.live = []
  }
}
