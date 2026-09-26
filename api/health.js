// GET /api/health -> {ok, db}: a quick check after deploying that DATABASE_URL works
import { endpoint, HttpError } from './_lib/http.js'
import { db } from './_lib/db.js'

export default endpoint({
  async GET() {
    try {
      const d = await db()
      await d.query('SELECT 1')
      return { status: 200, body: { ok: true, db: true } }
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('[health]', e)
      return { status: 503, body: { ok: false, db: false, error: e instanceof HttpError ? e.message : 'Baza de date nu răspunde.' } }
    }
  },
})
