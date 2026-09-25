import { WEAPONS } from '../data/weapons.js'

// Getting weapons: buying (they go in your hand, or home to the chest when your hands are
// full) and the gifts the street gives the people it respects.
export class Gear {
  constructor(game) {
    this.game = game
    game.events.on('respect', ({ k, tier, up }) => {
      if (!up || tier < 3) return
      if (k === 'gop') this.gift('bata', 'giftBata', '🏏 Pacanii ți-au făcut cadou o {y}bâtă de oină{/y}. „Pentru cine merită, bratan."')
      if (k === 'bab') this.gift('umbrela', 'giftUmbrela', '☂️ Babele ți-au dat {y}umbrela bunicii{/y}. „Să nu te plouă, maică. Și să ai cu ce te apăra."')
    })
  }

  // a weapon is yours: in your hand if there's room, otherwise it waits at home
  give(k, { equip = true, quiet = false } = {}) {
    const g = this.game, pr = g.progress, w = WEAPONS[k]
    const carried = pr.giveWeapon(k)
    if (carried && equip) { pr.weapon = k; g.player.setWeapon(k) }
    if (!quiet) {
      if (carried) g.ui.notify(`Ai ${w.icon} ${w.name}. {y}[Q]{/y} schimbi arma.`, 3, 'gold')
      else g.ui.notify(`${w.icon} ${w.name} te așteaptă acasă, în ladă: ai deja mâinile pline.`, 3.6, 'gold')
    }
    return carried
  }

  buy(k, price) {
    const pr = this.game.progress
    if (pr.weapons.includes(k) || !pr.spend(price)) return false
    this.game.audio?.sfx('cash', { bus: 'ui' })
    this.give(k)
    return true
  }

  gift(k, flag, text) {
    const pr = this.game.progress
    if (pr.flags[flag] || pr.weapons.includes(k)) return
    pr.flags[flag] = true
    this.give(k, { equip: false, quiet: true })
    this.game.ui.notify(text, 5, 'gold')
    this.game.audio?.sting?.('levelup')
  }
}
