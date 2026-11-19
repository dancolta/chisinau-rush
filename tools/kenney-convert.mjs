// Dev tool: converts Kenney vehicle GLBs (MIT) into KayKit-style glTF + bin that sample the shared
// KayKit palette atlas, so they recolour, batch and light exactly like the KayKit cars and add no
// texture download. Every vertex takes the atlas cell nearest to its Kenney colormap colour;
// `--cell old=new` pins a Kenney colour (hex) to a named cell where the nearest one looks off.
// usage: node tools/kenney-convert.mjs <in.glb> <out.gltf> [--cell ff0000=red ...] [--report]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const CELLS = [
  ['black', 'white', 'silver', 'graphite', 'tyre', 'terracotta', 'maroon', 'orange'],
  ['sky', 'blue', 'steel', 'yellow', 'red', 'beige', 'taupe', 'mocha'],
  ['lime', 'teal', 'green', 'forest', 'grey', 'cream', 'magenta', 'coral'],
]

// 8-bit RGB/RGBA, non-interlaced PNG (both atlases are)
function readPng(file) {
  const b = fs.readFileSync(file)
  let o = 8, w = 0, h = 0, type = 0
  const idat = []
  while (o < b.length) {
    const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8)
    if (t === 'IHDR') { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); type = b[o + 17]; if (b[o + 16] !== 8 || b[o + 20]) throw new Error('unsupported png ' + file) }
    if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const bpp = { 2: 3, 6: 4 }[type]
  if (!bpp) throw new Error('unsupported png colour type ' + type)
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, ul = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0
      let v = src[x]
      if (f === 1) v += a
      else if (f === 2) v += up
      else if (f === 3) v += (a + up) >> 1
      else if (f === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul }
      px[y * stride + x] = v & 255
    }
  }
  return { w, h, at: (u, v) => { const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h))), i = y * stride + x * bpp; return [px[i], px[i + 1], px[i + 2]] } }
}

const args = process.argv.slice(2)
const input = args[0], output = args[1] && !args[1].startsWith('--') ? args[1] : null
const pins = new Map()
args.forEach((a, i) => { if (a === '--cell') { const [k, v] = args[i + 1].split('='); pins.set(k.toLowerCase(), v) } })
const report = args.includes('--report')
const paintTo = args.includes('--paint') ? args[args.indexOf('--paint') + 1] : null

const hex = (c) => c.map((x) => x.toString(16).padStart(2, '0')).join('')
const atlas = readPng(new URL('../public/assets/kaykit/citybits_texture.png', import.meta.url).pathname)
const cells = []
CELLS.forEach((row, cy) => row.forEach((name, cx) => cells.push({ name, cx, cy, rgb: atlas.at((cx + 0.5) / 8, (cy + 0.5) / 4) })))
if (report) console.log('atlas', cells.map((c) => c.name + ':' + hex(c.rgb)).join(' '), [0, 1, 2, 3, 4, 5, 6, 7].map((x) => 'r3c' + x + ':' + hex(atlas.at((x + 0.5) / 8, 3.5 / 4)) + '/' + hex(atlas.at((x + 0.5) / 8, 3.15 / 4)) + '/' + hex(atlas.at((x + 0.5) / 8, 3.85 / 4))).join(' '))
// squared distance weighted towards how the eye sees it (redmean)
const dist = (a, b) => { const r = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db }

const glb = fs.readFileSync(input)
const jlen = glb.readUInt32LE(12)
const j = JSON.parse(glb.toString('utf8', 20, 20 + jlen))
const bin = glb.subarray(20 + jlen + 8)
const colormap = readPng(path.join(path.dirname(input), j.images[0].uri))

function read(ai) {
  const a = j.accessors[ai], bv = j.bufferViews[a.bufferView]
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]
  const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType]
  if (!T || (bv.byteStride && bv.byteStride !== n * T.BYTES_PER_ELEMENT)) throw new Error('unsupported accessor ' + ai)
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0)
  return Array.from(new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)))
}

// nodes carry translations only (checked), so world placement is a running offset
const parts = { body: { pos: [], nor: [], uv: [], idx: [], col: [] } }
const pivots = {}
const used = new Map()
function walk(ni, t) {
  const n = j.nodes[ni]
  if (n.rotation || n.scale || n.matrix) throw new Error('node transform other than translation: ' + n.name)
  const p = [t[0] + (n.translation?.[0] || 0), t[1] + (n.translation?.[1] || 0), t[2] + (n.translation?.[2] || 0)]
  if (n.mesh !== undefined) {
    const wheel = /wheel/.test(n.name)
    const part = wheel ? (parts[n.name] = { pos: [], nor: [], uv: [], idx: [], col: [] }) : parts.body
    if (wheel) pivots[n.name] = p
    const shift = wheel ? [0, 0, 0] : p
    for (const pr of j.meshes[n.mesh].primitives) {
      const P = read(pr.attributes.POSITION), N = read(pr.attributes.NORMAL), U = read(pr.attributes.TEXCOORD_0)
      const I = pr.indices !== undefined ? read(pr.indices) : P.map((_, i) => i).filter((i) => i < P.length / 3)
      const base = part.pos.length / 3
      for (let i = 0; i < P.length / 3; i++) {
        part.pos.push(P[i * 3] + shift[0], P[i * 3 + 1] + shift[1], P[i * 3 + 2] + shift[2])
        part.nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2])
        const c = colormap.at(U[i * 2], U[i * 2 + 1])
        part.col.push(c)
        const k = hex(c)
        used.set(k, { c, n: (used.get(k)?.n || 0) + 1 })
      }
      for (const i of I) part.idx.push(base + i)
    }
  }
  for (const c of n.children || []) walk(c, p)
}
for (const r of j.scenes[j.scene || 0].nodes) walk(r, [0, 0, 0])

// the body paint is the most used saturated hue; its shades (Kenney bakes several) collapse onto
// one cell, so the game's recolour swaps the whole paint job. Greys only match the neutral cells.
const hsv = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255] }
const saturated = (c) => { const [, s, v] = hsv(c); return s > 0.3 && v > 0.3 }
const hueBins = new Map()
for (const [k, u] of used) if (saturated(u.c) && !pins.has(k)) { const b = Math.round(hsv(u.c)[0] / 15) % 24; hueBins.set(b, (hueBins.get(b) || 0) + u.n) }
const paintHue = [...hueBins].sort((a, b) => b[1] - a[1])[0]?.[0] * 15
const hueOff = (a, b) => Math.abs(((a - b + 540) % 360) - 180)
const neutrals = cells.filter((e) => ['black', 'white', 'silver', 'graphite', 'tyre', 'grey'].includes(e.name))
const nearest = (c, list) => list.reduce((best, e) => (dist(c, e.rgb) < dist(c, best.rgb) ? e : best))
for (const [k, u] of used) {
  let cell = pins.has(k) ? cells.find((e) => e.name === pins.get(k)) : null
  if (!cell && paintTo && saturated(u.c) && hueOff(hsv(u.c)[0], paintHue) < 16) cell = cells.find((e) => e.name === paintTo)
  if (!cell) cell = nearest(u.c, saturated(u.c) ? cells : neutrals)
  u.cell = cell
}
for (const p of Object.values(parts)) for (const c of p.col) { const cell = used.get(hex(c)).cell; p.uv.push((cell.cx + 0.5) / 8, (cell.cy + 0.5) / 4) }

if (report) {
  console.log(path.basename(input), [...used].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k}->${v.cell.name}(${v.n})`).join(' '))
  if (!output) process.exit(0)
}

// one buffer, one mesh per part; wheels keep their pivot as the node translation
const chunks = [], views = [], accessors = [], meshes = [], nodes = []
let byteLen = 0
function push(arr, T, type, target, minmax) {
  const data = Buffer.from(new T(arr).buffer)
  const pad = (4 - (byteLen % 4)) % 4
  if (pad) { chunks.push(Buffer.alloc(pad)); byteLen += pad }
  views.push({ buffer: 0, byteOffset: byteLen, byteLength: data.length, target })
  chunks.push(data); byteLen += data.length
  const n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[type]
  const acc = { bufferView: views.length - 1, componentType: T === Float32Array ? 5126 : T === Uint16Array ? 5123 : 5125, count: arr.length / n, type }
  if (minmax) { acc.min = [0, 1, 2].map((k) => Math.min(...arr.filter((_, i) => i % 3 === k))); acc.max = [0, 1, 2].map((k) => Math.max(...arr.filter((_, i) => i % 3 === k))) }
  accessors.push(acc)
  return accessors.length - 1
}
for (const [name, p] of Object.entries(parts)) {
  const POSITION = push(p.pos, Float32Array, 'VEC3', 34962, true)
  const NORMAL = push(p.nor, Float32Array, 'VEC3', 34962)
  const TEXCOORD_0 = push(p.uv, Float32Array, 'VEC2', 34962)
  const indices = push(p.idx, p.pos.length / 3 < 65536 ? Uint16Array : Uint32Array, 'SCALAR', 34963)
  meshes.push({ name, primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0 }, indices }] })
  nodes.push({ name, mesh: meshes.length - 1, ...(pivots[name] ? { translation: pivots[name] } : {}) })
}
const binName = path.basename(output).replace(/\.gltf$/, '.bin')
const out = {
  asset: { version: '2.0', generator: 'chisinau-rush kenney-convert (from Kenney, MIT)' },
  scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews: views,
  buffers: [{ uri: binName, byteLength: byteLen }],
}
fs.writeFileSync(output, JSON.stringify(out))
fs.writeFileSync(path.join(path.dirname(output), binName), Buffer.concat(chunks))
console.log('wrote', output, byteLen, 'bytes bin')
