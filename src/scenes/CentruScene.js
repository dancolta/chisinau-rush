import Phaser from 'phaser'

const WORLD_W = 2700
const WORLD_H = 2100
const SW = 10 // sidewalk width beside a road

// road grid
const HROADS = [
  { y: 520, half: 34 },               // northern avenue (Mitropolit Varlaam)
  { y: 1040, half: 66, main: true },  // Bd. Ștefan cel Mare
  { y: 1620, half: 34 },              // southern avenue (București)
]
const VX = [360, 760, 1160, 1560, 1960, 2360] // cross streets
const VHALF = 26
const VY0 = HROADS[0].y - HROADS[0].half
const VY1 = HROADS[2].y + HROADS[2].half

const BD_TOP = HROADS[1].y - HROADS[1].half     // 974
const BD_BOT = HROADS[1].y + HROADS[1].half     // 1106

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
    this.buildFiller()
    this.buildIon()
    this.buildCamera()
    this.buildInput()

    this.registry.set('crt', true)
    this.registry.set('nearLm', null)
    this.scene.launch('Ui')
  }

  // ---- ground / roads ----------------------------------------------------
  region(x, y, w, h, key, depth) {
    this.add.tileSprite(x, y, w, h, key).setOrigin(0).setDepth(depth)
  }

  buildGround() {
    this.region(0, 0, WORLD_W, WORLD_H, 'grass', -1000)

    // paved square (Piața Marii Adunări Naționale) + cathedral forecourt
    this.region(1170, 720, 300, BD_TOP - 720, 'plaza', -950)
    this.region(1190, BD_BOT, 260, 70, 'plaza', -950)

    // park paths (Grădina Publică)
    this.region(1740, BD_BOT, 40, 1560 - BD_BOT, 'path', -950)
    this.region(1580, 1300, 380, 32, 'path', -950)
    // alley of classics path
    this.region(1580, 1296, 380, 36, 'path', -949)

    // sidewalks then roads (roads drawn above, so they win at intersections)
    HROADS.forEach((r) => {
      this.region(0, r.y - r.half - SW, WORLD_W, (r.half + SW) * 2, 'sidewalk', -880)
    })
    VX.forEach((x) => {
      this.region(x - VHALF - SW, VY0, (VHALF + SW) * 2, VY1 - VY0, 'sidewalk', -880)
    })
    HROADS.forEach((r) => {
      this.region(0, r.y - r.half, WORLD_W, r.half * 2, 'road', -870)
      if (r.main) for (let x = 16; x < WORLD_W; x += 28) this.add.image(x, r.y, 'dash').setOrigin(0, 0.5).setDepth(-860)
    })
    VX.forEach((x) => this.region(x - VHALF, VY0, VHALF * 2, VY1 - VY0, 'road', -870))

    // pedestrian crossings on the boulevard
    ;[760, 1310, 1760].forEach((x) => this.region(x - 20, BD_TOP, 40, HROADS[1].half * 2, 'zebra', -862))
  }

  // ---- landmarks + shops (proximity labelled) ----------------------------
  place(x, baseY, key, name, desc, tint) {
    const img = this.add.image(x, baseY, key).setOrigin(0.5, 1).setDepth(baseY)
    if (tint !== undefined) img.setTint(tint)
    const zone = this.add.zone(x, baseY - img.height * 0.16, img.width * 0.78, img.height * 0.32)
    this.physics.add.existing(zone, true)
    this.solids.add(zone)
    if (name) this.landmarks.push({ x, y: baseY, name, desc })
    return img
  }

  labelSpot(x, y, name, desc) { this.landmarks.push({ x, y, name, desc }) }

  buildLandmarks() {
    const N = BD_TOP - 2 // north building base (on north sidewalk)

    // --- north side of the boulevard ---
    this.place(560, N, 'opera', 'Teatrul de Operă și Balet', 'Maria Bieșu. Operă, balet, premiere de gală.')
    this.place(900, N, 'primaria', 'Primăria Chișinău', 'Primăria municipiului — turnul cu ceas, 1902.')
    this.place(1310, 965, 'govern', 'Casa Guvernului', 'Sediul Guvernului. Aici se „lucrează la asta".')
    this.place(1860, N, 'parliament', 'Parlamentul', 'Aici se votează legile (și se ceartă deputații).')
    this.place(2080, N, 'church', 'Biserica Schimbarea la Față', 'Între Parlament și Președinție.')
    this.place(2300, N, 'presidency', 'Președinția', 'Palatul Președintelui Republicii Moldova.')

    // --- south side: Cathedral Park (Arc + Catedrala) ---
    this.place(1310, BD_BOT + 60, 'arc', 'Arcul de Triumf', 'Poarta Sfântă, 1840. Față în față cu Guvernul.')
    this.place(1280, 1360, 'cathedral', 'Catedrala Nașterea Domnului', '1836. Inima Parcului Catedralei.')
    this.place(1372, 1346, 'belltower', 'Clopotnița', 'Dărâmată de sovietici în 1962, refăcută în 1997.')

    // --- south: Grădina Publică Ștefan cel Mare ---
    this.place(1600, BD_BOT + 40, 'statue', 'Monumentul lui Ștefan cel Mare', 'La intrarea în Grădina Publică.')
    this.place(1760, 1430, 'fountain', 'Fântâna Arteziană', 'Grădina Publică. Răcoare vara.')
    this.labelSpot(1770, 1300, 'Aleea Clasicilor', 'Busturile scriitorilor — Eminescu, Creangă…')

    // --- shops / local brands (fan-art parody) ---
    this.place(300, 1190, 'shop_linella', 'Linella', 'Supermarket de cartier. Pâine, cvas, tot.')
    this.place(520, 1190, 'shop_davidan', 'DaviDan', 'Brutărie & cofetărie. Kürtos cald.')
    this.place(720, 1190, 'shop_placinte', 'La Plăcinte', 'Plăcinte fierbinți și bucate moldovenești.')
    this.place(1020, 1190, 'shop_tucano', 'Tucano Coffee', 'Cafea de specialitate, vibe hipster.')
    this.place(2020, 1190, 'shop_andys', "ANDY'S Pizza", 'Pizza, paste, meniul copilăriei.')
    this.place(420, N, 'shop_andys', "ANDY'S Pizza", 'Încă un ANDY\'S — sunt peste tot.')
  }

  // ---- fill the blocks: residential + greenery ---------------------------
  buildFiller() {
    const tints = [0xc4c8cd, 0xcabfa9, 0xb6c0b0, 0xc1b9c4, 0xbfc4cb]
    const bloc = (x, y, i) => this.place(x, y, 'bloc', null, null, tints[Math.abs(i) % tints.length])

    // far-north residential rows (above the northern avenue)
    let i = 0
    for (let x = 120; x < WORLD_W - 60; x += 150) {
      if (Math.min(...VX.map((vx) => Math.abs(vx - x))) < 40) continue
      bloc(x, 360, i); bloc(x, 470, i + 1); i += 2
    }
    // far-south residential rows (below the southern avenue)
    for (let x = 120; x < WORLD_W - 60; x += 150) {
      if (Math.min(...VX.map((vx) => Math.abs(vx - x))) < 40) continue
      bloc(x, 1780, i); bloc(x, 1900, i + 1); i += 2
    }
    // blocs filling the bare north-side stretches between landmarks
    ;[1080, 1490, 1660, 2210].forEach((x) => { bloc(x, BD_TOP - 2, i++); })
    // blocs filling bare south-side stretches
    ;[900, 1120, 2200, 2380].forEach((x) => { bloc(x, 1230, i++); })

    // trees lining the boulevard (skip the landmark-dense centre)
    const treeRow = (y) => {
      for (let x = 90; x < WORLD_W; x += 120) {
        if (x > 1150 && x < 2120 && y > BD_BOT) continue // keep parks/forecourt clear
        this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y)
      }
    }
    treeRow(BD_TOP - SW - 2)
    treeRow(BD_BOT + SW + 26)

    // lampposts along the boulevard
    for (let x = 60; x < WORLD_W; x += 130) {
      this.add.image(x, BD_TOP - SW, 'lamp').setOrigin(0.5, 1).setDepth(BD_TOP - SW)
      this.add.image(x + 60, BD_BOT + SW + 4, 'lamp').setOrigin(0.5, 1).setDepth(BD_BOT + SW + 4)
    }

    // Grădina Publică greenery: busts (Aleea), benches, trees, bushes
    for (let x = 1600; x <= 1940; x += 52) this.add.image(x, 1316, 'bust').setOrigin(0.5, 1).setDepth(1316)
    const gp = [[1590, 1180], [1950, 1180], [1590, 1480], [1950, 1480], [1700, 1520], [1840, 1520]]
    gp.forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
    ;[[1660, 1240], [1860, 1240], [1660, 1440], [1860, 1440]].forEach(([x, y]) =>
      this.add.image(x, y, 'bench').setOrigin(0.5, 1).setDepth(y))
    // Cathedral Park greenery
    ;[[1200, 1200], [1420, 1200], [1200, 1420], [1420, 1420]].forEach(([x, y]) =>
      this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
  }

  // ---- Ion (4-direction) -------------------------------------------------
  buildIon() {
    this.anims.create({ key: 'walk-down', frames: [{ key: 'ion_down0' }, { key: 'ion_down1' }], frameRate: 8, repeat: -1 })
    this.anims.create({ key: 'walk-up', frames: [{ key: 'ion_up0' }, { key: 'ion_up1' }], frameRate: 8, repeat: -1 })
    this.anims.create({ key: 'walk-side', frames: [{ key: 'ion_side0' }, { key: 'ion_side1' }], frameRate: 8, repeat: -1 })
    this.facing = 'down'
    this.ion = this.physics.add.sprite(1310, BD_BOT + 150, 'ion_down0')
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

  update() {
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
      // pick facing from dominant axis → turns to profile when moving sideways
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.facing = 'side'
        this.ion.setFlipX(vx < 0)
        this.ion.anims.play('walk-side', true)
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
