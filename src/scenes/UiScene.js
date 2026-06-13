import Phaser from 'phaser'

/**
 * UiScene — runs in parallel above CentruScene with its own camera (zoom 1),
 * so HUD/nameplate are immune to the world camera's zoom. Reads shared state
 * from the global registry written by CentruScene.
 */
export default class UiScene extends Phaser.Scene {
  constructor() {
    super('Ui')
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height

    // top bar
    this.topbar = this.add.rectangle(0, 0, W, 22, 0x10121a, 0.55).setOrigin(0)
    this.add.text(8, 4, 'CHIȘINĂU RUSH · Centru',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ebc372' })
    this.help = this.add.text(W - 8, 5, 'WASD · Shift fugi · Z/X zoom · T CRT',
      { fontFamily: 'monospace', fontSize: '10px', color: '#aeb5c0' }).setOrigin(1, 0)

    // nameplate banner
    this.npBg = this.add.rectangle(0, 0, 380, 46, 0x10121a, 0.85).setOrigin(0.5)
      .setStrokeStyle(1, 0xebc372, 0.9)
    this.npName = this.add.text(0, -8, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ebc372' }).setOrigin(0.5)
    this.npDesc = this.add.text(0, 11, '', { fontFamily: 'monospace', fontSize: '10px', color: '#d7dce4' }).setOrigin(0.5)
    this.np = this.add.container(W / 2, H - 44, [this.npBg, this.npName, this.npDesc]).setAlpha(0)

    // CRT scanlines
    this.crt = this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.16)

    this.scale.on('resize', (gs) => {
      this.topbar.width = gs.width
      this.help.setX(gs.width - 8)
      this.np.setPosition(gs.width / 2, gs.height - 44)
      this.crt.setSize(gs.width, gs.height)
    })

    this.npTarget = 0
  }

  update() {
    const lm = this.registry.get('nearLm')
    if (lm) {
      if (this.npName.text !== lm.name) {
        this.npName.setText(lm.name)
        this.npDesc.setText(lm.desc)
        this.npBg.setSize(Math.max(this.npName.width, this.npDesc.width) + 36, 46)
      }
      this.npTarget = 1
    } else {
      this.npTarget = 0
    }
    this.np.setAlpha(Phaser.Math.Linear(this.np.alpha, this.npTarget, 0.18))

    this.crt.setVisible(this.registry.get('crt') !== false)
  }
}
