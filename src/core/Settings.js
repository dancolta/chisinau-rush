const KEY = 'cr3d-settings'

const DEFAULTS = {
  quality: 'high',
  autoRes: true,
  master: 0.9,
  music: 0.6,
  sfx: 0.85,
  voice: 0.8,
  shake: 1,
  subtitles: true,
  invertCam: false,
  camSensitivity: 1,
  fov: 42,
}

export function loadSettings() {
  let s = {}
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { s = {} }
  const merged = { ...DEFAULTS, ...s }
  // first run: guess a sensible quality tier from the device
  if (!s.quality) {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    const cores = navigator.hardwareConcurrency || 4
    merged.quality = mobile ? 'low' : cores <= 4 ? 'medium' : 'high'
  }
  return merged
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) { /* storage blocked */ }
}
