import * as THREE from 'three'
import { WORLD } from './CityLayout.js'
import { mulberry } from './rng.js'

// Beyond the edge of the map: patchwork fields that run out into the haze and a ring of low
// hills (Chișinău sits in a bowl of them), so high shots and the title flyover never show
// the end of the world.

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

export function buildHorizon(scene) {
  const group = new THREE.Group()
  group.name = 'horizon'
  // ---- fields: a huge square with the map cut out, a hair below the map's own ground ----------
  const S = 7000, pad = 3
  const P = (x, z) => new THREE.Vector2(x, -z) // shape space (x, -z) -> world (x, z) after the rotation
  const shape = new THREE.Shape([P(-S, -S), P(S, -S), P(S, S), P(-S, S)])
  shape.holes.push(new THREE.Path([P(WORLD.x0 + pad, WORLD.z0 + pad), P(WORLD.x0 + pad, WORLD.z1 - pad), P(WORLD.x1 - pad, WORLD.z1 - pad), P(WORLD.x1 - pad, WORLD.z0 + pad)]))
  const fg = new THREE.ShapeGeometry(shape)
  fg.rotateX(-Math.PI / 2)
  // world-space UVs: one field pattern every 700 m
  const pos = fg.attributes.position, uv = fg.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 700, pos.getZ(i) / 700)
  const fields = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: fieldsTexture(), roughness: 1 }))
  fields.position.y = -0.06
  fields.receiveShadow = false
  group.add(fields)

  // ---- hills: two rings of soft ridges around the map ------------------------------------------
  const cx = (WORLD.x0 + WORLD.x1) / 2, cz = (WORLD.z0 + WORLD.z1) / 2
  const hw = (WORLD.x1 - WORLD.x0) / 2, hd = (WORLD.z1 - WORLD.z0) / 2
  // point on a rounded rectangle around the map, pushed out by `off`
  const around = (a, off) => {
    const c = Math.cos(a), s = Math.sin(a)
    const k = Math.min(hw / Math.max(1e-6, Math.abs(c)), hd / Math.max(1e-6, Math.abs(s)))
    return [cx + c * (k + off), cz + s * (k + off)]
  }
  const ring = (N, off0, off1, hMin, hMax, seed, colLow, colHigh) => {
    const r = mulberry(seed)
    const waves = Array.from({ length: 5 }, (_, i) => ({ f: 2 + i * 3 + Math.floor(r() * 3), p: r() * 6.28, a: 1 / (i + 1.3) }))
    const hgt = (a) => { let v = 0, n = 0; for (const w of waves) { v += Math.sin(a * w.f + w.p) * w.a; n += w.a } return hMin + (hMax - hMin) * (0.5 + 0.5 * v / n) }
    const rows = [[off0, 0, -2], [off0 + (off1 - off0) * 0.3, 0.55, 0], [off0 + (off1 - off0) * 0.55, 1, 0], [off1, 0.2, 0], [off1 + 400, 0, -4]]
    const posA = [], colA = [], idx = []
    const lo = new THREE.Color(colLow), hi = new THREE.Color(colHigh), forest = new THREE.Color(0x2f4428), tmp = new THREE.Color()
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      const h = hgt(a)
      for (const [off, k, dy] of rows) {
        const wob = Math.sin(a * 7 + seed) * 18 + Math.sin(a * 13 + seed * 2) * 9
        const [x, z] = around(a, off + wob)
        posA.push(x, h * k + dy, z)
        tmp.copy(lo).lerp(hi, k)
        // dark patches of forest on the slopes
        if (k > 0.3 && Math.sin(a * 23 + seed) * Math.sin(a * 9 - seed) > 0.25) tmp.lerp(forest, 0.6)
        colA.push(tmp.r, tmp.g, tmp.b)
      }
    }
    const R = rows.length
    for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) {
      const a = i * R + j, b = (i + 1) * R + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    // make sure the faces point up/out (the winding depends on the ring direction)
    const n = g.attributes.normal
    let up = 0
    for (let i = 0; i < n.count; i++) up += n.getY(i)
    if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t } g.setIndex(idx); g.computeVertexNormals() }
    return g
  }
  const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  group.add(new THREE.Mesh(ring(160, 300, 620, 14, 46, 11, 0x5d7440, 0x8a9a55), hillMat))
  group.add(new THREE.Mesh(ring(120, 650, 1100, 40, 110, 29, 0x55693f, 0x7d8c55), hillMat))
  for (const m of group.children) { m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = false }
  scene.add(group)
  return group
}
