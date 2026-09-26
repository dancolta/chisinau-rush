// Dev tool: the teaser trailer, rendered offline from the real engine.
//
// The game runs in capture mode (?capture): no frame loop, every video frame is exactly one
// 1/30 s step of the real simulation, so software WebGL can take as long as it needs per frame
// and the video still plays back smooth. Text overlays are HTML in the game's own fonts; the
// soundtrack is the game's own procedural music and sfx, rendered in an OfflineAudioContext;
// ffmpeg puts it together (H.264 + AAC, -14 LUFS).
//
// usage: node tools/trailer.mjs [--format 16x9|9x16|both] [--out downloads]
//          [--only shotA,shotB] [--at 0,0.5,1.2]   stills of those shots (seconds into the shot)
//          [--preview] [--every 3]                  quick low-res pass to check timing and overlays
//          [--audio-only] [--no-audio] [--frames dir] [--scale 0.5] [--quality high]
//
// The cut is data: SHOTS (what the camera sees), OVERLAYS (text on screen) and SCORE (music and
// sfx), all on one beat grid: 150 BPM at 30 fps = 12 frames a beat.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FPS = 30
const BPM = 150
const BEAT = (60 / BPM) * FPS // 12 frames
const FFMPEG = process.env.FFMPEG || (fs.existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg')
const FFPROBE = process.env.FFPROBE || (fs.existsSync('/usr/local/bin/ffprobe') ? '/usr/local/bin/ffprobe' : 'ffprobe')

// ---- the cut --------------------------------------------------------------------------------
// Every shot runs in the page. setup(T) builds the scene (it may simulate a few seconds ahead
// without drawing), update(T, t) scripts what happens t seconds into the shot, cam(T, t) places
// the camera ({ p, l, fov, roll }) and camV(T, t) is the re-framed camera for the vertical cut.
// keyart: seconds into the shot where a clean still (no overlays) is saved for loading screens.
export const SHOTS = [
  {
    // golden hour over PMAN and Bd. Ștefan cel Mare: a dive down to the Arc
    id: 'open', beats: 7, hour: 18.5, seed: 11,
    setup(T) {
      T.focusAt(-10, 0)
      T.boulevardTraffic([-160, 160], 18)
      T.walkers(-10, 10, 40, 16)
      T.preroll(4)
    },
    cam(T, t) {
      return T.path(t / T.dur, [
        { p: [-100, 64, -118], l: [8, 0, 6], fov: 46 },
        { p: [-74, 24, -52], l: [6, 5, 20], fov: 46 },
        { p: [-46, 5.8, -6.5], l: [2, 8.5, 25], fov: 48 },
      ], 'out')
    },
    camV(T, t) {
      return T.path(t / T.dur, [
        { p: [-92, 70, -110], l: [6, 0, 10], fov: 74 },
        { p: [-68, 26, -50], l: [4, 6, 22], fov: 72 },
        { p: [-38, 5.2, -5], l: [0, 13, 26], fov: 72 },
      ], 'out')
    },
    keyart: [0.05, 2.35],
  },
  {
    // a yellow taxi through the sunset blocks of Râșcani, the camera riding alongside
    id: 'taxi', beats: 8, hour: 18.7, seed: 22,
    setup(T) {
      T.g.traffic.target = 0
      T.focusAt(-110, -150)
      const z = T.lane('N1', 'W', 0)
      T.taxi = T.puppet('taxi', { path: [[-10, z], [-240, z]], speed: 13, start: 20 })
      T.parkedAround(-110, -140)
      T.walkers(-110, -160, 34, 12)
      T.preroll(1)
    },
    cam(T, t) {
      const k = T.ease.sine(t / T.dur)
      return T.follow(T.taxi, { side: -6.2, back: T.lerp(3.2, -0.6, k), up: 1.25, lookAhead: 0.8, lookUp: 0.9, fov: 38 })
    },
    camV(T, t) {
      const k = T.ease.sine(t / T.dur)
      return T.follow(T.taxi, { side: -6.8, back: T.lerp(2.6, 0.2, k), up: 1.6, lookAhead: 0.6, lookUp: 1.6, fov: 62 })
    },
    keyart: [1.6],
  },
  {
    // the lads outside „Bere la halbă", on their heels in the last sun; one gets up
    id: 'gopniks', beats: 6, hour: 18.45, seed: 33,
    setup(T) {
      const W = -Math.PI / 2
      T.g.grass.mesh.visible = false
      T.focusAt(306, -103)
      T.gop = [
        T.char(T.gopnik(0), 309.7, -105.5, W - 0.4, 'phone'),
        T.char(T.gopnik(1), 309.2, -104.0, W + 0.22, 'squat'),
        T.char(T.gopnik(2), 309.3, -102.6, W, 'squat'),
        T.char(T.gopnik(3), 309.1, -101.2, W - 0.25, 'squat'),
      ]
      T.anchors.gop = [309.3, 2.02, -102.6]
      T.walkers(306, -103, 40, 8)
      T.preroll(1.5)
    },
    update(T, t) {
      const c = T.gop[2]
      if (t >= 0.62 && !T.up) { T.up = true; c.anim.set('idle') }
      if (T.up) { c.heading += (-Math.PI / 2 + 0.15 - c.heading) * 0.1; c.prevHeading = c.heading }
    },
    cam(T, t) {
      const k = T.ease.sine(t / T.dur)
      return { p: [T.lerp(302.4, 303.5, k), 0.82, T.lerp(-102.2, -102.7, k)], l: [309.4, 1.3, -103.1], fov: 37 }
    },
    camV(T, t) {
      const k = T.ease.sine(t / T.dur)
      return { p: [T.lerp(302.6, 303.6, k), 0.9, -102.6], l: [309.4, 1.6, -102.8], fov: 64 }
    },
    keyart: [1.4],
  },
  {
    // Tanti Valea and her cast-iron pan: slow motion into the BONG
    id: 'fight', beats: 5, hour: 18.45, seed: 44,
    setup(T) {
      const g = T.g, C = window.__CR.CAST, p = g.player, W = -Math.PI / 2
      g.grass.mesh.visible = false
      T.focusAt(306, -101)
      p.setLook(C.badanta)
      p.setWeapon('tigaie')
      p.char.setVisible(true)
      p.enableCollider(true)
      const hx = 309.4, hz = -99.5, vx = 309.35, vz = -101.3
      p.teleport(hx, g.physics.groundHeight(hx, hz, 3), hz, Math.PI)
      T.victim = T.npc(T.gopnik(2), vx, vz, 0, 'idle', { hp: 1 })
      T.victim.hp = 1
      T.anchors.bong = [vx, 2.05, vz - 0.2]
      T.char(T.gopnik(0), 310.9, -103.1, W - 0.5, 'phone')
      T.watch = T.char(T.gopnik(1), 310.8, -104.6, W - 0.3, 'squat')
      T.char(T.gopnik(3), 310.6, -106.0, W + 0.1, 'squat')
      T.walkers(306, -101, 40, 6)
      T.preroll(1)
    },
    update(T, t) {
      const g = T.g, p = g.player
      g.timeScale = t < 0.08 ? 1 : t < 0.8 ? 0.33 : 1
      if (t >= 0.1 && !T.swung) { T.swung = true; p.attackCD = 0; p.attack() }
      const v = T.victim
      if (v.fly && !T.flew) { T.flew = true; v.fly.vx *= 1.5; v.fly.vz *= 1.5; v.fly.vy = 4.6; g.cameraRig.shake(0.5) }
      if (T.flew && t > 1.05 && !T.cheer) { T.cheer = true; T.watch.anim.play('facepalm') }
    },
    cam(T, t) {
      const k = T.ease.sine(t / T.dur)
      const punch = t > 0.8 && t < 1.1 ? Math.sin((t - 0.8) / 0.3 * Math.PI) * 5 : 0
      return { p: [T.lerp(303.0, 303.7, k), 1.05, T.lerp(-100.4, -100.9, k)], l: [309.4, 1.2, -101.1], fov: 38 - punch }
    },
    camV(T, t) {
      const k = T.ease.sine(t / T.dur)
      const punch = t > 0.8 && t < 1.1 ? Math.sin((t - 0.8) / 0.3 * Math.PI) * 7 : 0
      return { p: [T.lerp(302.8, 303.5, k), 1.15, -100.9], l: [309.4, 1.45, -101.1], fov: 62 - punch }
    },
    keyart: [0.7],
  },
  {
    // night on the boulevard: a red Jiguli with two police cars on its tail
    id: 'chase', beats: 3, hour: 22.4, seed: 55,
    setup(T) {
      const g = T.g
      g.traffic.target = 0
      T.focusAt(130, -6)
      const zW = T.lane('BD', 'W', 1)
      const route = [[200, zW], [60, zW], [-100, zW]]
      T.hero = T.puppet('jiguli', { path: route, speed: 22, start: 28, color: 0x8a2a2a })
      T.cops = [T.puppet('police', { path: route, speed: 22, start: 18.5, siren: true }),
        T.puppet('police', { path: route, speed: 22, start: 8, siren: true })]
      g.vehicles.enter(T.hero)
      T.parkedAround(130, -6)
      T.preroll(1)
    },
    cam(T, t) {
      return T.follow(T.hero, { side: -9.5, back: 0.5, up: 1.2, lookAhead: -4.8, lookUp: 0.9, fov: 50 })
    },
    camV(T, t) {
      // tall frame: out in front of the Jiguli, looking back down the road at the police
      return T.follow(T.hero, { side: -2.4, back: -9, up: 1.15, lookAhead: -12, lookSide: 0.8, lookUp: 1.1, fov: 72 })
    },
    keyart: [],
  },
  {
    // …and off the boulevard in a drift, the police sliding after it
    id: 'drift', beats: 3, hour: 22.4, seed: 56,
    setup(T) {
      const g = T.g
      g.traffic.target = 0
      T.focusAt(60, -8)
      const zW = T.lane('BD', 'W', 1), xN = T.lane('V4', 'N', 0)
      const route = [[170, zW], [110, zW], [80, zW], [67, zW - 2.2], [xN + 0.6, -15.5], [xN, -34], [xN, -130]]
      const apex = T.arcNear(route, xN + 2.2, zW - 5.5)
      const bell = (x) => (Math.abs(x) < 1 ? Math.cos(x * Math.PI / 2) ** 2 : 0)
      const speed = (t, s) => 21.5 - 6 * bell((s - apex) / 26) + (s > apex ? Math.min(5, (s - apex) * 0.12) : 0)
      const slip = (t, s) => -0.64 * bell((s - apex - 2) / 15)
      T.hero = T.puppet('jiguli', { path: route, speed, slip, start: apex - 33, color: 0x8a2a2a })
      T.cops = [T.puppet('police', { path: route, speed, slip, start: apex - 42.5, siren: true }),
        T.puppet('police', { path: route, speed, slip, start: apex - 52, siren: true })]
      g.vehicles.enter(T.hero)
      T.parkedAround(60, -8)
      T.preroll(1)
    },
    cam(T, t) {
      const h = T.hero.mesh.position
      const k = T.ease.sine(t / 1.2)
      return { p: [T.lerp(56.2, 56.6, k), 1.05, T.lerp(-17.5, -18.1, k)], l: [T.lerp(h.x, 64, 0.4), 1.0, T.lerp(h.z, -6, 0.35)], fov: 50 }
    },
    camV(T, t) {
      const h = T.hero.mesh.position
      const k = T.ease.sine(t / 1.2)
      return { p: [T.lerp(56, 56.4, k), 1.2, T.lerp(-18.5, -19.1, k)], l: [T.lerp(h.x, 63, 0.5), 1.5, T.lerp(h.z, -8, 0.4)], fov: 72 }
    },
    keyart: [0.95],
  },
  {
    // the four who came back, in PMAN at golden hour
    id: 'crew', beats: 8, hour: 18.0, seed: 66,
    setup(T) {
      const C = window.__CR.CAST, z = -44
      T.focusAt(0, -44)
      T.crew = [
        T.char(C.stroitor, -4.2, z, 0.12, 'idle'),
        T.char(C.badanta, -1.4, z, 0.04, 'idle'),
        T.char(C.hot, 1.4, z, -0.05, 'phone'),
        T.char(C.patan, 4.2, z + 0.3, -0.14, 'squat'),
      ]
      T.crew.forEach((c, i) => { T.anchors['crew' + i] = [c.pos.x, 0, c.pos.z] })
      T.walkers(0, -44, 45, 12)
      T.preroll(1)
    },
    update(T, t) {
      const [a, b] = T.crew
      if (t >= 0.4 && !T.w1) { T.w1 = true; a.anim.play('wave') }
      if (t >= 0.8 && !T.w2) { T.w2 = true; b.anim.play('point') }
    },
    cam(T, t) {
      const k = T.ease.inout(t / T.dur)
      return { p: [T.lerp(-5.6, 5.2, k), 1.35, -38.4], l: [T.lerp(-3.6, 3.2, k), 1.02, -44], fov: 40 }
    },
    camV(T, t) {
      const k = T.ease.inout(t / T.dur)
      return { p: [T.lerp(-4.8, 4.8, k), 1.3, -38.6], l: [T.lerp(-4.4, 4.4, k), 1.2, -44], fov: 56 }
    },
    keyart: [2.3],
  },
  {
    // montage 1: a trolleybus sweeps past on the boulevard
    id: 'trolley', beats: 2.5, hour: 17.9, seed: 71,
    setup(T) {
      T.focusAt(-150, 8)
      const z = -T.g.traffic.bdLaneZ
      T.bus = T.puppet('trolleybus', { path: [[-100, z], [-240, z]], speed: 11, start: 25 })
      T.g.traffic.target = 0
      T.boulevardTraffic([-240, -60], 10, 'E')
      T.walkers(-150, 14, 30, 8)
      T.preroll(1.8)
    },
    cam(T, t) {
      const z = -T.g.traffic.bdLaneZ
      return { p: [T.lerp(-155.6, -154.8, t / T.dur), 0.62, z + 4.6], l: [-146, 2.7, z - 0.8], fov: 50 }
    },
    camV(T, t) {
      const z = -T.g.traffic.bdLaneZ
      return { p: [T.lerp(-155.6, -154.8, t / T.dur), 0.7, z + 4.8], l: [-148, 3.5, z - 0.4], fov: 72 }
    },
  },
  {
    // montage 2: Piața Centrală, tomatoes, and Nicu's "branded" tracksuits
    id: 'market', beats: 2.5, hour: 17.3, seed: 72,
    setup(T) {
      T.focusAt(230, 40)
      T.walkers(230, 40, 26, 14)
      T.preroll(2.5)
    },
    cam(T, t) {
      return { p: [T.lerp(226.2, 227.4, t / T.dur), 1.7, 26.6], l: [T.lerp(233.2, 234.4, t / T.dur), 1.8, 33], fov: 48 }
    },
    camV(T, t) {
      return { p: [T.lerp(229.4, 230.2, t / T.dur), 1.75, 26.2], l: [T.lerp(233.6, 234.4, t / T.dur), 2.2, 33], fov: 70 }
    },
  },
  {
    // montage 3: a wedding shoot at the Arc
    id: 'wedding', beats: 2.5, hour: 17.85, seed: 73,
    setup(T) {
      T.focusAt(0, 12)
      T.preroll(1.2)
      T.g.fx.confetti(0, 3.4, 20.2, 90)
      T.preroll(0.3)
    },
    cam(T, t) {
      return { p: [T.lerp(4.9, 4.3, t / T.dur), 1.35, T.lerp(9.6, 10.1, t / T.dur)], l: [-0.3, 2.5, 22.4], fov: 50 }
    },
    camV(T, t) {
      return { p: [T.lerp(2.9, 2.5, t / T.dur), 1.35, T.lerp(10.6, 11.0, t / T.dur)], l: [-0.2, 3.4, 22.4], fov: 70 }
    },
    keyart: [0.35],
  },
  {
    // montage 4: home, flat 43 in Blocul 7, the fourth wall open like a doll's house
    id: 'flat', beats: 2.5, hour: 20.4, seed: 74,
    setup(T) {
      T.flat(true)
      const R = 2600
      T.hero = T.char(T.outfit('patan', {}), R - 1.25, R - 2.45, -0.86, 'sit', 0)
      T.focusAt(R, R)
      T.preroll(0.6)
      T.warm()
    },
    cam(T, t) {
      const R = 2600
      return { p: [R + T.lerp(0.6, 0.2, t / T.dur), 1.75, R + 6.4], l: [R - 0.3, 1.3, R - 0.9], fov: 46 }
    },
    camV(T, t) {
      const R = 2600
      return { p: [R + T.lerp(-0.8, -1.1, t / T.dur), 1.7, R + 5.6], l: [R - 1.2, 1.25, R - 1.4], fov: 64 }
    },
    keyart: [0.3],
  },
  {
    // montage 5: the wardrobe, where ABIBAS becomes Lui Vuiton on the beat
    id: 'wardrobe', beats: 4, hour: 20.4, seed: 75,
    setup(T) {
      T.flat(true)
      const R = 2600
      T.looks = [
        T.outfit('patan', { top: 'abibas_top_k', bottom: 'abibas_bot_k', hat: 'abibas_kepka', shoes: 'naik_air', neck: 'lant', hand: 'seminte' }),
        T.outfit('patan', { top: 'armeni_suit', bottom: 'guccy_pants', hat: 'borsaline', shoes: 'vuiton_shoes', eyes: 'prado', hand: 'vuiton_bag', neck: 'lant' }),
      ]
      T.hero = T.char(T.looks[0], R + 3.1, R - 0.3, -Math.PI / 2 + 0.35, 'idle')
      T.focusAt(R, R)
      T.preroll(0.5)
      T.warm()
    },
    update(T, t) {
      const c = T.hero
      if (t >= 0.8 && !T.swapped) { T.swapped = true; c.setSpec(T.looks[1]); c.heading = c.prevHeading = -Math.PI / 2 + 0.2; c.anim.play('shrug') }
    },
    cam(T, t) {
      const R = 2600
      return { p: [R + T.lerp(0.2, 0.55, t / T.dur), 1.4, R + 1.3], l: [R + 3.05, 1.02, R - 0.35], fov: 44 }
    },
    camV(T, t) {
      const R = 2600
      return { p: [R + T.lerp(0.5, 0.8, t / T.dur), 1.3, R + 0.7], l: [R + 3.05, 1.05, R - 0.3], fov: 58 }
    },
    keyart: [1.2],
  },
  {
    // end card: the city from above at golden hour, held still behind the logo
    id: 'end', beats: 8, hour: 18.15, seed: 88, still: true,
    setup(T) {
      T.focusAt(0, 0)
      T.boulevardTraffic([-160, 160], 16)
      T.preroll(3)
    },
    cam() { return { p: [150, 72, 88], l: [0, 0, 6], fov: 45 } },
    camV() { return { p: [130, 80, 100], l: [0, 0, 0], fov: 70 } },
  },
]

// on-screen text: at/len in beats from the start of the cut; x/y are fractions of the screen
// (xV/yV for the vertical cut); size is px at 1080p [16:9, 9:16]; anchor pins it to a world point
export const OVERLAYS = [
  { type: 'logo', at: 0, len: 5, x: 0.5, y: 0.45, yV: 0.4, size: [236, 204] },
  { type: 'caption', at: 8, len: 6.3, text: 'DUPĂ {y}7 ANI{/y} AFARĂ…', x: 0.5, y: 0.83, yV: 0.7, size: [110, 100] },
  { type: 'bubble', at: 16.8, len: 4.1, text: 'Bratan! Te-ai întors?!', anchor: 'gop', size: [54, 58] },
  { type: 'flash', at: 23, len: 0.04, alpha: 0.4 },
  { type: 'pow', at: 23, len: 2.8, text: 'BONG!', anchor: 'bong', size: [190, 180] },
  { type: 'stars', at: 26.6, len: 5.3, n: 3, x: 0.5, y: 0.12, yV: 0.2, size: [96, 104], through: true },
  { type: 'caption', at: 32, len: 7.8, text: 'CINE S-{y}O ÎNTORS{/y}?', x: 0.5, y: 0.15, yV: 0.22, size: [110, 104] },
  { type: 'name', at: 33, len: 6.8, text: 'VASEA „STROIKA”', sub: 'OPT ANI PE ȘANTIERE', anchor: 'crew0', dy: 0.08, size: [72, 66] },
  { type: 'name', at: 34, len: 5.8, text: 'TANTI VALEA', sub: 'BADANTĂ LA PADOVA', anchor: 'crew1', dy: 0.08, size: [72, 66] },
  { type: 'name', at: 35, len: 4.8, text: 'MARCEL „SCOȚIANU”', sub: '„LOGISTICĂ” ÎN ANGLIA', anchor: 'crew2', dy: 0.08, size: [72, 66] },
  { type: 'name', at: 36, len: 3.8, text: 'VITALIK', sub: 'PAȚANUL DE PE RAION', anchor: 'crew3', dy: 0.08, size: [72, 66] },
  { type: 'caption', at: 40, len: 2.35, text: 'TROLEIBUZE', x: 0.5, y: 0.84, yV: 0.72, size: [90, 86], outT: 0.08 },
  { type: 'caption', at: 42.5, len: 2.35, text: 'PIAȚA CENTRALĂ', x: 0.5, y: 0.84, yV: 0.72, size: [90, 86], outT: 0.08 },
  { type: 'caption', at: 45, len: 2.35, text: 'NUNȚI LA ARC', x: 0.5, y: 0.84, yV: 0.72, size: [90, 86], outT: 0.08 },
  { type: 'caption', at: 47.5, len: 2.35, text: 'ACASĂ, LA BLOCUL 7', x: 0.5, y: 0.84, yV: 0.72, size: [90, 86], outT: 0.08 },
  { type: 'brand', at: 50, len: 1.9, text: 'ABIBAS', bg: '#111', fg: '#fff', x: 0.26, y: 0.3, xV: 0.5, yV: 0.26, size: [104, 96], outT: 0.08 },
  { type: 'brand', at: 52, len: 1.9, text: 'Lui Vuiton', bg: '#5a3a1e', fg: '#e8c872', x: 0.26, y: 0.3, xV: 0.5, yV: 0.26, size: [104, 96], outT: 0.08 },
  { type: 'end', at: 54, len: 8, tag: 'Te-ai întors acasă.<br>{y}Chișinăul nu te-a așteptat.{/y}', cta: 'JOACĂ GRATIS ÎN BROWSER', url: 'dancolta.github.io/chisinau-rush', x: 0.5, y: 0.5, yV: 0.46, size: [214, 200] },
]

// the soundtrack: the chase sârbă (D harmonic minor) at 150 BPM, stingers and sfx on the beat.
// at is in beats; vehicles are fake cars for the vehicle audio engine (engines, skids, sirens)
// around a listener at the origin looking down -z.
export const SCORE = {
  track: 'chase', from: 0, gain: 2.1,
  events: [
    { at: 0, amb: 'city' },
    { at: 0, sting: 'chapter', duck: [0.5, 0.8] },
    { at: 0, sfx: 'whoosh', vol: 1.2, pitch: 0.6 },
    { at: 7, sfx: 'whoosh', vol: 0.5, pitch: 1.1 },
    { at: 9.5, horn: 'taxi', vol: 0.8 },
    { at: 15, sfx: 'whoosh', vol: 0.5, pitch: 0.9 },
    { at: 16.9, voice: { pitch: 0.82, type: 'gruff' }, text: 'Bratan! Te-ai întors?!', vol: 1.2 },
    { at: 21, sfx: 'whoosh', vol: 0.9, pitch: 0.45 },
    { at: 22.4, musicDuck: [0.12, 0.08] },
    { at: 23, sfx: 'metal_hit', vol: 1.5, pitch: 0.95 },
    { at: 23, sfx: 'punch_heavy', vol: 0.9 },
    { at: 23.3, sfx: 'ko', vol: 0.9 },
    { at: 23.3, musicDuck: [1, 0.15] },
    { at: 26, sfx: 'siren_whoop', vol: 1 },
    { at: 32, sfx: 'whoosh', vol: 0.6, pitch: 0.8 },
    { at: 33, sfx: 'hover', vol: 0.8 },
    { at: 34, sfx: 'hover', vol: 0.8, pitch: 1.12 },
    { at: 35, sfx: 'hover', vol: 0.8, pitch: 1.26 },
    { at: 36, sfx: 'hover', vol: 0.8, pitch: 1.5 },
    { at: 40, horn: 'trolleybus', vol: 0.9 },
    { at: 42.5, voice: { pitch: 1.05, type: 'female' }, text: 'Roșii de Moldova!', vol: 0.9 },
    { at: 45, sfx: 'crowd_cheer', vol: 0.8 },
    { at: 45, sfx: 'camera_shutter', vol: 0.9 },
    { at: 47.5, sfx: 'door', vol: 0.8 },
    { at: 50, sfx: 'cash', vol: 0.9 },
    { at: 52, sfx: 'cash', vol: 0.9, pitch: 1.2 },
    { at: 54, sfx: 'whoosh', vol: 1.1, pitch: 0.55 },
    { at: 54, sfx: 'impact', vol: 0.6, pitch: 0.7 },
    { at: 56, stop: true, fade: 0.06 },
    { at: 56, sting: 'mission_pass', tr: 2 },
  ],

  vehicles: [
    { kind: 'taxi', player: true, at: 7, len: 8, speed: [13, 13], pos: [0, 0, 0] },
    { kind: 'jiguli', player: true, at: 26, len: 6, speed: [22, 19], drift: [29.8, 31.2], pos: [0, 0, 0] },
    { kind: 'police', siren: true, at: 26, len: 6, speed: [20, 17], pos: [6, 0, 46], pos2: [-8, 0, 26] },
    { kind: 'police', siren: true, at: 26, len: 6, speed: [20, 17], pos: [-6, 0, 66], pos2: [8, 0, 40] },
  ],

}

// ---- options --------------------------------------------------------------------------------
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const flag = (k) => args.includes('--' + k)
const OUT = path.resolve(opt('out', path.join(ROOT, 'downloads')))
const FORMATS = { '16x9': { W: 1920, H: 1080, portrait: false, file: 'chisinau-rush-teaser.mp4' }, '9x16': { W: 1080, H: 1920, portrait: true, file: 'chisinau-rush-teaser-vertical.mp4' } }
const formatArg = opt('format', '16x9')
const formats = formatArg === 'both' ? ['16x9', '9x16'] : [formatArg]
const only = opt('only', '') ? opt('only', '').split(',') : null
const at = opt('at', '') ? opt('at', '').split(',').map(Number) : null
const preview = flag('preview')
const every = +opt('every', preview ? 3 : 1)
const quality = opt('quality', preview ? 'low' : 'high')
const scale = +opt('scale', preview ? 1 / 3 : 1)
const port = +opt('port', 5321)

// shot timing on the global frame grid
let frame0 = 0
for (const s of SHOTS) { s.start = frame0; s.frames = Math.round(s.beats * BEAT); frame0 += s.frames }
const TOTAL = frame0
const DUR = TOTAL / FPS

// ---- page side: helpers (installed once per page) ---------------------------------------------
async function pageLib(o) {
  const g = window.__game, THREE = window.THREE
  const { composeSpec } = await import('/src/data/wardrobe.js')
  const T = window.__T = { g, o, t: 0, f: 0, cars: [], npcs: [], chars: [], pilots: [], shot: null, anchors: {} }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
  const lerp = (a, b, k) => a + (b - a) * k
  T.clamp = clamp; T.lerp = lerp
  T.ease = {
    lin: (k) => k,
    inout: (k) => k * k * (3 - 2 * k),
    out: (k) => 1 - (1 - k) ** 3,
    in: (k) => k * k * k,
    sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
  }
  // camera path through keyframes [{ p, l, fov }] (Catmull-Rom), k = 0..1 over the shot
  const cr = (a, b, c, d, k) => { const k2 = k * k, k3 = k2 * k; return 0.5 * (2 * b + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k2 + (-a + 3 * b - 3 * c + d) * k3) }
  T.path = (k, keys, ease = 'inout') => {
    k = T.ease[ease](clamp(k, 0, 1))
    const n = keys.length - 1
    const x = k * n, i = Math.min(n - 1, Math.floor(x)), u = x - i
    const K = (j) => keys[clamp(j, 0, n)]
    const mix = (prop) => [0, 1, 2].map((c) => cr(K(i - 1)[prop][c], K(i)[prop][c], K(i + 1)[prop][c], K(i + 2)[prop][c], u))
    const fa = K(i).fov ?? 50, fb = K(i + 1).fov ?? fa
    return { p: mix('p'), l: mix('l'), fov: lerp(fa, fb, u), roll: lerp(K(i).roll || 0, K(i + 1).roll || 0, u) }
  }
  // camera riding along a vehicle: side > 0 is the car's right, back > 0 behind it
  T.follow = (v, { side = 0, back = 6, up = 2, lookAhead = 6, lookUp = 1, lookSide = 0, fov = 50 }) => {
    const m = v.mesh.position, h = v.prevHeading + Math.atan2(Math.sin(v.heading - v.prevHeading), Math.cos(v.heading - v.prevHeading)) * g.alpha
    const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h)
    return {
      p: [m.x - fx * back + rx * side, m.y + up, m.z - fz * back + rz * side],
      l: [m.x + fx * lookAhead + rx * lookSide, m.y + lookUp, m.z + fz * lookAhead + rz * lookSide],
      fov,
    }
  }

  // ---- hooks: our camera after the world has moved, our focus for what spawns where -----------
  const rig = g.cameraRig, cam = g.camera
  const rigUpdate = rig.update.bind(rig)
  rig.update = (dt, rawDt) => {
    const fn = T.shot && (o.portrait && T.shot.camV ? T.shot.camV : T.shot.cam)
    if (!fn) return rigUpdate(dt, rawDt)
    const c = fn(T, T.t)
    cam.position.set(c.p[0], c.p[1], c.p[2])
    rig.applyShake(rawDt)
    cam.up.set(0, 1, 0)
    cam.lookAt(c.l[0], c.l[1], c.l[2])
    if (c.roll) cam.rotateZ(c.roll)
    if (c.fov && Math.abs(cam.fov - c.fov) > 1e-4) { cam.fov = c.fov; cam.updateProjectionMatrix() }
    rig.updateCutout(null)
  }
  const focus = g.focus.bind(g)
  g.focus = () => T.focus || focus()
  const sf = g.renderer.updateShadowFocus.bind(g.renderer)
  g.renderer.updateShadowFocus = (f) => sf(T.shadowFocus || T.focus || f)
  T.focusAt = (x, z, y = 0) => { T.focus = new THREE.Vector3(x, y, z) }

  // no floating lost-dossier pickups (with their light beams) anywhere in the film
  g.progress.dosare = Array.from({ length: 30 }, (_, i) => i)
  for (const d of g.story.acts.dosarSpots()) if (d.obj) { d.obj.dispose(); d.obj = null }
  // quiet UI: no HUD, no ticker, no toasts, bubbles or menus from the game itself
  g.ui.showHud(false)
  g.ui.ticker(false)
  g.ui.top.style.display = 'none'
  g.renderer.tod.paused = true
  g.debug.noStory = true
  if (g.story.events) g.story.events.t = 1e9

  // night lights cost a lot in software rendering; by day they're off anyway
  T.lamps = (on) => {
    const nl = g.nightLights
    for (const s of nl.slots) s.light.visible = on
    nl.fill.visible = on; nl.head.visible = on
  }

  // ---- scene reset between shots: every shot starts from the same state ---------------------
  T.reset = (shot) => {
    for (const k of Object.keys(T)) if (!T.base.has(k)) delete T[k]
    T.anchors = {}
    window.__seed(shot.seed ?? 1)
    for (const d of [...g.traffic.drivers]) if (!d.v.def.trolley) g.traffic.despawn(d)
    for (const v of [...g.vehicles.list]) if (!v.def.trolley && v.driver !== 'player') g.vehicles.remove(v)
    g.vehicles.parkedActive.clear()
    for (const s of g.vehicles.parkedSlots) s.taken = false
    for (const n of [...g.peds.list]) g.peds.remove(n)
    for (const s of g.ambient.spots) if (s.npcs) g.ambient.despawn(s)
    for (const n of T.npcs) { const i = g.ambient.npcs.indexOf(n); if (i >= 0) g.ambient.npcs.splice(i, 1); n.dispose() }
    for (const c of T.chars) { const i = g.npcs.indexOf(c); if (i >= 0) g.npcs.splice(i, 1); c.dispose() }
    for (const o of g.police.officers) o.dispose()
    g.police.officers.length = 0
    g.police.cars.length = 0
    g.police.level = 0; g.police.heat = 0
    T.cars = []; T.npcs = []; T.chars = []; T.pilots = []
    g.timeScale = 1; g.hitstopT = 0
    g.cameraRig.trauma = 0
    g.traffic.time = shot.lights ?? 0
    g.traffic.target = 22
    g.grass.mesh.visible = true
    for (const q of T.trolleys) { q.d.v.teleport(q.x, q.y, q.z, q.h); q.d.dir = q.dir; q.d.stopT = 0; q.d.lastStop = null }
    const cv = g.renderer.renderer.domElement
    cv.style.transform = ''; cv.style.filter = ''
    g.traffic.spawnT = 0; g.peds.spawnT = 0; g.ambient.t = 0
    g.fx.clear?.()
    const p = g.player
    if (p.vehicle) g.vehicles.exit(true)
    p.control = false
    if (p.weapon !== 'fist') p.setWeapon('fist')
    p.char.setVisible(false)
    p.enableCollider(false)
    T.focus = null; T.shadowFocus = null
    g.renderer.tod.set(shot.hour ?? 17.8)
    T.lamps((shot.hour ?? 17.8) > 19.6 || (shot.hour ?? 17.8) < 6)
    g.renderer.updateEnvironment(true)
    g.renderer.indoors = false
    if (g.home.group) g.home.group.visible = false
    if (g.home.inside) { g.home.inside = false; g.cameraRig.room = null }
  }

  // simulate ahead without drawing (traffic finds its pace, people settle into their poses)
  T.preroll = (secs) => {
    const n = Math.round(secs * 30)
    for (let i = 0; i < n; i++) { T.t = (i - n) / 30; T.runUpdate(); window.__cap.step(1 / 30, false) }
    T.t = 0
  }
  T.runUpdate = () => { if (T.shot?.update) T.shot.update(T, T.t) }
  // one drawn frame that never makes it into the film: shaders and textures of a new set get
  // compiled and uploaded before the first real frame
  T.warm = () => { T.t = -1 / 30; T.runUpdate(); window.__cap.step(1 / 30, true); T.t = 0 }

  // ---- things in the scene ---------------------------------------------------------------------
  // the traffic AI class isn't exported: borrow it from a car the traffic system spawns itself
  for (let i = 0; i < 80 && !T.AIDriver; i++) {
    const v = g.traffic.spawnOne(g.player.pos.x + (i % 7) * 20, g.player.pos.z)
    const d = v && g.traffic.drivers.find((x) => x.v === v)
    if (d) { T.AIDriver = d.constructor; g.traffic.despawn(d) }
  }
  // the fixed coordinate of lane k of a road going dir (E/W: a z, N/S: an x)
  T.lane = (roadId, dir, k = 0) => {
    const G = g.traffic.graph
    const e = G.edges.find((q) => q.road.id === roadId && q.dir === dir)
    const p = G.lanePoint(e, Math.min(k, e.lanes - 1), 0.5)
    return dir === 'E' || dir === 'W' ? p.z : p.x
  }
  // AI traffic on the boulevard between x0 and x1, both directions
  T.boulevardTraffic = ([x0, x1], n, dir = null) => {
    const tr = g.traffic, G = tr.graph
    const AIDriver = T.AIDriver
    const edges = G.edges.filter((e) => Math.abs(e.from.z) < 1 && Math.abs(e.to.z) < 1 && Math.max(e.from.x, e.to.x) > x0 && Math.min(e.from.x, e.to.x) < x1 && (!dir || e.dir === dir))
    if (!AIDriver || !edges.length) return
    const kinds = ['logan', 'taxi', 'logan', 'jiguli', 'hatch', 'combi', 'gwagon', 'rutiera', 'logan', 'taxi']
    for (let i = 0; i < n; i++) {
      const e = edges[i % edges.length], lane = Math.floor(Math.random() * e.lanes)
      const p = G.lanePoint(e, lane, 0.1 + Math.random() * 0.8)
      if (p.x < x0 || p.x > x1) continue
      if (g.vehicles.list.some((o) => (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < 64)) continue
      const v = g.vehicles.spawn(kinds[i % kinds.length], p.x, p.z, Math.atan2(e.fx, e.fz), { y: 0 })
      const d = new AIDriver(tr, v, e, lane)
      tr.drivers.push(d)
      v.body.setLinvel({ x: e.fx * d.cruise * 0.8, y: 0, z: e.fz * d.cruise * 0.8 }, true)
    }
  }
  // parked cars along the kerbs near a point (normally they appear as you drive up)
  T.parkedAround = (x, z) => { g.vehicles.updateParked(x, z) }
  // people walking the pavements around a point
  T.walkers = (x, z, r, n) => {
    const P = g.peds
    const nodes = P.nodes.filter((q) => Math.hypot(q.x - x, q.z - z) < r)
    for (let i = 0; i < n && nodes.length; i++) {
      const q = nodes[Math.floor(Math.random() * nodes.length)]
      const npc = P.spawn(q.x + (Math.random() - 0.5) * 3, q.z + (Math.random() - 0.5) * 3)
      npc.node = q
      P.repath(npc)
    }
  }
  // a posed character (no brain): state is an Animator state (idle, squat, sit, phone, talk…)
  T.char = (spec, x, z, ry, state = 'idle', y = null) => {
    const C = window.__CR.Character
    const c = new C(g, spec, { x, y: y ?? g.physics.groundHeight(x, z, 3), z, ry })
    c.anim.set(state)
    g.npcs.push(c)
    T.chars.push(c)
    return c
  }
  // a person with a brain and a body (can be punched, knocked down…)
  T.npc = (spec, x, z, ry, state = 'idle', opts = {}) => {
    const n = g.peds.spawn(x, z, spec, { personality: 'tough', ...opts })
    g.peds.list.splice(g.peds.list.indexOf(n), 1)
    g.ambient.npcs.push(n)
    T.npcs.push(n)
    n.persistent = true
    n.state = state; n.path = []
    n.char.heading = n.char.prevHeading = ry
    n.home = { x, z, ry }
    return n
  }
  // a car that follows a path exactly (velocity-driven, so it still rolls, bumps and leaves
  // skid marks): path = [[x, z], …], speed m/s or fn(t), slip = fn(t) radians of drift
  T.puppet = (kind, { path, speed = 10, slip = null, start = 0, delay = 0, color, siren = false, hits = false }) => {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
    const L = curve.getLength()
    const u0 = start / L
    const p0 = curve.getPointAt(Math.min(1, u0)), t0 = curve.getTangentAt(Math.min(1, u0))
    const v = g.vehicles.spawn(kind, p0.x, p0.z, Math.atan2(t0.x, t0.z), { y: g.physics.groundHeight(p0.x, p0.z), color })
    v.keep = true
    v.siren = siren
    T.cars.push(v)
    const pilot = { v, s: start, t: -delay, curve, L, hits }
    const sp = typeof speed === 'function' ? speed : () => speed
    v.driver = { puppet: true }
    v.fixedUpdate = function (h) {
      if (this.disposed) return
      this.prev.copy(this.pos); this.prevHeading = this.heading
      pilot.t += h
      if (pilot.t < 0) { this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.speed = 0; return }
      pilot.s = Math.min(L, pilot.s + sp(pilot.t, pilot.s) * h)
      const u = pilot.s / L
      const q = curve.getPointAt(u), tg = curve.getTangentAt(u)
      const dir = Math.atan2(tg.x, tg.z)
      const sl = slip ? slip(pilot.t, pilot.s) : 0
      const want = dir + sl
      const tr = this.body.translation()
      const gy = this.groundAt(q.x, q.z, tr.y)
      const vx = (q.x - tr.x) / h, vz = (q.z - tr.z) / h
      const r = this.body.rotation(), cur = 2 * Math.atan2(r.y, r.w)
      let dh = want - cur
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      this.body.setLinvel({ x: vx, y: gy !== null ? (gy - tr.y) * 18 : 0, z: vz }, true)
      this.body.setAngvel({ x: 0, y: dh / h, z: 0 }, true)
      this.heading = cur
      const fx = Math.sin(want), fz = Math.cos(want)
      this.speed = vx * fx + vz * fz
      this.lateral = vx * -fz + vz * fx
      // front wheels point along the path, the body can slide
      const ahead = curve.getTangentAt(Math.min(1, u + 4 / L))
      this.steerVis = clamp(-Math.atan2(Math.sin(Math.atan2(ahead.x, ahead.z) - want), Math.cos(Math.atan2(ahead.x, ahead.z) - want)) * 1.4, -0.6, 0.6)
      this.handbrake = Math.abs(sl) > 0.25
      this.braking = false
    }
    T.pilots.push(pilot)
    v.pilot = pilot
    return v
  }

  // arc length along a route ([[x, z], …]) nearest to a point
  T.arcNear = (path, x, z) => {
    const curve = new THREE.CatmullRomCurve3(path.map(([a, b]) => new THREE.Vector3(a, 0, b)), false, 'centripetal', 0.5)
    const L = curve.getLength()
    let best = 0, bd = 1e9
    for (let i = 0; i <= 600; i++) { const q = curve.getPointAt(i / 600), d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = i / 600 * L } }
    return best
  }
  // the lads of the courtyard: three stripes, any colour as long as it's dark
  const TRACK = [0x1c2a5a, 0x14161c, 0x6a1a1a, 0x24402a, 0x34343c, 0x1a3a6a, 0x4a2a5a]
  T.gopnik = (k) => {
    const b = window.__CR.CAST['gopnik' + (1 + (k % 3))], c = TRACK[(k * 3 + 1) % TRACK.length]
    return { ...b, top: { ...b.top, color: c }, bottom: { ...b.bottom, color: k % 2 ? c : 0x14161c } }
  }
  T.outfit = (type, outfit) => composeSpec(type, outfit)
  // flat 43 in Blocul 7: the cutaway set, lit by its own lamp
  window.__seed(4343)
  g.home.build()
  g.home.group.visible = false
  T.flat = (on) => { g.home.group.visible = on; g.renderer.indoors = on }
  // scripted cars don't run people over
  const hits = g.peds.vehicleHits.bind(g.peds)
  g.peds.vehicleHits = () => {
    const all = g.vehicles.list
    g.vehicles.list = all.filter((v) => !v.pilot || v.pilot.hits)
    try { hits() } finally { g.vehicles.list = all }
  }
  // the trolleybuses keep running between shots: every shot puts them back where they were
  T.trolleys = g.traffic.drivers.filter((d) => d.v.def.trolley).map((d) => ({ d, x: d.v.pos.x, y: d.v.pos.y, z: d.v.pos.z, h: d.v.heading, dir: d.dir }))

  // ---- overlays: the trailer's own layer over the game, driven frame by frame ---------------------
  const layer = document.createElement('div')
  layer.id = 'trl'
  document.getElementById('app').appendChild(layer)
  T.layer = layer
  const S = Math.min(o.W, o.H) / 1080 // 1 at 1080p, both orientations
  const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; layer.appendChild(e); return e }
  const fmt = (s) => String(s).replace(/\{y\}/g, '<span class="y">').replace(/\{\/y\}/g, '</span>')
  const back = (k) => { const c = 1.70158 * 1.3; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2 }
  T.items = (o.overlays || []).map((d) => {
    const size = (Array.isArray(d.size) ? (o.portrait ? d.size[1] : d.size[0]) : d.size || 60) * S
    let e
    if (d.type === 'logo') e = el('trl-logo', 'CHIȘINĂU<span>RUSH</span>')
    else if (d.type === 'caption') e = el('trl-cap', fmt(d.text))
    else if (d.type === 'kicker') e = el('trl-kick', fmt(d.text))
    else if (d.type === 'bubble') e = el('trl-bubble', fmt(d.text))
    else if (d.type === 'pow') e = el('trl-pow', fmt(d.text))
    else if (d.type === 'stars') e = el('trl-stars', '<i>★</i><i>★</i><i>★</i><i>★</i><i>★</i>')
    else if (d.type === 'name') e = el('trl-name', `<b>${fmt(d.text)}</b><small>${fmt(d.sub || '')}</small>`)
    else if (d.type === 'brand') e = el('trl-brand', fmt(d.text))
    else if (d.type === 'end') e = el('trl-end', `<div class="trl-logo">CHIȘINĂU<span>RUSH</span></div><div class="tag">${fmt(d.tag)}</div><div class="cta">${fmt(d.cta)}</div><div class="url">${fmt(d.url)}</div>`)
    else if (d.type === 'flash') e = el('trl-flash', '')
    else if (d.type === 'fade') e = el('trl-fade', '')
    else e = el('trl-cap', fmt(d.text || ''))
    e.style.fontSize = size + 'px'
    if (d.bg) e.style.background = d.bg
    if (d.fg) e.style.color = d.fg
    e.style.display = 'none'
    return { d, e }
  })
  // world point -> screen fraction
  const _p = new THREE.Vector3()
  T.screen = (x, y, z) => { _p.set(x, y, z).project(cam); return { x: _p.x * 0.5 + 0.5, y: -_p.y * 0.5 + 0.5, behind: _p.z > 1 } }
  T.anchors = {}
  T.overlay = (frame) => {
    const t = frame / 30
    for (const { d, e } of T.items) {
      const t0 = d.at * o.beat / 30, t1 = (d.at + d.len) * o.beat / 30
      const inT = d.inT ?? (d.type === 'logo' ? 0.28 : d.type === 'flash' ? 0 : 0.18)
      const outT = d.outT ?? (d.type === 'flash' ? 0.3 : d.type === 'end' ? 0 : 0.16)
      const cut = (o.cuts.find((c) => c > d.at + 1e-6) ?? 1e9) * o.beat / 30
      if (t < t0 || t > t1 + outT || (!d.through && t >= cut - 1e-6) || (d.anchor && !T.anchors[d.anchor])) { e.style.display = 'none'; continue }
      e.style.display = ''
      const k = t - t0
      let x = o.portrait && d.xV !== undefined ? d.xV : d.x ?? 0.5
      let y = o.portrait && d.yV !== undefined ? d.yV : d.y ?? 0.5
      if (d.anchor) { const a = T.anchors[d.anchor]; if (a) { const s = T.screen(a[0], a[1], a[2]); x = s.x; y = s.y } }
      y += (o.portrait && d.dyV !== undefined ? d.dyV : d.dy) || 0
      let sc = 1, op = 1, rot = 0, dx = 0, dy = 0
      if (d.type === 'flash') { op = clamp(1 - (t - t0) / Math.max(0.05, t1 - t0 + outT), 0, 1) * (d.alpha ?? 0.9) }
      else if (d.type === 'fade') { op = clamp(k / Math.max(0.01, t1 - t0), 0, 1) }
      else if (d.type === 'logo' || d.type === 'pow') {
        // slam: big and blurred to size with an overshoot
        const a = clamp(k / inT, 0, 1)
        sc = a < 1 ? lerp(d.type === 'pow' ? 0.3 : 2.4, 1, back(a)) : 1 + (k - inT) * 0.035
        op = clamp(k / (inT * 0.45), 0, 1)
        rot = d.type === 'pow' ? lerp(-14, -4, clamp(k / inT, 0, 1)) : 0
        e.style.filter = a < 1 && d.type === 'logo' ? `blur(${(1 - a) * 10 * S}px)` : 'none'
      } else {
        // pop in, settle, pop out
        const a = clamp(k / inT, 0, 1)
        sc = a < 1 ? lerp(0.6, 1, back(a)) : 1
        op = clamp(k / (inT * 0.6), 0, 1)
        if (d.from === 'left') { dx = -(1 - T.ease.out(a)) * 0.3; sc = 1 }
        if (d.from === 'right') { dx = (1 - T.ease.out(a)) * 0.3; sc = 1 }
        if (d.from === 'up') { dy = -(1 - T.ease.out(a)) * 0.08; sc = 1 }
      }
      if (t > t1 && outT > 0) { const b = clamp((t - t1) / outT, 0, 1); op *= 1 - b; sc *= 1 + b * 0.12 }
      if (d.type === 'stars') {
        const lit = d.n ?? 3
        ;[...e.children].forEach((s, i) => { s.className = i < lit ? ((Math.floor(k * 4) % 2 === 0) ? 'on' : 'on dim') : '' })
      }
      if (d.type === 'end') {
        // staggered: logo, tagline, call to action, address
        const parts = [...e.children]
        parts.forEach((p, i) => {
          const ki = k - (d.stagger || [0, 0.35, 0.7, 0.95])[i]
          const a = clamp(ki / 0.3, 0, 1)
          p.style.opacity = clamp(ki / 0.15, 0, 1)
          p.style.transform = i === 0 ? `scale(${a < 1 ? lerp(2.2, 1, back(a)) : 1 + (ki - 0.3) * 0.02})` : `translateY(${(1 - T.ease.out(a)) * 30 * S}px)`
          if (i === 0) p.style.filter = a < 1 ? `blur(${(1 - a) * 10 * S}px)` : 'none'
        })
      }
      e.style.opacity = op
      const ty = d.type === 'bubble' ? -100 : -50
      e.style.transformOrigin = d.type === 'bubble' ? '50% 100%' : '50% 50%'
      e.style.transform = `translate(${(x + dx) * o.W}px, ${(y + dy) * o.H}px) translate(-50%, ${ty}%) rotate(${rot}deg) scale(${sc})`
    }
  }

  // one video frame: script, simulate + draw, place the text
  T.frame = (shotFrame, globalFrame, draw) => {
    T.t = shotFrame / 30
    T.f = globalFrame
    T.runUpdate()
    window.__cap.step(1 / 30, draw)
    T.overlay(globalFrame)
    if (T.shot?.still) {
      const k = Math.min(1, T.t / 0.45), cv = g.renderer.renderer.domElement
      cv.style.transform = `scale(${1.02 + T.t * 0.018})`
      cv.style.filter = `blur(${(k * k * 9 * Math.min(o.W, o.H) / 1080).toFixed(2)}px) brightness(${(1 - 0.42 * k).toFixed(3)}) saturate(${(1 + 0.15 * k).toFixed(3)})`
    }
    if (draw) { const gl = g.renderer.renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
  }
  T.base = new Set([...Object.keys(T), 'base'])
  return true
}

// ---- page side: the soundtrack, rendered offline with the game's own audio engine ------------
async function renderAudio({ score, dur, sr }) {
  const g = window.__game
  const [{ AudioEngine }, { Music, STINGERS }, { Ambience }, { VehicleAudio }, { Voices }, { TRACKS }, { VEHICLES }] = await Promise.all([
    import('/src/audio/Audio.js'), import('/src/audio/Music.js'), import('/src/audio/Ambience.js'), import('/src/audio/VehicleAudio.js'),
    import('/src/audio/Voice.js'), import('/src/audio/tracks.js'), import('/src/data/vehicles.js'),
  ])
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
  const eng = new AudioEngine(null)
  eng.ctx = ctx
  eng.build()
  await eng.decode(g.assets.audioData)
  eng.mus = new Music(eng); eng.amb = new Ambience(eng); eng.veh = new VehicleAudio(eng); eng.vox = new Voices(eng)
  eng.setVolumes({ master: 0.9, music: 1, sfx: 0.8, voice: 1 })
  eng.ready = true
  Object.defineProperty(eng, 'running', { get: () => true })
  const B = (60 / 150) // seconds per beat
  const sec = (b) => b * B
  // what happens when
  const ev = score.events.map((e) => ({ ...e, t: sec(e.at) })).sort((a, b) => a.t - b.t)
  let next = 0
  const q = (t) => Math.round(t * sr / 128) * 128 / sr
  const times = new Set()
  for (let t = 0; t < dur; t += 0.02) times.add(Math.max(128 / sr, q(t)))
  for (const e of ev) times.add(Math.max(128 / sr, q(e.t - 0.004)))
  // the music: the track starts exactly on beat `from`
  const track = TRACKS[score.track]
  const bpm0 = track.bpm
  track.bpm = 150
  let started = false
  const fire = (e, now) => {
    if (e.sting) {
      STINGERS[e.sting](eng.kit, eng.buses.sting, now + 0.004, e.tr || 0)
      if (e.duck) for (const node of [eng.buses.sduck, eng.buses.sduckWet]) {
        const p = node.gain
        p.cancelScheduledValues(now); p.setValueAtTime(p.value, now)
        p.setTargetAtTime(e.duck[0], now, 0.03)
        p.setTargetAtTime(1, now + e.duck[1], 0.25)
      }
    }
    if (e.sfx) eng.sfx(e.sfx, { vol: e.vol ?? 1, pitch: e.pitch ?? 1, bus: 'sfx' })
    if (e.horn) eng.veh.horn({ pos: { x: 0, y: 0, z: -6 }, def: VEHICLES[e.horn] || VEHICLES.logan }, e.vol ?? 1)
    if (e.voice) eng.voiceStart(e.voice, e.text, { vol: e.vol ?? 1 })
    if (e.stop) eng.mus.play('none', e.fade ?? 0.08)
    if (e.musicDuck) for (const node of [eng.buses.duck, eng.buses.duckWet]) {
      const p = node.gain
      p.cancelScheduledValues(now); p.setValueAtTime(p.value, now)
      p.linearRampToValueAtTime(e.musicDuck[0], now + e.musicDuck[1])
    }
    if (e.amb) eng.ambience(e.amb)
  }
  // vehicle audio: fake cars with scripted speeds around a listener at the origin
  const cars = (score.vehicles || []).map((c) => ({ ...c, obj: { pos: { x: 0, y: 0, z: 0 }, speed: 0, throttle: c.throttle ?? 0.7, lateral: 0, handbrake: false, def: VEHICLES[c.kind], driver: {}, siren: !!c.siren, heading: 0 } }))
  const vehAt = (now) => {
    const list = []; let pv = null
    for (const c of cars) {
      const a = sec(c.at), b = sec(c.at + c.len)
      if (now < a || now > b) continue
      const k = (now - a) / Math.max(0.01, b - a)
      const o = c.obj
      o.speed = c.speed[0] + (c.speed[1] - c.speed[0]) * k
      o.pos.x = c.pos[0] + (c.pos2 ? (c.pos2[0] - c.pos[0]) * k : 0)
      o.pos.z = c.pos[2] + (c.pos2 ? (c.pos2[2] - c.pos[2]) * k : 0)
      o.handbrake = !!(c.drift && now >= sec(c.drift[0]) && now <= sec(c.drift[1]))
      o.lateral = o.handbrake ? 8 : 0
      if (c.player) pv = o; else list.push(o)
    }
    return { list, pv }
  }
  for (const t of [...times].sort((a, b) => a - b)) {
    ctx.suspend(t).then(() => {
      const now = ctx.currentTime
      if (!started && now >= sec(score.from) - 0.13) {
        started = true
        eng.mus.play(score.track, 0.01)
        const cur = eng.mus.cur
        cur.next = sec(score.from)
        cur.level *= score.gain ?? 1
        for (const p of [cur.out.gain, cur.wet.gain]) { p.cancelScheduledValues(0); p.setValueAtTime(cur.level, 0) }
      }
      while (next < ev.length && ev[next].t <= now + 0.005) fire(ev[next++], now)
      eng.lis.x = 0; eng.lis.y = 0; eng.lis.z = 0
      if (cars.length) { const { list, pv } = vehAt(now); eng.veh.update(list, pv, now) }
      eng.mus.tick()
      eng.amb.tick(now)
      ctx.resume()
    }).catch(() => {})
  }
  const buf = await ctx.startRendering()
  track.bpm = bpm0
  // 16-bit PCM WAV, base64 for the trip back to node
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)]
  const out = new DataView(new ArrayBuffer(44 + n * 4))
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ')
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true)
  out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true)
  const bytes = new Uint8Array(out.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// the overlay look: the game's own fonts and title-screen styling, sized in px per format
const OVERLAY_CSS = `
#trl { position: fixed; inset: 0; z-index: 80; pointer-events: none; overflow: hidden; }
#trl > div { position: absolute; left: 0; top: 0; white-space: nowrap; will-change: transform, opacity; }
#trl .y { color: var(--gold); }
.trl-logo { font-family: var(--title); line-height: 0.86; color: var(--gold); letter-spacing: 0.02em; text-align: center;
  -webkit-text-stroke: 0.03em #2a1200; text-shadow: 0 0.055em 0 #6a2412, 0 0.1em 0.3em rgba(0,0,0,0.55); }
.trl-logo span { display: block; color: #fff; margin-top: 0.32em; }
.trl-cap { font-family: var(--title); color: #fff; letter-spacing: 0.03em; text-align: center; line-height: 1;
  -webkit-text-stroke: 0.028em #000; text-shadow: 0 0.06em 0 #000, 0 0 0.35em rgba(0,0,0,0.55); }
.trl-kick { font-family: var(--display); color: #f6ecd8; letter-spacing: 0.3em; text-shadow: 0 0.08em 0.3em #000; }
.trl-bubble { font-family: var(--body); font-weight: 700; color: #1b1510; background: #fff8ea; padding: 0.32em 0.62em 0.36em; border-radius: 0.55em;
  box-shadow: 0 0.18em 0.5em rgba(0,0,0,0.45); }
.trl-bubble:after { content: ''; position: absolute; left: 50%; bottom: -0.4em; margin-left: -0.4em; border: 0.4em solid transparent; border-bottom: 0; border-top-color: #fff8ea; }
.trl-pow { font-family: var(--title); color: #ffe14a; letter-spacing: 0.02em; -webkit-text-stroke: 0.05em #3a1400; text-shadow: 0 0.09em 0 #3a1400, 0 0 0.4em rgba(0,0,0,0.4); }
.trl-stars i { font-style: normal; display: inline-block; margin: 0 0.04em; color: rgba(255,255,255,0.14); -webkit-text-stroke: 0.03em rgba(255,255,255,0.55); }
.trl-stars i.on { color: #fff3c4; -webkit-text-stroke: 0.035em #3a2a00; text-shadow: 0 0 0.35em rgba(255,210,80,0.9); }
.trl-stars i.on.dim { color: rgba(255,243,196,0.35); text-shadow: none; }
.trl-name { text-align: center; }
.trl-name b { display: block; font-family: var(--title); font-weight: 400; color: var(--gold); letter-spacing: 0.03em; line-height: 1;
  -webkit-text-stroke: 0.03em #2a1200; text-shadow: 0 0.06em 0 #6a2412, 0 0 0.35em rgba(0,0,0,0.5); }
.trl-name small { display: block; margin-top: 0.26em; font-family: var(--display); font-size: 0.48em; letter-spacing: 0.22em; color: #fff; text-shadow: 0 0.1em 0.35em #000; }
.trl-brand { font-family: var(--display); padding: 0.2em 0.55em 0.24em; border-radius: 0.18em; box-shadow: 0 0.12em 0.4em rgba(0,0,0,0.5); letter-spacing: 0.04em; }
.trl-end { display: flex; flex-direction: column; align-items: center; text-align: center; }
.trl-end .tag { margin-top: 0.42em; line-height: 1.18; font-family: var(--body); font-weight: 700; font-size: 0.27em; color: #fff; text-shadow: 0 0.08em 0.3em #000; white-space: normal; }
.trl-end .cta { margin-top: 0.62em; font-family: var(--display); font-size: 0.22em; color: #1a1206; background: var(--gold); padding: 0.5em 1.1em 0.55em; border-radius: 0.5em;
  box-shadow: 0 0.2em 0 #6a2412, 0 0.3em 0.8em rgba(0,0,0,0.45); letter-spacing: 0.06em; }
.trl-end .url { margin-top: 0.62em; font-family: var(--body); font-weight: 700; font-size: 0.2em; color: #f6ecd8; letter-spacing: 0.04em; text-shadow: 0 0.08em 0.3em #000; }
.trl-flash { width: 100vw; height: 100vh; background: #fff; transform: none !important; left: 0 !important; top: 0 !important; }
.trl-fade { width: 100vw; height: 100vh; background: #000; }
`

// ---- node side ---------------------------------------------------------------------------------
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
// stream summary: ffprobe when there is one, else what ffmpeg itself says about the file
function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' })
  if (!r.error && r.status === 0) return JSON.parse(r.stdout)
  const info = runStderr([FFMPEG, '-hide_banner', '-i', file])
  return { duration: (info.match(/Duration: ([\d:.]+)/) || [])[1], streams: info.split('\n').filter((l) => /Stream #/.test(l)).map((l) => l.trim().replace(/^Stream #\S+ /, '')) }
}

async function boot(fmt) {
  const server = await createServer({
    root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), cacheDir: path.join(os.tmpdir(), 'chisinau-rush-trailer-vite'),
    server: { port, strictPort: false, host: '127.0.0.1', fs: { strict: false }, hmr: false }, logLevel: 'error',
  })
  await server.listen()
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: fmt.W, height: fmt.H } })
  page.on('pageerror', (e) => log('PAGEERROR', e.message))
  page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE', m.text().slice(0, 300)) })
  await page.addInitScript((q) => {
    localStorage.setItem('cr3d-settings', JSON.stringify({ quality: q, autoRes: false, v: 2, fov: 50 }))
    // seeded Math.random: the same film every run, and each shot reseeds so it can be rendered alone
    let s = 1
    window.__seed = (n) => { s = (n * 2654435761) >>> 0 }
    Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  }, quality)
  const t0 = Date.now()
  await page.goto(`http://127.0.0.1:${server.config.server.port}/?capture`)
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu' && window.__cap, null, { timeout: 300000 })
  log('booted in', Date.now() - t0, 'ms')
  await page.addStyleTag({ content: OVERLAY_CSS })
  await page.evaluate(async () => {
    document.getElementById('boot')?.remove()
    const g = window.__game
    await g.debug.startAt('taxi', { name: 'Vitalik', type: 'patan' })
    for (let i = 0; i < 10; i++) window.__cap.step(1 / 30, false)
    if (g.story.active) g.story.active.fail('trailer')
    for (let i = 0; i < 10; i++) window.__cap.step(1 / 30, false)
    await Promise.all(['400 100px Bangers', '400 100px Bungee', '400 100px "Paytone One"', '700 100px Rubik', '500 100px Rubik'].map((f) => document.fonts.load(f)))
  })
  // the shots' code runs in the page
  const shotSrc = SHOTS.map((s) => `{ id: ${JSON.stringify(s.id)}, still: ${!!s.still}, ${['setup', 'update', 'cam', 'camV'].filter((k) => s[k]).map((k) => `${k}: ${fnSource(s[k])}`).join(', ')} }`).join(',\n')
  await page.evaluate(`window.__SHOTS = [${shotSrc}]`)
  await page.evaluate(pageLib, { W: fmt.W, H: fmt.H, portrait: fmt.portrait, overlays: OVERLAYS, beat: BEAT, cuts: SHOTS.map((s) => s.start / BEAT) })
  return { server, browser, page }
}

// method shorthand ("setup(T) {…}") -> a function expression the page can eval
function fnSource(fn) {
  const src = fn.toString()
  if (/^(async\s+)?function\b/.test(src) || /^(async\s*)?\(?[\w\s,{}=]*\)?\s*=>/.test(src)) return src
  return (src.startsWith('async ') ? 'async function ' + src.slice(6) : 'function ' + src)
}

async function renderFormat(name) {
  const fmt = FORMATS[name]
  const tag = preview ? `${name}-preview` : name
  const framesDir = path.join(opt('frames', os.tmpdir()), `chisinau-rush-trailer-${tag}`)
  fs.mkdirSync(framesDir, { recursive: true })
  if (!at) for (const f of fs.readdirSync(framesDir)) if (/^f\d+\.png$/.test(f)) fs.rmSync(path.join(framesDir, f))
  fs.mkdirSync(OUT, { recursive: true })
  const { server, browser, page } = await boot(scale !== 1 ? { ...fmt, W: Math.round(fmt.W * scale), H: Math.round(fmt.H * scale) } : fmt)
  const keyartDir = path.join(OUT, 'keyart')
  const tStart = Date.now()
  let drawn = 0
  try {
    for (const [si, s] of SHOTS.entries()) {
      if (only && !only.includes(s.id)) continue
      log(`shot ${s.id} (${s.frames} frames from ${s.start})`)
      await page.evaluate(async ({ si, hour, seed, lights, dur }) => {
        const T = window.__T, shot = window.__SHOTS[si]
        T.reset({ hour, seed, lights })
        T.shot = shot
        T.dur = dur
        T.t = 0
        if (shot.setup) await shot.setup(T)
      }, { si, hour: s.hour, seed: s.seed, lights: s.lights, dur: s.frames / FPS })
      const want = at ? new Set(at.map((x) => Math.min(s.frames - 1, Math.round(x * FPS)))) : null
      for (let f = 0; f < s.frames; f++) {
        const gf = s.start + f
        const capture = want ? want.has(f) : gf % every === 0
        const draw = s.still ? f === 0 : capture
        const t0 = Date.now()
        await page.evaluate(({ f, gf, draw }) => window.__T.frame(f, gf, draw), { f, gf, draw })
        if (!capture) continue
        const file = want ? path.join(OUT, `still-${name}-${s.id}-${(f / FPS).toFixed(2)}.jpg`) : path.join(framesDir, `f${String(Math.floor(gf / every)).padStart(5, '0')}.png`)
        await page.screenshot({ path: file, type: want ? 'jpeg' : 'png', ...(want ? { quality: 90 } : {}), timeout: 900000 })
        drawn++
        if (!want && !preview && name === '16x9' && s.keyart?.some((k) => Math.round(k * FPS) === f)) {
          fs.mkdirSync(keyartDir, { recursive: true })
          await page.evaluate(() => { window.__T.layer.style.visibility = 'hidden' })
          await page.screenshot({ path: path.join(keyartDir, `${s.id}-${s.keyart.findIndex((k) => Math.round(k * FPS) === f) + 1}.jpg`), type: 'jpeg', quality: 95 })
          await page.evaluate(() => { window.__T.layer.style.visibility = '' })
        }
        const el = (Date.now() - tStart) / 1000
        log(`  frame ${gf}/${TOTAL} ${((Date.now() - t0) / 1000).toFixed(1)}s  (${drawn} drawn, ${(el / drawn).toFixed(1)}s avg)`)
      }
    }
    if (!at && !only && !flag('no-audio')) {
      const wav = path.join(framesDir, 'audio.wav')
      await makeAudio(page, wav)
      const out = path.join(OUT, preview ? fmt.file.replace('.mp4', '-preview.mp4') : fmt.file)
      encode(framesDir, wav, out, preview ? FPS / every : FPS, fmt)
      contactSheet(out, name)
    }
  } finally {
    await browser.close()
    await server.close()
  }
  log(`${name}: ${drawn} frames in ${((Date.now() - tStart) / 60000).toFixed(1)} min`)
}

async function makeAudio(page, wav) {
  log('audio: rendering the soundtrack offline')
  const b64 = await page.evaluate(renderAudio, { score: SCORE, dur: DUR + 0.5, sr: 48000 })
  const raw = wav.replace('.wav', '-raw.wav')
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'))
  // loudness: measure, then a linear two-pass normalisation to -14 LUFS, then trim and fade
  const meas = JSON.parse(lastJson(runStderr([FFMPEG, '-hide_banner', '-nostats', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])))
  const ln = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true`
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', `${ln},atrim=0:${DUR},afade=t=out:st=${(DUR - 0.6).toFixed(2)}:d=0.6,aresample=48000`, '-c:a', 'pcm_s16le', wav])
  log('audio: in', meas.input_i, 'LUFS →', '-14 LUFS target')
}

function runStderr(cmd) { return spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' }).stderr || '' }
function lastJson(s) { const i = s.lastIndexOf('{'); return s.slice(i, s.indexOf('}', i) + 1) }

function encode(dir, wav, out, fps, fmt) {
  log('encoding', out)
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, `f%05d.png`), '-i', wav,
    '-vf', `scale=${fmt.W}:${fmt.H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' })
  const p = probe(out)
  log('ffprobe', JSON.stringify(p))
}

function contactSheet(video, name) {
  const out = path.join(OUT, name === '16x9' ? 'teaser-contact.png' : 'teaser-contact-vertical.png')
  const n = 12, step = DUR / n
  const tile = name === '16x9' ? '4x3' : '6x2'
  const sc = name === '16x9' ? 'scale=480:-1' : 'scale=270:-1'
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `fps=1/${step.toFixed(3)},${sc},tile=${tile}:padding=4:color=black`, '-frames:v', '1', out])
  log('contact sheet', out)
}

// ---- main ---------------------------------------------------------------------------------
log(`cut: ${SHOTS.length} shots, ${TOTAL} frames, ${DUR.toFixed(2)} s at ${BPM} BPM`)
if (flag('audio-only')) {
  const { server, browser, page } = await boot({ W: 640, H: 360, portrait: false })
  try {
    const wav = path.join(OUT, 'chisinau-rush-teaser.wav')
    fs.mkdirSync(OUT, { recursive: true })
    await makeAudio(page, wav)
  } finally { await browser.close(); await server.close() }
} else {
  for (const f of formats) await renderFormat(f)
}
