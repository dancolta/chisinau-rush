// Out in the fog the cheaper presets stop drawing what nobody can make out: a batch of city trees
// swaps to its low-poly twin, then trees, street furniture, low trim and small static stuff go. A batch
// that stands tall stays (its silhouette is the skyline) and so does the ground, so nothing leaves a
// hole. The presets' `lod` (Renderer.js) holds the distances, from the camera to a batch's bounding
// box: { twin, tree, static, props, bld, tall }, and `clutter` for the knockable props
// (DynamicProps.cull); without one, everything is drawn as built.
// (what stands past the edge of the map too; the horizon's own batch is tall, so it always stays)
const KINDS = {
  'vcol:tree': 'tree', 'vcol:static': 'static', 'atlas:props': 'props', 'vcol:bld': 'bld',
  'vcol:tree_far': 'tree', 'vcol:static_far': 'static', 'atlas:props_far': 'props',
}

export class DistanceLod {
  constructor(meshes, clutter = null) {
    this.clutter = clutter
    const twins = new Map()
    for (const m of meshes) if (m.name.startsWith('vcol:tree_lod|')) twins.set(m.name.split('|')[1], m)
    this.items = []
    for (const m of meshes) {
      const [k, chunk] = m.name.split('|'), kind = KINDS[k]
      if (!kind) continue
      const g = m.geometry
      if (!g.boundingBox) g.computeBoundingBox()
      // (batches sit at the origin: the geometry's box is where it stands)
      this.items.push({ mesh: m, kind, twin: kind === 'tree' ? twins.get(chunk) ?? null : null, box: g.boundingBox })
    }
    for (const t of twins.values()) t.visible = false
  }

  update(camera, lod) {
    const p = camera.position
    for (const it of this.items) {
      let show = true, low = false
      if (lod) {
        const d = it.box.distanceToPoint(p)
        show = it.box.max.y > lod.tall || d < lod[it.kind]
        low = !!it.twin && d > lod.twin
      }
      it.mesh.visible = show && !low
      if (it.twin) it.twin.visible = show && low
    }
    this.clutter?.cull(p, lod?.clutter ?? 0)
  }
}
