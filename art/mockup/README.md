# Mockup art (vector)

Vector versions of every element in the io-style mockup ("io style with light shading"). Style rules are in `game_design.md`, section 2.

Every sprite follows the same recipe: soft drop shadow (offset 4,5, black ~28%, blur ~2) → flat base colour → shadow tone (black ~15%, offset down-right, clipped) → highlight (white ~20%, top-left) → `#25282C` outline on top.

## Files

| Group | Files |
| --- | --- |
| Characters | `survivor.svg`, `zombie.svg`, `zombie_runner.svg`, `zombie_brute.svg` |
| Scenery | `tree.svg`, `bush.svg`, `house_red.svg`, `house_blue.svg`, `car_red.svg`, `car_blue.svg`, `picket_fence.svg` |
| Props | `tire.svg`, `barrel.svg`, `scrap_piece.svg` |
| Base | `main_hall_generator.svg`, `wall_wood_h.svg`, `wall_wood_v.svg`, `wall_scrap_v.svg`, `sandbag.svg` |
| Contraptions (mockup only, now Expansion) | `launcher.svg`, `saw_blade.svg`, `battery.svg`, `oil_puddle.svg`, `flame.svg` |
| Ground | `tile_grass.svg`, `tile_road_v.svg`, `ground_junkyard.svg` |
| Effects | `fx_glow_warm.svg`, `fx_glow_fire.svg`, `fx_glow_electric.svg`, `fx_electric_bolt.svg`, `fx_loot_sparkle.svg`, `fx_selection_ring.svg`, `fx_motion_arcs.svg`, `fx_damage_number.svg`, `fx_fog_edge.svg` |
| UI | `ui_kit.svg` (day and night top bars, hours pips, Flare button, site card, inventory bar, speed buttons) |

## Notes
- Characters face right (+x). Rotate in the engine for direction.
- Glow sprites are meant for additive blending on top of the night overlay.
- Night overlay is not a file: fill the screen with `#101A34` at 55% opacity, then draw the glows.
- Text in `fx_damage_number.svg` and `ui_kit.svg` is a reference only; render real text in the game.
- Demo items not in the mockup (stone wall, metal wall, spikes, bear trap, tripwire, pressure plate, swinging log, falling rocks, net drop, tin can rattle, torch, Workshop) still need drawing in this style.
