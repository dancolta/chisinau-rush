// The account screen (main menu "Cont", and the "Cont" tab of the pause menu) and the
// "which save do you keep?" picker. The talking to the server lives in src/net/Cloud.js.
import { padNav } from './Nav.js'
import { further } from '../net/Cloud.js'
import { PLAYER_TYPES } from '../data/outfits.js'
import { Progress, RANKS } from '../gameplay/Progress.js'
import { MISSIONS } from '../story/missions.js'

const STORY_TOTAL = MISSIONS.filter((m) => !m.activity).length
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// "acum 2 min", "acum 3 ore", "ieri" (Romanian wants "de" from twenty up: "20 de ore")
export function ago(ts, now = Date.now()) {
  const s = Math.max(0, (now - ts) / 1000)
  const de = (n) => (n % 100 >= 20 || (n >= 100 && n % 100 === 0) ? ' de' : '')
  if (s < 45) return 'acum câteva secunde'
  if (s < 90) return 'acum un minut'
  const m = Math.round(s / 60)
  if (m < 60) return `acum ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? 'acum o oră' : `acum ${h}${de(h)} ore`
  const d = Math.round(h / 24)
  if (d === 1) return 'ieri'
  if (d < 31) return `acum ${d}${de(d)} zile`
  return new Date(ts).toLocaleDateString('ro-RO')
}

export function cloudStatus(c) {
  switch (c.state) {
    case 'idle': return { tone: 'ok', text: c.lastSync ? `Salvat în cloud · ${ago(c.lastSync)}` : 'Conectat · nimic de salvat încă' }
    case 'pending': return { tone: 'busy', text: 'Salvare nouă · pleacă în cloud în câteva secunde' }
    case 'syncing': return { tone: 'busy', text: 'Se sincronizează…' }
    case 'retry': return { tone: 'bad', text: navigator.onLine === false ? 'Offline · salvat doar aici, reîncerc…' : 'Nesincronizat, reîncerc…' }
    case 'conflict': return { tone: 'bad', text: 'Două salvări diferite · alege una' }
    case 'error': return { tone: 'bad', text: c.error || 'Salvarea n-a putut fi trimisă.' }
    case 'expired': return { tone: 'bad', text: 'Sesiunea a expirat · intră din nou în cont' }
    default: return { tone: '', text: '' }
  }
}

export function summary(d) {
  const type = PLAYER_TYPES.find((t) => t.key === d.type)
  return {
    name: d.name || 'Vasea', type: type ? type.name : '',
    done: d.story?.done?.length || 0, lei: money(d.lei), rank: (RANKS[d.rankIdx || 0] || RANKS[0]).name, xp: money(d.xp), t: d.t || 0,
  }
}

// one line for menus: "Dan · 7/14 misiuni · 1 234 lei · Om cu relații"
export function saveLine(d) {
  const s = summary(d)
  return `${esc(s.name)} · ${s.done}/${STORY_TOTAL} misiuni · ${s.lei} lei · ${esc(s.rank)}`
}

function check(email, password, signup) {
  if (!EMAIL_RE.test(email) || email.length > 254) return 'Scrie un email valid.'
  if (!password) return 'Scrie parola.'
  if (signup && password.length < 8) return 'Parola trebuie să aibă cel puțin 8 caractere.'
  if (password.length > 200) return 'Parola e prea lungă (maximum 200 de caractere).'
  return ''
}

// The account panel inside `root`. opts.back(source, typing) handles Esc / B (return false to
// let the key through); opts.navRoot widens keyboard/pad navigation to the whole screen;
// opts.autofocus puts the cursor in the email field. Returns a function that takes it down.
export function renderAccount(game, root, { back = null, navRoot = null, autofocus = false } = {}) {
  const cloud = game.cloud
  let mode = 'login', busy = false, error = '', shown = null
  let stopNav = null
  const look = () => (cloud.loggedIn ? 'in' : cloud.state)
  const wrap = el('div', 'acct')
  root.appendChild(wrap)

  const nav = (initial) => { stopNav?.(); stopNav = padNav(game, navRoot || wrap, { back, initial }) }

  const paintStatus = () => {
    const st = wrap.querySelector('.acct-status')
    if (!st) return
    const s = cloudStatus(cloud)
    st.className = 'acct-status ' + s.tone
    st.querySelector('span').textContent = s.text
  }

  const guest = () => {
    const signup = mode === 'signup'
    const expired = cloud.state === 'expired'
    wrap.innerHTML = `
      <div class="acct-h">SALVARE ÎN CLOUD</div>
      <p class="acct-p">${expired ? '<b class="r">Sesiunea a expirat.</b> Intră din nou ca să-ți ții progresul în cloud.' : 'Fă-ți cont și progresul te așteaptă pe orice telefon sau calculator. Fără cont, salvarea stă doar în browserul ăsta, ca banii la saltea.'}</p>
      <div class="acct-seg"><button type="button" class="acct-tab${signup ? '' : ' on'}" data-m="login">Intră în cont</button><button type="button" class="acct-tab${signup ? ' on' : ''}" data-m="signup">Cont nou</button></div>
      <form class="acct-form" novalidate>
        <label class="acct-l"><span>Email</span><input name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="254" placeholder="tu@exemplu.md"></label>
        <label class="acct-l"><span>Parolă</span><span class="acct-pw"><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" maxlength="200" placeholder="${signup ? 'minim 8 caractere' : 'parola ta'}"><button type="button" class="acct-eye" aria-label="Arată parola" title="Arată parola">👁</button></span></label>
        <div class="acct-err" role="alert" aria-live="polite"></div>
        <button type="submit" class="btn primary acct-go">${signup ? '▶ Creează contul' : '▶ Intră în cont'}</button>
      </form>
      <div class="acct-note">${signup ? 'Parola: minim 8 caractere. Nu pune aceeași parolă ca la bancă: aici e Chișinău.' : 'Ai jucat deja fără cont? Progresul de aici nu se pierde: după ce intri, alegi ce păstrezi.'}</div>`
    const emailIn = wrap.querySelector('input[name=email]'), pwIn = wrap.querySelector('input[name=password]')
    const errEl = wrap.querySelector('.acct-err'), go = wrap.querySelector('.acct-go'), eye = wrap.querySelector('.acct-eye')
    emailIn.value = wrap.dataset.email || cloud.expiredEmail || ''
    const showErr = (t) => { error = t; errEl.textContent = t; errEl.classList.toggle('on', !!t) }
    showErr(error)
    emailIn.oninput = () => { wrap.dataset.email = emailIn.value; if (error) showErr('') }
    pwIn.oninput = () => { if (error) showErr('') }
    // gamepads and phones: bring the field into view above an on-screen keyboard
    for (const i of [emailIn, pwIn]) i.addEventListener('focus', () => setTimeout(() => i.scrollIntoView?.({ block: 'center' }), 250))
    eye.onclick = () => {
      const show = pwIn.type === 'password'
      pwIn.type = show ? 'text' : 'password'
      eye.textContent = show ? '🙈' : '👁'
      eye.setAttribute('aria-label', show ? 'Ascunde parola' : 'Arată parola')
      eye.title = eye.getAttribute('aria-label')
    }
    for (const t of wrap.querySelectorAll('.acct-tab')) {
      t.onclick = () => {
        if (busy || t.dataset.m === mode) return
        mode = t.dataset.m
        error = ''
        game.audio?.sfx('click', { bus: 'ui' })
        render()
        wrap.querySelector(`.acct-tab[data-m="${mode}"]`)?.focus()
      }
    }
    wrap.querySelector('form').onsubmit = async (e) => {
      e.preventDefault()
      if (busy) return
      const email = emailIn.value.trim().toLowerCase(), password = pwIn.value
      const bad = check(email, password, mode === 'signup')
      if (bad) { showErr(bad); game.audio?.sfx('error', { bus: 'ui' }); (bad.includes('email') ? emailIn : pwIn).focus(); return }
      busy = true
      go.disabled = true
      go.textContent = mode === 'signup' ? 'Se creează contul…' : 'Se verifică…'
      const r = mode === 'signup' ? await cloud.signup(email, password) : await cloud.login(email, password)
      busy = false
      if (r.ok) { game.audio?.sfx('confirm', { bus: 'ui' }); render(); return }
      if (!go.isConnected) return
      go.disabled = false
      go.textContent = mode === 'signup' ? '▶ Creează contul' : '▶ Intră în cont'
      showErr(r.error)
      game.audio?.sfx('error', { bus: 'ui' })
      pwIn.focus()
    }
    nav()
    if (autofocus) { autofocus = false; setTimeout(() => (emailIn.value ? pwIn : emailIn).focus(), 60) }
  }

  const member = () => {
    const local = Progress.hasSave()
    wrap.innerHTML = `
      <div class="acct-h">CONTUL TĂU</div>
      <div class="acct-email">☁ ${esc(cloud.email)}</div>
      <div class="acct-status"><i></i><span></span></div>
      <div class="acct-save">${local ? `💾 ${saveLine(local)}` : '💾 Încă nicio salvare. Începe un joc și se salvează singur.'}</div>
      <div class="acct-err" role="alert" aria-live="polite"></div>
      <div class="acct-row"><button type="button" class="btn acct-sync">⟳ Sincronizează</button><button type="button" class="btn danger acct-out">Deconectare</button></div>
      <div class="acct-note">Cât joci, progresul pleacă singur în cloud. Pe alt dispozitiv intri cu același email și aceeași parolă.</div>`
    paintStatus()
    const errEl = wrap.querySelector('.acct-err')
    wrap.querySelector('.acct-sync').onclick = () => {
      if (busy) return
      game.audio?.sfx('click', { bus: 'ui' })
      if (game.state === 'play') game.progress.save()
      cloud.sync()
    }
    const out = wrap.querySelector('.acct-out')
    out.onclick = async () => {
      if (busy) return
      busy = true
      out.disabled = true
      out.textContent = 'Se deconectează…'
      await cloud.logout()
      busy = false
      if (cloud.loggedIn) { out.disabled = false; out.textContent = 'Deconectare'; errEl.textContent = 'Nu te-am putut deconecta acum. Mai încearcă.'; errEl.classList.add('on'); return }
      game.audio?.sfx('back', { bus: 'ui' })
      mode = 'login'
      render()
    }
    nav()
  }

  const render = () => {
    shown = look()
    if (cloud.loggedIn) member()
    else guest()
  }

  const off = cloud.on(() => {
    if (!wrap.isConnected) return
    // logged in or out (or the session expired) under our feet: redraw
    if ((shown === 'in') !== cloud.loggedIn || (look() === 'expired' && shown !== 'expired')) { if (!busy) render() }
    else if (cloud.loggedIn) {
      paintStatus()
      const save = wrap.querySelector('.acct-save'), local = Progress.hasSave()
      if (save && local) save.innerHTML = `💾 ${saveLine(local)}`
    }
  })
  const clock = setInterval(paintStatus, 15000)
  render()
  return () => { off(); clearInterval(clock); stopNav?.(); wrap.remove() }
}

// main menu: the account panel as a full screen over the title
export function openAccountScreen(game, { onClose } = {}) {
  const m = el('div', 'pause over acct-screen', '<div class="top"><h1>CONT</h1></div><div class="body"></div><div class="foot"><button type="button" class="btn primary acct-back">‹ Înapoi</button></div>')
  game.ui.top.appendChild(m)
  let dispose = null
  const close = () => {
    if (!m.isConnected) return
    dispose?.()
    m.remove()
    game.audio?.sfx('back', { bus: 'ui' })
    onClose?.()
  }
  // on phones the keyboard would jump up at once: there the player taps the field first
  dispose = renderAccount(game, m.querySelector('.body'), { navRoot: m, autofocus: !game.touch, back: () => { close(); return true } })
  m.querySelector('.acct-back').onclick = close
  return close
}

// Both a local and a cloud save exist and neither is simply ahead: the player picks.
// Waits for a calm moment (no cutscene, dialogue or mission), pauses the game while it's up,
// and preselects the save that came further so a quick Enter never throws progress away.
export async function chooseSave(game, local, cloud) {
  const calm = () => game.state !== 'loading' && (game.state !== 'play' || game.paused || (!game.cutscene && !game.ui.modalOpen && !game.story?.active))
  while (!calm()) await new Promise((r) => setTimeout(r, 500))
  const ui = game.ui
  const wasPaused = game.paused, wasModal = ui.modalOpen
  if (game.state === 'play') { game.paused = true; ui.modalOpen = true; game.audio?.duck(0.35, 0.3) }
  const best = further(local, cloud)
  const card = (d, pick, kicker) => {
    const s = summary(d)
    return `<div class="sp-card${d === best ? ' best' : ''}">
      <div class="sp-k">${kicker}</div>
      <div class="sp-name">${esc(s.name)}<small>${esc(s.type)}</small></div>
      <div class="sp-row"><span>Misiuni</span><b>${s.done} / ${STORY_TOTAL}</b></div>
      <div class="sp-row"><span>Bani</span><b>${s.lei} lei</b></div>
      <div class="sp-row"><span>Rang</span><b>${esc(s.rank)} · ${s.xp} XP</b></div>
      <div class="sp-row"><span>Ultima dată</span><b>${s.t ? ago(s.t) : '-'}</b></div>
      ${d === best ? '<div class="sp-badge">★ mai mult progres</div>' : '<div class="sp-badge none"></div>'}
      <button type="button" class="btn ${d === best ? 'primary' : ''} sp-pick" data-pick="${pick}">Păstrează asta</button>
    </div>`
  }
  const m = el('div', 'savepick', `<div class="sp-box">
    <h3>DOUĂ SALVĂRI DIFERITE</h3>
    <p>Pe contul tău e altă salvare decât pe dispozitivul ăsta. Pe care o păstrezi? Cealaltă se pierde.</p>
    <div class="sp-cards">${card(local, 'local', 'PE DISPOZITIVUL ĂSTA')}${card(cloud, 'cloud', 'ÎN CLOUD')}</div></div>`)
  ui.top.appendChild(m)
  game.audio?.sfx('notify', { bus: 'ui', vol: 0.8 })
  const pick = await new Promise((resolve) => {
    const stop = padNav(game, m, { initial: m.querySelector(`.sp-pick[data-pick="${best === cloud ? 'cloud' : 'local'}"]`) })
    for (const b of m.querySelectorAll('.sp-pick')) b.onclick = () => { stop(); resolve(b.dataset.pick) }
  })
  m.remove()
  game.audio?.sfx('confirm', { bus: 'ui' })
  if (game.state === 'play') { game.paused = wasPaused; ui.modalOpen = wasModal; if (!wasPaused) game.audio?.duck(1, 0.4); game.input.clear() }
  return pick
}
