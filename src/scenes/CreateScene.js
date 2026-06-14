import Phaser from 'phaser'

const F = 'monospace'

// the 5 playable types the owner asked for — professions only, no personal names
export const TYPES = [
  { key: 'taxist', name: 'Taxistul', role: 'taxist', blurb: 'Logan vechi, dar știe fiecare groapă din Centru pe nume.', perk: 'Pornești cu mai mulți lei + bani din curse.' },
  { key: 'conductor', name: 'Conductorul', role: 'conductor pe ruta 11', blurb: 'Rupe biletul pe troleibuzul 22 cu autoritate.', perk: 'Lei pasivi încet + ție gratis troleibuzul.' },
  { key: 'agent', name: 'Agentul Imobiliar', role: 'agent imobiliar', blurb: '„Studio cu amplasare reușită, euroreparat" = un balcon în Râșcani.', perk: 'Vinzi jetoane mai scump la Borea Țigan.' },
  { key: 'director', name: 'Directorul de Fabrică', role: 'director de fabrică', blurb: 'O fabrică de mobilă pe care n-o numește, BMW X6 cu numere din Lituania.', perk: 'Portmoneu mare la start.' },
  { key: 'ionel', name: 'Venit din Briceni', role: 'venit din Briceni', blurb: 'A venit cu un sac de plăcinte de la mama. Tot e scump aici.', perk: 'Mai mult HP + foame mai lentă.' },
]

export default class CreateScene extends Phaser.Scene {
  constructor() { super('Create') }

  preload() {
    if (!this.textures.exists('titleart')) this.load.image('titleart', 'title-art.jpg')
  }

  create() {
    const W = this.scale.width, H = this.scale.height
    this.add.rectangle(0, 0, W, H, 0x0b0c14, 1).setOrigin(0)
    // pixel-art hero backdrop (Gemini) — cover-fit, dimmed so the UI stays readable
    if (this.textures.exists('titleart')) {
      const bg = this.add.image(W / 2, H / 2, 'titleart').setOrigin(0.5)
      bg.setScale(Math.max(W / bg.width, H / bg.height))
      this.add.rectangle(0, 0, W, H, 0x0b0c14, 0.62).setOrigin(0)
    }
    this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.1)
    this.add.text(W / 2, 40, 'CHIȘINĂU RUSH', { fontFamily: F, fontSize: '34px', color: '#ebc372' }).setOrigin(0.5).setStroke('#0b0c14', 6)
    this.add.text(W / 2, 76, 'Cum te cheamă și cine ești, bratu?', { fontFamily: F, fontSize: '14px', color: '#cdd2dc' }).setOrigin(0.5).setStroke('#0b0c14', 4)

    // name field (starts EMPTY — type your own)
    this.pname = ''
    this.add.text(W / 2 - 150, 110, 'Nume:', { fontFamily: F, fontSize: '14px', color: '#cdd2dc' }).setOrigin(0, 0.5)
    this.add.rectangle(W / 2 + 30, 110, 220, 28, 0x0a0b10).setOrigin(0.5).setStrokeStyle(1, 0x4a515c)
    this.namePh = this.add.text(W / 2 - 70, 110, 'scrie un nume...', { fontFamily: F, fontSize: '14px', color: '#565d68' }).setOrigin(0, 0.5)
    this.nameText = this.add.text(W / 2 - 70, 110, '', { fontFamily: F, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5)
    this.input.keyboard.on('keydown', (e) => {
      if (e.key === 'Backspace') this.pname = this.pname.slice(0, -1)
      else if (e.key === 'Enter') return this.confirm()
      else if (e.key.length === 1 && this.pname.length < 14 && /[\p{L}0-9 .'-]/u.test(e.key)) this.pname += e.key
      this.nameText.setText(this.pname)
      this.namePh.setVisible(!this.pname)
    })

    // 5 type cards (clear gap below the name field)
    this.sel = 0
    this.cards = TYPES.map((t, i) => {
      const y = 178 + i * 86
      const bg = this.add.rectangle(W / 2, y, 560, 78, 0x181a24, 1).setStrokeStyle(2, 0x2c323b).setInteractive({ useHandCursor: true })
      this.add.text(W / 2 - 264, y - 26, t.name, { fontFamily: F, fontSize: '15px', color: '#ebc372' }).setOrigin(0, 0)
      this.add.text(W / 2 - 264, y - 4, t.blurb, { fontFamily: F, fontSize: '12px', color: '#d7dce4', wordWrap: { width: 540 } }).setOrigin(0, 0)
      this.add.text(W / 2 - 264, y + 20, '⚡ ' + t.perk, { fontFamily: F, fontSize: '12px', color: '#4caf50' }).setOrigin(0, 0)
      bg.on('pointerdown', () => this.select(i))
      return bg
    })
    this.select(0)

    // bottom menu: JOC NOU (always) + CONTINUĂ (only if a save exists in localStorage)
    this._hasSave = !!localStorage.getItem('cr-save')
    this._confirmNew = false
    const newX = this._hasSave ? W / 2 - 130 : W / 2
    this.playBtn = this.add.rectangle(newX, H - 44, 230, 42, 0x2f7d3a).setStrokeStyle(2, 0x4caf50).setInteractive({ useHandCursor: true })
    this.playLabel = this.add.text(newX, H - 44, '▶  JOC NOU', { fontFamily: F, fontSize: '18px', color: '#ffffff' }).setOrigin(0.5)
    this.playBtn.on('pointerdown', () => this.tryNew())

    if (this._hasSave) {
      const cont = this.add.rectangle(W / 2 + 130, H - 44, 230, 42, 0x1c2440).setStrokeStyle(2, 0x2f5bb0).setInteractive({ useHandCursor: true })
      this.add.text(W / 2 + 130, H - 44, '▶  CONTINUĂ', { fontFamily: F, fontSize: '18px', color: '#9ec0ff' }).setOrigin(0.5)
      cont.on('pointerdown', () => this.start(true))
    }

    this.scale.on('resize', () => this.scene.restart())
  }

  select(i) {
    this.sel = i
    this.cards.forEach((c, j) => c.setStrokeStyle(2, j === i ? 0xebc372 : 0x2c323b).setFillStyle(j === i ? 0x232838 : 0x181a24))
  }

  // new game — confirm once before wiping an existing save
  tryNew() {
    if (this._hasSave && !this._confirmNew) {
      this._confirmNew = true
      this.playLabel.setText('⚠ SIGUR? pierzi salvarea').setFontSize(13)
      this.playBtn.setFillStyle(0x8a3030).setStrokeStyle(2, 0xcc3b30)
      return
    }
    this.start(false)
  }

  confirm() { this.tryNew() }

  start(continueSave) {
    let player = null
    if (continueSave) { try { player = JSON.parse(localStorage.getItem('cr-player')) } catch (e) {} } // resume the saved character
    if (!player || !player.type) {
      const t = TYPES[this.sel]
      player = { name: (this.pname || 'Ion').trim() || 'Ion', type: t.key, typeName: t.name }
    }
    try { localStorage.setItem('cr-player', JSON.stringify(player)) } catch (e) {}
    this.registry.set('player', player)
    this.registry.set('continueSave', !!continueSave)
    this.scene.start('Centru')
  }
}
