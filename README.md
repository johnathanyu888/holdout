# Holdout

A daily zombie-defense circuit puzzle for Reddit (Devvit Web). Design: [game_design.md](game_design.md).

## Run it

```
npm install
npm run dev        # bakes the art, then serves at http://localhost:5173 (mock API, no Reddit needed)
npm test           # vitest
npm run build      # typecheck + production build to dist/client
npm run bake -- --force   # re-rasterize every SVG
```

URL flags:

| Flag | What it does |
| --- | --- |
| `?sandbox` | Sandbox day: unlimited kit, no clock, spawn zombies by hand, paste/copy contraption JSON |
| `?debug` | Debug readout (toggle with the `` ` `` key) |
| `?gallery` | Every baked sprite laid out on the lawn |
| `?api=mock\|reddit` | Force the API mode |

In dev, `window.__holdout` exposes `{ game, session }` for console debugging.

## Controls

| Input | Action |
| --- | --- |
| Tap / click | Use the active tool (place, select) |
| Drag | Wire / wall / erase tools: lay a path. Other tools: pan |
| Pinch (2 fingers) / wheel / trackpad pinch | Zoom toward the fingers or cursor |
| Middle or right drag, Space + drag | Pan |
| `R` | Rotate the part being placed, or the selected part |
| `W` / `E` / `Esc` | Wire tool / erase tool / back to select |
| `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`) | Undo / redo |
| `F` or `0`, `+` / `-` | Fit, zoom |
| `H` | Hand mode (drags always pan) |

## How it fits together

```
src/shared/            plain TS, used by client + server
  grid.ts              tile <-> world math
  types/               Contraption (the build), DayConfig, API shapes
  build/               build rules (place/erase/validate, costs) + wire paths
  demo/demoDay.ts      the one authored day (+ sandbox day)
  sim/                 deterministic raid sim (10 steps/s)
    core/              rng, power flood, flow field, spawn schedule, step()
    parts/*.ts         one file per part (auto-registered)
    zombies/*.ts       one file per zombie type (auto-registered)
src/client/            Phaser 3 game + Preact HUD
  core/                camera, input router, store (undo/redo), session, raid runner, clock
  render/              entity layer, zombies, fx, ghost previews, autotiling
  views/parts/*.ts     how each part draws (auto-registered; default = atlas frame by type)
  tools/               build tools (house, part, wire, wall, erase, select)
  ui/                  Preact HUD (top bar, tray, briefing, raid bar, result, sandbox)
  scenes/              Boot (load) and World (map, phases)
scripts/bake-atlas.ts  SVG -> 3x3 map chunks (2x) + forest-ring chunks (0.5x) + sprite atlases (2x) + UI icons
scripts/forest.ts      widens the map's forest by 768px each side (copies of its own trees);
                       the game shades it into dark woods (src/client/render/woods.ts), so tall or
                       wide screens can zoom out to the whole lawn without showing past the trees
art/                   SVG sources (art/zombies/ added for zombie sprites)
tests/                 vitest
```

**Adding a part:** create `src/shared/sim/parts/<type>.ts` (calls `registerPart`), optionally
`src/client/views/parts/<type>.ts` (calls `registerPartView`), and give it a kit count in
`demoDay.ts`. No shared lists to edit. Part types without a registered sim def are inert.

**Determinism rules** (everything in `src/shared/sim`): integer `tick` only, randomness only
from the state's PRNG, floats only via `+ - * /` and `sqrt`, stable iteration order, plain-data
state. `hashState()` checks it in the tests.

Baked textures go to `src/client/public/assets/` (generated, not committed).
