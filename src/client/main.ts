import Phaser from 'phaser';
import { measure, trackViewport } from './core/viewport';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import './style.css';

const container = document.getElementById('game');
if (!container) throw new Error('#game container missing');

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
    antialias: true,
    roundPixels: true,
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

// Dev-only handle for debugging from the console and browser tests.
if (import.meta.env.DEV) (window as unknown as { __holdout: unknown }).__holdout = { game };
