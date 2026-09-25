-- Chișinău Rush accounts and cloud saves (Postgres 13+, e.g. Neon).
-- Idempotent: the API runs these on its first request after a cold start, `npm run db:migrate`
-- runs them on demand, and you can paste them into the Neon SQL editor. Same statements as schema.js.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  pass_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- history: the save stamps (data.t) of the previous saves, newest first, at most 20
CREATE TABLE IF NOT EXISTS saves (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  rev integer NOT NULL DEFAULT 1,
  history bigint[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_attempts_lookup_idx ON auth_attempts (kind, key, created_at);
