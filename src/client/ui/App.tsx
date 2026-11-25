// The DOM UI over the canvas. Reads the session; calls session.actions.

import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { WALL_COST, configurePart } from '@shared/build/rules';
import { INLET_MAX_LOAD, INLET_STRENGTH, allZombieDefs, hasPartDef, partDef, powerMul, powerPreview, zombieDef } from '@shared/sim';

const hasZombieDef = (t: string) => allZombieDefs().some((z) => z.type === t);
import { useObs } from '../core/observable';
import { clearRock, repairFixture, session, toast } from '../core/session';
import { fixtureAt, workingFixtures } from '@shared/build/fixtures';
import { covers, obstacleYield } from '@shared/build/rocks';
import type { DraftOffer, Pick } from '@shared/build/draft';
import {
  IconErase,
  IconFit,
  IconSelect,
  IconHand,
  IconMinus,
  IconPause,
  IconPlay,
  IconPlus,
  IconRedo,
  IconRotate,
  IconUndo,
  icon,
} from './icons';
import { hotbarTools, slotKey } from './slots';

export function App() {
  const phase = useObs(session.phase);
  if (phase === 'boot') return null;
  return (
    <>
      {(phase === 'raid' || phase === 'result') && <NightFx />}
      <TopBar />
      {phase === 'briefing' && <Briefing />}
      {phase === 'build' && <Tray />}
      {phase === 'build' && <Inspector />}
      {phase === 'build' && <InletCard />}
      {phase === 'build' && <RockCard />}
      {phase === 'build' && <CardHint />}
      {phase === 'build' && session.mode === 'demo' && <TimeWarning />}
      {phase === 'raid' && <RaidBar />}
      {phase === 'result' && <Result />}
      {session.mode === 'sandbox' && (phase === 'build' || phase === 'raid') && <SandboxPanel />}
      <Toast />
    </>
  );
}

/** What a hotbar slot is, as a coloured tag plus a few words (shown above the hotbar). */
function slotKind(id: string, hasHouse: boolean): { tag: string; cls: string; text: string } | null {
  if (id === 'select') return { tag: 'Select', cls: 'k-neutral', text: 'tap to pick, drag to move' };
  if (id === 'erase') return { tag: 'Remove', cls: 'k-neutral', text: 'tap or drag over things' };
  if (id === 'house') return { tag: 'Home', cls: 'k-home', text: hasHouse ? 'drag it to move' : 'place it first' };
  if (id === 'wire') return { tag: 'Connect', cls: 'k-connect', text: 'carries power, −1 strength a tile' };
  if (id.startsWith('wall:')) return { tag: 'Defense', cls: 'k-defense', text: 'blocks zombies, they path round' };
  const type = id.slice(5);
  if (!hasPartDef(type)) return null;
  const d = partDef(type);
  if (d.kind === 'trigger') return { tag: 'Power', cls: 'k-power', text: 'a sensor, makes power when zombies trip it' };
  if (d.kind === 'chip') return { tag: 'Logic', cls: 'k-logic', text: type === 'latch' ? 'a switch with memory' : 'shapes power on its way' };
  if (type === 'piston') return { tag: 'Steer', cls: 'k-steer', text: 'pushes zombies, needs power' };
  return { tag: 'Attack', cls: 'k-attack', text: `deals damage, needs power ${d.needs}+` };
}

/** How each part is wired, as a tiny diagram (atlas icons and arrows) for its card. */
type Step = { icon: string; role: string };
const SENSOR = (icon = 'pressure_plate'): Step => ({ icon, role: 'Sensor' });
const WIRE: Step = { icon: 'wire_straight', role: 'Wire' };
const THIS = (icon: string): Step => ({ icon, role: 'This' });
/** How each part sits in a circuit, left to right: where power starts, how it travels, where it ends up. */
const WIRING: Record<string, Step[]> = {
  pressure_plate: [THIS('pressure_plate'), WIRE, { icon: 'saw_blade', role: 'Trap' }],
  tripwire: [THIS('tripwire'), WIRE, { icon: 'spike_floor', role: 'Trap' }],
  delay: [SENSOR(), THIS('delay'), { icon: 'saw_blade', role: 'Trap' }],
  latch: [SENSOR(), THIS('latch'), { icon: 'saw_blade', role: 'Trap' }],
  saw_blade: [SENSOR(), WIRE, THIS('saw_blade')],
  spike_floor: [SENSOR('tripwire'), WIRE, THIS('spike_floor')],
  tesla_coil: [SENSOR(), WIRE, THIS('tesla_coil')],
  piston: [{ icon: 'power_inlet', role: 'Power' }, WIRE, THIS('piston')],
};

/** Each part's key numbers, as small chips on its card. */
const CHIPS: Record<string, string[]> = {
  pressure_plate: ['Makes power 10', 'While stepped on'],
  tripwire: ['Makes a short pulse', 'Each crossing'],
  delay: ['Waits 0.5 to 2s', 'Boosts to 10'],
  latch: ['Stays on', 'Switch it here'],
  saw_blade: ['60 a second', 'Needs 1', 'Wears out'],
  spike_floor: ['20 stab, 45 punch', 'Slows', 'Needs 1'],
  tesla_coil: ['70 a zap', 'Reach 1.5 tiles', 'Needs 3'],
  piston: ['Shoves 1 tile', 'Blocks zombies', 'Needs 1'],
};

/** Tray labels: short enough to fit under a 64px button. */
const SHORT: Record<string, string> = {
  pressure_plate: 'Plate',
  saw_blade: 'Saw',
  spike_floor: 'Spikes',
  tripwire: 'Tripwire',
  delay: 'Delay',
  motion_sensor: 'Motion',
  flame_vent: 'Flame',
  tesla_coil: 'Tesla',
  trapdoor_pit: 'Pit',
  wrecking_ball: 'Ball',
  piston: 'Piston',
  latch: 'Latch',
};

export function partLabel(type: string): string {
  if (hasPartDef(type)) return partDef(type).label;
  const s = type.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtClock(sec: number): string {
  const s = Math.ceil(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- top bar --------------------------------------------------------------------

function TopBar() {
  const phase = useObs(session.phase);
  const left = useObs(session.clock.left);
  const raid = useObs(session.raid);
  const hand = useObs(session.handMode);
  const raidTime = useObs(session.raidTime);
  useObs(session.store.historyVersion);
  const building = phase === 'build';

  let clock: preact.ComponentChildren = null;
  if (building && session.mode === 'demo')
    clock = (
      <div class="clock-group">
        <div class={`pill clock ${left <= 30 ? 'warn' : ''}`} title="Build time left">
          <span class="pill-label">BUILD</span>
          {fmtClock(left)}
        </div>
      </div>
    );
  else if ((phase === 'raid' || phase === 'result') && raid)
    clock = (
      <div class="pill clock" title="Raid time">
        <span class="pill-label">RAID</span>
        {(phase === 'raid' ? raidTime : raid.seconds).toFixed(1)}s
      </div>
    );

  return (
    <div class="topbar">
      <div class="chip night">
        <span class="chip-eyebrow">{session.mode === 'sandbox' ? 'SANDBOX' : 'NIGHT 1'}</span>
        <span class="chip-title">{session.day.mutationName}</span>
      </div>
      {clock}
      <div class="btn-row">
        {building && (
          <>
            <IconBtn title="Undo (Ctrl+Z)" disabled={!session.store.canUndo} onClick={() => session.store.undo()}>
              <IconUndo />
            </IconBtn>
            <IconBtn title="Redo (Ctrl+Y)" disabled={!session.store.canRedo} onClick={() => session.store.redo()}>
              <IconRedo />
            </IconBtn>
          </>
        )}
        <IconBtn title="Hand: drags always pan (H)" active={hand} onClick={() => session.handMode.set(!hand)}>
          <IconHand />
        </IconBtn>
        <IconBtn title="Zoom out (-)" onClick={() => session.actions.zoomBy(0.8)}>
          <IconMinus />
        </IconBtn>
        <IconBtn title="Fit (F)" onClick={() => session.actions.fit()}>
          <IconFit />
        </IconBtn>
        <IconBtn title="Zoom in (+)" onClick={() => session.actions.zoomBy(1.25)}>
          <IconPlus />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn(p: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: preact.ComponentChildren;
}) {
  return (
    <button
      class={`icon-btn ${p.active ? 'active' : ''}`}
      title={p.title}
      aria-label={p.title}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

/**
 * A banner when the Build clock passes 2:00, 1:00 and 0:30: big, centred, there
 * for a couple of seconds. The last one is red.
 */
function TimeWarning() {
  const left = useObs(session.clock.left);
  const prev = useRef(left);
  const [msg, setMsg] = useState<{ text: string; urgent: boolean; id: number } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = left;
    const hit = WARNINGS.find((w) => before > w.at && left <= w.at);
    if (!hit) return;
    setMsg({ text: hit.text, urgent: hit.at <= 30, id: Date.now() });
  }, [left]);
  useEffect(() => {
    if (!msg) return;
    const h = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(h);
  }, [msg]);
  if (!msg) return null;
  return (
    <div class={`time-warning ${msg.urgent ? 'urgent' : ''}`} key={msg.id} role="status">
      <IconClock />
      <span>{msg.text}</span>
    </div>
  );
}

const WARNINGS = [
  { at: 120, text: '2 minutes left' },
  { at: 60, text: '1 minute left' },
  { at: 30, text: '30 seconds left' },
];

// ---- briefing -------------------------------------------------------------------

const BRIEFING_SECONDS = 30;

const RANK_NAME: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Walking speed in words (tiles per second). */
function speedWord(v: number): string {
  return v < 1 ? 'Slow' : v < 1.5 ? 'Steady' : 'Fast';
}

function Briefing() {
  const picks = useObs(session.draftPicks);
  const draft = session.baseDay.draft;
  const drafting = !!draft && session.mode === 'demo' && picks.length < draft.rounds.length;
  // The countdown only runs once the draft is done.
  const [left, setLeft] = useState(BRIEFING_SECONDS);
  useEffect(() => {
    if (drafting) return;
    setLeft(BRIEFING_SECONDS);
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [drafting]);
  // Leaving: the card lifts away and the night fades out, then building starts.
  const [leaving, setLeaving] = useState(false);
  const go = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => session.actions.startBuild(), 380);
  };
  useEffect(() => {
    if (left <= 0 && !drafting) go();
  }, [left]);
  // On a short screen the card scrolls: a "more below" cue until you reach the end.
  // The cue never changes the card's height (it overlays the bottom), so the
  // scroll position can't jump when it fades out.
  const cardRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const checkMore = () => {
    const el = cardRef.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 12);
  };
  useLayoutEffect(() => {
    checkMore();
    window.addEventListener('resize', checkMore);
    return () => window.removeEventListener('resize', checkMore);
  }, [drafting]);
  const { day } = session;
  const z = day.spawns.zombies.reduce((n, g) => n + g.count, 0);
  const mut = day.mutation;
  const zdef = hasZombieDef(mut?.zombie ?? 'shambler') ? zombieDef(mut?.zombie ?? 'shambler') : null;
  const kit: { key: string; icon: string; label: string; n: string }[] = [
    ...Object.entries(day.kit).map(([type, n]) => ({ key: type, icon: type, label: SHORT[type] ?? partLabel(type), n: `×${n}` })),
    { key: 'wire', icon: 'wire', label: 'Wire', n: `${day.materials.wire}` },
    ...(day.materials.wood > 0 ? [{ key: 'wood', icon: 'wood', label: 'Wood', n: `${day.materials.wood}` }] : []),
  ];
  return (
    <div class={`modal-wrap ${leaving ? 'leaving' : ''}`}>
      <div class={`card briefing ${leaving ? 'leaving' : ''}`} ref={cardRef} onScroll={checkMore}>
        <div class="brief-hero">
          <div class="brief-portrait">
            <img src={icon('shambler')} alt="" />
          </div>
          <div class="brief-head">
            <div class="eyebrow">TONIGHT'S ZOMBIE</div>
            <h1>{day.mutationName}</h1>
            {mut && <span class={`rank rank-${mut.rank}`}>{RANK_NAME[mut.rank]}</span>}
          </div>
        </div>

        <table class="ztable">
          <tbody>
            <tr>
              <th>Zombies</th>
              <td>{z}</td>
              <th>Health</th>
              <td>{zdef?.hp ?? '?'}</td>
            </tr>
            <tr>
              <th>Speed</th>
              <td>{zdef ? speedWord(zdef.speed) : '?'}</td>
              <th>Build time</th>
              <td>{fmtClock(day.buildSeconds)}</td>
            </tr>
          </tbody>
        </table>
        {mut && (
          <div class="brief-ability">
            <span class="ability-label">ABILITY</span>
            <b>{mut.ability.name}</b>
            <span>{mut.ability.text}</span>
          </div>
        )}

        {drafting && draft ? (
          <DraftRound
            round={picks.length}
            total={draft.rounds.length}
            offers={draft.rounds[picks.length] as [DraftOffer, DraftOffer]}
            onPick={(p) => session.draftPicks.set([...picks, p])}
          />
        ) : (
          <>
            <div class="section-label">YOUR KIT</div>
            {/* the list deals in one by one once the picks are done */}
            <div class="kit">
              {kit.map((k, i) => (
                <div class="kit-item pop" key={k.key} title={k.label} style={{ animationDelay: `${60 + i * 45}ms` }}>
                  <img src={icon(k.icon)} alt="" />
                  <span class="kit-name">{k.label}</span>
                  <b>{k.n}</b>
                </div>
              ))}
            </div>
          </>
        )}

        <div class="section-label">TONIGHT</div>
        <ol class="brief-steps">
          <li>
            <span>
              <b>Place your house.</b> Every zombie walks straight for it.
            </span>
          </li>
          <li>
            <span>
              <b>Traps need power.</b> Wire each one to a sensor (a plate or tripwire) or to the inlet, which powers 3.
            </span>
          </li>
          <li>
            <span>
              <b>Build circuits that kill:</b> power, then wire, then a trap. Strength drops 1 per wire tile.
            </span>
          </li>
          <li>
            <span>
              <b>Press Fight.</b> Kill every zombie before one reaches the house.
            </span>
          </li>
        </ol>

        <button class="big-btn" onClick={go} disabled={drafting}>
          {drafting ? 'Finish your picks first' : 'Start building'}
        </button>
        {!drafting && (
          <div class="brief-auto">
            <div class="brief-bar">
              <i style={{ width: `${(Math.max(0, left) / BRIEFING_SECONDS) * 100}%` }} />
            </div>
            <span>Starts on its own in {Math.max(0, left)}s</span>
          </div>
        )}
        <button
          class={`brief-more ${more ? 'show' : ''}`}
          aria-label="Scroll down for more"
          tabIndex={more ? 0 : -1}
          onClick={() => cardRef.current?.scrollBy({ top: cardRef.current.clientHeight * 0.7, behavior: 'smooth' })}
        >
          <span>More below</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * One pick: two cards, left or right. The cards deal in from their sides; a tap
 * pops the chosen card and drops it away while the other fades, and the next
 * pair deals straight in.
 */
function DraftRound(p: { round: number; total: number; offers: [DraftOffer, DraftOffer]; onPick(pick: Pick): void }) {
  const [chosen, setChosen] = useState<Pick | null>(null);
  useEffect(() => setChosen(null), [p.round]);
  const take = (pick: Pick) => {
    if (chosen !== null) return;
    setChosen(pick);
    setTimeout(() => p.onPick(pick), 280);
  };
  return (
    <div class="draft">
      <div class="draft-head">
        <span class="draft-count" key={p.round}>
          Pick {p.round + 1} of {p.total}
        </span>
        <span class="draft-dots" aria-hidden="true">
          {Array.from({ length: p.total }, (_, i) => (
            <i key={i} class={i < p.round ? 'done' : i === p.round ? 'now' : ''} />
          ))}
        </span>
      </div>
      <div class="draft-cards" key={p.round}>
        {([0, 1] as Pick[]).map((side) => (
          <button
            key={side}
            class={`draft-card side-${side} ${chosen === side ? 'chosen' : chosen !== null ? 'passed' : ''}`}
            onClick={() => take(side)}
          >
            <OfferBody offer={p.offers[side]} />
          </button>
        ))}
        <span class="draft-or">OR</span>
      </div>
    </div>
  );
}

/** What a draft card gives: each item as an icon, a short name with its count, and its kind; side by side if more than one. */
function OfferBody(p: { offer: DraftOffer }) {
  const items = [
    ...Object.entries(p.offer.parts ?? {}).map(([t, n]) => ({ key: t, icon: t, name: SHORT[t] ?? partLabel(t), n, kind: slotKind(`part:${t}`, true) })),
    ...Object.entries(p.offer.materials ?? {}).map(([m, n]) => ({
      key: m,
      icon: m,
      name: m === 'wire' ? 'Wire' : m === 'wood' ? 'Wood' : 'Stone',
      n: n ?? 0,
      kind: m === 'wire' ? slotKind('wire', true) : slotKind(`wall:${m}`, true),
    })),
  ];
  return (
    <div class="offer">
      {items.map((it, i) => (
        <Fragment key={it.key}>
          {i > 0 && <span class="offer-plus">+</span>}
          <div class="offer-item">
            <img src={icon(it.icon)} alt="" />
            <b>
              {it.n > 1 ? `${it.n}× ` : ''}
              {it.name}
            </b>
            {it.kind && <span class={`kind-tag ${it.kind.cls}`}>{it.kind.tag}</span>}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ---- build tray -----------------------------------------------------------------

/** The build hotbar: square slots with number keys, plus the Fight button. */
function Tray() {
  const tool = useObs(session.tool);
  useObs(session.draftPicks); // the kit (and so the slots) comes from the draft
  useObs(session.cleared); // cleared trees and rocks add wood and stone
  const c = useObs(session.store.contraption);
  const inv = session.store.inventory;
  const { day } = session;
  // Tapping the active slot again puts it away (back to tap-to-select). An empty
  // slot says where to get more.
  const pick = (id: string) => {
    if (dragEnded.current) {
      dragEnded.current = false;
      return;
    }
    const s = slot(id);
    if (tool !== id && s.count !== undefined && s.count <= 0 && session.mode === 'demo')
      toast(`Out of ${s.label.toLowerCase()}`);
    session.tool.set(tool === id ? 'select' : id);
    if (id === 'select') session.tool.set('select');
  };

  // Drag and drop from the hotbar: press a slot, drag onto the lawn, let go to place there.
  const [dragView, setDragView] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; on: boolean } | null>(null);
  const dragEnded = useRef(false);
  const draggable = (id: string) => id === 'house' || id === 'wire' || id.startsWith('part:') || id.startsWith('wall:');
  const dnd = {
    down: (id: string, e: PointerEvent) => {
      if (e.button !== 0 || !draggable(id)) return;
      dragRef.current = { id, x0: e.clientX, y0: e.clientY, on: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    move: (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 10) return;
      if (!d.on) {
        d.on = true;
        if (session.tool.value !== d.id) session.tool.set(d.id);
      }
      setDragView({ id: d.id, x: e.clientX, y: e.clientY });
      session.actions.hoverAt(e.clientX, e.clientY);
    },
    up: (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d?.on) return;
      dragEnded.current = true;
      setTimeout(() => (dragEnded.current = false), 0);
      setDragView(null);
      session.actions.dropAt(e.clientX, e.clientY);
    },
    cancel: () => {
      dragRef.current = null;
      setDragView(null);
    },
  };
  const ready = !!c.house;
  // One name tag above the hotbar: the slot under the pointer, else the active one.
  const [hover, setHover] = useState<string | null>(null);
  const tipId = hover ?? (tool !== 'select' || session.mode === 'sandbox' ? tool : null);

  const slot = (id: string): { label: string; title?: string; icon: preact.ComponentChildren; count?: number; badge?: string; alert?: boolean } => {
    if (id === 'select') return { label: 'Select', icon: <IconSelect /> };
    if (id === 'erase') return { label: 'Remove', icon: <IconErase /> };
    if (id === 'house')
      return { label: 'House', icon: <img src={icon('home')} alt="" />, badge: c.house ? '✓' : '!', alert: !c.house };
    if (id === 'wire') return { label: 'Wire', icon: <img src={icon('wire_straight')} alt="" />, count: inv.materials.wire };
    if (id.startsWith('wall:')) {
      const m = id.slice(5) as 'wood' | 'stone';
      return {
        label: m === 'wood' ? 'Wood wall' : 'Stone wall',
        icon: <img src={icon(`wall_${m}_ew_a`)} alt="" />,
        count: Math.floor(inv.materials[m] / WALL_COST),
      };
    }
    const type = id.slice(5);
    return { label: SHORT[type] ?? partLabel(type), title: partLabel(type), icon: <img src={icon(type)} alt="" />, count: inv.parts[type] ?? 0 };
  };

  const tip = tipId ? slot(tipId) : null;
  // The name, with its kind (Attack, Power...) underneath. What it does is in its card once placed.
  const tipKind = tipId ? slotKind(tipId, !!c.house) : null;

  // Centre the tag over its slot, kept inside the hotbar's edges.
  const hotbarRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const bar = hotbarRef.current;
      const tag = tipRef.current;
      const btn = tipId ? bar?.querySelector<HTMLElement>(`[data-slot="${tipId}"]`) : null;
      if (!bar || !tag || !btn) return setTipLeft(null);
      const b = btn.getBoundingClientRect();
      const r = bar.getBoundingClientRect();
      const half = tag.offsetWidth / 2;
      const centre = b.left + b.width / 2 - r.left;
      setTipLeft(Math.max(half, Math.min(r.width - half, centre)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [tipId, tip?.title]);

  return (
    <div class="tray-wrap">
      <div class="hotbar" ref={hotbarRef}>
        {tip && (
          <div
            class="hotbar-tip"
            key={tipId ?? ''}
            ref={tipRef}
            style={tipLeft === null ? { visibility: 'hidden' } : { left: `${tipLeft}px` }}
          >
            <b>{tip.title ?? tip.label}</b>
            {tipKind && tipKind.tag !== (tip.title ?? tip.label) && <span class={`kind-tag ${tipKind.cls}`}>{tipKind.tag}</span>}

          </div>
        )}
        <div
          class="tray"
          role="toolbar"
          aria-label="Build tools"
          style={{ '--cols': Math.ceil(hotbarTools(day, session.mode).length / 2) }}
          onMouseLeave={() => setHover(null)}
        >
          {hotbarTools(day, session.mode).map((id, i) => {
            const s = slot(id);
            return (
              <ToolBtn key={id} id={id} keyHint={slotKey(i)} cur={tool} onPick={pick} onHover={setHover} dnd={dnd} {...s}>
                {s.icon}
              </ToolBtn>
            );
          })}
        </div>
      </div>
      {dragView && (
        <div class="drag-float" style={{ left: `${dragView.x}px`, top: `${dragView.y}px` }} aria-hidden="true">
          {slot(dragView.id).icon}
        </div>
      )}
      <div class="fight-dock">
        <button
          class={`fight-btn ${ready ? 'ready' : ''}`}
          onClick={() => session.actions.startRaid()}
          disabled={!ready}
          title={ready ? 'Fight (Enter)' : 'Place your house first'}
        >
          <span class="fight-main">
            <IconSwords />
            <span>Fight</span>
          </span>
          {ready ? <span class="key">↵</span> : <span class="fight-sub">Place your house</span>}
        </button>
      </div>
    </div>
  );
}

function ToolBtn(p: {
  id: string;
  label: string;
  title?: string;
  keyHint: string;
  cur: string;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  count?: number;
  badge?: string;
  alert?: boolean;
  dnd?: { down(id: string, e: PointerEvent): void; move(e: PointerEvent): void; up(e: PointerEvent): void; cancel(): void };
  children: preact.ComponentChildren;
}) {
  const empty = p.count !== undefined && p.count <= 0;
  const on = p.cur === p.id;
  return (
    <button
      class={`tool ${on ? 'active' : ''} ${empty ? 'empty' : ''}`}
      aria-label={`${p.title ?? p.label} (${p.keyHint})`}
      aria-pressed={on}
      data-slot={p.id}
      onClick={() => p.onPick(p.id)}
      onMouseEnter={() => p.onHover(p.id)}
      onPointerDown={(e) => p.dnd?.down(p.id, e)}
      onPointerMove={(e) => p.dnd?.move(e)}
      onPointerUp={(e) => p.dnd?.up(e)}
      onPointerCancel={() => p.dnd?.cancel()}
    >
      <span class="key">{p.keyHint}</span>
      <span class="tool-icon">{p.children}</span>
      {p.count !== undefined && <span class="count">{p.count > 99 ? '∞' : p.count}</span>}
      {p.badge && <span class={`badge ${p.alert ? 'alert' : 'ok'}`}>{p.badge}</span>}
    </button>
  );
}

function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.5 6.5 a4 4 0 0 0 5 5 L12 19 a2.1 2.1 0 0 1 -3 -3 Z" />
      <path d="M14.5 6.5 L17 4 M19.5 11.5 L20 9" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5 V12 L15 14" />
    </svg>
  );
}

function IconSwords() {
  return (
    <svg viewBox="0 0 24 24" class="swords" aria-hidden="true" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      {/* two solid blades with crossguards, grips and pommels, crossed */}
      <path d="M3 3 L6 3.4 L15.2 12.6 L12.6 15.2 L3.4 6 Z" fill="currentColor" stroke-width="1" />
      <path d="M21 3 L18 3.4 L8.8 12.6 L11.4 15.2 L20.6 6 Z" fill="currentColor" stroke-width="1" />
      <path d="M10.6 17.4 L17.4 10.6 M15.6 15.6 L19.4 19.4 M13.4 17.4 L6.6 10.6 M8.4 15.6 L4.6 19.4" fill="none" stroke-width="2.4" />
      <circle cx="20.4" cy="20.4" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="3.6" cy="20.4" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Rotation for the active part tool, or info about the selected part. */
/** Places a floating card above (or below, near the top) a screen anchor, kept on screen. */
function useFloatingCard(anchor: { x: number; y: number; size: number } | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(280);
  useLayoutEffect(() => {
    if (ref.current && ref.current.offsetWidth !== w) setW(ref.current.offsetWidth);
  });
  if (!anchor) return { ref, below: false, style: {} };
  const below = anchor.y < 190;
  const x = Math.max(10 + w / 2, Math.min(window.innerWidth - 10 - w / 2, anchor.x));
  const arrow = Math.max(14, Math.min(w - 14, anchor.x - (x - w / 2)));
  const style = { left: `${x}px`, top: `${below ? anchor.y + anchor.size + 12 : anchor.y - 12}px`, '--arrow': `${arrow}px` };
  return { ref, below, style };
}

/**
 * The power inlet's card: steady but weak (strength 6), and it only powers the
 * INLET_MAX_LOAD action parts it reaches strongest. Shows how many are in use.
 */
function InletCard() {
  const sel = useObs(session.selected);
  const anchor = useObs(session.selAnchor);
  const c = useObs(session.store.contraption);
  useObs(session.repaired);
  const isInlet = !!sel && sel.x === session.day.inlet.x && sel.y === session.day.inlet.y;
  const { ref, below, style } = useFloatingCard(isInlet ? anchor : null);
  if (!isInlet || !anchor) return null;
  const used = powerPreview(session.day, c).loaded.length;
  return (
    <div class={`inspector floating ${below ? 'below' : 'above'}`} ref={ref} style={style}>
      <img src={icon('power_inlet')} alt="" />
      <div class="insp-body">
        <div class="insp-title">
          Power inlet
          <span class={`insp-power ${used < INLET_MAX_LOAD ? 'ok' : 'bad'}`}>
            {used} of {INLET_MAX_LOAD} in use
          </span>
        </div>
        <div class="insp-sub">
          Steady but weak ({INLET_STRENGTH}). Powers the {INLET_MAX_LOAD} nearest parts wired to it; sensors power the rest.
        </div>
      </div>
    </div>
  );
}

/**
 * The first time you place a part, a small bubble over it says it can be tapped
 * to see how it works. It goes away for good once you open any part's card.
 */
function CardHint() {
  const at = useObs(session.cardHint);
  if (!at) return null;
  return (
    <div class="card-hint" style={{ left: `${at.x}px`, top: `${at.y}px` }} aria-hidden="true">
      Tap it to see how it works
    </div>
  );
}

/** What to call a rock or tree by its size. */
function rockName(type: 'rock' | 'tree', w: number, h: number): string {
  const n = w * h;
  if (type === 'tree') return n >= 4 ? 'Big oak' : 'Tree';
  return n >= 4 ? 'Boulder' : n >= 2 ? 'Rock' : 'Stone';
}

/** A rock: what it does, and the button to clear it for build time. */
function RockCard() {
  const sel = useObs(session.selected);
  const anchor = useObs(session.selAnchor);
  useObs(session.cleared);
  const left = useObs(session.clock.left);
  const rock = sel ? (session.day.obstacles ?? []).find((o) => covers(o, sel.x, sel.y)) : undefined;
  const { ref, below, style } = useFloatingCard(rock ? anchor : null);
  if (!rock || !anchor) return null;
  const can = session.mode !== 'demo' || left - rock.clearSeconds >= 5;
  return (
    <div class={`inspector floating ${below ? 'below' : 'above'}`} ref={ref} style={style}>
      <div class={rock.type === 'tree' ? 'insp-tree' : 'insp-rock'} aria-hidden="true" />
      <div class="insp-body">
        <div class="insp-title">
          {rockName(rock.type, rock.w ?? 1, rock.h ?? 1)}
          <span class="insp-power">
            {rock.w ?? 1}×{rock.h ?? 1}
          </span>
        </div>
        <div class="insp-sub">
          Zombies walk round it. Nothing can be built or wired through it. Clearing it gives {obstacleYield(rock).n}{' '}
          {obstacleYield(rock).material}.
        </div>
        <button
          class="repair-btn"
          disabled={!can}
          onClick={() => {
            const why = clearRock(rock.x, rock.y);
            if (why) toast(why);
          }}
        >
          <IconWrench />
          {rock.type === 'tree' ? 'Cut down' : 'Clear'} (−{fmtClock(rock.clearSeconds)})
        </button>
        {!can && <div class="insp-note">Not enough build time left</div>}
      </div>
    </div>
  );
}

/**
 * The part card: floats just above the selected part (below it near the top of
 * the screen), centred on it and kept on screen. Only for a selected placed part.
 */
function Inspector() {
  const sel = useObs(session.selected);
  const anchor = useObs(session.selAnchor);
  const c = useObs(session.store.contraption);
  const cardRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(280);
  useObs(session.repaired);
  const left = useObs(session.clock.left);
  const fxIndex = sel ? fixtureAt(session.day, sel.x, sel.y) : -1;
  const fixture = fxIndex >= 0 ? session.day.fixtures?.[fxIndex] : undefined;
  const selPart = sel
    ? (c.parts.find((p) => p.x === sel.x && p.y === sel.y) ??
      workingFixtures(session.day).find((p) => p.x === sel.x && p.y === sel.y))
    : undefined;
  const type = selPart?.type ?? (fixture?.broken ? fixture.type : undefined);
  useLayoutEffect(() => {
    if (cardRef.current) setW(cardRef.current.offsetWidth);
  });
  if (!type || !hasPartDef(type) || !anchor) return null;
  const def = partDef(type);
  const below = anchor.y < 190;
  const vw = window.innerWidth;
  const cardX = Math.max(10 + w / 2, Math.min(vw - 10 - w / 2, anchor.x));
  const arrow = Math.max(14, Math.min(w - 14, anchor.x - (cardX - w / 2)));
  const pos = below
    ? { left: `${cardX}px`, top: `${anchor.y + anchor.size + 12}px`, '--arrow': `${arrow}px` }
    : { left: `${cardX}px`, top: `${anchor.y - 12}px`, '--arrow': `${arrow}px` };

  // A broken map machine: what it is, and the repair button.
  if (fixture?.broken && fxIndex >= 0) {
    const cost = fixture.repairSeconds;
    const can = session.mode !== 'demo' || left - cost >= 5;
    return (
      <div class={`inspector floating ${below ? 'below' : 'above'}`} ref={cardRef} style={pos}>
        <img src={icon(type)} alt="" class="insp-broken-img" />
        <div class="insp-body">
          <div class="insp-title">
            {def.label}
            <span class="insp-power bad">Broken</span>
          </div>
          <div class="insp-sub">{PART_INFO[type] ?? ''}. Repair it and it works where it stands.</div>
          <button class="repair-btn" disabled={!can} onClick={() => repairFixture(fxIndex)}>
            <IconWrench />
            Repair (−{fmtClock(cost)})
          </button>
          {!can && <div class="insp-note">Not enough build time left</div>}
        </div>
      </div>
    );
  }
  if (!selPart) return null;

  // Live power for a selected placed part (the build preview: inlet + chips, no zombies).
  let power: { text: string; ok: boolean } | null = null;
  {
    const pv = powerPreview(session.day, c);
    const got = pv.inputs.get(selPart.id) ?? { c: 0, t: 0 };
    const s = Math.max(got.c, got.t);
    const pct = `${Math.round(powerMul(s) * 100)}% power`;
    if (def.kind === 'action')
      power =
        s >= def.needs && pv.loaded.includes(selPart.id)
          ? { text: `Powered, ${pct}`, ok: true }
          : s >= def.needs
            ? { text: `Inlet full (${INLET_MAX_LOAD} of ${INLET_MAX_LOAD})`, ok: false }
            : s > 0
              ? { text: `Too weak (${s} of ${def.needs})`, ok: false }
              : { text: 'No power yet', ok: false };
    else if (def.kind === 'chip') power = s > 0 ? { text: `Input ${s}`, ok: true } : { text: 'No input yet', ok: false };
  }
  const strength = (() => {
    const got = powerPreview(session.day, c).inputs.get(selPart.id);
    return got ? Math.max(got.c, got.t) : null;
  })();
  const latchOn = selPart?.type === 'latch' ? (selPart.config?.on ?? 0) > 0 : null;
  const delay = selPart?.type === 'delay' ? (selPart.config?.delay ?? 5) : null;
  const blink = selPart?.type === 'delay' ? (selPart.config?.blink ?? 0) > 0 : false;
  const setCfg = (patch: Record<string, number>) =>
    selPart && session.store.apply((cc) => configurePart(cc, selPart.id, { ...selPart.config, ...patch }));

  return (
    <div class={`inspector floating ${below ? 'below' : 'above'}`} ref={cardRef} style={pos}>
      <img src={icon(type)} alt="" />
      <div class="insp-body">
        <div class="insp-title">
          {def.label}
          {power && <span class={`insp-power ${power.ok ? 'ok' : 'bad'}`}>{power.text}</span>}
        </div>
        {strength !== null && <SignalMeter s={strength} />}
        <div class="insp-sub">{(type === 'delay' && blink ? BLINK_INFO : PART_INFO[type]) ?? ''}</div>
        {CHIPS[type] && (
          <div class="insp-chips">
            {(CHIPS[type] as string[]).map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        )}
        {WIRING[type] && <PartDemo steps={WIRING[type] as Step[]} />}
        {ZDEMO[type] && <ZombieDemo type={type} />}
        {latchOn !== null && selPart && (
          <div class="insp-controls">
            <div class="insp-seg" role="group" aria-label="Switch">
              <button class={!latchOn ? 'on' : ''} onClick={() => setCfg({ on: 0 })}>
                Off
              </button>
              <button class={latchOn ? 'on blink' : ''} onClick={() => setCfg({ on: 1 })}>
                On
              </button>
            </div>
          </div>
        )}
        {delay !== null && selPart && (
          <div class="insp-controls">
            <div class="insp-seg" role="group" aria-label="Mode">
              <button class={!blink ? 'on' : ''} onClick={() => setCfg({ blink: 0 })}>
                Wait
              </button>
              <button class={blink ? 'on blink' : ''} onClick={() => setCfg({ blink: 1 })}>
                Blink
              </button>
            </div>
            <div class="insp-seg" role="group" aria-label={blink ? 'Beat' : 'Delay'}>
              {DELAY_STEPS.map((d) => (
                <button key={d} class={d === delay ? 'on' : ''} onClick={() => setCfg({ delay: d })}>
                  {d / 10}s
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {def.rotatable && (
        <button class="icon-btn" title="Turn (R)" onClick={() => session.actions.rotate()}>
          <IconRotate />
        </button>
      )}
    </div>
  );
}

/**
 * Signal strength as five bars (full at 9+, a sensor one tile away), with the
 * number: the same strength the wires show, and what it means for damage.
 */
function SignalMeter(p: { s: number }) {
  const bars = Math.min(5, Math.ceil(p.s / 2));
  return (
    <div class="sig" title={`Signal strength ${p.s}, damage x${powerMul(p.s).toFixed(2)}`}>
      <span class="sig-bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} class={i < bars ? `on b${bars}` : ''} style={{ height: `${5 + i * 3}px` }} />
        ))}
      </span>
      <span class="sig-text">Signal {p.s}</span>
    </div>
  );
}

/** What each trap does to a zombie, for the card's demo: a caption and the damage numbers that pop. */
const ZDEMO: Record<string, { caption: string; hits: string[] }> = {
  saw_blade: { caption: 'Cuts it the whole way across: about 66 of its 100 health at full power.', hits: ['-66'] },
  spike_floor: { caption: 'Steady power: one 20 stab, and it crosses at half speed. A tick punches for 45.', hits: ['-20'] },
  tesla_coil: { caption: 'Zaps the nearest zombie in reach for 70, then again after 1.5s.', hits: ['-70', '-70'] },
  piston: { caption: 'Shoves it one tile on, into spikes, a saw, or a wall (20 damage).', hits: [] },
};

/**
 * A looping demo strip in the part card: a zombie walks along a lane past the
 * part, and you see what happens to it (its health bar, damage numbers, being
 * slowed, zapped or shoved). Pure CSS animation, one loop every 3.2s.
 */
function ZombieDemo(p: { type: string }) {
  const d = ZDEMO[p.type];
  if (!d) return null;
  return (
    <div class={`zdemo zd-${p.type}`} aria-hidden="true">
      <div class="zd-lane">
        <img class="zd-part" src={icon(p.type)} alt="" />
        {p.type === 'tesla_coil' && <i class="zd-zap" />}
        <div class="zd-zombie">
          <span class="zd-hp">
            <i />
          </span>
          <img src={icon('shambler')} alt="" />
        </div>
        {d.hits.map((h, i) => (
          <span key={i} class={`zd-hit h${i}`}>
            {h}
          </span>
        ))}
      </div>
      <div class="zd-caption">{d.caption}</div>
    </div>
  );
}

/** The part's little how-it's-wired diagram (icons with arrows), in its card. */
function PartDemo(p: { steps: Step[] }) {
  return (
    <div class="part-demo" aria-hidden="true">
      {p.steps.map((st, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span class="demo-arrow">
              <i />
            </span>
          )}
          <span class={`demo-step ${st.role === 'This' ? 'this' : ''}`}>
            <img src={icon(st.icon)} alt="" />
            <small>{st.role}</small>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

const DELAY_STEPS = [5, 10, 20];
const BLINK_INFO = 'Turns steady power into a beat: on, off, on, off.';

/** One line on what each part does (the inspector card). */
const PART_INFO: Record<string, string> = {
  pressure_plate: 'Sends power down its wire while a zombie stands on it.',
  tripwire: 'Sends a short pulse of power each time a zombie walks through.',
  delay: 'Passes power on after a short wait, back at full strength.',
  tesla_coil: 'Zaps the nearest zombie in reach, again every 1.5 seconds.',
  saw_blade: 'Cuts every zombie on its tile while it has power.',
  spike_floor: 'Stabs zombies on its tile and slows them. A pulse makes it punch hard.',
  piston: 'Pushes out while powered and shoves zombies in front of it one tile.',
  latch: 'A switch that stays on. Power its back to turn it on, its side to turn it off.',
};

// ---- raid -----------------------------------------------------------------------

/**
 * Night falls when the raid starts: a cold blue wash and a dark vignette over the
 * world (under the HUD). When zombies close in on the house a red heartbeat
 * pulses in from the screen edges, stronger and faster the closer they are.
 */
function NightFx() {
  const danger = useObs(session.danger);
  const beat = useObs(session.beat);
  return (
    <div class="nightfx" aria-hidden="true">
      <div class="night-wash" />
      <div class="vignette" />
      {/* keyed by the beat count so the one-shot thump animation restarts on every heartbeat */}
      <div key={beat} class={`danger ${danger > 0 ? 'on' : ''}`} style={{ '--danger': danger }} />
    </div>
  );
}

function RaidBar() {
  const r = useObs(session.raid);
  if (!r) return null;
  return (
    <div class="raidbar">
      <div class="raid-stats">
        <span>
          <b>{r.killed}</b> killed
        </span>
        <span>
          <b>{r.alive}</b> on the map
        </span>
      </div>
      <div class="seg">
        <button class={`seg-btn ${r.paused ? 'active' : ''}`} onClick={() => session.actions.togglePause()} aria-label="Pause">
          {r.paused ? <IconPlay /> : <IconPause />}
        </button>
        {([1, 2, 4] as const).map((s) => (
          <button key={s} class={`seg-btn ${r.speed === s ? 'active' : ''}`} onClick={() => session.actions.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function Result() {
  const r = useObs(session.result);
  if (!r) return null;
  const won = r.outcome === 'won';
  const why =
    r.reason === 'breach' ? 'A zombie reached your house' : r.reason === 'timeout' ? 'Dawn came with zombies still out there' : 'Every zombie is down';
  return (
    <div class="modal-wrap">
      <div class={`card result ${won ? 'won' : 'lost'}`}>
        <div class="eyebrow">NIGHT 1 {won ? 'SURVIVED' : 'OVERRUN'}</div>
        <h1>{won ? 'You held out.' : 'They got in.'}</h1>
        <p class="blurb">{why}</p>
        <div class="stars" aria-label={won ? '1 star' : 'no stars'}>
          {[0, 1, 2].map((i) => (
            <span key={i} class={`star ${won && i === 0 ? 'on' : ''}`}>
              <StarIcon />
            </span>
          ))}
        </div>
        <div class="stats">
          <div>
            <b>
              {r.killed}/{r.spawned}
            </b>
            <span>killed</span>
          </div>
          <div>
            <b>{r.seconds.toFixed(1)}s</b>
            <span>raid</span>
          </div>
          <div>
            <b>{won ? '1' : '0'}/3</b>
            <span>stars</span>
          </div>
        </div>
        <div class="btns one">
          {/* One way on: back to the briefing for a fresh draft and build. */}
          <button class="big-btn" onClick={() => session.actions.restart()}>
            {won ? 'Play again' : 'Try again'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5 L14.9 8.6 L21.5 9.4 L16.6 13.9 L17.9 20.5 L12 17.2 L6.1 20.5 L7.4 13.9 L2.5 9.4 L9.1 8.6 Z"
        fill="currentColor"
        stroke="#0d1116"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </svg>
  );
}

// ---- sandbox --------------------------------------------------------------------

function SandboxPanel() {
  const phase = useObs(session.phase);
  const [json, setJson] = useState('');
  const paths = useObs(session.showPaths);
  const raid = phase === 'raid';
  return (
    <div class="sandbox">
      <div class="section-label">SANDBOX</div>
      <div class="sb-row">
        <button class="small-btn" disabled={!raid} onClick={() => session.actions.sandboxSpawn('selected')}>
          Spawn at selected
        </button>
        <button class="small-btn" disabled={!raid} onClick={() => session.actions.sandboxSpawn('random')}>
          Spawn random
        </button>
      </div>
      <button class={`small-btn ${paths ? 'on' : ''}`} onClick={() => session.showPaths.set(!paths)}>
        Zombie paths: {paths ? 'on' : 'off'}
      </button>
      {raid ? (
        <button class="small-btn" onClick={() => session.actions.backToBuild()}>
          End raid
        </button>
      ) : (
        <>
          <textarea
            placeholder="Contraption JSON"
            value={json}
            onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)}
          />
          <div class="sb-row">
            <button class="small-btn" onClick={() => setJson(JSON.stringify(session.store.current))}>
              Copy current
            </button>
            <button
              class="small-btn"
              onClick={() => {
                try {
                  session.store.load(JSON.parse(json));
                } catch {
                  session.toast.set({ text: 'Not valid JSON', id: Date.now() });
                }
              }}
            >
              Load
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- toast ----------------------------------------------------------------------

function Toast() {
  const t = useObs(session.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!t) return;
    setVisible(true);
    const h = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div class={`toast ${visible ? 'show' : ''}`} role="status" key={t.id}>
      {t.text}
    </div>
  );
}
