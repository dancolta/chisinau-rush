// Accounts: email + password hashed with scrypt. A session is a random bearer token the client
// keeps; the database stores only its SHA-256, so a leaked table can't be replayed. Failed logins
// and new accounts are counted in auth_attempts (per email / per IP) to slow down guessing.
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { HttpError, iso } from './http.js'

export const SESSION_TTL = '60 days'
const SCRYPT = { N: 16384, r: 8, p: 1 }
const KEYLEN = 64
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// per deployment overrides (env), e.g. for a school where everyone shares one address
const limits = () => ({
  loginEmail: +process.env.RATE_LOGIN_PER_EMAIL || 8,   // failed logins per email, 15 min
  loginIp: +process.env.RATE_LOGIN_PER_IP || 20,        // failed logins per IP, 15 min
  signupIp: +process.env.RATE_SIGNUP_PER_IP || 5,       // new accounts per IP, 1 hour
})

// ---- input ------------------------------------------------------------------------------------
export function credentials(body, { login = false } = {}) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  // one Unicode form, so "ș" typed on a phone and on a laptop hash the same
  const password = typeof body?.password === 'string' ? body.password.normalize('NFC') : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'Scrie un email valid.')
  if (login && !password) throw new HttpError(400, 'Scrie parola.')
  if (!login && password.length < 8) throw new HttpError(400, 'Parola trebuie să aibă cel puțin 8 caractere.')
  if (password.length > 200) throw new HttpError(400, 'Parola e prea lungă (maximum 200 de caractere).')
  return { email, password }
}

// ---- passwords: scrypt$N$r$p$salt$hash (base64) -------------------------------------------------
function derive(password, salt, { N, r, p }, keylen) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key)))
  })
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, SCRYPT, KEYLEN)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored || '').split('$')
  const N = +n, R = +r, P = +p
  const sane = alg === 'scrypt' && salt && hash && N >= 1024 && N <= 1 << 20 && (N & (N - 1)) === 0 && R >= 1 && R <= 32 && P >= 1 && P <= 16
  if (!sane) return false
  const expected = Buffer.from(hash, 'base64')
  if (expected.length < 16) return false
  const key = await derive(password, Buffer.from(salt, 'base64'), { N, r: R, p: P }, expected.length)
  return timingSafeEqual(key, expected)
}

// checked against when the email has no account, so "no such user" takes as long as "wrong password"
let dummy = null
export const dummyHash = () => (dummy ||= hashPassword(randomBytes(12).toString('base64')))

// ---- sessions ---------------------------------------------------------------------------------
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

export async function createSession(d, userId) {
  const token = newToken()
  await d.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)', [tokenHash(token), userId, SESSION_TTL])
  return token
}

export function bearer(request) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec((request.headers.get('authorization') || '').trim())
  return m ? m[1] : null
}

export async function requireUser(d, request) {
  const token = bearer(request)
  if (!token) throw new HttpError(401, 'Nu ești conectat.')
  const h = tokenHash(token)
  const [s] = await d.query(
    `SELECT u.id, u.email, u.created_at, s.last_seen < now() - interval '1 day' AS stale
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [h])
  if (!s) throw new HttpError(401, 'Sesiunea a expirat. Intră din nou în cont.')
  // rolling expiry: a session in use keeps living, touched at most once a day
  if (s.stale) await d.query('UPDATE sessions SET last_seen = now(), expires_at = now() + $2::interval WHERE token_hash = $1', [h, SESSION_TTL])
  return s
}

export const userOut = (u) => ({ id: u.id, email: u.email, created_at: iso(u.created_at) })

// ---- rate limits --------------------------------------------------------------------------------
// emails and addresses are stored hashed: the table only needs to count them
const keyOf = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32)

async function record(d, rows) {
  const values = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
  await d.query(`INSERT INTO auth_attempts (kind, key) VALUES ${values}`, rows.flatMap(([kind, key]) => [kind, keyOf(key)]))
  // housekeeping now and then: old attempts and dead sessions
  if (Math.random() < 0.05) {
    await d.transaction([
      [`DELETE FROM auth_attempts WHERE created_at < now() - interval '1 day'`],
      ['DELETE FROM sessions WHERE expires_at < now()'],
    ]).catch((e) => console.warn('[auth] cleanup', e.message))
  }
}

export async function loginGate(d, email, ip) {
  const { loginEmail, loginIp } = limits()
  const [r] = await d.query(
    `SELECT count(*) FILTER (WHERE kind = 'login_email')::int AS by_email,
            count(*) FILTER (WHERE kind = 'login_ip')::int AS by_ip
       FROM auth_attempts
      WHERE created_at > now() - interval '15 minutes'
        AND ((kind = 'login_email' AND key = $1) OR (kind = 'login_ip' AND key = $2))`, [keyOf(email), keyOf(ip)])
  if (r.by_email >= loginEmail || r.by_ip >= loginIp) {
    throw new HttpError(429, 'Prea multe încercări greșite. Mai încearcă peste un sfert de oră.', null, { 'Retry-After': 900 })
  }
}

export const loginFailed = (d, email, ip) => record(d, [['login_email', email], ['login_ip', ip]])

export async function signupGate(d, ip) {
  const [r] = await d.query(
    `SELECT count(*)::int AS n FROM auth_attempts
      WHERE kind = 'signup_ip' AND key = $1 AND created_at > now() - interval '1 hour'`, [keyOf(ip)])
  if (r.n >= limits().signupIp) {
    throw new HttpError(429, 'Prea multe conturi noi de pe aceeași rețea. Mai încearcă peste o oră.', null, { 'Retry-After': 3600 })
  }
  await record(d, [['signup_ip', ip]])
}
