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
  IconSelect,
  IconUndo,
  icon,
} from './icons';

export function App() {
  const phase = useObs(session.phase);
  if (phase === 'boot') return null;
  return (
    <>
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

function Tray() {
  const tool = useObs(session.tool);
  const c = useObs(session.store.contraption);
  const inv = session.store.inventory;
  const { day } = session;
  const pick = (id: string) => session.tool.set(tool === id ? 'select' : id);
  const parts = Object.keys(day.kit);

  return (
    <div class="tray-wrap">
      <div class="tray" role="toolbar" aria-label="Build tools">
        <ToolBtn id="select" label="Select" cur={tool} onPick={pick}>
          <IconSelect />
        </ToolBtn>
        <ToolBtn id="house" label="House" cur={tool} onPick={pick} badge={c.house ? '✓' : '!'} alert={!c.house}>
          <img src={icon('home')} alt="" />
        </ToolBtn>
        <div class="tray-sep" />
        {parts.map((type) => (
          <ToolBtn
            key={type}
            id={`part:${type}`}
            label={SHORT[type] ?? partLabel(type)}
            title={partLabel(type)}
            cur={tool}
            onPick={pick}
            count={inv.parts[type] ?? 0}
          >
            <img src={icon(type)} alt="" />
          </ToolBtn>
        ))}
        <div class="tray-sep" />
        <ToolBtn id="wire" label="Wire" cur={tool} onPick={pick} count={inv.materials.wire}>
          <img src={icon('wire_straight')} alt="" />
        </ToolBtn>
        {day.materials.wood > 0 && (
          <ToolBtn id="wall:wood" label="Wood" title="Wood wall (3 Wood)" cur={tool} onPick={pick} count={Math.floor(inv.materials.wood / WALL_COST)}>
            <img src={icon('wall_wood_ew_a')} alt="" />
          </ToolBtn>
        )}
        {day.materials.stone > 0 && (
          <ToolBtn id="wall:stone" label="Stone" title="Stone wall (3 Stone)" cur={tool} onPick={pick} count={Math.floor(inv.materials.stone / WALL_COST)}>
            <img src={icon('wall_stone_ew_a')} alt="" />
          </ToolBtn>
        )}
        <ToolBtn id="erase" label="Erase" cur={tool} onPick={pick}>
          <IconErase />
        </ToolBtn>
      </div>
      <button class="start-btn" onClick={() => session.actions.startRaid()} disabled={!c.house && session.mode === 'sandbox'}>
        <span>Start raid</span>
        <IconPlay />
      </button>
    </div>
  );
}

function ToolBtn(p: {
  id: string;
  label: string;
  title?: string;
  cur: string;
  onPick: (id: string) => void;
  count?: number;
  badge?: string;
  alert?: boolean;
  children: preact.ComponentChildren;
}) {
  const empty = p.count !== undefined && p.count <= 0;
  return (
    <button
      class={`tool ${p.cur === p.id ? 'active' : ''} ${empty ? 'empty' : ''}`}
      title={p.title ?? p.label}
      aria-label={p.title ?? p.label}
      aria-pressed={p.cur === p.id}
      onClick={() => p.onPick(p.id)}
    >
      <span class="tool-icon">{p.children}</span>
      <span class="tool-label">{p.label}</span>
      {p.count !== undefined && <span class="count">{p.count > 99 ? '∞' : p.count}</span>}
      {p.badge && <span class={`count ${p.alert ? 'alert' : 'ok'}`}>{p.badge}</span>}
    </button>
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
            <b>{won ? '★' : '☆'}</b>
            <span>{won ? '1 star' : 'no stars'}</span>
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
