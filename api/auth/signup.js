// POST /api/auth/signup {email, password} -> 201 {token, user}
import { endpoint, readJson, clientIp, HttpError } from '../_lib/http.js'
import { db } from '../_lib/db.js'
import { credentials, hashPassword, newToken, tokenHash, signupGate, userOut, SESSION_TTL } from '../_lib/auth.js'

export default endpoint({
  async POST(request) {
    const { email, password } = credentials(await readJson(request))
    const d = await db()
    await signupGate(d, clientIp(request))
    const token = newToken()
    // the account and its first session in one statement: both or neither
    const [user] = await d.query(
      `WITH u AS (
         INSERT INTO users (email, pass_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, created_at
       ), s AS (
         INSERT INTO sessions (token_hash, user_id, expires_at)
         SELECT $3, id, now() + $4::interval FROM u
       )
       SELECT id, email, created_at FROM u`,
      [email, await hashPassword(password), tokenHash(token), SESSION_TTL])
    if (!user) throw new HttpError(409, 'Există deja un cont cu emailul ăsta. Intră în cont cu parola ta.')
    return { status: 201, body: { token, user: userOut(user) } }
  },
})
