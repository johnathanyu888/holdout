# Holdout: demo-build plan (phases = code subsystems)

## Context
Holdout is a daily zombie-defense circuit puzzle (game_design.md) for the Reddit Game of the Day hackathon (Devvit Web), **due Dec 8, 2026**. We build the **smallest demo that plays well and looks clean**. Visuals come first and everything sits on the viewport. A second Claude agent works in parallel, but only **after the base** (a running viewport with basic functions) exists. Phases below are **chunks of code**, not days. Each phase lists what it contains, how it's built, what it depends on, and when it's done.

## Scope cuts (decided)
- **No seed/daily generation.** One fixed demo day on the prebuilt `art/maps/wilderness_map.svg`.
- **Frozen Lake and Volcano are cut entirely** (no slick ice, pressure ridges, lava fissure, steam vent). Their SVGs in `art/structures/` stay unused.
- Also cut: Conditions, Mutation abilities, lures, Stockpile carry-over, Blueprints, crafting, Radio, weekly boss, unlocks, missed days, salvage machines, doors, leaderboards.
- **"Pregenerated components are still computed":** hand-authored fixed data lives in one file (`demoDay.ts`); everything derived is computed by code at load: spawn schedule (a fixed seed constant through the real PRNG), flow fields, wall/wire sprite selection, power flood. *(My reading of your note; correct me if wrong.)*

## Stack
Phaser 3 from the official Devvit Phaser template (Vite + Express + TypeScript, Node 22). The sim is a pure-TS module with no Phaser, DOM or Devvit imports. UI chrome is a DOM overlay in Preact (~3 KB).

## Repository layout
```
src/shared/grid.ts          tile<->world math and constants
src/shared/types/           Contraption, DayConfig, SimState, SimEvent, PartDef, ZombieDef
src/shared/sim/core/        rng, grid, step(), power, events, hashState
src/shared/sim/parts/       one file per part, auto-registered
src/shared/sim/zombies/     one file per zombie, auto-registered
src/shared/demo/demoDay.ts  authored day data
src/client/core/            boot, scenes, loop, camera, input router, store, api
src/client/render/          map, entity layers, autotile, fx
src/client/views/           part/zombie/fx views, one file each, auto-registered
src/client/tools/           build tools, one file each, auto-registered
src/client/ui/              Preact HUD, tray, cards, tutorial
src/server/                 Express routes, Redis
art/  scripts/  tests/
```
Registries fill through `import.meta.glob`: adding a part, zombie, tool or view means **new files only, no edits to shared index files**. That's what lets two agents work without conflicts.

## Phase map and ownership
| # | Phase | Group | Depends on |
| --- | --- | --- | --- |
| 1 | Foundation and viewport | **Base** | none |
| 2 | Game loop, state and scenes | **Base** | 1 |
| 3 | Graphics and UX framework | **Base** (framework) → Track 1/2 (content) | 1, 2 |
| 4 | Circuit logic | **Track 1** | 2 (registries) |
| 5 | Zombies, pathing, walls, combat | **Track 2** | 2 (registries) |
| 6 | Materials, kit and Time Shop | **Track 1** | 3 |
| 7 | Raid flow, scoring and results | **Track 2** | 2, 5 |
| 8 | Server and persistence | **Track 2** | 2 |
| 9 | Tutorial and narrative | **Track 2** | 3, 7 |
| 10 | Integration, polish, ship | both | all |

**Status (branch `track-1`):**
- **Phase 4:** tripwire, delay and spike floor are in, with tests.
- **Directional pins:** a delay reads only its input side and writes only its output side.
- **Build preview:** passes constant power through chips.
- **Phase 6:** the Time Shop is in (parts and materials for build seconds).
- **Phase 3.7, part visuals:**
  - spikes retract and pop up
  - the delay blinks while it counts down
  - the tripwire twangs
  - tick power runs amber and constant power runs cyan
  - the inspector shows live power and the delay timing

**Base** = phases 1, 2 and the framework half of 3, plus a thin engine skeleton (2.5), so the viewport and basic functions run. **Track 1** (the machine) = phases 4, 6 plus part visuals/tools from 3. **Track 2** (the fight) = phases 5, 7, 8, 9 plus zombie visuals from 3. Each track has its own branch, rebases on `main` often, and tests alone in the sandbox scene, so neither waits on the other.

---

# PHASE 1: Foundation and viewport (Base)
**Contains:** scaffold, coordinates, asset pipeline, camera, input, tile picking.

**1.1 Scaffold and de-risk**
- `npm create devvit@latest --template=phaser`, restructure to the layout above, add vitest, eslint, prettier, strict TS.
- **Mock mode:** an `ApiClient` interface with `RedditApi` (real `/api/*`) and `MockApi` (in-memory plus `localStorage`), chosen by whether Devvit context exists. The game runs in a plain browser tab with `vite dev`, so visual iteration is instant.
- `devvit playtest` on a test subreddit, plus an upload of a ~5 MB placeholder atlas to learn Devvit's real client size and load limits (**unverified today**).

**1.2 Coordinates and constants (`shared/grid.ts`)**
- `TILE = 64`, `GRID = 24`, `MAP_PX = 2048`, `LAWN_ORIGIN = 256` (the lawn spans 256..1792 on both axes).
- `tileToWorld(x,y)` = `(256 + x*64 + 32, 256 + y*64 + 32)`; `worldToTile`; `inLawn`; `edgeTiles()` (the 92 ring tiles); `key(x,y) = y*24 + x`. Pure functions with tests (corners, edges, off-lawn).

**1.3 Asset pipeline**
- `scripts/bake-atlas.ts` (resvg or sharp) rasterizes SVGs at **2×** (96px viewBox → 192px) into two atlases: `parts` (parts, wire pieces, walls, materials) and `structures` (home, inlet, entry edge). The map is one 2048² texture, with a half-res fallback if memory is tight.
- Runtime keys come from file names (`wall_wood_ew_a`, `wire_tee`, `saw_blade`, `home`, `power_inlet`). Phaser's `load.svg` is allowed while iterating; the baked atlas is the shipping path.

**1.4 Camera and input**
- Phaser config: `Scale.RESIZE` into a full-viewport div, `roundPixels`, DPR capped at 2, WebGL with canvas fallback.
- `fit = min(vw, vh) / 1664` (≈0.25 on a phone, 16px a tile; ≈0.5 on a laptop); `maxZoom = 1.5` (96px a tile). Pan is clamped so the lawn never leaves the screen; `fitToMap()` on load and on orientation change.
- **Input router (one file):** 1 pointer = active tool; 2 pointers = pinch around the midpoint plus pan; wheel zooms toward the cursor; middle/right drag or Space+drag pans; tap-vs-drag threshold 8px; a "hand" toggle forces 1-finger pan. Tools never read raw input.
- **Tile picking:** pointer → `camera.getWorldPoint` → `worldToTile`, with a hover highlight.
- Debug overlay (toggle `~`): FPS, zoom, tile under cursor, entity count.

**Done when:** the real map renders crisply at fit and max zoom; pan and pinch are smooth (60 fps on a mid-range phone); tile picking is correct at every zoom; grid math tests pass.

---

# PHASE 2: Game loop, state and scenes (Base)
**Contains:** the store, scene flow, clocks, the two loops, the engine skeleton, persistence.

**2.1 Build store**
`BuildStore` is a tiny observable holding the `Contraption` (`house`, `parts[]`, `wires[]`, `walls[]`) plus kit and resource counters. Plain serializable JSON. `subscribe()` drives both the renderer and the UI. Mutations go through commands (place, remove, move, configure) on an undo/redo stack (max 100).

**2.2 Session and scenes**
- `GameSession` (global) carries the day, the store and the phase. Scenes: `Boot` (progress bar) → `Briefing` → `Build` → `Raid` → `Result`, with 200ms fades.
- `PhaseClock`: Build 240s, based on `performance.now`, paused while the tab is hidden. At 0 it locks building and starts the raid; Start Raid ends it early.

**2.3 Raid loop (fixed timestep + interpolation)**
```
update(_, dt): acc += min(dt, 100) * speed        // speed 1/2/4; clamp avoids a spiral after a hidden tab
               while (acc >= 100) { prev = cur; events = step(sim); fx.consume(events); acc -= 100 }
               render(prev, cur, acc / 100)        // lerp zombie positions; glows pulse on wall-clock time
```
The renderer is one-way (reads state, never mutates). Pause on `visibilitychange`; ~1s snapshots allow scrubbing.

**2.4 Sim step contract (10 Hz, integer tick)**
1. Spawn: release schedule entries with `tick ≤ now`.
2. Sense: plate occupancy, tripwire crossings, timers.
3. Power: clear both layers, flood from the inlet and active triggers; chips read the previous step's result (1-step latency, **needs your OK**).
4. Act: parts apply damage/effects in part-id order, emitting events.
5. Move zombies: field lookup → steer → separate → wall clamp/contact → breach check.
6. Cleanup: remove dead zombies and broken walls, mark the field dirty, `tick++`.

**Determinism rules:** own PRNG (sfc32 via a cyrb128-style hash), never `Math.random`; floats only through `+ - * /` and `sqrt` (no `sin/cos/atan2/pow` in the sim); stable iteration order (ids ascending); `hashState()` goldens on Node and headless Chrome, plus one manual iOS Safari check.

**2.5 Engine skeleton (thin slice for the tracks)**
`createSim`, `step`, `hashState`, the `PartDef`/`ZombieDef`/`SimEvent` types and glob registries; a minimal Shambler walking a flow field to the house; a plate and a saw wired to the inlet; breach and win/lose. A **sandbox scene** (`?scene=sandbox`) with scripted spawns and a paste-Contraption box lets each track test alone.

**Extension contracts**
```ts
PartDef<S>   { id, size, pins, needs, kind:'trigger'|'chip'|'action', initState():S,
               sense?, tick?, act? }                  // state lives in Map<partId, S>
ZombieDef    { id, hp, speed, radius, onTick?, onDeath? }   // extras in zombie.ext
PartView     { sprite(part, state), update(sprite, state, alpha) }
BuildTool    { id, onPointer(ctx), ghost(ctx), validate(ctx) }
SimEvent     discriminated union in one file; adding a variant is a one-line append
```

**2.6 Persistence**
Autosave the `Contraption` to `localStorage` (mock mode) and later `POST /api/save`; restore on reload.

**Done when:** you can walk through every scene, the Build clock runs and pauses, undo/redo works, and in the sandbox a placed plate + saw + wire kills a walking Shambler with a stable `hashState`.

---

# PHASE 3: Graphics and UX (framework = Base; content = tracks)
**Contains:** entity rendering, autotiling, ghosts, HUD, tray, FX, art gaps.

**3.1 Layers (bottom → top, as depth bands)**
ground map · entry-edge overlay · grid lines · wires · parts and structures (y-sorted) · walls · zombies (y-sorted) · FX · ghost/selection. Depth = `y*10 + layerOffset`.

**3.2 Entity renderer**
Diffs the store on each change and creates/updates/destroys sprites by id. Registered `PartView`s draw each kind.

**3.3 Autotiling**
- Wires: 4-neighbour mask → `straight / corner / tee / cross / end` plus rotation.
- Walls: n-e-s-w bitmask → one of 16 shapes, variant `(row*7 + col*13) % 3`, for wood and stone.

**3.4 Ghost preview and validation UX**
60% alpha sprite at the hover tile, green or red tint, and a tooltip reason ("out of Wire", "tile occupied", "too close to the edge"). One shared validation function (inside lawn, tile free, not the inlet, house-band rule, kit count, resources).

**3.5 Basic tools (Base)**
House (one only, tapping again moves it; the outer 2-tile band and the inlet are off-limits); generic Part placement with rotation (R or a button); Wire drag (orthogonal L-shaped snapping, larger delta first; 1 Wire per new tile, existing wire free); Wall placement; Erase with refunds; Undo/redo.

**3.6 HUD and tray (Preact)**
Top bar (phase, countdown); bottom tray (tool buttons with counts); Wire/Wood/Stone counters; zoom `+ / − / fit`; hand toggle; Start Raid; undo/redo. Responsive, tap targets ≥ 44px.

**3.7 Power and part visuals (Track 1)**
Baked additive glow overlays, pulse tween, brightness ∝ signal strength (no per-sprite blur on mobile), dull when unpowered, spin/flash/pop animations per part, delay tick ring, wire shimmer, part info card and the "needs N, has M" warning.

**3.8 Zombie and FX visuals (Track 2)**
Zombie sprite and walk/lean bob, facing derived on the client from velocity (the client may use `atan2`), hit flash, outlined damage numbers, squash-and-fade death, wall crack stages at 66% and 33%, breach alarm.

**3.9 Art gaps to fill**
Zombie sprites, UI icons and frames, ghost tints, FX sprites (hit flash, arcs, damage numbers), glow overlays, briefing/result cards.

**Done when:** the build screen reads as finished at phone size (shape and colour identify every part, powered state is obvious), holds 60 fps with a full board, and every part/zombie has a view.

---

# PHASE 4: Circuit logic (Track 1)
**Contains:** power flood, triggers, chips, killers (sim + tests; views from 3.7).

**4.1 Power flood**
- Two layers per step: `constStrength[576]` and `tickStrength[576]`.
- Bucket queue from strength 15 down, keeping the **max per tile**. A wire tile adjacent to a source of strength S gets **S − 1**, then −1 per further wire tile; 0 stops. A part adjacent to a wire receives that wire's strength. (*My reading of "−1 per tile"; confirm.*)
- Tee and cross connect all four neighbours and branches count down independently. A part works when the strength on its layer ≥ `needs`; constant dominates when both layers arrive.
- `powerPreview(day, contraption)` floods from the inlet only; it's what the build-time wire glow uses.

**4.2 Triggers**
| Part | Spec |
| --- | --- |
| Pressure plate | Const 10 while ≥1 zombie centre is in its tile; stays on ≥ 5 steps after the last zombie leaves. |
| Tripwire | Tick 10 for 5 steps. Cord on one edge of its tile (rotatable); fires when a zombie's position segment (previous → current) crosses the cord line inside the tile span (sign-change test, no trig). Re-arms 10 steps after firing. |
| Delay | Pins left (in) → right (out). Two ring buffers of booleans (const and tick layers), length ≤ 20; output = input `d` steps ago, `d` = 5/10/20. This keeps the kind and refreshes strength to 10. |

**4.3 Killers**
| Part | Needs | Behaviour |
| --- | --- | --- |
| Saw blade | 2 | `idle → spinUp (2 steps) → cutting`. Const: **6 damage per step per zombie on its tile (60 DPS)**. Tick: one 5-step cutting window (≈30). |
| Spike floor | 2 | Tick: one punch at the rising edge, **45 damage** to zombies on the tile, 10-step cooldown. Const: spikes held up, **2 damage per step (20 DPS)** and a **50% speed multiplier** for zombies on the tile. |
A Shambler (100 HP, ~1.1s a tile) takes ~66 from one const saw; two in a row kill it, as the doc says.

**4.4 Events and tests**
`partFired` and `hit` events drive the visuals. Vitest: falloff along paths of every length, branching, plate hold, tripwire crossing (including diagonals), delay timing and kind preservation, saw DPS over N steps, spike cooldown and slow; plus a sandbox scenario per part.

**Done when:** plate→saw and tripwire→delay→spike work, the live preview matches the real flood, and all part tests pass.

---

# PHASE 4b: Power rework, new parts, rocks (Track 1)
**Why:** the always-on inlet let players skip sensors and routing. It now stays useful but can't run a whole defense.
- **Inlet:** strength 15 → 6; powers at most 3 action parts (the 3 it reaches strongest, ties by part id), fixed for the raid from the build preview. Inlet blink mode removed.
- **Power origin:** floods are split into inlet power and sensor power. Chips pass the origin on (a delay remembers it per step, a latch from what set it). Only inlet-origin power is capped.
- **Strength → damage and wear:** damage × strength ÷ 9; wear += damage × strength ÷ 9; a part past its durability is worn out for the raid. Needs drop (saw 1, spikes 1, tesla 3, piston 1) so weak power still works, just softly.
- **Piston:** action, rotatable. On power arriving it shoves zombies on the tile in front one tile on (20 damage if a wall or rock is in the way). 1s cooldown.
- **Latch:** chip, rotatable. Set on the back pin, reset on the side pin, steady power out the front.
- **Rocks:** `DayConfig.obstacles`. Block zombies, parts and wire. Tap to clear for 0:30 of Build time.
- **Veteran build:** a ready-made build on the briefing for the demo (next).
- **Next after this:** zombies that learn (avoid tiles where others died).

**Done when:** tests cover the load cap, origin through chips, damage/wear scaling, piston pushes, latch set/reset and rocks blocking paths; the build preview shows which parts the inlet powers.

---

# PHASE 5: Zombies, pathing, walls, combat (Track 2)
**5.1 Zombie model and roster**
State: `id, type, x, y` (tile-unit floats), `hp`, `vx, vy`, `state: walking|bashing|dead`, `slowMul`, `lastWallHit: Map<wallId, tick>`, `ext`. Roster: **Shambler** 100 HP, 0.9 tiles/s, r 0.3; optional **Runner** 60 HP, 1.8 tiles/s. A fixed demo Mutation card is a stat multiplier with no ability. Dead zombies are removed next step with a `death` event.

**5.2 Spawn schedule (computed)**
Built once at load from `demoDay.spawnSeed` through the PRNG as `{tick, edgeTile, type}`. Groups of 2–3 trickle roughly every 25 steps from step 10, over ~25s, from random edge tiles on **all four sides** (optional side weights). About 16–24 zombies. It is independent of the build, so every player faces the same raid.

**5.3 Pathing**
- **Flow field:** integer Dijkstra from the house cell (10 straight, 14 diagonal), 8 neighbours, no corner cutting (a diagonal needs both orthogonal neighbours free). Blocked = wall HP > 0; parts, wires and the inlet are walkable. Recomputed only when walls or the house change.
- **Fully enclosed house:** walls become passable at cost `20 + hp/10` (the bash field). A zombie entering a wall cell stops (`bashing`) and deals **20 HP/s** to it.

**5.4 Movement and crowding**
Per step: lowest-cost neighbour → steer at `speed * 0.1s * slowMul` using `+ - * /` and `sqrt` → separation (pairs closer than 0.5, in id order, each pushed half the overlap) → wall clamp (a centre inside a blocked cell is pushed to the nearest edge) → breach check.

**5.5 Walls**
Wood 120 HP (3 Wood), stone 300 HP (3 Stone). **Contact rule (needs your OK):** 4 HP damage, at most once a second per zombie, whenever a zombie circle (r 0.3) overlaps the wall tile *expanded by 0.25*. With strictly thin hitboxes a zombie walking down the adjacent tile never touches the wall (0.5 + 1/6 gap), so the doc's "walls wear down on contact" would almost never happen. At 0 HP the wall is removed, emits `wallBroken`, and dirties the field.

**5.6 Breach, win, lose**
Breach = a zombie centre within 0.5 tile of the house centre; the raid ends at once. Win = all spawns released and all zombies dead. Cap 45s (450 steps); survivors then count as a loss.

**5.7 Tests**
Pathing around walls, enclosed house → bash field, contact cadence, separation, spawn determinism, breach edge cases.

**Done when:** the full demo roster spawns on all four sides, walks around walls, wears them down, and breaches or dies correctly with stable hashes.

---

# PHASE 6: Materials, kit and Time Shop (Track 1)
**6.1 Resources**
- **Wire** (1 per wire tile), **Wood** and **Stone** (3 per barricade). **Gears** (upgrade: +25% damage or +1 range, one per part) and **Scrap** (Time Shop discount) are optional extras.
- Starting kit (tunable guess): Plate ×4, Tripwire ×3, Delay ×2, Saw ×3, Spike ×3, Wire 60, Wood 12.
- Counters live in the store; placing spends and erasing refunds exactly the same amount (tested).

**6.2 Time Shop (optional)**
Spend seconds from the Build clock on extra parts: Saw 20s, Spike 15s, Plate 10s, Tripwire 8s, Delay 8s. The panel shows the price and the clock after purchase; refunds are not allowed.

**6.3 Tray UX**
Counts on every tool button, a disabled state with a reason when out of stock, and a low-resource warning.

**Not in demo:** Stockpile carry-over, blueprints, crafting recipes.

**Done when:** every build action spends/refunds correctly, the tray reflects it, and over-spending is impossible.

---

# PHASE 7: Raid flow, scoring and results (Track 2)
**7.1 Raid scene**
1×/2×/4× and pause; ~1s snapshots for the scrubber; camera presets (fit-all, follow-action).
**7.2 Fail view**
On breach, pause at the breach step, draw the breaching zombie's route, outline the nearest part that didn't fire with the reason ("unpowered", "needs 2, had 1"), and show a caption.
**7.3 Briefing and Result**
Briefing: Mutation card, kit summary, inlet and entry-edge highlights. Result: score breakdown, stars, a restart button.
**7.4 Scoring and stars**
Score applies only on survival and adds: clear speed + time left on the Build clock + unused kit parts + unused raw materials + wire efficiency + undamaged walls, each term capped, weights in `demoDay` (**open**). Stars: 1★ survive; 2★ ≥ 70% of par; 3★ beat par.

**Done when:** a full run produces the right score and stars, and the fail view points at a real cause.

---

# PHASE 8: Server and persistence (Track 2)
- `GET /api/init` → `{ day, bestScore, stars }`; `POST /api/submit` → validates shape and kit limits, stores the best in Redis (`user:{id}:demo`, sorted set `demo:scores`), returns stars; `POST /api/save` for the Contraption.
- Idempotent per user, request size cap. **Stretch:** re-simulate the `Contraption` with the shared sim and compare the hash.
- Mock mode mirrors all three endpoints.

**Done when:** a score submitted in a playtest post persists and comes back on reload.

---

# PHASE 9: Tutorial and narrative (Track 2)
A typewriter narrator and a finger-pointer that targets tile rectangles from `grid.ts`. The Night 1 script is rewritten for the open map (no lanes): house → plate → saw → wire → wait → a zombie slips past and wears a wall → result. A skip rule: first run only. The fixed Mutation card and a single Radio line on the Result screen.

**Done when:** a new player can complete a first raid with no outside help.

---

# PHASE 10: Integration, polish, ship (both)
- Merge both branches and run every sandbox scenario against the real raid; check cross-feature cases (saw beside a wall, tripwire on a wall line, plate under crowding); confirm the power preview equals the sim's flood.
- Balance the day: kit counts, zombie count, spawn rhythm, par.
- FX/audio pass; perf on a low-end phone (60 fps with a full board and ~24 zombies); colour-blind-safe power states; orientation handling.
- **iOS Safari determinism check**, plus playtest on iOS and Android.
- Publish the app, create the launch post, write the README, record the demo video. Stop adding features before this phase.

---

## Doc fixes (done with Phase 1)
Trim Frozen Lake/Volcano from §3 and §11; rewrite the §7 Night 1 script for an open map; fix the §3.2 formatting glitch and the broken wall bullets/table in §4.2d.

## Demo day data (`demoDay.ts`, authored with the user)
Power inlet tile; allowed house area (default: outer 2-tile band off-limits); kit; zombie roster and count; `spawnSeed`; score weights and par; the Night 1 script.

## Open decisions to confirm
1. Wall contact rule (wider zone, 5.5).
2. Chip 1-step latency (2.4).
3. "−1 per tile": is the first wire tile S−1 (my choice) or S?
4. Raid cap 45s, ending early when clear?
5. Inlet tile and allowed house area on your map (I can read the SVG, or you give coordinates).
6. Time Shop in the demo (Phase 6.2), or a fixed kit only?
7. Score weights.
8. Confirm my reading of "pregenerated components should be computed".

## Verification
- **Phases 1–3:** manual pass on desktop (mouse/wheel) and phone (pinch/pan) at three viewport sizes; unit tests for grid math, autotile, wire path, validation, undo/redo.
- **Phase 2.5:** the plate→saw→kill sandbox scenario; golden hashes match on Node and headless Chrome.
- **Phases 4–8:** vitest per feature plus a sandbox scenario each.
- **Phase 10:** a known `Contraption` yields the same result hash on client and server; play the demo from a Reddit post on a phone.
