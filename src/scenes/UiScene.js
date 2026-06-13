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
    this.help = this.add.text(W - 8, 22, 'WASD · Shift · E acțiune · click: nume · T CRT', { fontFamily: F, fontSize: '10px', color: '#aeb5c0' }).setOrigin(1, 0)

    // HP bar (big + clear)
    this.add.rectangle(6, 46, 184, 20, 0x10121a, 0.82).setOrigin(0).setStrokeStyle(1, 0x000000, 0.6)
    this.hpFill = this.add.rectangle(9, 49, 178, 14, 0xcc3b30).setOrigin(0)
    this.add.text(11, 49, 'HP', { fontFamily: F, fontSize: '11px', color: '#ffffff' }).setOrigin(0, 0).setStroke('#10121a', 3).setDepth(2)
    this.hpText = this.add.text(98, 49, '', { fontFamily: F, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5, 0).setStroke('#10121a', 4).setDepth(2)

    // HEAT / CRED / CIVIC bars (reputation triangle)
    const bar = (y, label, color) => {
      this.add.rectangle(6, y, 184, 12, 0x10121a, 0.82).setOrigin(0)
      const fill = this.add.rectangle(9, y + 2, 0, 8, color).setOrigin(0)
      this.add.text(11, y, label, { fontFamily: F, fontSize: '9px', color: '#ffffff' }).setOrigin(0, 0).setStroke('#10121a', 3).setDepth(2)
      return fill
    }
    this.heatFill = bar(68, 'HEAT', 0xf9a200)
    this.credFill = bar(82, 'CRED', 0x4caf50)
    this.civicFill = bar(96, 'CIVIC', 0x2f6fb0)

    // top-right stat panel: lei, score, rank, clues
    this.add.rectangle(W - 168, 40, 162, 80, 0x10121a, 0.78).setOrigin(0).setStrokeStyle(1, 0x000000, 0.6).setName('statpanel')
    this.leiText = this.add.text(W - 12, 44, '', { fontFamily: F, fontSize: '17px', color: '#ffd24a' }).setOrigin(1, 0).setStroke('#10121a', 3)
    this.scoreText = this.add.text(W - 12, 64, '', { fontFamily: F, fontSize: '13px', color: '#ffffff' }).setOrigin(1, 0).setStroke('#10121a', 3)
    this.rankText = this.add.text(W - 12, 82, '', { fontFamily: F, fontSize: '12px', color: '#ebc372' }).setOrigin(1, 0).setStroke('#10121a', 3)
    this.clueText = this.add.text(W - 12, 100, '', { fontFamily: F, fontSize: '12px', color: '#9ec0ff' }).setOrigin(1, 0).setStroke('#10121a', 3)

    // mission banner
    this.missionText = this.add.text(8, 116, '', { fontFamily: F, fontSize: '12px', color: '#ebc372', backgroundColor: '#10121aCC', padding: { x: 6, y: 4 } }).setOrigin(0, 0)

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

    // character / pause menu (Esc) — own depth band above everything
    this.cmDim = this.add.rectangle(0, 0, W, H, 0x07080d, 0.9).setOrigin(0).setDepth(70).setVisible(false)
    this.cmBox = this.add.rectangle(W / 2, H / 2, 460, 360, 0x12131c, 0.99).setOrigin(0.5).setStrokeStyle(2, 0xebc372).setDepth(71).setVisible(false)
    this.cmTitle = this.add.text(W / 2, H / 2 - 162, '', { fontFamily: F, fontSize: '20px', color: '#ebc372' }).setOrigin(0.5, 0).setDepth(72).setVisible(false)
    this.cmText = this.add.text(W / 2 - 200, H / 2 - 118, '', { fontFamily: F, fontSize: '14px', color: '#e7ebf2', lineSpacing: 8, wordWrap: { width: 400 } }).setOrigin(0, 0).setDepth(72).setVisible(false)

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
    this.leiText.setX(W - 12); this.scoreText.setX(W - 12); this.rankText.setX(W - 12); this.clueText.setX(W - 12)
    const sp = this.children.getByName('statpanel'); if (sp) sp.setX(W - 168)
    this.promptText.setPosition(W / 2, H - 116)
    this.toastText.setX(W / 2)
    this.np.setPosition(W / 2, H - 44)
    this.dlgBox.setPosition(W / 2, H - 70); this.dlgName.setPosition(W / 2 - 268, H - 104); this.dlgText.setPosition(W / 2 - 268, H - 84); this.dlgHint.setPosition(W / 2 + 256, H - 36)
    this.crt.setSize(W, H)
    this.copDim.setSize(W, H)
    this.copBox.setPosition(W / 2, H / 2); this.copQ.setPosition(W / 2, H / 2 - 52); this.copOpts.setPosition(W / 2, H / 2 + 6)
    this.cmDim.setSize(W, H); this.cmBox.setPosition(W / 2, H / 2)
    this.cmTitle.setPosition(W / 2, H / 2 - 162); this.cmText.setPosition(W / 2 - 200, H / 2 - 118)
  }

  update(_t, dt) {
    // scroll the news ticker; regenerate fresh headlines each loop
    this.newsX -= 0.06 * (dt || 16)
    if (this.newsX + this.newsText.width < 0) { this.newsText.setText(this.makeNews()); this.newsX = this.scale.width }
    this.newsText.x = this.newsX

    const hud = this.registry.get('hud')
    if (hud) {
      this.hpFill.displayWidth = Math.max(0, 178 * (hud.hp / hud.maxHp))
      this.hpFill.fillColor = hud.hp > 50 ? 0x4caf50 : hud.hp > 25 ? 0xf9a200 : 0xcc3b30
      this.hpText.setText(`${hud.hp} / ${hud.maxHp}`)
      this.heatFill.displayWidth = 178 * (hud.heat / 100)
      this.credFill.displayWidth = 178 * ((hud.cred || 0) / 100)
      this.civicFill.displayWidth = 178 * ((hud.civic || 0) / 100)
      this.leiText.setText(`${hud.lei} lei`)
      this.scoreText.setText(`Scor ${hud.score}`)
      this.rankText.setText(hud.rank ? `${hud.rank}${hud.xpNext > hud.xpCur ? `  ${hud.xp}/${hud.xpNext}` : ''}` : '')
      this.clueText.setText(hud.clues > 0 ? `Dovezi ${hud.clues}/5` : '')
      this.weaponText.setText(hud.weapon ? `Armă: ${hud.weapon}  (Q schimbă · SPACE lovește)` : '')
      this.weaponText.setPosition(8, this.scale.height - 10)
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

    // dialogue panel
    const dlg = this.registry.get('dialog')
    const dOn = !!dlg
    this.dlgBox.setVisible(dOn); this.dlgName.setVisible(dOn); this.dlgText.setVisible(dOn); this.dlgHint.setVisible(dOn)
    if (dOn && dlg.line !== this._dlgLine) {
      this._dlgLine = dlg.line
      this.dlgName.setText(dlg.speaker || '')
      this.dlgText.setText(dlg.line || '')
    } else if (!dOn) { this._dlgLine = null }

    // character / pause menu
    const cm = this.registry.get('charmenu')
    const cmOn = !!cm
    this.cmDim.setVisible(cmOn); this.cmBox.setVisible(cmOn); this.cmTitle.setVisible(cmOn); this.cmText.setVisible(cmOn)
    if (cmOn && cm !== this._cm) {
      this._cm = cm
      this.cmTitle.setText('☰  PERSONAJ')
      this.cmText.setText([
        `Nume:  ${cm.name}`,
        `Tip:   ${cm.type}`,
        '',
        `${cm.level}`,
        `XP:    ${cm.xp}`,
        '',
        `HP:    ${cm.hp}`,
        `Lei:   ${cm.lei}        Scor: ${cm.score}`,
        `Stradă (cred): ${cm.cred}    Civic: ${cm.civic}`,
        `Heat:  ${cm.heat}`,
        `Armă:  ${cm.weapon}`,
        '',
        `Dovezi (${cm.clueCount}/5):`,
        `  ${cm.clues}`,
        '',
        'Esc — închide · joc salvat automat',
      ].join('\n'))
    } else if (!cmOn) { this._cm = null }

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
    const rank = hud.rank || 'șomer pe bancă'
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
      'Apă caldă revine în august. Promitem, davai',
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
      'Linella a scumpit pâinea. Baba Tamara declară grevă pe bancă',
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
    g.fillStyle(0x4caf50, 1); g.fillCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3) // player
    g.lineStyle(1, 0xffffff, 0.85); g.strokeCircle(x0 + dyn.px * sx, y0 + dyn.py * sy, 3)
  }
}
