// GET /api/auth/me (Authorization: Bearer …) -> 200 {user}
import { endpoint } from '../_lib/http.js'
import { db } from '../_lib/db.js'
import { requireUser, userOut } from '../_lib/auth.js'

export default endpoint({
  async GET(request) {
    const user = await requireUser(await db(), request)
    return { status: 200, body: { user: userOut(user) } }
  },
})
