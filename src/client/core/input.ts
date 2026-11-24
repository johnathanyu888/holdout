// Input router: the one place that reads raw pointer, wheel and key input for
// the world view. It turns them into camera moves (pan, pinch, wheel zoom) or
// tool gestures (tap, drag). Tools never read raw input.
//
// Gestures
//   1 pointer          active tool (tap / drag); if the tool doesn't take drags, drag pans
//   2 pointers         pinch zoom around the midpoint + pan
//   wheel              zoom toward the cursor (ctrl+wheel = trackpad pinch, same thing)
//   middle/right drag  pan
//   Space + drag       pan
//   hand mode          every 1-pointer drag pans and taps are ignored
//
// Uses native Pointer Events on the canvas (not Phaser's input) so multi-touch and
// pointer capture behave the same on every browser.

import { type Point, type Tile, pickTile } from '@shared/grid';
import type { CameraController } from './camera';
import type { View } from './viewMath';

/** Movement (CSS px) before a press counts as a drag instead of a tap. */
export const DRAG_THRESHOLD = 8;

export interface PointerInfo {
  screen: Point;
  world: Point;
  /** Lawn tile under the pointer, or null off the lawn. */
  tile: Tile | null;
}

export interface ToolHandler {
  /** If false, a 1-pointer drag pans the camera instead of reaching the tool. */
  readonly capturesDrag: boolean;
  onTap?(p: PointerInfo): void;
  onDragStart?(p: PointerInfo): void;
  onDragMove?(p: PointerInfo): void;
  onDragEnd?(p: PointerInfo): void;
  /** A drag was interrupted (second finger, pointer cancel). Undo any preview. */
  onCancel?(): void;
}

export interface RouterHooks {
  /** Mouse hover (not touch). null when the pointer leaves the canvas. */
  hover?(p: PointerInfo | null): void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'pending'; id: number; start: Point }
  | { kind: 'pan'; id: number; last: Point }
  | { kind: 'toolDrag'; id: number }
  | { kind: 'pinch'; startView: View; startMid: Point; startDist: number }
  /** After a pinch, ignore everything until every pointer is up. */
  | { kind: 'settle' };

export class InputRouter {
  private tool: ToolHandler | null = null;
  private mode: Mode = { kind: 'idle' };
  private readonly down = new Map<number, Point>();
  private spaceHeld = false;
  private _handMode = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: CameraController,
    private readonly hooks: RouterHooks = {},
  ) {
    el.style.touchAction = 'none';
    this.listen(el, 'pointerdown', (e) => this.onDown(e));
    this.listen(el, 'pointermove', (e) => this.onMove(e));
    this.listen(el, 'pointerup', (e) => this.onUp(e, false));
    this.listen(el, 'pointercancel', (e) => this.onUp(e, true));
    this.listen(el, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.down.size === 0) this.hooks.hover?.(null);
    });
    this.listen(el, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(el, 'contextmenu', (e) => e.preventDefault());
    this.listen(window, 'keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e)) {
        this.spaceHeld = true;
        e.preventDefault();
      }
    });
    this.listen(window, 'keyup', (e) => {
      if (e.code === 'Space') this.spaceHeld = false;
    });
    this.listen(window, 'blur', () => {
      this.spaceHeld = false;
    });
  }

  setTool(tool: ToolHandler | null): void {
    this.cancelTool();
    this.tool = tool;
  }

  get handMode(): boolean {
    return this._handMode;
  }

  set handMode(on: boolean) {
    this.cancelTool();
    this._handMode = on;
  }

  get gesture(): Mode['kind'] {
    return this.mode.kind;
  }

  destroy(): void {
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
  }

  // ---- events -------------------------------------------------------------

  private onDown(e: PointerEvent): void {
    const p = this.local(e);
    this.down.set(e.pointerId, p);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic events; harmless.
    }

    if (this.down.size === 2) {
      this.cancelTool();
      const [a, b] = [...this.down.values()] as [Point, Point];
      this.mode = {
        kind: 'pinch',
        startView: { ...this.camera.current },
        startMid: mid(a, b),
        startDist: dist(a, b),
      };
      return;
    }
    if (this.down.size > 2 || this.mode.kind !== 'idle') return;

    const panButton = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
    if (panButton || this.spaceHeld || this._handMode) {
      this.mode = { kind: 'pan', id: e.pointerId, last: p };
    } else if (e.button === 0 || e.pointerType !== 'mouse') {
      this.mode = { kind: 'pending', id: e.pointerId, start: p };
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    if (this.down.has(e.pointerId)) this.down.set(e.pointerId, p);
    const m = this.mode;

    switch (m.kind) {
      case 'idle':
        if (e.pointerType === 'mouse') this.hooks.hover?.(this.info(p));
        return;
      case 'pending': {
        if (e.pointerId !== m.id || dist(p, m.start) < DRAG_THRESHOLD) return;
        if (this.tool?.capturesDrag) {
          this.mode = { kind: 'toolDrag', id: m.id };
          this.tool.onDragStart?.(this.info(m.start));
          this.tool.onDragMove?.(this.info(p));
        } else {
          this.camera.panBy(p.x - m.start.x, p.y - m.start.y);
          this.mode = { kind: 'pan', id: m.id, last: p };
        }
        return;
      }
      case 'pan':
        if (e.pointerId !== m.id) return;
        this.camera.panBy(p.x - m.last.x, p.y - m.last.y);
        m.last = p;
        return;
      case 'toolDrag':
        if (e.pointerId === m.id) this.tool?.onDragMove?.(this.info(p));
        if (e.pointerType === 'mouse') this.hooks.hover?.(this.info(p));
        return;
      case 'pinch': {
        if (this.down.size < 2) return;
        const [a, b] = [...this.down.values()] as [Point, Point];
        this.camera.pinch(m.startView, m.startMid, m.startDist, mid(a, b), dist(a, b));
        return;
      }
      case 'settle':
        return;
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    if (!this.down.has(e.pointerId)) return;
    const p = this.local(e);
    this.down.delete(e.pointerId);
    const m = this.mode;

    if (m.kind === 'pending' && m.id === e.pointerId) {
      if (!cancelled && !this._handMode) this.tool?.onTap?.(this.info(p));
      this.mode = { kind: 'idle' };
    } else if (m.kind === 'toolDrag' && m.id === e.pointerId) {
      if (cancelled) this.tool?.onCancel?.();
      else this.tool?.onDragEnd?.(this.info(p));
      this.mode = { kind: 'idle' };
    } else if (m.kind === 'pan' && m.id === e.pointerId) {
      this.mode = { kind: 'idle' };
    } else if (m.kind === 'pinch') {
      this.mode = this.down.size === 0 ? { kind: 'idle' } : { kind: 'settle' };
    }
    if (this.down.size === 0 && this.mode.kind === 'settle') this.mode = { kind: 'idle' };
    if (this.down.size === 0 && e.pointerType === 'mouse') this.hooks.hover?.(this.info(p));
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    // Pixel deltas from mice/trackpads; line deltas (Firefox) are ~16px each.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const speed = e.ctrlKey ? 0.01 : 0.0015; // ctrl+wheel = trackpad pinch: bigger steps
    const factor = Math.exp(-dy * speed);
    this.camera.zoomAt(p.x, p.y, this.camera.current.zoom * factor);
  }

  // ---- helpers ------------------------------------------------------------

  private cancelTool(): void {
    if (this.mode.kind === 'toolDrag') this.tool?.onCancel?.();
    if (this.mode.kind !== 'idle') this.mode = this.down.size > 0 ? { kind: 'settle' } : { kind: 'idle' };
  }

  private local(e: MouseEvent): Point {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private info(screen: Point): PointerInfo {
    const world = this.camera.toWorld(screen.x, screen.y);
    return { screen, world, tile: pickTile(world.x, world.y) };
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
