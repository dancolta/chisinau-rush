// Unified keyboard / mouse / gamepad input with named actions.
// Systems ask for actions ("attack", "interact"), never raw keys, so remapping and
// gamepad support live in one place.

const KEYMAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  attack: ['KeyJ', 'KeyK', 'Mouse0'],
  interact: ['KeyE', 'KeyF'],
  swap: ['KeyQ'],
  horn: ['KeyH'],
  lookBack: ['KeyC'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  log: ['Tab'],
  skip: ['Enter', 'Space', 'KeyE'],
  confirm: ['Enter', 'KeyE', 'Space'],
  back: ['Escape', 'Backspace'],
  choice1: ['Digit1', 'Numpad1'],
  choice2: ['Digit2', 'Numpad2'],
  choice3: ['Digit3', 'Numpad3'],
  choice4: ['Digit4', 'Numpad4'],
  retry: ['KeyR'],
  camLeft: ['KeyZ'],
  camRight: ['KeyX'],
  radio: ['KeyR'],
  debug: ['Backquote'],
}

// standard-mapping gamepad buttons
const PADMAP = {
  jump: [0], handbrake: [0], confirm: [0], skip: [0],
  back: [1], sprint: [1],
  attack: [2],
  interact: [3],
  swap: [4],
  horn: [10],
  lookBack: [11],
  pause: [9],
  map: [8],
  choice1: [12], choice2: [15], choice3: [13], choice4: [14],
}

export class Input {
  constructor(dom) {
    this.dom = dom
    this.down = new Set()
    this.pressedSet = new Set()
    this.releasedSet = new Set()
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, dx: 0, dy: 0, wheel: 0, moved: 0, inside: false }
    this.pad = null
    this.padPrev = []
    this.padAxes = [0, 0, 0, 0]
    this.lastDevice = 'kb'
    this.enabled = true
    this.typing = false

    const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote'].includes(e.code)) e.preventDefault()
      if (!this.down.has(e.code)) this.pressedSet.add(e.code)
      this.down.add(e.code)
      this.lastDevice = 'kb'
    })
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code)
      this.releasedSet.add(e.code)
    })
    window.addEventListener('blur', () => { this.down.clear() })

    dom.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY
      this.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1
      this.mouse.dx += e.movementX || 0
      this.mouse.dy += e.movementY || 0
      this.mouse.moved = performance.now()
    })
    dom.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button
      if (!this.down.has(code)) this.pressedSet.add(code)
      this.down.add(code)
      this.lastDevice = 'kb'
    })
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button
      this.down.delete(code)
      this.releasedSet.add(code)
    })
    dom.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY) }, { passive: true })

    window.addEventListener('gamepadconnected', (e) => { this.pad = e.gamepad; this.lastDevice = 'pad' })
    window.addEventListener('gamepaddisconnected', () => { this.pad = null })
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let p = null
    for (const g of pads) if (g && g.connected) { p = g; break }
    this.pad = p
    if (!p) { this.padAxes = [0, 0, 0, 0]; return }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
    this.padAxes = [dz(p.axes[0] || 0), dz(p.axes[1] || 0), dz(p.axes[2] || 0), dz(p.axes[3] || 0)]
    const now = p.buttons.map((b) => b.pressed)
    for (let i = 0; i < now.length; i++) {
      const code = 'Pad' + i
      if (now[i] && !this.padPrev[i]) { this.pressedSet.add(code); this.lastDevice = 'pad' }
      if (!now[i] && this.padPrev[i]) this.releasedSet.add(code)
      if (now[i]) this.down.add(code); else this.down.delete(code)
    }
    if (this.padAxes.some((a) => a !== 0)) this.lastDevice = 'pad'
    this.padPrev = now
  }

  codes(action) {
    const k = KEYMAP[action] || []
    const p = (PADMAP[action] || []).map((i) => 'Pad' + i)
    return k.concat(p)
  }

  act(action) { if (!this.enabled) return false; return this.codes(action).some((c) => this.down.has(c)) }
  pressed(action) { if (!this.enabled) return false; return this.codes(action).some((c) => this.pressedSet.has(c)) }
  released(action) { return this.codes(action).some((c) => this.releasedSet.has(c)) }
  key(code) { return this.down.has(code) }
  keyPressed(code) { return this.pressedSet.has(code) }

  // movement vector: x = right, y = forward
  move() {
    if (!this.enabled) return { x: 0, y: 0 }
    let x = 0, y = 0
    if (this.act('left')) x -= 1
    if (this.act('right')) x += 1
    if (this.act('up')) y += 1
    if (this.act('down')) y -= 1
    x += this.padAxes[0]; y -= this.padAxes[1]
    const l = Math.hypot(x, y)
    if (l > 1) { x /= l; y /= l }
    return { x, y }
  }

  // analog triggers for driving (gamepad) merged with keys
  throttle() {
    if (!this.enabled) return 0
    let t = (this.act('up') ? 1 : 0) - (this.act('down') ? 1 : 0)
    const p = this.pad
    if (p) {
      const rt = p.buttons[7] ? p.buttons[7].value : 0
      const lt = p.buttons[6] ? p.buttons[6].value : 0
      if (rt > 0.05 || lt > 0.05) t = rt - lt
    }
    return Math.max(-1, Math.min(1, t))
  }

  steer() {
    if (!this.enabled) return 0
    let s = (this.act('right') ? 1 : 0) - (this.act('left') ? 1 : 0)
    if (Math.abs(this.padAxes[0]) > 0) s = this.padAxes[0]
    return s
  }

  lookAxes() { return { x: this.padAxes[2], y: this.padAxes[3] } }

  endFrame() {
    this.pressedSet.clear()
    this.releasedSet.clear()
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0
  }

  clear() { this.down.clear(); this.pressedSet.clear(); this.releasedSet.clear() }
}
