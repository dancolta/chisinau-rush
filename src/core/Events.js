// Tiny synchronous event bus shared by every system.
export class Events {
  constructor() { this.map = new Map() }

  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set())
    this.map.get(name).add(fn)
    return () => this.off(name, fn)
  }

  once(name, fn) {
    const off = this.on(name, (...a) => { off(); fn(...a) })
    return off
  }

  off(name, fn) { const s = this.map.get(name); if (s) s.delete(fn) }

  emit(name, ...args) {
    const s = this.map.get(name)
    if (!s) return
    for (const fn of [...s]) {
      try { fn(...args) } catch (e) { console.error(`[events] ${name}`, e) }
    }
  }
}
