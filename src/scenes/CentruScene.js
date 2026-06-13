import Phaser from 'phaser'

const WORLD_W = 2700
const WORLD_H = 2100
const SW = 10 // sidewalk width beside a road
const M = 14  // building margin from sidewalk

const HROADS = [
  { y: 520, half: 34 },              // northern avenue
  { y: 1040, half: 66, main: true }, // Bd. Ștefan cel Mare
  { y: 1620, half: 34 },             // southern avenue
]
const VX = [360, 760, 1160, 1560, 1960, 2360]
const VHALF = 26
const VY0 = HROADS[0].y - HROADS[0].half
const VY1 = HROADS[2].y + HROADS[2].half
const BD_TOP = HROADS[1].y - HROADS[1].half // 974
const BD_BOT = HROADS[1].y + HROADS[1].half // 1106
const ROAD_Y = HROADS[1].y // 1040 (boulevard centre)

// block interiors (x0,x1,cx) between cross streets
const COLS = [
  { x0: 14, x1: 310, cx: 162 },
  { x0: 410, x1: 710, cx: 560 },
  { x0: 810, x1: 1110, cx: 960 },
  { x0: 1210, x1: 1510, cx: 1360 },
  { x0: 1610, x1: 1910, cx: 1760 },
  { x0: 2010, x1: 2310, cx: 2160 },
  { x0: 2410, x1: 2686, cx: 2548 },
]
// rows: y0..y1 interior. side = which edge faces the nearest important road.
const ROWS = [
  { y0: 14, y1: 462 },    // R0 far north
  { y0: 578, y1: 950 },   // R1 north of boulevard (faces bd at y1)
  { y0: 1130, y1: 1562 }, // R2 south of boulevard (faces bd at y0)
  { y0: 1678, y1: 2086 }, // R3 far south
]

export default class CentruScene extends Phaser.Scene {
  constructor() {
    super('Centru')
    this.landmarks = []
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)
    this.solids = this.physics.add.staticGroup()
    this.buildGround()
    this.buildLandmarks()
    this.buildResidential()
    this.buildGreenery()
    this.buildStreetLife()
    this.buildTransit()
    this.buildMarket()
    this.buildMonuments()
    this.buildVergeProps()
    this.buildIon()
    this.buildCamera()
    this.buildInput()
    this.registry.set('crt', true)
    this.registry.set('nearLm', null)
    this.scene.launch('Ui')
  }

  region(x, y, w, h, key, depth) {
    this.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)
  }

  buildGround() {
    this.region(0, 0, WORLD_W, WORLD_H, 'grass', -1000)
    // Piața Marii Adunări Naționale (north of bd) + Arc forecourt (south)
    this.region(1210, 760, 300, BD_TOP - 760, 'plaza', -950)
    this.region(1230, BD_BOT, 260, 72, 'plaza', -950)
    // Grădina Publică paths (C4)
    this.region(1740, BD_BOT, 40, ROWS[2].y1 - BD_BOT, 'path', -950)
    this.region(1610, 1298, 300, 32, 'path', -949)

    HROADS.forEach((r) => this.region(0, r.y - r.half - SW, WORLD_W, (r.half + SW) * 2, 'sidewalk', -880))
    VX.forEach((x) => this.region(x - VHALF - SW, VY0, (VHALF + SW) * 2, VY1 - VY0, 'sidewalk', -880))
    HROADS.forEach((r) => {
      this.region(0, r.y - r.half, WORLD_W, r.half * 2, 'road', -870)
      if (r.main) for (let x = 16; x < WORLD_W; x += 28) this.add.image(x, r.y, 'dash').setOrigin(0, 0.5).setDepth(-860)
    })
    VX.forEach((x) => this.region(x - VHALF, VY0, VHALF * 2, VY1 - VY0, 'road', -870))
    ;[760, 1360, 1760].forEach((x) => this.region(x - 20, BD_TOP, 40, HROADS[1].half * 2, 'zebra', -862))
  }

  // place a building with its BASE (bottom-centre) at (x, baseY)
  place(x, baseY, key, name, desc, tint) {
    const img = this.add.image(x, baseY, key).setOrigin(0.5, 1).setDepth(baseY)
    if (tint !== undefined) img.setTint(tint)
    const zone = this.add.zone(x, baseY - img.height * 0.16, img.width * 0.78, img.height * 0.32)
    this.physics.add.existing(zone, true)
    this.solids.add(zone)
    if (name) this.landmarks.push({ x, y: baseY, name, desc })
    return img
  }

  // place in a row so the building sits inside the block, near the road edge
  placeRow(col, rowIdx, key, name, desc, tint, dx = 0) {
    const x = COLS[col].cx + dx
    const r = ROWS[rowIdx]
    const img = this.add.image(x, 0, key).setOrigin(0.5, 1)
    const baseY = rowIdx <= 1 ? r.y1 : Math.min(r.y0 + img.height, r.y1)
    img.destroy()
    return this.place(x, baseY, key, name, desc, tint)
  }

  labelSpot(x, y, name, desc) { this.landmarks.push({ x, y, name, desc }) }

  buildLandmarks() {
    // R1 — north of the boulevard
    this.placeRow(0, 1, 'hotel', 'Hotel Național', 'Ruina brutalistă — niciodată terminat.')
    this.placeRow(1, 1, 'opera', 'Teatrul de Operă și Balet', 'Maria Bieșu. Operă și balet.')
    this.placeRow(2, 1, 'primaria', 'Primăria Chișinău', 'Turnul cu ceas, 1902.')
    this.placeRow(3, 1, 'govern', 'Casa Guvernului', 'Față în față cu Arcul de Triumf.')
    this.placeRow(4, 1, 'parliament', 'Parlamentul', 'Dă spre Grădina Publică.')
    this.placeRow(5, 1, 'presidency', 'Președinția', 'Palatul Președintelui.', undefined, 36)
    this.place(COLS[5].cx - 52, ROWS[1].y1, 'church', 'Biserica Schimbarea la Față', 'Între Parlament și Președinție.')
    this.placeRow(6, 1, 'parliament', 'Universitatea de Stat', 'USM — alma mater a capitalei.', 0xcdbf9a)

    // R2 — south of the boulevard
    this.placeRow(0, 2, 'theatre', 'Teatrul Național „M. Eminescu"', 'Scena dramatică a țării.')
    this.placeRow(1, 2, 'museum', 'Muzeul Național de Istorie', 'Cu Lupa Capitolina în față.')
    this.placeRow(2, 2, 'museum', 'Sala cu Orgă', 'Concerte de orgă, acustică legendară.', 0xe7d6b0)
    this.placeRow(6, 2, 'gara', 'Gara Feroviară', 'Trenuri spre Iași, București, Odesa.')
    // (C5/R2 is the Piața Centrală square — built in buildMarket)

    // C3/R2 — Cathedral Park (Arc + Catedrala + Clopotnița)
    this.place(1360, BD_BOT + 70, 'arc', 'Arcul de Triumf', 'Poarta Sfântă, 1840. Față în față cu Guvernul.')
    this.place(1330, 1400, 'cathedral', 'Catedrala Nașterea Domnului', '1836. Inima Parcului Catedralei.')
    this.place(1424, 1388, 'belltower', 'Clopotnița', 'Dărâmată în 1962, refăcută în 1997.')

    // C4/R2 — Grădina Publică Ștefan cel Mare
    this.place(1690, BD_BOT + 56, 'statue', 'Monumentul lui Ștefan cel Mare', 'La intrarea în Grădina Publică.')
    this.place(1760, 1470, 'fountain', 'Fântâna Arteziană', 'Răcoare vara, patinoar iarna.')
    this.labelSpot(1760, 1314, 'Aleea Clasicilor', 'Busturile scriitorilor — Eminescu, Creangă…')
  }

  // ---- residential khrushchyovka filling the blocks ----------------------
  buildResidential() {
    const tints = [0xc4c8cd, 0xcabfa9, 0xb6c0b0, 0xc1b9c4, 0xbfc4cb]
    let n = 0
    const bloc = (x, base) => this.place(x, base, 'bloc', null, null, tints[(n++) % tints.length])
    const shops = {
      '1,0': ['shop_tucano', 'Tucano Coffee', 'Cafea de specialitate, vibe hipster.'],
      '4,0': ['shop_andys', "ANDY'S Pizza", 'Sunt peste tot în oraș.'],
      '1,3': ['shop_linella', 'Linella', 'Supermarket de cartier. Pâine, cvas, tot.'],
      '2,3': ['shop_davidan', 'DaviDan', 'Brutărie & cofetărie. Kürtos cald.'],
      '4,3': ['shop_placinte', 'La Plăcinte', 'Plăcinte fierbinți și bucate moldovenești.'],
      '5,3': ['shop_andys', "ANDY'S Pizza", 'Pizza, paste, meniul copilăriei.'],
    }
    // R0 / R3: dense 3-wide × 3-deep grids that fill the block depth
    const grids = [{ r: 0, bases: [462, 332, 202] }, { r: 3, bases: [1742, 1872, 2002] }]
    grids.forEach(({ r, bases }) => {
      COLS.forEach((c, col) => {
        const xs = [c.cx - 96, c.cx, c.cx + 96]
        bases.forEach((base, ri) => {
          xs.forEach((x, ci) => {
            const shop = ri === 0 && ci === 1 ? shops[`${col},${r}`] : null
            if (shop) this.place(x, base, shop[0], shop[1], shop[2])
            else bloc(x, base)
          })
        })
        this.add.image(c.cx - 96, bases[0] - 64, 'tree').setOrigin(0.5, 1).setDepth(bases[0] - 64)
      })
    })
    // back-fill behind the civic landmarks so R1/R2 blocks aren't half-empty
    // (skip park col 3, gradina col 4, and the Piața square col 5)
    COLS.forEach((c, col) => {
      if (col !== 3) [c.cx - 96, c.cx, c.cx + 96].forEach((x) => bloc(x, 648))
      if ([0, 1, 2, 6].includes(col)) [c.cx - 96, c.cx, c.cx + 96].forEach((x) => bloc(x, 1560))
    })
  }

  // ---- greenery in landmark blocks + parks -------------------------------
  buildGreenery() {
    // Grădina Publică (C4) — busts, benches, trees, bushes
    for (let x = 1620; x <= 1900; x += 48) this.add.image(x, 1330, 'bust').setOrigin(0.5, 1).setDepth(1330)
    const gp = [[1630, 1200], [1900, 1200], [1630, 1500], [1900, 1500], [1700, 1540], [1840, 1540]]
    gp.forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
    ;[[1670, 1250], [1850, 1250], [1670, 1440], [1850, 1440]].forEach(([x, y]) =>
      this.add.image(x, y, 'bench').setOrigin(0.5, 1).setDepth(y))
    // Cathedral Park (C3) trees
    ;[[1240, 1240], [1480, 1240], [1250, 1470], [1470, 1470]].forEach(([x, y]) =>
      this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
    // trees flanking the big civic buildings (fill the block sides)
    const flank = [[1, 1], [2, 1], [4, 1], [0, 1], [0, 2], [1, 2], [5, 1], [6, 1]]
    flank.forEach(([col, row]) => {
      const c = COLS[col], r = ROWS[row]
      const y = row <= 1 ? r.y1 - 6 : r.y0 + 110
      this.add.image(c.x0 + 22, y, 'tree').setOrigin(0.5, 1).setDepth(y)
      this.add.image(c.x1 - 22, y, 'tree').setOrigin(0.5, 1).setDepth(y)
    })
  }

  // ---- branded mini-markets + food, ALL inside the green courtyards ------
  buildStreetLife() {
    const brands = [
      ['shop_linella', 'Linella', 'Supermarket de cartier.'],
      ['shop_linella', 'Nr.1', 'Market non-stop.'],
      ['shop_linella', 'Fidesco', 'Supermarket.'],
      ['shop_linella', 'Velmart', 'Market de cartier.'],
      ['shop_davidan', 'DaviDan', 'Brutărie & cofetărie.'],
      ['shop_davidan', 'Franzeluța', 'Pâinea Chișinăului.'],
      ['shop_davidan', 'Fornetti', 'Brioșe calde.'],
      ['shop_placinte', 'La Plăcinte', 'Plăcinte fierbinți.'],
      ['shop_tucano', 'Tucano Coffee', 'Cafea de specialitate.'],
      ['shop_tucano', 'Gustok', 'Cafenea de cartier.'],
      ['shop_andys', "ANDY'S Pizza", 'Pizza & paste.'],
      ['shop_andys', 'La Taifas', 'Bucate moldovenești.'],
    ]
    let bi = 0
    const shop = (x, base) => { const b = brands[bi++ % brands.length]; this.place(x, base, b[0], b[1], b[2]) }
    // kebab joints — real Chișinău names. (Food spots → HP refill, see wiki.)
    const kebabNames = ['Star Kebab', 'Kebabistan', 'Kebabun', 'Kebastian', 'Twister Kebab']
    let ki = 0
    const food = (x, base, kind) => {
      if (kind === 'kebab') this.place(x, base, 'kebab', kebabNames[ki++ % kebabNames.length], 'Șaorma, kebab, hot-dog.')
      else this.place(x, base, 'cvas', 'Cvas la halbă', 'Cvas rece la halbă, 4 lei.')
    }
    const prop = (x, y, key) => this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y)

    // R1 courtyards (green between back-fill and landmark): cols 0,4,5
    ;[0, 4, 5].forEach((col) => {
      const c = COLS[col]
      shop(c.cx - 92, 778); shop(c.cx + 92, 778); food(c.cx + 4, 740, 'kebab')
      prop(c.cx - 50, 730, 'playground'); prop(c.cx + 54, 726, 'bench')
      prop(c.cx - 96, 724, 'tree'); prop(c.cx + 96, 724, 'tree')
    })
    // R2 courtyards: cols 0,1,2
    ;[0, 1, 2].forEach((col) => {
      const c = COLS[col]
      shop(c.cx - 92, 1340); shop(c.cx + 92, 1340); food(c.cx + 4, 1302, 'cvas')
      prop(c.cx - 50, 1392, 'bench'); prop(c.cx + 54, 1388, 'playground')
      prop(c.cx - 96, 1388, 'tree'); prop(c.cx + 96, 1388, 'tree')
    })
    // two more kebab joints (near University + Gara) so all five names appear
    food(COLS[6].cx - 92, 778, 'kebab')
    food(COLS[6].cx - 92, 1340, 'kebab')
  }

  // ---- bus / trolleybus stops + MOVING traffic --------------------------
  buildTransit() {
    this.traffic = []
    const stop = (x, y) => this.add.image(x, y, 'busstop').setOrigin(0.5, 1).setDepth(y)
    // shelters just inside the green, next to the curb
    ;[600, 1180, 1840, 2200].forEach((x) => { stop(x, BD_TOP - SW - 4); stop(x + 70, BD_BOT + SW + 26) })
    const veh = (key, x, vx) => {
      const lane = vx > 0 ? ROAD_Y - 20 : ROAD_Y + 36 // eastbound north lane / westbound south lane
      const s = this.add.image(x, lane, key).setOrigin(0.5, 1)
      s.vx = vx; s.setFlipX(vx < 0); s.setDepth(lane)
      this.traffic.push(s)
    }
    veh('trolleybus', 200, 62); veh('trolleybus', 1500, 70)
    veh('bus', 2300, -78)
    veh('parkedcar', 900, 120); veh('parkedcar', 1800, -130)
  }

  // ---- Piața Centrală — ONE square, stalls on the perimeter + arch -------
  buildMarket() {
    const c = COLS[5], r = ROWS[2]
    this.region(c.x0, r.y0 + 28, c.x1 - c.x0, r.y1 - r.y0 - 34, 'plaza', -940) // paved square
    this.place(c.cx, r.y1 - 6, 'market', 'Piața Centrală — Hala', 'Hala centrală: carne, brânză, legume.')
    // stalls ONLY around the perimeter (inside the square edges)
    const stall = (x, y) => this.add.image(x, y, 'stall').setOrigin(0.5, 1).setDepth(y)
    const top = r.y0 + 78, bot = r.y1 - 96, left = c.x0 + 26, right = c.x1 - 26
    for (let x = left; x <= right; x += 38) stall(x, top)
    for (let y = top + 42; y <= bot; y += 40) { stall(left, y); stall(right, y) }
    // big entrance arch on the boulevard side, with its name.
    // NO collider — the player walks through the arch into the square.
    const ax = c.cx, ay = r.y0 + 40
    this.add.image(ax, ay, 'piataarch').setOrigin(0.5, 1).setDepth(ay)
    this.add.text(ax, ay - 34, 'PIAȚA CENTRALĂ', {
      fontFamily: 'monospace', fontSize: '11px', color: '#f4ecd6',
      backgroundColor: '#8f2f1f', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(ay + 1)
    this.labelSpot(ax, r.y0 + 70, 'Piața Centrală', 'Cel mai mare bazar din oraș. Intră prin arc.')
  }

  // ---- monuments: Kotovsky + Ștefan -------------------------------------
  buildMonuments() {
    // paved monument squares on the R1 alley
    this.region(COLS[2].cx - 54, 712, 108, 104, 'plaza', -940)
    this.place(COLS[2].cx, 804, 'kotovsky', 'Monumentul lui Kotovsky', 'Călare — eroul controversat al orașului.')
    this.region(COLS[1].cx - 50, 716, 100, 100, 'plaza', -940)
    this.place(COLS[1].cx, 804, 'statue', 'Bustul lui Ștefan cel Mare', 'Domnitorul veghează și aici.')
    // ring each square with a few trees
    ;[COLS[1].cx, COLS[2].cx].forEach((cx) => {
      ;[[cx - 64, 740], [cx + 64, 740], [cx - 64, 812], [cx + 64, 812]].forEach(([x, y]) =>
        this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
    })
  }

  // ---- street trees + lamps on the boulevard verge (never on roads) ------
  buildVergeProps() {
    const edges = [0, ...VX, WORLD_W]
    const northY = BD_TOP - SW - 4
    const southY = BD_BOT + SW + 24
    for (let i = 0; i < edges.length - 1; i++) {
      const a = edges[i], b = edges[i + 1]
      const gs = (a === 0 ? 24 : a + VHALF + SW + 14)
      const ge = (b === WORLD_W ? WORLD_W - 24 : b - VHALF - SW - 14)
      let t = 0
      for (let x = gs; x <= ge; x += 64) {
        // skip the central plaza forecourt so it stays open
        const inForecourt = x > 1220 && x < 1500
        if (t % 2 === 0) this.add.image(x, northY, 'lamp').setOrigin(0.5, 1).setDepth(northY)
        else if (!inForecourt) this.add.image(x, northY, 'tree').setOrigin(0.5, 1).setDepth(northY)
        if (!inForecourt) {
          if (t % 2 === 0) this.add.image(x, southY, 'tree').setOrigin(0.5, 1).setDepth(southY)
          else this.add.image(x, southY, 'lamp').setOrigin(0.5, 1).setDepth(southY)
        }
        t++
      }
    }
  }

  // ---- Ion (4-direction) -------------------------------------------------
  buildIon() {
    this.anims.create({ key: 'walk-down', frames: [{ key: 'ion_down0' }, { key: 'ion_down1' }], frameRate: 8, repeat: -1 })
    this.anims.create({ key: 'walk-up', frames: [{ key: 'ion_up0' }, { key: 'ion_up1' }], frameRate: 8, repeat: -1 })
    this.anims.create({ key: 'walk-side', frames: [{ key: 'ion_side0' }, { key: 'ion_side1' }], frameRate: 8, repeat: -1 })
    this.facing = 'down'
    this.ion = this.physics.add.sprite(1360, BD_BOT + 26, 'ion_down0') // on the boulevard, by the Arc
    this.ion.body.setSize(8, 6).setOffset(2, 10)
    this.ion.setCollideWorldBounds(true)
    this.physics.add.collider(this.ion, this.solids)
  }

  buildCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.ion, true, 0.12, 0.12)
    this.cameras.main.setZoom(2.6)
    this.cameras.main.roundPixels = true
  }

  buildInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,T,Z,X')
    this.cursors = this.input.keyboard.createCursorKeys()
    this.input.keyboard.on('keydown-T', () => this.registry.set('crt', this.registry.get('crt') === false))
    this.input.keyboard.on('keydown-Z', () => this.zoomBy(0.4))
    this.input.keyboard.on('keydown-X', () => this.zoomBy(-0.4))
    this.input.on('wheel', (_p, _o, _dx, dy) => this.zoomBy(dy > 0 ? -0.25 : 0.25))
  }

  zoomBy(d) { this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + d, 1.6, 5)) }

  updateNameplate() {
    let near = null, best = 150 * 150
    for (const lm of this.landmarks) {
      const dx = this.ion.x - lm.x, dy = this.ion.y - lm.y
      const d2 = dx * dx + dy * dy
      if (d2 < best) { best = d2; near = lm }
    }
    const cur = this.registry.get('nearLm')
    const name = near ? near.name : null
    if ((cur && cur.name) !== name) this.registry.set('nearLm', near ? { name: near.name, desc: near.desc } : null)
  }

  update(_t, dt) {
    // moving traffic on the boulevard (wraps around)
    if (this.traffic) for (const v of this.traffic) {
      v.x += v.vx * (dt / 1000)
      if (v.x > WORLD_W + 130) v.x = -130
      else if (v.x < -130) v.x = WORLD_W + 130
    }

    const k = this.keys, c = this.cursors
    const speed = k.SHIFT.isDown ? 175 : 100
    let vx = 0, vy = 0
    if (k.A.isDown || c.left.isDown) vx -= 1
    if (k.D.isDown || c.right.isDown) vx += 1
    if (k.W.isDown || c.up.isDown) vy -= 1
    if (k.S.isDown || c.down.isDown) vy += 1

    const v = new Phaser.Math.Vector2(vx, vy)
    if (v.length() > 0) {
      v.normalize().scale(speed)
      this.ion.setVelocity(v.x, v.y)
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.facing = 'side'; this.ion.setFlipX(vx < 0); this.ion.anims.play('walk-side', true)
      } else if (vy < 0) {
        this.facing = 'up'; this.ion.setFlipX(false); this.ion.anims.play('walk-up', true)
      } else {
        this.facing = 'down'; this.ion.setFlipX(false); this.ion.anims.play('walk-down', true)
      }
    } else {
      this.ion.setVelocity(0, 0)
      this.ion.anims.stop()
      this.ion.setTexture(this.facing === 'side' ? 'ion_side0' : this.facing === 'up' ? 'ion_up0' : 'ion_down0')
    }
    this.ion.setDepth(this.ion.y)
    this.updateNameplate()
  }
}
