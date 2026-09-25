import * as THREE from 'three'
import { fmt } from '../ui/UI.js'
import { TITLES, LEVEL_REWARDS, PERKS, FLAGS, MAX_LEVEL, levelLei, levelStart, UP, DOWN, CHALLENGE_REWARD, DAILY_BONUS } from '../data/aura.js'
import { CLOTHES } from '../data/wardrobe.js'
import { WEAPONS } from '../data/weapons.js'
import { challengeDef } from './Challenges.js'
import '../styles/side.css'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const nf = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const _v = new THREE.Vector3()

// Everything the side content shows: the aura chip above the minimap (level, title, progress,
// streak), the +/−AURA pops, the stunt combo counter, the level-up card, a small feed for
// challenges and hints, the neighbours' Viber group announcing street events, the event marker,
// and the Aura tab of the pause menu. DOM only changes when a value does.
export class SideUI {
  constructor(side) {
    this.side = side
    this.game = side.game
    const ui = this.game.ui
    this.root = el('div', 'side-hud')
    ui.hud.appendChild(this.root)
    const bl = ui.hud.querySelector('.hud-bl') || ui.hud
    this.chip = el('div', 'aura-chip', `<div class="lv"><b>1</b><small>NV</small></div>
      <div class="info"><div class="ttl"></div><div class="bar"><i></i></div></div>
      <div class="amt"><b>0</b><small>AURA</small></div>
      <div class="streak hidden"><span>🔥</span><b>×1</b><i></i></div>`)
    this.feedEl = el('div', 'side-feed')
    bl.insertBefore(this.chip, bl.firstChild)
    bl.insertBefore(this.feedEl, this.chip)
    this.pops = el('div', 'aura-pops')
    this.root.appendChild(this.pops)
    this.stunt = el('div', 'stunt hidden', `<div class="st-live"></div><div class="st-main"><span class="pts"></span><span class="x"></span></div><div class="st-list"></div><div class="st-bar"><i></i></div>`)
    this.root.appendChild(this.stunt)
    const tl = ui.hud.querySelector('.hud-tl') || ui.hud
    this.viberEl = el('div', 'viber hidden')
    tl.appendChild(this.viberEl)
    this.mark = el('div', 'offer-mark hidden', '<div class="ic"></div><div class="d"></div>')
    ui.world.appendChild(this.mark)
    this.cache = {}
    const q = (e, sel) => e.querySelector(sel)
    this.$ = {
      lv: q(this.chip, '.lv b'), ttl: q(this.chip, '.ttl'), amt: q(this.chip, '.amt b'), bar: q(this.chip, '.bar i'),
      streak: q(this.chip, '.streak'), streakX: q(this.chip, '.streak b'), streakBar: q(this.chip, '.streak i'),
      stLive: q(this.stunt, '.st-live'), stPts: q(this.stunt, '.pts'), stX: q(this.stunt, '.x'), stList: q(this.stunt, '.st-list'), stBar: q(this.stunt, '.st-bar i'),
      markD: q(this.mark, '.d'), markIc: q(this.mark, '.ic'),
    }
  }

  // ---- the chip: level, title, progress, streak ---------------------------------------------------------------
  update() {
    const a = this.side.aura, s = a.s, c = this.cache, $ = this.$
    const lv = s.level
    if (c.lv !== lv) { c.lv = lv; $.lv.textContent = lv; $.ttl.textContent = a.title.name }
    if (c.total !== s.total) {
      c.total = s.total
      $.amt.textContent = nf(s.total)
      $.bar.style.transform = `scaleX(${a.progress.toFixed(3)})`
    }
    const m = a.mult
    const on = a.streak > 0 && a.streakT > 0
    if (c.streakOn !== on) { c.streakOn = on; $.streak.classList.toggle('hidden', !on) }
    if (on) {
      const txt = '×' + (Math.round(m * 100) / 100).toString().replace('.', ',')
      if (c.mult !== txt) { c.mult = txt; $.streakX.textContent = txt; this.bump($.streakX) }
      const k = (Math.max(0, a.streakT / 7)).toFixed(2)
      if (c.sk !== k) { c.sk = k; $.streakBar.style.transform = `scaleX(${k})` }
    }
    this.updateMark()
  }

  bump(e) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump') }

  // dev/screenshots: keep pops, cards and the combo on screen (a slow capture would miss them)
  freeze(on) { this.frozen = !!on; this.root.classList.toggle('freeze', this.frozen) }
  later(fn, ms) { if (!this.frozen) return setTimeout(fn, ms) }

  // ---- +/− AURA ---------------------------------------------------------------------------------------------
  pop(n, why, { mult = 1, cringe = false, big = false } = {}) {
    const now = performance.now()
    const last = this.pops.lastElementChild
    // the same reason twice in a blink is one pop (three KOs from one swing)
    if (last && last._why === why && now - last._t < 700 && !cringe === !last._cringe) {
      last._n += n; last._t = now
      last.querySelector('.n b').textContent = (n > 0 ? '+' : '−') + Math.abs(last._n)
      this.bump(last)
    } else {
      const p = el('div', `apop ${cringe ? 'down' : 'up'}${big ? ' big' : ''}`, `<div class="n"><b>${n > 0 ? '+' : '−'}${Math.abs(n)}</b><small>AURA</small></div>${why || mult > 1 ? `<div class="why">${cringe ? '<span class="cr">CRINGE</span>' : ''}${fmt(why || '')}${mult > 1 ? ` <span class="m">×${String(Math.round(mult * 100) / 100).replace('.', ',')}</span>` : ''}</div>` : ''}`)
      p._why = why; p._n = n; p._t = now; p._cringe = cringe
      this.pops.appendChild(p)
      while (this.pops.children.length > 4) this.pops.firstChild.remove()
      this.later(() => p.remove(), big ? 2600 : 2000)
    }
    const au = this.game.audio
    if (cringe) { au?.sfx('error', { bus: 'ui', vol: 0.5 }); if (n <= -40) au?.sfx('crowd_boo', { vol: 0.45 }) }
    else au?.sfx(big ? 'coins_many' : 'coin', { bus: 'ui', vol: 0.5, pitch: 1 + Math.min(0.5, (this.side.aura.streak || 0) * 0.05) })
    this.bump(this.chip)
  }

  // ---- stunts --------------------------------------------------------------------------------------------------
  stuntShow() {
    const s = this.stunt
    clearTimeout(this.stuntOut)
    if (s.classList.contains('hidden') || s.classList.contains('done')) { s.className = 'stunt'; this.$.stLive.textContent = ''; this.cache.live = null }
  }

  stuntTrick(c, name, pts) {
    this.stuntShow()
    const s = this.stunt
    this.cache.live = null
    this.$.stLive.innerHTML = `${name} <b>+${nf(pts)}</b>`
    this.bump(this.$.stLive)
    this.$.stList.textContent = c.tricks.join(' · ')
    this.stuntNums(c, 0)
    this.bump(this.$.stX)
  }

  stuntNums(c, live) {
    const pts = nf(c.pts + live), x = '×' + Math.max(1, c.mult)
    if (this.cache.sp !== pts) { this.cache.sp = pts; this.$.stPts.textContent = pts }
    if (this.cache.sx !== x) { this.cache.sx = x; this.$.stX.textContent = x }
  }

  stuntTick(c, live, left) {
    if (!c.n && live < 20) return
    this.stuntShow()
    if (live > 0) {
      const st = this.side.stunts
      const name = st.driftT > 0 ? 'DRIFT' : st.wrongT > 0 ? 'CONTRASENS' : 'ZBOR'
      const txt = name + live
      if (this.cache.live !== txt) { this.cache.live = txt; this.$.stLive.innerHTML = `${name} <b>+${nf(live)}</b>` }
    }
    this.stuntNums(c, live)
    const k = Math.max(0, Math.min(1, left)).toFixed(2)
    if (this.cache.sb !== k) { this.cache.sb = k; this.$.stBar.style.transform = `scaleX(${k})` }
  }

  stuntBank(c, aura) {
    const s = this.stunt
    this.stuntShow()
    this.stuntNums(c, 0)
    this.$.stLive.innerHTML = `COMBO <b>+${aura} AURA</b>`
    s.classList.add('done')
    clearTimeout(this.stuntOut)
    this.stuntOut = this.later(() => s.classList.add('hidden'), 1500)
  }

  stuntFail() {
    const s = this.stunt
    this.stuntShow()
    this.$.stLive.innerHTML = '<b>BUȘIT!</b> combo pierdut'
    s.classList.add('done', 'fail')
    this.game.audio?.sfx('error', { bus: 'ui', vol: 0.45 })
    clearTimeout(this.stuntOut)
    this.stuntOut = this.later(() => s.classList.add('hidden'), 1400)
  }

  stuntClear() { this.stunt.classList.add('hidden') }

  // ---- the level-up moment ------------------------------------------------------------------------------------
  levelUp(level, title, newTitle, lines) {
    const top = this.game.ui.top
    top.querySelector('.lvlup')?.remove()
    const c = el('div', 'lvlup', `<div class="rays"></div><div class="card">
      <div class="k">NIVEL NOU</div><div class="lv">${level}</div>
      ${newTitle ? '<div class="tag">TITLU NOU</div>' : ''}<div class="t">${title.name}</div>
      ${newTitle ? `<div class="j">${title.joke}</div>` : ''}
      <ul>${lines.map((l) => `<li>${fmt(l)}</li>`).join('')}</ul></div>`)
    if (this.frozen) c.classList.add('freeze')
    top.appendChild(c)
    this.later(() => { c.classList.add('out'); setTimeout(() => c.remove(), 700) }, 4600)
  }

  // ---- the feed: challenge progress, hints, the odd perk ----------------------------------------------------------
  feed(html, secs = 3, cls = '') {
    const f = el('div', 'sfeed ' + cls, fmt(html))
    this.feedEl.appendChild(f)
    while (this.feedEl.children.length > 3) this.feedEl.firstChild.remove()
    this.later(() => { f.classList.add('out'); setTimeout(() => f.remove(), 400) }, secs * 1000)
  }

  challengeDone(it) {
    const bonus = it.kind === 'bonus'
    this.feed(`<div class="cd-k">${bonus ? '🏆 ZIUA E A TA' : '✔ PROVOCARE ÎNDEPLINITĂ'}</div><div class="cd-t">${it.icon || ''} ${it.title}</div><div class="cd-r">+${it.aura} AURA · +${it.lei} lei</div>`, bonus ? 5 : 4, 'done' + (bonus ? ' bonus' : ''))
  }

  // ---- the neighbours' group chat --------------------------------------------------------------------------------
  viber(who, text, secs = 9) {
    const v = this.viberEl
    v.innerHTML = `<div class="vh"><span class="app">💬 Viber</span><span class="grp">Blocul 7 · vecinii</span></div><div class="vm"><b>${who}:</b> ${fmt(text)}</div>`
    v.classList.remove('hidden', 'out')
    this.bump(v)
    this.game.audio?.sfx('notify', { bus: 'ui', vol: 0.8 })
    clearTimeout(this.viberT)
    this.viberT = this.later(() => { v.classList.add('out'); setTimeout(() => v.classList.add('hidden'), 450) }, secs * 1000)
  }

  hideViber() { clearTimeout(this.viberT); this.viberEl.classList.add('hidden') }

  // ---- the event marker (an offer you can walk up to) ------------------------------------------------------------
  setMark(o) {
    this.markOn = o || null
    this.mark.classList.toggle('hidden', !o)
    if (o) { this.$.markIc.textContent = o.icon || '❗'; this.cache.md = null }
  }

  updateMark() {
    const o = this.markOn
    if (!o) return
    const g = this.game
    const hide = g.home?.inside || g.cutscene
    this.mark.style.visibility = hide ? 'hidden' : ''
    if (hide) return
    _v.set(o.x, (o.y ?? 0.2) + 3.4, o.z).project(g.camera)
    const W = window.innerWidth, H = window.innerHeight
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H
    if (_v.z > 1) { x = W - x; y = H - y }
    const pad = 44, off = _v.z > 1 || x < pad || x > W - pad || y < pad || y > H - pad
    if (off) { x = Math.max(pad, Math.min(W - pad, x)); y = Math.max(pad + 24, Math.min(H - pad, y)) }
    this.mark.classList.toggle('edge', off)
    this.mark.style.left = x + 'px'; this.mark.style.top = y + 'px'
    const p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos
    const d = Math.round(Math.hypot(o.x - pp.x, o.z - pp.z)) + ' m'
    if (d !== this.cache.md) { this.cache.md = d; this.$.markD.textContent = d }
  }

  // ---- pause menu: the Aura tab ------------------------------------------------------------------------------------
  renderPause(body) {
    const side = this.side, a = side.aura, s = a.s, st = side.state.stats
    const col = el('div', 'col aura-tab')
    col.style.flex = '1.05'
    body.appendChild(col)
    const lv = s.level, t = a.title
    const next = TITLES.find((x) => x.from > lv)
    col.innerHTML = `<div class="au-head"><div class="au-badge"><b>${lv}</b><small>NIVEL</small></div>
      <div class="au-who"><div class="au-t">${t.name}</div><div class="au-j">${t.joke}</div>
      <div class="au-bar"><i style="transform:scaleX(${a.progress.toFixed(3)})"></i></div>
      <div class="au-n"><b>${nf(s.total)} AURA</b> · încă ${nf(a.toNext)} până la nivelul ${lv + 1}</div></div></div>
      ${next ? `<div class="au-next">Următorul titlu: <b>${next.name}</b>, la nivelul ${next.from}.</div>` : '<div class="au-next">Ai titlul suprem. De-acum, fiecare nivel e o stea în plus.</div>'}
      <div class="au-h">SCARA AUREI</div><div class="au-ladder"></div>`
    const lad = col.querySelector('.au-ladder')
    for (let L = 2; L <= MAX_LEVEL; L++) {
      const tt = TITLES.find((x) => x.from === L)
      if (tt) lad.appendChild(el('div', 'au-tier' + (lv >= L ? ' on' : ''), `${tt.name}`))
      const parts = [`💵 ${levelLei(L) + (LEVEL_REWARDS[L] || []).reduce((n, r) => n + (r.lei || 0), 0)} lei`]
      for (const r of LEVEL_REWARDS[L] || []) {
        if (r.clothes) { const c = CLOTHES.find((x) => x.id === r.clothes); if (c) parts.push(`👕 ${c.name}`) }
        if (r.weapon) parts.push(`${WEAPONS[r.weapon].icon} ${WEAPONS[r.weapon].name}`)
        if (r.flag) parts.push(`${FLAGS[r.flag].icon} ${r.flag === 'nitro' ? 'Nitro' : 'Acte false'}`)
        if (r.perk) parts.push(`${PERKS[r.perk].icon} ${PERKS[r.perk].name}`)
        if (r.respect) parts.push(`${r.respect[0] === 'gop' ? '👊' : '🥧'} +${r.respect[1]} respect`)
      }
      lad.appendChild(el('div', 'au-row' + (lv >= L ? ' got' : lv + 1 === L ? ' cur' : ''), `<span class="n">${lv >= L ? '✔' : L}</span><span class="r">${parts.join(' · ')}</span><span class="a">${nf(levelStart(L))}</span>`))
    }
    lad.appendChild(el('div', 'au-row', `<span class="n">★</span><span class="r">După nivelul ${MAX_LEVEL}: câte o stea și 300 de lei la fiecare nivel.</span><span class="a"></span>`))

    const col2 = el('div', 'col aura-tab')
    col2.style.flex = '1'
    body.appendChild(col2)
    this.renderDaily(col2)
    col2.appendChild(el('div', 'au-h', 'RECORDURI'))
    const rows = [
      ['Aură adunată de la început', nf(s.lifetime)], ['Aură pierdută pe cringe', nf(s.lost)],
      ['Cel mai tare combo', `${nf(st.bestCombo)} AURA${st.bestMult ? ` (×${st.bestMult})` : ''}`], ['Treceri la mustață', st.nearMiss],
      ['Întâmplări rezolvate', `${st.events}${st.eventsFailed ? ` (ratate: ${st.eventsFailed})` : ''}`], ['Provocări îndeplinite', st.challenges], ['Zile complete', st.fullDays],
    ]
    for (const [k, v] of rows) col2.appendChild(el('div', 'stat-row', `<span>${k}</span><span>${v}</span>`))
    col2.appendChild(el('div', 'au-h', 'CE ADUCE, CE STRICĂ'))
    const ups = [UP.fightWon, UP.escape, UP.fareClean, UP.pothole, UP.drip].map(([n, w]) => `<span class="g">+${n}</span> ${w}`)
    const downs = [DOWN.byGranny, DOWN.koGranny, DOWN.trolley, DOWN.fightLost, DOWN.bribe].map(([n, w]) => `<span class="r">−${n}</span> ${w}`)
    col2.appendChild(el('div', 'au-cheat', `<div>${ups.join('<br>')}</div><div>${downs.join('<br>')}</div>`))
    col2.appendChild(el('div', 'au-foot', 'Chestiile tari legate una după alta cresc seria (până la ×3). Cascadoriile cu mașina se adună într-un combo: drift, treceri la mustață, contrasens, zbor.'))
  }

  renderDaily(col) {
    const side = this.side, ch = side.challenges
    col.appendChild(el('div', 'au-h', 'PROVOCĂRILE ZILEI'))
    const box = el('div', 'au-daily')
    col.appendChild(box)
    const paint = () => {
      box.innerHTML = ''
      if (!ch.unlocked) { box.appendChild(el('div', 'mission-item', '<div class="md">Se deblochează după misiunea „Bani de pâine". Orașul încă nu te cunoaște.</div>')); return }
      if (!ch.list.length) ch.update()
      ch.list.forEach((c, i) => {
        const def = challengeDef(c.id)
        if (!def) return
        const r = CHALLENGE_REWARD[def.tier]
        const k = Math.min(1, c.n / def.n)
        const row = el('div', 'au-ch' + (c.done ? ' done' : ''), `<div class="ic">${c.done ? '✔' : def.icon}</div>
          <div class="bd"><div class="tx">${fmt(def.text)}</div><div class="pb"><i style="transform:scaleX(${k.toFixed(3)})"></i></div>
          <div class="mt"><span>${ch.fmtN(def, c.n)} / ${ch.fmtN(def, def.n)}</span><span>${'★'.repeat(def.tier)} · +${r.aura} AURA · +${r.lei} lei</span></div></div>`)
        if (!c.done) {
          const b = el('button', 'au-rr', '🎲')
          b.title = 'Schimbă provocarea'
          b.disabled = ch.rerollsLeft <= 0
          b.onclick = () => { if (ch.reroll(i)) paint(); else this.game.audio?.sfx('error', { bus: 'ui' }) }
          row.appendChild(b)
        }
        box.appendChild(row)
      })
      const all = ch.list.length && ch.list.every((c) => c.done)
      const h = ch.hoursLeft, hh = Math.floor(h), mm = Math.floor((h - hh) * 60)
      box.appendChild(el('div', 'au-bonus' + (all ? ' done' : ''), `🏆 Toate trei: <b>+${DAILY_BONUS.aura} AURA · +${DAILY_BONUS.lei} lei</b>${all ? ' ✔' : ''}`))
      box.appendChild(el('div', 'au-foot', `Provocări noi peste ${hh} h ${String(mm).padStart(2, '0')} min (ora jocului). Schimbări rămase azi: ${ch.rerollsLeft} 🎲`))
    }
    paint()
  }
}
