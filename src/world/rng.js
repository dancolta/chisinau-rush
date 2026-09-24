// Deterministic RNG so the city is identical on every load (saves rely on it).
export function mulberry(seed) {
  let a = seed >>> 0
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  f.range = (a0, b0) => a0 + f() * (b0 - a0)
  f.int = (a0, b0) => Math.floor(a0 + f() * (b0 - a0 + 1))
  f.pick = (arr) => arr[Math.floor(f() * arr.length)]
  f.chance = (p) => f() < p
  return f
}

export function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
