import { fmt } from '../ui/UI.js'
import { ACHIEVEMENTS, ACH_CATS, ACH_TOTAL, TIERS, CURRENCIES, RESPECT_PERKS, STREET_STATS, STREAK, SEEDS } from '../data/goals.js'
import { RANKS, RESPECT_TIERS, RESPECT_NAMES, RESPECT_WHO, RESPECT_ICON } from '../gameplay/Progress.js'
import { challengeDef } from './Challenges.js'
import { loginPreview } from './Goals.js'
import '../styles/goals.css'

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const nf = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const pct = (k) => `${(Math.max(0, Math.min(1, k)) * 100).toFixed(1)}%`
const bar = (k, cls = '') => `<div class="gbar ${cls}"><i style="width:${pct(k)}"></i></div>`
const date = (t) => new Date(t).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })

// The pause menu's Progres and Realizări pages, and the daily-bonus strip on the title screen.
// Progres is the one place that says what everything is for: the four things you collect (with
// the next reward each one brings), what each respect tier gets you, the daily loop (streak,
// challenges, seed packets, achievements) and the totals. On a phone the cards shrink and the
// sections under them stack in one column.
export class GoalsUI {
  constructor(goals) {
    this.goals = goals
    this.game = goals.game
  }

  get side() { return this.goals.side }

  // ---- Progres ---------------------------------------------------------------------------------------------
  renderProgress(body) {
    const g = this.game, pr = g.progress, goals = this.goals, m = goals.state, a = this.side.aura
    const col = el('div', 'col pg')
    col.style.flex = '1'
    body.appendChild(col)
    col.appendChild(el('div', 'pg-intro', `<b>Cum crești în Chișinău.</b> Patru lucruri, fiecare cu rostul lui: ${Object.values(CURRENCIES).map((c) => `${c.icon} ${c.name}`).join(' · ')}.`))
    // the four currencies, each with its next reward
    const cards = el('div', 'pg-cards')
    col.appendChild(cards)
    const nr = pr.nextRank
    const span = nr ? nr.xp - pr.rank.xp : 1
    cards.appendChild(this.card('xp', `<div class="big">${pr.rank.name}</div>${bar(nr ? (pr.xp - pr.rank.xp) / span : 1, 'xp')}
      <div class="nums">${nf(pr.xp)} XP${nr ? ` · încă <b>${nf(nr.xp - pr.xp)}</b> până la rangul ${pr.rankIdx + 2}` : ' · rang maxim'}</div>
      ${nr ? `<div class="nx">▸ <b>${nr.name}</b>: ${goals.rankPrize(pr.rankIdx + 1)}</div>` : '<div class="nx">Ai ajuns primar. Lucrăm la asta.</div>'}`))
    cards.appendChild(this.card('aura', `<div class="big">Nv ${a.level} · ${a.title.name}</div>${bar(a.progress, 'aura')}
      <div class="nums">${nf(a.total)} AURA · încă <b>${nf(a.toNext)}</b> până la nivelul ${a.level + 1}</div>
      <div class="nx">▸ <b>Nv ${a.level + 1}</b>: ${goals.levelPrize(a.level + 1)}</div>`))
    const resp = ['gop', 'bab', 'pol'].map((k) => `<div class="rrow"><span>${RESPECT_ICON[k]} ${RESPECT_WHO[k]}</span><b>${pr.tierName(k)}</b></div>`).join('')
    cards.appendChild(this.card('respect', `${resp}<div class="nx">▸ Ce-ți aduce fiecare treaptă: mai jos.</div>`))
    cards.appendChild(this.card('lei', `<div class="big">${nf(pr.lei)} lei</div>
      <div class="nums">Câștigați de când se numără: <b>${nf(m.lei)} lei</b></div>
      <div class="nx">▸ Bonus zilnic, realizări, semințe de aur: toate plătesc în lei.</div>`))

    const grid = el('div', 'pg-grid')
    col.appendChild(grid)
    grid.appendChild(this.respectSection())
    grid.appendChild(this.loopSection())
    grid.appendChild(this.ranksSection())
    grid.appendChild(this.totalsSection())
  }

  card(key, inner) {
    const c = CURRENCIES[key]
    return el('div', `pg-card ${key}`, `<div class="hd"><span class="ic">${c.icon}</span><span class="nm">${c.name}</span><span class="wt">${c.what}</span></div>
      <div class="bd">${inner}</div><div class="ft"><span>De unde:</span> ${c.from}<br><span>La ce:</span> ${c.gives}</div>`)
  }

  respectSection() {
    const pr = this.game.progress
    const s = el('section', 'pg-sec resp', '<h4>RESPECT · CE-ȚI ADUCE FIECARE TREAPTĂ</h4>')
    for (const k of ['gop', 'bab', 'pol']) {
      const v = pr.respectEff(k), t = pr.tier(k)
      const lo = RESPECT_TIERS[t], hi = RESPECT_TIERS[t + 1]
      const look = pr.look[k] ? ` <small>(haine ${pr.look[k] > 0 ? '+' : ''}${pr.look[k]})</small>` : ''
      s.appendChild(el('div', 'rgroup', `<div class="rh"><span>${RESPECT_ICON[k]} ${RESPECT_WHO[k][0].toUpperCase() + RESPECT_WHO[k].slice(1)}</span><b>${RESPECT_NAMES[k][t]}</b><em>${Math.round(v)}/100${look}</em></div>
        ${bar(hi ? (v - lo) / (hi - lo) : 1, 'resp ' + k)}
        <div class="rp now">✔ ${RESPECT_PERKS[k][t]}</div>
        ${hi ? `<div class="rp next">▸ <b>${RESPECT_NAMES[k][t + 1]}</b> (la ${hi}): ${RESPECT_PERKS[k][t + 1]}</div>` : '<div class="rp next">Treapta cea mai de sus.</div>'}`))
    }
    for (const [k, d] of Object.entries(STREET_STATS)) {
      const v = pr[k] || 0
      s.appendChild(el('div', 'rgroup small', `<div class="rh"><span>${d.icon} ${d.name}</span><em>${v}/100</em></div>${bar(v / 100, 'st')}<div class="rp">${d.text}</div>`))
    }
    return s
  }

  loopSection() {
    const goals = this.goals, m = goals.state, ch = this.side.challenges
    const s = el('section', 'pg-sec loop', '<h4>ZI DE ZI</h4>')
    // the streak
    const L = m.login
    const day = L.streak ? ((L.streak - 1) % STREAK.length) + 1 : 0
    const taken = L.day === goals.today()
    const days = STREAK.map((r, i) => `<div class="d ${i + 1 < day || (taken && i + 1 === day) ? 'got' : ''} ${i + 1 === day ? 'now' : ''}"><small>${i + 1}</small><b>${r.mama ? '🎁' : nf(r.lei)}</b></div>`).join('')
    const nx = STREAK[day % STREAK.length]
    s.appendChild(el('div', 'pg-blk', `<div class="bh">🔥 Bonus zilnic <em>${L.streak ? `${L.streak} ${L.streak === 1 ? 'zi' : 'zile'} la rând` : 'începe azi'}</em></div>
      <div class="days">${days}</div><div class="bf">${taken ? `Luat azi. Revino mâine: <b>+${nf(nx.lei)} lei${nx.aura ? ` · +${nx.aura} AURA` : ''}</b>. O zi ratată și o iei de la capăt.` : 'Intră în fiecare zi: premiile cresc 7 zile la rând.'}</div>`))
    // the day's challenges
    const rows = ch.unlocked && ch.list.length ? ch.list.map((c) => {
      const def = challengeDef(c.id)
      if (!def) return ''
      return `<div class="brow ${c.done ? 'done' : ''}"><span class="i">${c.done ? '✔' : def.icon}</span><span class="t">${fmt(def.text)}</span><b>${ch.fmtN(def, c.n)}/${ch.fmtN(def, def.n)}</b></div>`
    }).join('') : '<div class="bf">Se deblochează după „Pâine de la Linella".</div>'
    s.appendChild(el('div', 'pg-blk', `<div class="bh">📋 Provocările zilei <em>detalii în Aură</em></div>${rows}`))
    // the seed packets
    const n = m.seeds.length
    const nextAt = [10, 20, 30].find((x) => x > n)
    const seedsAch = ACHIEVEMENTS.find((x) => x.id === 'seeds')
    const prize = nextAt ? seedsAch.tiers[[10, 20, 30].indexOf(nextAt)][1] : null
    s.appendChild(el('div', 'pg-blk', `<div class="bh">🌻 Semințe de aur <em>${n}/${SEEDS.count}</em></div>${bar(n / SEEDS.count, 'seed')}
      <div class="bf">${nextAt ? `La ${nextAt}: <b>+${nf(prize.lei)} lei${prize.clothes ? ' și un trening de aur' : ''}</b>. Strălucesc de departe; pe hartă apar când ești aproape.` : 'Le-ai găsit pe toate. Pacanii te privesc cu respect.'}</div>`))
    // achievements: the count and the closest ones
    const close = this.closest(3)
    s.appendChild(el('div', 'pg-blk', `<div class="bh">🏆 Realizări <em>${goals.unlocked}/${ACH_TOTAL}</em></div>${bar(goals.unlocked / ACH_TOTAL, 'ach')}
      ${close.map((c) => `<div class="brow"><span class="i">${c.icon}</span><span class="t">${c.name}${c.tier ? ` <small>${c.tier.icon}</small>` : ''}</span><b>${c.v}/${c.target}</b></div>`).join('')}`))
    return s
  }

  ranksSection() {
    const pr = this.game.progress
    const s = el('section', 'pg-sec ranks', '<h4>CARIERA · RANGURILE ȘI CE ADUC</h4>')
    RANKS.forEach((r, i) => {
      const got = i <= pr.rankIdx, cur = i === pr.rankIdx + 1
      s.appendChild(el('div', `rk ${got ? 'got' : ''} ${cur ? 'cur' : ''}`, `<span class="n">${got ? '✔' : i + 1}</span><span class="t">${r.name}${i ? `<small>${this.goals.rankPrize(i)}</small>` : '<small>de aici începi</small>'}</span><span class="x">${nf(r.xp)} XP</span>`))
    })
    return s
  }

  totalsSection() {
    const g = this.game, pr = g.progress, st = pr.stats, m = this.goals.state, side = this.side.state
    const s = el('section', 'pg-sec totals', '<h4>TOTALURI</h4>')
    const rows = [
      ['💵 Lei câștigați', `${nf(m.lei)} lei`], ['⭐ XP', nf(pr.xp)], ['✨ AURA adunată', nf(side.aura.lifetime)],
      ['📖 Misiuni din poveste', `${pr.story.done.length}`], ['🔥 Zile jucate', `${m.login.days} (cel mai lung șir: ${m.login.best})`],
      ['🏆 Realizări', `${this.goals.unlocked}/${ACH_TOTAL}`], ['🌻 Semințe de aur', `${m.seeds.length}/${SEEDS.count}`],
      ['🗺️ Sectoare vizitate', `${m.districts.length}/4`], ['🚕 Curse de taxi', st.fares || 0], ['🕳️ Gropi astupate', pr.potholes.length],
      ['👊 Oameni puși la pământ', st.ko || 0], ['🚗 Kilometri', ((st.km || 0) / 1000).toFixed(1).replace('.', ',')],
    ]
    for (const [k, v] of rows) s.appendChild(el('div', 'stat-row', `<span>${k}</span><span>${v}</span>`))
    return s
  }

  // the unfinished achievement tiers nearest to done (the visible ones)
  closest(n) {
    const goals = this.goals, m = goals.state
    const out = []
    for (const a of ACHIEVEMENTS) {
      if (a.hidden) continue
      const rec = m.ach[a.id], t = rec ? rec.n : 0
      if (t >= a.tiers.length) continue
      const v = goals.value(a), target = a.tiers[t][0]
      if (v <= 0 && !a.max) continue
      out.push({ icon: a.icon, name: a.name, tier: a.tiers.length > 1 ? TIERS[t] : null, v: Math.min(v, target), target, k: v / target })
    }
    return out.sort((x, y) => y.k - x.k).slice(0, n)
  }

  // ---- Realizări -------------------------------------------------------------------------------------------
  renderAchievements(body) {
    const goals = this.goals, m = goals.state
    const col = el('div', 'col achp')
    col.style.flex = '1'
    body.appendChild(col)
    const won = ACHIEVEMENTS.reduce((s, a) => {
      const rec = m.ach[a.id]
      for (let t = 0; t < (rec?.n || 0); t++) s += a.tiers[t][1].lei || 0
      return s
    }, 0)
    col.appendChild(el('div', 'ach-head', `<div class="ah-t">🏆 REALIZĂRI <b>${goals.unlocked}</b><small>/${ACH_TOTAL}</small></div>
      ${bar(goals.unlocked / ACH_TOTAL, 'ach')}<div class="ah-s">Premii încasate: <b>${nf(won)} lei</b> · 🥉🥈🥇 unele au trei trepte · cele ascunse se văd abia când le faci.</div>`))
    for (const cat of ACH_CATS) {
      const list = ACHIEVEMENTS.filter((a) => a.cat === cat.id)
      if (!list.length) continue
      const got = list.reduce((s, a) => s + (m.ach[a.id]?.n || 0), 0), all = list.reduce((s, a) => s + a.tiers.length, 0)
      col.appendChild(el('div', 'ach-cat', `${cat.name} <em>${got}/${all}</em>`))
      const grid = el('div', 'ach-grid')
      col.appendChild(grid)
      for (const a of list) grid.appendChild(this.achCard(a))
    }
  }

  achCard(a) {
    const goals = this.goals, rec = goals.state.ach[a.id]
    const n = rec ? rec.n : 0, tiers = a.tiers.length, done = n >= tiers
    const secret = a.hidden && !n
    const v = goals.value(a)
    const target = a.tiers[Math.min(n, tiers - 1)][0]
    const shown = done ? a.tiers[tiers - 1][0] : Math.min(v, target)
    const medal = tiers > 1 ? (n ? TIERS[n - 1].key : 'none') : n ? (a.gold ? 'aur' : 'single') : 'none'
    const pips = tiers > 1 ? `<span class="pips">${TIERS.map((t, i) => `<i class="${i < n ? t.key : ''}" title="${t.name}: ${a.tiers[i][0]}">${i < n ? t.icon : '○'}</i>`).join('')}</span>` : ''
    const next = done ? null : a.tiers[n][1]
    const rw = next ? `+${nf(next.lei)} lei${next.clothes ? ' · 👕 haină unicat' : ''}` : ''
    const when = n ? `${tiers > 1 ? TIERS[n - 1].icon + ' ' : '✔ '}${date(rec.at[n - 1] || Date.now())}` : ''
    // a one-off (do it once) has nothing to count: no bar, no "0/1"
    const once = tiers === 1 && target === 1
    return el('div', `ach-card ${done ? 'done' : n ? 'part' : 'locked'} ${secret ? 'secret' : ''}`, `
      <div class="medal ${medal}"><span>${secret ? '?' : a.icon}</span></div>
      <div class="bd"><div class="nm">${secret ? '???' : a.name}${pips}</div>
      <div class="ds">${secret ? 'Realizare ascunsă. O afli când o faci.' : a.desc}</div>
      ${secret ? '' : `${done || once ? '' : bar(shown / target, 'ach')}<div class="mt"><span>${done ? 'Completă' : once ? 'De făcut' : `${nf(shown)}/${nf(target)}`}</span><span>${done ? when : rw}</span></div>${!done && n ? `<div class="wh">${when}</div>` : ''}`}</div>`)
  }

  // ---- the title screen: today's bonus, from the save on disk ---------------------------------------------------
  static titleStrip(save) {
    const p = loginPreview(save)
    const day = p.day
    const r = STREAK[(day - 1) % STREAK.length]
    const boxes = STREAK.map((x, i) => {
      const cls = p.state === 'taken' ? (i + 1 <= day ? 'got' : '') : i + 1 < day ? 'got' : i + 1 === day ? 'now' : ''
      return `<i class="${cls}">${x.mama ? '🎁' : i + 1}</i>`
    }).join('')
    let line
    if (p.state === 'taken') {
      const nx = STREAK[day % STREAK.length]
      line = `Bonusul de azi e luat ✔ · Mâine, ziua ${(day % STREAK.length) + 1}: <b>+${nf(nx.lei)} lei</b>`
    } else if (p.state === 'waiting') line = `Ziua ${day} te așteaptă: <b>+${nf(r.lei)} lei${r.aura ? ` · +${r.aura} AURA` : ''}</b>. Intră în joc.`
    else if (p.state === 'lost') line = `Ai ratat o zi: seria o ia de la capăt. Azi: <b>+${nf(r.lei)} lei</b>`
    else line = `Intră în fiecare zi: premiile cresc 7 zile la rând. Azi: <b>+${nf(r.lei)} lei</b>`
    return `<div class="mm-streak ${p.state}"><div class="ms-h">🔥 BONUS ZILNIC${p.streak > 1 ? ` · <b>${p.streak} zile la rând</b>` : ''}</div><div class="ms-d">${boxes}</div><div class="ms-l">${line}</div></div>`
  }
}
