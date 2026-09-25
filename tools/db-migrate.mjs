// Creates the account tables in the Neon database from DATABASE_URL. Safe to run again.
// The API also does this by itself on its first request, so this is for checking a new database.
// usage: DATABASE_URL=postgres://… npm run db:migrate   (or put it in .env.local: `vercel env pull .env.local`)
import { neonDb, migrate } from '../api/_lib/db.js'

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  try { process.loadEnvFile('.env.local') } catch (e) { /* no file: fine */ }
}
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL is not set. Copy it from Vercel (Storage → your Neon database → .env.local) or the Neon console.')
  process.exit(1)
}
const d = neonDb(url)
try {
  await migrate(d)
  const rows = await d.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name IN ('users', 'sessions', 'saves', 'auth_attempts') ORDER BY table_name`)
  console.log('tables ready:', rows.map((r) => r.table_name).join(', '))
} catch (e) {
  console.error('migration failed:', e.message)
  process.exit(1)
}
