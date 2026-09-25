// GET /api/save -> {data, rev, updated_at, history} ({data: null, rev: 0} when there's nothing yet)
// PUT /api/save {data, baseRev} -> {rev, updated_at}
//   Optimistic concurrency: the write only lands if baseRev is the revision on the server;
//   otherwise 409 with the server's copy, and the client decides (it never overwrites blindly).
//   history lists the stamps (data.t) of the saves this one replaced: a device whose last save is
//   in there knows the cloud copy was built on top of it (every later writer had to see it first).
import { endpoint, readJson, iso, HttpError } from './_lib/http.js'
import { db } from './_lib/db.js'
import { requireUser } from './_lib/auth.js'

const MAX_SAVE = 256 * 1024

const current = async (d, userId) => {
  const [row] = await d.query('SELECT data, rev, history, updated_at FROM saves WHERE user_id = $1', [userId])
  if (!row) return { data: null, rev: 0, updated_at: null, history: [] }
  return { data: row.data, rev: Number(row.rev), updated_at: iso(row.updated_at), history: (row.history || []).map(Number) }
}

export default endpoint({
  async GET(request) {
    const d = await db()
    const user = await requireUser(d, request)
    return { status: 200, body: await current(d, user.id) }
  },

  async PUT(request) {
    const d = await db()
    const user = await requireUser(d, request)
    const { data, baseRev } = (await readJson(request, MAX_SAVE + 1024)) || {}
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.v !== 'number' || !Number.isSafeInteger(data.t)) {
      throw new HttpError(400, 'Asta nu arată a salvare de Chișinău Rush.')
    }
    if (!Number.isInteger(baseRev) || baseRev < 0) throw new HttpError(400, 'Lipsește revizia salvării (baseRev).')
    const json = JSON.stringify(data)
    if (Buffer.byteLength(json) > MAX_SAVE) throw new HttpError(413, 'Salvarea e prea mare.')
    // Postgres jsonb refuses NUL characters
    if (json.includes('\\u0000')) throw new HttpError(400, 'Salvarea conține caractere nepermise.')
    let row
    try {
      [row] = await d.query(
        `INSERT INTO saves (user_id, data, rev, updated_at) VALUES ($1, $2::text::jsonb, 1, now())
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, rev = saves.rev + 1, updated_at = now(),
           history = (ARRAY[(saves.data->>'t')::bigint] || saves.history)[1:20]
           WHERE saves.rev = $3
         RETURNING rev, updated_at`,
        [user.id, json, baseRev])
    } catch (e) {
      // class 22 = data exception (e.g. a broken unicode escape): the save's fault, not ours
      if (String(e.code || '').startsWith('22')) throw new HttpError(400, 'Salvarea conține caractere nepermise.')
      throw e
    }
    if (row) return { status: 200, body: { rev: Number(row.rev), updated_at: iso(row.updated_at) } }
    throw new HttpError(409, 'În cloud e o salvare mai nouă.', await current(d, user.id))
  },
})
