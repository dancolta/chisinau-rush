import Phaser from 'phaser'

const F = 'monospace'

// the 5 playable types the owner asked for
export const TYPES = [
  { key: 'taxist', name: 'Vova Taxistul', role: 'taxist', blurb: 'Logan cu numere de Centru, știe fiecare groapă pe nume.', perk: 'Pornești cu mai mulți lei + bani din curse.' },
  { key: 'conductor', name: 'Sergiu Conductorul', role: 'conductor pe ruta 11', blurb: 'Rupe biletul pe troleibuzul 22 cu autoritate.', perk: 'Lei pasivi încet + e tibe gratis troleibuzul.' },
  { key: 'agent', name: 'Radu Agentul', role: 'agent imobiliar', blurb: '„Studio cochet, euroreparat" = un balcon în Râșcani.', perk: 'Vinzi amintiri mai scump la Borea.' },
  { key: 'director', name: 'Director Anatol', role: 'director de fabrică', blurb: 'O fabrică mică pe care n-o numește, BMW X6 cu numere de MD.', perk: 'Portmoneu mare la start.' },
  { key: 'ionel', name: 'Ionel din Briceni', role: 'venit din Briceni', blurb: 'A venit cu un sac de plăcinte de la mama. Tot e scump, na.', perk: 'Mai mult HP + foame mai lentă.' },
]

export default class CreateScene extends Phaser.Scene {
  constructor() { super('Create') }

  create() {
    const W = this.scale.width, H = this.scale.height
    this.add.rectangle(0, 0, W, H, 0x12131c).setOrigin(0)
    this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.14)
    this.add.text(W / 2, 40, 'CHIȘINĂU RUSH', { fontFamily: F, fontSize: '34px', color: '#ebc372' }).setOrigin(0.5)
    this.add.text(W / 2, 76, 'Cum te cheamă și cine ești, bratan?', { fontFamily: F, fontSize: '14px', color: '#aeb5c0' }).setOrigin(0.5)

    // name field (type with the keyboard)
    this.pname = 'Ion'
    this.add.text(W / 2 - 150, 108, 'Nume:', { fontFamily: F, fontSize: '14px', color: '#cdd2dc' }).setOrigin(0, 0.5)
    this.add.rectangle(W / 2 + 30, 108, 220, 28, 0x0a0b10).setOrigin(0.5).setStrokeStyle(1, 0x4a515c)
    this.nameText = this.add.text(W / 2 - 70, 108, this.pname, { fontFamily: F, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5)
    this.input.keyboard.on('keydown', (e) => {
      if (e.key === 'Backspace') this.pname = this.pname.slice(0, -1)
      else if (e.key === 'Enter') return this.confirm()
      else if (e.key.length === 1 && this.pname.length < 14 && /[\p{L}0-9 .'-]/u.test(e.key)) this.pname += e.key
      this.nameText.setText(this.pname || '_')
    })

    // 5 type cards
    this.sel = 0
    this.cards = TYPES.map((t, i) => {
      const y = 158 + i * 86
      const bg = this.add.rectangle(W / 2, y, 560, 78, 0x181a24, 1).setStrokeStyle(2, 0x2c323b).setInteractive({ useHandCursor: true })
      this.add.text(W / 2 - 264, y - 26, `${t.name}  ·  ${t.role}`, { fontFamily: F, fontSize: '15px', color: '#ebc372' }).setOrigin(0, 0)
      this.add.text(W / 2 - 264, y - 4, t.blurb, { fontFamily: F, fontSize: '12px', color: '#d7dce4', wordWrap: { width: 540 } }).setOrigin(0, 0)
      this.add.text(W / 2 - 264, y + 20, '⚡ ' + t.perk, { fontFamily: F, fontSize: '12px', color: '#4caf50' }).setOrigin(0, 0)
      bg.on('pointerdown', () => this.select(i))
      return bg
    })
    this.select(0)

    // play button
    this.playBtn = this.add.rectangle(W / 2, H - 44, 220, 40, 0x2f7d3a).setStrokeStyle(2, 0x4caf50).setInteractive({ useHandCursor: true })
    this.add.text(W / 2, H - 44, '▶  JOACĂ', { fontFamily: F, fontSize: '18px', color: '#ffffff' }).setOrigin(0.5)
    this.playBtn.on('pointerdown', () => this.confirm())

    // Continuă (if a save exists)
    if (localStorage.getItem('cr-save')) {
      const cont = this.add.rectangle(W / 2 + 250, H - 44, 150, 40, 0x1c2440).setStrokeStyle(2, 0x2f5bb0).setInteractive({ useHandCursor: true })
      this.add.text(W / 2 + 250, H - 44, 'Continuă', { fontFamily: F, fontSize: '15px', color: '#9ec0ff' }).setOrigin(0.5)
      cont.on('pointerdown', () => { this.start(true) })
    }

    this.scale.on('resize', () => this.scene.restart())
  }

  select(i) {
    this.sel = i
    this.cards.forEach((c, j) => c.setStrokeStyle(2, j === i ? 0xebc372 : 0x2c323b).setFillStyle(j === i ? 0x232838 : 0x181a24))
  }

  confirm() { this.start(false) }

  start(continueSave) {
    const t = TYPES[this.sel]
    const player = { name: (this.pname || 'Ion').trim() || 'Ion', type: t.key, typeName: t.name }
    try { localStorage.setItem('cr-player', JSON.stringify(player)) } catch (e) {}
    this.registry.set('player', player)
    this.registry.set('continueSave', !!continueSave)
    this.scene.start('Centru')
  }
}
