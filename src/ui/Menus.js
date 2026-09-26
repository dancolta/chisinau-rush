import { PLAYER_TYPES, CAST } from '../data/outfits.js'
import { Character } from '../entities/Character.js'
import { Progress, RANKS } from '../gameplay/Progress.js'
import { renderStaticMap } from './Minimap.js'
import { saveSettings } from '../core/Settings.js'
import { QUALITY } from '../render/Renderer.js'
import { WEAPONS } from '../data/weapons.js'
import { fmt } from './UI.js'
import { WORLD } from '../world/CityLayout.js'
import { padNav } from './Nav.js'
import { renderAccount, openAccountScreen, chooseSave, cloudStatus, saveLine } from './Account.js'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// big map: short names, and which labels win when they'd collide (higher first)
const MAP_NAME = {
  pman: 'PMAN', catedrala: 'Catedrala', parc_catedrala: 'Parcul Catedralei', stefan: 'Ștefan cel Mare',
  gradina: 'Grădina Publică', primaria: 'Primăria', opera: 'Opera', parlament: 'Parlamentul', usm: 'USM',
  kotovski: 'Kotovski', hotel: 'Hotel Național', teatru: 'Teatrul Eminescu', muzeu: 'Muzeul de Istorie',
  autogara: 'Autogara', circ: 'Circul', gara: 'Gara', biserica: 'Biserica', piata: 'Piața Centrală',
}
const MAP_RANK = {
  pman: 10, gara: 9, piata: 9, guvern: 8, catedrala: 8, arc: 7, primaria: 7, parlament: 7, opera: 6, circ: 6,
  gradina: 6, autogara: 6, presedintia: 5, usm: 5, stefan: 4, teatru: 4, muzeu: 4, hotel: 4, ambasada: 4,
  kotovski: 3, parc_catedrala: 3, clopotnita: 2, sala_orga: 2, biserica: 2,
}

// cinematic loop for the title screen: [from, to, lookFrom, lookTo, secs]
const FLYOVER = [
  [[-60, 14, 70], [40, 18, 60], [0, 8, 30], [0, 10, 40], 11],
  [[70, 24, -12], [26, 20, -18], [0, 9, -92], [0, 9, -92], 11],
  [[-30, 9, 13], [-52, 11, 11], [-76, 16, -24], [-80, 18, -26], 10],
  [[-420, 60, -60], [-300, 70, -140], [-330, 30, -40], [-240, 10, -200], 12],
  [[300, 16, 238], [334, 15, 236], [362, 9, 290], [362, 9, 290], 10],
  [[84, 34, 118], [60, 34, 132], [0, 8, 205], [-6, 8, 205], 10],
]

export class Menus {
  constructor(game, ui) {
    this.game = game
    this.ui = ui
    this.layer = ui.top
    this.open = null
    // the cloud found two different saves: the player picks (see Account.js)
    game.cloud?.setResolver((local, cloud) => chooseSave(game, local, cloud))
  }

  // ---- title screen ---------------------------------------------------------------------
  showMain() {
    const g = this.game
    this.close()
    g.state = 'menu'
    this.ui.showHud(false)
    const m = el('div', 'mainmenu', `
      <div class="side">
        <div class="mm-logo">CHIȘINĂU<span>RUSH</span></div>
        <div class="mm-tag">De la <b class="y">plecat peste hotare</b> la <b class="y">primar</b>. Un oraș, o sută de gropi, un primar care vorbește prea des la telefon.</div>
        <div class="mm-btns"></div>
        <div class="mm-save"></div>
        <div class="mm-cloud"></div>
        <div class="mm-foot">W/S mers · A/D rotire · Shift sprint · E acțiune · Click/J lovește · Space sari / frână · Q armă · V cameră · M hartă · Esc pauză<br>Asset-uri CC0: KayKit (Kay Lousberg), Kenney. Satiră. Orice asemănare cu primari reali e… lucrăm la asta.</div>
      </div><div></div>`)
    const btns = m.querySelector('.mm-btns')
    const add = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.onclick = () => { g.audio?.resume(); g.audio?.sfx('confirm', { bus: 'ui' }); fn(b) }; b.onmouseenter = () => g.audio?.sfx('hover', { bus: 'ui', vol: 0.4 }); btns.appendChild(b); return b }
    // buttons and save line follow the save on disk, which the cloud can swap while we're here
    let shown = null
    const paint = () => {
      const save = Progress.hasSave(), cloud = g.cloud
      const key = [save?.t, cloud?.loggedIn, cloud?.email].join('|')
      if (key !== shown) {
        shown = key
        btns.innerHTML = ''
        if (save) add('▶  Continuă', 'primary', (b) => this.continueSaved(b))
        add(save ? '＋  Joc nou' : '▶  Joc nou', save ? '' : 'primary', async () => {
          // the boot sync may still be bringing a save from the cloud: know before starting over
          await cloud?.ready()
          const lost = cloud?.loggedIn ? 'Salvarea curentă se pierde, și cea din cloud.' : 'Salvarea curentă se pierde.'
          if (Progress.hasSave() && !(await this.confirm('Începi un joc nou?', `${lost} Tanti Zina o să uite tot. Și ea uită greu.`))) return
          this.showCreate()
        })
        if (cloud?.enabled) add(cloud.loggedIn ? '☁  Cont' : '👤  Cont', 'acct-btn', () => this.showAccount())
        add('🎬  Trailer', '', () => this.showTrailer())
        add('⚙  Setări', '', () => this.showSettingsOnly())
        m.querySelector('.mm-save').innerHTML = save ? `Salvare: ${saveLine(save)} · ${new Date(save.t).toLocaleString('ro-RO')}` : ''
      }
      const st = cloud?.loggedIn ? cloudStatus(cloud) : null
      const line = m.querySelector('.mm-cloud')
      line.className = 'mm-cloud ' + (st ? st.tone : '')
      line.innerHTML = st ? `<i></i>${esc(cloud.email)} · ${esc(st.text)}` : ''
    }
    paint()
    this.offCloud = g.cloud?.on(() => { if (this.open === m) paint() })
    this.mainClock = setInterval(() => { if (this.open === m) paint() }, 20000)
    this.stopNav = padNav(g, btns)
    this.layer.appendChild(m)
    this.open = m
    this.startFlyover()
    g.audio?.music('menu')
    g.audio?.ambience('city')
    // back from a reload that switched to the cloud save: straight into the game
    let resume = false
    try { resume = sessionStorage.getItem('cr3d-continue') === '1'; sessionStorage.removeItem('cr3d-continue') } catch (e) { /* no session storage */ }
    if (resume && Progress.hasSave()) this.continueSaved()
  }

  // Continue: a logged-in player waits (briefly) for the boot sync, so the right save loads
  async continueSaved(btn) {
    const g = this.game
    if (this.starting) return
    this.starting = true
    if (g.cloud?.busy && btn) btn.textContent = '☁  Se sincronizează…'
    await g.cloud?.ready()
    this.starting = false
    const save = Progress.hasSave()
    if (save) g.director.continueGame(save)
    else this.showMain()
  }

  showAccount() {
    if (this.closeAccount) return
    this.closeAccount = openAccountScreen(this.game, { onClose: () => { this.closeAccount = null } })
  }

  confirm(title, text) {
    return new Promise((res) => {
      const d = el('div', 'confirm', `<div class="box"><h3>${title}</h3><p>${text}</p><div class="row"><button class="btn danger yes">Da</button><button class="btn primary no">Nu</button></div></div>`)
      this.layer.appendChild(d)
      const stop = padNav(this.game, d, { back: () => { done(false); return true } })
      const done = (v) => { stop(); d.remove(); this.game.audio?.sfx(v ? 'confirm' : 'back', { bus: 'ui' }); res(v) }
      d.querySelector('.yes').onclick = () => done(true)
      d.querySelector('.no').onclick = () => done(false)
    })
  }

  startFlyover() {
    const g = this.game
    let i = Math.floor(Math.random() * FLYOVER.length)
    const next = () => {
      if (g.state !== 'menu' && g.state !== 'create') return
      const [from, to, lf, lt, secs] = FLYOVER[i++ % FLYOVER.length]
      g.cameraRig.shot({ from, to, lookFrom: lf, lookTo: lt, dur: secs, ease: 'inout', onEnd: next })
    }
    g.renderer.tod.set(17.9)
    next()
  }

  // ---- character creation -----------------------------------------------------------------
  showCreate() {
    const g = this.game
    this.close()
    g.state = 'create'
    let sel = 0, name = ''
    const m = el('div', 'create', `
      <div class="side">
        <h2>CINE S-O ÎNTORS?</h2>
        <div class="q">Ani de muncă „afară". Acum te întorci la Chișinău. Cine ești și ce-ai adus cu tine?</div>
        <input maxlength="16" placeholder="Numele tău (ex: Ion)" />
        <div class="types"></div>
        <div class="actions"><button class="btn primary go">▶ Începe povestea</button><button class="btn back">‹ Înapoi</button></div>
      </div><div></div>`)
    const input = m.querySelector('input')
    input.oninput = () => { name = input.value }
    const types = m.querySelector('.types')
    const cards = PLAYER_TYPES.map((t, i) => {
      const c = el('div', 'type', `<div class="n">${t.name}</div><div class="bl">${t.blurb}</div><div class="pk">⚡ ${t.perk}</div>`)
      c.onclick = () => { sel = i; paint(); g.audio?.sfx('click', { bus: 'ui' }) }
      types.appendChild(c)
      return c
    })
    const paint = () => { cards.forEach((c, i) => c.classList.toggle('sel', i === sel)); input.placeholder = `Numele tău (ex: ${PLAYER_TYPES[sel].defName || 'Ion'})`; this.preview(PLAYER_TYPES[sel].key) }
    m.querySelector('.go').onclick = () => {
      g.audio?.sfx('confirm', { bus: 'ui' })
      this.clearPreview()
      const t = PLAYER_TYPES[sel]
      g.director.newGame({ name: (name || t.defName || 'Vasea').trim().slice(0, 16) || t.defName || 'Vasea', type: t.key })
    }
    m.querySelector('.back').onclick = () => { this.clearPreview(); this.showMain() }
    // turn the character round: drag on the right half, or the arrow keys when not typing
    const stage = m.children[1]
    stage.classList.add('turntable')
    stage.innerHTML = '<div class="turn-hint">⟲ Trage ca să rotești personajul · ← →</div>'
    let dragX = null
    stage.addEventListener('pointerdown', (e) => { dragX = e.clientX; stage.setPointerCapture?.(e.pointerId) })
    stage.addEventListener('pointermove', (e) => { if (dragX === null) return; this.turnPreview((e.clientX - dragX) * 0.012); dragX = e.clientX })
    const endDrag = () => { dragX = null }
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag)
    const onKey = (e) => {
      if (!document.body.contains(m)) { window.removeEventListener('keydown', onKey); return }
      if (e.target === input) return
      if (e.code === 'ArrowLeft') { this.turnPreview(-0.25); e.preventDefault() }
      if (e.code === 'ArrowRight') { this.turnPreview(0.25); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    this.layer.appendChild(m)
    this.open = m
    this.previewYaw = null
    setTimeout(() => input.focus(), 50)
    paint()
  }

  preview(type) {
    const g = this.game
    this.clearPreview()
    const pm = g.world.places.pman
    const x = pm.x + 2, z = pm.z + 20
    // facing the camera (it ends up at x-1.9, z+3.6); drag or arrow keys turn them round
    const ry = this.previewYaw ?? Math.atan2(-1.9, 3.6)
    this.previewYaw = ry
    this.previewChar = new Character(g, CAST[type], { x, z, ry })
    g.npcs.push(this.previewChar)
    this.previewChar.anim.play('wave')
    g.cameraRig.shot({ from: [x - 2.6, 1.9, z + 4.2], to: [x - 1.9, 1.7, z + 3.6], look: [x - 0.6, 1.15, z], dur: 30, ease: 'out' })
  }

  turnPreview(d) {
    const c = this.previewChar
    if (!c) return
    this.previewYaw = (this.previewYaw ?? c.heading) + d
    c.heading = c.prevHeading = this.previewYaw
    c.syncNow?.()
  }

  clearPreview() {
    const g = this.game
    if (this.previewChar) { g.npcs.splice(g.npcs.indexOf(this.previewChar), 1); this.previewChar.dispose(); this.previewChar = null }
  }

  // ---- pause ------------------------------------------------------------------------------
  togglePause() {
    if (this.open && this.open.classList.contains('pause')) this.closePause()
    else if (!this.open && !this.ui.modalOpen) this.showPause()
  }

  showPause(tab = 'map') {
    const g = this.game
    g.paused = true
    this.ui.modalOpen = true
    g.audio?.duck(0.35, 0.3)
    const m = el('div', 'pause', `
      <div class="top"><h1>PAUZĂ</h1><div class="tabs">
        <button data-t="map">Hartă</button><button data-t="missions">Misiuni</button><button data-t="char">Personaj</button><button data-t="aura">Aură</button><button data-t="controls">Controale</button><button data-t="settings">Setări</button>${g.cloud?.enabled ? '<button data-t="account">Cont</button>' : ''}</div></div>
      <div class="body"></div>
      <div class="foot"><button class="btn primary resume">▶ Continuă</button><button class="btn save">💾 Salvează</button><button class="btn danger quit">Meniu principal</button></div>`)
    this.layer.appendChild(m)
    this.open = m
    const body = m.querySelector('.body')
    const tabs = [...m.querySelectorAll('.tabs button')]
    let cur = tab
    const show = (t) => {
      cur = t
      tabs.forEach((b) => b.classList.toggle('on', b.dataset.t === t))
      this.tabOff?.(); this.tabOff = null
      body.innerHTML = ''
      if (t === 'map') this.renderMap(body)
      else if (t === 'missions') this.renderMissions(body)
      else if (t === 'char') this.renderChar(body)
      else if (t === 'aura') g.side?.renderPause(body)
      else if (t === 'controls') this.renderControls(body)
      else if (t === 'account') this.renderAccountTab(body)
      else this.renderSettings(body)
      g.audio?.sfx('click', { bus: 'ui' })
    }
    tabs.forEach((b) => (b.onclick = () => show(b.dataset.t)))
    // gamepad: LB / RB flip through the tabs
    let prev = g.input.padState()
    this.pauseTimer = setInterval(() => {
      const pad = g.input.padState()
      const edge = (i) => pad && pad.b[i] && !(prev && prev.b[i])
      const i = tabs.findIndex((b) => b.dataset.t === cur)
      if (edge(4)) show(tabs[(i - 1 + tabs.length) % tabs.length].dataset.t)
      if (edge(5)) show(tabs[(i + 1) % tabs.length].dataset.t)
      prev = pad
    }, 50)
    m.querySelector('.resume').onclick = () => this.closePause()
    m.querySelector('.save').onclick = () => {
      g.progress.save()
      g.cloud?.flush()
      this.ui.notify(g.cloud?.loggedIn ? 'Joc salvat. ☁ Pleacă și în cloud.' : 'Joc salvat.', 2, 'green')
      g.audio?.sfx('confirm', { bus: 'ui' })
    }
    m.querySelector('.quit').onclick = () => { g.progress.save(); location.reload() }
    show(tab)
  }

  // pause menu "Cont": Esc in a field only leaves the field; B leaves the pause menu
  renderAccountTab(body) {
    const col = el('div', 'col acct-col')
    body.appendChild(col)
    this.tabOff = renderAccount(this.game, col, {
      back: (source, typing) => {
        if (typing) { document.activeElement.blur(); return true }
        if (source === 'pad') { this.closePause(); return true }
        return false
      },
    })
  }

  closePause() {
    const g = this.game
    this.tabOff?.(); this.tabOff = null
    clearInterval(this.pauseTimer)
    if (this.open) this.open.remove()
    this.open = null
    g.paused = false
    this.ui.modalOpen = false
    g.audio?.duck(1, 0.4)
    g.input.clear()
  }

  close() {
    if (this.open) { this.open.remove(); this.open = null }
    this.offCloud?.(); this.offCloud = null
    clearInterval(this.mainClock)
    this.stopNav?.(); this.stopNav = null
    this.closeAccount?.()
  }

  renderMap(body) {
    const g = this.game
    const wrap = el('div', 'bigmap'); body.appendChild(wrap)
    const side = el('div', 'col legend', `
      <div style="font-family:var(--display);color:var(--gold);margin-bottom:8px">LEGENDĂ</div>
      <div><i style="background:#ffcf4a"></i>Obiectiv / waypoint</div>
      <div><i style="background:#7fd4ff"></i>Personaje cu treabă</div>
      <div><i style="background:#ff3a3a"></i>Poliția</div>
      <div><i style="background:#fff"></i>Tu</div>
      <div style="margin-top:12px;color:var(--muted)">Click pe hartă pentru a pune un punct GPS. Click dreapta îl șterge.</div>`)
    side.style.width = '240px'; side.style.flex = 'none'
    body.appendChild(side)
    const cv = document.createElement('canvas'); wrap.appendChild(cv)
    const tip = el('div', 'map-tip'); wrap.appendChild(tip)
    const st = renderStaticMap(g.world)
    const draw = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = r.width * dpr; cv.height = r.height * dpr
      const c = cv.getContext('2d')
      const s = Math.min(cv.width / st.W, cv.height / st.H)
      const ox = (cv.width - st.W * s) / 2, oy = (cv.height - st.H * s) / 2
      c.fillStyle = '#14171b'; c.fillRect(0, 0, cv.width, cv.height)
      c.drawImage(st.canvas, ox, oy, st.W * s, st.H * s)
      const P = (x, z) => [ox + st.X(x) * s, oy + st.Z(z) * s]
      // landmark labels: a dot for each, names placed most-important first in the first free
      // spot around the dot; a name that would overlap another is left out (hover shows it)
      const fs = Math.round(Math.max(10, Math.min(13, s * 7)) * dpr)
      c.font = `600 ${fs}px Rubik`; c.textBaseline = 'middle'; c.lineJoin = 'round'
      const places = Object.values(g.world.places).filter((p) => p.kind === 'landmark' || p.kind === 'park')
        .sort((a, b) => (MAP_RANK[b.id] ?? 1) - (MAP_RANK[a.id] ?? 1))
      const boxes = []
      const free = (r) => r.x0 >= 2 && r.y0 >= 2 && r.x1 <= cv.width - 2 && r.y1 <= cv.height - 2 && !boxes.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)
      const dot = 3.2 * dpr
      for (const p of places) { const [x, y] = P(p.x, p.z); boxes.push({ x0: x - dot, y0: y - dot, x1: x + dot, y1: y + dot }) }
      this.mapLabels = []
      for (const p of places) {
        const [x, y] = P(p.x, p.z)
        c.fillStyle = p.kind === 'park' ? '#8fd47a' : '#f3ecdc'
        c.beginPath(); c.arc(x, y, dot * 0.8, 0, Math.PI * 2); c.fill()
        const name = MAP_NAME[p.id] ?? p.name
        const w = c.measureText(name).width, h = fs * 1.1, gap = 5 * dpr
        const spots = [[x + gap, y - h / 2, 'left'], [x - gap - w, y - h / 2, 'left'], [x - w / 2, y - gap - h, 'left'], [x - w / 2, y + gap, 'left'], [x + gap, y - h - gap * 0.4, 'left'], [x + gap, y + gap * 0.4, 'left'], [x - gap - w, y - h - gap * 0.4, 'left'], [x - gap - w, y + gap * 0.4, 'left']]
        this.mapLabels.push({ x, y, name: p.name })
        for (const [lx, ly] of spots) {
          const r = { x0: lx - 2, y0: ly - 1, x1: lx + w + 2, y1: ly + h + 1 }
          if (!free(r)) continue
          boxes.push(r)
          c.textAlign = 'left'
          c.strokeStyle = 'rgba(12,14,18,0.85)'; c.lineWidth = 3.2 * dpr; c.strokeText(name, lx, ly + h / 2)
          c.fillStyle = p.kind === 'park' ? '#bfe8b0' : '#f3ecdc'; c.fillText(name, lx, ly + h / 2)
          break
        }
      }
      for (const b of g.blips()) {
        const [x, y] = P(b.x, b.z)
        c.fillStyle = b.kind === 'target' ? '#ffcf4a' : b.kind === 'police' ? '#ff3a3a' : b.kind === 'npc' ? (b.color || '#7fd4ff') : b.color || '#fff'
        c.beginPath(); c.arc(x, y, (b.kind === 'target' ? 7 : 5) * dpr, 0, Math.PI * 2); c.fill()
      }
      const pp = g.player.vehicle ? g.player.vehicle.pos : g.player.pos
      const [px, py] = P(pp.x, pp.z)
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2 * dpr
      c.beginPath(); c.arc(px, py, 7 * dpr, 0, Math.PI * 2); c.fill(); c.stroke()
      // hover: the full name of the landmark under the cursor
      cv.onmousemove = (e) => {
        const rr = cv.getBoundingClientRect()
        const mx = (e.clientX - rr.left) * dpr, my = (e.clientY - rr.top) * dpr
        let best = null, bd = (14 * dpr) ** 2
        for (const l of this.mapLabels || []) { const d = (l.x - mx) ** 2 + (l.y - my) ** 2; if (d < bd) { bd = d; best = l } }
        tip.style.display = best ? 'block' : 'none'
        if (best) { tip.textContent = best.name; tip.style.left = (best.x / dpr + 12) + 'px'; tip.style.top = (best.y / dpr - 12) + 'px' }
      }
      cv.onmouseleave = () => { tip.style.display = 'none' }
      cv.onmousedown = (e) => {
        const rr = cv.getBoundingClientRect()
        const mx = (e.clientX - rr.left) * dpr, my = (e.clientY - rr.top) * dpr
        const wx = WORLD.x0 + (mx - ox) / s / 1.2, wz = WORLD.z0 + (my - oy) / s / 1.2
        if (e.button === 2) g.director.setWaypoint(null)
        else g.director.setWaypoint({ x: wx, z: wz })
        g.audio?.sfx('click', { bus: 'ui' })
        draw()
      }
    }
    requestAnimationFrame(draw)
  }

  renderMissions(body) {
    const g = this.game
    const col = el('div', 'col'); col.style.flex = '1'; body.appendChild(col)
    col.appendChild(el('div', '', '<div style="font-family:var(--display);color:var(--gold);margin-bottom:10px">POVESTEA</div>'))
    for (const m of g.story.catalog()) {
      const cls = m.done ? 'done' : m.current ? 'cur' : ''
      col.appendChild(el('div', 'mission-item ' + cls, `<div class="mt">${m.done ? '✔ ' : m.current ? '► ' : m.locked ? '🔒 ' : '• '}${m.title}</div><div class="md">${fmt(m.locked ? 'Se deblochează mai târziu.' : m.desc)}</div>`))
    }
    const col2 = el('div', 'col'); col2.style.flex = '1'; body.appendChild(col2)
    const ev = g.story.evidence()
    col2.appendChild(el('div', '', `<div style="font-family:var(--display);color:var(--gold);margin-bottom:10px">DOVEZI · ${ev.length}/6</div>`))
    if (!ev.length) col2.appendChild(el('div', 'mission-item', '<div class="md">Încă nimic. Orașul vorbește, trebuie doar să asculți.</div>'))
    for (const e of ev) col2.appendChild(el('div', 'mission-item evidence-item', `<div class="mt">📁 ${fmt(e.title)}</div><div class="md">${fmt(e.text)}</div>`))
    col2.appendChild(el('div', '', '<div style="font-family:var(--display);color:var(--gold);margin:16px 0 10px">ACTIVITĂȚI</div>'))
    const acts = g.story.activities()
    if (!acts.length) col2.appendChild(el('div', 'mission-item', '<div class="md">Se deblochează pe parcursul poveștii: taxi, curse, livrări, gropi, dosare.</div>'))
    for (const a of acts) col2.appendChild(el('div', 'mission-item', `<div class="mt">${a.title}</div><div class="md">${fmt(a.desc)}</div>`))
  }

  renderChar(body) {
    const g = this.game, pr = g.progress
    const t = PLAYER_TYPES.find((x) => x.key === pr.type) || PLAYER_TYPES[0]
    const next = pr.nextRank
    const col = el('div', 'col'); col.style.flex = '1'; body.appendChild(col)
    col.innerHTML = `<div style="display:flex;gap:18px;align-items:center;margin-bottom:14px"><div style="width:110px;height:110px;border-radius:14px;border:3px solid var(--gold);background:url(${g.portraits.get({ id: 'player', spec: g.player?.char?.spec || CAST[pr.type] })}) center/cover"></div>
      <div><div style="font-family:var(--title);font-size:34px;color:#fff;letter-spacing:1px">${pr.name}</div><div style="color:var(--muted)">${t.name}</div>
      <div style="margin-top:6px;font-family:var(--display);color:var(--gold)">${pr.rank.name}</div>
      <div style="font-size:12.5px;color:#cfc8bb">${next ? `${pr.xp} / ${next.xp} XP până la „${next.name}"` : 'Rang maxim'}</div></div></div>
      <div style="font-size:13.5px;color:#e5dccb;margin-bottom:10px">⚡ ${t.perk}</div>`
    const rows = [
      ['Lei', pr.lei], ['Viață', `${Math.round(pr.hp)} / ${pr.maxHp}`], ['Respect pe stradă', pr.cred + ' / 100'], ['Respect civic', pr.civic + ' / 100'],
      ['👊 Gopnicii te știu', `${pr.tierName('gop')} · ${pr.respect.gop}${pr.look.gop ? ` (haine ${pr.look.gop > 0 ? '+' : ''}${pr.look.gop})` : ''}`], ['🥧 Babele te știu', `${pr.tierName('bab')} · ${pr.respect.bab}${pr.look.bab ? ` (haine ${pr.look.bab > 0 ? '+' : ''}${pr.look.bab})` : ''}`], ['👮 Poliția te știe', `${pr.tierName('pol')} · ${pr.respect.pol}${pr.look.pol ? ` (haine ${pr.look.pol > 0 ? '+' : ''}${pr.look.pol})` : ''}`],
      ['Vorbit cu lumea', pr.stats.talks || 0], ['Gașcă adunată', pr.stats.recruits || 0],
      ['Dosare găsite', pr.dosare.length], ['Gropi astupate', pr.potholes.length], ['Oameni puși la pământ', pr.stats.ko], ['Mașini „împrumutate"', pr.stats.cars],
      ['Curse de taxi', pr.stats.fares], ['Mită dată', pr.stats.bribes], ['Leșinat', pr.stats.fainted], ['Kilometri condus', (pr.stats.km / 1000).toFixed(1)],
    ]
    for (const [a, b] of rows) col.appendChild(el('div', 'stat-row', `<span>${a}</span><span>${b}</span>`))
    const col2 = el('div', 'col'); col2.style.flex = '1'; body.appendChild(col2)
    col2.innerHTML = '<div style="font-family:var(--display);color:var(--gold);margin-bottom:10px">ARME</div>'
    for (const k of Object.keys(WEAPONS)) {
      const w = WEAPONS[k], has = pr.weapons.includes(k)
      const where = pr.weapon === k ? 'în mână' : k === 'fist' || pr.carry.includes(k) ? 'la tine' : 'acasă, în ladă'
      col2.appendChild(el('div', 'stat-row', `<span>${w.icon} ${w.name}</span><span style="color:${has ? '#9cf07c' : '#6a655c'}">${has ? where : w.price ? w.price + ' lei' : '-'}</span>`))
    }
    col2.appendChild(el('div', '', '<div style="font-family:var(--display);color:var(--gold);margin:16px 0 10px">RANGURI</div>'))
    RANKS.forEach((r, i) => col2.appendChild(el('div', 'stat-row', `<span style="color:${i <= pr.rankIdx ? '#fff' : '#6a655c'}">${i + 1}. ${r.name}</span><span>${r.xp} XP</span>`)))
  }

  renderControls(body) {
    const rows = [
      ['Mers pe jos', 'W/S înainte-înapoi · A/D rotire (ține) · săgeți', 'stick stânga', 'joystick stânga'],
      ['Condus', 'W accelerează · S frânează (ține: marșarier) · A/D volan', 'RT/LT · stick stânga', 'joystick stânga'],
      ['Fugi repede / nitro', 'ține Shift', 'ține B', '» / 🔥'],
      ['Lovește', 'Click · J · K', 'X', '👊'],
      ['Sari / frână de mână', 'Space', 'A', '⤒ / ⤓'],
      ['Acțiune, urcă/coboară, vorbește', 'E', 'Y', 'E'],
      ['Schimbă arma', 'Q', 'LB', 'Q'],
      ['Rotește camera', 'click pe joc + mouse (Esc eliberează) · Z/X', 'stick dreapta', 'trage în dreapta'],
      ['Camera: aproape / departe / foarte departe', 'V', 'cruce sus', ''],
      ['Coboară / sari din mașină', 'E (în mers: sari)', 'Y', 'E'],
      ['Zoom', 'rotița', '', ''],
      ['Claxon', 'H', 'L3', '📯'],
      ['Privește înapoi (în mașină)', 'C', 'R3', ''],
      ['Tura de taxi (în taxi)', 'T', '', 'T'],
      ['Hartă / pauză', 'M / Esc', 'Back / Start', '🗺 / ❚❚'],
      ['Sari peste scenă', 'ține Space', 'ține A', 'ține ⏭'],
      ['Reîncearcă misiunea', 'R', '', ''],
      ['Mod foto (fără HUD)', 'O', '', ''],
    ]
    const col = el('div', 'col'); col.style.flex = '1'; body.appendChild(col)
    col.innerHTML = `<table class="ctl"><tr><th></th><th>Tastatură / mouse</th><th>Gamepad</th><th>Touch</th></tr>${rows.map((r) => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>`
  }

  renderSettings(body) {
    const g = this.game, s = g.settings
    const col = el('div', 'col'); col.style.flex = '1'; col.style.maxWidth = '720px'; body.appendChild(col)
    const row = (label, ctl) => { const r = el('div', 'setting', `<span>${label}</span>`); r.appendChild(ctl); col.appendChild(r) }
    const sel = el('select')
    for (const [k, q] of Object.entries(QUALITY)) sel.appendChild(new Option(q.label, k, false, s.quality === k))
    sel.onchange = () => { s.quality = sel.value; g.renderer.applyQuality(s.quality); saveSettings(s) }
    row('Calitate grafică', sel)
    const chk = (key, label) => { const c = el('input'); c.type = 'checkbox'; c.checked = !!s[key]; c.onchange = () => { s[key] = c.checked; saveSettings(s); if (key === 'autoRes') g.renderer.dynScale = 1 }; row(label, c) }
    chk('autoRes', 'Rezoluție adaptivă (FPS stabil)')
    const mm = el('select')
    mm.appendChild(new Option('A/D te rotesc (ține apăsat)', 'steer', false, s.moveMode !== 'camera'))
    mm.appendChild(new Option('Direcții relative la cameră', 'camera', false, s.moveMode === 'camera'))
    mm.onchange = () => { s.moveMode = mm.value; saveSettings(s) }
    row('Mers pe jos (tastatură)', mm)
    chk('mouseLook', 'Cameră cu mouse-ul (click pe joc, Esc eliberează)')
    chk('invertCam', 'Inversează axa verticală a camerei')
    const slider = (key, label, min, max, step, apply) => {
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = s[key]
      r.oninput = () => { s[key] = parseFloat(r.value); apply?.(); saveSettings(s) }
      row(label, r)
    }
    const vol = () => g.audio?.setVolumes(s)
    slider('master', 'Volum general', 0, 1, 0.05, vol)
    slider('music', 'Muzică', 0, 1, 0.05, vol)
    slider('sfx', 'Efecte', 0, 1, 0.05, vol)
    slider('voice', 'Voci', 0, 1, 0.05, vol)
    slider('shake', 'Tremurat cameră', 0, 1.5, 0.1)
    slider('fov', 'Câmp vizual (FOV)', 34, 60, 1, () => { g.cameraRig.baseFov = s.fov })
    slider('camSensitivity', 'Sensibilitate cameră', 0.3, 2.5, 0.1)
    slider('brightness', 'Luminozitate', 0.8, 1.6, 0.05)
  }

  // the teaser, rendered offline from the game itself (tools/trailer.mjs); the menu music
  // steps aside while it plays
  showTrailer() {
    const g = this.game
    const base = import.meta.env.BASE_URL || './'
    // H.264 for most browsers, VP9 for the ones built without it
    const d = el('div', 'trailer', `<div class="box"><video poster="${base}trailer-poster.jpg" controls autoplay playsinline preload="auto"><source src="${base}trailer.mp4" type="video/mp4"><source src="${base}trailer.webm" type="video/webm"></video><button class="btn close">✕  Închide</button></div>`)
    this.layer.appendChild(d)
    const v = d.querySelector('video')
    v.querySelector('source:last-child').addEventListener('error', () => {
      v.insertAdjacentHTML('afterend', `<div class="trailer-err">Browserul tău nu poate reda clipul aici. <a href="${base}trailer.mp4" target="_blank" rel="noopener">Deschide-l separat</a>.</div>`)
    })
    g.audio?.duck(0, 0.4)
    const close = () => { if (!d.isConnected) return; stop(); v.pause(); d.remove(); g.audio?.duck(1, 0.6); g.audio?.sfx('back', { bus: 'ui' }) }
    const stop = padNav(g, d, { back: () => { close(); return true } })
    d.querySelector('.close').onclick = close
    d.onclick = (e) => { if (e.target === d) close() }
  }

  showSettingsOnly() {
    const g = this.game
    // on top of the title screen (the main menu layer sits above the in-game pause layer)
    const m = el('div', 'pause over', '<div class="top"><h1>SETĂRI</h1></div><div class="body"></div><div class="foot"><button class="btn primary">‹ Înapoi</button></div>')
    this.layer.appendChild(m)
    this.renderSettings(m.querySelector('.body'))
    const close = () => { if (!m.isConnected) return; stop(); m.remove(); window.removeEventListener('keydown', onKey, true); g.audio?.sfx('back', { bus: 'ui' }) }
    const onKey = (e) => { if (e.code === 'Backspace' && !/INPUT|SELECT/.test(e.target?.tagName)) { e.preventDefault(); e.stopPropagation(); close() } }
    window.addEventListener('keydown', onKey, true)
    // on top of the title screen's buttons: arrows / pad move through the settings, Esc / B close
    const stop = padNav(g, m, { back: () => { close(); return true }, selector: 'button, select, input' })
    m.querySelector('.foot button').onclick = close
  }
}
