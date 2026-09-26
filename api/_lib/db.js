// The database behind the API, as a tiny adapter so the same handlers run everywhere:
//   query(text, params) -> rows[]              one parameterised statement
//   transaction([[text, params], …]) -> rows[][]   several, atomically, in one round trip
// Production uses Neon's HTTP driver with DATABASE_URL (set by the Neon ↔ Vercel integration);
// tools/api-dev.mjs and the tests plug in PGlite (Postgres compiled to WebAssembly) with setDb().
import { neon } from '@neondatabase/serverless'
import { HttpError } from './http.js'
import { SCHEMA } from './schema.js'

const TIMEOUT_MS = 10000
const MIGRATION_LOCK = 7727001   // any constant: serialises cold starts creating the tables at once

let current = null
let ready = null

const unavailable = () => new HttpError(503, 'Baza de date nu răspunde acum. Mai încearcă puțin mai târziu.')

export function neonDb(url) {
  const sql = neon(url)
  // a fresh timeout per request (an AbortSignal can only fire once)
  const opts = () => ({ fetchOptions: { signal: AbortSignal.timeout(TIMEOUT_MS) } })
  // no SQLSTATE code means the database was never reached (network, timeout, Neon waking up)
  const wrap = (e) => { throw e && e.code ? e : Object.assign(unavailable(), { cause: e }) }
  return {
    query: (text, params = []) => sql.query(text, params, opts()).catch(wrap),
    transaction: (list) => sql.transaction(list.map(([text, params = []]) => sql.query(text, params)), opts()).catch(wrap),
  }
}

export function setDb(adapter) {
  current = adapter
  ready = null
}

// idempotent CREATE … IF NOT EXISTS, under an advisory lock so two cold starts can't race
export function migrate(d) {
  return d.transaction([[`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`], ...SCHEMA.map((s) => [s])])
}

// the adapter, with the tables in place (created by the first request of each cold start)
export async function db() {
  if (!current) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (!url) throw new HttpError(503, 'Salvările în cloud nu sunt pornite încă pe server (lipsește DATABASE_URL).')
    try {
      current = neonDb(url)
    } catch (e) {
      console.error('[db] DATABASE_URL is not a postgres:// connection string')
      throw new HttpError(503, 'Salvările în cloud nu sunt configurate corect pe server.')
    }
  }
  const d = current
  if (!ready) ready = migrate(d).catch((e) => { ready = null; throw e })
  try {
    await ready
  } catch (e) {
    console.error('[db] creating the tables failed:', e.cause?.message || e.message)
    throw e instanceof HttpError ? e : unavailable()
  }
  return d
}
