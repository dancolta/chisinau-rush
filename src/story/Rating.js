import { fmt } from '../ui/UI.js'
import '../styles/story.css'

// Mission ratings: every mission with gameplay in it (and every favour) earns one star for
// passing and one for each of its two goals: a time to beat, a car (or a cake, or 40 jars)
// brought back in one piece, nobody seeing you, first try. The best result is kept in the save
// (progress.story.ratings), a star you didn't have before pays, and a mission you've passed can
// be replayed from the pause menu to go for three. 'mission:rated' tells the rest of the game.

export const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
export const starText = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n))
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }

// a goal: a label, a test on the finished mission (MissionContext: playT, stats, data, tries)
// and what to show next to it
export const GOALS = {
  time: (secs, label) => ({ label: label || `Sub ${mmss(secs)}`, test: (m) => m.playT <= secs, show: (m) => mmss(m.playT) }),
  crashes: (n = 0, label) => ({ label: label || (n ? `Maximum ${n} bușituri` : 'Fără nicio bușitură'), test: (m) => m.stats.crashes <= n, show: (m) => `${m.stats.crashes} ${m.stats.crashes === 1 ? 'bușitură' : 'bușituri'}` }),
  hp: (max, label) => ({ label: label || 'Fără să iei bătaie', test: (m) => m.stats.hpLost <= max, show: (m) => (m.stats.hpLost >= 1 ? `−${Math.round(m.stats.hpLost)} viață` : '') }),
  ghost: (label) => ({ label: label || 'Fantomă: nu te-a văzut nimeni', test: (m) => m.stats.alert < 0.6, show: (m) => (m.stats.alert >= 0.05 ? `alertă ${Math.round(m.stats.alert * 100)}%` : '') }),
  first: (label) => ({ label: label || 'Din prima, fără reîncercări', test: (m) => m.tries <= 1 }),
  check: (label, test, show) => ({ label, test, show }),
}

export class Rating {
  constructor(game, story) {
    this.game = game
    this.story = story
  }

  get book() { const st = this.game.progress.story; return (st.ratings ||= {}) }
  best(id) { return this.book[id] || null }
  rated(def) { return !!def?.stars?.length }

  // every star there is to get, and how many you have (the card and the pause menu count them)
  totals() {
    const defs = this.story.ratedDefs()
    let got = 0, full = 0
    for (const d of defs) { const s = this.best(d.id)?.stars || 0; got += s; if (s === 3) full++ }
    return { got, max: defs.length * 3, full, n: defs.length }
  }

  score(m) {
    const goals = m.def.stars.map((gl) => {
      let ok = false, val = ''
      try { ok = !!gl.test(m) } catch (e) { console.error(e) }
      try { val = gl.show ? gl.show(m) || '' : '' } catch (e) { val = '' }
      return { label: gl.label, ok, val }
    })
    return { stars: 1 + goals.filter((x) => x.ok).length, goals, time: m.playT }
  }

  // the mission is passed: score it, keep the best, pay for new stars, show the card.
  // Returns a promise that resolves when the card is gone.
  passed(m, { first = false, replay = false } = {}) {
    const g = this.game, pr = g.progress, def = m.def
    const r = this.score(m)
    const prev = this.best(def.id)
    const newStars = Math.max(0, r.stars - (prev?.stars || 0))
    const record = !!prev && (r.stars > prev.stars || r.time < prev.time - 0.5)
    const rec = this.book[def.id] = {
      stars: Math.max(r.stars, prev?.stars || 0),
      time: Math.round(Math.min(r.time, prev?.time ?? Infinity) * 10) / 10,
      goals: r.goals.map((x, i) => x.ok || !!prev?.goals?.[i]),
      plays: (prev?.plays || 0) + 1,
      last: r.stars,
    }
    // stars you didn't have before pay (that's what a replay is for); the third one, a bonus
    let lei = 0
    if (newStars) {
      lei = 25 * newStars + (rec.stars === 3 ? 50 : 0)
      pr.addLei(lei)
      g.side?.aura.gain(40 * newStars, `${newStars === 1 ? 'Stea nouă' : newStars + ' stele noi'}: ${def.title}`, { raw: true, big: true })
    }
    g.events.emit('mission:rated', { id: def.id, stars: r.stars, time: Math.round(r.time * 10) / 10, best: rec.stars, newStars, side: !!def.side, replay })
    return this.card(def, r, { rec, prev, newStars, record, lei, first, replay })
  }

  card(def, r, { rec, prev, newStars, record, lei, first, replay }) {
    const g = this.game
    const top = g.ui.top
    top.querySelector('.rate-card')?.remove()
    const earn = []
    const w = def.reward || {}
    if (first) {
      if (w.xp) earn.push(`+${w.xp} XP`)
      if (w.lei) earn.push(`+${w.lei} lei`)
      if (w.cred) earn.push(`+${w.cred} respect`)
      if (w.civic) earn.push(`+${w.civic} civic`)
    }
    if (lei) earn.push(`+${lei} lei pe ${newStars === 1 ? 'steaua nouă' : 'stelele noi'}`)
    if (newStars) earn.push(`+${40 * newStars} AURA`)
    const goals = [{ label: 'Misiune terminată', ok: true, val: '' }, ...r.goals]
    const stars = [1, 2, 3].map((k) => `<i class="${k <= r.stars ? 'on' : ''}" style="animation-delay:${(0.2 + k * 0.3).toFixed(2)}s">★</i>`).join('')
    const tot = this.totals()
    // (the hidden .bigmsg keeps the AURA level-up card from landing on top of this one: it waits
    // for any big message to clear)
    const html = `<i class="bigmsg" style="display:none"></i><div class="rc-rays"></div><div class="rc-box">
      <div class="rc-k">${def.passTitle || 'MISIUNE REUȘITĂ'}</div>
      <div class="rc-t">${def.chapterName ? def.chapterName + ' · ' : ''}${def.title}${replay ? ' · rejucare' : ''}</div>
      <div class="rc-stars">${stars}</div>
      <ul class="rc-goals">${goals.map((x, i) => `<li class="${x.ok ? 'ok' : 'no'}" style="animation-delay:${(1.1 + i * 0.16).toFixed(2)}s">${fmt(x.label)}${x.val ? `<span class="v">${fmt(x.val)}</span>` : ''}</li>`).join('')}</ul>
      <div class="rc-row">⏱ <span class="n">${mmss(r.time)}</span>${prev ? ` · cel mai bun: ${starText(rec.stars)} <span class="n">${mmss(rec.time)}</span>` : ''}${record ? '<span class="rc-new">RECORD NOU</span>' : ''}</div>
      ${earn.length ? `<div class="rc-earn">${earn.join(' · ')}</div>` : replay ? '<div class="rc-earn"><span class="plain">La rejucare plătesc doar stelele noi.</span></div>' : ''}
      <div class="rc-row rc-tot">Colecția ta: <span class="n">★ ${tot.got}/${tot.max}</span>${rec.stars < 3 ? ' · Pauză › Misiuni › ↻ Rejoacă: mai e o stea aici' : ' · aici le ai pe toate'}</div>
    </div>`
    const c = el('div', 'rate-card' + (r.stars === 3 ? ' perfect' : ''), html)
    top.appendChild(c)
    const au = g.audio
    au?.sting('mission_pass')
    // each star lands with a coin, higher every time; the empty ones just click
    if (!g.autoTalk) for (let k = 1; k <= 3; k++) setTimeout(() => { if (!c.isConnected) return; if (k <= r.stars) au?.sfx(k === 3 ? 'coins_many' : 'coin', { bus: 'ui', vol: 0.7, pitch: 1 + k * 0.14 }); else au?.sfx('click', { bus: 'ui', vol: 0.5 }) }, (0.35 + k * 0.3) * 1000)
    if (r.stars === 3) {
      const p = g.player
      setTimeout(() => { if (p && !g.home?.inside) g.fx?.confetti(p.pos.x, p.pos.y + 2.4, p.pos.z, 60) }, 1300)
    }
    const secs = g.autoTalk ? 1.4 : 5.2
    return new Promise((res) => setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.remove(); res() }, 560) }, secs * 1000))
  }
}
