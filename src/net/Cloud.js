// Cloud saves for players with an account. Offline-first: the game keeps saving to localStorage
// exactly as before and this mirrors that save to the API in the background, never blocking
// play. Guests never touch the network.
//
// Bookkeeping ('cr3d-sync'): the server revision the local save is based on, and the `t` of the
// save that was last in step with the server. With those, after any change on either side:
//   only this device moved on -> upload        only the cloud moved on -> take the cloud copy
//   both moved on, or no shared history -> the player picks, seeing both (never lose progress silently)
// The server also lists the stamps of the saves it replaced, which covers uploads whose answer
// never came back (sent as the page closed).
import { Progress } from '../gameplay/Progress.js'

const ENV_API = String(import.meta.env.VITE_API_URL || '').trim()
export const API_BASE = ENV_API && ENV_API !== 'off' ? ENV_API.replace(/\/+$/, '') : '/api'
// GitHub Pages has no /api of its own: accounts there need VITE_API_URL at build time
export const CLOUD_ON = ENV_API !== 'off' && (!!ENV_API || !/\.github\.io$/i.test(location.hostname))

const AUTH_KEY = 'cr3d-auth'
const SYNC_KEY = 'cr3d-sync'
const SAVE_KEY = 'cr3d-save'
const PREV_KEY = 'cr3d-save-prev'   // the local save a cloud copy replaced, just in case
const DEBOUNCE = 5000               // a save waits this long before going up…
const MIN_GAP = 20000               // …and there's at most one upload per 20 s (story missions skip the line)
const KEEPALIVE_MAX = 60000         // browsers cap keepalive request bodies at 64 KB

const OFFLINE = 'Nu ne-am putut conecta la server. Verifică internetul și mai încearcă.'
const DOWN = 'Serverul de conturi nu răspunde acum. Mai încearcă puțin mai târziu.'

const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
const store = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* storage blocked */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errorOf = (r) => r.data?.error || (r.status === 0 ? OFFLINE : DOWN)

// a game started but not played yet (prologue unfinished) doesn't count as progress to protect
export const isFresh = (d) => !d || (!(d.story?.done?.length > 0) && !(d.xp > 0))
// which save has come further: missions, then XP, then the newer one
export function further(a, b) {
  const k = (d) => [d.story?.done?.length || 0, d.xp || 0, d.t || 0]
  const ka = k(a), kb = k(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] > kb[i] ? a : b
  return a
}

export class Cloud {
  constructor(game) {
    this.game = game
    this.enabled = CLOUD_ON
    this.state = this.enabled ? 'guest' : 'off'   // guest | idle | pending | syncing | retry | conflict | error | expired
    this.auth = null
    this.listeners = new Set()
    this.queue = Promise.resolve()
    this.busy = 0
    this.timer = null
    this.due = 0
    this.lastPush = 0
    this.lastCheck = 0
    this.urgentUntil = 0
    this.retryMs = 0
    this.needSync = false
    this.conflict = null
    this.resolver = null
    this.frozen = false
    this.booting = null
    this.error = ''
    this.expiredEmail = ''
    if (!this.enabled) return
    const a = load(AUTH_KEY)
    if (a && typeof a.token === 'string' && a.id) { this.auth = a; this.state = 'idle' }
    // a story mission just passed: that save goes up right away
    game.events?.on('mission:pass', (def) => { if (def && !def.activity) this.urgentUntil = Date.now() + 90000 })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flushOnHide(); else this.recheck() })
    window.addEventListener('pagehide', () => this.flushOnHide())
    window.addEventListener('online', () => { if (this.auth && (this.needSync || this.dirty())) this.schedule(1000) })
  }

  get loggedIn() { return !!this.auth }
  get email() { return this.auth?.email || '' }
  get lastSync() { return this.meta()?.at || 0 }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit() { for (const fn of [...this.listeners]) { try { fn(this) } catch (e) { console.error('[cloud]', e) } } }
  setState(s) { this.state = s; this.emit() }

  meta() { const m = load(SYNC_KEY); return m && this.auth && m.id === this.auth.id ? m : null }
  // (an upload can land after a logout: then there's nobody to note it for)
  setMeta(rev, t) { if (this.auth) store(SYNC_KEY, { id: this.auth.id, rev, t: t ?? null, at: Date.now() }) }
  // the local save changed since it was last in step with the cloud
  dirty() {
    if (!this.auth) return false
    const local = Progress.hasSave()
    if (!local) return false
    const m = this.meta()
    return !m || m.t !== local.t
  }

  async call(method, path, body, { timeout = 15000, keepalive = false } = {}) {
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (this.auth) headers.Authorization = 'Bearer ' + this.auth.token
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(API_BASE + path, {
        method, headers, keepalive, signal: ctrl.signal, credentials: 'omit', cache: 'no-store',
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      })
      let data = null
      try { data = await res.json() } catch (e) { /* not our API (a static host's 404 page, say) */ }
      return { status: res.status, ok: res.ok && data !== null, data }
    } catch (e) {
      return { status: 0, ok: false, data: null }
    } finally {
      clearTimeout(timer)
    }
  }

  // one network conversation at a time
  enqueue(fn) {
    const run = async () => {
      this.busy++
      try { await fn() } catch (e) { console.warn('[cloud]', e) } finally { this.busy-- }
    }
    const p = this.queue.then(run)
    this.queue = p
    return p
  }

  // ---- account ----------------------------------------------------------------------------------
  signup(email, password) { return this.enter('/auth/signup', email, password) }
  login(email, password) { return this.enter('/auth/login', email, password) }

  async enter(path, email, password) {
    if (!this.enabled) return { error: 'Conturile nu merg pe versiunea asta a jocului.' }
    const r = await this.call('POST', path, { email, password })
    if (!r.ok || !r.data?.token || !r.data?.user?.id) return { error: errorOf(r), status: r.status }
    this.auth = { token: r.data.token, id: r.data.user.id, email: r.data.user.email }
    store(AUTH_KEY, this.auth)
    this.error = ''
    this.expiredEmail = ''
    this.setState('idle')
    await this.sync()
    return { ok: true }
  }

  async logout() {
    if (!this.auth || this.conflict) return
    if (this.dirty()) await Promise.race([this.push(), sleep(6000)])
    await this.call('POST', '/auth/logout', undefined, { timeout: 5000 })
    this.auth = null
    store(AUTH_KEY, null)
    store(SYNC_KEY, null)
    clearTimeout(this.timer)
    this.timer = null
    this.retryMs = 0
    this.needSync = false
    this.error = ''
    this.setState('guest')
  }

  expire() {
    this.expiredEmail = this.auth?.email || ''
    this.auth = null
    store(AUTH_KEY, null)
    clearTimeout(this.timer)
    this.timer = null
    this.setState('expired')
    this.game.ui?.notify?.('☁ Sesiunea a expirat. Intră din nou în cont ca să salvezi și în cloud.', 5, 'red')
  }

  // ---- sync ---------------------------------------------------------------------------------------
  // at boot, when logged in: runs while the city loads
  start() { if (this.auth) this.booting = this.sync() }
  // wait (a little) for the boot sync, so Continue picks the right save
  ready(ms = 4000) { return this.booting ? Promise.race([this.booting, sleep(ms)]) : Promise.resolve() }

  sync() {
    if (!this.auth) return Promise.resolve()
    return this.enqueue(async () => {
      if (!this.auth) return
      this.setState('syncing')
      const r = await this.call('GET', '/save')
      this.lastCheck = Date.now()
      if (r.status === 401) return this.expire()
      if (!r.ok) return this.failed(r, true)
      this.needSync = false
      await this.reconcile(r.data)
    })
  }

  async reconcile(remote, depth = 0) {
    const g = this.game
    if (remote?.data && remote.data.v !== 3) {
      this.error = 'Salvarea din cloud e de la o versiune mai nouă a jocului. Reîncarcă pagina.'
      return this.setState('error')
    }
    const cloud = remote?.data || null
    const rev = Number(remote?.rev) || 0
    const meta = this.meta()
    const cloudMoved = !meta || meta.rev !== rev
    // the running game can be ahead of its last save: capture it before comparing
    if (cloudMoved && g.state === 'play' && !this.frozen) g.progress.save()
    const local = Progress.hasSave()
    if (!cloud) return local ? this.upload(local, rev, depth) : this.inStep(rev, null)
    if (!local) return this.adopt(remote)
    if (local.t === cloud.t) return this.inStep(rev, local.t)
    // this very save reached the cloud before (sent as the tab closed, say) and others built on it
    if ((remote.history || []).includes(local.t)) return this.adopt(remote)
    const localMoved = !meta || meta.t !== local.t
    if (!cloudMoved) return this.upload(local, rev, depth)
    if (!localMoved || isFresh(local)) return this.adopt(remote)
    if (isFresh(cloud)) return this.upload(local, rev, depth)
    const pick = await this.ask(local, cloud)
    return pick === 'cloud' ? this.adopt(remote) : this.upload(local, rev, depth)
  }

  async upload(local, baseRev, depth = 0, { keepalive = false } = {}) {
    this.lastPush = Date.now()
    this.setState('syncing')
    const body = JSON.stringify({ data: local, baseRev })
    const small = new Blob([body]).size <= KEEPALIVE_MAX
    const r = await this.call('PUT', '/save', body, { keepalive: keepalive && small, timeout: 20000 })
    if (r.ok) return this.inStep(r.data.rev, local.t)
    // someone else wrote first: look at their copy and decide again
    if (r.status === 409 && depth < 3) return this.reconcile(r.data, depth + 1)
    if (r.status === 401) return this.expire()
    if (r.status === 400 || r.status === 413) {
      this.error = errorOf(r)
      console.warn('[cloud] save refused:', this.error)
      return this.setState('error')
    }
    return this.failed(r)
  }

  inStep(rev, t) {
    this.setMeta(rev, t)
    this.retryMs = 0
    this.error = ''
    this.settle()
  }

  settle() {
    const dirty = this.dirty()
    this.setState(this.conflict ? 'conflict' : dirty ? 'pending' : 'idle')
    if (dirty && !this.conflict) this.schedule(Math.max(DEBOUNCE, this.lastPush + MIN_GAP - Date.now()))
  }

  // take the cloud copy as the local save
  adopt(remote) {
    try {
      const prev = localStorage.getItem(SAVE_KEY)
      if (prev) localStorage.setItem(PREV_KEY, prev)
      localStorage.setItem(SAVE_KEY, JSON.stringify(remote.data))
    } catch (e) { /* storage blocked */ }
    this.setMeta(Number(remote.rev) || 0, remote.data.t)
    this.retryMs = 0
    this.error = ''
    this.settle()
    // a game in progress is the other save: restart straight into this one
    if (this.game.state === 'play') this.restart()
  }

  restart() {
    this.frozen = true
    try { sessionStorage.setItem('cr3d-continue', '1') } catch (e) { /* fine: back to the menu then */ }
    setTimeout(() => location.reload(), 400)
  }

  ask(local, cloud) {
    return new Promise((resolve) => {
      this.conflict = { local, cloud, resolve: (pick) => { this.conflict = null; resolve(pick) } }
      this.setState('conflict')
      this.offer()
    })
  }

  offer() {
    const c = this.conflict
    if (!c || c.shown || !this.resolver) return
    c.shown = true
    // if the picker itself breaks, keep whichever save came further
    const fallback = () => (further(c.local, c.cloud) === c.cloud ? 'cloud' : 'local')
    Promise.resolve().then(() => this.resolver(c.local, c.cloud)).then((p) => c.resolve(p === 'cloud' || p === 'local' ? p : fallback()), () => c.resolve(fallback()))
  }

  // the UI's "which save do you keep?" dialog: (local, cloud) -> Promise<'local'|'cloud'>
  setResolver(fn) { this.resolver = fn; this.offer() }

  failed(r, fromSync = false) {
    if (fromSync) this.needSync = true
    this.error = errorOf(r)
    this.retryMs = Math.min(120000, this.retryMs ? this.retryMs * 2 : 5000)
    this.setState('retry')
    this.schedule(this.retryMs)
  }

  // ---- uploads --------------------------------------------------------------------------------------
  // Progress.save() calls this after writing localStorage
  saved() {
    if (!this.auth || this.frozen) return
    const now = Date.now()
    const urgent = now < this.urgentUntil
    if (urgent) this.urgentUntil = 0
    if (this.state === 'idle') this.setState('pending')
    this.schedule(urgent ? 0 : Math.max(DEBOUNCE, this.lastPush + MIN_GAP - now))
  }

  // upload as soon as possible ("Salvează" in the pause menu)
  flush() { if (this.auth) this.schedule(0) }

  schedule(delay) {
    const due = Date.now() + delay
    if (this.timer && this.due <= due) return
    clearTimeout(this.timer)
    this.due = due
    this.timer = setTimeout(() => { this.timer = null; this.tick() }, delay)
  }

  tick() {
    if (!this.auth) return
    if (this.needSync || !this.meta()) return this.sync()
    return this.push()
  }

  push() {
    return this.enqueue(async () => {
      if (!this.auth || this.conflict || this.frozen) return
      if (!this.dirty()) return this.settle()
      await this.upload(Progress.hasSave(), this.meta()?.rev ?? 0)
    })
  }

  // tab hidden or page closing: send what's pending now, with keepalive so it survives the unload
  flushOnHide() {
    if (!this.auth || this.conflict || this.frozen || this.busy || !this.dirty()) return
    const base = this.meta()?.rev
    if (base == null) return
    clearTimeout(this.timer)
    this.timer = null
    // not queued: the request must start inside this event, before the page goes away
    this.busy++
    const p = this.upload(Progress.hasSave(), base, 0, { keepalive: true }).catch(() => {}).finally(() => this.busy--)
    this.queue = this.queue.then(() => p)
  }

  // back on the tab: another device may have played meanwhile
  recheck() {
    if (!this.auth || this.frozen) return
    if (Date.now() - this.lastCheck > 60000) this.sync()
    else if (this.dirty()) this.schedule(DEBOUNCE)
  }
}
