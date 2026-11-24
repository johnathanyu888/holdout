// The DOM UI over the canvas. Reads the session; calls session.actions.

import { useEffect, useState } from 'preact/hooks';
import { WALL_COST } from '@shared/build/rules';
import { hasPartDef, partDef } from '@shared/sim';
import { useObs } from '../core/observable';
import { session } from '../core/session';
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
  useObs(session.store.historyVersion);
  const building = phase === 'build';

  let clock: preact.ComponentChildren = null;
  if (building && session.mode === 'demo')
    clock = (
      <div class={`pill clock ${left <= 30 ? 'warn' : ''}`} title="Build time left">
        <span class="pill-label">BUILD</span>
        {fmtClock(left)}
      </div>
    );
  else if ((phase === 'raid' || phase === 'result') && raid)
    clock = (
      <div class="pill clock" title="Raid time">
        <span class="pill-label">RAID</span>
        {raid.seconds.toFixed(1)}s
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

// ---- briefing -------------------------------------------------------------------

const BRIEFING_SECONDS = 30;

function Briefing() {
  const [left, setLeft] = useState(BRIEFING_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) session.actions.startBuild();
  }, [left]);
  const { day } = session;
  const z = day.spawns.zombies.reduce((n, g) => n + g.count, 0);
  return (
    <div class="modal-wrap">
      <div class="card briefing">
        <div class="eyebrow">NIGHT 1 · TONIGHT'S MUTATION</div>
        <h1>{day.mutationName}</h1>
        <p class="blurb">{day.mutationBlurb}</p>
        <div class="facts">
          <div>
            <img src={icon('shambler')} alt="" />
            <b>{z}</b> zombies, from every edge
          </div>
          <div>
            <img src={icon('power_inlet')} alt="" />
            Power inlet at tile {day.inlet.x},{day.inlet.y}
          </div>
        </div>
        <div class="section-label">YOUR KIT</div>
        <div class="kit">
          {Object.entries(day.kit).map(([type, n]) => (
            <div class="kit-item" key={type} title={partLabel(type)}>
              <img src={icon(type)} alt="" />
              <span>×{n}</span>
            </div>
          ))}
          <div class="kit-item" title="Wire">
            <img src={icon('wire')} alt="" />
            <span>{day.materials.wire}</span>
          </div>
          {day.materials.wood > 0 && (
            <div class="kit-item" title="Wood">
              <img src={icon('wood')} alt="" />
              <span>{day.materials.wood}</span>
            </div>
          )}
        </div>
        <p class="hint">Place your house. Build a machine that kills every zombie before one reaches it.</p>
        <button class="big-btn" onClick={() => session.actions.startBuild()}>
          Start building <span class="muted">({Math.max(0, left)})</span>
        </button>
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
  // Tapping the active slot again puts it away (back to tap-to-select).
  const pick = (id: string) => session.tool.set(tool === id ? 'select' : id);
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

  return (
    <div class="tray-wrap">
      <div class="hotbar">
        {tip && (
          <div class="hotbar-tip" key={tipId ?? ''}>
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
          <span class="fight-sub">{ready ? 'Enter' : 'Place your house'}</span>
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

function IconSwords() {
  return (
    <svg viewBox="0 0 24 24" class="swords" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 3.5 L14.5 14 M13 17.5 L17.5 13 M16 16 L20.5 20.5" />
      <path d="M20 3.5 L9.5 14 M6.5 13 L11 17.5 M8 16 L3.5 20.5" />
    </svg>
  );
}

/** Rotation for the active part tool, or info about the selected part. */
function Inspector() {
  const tool = useObs(session.tool);
  const rot = useObs(session.rot);
  const sel = useObs(session.selected);
  const c = useObs(session.store.contraption);
  const placingType = tool.startsWith('part:') ? tool.slice(5) : null;
  const selPart = sel ? c.parts.find((p) => p.x === sel.x && p.y === sel.y) : undefined;
  const type = placingType ?? selPart?.type;
  if (!type || !hasPartDef(type)) return null;
  const def = partDef(type);
  return (
    <div class="inspector">
      <img src={icon(type)} alt="" />
      <div>
        <div class="insp-title">{def.label}</div>
        <div class="insp-sub">
          {def.kind === 'action' ? `Needs power ${def.needs}+` : def.kind === 'trigger' ? 'Makes power (10)' : 'Logic chip'}
        </div>
      </div>
      {def.rotatable && (
        <button class="icon-btn" title="Rotate (R)" onClick={() => session.actions.rotate()}>
          <IconRotate />
          {placingType && <span class="rot">{['E', 'S', 'W', 'N'][rot]}</span>}
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
        <div class="eyebrow">NIGHT 1 · {won ? 'SURVIVED' : 'OVERRUN'}</div>
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
