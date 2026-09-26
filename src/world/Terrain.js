import * as THREE from 'three'
import { BOUNDS } from './CityLayout.js'
import { mulberry } from './rng.js'
import { FILTER } from '../physics/Physics.js'

// The land beyond the playable limit, out to the horizon: one height function and one mesh.
// Each side has its own shape right behind its barrier (the Bîc's channel in the north, the
// wooded slope of Valea Morilor in the west, the ring highway's embankment in the east, the
// combinat's flat yard in the south) and then the bowl of hills Chișinău sits in. The land is
// allowed to jump in height only along lines where Edge.js stands a wall (the limit, the river's
// banks, the underpasses), so every jump is hidden behind concrete.

const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = BOUNDS

// ---- dimensions shared with Edge.js ------------------------------------------------------------
// the Bîc: parapet on the limit, sloped concrete banks, water, far bank with its own parapet
export const RIVER = { top0: Z0 - 0.4, top1: Z0 - 20.4, far: Z0 - 20.8, run: 4, bed: -2.95, water: -2.7 }
// the retaining wall in the west: its thickness, and how high it stands where the ground behind it is low
export const WALL_W = { t: 0.5, min: 2.45 }
// the ring highway in the east: deck level, deck width, the foot of its embankment, the wall and
// the jersey parapet on top of it
export const HIGHWAY = { y: 6, deck: 29, foot: 55, wall: 0.6, parapet: 0.9 }
// the railway's openings at both ends (the tracks run at RAIL_Z ± 4)
export const PORTAL = { z0: 308, z1: 328 }
// the boulevard's openings (checkpoints)
export const GATE_HALF = 12.5
const RIVER_EAST = 1000 // the channel runs on east of the highway this far

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// the bowl of hills round the city, rising a few hundred metres out; the roads, the railway,
// the river and the highway leave along valleys
export function farHills(x, z) {
  const dx = Math.max(X0 - x, x - X1, 0), dz = Math.max(Z0 - z, z - Z1, 0)
  const r = Math.hypot(dx, dz)
  const k = smooth(330, 1250, r)
  if (k <= 0) return 0
  const n = 0.5 + 0.3 * Math.sin(x * 0.0023 + 1.3) * Math.cos(z * 0.0019 - 0.4) + 0.13 * Math.sin(x * 0.0057 - z * 0.0043 + 2.1) + 0.07 * Math.sin((x + 0.6 * z) * 0.013 + 0.7)
  let h = k * (22 + 95 * n)
  let v = smooth(30, 230, Math.abs(x - X1 - 15)) // the highway runs north-south along the east
  if (x < X0 || x > X1) v = Math.min(v, smooth(40, 260, Math.abs(z))) // Calea Ieșilor, Bd. Dacia
  if (x > X1) v = Math.min(v, smooth(40, 240, Math.abs(z - 318)), smooth(40, 240, Math.abs(z - (RIVER.top0 + RIVER.top1) / 2)))
  return h * (0.15 + 0.85 * v)
}

// how high the ground held back by the western retaining wall is, at the wall
export function westWallTop(z) {
  if (z < Z0) return 2.35 * smooth(Z0 - 100, Z0 - 21, z) // the hill's foot along the far bank
  const south = 1 - smooth(Z1 + 8, Z1 + 90, z)
  const base = 2.35 * smooth(GATE_HALF, 45, Math.abs(z)) // Calea Ieșilor's valley
  const portal = 9.5 * smooth(280, 298, z) // the hill over the railway tunnel
  return Math.max(base, portal) * south
}

function hNorth(x, z) {
  const d = Z0 - z
  if (d < Z0 - RIVER.top0) return 0 // under the parapet
  if (d <= Z0 - RIVER.top1) return -6 // the channel (its concrete and its water hide this)
  if (d < Z0 - RIVER.far) return 0 // under the far parapet
  return farHills(x, z)
}

function hWest(x, z) {
  const dx = X0 - x
  const valley = smooth(16, 50, Math.abs(z))
  const mask = smooth(Z0 - 170, Z0 - 60, z) * (1 - smooth(Z1 + 40, Z1 + 150, z))
  // a narrow berm behind the wall's coping, then steep, levelling out on top
  const rise = 34 * (1 - Math.exp(-dx / 38)) * smooth(0.5, 4, dx)
  const und = 7 * Math.sin(z * 0.019 + dx * 0.011) * Math.cos(z * 0.007 - dx * 0.017) * smooth(30, 120, dx)
  return westWallTop(z) + (rise + und) * valley * mask + farHills(x, z)
}

// the river's corridor under and past the highway, the road's and the railway's
export const inRiver = (z) => z > RIVER.top1 && z < RIVER.top0
export const inRoadE = (z) => Math.abs(z) < GATE_HALF
export const inRailE = (z) => z > PORTAL.z0 && z < PORTAL.z1

// the highway runs a good way past the corners before it fades into the haze
export const HIGHWAY_END = 1250
export function highwayLevel(dx, z = 0) {
  const k = 1 - smooth(HIGHWAY_END - 100, HIGHWAY_END + 50, Math.abs(z))
  return k * (dx < HIGHWAY.deck ? HIGHWAY.y : HIGHWAY.y * (1 - smooth(HIGHWAY.deck, HIGHWAY.foot, dx)))
}

function hEast(x, z) {
  const dx = x - X1
  if (inRiver(z) && dx < RIVER_EAST) return -6
  if (inRoadE(z) || inRailE(z)) return farHills(x, z)
  return Math.max(highwayLevel(dx, z) - 0.02, farHills(x, z))
}

// region: 'w' | 'e' | 'n' | 's' (along the limit lines the two sides may differ; pass the side
// you're building for). Inside the limit the ground is flat.
export function terrainHeight(x, z, region = null) {
  const r = region || (x < X0 ? 'w' : x > X1 ? 'e' : z < Z0 ? 'n' : z > Z1 ? 's' : null)
  if (r === 'w') return hWest(x, z)
  if (r === 'e') return hEast(x, z)
  if (r === 'n') return hNorth(x, z)
  if (r === 's') return farHills(x, z)
  return 0
}

// ---- the mesh ----------------------------------------------------------------------------------
// Four grids round the limit: north and south span the city's width, west and east run the full
// height of the view, so the corners belong to them. Rows are dense next to the barriers and
// spread out toward the horizon; there are extra rows on both sides of every line where the
// ground jumps, so the jump is a clean vertical step behind a wall.
const D = [0, 0.4, 0.5, 2, 4.4, 8, 16.4, 20.4, 20.8, 24, 29, 34, 40, 48, 55, 64, 90, 130, 192, 285, 420, 620, 900, 1300, 1860, 2600]

function spaced(a, b, step, extra = []) {
  const n = Math.max(1, Math.round((b - a) / step))
  const out = []
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n)
  return uniq(out.concat(extra.filter((v) => v > a && v < b)))
}
function uniq(list) {
  const s = [...list].sort((a, b) => a - b)
  return s.filter((v, i) => i === 0 || v - s[i - 1] > 0.004)
}
const both = (v) => [v - 0.01, v + 0.01]

function fieldsTexture() {
  const S = 512
  const c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')
  const r = mulberry(5150)
  x.fillStyle = '#5f7a3c'; x.fillRect(0, 0, S, S)
  const cols = ['#6b8a3f', '#7f9447', '#9aa052', '#b8a35a', '#8a7a4c', '#5a7236', '#4f6a33', '#a89a58', '#6f8440']
  // strips of farmland in a few directions, like the fields around the city
  for (let i = 0; i < 70; i++) {
    x.save()
    x.translate(r() * S, r() * S)
    x.rotate(Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.25)
    x.fillStyle = cols[Math.floor(r() * cols.length)]
    x.globalAlpha = 0.75 + r() * 0.25
    x.fillRect(0, 0, 40 + r() * 150, 18 + r() * 70)
    x.restore()
  }
  // tree lines between fields
  x.globalAlpha = 0.55
  x.strokeStyle = '#34482a'; x.lineWidth = 3
  for (let i = 0; i < 14; i++) { const y = r() * S; x.beginPath(); x.moveTo(0, y); x.lineTo(S, y + (r() - 0.5) * 40); x.stroke() }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// patches of woodland on the far hills (and the forest floor under Valea Morilor's trees)
function woodK(x, z) {
  return smooth(0.25, 0.55, 0.5 + 0.5 * Math.sin(x * 0.0061 + 0.4) * Math.sin(z * 0.0053 - 1.1) + 0.25 * Math.sin((x - z) * 0.017))
}

function groundColor(region, x, z, h) {
  const c = [1, 1, 1]
  const mul = (r, g, b, k = 1) => { c[0] *= 1 + (r - 1) * k; c[1] *= 1 + (g - 1) * k; c[2] *= 1 + (b - 1) * k }
  const dx = Math.max(X0 - x, x - X1, 0), dz = Math.max(Z0 - z, z - Z1, 0)
  const r = Math.hypot(dx, dz)
  if (region === 'w' && canopyHeight(x, z) > 1) mul(0.55, 0.66, 0.5) // shade under the trees
  if (region === 's' && dz < 200) mul(0.98, 0.9, 0.72, 1 - smooth(120, 200, dz)) // the combinat's dusty yard
  if (region === 'e' && dx > HIGHWAY.deck && dx < HIGHWAY.foot + 10) mul(1.02, 0.97, 0.78) // the embankment's dry grass
  // woods on the hills out there, darker on the steeper, higher ground
  const w = woodK(x, z) * smooth(200, 600, r) * smooth(8, 30, h)
  mul(0.52, 0.62, 0.48, w)
  return c
}

// Valea Morilor's woods: how tall the canopy stands above the ground (0 = no trees here)
export function canopyHeight(x, z) {
  const dx = X0 - x
  if (dx < 6) return 0
  const along = smooth(Z0 - 150, Z0 - 90, z) * (1 - smooth(Z1 + 70, Z1 + 140, z))
  const road = smooth(20, 34, Math.abs(z)) // clear of Calea Ieșilor
  const edge = smooth(6, 13, dx) * (1 - smooth(290, 340, dx))
  const k = along * road * edge
  if (k <= 0.02) return 0
  const lump = Math.sin(x * 0.43 + Math.sin(z * 0.21)) * Math.sin(z * 0.37 + Math.cos(x * 0.19)) * 1.6 + Math.sin(x * 0.11 - z * 0.13) * 1.4
  return k * (11.5 + lump)
}

export function buildTerrain(world) {
  const fields = fieldsTexture()
  const mat = terrainMaterial(world.tex.grass, fields)
  const meshes = []
  // one grid per side (colCuts / rowCuts can cut a side into pieces: where along xs / zs)
  const grid = (region, xs, zs, colCuts = [], rowCuts = [], camera = null) => {
    const pos = [], col = [], uv = []
    const nx = xs.length, nz = zs.length
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], h = terrainHeight(x, z, region)
      pos.push(x, h, z)
      uv.push(x / 22, -z / 22)
      col.push(...groundColor(region, x, z, h))
    }
    const idx = []
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
    const nor = smoothNormals(pos, idx)
    const cut = (list, cuts) => [0, ...cuts.map((v) => list.findIndex((u) => u >= v - 1e-6)).filter((k) => k > 0 && k < list.length - 1), list.length - 1]
    const ci = cut(xs, colCuts), cj = cut(zs, rowCuts)
    for (let a = 0; a < ci.length - 1; a++) for (let b = 0; b < cj.length - 1; b++) {
      const i0 = ci[a], i1 = ci[a + 1], j0 = cj[b], j1 = cj[b + 1], w = i1 - i0 + 1
      const P = [], N = [], Cl = [], U = [], I = [], cam = []
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i
        P.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); N.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2])
        Cl.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); U.push(uv[k * 2], uv[k * 2 + 1])
      }
      for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < i1 - i0; i++) {
        const q = j * w + i, r = q + 1, c = q + w, d = c + 1
        I.push(q, c, r, r, c, d)
        if (camera && camera(xs[i0 + i], zs[j0 + j]) && camera(xs[i0 + i + 1], zs[j0 + j + 1])) cam.push(q, c, r, r, c, d)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
      geo.setIndex(I)
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = 'terrain:' + region
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.matrixAutoUpdate = false; mesh.updateMatrix()
      world.scene.add(mesh)
      meshes.push(mesh)
      // the camera must not swing into the hill when you stand with your back to the western wall
      if (cam.length) {
        const R = world.physics.R
        const used = new Map(), v = [], t = []
        for (const k of cam) {
          if (!used.has(k)) { used.set(k, v.length / 3); v.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]) }
          t.push(used.get(k))
        }
        const d = R.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(t)).setCollisionGroups(FILTER.STATIC)
        world.physics.world.createCollider(d, world.physics.fixed)
      }
    }
  }
  const xsNS = spaced(X0, X1, 10)
  grid('n', xsNS, D.map((d) => Z0 - d).reverse())
  grid('s', xsNS, D.map((d) => Z1 + d))
  // the west and east grids run the full height; their rows match the north and south grids'
  // beyond the corners, so the seams close once the walls there end
  const outN = D.filter((d) => d >= 20.8).map((d) => Z0 - d)
  const outS = D.filter((d) => d > 0).map((d) => Z1 + d)
  const zsW = uniq([...outN, ...spaced(Z0 - 20.8, Z1, 10, [-45, -34, -26, -20, -16, -12.5, 12.5, 16, 20, 26, 34, 45, 280, 286, 292, 298, Z0 - 0.4, Z0 - 10.4]), ...outS])
  const zsE = uniq([...outN, ...spaced(Z0 - 20.8, Z1, 10, [...both(RIVER.top1), ...both(RIVER.top0), ...both(-GATE_HALF), ...both(GATE_HALF), ...both(PORTAL.z0), ...both(PORTAL.z1), Z0]), ...outS])
  grid('w', D.map((d) => X0 - d).reverse(), zsW, [], [], (x, z) => x > X0 - 70 && z > Z0 - 40 && z < Z1 + 40)
  grid('e', D.map((d) => X1 + d), zsE)
  // one draw call for all of it: out to the horizon some of it is always in view anyway
  const all = mergeTerrain(meshes, mat)
  for (const m of meshes) { world.scene.remove(m); m.geometry.dispose() }
  world.scene.add(all)
  return all
}

function mergeTerrain(meshes, mat) {
  const attrs = ['position', 'normal', 'color', 'uv']
  const out = {}, idx = []
  let base = 0
  for (const a of attrs) out[a] = []
  for (const m of meshes) {
    const g = m.geometry
    for (const a of attrs) out[a].push(...g.attributes[a].array)
    for (const i of g.index.array) idx.push(i + base)
    base += g.attributes.position.count
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false; mesh.updateMatrix()
  return mesh
}

function terrainMaterial(grass, fields) {
  const mat = new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 })
  mat.envMapIntensity = 0.3
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFields = { value: fields }
    sh.uniforms.uLimit = { value: new THREE.Vector4((X0 + X1) / 2, (Z0 + Z1) / 2, (X1 - X0) / 2, (Z1 - Z0) / 2) }
    sh.vertexShader = 'varying vec3 vTerrW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vTerrW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = 'uniform sampler2D uFields;\nuniform vec4 uLimit;\nvarying vec3 vTerrW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    // up close it's the city's grass (with a finer sample of itself, and slow tonal drift so the
    // tiling doesn't show); a few hundred metres out, patchwork fields
    vec3 det = texture2D(map, vMapUv * 8.7 + vec2(0.31, 0.17)).rgb;
    diffuseColor.rgb *= clamp(0.45 + 1.8 * dot(det, vec3(0.3333)), 0.7, 1.35);
    diffuseColor.rgb *= 0.86 + 0.28 * texture2D(map, vMapUv * 0.043 + vec2(0.5, 0.2)).g;
    float r = length(max(abs(vTerrW.xz - uLimit.xy) - uLimit.zw, 0.0));
    vec3 f = texture2D(uFields, vTerrW.xz * vec2(1.0, -1.0) / 700.0).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, f, smoothstep(160.0, 560.0, r));
  }`)
  }
  mat.customProgramCacheKey = () => 'terrain-v1'
  return mat
}

// vertex normals from the faces round each vertex, leaving out the near-vertical steps behind
// the walls (they'd tip the normals of the ground on either side)
function smoothNormals(pos, idx) {
  const n = new Float32Array(pos.length)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3(), e = new THREE.Vector3()
  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i], ib = idx[i + 1], ic = idx[i + 2]
    a.fromArray(pos, ia * 3); b.fromArray(pos, ib * 3); c.fromArray(pos, ic * 3)
    f.subVectors(c, b).cross(e.subVectors(a, b))
    if (f.y < 0) f.negate()
    const L = f.length()
    if (L < 1e-9 || f.y / L < 0.2) continue
    for (const k of [ia, ib, ic]) { n[k * 3] += f.x; n[k * 3 + 1] += f.y; n[k * 3 + 2] += f.z }
  }
  for (let i = 0; i < n.length; i += 3) {
    const L = Math.hypot(n[i], n[i + 1], n[i + 2])
    if (L < 1e-9) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0 } else { n[i] /= L; n[i + 1] /= L; n[i + 2] /= L }
  }
  return n
}

// Valea Morilor's woods as one canopy: a lumpy roof of leaves over the slope, dropping to the
// ground at the forest's edges. Real trees stand in front of it along the wall (Edge.js).
export function buildCanopy(world) {
  const B = world.batches
  const step = 8.5
  const xs = spaced(X0 - 340, X0 - 6, step)
  const zs = spaced(Z0 - 160, Z1 + 150, step, [-34, -27, -20, 20, 27, 34])
  const rnd = mulberry(2718)
  const dark = new THREE.Color(0x2c4627), mid = new THREE.Color(0x3f5f35), light = new THREE.Color(0x587a42), autumn = new THREE.Color(0x9a8a3a), rust = new THREE.Color(0x8e5a2a)
  const P = [], C = []
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
    const x = xs[i] + (i && i < xs.length - 1 ? rnd.range(-1.6, 1.6) : 0), z = zs[j] + (j && j < zs.length - 1 ? rnd.range(-1.6, 1.6) : 0)
    const g = terrainHeight(x, z, 'w'), c = canopyHeight(x, z)
    // no trees: tuck the roof under the ground, so the forest ends in a slope of leaves
    P.push([x, c > 0.8 ? g + c : g - 1.2, z])
    const t = clamp(0.5 + (c - 11.5) / 5, 0, 1)
    const col = dark.clone().lerp(mid, t).lerp(light, Math.max(0, t - 0.55) * rnd.range(0.4, 1.1))
    // September: a few crowns already turning
    const turn = Math.max(0, Math.sin(x * 0.09 + 1.7) * Math.sin(z * 0.071 - 0.3) - 0.62) * 2.2
    if (turn > 0) col.lerp(rnd() < 0.5 ? autumn : rust, Math.min(0.7, turn))
    const v = 0.9 + rnd() * 0.18
    C.push([col.r * v, col.g * v, col.b * v])
  }
  const nx = xs.length
  // (in with the rest of the shadowless trees out past the edge: a batch per quarter of the map)
  const tri = (ka, kb, kc) => {
    const a = P[ka], b = P[kb], c = P[kc]
    if (a[1] < terrainHeight(a[0], a[2], 'w') && b[1] < terrainHeight(b[0], b[2], 'w') && c[1] < terrainHeight(c[0], c[2], 'w')) return
    const g = B.vcol(X0, (a[2] + b[2] + c[2]) / 3, 'tree_far', 1e5)
    const n = new THREE.Vector3(c[0] - b[0], c[1] - b[1], c[2] - b[2]).cross(new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2])).normalize()
    if (n.y < 0) n.negate()
    for (const [p, k] of [[a, ka], [b, kb], [c, kc]]) {
      g.pos.push(p[0], p[1], p[2])
      // lean the normals up and out of the canopy: soft, rounded light like the city's trees
      g.nor.push(n.x * 0.6, n.y * 0.6 + 0.4, n.z * 0.6)
      g.col.push(C[k][0], C[k][1], C[k][2])
      g.emit.push(0); g.uv.push(0, 0)
    }
  }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1
    tri(a, c, b); tri(b, c, d)
  }
}
