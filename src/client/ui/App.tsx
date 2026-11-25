// The DOM UI over the canvas. Reads the session; calls session.actions.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { WALL_COST } from '@shared/build/rules';
import { hasPartDef, partDef } from '@shared/sim';
import { useObs } from '../core/observable';
import { session, toast } from '../core/session';
import {
  IconErase,
  IconFit,
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
      {phase === 'build' && session.mode === 'demo' && <TimeWarning />}
      {phase === 'raid' && <RaidBar />}
      {phase === 'result' && <Result />}
      {session.mode === 'sandbox' && (phase === 'build' || phase === 'raid') && <SandboxPanel />}
      <Toast />
    </>
  );
}

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

function Briefing() {
  const [left, setLeft] = useState(BRIEFING_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Leaving: the card lifts away and the night fades out, then building starts.
  const [leaving, setLeaving] = useState(false);
  const go = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => session.actions.startBuild(), 380);
  };
  useEffect(() => {
    if (left <= 0) go();
  }, [left]);
  const { day } = session;
  const z = day.spawns.zombies.reduce((n, g) => n + g.count, 0);
  const kit: { key: string; icon: string; label: string; n: string }[] = [
    ...Object.entries(day.kit).map(([type, n]) => ({ key: type, icon: type, label: SHORT[type] ?? partLabel(type), n: `×${n}` })),
    { key: 'wire', icon: 'wire', label: 'Wire', n: `${day.materials.wire}` },
    ...(day.materials.wood > 0 ? [{ key: 'wood', icon: 'wood', label: 'Wood', n: `${day.materials.wood}` }] : []),
  ];
  return (
    <div class={`modal-wrap ${leaving ? 'leaving' : ''}`}>
      <div class={`card briefing ${leaving ? 'leaving' : ''}`}>
        <div class="brief-hero">
          <div class="brief-portrait">
            <img src={icon('shambler')} alt="" />
          </div>
          <div class="brief-head">
            <div class="eyebrow">TONIGHT'S MUTATION</div>
            <h1>{day.mutationName}</h1>
            <p class="blurb">{day.mutationBlurb}</p>
          </div>
        </div>

        <div class="brief-stats">
          <div>
            <b>{z}</b>
            <span>zombies</span>
          </div>
          <div>
            <b>4</b>
            <span>sides</span>
          </div>
          <div>
            <b>{fmtClock(day.buildSeconds)}</b>
            <span>to build</span>
          </div>
        </div>

        <div class="section-label">YOUR KIT</div>
        <div class="kit">
          {kit.map((k) => (
            <div class="kit-item" key={k.key} title={k.label}>
              <img src={icon(k.icon)} alt="" />
              <span class="kit-name">{k.label}</span>
              <b>{k.n}</b>
            </div>
          ))}
        </div>

        <div class="section-label">TONIGHT</div>
        <ol class="brief-steps">
          <li>Place your house anywhere inside the clearing.</li>
          <li>Wire the power inlet to traps that kill.</li>
          <li>Press Fight. Every zombie must fall before one reaches the house.</li>
        </ol>

        <button class="big-btn" onClick={go}>
          Start building
        </button>
        <div class="brief-auto">
          <div class="brief-bar">
            <i style={{ width: `${(Math.max(0, left) / BRIEFING_SECONDS) * 100}%` }} />
          </div>
          <span>Starts on its own in {Math.max(0, left)}s</span>
        </div>
      </div>
    </div>
  );
}

// ---- build tray -----------------------------------------------------------------

/** The build hotbar: square slots with number keys, plus the Fight button. */
function Tray() {
  const tool = useObs(session.tool);
  const c = useObs(session.store.contraption);
  const inv = session.store.inventory;
  const { day } = session;
  // Tapping the active slot again puts it away (back to tap-to-select). An empty
  // slot says where to get more.
  const pick = (id: string) => {
    const s = slot(id);
    if (tool !== id && s.count !== undefined && s.count <= 0 && session.mode === 'demo')
      toast(`Out of ${s.label.toLowerCase()}`);
    session.tool.set(tool === id ? 'select' : id);
  };
  const ready = !!c.house;
  // One name tag above the hotbar: the slot under the pointer, else the active one.
  const [hover, setHover] = useState<string | null>(null);
  const tipId = hover ?? (tool !== 'select' ? tool : null);

  const slot = (id: string): { label: string; title?: string; icon: preact.ComponentChildren; count?: number; badge?: string; alert?: boolean } => {
    if (id === 'erase') return { label: 'Remove', icon: <IconErase /> };
    if (id === 'house')
      return { label: 'House', icon: <img src={icon('home')} alt="" />, badge: c.house ? '✓' : '!', alert: !c.house };
    if (id === 'wire') return { label: 'Wire', icon: <img src={icon('wire_straight')} alt="" />, count: inv.materials.wire };
    if (id.startsWith('wall:')) {
      const m = id.slice(5) as 'wood' | 'stone';
      return {
        label: m === 'wood' ? 'Wood wall' : 'Stone wall',
        title: `${m === 'wood' ? 'Wood' : 'Stone'} wall (${WALL_COST} ${m === 'wood' ? 'Wood' : 'Stone'})`,
        icon: <img src={icon(`wall_${m}_ew_a`)} alt="" />,
        count: Math.floor(inv.materials[m] / WALL_COST),
      };
    }
    const type = id.slice(5);
    return { label: SHORT[type] ?? partLabel(type), title: partLabel(type), icon: <img src={icon(type)} alt="" />, count: inv.parts[type] ?? 0 };
  };

  const tip = tipId ? slot(tipId) : null;
  const tipDetail =
    tip && tipId
      ? tipId === 'house'
        ? c.house
          ? 'tap the lawn to move it'
          : 'place it first'
        : tip.count !== undefined
          ? tip.count > 99
            ? 'unlimited'
            : `${tip.count} left`
          : null
      : null;

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
  }, [tipId, tip?.title, tipDetail]);

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
            {tipDetail && <span>{tipDetail}</span>}
          </div>
        )}
        <div class="tray" role="toolbar" aria-label="Build tools" onMouseLeave={() => setHover(null)}>
          {hotbarTools(day).map((id, i) => {
            const s = slot(id);
            return (
              <ToolBtn key={id} id={id} keyHint={slotKey(i)} cur={tool} onPick={pick} onHover={setHover} {...s}>
                {s.icon}
              </ToolBtn>
            );
          })}
        </div>
      </div>
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
    >
      <span class="key">{p.keyHint}</span>
      <span class="tool-icon">{p.children}</span>
      {p.count !== undefined && <span class="count">{p.count > 99 ? '∞' : p.count}</span>}
      {p.badge && <span class={`badge ${p.alert ? 'alert' : 'ok'}`}>{p.badge}</span>}
    </button>
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
  const selPart = sel ? c.parts.find((p) => p.x === sel.x && p.y === sel.y) : undefined;
  useLayoutEffect(() => {
    if (cardRef.current && cardRef.current.offsetWidth !== w) setW(cardRef.current.offsetWidth);
  });
  if (!selPart || !hasPartDef(selPart.type) || !anchor) return null;
  const def = partDef(selPart.type);
  const below = anchor.y < 190;
  const x = Math.max(10 + w / 2, Math.min(window.innerWidth - 10 - w / 2, anchor.x));
  const arrow = Math.max(14, Math.min(w - 14, anchor.x - (x - w / 2)));
  const style = { left: `${x}px`, top: `${below ? anchor.y + anchor.size + 12 : anchor.y - 12}px`, '--arrow': `${arrow}px` };
  return (
    <div class={`inspector floating ${below ? 'below' : 'above'}`} ref={cardRef} style={style}>
      <img src={icon(selPart.type)} alt="" />
      <div class="insp-body">
        <div class="insp-title">{def.label}</div>
        <div class="insp-sub">
          {def.kind === 'action' ? `Needs power ${def.needs}+` : def.kind === 'trigger' ? 'Makes power (10)' : 'Logic chip'}
        </div>
      </div>
      {def.rotatable && (
        <button class="icon-btn" title="Turn (R)" onClick={() => session.actions.rotate()}>
          <IconRotate />
        </button>
      )}
    </div>
  );
}

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
    r.reason === 'breach' ? 'A zombie reached your house.' : r.reason === 'timeout' ? 'Dawn came with zombies still out there.' : 'Every zombie is down.';
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
        <div class="btns">
          <button class="big-btn" onClick={() => session.actions.backToBuild()}>
            Rebuild
          </button>
          <button class="big-btn ghost" onClick={() => session.actions.restart()}>
            Start over
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
