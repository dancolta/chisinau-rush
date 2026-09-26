import { FILTER } from '../physics/Physics.js'

// Line of sight for the street AI: a single ray at head height against buildings and walls
// (static colliders only, so parked cars, poles and trees never hide you). Callers keep these
// rare (a few per quarter second). A physics world that has started throwing must never take
// the street down with it: from then on everybody simply "sees" within range.
let broken = false

export function clearSight(game, a, b, ay = 1.55, by = 1.25) {
  if (broken) return true
  const oy = (a.y || 0) + ay, ty = (b.y || 0) + by
  const dx = b.x - a.x, dy = ty - oy, dz = b.z - a.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 1) return true
  try {
    return !game.physics.raycast(a.x, oy, a.z, dx / d, dy / d, dz / d, d - 0.4, FILTER.Q_CAMERA)
  } catch (e) {
    broken = true
    console.warn('[sight] raycasts disabled', e)
    return true
  }
}
