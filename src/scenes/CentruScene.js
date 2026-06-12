import Phaser from 'phaser'

const WORLD_W = 1600
const WORLD_H = 1100
const ROAD_Y = 640      // centre of Ștefan cel Mare
const ROAD_H = 120

export default class CentruScene extends Phaser.Scene {
  constructor() {
    super('Centru')
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H)

    // --- Ground -------------------------------------------------------------
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass').setOrigin(0)

    // sidewalks framing the boulevard
    this.add.tileSprite(0, ROAD_Y - ROAD_H / 2 - 18, WORLD_W, 18, 'sidewalk').setOrigin(0)
    this.add.tileSprite(0, ROAD_Y + ROAD_H / 2, WORLD_W, 18, 'sidewalk').setOrigin(0)

    // road
    this.add.tileSprite(0, ROAD_Y - ROAD_H / 2, WORLD_W, ROAD_H, 'road').setOrigin(0)
    for (let x = 16; x < WORLD_W; x += 28) {
      this.add.image(x, ROAD_Y, 'dash').setOrigin(0, 0.5)
    }

    // --- Buildings (origin bottom-centre → y-sorted) ------------------------
    this.solids = this.physics.add.staticGroup()
    this.placeBuilding(800, ROAD_Y - ROAD_H / 2 - 16, 'arc', 1)        // Arc de Triumf, hero
    this.placeBuilding(520, ROAD_Y - ROAD_H / 2 - 16, 'cathedral', 1)  // Catedrala
    this.placeBuilding(1090, ROAD_Y - ROAD_H / 2 - 16, 'govern', 1)    // Government House

    const blocTints = [0xb9bcc2, 0xc7b9a6, 0xa9b3a0, 0xb6aeb8]
    const blocXs = [180, 360, 1260, 1440]
    blocXs.forEach((x, i) => this.placeBuilding(x, ROAD_Y - ROAD_H / 2 - 16, 'bloc', 1, blocTints[i]))
    // a back row below the boulevard too
    ;[300, 700, 980, 1300].forEach((x, i) =>
      this.placeBuilding(x, ROAD_Y + ROAD_H / 2 + 120, 'bloc', 1, blocTints[(i + 1) % 4]))

    // --- Ion ----------------------------------------------------------------
    this.anims.create({
      key: 'walk',
      frames: [{ key: 'ion0' }, { key: 'ion1' }],
      frameRate: 8,
      repeat: -1,
    })
    this.ion = this.physics.add.sprite(820, ROAD_Y + 40, 'ion0')
    this.ion.setScale(1)
    this.ion.body.setSize(8, 6).setOffset(2, 10) // feet collider
    this.ion.setCollideWorldBounds(true)
    this.physics.add.collider(this.ion, this.solids)

    // --- Camera -------------------------------------------------------------
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)
    this.cameras.main.startFollow(this.ion, true, 0.12, 0.12)
    this.cameras.main.setZoom(3)
    this.cameras.main.roundPixels = true

    // --- Input --------------------------------------------------------------
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT,T,PLUS,MINUS,Z,X')
    this.cursors = this.input.keyboard.createCursorKeys()

    this.input.keyboard.on('keydown-T', () => this.toggleCrt())
    this.input.keyboard.on('keydown-Z', () => this.zoomBy(0.5))
    this.input.keyboard.on('keydown-X', () => this.zoomBy(-0.5))
    this.input.on('wheel', (_p, _o, _dx, dy) => this.zoomBy(dy > 0 ? -0.25 : 0.25))

    this.buildHud()
  }

  placeBuilding(x, y, key, depthScale, tint) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1)
    if (tint !== undefined) img.setTint(tint)
    img.setDepth(y)
    // static collider over the footprint
    const w = img.width * 0.8
    const zone = this.add.zone(x, y - img.height * 0.18, w, img.height * 0.35)
    this.physics.add.existing(zone, true)
    this.solids.add(zone)
    return img
  }

  buildHud() {
    const s = { fontFamily: 'monospace', fontSize: '12px', color: '#ebc372' }
    this.title = this.add.text(8, 6, 'CHIȘINĂU RUSH · Centru', { ...s, fontSize: '14px' })
      .setScrollFactor(0).setDepth(10000)
    this.add.text(8, 26,
      'WASD/săgeți: mișcă · Shift: fugi · Z/X sau scroll: zoom · T: CRT',
      { ...s, color: '#cdd2dc', fontSize: '11px' })
      .setScrollFactor(0).setDepth(10000)
    this.tag = this.add.text(8, 0, 'Phase 0 · art proof', { ...s, color: '#7f8794', fontSize: '10px' })
      .setScrollFactor(0).setDepth(10000)
    this.tag.setY(this.scale.height - 16)
    this.scale.on('resize', () => this.tag.setY(this.scale.height - 16))

    // CRT scanline overlay (screen-space)
    this.crt = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'scan')
      .setOrigin(0).setScrollFactor(0).setAlpha(0.16).setDepth(20000)
    this.scale.on('resize', (gs) => this.crt.setSize(gs.width, gs.height))
    this.crtOn = true
  }

  toggleCrt() {
    this.crtOn = !this.crtOn
    this.crt.setVisible(this.crtOn)
  }

  zoomBy(d) {
    const z = Phaser.Math.Clamp(this.cameras.main.zoom + d, 1.5, 6)
    this.cameras.main.setZoom(z)
  }

  update() {
    const k = this.keys
    const c = this.cursors
    const speed = (k.SHIFT.isDown ? 165 : 95)
    let vx = 0
    let vy = 0
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
  }
}
