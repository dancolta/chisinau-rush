import Phaser from 'phaser'

const WORLD_W = 2400
const WORLD_H = 1500
const ROAD_Y = 770
const ROAD_H = 130
const ROAD_TOP = ROAD_Y - ROAD_H / 2
const ROAD_BOT = ROAD_Y + ROAD_H / 2

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
    this.buildParkProps()
    this.buildBoulevardProps()
    this.buildIon()
    this.buildCamera()
    this.buildInput()

    // UI lives in a parallel scene (its own un-zoomed camera).
    this.registry.set('crt', true)
    this.registry.set('nearLm', null)
    this.scene.launch('Ui')
  }

  // ---- ground ------------------------------------------------------------
  buildGround() {
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass').setOrigin(0).setDepth(-1000)

    // Piața Marii Adunări Naționale (paved square, north of centre)
    this.add.tileSprite(960, 460, 500, ROAD_TOP - 460, 'plaza').setOrigin(0).setDepth(-900)

    // Grădina Publică (park, south) — paths
    this.add.tileSprite(1184, ROAD_BOT, 40, 1230 - ROAD_BOT, 'path').setOrigin(0).setDepth(-900)
    this.add.tileSprite(950, 968, 520, 34, 'path').setOrigin(0).setDepth(-900)

    // sidewalks
    this.add.tileSprite(0, ROAD_TOP - 20, WORLD_W, 20, 'sidewalk').setOrigin(0).setDepth(-880)
    this.add.tileSprite(0, ROAD_BOT, WORLD_W, 20, 'sidewalk').setOrigin(0).setDepth(-880)

    // road
    this.add.tileSprite(0, ROAD_TOP, WORLD_W, ROAD_H, 'road').setOrigin(0).setDepth(-870)
    for (let x = 16; x < WORLD_W; x += 28) this.add.image(x, ROAD_Y, 'dash').setOrigin(0, 0.5).setDepth(-860)

    // pedestrian crossings
    ;[700, 1204, 1700].forEach((x) =>
      this.add.tileSprite(x, ROAD_TOP, 40, ROAD_H, 'zebra').setOrigin(0).setDepth(-862))
  }

  // ---- landmarks (with proximity labels) ---------------------------------
  landmark(x, baseY, key, name, desc, tint) {
    const img = this.add.image(x, baseY, key).setOrigin(0.5, 1).setDepth(baseY)
    if (tint !== undefined) img.setTint(tint)
    const w = img.width * 0.78
    const zone = this.add.zone(x, baseY - img.height * 0.16, w, img.height * 0.32)
    this.physics.add.existing(zone, true)
    this.solids.add(zone)
    this.landmarks.push({ x, y: baseY, top: baseY - img.height, name, desc })
    return img
  }

  // an invisible labelled spot (e.g. the alley)
  labelSpot(x, y, name, desc) {
    this.landmarks.push({ x, y, top: y - 30, name, desc })
  }

  buildLandmarks() {
    const N = ROAD_TOP - 12 // building base on the north sidewalk

    // The grand square
    this.landmark(1210, 560, 'govern', 'Casa Guvernului',
      'Sediul Guvernului. Aici se „lucrează la asta".')
    this.landmark(1210, N, 'arc', 'Arcul de Triumf',
      'Poarta Sfântă, 1840. De aici începe orice paradă.')
    this.landmark(1430, N, 'cathedral', 'Catedrala Nașterea Domnului',
      '1836. Inima ortodoxă a orașului.')
    this.landmark(1486, N - 4, 'belltower', 'Clopotnița',
      'Dărâmată de sovietici în 1962, reconstruită în 1997.')

    // Along the boulevard
    this.landmark(560, N, 'presidency', 'Președinția',
      'Palatul Președintelui Republicii Moldova.')
    this.landmark(840, N, 'primaria', 'Primăria Chișinău',
      'Primăria municipiului — turnul cu ceas, 1902.')
    this.landmark(1690, N, 'opera', 'Teatrul de Operă și Balet',
      'Maria Bieșu. Operă, balet și premiere de gală.')
    this.landmark(2010, N, 'parliament', 'Parlamentul',
      'Aici se votează legile (și se ceartă deputații).')

    // The park
    this.landmark(1204, 905, 'statue', 'Monumentul lui Ștefan cel Mare',
      'Domnitorul. Locul de întâlnire al Chișinăului.')
    this.landmark(1204, 1060, 'fountain', 'Fântâna Arteziană',
      'Grădina Publică „Ștefan cel Mare". Răcoare vara.')
    this.labelSpot(1204, 985, 'Aleea Clasicilor',
      'Busturile scriitorilor — de la Eminescu la Creangă.')
  }

  // ---- Soviet residential ------------------------------------------------
  buildResidential() {
    const tints = [0xc4c8cd, 0xcabfa9, 0xb6c0b0, 0xc1b9c4, 0xbfc4cb]
    const place = (xs, baseY) => xs.forEach((x, i) =>
      this.add.image(x, baseY, 'bloc').setOrigin(0.5, 1).setDepth(baseY).setTint(tints[(i + Math.round(baseY)) % tints.length]))

    // far north rows (behind the square / boulevard)
    place([120, 250, 380], 540)
    place([2080, 2210, 2340], 540)
    place([120, 250, 380, 510], 650)
    place([2080, 2210, 2340], 650)
    // south rows (behind the park / boulevard)
    place([140, 270, 400, 530], ROAD_BOT + 240)
    place([140, 270, 400, 530], ROAD_BOT + 360)
    place([2060, 2190, 2320], ROAD_BOT + 240)
    place([1640, 1770, 1900, 2030], ROAD_BOT + 360)
  }

  // ---- park props --------------------------------------------------------
  buildParkProps() {
    // Alley of Classics — busts along the horizontal path
    for (let x = 1010; x <= 1400; x += 56) {
      this.add.image(x, 996, 'bust').setOrigin(0.5, 1).setDepth(996)
      if (x + 28 <= 1400) this.add.image(x + 28, 996, 'tree').setOrigin(0.5, 1).setDepth(996)
    }
    // benches + trees framing the park
    const trees = [[1000, 880], [1420, 880], [990, 1080], [1430, 1080], [1100, 1160], [1320, 1160], [1204, 1180]]
    trees.forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
    const benches = [[1140, 930], [1270, 930], [1140, 1100], [1270, 1100]]
    benches.forEach(([x, y]) => this.add.image(x, y, 'bench').setOrigin(0.5, 1).setDepth(y))
    const bushes = [[1040, 940], [1380, 940], [1060, 1120], [1360, 1120]]
    bushes.forEach(([x, y]) => this.add.image(x, y, 'bush').setOrigin(0.5, 1).setDepth(y))
  }

  // ---- boulevard props ---------------------------------------------------
  buildBoulevardProps() {
    // lampposts + trees alternating along both sidewalks
    for (let x = 80; x < WORLD_W; x += 150) {
      this.add.image(x, ROAD_TOP - 20, 'lamp').setOrigin(0.5, 1).setDepth(ROAD_TOP - 20)
      this.add.image(x + 75, ROAD_BOT + 20, 'lamp').setOrigin(0.5, 1).setDepth(ROAD_BOT + 20)
    }
    // trees only on stretches without landmarks (edges)
    for (let x = 80; x < 520; x += 110) {
      this.add.image(x, ROAD_BOT + 20, 'tree').setOrigin(0.5, 1).setDepth(ROAD_BOT + 20)
    }
    for (let x = 2120; x < WORLD_W - 40; x += 110) {
      this.add.image(x, ROAD_BOT + 20, 'tree').setOrigin(0.5, 1).setDepth(ROAD_BOT + 20)
    }
    // plaza trim
    ;[[975, 700], [1445, 700]].forEach(([x, y]) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y))
  }

  // ---- Ion ---------------------------------------------------------------
  buildIon() {
    this.anims.create({ key: 'walk', frames: [{ key: 'ion0' }, { key: 'ion1' }], frameRate: 8, repeat: -1 })
    this.ion = this.physics.add.sprite(1140, ROAD_BOT + 60, 'ion0')
    this.ion.body.setSize(8, 6).setOffset(2, 10)
    this.ion.setCollideWorldBounds(true)
    this.physics.add.collider(this.ion, this.solids)
  }

  buildCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.ion, true, 0.12, 0.12)
    this.cameras.main.setZoom(2.8)
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

  zoomBy(d) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + d, 1.6, 5))
  }

  // nearest landmark within range → registry (UiScene renders the banner)
  updateNameplate() {
    let near = null
    let best = 150 * 150
    for (const lm of this.landmarks) {
      const dx = this.ion.x - lm.x
      const dy = this.ion.y - lm.y
      const d2 = dx * dx + dy * dy
      if (d2 < best) { best = d2; near = lm }
    }
    const cur = this.registry.get('nearLm')
    const name = near ? near.name : null
    if ((cur && cur.name) !== name) {
      this.registry.set('nearLm', near ? { name: near.name, desc: near.desc } : null)
    }
  }

  update() {
    const k = this.keys, c = this.cursors
    const speed = k.SHIFT.isDown ? 170 : 96
    let vx = 0, vy = 0
    if (k.A.isDown || c.left.isDown) vx -= 1
    if (k.D.isDown || c.right.isDown) vx += 1
    if (k.W.isDown || c.up.isDown) vy -= 1
    if (k.S.isDown || c.down.isDown) vy += 1

    const v = new Phaser.Math.Vector2(vx, vy)
    if (v.length() > 0) {
      v.normalize().scale(speed)
      this.ion.setVelocity(v.x, v.y)
      this.ion.anims.play('walk', true)
      if (vx < 0) this.ion.setFlipX(true)
      else if (vx > 0) this.ion.setFlipX(false)
    } else {
      this.ion.setVelocity(0, 0)
      this.ion.anims.stop()
      this.ion.setTexture('ion0')
    }
    this.ion.setDepth(this.ion.y)
    this.updateNameplate()
  }
}
