import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import CentruScene from './scenes/CentruScene.js'
import UiScene from './scenes/UiScene.js'

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1d24',
  pixelArt: true,        // crisp 16-bit scaling, no smoothing
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, CentruScene, UiScene],
}

window.__game = new Phaser.Game(config)

// Hide the HTML loading splash once Phaser is up.
window.addEventListener('load', () => {
  const el = document.getElementById('loading')
  if (el) setTimeout(() => el.remove(), 400)
})
