// DOM debug readout (toggle with the ` key, or start with ?debug in the URL).

export interface DebugStats {
  fps: number;
  zoom: number;
  dpr: number;
  view: { cx: number; cy: number };
  screen: { w: number; h: number };
  tile: { x: number; y: number } | null;
  world: { x: number; y: number } | null;
  entities: number;
  gesture: string;
  api: string;
}

export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private visible: boolean;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    parent.appendChild(this.el);
    this.visible = new URLSearchParams(location.search).has('debug');
    this.el.hidden = !this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  update(s: DebugStats): void {
    if (!this.visible) return;
    const tile = s.tile ? `${s.tile.x}, ${s.tile.y}` : 'off lawn';
    const world = s.world ? `${s.world.x.toFixed(0)}, ${s.world.y.toFixed(0)}` : '-';
    this.el.textContent = [
      `fps      ${s.fps.toFixed(0)}`,
      `zoom     ${s.zoom.toFixed(3)}  (${(s.zoom * 64).toFixed(1)} px/tile)`,
      `view     ${s.view.cx.toFixed(0)}, ${s.view.cy.toFixed(0)}`,
      `screen   ${s.screen.w}x${s.screen.h} @${s.dpr}x`,
      `tile     ${tile}`,
      `world    ${world}`,
      `gesture  ${s.gesture}`,
      `entities ${s.entities}`,
      `api      ${s.api}`,
    ].join('\n');
  }

  destroy(): void {
    this.el.remove();
  }
}
