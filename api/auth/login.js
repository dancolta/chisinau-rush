// POST /api/auth/login {email, password} -> 200 {token, user}
import { endpoint, readJson, clientIp, HttpError } from '../_lib/http.js'
import { db } from '../_lib/db.js'
import { credentials, verifyPassword, dummyHash, createSession, loginGate, loginFailed, userOut } from '../_lib/auth.js'

export default endpoint({
  async POST(request) {
    const { email, password } = credentials(await readJson(request), { login: true })
    const d = await db()
    const ip = clientIp(request)
    await loginGate(d, email, ip)
    const [user] = await d.query('SELECT id, email, pass_hash, created_at FROM users WHERE email = $1', [email])
    const ok = await verifyPassword(password, user ? user.pass_hash : await dummyHash())
    if (!user || !ok) {
      await loginFailed(d, email, ip)
      // same answer whether the email exists or not
      throw new HttpError(401, 'Email sau parolă greșită.')
    }
    const token = await createSession(d, user.id)
    return { status: 200, body: { token, user: userOut(user) } }
  },
})
