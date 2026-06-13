import Phaser from 'phaser'

const F = 'monospace'

/**
 * UiScene — parallel HUD (own un-zoomed camera). Reads shared state from the
 * registry written by CentruScene: hud, prompt, mission, toast, cop, nearLm, crt.
 */
export default class UiScene extends Phaser.Scene {
  constructor() { super('Ui') }

  create() {
    const W = this.scale.width, H = this.scale.height

    // top bar
    this.topbar = this.add.rectangle(0, 0, W, 22, 0x10121a, 0.55).setOrigin(0)
    this.add.text(8, 4, 'CHIȘINĂU RUSH · Centru', { fontFamily: F, fontSize: '13px', color: '#ebc372' })
    this.help = this.add.text(W - 8, 5, 'WASD · Shift · E acțiune · click: nume · T CRT', { fontFamily: F, fontSize: '10px', color: '#aeb5c0' }).setOrigin(1, 0)

    // HP bar
    this.add.rectangle(8, 30, 124, 14, 0x10121a, 0.7).setOrigin(0)
    this.hpFill = this.add.rectangle(10, 32, 120, 10, 0xcc3b30).setOrigin(0)
    this.hpText = this.add.text(70, 31, '', { fontFamily: F, fontSize: '9px', color: '#ffffff' }).setOrigin(0.5, 0).setStroke('#10121a', 3)

    // Heat bar
    this.add.rectangle(8, 48, 124, 12, 0x10121a, 0.7).setOrigin(0)
    this.heatFill = this.add.rectangle(10, 50, 0, 8, 0xf9a200).setOrigin(0)
    this.add.text(136, 48, 'HEAT', { fontFamily: F, fontSize: '8px', color: '#f9a200' })

    // lei + score (top-right)
    this.leiText = this.add.text(W - 8, 24, '', { fontFamily: F, fontSize: '13px', color: '#ffd24a' }).setOrigin(1, 0)
    this.scoreText = this.add.text(W - 8, 40, '', { fontFamily: F, fontSize: '11px', color: '#cdd2dc' }).setOrigin(1, 0)

    // mission banner
    this.missionText = this.add.text(8, 66, '', { fontFamily: F, fontSize: '11px', color: '#ebc372', backgroundColor: '#10121aBB', padding: { x: 5, y: 3 } }).setOrigin(0, 0)

    // interaction prompt (bottom centre, above nameplate)
    this.promptText = this.add.text(W / 2, H - 116, '', { fontFamily: F, fontSize: '12px', color: '#ffffff', backgroundColor: '#1b2f1bEE', padding: { x: 8, y: 4 } }).setOrigin(0.5).setAlpha(0)

    // toast
    this.toastText = this.add.text(W / 2, 128, '', { fontFamily: F, fontSize: '12px', color: '#fff6d6', backgroundColor: '#10121aDD', padding: { x: 8, y: 4 } }).setOrigin(0.5).setAlpha(0)
    this.toastId = null

    // landmark nameplate
    this.npBg = this.add.rectangle(0, 0, 380, 46, 0x10121a, 0.85).setOrigin(0.5).setStrokeStyle(1, 0xebc372, 0.9)
    this.npName = this.add.text(0, -8, '', { fontFamily: F, fontSize: '15px', color: '#ebc372' }).setOrigin(0.5)
    this.npDesc = this.add.text(0, 11, '', { fontFamily: F, fontSize: '10px', color: '#d7dce4' }).setOrigin(0.5)
    this.np = this.add.container(W / 2, H - 44, [this.npBg, this.npName, this.npDesc]).setAlpha(0)
    this.npTarget = 0

    // cop modal
    this.copDim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0).setVisible(false)
    this.copBox = this.add.rectangle(W / 2, H / 2, 360, 150, 0x12131c, 0.97).setStrokeStyle(2, 0x2f5bb0).setVisible(false)
    this.copQ = this.add.text(W / 2, H / 2 - 52, '', { fontFamily: F, fontSize: '14px', color: '#9ec0ff', align: 'center', wordWrap: { width: 330 } }).setOrigin(0.5).setVisible(false)
    this.copOpts = this.add.text(W / 2, H / 2 + 6, '', { fontFamily: F, fontSize: '13px', color: '#fff6d6', align: 'left', lineSpacing: 8 }).setOrigin(0.5).setVisible(false)

    // CRT
    this.crt = this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.16)

    this.scale.on('resize', (gs) => this.relayout(gs.width, gs.height))
  }

  relayout(W, H) {
    this.topbar.width = W
    this.help.setX(W - 8)
    this.leiText.setX(W - 8); this.scoreText.setX(W - 8)
    this.promptText.setPosition(W / 2, H - 116)
    this.toastText.setX(W / 2)
    this.np.setPosition(W / 2, H - 44)
    this.crt.setSize(W, H)
    this.copDim.setSize(W, H)
    this.copBox.setPosition(W / 2, H / 2); this.copQ.setPosition(W / 2, H / 2 - 52); this.copOpts.setPosition(W / 2, H / 2 + 6)
  }

  update() {
    const hud = this.registry.get('hud')
    if (hud) {
      this.hpFill.displayWidth = Math.max(0, 120 * (hud.hp / hud.maxHp))
      this.hpFill.fillColor = hud.hp > 50 ? 0x4caf50 : hud.hp > 25 ? 0xf9a200 : 0xcc3b30
      this.hpText.setText(`${hud.hp}/${hud.maxHp}`)
      this.heatFill.displayWidth = 120 * (hud.heat / 100)
      this.leiText.setText(`${hud.lei} lei`)
      this.scoreText.setText(`Scor ${hud.score}`)
    }

    const mission = this.registry.get('mission')
    if (mission !== this._mission) { this._mission = mission; this.missionText.setText(mission ? '★ ' + mission : '') }

    const prompt = this.registry.get('prompt')
    this.promptText.setText(prompt || '')
    this.promptText.setAlpha(prompt ? 1 : 0)

    // toast (fades over ~2.6s)
    const toast = this.registry.get('toast')
    if (toast && toast.id !== this.toastId) { this.toastId = toast.id; this.toastText.setText(toast.msg); this.toastText.setAlpha(1); this._toastT = this.time.now }
    if (this.toastText.alpha > 0 && this.time.now - this._toastT > 1600) this.toastText.setAlpha(Math.max(0, this.toastText.alpha - 0.04))

    // landmark nameplate
    const lm = this.registry.get('nearLm')
    if (lm) {
      if (this.npName.text !== lm.name) {
        this.npName.setText(lm.name); this.npDesc.setText(lm.desc || '')
        this.npBg.setSize(Math.max(this.npName.width, this.npDesc.width) + 36, 46)
      }
      this.npTarget = 1
    } else this.npTarget = 0
    this.np.setAlpha(Phaser.Math.Linear(this.np.alpha, this.npTarget, 0.18))

    // cop modal
    const cop = this.registry.get('cop')
    const on = !!cop
    this.copDim.setVisible(on); this.copBox.setVisible(on); this.copQ.setVisible(on); this.copOpts.setVisible(on)
    if (on) { this.copQ.setText(cop.q); this.copOpts.setText(cop.opts.join('\n')) }

    this.crt.setVisible(this.registry.get('crt') !== false)
  }
}
