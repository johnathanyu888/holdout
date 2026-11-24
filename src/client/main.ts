import Phaser from 'phaser';
import { h, render } from 'preact';
import '@shared/sim'; // registers every part and zombie
import './views'; // registers every part view
import { measure, trackViewport } from './core/viewport';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { App } from './ui/App';
import './style.css';
import './ui/ui.css';

const container = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!container || !uiRoot) throw new Error('#game / #ui container missing');

const vp = measure(container);

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL, falling back to canvas
  parent: container,
  backgroundColor: '#1b2a1f',
  scale: {
    mode: Phaser.Scale.NONE,
    width: vp.w * vp.dpr,
    height: vp.h * vp.dpr,
    zoom: 1 / vp.dpr,
  },
  render: {
    // Must be explicit: Phaser turns pixelArt on whenever scale.zoom !== 1 (ours is
    // 1/dpr), which would force nearest-neighbour sampling, no antialiasing and
    // rounded positions - blocky sprites and seams between map chunks.
    pixelArt: false,
    antialias: true,
    // Off: rounding each map chunk's position separately opens 1px seams between
    // chunks at fractional zoom, and the art is smooth vector, not pixel art.
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    // The InputRouter reads native pointer events; Phaser's own input stays off the canvas.
    mouse: false,
    touch: false,
    keyboard: false,
  },
  disableContextMenu: true,
  scene: [BootScene, WorldScene],
});

game.registry.set('viewport', vp);
trackViewport(game, container);
render(h(App, {}), uiRoot);

// Dev-only handle for debugging from the console and browser tests.
if (import.meta.env.DEV) {
  void import('./core/session').then(({ session }) => {
    (window as unknown as { __holdout: unknown }).__holdout = { game, session };
  });
}
