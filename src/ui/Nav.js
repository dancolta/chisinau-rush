// Arrow keys and the gamepad d-pad / left stick move focus through a screen's buttons and
// fields; Enter or A presses the focused button, Esc or B backs out. Screens stack: only the
// newest open one listens. Returns a function that stops it.
//
// opts: { back(source: 'key'|'pad', typing) -> false when not handled, initial: element, selector }
const stack = []

export function padNav(game, root, { back = null, initial = null, selector = 'button:not([disabled]), input:not([disabled])' } = {}) {
  const me = {}
  stack.push(me)
  const active = () => stack[stack.length - 1] === me && root.isConnected
  const list = () => [...root.querySelectorAll(selector)].filter((e) => e.offsetParent !== null)
  // arrows a control uses itself: 2 = all of them (dropdowns, sliders), 1 = left/right (a text caret)
  const native = (t) => {
    if (!t || !t.tagName) return 0
    if (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'range')) return 2
    return t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(t.type) ? 1 : 0
  }
  const typingIn = (t) => !!t && root.contains(t) && native(t) === 1
  const focus = (e) => {
    if (!e) return
    e.focus({ preventScroll: true })
    e.scrollIntoView?.({ block: 'nearest' })
    // focus moved by keys or the pad shows a ring even where :focus-visible wouldn't
    e.classList.add('nav-focus')
    e.addEventListener('blur', () => e.classList.remove('nav-focus'), { once: true })
  }
  const move = (k) => {
    const l = list()
    if (!l.length) return
    const i = l.indexOf(document.activeElement)
    focus(l[i < 0 ? (k > 0 ? 0 : l.length - 1) : (i + k + l.length) % l.length])
    game.audio?.sfx('hover', { bus: 'ui', vol: 0.4 })
  }
  const onKey = (e) => {
    if (!active()) return
    const t = e.target
    // only keys aimed at this screen (or at nothing in particular)
    if (t && t !== document.body && t !== document.documentElement && !root.contains(t)) return
    const own = native(t), typing = own === 1
    let used = true
    if (own === 2 && e.code.startsWith('Arrow')) used = false
    else if (e.code === 'ArrowDown' || (e.code === 'ArrowRight' && !typing)) move(1)
    else if (e.code === 'ArrowUp' || (e.code === 'ArrowLeft' && !typing)) move(-1)
    else if (e.code === 'Escape' && back) used = back('key', typing) !== false
    else used = false
    if (used) { e.preventDefault(); e.stopPropagation() }
  }
  window.addEventListener('keydown', onKey, true)
  // the pad is polled here: the frame loop clears pressed buttons before a menu would see them
  let prev = game.input?.padState?.() || null
  let stickT = 0
  const timer = setInterval(() => {
    const pad = game.input?.padState?.() || null
    if (!pad || !active()) { prev = pad; return }
    const edge = (i) => pad.b[i] && !(prev && prev.b[i])
    stickT -= 0.05
    if (edge(13) || edge(15) || (pad.y > 0.55 && stickT <= 0)) { move(1); stickT = 0.28 }
    else if (edge(12) || edge(14) || (pad.y < -0.55 && stickT <= 0)) { move(-1); stickT = 0.28 }
    else if (Math.abs(pad.y) < 0.3) stickT = 0
    if (edge(0)) {
      const a = document.activeElement
      if (!root.contains(a)) move(1)
      else if (a.tagName === 'BUTTON') a.click()
    }
    if (edge(1) && back) back('pad', typingIn(document.activeElement))
    prev = pad
  }, 50)
  if (initial) setTimeout(() => { if (active()) focus(initial) }, 30)
  return () => {
    clearInterval(timer)
    window.removeEventListener('keydown', onKey, true)
    const i = stack.indexOf(me)
    if (i >= 0) stack.splice(i, 1)
  }
}
