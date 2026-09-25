import { CAST, randomCivilian } from '../../data/outfits.js'
import { banner } from '../../story/missions/common.js'
import { Rhythm, play } from '../Minigames.js'
import { dist, pick, hourIn, placeSpot, sceneSpot, leash, payout, speaker, lockPlayer, face, lose } from './common.js'

// A wedding with no DJ: he's at another wedding, in Ialoveni. You plug your phone into the
// speaker and dance the hora for the whole party, arrow keys on the beat of the brass band.
// The guests join in while you're good and give up on you when you're not.

const BRIDE = { ...CAST.vanzatoare, top: { style: 'shirt', color: 0xfbfaf4 }, bottom: { style: 'dress', color: 0xfbfaf4, long: true }, hair: { style: 'bun', color: 0x5a3a22 }, stockings: 0xf2e6da, shoes: 0xf2f2f2 }
const GROOM = { ...CAST.agent, top: { style: 'suit', color: 0x15171d, shirt: 0xffffff, tie: 0xe8e8e8 }, bottom: { color: 0x15171d }, sunglasses: false, hold: undefined }
const NAS = { ...CAST.deputat, top: { style: 'suit', color: 0x3a2a1a, shirt: 0xf2f2f2, tie: 0xb0181e }, bottom: { color: 0x3a2a1a }, glasses: false }
const HOST = speaker('Nașul Grigore', 'Nunta Ionuț & Cristina', NAS, { pitch: 0.85, type: 'gruff' })
const BRIDE_SP = speaker('Mireasa', 'Cristina, azi regină', BRIDE, { pitch: 1.25, type: 'female' })
const PLACES = ['arc', 'pman', 'gradina', 'parc_catedrala', 'stefan', 'teatru', 'opera', 'muzeu', 'fantana', 'piata', 'circ', 'aleea_clasicilor']
const GRUMBLE = ['Unde-i DJ-ul?!', 'Fără muzică nu se mănâncă sarmalele!', 'La Ialoveni, zice, la altă nuntă…', 'Mireasa plânge, oameni buni!', 'Pune măcar ceva de pe telefon!', 'Nașul a plătit, și muzică nu-i!']
const HYPE = ['Hopa-hopa!', 'Așa, măi!', 'Uite-l cum joacă!', 'Hora, oameni buni!', 'Ăsta-i DJ-ul nou!', 'Mai tare!']
const MOVES = ['point', 'pickup', 'cheer', 'wave']

export const NUNTA = {
  id: 'ev_nunta', title: 'Nunta fără DJ', icon: '💃', who: 'Cumătra Lena',
  viber: 'SOS!!! La nunta lui Ionuț n-a venit DJ-ul, e la altă nuntă la Ialoveni. Cine știe să joace hora? Nașul plătește!',
  engage: 60,
  when: (g) => hourIn(g, 10, 23.5),
  where: (g, force) => placeSpot(g, PLACES, force ? 0 : 70, force ? 1200 : 380) || (force ? sceneSpot(g, 4, 60, { room: 3 }) : null),

  async script(m, spot) {
    const g = m.game, p = m.player
    const c = { x: spot.x, z: spot.z }
    m.data.spot = c
    // the party: the couple, the naș, guests in a ring, a speaker playing nothing
    const ring = []
    const N = 8
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3, r = 4.4 + (i % 2) * 0.6
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r
      const n = m.spawn(null, randomCivilian(Math.random), x, z, { voice: { pitch: 0.9 + Math.random() * 0.4, type: Math.random() < 0.5 ? 'female' : 'male' } })
      n.char.lookAtNow(c.x, c.z); n.home.ry = n.char.heading
      ring.push(n)
    }
    const bride = m.spawn('mireasa', BRIDE, c.x - 1.6, c.z - 1.2, { voice: BRIDE_SP.voice })
    const groom = m.spawn('mirele', GROOM, c.x - 0.9, c.z - 1.6, { voice: { pitch: 1, type: 'male' } })
    const nas = m.spawn('nasul', NAS, c.x + 1.4, c.z - 1.4, { voice: HOST.voice })
    for (const n of [bride, groom, nas]) { n.char.lookAtNow(c.x, c.z + 2); n.home.ry = n.char.heading }
    const everyone = [...ring, bride, groom, nas]
    m.prop((b) => {
      b.box(0.62, 1.1, 0.5, { y: 0.55, color: 0x1a1a1e })
      b.cyl(0.2, 0.2, 0.04, 14, { y: 0.78, z: 0.26, rx: Math.PI / 2, center: true, color: 0x55585e })
      b.cyl(0.12, 0.12, 0.04, 12, { y: 0.32, z: 0.26, rx: Math.PI / 2, center: true, color: 0x55585e })
      for (const s of [-1, 1]) b.box(0.06, 2.6, 0.06, { x: s * 2.2, y: 1.3, z: -1.8, color: 0x8a6a44 })
    }, { x: c.x + 2.6, z: c.z - 1.6, ry: 0 })
    banner(m, 'CASĂ DE PIATRĂ!', { x: c.x + 2.6, y: 2.5 + g.physics.groundHeight(c.x, c.z, 3), z: c.z - 3.4, ry: 0, w: 4.2, h: 0.8, bg: '#b0181e' })
    leash(m, c, { r: 150 })
    m.every(() => { if (Math.random() < 0.012) { const n = pick(everyone); if (n && !n.char.ko && n.state !== 'dance') n.say(pick(GRUMBLE), 2.6) } })
    await m.reach(c, 7, { text: 'Nunta lui Ionuț a rămas fără DJ. Du-te la {y}nuntă{/y}.', label: 'Nunta', inVehicle: false })
    face(nas.char, p.pos.x, p.pos.z)
    const choice = await m.say(HOST, ['Tinere! DJ-ul Vasea e la altă nuntă, la Ialoveni. A luat avans de la amândouă.', 'Pune muzica de pe telefon și joacă-ne o horă, că altfel mireasa plânge și nașa pleacă cu plicul!'], { choices: ['Dă-mi boxa. Vă arăt eu hora!', 'Nu joc, am genunchi de pensionar.'] })
    if (choice === 1) { await m.talk(HOST, 'Genunchi… Păi și noi ce, avem genunchi de fotbaliști? Na, du-te.', 3); m.cancel() }
    // on the dance floor, facing the party; the camera in front of you
    lockPlayer(m, true)
    const ang = Math.atan2(p.pos.x - c.x, p.pos.z - c.z) || 0
    p.teleport(c.x, g.physics.groundHeight(c.x, c.z, 3), c.z, ang)
    const cam = { x: c.x + Math.sin(ang) * 7.2, z: c.z + Math.cos(ang) * 7.2 }
    // the guests make a horseshoe open toward the camera, the couple and the naș behind you
    const gy = (x, z) => g.physics.groundHeight(x, z, 3)
    ring.forEach((n, i) => {
      const a = ang + 0.8 + (i / (ring.length - 1)) * (Math.PI * 2 - 1.6), r = 4.2 + (i % 2) * 0.7
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r
      n.teleport(x, gy(x, z), z)
    })
    ;[bride, groom, nas].forEach((n, i) => {
      const a = ang + Math.PI + (i - 1) * 0.55, x = c.x + Math.sin(a) * 2.3, z = c.z + Math.cos(a) * 2.3
      n.teleport(x, gy(x, z), z)
    })
    m.hold({ from: [cam.x, 2.7, cam.z], look: [c.x, 1.2, c.z] })
    m.track({ dispose: () => g.cameraRig.endShot() })
    for (const n of everyone) { n.char.lookAtNow(c.x, c.z); n.home.ry = n.char.heading; n.state = 'idle' }
    m.music('chase')
    g.audio?.sfx('go', { bus: 'ui' })
    let dancing = 0
    const res = await play(m, new Rhythm(g.side, {
      title: 'HORA LA NUNTĂ', sub: 'Mireasa se uită la tine. Nu o dezamăgi.',
      onHit: (lane, perfect, combo) => {
        p.char.anim.play(combo % 8 === 0 ? 'jump' : MOVES[lane])
        // the party joins in, one by one
        if (combo % 2 === 0 && dancing < everyone.length) { const n = everyone[dancing++]; if (n && !n.char.ko) n.state = 'dance' }
        if (combo >= 6 && Math.random() < 0.18) { const n = pick(everyone); n?.say(pick(HYPE), 1.8) }
      },
      onMiss: () => {
        if (dancing > 0 && Math.random() < 0.6) { const n = everyone[--dancing]; if (n && !n.char.ko) { n.state = 'idle'; n.char.anim.play('facepalm') } }
        if (Math.random() < 0.25) g.audio?.sfx('crowd_boo', { vol: 0.35 })
      },
    }))
    m.music(null)
    g.cameraRig.endShot()
    lockPlayer(m, false)
    m.data.result = res
    if (!res || res.ratio < 0.55) {
      for (const n of everyone) { n.state = 'idle'; if (Math.random() < 0.5) n.char.anim.play('facepalm') }
      bride.say('Mamăăă, ce rușine!', 3)
      g.side?.aura.lose(15, 'Ai jucat hora ca un NPC')
      lose(m, 'Nunta s-a mutat la Ialoveni. Cu tot cu sarmale.')
    }
    for (const n of everyone) n.state = 'dance'
    g.audio?.sfx('crowd_cheer', { vol: 0.9 })
    g.fx?.confetti(c.x, 2.6, c.z, 80)
    bride.say('Casă de piatră! Tu ești DJ-ul nostru acum!', 3)
    const full = res.full
    payout(m, { aura: 150 + (full ? 100 : 0), lei: 60, why: full ? 'FULL COMBO la nuntă!' : 'Ai salvat nunta', title: full ? 'FULL COMBO!' : 'NUNTA E SALVATĂ!', sub: `Plicul de la nași: 60 lei · ${res.hits}/${res.total} pași` })
    g.side?.linger(m, everyone, c)
    m.data.won = true
  },
}
