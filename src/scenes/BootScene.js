import Phaser from 'phaser'

/**
 * BootScene — procedural 16-bit texture factory.
 * No external assets: every sprite is drawn in code in the target palette so
 * the world is self-contained. Real CC0 / Aseprite art replaces these keys later.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create() {
    this.makeIon()
    this.makeGround()
    this.makeProps()
    // Landmarks
    this.makeArc()
    this.makeCathedral()
    this.makeBellTower()
    this.makeGovern()
    this.makePrimaria()
    this.makeOpera()
    this.makeParliament()
    this.makePresidency()
    this.makeChurch()
    this.makeStatue()
    this.makeFountain()
    this.makeHotel()
    this.makeMuseum()
    this.makeTheatre()
    this.makeMarket()
    this.makeGara()
    this.makeShops()
    this.makeStreetFood()
    this.makeTransit()
    this.makeKotovsky()
    this.makeStallPlay()
    this.makePiataArch()
    this.makeCars()
    this.makeTrain()
    this.makeFlag()
    // Residential
    this.makeKhrushchyovka()
    this.makeScanlines()
    this.scene.start('Centru')
  }

  // ---- helpers -----------------------------------------------------------
  drawGrid(key, rows, palette) {
    const h = rows.length
    const w = rows[0].length
    const g = this.add.graphics()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = rows[y][x]
        if (c === '.' || c === ' ') continue
        g.fillStyle(palette[c], 1)
        g.fillRect(x, y, 1, 1)
      }
    }
    g.generateTexture(key, w, h)
    g.destroy()
  }

  tex(key, w, h, draw) {
    const g = this.add.graphics()
    draw(g)
    g.generateTexture(key, w, h)
    g.destroy()
  }

  // ---- character (4-direction: down / up / side) -------------------------
  makeIon() {
    const pal = { h: 0x4a3220, s: 0xe8b894, k: 0x3a2616, b: 0x2f6fb0, p: 0x33343d, o: 0x191a1f }
    // facing DOWN (front)
    this.drawGrid('ion_down0', [
      '....hhhh....', '...hhhhhh...', '...hssssh...', '...hssssh...',
      '...kssssk...', '....ssss....', '...bbbbbb...', '..bbbbbbbb..',
      '..sbbbbbbs..', '..sbbbbbbs..', '...bbbbbb...', '...pppppp...',
      '...pp..pp...', '...pp..pp...', '...oo..oo...', '...oo..oo...',
    ], pal)
    this.drawGrid('ion_down1', [
      '....hhhh....', '...hhhhhh...', '...hssssh...', '...hssssh...',
      '...kssssk...', '....ssss....', '...bbbbbb...', '..bbbbbbbb..',
      '..sbbbbbbs..', '..sbbbbbbs..', '...bbbbbb...', '...pppppp...',
      '...pp..pp...', '...pp..pp...', '..oo....oo..', '..oo....oo..',
    ], pal)
    // facing UP (back) — no face
    this.drawGrid('ion_up0', [
      '....hhhh....', '...hhhhhh...', '...hhhhhh...', '...hhhhhh...',
      '...hhhhhh...', '....hhhh....', '...bbbbbb...', '..bbbbbbbb..',
      '..sbbbbbbs..', '..sbbbbbbs..', '...bbbbbb...', '...pppppp...',
      '...pp..pp...', '...pp..pp...', '...oo..oo...', '...oo..oo...',
    ], pal)
    this.drawGrid('ion_up1', [
      '....hhhh....', '...hhhhhh...', '...hhhhhh...', '...hhhhhh...',
      '...hhhhhh...', '....hhhh....', '...bbbbbb...', '..bbbbbbbb..',
      '..sbbbbbbs..', '..sbbbbbbs..', '...bbbbbb...', '...pppppp...',
      '...pp..pp...', '...pp..pp...', '..oo....oo..', '..oo....oo..',
    ], pal)
    // facing SIDE (profile, facing right) — flipX for left
    this.drawGrid('ion_side0', [
      '....hhhh....', '...hhhhhh...', '...hhssss...', '...hsksss...',
      '...hsssss...', '....ssss....', '...bbbbb....', '..bbbbbb....',
      '..bbbbbs....', '..bbbbb.....', '...bbbb.....', '...pppp.....',
      '..pp.pp.....', '..pp.pp.....', '..oo.oo.....', '..oo.oo.....',
    ], pal)
    this.drawGrid('ion_side1', [
      '....hhhh....', '...hhhhhh...', '...hhssss...', '...hsksss...',
      '...hsssss...', '....ssss....', '...bbbbb....', '..bbbbbb....',
      '.sbbbbb.....', '..bbbbb.....', '...bbbb.....', '...pppp.....',
      '...pp.......', '...pp.......', '...oo.......', '...oo.......',
    ], pal)
  }

  // ---- ground tiles ------------------------------------------------------
  makeGround() {
    const T = 16
    this.tex('grass', T, T, (g) => {
      g.fillStyle(0x3f7a3c, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0x356b33, 1);[[2, 3], [10, 5], [5, 11], [13, 9], [7, 7]].forEach(([x, y]) => g.fillRect(x, y, 2, 1))
      g.fillStyle(0x4d8a44, 1);[[4, 6], [12, 2], [9, 13], [1, 10]].forEach(([x, y]) => g.fillRect(x, y, 1, 1))
    })
    this.tex('road', T, T, (g) => {
      g.fillStyle(0x3a3e46, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0x33373e, 1);[[3, 2], [11, 6], [6, 12], [14, 10], [1, 8]].forEach(([x, y]) => g.fillRect(x, y, 2, 2))
    })
    this.tex('sidewalk', T, T, (g) => {
      g.fillStyle(0x8b909a, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0x767b85, 1); g.fillRect(0, 0, T, 1); g.fillRect(0, 8, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(8, 0, 1, T)
    })
    // warm plaza paving (the square)
    this.tex('plaza', T, T, (g) => {
      g.fillStyle(0xb9ad93, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0xa89c80, 1); g.fillRect(0, 0, T, 1); g.fillRect(0, 8, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(8, 0, 1, T)
      g.fillStyle(0xc6bb9f, 1); g.fillRect(2, 2, 1, 1); g.fillRect(10, 10, 1, 1)
    })
    // park path (sandy)
    this.tex('path', T, T, (g) => {
      g.fillStyle(0xc2a86a, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0xb39a5c, 1);[[3, 4], [9, 9], [13, 2], [6, 12]].forEach(([x, y]) => g.fillRect(x, y, 2, 1))
    })
    this.tex('dash', 10, 2, (g) => { g.fillStyle(0xc9b13a, 1); g.fillRect(0, 0, 10, 2) })
    // beton (concrete) paving
    this.tex('beton', T, T, (g) => {
      g.fillStyle(0x9a9ea4, 1); g.fillRect(0, 0, T, T)
      g.fillStyle(0x8a8e94, 1); g.fillRect(0, 0, T, 1); g.fillRect(0, 8, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(8, 0, 1, T)
      g.fillStyle(0xa6aab0, 1); g.fillRect(3, 3, 1, 1); g.fillRect(11, 11, 1, 1)
    })
    // zebra crossing strip (vertical white bars on a road tile span)
    this.tex('zebra', 16, 16, (g) => {
      g.fillStyle(0xeeeeee, 1); g.fillRect(1, 0, 4, 16); g.fillRect(9, 0, 4, 16)
    })
  }

  // ---- props -------------------------------------------------------------
  makeProps() {
    this.tex('tree', 28, 38, (g) => {
      g.fillStyle(0x5a3d22, 1); g.fillRect(12, 26, 4, 12)              // trunk
      g.fillStyle(0x2f6b30, 1); g.fillCircle(14, 16, 13)               // canopy dark
      g.fillStyle(0x3f8038, 1); g.fillCircle(11, 13, 9)
      g.fillStyle(0x4f9a44, 1); g.fillCircle(17, 11, 6)                // highlight
    })
    this.tex('bush', 18, 14, (g) => {
      g.fillStyle(0x2f6b30, 1); g.fillCircle(6, 9, 6); g.fillCircle(12, 9, 6)
      g.fillStyle(0x4f9a44, 1); g.fillCircle(9, 6, 4)
    })
    this.tex('bench', 18, 12, (g) => {
      g.fillStyle(0x7a5a36, 1); g.fillRect(1, 4, 16, 3); g.fillRect(1, 1, 16, 2)
      g.fillStyle(0x3a3a40, 1); g.fillRect(2, 7, 2, 4); g.fillRect(14, 7, 2, 4)
    })
    this.tex('lamp', 8, 32, (g) => {
      g.fillStyle(0x2c2f36, 1); g.fillRect(3, 4, 2, 28)
      g.fillStyle(0x3a3f48, 1); g.fillRect(1, 30, 6, 2)
      g.fillStyle(0xffe8a0, 1); g.fillRect(2, 0, 4, 5)                 // lit head
      g.fillStyle(0xfff6d6, 1); g.fillRect(3, 1, 2, 2)
    })
    this.tex('bust', 12, 22, (g) => {
      g.fillStyle(0x9a9488, 1); g.fillRect(3, 10, 6, 12)              // pedestal
      g.fillStyle(0x7e7a70, 1); g.fillRect(3, 10, 1, 12)
      g.fillStyle(0x4f6b58, 1); g.fillCircle(6, 6, 4)                 // bronze head
      g.fillStyle(0x5e7e66, 1); g.fillCircle(5, 5, 2)
    })
  }

  // ---- landmarks ---------------------------------------------------------
  makeArc() {
    const W = 66, H = 88
    const stone = 0xd8cbb0, mid = 0xb9a883, dark = 0x8f7f60, shad = 0x6f6248
    this.tex('arc', W, H, (g) => {
      g.fillStyle(shad, 1); g.fillRect(0, H - 9, W, 9)
      g.fillStyle(mid, 1); g.fillRect(5, H - 16, W - 10, 7)
      g.fillStyle(stone, 1); g.fillRect(7, 22, 17, H - 31); g.fillRect(W - 24, 22, 17, H - 31)
      g.fillStyle(dark, 1); g.fillRect(7, 22, 2, H - 31); g.fillRect(W - 9, 22, 2, H - 31)
      g.fillStyle(shad, 1); g.fillRect(24, 32, W - 48, H - 41)
      g.fillStyle(0x141414, 1); g.fillRect(26, 36, W - 52, H - 45)
      g.fillStyle(stone, 1); g.fillRect(24, 30, 4, 7); g.fillRect(W - 28, 30, 4, 7)
      g.fillStyle(stone, 1); g.fillRect(2, 13, W - 4, 11)
      g.fillStyle(dark, 1); g.fillRect(2, 22, W - 4, 2)
      g.fillStyle(mid, 1); g.fillRect(17, 3, W - 34, 12)
      g.fillStyle(0xf2ead2, 1); g.fillCircle(W / 2, 9, 4)
      g.fillStyle(0x2a2a2a, 1); g.fillRect(W / 2 - 1, 6, 1, 3); g.fillRect(W / 2, 9, 2, 1)
      // flag
      g.fillStyle(0x6b6b6b, 1); g.fillRect(W / 2, -6, 1, 9)
      g.fillStyle(0x0033a0, 1); g.fillRect(W / 2 + 1, -6, 3, 2)
      g.fillStyle(0xffd200, 1); g.fillRect(W / 2 + 4, -6, 3, 2)
      g.fillStyle(0xcc092f, 1); g.fillRect(W / 2 + 7, -6, 3, 2)
    })
  }

  makeCathedral() {
    const W = 78, H = 76
    this.tex('cathedral', W, H, (g) => {
      g.fillStyle(0xeceae2, 1); g.fillRect(8, 30, W - 16, H - 30)        // body
      g.fillStyle(0xd8d5ca, 1); g.fillRect(8, 30, 3, H - 30)
      // portico columns
      g.fillStyle(0xfbfaf4, 1); g.fillRect(10, 34, W - 20, 6)
      g.fillStyle(0xcfccc0, 1)
      for (let x = 14; x < W - 14; x += 8) g.fillRect(x, 40, 3, H - 44)
      // pediment
      g.fillStyle(0xeceae2, 1); g.fillTriangle(10, 34, W - 10, 34, W / 2, 18)
      g.fillStyle(0xd8d5ca, 1); g.fillTriangle(10, 34, W / 2, 34, W / 2, 20)
      // green dome + cross
      g.fillStyle(0x2f7d5c, 1); g.fillCircle(W / 2, 16, 12)
      g.fillStyle(0x3a9a70, 1); g.fillCircle(W / 2 - 3, 13, 6)
      g.fillStyle(0xcdaa3a, 1); g.fillRect(W / 2 - 1, 0, 2, 7); g.fillRect(W / 2 - 3, 2, 6, 1)
      // door
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 6, H - 18, 12, 18)
    })
  }

  makeBellTower() {
    const W = 30, H = 100
    this.tex('belltower', W, H, (g) => {
      g.fillStyle(0xeceae2, 1); g.fillRect(4, 18, W - 8, H - 18)
      g.fillStyle(0xd8d5ca, 1); g.fillRect(4, 18, 2, H - 18)
      g.fillStyle(0x9a978c, 1)                                          // arched openings
      g.fillRect(9, 30, 5, 9); g.fillRect(17, 30, 5, 9)
      g.fillRect(9, 52, 5, 9); g.fillRect(17, 52, 5, 9)
      g.fillStyle(0xcfccc0, 1); g.fillRect(2, 16, W - 4, 4)            // cornice
      g.fillStyle(0xcdaa3a, 1); g.fillCircle(W / 2, 10, 7)            // gold cupola
      g.fillStyle(0xe6c75a, 1); g.fillCircle(W / 2 - 2, 8, 3)
      g.fillStyle(0xcdaa3a, 1); g.fillRect(W / 2 - 1, 0, 2, 5)        // cross
      g.fillRect(W / 2 - 3, 1, 6, 1)
    })
  }

  makeGovern() {
    const W = 124, H = 90
    this.tex('govern', W, H, (g) => {
      g.fillStyle(0xcdc1a6, 1); g.fillRect(2, 14, W - 4, H - 14)
      g.fillStyle(0xb9ad90, 1); g.fillRect(2, 14, 3, H - 14)
      g.fillStyle(0xddd2b8, 1); g.fillRect(2, 14, W - 4, 4)           // top cornice
      // central avant-corps with columns
      g.fillStyle(0xd6cbb0, 1); g.fillRect(W / 2 - 22, 8, 44, H - 8)
      g.fillStyle(0xb9ad90, 1)
      for (let x = W / 2 - 18; x < W / 2 + 18; x += 7) g.fillRect(x, 22, 3, H - 30)
      // window grid on wings
      g.fillStyle(0x3a4654, 1)
      for (let y = 24; y < H - 10; y += 12) {
        for (let x = 8; x < W / 2 - 24; x += 11) g.fillRect(x, y, 6, 7)
        for (let x = W / 2 + 24; x < W - 10; x += 11) g.fillRect(x, y, 6, 7)
      }
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 7, H - 16, 14, 16) // door
      // flag
      g.fillStyle(0x6b6b6b, 1); g.fillRect(W / 2, -8, 1, 16)
      g.fillStyle(0x0033a0, 1); g.fillRect(W / 2 + 1, -8, 4, 3)
      g.fillStyle(0xffd200, 1); g.fillRect(W / 2 + 5, -8, 4, 3)
      g.fillStyle(0xcc092f, 1); g.fillRect(W / 2 + 9, -8, 4, 3)
    })
  }

  makePrimaria() {
    const W = 80, H = 110
    this.tex('primaria', W, H, (g) => {
      // main body — cream with red banding (eclectic)
      g.fillStyle(0xe7d6b0, 1); g.fillRect(22, 40, W - 24, H - 40)
      g.fillStyle(0xb5462f, 1); g.fillRect(22, 40, W - 24, 4); g.fillRect(22, 64, W - 24, 3)
      g.fillStyle(0x3a4654, 1)
      for (let y = 48; y < H - 10; y += 13) {
        for (let x = 28; x < W - 8; x += 11) g.fillRect(x, y, 6, 8)
      }
      // tall corner clock tower (left)
      g.fillStyle(0xe7d6b0, 1); g.fillRect(4, 14, 22, H - 14)
      g.fillStyle(0xb5462f, 1); g.fillRect(4, 14, 22, 4)
      g.fillStyle(0x8f2f1f, 1); g.fillTriangle(2, 16, 28, 16, 15, 0)   // pointed roof
      g.fillStyle(0xf4ecd6, 1); g.fillCircle(15, 26, 5)               // clock face
      g.fillStyle(0x2a2a2a, 1); g.fillRect(14, 22, 1, 4); g.fillRect(15, 26, 3, 1)
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 + 2, H - 16, 12, 16) // door
    })
  }

  makeOpera() {
    const W = 98, H = 66
    this.tex('opera', W, H, (g) => {
      g.fillStyle(0xe9e7df, 1); g.fillRect(4, 20, W - 8, H - 20)
      g.fillStyle(0xd6d3c8, 1); g.fillRect(4, 20, W - 8, 4)
      // vertical fins
      g.fillStyle(0xcfccc0, 1)
      for (let x = 10; x < W - 8; x += 9) g.fillRect(x, 24, 4, H - 30)
      // glass base
      g.fillStyle(0x4a6b82, 1); g.fillRect(8, H - 16, W - 16, 12)
      g.fillStyle(0x5e84a0, 1); g.fillRect(8, H - 16, W - 16, 3)
      g.fillStyle(0xb59a4a, 1); g.fillRect(W / 2 - 14, 12, 28, 8)     // marquee
    })
  }

  makeParliament() {
    const W = 132, H = 72
    this.tex('parliament', W, H, (g) => {
      g.fillStyle(0xbfc4cb, 1); g.fillRect(4, 16, W - 8, H - 16)
      g.fillStyle(0xaab0b8, 1); g.fillRect(4, 16, 3, H - 16)
      g.fillStyle(0xd0d4da, 1); g.fillRect(4, 16, W - 8, 4)
      // big glass curtain wall
      g.fillStyle(0x3f5f78, 1); g.fillRect(10, 24, W - 20, H - 34)
      g.fillStyle(0x55778f, 1)
      for (let x = 14; x < W - 12; x += 10) g.fillRect(x, 24, 2, H - 34)
      for (let y = 28; y < H - 12; y += 9) g.fillRect(10, y, W - 20, 1)
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 9, H - 14, 18, 14)
    })
  }

  makePresidency() {
    const W = 82, H = 74
    this.tex('presidency', W, H, (g) => {
      g.fillStyle(0xd9cfb8, 1); g.fillRect(4, 16, W - 8, H - 16)
      g.fillStyle(0xc6bca3, 1); g.fillRect(4, 16, 3, H - 16)
      g.fillStyle(0xe6ddc8, 1); g.fillRect(2, 10, W - 4, 8)           // portico slab
      g.fillStyle(0xc6bca3, 1)
      for (let x = 12; x < W - 10; x += 10) g.fillRect(x, 18, 4, H - 26) // columns
      g.fillStyle(0x3a4654, 1)
      for (let y = 24; y < H - 10; y += 12) for (let x = 14; x < W - 12; x += 11) g.fillRect(x, y, 5, 6)
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 7, H - 16, 14, 16)
    })
  }

  makeStatue() {
    const W = 24, H = 58
    this.tex('statue', W, H, (g) => {
      g.fillStyle(0x9a9488, 1); g.fillRect(6, 34, 12, 24)             // pedestal
      g.fillStyle(0x7e7a70, 1); g.fillRect(6, 34, 2, 24)
      g.fillStyle(0x8a857a, 1); g.fillRect(4, 32, 16, 3)
      // bronze figure (Ștefan, cross raised)
      g.fillStyle(0x4f6b58, 1)
      g.fillRect(10, 14, 4, 18)                                       // body
      g.fillCircle(12, 11, 3)                                         // head
      g.fillRect(7, 18, 3, 8); g.fillRect(14, 16, 3, 10)             // arms
      g.fillStyle(0x5e7e66, 1); g.fillRect(16, 6, 2, 12); g.fillRect(14, 9, 6, 2) // cross
    })
  }

  makeFountain() {
    const W = 44, H = 28
    this.tex('fountain', W, H, (g) => {
      g.fillStyle(0x9a9488, 1); g.fillEllipse(W / 2, H / 2 + 4, W, H - 6)  // stone rim
      g.fillStyle(0x3f76b0, 1); g.fillEllipse(W / 2, H / 2 + 4, W - 8, H - 12) // water
      g.fillStyle(0x6fa8d8, 1); g.fillEllipse(W / 2, H / 2 + 2, W - 18, H - 18)
      g.fillStyle(0xdff0ff, 1); g.fillRect(W / 2 - 1, 2, 2, 12)        // jet
      g.fillStyle(0xbfe0ff, 1); g.fillRect(W / 2 - 3, 6, 6, 2)
    })
  }

  makeKhrushchyovka() {
    // 5-storey Soviet panel block. Tint per instance for variety.
    const W = 88, H = 64
    this.tex('bloc', W, H, (g) => {
      g.fillStyle(0xb7bcc2, 1); g.fillRect(0, 6, W, H - 6)             // facade
      g.fillStyle(0xa6abb2, 1); g.fillRect(0, 6, 3, H - 6)            // shadow side
      g.fillStyle(0x9aa0a8, 1); g.fillRect(0, 6, W, 3)               // roofline
      // panel seams
      g.fillStyle(0xacb1b8, 1)
      for (let x = 0; x < W; x += 11) g.fillRect(x, 9, 1, H - 9)
      // window + balcony grid (5 floors)
      for (let fy = 12; fy < H - 8; fy += 11) {
        for (let fx = 5; fx < W - 7; fx += 11) {
          g.fillStyle(0x3a6f8c, 1); g.fillRect(fx, fy, 6, 6)          // window
          g.fillStyle(0x5e8aa6, 1); g.fillRect(fx, fy, 6, 1)
          // every other column: balcony rail under window
          if ((fx / 11) % 2 === 0) { g.fillStyle(0x8f949b, 1); g.fillRect(fx - 1, fy + 7, 8, 2) }
        }
      }
      // ground entrances
      g.fillStyle(0x4a3f33, 1); g.fillRect(10, H - 9, 7, 9); g.fillRect(W - 20, H - 9, 7, 9)
    })
  }

  makeHotel() {
    // Hotel Național — brutalist concrete ruin (tall)
    const W = 66, H = 124
    this.tex('hotel', W, H, (g) => {
      g.fillStyle(0x9a9ea4, 1); g.fillRect(3, 6, W - 6, H - 6)
      g.fillStyle(0x868b91, 1); g.fillRect(3, 6, 3, H - 6)
      g.fillStyle(0x7e848a, 1); g.fillRect(3, 6, W - 6, 3)
      g.fillStyle(0x8a8f95, 1)
      for (let x = 3; x < W; x += 9) g.fillRect(x, 9, 1, H - 9)
      g.fillStyle(0x2b3036, 1)
      for (let y = 14; y < H - 8; y += 9) for (let x = 8; x < W - 8; x += 9) g.fillRect(x, y, 5, 6)
      g.fillStyle(0x3b424a, 1)
      ;[[17, 32], [44, 50], [26, 77], [53, 95]].forEach(([x, y]) => g.fillRect(x, y, 5, 6)) // broken/lighter
    })
  }

  makeMuseum() {
    // National History Museum — neoclassical with pediment + columns
    const W = 88, H = 72
    this.tex('museum', W, H, (g) => {
      g.fillStyle(0xb9b3a2, 1); g.fillRect(6, H - 8, W - 12, 8)        // steps
      g.fillStyle(0xe7e2d4, 1); g.fillRect(10, 30, W - 20, H - 38)     // body
      g.fillStyle(0xcfc9b8, 1)
      for (let x = 16; x < W - 14; x += 9) g.fillRect(x, 34, 4, H - 44) // columns
      g.fillStyle(0xeceae0, 1); g.fillRect(8, 26, W - 16, 6)          // architrave
      g.fillStyle(0xe7e2d4, 1); g.fillTriangle(8, 26, W - 8, 26, W / 2, 8) // pediment
      g.fillStyle(0xcfc9b8, 1); g.fillTriangle(8, 26, W / 2, 26, W / 2, 10)
      g.fillStyle(0x6b6b6b, 1); g.fillRect(W / 2, -6, 1, 14)          // flag
      g.fillStyle(0x0033a0, 1); g.fillRect(W / 2 + 1, -6, 3, 2); g.fillStyle(0xffd200, 1); g.fillRect(W / 2 + 4, -6, 3, 2); g.fillStyle(0xcc092f, 1); g.fillRect(W / 2 + 7, -6, 3, 2)
    })
  }

  makeTheatre() {
    // Teatrul Național — classical, columns, roof statues
    const W = 82, H = 68
    this.tex('theatre', W, H, (g) => {
      g.fillStyle(0xe9dcc2, 1); g.fillRect(8, 26, W - 16, H - 26)
      g.fillStyle(0xd6c9ac, 1); g.fillRect(8, 26, 3, H - 26)
      g.fillStyle(0xcabd9e, 1)
      for (let x = 14; x < W - 12; x += 9) g.fillRect(x, 30, 4, H - 38)
      g.fillStyle(0xf0e6cf, 1); g.fillRect(6, 22, W - 12, 6)          // entablature
      g.fillStyle(0x9a8f72, 1); g.fillRect(12, 14, 6, 8); g.fillRect(W - 18, 14, 6, 8) // roof statues
      g.fillStyle(0x7c5a3a, 1); g.fillRect(W / 2 - 7, H - 16, 14, 16) // doors
    })
  }

  makeMarket() {
    // Piața Centrală — long hall + striped stall awnings
    const W = 116, H = 60
    this.tex('market', W, H, (g) => {
      g.fillStyle(0xddd0b0, 1); g.fillRect(4, 12, W - 8, H - 20)
      g.fillStyle(0xc7ba98, 1); g.fillRect(4, 12, W - 8, 3)
      g.fillStyle(0x5a4630, 1); g.fillRect(W / 2 - 9, 22, 18, H - 30)  // arched entrance
      g.fillStyle(0x3a4654, 1)
      for (let x = 12; x < W - 10; x += 14) { if (Math.abs(x - W / 2) > 16) g.fillRect(x, 20, 7, 8) }
      // stall awnings in front
      for (let x = 6; x < W - 10; x += 16) {
        g.fillStyle(0xcc3b30, 1); g.fillRect(x, H - 10, 14, 5)
        g.fillStyle(0xeeeeee, 1); g.fillRect(x + 3, H - 10, 4, 5); g.fillRect(x + 10, H - 10, 3, 5)
      }
    })
  }

  makeGara() {
    // Gara Feroviară — grand station, central clock tower
    const W = 100, H = 90
    this.tex('gara', W, H, (g) => {
      g.fillStyle(0xe2d3b0, 1); g.fillRect(6, 34, W - 12, H - 34)
      g.fillStyle(0xcdbf9a, 1); g.fillRect(6, 34, 3, H - 34)
      g.fillStyle(0xb5462f, 1); g.fillRect(6, 34, W - 12, 4)          // red band
      // central tower
      g.fillStyle(0xe2d3b0, 1); g.fillRect(W / 2 - 12, 10, 24, 30)
      g.fillStyle(0x8f2f1f, 1); g.fillTriangle(W / 2 - 14, 12, W / 2 + 14, 12, W / 2, 0)
      g.fillStyle(0xf4ecd6, 1); g.fillCircle(W / 2, 22, 5)
      g.fillStyle(0x2a2a2a, 1); g.fillRect(W / 2 - 1, 18, 1, 4); g.fillRect(W / 2, 22, 3, 1)
      // arched windows
      g.fillStyle(0x3a4654, 1)
      for (let x = 14; x < W - 12; x += 13) { if (Math.abs(x - W / 2) > 16) g.fillRect(x, 44, 7, 12) }
      g.fillStyle(0x5a4630, 1); g.fillRect(W / 2 - 8, H - 16, 16, 16)
    })
  }

  makeChurch() {
    // Biserica Schimbarea la Față (small)
    const W = 40, H = 52
    this.tex('church', W, H, (g) => {
      g.fillStyle(0xeceae2, 1); g.fillRect(8, 24, W - 16, H - 24)
      g.fillStyle(0xd8d5ca, 1); g.fillRect(8, 24, 2, H - 24)
      g.fillStyle(0x2f7d5c, 1); g.fillCircle(W / 2, 18, 9)
      g.fillStyle(0x3a9a70, 1); g.fillCircle(W / 2 - 2, 15, 4)
      g.fillStyle(0xcdaa3a, 1); g.fillRect(W / 2 - 1, 2, 2, 7); g.fillRect(W / 2 - 3, 4, 6, 1)
      g.fillStyle(0x9a978c, 1); g.fillRect(14, 30, 4, 7); g.fillRect(W - 18, 30, 4, 7)
      g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 4, H - 12, 8, 12)
    })
  }

  // Generic branded storefront. Real Chișinău brands → parody fan-art.
  makeShop(key, wall, wallShade, sign) {
    const W = 48, H = 50
    this.tex(key, W, H, (g) => {
      g.fillStyle(wall, 1); g.fillRect(2, 6, W - 4, H - 6)
      g.fillStyle(wallShade, 1); g.fillRect(2, 6, 3, H - 6)
      g.fillStyle(wallShade, 1); g.fillRect(2, 6, W - 4, 2)            // roofline
      // upper windows
      g.fillStyle(0x3a4654, 1)
      for (let x = 8; x < W - 8; x += 11) g.fillRect(x, 12, 6, 6)
      // signboard
      g.fillStyle(sign, 1); g.fillRect(4, 24, W - 8, 8)
      g.fillStyle(0xffffff, 0.18); g.fillRect(4, 24, W - 8, 2)
      // ground-floor glass + door + awning
      g.fillStyle(0x6a8aa0, 1); g.fillRect(6, 36, W - 12, H - 38)
      g.fillStyle(0x82a4ba, 1); g.fillRect(6, 36, W - 12, 2)
      g.fillStyle(sign, 1); g.fillRect(4, 33, W - 8, 3)               // awning lip
      g.fillStyle(0x4a3f33, 1); g.fillRect(W / 2 - 5, H - 11, 10, 11) // door
    })
  }

  makeShops() {
    this.makeShop('shop_linella', 0xeef0ee, 0xd5d8d4, 0x009640)  // Linella — green
    this.makeShop('shop_davidan', 0xf3e7cf, 0xddcba6, 0xc3812d)  // DaviDan — kürtos brown
    this.makeShop('shop_andys', 0x16181c, 0x0d0e11, 0xffe400)    // ANDY'S — black/yellow
    this.makeShop('shop_placinte', 0x21336a, 0x18264f, 0xebc372) // La Plăcinte — navy/gold
    this.makeShop('shop_tucano', 0xf3e7cf, 0xddcba6, 0xf9b200)   // Tucano Coffee — orange
  }

  makeStreetFood() {
    // Kebab / shaorma stall
    this.tex('kebab', 26, 28, (g) => {
      g.fillStyle(0x9a6b3a, 1); g.fillRect(2, 14, 22, 14)
      g.fillStyle(0x7a5630, 1); g.fillRect(2, 14, 22, 2)
      for (let x = 2; x < 24; x += 6) { g.fillStyle(0xcc3b30, 1); g.fillRect(x, 6, 3, 6); g.fillStyle(0xeeeeee, 1); g.fillRect(x + 3, 6, 3, 6) }
      g.fillStyle(0x6a8aa0, 1); g.fillRect(5, 18, 12, 6)           // counter window
      g.fillStyle(0x7a3b1f, 1); g.fillRect(20, 8, 3, 16)          // shaorma spit
      g.fillStyle(0xb5462f, 1); g.fillRect(20, 8, 3, 3)
    })
    // Iconic Soviet yellow cvas barrel-on-wheels
    this.tex('cvas', 32, 22, (g) => {
      g.fillStyle(0xe6b800, 1); g.fillRect(4, 4, 24, 12)
      g.fillStyle(0xf2cd33, 1); g.fillRect(4, 4, 24, 3)
      g.fillStyle(0xc79a00, 1); g.fillRect(4, 13, 24, 3)
      g.fillStyle(0xb5462f, 1); g.fillRect(12, 8, 8, 3)           // red label band
      g.fillStyle(0x555a60, 1); g.fillRect(26, 12, 3, 4)         // tap
      g.fillStyle(0x1a1a1f, 1); g.fillCircle(10, 18, 3); g.fillCircle(22, 18, 3) // wheels
    })
    // Generic newspaper/snack kiosk
    this.tex('kiosk', 22, 26, (g) => {
      g.fillStyle(0x5b6e8c, 1); g.fillRect(2, 8, 18, 18)
      g.fillStyle(0x46566e, 1); g.fillRect(2, 5, 18, 4)
      g.fillStyle(0xbcd0e0, 1); g.fillRect(5, 12, 12, 9)         // window
      ;[0xcc3b30, 0x2f9a44, 0xe6b800].forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(6 + i * 4, 13, 3, 7) })
    })
  }

  makeTransit() {
    // bus / trolleybus shelter
    this.tex('busstop', 44, 28, (g) => {
      g.fillStyle(0x3f4651, 1); g.fillRect(0, 4, 44, 4)          // roof
      g.fillStyle(0x2c323b, 1); g.fillRect(2, 8, 2, 18); g.fillRect(40, 8, 2, 18) // posts
      g.fillStyle(0x6a7a8a, 1); g.fillRect(6, 12, 30, 2)         // glass top rail
      g.fillStyle(0x7a5a36, 1); g.fillRect(8, 22, 24, 3)         // bench
      g.fillStyle(0x2f6fb0, 1); g.fillRect(38, 10, 6, 5)        // sign
    })
    // Chișinău trolleybus (white/green) with poles — horizontal
    this.tex('trolleybus', 74, 26, (g) => {
      g.fillStyle(0xeef0ee, 1); g.fillRect(3, 4, 68, 18)
      g.fillStyle(0x2f7d5c, 1); g.fillRect(3, 9, 68, 5)         // green band
      g.fillStyle(0x223040, 1); for (let x = 8; x < 66; x += 10) g.fillRect(x, 5, 7, 5) // windows
      g.fillStyle(0x6a8aa0, 1); g.fillRect(4, 5, 5, 5)         // windscreen
      g.fillStyle(0x1a1a1f, 1); g.fillCircle(18, 23, 3); g.fillCircle(56, 23, 3) // wheels
      g.fillStyle(0x444a52, 1); g.fillRect(40, -8, 2, 12); g.fillRect(48, -8, 2, 12) // trolley poles
      g.fillStyle(0xffd200, 1); g.fillRect(64, 6, 6, 4)        // route board
    })
    // city bus / rutiera (white/blue)
    this.tex('bus', 60, 24, (g) => {
      g.fillStyle(0xeef0ee, 1); g.fillRect(3, 4, 54, 16)
      g.fillStyle(0x2f6fb0, 1); g.fillRect(3, 8, 54, 4)
      g.fillStyle(0x223040, 1); for (let x = 8; x < 52; x += 9) g.fillRect(x, 5, 6, 5)
      g.fillStyle(0x1a1a1f, 1); g.fillCircle(16, 21, 3); g.fillCircle(46, 21, 3)
      g.fillStyle(0x46566e, 1); g.fillRect(50, 12, 5, 8)       // door
    })
  }

  makeKotovsky() {
    // Equestrian monument (Kotovsky) — rider on horse, bronze, on pedestal
    this.tex('kotovsky', 36, 46, (g) => {
      g.fillStyle(0x9a9488, 1); g.fillRect(8, 30, 20, 16)        // pedestal
      g.fillStyle(0x7e7a70, 1); g.fillRect(8, 30, 2, 16)
      g.fillStyle(0x8a857a, 1); g.fillRect(6, 28, 24, 3)
      g.fillStyle(0x4f6b58, 1)                                   // bronze horse (profile)
      g.fillRect(8, 16, 20, 8)                                   // body
      g.fillRect(25, 10, 5, 8)                                   // neck/head
      g.fillRect(9, 22, 3, 7); g.fillRect(15, 22, 3, 7); g.fillRect(21, 22, 3, 7); g.fillRect(25, 22, 3, 6) // legs
      g.fillStyle(0x3f5848, 1); g.fillRect(6, 16, 3, 6)         // tail
      g.fillStyle(0x4f6b58, 1); g.fillRect(15, 6, 4, 11); g.fillCircle(17, 5, 3) // rider
      g.fillStyle(0x5e7e66, 1); g.fillRect(19, 8, 6, 2)         // raised arm
    })
  }

  makeStallPlay() {
    // market stall (small awning)
    this.tex('stall', 22, 16, (g) => {
      g.fillStyle(0x8a6a44, 1); g.fillRect(3, 9, 16, 7)
      for (let x = 1; x < 21; x += 5) { g.fillStyle(0xcc3b30, 1); g.fillRect(x, 3, 3, 5); g.fillStyle(0xeeeeee, 1); g.fillRect(x + 2, 3, 3, 5) }
      ;[0x2f9a44, 0xe6b800, 0xcc3b30].forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(5 + i * 4, 11, 3, 3) })
    })
    // playground (slide + frame)
    this.tex('playground', 28, 20, (g) => {
      g.fillStyle(0xcc3b30, 1); g.fillRect(4, 6, 2, 12)
      g.fillStyle(0x2f6fb0, 1); g.fillRect(4, 6, 12, 2); g.fillTriangle(14, 8, 14, 18, 22, 18) // slide
      g.fillStyle(0xe6b800, 1); g.fillRect(18, 4, 2, 14); g.fillRect(26, 4, 2, 14); g.fillRect(18, 4, 10, 2)
      g.fillStyle(0x2f9a44, 1); g.fillRect(22, 10, 3, 3)        // swing seat
    })
    // parked car (top-down, tint per instance)
    this.tex('parkedcar', 28, 14, (g) => {
      g.fillStyle(0xffffff, 1); g.fillRect(2, 2, 24, 10)
      g.fillStyle(0xbcd0e0, 1); g.fillRect(6, 3, 6, 8); g.fillRect(16, 3, 6, 8) // windows
      g.fillStyle(0x1a1a1f, 1); g.fillRect(0, 3, 2, 3); g.fillRect(0, 8, 2, 3); g.fillRect(26, 3, 2, 3); g.fillRect(26, 8, 2, 3)
    })
  }

  makePiataArch() {
    // Wide market gateway with a banner (text drawn in-world over it)
    const W = 96, H = 56
    this.tex('piataarch', W, H, (g) => {
      g.fillStyle(0xb9a883, 1); g.fillRect(4, 16, 16, H - 16); g.fillRect(W - 20, 16, 16, H - 16) // pillars
      g.fillStyle(0x8f7f60, 1); g.fillRect(4, 16, 3, H - 16); g.fillRect(W - 20, 16, 3, H - 16)
      g.fillStyle(0xd8cbb0, 1); g.fillRect(2, 2, W - 4, 16)        // top beam
      g.fillStyle(0x8f2f1f, 1); g.fillRect(8, 5, W - 16, 10)       // red banner
      g.fillStyle(0xe6c75a, 1); g.fillRect(8, 5, W - 16, 1); g.fillRect(8, 14, W - 16, 1)
      g.fillStyle(0x6f6248, 1); g.fillRect(2, 16, W - 4, 2)
    })
  }

  // 3/4 side-view cars (face right; flipX for left) — "3D" look, many styles
  makeCar(key, body, opts = {}) {
    const W = 44, H = 26
    this.tex(key, W, H, (g) => {
      g.fillStyle(0x000000, 0.16); g.fillEllipse(W / 2, H - 2, W - 6, 6)        // shadow
      g.fillStyle(0x141417, 1); g.fillCircle(13, H - 6, 5); g.fillCircle(W - 13, H - 6, 5) // wheels
      g.fillStyle(0x4a4d53, 1); g.fillCircle(13, H - 6, 2); g.fillCircle(W - 13, H - 6, 2)
      const bodyY = opts.suv ? 8 : 12
      g.fillStyle(body, 1); g.fillRect(4, bodyY, W - 8, H - bodyY - 6)          // body
      const roofY = opts.suv ? 3 : 6
      const cx0 = opts.suv ? 8 : 13, cx1 = opts.suv ? W - 8 : W - 15
      g.fillStyle(body, 1); g.fillRect(cx0, roofY, cx1 - cx0, bodyY - roofY + 2) // cabin
      g.fillStyle(0xffffff, 0.18); g.fillRect(4, bodyY, W - 8, 2); g.fillRect(cx0, roofY, cx1 - cx0, 1) // top sheen
      g.fillStyle(0x223040, 1)                                                  // windows
      const half = (cx1 - cx0) / 2
      g.fillRect(cx0 + 2, roofY + 1, half - 2, bodyY - roofY)
      g.fillRect(cx0 + half + 1, roofY + 1, half - 3, bodyY - roofY)
      g.fillStyle(0xffe08a, 1); g.fillRect(W - 6, bodyY + 1, 2, 3)              // headlight
      g.fillStyle(0xcc3b30, 1); g.fillRect(4, bodyY + 1, 2, 3)                  // taillight
      g.fillStyle(0x000000, 0.18); g.fillRect(4, H - 7, W - 8, 2)              // sill shadow
    })
  }

  makeCars() {
    this.makeCar('car_sedan', 0xb23b3b, { suv: false })   // red sedan
    this.makeCar('car_logan', 0xdedede, { suv: false })   // white Logan
    this.makeCar('car_gwagon', 0x26262a, { suv: true })   // black G-Wagon
    this.makeCar('car_cayenne', 0x2f5bb0, { suv: true })  // blue Cayenne
    this.makeCar('car_cruiser', 0x2f6b3a, { suv: true })  // green Land Cruiser
  }

  makeTrain() {
    this.tex('rail', 32, 14, (g) => {
      g.fillStyle(0x6b5a44, 1); for (let x = 0; x < 32; x += 6) g.fillRect(x, 2, 3, 10) // sleepers
      g.fillStyle(0x8a8f96, 1); g.fillRect(0, 3, 32, 2); g.fillRect(0, 9, 32, 2)        // rails
    })
    this.tex('loco', 58, 32, (g) => {
      g.fillStyle(0x141417, 1);[12, 26, 44].forEach((x) => g.fillCircle(x, 28, 4))
      g.fillStyle(0x44474d, 1);[12, 26, 44].forEach((x) => g.fillCircle(x, 28, 1.5))
      g.fillStyle(0x2f4f7d, 1); g.fillRect(3, 8, 52, 17)        // body
      g.fillStyle(0x26446e, 1); g.fillRect(3, 8, 52, 2)
      g.fillStyle(0x1c2b44, 1); g.fillRect(38, 3, 15, 10)       // cabin (right)
      g.fillStyle(0x9ec0dc, 1); g.fillRect(41, 5, 9, 5)         // cabin window
      g.fillStyle(0x3a3f47, 1); g.fillRect(9, 2, 5, 7)          // chimney
      g.fillStyle(0xffe08a, 1); g.fillRect(53, 16, 3, 4)        // headlight (front=right)
      g.fillStyle(0xcc3b30, 1); g.fillRect(3, 22, 52, 2)
    })
    this.tex('wagon', 50, 28, (g) => {
      g.fillStyle(0x141417, 1);[11, 39].forEach((x) => g.fillCircle(x, 25, 4))
      g.fillStyle(0x2f7d5c, 1); g.fillRect(2, 6, 46, 18)
      g.fillStyle(0x276a4d, 1); g.fillRect(2, 6, 46, 2)
      g.fillStyle(0x223040, 1); for (let x = 7; x < 44; x += 9) g.fillRect(x, 10, 6, 7)
      g.fillStyle(0xe6c75a, 1); g.fillRect(2, 21, 46, 1)
    })
  }

  makeFlag() {
    this.tex('flag', 15, 30, (g) => {
      g.fillStyle(0x7a7d82, 1); g.fillRect(2, 0, 2, 30)        // pole
      g.fillStyle(0xffd24a, 1); g.fillCircle(3, 0, 1.5)        // finial
      g.fillStyle(0x0033a0, 1); g.fillRect(4, 2, 3, 8)         // blue
      g.fillStyle(0xffd200, 1); g.fillRect(7, 2, 3, 8)         // yellow
      g.fillStyle(0xcc092f, 1); g.fillRect(10, 2, 3, 8)        // red
      g.fillStyle(0x000000, 0.12); g.fillRect(4, 8, 9, 2)
    })
  }

  makeScanlines() {
    this.tex('scan', 2, 2, (g) => { g.fillStyle(0x000000, 1); g.fillRect(0, 1, 2, 1) })
  }
}
