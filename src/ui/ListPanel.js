import { fmt } from './UI.js'

// A side panel with tabs and a scrolling list, for the wardrobe, the clothes shops and the
// weapon chest. The game stays visible on the left (the hero turns in a close-up there).
// Keyboard: ↑↓/WS pick, ←→/AD tab, Enter/Space/E use, Z/X turn the hero, Esc close.
// Gamepad: d-pad, A use, B close, LB/RB turn. Mouse: click to pick, click again to use.
//
// opts: { title, sub, tabs: [{ key, label }], items(tabKey) -> [{ id, brand, name, meta, note,
//         state: 'worn'|'owned'|'locked'|'', action }], onFocus(item), onPick(item) -> truthy to
//         re-render, onTurn(dir, dt), hint }
// resolves when closed
export function openListPanel(game, opts) {
  const ui = game.ui
  return new Promise((resolve) => {
    ui.modalOpen = true
    game.audio?.duck(0.6, 0.3)
    const root = document.createElement('div')
    root.className = 'lp'
    root.innerHTML = `<div class="lp-head"><div><div class="lp-title"></div><div class="lp-sub"></div></div><button class="lp-x" title="Închide">✕</button></div>
      <div class="lp-tabs"></div><div class="lp-list"></div><div class="lp-info"></div><div class="lp-keys"></div>`
    ui.top.appendChild(root)
    const $ = (s) => root.querySelector(s)
    $('.lp-title').textContent = opts.title || ''
    const sub = () => { $('.lp-sub').textContent = typeof opts.sub === 'function' ? opts.sub() : (opts.sub || '') }
    sub()
    $('.lp-keys').innerHTML = opts.hint || '<b>↑↓</b> alege · <b>←→</b> raft · <b>Enter</b> ia · <b>Z/X</b> rotește · <b>Esc</b> ieși'
    const tabs = opts.tabs || [{ key: 'all', label: '' }]
    let tab = 0, sel = 0, items = [], closed = false, focusT = null

    const renderTabs = () => {
      const el = $('.lp-tabs')
      el.innerHTML = ''
      el.style.display = tabs.length > 1 ? '' : 'none'
      tabs.forEach((t, i) => {
        const b = document.createElement('button')
        b.className = 'lp-tab' + (i === tab ? ' on' : '')
        b.textContent = t.label
        b.onclick = () => { setTab(i) }
        el.appendChild(b)
      })
    }
    const render = () => {
      sub()
      items = opts.items(tabs[tab].key) || []
      if (sel >= items.length) sel = Math.max(0, items.length - 1)
      const list = $('.lp-list')
      list.innerHTML = ''
      if (!items.length) list.innerHTML = '<div class="lp-empty">Nimic aici încă.</div>'
      items.forEach((it, i) => {
        const d = document.createElement('div')
        d.className = `lp-item ${it.state || ''}${i === sel ? ' sel' : ''}`
        const b = it.brand || { name: '', bg: '#333', fg: '#fff' }
        d.innerHTML = `<div class="lp-brand" style="background:${b.bg};color:${b.fg}">${b.name}</div><div class="lp-body"><div class="lp-name">${fmt(it.name)}</div><div class="lp-meta">${fmt(it.meta || '')}</div></div>`
        d.onclick = () => { if (i === sel) pick(); else { sel = i; paint(); focus() } }
        list.appendChild(d)
      })
      paint()
    }
    const paint = () => {
      const els = root.querySelectorAll('.lp-item')
      els.forEach((e, i) => e.classList.toggle('sel', i === sel))
      els[sel]?.scrollIntoView?.({ block: 'nearest' })
      const it = items[sel]
      $('.lp-info').innerHTML = it ? `${it.note ? `<div class="lp-note">${fmt(it.note)}</div>` : ''}<div class="lp-act">${fmt(it.action || '')}</div>` : ''
    }
    // previews wait a beat so scrolling fast doesn't rebuild the hero on every step
    const focus = () => { clearTimeout(focusT); focusT = setTimeout(() => { if (!closed && items[sel]) opts.onFocus?.(items[sel]) }, 90) }
    const setTab = (i) => { tab = (i + tabs.length) % tabs.length; sel = 0; renderTabs(); render(); focus(); game.audio?.sfx('hover', { bus: 'ui' }) }
    const move = (k) => { if (!items.length) return; sel = (sel + k + items.length) % items.length; paint(); focus(); game.audio?.sfx('hover', { bus: 'ui' }) }
    const pick = async () => {
      const it = items[sel]
      if (!it) return
      const r = await opts.onPick?.(it)
      if (closed) return
      if (r) { render(); focus() }
    }
    const close = () => {
      if (closed) return
      closed = true
      clearTimeout(focusT)
      clearInterval(timer)
      window.removeEventListener('keydown', onKey, true)
      root.remove()
      ui.modalOpen = false
      ui.panel = null
      game.audio?.duck(1, 0.4)
      game.input.clear()
      game.audio?.sfx('back', { bus: 'ui' })
      resolve()
    }
    const onKey = (e) => {
      const c = e.code
      let used = true
      if (c === 'ArrowUp' || c === 'KeyW') move(-1)
      else if (c === 'ArrowDown' || c === 'KeyS') move(1)
      else if (c === 'ArrowLeft' || c === 'KeyA') setTab(tab - 1)
      else if (c === 'ArrowRight' || c === 'KeyD') setTab(tab + 1)
      else if (c === 'Enter' || c === 'Space' || c === 'KeyE') pick()
      else if (c === 'Escape' || c === 'Backspace') close()
      else used = false
      if (used) { e.preventDefault(); e.stopPropagation() }
    }
    $('.lp-x').onclick = close
    // turning the hero (held keys / shoulder buttons) and the gamepad, on a timer
    let prev = game.input.padState(), last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const inp = game.input
      const pad = inp.padState()
      const edge = (i) => pad && pad.b[i] && !(prev && prev.b[i])
      let turn = (inp.key('KeyX') ? 1 : 0) - (inp.key('KeyZ') ? 1 : 0)
      if (pad) {
        if (pad.b[5]) turn += 1
        if (pad.b[4]) turn -= 1
        if (edge(12)) move(-1)
        if (edge(13)) move(1)
        if (edge(14)) setTab(tab - 1)
        if (edge(15)) setTab(tab + 1)
        if (edge(0)) pick()
        if (edge(1)) close()
      }
      prev = pad
      if (turn) opts.onTurn?.(turn, dt)
    }, 33)
    setTimeout(() => { if (!closed) window.addEventListener('keydown', onKey, true) }, 120)
    ui.panel = { move, setTab, pick, close, get sel() { return sel }, get items() { return items }, get tab() { return tabs[tab].key } }
    renderTabs()
    render()
    focus()
  })
}
