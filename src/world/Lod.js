// Out in the fog the cheaper presets stop drawing what nobody can make out: a batch of city trees
// swaps to its low-poly twin, then trees, street furniture and the small static stuff go. A batch
// that stands tall stays (its silhouette is the skyline) and so does the ground, so nothing leaves a
// hole. The presets' `lod` (Renderer.js) holds the distances, from the camera to a batch's bounds:
// { twin, tree, static, props, tall }; without one, everything is drawn as built.
const KINDS = { 'vcol:tree': 'tree', 'vcol:static': 'static', 'atlas:props': 'props' }

export class DistanceLod {
  constructor(meshes) {
    const twins = new Map()
    for (const m of meshes) if (m.name.startsWith('vcol:tree_lod|')) twins.set(m.name.split('|')[1], m)
    this.items = []
    for (const m of meshes) {
      const [k, chunk] = m.name.split('|'), kind = KINDS[k]
      if (!kind) continue
      const g = m.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      const s = g.boundingSphere
      this.items.push({ mesh: m, kind, twin: kind === 'tree' ? twins.get(chunk) ?? null : null, x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius, top: g.boundingBox.max.y })
    }
    for (const t of twins.values()) t.visible = false
  }

  update(camera, lod) {
    const p = camera.position
    for (const it of this.items) {
      let show = true, low = false
      if (lod) {
        const d = Math.hypot(it.x - p.x, it.y - p.y, it.z - p.z) - it.r
        show = it.top > lod.tall || d < lod[it.kind]
        low = !!it.twin && d > lod.twin
      }
      it.mesh.visible = show && !low
      if (it.twin) it.twin.visible = show && low
    }
  }
}
