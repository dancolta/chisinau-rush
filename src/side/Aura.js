import { AURA, levelOf, levelStart, levelCost, titleOf } from '../data/aura.js'

// AURA, the meme currency: cool moments add to it, cringe takes it away. Gains chained within a
// few seconds build a streak (×1.25, ×1.5 … ×3); the same thing again and again pays less; a
// loss breaks the streak. Levels come from the total and are never lost: cringe only eats into
// the progress toward the next one.
export class Aura {
  constructor(side) {
    this.side = side
    this.game = side.game
    this.streak = 0
    this.streakT = 0
    this.clock = 0
    this.recent = new Map()   // repeat key -> { c, t }
  }

  get s() { return this.side.state.aura }
  get total() { return this.s.total }
  get level() { return this.s.level }
  get title() { return titleOf(this.s.level) }
  // what the next cool moment is multiplied by: every link in the chain adds a step
  get mult() { return Math.min(AURA.streakMax, 1 + AURA.streakStep * this.streak) }
  get floor() { return levelStart(this.s.level) }
  // progress inside the current level, 0..1
  get progress() { const a = levelStart(this.level); return Math.max(0, Math.min(1, (this.s.total - a) / levelCost(this.level))) }
  get toNext() { return Math.max(0, levelStart(this.level + 1) - this.s.total) }

  // the same key again soon pays less
  repeat(key) {
    const r = this.recent.get(key)
    if (!r || this.clock - r.t > AURA.repeatWindow) { this.recent.set(key, { c: 1, t: this.clock }); return 1 }
    r.c++; r.t = this.clock
    return Math.max(AURA.repeatFloor, 1 - AURA.repeatDecay * (r.c - 1))
  }

  // a cool moment: +n (times the streak unless raw); returns what was actually added
  gain(n, why = '', { raw = false, key = null, big = false } = {}) {
    if (!(n > 0)) return 0
    const s = this.s
    let k = key ? this.repeat(key) : 1
    const m = raw ? 1 : this.mult
    k *= m
    if (this.side.perk('magnet')) k *= 1.1
    const v = Math.max(1, Math.round(n * k))
    s.total += v
    s.lifetime += v
    this.side.state.today.aura += v
    this.streak++
    this.streakT = AURA.streakWindow
    this.side.ui.pop(v, why, { mult: m, big: big || v >= 100 })
    this.side.hint('aura')
    this.side.challenges.track('aura', v)
    if (this.mult > 1) this.side.challenges.track('streak', this.mult)
    this.game.events.emit('aura', { n: v, why, total: s.total })
    this.checkLevel()
    return v
  }

  // cringe: −n, never below the start of your level, and the streak is gone
  lose(n, why = '', { key = null, cool = 4 } = {}) {
    if (!(n > 0)) return 0
    // one cringe per moment, not one per physics contact
    if (key) {
      const last = this.recent.get('!' + key)
      if (last && this.clock - last.t < cool) return 0
      this.recent.set('!' + key, { c: 1, t: this.clock })
    }
    const s = this.s
    const floor = levelStart(s.level)
    const v = Math.min(n, Math.max(0, s.total - floor))
    s.total -= v
    s.lost += n
    this.streak = 0
    this.streakT = 0
    this.side.ui.pop(-n, why, { cringe: true, big: n >= 40 })
    this.game.events.emit('aura', { n: -v, why, total: s.total })
    return v
  }

  checkLevel() {
    const s = this.s
    const lv = levelOf(s.total)
    if (lv <= s.level) return
    const from = s.level
    s.level = lv
    this.side.levelUp(from, lv)
  }

  // dev/test helper: jump to a level (rewards follow as if earned)
  setLevel(n) {
    this.s.total = Math.max(this.s.total, levelStart(n))
    this.checkLevel()
  }

  update(dt) {
    this.clock += dt
    if (this.streakT > 0) { this.streakT -= dt; if (this.streakT <= 0) this.streak = 0 }
  }
}
