// On-screen controls for phones and tablets: floating joystick on the left, action buttons on
// the right, drag anywhere else on the right half to turn the camera.
// Buttons press virtual key codes that Input maps like real keys (see KEYMAP 'Touch*').

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }

export function isTouchDevice() {
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && window.matchMedia?.('(pointer: coarse)').matches
}

const FOOT = [
  { code: 'TouchAttack', label: '👊', cls: 'big a', hint: 'Lovește' },
  { code: 'TouchJump', label: '⤒', cls: 'j', hint: 'Sari' },
  { code: 'TouchE', label: 'E', cls: 'e', hint: 'Acțiune' },
  { code: 'TouchSprint', label: '»', cls: 's', hint: 'Fugi', hold: true },
  { code: 'TouchSwap', label: 'Q', cls: 'q', hint: 'Armă' },
]
const CAR = [
  { code: 'TouchJump', label: '⤓', cls: 'big a', hint: 'Frână' },
  { code: 'TouchE', label: 'E', cls: 'e', hint: 'Coboară' },
  { code: 'TouchSprint', label: '🔥', cls: 's', hint: 'Nitro', hold: true },
  { code: 'TouchHorn', label: '📯', cls: 'q', hint: 'Claxon' },
  { code: 'TouchJob', label: 'T', cls: 'j', hint: 'Tură' },
]

export class Touch {
  constructor(game) {
    this.game = game
    this.input = game.input
    this.root = el('div', 'touch-ui')
    game.uiRoot.appendChild(this.root)
    document.documentElement.classList.add('touch')
    this.stick = el('div', 'tstick', '<div class="knob"></div>')
    this.root.appendChild(this.stick)
    this.knob = this.stick.firstChild
    this.btns = el('div', 'tbtns')
    this.root.appendChild(this.btns)
    this.top = el('div', 'ttop')
    this.root.appendChild(this.top)
    for (const b of [{ code: 'TouchMap', label: '🗺', cls: 'm' }, { code: 'TouchPause', label: '❚❚', cls: 'p' }]) this.top.appendChild(this.button(b))
    this.skip = this.button({ code: 'TouchJump', label: '⏭', cls: 'skipb', hint: 'Ține: sari' })
    game.uiRoot.appendChild(this.skip)
    this.rotate = el('div', 'trotate', '<div>📱↻</div><p>Întoarce telefonul pe orizontală</p>')
    game.uiRoot.appendChild(this.rotate)
    this.mode = ''
    this.stickId = null
    this.camId = null
    this.bindSurface()
  }

  button(b) {
    const e = el('button', 'tbtn ' + b.cls, `<span>${b.label}</span>${b.hint ? `<small>${b.hint}</small>` : ''}`)
    const inp = this.input
    const down = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!inp.down.has(b.code)) inp.pressedSet.add(b.code); inp.down.add(b.code); inp.lastDevice = 'touch'; e.classList.add('on') }
    const up = (ev) => { ev.preventDefault(); ev.stopPropagation(); inp.down.delete(b.code); inp.releasedSet.add(b.code); e.classList.remove('on') }
    e.addEventListener('touchstart', down, { passive: false })
    e.addEventListener('touchend', up, { passive: false })
    e.addEventListener('touchcancel', up, { passive: false })
    return e
  }

  setMode(mode) {
    if (mode === this.mode) return
    this.mode = mode
    this.btns.innerHTML = ''
    for (const b of mode === 'car' ? CAR : FOOT) this.btns.appendChild(this.button(b))
  }

  // joystick (left half) + camera drag (right half) on the game surface
  bindSurface() {
    const surf = this.game.renderer.renderer.domElement
    const inp = this.input
    const R = 58
    const start = (ev) => {
      for (const t of ev.changedTouches) {
        const left = t.clientX < window.innerWidth * 0.45
        if (left && this.stickId === null) {
          this.stickId = t.identifier
          this.ox = t.clientX; this.oy = t.clientY
          this.stick.style.left = t.clientX + 'px'; this.stick.style.top = t.clientY + 'px'
          this.stick.classList.add('on')
          this.knob.style.transform = 'translate(-50%, -50%)'
        } else if (!left && this.camId === null) {
          this.camId = t.identifier
          this.cx = t.clientX
          inp.touchCam = true
        }
      }
      ev.preventDefault()
    }
    const move = (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier === this.stickId) {
          let dx = t.clientX - this.ox, dy = t.clientY - this.oy
          const d = Math.hypot(dx, dy)
          if (d > R) { dx *= R / d; dy *= R / d }
          this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
          const k = Math.min(1, d / R)
          inp.virtual.x = d > 6 ? (dx / R) : 0
          inp.virtual.y = d > 6 ? (-dy / R) : 0
          inp.virtual.mag = k
        } else if (t.identifier === this.camId) {
          inp.mouse.dx += (t.clientX - this.cx) * 1.6
          this.cx = t.clientX
        }
      }
      ev.preventDefault()
    }
    const end = (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier === this.stickId) { this.stickId = null; inp.virtual.x = inp.virtual.y = 0; this.stick.classList.remove('on') }
        if (t.identifier === this.camId) { this.camId = null; inp.touchCam = false }
      }
    }
    surf.addEventListener('touchstart', start, { passive: false })
    surf.addEventListener('touchmove', move, { passive: false })
    surf.addEventListener('touchend', end)
    surf.addEventListener('touchcancel', end)
  }

  update() {
    const g = this.game
    const show = g.state === 'play' && !g.paused && !g.cutscene && !g.ui.modalOpen && g.ui.hudVisible
    this.root.style.display = show ? '' : 'none'
    if (!show) { if (this.stickId !== null) { this.stickId = null; this.input.virtual.x = this.input.virtual.y = 0; this.stick.classList.remove('on') } }
    this.setMode(g.player?.vehicle && !g.player.passenger ? 'car' : 'foot')
    const a = g.story?.active
    this.skip.style.display = a && (g.cutscene || a.skippable) && !g.ui.modalOpen ? '' : 'none'
    this.rotate.style.display = window.innerHeight > window.innerWidth * 1.1 && g.state !== 'loading' ? '' : 'none'
  }
}
