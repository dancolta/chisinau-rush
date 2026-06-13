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
    this.copQ = this.add.text(W / 2, H / 2, '', { fontFamily: F, fontSize: '14px', color: '#9ec0ff', align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5, 0).setVisible(false)
    this.copOpts = this.add.text(W / 2, H / 2, '', { fontFamily: F, fontSize: '13px', color: '#fff6d6', align: 'left', lineSpacing: 9 }).setOrigin(0, 0).setVisible(false)

    // CRT
    this.crt = this.add.tileSprite(0, 0, W, H, 'scan').setOrigin(0).setAlpha(0.16)

    // minimap
    this.mapG = this.add.graphics().setDepth(50)
    this.mapLabel = this.add.text(0, 0, 'HARTĂ', { fontFamily: F, fontSize: '9px', color: '#aeb5c0' }).setOrigin(0, 1).setDepth(51)

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
    if (on) {
      if (cop.q !== this._copQ) {
        this._copQ = cop.q
        this.copQ.setText(cop.q)
        this.copOpts.setText(cop.opts.join('\n'))
        const w = Math.max(this.copQ.width, this.copOpts.width) + 52
        const h = this.copQ.height + this.copOpts.height + 40
        const cx = this.scale.width / 2, cy = this.scale.height / 2
        this.copBox.setSize(w, h).setPosition(cx, cy)
        this.copQ.setPosition(cx, cy - h / 2 + 14)
        this.copOpts.setPosition(cx - w / 2 + 26, cy - h / 2 + 14 + this.copQ.height + 14)
      }
    } else { this._copQ = null }

    this.crt.setVisible(this.registry.get('crt') !== false)
    this.drawMinimap()
  }

  drawMinimap() {
    const meta = this.registry.get('mapMeta')
    if (!meta) return
    const g = this.mapG; g.clear()
    const W = this.scale.width, H = this.scale.height
    const mw = 150, mh = Math.round(mw * meta.wh / meta.ww)
    const x0 = W - mw - 10, y0 = H - mh - 10
    this.mapLabel.setPosition(x0, y0 - 3)
    g.fillStyle(0x10121a, 0.74); g.fillRect(x0 - 2, y0 - 2, mw + 4, mh + 4)
    g.lineStyle(1, 0x4a515c, 1); g.strokeRect(x0 - 2, y0 - 2, mw + 4, mh + 4)
    g.fillStyle(0x274d2a, 0.7); g.fillRect(x0, y0, mw, mh)
    const sx = mw / meta.ww, sy = mh / meta.wh
    g.lineStyle(2, 0x3a3e46, 1); g.beginPath(); g.moveTo(x0, y0 + meta.roadY * sy); g.lineTo(x0 + mw, y0 + meta.roadY * sy); g.strokePath()
    const stat = this.registry.get('mapStatic') || []
    g.fillStyle(0xcdd2dc, 1); stat.forEach((p) => g.fillRect(x0 + p.x * sx - 1, y0 + p.y * sy - 1, 3, 3))
    const dyn = this.registry.get('mapDyn'); if (!dyn) return
    g.fillStyle(0xffd24a, 0.9); g.fillRect(x0 + dyn.zx * sx - 1, y0 + dyn.zy * sy - 1, 3, 3) // Baba Zina
    if (dyn.tx != null) { // mission target, pulsing
      const r = 2 + (Math.sin(this.time.now / 200) + 1) * 1.6
      g.fillStyle(0xcc3b30, 1); g.fillCircle(x0 + dyn.tx * sx, y0 + dyn.ty * sy, r)
    }
    g.fillStyle(0x4caf50, 1); g.fillCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3) // player
    g.lineStyle(1, 0xffffff, 0.85); g.strokeCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3)
  }
}
