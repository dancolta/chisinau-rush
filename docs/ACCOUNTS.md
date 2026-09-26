# Accounts and cloud saves

Players can make an optional account (email + password) from **Cont** on the main menu or the
pause menu. With an account the save is mirrored to a Postgres database (Neon), so the game
continues on any device. Without one, nothing changes: the save stays in the browser.

The game is still a static Vite build. The account API is a handful of Node functions in `/api`
that Vercel deploys next to it, talking to Neon through `DATABASE_URL`.

## Go live on Vercel + Neon (about 10 minutes)

1. **Import the repo into Vercel.** [vercel.com/new](https://vercel.com/new) → *Import Git Repository*
   → `dancolta/chisinau-rush` → leave the defaults (`vercel.json` already sets the Vite preset,
   `npm run build` and `dist`) → **Deploy**. The game works right away; accounts answer
   "not configured yet" until step 2.
2. **Create the database.** In the Vercel project: **Storage** → **Create Database** → **Neon**
   (Serverless Postgres) → region **US East (iad1 / AWS us-east-1)**, the region the API runs in
   (`vercel.json`) → connect it to the project for all environments. This sets `DATABASE_URL`.
   *Or* create a project on [neon.tech](https://neon.tech) (region AWS US East 1, where the live database is),
   copy its connection string (the pooled one is fine) and add it in Vercel → Project →
   **Settings** → **Environment Variables** as `DATABASE_URL` (Production and Preview).
3. **Redeploy** (Deployments → ⋯ → **Redeploy**) so the functions pick up `DATABASE_URL`.
4. **Check** `https://<your-project>.vercel.app/api/health`. It should say `{"ok":true,"db":true}`.
   The tables are created by the first request; nothing to run by hand.
5. **Play** at `https://<your-project>.vercel.app`: main menu → **Cont** → **Cont nou**.

Optional: `npm run db:migrate` creates the tables from your machine (it reads `DATABASE_URL`, or
`.env.local` from `vercel env pull .env.local`), and `api/_lib/schema.sql` can be pasted into the
Neon SQL editor. Both are the same idempotent statements the API runs.

Good to know:
- The API runs in US East (`"regions": ["iad1"]` in `vercel.json`), next to the Neon database (AWS us-east-1): one request makes several queries, so the API sits by the database rather than by the players. If the
  database ends up in another region it still works, just slower: move one of them.
- Preview deployments (every branch / PR) get the same `DATABASE_URL`, so they share the real
  accounts unless you turn on the Neon integration's option to create a database branch per preview.

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Needed | What |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string (set by the Neon integration). `POSTGRES_URL` works too. |
| `ALLOWED_ORIGINS` | no | Comma list of *other* sites allowed to call the API from a browser. Default: `https://dancolta.github.io` and the local dev ports. The Vercel site itself is always allowed. Setting it replaces the default list. |
| `RATE_LOGIN_PER_EMAIL` | no | Failed logins per email per 15 min before a 429 (default 8). |
| `RATE_LOGIN_PER_IP` | no | Failed logins per address per 15 min (default 20). |
| `RATE_SIGNUP_PER_IP` | no | New accounts per address per hour (default 5). Raise it for a school or a LAN party. |

## Keeping the GitHub Pages version too

GitHub Pages can't run the API. The Pages build hides **Cont** and plays exactly as before,
unless it is built with `VITE_API_URL` pointing at the Vercel API:

1. GitHub → the repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** →
   **New repository variable**: `VITE_API_URL` = `https://<your-project>.vercel.app/api`
2. Re-run the *Deploy to GitHub Pages* workflow (or push to `main`).
3. `https://dancolta.github.io` is allowed by default. If you set `ALLOWED_ORIGINS` on Vercel,
   include it there.

Saves in the browser belong to each site separately: a guest save made on github.io stays on
github.io. Logging in on both is what carries the progress across.

## Local development

```bash
npm run api     # the API on http://127.0.0.1:8787 with PGlite (Postgres in WebAssembly) in .data/
npm run dev     # the game; Vite sends /api to the API above
```

`DATABASE_URL=… npm run api` runs the local API against a real Neon database instead (careful,
that's real data). Tests:

```bash
npm run test:api       # the handlers in Node: on PGlite, then through the Neon driver (~1 min)
npm run test:account   # headless Chromium, several "devices": sign-up, sync, conflicts, logout (~10 min)
```

`TEST_DATABASE_URL=… node tools/api-test.mjs` runs the handler checks against a real Neon
database; use a throwaway Neon branch (it creates the tables and test accounts, then deletes the accounts).

## How it works

**API** (`/api`, JSON, `Authorization: Bearer <token>`):

| | |
|---|---|
| `POST /api/auth/signup` `{email, password}` | 201 `{token, user}` · 409 email taken · 429 too many sign-ups |
| `POST /api/auth/login` `{email, password}` | 200 `{token, user}` · 401 wrong email or password · 429 too many failures |
| `POST /api/auth/logout` | ends that session |
| `GET /api/auth/me` | `{user}` |
| `GET /api/save` | `{data, rev, updated_at, history}`, or `{data: null, rev: 0}` |
| `PUT /api/save` `{data, baseRev}` | `{rev}` · 409 `{data, rev, history}` when the cloud moved on · 413 over 256 KB |
| `GET /api/health` | `{ok, db}` |

- Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt), stored as `scrypt$N$r$p$salt$hash`.
- Sessions: a random 32-byte token kept by the browser; the database stores only its SHA-256.
  60 days, extended while in use. No cookies, so no CSRF.
- Saves: one row per player, with a revision number. A write only lands on the revision it was
  based on; otherwise the client gets the server copy back and decides.
- Rate limits live in the `auth_attempts` table (hashed keys, cleaned after a day).

**Sync in the game** (`src/net/Cloud.js`): the game keeps saving to `localStorage` as always; for a
logged-in player each save is also uploaded (≈5 s later, at most every 20 s, at once after a story
mission, and with `keepalive` when the tab is hidden or closed). On login or when the cloud moved
on: an empty side takes the other; if only one side changed since the last sync it wins; if both
changed the player picks from a summary of each (missions, lei, rank, last played), with the one
that came further preselected. Nothing with more progress is overwritten silently.

**Data**: `users`, `sessions`, `saves`, `auth_attempts` (see `api/_lib/schema.sql`). Deleting an
account: `DELETE FROM users WHERE email = '…';` (its sessions and save go with it).

**Not in v1**: password reset and email verification (there's no email sending), and deleting an
account from inside the game.
