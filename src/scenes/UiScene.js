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

    // ── continuous absurd news ticker (very top of screen) ──
    this.newsBand = this.add.rectangle(0, 0, W, 17, 0x140d12, 0.92).setOrigin(0)
    this.newsLine = this.add.rectangle(0, 16, W, 1, 0x8f2f1f, 1).setOrigin(0)
    this.newsX = W
    this.newsText = this.add.text(W, 2, '', { fontFamily: F, fontSize: '11px', color: '#ffd9a0' }).setOrigin(0, 0)
    this.add.rectangle(0, 0, 56, 17, 0x8f2f1f, 1).setOrigin(0).setDepth(2)
    this.add.text(6, 2, 'ȘTIRI', { fontFamily: F, fontSize: '11px', color: '#fff6d6' }).setOrigin(0, 0).setDepth(3)
    this.newsText.setText(this.makeNews())

    // top bar (below the ticker)
    this.topbar = this.add.rectangle(0, 17, W, 22, 0x10121a, 0.55).setOrigin(0)
    this.add.text(8, 21, 'CHIȘINĂU RUSH · Centru', { fontFamily: F, fontSize: '13px', color: '#ebc372' })
    this.help = this.add.text(W - 8, 21, 'WASD mișcă · Shift fugă · E acțiune · SPACE lovește · Esc meniu', { fontFamily: F, fontSize: '11px', color: '#cdd2dc' }).setOrigin(1, 0)

    // ===== LEFT cluster — VITALS plate: 4 aligned full-width meters (label left, value right) =====
    this.add.rectangle(4, 44, 232, 92, 0x0b0c14, 0.88).setOrigin(0).setStrokeStyle(1, 0x000000, 0.55)
    this.add.rectangle(4, 44, 232, 92, 0x000000, 0).setOrigin(0).setStrokeStyle(1, 0xebc372, 0.22) // inner accent hairline
    // HP — primary, tall
    this.add.rectangle(10, 50, 220, 20, 0x07080d, 0.9).setOrigin(0)
    this.hpFill = this.add.rectangle(12, 52, 216, 16, 0x4caf50).setOrigin(0)
    this.add.text(16, 51, 'HP', { fontFamily: F, fontSize: '13px', color: '#ffffff' }).setOrigin(0, 0).setStroke('#07080d', 4).setDepth(2)
    this.hpText = this.add.text(226, 51, '', { fontFamily: F, fontSize: '14px', color: '#ffffff' }).setOrigin(1, 0).setStroke('#07080d', 4).setDepth(2)
    // POLIȚIE (cât te caută poliția) / STRADĂ (respect gopnici) / CIVIC (respect oameni) — aligned full-width meters
    const meter = (y, label, color, lblColor) => {
      this.add.rectangle(10, y, 220, 14, 0x07080d, 0.9).setOrigin(0)
      const fill = this.add.rectangle(12, y + 2, 216, 10, color).setOrigin(0)
      this.add.text(16, y + 1, label, { fontFamily: F, fontSize: '11px', color: lblColor }).setOrigin(0, 0).setStroke('#07080d', 3).setDepth(2)
      const val = this.add.text(226, y, '', { fontFamily: F, fontSize: '12px', color: '#ffffff' }).setOrigin(1, 0).setStroke('#07080d', 3).setDepth(2)
      return { fill, val }
    }
    const mH = meter(74, 'POLIȚIE', 0xf9a200, '#ffd9a0'); this.heatFill = mH.fill; this.heatText = mH.val
    const mC = meter(92, 'STRADĂ', 0x4caf50, '#bfe6c2'); this.credFill = mC.fill; this.credText = mC.val
    const mV = meter(110, 'CIVIC', 0x2f6fb0, '#9ec0ff'); this.civicFill = mV.fill; this.civicText = mV.val

    // ===== RIGHT cluster — ECONOMY plate (LEI / SCOR / RANK / XP / DOVEZI) =====
    this.econPlate = this.add.rectangle(W - 218, 44, 212, 108, 0x0b0c14, 0.86).setOrigin(0).setStrokeStyle(1, 0x000000, 0.55).setName('statpanel')
    this.econInner = this.add.rectangle(W - 218, 44, 212, 108, 0x000000, 0).setOrigin(0).setStrokeStyle(1, 0xebc372, 0.22)
    this.leiKick = this.add.text(W - 210, 50, 'LEI', { fontFamily: F, fontSize: '10px', color: '#aeb5c0' }).setOrigin(0, 0).setStroke('#07080d', 3)
    this.leiText = this.add.text(W - 12, 48, '', { fontFamily: F, fontSize: '24px', color: '#ffd24a' }).setOrigin(1, 0).setStroke('#07080d', 4)
    this.scoreKick = this.add.text(W - 210, 84, 'SCOR', { fontFamily: F, fontSize: '10px', color: '#aeb5c0' }).setOrigin(0, 0).setStroke('#07080d', 3)
    this.scoreText = this.add.text(W - 12, 80, '', { fontFamily: F, fontSize: '18px', color: '#ffffff' }).setOrigin(1, 0).setStroke('#07080d', 4)
    this.rankText = this.add.text(W - 12, 106, '', { fontFamily: F, fontSize: '13px', color: '#ebc372' }).setOrigin(1, 0).setStroke('#07080d', 3)
    this.xpTrack = this.add.rectangle(W - 210, 126, 196, 8, 0x07080d, 0.9).setOrigin(0)
    this.xpFill = this.add.rectangle(W - 208, 127, 192, 6, 0xebc372).setOrigin(0)
    this.xpText = this.add.text(W - 12, 121, '', { fontFamily: F, fontSize: '9px', color: '#d7dce4' }).setOrigin(1, 0).setStroke('#07080d', 3)
    this.clueKick = this.add.text(W - 210, 138, 'DOVEZI', { fontFamily: F, fontSize: '10px', color: '#9ec0ff' }).setOrigin(0, 0).setStroke('#07080d', 3)
    this.cluePips = []
    for (let i = 0; i < 4; i++) this.cluePips.push(this.add.rectangle(W - 59 + i * 12, 139, 9, 9, 0x2a3242).setOrigin(0).setStrokeStyle(1, 0x000000, 0.5))

    // mission banner / objective list (clear gap below the vitals plate which ends at y130)
    this.missionText = this.add.text(8, 144, '', { fontFamily: F, fontSize: '12px', color: '#ebc372', backgroundColor: '#10121aEE', padding: { x: 8, y: 6 }, lineSpacing: 5, align: 'left' }).setOrigin(0, 0)

    // weapon chip (bottom-left)
    this.weaponText = this.add.text(8, 0, '', { fontFamily: F, fontSize: '10px', color: '#d7dce4', backgroundColor: '#10121aBB', padding: { x: 5, y: 3 } }).setOrigin(0, 1)

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

    // persistent dialogue panel (NPC plot lines — does NOT auto-close)
    this.dlgBox = this.add.rectangle(W / 2, H - 70, 560, 86, 0x10121a, 0.96).setOrigin(0.5).setStrokeStyle(2, 0xebc372).setDepth(58).setVisible(false)
    this.dlgName = this.add.text(W / 2 - 268, H - 104, '', { fontFamily: F, fontSize: '13px', color: '#ffd24a' }).setOrigin(0, 0).setDepth(59).setVisible(false)
    this.dlgText = this.add.text(W / 2 - 268, H - 84, '', { fontFamily: F, fontSize: '13px', color: '#f0f2f6', wordWrap: { width: 524 }, lineSpacing: 4 }).setOrigin(0, 0).setDepth(59).setVisible(false)
    this.dlgHint = this.add.text(W / 2 + 256, H - 36, 'E ▸', { fontFamily: F, fontSize: '12px', color: '#aeb5c0' }).setOrigin(1, 1).setDepth(59).setVisible(false)

    // character / pause menu (Esc) — zoned character-sheet, own depth band above everything
    this.buildCharMenu(W, H)

    // win overlay
    this.winDim = this.add.rectangle(0, 0, W, H, 0x0a0b10, 0.93).setOrigin(0).setDepth(60).setVisible(false)
    this.winText = this.add.text(W / 2, H / 2, '', { fontFamily: F, fontSize: '16px', color: '#ebc372', align: 'center', lineSpacing: 8, wordWrap: { width: 540 } }).setOrigin(0.5).setDepth(61).setVisible(false)

    // minimap
    this.mapG = this.add.graphics().setDepth(50)
    this.mapLabel = this.add.text(0, 0, 'HARTĂ', { fontFamily: F, fontSize: '9px', color: '#aeb5c0' }).setOrigin(0, 1).setDepth(51)

    this.scale.on('resize', (gs) => this.relayout(gs.width, gs.height))
  }

  relayout(W, H) {
    this.topbar.width = W
    this.newsBand.width = W; this.newsLine.width = W
    this.help.setX(W - 8)
    // right ECONOMY cluster re-anchors to the right edge
    this.econPlate.setX(W - 218); this.econInner.setX(W - 218)
    this.leiKick.setX(W - 210); this.leiText.setX(W - 12)
    this.scoreKick.setX(W - 210); this.scoreText.setX(W - 12)
    this.rankText.setX(W - 12)
    this.xpTrack.setX(W - 210); this.xpFill.setX(W - 208); this.xpText.setX(W - 12)
    this.clueKick.setX(W - 210)
    for (let i = 0; i < 4; i++) this.cluePips[i].setX(W - 59 + i * 12)
    this.promptText.setPosition(W / 2, H - 116)
    this.toastText.setX(W / 2)
    this.np.setPosition(W / 2, H - 44)
    this.dlgBox.setPosition(W / 2, H - 70); this.dlgName.setPosition(W / 2 - 268, H - 104); this.dlgText.setPosition(W / 2 - 268, H - 84); this.dlgHint.setPosition(W / 2 + 256, H - 36)
    this.crt.setSize(W, H)
    this.copDim.setSize(W, H)
    this.copBox.setPosition(W / 2, H / 2); this.copQ.setPosition(W / 2, H / 2 - 52); this.copOpts.setPosition(W / 2, H / 2 + 6)
    this.cmDim.setSize(W, H); this.layoutCharMenu(W / 2, H / 2)
  }

  fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }

  // ---- character / pause menu (zoned character-sheet) --------------------
  buildCharMenu(W, H) {
    const cx = W / 2, cy = H / 2
    this.cmObjs = []; this._cmOn = false
    this.cmDim = this.add.rectangle(0, 0, W, H, 0x07080d, 0.9).setOrigin(0).setDepth(70).setVisible(false)
    const reg = (e, lx, ly) => { e._lx = lx; e._ly = ly; e.setDepth(72).setVisible(false); this.cmObjs.push(e); return e }
    const rect = (lx, ly, w, h, fill, alpha, ox, oy, stroke, sw) => {
      const e = this.add.rectangle(cx + lx, cy + ly, w, h, fill, alpha == null ? 1 : alpha).setOrigin(ox, oy)
      if (stroke != null) e.setStrokeStyle(sw || 1, stroke)
      return reg(e, lx, ly)
    }
    const txt = (lx, ly, s, color, ox, oy, str) => {
      const e = this.add.text(cx + lx, cy + ly, str || '', { fontFamily: F, fontSize: s + 'px', color }).setOrigin(ox, oy)
      return reg(e, lx, ly)
    }
    // panel base + inner hairline
    rect(0, 0, 520, 468, 0x12131c, 0.99, 0.5, 0.5, 0xebc372, 2)
    rect(0, 0, 508, 456, 0x000000, 0, 0.5, 0.5, 0x2a2c3a, 1)
    // dividers
    ;[-150, -68, 14, 74, 200].forEach((dy) => rect(0, dy, 464, 1, 0x2a2c3a, 1, 0.5, 0.5))
    // header
    txt(-232, -222, 11, '#aeb5c0', 0, 0, 'P E R S O N A J')
    this.cmName = txt(-232, -206, 22, '#ffffff', 0, 0)
    this.cmType = txt(-232, -178, 12, '#aeb5c0', 0, 0)
    // rank badge (top-right) — wide enough for the full rank name
    rect(232, -210, 184, 44, 0x1b1d2b, 1, 1, 0, 0xebc372, 1)
    this.cmLvl = txt(220, -201, 13, '#ebc372', 1, 0)
    this.cmRank = txt(220, -182, 10, '#e7ebf2', 1, 0)
    rect(82, -160, 150, 6, 0x0c0d14, 1, 0, 0.5, 0x2a2c3a, 1)
    this.cmXp = rect(83, -160, 150, 4, 0xebc372, 1, 0, 0.5)
    // labelled bars
    this.cmBars = {}
    const makeBar = (key, barY, label, valColor) => {
      txt(-232, barY - 16, 12, '#aeb5c0', 0, 1, label)
      const val = txt(88, barY - 16, 12, valColor, 1, 1)
      rect(-232, barY, 320, 14, 0x0c0d14, 1, 0, 0.5, 0x2a2c3a, 1)
      const fill = rect(-231, barY, 318, 12, 0x4caf50, 1, 0, 0.5)
      this.cmBars[key] = { val, fill }
    }
    makeBar('hp', -120, 'HP', '#ffffff')
    makeBar('heat', -86, 'POLIȚIE', '#ffffff')
    makeBar('cred', -38, 'STRADĂ', '#e7ebf2')
    makeBar('civic', -4, 'CIVIC', '#e7ebf2')
    this.cmBars.civic.fill.fillColor = 0x2f6fb0 // civic = blue identity
    // wallet
    txt(-232, 22, 11, '#aeb5c0', 0, 0, 'LEI')
    this.cmLei = txt(-232, 36, 28, '#ffd24a', 0, 0)
    txt(232, 22, 11, '#aeb5c0', 1, 0, 'SCOR')
    this.cmScore = txt(232, 38, 18, '#e7ebf2', 1, 0)
    // inventory
    txt(-232, 86, 11, '#aeb5c0', 0, 0, 'ARMĂ')
    this.cmWeapon = txt(-150, 84, 14, '#ebc372', 0, 0)
    // evidence (5-cell grid)
    txt(-232, 112, 11, '#aeb5c0', 0, 0, 'DOVEZI')
    this.cmClueCount = txt(-150, 110, 14, '#ebc372', 0, 0)
    this.cmCells = []
    for (let i = 0; i < 4; i++) {
      const lx = -152 + i * 80
      const box = rect(lx, 160, 64, 52, 0x0c0d14, 1, 0, 0.5, 0x2a2c3a, 1)
      const mark = txt(lx + 32, 160, 24, '#3a3d4c', 0.5, 0.5)
      this.cmCells.push({ box, mark })
    }
    // running deduction (the case board's aha line)
    this.cmDeduction = txt(-232, 190, 11, '#9ec0ff', 0, 0)
    // footer
    txt(0, 212, 11, '#aeb5c0', 0.5, 0, 'ESC — închide  ·  joc salvat automat')
  }

  layoutCharMenu(cx, cy) {
    if (!this.cmObjs) return
    this.cmObjs.forEach((e) => e.setPosition(cx + e._lx, cy + e._ly))
  }

  renderCharMenu(cm) {
    this.cmName.setText(cm.name || 'Ion')
    this.cmType.setText(cm.type || '')
    const lvlNum = (String(cm.level).match(/\d+/) || ['1'])[0]
    const rankName = String(cm.level).split(': ')[1] || String(cm.level)
    this.cmLvl.setText('Niv. ' + lvlNum)
    this.cmRank.setText(rankName.length > 26 ? rankName.slice(0, 25) + '…' : rankName)
    const xp = String(cm.xp).split('/'); const xc = +xp[0] || 0, xn = +xp[1] || 0
    this.cmXp.displayWidth = xn > xc ? Math.max(0, Math.min(150, 150 * (xc / xn))) : 150
    const hcol = (c) => '#' + c.toString(16).padStart(6, '0')
    // HP
    const hp = String(cm.hp).split('/'); const hc = +hp[0] || 0, hm = +hp[1] || 1; const hr = hc / hm
    const hpCol = hr > 0.5 ? 0x4caf50 : hr > 0.25 ? 0xf9a200 : 0xcc3b30
    this.cmBars.hp.fill.displayWidth = Math.max(0, 318 *hr); this.cmBars.hp.fill.fillColor = hpCol
    this.cmBars.hp.val.setText(cm.hp).setColor(hcol(hpCol))
    // Heat (inverted danger colour)
    const heat = cm.heat || 0; const heatCol = heat < 40 ? 0x4caf50 : heat < 70 ? 0xf9a200 : 0xcc3b30
    this.cmBars.heat.fill.displayWidth = 318 *(heat / 100); this.cmBars.heat.fill.fillColor = heatCol
    this.cmBars.heat.val.setText(heat + '%').setColor(hcol(heatCol))
    // Cred / Civic (identity colours)
    this.cmBars.cred.fill.displayWidth = 318 *((cm.cred || 0) / 100); this.cmBars.cred.val.setText(String(cm.cred || 0))
    this.cmBars.civic.fill.displayWidth = 318 *((cm.civic || 0) / 100); this.cmBars.civic.val.setText(String(cm.civic || 0))
    // wallet + inventory
    this.cmLei.setText(this.fmt(cm.lei)); this.cmScore.setText(this.fmt(cm.score))
    this.cmWeapon.setText(cm.weapon || '—')
    // evidence grid
    this.cmClueCount.setText(`${cm.clueCount || 0} / 4`)
    for (let i = 0; i < 4; i++) {
      const got = i < (cm.clueCount || 0)
      this.cmCells[i].mark.setText(got ? '✓' : '✕').setColor(got ? '#4caf50' : '#3a3d4c')
      this.cmCells[i].box.setFillStyle(got ? 0x14241a : 0x0c0d14).setStrokeStyle(1, got ? 0x4caf50 : 0x2a2c3a)
    }
    if (this.cmDeduction) this.cmDeduction.setText(cm.deduction ? 'DEDUCȚIE: ' + cm.deduction : '')
  }

  update(_t, dt) {
    // scroll the news ticker; regenerate fresh headlines each loop
    this.newsX -= 0.06 * (dt || 16)
    if (this.newsX + this.newsText.width < 0) { this.newsText.setText(this.makeNews()); this.newsX = this.scale.width }
    this.newsText.x = this.newsX

    const hud = this.registry.get('hud')
    if (hud) {
      const hpR = hud.maxHp ? hud.hp / hud.maxHp : 0
      this.hpFill.displayWidth = Math.max(0, 216 * hpR)
      this.hpFill.fillColor = hpR > 0.5 ? 0x4caf50 : hpR > 0.25 ? 0xf9a200 : 0xcc3b30
      this.hpText.setText(`${hud.hp}/${hud.maxHp}`)
      this.hpText.setColor(hpR > 0.5 ? '#ffffff' : hpR > 0.25 ? '#ffd9a0' : '#ff8a80')
      const heatR = (hud.heat || 0) / 100
      this.heatFill.displayWidth = 216 * heatR
      this.heatFill.fillColor = heatR < 0.4 ? 0x4caf50 : heatR < 0.7 ? 0xf9a200 : 0xcc3b30
      this.heatText.setText(`${Math.round(hud.heat || 0)}%`)
      this.credFill.displayWidth = 216 * ((hud.cred || 0) / 100)
      this.credText.setText(String(hud.cred | 0))
      this.civicFill.displayWidth = 216 * ((hud.civic || 0) / 100)
      this.civicText.setText(String(hud.civic | 0))
      this.leiText.setText(this.fmt(hud.lei))
      this.scoreText.setText(this.fmt(hud.score))
      this.rankText.setText(hud.rank || '')
      const xpR = hud.xpNext > hud.xpCur ? (hud.xp - hud.xpCur) / (hud.xpNext - hud.xpCur) : 1
      this.xpFill.displayWidth = Math.max(0, Math.min(192, 192 * xpR))
      this.xpText.setText(hud.xpNext > hud.xpCur ? `${hud.xp}/${hud.xpNext} XP` : 'MAX')
      for (let i = 0; i < 4; i++) this.cluePips[i].fillColor = i < (hud.clues || 0) ? 0x9ec0ff : 0x2a3242
      this.weaponText.setText(hud.weapon ? `Armă: ${hud.weapon}  (Q schimbă · SPACE lovește)` : '')
      this.weaponText.setPosition(8, this.scale.height - 10)
    }

    const mission = this.registry.get('mission')
    if (mission !== this._mission) { this._mission = mission; this.missionText.setText(mission ? '★ ' + mission : '') }

    const prompt = this.registry.get('prompt')
    // hide the interaction prompt while any overlay is up, so it never overlaps the dialogue box
    const overlayUp = this.registry.get('dialog') || this.registry.get('cop') || this.registry.get('shop') || this.registry.get('finale') || this.registry.get('charmenu')
    this.promptText.setText(prompt || '')
    this.promptText.setAlpha(prompt && !overlayUp ? 1 : 0)

    // toast (fades over ~2.6s)
    const toast = this.registry.get('toast')
    // reading-time based hold: ~18 chars/sec (160-180 wpm) + base, min 3s, max 8s, then fade
    if (toast && toast.id !== this.toastId) { this.toastId = toast.id; this.toastText.setText(toast.msg); this.toastText.setAlpha(1); this._toastT = this.time.now; this._toastHold = Phaser.Math.Clamp(1500 + (toast.msg || '').length * 55, 3000, 8000) }
    if (this.toastText.alpha > 0 && this.time.now - this._toastT > (this._toastHold || 3600)) this.toastText.setAlpha(Math.max(0, this.toastText.alpha - 0.02))

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
    const menu = this.registry.get('cop') || this.registry.get('shop') || this.registry.get('finale')
    const on = !!menu
    this.copDim.setVisible(on); this.copBox.setVisible(on); this.copQ.setVisible(on); this.copOpts.setVisible(on)
    if (on) {
      const sig = menu.q + '|' + menu.opts.join('|')
      if (sig !== this._menuSig) {
        this._menuSig = sig
        this.copQ.setText(menu.q); this.copOpts.setText(menu.opts.join('\n'))
        const w = Math.max(this.copQ.width, this.copOpts.width) + 52
        const h = this.copQ.height + this.copOpts.height + 40
        const cx = this.scale.width / 2, cy = this.scale.height / 2
        this.copBox.setSize(w, h).setPosition(cx, cy)
        this.copQ.setPosition(cx, cy - h / 2 + 14)
        this.copOpts.setPosition(cx - w / 2 + 26, cy - h / 2 + 14 + this.copQ.height + 14)
        this.copBox.setStrokeStyle(2, this.registry.get('shop') ? 0xebc372 : 0x2f5bb0)
      }
    } else { this._menuSig = null }

    // dialogue panel (one sentence/page at a time; player advances with E)
    const dlg = this.registry.get('dialog')
    const dOn = !!dlg
    this.dlgBox.setVisible(dOn); this.dlgName.setVisible(dOn); this.dlgText.setVisible(dOn); this.dlgHint.setVisible(dOn)
    if (dOn && (dlg.line !== this._dlgLine || dlg.page !== this._dlgPg)) {
      this._dlgLine = dlg.line; this._dlgPg = dlg.page
      this.dlgName.setText((dlg.speaker || '') + (dlg.total > 1 ? `   ${dlg.page}/${dlg.total}` : ''))
      this.dlgText.setText(dlg.line || '')
      this.dlgHint.setText(dlg.more ? 'E ▸' : 'E ✕')
    } else if (!dOn) { this._dlgLine = null; this._dlgPg = null }

    // character / pause menu (zoned character-sheet)
    const cm = this.registry.get('charmenu')
    const cmOn = !!cm
    if (cmOn !== this._cmOn) { this._cmOn = cmOn; this.cmDim.setVisible(cmOn); this.cmObjs.forEach((e) => e.setVisible(cmOn)) }
    if (cmOn && cm !== this._cm) { this._cm = cm; this.renderCharMenu(cm) }
    else if (!cmOn) { this._cm = null }

    this.crt.setVisible(this.registry.get('crt') !== false)
    this.drawMinimap()

    const win = this.registry.get('win')
    this.winDim.setVisible(!!win); this.winText.setVisible(!!win)
    if (win && this._winSig !== win.score) {
      this._winSig = win.score
      this.winDim.setSize(this.scale.width, this.scale.height)
      this.winText.setPosition(this.scale.width / 2, this.scale.height / 2)
      this.winText.setText(`★ PRIMAR DE CHIȘINĂU ★\n\nL-ai demascat pe Primar. Orașul e al tău.\n\nScor final: ${win.score}    Lei: ${win.lei}\nRang: ${win.rank}\n\nCu ${win.lei} lei ai cumpărat\n${win.sqm} m² de apartament în Chișinău.\n\nFelicitări — ai ajuns nimeni-cineva.\n\nApasă R pentru a reîncepe.`)
    }
  }

  makeNews() {
    const hud = this.registry.get('hud') || {}
    const rank = hud.rank || 'plecat peste hotare'
    const lei = hud.lei != null ? hud.lei : 0
    const rnd = (a) => a[Math.floor(Math.random() * a.length)]
    // dry, local, self-deprecating Moldovan headlines (no try-hard randomness)
    const POOL = [
      'Ceon Eban a tăiat panglica la o gropă nou-deschisă pe Dacia',
      'Primarul: «Lucrăm la asta» — al 4-lea an consecutiv',
      'Troleibuzul 22 a venit la timp. Poliția investighează',
      'Curtea de Conturi: jumate din curte deja plecată în Italia',
      'Salariul mediu a crescut. Tot nu ajunge până la 15',
      'Gropile din Botanica au primit buletin de identitate',
      'Ceon Eban a scăpat iar telefonul. Vorbea... în rusă',
      'Apă caldă revine în august. Sau în septembrie',
      'Deputații au plecat în China «pe o zi». Întorc la pensie',
      'Rutiera a băgat 9 oameni în plus. Șoferul: «mai încape unul»',
      'Pensia a ajuns la card. Cardul a ajuns la Linella',
      'Cortegiul primarului a luat-o iar spre ambasada rusă. Coincidență',
      'Bd. Ștefan cel Mare reasfaltat. A treia oară anul ăsta',
      'Gară: bilet spre Moscova mai ieftin decât chiria la Centru',
      'Ceon Eban inaugurează un parc. Tot pe hârtie',
      'Matrioșca de pe biroul primarului: ediție limitată',
      'Termoelectrica anunță: căldura pornește când pornește',
      'Un moldovean a rămas în țară. Vecinii suspectează ceva',
      'Evacuatorul a luat mașina primarului. Apoi și-a cerut scuze',
      'Prețul la benzină iar sus. Mergem cu troleibuzul... dacă vine',
      'Gropa de pe Albișoara a fost botezată oficial «Marea Neagră»',
      'Un deputat a citit o lege. Colegii sunt în șoc',
      'Botanica conduce în Derby. Râșcani contestă la judecată',
      'Linella a scumpit pâinea. Pensionarii declară grevă pe bancă',
      'Ceon Eban: «Eu nu am hotline cu Moscova». Sună telefonul',
      'Festivalul Vinului: 3 zile. Refacerea: 5 zile',
      'Primăria a numărat gropile. A rămas fără degete',
      'Diaspora a trimis 2 miliarde. Statul le-a băgat în gropi',
      'Rutiera acum are aer condiționat — fereastra spartă',
      'Un troleibuz nou a apărut în Chișinău. Vine din 2009',
      'Ceon Eban a promis metrou până-n Botanica. Pe la 2090',
      'Salariu mic, dar internetul e cel mai rapid din regiune',
      'Pensionarii primesc 50 lei în plus. Mulțumiri lui Apă Canal',
      'Cricova a inundat o pivniță cu vin. Voluntari: coadă de 4 km',
      'Primarul vorbește 5 limbi. Cu Moscova preferă una',
      'Andy\'s a livrat pizza mai repede decât a venit ambulanța',
      'Ceon Eban inaugurează troleibuzul electric. Tot fără curent',
      `Un oarecare „${rank}" face ordine în Centru. Primăria nu comentează`,
      `Curs: cu ${lei} lei iei o plăcintă și jumate de vis`,
      'Gropile au făcut sezonul. Asfaltul, nu',
    ]
    const items = []
    const used = new Set()
    while (items.length < 8) { const h = rnd(POOL); if (!used.has(h)) { used.add(h); items.push(h) } }
    return '◆ ' + items.join('   ◆   ') + '   ◆   '
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
    // dovezi pins (uncollected evidence) — pulsing gold, always visible during the investigation
    if (dyn.dovezi && dyn.dovezi.length) {
      const r = 2 + (Math.sin(this.time.now / 240) + 1) * 1.4
      dyn.dovezi.forEach((p) => {
        g.fillStyle(0xebc372, 1); g.fillCircle(x0 + p.x * sx, y0 + p.y * sy, r)
        g.lineStyle(1, 0x10121a, 0.9); g.strokeCircle(x0 + p.x * sx, y0 + p.y * sy, r)
      })
    }
    g.fillStyle(0x4caf50, 1); g.fillCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3) // player
    g.lineStyle(1, 0xffffff, 0.85); g.strokeCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3)
  }
}
