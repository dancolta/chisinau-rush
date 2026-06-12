import Phaser from 'phaser'

/**
 * BootScene
 * Generates every texture procedurally so Phase 0 has ZERO external asset
 * dependencies. These are placeholders in the target 16-bit palette — real
 * CC0 / hand-drawn pixel art (Aseprite) drops in over these same keys later.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create() {
    this.makeIon()
    this.makeTiles()
    this.makeArc()
    this.makeCathedral()
    this.makeGovern()
    this.makeBloc()
    this.makeScanlines()
    this.scene.start('Centru')
  }

  /** Draw a pixel grid (array of equal-length strings) into a texture. */
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

  makeIon() {
    const pal = {
      h: 0x4a3220, // hair
      s: 0xe8b894, // skin
      k: 0x3a2616, // dark outline / features
      b: 0x2f6fb0, // shirt
      p: 0x33343d, // pants
      o: 0x191a1f, // shoes
    }
    const f0 = [
      '....hhhh....',
      '...hhhhhh...',
      '...hssssh...',
      '...hssssh...',
      '...kssssk...',
      '....ssss....',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '..sbbbbbbs..',
      '..sbbbbbbs..',
      '...bbbbbb...',
      '...pppppp...',
      '...pp..pp...',
      '...pp..pp...',
      '...oo..oo...',
      '...oo..oo...',
    ]
    const f1 = [
      '....hhhh....',
      '...hhhhhh...',
      '...hssssh...',
      '...hssssh...',
      '...kssssk...',
      '....ssss....',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '..sbbbbbbs..',
      '..sbbbbbbs..',
      '...bbbbbb...',
      '...pppppp...',
      '...pp..pp...',
      '...pp..pp...',
      '..oo....oo..',
      '..oo....oo..',
    ]
    this.drawGrid('ion0', f0, pal)
    this.drawGrid('ion1', f1, pal)
  }

  makeTiles() {
    const T = 16
    // Grass
    let g = this.add.graphics()
    g.fillStyle(0x3f7a3c, 1); g.fillRect(0, 0, T, T)
    const dark = [[2, 3], [10, 5], [5, 11], [13, 9], [7, 7]]
    g.fillStyle(0x356b33, 1); dark.forEach(([x, y]) => g.fillRect(x, y, 2, 1))
    const lite = [[4, 6], [12, 2], [9, 13], [1, 10]]
    g.fillStyle(0x4d8a44, 1); lite.forEach(([x, y]) => g.fillRect(x, y, 1, 1))
    g.generateTexture('grass', T, T); g.destroy()

    // Road (asphalt)
    g = this.add.graphics()
    g.fillStyle(0x3a3e46, 1); g.fillRect(0, 0, T, T)
    g.fillStyle(0x33373e, 1)
    ;[[3, 2], [11, 6], [6, 12], [14, 10], [1, 8]].forEach(([x, y]) => g.fillRect(x, y, 2, 2))
    g.generateTexture('road', T, T); g.destroy()

    // Sidewalk (paving)
    g = this.add.graphics()
    g.fillStyle(0x8b909a, 1); g.fillRect(0, 0, T, T)
    g.fillStyle(0x767b85, 1)
    g.fillRect(0, 0, T, 1); g.fillRect(0, 8, T, 1); g.fillRect(0, 0, 1, T); g.fillRect(8, 0, 1, T)
    g.generateTexture('sidewalk', T, T); g.destroy()

    // Lane dash (yellow), horizontal boulevard
    g = this.add.graphics()
    g.fillStyle(0xc9b13a, 1); g.fillRect(0, 0, 10, 2)
    g.generateTexture('dash', 10, 2); g.destroy()
  }

  makeArc() {
    // Stylised Arc de Triumf — chunky pixel blocks.
    const W = 60, H = 76
    const stone = 0xd8cbb0, mid = 0xb9a883, dark = 0x8f7f60, shad = 0x6f6248
    const g = this.add.graphics()
    // base steps
    g.fillStyle(shad, 1); g.fillRect(0, H - 8, W, 8)
    g.fillStyle(mid, 1); g.fillRect(4, H - 14, W - 8, 6)
    // two piers
    g.fillStyle(stone, 1)
    g.fillRect(6, 20, 16, H - 28)   // left pier
    g.fillRect(W - 22, 20, 16, H - 28) // right pier
    g.fillStyle(dark, 1)
    g.fillRect(6, 20, 2, H - 28)
    g.fillRect(W - 8, 20, 2, H - 28)
    // arch opening shading (between piers)
    g.fillStyle(shad, 1); g.fillRect(22, 30, W - 44, H - 38)
    g.fillStyle(0x000000, 1); g.fillRect(24, 34, W - 48, H - 42)
    // rounded arch top
    g.fillStyle(stone, 1)
    g.fillRect(22, 28, 4, 6); g.fillRect(W - 26, 28, 4, 6)
    // entablature slab
    g.fillStyle(stone, 1); g.fillRect(2, 12, W - 4, 10)
    g.fillStyle(dark, 1); g.fillRect(2, 20, W - 4, 2)
    // attic + clock
    g.fillStyle(mid, 1); g.fillRect(16, 2, W - 32, 12)
    g.fillStyle(0xf2ead2, 1); g.fillCircle(W / 2, 8, 4)
    g.fillStyle(0x2a2a2a, 1); g.fillRect(W / 2 - 1, 5, 1, 3); g.fillRect(W / 2, 8, 2, 1)
    g.generateTexture('arc', W, H); g.destroy()
  }

  makeCathedral() {
    const W = 50, H = 58
    const g = this.add.graphics()
    g.fillStyle(0xe8e6de, 1); g.fillRect(6, 18, W - 12, H - 18)         // body
    g.fillStyle(0xd5d2c6, 1); g.fillRect(6, 18, 3, H - 18)
    g.fillStyle(0x2f7d5c, 1); g.fillRect(2, 12, W - 4, 8)               // roof band
    g.fillStyle(0x2f7d5c, 1); g.fillTriangle(W / 2 - 12, 18, W / 2 + 12, 18, W / 2, 2) // pediment dome-ish
    g.fillStyle(0xcdaa3a, 1); g.fillRect(W / 2 - 1, 0, 2, 4)           // cross
    g.fillRect(W / 2 - 3, 1, 6, 1)
    // columns + door
    g.fillStyle(0xbfbcb0, 1)
    for (let x = 12; x < W - 12; x += 8) g.fillRect(x, 24, 2, H - 26)
    g.fillStyle(0x5a4a36, 1); g.fillRect(W / 2 - 5, H - 16, 10, 16)
    g.generateTexture('cathedral', W, H); g.destroy()
  }

  makeGovern() {
    const W = 46, H = 66
    const g = this.add.graphics()
    g.fillStyle(0xcdbf9a, 1); g.fillRect(2, 8, W - 4, H - 8)
    g.fillStyle(0xb8aa86, 1); g.fillRect(2, 8, 2, H - 8)
    // window grid
    g.fillStyle(0x3a5a72, 1)
    for (let y = 14; y < H - 6; y += 8) {
      for (let x = 8; x < W - 6; x += 8) g.fillRect(x, y, 4, 5)
    }
    // flag
    g.fillStyle(0x6b6b6b, 1); g.fillRect(W / 2, 0, 1, 9)
    g.fillStyle(0x0033a0, 1); g.fillRect(W / 2 + 1, 1, 3, 2)
    g.fillStyle(0xffd200, 1); g.fillRect(W / 2 + 4, 1, 3, 2)
    g.fillStyle(0xcc092f, 1); g.fillRect(W / 2 + 7, 1, 3, 2)
    g.generateTexture('govern', W, H); g.destroy()
  }

  makeBloc() {
    // Soviet apartment block — tint per instance in scene.
    const W = 42, H = 54
    const g = this.add.graphics()
    g.fillStyle(0x9aa0a8, 1); g.fillRect(0, 4, W, H - 4)
    g.fillStyle(0x868c95, 1); g.fillRect(0, 4, 3, H - 4)
    g.fillStyle(0x767b84, 1); g.fillRect(0, 4, W, 2)
    g.fillStyle(0x3a6f8c, 1)
    for (let y = 10; y < H - 6; y += 7) {
      for (let x = 5; x < W - 5; x += 7) g.fillRect(x, y, 4, 4)
    }
    g.generateTexture('bloc', W, H); g.destroy()
  }

  makeScanlines() {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 1)
    g.fillRect(0, 1, 2, 1) // dark line every other row
    g.generateTexture('scan', 2, 2); g.destroy()
  }
}
