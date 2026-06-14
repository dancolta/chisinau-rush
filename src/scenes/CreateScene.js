import Phaser from 'phaser'

const F = 'monospace'

// the playable types — professions/types, no personal names. 1-line blurbs so cards never overflow.
export const TYPES = [
  { key: 'patan', name: 'Pațan de pe Raioncik', role: 'gopnik crescut la Ciocana', blurb: 'Gopnik crescut la Ciocana. Lovește tare, vorbește puțin.', perk: 'Lovești mult mai tare + respect pe stradă din start.' },
  { key: 'taxist', name: 'Taxistul', role: 'taxist', blurb: 'Logan vechi, dar știe fiecare groapă din Centru pe nume.', perk: 'Pornești cu mai mulți lei + bani din curse.' },
  { key: 'conductor', name: 'Conductorul', role: 'conductor pe ruta 11', blurb: 'Rupe biletul pe troleibuzul 22 cu autoritate.', perk: 'Lei pasivi încet + ție gratis troleibuzul.' },
  { key: 'agent', name: 'Agentul Imobiliar', role: 'agent imobiliar', blurb: '„Studio cu amplasare reușită" = un balcon în Râșcani.', perk: 'Fence-uiești hârtiile mai scump la Borea Țigan.' },
  { key: 'director', name: 'Directorul de Fabrică', role: 'director de fabrică', blurb: 'Fabrică de mobilă nenumită, BMW X6 cu numere din Lituania.', perk: 'Portmoneu mare la start.' },
  { key: 'ionel', name: 'Venit din Briceni', role: 'venit din Briceni', blurb: 'A venit cu un sac de plăcinte de la mama. Tot e scump aici.', perk: 'Mai mult HP + foame mai lentă.' },
]

export default class CreateScene extends Phaser.Scene {
  constructor() { super('Create') }

  // 'menu' (a save exists) shows Continuă/Joc nou only; 'creation' shows name + type cards
  init(data) {
    this.mode = (data && data.mode) || (localStorage.getItem('cr-save') ? 'menu' : 'creation')
  }

  preload() {
    if (!this.textures.exists('titleart')) this.load.image('titleart', 'title-art.jpg')
  }

  create() {
    const W = this.scale.width, H = this.scale.height
    this.add.rectangle(0, 0, W, H, 0x0b0c14, 1).setOrigin(0)
    if (this.textures.exists('titleart')) {
      const bg = this.add.image(W / 2, H / 2, 'titleart').setOrigin(0.5)
      bg.setScale(Math.max(W / bg.width, H / bg.height))
      this.add.rectangle(0, 0, W, H, 0x0b0c14, 0.62).setOrigin(0)
    }
    this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.1)

    if (this.mode === 'menu') this.buildMenu(W, H)
    else this.buildCreation(W, H)

    this.scale.on('resize', () => this.scene.restart({ mode: this.mode }))
  }

  // ── main menu (already-ongoing game): no character creation, just resume or start fresh ──
  buildMenu(W, H) {
    // hero title — big, upper third, on a dark scrim band so it reads over the busy pixel backdrop
    const bandY = Math.round(H * 0.10), bandH = Math.round(Math.min(170, H * 0.30))
    this.add.rectangle(0, bandY, W, bandH, 0x0a0a12, 0.62).setOrigin(0)
    const tSize = Math.max(42, Math.min(76, Math.round(W / 17)))
    this.add.text(W / 2, bandY + bandH * 0.42, 'CHIȘINĂU RUSH', { fontFamily: F, fontSize: tSize + 'px', color: '#ffe34d', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setStroke('#1a0e00', 10).setShadow(0, 5, '#000000', 0, false, true)
    this.add.text(W / 2, bandY + bandH * 0.80, 'Joc salvat găsit. Continuă ori începe altul.', { fontFamily: F, fontSize: '15px', color: '#e8e1c8' }).setOrigin(0.5).setStroke('#0b0c14', 4)
    const cy = H / 2 + 40
    const cont = this.add.rectangle(W / 2, cy - 8, 330, 58, 0x1c2440).setStrokeStyle(2, 0x2f5bb0).setInteractive({ useHandCursor: true })
    this.add.text(W / 2, cy - 8, '▶  CONTINUĂ', { fontFamily: F, fontSize: '22px', color: '#9ec0ff' }).setOrigin(0.5)
    cont.on('pointerdown', () => this.start(true))

    this._confirmNew = false
    this.newBtn = this.add.rectangle(W / 2, cy + 66, 330, 48, 0x2f7d3a).setStrokeStyle(2, 0x4caf50).setInteractive({ useHandCursor: true })
    this.newLabel = this.add.text(W / 2, cy + 66, '▶  JOC NOU (personaj nou)', { fontFamily: F, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5)
    this.newBtn.on('pointerdown', () => {
      if (!this._confirmNew) { this._confirmNew = true; this.newLabel.setText('⚠ SIGUR? pierzi salvarea'); this.newBtn.setFillStyle(0x8a3030).setStrokeStyle(2, 0xcc3b30); return }
      this.scene.restart({ mode: 'creation' })
    })
  }

  // ── character creation: only when starting a brand-new game ──
  buildCreation(W, H) {
    this.add.text(W / 2, 38, 'CHIȘINĂU RUSH', { fontFamily: F, fontSize: '40px', color: '#ffe34d', fontStyle: 'bold' }).setOrigin(0.5).setStroke('#1a0e00', 8).setShadow(0, 4, '#000000', 0, false, true)
    this.add.text(W / 2, 72, 'Cum te cheamă și cine ești, bratu?', { fontFamily: F, fontSize: '14px', color: '#cdd2dc' }).setOrigin(0.5).setStroke('#0b0c14', 4)
    // name field (starts EMPTY)
    this.pname = ''
    this.add.text(W / 2 - 150, 102, 'Nume:', { fontFamily: F, fontSize: '14px', color: '#cdd2dc' }).setOrigin(0, 0.5).setStroke('#0b0c14', 3)
    this.add.rectangle(W / 2 + 30, 102, 220, 26, 0x0a0b10).setOrigin(0.5).setStrokeStyle(1, 0x4a515c)
    this.namePh = this.add.text(W / 2 - 70, 102, 'scrie un nume...', { fontFamily: F, fontSize: '13px', color: '#565d68' }).setOrigin(0, 0.5)
    this.nameText = this.add.text(W / 2 - 70, 102, '', { fontFamily: F, fontSize: '14px', color: '#ffffff' }).setOrigin(0, 0.5)
    this.input.keyboard.on('keydown', (e) => {
      if (e.key === 'Backspace') this.pname = this.pname.slice(0, -1)
      else if (e.key === 'Enter') return this.start(false)
      else if (e.key.length === 1 && this.pname.length < 14 && /[\p{L}0-9 .'-]/u.test(e.key)) this.pname += e.key
      this.nameText.setText(this.pname); this.namePh.setVisible(!this.pname)
    })
    // type cards — compact so all fit, perk pinned to the card bottom (never overlaps the blurb)
    this.sel = 0
    const CW = 600, CH = 62, GAP = 7, top = 128
    this.cards = TYPES.map((t, i) => {
      const cy = top + i * (CH + GAP) + CH / 2
      const bg = this.add.rectangle(W / 2, cy, CW, CH, 0x181a24, 1).setStrokeStyle(2, 0x2c323b).setInteractive({ useHandCursor: true })
      const lx = W / 2 - CW / 2 + 16
      this.add.text(lx, cy - CH / 2 + 7, t.name, { fontFamily: F, fontSize: '14px', color: '#ebc372' }).setOrigin(0, 0)
      this.add.text(lx, cy - CH / 2 + 26, t.blurb, { fontFamily: F, fontSize: '11px', color: '#d7dce4', wordWrap: { width: CW - 32 } }).setOrigin(0, 0)
      this.add.text(lx, cy + CH / 2 - 16, '⚡ ' + t.perk, { fontFamily: F, fontSize: '11px', color: '#4caf50' }).setOrigin(0, 0)
      bg.on('pointerdown', () => this.select(i))
      return bg
    })
    this.select(0)
    // start + (back to menu if a save exists)
    const startBtn = this.add.rectangle(W / 2, H - 38, 240, 44, 0x2f7d3a).setStrokeStyle(2, 0x4caf50).setInteractive({ useHandCursor: true })
    this.add.text(W / 2, H - 38, '▶  ÎNCEPE', { fontFamily: F, fontSize: '18px', color: '#ffffff' }).setOrigin(0.5)
    startBtn.on('pointerdown', () => this.start(false))
    if (localStorage.getItem('cr-save')) {
      const back = this.add.rectangle(W / 2 - 250, H - 38, 130, 44, 0x1c2440).setStrokeStyle(2, 0x2f5bb0).setInteractive({ useHandCursor: true })
      this.add.text(W / 2 - 250, H - 38, '‹ Înapoi', { fontFamily: F, fontSize: '15px', color: '#9ec0ff' }).setOrigin(0.5)
      back.on('pointerdown', () => this.scene.restart({ mode: 'menu' }))
    }
  }

  select(i) {
    this.sel = i
    this.cards.forEach((c, j) => c.setStrokeStyle(2, j === i ? 0xebc372 : 0x2c323b).setFillStyle(j === i ? 0x232838 : 0x181a24))
  }

  start(continueSave) {
    let player = null
    if (continueSave) { try { player = JSON.parse(localStorage.getItem('cr-player')) } catch (e) {} } // resume the saved character
    if (!player || !player.type) {
      const t = TYPES[this.sel || 0]
      player = { name: (this.pname || 'Ion').trim() || 'Ion', type: t.key, typeName: t.name }
    }
    try { localStorage.setItem('cr-player', JSON.stringify(player)) } catch (e) {}
    this.registry.set('player', player)
    this.registry.set('continueSave', !!continueSave)
    this.scene.start('Centru')
  }
}
