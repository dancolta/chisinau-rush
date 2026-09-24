import * as THREE from 'three'
import { Minimap } from './Minimap.js'
import { streetName, districtAt } from '../world/CityLayout.js'
import { NEWS } from '../data/news.js'

const _v = new THREE.Vector3()
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
// tiny markup for coloured keywords: {y}yellow{/y}, {b}, {r}, {g}; [E] -> key cap
export function fmt(s) {
  return String(s)
    .replace(/\{(y|b|r|g|w)\}/g, '<span class="$1">').replace(/\{\/(y|b|r|g|w)\}/g, '</span>')
    .replace(/\[([A-Za-zĂÎȘȚÂ0-9⇧␣←→↑↓/ ]{1,9})\]/g, '<span class="key">$1</span>')
}

// visible characters of a marked-up string (markup tokens removed, key caps count as one)
function visibleText(s) { return String(s).replace(/\{\/?[ybrgw]\}/g, '').replace(/\[([^\]]{1,9})\]/g, '$1') }
// markup-aware prefix with n visible characters
function partialText(s, n) {
  let out = '', count = 0, i = 0
  while (i < s.length && count < n) {
    const tag = s.slice(i).match(/^\{\/?[ybrgw]\}/)
    if (tag) { out += tag[0]; i += tag[0].length; continue }
    const key = s.slice(i).match(/^\[[^\]]{1,9}\]/)
    if (key) { out += key[0]; i += key[0].length; count++; continue }
    out += s[i++]; count++
  }
  return out
}

export class UI {
  constructor(game) {
    this.game = game
    this.root = game.uiRoot
    this.modalOpen = false
    this.hudVisible = false
    this.bubbles = new Map()
    this.build()
  }

  build() {
    const r = this.root
    r.innerHTML = ''
    this.world = el('div', 'ui-layer'); r.appendChild(this.world)       // projected elements
    this.hud = el('div', 'ui-layer'); r.appendChild(this.hud)
    this.fx = el('div', 'ui-layer'); r.appendChild(this.fx)             // vignettes, letterbox
    this.top = el('div', 'ui-layer'); r.appendChild(this.top)           // big messages, dialogue, menus

    // ticker
    this.tickerEl = el('div', 'ticker hidden', '<div class="lbl">ȘTIRI</div><div class="run"></div>')
    this.hud.appendChild(this.tickerEl)
    this.tickerRun = this.tickerEl.querySelector('.run')
    this.tickerX = 0
    // top-left
    const tl = el('div', 'hud-tl'); this.hud.appendChild(tl)
    this.objEl = el('div', 'objective hidden', '<div class="t"></div><div class="o"></div><div class="sub"></div>')
    tl.appendChild(this.objEl)
    this.tipEl = el('div', 'tip hidden'); tl.appendChild(this.tipEl)
    // top-right
    const tr = el('div', 'hud-tr'); this.hud.appendChild(tr)
    this.clockEl = el('div', 'hud-clock'); tr.appendChild(this.clockEl)
    this.moneyEl = el('div', 'hud-money'); tr.appendChild(this.moneyEl)
    this.wantedEl = el('div', 'hud-wanted', '<span class="s">★</span><span class="s">★</span><span class="s">★</span><span class="s">★</span><span class="s">★</span>'); tr.appendChild(this.wantedEl)
    this.weaponEl = el('div', 'hud-weapon'); tr.appendChild(this.weaponEl)
    this.popsEl = el('div'); tr.appendChild(this.popsEl)
    this.toastsEl = el('div', 'toasts'); this.hud.appendChild(this.toastsEl)
    // bottom-left
    const bl = el('div', 'hud-bl'); this.hud.appendChild(bl)
    const mm = el('div', 'minimap-wrap'); bl.appendChild(mm)
    const cv = document.createElement('canvas'); mm.appendChild(cv)
    mm.appendChild(el('div', 'minimap-n', 'N'))
    this.streetEl = el('div', 'minimap-street'); mm.appendChild(this.streetEl)
    this.minimap = new Minimap(this.game, cv, mm.querySelector('.minimap-n'))
    const vit = el('div', 'vitals'); bl.appendChild(vit)
    this.hpBar = el('div', 'bar hp', '<i></i><label>VIAȚĂ</label>'); vit.appendChild(this.hpBar)
    this.foodBar = el('div', 'bar food', '<i></i><label>FOAME</label>'); vit.appendChild(this.foodBar)
    this.stamBar = el('div', 'bar stam', '<i></i>'); vit.appendChild(this.stamBar)
    // bottom-right vehicle
    this.vehEl = el('div', 'hud-br hidden', '<div class="speedo"><span>0</span><small>KM/H</small></div><div class="vname"></div><div class="bar vdmg"><i></i></div>')
    this.hud.appendChild(this.vehEl)
    // prompt + subtitle + help
    this.promptEl = el('div', 'prompt hidden'); this.hud.appendChild(this.promptEl)
    this.subEl = el('div', 'subtitle hidden'); this.top.appendChild(this.subEl)
    this.helpEl = el('div', 'help-keys hidden'); this.hud.appendChild(this.helpEl)
    // fx layer
    this.dmgEl = el('div', 'dmg-vignette'); this.fx.appendChild(this.dmgEl)
    this.lowEl = el('div', 'low-vignette hidden'); this.fx.appendChild(this.lowEl)
    this.lbEl = el('div', 'ui-layer letterbox'); this.fx.appendChild(this.lbEl)
    this.faderEl = el('div', 'fader'); this.top.appendChild(this.faderEl)
    this.markerEl = el('div', 'marker hidden', '<div class="pin"></div><div class="d"></div>'); this.world.appendChild(this.markerEl)
    this.marker = null
    this.tags = []
    this.showHud(false)
  }

  showHud(on) {
    this.hudVisible = on
    this.hud.style.display = on ? '' : 'none'
    this.world.style.display = on ? '' : 'none'
  }

  // ---- messages --------------------------------------------------------------------------
  setObjective(text, { title = 'OBIECTIV', sub = '', flash = true } = {}) {
    if (!text) { this.objEl.classList.add('hidden'); this.objective = null; return }
    this.objective = text
    this.objEl.querySelector('.t').textContent = title
    this.objEl.querySelector('.o').innerHTML = fmt(text)
    this.objEl.querySelector('.sub').innerHTML = fmt(sub)
    this.objEl.querySelector('.sub').style.display = sub ? '' : 'none'
    this.objEl.classList.remove('hidden')
    if (flash) { this.objEl.classList.remove('flash'); void this.objEl.offsetWidth; this.objEl.classList.add('flash'); this.game.audio?.sfx('notify', { bus: 'ui', vol: 0.6 }) }
  }

  setTimer(secs) {
    let t = this.objEl.querySelector('.timer')
    if (secs == null) { if (t) t.remove(); return }
    if (!t) { t = el('span', 'timer'); this.objEl.querySelector('.o').before(t) }
    const s = Math.max(0, Math.ceil(secs))
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    t.classList.toggle('warn', secs < 10)
  }

  tip(html, secs = 6) {
    clearTimeout(this.tipT)
    if (!html) { this.tipEl.classList.add('hidden'); return }
    this.tipEl.innerHTML = fmt(html)
    this.tipEl.classList.remove('hidden')
    this.tipEl.style.animation = 'none'; void this.tipEl.offsetWidth; this.tipEl.style.animation = ''
    if (secs) this.tipT = setTimeout(() => this.tipEl.classList.add('hidden'), secs * 1000)
  }

  notify(text, secs = 3.2, color = '') {
    const t = el('div', 'toast ' + color, fmt(text))
    this.toastsEl.appendChild(t)
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove()
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450) }, secs * 1000)
  }

  money(delta, reason) {
    const p = el('div', 'money-pop ' + (delta > 0 ? 'plus' : 'minus'), (delta > 0 ? '+' : '−') + Math.abs(delta) + ' lei')
    p.style.top = 58 + this.popsEl.children.length * 26 + 'px'
    this.popsEl.appendChild(p)
    setTimeout(() => p.remove(), 1700)
    if (reason) this.notify(reason, 2.4, delta > 0 ? 'green' : 'red')
  }

  xp(n, why) { if (why) this.notify(`+${Math.round(n)} XP · ${why}`, 2.2, 'gold') }

  prompt(text, key = 'E') {
    if (!text) { if (this._prompt) { this.promptEl.classList.add('hidden'); this._prompt = null } return }
    const sig = key + text
    if (this._prompt === sig) return
    this._prompt = sig
    this.promptEl.innerHTML = `<span class="key">${key}</span><span>${fmt(text)}</span>`
    this.promptEl.classList.remove('hidden')
  }

  help(text) { this.helpEl.innerHTML = text ? fmt(text) : ''; this.helpEl.classList.toggle('hidden', !text) }

  subtitle(name, text, secs = 3) {
    clearTimeout(this.subT)
    if (!text) { this.subEl.classList.add('hidden'); return }
    this.subEl.innerHTML = (name ? `<b>${name}:</b>` : '') + fmt(text)
    this.subEl.classList.remove('hidden')
    if (secs) this.subT = setTimeout(() => this.subEl.classList.add('hidden'), secs * 1000)
  }

  bigMessage(title, sub = '', { color = '', secs = 3.2 } = {}) {
    const m = el('div', 'bigmsg', `<div class="h ${color}">${title}</div>${sub ? `<div class="s">${fmt(sub)}</div>` : ''}`)
    this.top.appendChild(m)
    return new Promise((res) => setTimeout(() => { m.classList.add('out'); setTimeout(() => { m.remove(); res() }, 600) }, secs * 1000))
  }

  chapter(kicker, name, desc, secs = 4) {
    const c = el('div', 'chapter', `<div><div class="k">${kicker}</div><div class="n">${name}</div>${desc ? `<div class="d">${desc}</div>` : ''}</div>`)
    this.top.appendChild(c)
    this.game.audio?.sting('chapter')
    this.hud.style.opacity = '0'
    return new Promise((res) => setTimeout(() => { c.classList.add('out'); if (!this.lbEl.classList.contains('on')) this.hud.style.opacity = '1'; setTimeout(() => { c.remove(); res() }, 900) }, secs * 1000))
  }

  // "new evidence" card: stamped file with a title and the finding
  evidence(kicker, title, text, secs = 5.5) {
    this.modalOpen = true
    const c = el('div', 'evidence', `<div class="card"><div class="stamp">DOVADĂ</div><div class="k">${kicker}</div><div class="t">${fmt(title)}</div><div class="x">${fmt(text)}</div><div class="more">E ▸</div></div>`)
    this.top.appendChild(c)
    return new Promise((res) => {
      let done = false
      const close = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); c.classList.add('out'); this.modalOpen = false; this.game.input.clear(); setTimeout(() => { c.remove(); res() }, 450) }
      const onKey = (e) => { if (['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); close() } }
      setTimeout(() => { window.addEventListener('keydown', onKey, true); c.addEventListener('mousedown', close); c.addEventListener('touchstart', close) }, 900)
      setTimeout(close, this.game.autoTalk ? 500 : secs * 1000 + 6000)
    })
  }

  // 3-2-1-DAVAI for races
  async countdown(items = ['3', '2', '1', 'DAVAI!']) {
    for (let i = 0; i < items.length; i++) {
      const last = i === items.length - 1
      const c = el('div', 'countdown' + (last ? ' go' : ''), items[i])
      this.top.appendChild(c)
      this.game.audio?.sfx(last ? 'go' : 'beep', { bus: 'ui' })
      await new Promise((r) => setTimeout(r, last ? 450 : 800))
      setTimeout(() => c.remove(), 700)
    }
  }

  // scrolling end credits; resolves when done (or skipped with E/Esc)
  credits(lines, secs = 38) {
    const c = el('div', 'credits', `<div class="roll">${lines.map((l) => (l.h ? `<h3>${l.h}</h3>` : l.big ? `<h1>${l.big}</h1>` : `<p>${fmt(l)}</p>`)).join('')}</div><div class="skip">E · sari peste</div>`)
    this.top.appendChild(c)
    const roll = c.querySelector('.roll')
    roll.style.animationDuration = secs + 's'
    return new Promise((res) => {
      let done = false
      const close = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); c.classList.add('out'); setTimeout(() => { c.remove(); res() }, 900) }
      const onKey = (e) => { if (['KeyE', 'Escape', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); close() } }
      setTimeout(() => { window.addEventListener('keydown', onKey, true); c.querySelector('.skip').addEventListener('click', close) }, 1500)
      setTimeout(close, this.game.autoTalk ? 1200 : secs * 1000)
    })
  }

  flash(color = '#fff', ms = 220) {
    const f = el('div', 'flash'); f.style.background = color
    this.fx.appendChild(f)
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease`; f.style.opacity = 0 })
    setTimeout(() => f.remove(), ms + 60)
  }

  // slim "MISIUNE · title" banner when a mission starts
  missionBanner(kicker, title) {
    const b = el('div', 'mbanner', `<div class="k">${kicker}</div><div class="t">${title}</div>`)
    this.top.appendChild(b)
    this.game.audio?.sfx('notify', { bus: 'ui', vol: 0.8 })
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 600) }, 2600)
  }

  overlay(text, secs = 2.5) {
    const o = el('div', 'overlay-msg', `<div class="h">${text}</div>`)
    this.top.appendChild(o)
    return new Promise((res) => setTimeout(() => { o.remove(); res() }, secs * 1000))
  }

  // "hold to skip" ring shown during cutscenes
  skipHint(on, k = 0) {
    if (!this.skipEl) { this.skipEl = el('div', 'skip-hint hidden', '<i></i><span>Ține <b>␣</b> ca să sari</span>'); this.top.appendChild(this.skipEl) }
    this.skipEl.classList.toggle('hidden', !on)
    if (on) this.skipEl.firstChild.style.setProperty('--k', Math.min(1, k))
  }

  letterbox(on) { this.lbEl.classList.toggle('on', on); this.hud.style.opacity = on ? '0' : '1'; this.world.classList.toggle('cine', on) }

  fade(to, ms = 600) {
    this.faderEl.style.transition = `opacity ${ms}ms ease`
    this.faderEl.style.opacity = to
    return new Promise((r) => setTimeout(r, ms))
  }

  damageFlash(k = 0.6) {
    this.dmgEl.style.transition = 'none'; this.dmgEl.style.opacity = k
    requestAnimationFrame(() => { this.dmgEl.style.transition = 'opacity 0.5s'; this.dmgEl.style.opacity = 0 })
  }

  ticker(on) {
    this.tickerEl.classList.toggle('hidden', !on)
    if (on && !this.tickerRun.textContent) this.refillTicker()
  }

  refillTicker() {
    const pr = this.game.progress
    const items = [...NEWS].sort(() => Math.random() - 0.5).slice(0, 6)
    if (pr) items.push(`Un oarecare „${pr.rank.name}" face ordine prin Centru. Primăria nu comentează`)
    // the news follows the story
    const done = pr?.story?.done || []
    const STORY_NEWS = {
      eban: 'Primarul Ceon Eban a inaugurat reparația gropii cu numărul o mie. Groapa a fost vopsită',
      cursa: 'Curse ilegale în Botanica: locatarii se plâng de zgomot, gopnicii de concurență',
      borea: 'Lăzi cu „vin" confiscate la Gară. Vinul avea ștampila Primăriei',
      sergentul: 'Mașina de serviciu a sergentului Căldare, găsită „întâmplător" în Râșcani',
      beciul: 'Luminile din beciul Primăriei ard toată noaptea. Primăria: „lucrăm la asta"',
      rapirea: 'Scandal la Circ: o pensionară din Botanica a bătut, cu ajutor, patru bodyguarzi',
      mitingul: 'ULTIMA ORĂ: Primarul Eban, demascat în PMAN în fața a mii de oameni',
      cortegiul: 'Ceon Eban, reținut după o urmărire spectaculoasă. A căzut în groapa pe care n-a astupat-o',
      alegeri: `Noul primar, ${pr?.name || 'Ion'}, promite drumuri fără gropi. Lumea a mai auzit, dar speră`,
    }
    for (const [id, line] of Object.entries(STORY_NEWS)) if (done.includes(id)) items.unshift(line)
    items.splice(9)
    this.tickerRun.textContent = '◆ ' + items.join('   ◆   ') + '   ◆'
    this.tickerX = window.innerWidth
  }

  // ---- world-projected elements ----------------------------------------------------------
  project(x, y, z) {
    const cam = this.game.camera
    _v.set(x, y, z).project(cam)
    if (_v.z > 1) return null
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, behind: false }
  }

  bubble(npc, text, dur = 2.6) {
    let b = this.bubbles.get(npc)
    if (!b) { b = { el: el('div', 'bubble') }; this.world.appendChild(b.el); this.bubbles.set(npc, b) }
    b.el.textContent = text
    b.el.style.animation = 'none'; void b.el.offsetWidth; b.el.style.animation = ''
    b.until = performance.now() + dur * 1000
    if (npc.voice && this.game.audio) { if (b.stop) b.stop(); b.stop = this.game.audio.voiceStart(npc.voice, text) }
  }

  removeBubble(npc) { const b = this.bubbles.get(npc); if (b) { b.el.remove(); if (b.stop) b.stop(); this.bubbles.delete(npc) } }

  pow(x, y, z, text) {
    const s = this.project(x, y, z)
    if (!s) return
    const p = el('div', 'pow', text)
    p.style.left = s.x + 'px'; p.style.top = s.y + 'px'
    this.world.appendChild(p)
    setTimeout(() => p.remove(), 750)
  }

  // mission waypoint (3D target) — shown in world and as a GPS route on the minimap
  setMarker(target, label = '') {
    this.marker = target ? { ...target, label } : null
    this.markerEl.classList.toggle('hidden', !target)
    this.minimap.setRoute(target)
  }

  // floating "!" over NPCs that have something for you
  setTags(list) { this.tags = list }

  // ---- dialogue ---------------------------------------------------------------------------
  // lines: array of strings or { who, text } ; returns when finished. choices -> returns index
  async dialogue(speaker, lines, { choices = null, portrait = true } = {}) {
    this.modalOpen = true
    this.game.audio?.duck(0.5, 0.3)
    const d = el('div', 'dialog', `<div class="portrait"></div><div class="box"><div class="name"></div><div class="text"></div><div class="more">E ▸</div><div class="choices"></div></div>`)
    this.top.appendChild(d)
    const port = d.querySelector('.portrait'), nameEl = d.querySelector('.name'), textEl = d.querySelector('.text'), more = d.querySelector('.more'), chEl = d.querySelector('.choices')
    let result = null
    try {
      for (let i = 0; i < lines.length; i++) {
        const L = typeof lines[i] === 'string' ? { who: speaker, text: lines[i] } : { who: lines[i].who || speaker, text: lines[i].text }
        const who = L.who || {}
        nameEl.innerHTML = (who.name || '') + (who.role ? `<small>${who.role}</small>` : '')
        const url = portrait && who.spec ? this.game.portraits?.get(who) : null
        port.style.display = url ? '' : 'none'
        if (url) port.style.backgroundImage = `url(${url})`
        const isLast = i === lines.length - 1
        more.style.display = 'none'
        await this.typeLine(textEl, L.text, who.voice)
        if (isLast && choices) break
        more.style.display = ''
        await this.waitAdvance()
      }
      if (choices) {
        more.style.display = 'none'
        result = await this.choose(chEl, choices)
      }
    } finally {
      d.remove()
      this.modalOpen = false
      this.game.audio?.duck(1, 0.4)
      this.game.input.clear()
    }
    return result
  }

  typeLine(textEl, text, voice) {
    return new Promise((resolve) => {
      const html = fmt(text)
      const plain = visibleText(text)
      const total = plain.length
      let n = 0, finished = false
      const stopVoice = voice && this.game.audio ? this.game.audio.voiceStart(voice, plain) : null
      const box = textEl.parentElement
      const cleanup = () => { clearInterval(iv); window.removeEventListener('keydown', onKey, true); box.removeEventListener('mousedown', onClick); window.removeEventListener('touchstart', onTouch, true); if (stopVoice) stopVoice() }
      const finish = () => { if (finished) return; finished = true; cleanup(); textEl.innerHTML = html; resolve() }
      const iv = setInterval(() => { n += 2; if (n >= total) finish(); else textEl.innerHTML = fmt(partialText(text, n)) }, 28)
      if (this.game.autoTalk) setTimeout(finish, 60)
      const onKey = (e) => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); finish() } }
      const onClick = (e) => { e.stopPropagation(); finish() }
      const onTouch = () => finish()
      window.addEventListener('keydown', onKey, true)
      box.addEventListener('mousedown', onClick)
      window.addEventListener('touchstart', onTouch, true)
    })
  }

  waitAdvance() {
    return new Promise((resolve) => {
      let over = false
      const done = () => { if (over) return; over = true; window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onClick, true); window.removeEventListener('touchstart', onTouch, true); clearInterval(pad); this.game.audio?.sfx('typewriter', { bus: 'ui', vol: 0.5 }); resolve() }
      const onKey = (e) => { if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); done() } }
      const onClick = (e) => { if (e.button === 0) { e.stopPropagation(); done() } }
      const onTouch = () => done()
      setTimeout(() => { window.addEventListener('keydown', onKey, true); window.addEventListener('mousedown', onClick, true); window.addEventListener('touchstart', onTouch, true) }, 160)
      const pad = setInterval(() => { this.game.input.pollGamepad(); if (this.game.input.pressed('confirm')) done() }, 50)
      if (this.game.autoTalk) setTimeout(done, 140)
    })
  }

  choose(container, choices) {
    return new Promise((resolve) => {
      let sel = 0
      const btns = choices.map((c, i) => {
        const o = typeof c === 'string' ? { text: c } : c
        const b = el('button', 'choice' + (o.disabled ? ' disabled' : ''), `<span class="n">${i + 1}</span><span>${fmt(o.text)}</span>${o.cost ? `<span class="c">${o.cost}</span>` : ''}`)
        b.onclick = () => pick(i)
        container.appendChild(b)
        return b
      })
      const paint = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel))
      paint()
      const pick = (i) => {
        const o = typeof choices[i] === 'string' ? {} : choices[i]
        if (o.disabled) { this.game.audio?.sfx('error', { bus: 'ui' }); return }
        window.removeEventListener('keydown', onKey, true)
        this.game.audio?.sfx('confirm', { bus: 'ui' })
        resolve(i)
      }
      const onKey = (e) => {
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= choices.length) { e.stopPropagation(); pick(n - 1) }
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % choices.length; paint(); this.game.audio?.sfx('hover', { bus: 'ui' }) }
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + choices.length - 1) % choices.length; paint(); this.game.audio?.sfx('hover', { bus: 'ui' }) }
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { e.stopPropagation(); pick(sel) }
      }
      setTimeout(() => window.addEventListener('keydown', onKey, true), 150)
      if (this.game.autoTalk) setTimeout(() => {
        const q = this.game.autoChoices
        let i = q && q.length ? q.shift() : 0
        if (i >= choices.length || (typeof choices[i] === 'object' && choices[i].disabled)) i = choices.findIndex((c) => typeof c === 'string' || !c.disabled)
        pick(Math.max(0, i))
      }, 160)
    })
  }

  // ---- per frame ---------------------------------------------------------------------------
  update(dt) {
    const g = this.game, pr = g.progress, p = g.player
    if (!this.hudVisible || !pr || !p) return
    // top right
    const tod = g.renderer.tod
    const pos = p.vehicle ? p.vehicle.pos : p.pos
    const dist = districtAt(pos.x, pos.z)
    const clk = `${tod.clock}<small>${dist}</small>`
    if (clk !== this._clk) { this._clk = clk; this.clockEl.innerHTML = clk }
    this.dispMoney = this.dispMoney ?? pr.lei
    this.dispMoney += (pr.lei - this.dispMoney) * Math.min(1, dt * 8)
    if (Math.abs(this.dispMoney - pr.lei) < 0.5) this.dispMoney = pr.lei
    const m = Math.round(this.dispMoney).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    if (m !== this._m) { this._m = m; this.moneyEl.innerHTML = `${m}<span class="cur">lei</span>` }
    const wl = g.police ? g.police.level : 0
    const blink = g.police ? g.police.escaping : false
    const ws = wl + '|' + blink
    if (ws !== this._ws) { this._ws = ws; [...this.wantedEl.children].forEach((s, i) => s.classList.toggle('on', i < wl)); this.wantedEl.classList.toggle('blink', blink); this.wantedEl.style.visibility = wl > 0 ? 'visible' : 'hidden' }
    const w = g.progress.weapon
    if (w !== this._w) { this._w = w; const W = g.weapons?.[w]; this.weaponEl.innerHTML = W ? `<span class="ic">${W.icon}</span><span>${W.name}</span><span class="k">Q</span>` : '' }
    // vitals
    const hpR = pr.hp / pr.maxHp
    this.hpBar.firstChild.style.transform = `scaleX(${hpR})`
    this.hpBar.classList.toggle('low', hpR < 0.25)
    this.foodBar.firstChild.style.transform = `scaleX(${pr.hunger})`
    this.stamBar.firstChild.style.transform = `scaleX(${p.stamina})`
    this.lowEl.classList.toggle('hidden', !(hpR < 0.25 || pr.hunger < 0.08))
    // street name
    const sn = streetName(pos.x, pos.z) || ''
    if (sn !== this._sn) { this._sn = sn; this.streetEl.textContent = sn; this.streetEl.style.display = sn ? '' : 'none' }
    // vehicle
    const v = p.passenger ? null : p.vehicle
    this.vehEl.classList.toggle('hidden', !v)
    if (v) {
      const kmh = Math.round(Math.abs(v.speed) * 3.6)
      if (kmh !== this._kmh) { this._kmh = kmh; this.vehEl.querySelector('.speedo span').textContent = kmh }
      if (v !== this._veh) { this._veh = v; this.vehEl.querySelector('.vname').textContent = v.def.name }
      this.vehEl.querySelector('.vdmg i').style.transform = `scaleX(${v.health / 100})`
    }
    // ticker
    if (!this.tickerEl.classList.contains('hidden')) {
      this.tickerX -= dt * 70
      const wdt = this.tickerRun.offsetWidth
      if (this.tickerX < -wdt) this.refillTicker()
      this.tickerRun.style.transform = `translateX(${this.tickerX - window.innerWidth}px)`
    }
    this.minimap.update(dt)
    this.updateWorldElements()
  }

  updateWorldElements() {
    const now = performance.now()
    for (const [npc, b] of this.bubbles) {
      if (now > b.until || !npc.char || !npc.char.visible) { b.el.remove(); this.bubbles.delete(npc); continue }
      const m = npc.char.mesh.position
      const s = this.project(m.x, m.y + 2.35, m.z)
      if (!s) { b.el.style.display = 'none'; continue }
      b.el.style.display = ''
      b.el.style.left = s.x + 'px'; b.el.style.top = s.y + 'px'
    }
    // tags ("!" over quest givers)
    this.tagEls ||= []
    while (this.tagEls.length < this.tags.length) { const e = el('div', 'npc-tag'); this.world.appendChild(e); this.tagEls.push(e) }
    this.tagEls.forEach((e, i) => {
      const t = this.tags[i]
      if (!t) { e.style.display = 'none'; return }
      const pos = t.npc ? t.npc.char.mesh.position : t
      const s = this.project(pos.x, pos.y + (t.npc ? 2.5 : 3), pos.z)
      if (!s) { e.style.display = 'none'; return }
      e.style.display = ''
      const html = `<span class="ex">${t.icon || '!'}</span>${t.label || ''}`
      if (e._h !== html) { e._h = html; e.innerHTML = html }
      e.style.left = s.x + 'px'; e.style.top = s.y + 'px'
    })
    // waypoint marker (with edge arrow when off-screen)
    const mk = this.marker
    if (mk) {
      const cam = this.game.camera
      _v.set(mk.x, (mk.y ?? 0.2) + 3.2, mk.z).project(cam)
      const W = window.innerWidth, H = window.innerHeight
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H
      const behind = _v.z > 1
      if (behind) { x = W - x; y = H - y }
      const pad = 40
      const off = behind || x < pad || x > W - pad || y < pad || y > H - pad
      if (off) { x = Math.max(pad, Math.min(W - pad, x)); y = Math.max(pad + 20, Math.min(H - pad, y)) }
      this.markerEl.classList.toggle('edge', off)
      this.markerEl.style.left = x + 'px'; this.markerEl.style.top = y + 'px'
      const p = this.game.player
      const pp = p.vehicle ? p.vehicle.pos : p.pos
      const d = Math.round(Math.hypot(mk.x - pp.x, mk.z - pp.z))
      const txt = (mk.label ? mk.label + ' · ' : '') + d + ' m'
      if (txt !== this._mkTxt) { this._mkTxt = txt; this.markerEl.querySelector('.d').textContent = txt }
    }
  }
}
