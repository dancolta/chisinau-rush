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

// 100 authentic Moldovan collectibles, grouped by which pickup sprite they use
// the collectible: hârtii scurse de la primărie — acte care n-ar trebui să fie pe stradă.
// You scoop them off the street and fence them to Borea (who sells them east) — the same paper the mayor smuggles.
const COLLECT_GROUPS = {
  c_dosar: ['Bon de la primărie', 'Deviz de asfalt nefolosit', 'Contract de salubrizare', 'Ștampilă uitată', 'Factură la Termoelectrica', 'Dosar cu colțul rupt', 'Hârtie cu antet de la Consiliu', 'Chitanță de cortegiu', 'Plic gros nedeschis', 'Aviz de demolare', 'Listă de deputați plecați în China', 'Notă de serviciu în rusă', 'Schiță de parc pe hârtie', 'Proces-verbal de groapă', 'Mandat de evacuator', 'Copie xerox spălăcită'],
}
const COLLECT_FLAT = Object.entries(COLLECT_GROUPS).flatMap(([tex, names]) => names.map((n) => ({ n, tex })))
const MAYOR = 'Ceon Eban' // satirical mayor (anagram parody)

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
    this.buildCoffee()
    this.buildTransit()
    this.buildMarket()
    this.buildMonuments()
    this.buildRail()
    this.buildVergeProps()
    this.buildIon()
    this.buildCamera()
    this.buildInput()
    this.initGameplay()
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
    // Cathedral Park (C3/R2) is a concrete square, not green
    this.region(COLS[3].x0, ROWS[2].y0, COLS[3].x1 - COLS[3].x0, ROWS[2].y1 - ROWS[2].y0, 'beton', -948)
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
    const gov = this.placeRow(3, 1, 'govern', 'Casa Guvernului', 'Față în față cu Arcul de Triumf.')
    this.placeRow(4, 1, 'parliament', 'Parlamentul', 'Dă spre Grădina Publică.')
    const pres = this.placeRow(5, 1, 'presidency', 'Președinția', 'Palatul Președintelui.', undefined, 36)
    this.place(COLS[5].cx - 52, ROWS[1].y1, 'church', 'Biserica Schimbarea la Față', 'Între Parlament și Președinție.')
    // Moldova flag above Casa Guvernului + Președinția
    ;[gov, pres].forEach((b) => this.add.image(b.x, b.y - b.height + 6, 'flag').setOrigin(0.5, 1).setDepth(b.y + 2))
    this.placeRow(6, 1, 'parliament', 'Universitatea de Stat', 'USM — alma mater a capitalei.', 0xcdbf9a)

    // R2 — south of the boulevard
    this.placeRow(0, 2, 'theatre', 'Teatrul Național „M. Eminescu"', 'Scena dramatică a țării.')
    this.placeRow(1, 2, 'museum', 'Muzeul Național de Istorie', 'Cu Lupa Capitolina în față.')
    this.placeRow(2, 2, 'museum', 'Sala cu Orgă', 'Concerte de orgă, acustică legendară.', 0xe7d6b0)
    this.placeRow(6, 2, 'gara', 'Gara Feroviară', 'Trenuri spre Iași, București, Odesa.')
    // (C5/R2 is the Piața Centrală square — built in buildMarket)

    // C3/R2 — Cathedral Park: one vertical line on the concrete square
    this.place(1360, BD_BOT + 70, 'arc', 'Arcul de Triumf', 'Poarta Sfântă, 1840. Față în față cu Guvernul.')
    this.place(1360, 1336, 'belltower', 'Clopotnița', 'Pe axa centrală, în spatele Arcului.')
    this.place(1360, 1504, 'cathedral', 'Catedrala Nașterea Domnului', '1836. Inima Parcului Catedralei.')

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

  // ---- Lavazza / Bonjour coffee booths in the open squares --------------
  buildCoffee() {
    const booths = [
      ['kiosk_lavazza', 1245, 925, 'Lavazza'], ['kiosk_bonjour', 1475, 925, 'Bonjour'], // PMAN plaza
      ['kiosk_bonjour', 1245, 1300, 'Bonjour'], ['kiosk_lavazza', 1475, 1300, 'Lavazza'], // Cathedral Park
      ['kiosk_lavazza', 1640, 1240, 'Lavazza'], ['kiosk_bonjour', 1880, 1240, 'Bonjour'], // Grădina Publică
    ]
    booths.forEach(([tex, x, y, name]) => {
      this.add.image(x, y, tex).setOrigin(0.5, 1).setDepth(y)
      this.landmarks.push({ x, y: y - 6, name, desc: 'Cafea la pahar, de mers.' })
    })
  }

  // ---- bus / trolleybus stops + MOVING traffic --------------------------
  buildTransit() {
    this.traffic = []
    // named horizontal shelters along the boulevard (real Chișinău stops)
    const stop = (x, y, name) => {
      this.add.image(x, y, 'busstop').setOrigin(0.5, 1).setDepth(y)
      this.landmarks.push({ x, y: y - 6, name: 'Stația ' + name, desc: 'Stație de troleibuz / autobuz.' })
    }
    ;[[600, 'Sfatul Țării'], [1245, 'Piața Marii Adunări Naționale'], [1840, 'Parlament'], [2200, 'Piața Centrală']]
      .forEach(([x, n]) => stop(x, BD_TOP - SW - 4, n))
    ;[[670, 'Teatrul de Operă'], [1250, 'Catedrala'], [1910, 'Grădina Publică'], [2270, 'Gara Feroviară']]
      .forEach(([x, n]) => stop(x, BD_BOT + SW + 26, n))
    // ROTATED shelters on the vertical cross streets (proper vertical sprite)
    const vstop = (x, y, flip, name) => {
      this.add.image(x, y, 'busstop_v').setOrigin(0.5, 1).setFlipX(flip).setDepth(y)
      this.landmarks.push({ x, y: y - 6, name: 'Stația ' + name, desc: 'Stație pe strada perpendiculară.' })
    }
    vstop(VX[1] - VHALF - SW - 12, 740, false, 'Hotel Național')
    vstop(VX[2] + VHALF + SW + 12, 1320, true, 'ASEM')
    vstop(VX[4] - VHALF - SW - 12, 760, false, 'Stadionul Republican')

    const veh = (key, x, vx) => {
      const lane = vx > 0 ? ROAD_Y - 22 : ROAD_Y + 30 // eastbound north lane / westbound south lane
      const s = this.add.image(x, lane, key)
      if (key.startsWith('topcar')) { s.setOrigin(0.5, 0.5); s.setRotation(vx > 0 ? Math.PI / 2 : -Math.PI / 2) }
      else { s.setOrigin(0.5, 1); s.setFlipX(vx < 0) } // bus/trolley stay side-view
      s.vx = vx; s.setDepth(lane)
      this.traffic.push(s)
    }
    veh('trolleybus', 200, 62); veh('trolleybus', 1500, 70); veh('bus', 2300, -78)
    // top-down cars (match the player car), many models
    const styles = ['topcar_sedan', 'topcar_cayenne', 'topcar_gwagon', 'topcar_cruiser']
    let si = 0
    const carVeh = (x, vx) => veh(styles[si++ % styles.length], x, vx)
    carVeh(500, 100); carVeh(1000, 135); carVeh(2050, 90)
    carVeh(1700, -115); carVeh(2400, -150)
  }

  // ---- railway: a STATIONARY train parked at the Gara -------------------
  // rails stay east of the last cross street so they never cross a road
  buildRail() {
    const y = 1410
    const x0 = VX[VX.length - 1] + VHALF + SW + 4 // just east of the last vertical street
    const x1 = WORLD_W
    for (let x = x0; x < x1; x += 32) this.add.image(x, y, 'rail').setOrigin(0, 0.5).setDepth(-855)
    this.region(x0, y - 30, x1 - x0, 20, 'beton', -858) // platform
    // parked train (loco + 2 wagons), front toward the east edge — does NOT move
    const head = x1 - 42
    ;[['loco', 0], ['wagon', 60], ['wagon', 112]].forEach(([key, off]) =>
      this.add.image(head - off, y + 6, key).setOrigin(0.5, 1).setDepth(y + 8))
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

  // ---- monuments + squares ----------------------------------------------
  buildMonuments() {
    // Ștefan cel Mare bust square (C1/R1)
    this.region(COLS[1].cx - 52, 716, 104, 100, 'plaza', -940)
    this.place(COLS[1].cx, 804, 'statue', 'Bustul lui Ștefan cel Mare', 'Domnitorul veghează și aici.')
    ;[[COLS[1].cx - 64, 740], [COLS[1].cx + 64, 740]].forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))

    // C2/R1 square — coffee boutiques where Kotovsky used to stand
    this.region(COLS[2].cx - 70, 712, 140, 104, 'plaza', -940)
    this.place(COLS[2].cx - 86, 804, 'shop_tucano', 'Tucano Coffee', 'Cafea de specialitate.')
    this.place(COLS[2].cx + 86, 804, 'shop_tucano', 'Gustok', 'Cafenea de cartier.', 0xc3812d)
    this.place(COLS[2].cx, 800, 'kiosk', 'Cafe-bar „La Colț"', 'Cappuccino și prăjituri.')
    ;[[COLS[2].cx - 64, 738], [COLS[2].cx + 64, 738]].forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))

    // Kotovsky — moved to the far-WEST edge, at the edge of the street
    this.region(6, BD_TOP - 74, 98, 66, 'plaza', -940)
    this.place(56, BD_TOP - 12, 'kotovsky', 'Monumentul lui Kotovsky', 'Călare, la marginea de vest a bulevardului.')
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
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,T,Z,X,Q,SPACE')
    this.cursors = this.input.keyboard.createCursorKeys()
    this.input.keyboard.on('keydown-T', () => this.registry.set('crt', this.registry.get('crt') === false))
    this.input.keyboard.on('keydown-Z', () => this.zoomBy(0.4))
    this.input.keyboard.on('keydown-X', () => this.zoomBy(-0.4))
    this.input.keyboard.on('keydown-Q', () => this.swapWeapon())
    this.input.keyboard.on('keydown-SPACE', () => this.swing())
    this.input.on('wheel', (_p, _o, _dx, dy) => this.zoomBy(dy > 0 ? -0.25 : 0.25))
    this.input.on('pointerdown', (p) => {
      if (this.frozen()) return
      const wp = this.cameras.main.getWorldPoint(p.x, p.y)
      // click an aggro'd enemy to hit it
      const h = this.homeless
      if (h && h.aggro && !h.calm && h.state !== 'ko' && (wp.x - h.spr.x) ** 2 + (wp.y - h.spr.y) ** 2 < 52 * 52) { this.hitEnemy(h); return }
      // otherwise click a building/location → reveal its name
      let near = null, best = 90 * 90
      for (const lm of this.landmarks) {
        const d = (wp.x - lm.x) ** 2 + (wp.y - lm.y) ** 2
        if (d < best) { best = d; near = lm }
      }
      if (near) { this.pin = { name: near.name, desc: near.desc }; this.pinUntil = this.time.now + 3200 }
    })
  }

  zoomBy(d) { this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + d, 1.6, 5)) }

  // ---- combat (light, comedic, non-lethal) -------------------------------
  weaponName() { return this.weapons ? this.weapons[this.weaponIdx].name : '' }

  swapWeapon() {
    if (this.frozen()) return
    if (!this.weaponUnlocked.covor && !this.weaponUnlocked.baban) { this.toast('N-ai altă armă încă — avansează în rang pentru covor/baban.'); return }
    for (let k = 1; k <= this.weapons.length; k++) {
      const idx = (this.weaponIdx + k) % this.weapons.length
      const w = this.weapons[idx]
      if (w.key === 'fist' || this.weaponUnlocked[w.key]) { this.weaponIdx = idx; break }
    }
    this.toast('Ai scos: ' + this.weapons[this.weaponIdx].name)
    this.syncHud()
  }

  buildEnemies() {
    this.enemies = []
    const spr = this.add.image(1500, 1300, 'npc_homeless').setOrigin(0.5, 1).setDepth(1300)
    this.landmarks.push({ x: 1500, y: 1294, name: 'Omul fără adăpost', desc: '„Și aiurești wai, șii cu tine?!"' })
    this.homeless = { spr, hp: 40, maxHp: 40, state: 'idle', aggro: false, calm: false, dmgT: 0, wp: [[1400, 1280], [1700, 1330], [1560, 1470], [1320, 1390]], wi: 0 }
    this.enemies.push(this.homeless)
    this.enemyBar = this.add.graphics().setDepth(99960)
  }

  hitEnemy(e) {
    const w = this.weapons[this.weaponIdx]
    if (w.heatCost) this.state.heat = Phaser.Math.Clamp(this.state.heat + w.heatCost, 0, 100)
    e.hp -= w.dmg * (this.dmgMul || 1); e.aggro = true
    const ang = Math.atan2(e.spr.y - this.ion.y, e.spr.x - this.ion.x)
    const nx = e.spr.x + Math.cos(ang) * 14, ny = e.spr.y + Math.sin(ang) * 14
    if (!this.blocked(nx, ny)) { e.spr.x = nx; e.spr.y = ny }
    this.spawnHitFx(e.spr.x, e.spr.y - 16); this.cameras.main.shake(60, 0.003)
    this.state.score += 5
    if (e.hp <= 0) this.koEnemy(e)
    this.syncHud()
  }

  swing() {
    if (this.state.driving || this.frozen()) return
    const now = this.time.now
    if (now < this.swingCD) return
    this.swingCD = now + 360
    const w = this.weapons[this.weaponIdx]
    // forgiving hit: any enemy within (range+12) of the player connects, regardless of facing
    const reach = w.range + 12
    let hit = false
    for (const e of this.enemies) {
      if (e.calm || e.state === 'ko') continue
      if ((this.ion.x - e.spr.x) ** 2 + (this.ion.y - (e.spr.y - 10)) ** 2 < reach * reach) { this.hitEnemy(e); hit = true }
    }
    // always give a swing whoosh so the player sees the attack register
    if (!hit) { this.spawnHitFx(this.ion.x + (this.ion.flipX ? -16 : 16), this.ion.y - 12); this.cameras.main.shake(40, 0.002) }
  }

  spawnHitFx(x, y) {
    const f = this.add.image(x, y, 'fx_hit').setDepth(99962)
    this.tweens.add({ targets: f, alpha: 0, scale: 1.7, duration: 200, onComplete: () => f.destroy() })
  }

  koEnemy(e) {
    e.state = 'ko'; e.aggro = false; e.spr.setAlpha(0.55)
    this.addCred(5); this.state.score += 30; this.addXp(30)
    if (e === this.homeless) { e.calm = true; this.toast('L-ai potolit. Mormăie ceva despre... un telefon în rusă.'); this.onHomelessFlip() }
  }

  befriendHomeless() {
    const e = this.homeless
    if (this.state.lei < 15) { this.toast('N-ai 15 lei să-l calmezi.'); return }
    this.state.lei -= 15; e.calm = true; e.aggro = false; e.spr.setAlpha(0.85)
    this.addCivic(8); this.toast('I-ai dat de mâncare. Se calmează și bolborosește un secret.')
    this.onHomelessFlip()
  }

  onHomelessFlip() {
    this._homelessFlipped = true // remember even before the investigation opens, so the clue is never lost
    if (this.cluesEnabled) this.addClue('homeless', 'matryoshka și un telefon rusesc în beciul primăriei')
    if (!this._matryoshkaSpawned) {
      this._matryoshkaSpawned = true
      const s = this.add.image(1360, 1255, 'c_matryoshka').setOrigin(0.5, 1).setDepth(1255)
      s.item = { n: 'Matryoshka suspectă', tex: 'c_matryoshka' }
      this.pickups.push(s)
    }
  }

  spawnFloatText(x, y, msg) {
    const t = this.add.text(x, y, msg, { fontFamily: 'monospace', fontSize: '11px', color: '#ff6b6b', backgroundColor: '#10121aCC', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(99963)
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 1500, onComplete: () => t.destroy() })
  }

  updateCombat(d) {
    const e = this.homeless
    if (!e) return
    this.enemyBar.clear()
    if (e.state !== 'ko' && !e.calm && (e.aggro || e.hp < e.maxHp)) {
      const x = e.spr.x - 9, y = e.spr.y - e.spr.height - 6
      this.enemyBar.fillStyle(0x10121a, 0.8).fillRect(x - 1, y - 1, 20, 5)
      this.enemyBar.fillStyle(0xcc3b30, 1).fillRect(x, y, 18 * Math.max(0, e.hp / e.maxHp), 3)
    }
    if (this.state.driving || this.won || this.cop || this.shopOpen) return
    if (e.state === 'ko' || e.calm) return
    const dist2 = (this.ion.x - e.spr.x) ** 2 + (this.ion.y - e.spr.y) ** 2
    if (!e.aggro && dist2 < 70 * 70) { e.aggro = true; e.dmgT = 1.0; this.spawnFloatText(e.spr.x, e.spr.y - 30, 'Și aiurești wai, șii cu tine?!') }
    if (e.aggro) {
      if (dist2 > 260 * 260) { e.aggro = false; return } // leash: he gives up the chase
      const ang = Math.atan2(this.ion.y - e.spr.y, this.ion.x - e.spr.x)
      const nx = e.spr.x + Math.cos(ang) * 58 * d, ny = e.spr.y + Math.sin(ang) * 58 * d
      if (!this.blocked(nx, e.spr.y)) e.spr.x = nx
      if (!this.blocked(e.spr.x, ny)) e.spr.y = ny
      if (dist2 < 24 * 24) { e.dmgT -= d; if (e.dmgT <= 0) { e.dmgT = 1.1; this.state.hp = Math.max(0, this.state.hp - 4); this.cameras.main.shake(80, 0.004); this.syncHud() } }
    } else {
      const wp = e.wp[e.wi]
      const ang = Math.atan2(wp[1] - e.spr.y, wp[0] - e.spr.x)
      e.spr.x += Math.cos(ang) * 22 * d; e.spr.y += Math.sin(ang) * 22 * d
      if ((wp[0] - e.spr.x) ** 2 + (wp[1] - e.spr.y) ** 2 < 120) e.wi = (e.wi + 1) % e.wp.length
    }
    e.spr.setDepth(e.spr.y)
  }

  updateNameplate() {
    let chosen = null
    if (this.pin && this.time.now < this.pinUntil) {
      chosen = this.pin // a clicked building takes priority for a few seconds
    } else if (!this.registry.get('prompt')) {
      // ambient nameplate only when there's no actionable prompt, and only up-close
      const ex = this.state.driving ? this.car.x : this.ion.x
      const ey = this.state.driving ? this.car.y : this.ion.y
      let near = null, best = 80 * 80
      for (const lm of this.landmarks) {
        const dx = ex - lm.x, dy = ey - lm.y
        const d2 = dx * dx + dy * dy
        if (d2 < best) { best = d2; near = lm }
      }
      chosen = near ? { name: near.name, desc: near.desc } : null
    }
    const cur = this.registry.get('nearLm')
    const name = chosen ? chosen.name : null
    if ((cur && cur.name) !== name) this.registry.set('nearLm', chosen)
  }

  // ======================= GAMEPLAY =======================================
  initGameplay() {
    this.state = {
      hp: 100, maxHp: 100, lei: 60, heat: 0, score: 0, combo: 0, comboT: 0, driving: false, mission: 0,
      cred: 0, civic: 0, xp: 0, satchel: 0, acteFalse: false, speedBoost: false, smuggling: false,
    }
    this.clues = { gopnik: false, borea: false, cop: false, homeless: false } // 4 actionable dovezi (consistent HUD + menu)
    this.leadOrder = ['gopnik', 'borea', 'homeless', 'cop'] // the investigation is a CHAIN: each lead points to the next
    this.leadIdx = 0
    this.cluesEnabled = false
    this.finaleReady = false
    this.won = false
    this.car = null
    this.cop = false
    this.shopOpen = false
    this.exposeOpen = false
    this.dialogOpen = false
    this.menuPause = false
    this.smuggleReturn = false
    this._homelessFlipped = false
    this.copTimer = 0
    this.hudT = 0
    this.sprintSpeed = 175
    this.potholeTime = 1.5
    this.bribeDiscount = false
    this.weaponUnlocked = { covor: false, baban: false }
    this.ranks = [
      { t: 0, name: 'Plecat peste hotare', joke: 'Ai adus euro și un frigider în rate. Acasă-i mai bine, de la distanță.' },
      { t: 200, name: 'Băiat de cartier', joke: 'Te știe toată curtea. Și ăia cu care ai datorii.' },
      { t: 500, name: 'Om cu relații', joke: 'Ai un cumătru la primărie. Acuma ai și tu pe cineva.' },
      { t: 1000, name: 'Om de afaceri', joke: 'SRL pe numele soacrei. Birou euroreparat, vedere la groapă.' },
      { t: 1800, name: 'Consilier', joke: 'Votezi ce zice partidul. Parcarea pe trotuar, inclusă.' },
      { t: 2900, name: 'Candidat', joke: 'Promiți drumuri și apă caldă. Lumea a mai auzit, da\' votează.' },
      { t: 4200, name: 'Primar de Chișinău', joke: 'Ai ajuns sus. Prima ședință: lucrăm la asta.' },
    ]
    this.rankIdx = 0
    this.buildFoodSpots()
    this.buildPickups()
    this.buildEnterCars()
    this.buildNPCs()
    this.buildEnemies()
    this.buildPotholes()
    this.weapons = [
      { key: 'fist', name: 'Pumni', dmg: 8, range: 28, knock: 90, heatCost: 0 },
      { key: 'covor', name: 'Covor', dmg: 14, range: 36, knock: 150, heatCost: 6 },
      { key: 'baban', name: 'Sticlă de baban', dmg: 11, range: 32, knock: 130, heatCost: 4 },
    ]
    this.weaponIdx = 0
    this.swingCD = 0
    this.raceLimit = 30
    this.breadTarget = this.foodSpots.find((f) => /Linella/.test(f.name)) || this.foodSpots[0]
    this.input.keyboard.on('keydown-E', () => this.onAction())
    this.input.keyboard.on('keydown-ESC', () => this.toggleMenu())
    this.input.keyboard.on('keydown-TAB', (e) => { if (e.preventDefault) e.preventDefault(); this.toggleMenu() })
    ;['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => this.input.keyboard.on('keydown-' + k, () => this.menuKey(i + 1)))
    this.input.keyboard.on('keydown-R', () => { if (this.won) { localStorage.removeItem('cr-save'); this.registry.set('win', null); this.scene.stop('Ui'); this.scene.restart() } })
    this.applyPlayer()
    if (this.registry.get('continueSave')) this.loadSave(); else { try { localStorage.removeItem('cr-save') } catch (e) {} }
    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.save() })
    this.syncHud()
    this.registry.set('mission', 'Vorbește cu Pensionara de pe bancă (E) ca să începi.')
    // minimap data
    this.registry.set('mapMeta', { ww: WORLD_W, wh: WORLD_H, roadY: ROAD_Y })
    this.registry.set('mapStatic', [
      { x: 1310, y: 965 }, { x: 1360, y: 1176 }, { x: 1360, y: 1504 },
      { x: 560, y: BD_TOP }, { x: 900, y: BD_TOP }, { x: 1860, y: BD_TOP }, { x: 2300, y: BD_TOP },
      { x: 1690, y: 1180 }, { x: COLS[5].cx, y: 1300 }, { x: COLS[6].cx, y: 1220 },
    ])
    // one-time intro so the goal is clear from the start (fresh games only)
    if (!this.registry.get('continueSave')) {
      this.time.delayedCall(400, () => this.openDialog('Chișinău Rush',
        'Te-ai întors la Chișinău și orașu-i tot strâmb: gropi, cortegii, hârtii pe jos ca frunzele. Lumea zice că primarul nu-i prost, că-i ascultător. De cine? Asta afli tu. Adună hârtiile, fă rost de patru dovezi că Ceon Eban ține orașul stricat din ordin de la est, și ia-i locul. Începe: vorbește cu Pensionara de pe bancă (apasă E).'))
    }
  }

  buildFoodSpots() {
    const info = (n) => {
      if (n.startsWith('Stația')) return null // bus stops are not eateries
      if (/Kebab|Șaorma/.test(n)) return { price: 15, hp: 25 }
      if (/Cvas/.test(n)) return { price: 0, hp: 12 } // free refill so HP is never gated by lei
      if (/Plăcinte/.test(n)) return { price: 20, hp: 40 }
      if (/ANDY/.test(n)) return { price: 25, hp: 45 }
      if (/DaviDan|Franzeluța|Fornetti/.test(n)) return { price: 14, hp: 22 }
      if (/Tucano|Gustok|Cafe|Lavazza|Bonjour/.test(n)) return { price: 12, hp: 10 }
      if (/Linella|Nr\.1|Fidesco|Velmart|Piața Centrală/.test(n)) return { price: 18, hp: 30 }
      return null
    }
    this.foodSpots = []
    for (const lm of this.landmarks) { const i = info(lm.name); if (i) this.foodSpots.push({ x: lm.x, y: lm.y, name: lm.name, ...i }) }
  }

  randomItem() { return COLLECT_FLAT[Math.floor(Math.random() * COLLECT_FLAT.length)] }

  buildPickups() {
    this.pickups = []
    const spots = [
      [300, 960], [520, 960], [1000, 960], [1500, 960], [1700, 960], [2000, 960], [2250, 960],
      [420, 1120], [900, 1120], [1500, 1120], [1900, 1120], [2100, 1120],
      [1700, 1340], [1820, 1260], [560, 790], [960, 790],
    ]
    spots.forEach((p) => {
      const it = this.randomItem()
      const s = this.add.image(p[0], p[1], it.tex).setOrigin(0.5, 1).setDepth(p[1])
      s.item = it
      this.pickups.push(s)
    })
  }

  buildEnterCars() {
    this.enterCars = []
    ;[[760, 'topcar_sedan'], [1120, 'topcar_cayenne'], [1620, 'topcar_gwagon'], [2000, 'topcar_cruiser']].forEach(([x, key]) => {
      const s = this.add.image(x, BD_TOP + 30, key).setOrigin(0.5, 0.5).setDepth(BD_TOP + 30)
      s.setRotation(Math.PI / 2) // parked along the curb
      this.enterCars.push(s)
    })
  }

  buildNPCs() {
    // quest giver — clearly marked
    this.zina = this.add.image(1250, BD_BOT + 74, 'npc_zina').setOrigin(0.5, 1).setDepth(BD_BOT + 74)
    this.landmarks.push({ x: this.zina.x, y: this.zina.y - 6, name: 'Pensionara de pe Bancă', desc: 'Pensionară, știe tot cartierul. Vorbește cu ea (E).' })
    this.zinaIcon = this.add.image(this.zina.x, this.zina.y - 38, 'questicon').setOrigin(0.5, 1).setDepth(99970)

    // 20 Moldovan NPCs (professions only) — talk to them (E) for a dialogue line
    this.talkNpcs = []
    const cast = [
      ['npc_zina', 360, 958, 'Pensionara de pe Bancă', 'Da\' tu a cui ești, băiete? Eu pe maică-ta o cunosc, stai jos.'],
      ['npc_gopnik', 700, 1122, 'Gopnicul din Curte', 'Bratan, ai o siga? Și de ce te uiți așa la mine?'],
      ['npc_c3', 1080, 958, 'Funcționara la Primărie', 'Reveniți după pauză, acuma-i tehnic pererîv. Lucrăm la asta.'],
      ['npc_c4', 1700, 1122, 'Vânzătoarea la Linella', 'Pachet luați? Doi lei. Card ori cash, mai repede, că-i coadă.'],
      ['npc_c2', 2080, 958, 'Șoferul de Rutieră', 'Treci spatele, fă loc! Transmite banii pe rând.'],
      ['npc_c5', 2300, 958, 'Pensionarul de la Piață', 'Pe vremea mea cu salariu cumpărai un Jiguli. Acuma o pungă de hrișcă.'],
      ['npc_c6', 420, 1122, 'Studenta la USM', 'Auzi, după sesiune plec în Italia ca toți. Bursa? Ajunge de-o cafea și gata.'],
      ['npc_c1', 900, 1122, 'Popa din Centru', 'Hristos a-nviat, fiule. Mașina nouă? Domnul a dat. Lasă ceva la cutie.'],
      ['npc_c7', 1380, 1122, 'Deputatul', 'Stimați alegători, anul ăsta reparăm toate gropile, vă garantez.'],
      ['npc_c0', 2120, 1122, 'Revenit din Italia', 'Allora, băieți, în Italia altă viață. Da\' acasă-i acasă, torn fundația.'],
      ['npc_c4', 2560, 1300, 'Plăcintăreasa de la Gară', 'Mănâncă, slăbănogule, ia o plăcintă cât îi caldă, de la mine cadou.'],
      ['npc_c2', 2300, 1300, 'Schimbătorul Valutar', 'Euro, dolar, ruble? Cel mai bun curs la mine, bratan, hai în colț.'],
      ['npc_c5', 1660, 1180, 'Conductorul de Troleibuz', 'Biletul, vă rog. N-aveți? Coborâți la următoarea, aici nu-i taxi gratis.'],
      ['npc_c3', 2100, 690, 'Șoferul de Evacuator', 'Ai parcat pe trotuar, băiete? Hai-hai, ți-o ridic acuma.'],
      ['npc_c4', 1080, 1122, 'Doamna Doctor', 'Ce te doare? Tensiunea de la nervi. Ia trei zile concediu și gata, că n-am ce-ți face.'],
      ['npc_c0', 300, 690, 'Marfagiul de la Piață', 'Roșii de Costești, castraveți, două kile la preț de una! Hai, că închid.'],
      ['npc_c7', 1920, 1480, 'Mecanicul din Garaj', 'Băi bratu, motorul de Logan? Îi pun turbină, faci drift pe Dacia.'],
      ['npc_c1', 1620, 1480, 'Blogherița', 'Salutare, gașcă! Azi vă arăt cel mai aesthetic kofe din Chișinău, link în bio.'],
      ['npc_c6', 1480, 1180, 'Viticultorul', 'Gustă vinul, ăsta-i de Cricova, nu apă chioară. Da\' primarul ăla ascunde ceva.'],
      ['npc_c2', 560, 690, 'Directorul de Fabrică', 'Hai să discutăm, băiete. O fabrică de mobilă, nu contează care. Numerar, da?'],
    ]
    cast.forEach(([key, x, y, label, line]) => {
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y)
      this.talkNpcs.push({ x, y, name: label, line })
      this.landmarks.push({ x, y: y - 6, name: label, desc: '' })
    })

    // ---- side-quest NPCs: fill the empty map; small one-time reward on first talk ----
    this.sideNpcs = []
    const side = [
      ['npc_c4', 1700, 1480, 'Dădaca cu Cărucior', 'Stai, nu trece pe acolo, doarme micu\'. L-am plimbat o oră prin toată Grădina Publică ca să adoarmă. Acuma mă uit la el cum doarme și mi-e frică să respir.', 15, 20, 'lei'],
      ['npc_c1', 360, 700, 'Bunica cu Borcane', 'Maică, nu vrei niște roșii murate? Le-am făcut din toamnă, am beciul plin, nu mai am unde le pune. Ia un borcan, fă-mi loc, că vine iar recolta.', 25, 20, 'lei'],
      ['npc_c3', 780, 760, 'Administratoarea de Bloc', 'Tu de la care scară ești? Ai plătit la întreținere ori iar trebuie să bat la ușă? Liftul stă de trei zile și toți tac, da\' când vine factura, atunci aveți gură.', 10, 25, 'civic'],
      ['npc_c5', 1860, 1520, 'Pescarul de pe Bancă', 'Șșș, nu sperii peștii, băiete. Eu pescuiesc aici, în iaz, pe principiu. N-am prins nimic de doi ani, da\' liniștea, asta da, asta se prinde bine.', 15, 20, 'lei'],
      ['npc_c0', 1580, 1540, 'Vânzătorul de Semințe', 'Semechki, băiete, paharul cinci lei, prăjite azi-dimineață. Coji le scuipi pe jos, așa-i tradiția, le strânge primăria, lucrează ei la asta. Ăsta-i internetul nostru.', 15, 20, 'lei'],
      ['npc_c2', 2360, 1300, 'Taximetristul fără Clienți', 'Te duc oriunde, șefu, fără taxometru, ne înțelegem pe loc. Toți acuma comandă pe telefon, eu nu-s pe aplicație, eu-s pe stradă, ca omul. Hai, urcă, îți fac preț bun.', 20, 25, 'lei'],
      ['npc_c6', 2540, 1480, 'Hamalul de la Gară', 'Geanta, valiza, sacoșele, ți le car eu până la peron, am cărucior. Eu am cărat geamantane de când mergeau trenuri și spre Moscova. Acuma mai mult stau și mă uit la șine.', 20, 25, 'lei'],
      ['npc_c4', 1100, 1000, 'Femeia de Serviciu', 'Atenție, am spălat, alunecă. Mătur bulevardul ăsta de douăzeci de ani, frunze, semințe, sticle de la voi ăștia. Curăț eu, voi murdăriți, așa-i contractul.', 10, 25, 'civic'],
      ['npc_c1', 1160, 800, 'Florăreasa de la Colț', 'Garoafe, crizanteme, trandafiri, număr impar că-i de bucurie, par numai la mormânt, ține minte. Cui îi duci flori, mamei ori vreuneia? Ia șapte, nu cinci.', 15, 20, 'lei'],
      ['npc_c3', 1560, 820, 'Reparatorul de Încălțăminte', 'Intră în gheretă, băiete, îți pun flec, îți cos talpa, cât ai zice pește. Toți aruncă acuma și cumpără chinezărie, da\' un pantof bun se repară, nu se gunoiește.', 20, 25, 'lei'],
      ['npc_c0', 2160, 1470, 'Vânzătoarea de Pește', 'Caras proaspăt azi, crap, scrumbie, miroase a râu, nu a frigider. Ia-l pe ăsta, ți-l curăț pe loc, ție-ți dau și icrele cadou. Hai, că pe la prânz rămân doar oase.', 20, 20, 'lei'],
      ['npc_c2', 2060, 1320, 'Cântăritorul de la Piață', 'Cântarul meu e cinstit, băiete, nu ca al lui de colo cu magnet sub talger. Dacă te-a tras careva în piață, vino la mine, recântăresc gratis, de principiu.', 10, 30, 'civic'],
      ['npc_c7', 1960, 1200, 'Acordeonistul din Pasaj', 'O melodie pentru tine, băiete, ceva de suflet ori ceva de joc? Lumea trece grăbită și uită că are urechi. Lasă un leu în pălărie, nu pentru mine, pentru muzică.', 15, 20, 'lei'],
      ['npc_gopnik', 200, 1500, 'Gopnicii din Buiucani', 'Bratan, aici tu nu treci așa. Întâi arăți ce poți, apoi vorbim. Ai o siga?', 8, 20, 'cred'],
      ['npc_gopnik', 1080, 1460, 'Gopnicii din Botanica', 'Bratan, stai jos, mănâncă semechki, da nu scuipa pe curtea mea. Cine ți-o dat voie să parchezi aici?', 8, 20, 'cred'],
      ['npc_gopnik', 2540, 820, 'Gopnicii din Ciocana', 'Siga, fraer, drumu ăsta îi al nostru. Vrei să treci la Borea? Plătești tribut ori faci o cursă, davai.', 8, 20, 'cred'],
      ['npc_gopnik', 2360, 1460, 'Gopnicii din Râșcani', 'Ce te uiți, bratan? În piață umblă lume cu bani, noi doar ne uităm. Tu ești cu noi ori contra?', 8, 20, 'cred'],
    ]
    side.forEach(([key, x, y, label, line, lei, xp, kind]) => {
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y)
      this.sideNpcs.push({ x, y, label, line, lei, xp, kind, done: false })
      this.landmarks.push({ x, y: y - 6, name: label, desc: 'Misiune secundară · vorbește (E)' })
    })

    // visible policemen (named) at key spots
    const cops = [
      [1310, BD_TOP - 14, 'Sergentul', 'la Casa Guvernului'],
      [1860, BD_TOP - 14, 'Caporalul', 'la Parlament'],
      [760, BD_BOT + 16, 'Sergentul', 'la trecere'],
      [1760, BD_BOT + 16, 'Plutonierul', 'la Grădina Publică'],
    ]
    cops.forEach(([x, y, name, where]) => {
      this.add.image(x, y, 'npc_cop').setOrigin(0.5, 1).setDepth(y)
      this.landmarks.push({ x, y: y - 6, name, desc: `Polițist ${where}.` })
    })

    // Gopnicii — race crew on the south verge (west)
    this.gopnik = this.add.image(440, BD_BOT + 42, 'npc_gopnik').setOrigin(0.5, 1).setDepth(BD_BOT + 42)
    this.add.image(478, BD_BOT + 46, 'npc_gopnik').setOrigin(0.5, 1).setDepth(BD_BOT + 46).setFlipX(true)
    this.landmarks.push({ x: 440, y: BD_BOT + 36, name: 'Gopnicii', desc: 'Trening, semechki, „ce te uiți?"' })
    this.raceRings = [[640, ROAD_Y], [1200, ROAD_Y], [1800, ROAD_Y], [2400, ROAD_Y]]
      .map(([x, y]) => this.add.image(x, y, 'checkpoint').setOrigin(0.5, 0.5).setDepth(y).setVisible(false).setAlpha(0.85))
    this.racing = false

    // Borea Țigan — trader living half-in a gropă (Grădina Publică)
    this.add.image(1860, 1450, 'gropa').setOrigin(0.5, 0.5).setDepth(1448)
    this.borea = this.add.image(1860, 1452, 'npc_borea').setOrigin(0.5, 1).setDepth(1452)
    this.landmarks.push({ x: 1860, y: 1446, name: 'Borea Țigan', desc: 'Negustor. Trăiește jumate în gropă.' })
    this.boreaIcon = this.add.image(1860, 1416, 'questicon').setOrigin(0.5, 1).setDepth(99970).setVisible(false)

    // Primarul — satirical mayor at a permanent ribbon-cutting in front of the Primăria
    this.add.image(922, BD_TOP - 16, 'ribbon').setOrigin(0.5, 1).setDepth(BD_TOP - 16)
    this.mayorSpr = this.add.image(960, BD_TOP - 16, 'npc_mayor').setOrigin(0.5, 1).setDepth(BD_TOP - 16)
    this.landmarks.push({ x: 947, y: BD_TOP - 22, name: MAYOR, desc: '„Lucrăm la asta." Taie panglici. Găuri și probleme cu bugetul? Guvernarea e de vină.' })

    this.marker = this.add.image(0, 0, 'marker').setOrigin(0.5, 1).setDepth(99980).setVisible(false)
    this.copSprite = this.add.image(0, 0, 'npc_cop').setOrigin(0.5, 1).setDepth(99975).setVisible(false)
  }

  syncHud() {
    const s = this.state
    const r = this.ranks[this.rankIdx], next = this.ranks[this.rankIdx + 1]
    this.registry.set('hud', {
      hp: Math.round(s.hp), maxHp: s.maxHp, lei: s.lei, heat: Math.round(s.heat), score: s.score, combo: s.combo, driving: s.driving,
      cred: s.cred, civic: s.civic, xp: s.xp, rank: r.name, xpCur: r.t, xpNext: next ? next.t : r.t,
      clues: this.clueCount(), satchel: s.satchel, weapon: this.weaponName ? this.weaponName() : '',
    })
  }

  clueCount() { return Object.values(this.clues).filter(Boolean).length }
  addCred(n) { this.state.cred = Phaser.Math.Clamp(this.state.cred + n, 0, 100); this.syncHud() } // silent: caller toasts
  addCivic(n) { this.state.civic = Phaser.Math.Clamp(this.state.civic + n, 0, 100); this.syncHud() }

  addXp(n) {
    this.state.xp += n
    let i = 0
    for (let k = 0; k < this.ranks.length; k++) if (this.state.xp >= this.ranks[k].t) i = k
    if (i > this.rankIdx) { this.rankIdx = i; this.onRankUp(i) }
    this.syncHud()
  }

  onRankUp(i) {
    const r = this.ranks[i]
    this.toast(`Nivel ${i + 1}: ${r.name}` + (r.joke ? '. ' + r.joke : ''))
    if (i >= 2) { this.weaponUnlocked.covor = true; this.bribeDiscount = true }
    if (i >= 4) { this.weaponUnlocked.baban = true; this.potholeTime = 0.9; this.sprintSpeed = 210 }
  }

  // chained investigation: a dovadă is only collectable when it's the CURRENT lead; each one points to the next.
  addClue(key, text) {
    if (this.clues[key]) return
    if (this.leadOrder[this.leadIdx] !== key) return // not the active lead yet — ignore (no early/out-of-order clues)
    this.clues[key] = true
    this.leadIdx++
    this.state.civic = Phaser.Math.Clamp(this.state.civic + 5, 0, 100)
    this.state.score += 80; this.addXp(80)
    this.toast('Dovadă găsită: ' + text)
    this.mayorReact() // the mayor notices you closing in
    this.syncHud()
    if (this.clueCount() >= 4) this.unlockFinale()
    else this.updateDovezBanner()
  }

  leadHint(key) {
    return ({
      gopnik: 'Du-te la gopnicii din curte (vest). Ei văd fiecare mașină neagră care intră.',
      borea: 'Mașina neagră o încarcă tot Borea. Du-te la el, în groapa din parc.',
      homeless: 'Nebunul din parc a văzut ce-i în beciul primăriei. Caută-l și ascultă-l.',
      cop: 'O hârtie e la un polițai care tremură. Provoacă un control și fă-l să cedeze.',
    })[key] || ''
  }

  // the dovezi as a TRAIL: done ✔, current ►, locked 🔒 — only the active lead is on the map
  updateDovezBanner() {
    if (!this.cluesEnabled) return
    const labels = { gopnik: 'gopnicii din curte', borea: 'Borea Țigan (groapă)', homeless: 'omul din parc', cop: 'polițaiul speriat' }
    const lines = this.leadOrder.map((k, i) => (this.clues[k] ? `✔ ${labels[k]}` : i === this.leadIdx ? `► ${labels[k]}` : `🔒 ${labels[k]}`))
    const active = this.leadOrder[this.leadIdx]
    this.registry.set('mission', `DOVEZI ${this.leadIdx}/4  (Esc · pin pe hartă)\n${lines.join('\n')}\n► ${this.leadHint(active)}`)
  }

  // the villain notices you closing in — colder/nervouser as the dovezi pile up
  mayorReact() {
    const r = [
      'Ceon Eban (la telefon): da, cineva umblă prin hârtii. Mă ocup.',
      'Ceon Eban: cine-i mahalagiul ăsta? Aflați. Repede.',
      'Ceon Eban a dispărut de la panglică. Cortegiul a plecat grăbit spre est.',
      'Ceon Eban nu mai răspunde la telefon. Doar respiră.',
    ]
    const i = Math.min(this.clueCount() - 1, r.length - 1)
    if (i >= 0) this.time.delayedCall(2600, () => { if (!this.won) this.toast(r[i]) })
  }

  // escalating face-to-face with the mayor at the Primăria (before the finale)
  mayorLine() {
    const n = this.clueCount()
    if (n <= 0) return 'Ceon Eban: Lucrăm la asta, dragă cetățene. Orașul înflorește. Ai văzut panglica?'
    if (n === 1) return 'Ceon Eban: Tu ești cu hârtiile? Lasă prostiile, băiete. Vrei un post la primărie?'
    if (n === 2) return 'Ceon Eban: De ce mă tot cauți? N-am nimic de ascuns. Telefonul? Vorbeam cu un cumătru.'
    return 'Ceon Eban: Pleacă de aici. Nu știi cu cine te pui. Cortegiul mă așteaptă.'
  }

  unlockFinale() {
    if (this.finaleReady) return
    this.finaleReady = true
    this.registry.set('mission', `Finală: demască-l pe ${MAYOR} la Primărie (E).`)
    this.toast('Ai toate dovezile! Mergi la Primărie.')
  }

  toast(msg) { this.registry.set('toast', { msg, id: this.time.now }) }
  frozen() { return this.cop || this.shopOpen || this.exposeOpen || this.won || this.dialogOpen || this.menuPause }

  // paged dialogue: long lines are split into one sentence at a time; player advances with E.
  // optional `after` runs when the dialogue is dismissed (e.g. open Borea's shop after his greeting).
  openDialog(speaker, text, after) {
    this.dialogOpen = true
    this.dlgSpeaker = speaker
    this.dlgPages = this.paginate(text)
    this.dlgPage = 0
    this._dlgShownAt = this.time.now
    this._dlgAfter = after || null
    this.showDlgPage()
  }
  paginate(text) {
    const t = String(text).trim()
    // split on sentence end (. ! ?) only when followed by the start of a new sentence — keeps "..." pauses intact
    const pages = t.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ„«])/).map((s) => s.trim()).filter(Boolean)
    return pages.length ? pages : [t]
  }
  showDlgPage() {
    const total = this.dlgPages.length
    this.registry.set('dialog', { speaker: this.dlgSpeaker, line: this.dlgPages[this.dlgPage], page: this.dlgPage + 1, total, more: this.dlgPage < total - 1 })
  }
  advanceDialog() {
    if (this.time.now - (this._dlgShownAt || 0) < 220) return // guard against held-E blowing through pages
    if (this.dlgPage < this.dlgPages.length - 1) { this.dlgPage++; this._dlgShownAt = this.time.now; this.showDlgPage() }
    else this.closeDialog()
  }
  closeDialog() {
    this.dialogOpen = false; this.registry.set('dialog', null)
    const a = this._dlgAfter; this._dlgAfter = null
    if (a) a()
  }

  doSideQuest(sn) {
    this.openDialog(sn.label, sn.line)
    if (sn.done) return
    sn.done = true
    this.state.lei += sn.lei; this.addXp(sn.xp)
    if (sn.kind === 'cred') this.addCred(10)
    else if (sn.kind === 'civic') this.addCivic(8)
    const bonus = sn.kind === 'cred' ? ' · +stradă' : sn.kind === 'civic' ? ' · +civic' : ''
    this.toast(`Misiune secundară făcută: +${sn.lei} lei${bonus}`)
    this.syncHud()
  }

  toggleMenu() {
    if (this.won || this.cop || this.shopOpen || this.exposeOpen) return
    this.menuPause = !this.menuPause
    this.registry.set('charmenu', this.menuPause ? this.menuData() : null)
  }

  menuData() {
    const s = this.state, r = this.ranks[this.rankIdx], next = this.ranks[this.rankIdx + 1]
    const names = { gopnik: 'Gopnicii', borea: 'Borea Țigan', cop: 'Plutonierul', homeless: 'Omul din Parc' }
    const clues = Object.keys(this.clues).map((k) => `${this.clues[k] ? '✔' : '✗'} ${names[k]}`).join('    ')
    return {
      name: this.playerName, type: this.playerTypeName,
      level: `Nivel ${this.rankIdx + 1}: ${r.name}`, xp: `${s.xp}/${next ? next.t : s.xp}`,
      lei: s.lei, score: s.score, hp: `${Math.round(s.hp)}/${s.maxHp}`,
      cred: s.cred, civic: s.civic, heat: Math.round(s.heat),
      weapon: this.weaponName(), clues, clueCount: this.clueCount(),
      deduction: this.cluesEnabled ? this.caseDeduction() : '',
    }
  }

  // the case board's running deduction — the aha stages as dovezi combine
  caseDeduction() {
    return ['Încă nimic clar.', 'Cineva îl ține pe primar din scurt.', 'Cineva din est plătește pentru hârtii.', 'Plata trece prin primărie.', 'Ceon Eban e omul Moscovei.'][Math.min(this.clueCount(), 4)]
  }

  applyPlayer() {
    const p = this.registry.get('player') || { name: 'Ion', type: 'taxist', typeName: 'Taxistul' }
    this.playerName = p.name || 'Ion'
    this.playerType = p.type
    this.playerTypeName = p.typeName || ''
    this.sellMarkup = 1; this.passiveLei = 0; this.heatMul = 1; this.leiPerRideBonus = 0; this._passiveAcc = 0; this.dmgMul = 1
    const s = this.state
    if (p.type === 'patan') { this.dmgMul = 1.7; s.cred = Math.min(100, s.cred + 25) }
    else if (p.type === 'taxist') { s.lei += 30; this.leiPerRideBonus = 40 }
    else if (p.type === 'conductor') { this.passiveLei = 1.2 }
    else if (p.type === 'agent') { this.sellMarkup = 1.4; s.lei += 20 }
    else if (p.type === 'director') { s.lei += 160 }
    else if (p.type === 'ionel') { s.maxHp = 130; s.hp = 130; this.heatMul = 0.7 }
  }

  save() {
    try {
      const s = this.state
      localStorage.setItem('cr-save', JSON.stringify({
        v: 1, lei: s.lei, score: s.score, xp: s.xp, cred: s.cred, civic: s.civic, satchel: s.satchel,
        mission: s.mission, speedBoost: s.speedBoost, acteFalse: s.acteFalse, rankIdx: this.rankIdx,
        clues: this.clues, cluesEnabled: this.cluesEnabled, weaponUnlocked: this.weaponUnlocked,
        homelessFlipped: this._homelessFlipped, finaleReady: this.finaleReady,
      }))
    } catch (e) { /* storage blocked */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem('cr-save'); if (!raw) return
      const d = JSON.parse(raw); if (!d || d.v !== 1) return
      const s = this.state
      ;['lei', 'score', 'xp', 'cred', 'civic', 'satchel', 'mission', 'speedBoost', 'acteFalse'].forEach((k) => { if (d[k] !== undefined) s[k] = d[k] })
      if (d.rankIdx !== undefined) this.rankIdx = d.rankIdx
      if (d.clues) { this.clues = d.clues; this.leadIdx = this.leadOrder.filter((k) => this.clues[k]).length } // resync the chain pointer
      if (d.weaponUnlocked) this.weaponUnlocked = d.weaponUnlocked
      this.cluesEnabled = !!d.cluesEnabled
      this._homelessFlipped = !!d.homelessFlipped
      this.finaleReady = !!d.finaleReady
      this.toast('Progres încărcat. Mergem!')
    } catch (e) { /* corrupt save */ }
  }

  menuKey(n) {
    if (this.cop) this.copChoice(n)
    else if (this.shopOpen) this.shopChoice(n)
    else if (this.exposeOpen) this.exposeConfirm(n)
  }

  // ---- Borea Țigan — black market ---------------------------------------
  openBorea() {
    // returning from the smuggle run: pay up + drop the clue, then open the shop
    if (this.smuggleReturn) {
      this.smuggleReturn = false
      this.state.lei += 90; this.addCred(15); this.addXp(60)
      if (this.cluesEnabled) this.addClue('borea', 'Borea fence-uiește pentru un „client din est": telefoane rusești')
      else this.registry.set('mission', '')
      this.syncHud()
      this.openDialog('Borea Țigan', 'Tu pe mine a sculat! Molodeț, ai dus babanul întreg. Uite banii, +90 lei. Un client din est tot întreabă de marfă, ceva cu telefoane rusești.', () => this.openShop())
      return
    }
    this.openDialog('Borea Țigan', 'Tu pe mine a sculat! Hai, zi, vinzi ori cumperi?', () => this.openShop())
  }
  openShop() { this.shopOpen = true; this.renderShop() }

  renderShop() {
    const s = this.state
    const opts = [
      `1 · Fence-uiește hârtiile (${s.satchel}) — ~${s.satchel * 12} lei`,
      '2 · Cumpără plăcintă (-15 lei, +35 HP)',
      '3 · Cumpără biscuiți (-10 lei, +20 HP)',
    ]
    if (!s.acteFalse) opts.push('4 · Acte false (-120 lei) — sari peste un control')
    if (!s.speedBoost) opts.push('5 · Tuning motor (-200 lei) — mașina zboară')
    if (!s.smuggling && !this.smuggleReturn && this.cluesEnabled && this.leadOrder[this.leadIdx] === 'borea') opts.push('6 · Misiune: cară un baban la Gară (+90 lei + dovadă)')
    opts.push('E · Pleacă')
    this.registry.set('shop', { q: 'Borea Țigan: marfa-i curată, mai mult sau mai puțin. Ce iei?', opts })
  }

  closeShop() { this.shopOpen = false; this.registry.set('shop', null) }

  shopChoice(n) {
    const s = this.state
    if (n === 1) {
      if (s.satchel > 0) { const g = Math.round(s.satchel * (10 + Math.random() * 4) * (this.sellMarkup || 1)); s.lei += g; this.toast(`Borea ia hârtiile pentru clientul din est: +${g} lei`); s.satchel = 0; this.addXp(20) }
      else this.toast('N-ai hârtii de fence-uit, bratu.')
    } else if (n === 2) {
      if (s.lei >= 15) { s.lei -= 15; s.hp = Math.min(s.maxHp, s.hp + 35); this.toast('Plăcintă caldă! +35 HP') } else this.toast('N-ai 15 lei.')
    } else if (n === 3) {
      if (s.lei >= 10) { s.lei -= 10; s.hp = Math.min(s.maxHp, s.hp + 20); this.toast('Biscuiți! +20 HP') } else this.toast('N-ai 10 lei.')
    } else if (n === 4) {
      if (!s.acteFalse) { if (s.lei >= 120) { s.lei -= 120; s.acteFalse = true; this.toast('Acte false. Nu le arăta pe bulevard.') } else this.toast('N-ai 120 lei.') }
    } else if (n === 5) {
      if (!s.speedBoost) { if (s.lei >= 200) { s.lei -= 200; s.speedBoost = true; this.toast('Tuning făcut — acum zbori, nu mergi!') } else this.toast('N-ai 200 lei.') }
    } else if (n === 6) {
      if (!s.smuggling && !this.smuggleReturn && this.cluesEnabled && this.leadOrder[this.leadIdx] === 'borea') { this.closeShop(); this.startSmuggle(); this.syncHud(); return }
    }
    this.syncHud()
    this.renderShop()
  }

  startSmuggle() {
    this.state.smuggling = true // carrying the baban toward the Gară
    this.dropPoint = this.add.image(2500, 1300, 'marker').setOrigin(0.5, 1).setDepth(99950).setTint(0xff8a4a)
    this.registry.set('mission', 'Borea: du babanul la semnul portocaliu de la Gară. Fugi de poliție.')
    this.openDialog('Borea Țigan', 'Ține babanul ăsta. Du-l la Gară, la semnul portocaliu. Fugi de gabori, auzi? Pe urmă vii înapoi la mine după bani.')
  }

  deliverSmuggle() {
    if (!this.state.smuggling) return
    this.state.smuggling = false
    this.smuggleReturn = true // delivered at the Gară; now return to Borea for payment + the clue
    if (this.dropPoint) { this.dropPoint.destroy(); this.dropPoint = null }
    this.registry.set('mission', 'Borea: întoarce-te la Borea Țigan (parc) pentru bani.')
    this.toast('Ai lăsat babanul la Gară. Acuma înapoi la Borea Țigan pentru bani.')
  }

  // ---- Potholes (civic) -------------------------------------------------
  buildPotholes() {
    this.potholes = []
    const spots = [[700, ROAD_Y - 30], [1000, ROAD_Y + 30], [1500, ROAD_Y - 30], [2000, ROAD_Y + 30], [820, ROAD_Y], [1700, ROAD_Y], [2300, ROAD_Y - 30], [1360, BD_BOT + 130], [600, 1120], [1900, 1120]]
    spots.forEach(([x, y]) => { const spr = this.add.image(x, y, 'gropa').setOrigin(0.5, 0.5).setDepth(-850); this.potholes.push({ spr, x, y, filled: false }) })
    this.filling = null
    this.potholesFixed = 0
    this.fillBar = this.add.graphics().setDepth(99958)
  }

  updatePothole(d) {
    this.fillBar.clear()
    if (!this.filling) return
    if (this.state.driving) { this.filling = null; return }
    const f = this.filling
    if ((this.ion.x - f.ref.x) ** 2 + (this.ion.y - f.ref.y) ** 2 > 40 * 40) { this.filling = null; this.toast('Te-ai mișcat — gropa nu-i gata. Apasă E din nou.'); return }
    f.t += d
    const x = this.ion.x - 11, y = this.ion.y - this.ion.height - 6
    this.fillBar.fillStyle(0x10121a, 0.8).fillRect(x - 1, y - 1, 24, 5)
    this.fillBar.fillStyle(0x4caf50, 1).fillRect(x, y, 22 * Math.min(1, f.t / f.dur), 3)
    if (f.t >= f.dur) {
      f.ref.filled = true; f.ref.spr.setTexture('gropa_fixed'); this.potholesFixed++
      this.addCivic(8); this.state.lei += 5; this.state.score += 15; this.addXp(15)
      this.toast('Ai astupat o gropă. Cartierul respiră. +civic, +5 lei')
      this.filling = null; this.syncHud()
    }
  }

  // ---- Gopnici checkpoint race ------------------------------------------
  startRace() {
    if (this.racing) return
    this.racing = true; this.raceCp = 0; this.raceT = 0
    this.raceRings.forEach((r) => r.setVisible(true))
    this._missionBak = this.registry.get('mission')
    this.toast('GO! Treci prin inele, bratan!')
  }

  updateRace(d) {
    if (!this.racing) return
    if (!this.state.driving) { this.failRace('Ai ieșit din mașină — cursă pierdută.'); return }
    this.raceT += d
    const ring = this.raceRings[this.raceCp]
    if (ring && (this.car.x - ring.x) ** 2 + (this.car.y - ring.y) ** 2 < 34 * 34) {
      ring.setVisible(false); this.raceCp++
      if (this.raceCp >= this.raceRings.length) { this.winRace(); return }
      this.toast(`Punct! ${this.raceCp}/${this.raceRings.length}`)
    }
    this.registry.set('mission', `Cursă: ${this.raceCp}/${this.raceRings.length} inele · ${Math.max(0, Math.ceil(this.raceLimit - this.raceT))}s`)
    if (this.raceT > this.raceLimit) this.failRace('Prea lent, bratu.')
  }

  winRace() {
    this.racing = false; this.raceRings.forEach((r) => r.setVisible(false))
    const stake = 120 + (this._raceWins || 0) * 20 + (this.leiPerRideBonus || 0); this._raceWins = (this._raceWins || 0) + 1
    this.state.lei += stake; this.state.score += 80; this.addCred(40); this.addXp(80)
    this.toast(`Respect, bratan! +${stake} lei`)
    this.registry.set('mission', this._missionBak || '')
    if (this.cluesEnabled) this.addClue('gopnik', 'cortegiul negru merge mereu spre ambasada rusă; gopnicii văd tot din curte')
    this.syncHud()
  }

  failRace(msg) {
    this.racing = false; this.raceRings.forEach((r) => r.setVisible(false))
    this.state.lei = Math.max(0, this.state.lei - 15)
    this.toast(msg + ' -15 lei')
    this.registry.set('mission', this._missionBak || ''); this.syncHud()
  }

  // ---- finale: exposé + win ---------------------------------------------
  openExpose() {
    // the exposé plays out one beat at a time in the dialogue box, with callbacks, then you win
    this.openDialog('Demascarea, în fața Primăriei',
      'Scoți toate hârtiile pe masă, în fața lumii. Patru dovezi: o păpușă, telefoane care sună numa spre est, un beci, și un act semnat. Ceon Eban: astea-s falsuri, cetățeni, nu credeți un mahalagiu! Pensionara, de pe bancă: ți-am zis eu, maică, vorbea prea des la telefon. Omul din parc: ai să mă arăți la televizor? Ț-am spus că-s treaz. Și hârtiile pe care le-ai cărat la Borea? Erau chiar dosarele lui, trimise spre est. Lumea se întoarce spre el. Cortegiul nu mai vine. Îi iei locul.',
      () => this.doWin())
  }

  exposeConfirm(n) {
    if (n !== 1) return
    this.exposeOpen = false
    this.registry.set('finale', null)
    this.doWin()
  }

  doWin() {
    this.won = true
    this.rankIdx = this.ranks.length - 1
    const lei = this.state.lei
    this.registry.set('win', { score: this.state.score, lei, rank: this.ranks[this.rankIdx].name, sqm: (lei / 1400).toFixed(3) })
    this.syncHud()
  }

  // ---- interaction -------------------------------------------------------
  onAction() {
    if (this.dialogOpen) { this.advanceDialog(); return }
    if (this.shopOpen) { this.closeShop(); return }
    if (this.cop || this.exposeOpen || this.won) return
    if (this.state.driving) {
      if (this.gopnik && !this.racing && (this.car.x - this.gopnik.x) ** 2 + (this.car.y - this.gopnik.y) ** 2 < 80 * 80) { this.startRace(); return }
      this.exitCar(); return
    }
    const n = this.nearest
    if (!n) return
    if (n.type === 'car') this.enterCar(n.ref)
    else if (n.type === 'zina') this.talkZina()
    else if (n.type === 'bread') this.getBread()
    else if (n.type === 'food') this.eat(n.ref)
    else if (n.type === 'npc') this.openDialog(n.ref.name, n.ref.line)
    else if (n.type === 'sidenpc') this.doSideQuest(n.ref)
    else if (n.type === 'om-befriend') this.befriendHomeless()
    else if (n.type === 'om-talk') {
      if (this.cluesEnabled && !this.clues.homeless) {
        this.openDialog('Omul din parc', 'Și aiurești wai, șii cu tine?! Ai să mă arăți la televizor? Matryoshka... telefonul... în beciul de la primărie... eu am văzut, băiete.')
        this.addClue('homeless', 'matryoshka și un telefon rusesc în beciul primăriei')
      } else {
        this.openDialog('Omul din parc', 'Și aiurești wai, șii cu tine?! Ai să mă arăți la televizor? ' + this.omLine())
      }
    }
    else if (n.type === 'borea') this.openBorea()
    else if (n.type === 'drop') this.deliverSmuggle()
    else if (n.type === 'expose') this.openExpose()
    else if (n.type === 'mayor') this.openDialog('Ceon Eban', this.mayorLine())
    else if (n.type === 'gopnik') this.openDialog('Gopnicii', 'Ia o mașină de pe bulevard și vino, bratan, facem o cursă pe curte.')
    else if (n.type === 'pothole') { this.filling = { ref: n.ref, t: 0, dur: this.potholeTime }; this.toast('Astupi gropa... stai pe loc.') }
  }

  omLine() {
    const lines = [
      'Toți aiurați, numa eu vorbesc cu porumbeii.',
      'Wai, da tu și te uiți? Eu stau aici de când era Lenin în piață.',
      'Matryoshka... telefonul... în beciul de la primărie... eu am văzut, băiete.',
      `${MAYOR} vorbește cu Moscova noaptea. Nimeni nu crede pe nebunul din parc.`,
      'Caută sub Arc, băiete. Acolo-i o păpușă de lemn care știe tot.',
      'Cortegiul negru iar a trecut spre est. Numa eu văd. Voi dormiți, oameni buni.',
      'Mi-au pus cip în plombă la stomatolog. De-asta aud Moscova noaptea, wai.',
      'Dă un leu de divin, băiete. Pentru sănătatea ta, jur pe groapa de pe Dacia.',
      'Eu am fost inginer. Acuma-s filozof în parc. Salariul, tot acela, băiete.',
      'Șșș... auzi? Țevile. Țevile de la Termoelectrica vorbesc rusește noaptea.',
      'Extratereștrii au aterizat pe Malldova. Au luat un șaurmă și-au plecat. Deștepți.',
      'Wai, ce vremuri. Pe vremea mea venea troleibuzul. Acuma vine numa frica.',
      `Dă-mi semechki, băiete, că-mi trec nervii. Și spune-i lui ${MAYOR} că-l văd.`,
      'Eu-s împărat, băiete. Nu vezi coroana? E invizibilă, ca pensia mea.',
      'Pămîntul e plat, da\' gropile-s adânci. Contradicție. Mă doare capul, wai.',
      'Noaptea, sub Arc, vine un domn în costum. Vorbește la telefon. În rusă. Mereu.',
      'Eu nu-s nebun, băiete. Eu-s singurul treaz. Aiurați-vă voi mai departe, șii cu tine.',
      'Am scris primarului. Mi-a răspuns ecoul din groapă: „lucrăm la asta", zice.',
      'Sticla-i a mea, am pus-o sub bancă în nouăj\' patru. Nu te atinge, wai.',
      'Bea apă de la robinet, băiete. Maro, da\' gratis. Asta-i independența, băiete.',
      'Pensia, hramul, botezul, toate-s în aceeași zi. Coincidență? Tu chiar crezi?',
      'Vărul meu locuiește acuma în groapa de pe Albișoara. Frumos, cu vedere la apă.',
    ]
    let i = Math.floor(Math.random() * lines.length)
    if (i === this._omLast && lines.length > 1) i = (i + 1) % lines.length
    this._omLast = i
    return lines[i]
  }

  enterCar(carSprite) {
    this.state.driving = true; this.car = carSprite
    this.car.speed = 0; this.car.heading = carSprite.rotation || Math.PI / 2 // start facing along the curb
    this.ion.setVisible(false); this.ion.body.enable = false
    this.cameras.main.startFollow(this.car, true, 0.12, 0.12)
    this.toast('Ai urcat în mașină. WASD conduce, E coboară.')
    if (!this.copIntroDone) { this.copIntroDone = true; this.copIntro = true; this.copTimer = 0 } // guaranteed first stop
    this.syncHud()
  }

  blocked(x, y) {
    for (const z of this.solids.getChildren()) {
      const b = z.body
      if (b && x > b.x - 6 && x < b.x + b.width + 6 && y > b.y - 6 && y < b.y + b.height + 6) return true
    }
    return false
  }

  exitCar() {
    const c = this.car
    let px = c.x, py = c.y
    for (const [ox, oy] of [[26, 0], [-26, 0], [0, 26], [0, -26], [0, 0]]) {
      if (!this.blocked(c.x + ox, c.y + oy)) { px = c.x + ox; py = c.y + oy; break }
    }
    this.ion.setPosition(px, py); this.ion.setVisible(true); this.ion.body.enable = true
    this.state.driving = false; this.car = null
    this.cameras.main.startFollow(this.ion, true, 0.12, 0.12)
    this.syncHud()
  }

  eat(spot) {
    const s = this.state
    if (s.hp >= s.maxHp) { this.toast('Ești sătul — HP plin.'); return }
    if (s.lei < spot.price) { this.toast('N-ai destui lei.'); return }
    s.lei -= spot.price; s.hp = Math.min(s.maxHp, s.hp + spot.hp); s.score += 5
    this.toast(`Ai mâncat la ${spot.name.replace(/^Stația /, '')} (+${spot.hp} HP)`)
    this.syncHud()
  }

  talkZina() {
    const s = this.state
    if (s.mission === 0) {
      s.mission = 1
      this.registry.set('mission', 'Pasul 1: adu pâine de la Linella.')
      this.openDialog('Pensionara', 'Bine c-ai venit acasă, maică. Fă-mi întâi un bine: adu-mi o pâine de la Linella. Pe urmă stăm de vorbă.')
    } else if (s.mission === 2) {
      s.mission = 3; s.lei += 30; s.score += 150; this.addXp(150)
      this.cluesEnabled = true; this.addCivic(12); this.leadIdx = 0
      this.updateDovezBanner()
      this.openDialog('Pensionara', 'Mulțumesc, maică. Acuma ascultă. Primarul ăsta vorbește prea des la telefon, și tot în rusă. Eu-s bătrână, da nu surdă. Începe de la gopnicii din curte, ei văd fiecare mașină care intră.')
      this.syncHud()
    } else if (s.mission === 1) {
      this.openDialog('Pensionara', 'Pâinea, maică. De la Linella. Te aștept pe bancă.')
    } else if (this.finaleReady) {
      this.openDialog('Pensionara', 'Ai tot ce-ți trebuie, maică. Du-te la Primărie și spune-le adevărul.')
    } else {
      this.openDialog('Pensionara', 'Urmează firul, maică. Vezi la Esc unde-ai rămas. Domnul cu tine.')
    }
  }

  getBread() {
    if (this.state.mission !== 1) return
    this.state.mission = 2
    this.registry.set('mission', 'Pasul 2: du pâinea înapoi la Pensionara.')
    this.toast('Ai luat pâinea.')
  }

  startCopStop() {
    if (this.state.acteFalse) { this.state.acteFalse = false; this.toast('Acte false! Polițistul te lasă în pace.'); this.syncHud(); return }
    this.cop = true
    this.copBribe = Math.round((20 + this.state.heat / 3) * (this.bribeDiscount ? 0.6 : 1))
    if (this.car) this.car.speed = 0
    const openers = [
      'Plutonierul: Bună ziua. Documentele... știți de ce v-am oprit?',
      'Plutonierul: Băi, șefu, încotro așa grăbit? Hai actele.',
      'Plutonierul: Ai cam zburat pe bulevard. De ce încălcăm?',
      'Plutonierul: Control de rutină. Văd că ne grăbim tare...',
    ]
    const q = openers[Math.floor(Math.random() * openers.length)]
    if (this.car && this.copSprite) {
      this.copSprite.setPosition(this.car.x + 26, this.car.y + 4).setVisible(true).setDepth(this.car.y + 2)
    }
    this.registry.set('cop', {
      q,
      opts: [
        `1 · Mită — „pentru cafea, șefu"  (-${this.copBribe} lei)`,
        '2 · Vorbește frumos — „n-am văzut semnul"  (riști amendă)',
        '3 · Calci pedala și fugi  (+cred, dar te caută)',
      ],
    })
  }

  copChoice(n) {
    if (!this.cop) return
    const s = this.state
    if (n === 1) {
      if (s.lei >= this.copBribe) { s.lei -= this.copBribe; s.heat = 0; s.cred = Math.max(0, s.cred - 3); this.toast('Mită dată. Drum bun, șefu.') }
      else { s.heat = 30; s.hp = Math.max(0, s.hp - 5); this.toast('N-ai bani de mită — amendă și nervi! (-5 HP)') }
    } else if (n === 2) {
      if (Math.random() < 0.6) { s.heat = 0; s.score += 20; this.toast('Te-ai descurcat cu vorba.') }
      else { s.lei = Math.max(0, s.lei - 15); s.heat = 35; s.hp = Math.max(0, s.hp - 6); this.toast('N-a mers — amendă -15 lei, -6 HP.') }
    } else {
      // flee — gopnik respect makes it cleaner
      s.heat = (s.cred >= 60) ? 8 : 20; s.score += 40; s.cred = Phaser.Math.Clamp(s.cred + 6, 0, 100)
      this.toast(s.cred >= 60 ? 'Ai fugit — gopnicii te-au acoperit! +cred' : 'Ai fugit de poliție! +cred.')
      if (this.cluesEnabled) this.addClue('cop', 'fuga de poliție arată că ceva e putred la primărie')
    }
    this.cop = false
    this.copGrace = this.time.now + 6000 // no back-to-back stops
    if (this.copSprite) this.copSprite.setVisible(false)
    this.registry.set('cop', null)
    this.syncHud()
  }

  // ---- per-frame systems -------------------------------------------------
  walk(d) {
    const k = this.keys, c = this.cursors
    const speed = k.SHIFT.isDown ? this.sprintSpeed : 100
    let vx = 0, vy = 0
    if (k.A.isDown || c.left.isDown) vx -= 1
    if (k.D.isDown || c.right.isDown) vx += 1
    if (k.W.isDown || c.up.isDown) vy -= 1
    if (k.S.isDown || c.down.isDown) vy += 1
    const v = new Phaser.Math.Vector2(vx, vy)
    if (v.length() > 0) {
      v.normalize().scale(speed)
      this.ion.setVelocity(v.x, v.y)
      if (Math.abs(vx) >= Math.abs(vy)) { this.facing = 'side'; this.ion.setFlipX(vx < 0); this.ion.anims.play('walk-side', true) }
      else if (vy < 0) { this.facing = 'up'; this.ion.setFlipX(false); this.ion.anims.play('walk-up', true) }
      else { this.facing = 'down'; this.ion.setFlipX(false); this.ion.anims.play('walk-down', true) }
    } else {
      this.ion.setVelocity(0, 0); this.ion.anims.stop()
      this.ion.setTexture(this.facing === 'side' ? 'ion_side0' : this.facing === 'up' ? 'ion_up0' : 'ion_down0')
    }
    this.ion.setDepth(this.ion.y)
  }

  driveCar(d) {
    const k = this.keys, c = this.cursors, car = this.car
    // car-like steering: W/S throttle, A/D steer, rotates 360°
    const throttle = ((k.W.isDown || c.up.isDown) ? 1 : 0) - ((k.S.isDown || c.down.isDown) ? 1 : 0)
    const steer = ((k.D.isDown || c.right.isDown) ? 1 : 0) - ((k.A.isDown || c.left.isDown) ? 1 : 0)
    const accel = 460, maxR = -130, turn = 3.0
    const maxF = k.SHIFT.isDown ? (this.state.speedBoost ? 440 : 380) : (this.state.speedBoost ? 360 : 300)
    car.speed += throttle * accel * d
    if (throttle === 0) car.speed *= 0.93 // drag
    car.speed = Phaser.Math.Clamp(car.speed, maxR, maxF)
    if (Math.abs(car.speed) > 6) {
      const grip = Math.min(1, Math.abs(car.speed) / 130) // can't spin in place; turn scales with speed
      car.heading += steer * turn * d * grip * (car.speed >= 0 ? 1 : -1)
    }
    const vx = Math.sin(car.heading) * car.speed
    const vy = -Math.cos(car.heading) * car.speed
    const nx = Phaser.Math.Clamp(car.x + vx * d, 20, WORLD_W - 20)
    const ny = Phaser.Math.Clamp(car.y + vy * d, 20, WORLD_H - 20)
    let hit = false
    if (!this.blocked(nx, car.y) && !this.carHitsTraffic(nx, car.y)) car.x = nx; else hit = true
    if (!this.blocked(car.x, ny) && !this.carHitsTraffic(car.x, ny)) car.y = ny; else hit = true
    if (hit) car.speed *= 0.35 // bump
    car.rotation = car.heading
    car.setDepth(car.y)
    this.moving = Math.abs(car.speed) > 210 ? 2 : (Math.abs(car.speed) > 12 ? 1 : 0)
    if (this.potholes) for (const p of this.potholes) {
      if (!p.filled && (car.x - p.x) ** 2 + (car.y - p.y) ** 2 < 16 * 16 && this.time.now > (this._bumpT || 0)) {
        this._bumpT = this.time.now + 800; car.speed *= 0.5; this.state.hp = Math.max(0, this.state.hp - 3)
        this.cameras.main.shake(60, 0.003); this.toast('Bum! Gropă neastupată. (-3 HP)'); this.syncHud()
      }
    }
    this.ion.setPosition(car.x, car.y)
  }

  updateTraffic(dt) {
    if (!this.traffic) return
    for (const v of this.traffic) {
      v.x += v.vx * (dt / 1000)
      if (v.x > WORLD_W + 130) v.x = -130
      else if (v.x < -130) v.x = WORLD_W + 130
      // if a bus catches the player's car, shove it aside instead of clipping through
      if (this.state.driving && this.car) {
        const b = v.getBounds()
        if (this.car.x + 14 > b.x && this.car.x - 14 < b.right && this.car.y + 14 > b.y && this.car.y - 14 < b.bottom) {
          this.car.x += Math.sign(v.vx || 1) * 3
          this.car.y += this.car.y < (b.y + b.bottom) / 2 ? -2.5 : 2.5
          this.car.speed *= 0.8
          if (this.time.now > (this._busShakeT || 0)) { this._busShakeT = this.time.now + 350; this.cameras.main.shake(60, 0.003) }
        }
      }
    }
  }

  // a car-sized box at (x,y) overlapping any moving bus/trolley → blocks the move (no pass-through)
  carHitsTraffic(x, y) {
    if (!this.traffic) return false
    for (const v of this.traffic) {
      const b = v.getBounds()
      if (x + 14 > b.x + 6 && x - 14 < b.right - 6 && y + 14 > b.y + 4 && y - 14 < b.bottom - 4) return true
    }
    return false
  }

  updatePickups() {
    const px = this.state.driving ? this.car.x : this.ion.x
    const py = this.state.driving ? this.car.y : this.ion.y
    for (const s of this.pickups) {
      if (!s.visible) { // renewable: respawn after 25s as a fresh random item
        if (this.time.now - s.cAt > 25000) { s.item = this.randomItem(); s.setTexture(s.item.tex); s.setVisible(true) }
        continue
      }
      if ((px - s.x) ** 2 + (py - s.y) ** 2 < 18 * 18) {
        s.setVisible(false); s.cAt = this.time.now
        this.state.satchel = (this.state.satchel || 0) + 1
        this.state.combo += 1; this.state.comboT = 2.5
        this.state.score += 15 * this.state.combo
        if (this.addXp) this.addXp(10 * this.state.combo)
        this.toast(`Hârtie: ${s.item.n}` + (this.state.combo > 1 ? ` (x${this.state.combo})` : '') + '. Fence-uiește la Borea.')
        this.syncHud()
      }
    }
    if (this.state.comboT > 0) { this.state.comboT -= 1 / 60; if (this.state.comboT <= 0) this.state.combo = 0 }
  }

  updateInteraction() {
    if (this.state.driving) {
      this.nearest = null
      if (this.racing) { this.registry.set('prompt', ''); return }
      const nearG = this.gopnik && (this.car.x - this.gopnik.x) ** 2 + (this.car.y - this.gopnik.y) ** 2 < 80 * 80
      this.registry.set('prompt', nearG ? 'E: acceptă cursa cu gopnicii' : 'E: coboară din mașină')
      return
    }
    const ix = this.ion.x, iy = this.ion.y
    let best = 36 * 36, near = null
    const test = (x, y, r, obj) => { const d = (ix - x) ** 2 + (iy - y) ** 2; if (d < best && d < r * r) { best = d; near = obj } }
    for (const car of this.enterCars) test(car.x, car.y, 34, { type: 'car', ref: car })
    test(this.zina.x, this.zina.y, 34, { type: 'zina' })
    if (this.state.mission === 1 && this.breadTarget) test(this.breadTarget.x, this.breadTarget.y, 36, { type: 'bread' })
    for (const f of this.foodSpots) test(f.x, f.y, 30, { type: 'food', ref: f })
    if (this.talkNpcs) for (const nn of this.talkNpcs) test(nn.x, nn.y, 38, { type: 'npc', ref: nn })
    if (this.sideNpcs) for (const sn of this.sideNpcs) test(sn.x, sn.y, 38, { type: 'sidenpc', ref: sn })
    if (this.homeless) {
      if (this.homeless.calm) test(this.homeless.spr.x, this.homeless.spr.y, 36, { type: 'om-talk' })
      else if (this.homeless.state !== 'ko') test(this.homeless.spr.x, this.homeless.spr.y, 36, { type: 'om-befriend' })
    }
    if (this.borea) test(this.borea.x, this.borea.y, 38, { type: 'borea' })
    if (this.gopnik) test(this.gopnik.x, this.gopnik.y, 38, { type: 'gopnik' })
    if (this.potholes) for (const p of this.potholes) if (!p.filled) test(p.x, p.y, 30, { type: 'pothole', ref: p })
    if (this.state.smuggling && this.dropPoint) test(this.dropPoint.x, this.dropPoint.y, 42, { type: 'drop' })
    if (this.finaleReady && !this.won) test(960, ROWS[1].y1, 60, { type: 'expose' }) // at the Primăria (where the mayor stands)
    else if (!this.finaleReady && this.mayorSpr) test(this.mayorSpr.x, this.mayorSpr.y, 46, { type: 'mayor' }) // talk to the mayor (escalating)
    // befriending an aggro'd homeless must be reachable BEFORE forced melee range
    if (this.homeless && this.homeless.aggro && !this.homeless.calm && this.homeless.state !== 'ko') {
      const d2 = (ix - this.homeless.spr.x) ** 2 + (iy - this.homeless.spr.y) ** 2
      if (d2 < 72 * 72 && (!near || near.type === 'food' || near.type === 'om-befriend')) near = { type: 'om-befriend' }
    }
    this.nearest = near
    let prompt = ''
    if (near) {
      if (near.type === 'car') prompt = 'E: urcă în mașină'
      else if (near.type === 'zina') prompt = this.state.mission === 2 ? 'E: dă pâinea Pensionarei' : 'E: vorbește cu Pensionara'
      else if (near.type === 'bread') prompt = 'E: ia pâinea (Linella)'
      else if (near.type === 'food') prompt = `E: mănâncă (-${near.ref.price} lei, +${near.ref.hp} HP)`
      else if (near.type === 'npc') prompt = `E: vorbește cu ${near.ref.name}`
      else if (near.type === 'sidenpc') prompt = `E: ${near.ref.done ? 'vorbește cu' : 'ajută'} ${near.ref.label}`
      else if (near.type === 'om-befriend') prompt = 'E: dă bani (15) să-l calmezi · SPACE/click: lovește'
      else if (near.type === 'om-talk') prompt = 'E: ascultă profeția'
      else if (near.type === 'borea') prompt = 'E: fă afaceri cu Borea Țigan'
      else if (near.type === 'gopnik') prompt = 'E: vorbește cu gopnicii (vino cu mașina pt. cursă)'
      else if (near.type === 'drop') prompt = 'E: livrează babanul'
      else if (near.type === 'pothole') prompt = 'E: astupă gropa (+civic)'
      else if (near.type === 'expose') prompt = `E: demască-l pe ${MAYOR}`
      else if (near.type === 'mayor') prompt = 'E: vorbește cu Ceon Eban'
    }
    this.registry.set('prompt', prompt)
  }

  updateHeat(d) {
    const s = this.state
    if (s.driving) {
      // only flooring it (Shift) builds heat; cruising is safe; smuggling is risky
      let dh = (this.moving === 2 ? 7 : -2) + (s.smuggling ? 4 : 0)
      if (dh > 0) dh *= (this.heatMul || 1) // ionel keeps cooler
      s.heat = Phaser.Math.Clamp(s.heat + dh * d, 0, 100)
      this.copTimer += d
      if (!this.cop && this.copIntro && !this.racing && this.copTimer > 1.8) {
        this.copIntro = false; this.copTimer = 0; this.startCopStop() // guaranteed tutorial stop on first drive
      } else if (!this.cop && s.heat > 68 && this.copTimer > 2 && this.time.now > (this.copGrace || 0)) {
        this.copTimer = 0
        if (Math.random() < (s.heat - 68) / 60) this.startCopStop()
      }
    } else {
      s.heat = Math.max(0, s.heat - 9 * d)
    }
    this.hudT += d
    if (this.hudT > 0.2) { this.hudT = 0; this.syncHud() }
  }

  // slow hunger drain + a clear warning before fainting (no hard softlock)
  updateSurvival(d) {
    const s = this.state
    if (this.passiveLei) { this._passiveAcc += this.passiveLei * d; if (this._passiveAcc >= 1) { const a = Math.floor(this._passiveAcc); s.lei += a; this._passiveAcc -= a; this.syncHud() } }
    s.hp = Math.max(0, s.hp - 0.32 * d) // gentle hunger (~5 min from full)
    // low-HP disclaimer: flash + warn once when crossing 25
    const low = s.hp <= 25
    this.registry.set('lowhp', low)
    if (low && !this._lowWarned) { this._lowWarned = true; this.toast('⚠ Ți-e foame! Mănâncă urgent (kebab/cvas/magazin) altfel leșini.') }
    if (!low) this._lowWarned = false
    if (s.hp <= 0) {
      if (s.driving) this.exitCar()
      s.hp = 60; s.lei = Math.max(0, s.lei - 10); s.score = Math.max(0, s.score - 50)
      this.ion.setPosition(1360, BD_BOT + 26)
      this.cameras.main.startFollow(this.ion, true, 0.12, 0.12)
      this.toast('Ai leșinat de foame! Te-ai trezit lângă Arc. (-10 lei)')
      this.syncHud()
    }
  }

  updateMarker() {
    const m = this.state.mission
    const bob = Math.sin(this.time.now / 250) * 4
    let target = null
    if (m === 1) target = this.breadTarget
    else if (m === 2) target = this.zina
    if (this.state.smuggling && this.dropPoint) target = this.dropPoint // carry the baban to the Gară
    else if (this.smuggleReturn && this.borea) target = this.borea // bring it back to Borea
    if (this.finaleReady && !this.won) target = { x: 960, y: ROWS[1].y1 } // point to the Primăria for the exposé
    this.curTarget = target
    if (target) this.marker.setVisible(true).setPosition(target.x, target.y - 44 + bob).setDepth(99980)
    else this.marker.setVisible(false)
    // quest "!" floats over Baba Zina whenever she has something for you
    if (this.zinaIcon) {
      const show = (m === 0 || m === 2)
      this.zinaIcon.setVisible(show)
      if (show) this.zinaIcon.setPosition(this.zina.x, this.zina.y - 38 + bob)
    }
    // "!" over Borea when you have collectibles to sell
    if (this.boreaIcon) {
      const show = this.state.satchel > 0
      this.boreaIcon.setVisible(show)
      if (show) this.boreaIcon.setPosition(this.borea.x, this.borea.y - 36 + bob)
    }
  }

  update(t, dt) {
    this.updateTraffic(dt)
    if (this.frozen()) { this.updateNameplate(); return } // frozen during a modal
    const d = dt / 1000
    if (this.state.driving) this.driveCar(d); else this.walk(d)
    this.updatePickups()
    this.updateInteraction()
    this.updateCombat(d)
    this.updateRace(d)
    this.updatePothole(d)
    this.updateHeat(d)
    this.updateSurvival(d)
    this.updateMarker()
    this.updateNameplate()
    const ex = this.state.driving ? this.car.x : this.ion.x
    const ey = this.state.driving ? this.car.y : this.ion.y
    // dovezi pins: the uncollected evidence sources, always visible on the map during the investigation
    const dovezi = []
    if (this.cluesEnabled && !this.finaleReady) {
      const active = this.leadOrder[this.leadIdx] // only the current lead is pinned — a focused trail
      if (active === 'gopnik' && this.gopnik) dovezi.push({ x: this.gopnik.x, y: this.gopnik.y })
      else if (active === 'borea' && this.borea) dovezi.push({ x: this.borea.x, y: this.borea.y })
      else if (active === 'homeless' && this.homeless) dovezi.push({ x: this.homeless.spr.x, y: this.homeless.spr.y })
      else if (active === 'cop') dovezi.push({ x: 1310, y: ROAD_Y })
    }
    this.registry.set('mapDyn', {
      px: ex, py: ey,
      tx: this.curTarget ? this.curTarget.x : null, ty: this.curTarget ? this.curTarget.y : null,
      zx: this.zina.x, zy: this.zina.y, dovezi,
    })
  }
}
