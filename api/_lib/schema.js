// The account tables. Every statement is idempotent: they run on the first request after each
// cold start (see db.js) and from `npm run db:migrate`. api/_lib/schema.sql is the same thing
// for psql / the Neon SQL editor; tools/api-test.mjs fails if the two drift apart.
// gen_random_uuid() is built into Postgres 13+ (Neon runs 14-17), no extension needed.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  pass_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS saves (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  rev integer NOT NULL DEFAULT 1,
  history bigint[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS auth_attempts_lookup_idx ON auth_attempts (kind, key, created_at)`,
]
