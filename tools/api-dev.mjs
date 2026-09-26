// Local API server: serves the /api functions (the same files Vercel deploys) on plain Node.
// The database is PGlite (Postgres compiled to WebAssembly, kept in .data/pglite) unless
// DATABASE_URL is set, in which case it talks to that Neon database like production does.
// `npm run dev` proxies /api here (vite.config.js).
// usage: node tools/api-dev.mjs [--port 8787] [--memory]
import http from 'node:http'
import { readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { setDb, neonDb } from '../api/_lib/db.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Vercel's routing: api/auth/login.js -> /api/auth/login; anything starting with _ or . is private
export async function loadRoutes(dir = path.join(ROOT, 'api')) {
  const routes = new Map()
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else if (/\.(m?js)$/.test(e.name)) {
        const rel = path.relative(ROOT, full).split(path.sep).join('/').replace(/\.m?js$/, '').replace(/\/index$/, '')
        routes.set('/' + rel, (await import(pathToFileURL(full).href)).default)
      }
    }
  }
  await walk(dir)
  return routes
}

// PGlite behind the same adapter interface as production (see api/_lib/db.js)
export async function pgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(dataDir)
  await pg.waitReady
  return {
    pg,
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    transaction: (list) => pg.transaction(async (tx) => {
      const out = []
      for (const [text, params = []] of list) out.push((await tx.query(text, params)).rows)
      return out
    }),
    close: () => pg.close(),
  }
}

// Node request -> Web Request -> handler -> Node response
export async function startApi({ port = 8787, host = '127.0.0.1', adapter = null, quiet = false } = {}) {
  if (adapter) setDb(adapter)
  const routes = await loadRoutes()
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      // what Vercel adds in production
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '')
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      const request = new Request(url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' })
      const route = routes.get(url.pathname.replace(/\/+$/, ''))
      const response = route
        ? await route.fetch(request)
        : new Response(JSON.stringify({ error: 'Nu există.' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
      if (!quiet) console.log(`${req.method} ${url.pathname} ${response.status}`)
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end('{"error":"api-dev crashed"}')
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve) })
  const actual = server.address().port
  return { url: `http://${host}:${actual}`, port: actual, routes, server, close: () => new Promise((r) => server.close(r)) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
  const port = +(arg('--port', process.env.API_PORT || 8787))
  let adapter, label
  if (process.env.DATABASE_URL) {
    adapter = neonDb(process.env.DATABASE_URL)
    label = 'DATABASE_URL (Neon) · careful, this is a real database'
  } else {
    const dir = args.includes('--memory') ? undefined : path.join(ROOT, '.data', 'pglite')
    console.log('starting PGlite…')
    adapter = await pgliteDb(dir)
    label = dir ? `PGlite in ${path.relative(ROOT, dir)}` : 'PGlite in memory'
  }
  const api = await startApi({ port, adapter })
  console.log(`API on ${api.url}/api · ${label}`)
  console.log(`routes: ${[...api.routes.keys()].join(' ')}`)
}
