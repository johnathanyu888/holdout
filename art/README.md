# Art

io style with light shading: thick `#25282C` outlines, two or three flat tones per shape, a small top-left highlight, a soft drop shadow (rules in `game_design.md`, section 2). All art is hand-written SVG.

## Folders

| Folder | What's in it |
| --- | --- |
| `map/` | `world_map.svg`: the square world map. The homestead sits in the middle of the woods; Dead City, Jade Temple, Ironroot Caves, Scorched Dunes and the Scrapyard sit around it. |
| `map/src/` | `map_template.svg`, `forest.svgfrag`, `build.ps1`: run `build.ps1` to rebuild `world_map.svg`. |
| `regions/` | One zoomed-in scene per region (1000×700): `01_wildwood`, `02_dead_city`, `03_jade_temple`, `04_ironroot_caves`, `05_scorched_dunes`, `06_scrapyard`. `index.html` shows all six. |
| `regions/src/` | Scene sources and `build.ps1`: run it to rebuild the scenes. `build.ps1 -WithUI` also draws the HUD, the white "tap me" flash and a details card (for mockups). |
| `icons/materials/` | The 8 raw materials (128×128). |
| `icons/craftables/` | The 12 craftable items (128×128). |
| `icons/consumables/` | Bandage, repair kit, firecracker (128×128). |
| `icons/` | `preview.html` (the materials and craftables tables with icons), `sheet.html` (every icon at full size). |
| `kit/` | `kit2.svgfrag`: the shared asset kit (trees, rocks, crates, barrels, logs, textures). Both build scripts paste it in. |

## Searchable objects in the region scenes

Every object the player can search is its own group with an id starting `o_` (for example `o_bus`, `o_guardian`, `o_vines`). The game makes these flash white to hint that they can be tapped, and only shows the details (search time, possible loot, danger) after a tap. The scenes themselves carry no UI.

Indoor scenes (`03_jade_temple`, `04_ironroot_caves`) have a dark vignette at the edges; outdoor scenes don't.
