import { fmt } from '../ui/UI.js'
import { CAST } from '../data/outfits.js'
import { SPEAKERS } from './cast.js'
import { fill } from './hero.js'
import '../styles/story.css'

// The hero's phone. A call shows a caller card (portrait, name, the line being said) and plays
// in the caller's voice; a text pops up and goes. Nothing here takes control away: you keep
// driving while someone talks. Calls between missions wait in a queue for a calm moment (no
// story mission, cutscene, dialogue, pause or big card on screen): they end missions on a hook
// and bring the favours. Calls inside a mission (m.call) are the banter on a long drive and play
// at once. Everything runs on game time, so the pause menu holds a call where it is.

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// big cards that own the screen for a moment: a call waits for them to go
const BUSY = '.bigmsg, .chapter, .evidence, .lvlup, .rate-card, .overlay-msg, .credits'

export class Phone {
  constructor(game, story) {
    this.game = game
    this.story = story
    this.queue = []
    this.cur = null
    this.gapT = 0
    this.log = []            // everything that went through, oldest first (tests read it)
    this.el = null
  }

  build() {
    if (this.el) return
    const ui = this.game.ui
    this.el = el('div', 'phone hidden', '<div class="ph-top"><span class="ph-app"></span><span class="ph-t"></span></div><div class="ph-who"><div class="ph-pic"></div><div class="ph-name"></div></div><div class="ph-line"></div>')
    ui.hud.appendChild(this.el)
    const q = (s) => this.el.querySelector(s)
    this.$ = { app: q('.ph-app'), t: q('.ph-t'), pic: q('.ph-pic'), name: q('.ph-name'), line: q('.ph-line') }
  }

  // a speaker id (cast.js) or { name, role, spec, voice }; 'player' is the hero
  who(w) {
    if (w && typeof w === 'object') return w
    if (w === 'player') {
      const g = this.game, pr = g.progress
      return { id: 'player', name: pr.name, role: 'tu', spec: g.player?.char?.spec || CAST[pr.type], voice: pr.perk?.female ? { pitch: 1.05, type: 'female' } : { pitch: 1, type: 'male' } }
    }
    return SPEAKERS[w] || { name: String(w || '') }
  }

  // queue a call between missions; lines: strings (the caller) or { who, text } (a reply).
  // opts: delay (calm seconds before it rings), id, dropped (the line goes dead), priority
  // (jumps the queue: the story's own hooks), onEnd (after it's over, even if cut short)
  call(who, lines, opts = {}) { return this.push({ kind: 'call', who, lines: Array.isArray(lines) ? lines : [lines], ...opts }) }
  sms(who, text, opts = {}) { return this.push({ kind: 'sms', who, lines: [text], ...opts }) }
  // a post in the neighbours' group chat (who: the neighbour's name, as the group shows it)
  viber(who, text, opts = {}) { return this.push({ kind: 'viber', who, lines: [text], ...opts }) }

  push(item) {
    const p = new Promise((res) => { item.resolve = res })
    item.delay ??= 0
    if (item.priority) {
      // after the other priority items, ahead of the favours
      const i = this.queue.findIndex((q) => !q.priority)
      this.queue.splice(i < 0 ? this.queue.length : i, 0, item)
    } else this.queue.push(item)
    return p
  }

  // a call (or text) during a mission: it starts as soon as the screen is free, ahead of
  // anything waiting, and a call between missions that's still going gives way to it
  now(item) {
    item.during = true
    item.delay ??= 0
    if (this.cur && !this.cur.during) this.finish(true)
    const p = new Promise((res) => { item.resolve = res })
    const i = this.queue.findIndex((q) => !q.during)
    this.queue.splice(i < 0 ? this.queue.length : i, 0, item)
    return { done: p, stop: () => this.stop(item) }
  }

  stop(item) {
    if (this.cur === item) { this.finish(true); return }
    const i = this.queue.indexOf(item)
    if (i >= 0) { this.queue.splice(i, 1); item.resolve?.(false) }
  }

  has(id) { return (this.cur && this.cur.id === id) || this.queue.some((q) => q.id === id) }

  // a new game or a loaded save: whatever was waiting belongs to the old one
  clear() {
    for (const q of this.queue) q.resolve?.(false)
    this.queue = []
    if (this.cur) { const c = this.cur; this.cur = null; c.resolve?.(false); this.hide() }
    this.gapT = 0
  }

  calm(item) {
    const g = this.game, s = this.story
    if (g.state !== 'play' || g.paused || g.ui.modalOpen || g.cutscene || g.photoMode || g.director?.handlingDown) return false
    if (g.home?.inside && !item.during) return false
    if (g.ui.top.querySelector(BUSY)) return false
    if (!item.during && s.active && !s.active.def.activity) return false
    return true
  }

  update(dt) {
    if (this.cur) { this.tick(dt); return }
    if (this.gapT > 0) { this.gapT -= dt; return }
    const it = this.queue[0]
    if (!it) return
    // an in-mission call whose mission is over is dropped
    if (it.during && (!this.story.active || this.story.active.failed)) { this.queue.shift(); it.resolve?.(false); return }
    if (!this.calm(it)) { it.calmT = 0; return }
    it.calmT = (it.calmT || 0) + dt
    if (it.calmT < Math.max(it.during ? 0 : 0.8, it.delay)) return
    this.queue.shift()
    // the neighbours' Viber group (src/side draws it, top left): posted, and on to the next
    if (it.kind === 'viber') {
      this.game.side?.ui.viber(it.who, fill(this.game, it.lines[0]))
      this.done(it, false)
      this.gapT = this.game.autoTalk ? 0.3 : 6
      return
    }
    this.start(it)
  }

  secs(text) { return this.game.autoTalk ? 0.3 : clamp(1.4 + String(text).length * 0.05, 2.2, 6.5) }

  start(it) {
    this.build()
    const g = this.game
    this.cur = it
    const sp = this.who(it.who)
    it.sp = sp
    const url = sp.spec && g.portraits ? g.portraits.get({ id: sp.id || sp.name, spec: sp.spec }) : null
    const $ = this.$
    $.pic.style.backgroundImage = url ? `url(${url})` : ''
    $.pic.textContent = url ? '' : it.kind === 'sms' ? '💬' : '👤'
    $.name.innerHTML = `${sp.name || ''}${sp.role ? `<small>${sp.role}</small>` : ''}`
    this.el.className = 'phone ' + it.kind
    if (it.kind === 'sms') {
      $.app.textContent = '💬 MESAJ'
      $.t.textContent = g.renderer?.tod?.clock || ''
      $.line.innerHTML = fmt(fill(g, it.lines[0]))
      it.phase = 'sms'
      it.t = g.autoTalk ? 0.4 : clamp(2.6 + String(it.lines[0]).length * 0.045, 4.2, 8.5)
      g.audio?.sfx('notify', { bus: 'ui', vol: 0.9 })
    } else {
      this.el.classList.add('ringing')
      $.app.textContent = '📱 APEL'
      $.t.textContent = 'sună…'
      $.line.innerHTML = '<span class="ph-state">Sună…</span>'
      it.phase = 'ring'
      it.t = g.autoTalk ? 0.2 : 1.5
      g.audio?.sfx('phone_ring', { bus: 'ui', vol: 0.8 })
    }
    g.events.emit('phone:start', { id: it.id || null, kind: it.kind, from: sp.name })
  }

  line() {
    const c = this.cur, g = this.game
    const L = c.lines[c.i]
    const text = fill(g, typeof L === 'string' ? L : L.text)
    const who = typeof L === 'string' ? c.sp : this.who(L.who)
    this.$.line.innerHTML = `${who !== c.sp ? `<b>${who.name}:</b>` : ''}${fmt(text)}`
    c.t = this.secs(text)
    if (who.voice && g.audio && !g.autoTalk) {
      const stop = g.audio.voiceStart(who.voice, text)
      if (stop) setTimeout(() => stop(), Math.min(c.t, 3) * 1000)
    }
  }

  tick(dt) {
    const c = this.cur
    // a story mission (or a cutscene) cutting in ends a call between missions early
    if (!c.during && ((this.story.active && !this.story.active.def.activity) || this.game.cutscene)) { this.finish(true); return }
    if (c.during && (!this.story.active || this.story.active.failed)) { this.finish(true); return }
    // a cutscene or a dialogue in the mission: the caller waits for it, out of sight
    const held = this.game.cutscene || this.game.ui.modalOpen
    if (this.el.style.visibility !== (held ? 'hidden' : '')) this.el.style.visibility = held ? 'hidden' : ''
    if (held) return
    c.t -= dt
    if (c.t > 0) return
    if (c.phase === 'ring') {
      this.el.classList.remove('ringing')
      this.$.t.textContent = 'în apel'
      c.phase = 'talk'; c.i = 0
      this.line()
    } else if (c.phase === 'talk') {
      c.i++
      if (c.i < c.lines.length) this.line()
      else {
        c.phase = 'end'
        c.t = this.game.autoTalk ? 0.2 : c.dropped ? 1.8 : 0.7
        if (c.dropped) {
          this.el.classList.add('drop')
          this.$.app.textContent = '📵 APEL'
          this.$.line.innerHTML = '<span class="ph-state">Apel întrerupt.</span>'
          this.game.audio?.sfx('error', { bus: 'ui', vol: 0.8 })
        } else this.$.t.textContent = 'închis'
      }
    } else this.finish()
  }

  finish(cut = false) {
    const c = this.cur
    if (!c) return
    this.cur = null
    this.hide()
    this.gapT = 1.2
    this.done(c, cut)
  }

  done(c, cut) {
    const from = c.sp?.name || (typeof c.who === 'string' ? SPEAKERS[c.who]?.name || c.who : c.who?.name) || ''
    this.log.push({ id: c.id || null, kind: c.kind, from, cut, t: Math.round(performance.now()) })
    if (this.log.length > 60) this.log.shift()
    this.game.events.emit('phone:done', { id: c.id || null, kind: c.kind, from, cut })
    // a call between missions cut short by a mission still did its job (the offer is on the map)
    try { c.onEnd?.(cut) } catch (e) { console.error(e) }
    c.resolve?.(true)
  }

  hide() {
    if (!this.el || this.el.classList.contains('hidden')) return
    const e = this.el
    e.style.visibility = ''
    e.classList.add('out')
    setTimeout(() => { if (!this.cur) { e.classList.add('hidden'); e.classList.remove('out') } else e.classList.remove('out') }, 320)
  }
}
