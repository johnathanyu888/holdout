# Art

Flat io style: thick `#25282C` outlines, two or three flat tones per shape, no blur or fake 3D. All art is hand-written SVG, top-down, on a 64px tile grid.

## Folders

| Folder | What's in it |
| --- | --- |
| `maps/` | `wilderness_map.svg` is **the engine base map**: 2048×2048 (32×32 tiles of 64px). The 24×24 gridded lawn at x/y 256..1792 is the play area; the forest around it is scenery. It's standalone (no external files). The game draws the day's structures, the house and the zombies on top. Tile `(col,row)` has its top-left at `256 + col*64, 256 + row*64`. |
| `maps/` (mockups) | `grass_mockup.svg`, `grass_mockup_big.svg`, `frozen_lake_mockup.svg`, `volcano_mockup.svg`: look-and-feel mockups with sample structures placed (they link to `../structures/`). |
| `structures/` | The fixed map features the game places each day: `home` (the survivor's 1×1 steel shelter), `power_inlet`, `live_cable`, `fuel_tank`, `broken_crusher`, `blast_door`, `entry_edge`, and the terrain pieces `slick_ice`, `pressure_ridge`, `lava_fissure`, `steam_vent`. 1×1 pieces use a 96px canvas. `preview.html` shows them all. |
