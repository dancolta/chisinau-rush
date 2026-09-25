// Dev tool: the safehouse / wardrobe / weapons block on its own, in headless Chromium.
// usage: node tools/home.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ server: { port: 5199, strictPort: false, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })
const errors = []
let current = '(setup)'
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { const t = m.text().slice(0, 600); if (!errors.includes(t)) console.log(`  !! console.error after "${current}": ${t}`); errors.push(t) } })
page.on('pageerror', (e) => { const t = 'PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 5).join(' | '); console.log(`  !! after "${current}": ${t}`); errors.push(t) })
let failed = 0
const check = (name, ok, info = '') => { current = name; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++ }
const ev = async (fn, arg) => { try { return await page.evaluate(fn, arg) } catch (e) { return { error: e.message.split('\n')[0] } } }

await page.goto(base + '?turbo=4')
await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 180000 })
await ev(async () => {
  const g = window.__game
  g.renderer.applyQuality('low')
  await g.debug.startAt('profetul')
  g.autoTalk = true
  g.renderer.tod.set(13)
  g.story.events.t = 1e9
  const T = window.__T = {
    g,
    async frames(n) { const f0 = g.frame; for (let i = 0; i < 4000 && g.frame < f0 + n; i++) await new Promise((r) => setTimeout(r, 30)) },
    async until(fn, n = 200) { for (let i = 0; i < n; i++) { if (fn()) return true; await T.frames(1) } return !!fn() },
    place(x, z, ry = 0) { const p = g.player; if (p.vehicle) g.vehicles.exit(true); p.teleport(x, g.physics.groundHeight(x, z, 6), z, ry); g.cameraRig.target.copy(p.pos); g.cameraRig.snap() },
    save() { g.progress.save(); return JSON.parse(localStorage.getItem('cr3d-save')) },
  }
})
await page.waitForTimeout(300)

// ================================ the flat ====================================================
let r = await ev(() => {
  const g = window.__game, d = g.home.door, home = g.world.places.acasa
  const it = g.interaction.items.get('home_enter')
  return { d: Math.hypot(d.x - home.x, d.z - home.z), item: !!it, on: it?.enabled() }
})
check('the flat\'s door is Blocul 7\'s stairwell', r.d < 20 && r.item && r.on, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g
  g.police.setLevel(1)
  await g.home.enter()
  const blocked = !g.home.inside
  g.police.clear()
  return { blocked }
})
check('no going home with the police after you', r.blocked, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  localStorage.removeItem('cr3d-save')
  await g.home.enter()
  await T.frames(3)
  const inRoom = Math.abs(p.pos.x - 2600) < 4.5 && Math.abs(p.pos.z - 2600) < 3
  // walk at the open side of the room: the invisible wall stops you
  const bx = p.pos.x, bz = p.pos.z
  p.teleport(2600, 0, 2601.5, 0)
  g.input.down.add('KeyW')
  await T.frames(40)
  g.input.down.delete('KeyW')
  const wall = +(p.pos.z - 2600).toFixed(2)
  p.teleport(bx, 0, bz, -Math.PI / 2)
  return { inside: g.home.inside, inRoom, room: !!g.cameraRig.room, indoors: g.renderer.indoors, mini: document.querySelector('.minimap-wrap')?.classList.contains('indoors'), saved: !!localStorage.getItem('cr3d-save'), bed: g.interaction.items.get('home_bed').enabled(), wall }
})
check('entering the flat', r.inside && r.inRoom && r.room && r.indoors && r.mini && r.saved && r.bed, JSON.stringify(r))
check('the open wall still stops you', r.wall > 2.2 && r.wall < 3.0, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  pr.hp = 20
  g.renderer.tod.set(23)
  g.autoChoices = [0]
  await g.home.sleep()
  const s = JSON.parse(localStorage.getItem('cr3d-save'))
  return { hour: +g.renderer.tod.hour.toFixed(2), hp: pr.hp, max: pr.maxHp, savedHour: +(s?.hour ?? -1).toFixed(2) }
})
check('sleeping on the divan: morning, full health, saved', Math.abs(r.hour - 8) < 0.2 && r.hp === r.max && Math.abs(r.savedHour - 8) < 0.2, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  delete pr.flags.sarmaleAt
  pr.hunger = 0.2
  const first = await g.home.fridge()
  const fed = pr.hunger
  const second = await g.home.fridge()
  const xp0 = pr.xp
  delete pr.flags.tvDay
  await g.home.tv()
  return { first, fed, second, xp: pr.xp - xp0, screen: g.home.screen.material.map === g.home.screenOff }
})
check('mama\'s sarmale, once in a while', r.first === true && r.fed > 0.99 && r.second === false, JSON.stringify(r))
check('the TV shows the news', r.xp === 5 && r.screen, JSON.stringify(r))

// ================================ weapons & the chest ===============================================
r = await ev(() => {
  const g = window.__game, pr = g.progress
  const W = window.__weapons || null
  pr.weapons = ['fist']; pr.carry = []; pr.weapon = 'fist'
  const res = []
  for (const k of ['covor', 'sticla', 'par', 'bata', 'pistol']) res.push(g.gear.give(k, { quiet: true }))
  return { res, carry: pr.carry.slice(), weapons: pr.weapons.slice(), weapon: pr.weapon }
})
check('four weapons on you, the fifth goes home', JSON.stringify(r.res) === '[true,true,true,true,false]' && r.carry.length === 4 && !r.carry.includes('pistol') && r.weapons.includes('pistol'), JSON.stringify(r))

r = await ev(() => {
  const g = window.__game, pr = g.progress
  pr.weapon = 'bata'; g.player.setWeapon('bata')
  const out = g.home.toggleCarry('bata')
  const dropped = pr.weapon === 'fist' && !pr.carry.includes('bata')
  const inn = g.home.toggleCarry('pistol')
  const full = g.home.toggleCarry('bata')
  const cyc = []
  for (let i = 0; i < 6; i++) { g.combat.cycleWeapon(g.player); cyc.push(pr.weapon) }
  return { out, dropped, inn, full, carry: pr.carry.slice(), cyc }
})
check('the chest: leave one, take another, never more than four', r.out && r.dropped && r.inn && r.full === false && r.carry.includes('pistol') && r.carry.length === 4, JSON.stringify(r))
check('[Q] cycles only what you carry', !r.cyc.includes('bata') && r.cyc.includes('pistol') && r.cyc.includes('fist'), JSON.stringify(r.cyc))

r = await ev(async () => {
  const g = window.__game
  let rows = null
  const od = g.ui.dialogue
  await new Promise((res) => {
    g.home.chest().then(res)
    setTimeout(() => { rows = { carry: g.ui.panel.items.map((i) => i.id) }; g.ui.panel.setTab(1); rows.home = g.ui.panel.items.map((i) => i.id); g.ui.panel.close() }, 400)
  })
  return rows
})
check('the chest panel lists both sides', r?.carry?.length === 4 && r?.home?.includes('bata'), JSON.stringify(r))

// ================================ leaving ==============================================================
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player
  await g.home.exit()
  // a lad from the courtyard joins, then you go back up
  const lad = g.peds.spawn(p.pos.x + 1.5, p.pos.z + 1.5, { ...window.__CR.CAST.gopnik1 })
  g.crew.recruit(lad, 300)
  await g.home.enter()
  const held = lad.waiting && lad.held
  await T.frames(20)
  const stayed = g.crew.list.includes(lad)
  await g.home.exit()
  await T.frames(4)
  const d = g.home.door
  return { held, stayed, following: !lad.waiting && lad.state === 'follow', out: !g.home.inside && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 3, room: !g.cameraRig.room, hidden: !g.home.group.visible, indoors: g.renderer.indoors }
})
check('leaving: back at the stairwell, the set hidden', r.out && r.room && r.hidden && r.indoors === false, JSON.stringify(r))
check('your crew waits downstairs and follows again', r.held && r.stayed && r.following, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g
  g.crew.dismissAll()
  await g.home.enter()
  g.progress.hurt(1000)
  await T.until(() => !g.home.inside, 20)
  const res = { inside: g.home.inside, room: !!g.cameraRig.room }
  await new Promise((r) => setTimeout(r, 7000))
  g.progress.hp = g.progress.maxHp
  return res
})
check('fainting at home puts you back outside cleanly', r.inside === false && r.room === false, JSON.stringify(r))

// ================================ the wardrobe & the shops ==========================================
r = await ev(() => {
  const g = window.__game
  const kinds = [...new Set(g.wardrobe.spots.map((s) => s.kind))].sort()
  return { kinds, n: g.wardrobe.spots.length, stall: !!g.interaction.items.get('clothes_piata') }
})
check('clothes shops: Piața, Moda de Milano, Second Hand', r.kinds.join() === 'milano,piata,second' && r.stall, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  const s = g.wardrobe.spots.find((q) => q.kind === 'milano')
  T.place(s.x, s.z, s.ry)
  pr.lei = 3000
  pr.respect.pol = 10
  const tier0 = pr.tier('pol')
  let seen = null
  const shop = g.wardrobe.openShop('milano', s.ry)
  await T.until(() => g.ui.panel, 20)
  const P = g.ui.panel
  const first = P.items[0]?.id
  P.move(1)
  await T.frames(4)
  await new Promise((r) => setTimeout(r, 200))
  seen = g.player.char.spec.top?.style
  P.move(-1)
  await new Promise((r) => setTimeout(r, 200))
  await P.pick()
  const worn = pr.outfit.top
  P.close()
  await shop
  await T.frames(2)
  return { first, preview: seen, worn, owned: pr.clothes.includes('armeni_suit'), lei: pr.lei, style: g.player.char.spec.top?.style, pol: pr.look.pol, tier0, tier1: pr.tier('pol'), cut: !!g.cameraRig.cut }
})
check('boutique: try-on preview, buy the suit, wear it', r.first === 'armeni_suit' && r.preview === 'shirt' && r.worn === 'armeni_suit' && r.owned && r.lei === 2100 && r.style === 'suit' && !r.cut, JSON.stringify(r))
check('the suit makes cops friendlier (look +10)', r.pol === 10 && r.tier0 === 0 && r.tier1 === 1, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  pr.lei = 0
  const shop = g.wardrobe.openShop('milano', 0)
  await T.until(() => g.ui.panel, 20)
  const P = g.ui.panel
  P.move(1)
  await new Promise((r) => setTimeout(r, 200))
  const id = P.items[P.sel].id
  const ok = await g.wardrobe.pickItem(P.items[P.sel])
  P.close()
  await shop
  await T.frames(2)
  return { id, ok, owned: pr.clothes.includes(id), top: pr.outfit.top, style: g.player.char.spec.top?.style }
})
check('no money, no shirt (and the try-on is undone)', r.ok === false && !r.owned && r.top === 'armeni_suit' && r.style === 'suit', JSON.stringify(r))

r = await ev(() => {
  const g = window.__game, pr = g.progress
  const copy = JSON.parse(JSON.stringify(pr.serialize()))
  pr.load(copy)
  g.wardrobe.apply()
  return { top: pr.outfit.top, clothes: pr.clothes.slice(), style: g.player.char.spec.top?.style, tie: !!g.player.char.spec.top?.tie }
})
check('outfit and wardrobe survive save/load', r.top === 'armeni_suit' && r.clothes.includes('armeni_suit') && r.style === 'suit' && r.tie, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  pr.lei = 500
  const st = g.wardrobe.stall
  T.place(st.x, st.z, 0)
  const lei0 = pr.lei
  const pistol = pr.weapons.includes('pistol')
  g.autoChoices = [1]
  await g.wardrobe.stallMenu()
  return { weapons: pr.weapons.slice(), spent: lei0 - pr.lei, pistol }
})
check('Nicu\'s stall sells the frying pan', r.weapons.includes('tigaie') && r.spent === 55, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  pr.lei = 500
  const shop = g.wardrobe.openShop('piata', 0)
  await T.until(() => g.ui.panel, 20)
  const P = g.ui.panel
  const tabs = []
  for (let i = 0; i < 8; i++) { tabs.push(P.tab); P.setTab(i + 1) }
  // the Abibas top, via the keyboard
  P.setTab(0)
  await new Promise((r) => setTimeout(r, 300))
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const worn = pr.outfit.top
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
  await Promise.race([shop, new Promise((r) => setTimeout(r, 3000))])
  return { tabs: [...new Set(tabs)], worn, open: !!g.ui.panel, gop: pr.look.gop, spec: g.player.char.spec.top?.style }
})
check('Piața stall: Abibas via the keyboard, Esc closes', r.worn === 'abibas_top_k' && !r.open && r.spec === 'tracksuit' && r.gop >= 8, JSON.stringify(r))

r = await ev(async () => {
  const T = window.__T, g = T.g, pr = g.progress
  // the flashy look raises the gopniks' toll
  pr.lei = 2000
  for (const id of ['armeni_suit', 'vuiton_bag']) { if (!pr.clothes.includes(id)) pr.clothes.push(id) }
  pr.setOutfit({ top: 'armeni_suit', hand: 'vuiton_bag' })
  const rich = pr.look.rich
  const s = g.ambient.spots.find((q) => q.archetype === 'gopnik')
  T.place(s.x + 20, s.z)
  g.ambient.t = 0
  await T.until(() => s.npcs, 40)
  const lei0 = pr.lei
  g.autoChoices = [0]
  await g.life.shakeTalk(s, s.npcs[0])
  return { rich, paid: lei0 - pr.lei }
})
check('designer clothes: the toll goes up (10 + 15 per 💰)', r.rich === 4 && r.paid === 70, JSON.stringify(r))

// ================================ the new weapons in a fight =============================================
r = await ev(async () => {
  const T = window.__T, g = T.g, p = g.player, pr = g.progress
  const q = g.world.places.pman
  T.place(q.x, q.z, 0)
  await T.frames(2)
  const h = p.char.heading
  const out = {}
  const civ = (d, side = 0) => { const x = p.pos.x + Math.sin(h) * d + Math.cos(h) * side, z = p.pos.z + Math.cos(h) * d - Math.sin(h) * side; const n = g.peds.spawn(x, z, { ...window.__CR.CAST.vanzatoare }, { personality: 'normal' }); n.state = 'idle'; n.path = []; n.hp = n.maxHp = 60; return n }
  const swing = async (k, target) => {
    if (!pr.carry.includes(k)) { if (pr.carry.length >= 4) pr.carry.pop(); pr.carry.push(k) }
    if (!pr.weapons.includes(k)) pr.weapons.push(k)
    pr.weapon = k; p.setWeapon(k)
    const x0 = p.pos.x, z0 = p.pos.z
    for (let i = 0; i < 6 && target.hp >= 60; i++) { p.attackCD = 0; p.aimYaw = null; p.attack(); const f0 = g.frame; for (let j = 0; j < 40 && g.frame < f0 + 8; j++) await new Promise((r) => setTimeout(r, 80)) }
    return { hit: target.hp < 60, moved: +Math.hypot(p.pos.x - x0, p.pos.z - z0).toFixed(2) }
  }
  const far = civ(6)
  out.pistol = await swing('pistol', far)
  out.pistolStun = far.stun > 0 || far.state === 'flee'
  g.peds.remove(far)
  const pan = civ(1.2)
  out.pan = await swing('tigaie', pan)
  out.panStun = pan.stun > 0 || pan.char.ko
  const a = civ(1.4, -0.7), b = civ(1.4, 0.7)
  out.broom = await swing('matura', a)
  out.broomBoth = a.hp < 60 && b.hp < 60
  for (const k of ['cheie', 'umbrela', 'bata']) p.setWeapon(k)
  out.meshes = true
  return out
})
check('water pistol hits at 6 m without a lunge', r.pistol?.hit && r.pistol?.moved < 1 && r.pistolStun, JSON.stringify(r))
check('the frying pan stuns', r.pan?.hit && r.panStun, JSON.stringify(r))
check('the broom sweeps two at once', r.broom?.hit && r.broomBoth, JSON.stringify(r))

r = await ev(async () => {
  const g = window.__game, pr = g.progress
  pr.lei = 1000
  pr.weapons = ['fist']; pr.carry = []; pr.weapon = 'fist'
  let offers = null
  const od = g.ui.dialogue
  // answer the shop dialogues directly: look at Borea's list, buy the wrench and the broom
  g.ui.dialogue = async (sp, L, o) => {
    const c = o?.choices || []
    if (!offers) offers = c.map((x) => x.text)
    const want = c.findIndex((x) => /Cheia|mătură/.test(x.text || ''))
    return want >= 0 ? want : c.length - 1
  }
  await g.story.acts.boreaShop()
  await g.story.acts.vovaService()
  await g.story.acts.neluService()
  g.ui.dialogue = od
  return { borea: offers, weapons: pr.weapons.slice() }
})
check('Borea sells the bat, not the market\'s stuff', r.borea?.some((t) => /oină/.test(t)) && !r.borea?.some((t) => /Tigaie|apă|Umbrela|Cheie|Mătura/.test(t)), JSON.stringify(r.borea))
check('Vova sells the wrench, Nelu the broom', r.weapons.includes('cheie') && r.weapons.includes('matura'), JSON.stringify(r.weapons))

r = await ev(() => {
  const g = window.__game, pr = g.progress
  pr.respect.gop = 60; pr.respect.bab = 60
  pr.addRespect('gop', 15); pr.addRespect('bab', 15)
  return { bata: pr.weapons.includes('bata'), umbrela: pr.weapons.includes('umbrela'), flags: [pr.flags.giftBata, pr.flags.giftUmbrela] }
})
check('gifts at the top tier: the bat from the lads, the umbrella from the grannies', r.bata && r.umbrela, JSON.stringify(r))

r = await ev(async () => {
  const g = window.__game, pr = g.progress
  pr.carry = pr.carry.filter((k) => k !== 'cheie')
  g.menus.showPause('char')
  await new Promise((r) => setTimeout(r, 300))
  const txt = document.querySelector('.pause')?.textContent || ''
  g.menus.closePause()
  return { home: /acasă, în ladă/.test(txt), look: /haine \+/.test(txt) }
})
check('pause screen: weapons at home, clothes bonuses', r.home && r.look, JSON.stringify(r))

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
console.log('console errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none')
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
