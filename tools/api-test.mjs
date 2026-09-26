// Fast checks of the API handlers in Node (no browser): accounts, sessions, saves, limits, CORS.
// usage: node tools/api-test.mjs          handlers on PGlite (Postgres in WebAssembly, in memory)
//        node tools/api-test.mjs --neon   the same through @neondatabase/serverless, the production
//                                         driver, against a local stand-in for Neon's HTTP endpoint
//        TEST_DATABASE_URL=postgres://… node tools/api-test.mjs   a real Neon database (use a throwaway
//                                         branch: it creates the tables and test accounts, then deletes them)
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { neonConfig } from '@neondatabase/serverless'
import { loadRoutes, pgliteDb } from './api-dev.mjs'
import { setDb, neonDb, migrate, db } from '../api/_lib/db.js'
import { SCHEMA } from '../api/_lib/schema.js'
import { hashPassword, verifyPassword } from '../api/_lib/auth.js'

const NEON = process.argv.includes('--neon')
const REAL = process.env.TEST_DATABASE_URL
let failed = 0, passed = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info && !ok ? '  · ' + info : ''}`); if (ok) passed++; else failed++ }
const js = (x) => JSON.stringify(x)?.slice(0, 300)
// jsonb keeps its own key order, so compare with keys sorted
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))

// Neon's HTTP protocol: POST {query, params} or {queries: […]} -> rows of raw text + field type ids
async function neonStandIn(pg) {
  // every type (arrays too) left as Postgres' text, for the driver to parse, as Neon's endpoint does
  const oids = (await pg.query('SELECT oid::int AS oid FROM pg_type')).rows.map((r) => r.oid)
  const raw = Object.fromEntries(oids.map((oid) => [oid, (v) => v]))
  const run = async (q, tx) => {
    const r = await tx.query(q.query, q.params, { rowMode: 'array', parsers: raw })
    return { fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: r.rows, rowCount: r.rows.length, command: 'SELECT' }
  }
  const server = http.createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    const q = JSON.parse(body)
    try {
      const out = q.queries
        ? { results: await pg.transaction(async (tx) => { const rs = []; for (const x of q.queries) rs.push(await run(x, tx)); return rs }) }
        : await run(q, pg)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: e.message, code: e.code, detail: e.detail, severity: 'ERROR' }))
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}/sql`, close: () => new Promise((r) => server.close(r)) }
}

// ---- database -----------------------------------------------------------------------------------
let local = null, standIn = null, adapter
if (REAL) {
  adapter = neonDb(REAL)
  console.log('database: TEST_DATABASE_URL (real Neon)')
} else {
  const t0 = Date.now()
  local = await pgliteDb()
  if (NEON) {
    standIn = await neonStandIn(local.pg)
    neonConfig.fetchEndpoint = (host) => (host === 'db.invalid' ? 'http://127.0.0.1:9/sql' : standIn.url)
    adapter = neonDb('postgres://game:secret@neon-stand-in.local/neondb')
    console.log(`database: PGlite behind a Neon HTTP stand-in, via @neondatabase/serverless (${Date.now() - t0} ms to start)`)
  } else {
    adapter = local
    console.log(`database: PGlite in memory (${Date.now() - t0} ms to start)`)
  }
}
setDb(adapter)
const q = (text, params) => adapter.query(text, params)

const routes = await loadRoutes()
const BASE = 'https://game.example'
const TEST_DOMAIN = 'test.chisinau-rush.invalid'
const mail = (tag) => `${tag}-${randomBytes(4).toString('hex')}@${TEST_DOMAIN}`
let nextIp = 1
const freshIp = () => `203.0.113.${nextIp++}`

async function call(method, path, { body, raw, token, origin, xff = '192.0.2.1', type, headers = {} } = {}) {
  const h = new Headers(headers)
  if ((body !== undefined || raw !== undefined) && !h.has('content-type')) h.set('content-type', type || 'application/json')
  if (token) h.set('authorization', 'Bearer ' + token)
  if (origin) h.set('origin', origin)
  if (xff) h.set('x-forwarded-for', xff)
  const route = routes.get(path)
  const res = await route.fetch(new Request(BASE + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }))
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch (e) { json = { unparsed: text } }
  return { status: res.status, body: json, headers: res.headers }
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

// ---- schema -----------------------------------------------------------------------------------
{
  const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').replace(/\s*;\s*/g, ';').trim()
  const sql = await readFile(new URL('../api/_lib/schema.sql', import.meta.url), 'utf8')
  const fromFile = norm(sql).split(';').filter(Boolean)
  check('schema.sql matches schema.js', js(fromFile) === js(SCHEMA.map(norm)), `${fromFile.length} vs ${SCHEMA.length} statements`)
  const r = await call('GET', '/api/health')
  check('first request creates the tables; health says ok', r.status === 200 && r.body.ok && r.body.db, js(r))
  await Promise.all([migrate(adapter), migrate(adapter), migrate(adapter)])
  const t = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('users','sessions','saves','auth_attempts')`)
  check('migrations are idempotent (3 at once, 4 tables)', t.length === 4, js(t))
}

// ---- passwords ---------------------------------------------------------------------------------
{
  const h = await hashPassword('parola-lunga')
  const ok = await verifyPassword('parola-lunga', h)
  const bad = await verifyPassword('parola-lungă', h)
  const junk = await verifyPassword('parola-lunga', 'scrypt$1000$8$1$abc$def')
  check('scrypt hash format and verify', /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{86}==$/.test(h) && ok && !bad && !junk, h)
}

// ---- sign up ---------------------------------------------------------------------------------------
const emailA = mail('ana')
let tokenA, userA
{
  const xff = freshIp()
  let r = await call('POST', '/api/auth/signup', { body: { email: 'not-an-email', password: 'parola-lunga' }, xff })
  check('signup: bad email -> 400', r.status === 400 && /email/i.test(r.body.error), js(r))
  r = await call('POST', '/api/auth/signup', { body: { email: emailA, password: 'scurt' }, xff })
  check('signup: short password -> 400', r.status === 400 && /8 caractere/.test(r.body.error), js(r))
  r = await call('POST', '/api/auth/signup', { body: { email: emailA, password: 'x'.repeat(201) }, xff })
  check('signup: 201-char password -> 400', r.status === 400, js(r))
  r = await call('POST', '/api/auth/signup', { raw: 'email=a', type: 'application/x-www-form-urlencoded', xff })
  check('signup: not JSON -> 415', r.status === 415, js(r))
  r = await call('POST', '/api/auth/signup', { raw: '{nope', xff })
  check('signup: broken JSON -> 400', r.status === 400, js(r))

  r = await call('POST', '/api/auth/signup', { body: { email: `  ${emailA.toUpperCase()} `, password: 'parolă-șmecheră' }, xff })
  tokenA = r.body?.token
  userA = r.body?.user
  check('signup -> 201 with token and user', r.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(tokenA || '') && userA?.email === emailA && !!userA?.id && !isNaN(Date.parse(userA.created_at)), js(r))
  const [u] = await q('SELECT email, pass_hash FROM users WHERE id = $1', [userA.id])
  check('email stored trimmed + lowercase, password only as scrypt', u.email === emailA && u.pass_hash.startsWith('scrypt$16384$8$1$') && !u.pass_hash.includes('șmecheră'), js(u))
  const plain = await q('SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1', [tokenA])
  const hashed = await q('SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1', [sha256(tokenA)])
  check('session stored as sha256(token), never the token', plain[0].n === 0 && hashed[0].n === 1, js({ plain, hashed }))

  r = await call('POST', '/api/auth/signup', { body: { email: emailA.replace('ana', 'ANA'), password: 'alta-parola-lunga' }, xff })
  check('signup: same email (other case) -> 409', r.status === 409 && /Există deja un cont/.test(r.body.error), js(r))
}

// ---- log in ------------------------------------------------------------------------------------------
let tokenA2
{
  const xff = freshIp()
  let r = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'parola-gresita' }, xff })
  check('login: wrong password -> 401 generic message', r.status === 401 && r.body.error === 'Email sau parolă greșită.', js(r))
  r = await call('POST', '/api/auth/login', { body: { email: mail('nimeni'), password: 'parola-gresita' }, xff })
  check('login: unknown email -> same 401', r.status === 401 && r.body.error === 'Email sau parolă greșită.', js(r))
  r = await call('POST', '/api/auth/login', { body: { email: emailA.toUpperCase(), password: 'parolă-șmecheră'.normalize('NFD') }, xff })
  tokenA2 = r.body?.token
  check('login: any case, any unicode form -> 200 new token', r.status === 200 && tokenA2 && tokenA2 !== tokenA && r.body.user.id === userA.id, js(r))
  r = await call('GET', '/api/auth/login')
  check('GET on a POST route -> 405 with Allow', r.status === 405 && r.headers.get('allow') === 'POST, OPTIONS', js(r))
}

// ---- me / sessions ------------------------------------------------------------------------------
{
  let r = await call('GET', '/api/auth/me', { token: tokenA })
  check('me with token -> user', r.status === 200 && r.body.user.email === emailA, js(r))
  check('responses are JSON and never cached', /application\/json/.test(r.headers.get('content-type')) && r.headers.get('cache-control') === 'no-store', r.headers.get('cache-control'))
  r = await call('GET', '/api/auth/me')
  check('me without token -> 401', r.status === 401, js(r))
  r = await call('GET', '/api/auth/me', { token: randomBytes(32).toString('base64url') })
  check('me with an unknown token -> 401', r.status === 401 && /expirat/.test(r.body.error), js(r))

  const h = sha256(tokenA2)
  await q(`UPDATE sessions SET last_seen = now() - interval '2 days', expires_at = now() + interval '1 day' WHERE token_hash = $1`, [h])
  r = await call('GET', '/api/auth/me', { token: tokenA2 })
  const [s] = await q(`SELECT expires_at > now() + interval '59 days' AS extended, last_seen > now() - interval '1 minute' AS touched FROM sessions WHERE token_hash = $1`, [h])
  check('rolling expiry: a used session is extended to 60 days', r.status === 200 && s.extended && s.touched, js(s))
  await q(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1`, [h])
  r = await call('GET', '/api/auth/me', { token: tokenA2 })
  check('expired session -> 401', r.status === 401, js(r))
}

// ---- saves --------------------------------------------------------------------------------------
const save = (lei, extra = {}) => ({ v: 3, name: 'Ana', type: 'badanta', lei, xp: 120, rankIdx: 0, story: { done: ['sosire', 'paine'], current: null, chapter: 1 }, flags: { taxi: true }, t: Date.now(), ...extra })
{
  let r = await call('GET', '/api/save', { token: tokenA })
  check('GET save with nothing stored -> {data: null, rev: 0}', r.status === 200 && r.body.data === null && r.body.rev === 0 && r.body.history.length === 0, js(r))
  r = await call('GET', '/api/save')
  check('GET save without token -> 401', r.status === 401, js(r))

  const first = save(100)
  r = await call('PUT', '/api/save', { token: tokenA, body: { data: first, baseRev: 0 } })
  check('first PUT (baseRev 0) -> rev 1', r.status === 200 && r.body.rev === 1 && !isNaN(Date.parse(r.body.updated_at)), js(r))
  r = await call('GET', '/api/save', { token: tokenA })
  check('GET returns what was stored', r.status === 200 && r.body.rev === 1 && canon(r.body.data) === canon(first), js(r))

  r = await call('PUT', '/api/save', { token: tokenA, body: { data: save(50), baseRev: 0 } })
  check('stale baseRev -> 409 with the server copy', r.status === 409 && r.body.rev === 1 && r.body.data?.lei === 100 && /mai nouă/.test(r.body.error), js(r))
  r = await call('PUT', '/api/save', { token: tokenA, body: { data: save(200), baseRev: 1 } })
  check('matching baseRev -> rev 2', r.status === 200 && r.body.rev === 2, js(r))

  // several devices writing on the same base: exactly one wins, the rest get the winner back
  const racers = await Promise.all([1, 2, 3, 4, 5].map((i) => call('PUT', '/api/save', { token: tokenA, body: { data: save(1000 + i), baseRev: 2 } })))
  const wins = racers.filter((x) => x.status === 200), lost = racers.filter((x) => x.status === 409)
  const [row] = await q('SELECT rev, (data->>\'lei\')::int AS lei FROM saves WHERE user_id = $1', [userA.id])
  check('5 concurrent PUTs on one base: one 200, four 409', wins.length === 1 && lost.length === 4 && row.rev === 3 && lost.every((x) => x.body.rev === 3), js(racers.map((x) => x.status)))

  for (const [name, body] of [
    ['an array', { data: [], baseRev: 3 }],
    ['no v', { data: { lei: 5, t: 1 }, baseRev: 3 }],
    ['v as text', { data: { v: '3', t: 1 }, baseRev: 3 }],
    ['no save stamp (t)', { data: { v: 3 }, baseRev: 3 }],
    ['a fractional t', { data: { v: 3, t: 1.5 }, baseRev: 3 }],
    ['no baseRev', { data: save(1) }],
    ['negative baseRev', { data: save(1), baseRev: -1 }],
    ['fractional baseRev', { data: save(1), baseRev: 1.5 }],
    ['a NUL character', { data: save(1, { name: 'A\u0000' }), baseRev: 3 }],
    ['a lone surrogate', { data: save(1, { name: 'A\ud800' }), baseRev: 3 }],
  ]) {
    r = await call('PUT', '/api/save', { token: tokenA, body })
    check(`PUT with ${name} -> 400`, r.status === 400, js(r))
  }
  r = await call('PUT', '/api/save', { token: tokenA, body: { data: save(1, { pad: 'x'.repeat(300 * 1024) }), baseRev: 3 } })
  check('PUT over 256 KB -> 413', r.status === 413, js(r))
  const [after] = await q('SELECT rev FROM saves WHERE user_id = $1', [userA.id])
  check('rejected writes left the save alone', after.rev === 3, js(after))

  // history: the stamps of the saves that were replaced, newest first, at most 20
  r = await call('GET', '/api/save', { token: tokenA })
  const winner = r.body.data.t
  check('GET lists the replaced saves (history)', r.body.history.length === 2 && r.body.history[1] === first.t && r.body.history.every(Number.isSafeInteger), js(r.body.history))
  let rev = r.body.rev
  for (let i = 1; i <= 22; i++) rev = (await call('PUT', '/api/save', { token: tokenA, body: { data: save(i, { t: 1_700_000_000_000 + i }), baseRev: rev } })).body.rev
  r = await call('GET', '/api/save', { token: tokenA })
  check('history keeps the last 20, newest first', r.body.rev === 25 && r.body.data.t === 1_700_000_000_022 && r.body.history.length === 20 && r.body.history[0] === 1_700_000_000_021 && r.body.history[19] === 1_700_000_000_002 && !r.body.history.includes(winner), js(r.body.history))
  r = await call('PUT', '/api/save', { token: tokenA, body: { data: save(1), baseRev: 3 } })
  check('a 409 carries the history too', r.status === 409 && r.body.history?.length === 20, js(r.body?.history?.length))
}

// ---- log out ----------------------------------------------------------------------------------
{
  const other = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'parolă-șmecheră' }, xff: freshIp() })
  let r = await call('POST', '/api/auth/logout', { token: tokenA })
  check('logout -> 200', r.status === 200 && r.body.ok, js(r))
  r = await call('GET', '/api/save', { token: tokenA })
  check('the logged-out token no longer works', r.status === 401, js(r))
  r = await call('GET', '/api/save', { token: other.body.token })
  check('other sessions of the account keep working', r.status === 200 && r.body.rev === 25, js(r))
  r = await call('POST', '/api/auth/logout')
  check('logout without a token is harmless', r.status === 200, js(r))
}

// ---- rate limits -----------------------------------------------------------------------------------
{
  const email = mail('tinta'), xff = freshIp()
  await call('POST', '/api/auth/signup', { body: { email, password: 'parola-corecta' }, xff })
  const codes = []
  for (let i = 0; i < 8; i++) codes.push((await call('POST', '/api/auth/login', { body: { email, password: 'gresit-' + i }, xff: freshIp() })).status)
  let r = await call('POST', '/api/auth/login', { body: { email, password: 'parola-corecta' }, xff: freshIp() })
  check('8 wrong passwords for an email -> 429, even with the right one', codes.every((c) => c === 401) && r.status === 429 && /Prea multe încercări/.test(r.body.error) && r.headers.get('retry-after') === '900', js({ codes, r }))

  const shared = freshIp()
  const perIp = []
  for (let i = 0; i < 20; i++) perIp.push((await call('POST', '/api/auth/login', { body: { email: mail('x' + i), password: 'gresit-gresit' }, xff: shared })).status)
  r = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'parolă-șmecheră' }, xff: shared })
  const elsewhere = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'parolă-șmecheră' }, xff: freshIp() })
  check('20 failures from one address -> 429 there, fine elsewhere', perIp.every((c) => c === 401) && r.status === 429 && elsewhere.status === 200, js({ perIp, r: r.status, elsewhere: elsewhere.status }))

  const net = freshIp()
  const made = []
  for (let i = 0; i < 5; i++) made.push((await call('POST', '/api/auth/signup', { body: { email: mail('nou' + i), password: 'parola-lunga' }, xff: net })).status)
  r = await call('POST', '/api/auth/signup', { body: { email: mail('nou5'), password: 'parola-lunga' }, xff: net })
  const other = await call('POST', '/api/auth/signup', { body: { email: mail('nou6'), password: 'parola-lunga' }, xff: freshIp() })
  check('5 sign-ups per address per hour, the 6th -> 429', made.every((c) => c === 201) && r.status === 429 && /o oră/.test(r.body.error) && other.status === 201, js({ made, r: r.status, other: other.status }))
}

// ---- CORS ---------------------------------------------------------------------------------------
{
  const pre = (origin) => call('OPTIONS', '/api/save', { origin, headers: { 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization, content-type' } })
  let r = await pre('https://dancolta.github.io')
  check('preflight from GitHub Pages -> 204 with CORS headers', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://dancolta.github.io' && /PUT/.test(r.headers.get('access-control-allow-methods')) && /Authorization/i.test(r.headers.get('access-control-allow-headers')), js([...r.headers]))
  r = await pre('https://evil.example')
  check('preflight from another site -> 403 without CORS headers', r.status === 403 && !r.headers.get('access-control-allow-origin'), js(r))
  r = await call('POST', '/api/auth/login', { origin: 'https://evil.example', body: { email: emailA, password: 'parolă-șmecheră' }, xff: freshIp() })
  check('actual request from another site -> 403', r.status === 403, js(r))
  r = await call('GET', '/api/auth/me', { origin: BASE, token: tokenA })
  check('same origin needs no CORS', r.status === 401 && !r.headers.get('access-control-allow-origin'), js(r))
  r = await call('GET', '/api/auth/me', { origin: 'https://chisinau-rush.vercel.app', headers: { 'x-forwarded-host': 'chisinau-rush.vercel.app' }, token: tokenA })
  check('same origin by the forwarded host (whatever request.url says)', r.status === 401, js(r))
  r = await call('GET', '/api/health', { origin: 'http://localhost:5173' })
  check('local dev origin allowed by default', r.status === 200 && r.headers.get('access-control-allow-origin') === 'http://localhost:5173', js(r))
  process.env.ALLOWED_ORIGINS = 'https://joc.example, https://alt.example/'
  const a = await pre('https://alt.example'), b = await pre('https://dancolta.github.io')
  process.env.ALLOWED_ORIGINS = '*'
  const c = await pre('https://oricine.example')
  delete process.env.ALLOWED_ORIGINS
  check('ALLOWED_ORIGINS replaces the defaults ("*" allows all)', a.status === 204 && b.status === 403 && c.status === 204, js([a.status, b.status, c.status]))
}

// ---- deleting an account takes its sessions and save along ----------------------------------------
{
  await q('DELETE FROM users WHERE id = $1', [userA.id])
  const [n] = await q('SELECT (SELECT count(*) FROM sessions WHERE user_id = $1)::int AS s, (SELECT count(*) FROM saves WHERE user_id = $1)::int AS v', [userA.id])
  check('deleting a user cascades to sessions and saves', n.s === 0 && n.v === 0, js(n))
}

// ---- no database --------------------------------------------------------------------------------
{
  const saved = { DATABASE_URL: process.env.DATABASE_URL, POSTGRES_URL: process.env.POSTGRES_URL }
  delete process.env.DATABASE_URL
  delete process.env.POSTGRES_URL
  setDb(null)
  let r = await call('GET', '/api/save', { token: tokenA })
  check('no DATABASE_URL -> 503 with a clear message', r.status === 503 && /DATABASE_URL/.test(r.body.error), js(r))
  setDb(neonDb('postgres://game:secret@db.invalid/neondb'))
  const t0 = Date.now()
  r = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'parolă-șmecheră' } })
  check('database unreachable -> 503, not a crash', r.status === 503 && /nu răspunde/.test(r.body.error), js(r) + ` in ${Date.now() - t0} ms`)
  let thrown = null
  try { await db() } catch (e) { thrown = e }
  check('…and the next request tries again', thrown?.status === 503, String(thrown))
  Object.assign(process.env, Object.fromEntries(Object.entries(saved).filter(([, v]) => v)))
  setDb(adapter)
}

if (REAL) await q(`DELETE FROM users WHERE email LIKE $1`, ['%@' + TEST_DOMAIN])
await standIn?.close()
await local?.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
