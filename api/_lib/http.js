// Plumbing shared by the API functions: JSON responses, CORS, body limits and error mapping.
// Every route file in /api exports `default endpoint({ GET, POST, … })`, a Web-standard
// `{ fetch(request) }` handler: the object Vercel runs, and the one tools/api-dev.mjs serves locally.
// Files and folders starting with "_" (like this one) are not deployed as functions.

export class HttpError extends Error {
  constructor(status, message, extra = null, headers = null) {
    super(message)
    this.status = status
    this.extra = extra
    this.headers = headers
  }
}

// the GitHub Pages build and the local dev servers; ALLOWED_ORIGINS (comma list) replaces these
const DEFAULT_ORIGINS = [
  'https://dancolta.github.io',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
]

function allowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS
  if (!env || !env.trim()) return DEFAULT_ORIGINS
  return env.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
}

// the page calling us was served by this same deployment (whatever the platform put in request.url)
function sameOrigin(request, origin) {
  if (origin === new URL(request.url).origin) return true
  let host = ''
  try { host = new URL(origin).host } catch (e) { return false }
  return host === request.headers.get('x-forwarded-host') || host === request.headers.get('host')
}

// null: no CORS headers needed (same origin, or not a browser); false: refused; else the origin to echo
function corsOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin || sameOrigin(request, origin)) return null
  const list = allowedOrigins()
  return list.includes('*') || list.includes(origin) ? origin : false
}

function respond(status, body, cors, extra) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  })
  if (cors) headers.set('Access-Control-Allow-Origin', cors)
  if (extra) for (const [k, v] of Object.entries(extra)) headers.set(k, String(v))
  return new Response(body == null ? null : JSON.stringify(body), { status, headers })
}

export function endpoint(methods) {
  const allow = [...Object.keys(methods), 'OPTIONS'].join(', ')
  return {
    async fetch(request) {
      const cors = corsOrigin(request)
      if (cors === false) return respond(403, { error: 'Site-ul ăsta nu are voie să folosească serverul de salvări.' }, null)
      if (request.method === 'OPTIONS') {
        return respond(204, null, cors, {
          'Access-Control-Allow-Methods': allow,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': 86400,
        })
      }
      const fn = methods[request.method]
      if (!fn) return respond(405, { error: 'Metodă nepermisă.' }, cors, { Allow: allow })
      try {
        const { status = 200, body } = await fn(request)
        return respond(status, body, cors)
      } catch (e) {
        if (e instanceof HttpError) return respond(e.status, { error: e.message, ...e.extra }, cors, e.headers)
        console.error('[api]', request.method, new URL(request.url).pathname, e)
        return respond(500, { error: 'Eroare pe server. Mai încearcă puțin mai târziu.' }, cors)
      }
    },
  }
}

// the JSON body, read up to `limit` bytes (the header can lie or be missing, so count as we go)
export async function readJson(request, limit = 8 * 1024) {
  const type = (request.headers.get('content-type') || '').toLowerCase()
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Datele trebuie trimise ca JSON.')
  const tooBig = () => new HttpError(413, 'Prea multe date într-o singură cerere.')
  if (Number(request.headers.get('content-length') || 0) > limit) throw tooBig()
  const chunks = []
  let size = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { reader.cancel().catch(() => {}); throw tooBig() }
      chunks.push(value)
    }
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) throw new HttpError(400, 'Cererea e goală.')
  try { return JSON.parse(text) } catch (e) { throw new HttpError(400, 'JSON invalid.') }
}

// Vercel overwrites x-forwarded-for with the real client address, so it can't be spoofed there
export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : request.headers.get('x-real-ip')) || ''
  return ip.trim().slice(0, 64) || 'unknown'
}

export const iso = (v) => (v == null ? null : new Date(v).toISOString())
