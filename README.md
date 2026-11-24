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

URL flags: `?debug` shows the debug readout (toggle with the `` ` `` key), `?gallery` lays every baked sprite out on the lawn, `?api=mock|reddit` forces the API mode.

## Controls (Phase 1)

| Input | Action |
| --- | --- |
| Drag (1 finger / left mouse) | Pan |
| Pinch (2 fingers) / mouse wheel / trackpad pinch | Zoom toward the fingers or cursor |
| Middle or right drag, Space + drag | Pan |
| Tap / click | Select a tile |
| `F` or `0` | Fit the whole lawn |
| `+` / `-` | Zoom in / out |
| `H` | Hand mode (drags always pan) |
| `` ` `` | Debug readout |

## Layout

```
src/shared/      grid math, shared types (client + server + sim)
src/client/      Phaser game (core/ camera, input, api; scenes/; render/)
src/server/      Devvit server (later phases)
scripts/         bake-atlas.ts: SVG -> map chunks (2x) + sprite atlases (2x)
art/             SVG sources
tests/           vitest
```

Baked textures go to `src/client/public/assets/` (generated, not committed).
