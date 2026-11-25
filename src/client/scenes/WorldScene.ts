// The world: map, build, zombies, camera and input, plus the phase flow
// (briefing -> build -> raid -> result). The phases share one scene so the
// camera and map stay put; the DOM UI (src/client/ui) shows each phase's panels.

import Phaser from 'phaser';
import { edgeDistance, edgeTiles, GRID, TILE, type Tile, pickTile, tileOrigin, tileToWorld } from '@shared/grid';
import { checkHouse, placeHouse, rotatePart } from '@shared/build/rules';
import { hasPartDef, partDef, spawnZombie } from '@shared/sim';
import type { Rot } from '@shared/types/build';
import { FAR_SCALE, MAP_SCALE, PART_SCALE, SPRITE_SCALE, TEX, canopyChunks, farChunks, mapChunks } from '../core/assets';
import { CameraController } from '../core/camera';
import { InputRouter, type PointerInfo } from '../core/input';
import { RaidRunner } from '../core/raid';
import { session, setFlag, toast } from '../core/session';
import { VIEWPORT_EVENT, type ViewportSize } from '../core/viewport';
import { DebugOverlay } from '../render/debugOverlay';
import { EntityLayer } from '../render/entities';
import { FxLayer } from '../render/fx';
import { GhostLayer } from '../render/ghost';
import { GuideLayer, footprint } from '../render/guides';
import { inletInUse } from '@shared/build/connect';
import { DEPTH } from '../render/layers';
import { AmbientLayer } from '../render/ambient';
import { addWoodsShade } from '../render/woods';
import { ZombieLayer } from '../render/zombies';
import { type BuildTool, createTool } from '../tools/tools';
import { hotbarTools } from '../ui/slots';
import { worldToScreen } from '../core/viewMath';

/** Delay between the raid's last step and the result card. */
const RESULT_DELAY_MS = 1200;
/** Zombies closer than this (tiles) to the house start the danger effect. */
const DANGER_FAR = 4.5;

export class WorldScene extends Phaser.Scene {
  camera!: CameraController;
  router!: InputRouter;
  private debug!: DebugOverlay;
  private entities!: EntityLayer;
  private zombies!: ZombieLayer;
  private fx!: FxLayer;
  private ghost!: GhostLayer;
  private guides!: GuideLayer;
  private ambient!: AmbientLayer;
  private hoverG!: Phaser.GameObjects.Graphics;
  private hover: PointerInfo | null = null;
  private tool: BuildTool | null = null;
  private raid: RaidRunner | null = null;
  private resultAt: number | null = null;
  private nextBeat = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor() {
    super('World');
  }

  create(): void {
    const vp = this.registry.get('viewport') as ViewportSize;
    const { day, store } = session;

    // Outer forest ring (half-res) shaded into dark woods, under the sharp 2x map area.
    for (const c of farChunks())
      this.add.image(c.x, c.y, c.key).setOrigin(0, 0).setScale(1 / FAR_SCALE).setDepth(DEPTH.ground - 1);
    for (const c of mapChunks())
      this.add.image(c.x, c.y, c.key).setOrigin(0, 0).setScale(1 / MAP_SCALE).setDepth(DEPTH.ground);
    // The trees, over everything on the ground (zombies walk out from under them),
    // then the dark-woods shade over the trees.
    for (const c of canopyChunks())
      this.add.image(c.x, c.y, c.key).setOrigin(0, 0).setScale(1 / MAP_SCALE).setDepth(DEPTH.canopy);
    addWoodsShade(this, DEPTH.canopy + 1);
    this.hoverG = this.add.graphics().setDepth(DEPTH.ghost - 1);

    this.entities = new EntityLayer(this, day);
    this.zombies = new ZombieLayer(this);
    this.fx = new FxLayer(this, this.zombies, this.entities);
    this.ghost = new GhostLayer(this);
    this.guides = new GuideLayer(this, day);
    this.ambient = new AmbientLayer(this);
    this.entities.sync(store.current);

    this.camera = new CameraController(this.cameras.main, { w: vp.w, h: vp.h }, vp.dpr);
    this.router = new InputRouter(this.game.canvas, this.camera, { hover: (p) => (this.hover = p) });
    this.debug = new DebugOverlay(document.getElementById('app') ?? document.body);

    if (new URLSearchParams(location.search).has('gallery')) this.showGallery();

    // Session wiring
    this.on(store.contraption.subscribe((c) => this.entities.sync(c)));
    // Repairing a map machine changes what's on the board too.
    this.on(session.repaired.subscribe(() => this.entities.sync(store.current)));
    // Clearing a rock opens its tile (and the paths through it).
    this.on(session.cleared.subscribe(() => this.entities.sync(store.current)));
    this.on(
      session.tool.subscribe((id) => {
        // Picking a hotbar item drops any selection (and its part card).
        if (id !== 'select') session.selected.set(null);
        this.applyTool();
      }),
    );
    this.on(session.handMode.subscribe((h) => (this.router.handMode = h)));
    this.on(session.phase.subscribe(() => this.applyTool()));
    session.actions = {
      startBuild: () => this.startBuild(),
      startRaid: () => this.startRaid(),
      rotate: () => this.rotate(),
      backToBuild: () => this.backToBuild(),
      restart: () => this.restart(),
      zoomBy: (f) => this.camera.zoomBy(f),
      fit: () => this.camera.fit(),
      setSpeed: (s) => {
        if (this.raid) this.raid.speed = s;
        this.publishRaid();
      },
      togglePause: () => {
        if (this.raid) this.raid.paused = !this.raid.paused;
        this.publishRaid();
      },
      sandboxSpawn: (where) => this.sandboxSpawn(where),
      activate: (id) => {
        if (this.raid && !this.raid.done) this.raid.sim.activate.push(id);
      },
      hoverAt: (cx, cy) => {
        this.hover = this.pointerAt(cx, cy);
      },
      dropAt: (cx, cy) => {
        const p = this.pointerAt(cx, cy);
        if (p?.tile && session.phase.value === 'build') this.tool?.onTap?.(p);
      },
    };

    const onViewport = (s: ViewportSize) => {
      this.cameras.main.setSize(s.w * s.dpr, s.h * s.dpr);
      this.camera.resize({ w: s.w, h: s.h }, s.dpr);
    };
    this.game.events.on(VIEWPORT_EVENT, onViewport);
    this.on(() => this.game.events.off(VIEWPORT_EVENT, onViewport));

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.on(() => window.removeEventListener('keydown', onKey));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.cleanup) off();
      this.router.destroy();
      this.debug.destroy();
    });

    // Keep the fitted lawn clear of the HUD: re-measure the panels when they change.
    const ui = document.getElementById('ui');
    if (ui) {
      const ro = new ResizeObserver(() => this.measureHud());
      const mo = new MutationObserver(() => {
        for (const el of ui.querySelectorAll('.topbar, .tray-wrap, .raidbar')) ro.observe(el);
        this.measureHud();
      });
      mo.observe(ui, { childList: true, subtree: true });
      this.on(() => {
        mo.disconnect();
        ro.disconnect();
      });
    }

    session.phase.set(session.mode === 'sandbox' ? 'build' : 'briefing');
    if (session.mode === 'sandbox') session.clock.stop();
    this.intro();
  }

  /**
   * Opening shot: fade up from the night and pull back from a close view of the
   * lawn to the whole clearing, as the briefing card arrives.
   */
  private intro(): void {
    const fit = this.camera.current;
    this.camera.set({ cx: fit.cx, cy: fit.cy - 40, zoom: fit.zoom * 1.9 });
    this.camera.fitSmooth(this.time.now, 1900);
    this.cameras.main.fadeIn(1200, 6, 10, 14);
  }

  /** Screen space the HUD covers at the top and bottom, for fitting the lawn. */
  private measureHud(): void {
    const ui = document.getElementById('ui');
    if (!ui) return;
    const box = ui.getBoundingClientRect();
    const top = ui.querySelector('.topbar')?.getBoundingClientRect();
    let bottomEdge = box.bottom;
    for (const el of ui.querySelectorAll('.tray-wrap, .raidbar')) bottomEdge = Math.min(bottomEdge, el.getBoundingClientRect().top);
    const pad = 6;
    this.camera.setInsets({
      top: top ? Math.max(0, top.bottom - box.top + pad) : 0,
      bottom: Math.max(0, box.bottom - bottomEdge + pad),
      left: 0,
      right: 0,
    });
  }

  private on(off: () => void): void {
    this.cleanup.push(off);
  }

  // ---- phases -----------------------------------------------------------------

  /** Briefing -> Build. */
  private startBuild(): void {
    session.phase.set('build');
    if (session.mode === 'demo') session.clock.start();
  }

  private startRaid(): void {
    if (session.phase.value !== 'build') return;
    const { day, store } = session;
    if (!store.current.house) {
      // The clock ran out (or Start was pressed) with no house: put it somewhere sensible.
      const spot = bestHouseTile((x, y) => !checkHouse(day, store.current, x, y));
      if (!spot) return toast('Place your house first');
      store.apply((c) => placeHouse(day, c, spot.x, spot.y));
      toast('Your house was placed for you');
    }
    session.clock.stop();
    session.selected.set(null);
    this.raid = new RaidRunner(day, store.current, session.mode === 'sandbox' ? { schedule: [] } : undefined);
    session.raidSim = this.raid.sim;
    this.resultAt = null;
    session.result.set(null);
    session.phase.set('raid');
    this.camera.fitSmooth(this.time.now);
    this.publishRaid();
  }

  /**
   * Rebuild (after a raid). In the demo the night starts over from an empty lawn:
   * no build, no purchases, no repairs, a full clock, straight into building (no
   * briefing). The sandbox keeps your build so you can tweak and rerun it.
   */
  private backToBuild(): void {
    this.endRaidVisuals();
    session.result.set(null);
    if (session.mode === 'demo') {
      this.clearNight();
      session.clock.start();
    }
    session.phase.set('build');
  }

  /** Start over: an empty night, back to the briefing. */
  private restart(): void {
    this.endRaidVisuals();
    session.result.set(null);
    this.clearNight();
    session.clock.stop();
    session.phase.set(session.mode === 'sandbox' ? 'build' : 'briefing');
  }

  private clearNight(): void {
    session.store.load({ house: null, parts: [], wires: [], walls: [], nextId: 1 });
    session.repaired.set([]);
    session.cleared.set([]);
    session.draftPicks.set([]);
    session.selected.set(null);
    session.tool.set('select');
    session.clock.reset(session.day.buildSeconds);
  }

  private endRaidVisuals(): void {
    this.raid = null;
    session.raidSim = null;
    this.resultAt = null;
    session.raid.set(null);
    session.danger.set(0);
    this.zombies.clear();
    this.fx.clear();
    this.entities.houseSprite()?.clearTint().setScale(PART_SCALE);
  }

  /** Danger 0..1 from the nearest zombie on the lawn: 0 at DANGER_FAR tiles or more, 1 at the door. */
  private updateDanger(): void {
    const st = this.raid?.sim;
    let d = Infinity;
    if (st && st.outcome === 'running') {
      const hx = st.house.x + 0.5;
      const hy = st.house.y + 0.5;
      for (const z of st.zombies)
        if (!z.dead && !z.ext.enter) d = Math.min(d, Math.hypot(z.x - hx, z.y - hy));
    } else if (st?.outcome === 'lost' && st.stats.breachBy !== null) d = 0;
    const raw = Math.max(0, Math.min(1, (DANGER_FAR - d) / (DANGER_FAR - 0.6)));
    const q = Math.round(raw * 20) / 20;
    if (q !== session.danger.value) session.danger.set(q);
  }

  /**
   * Heartbeat while zombies are near the house: a "lub-dub" every beat. Each thump
   * kicks the camera in a touch (and the second, weaker one ~170ms later), with a
   * small shake; the night overlay flashes red on the same beat (session.beat).
   * Faster and harder the closer they are (~55 bpm far, ~110 bpm at the door).
   */
  private heartbeat(time: number): void {
    const d = session.danger.value;
    if (d <= 0 || session.phase.value !== 'raid') {
      this.nextBeat = 0;
      return;
    }
    if (this.nextBeat === 0) this.nextBeat = time;
    if (time < this.nextBeat) return;
    const period = 1100 - 560 * d;
    this.nextBeat = time + period;
    const thump = (strength: number) => {
      this.camera.punch(this.time.now, 0.006 + 0.022 * d * strength);
      this.cameras.main.shake(110, (0.0006 + 0.0028 * d) * strength);
    };
    thump(1);
    session.beat.set(session.beat.value + 1);
    this.time.delayedCall(170, () => {
      if (session.danger.value > 0) thump(0.55);
    });
  }

  private publishRaid(): void {
    const r = this.raid;
    if (!r) return session.raid.set(null);
    session.raid.set({
      speed: r.speed,
      paused: r.paused,
      seconds: r.sim.tick / 10,
      alive: r.sim.zombies.length,
      killed: r.sim.stats.killed,
    });
  }

  private sandboxSpawn(where: 'selected' | 'random'): void {
    if (!this.raid || session.mode !== 'sandbox') return toast('Start the raid first');
    let t = where === 'selected' ? session.selected.value : null;
    if (!t) {
      const ring = edgeTiles();
      t = ring[Math.floor(Math.random() * ring.length)] ?? { x: 0, y: 0 };
    }
    spawnZombie(this.raid.sim, 'shambler', t.x, t.y, undefined, { walkIn: true });
  }

  /** Pointer info for a client (page) point over the canvas, or null if it's not over the canvas. */
  private pointerAt(cx: number, cy: number): PointerInfo | null {
    const canvas = this.game.canvas;
    if (document.elementFromPoint(cx, cy) !== canvas) return null;
    const r = canvas.getBoundingClientRect();
    const screen = { x: cx - r.left, y: cy - r.top };
    const world = this.camera.toWorld(screen.x, screen.y);
    return { screen, world, tile: pickTile(world.x, world.y) };
  }

  // ---- tools ------------------------------------------------------------------

  private applyTool(): void {
    const building = session.phase.value === 'build';
    const id = building ? session.tool.value : 'select';
    this.tool = createTool(id, {
      day: session.day,
      store: session.store,
      rot: () => session.rot.value,
      select: (t) => {
        const cur = session.selected.value;
        session.selected.set(t && cur && t.x === cur.x && t.y === cur.y ? null : t);
      },
      toast,
      putAway: () => session.tool.set('select'),
    });
    // Double-tap a placed part to turn it (any tool, including right after placing it).
    const base = this.tool;
    this.tool = { ...base, onTap: (p) => (this.doubleTapRotate(p) ? undefined : base.onTap?.(p)) };
    this.router.setTool(this.tool);
  }

  private lastTap: { x: number; y: number; at: number } | null = null;

  /** Second tap on the same tile within 320ms: turn the rotatable part there. */
  private doubleTapRotate(p: PointerInfo): boolean {
    const t = p.tile;
    const now = performance.now();
    const last = this.lastTap;
    this.lastTap = t ? { x: t.x, y: t.y, at: now } : null;
    if (!t || !last || last.x !== t.x || last.y !== t.y || now - last.at > 320 || session.phase.value !== 'build') return false;
    const part = session.store.current.parts.find((q) => q.x === t.x && q.y === t.y);
    if (!part || !hasPartDef(part.type) || !partDef(part.type).rotatable) return false;
    session.store.apply((c) => rotatePart(c, part.id, ((part.rot + 1) % 4) as Rot));
    session.selected.set({ x: t.x, y: t.y });
    this.lastTap = null;
    return true;
  }

  private rotate(): void {
    const toolId = session.tool.value;
    if (toolId.startsWith('part:')) {
      session.rot.set(((session.rot.value + 1) % 4) as Rot);
      return;
    }
    const sel = session.selected.value;
    const part = sel && session.store.current.parts.find((p) => p.x === sel.x && p.y === sel.y);
    if (!part) return;
    if (!hasPartDef(part.type) || !partDef(part.type).rotatable) return toast("This part doesn't rotate");
    session.store.apply((c) => rotatePart(c, part.id, ((part.rot + 1) % 4) as Rot));
  }

  // ---- frame ------------------------------------------------------------------

  override update(time: number, delta: number): void {
    const t = time / 1000;
    const phase = session.phase.value;
    const px = 1 / this.cameras.main.zoom; // one device pixel in world units
    const dpr = (this.registry.get('viewport') as ViewportSize).dpr;

    this.camera.tick(time);
    if (phase === 'build' && session.clock.tick()) this.startRaid();

    if (this.raid) {
      const events = this.raid.update(delta);
      if (events.length) this.fx.consume(events, time);
      this.zombies.update(this.raid.sim, this.raid.alpha, t);
      this.updateDanger();
      // The raid clock runs smoothly between sim steps (interpolated), in tenths.
      const rt = Math.round(this.raid.sim.tick - 1 + (this.raid.done ? 1 : this.raid.alpha)) / 10;
      if (rt >= 0 && rt !== session.raidTime.value) session.raidTime.set(rt);
      this.heartbeat(time);
      if (events.length || this.raid.sim.tick % 5 === 0) this.publishRaid();
      if (this.raid.done) {
        this.resultAt ??= time + RESULT_DELAY_MS;
        if (time >= this.resultAt && phase === 'raid') this.showResult();
      }
    }
    this.fx.update(time);
    this.ambient.update(t);
    this.entities.update(t, this.raid?.sim ?? null);
    if (this.raid && !this.raid.done) this.fx.storm(time);
    this.guides.draw({
      time: t,
      px: px * dpr,
      building: phase === 'build',
      sel: session.selected.value,
      c: session.store.current,
      parts: this.entities.placedParts,
      preview: this.entities.previewData,
      tool: phase === 'build' ? session.tool.value : 'select',
      hover: this.hover?.tile ?? null,
      rot: session.rot.value,
      showPaths: session.mode === 'sandbox' && session.showPaths.value,
      // The inlet pulses with a red "!" all through building until a trap is wired to it.
      wireHint: phase === 'build' && !inletInUse(session.day, session.store.current),
    });

    // Ghost preview (build only), hover and selection outlines.
    this.ghost.draw(phase === 'build' ? (this.tool?.ghost(this.hover?.tile ?? null) ?? null) : null, px * dpr);
    this.hoverG.clear();
    const ht = this.hover?.tile;
    if (ht && (phase !== 'build' || session.tool.value === 'select')) {
      const o = tileOrigin(ht.x, ht.y);
      this.hoverG.fillStyle(0xffffff, 0.12).fillRect(o.x, o.y, TILE, TILE);
      this.hoverG.lineStyle(2 * dpr * px, 0xffffff, 0.55).strokeRect(o.x, o.y, TILE, TILE);
    }
    // Selection: a white tile that breathes (bright, fade, bright), and the part on it glows.
    const sel = session.selected.value;
    this.entities.highlight(sel, t);
    if (sel) {
      // A rock (or anything bigger than a tile) selects its whole block.
      const f = footprint(session.day, sel);
      const o = tileOrigin(f.x, f.y);
      const W = TILE * f.w;
      const H = TILE * f.h;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      this.hoverG.fillStyle(0xffffff, 0.08 + 0.14 * pulse).fillRect(o.x, o.y, W, H);
      this.hoverG.lineStyle(9 * dpr * px, 0xffffff, 0.08 + 0.14 * pulse).strokeRect(o.x - 2, o.y - 2, W + 4, H + 4);
      this.hoverG.lineStyle(3 * dpr * px, 0xffffff, 0.55 + 0.45 * pulse).strokeRect(o.x, o.y, W, H);
    }
    this.publishSelectionAnchor(sel);
    this.publishCardHint();


    const v = this.camera.current;
    this.debug.update({
      fps: this.game.loop.actualFps,
      zoom: v.zoom,
      dpr,
      view: v,
      screen: this.camera.size,
      tile: this.hover?.tile ?? null,
      world: this.hover?.world ?? null,
      entities: this.children.length,
      gesture: `${this.router.gesture}${this.router.handMode ? ' (hand)' : ''} / ${phase}`,
      api: `${session.api.mode}${session.init?.userName ? ` as ${session.init.userName}` : ''}`,
    });
  }

  /**
   * Until the player opens a part's card, the newest placed part gets a bubble
   * saying it can be tapped: published here as a screen point over that part.
   */
  private publishCardHint(): void {
    let h: { x: number; y: number } | null = null;
    const sel = session.selected.value;
    const parts = session.store.current.parts;
    if (sel && parts.some((p) => p.x === sel.x && p.y === sel.y) && !session.cardHintDone.value) {
      session.cardHintDone.set(true);
      setFlag('seen-card-hint');
    }
    const last = parts[parts.length - 1];
    if (session.phase.value === 'build' && !session.cardHintDone.value && !sel && last) {
      const o = tileOrigin(last.x, last.y);
      const p = worldToScreen(this.camera.current, this.camera.size, o.x + TILE / 2, o.y);
      h = { x: Math.round(p.x), y: Math.round(p.y) };
    }
    const cur = session.cardHint.value;
    if (h === cur || (h && cur && h.x === cur.x && h.y === cur.y)) return;
    session.cardHint.set(h);
  }

  /** Where the selected tile is on screen, for the part card that floats above it. */
  private publishSelectionAnchor(sel: Tile | null): void {
    let a: { x: number; y: number; size: number } | null = null;
    if (sel) {
      const f = footprint(session.day, sel);
      const o = tileOrigin(f.x, f.y);
      const v = this.camera.current;
      const p = worldToScreen(v, this.camera.size, o.x + (TILE * f.w) / 2, o.y);
      const size = Math.round(TILE * f.h * v.zoom);
      // Panned (or zoomed) so the selection is off screen: drop it, and its card.
      const scr = this.camera.size;
      if (p.x < 0 || p.x > scr.w || p.y + size < 0 || p.y > scr.h) {
        session.selected.set(null);
        return;
      }
      a = { x: Math.round(p.x), y: Math.round(p.y), size };
    }
    const cur = session.selAnchor.value;
    if (a === cur || (a && cur && a.x === cur.x && a.y === cur.y && a.size === cur.size)) return;
    session.selAnchor.set(a);
  }

  private showResult(): void {
    const r = this.raid;
    if (!r) return;
    const lost = r.sim.outcome === 'lost';
    session.result.set({
      outcome: lost ? 'lost' : 'won',
      reason: lost ? (r.sim.stats.breachBy !== null ? 'breach' : 'timeout') : 'cleared',
      killed: r.sim.stats.killed,
      spawned: r.sim.stats.spawned,
      seconds: r.sim.tick / 10,
    });
    session.phase.set('result');
  }

  // ---- keys -------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const building = session.phase.value === 'build';
    if (ctrl && e.key.toLowerCase() === 'z') {
      if (building) (e.shiftKey ? session.store.redo() : session.store.undo());
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      if (building) session.store.redo();
    } else if (ctrl) {
      return;
    } else {
      switch (e.key) {
        case '`':
          this.debug.toggle();
          break;
        case 'f':
        case 'F':
        case '0':
          this.camera.fit();
          break;
        case '+':
        case '=':
          this.camera.zoomBy(1.25);
          break;
        case '-':
        case '_':
          this.camera.zoomBy(0.8);
          break;
        case 'h':
        case 'H':
          session.handMode.set(!session.handMode.value);
          break;
        case 'r':
        case 'R':
          if (building) this.rotate();
          break;
        case 'e':
        case 'E':
          if (building) session.tool.set('erase');
          break;
        case 'w':
        case 'W':
          if (building) session.tool.set('wire');
          break;
        case 'Escape':
          session.tool.set('select');
          session.selected.set(null);
          break;
        case 'Enter':
          if (building && session.store.current.house) this.startRaid();
          break;
        default: {
          // Hotbar: 1..9, 0 pick a slot; pressing the active slot's key puts it away.
          if (!building || !/^[0-9]$/.test(e.key)) return;
          const i = e.key === '0' ? 9 : Number(e.key) - 1;
          const id = hotbarTools(session.day, session.mode)[i];
          if (!id) return;
          session.tool.set(session.tool.value === id ? 'select' : id);
        }
      }
    }
    e.preventDefault();
  }

  /** ?gallery: every baked frame laid out on the lawn, to check the asset pipeline. */
  private showGallery(): void {
    const frames = [
      ...this.textures.get(TEX.structures).getFrameNames().map((f) => [TEX.structures, f] as const),
      ...this.textures.get(TEX.parts).getFrameNames().map((f) => [TEX.parts, f] as const),
    ].sort((a, b) => a[1].localeCompare(b[1]));
    let i = 0;
    for (const [tex, frame] of frames) {
      const x = i % GRID;
      const y = Math.floor(i / GRID);
      if (y >= GRID) break;
      const c = tileToWorld(x, y);
      this.add.image(c.x, c.y, tex, frame).setScale(SPRITE_SCALE).setDepth(DEPTH.parts + c.y);
      i++;
    }
    console.info(`gallery: ${i} of ${frames.length} frames shown`);
  }
}

/** The valid tile closest to the lawn's centre. */
function bestHouseTile(ok: (x: number, y: number) => boolean): Tile | null {
  let best: Tile | null = null;
  let bestD = Infinity;
  const mid = (GRID - 1) / 2;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      if (edgeDistance(x, y) < 2 || !ok(x, y)) continue;
      const d = (x - mid) ** 2 + (y - mid) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}
