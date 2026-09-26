// POST /api/auth/logout (Authorization: Bearer …) -> 200 {ok}; ends that session only
import { endpoint } from '../_lib/http.js'
import { db } from '../_lib/db.js'
import { bearer, tokenHash } from '../_lib/auth.js'

export default endpoint({
  async POST(request) {
    const token = bearer(request)
    if (token) {
      const d = await db()
      await d.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
    }
    return { status: 200, body: { ok: true } }
  },
})
