# Holdout — Game Design (demo scope)

Working name. Reddit Game of the Day hackathon (Devvit Web), due Dec 8, 2026.
This file covers the proof-of-concept demo. Bigger ideas are in **Expansion** (section 12).

---

## 1. Concept

- Solo zombie survival on Reddit: build a fort, survive one raid per day
- Your base is saved; your score is how many nights it has survived
- Everyone faces the same daily Mutation and map seed, so players can compare and talk
- Not a shooter, and no direct character control: strategy, not aim
- You never walk anywhere: you teleport (costs time), and during the raid you hide

## 2. Art style

Reference: the second io-style mockup ("io style with light shading"). One step more detailed than a flat io game, well short of realistic.

### 2.1 Summary
- Top-down camera, straight overhead, fixed (no rotation, no perspective)
- Bright, saturated, friendly colours, even at night; scary through situation, not gore
- Every object = a simple chunky shape + thick dark outline + one shadow tone + one highlight + a soft drop shadow
- Readable at phone size: shape and colour tell you what something is before any detail does

### 2.2 The rendering recipe (applies to every object)
1. **Drop shadow:** the object's silhouette, offset down-right (about 4px right, 5px down at 1x), black at ~28% opacity, softened with a ~2px blur. Light always comes from the top-left.
2. **Base fill:** one flat, saturated colour.
3. **Shadow tone:** inside the shape, a copy of the shape shifted down-right by ~35% of its size, black at ~15% opacity, clipped to the object. This makes things look rounded without gradients.
4. **Highlight:** a small circle (about a third of the object's size) in the upper-left, white at ~20% opacity. Rectangles get a thin light strip along the top edge instead.
5. **Outline:** dark charcoal `#25282C`, drawn last, on top. Line width 2.5px for most objects, 3px for big ones (trees, buildings), 2px for small ones (hands, icons). Round joins, never sharp.

### 2.3 Palette
| Use | Colour |
| --- | --- |
| Outline (everything) | `#25282C` |
| Grass base | `#7CC35A` |
| Grass dots / tufts | `#6DB24C`, `#8BD067`, `#72B951` |
| Trampled dirt (around the base) | `#B9A27C` at ~45% over grass |
| Tree canopy / inner / top highlight | `#3F8F37` / `#56A947` / `#6FBF5A` |
| Bush | `#4EA341` |
| Wood (planks, logs, spikes) | `#B07A45`, seams `#3C230F` at ~60% |
| Stone | `#9A9A94` to `#B5B5AE` |
| Scrap metal | `#9AA3AD`, rust spots `#AA5A28` at ~50% |
| Rope / cloth | `#D8C08C` / `#C9783E` |
| Main Hall core glow | `#FFB02E`, centre `#FFF4C2` |
| Survivor (player) | shirt `#4A7FC9`, skin `#F2C48D`, cap `#2F4A6E`, backpack `#7A5232` |
| Zombie | skin `#8FC46A`, eyes `#25282C`, stains `#5A281E` at ~55% |
| Road / sidewalk / lane dashes | `#55585C` / `#A7A191` / `#F0D36A` |
| Accent red (roofs, cars, warnings) | `#D0624F` |
| Accent blue (roofs, cars) | `#5D8FC9` |

### 2.4 Ground and map
- **Grass:** flat green base, scattered with ~900 small round dots in 3 nearby greens (1.5–4.5px), plus ~80 tiny two-blade tufts. Subtle texture, never noisy.
- **Dirt patches:** soft, low-opacity brown ellipses under the base and along paths where zombies walk.
- **Roads:** dark grey asphalt with faint light and dark specks, outlined edges, a sidewalk strip each side, rounded yellow lane dashes.
- **Sites (Day map):** each site sits on its own ground patch with a dashed outline (e.g. the Junkyard is a sandy rectangle with a dashed charcoal border) so tappable areas read clearly.
- **Fog of war:** unexplored areas fade to dark slate (`#1E2630` at ~80–90%) with a large faint "?".

### 2.5 Characters
- **Shape:** a top-down circle body (radius ~12px at 1x) with two small circle hands (radius ~4.5px). No legs.
- **Survivor (you):** hands close to the body, blue shirt, round skin-tone head inside the body circle, dark cap on the back half, small brown backpack rectangle behind. Faces the way they last moved.
- **Zombie:** same body plan, but green-skinned all over, hands stretched far forward (arms out, the classic zombie reach), two dot eyes, one dark stain. Slight size and shade variation between zombies so a horde doesn't look copy-pasted.
- **Brute:** ~1.4× bigger, darker green, heavier outline (3px).
- **Runner:** ~0.85× size, lighter green, leaning forward (body squashed slightly in the direction of travel).

### 2.6 Objects
- **Walls:** rounded rectangles filling one tile.
  - Wood: plank seams every ~20px, a nail dot here and there
  - Stone: 3–4 irregular rounded blocks per tile with mortar lines
  - Metal: grey with thin horizontal ridges and 1–2 rust spots
- **Damaged walls:** cracks (short dark zigzags); broken = splinters scattered around the tile.
- **Spikes:** a cluster of small wooden triangles pointing up, each outlined.
- **Bear trap:** a grey ring with tooth notches; snaps shut (two half-rings) when triggered.
- **Tripwire:** a thin wire line between two small posts; it glows faintly when wired into a circuit.
- **Pressure plate:** a square wooden plate with a gear icon in the middle.
- **Wire tiles:** a thin copper-coloured line (`#C87533`) with an outline, running tile to tile; it pulses bright when the circuit fires.
- **Swinging log:** a fat outlined log hanging from a rope; swings with a white motion arc.
- **Falling rocks:** a rope-tied bundle of 3 grey rocks; drops with a dust puff.
- **Net drop:** a rolled net; unrolls into a crosshatch grid over 2 tiles.
- **Tin can rattle:** a few small grey cans on a string; white sound rings pulse out of it.
- **Torch:** a wooden stick with a cloth top and a small layered flame (orange outline, yellow centre).
- **Main Hall:** a chunky building (or generator box) in grey with a glowing orange core visible on top. The core glow shows its health: bright when healthy, flickering when low.
- **Workshop:** a small wooden shed with a saw and hammer icon on the roof.
- **Scenery:** round trees (3 overlapping greens, extra-thick outline), bushes, houses as flat roof rectangles with a ridge line and chimney, cars as rounded rectangles with dark windows and rust spots.

### 2.7 Day vs night
- **Day:** full colour, plus a very faint warm overlay (`#FFDC96` at ~5%).
- **Night:** the whole scene gets a dark blue overlay (`#101A34` at ~55%). Colours stay recognisable; it's dusk-dark, not pitch black.
- **Light sources** are drawn on top with soft additive glows:
  - Main Hall: warm yellow-orange, large radius (~120px)
  - Torches: orange, medium radius (~90px); flicker slightly
  - Firecracker: a brief white-yellow flash
- **Light matters for gameplay:** zombies drift toward light, so the glows show the player where zombies will go.
- **Fog Mutation:** smaller glow radii and a light grey haze.

### 2.8 Effects
- **Damage numbers:** bold white text with a 3px dark outline, floating up and fading (e.g. "-34").
- **Hits:** the zombie flashes white for a frame, then gets knocked back.
- **Defeated zombies:** fall over (squash flat), fade out. No blood or gore.
- **Motion:** white curved arcs behind swinging and falling things.
- **Noise:** expanding white rings from lures and the Main Hall's hum.
- **Loot:** small yellow sparkle crosses with a soft glow on searchable spots.
- **Selection:** a dashed yellow ring (`#FFE066`) around the selected site or tile.
- **Teleport:** a quick white flash + ring at the start and end points (replaces the walking path shown in the mockup).
- **Hiding spot:** a small dashed eye icon on the chosen tile; it turns red if zombies get close.

### 2.9 UI (HUD)
- **Panels:** dark slate (`#1C242E` at ~88%), corner radius 12px, 2.5px charcoal outline, floating over the game (top bar + bottom bar).
- **Text:** bold, rounded sans-serif in white; secondary text `#A9BCCF`. Big numbers get a dark outline like the damage numbers.
- **Hours bar:** 12 rounded pips; filled = yellow `#FFD34D`, spent = slate `#3E4C5C`, each with an outline.
- **Main Hall health:** a rounded bar, fill orange `#FF7A3D`.
- **Buttons:**
  - pill-shaped with an outline
  - primary = orange `#FF7A3D` with white text
  - selected = yellow `#FFD34D` with dark text
  - others = slate
- **Inventory / consumable slots:** rounded squares in slate, item icons drawn in the same outlined style as the world.
- **Site card:** a small panel next to the site: name, cost in yellow ("Search 2h"), danger level, loot icons.
- **Rule:** nothing in the HUD except the hours bar, inventory and context buttons during play. Everything else waits for Dusk or the result card.

### 2.10 Mockup items not in the demo
- The mockup showed an oil fire, an electric fence, sandbags, a car wreck, a saw blade, a battery and extra survivors. These are **Expansion** items now; keep their look (same recipe) for when they return.

## 3. Daily loop (~4 min)

**Dawn (~10s)**
- Today's Mutation + which edges the zombies come from

**Day (12 Hours)**
- Hours drain on their own: 1h per 20s while you're on the map
- Tap a site → teleport there (1–3h by distance) → search (1–2h)
- Crafting at the Workshop costs 1–2h
- Clock pauses: menus, minigames, post scrolled off-screen / tab hidden
- Flare: 1 free teleport per day once 6h are gone *(open: keep or drop, see section 13)*

**Dusk (no timer)**
- Hours hit 0 → you're teleported home automatically
- Place walls, traps, circuits, lures, torches
- **Pick your hiding spot:** any open tile inside the base

**Raid (30–60s, automatic)**
- Zombies spawn at the named edges, move toward noise and light, then the Main Hall
- Traps and circuits fire on their own
- Consumable tray (3 slots) for a quick tap; the raid slows for a moment when you tap
- Speed buttons: 1x / 2x / 4x / skip
- **Lose the night if** the Main Hall falls **or** zombies reach your hiding spot *(open: how harsh being found is)*

**Result card**
- Night #, Main Hall %, zombies stopped, streak
- Share / comment
- Tomorrow's teaser

## 4. Night 1: story intro

- Whispered, typewriter-style narrator; one line at a time
- Each line = one mechanic, and the player does it right away
- About 90s to the first result card; can't be skipped on the first play, skippable after
- Script:
  1. *(black screen, distant groans)* "Shh. They're coming."
  2. "They're drawn to sound. So be quiet." → fade in on the Main Hall
  3. "You have 12 hours. Gather your materials." → hours bar appears and starts draining
  4. "Everything costs time. Spend. It. Wisely." → tap the Junkyard; teleporting costs 2h
  5. "Junk is all we have. Make it count." → wire, rope and wood pop out
  6. "Put it together. See what happens." → Workshop shows "???"; build tripwire + swinging log
  7. "The sun's going down. Get home." → auto-teleport home
  8. "Build. Then hide." → ghost outlines show where to place things; pick a hiding spot
  9. "Here they come. Don't make a sound." → raid: 5 Shamblers, the swinging log fires
  10. "You made it. One night." *(beat)* "They'll be back. Faster." → result card, Runners teased
- The narrator comes back for 1 line on each first-time event ("That one's heavy. Walls won't hold it.")

## 5. Missed days

- The base pauses: no raids, no damage, no decay
- Come back exactly where you left off, facing *today's* Mutation
- **Lost:** your streak, and that day's unique daily
- Missed days don't add to the community boss target; a boss that unlocked while you were away stays playable for its 48h window
- **Unique daily ideas (undecided):**
  - Daily Find: a rare item at one site, that day only
  - Streak currency, with bonuses at 3 / 7 / 14 / 30 days
  - Streak chest at 7 and 30 days
  - Recipe hint of the day (reveals one "???")
  - Cosmetic for surviving each Mutation type
  - Optional: Streak Shield every 7 days covers 1 missed day

## 6. Utility system (demo)

- **Buildings:** Main Hall (start point, the raid target) and Workshop (crafting via a short minigame). Nothing else.
- **Core rule:** zombies go toward the loudest and brightest thing. Walls shape the path, lures and light pull zombies where you want them, traps and circuits hurt or hold them.
- No weapons. The consumable tray is the hook for more raid interaction later.

### 6.1 Raw materials

| Material | Used for | Found mostly at |
| --- | --- | --- |
| Wood | Walls, spikes, logs, torches | Forest edge |
| Stone | Stone walls, falling rocks | Quarry |
| Scrap metal | Metal walls, bear traps, rattles | Junkyard |
| Rope | Swinging logs, nets, rock drops | Farm |
| Wire | Circuits (trigger → mechanism), tripwires | Junkyard |
| Gears | Pressure plates, bear traps | Junkyard |
| Cloth | Torches, nets | Suburbs |
| Glass | No demo use (Expansion: lanterns, chimes) | Suburbs |

### 6.2 Craftables (12)

| # | Item | Type | Recipe | Effect |
| --- | --- | --- | --- | --- |
| 1 | Wood wall | Barricade | 3 Wood | Blocks a tile; weak |
| 2 | Stone wall | Barricade | 3 Stone | Blocks; strong |
| 3 | Metal wall | Barricade | 2 Scrap + 1 Wood | Blocks; strongest |
| 4 | Wood spikes | Floor trap | 2 Wood | Damages walkers; wears out |
| 5 | Bear trap | Floor trap | 2 Scrap + 1 Gear | Holds one zombie |
| 6 | Tripwire | Trigger | 1 Wire | Fires its circuit when any zombie crosses |
| 7 | Pressure plate | Trigger | 1 Wood + 1 Gear | Fires only for heavy zombies (Brutes) |
| 8 | Swinging log | Mechanism | 2 Wood + 2 Rope | Sweeps a 3-tile lane, knocks back |
| 9 | Falling rocks | Mechanism | 3 Stone + 1 Rope | Big hit on one tile |
| 10 | Net drop | Mechanism | 2 Rope + 1 Cloth | Holds everything on 2 tiles |
| 11 | Tin can rattle | Lure | 1 Scrap + 1 Rope | Noise all raid; pulls zombies toward it |
| 12 | Torch | Light | 1 Wood + 1 Cloth | Zombies drift toward light; lights the night |

**Circuits**
- Place a trigger, then lay Wire tiles (1 Wire each) to a mechanism
- One trigger can power several mechanisms
- 2 triggers × 3 mechanisms = 6 setups
- Each setup is "???" until a raid shows what it does, then it's saved in the Journal

**Durability**
- Traps and mechanisms have a few uses per raid and wear down over raids
- Repair at Dusk with materials

### 6.3 Consumables (found only)

| Consumable | Found at | Effect |
| --- | --- | --- |
| Bandage | Suburbs, Farm | Heals an injury from a site instantly (saves 1–2h of rest) |
| Repair kit | Junkyard | Restores one wall or trap, at Dusk or with a tap mid-raid |
| Firecracker | Junkyard | Tap a tile mid-raid: loud lure for a few seconds, pulls zombies away from your hiding spot |

## 7. Zombies + Mutations (demo)

| Zombie | Behaviour | Good answers |
| --- | --- | --- |
| Shambler | Slow, follows noise | Anything |
| Runner | Fast, weak | Tripwire + net drop, bear trap, spikes |
| Brute | Slow, smashes walls | Pressure plate + falling rocks, metal walls |

- New types appear one at a time, with one narrator line

| Mutation | Effect |
| --- | --- |
| Runners' Night | Most of the raid is Runners |
| Fog | Torches light a smaller area |
| Brute Front | Brutes come from one named edge |
| Full Moon | Raid size +50% |

- One Mutation per day, the same for everyone, no repeats within 3 days

## 8. Sites + danger

- Each site shows a danger level: **Safe / Risky / Dangerous**. More danger = better loot.
- **Safe:** worst case is "You searched but found nothing" (time lost)
- **Risky / Dangerous:** small / larger chance of injury (fall, cut, debris) → rest (+1–2h) or use a Bandage
- No other penalties: nothing stolen, no extra zombies
- Fog of war: sites next to visited ones get revealed
- Daily seed changes what each site holds today

| Site | Danger | Main loot |
| --- | --- | --- |
| Forest edge | Safe | Wood |
| Farm | Safe | Rope, Bandages |
| Suburbs | Safe | Cloth, Glass, Bandages |
| Quarry | Risky | Stone |
| Junkyard | Risky | Scrap, Wire, Gears, Repair kits, Firecrackers |

## 9. Events

- **Weekly boss** (community unlock):
  - every night a player survives adds 1 to the community Survival Count
  - when the count hits the week's target (scaled to active players), the boss raid opens for everyone
  - you fight it in a copy of your base, so your real base is safe
  - unlimited retries for 48h
  - badge flair: bronze (survived) / silver (Main Hall ≥50%) / gold (≥90%)
- **Demo boss:** The Behemoth (smashes 2 tiles per hit, can't be held by nets). Counter: pressure plate + falling rocks.

## 10. Progress + the Fall

**Saved**
- Base layout (with damage)
- Materials
- Journal (discovered circuits)
- Night count + best
- Streak, badges

**The Fall** (lose a night)
- Night count resets to 1; your best is kept
- Keep 30% of your base and 30% of your materials (you choose which)
- Keep 30% of your Journal entries (you choose which); the rest go back to "???"
- Salvage minigame (~15s): recover one specific item of your choice
- Early nights are easy, so you climb back fast

**Milestones**
- Night 3: Quarry unlocked
- Night 5: bigger base grid
- Night 8: more storage

## 11. Judges + onboarding

- **"Try a veteran city"** button on the start screen: a prebuilt Night 12 base, boss available
- Splash/loading screen shows a raid playing on a loop (the payoff first)
- Post title + one-line body: "Scavenge by day. Build traps. Hide. Survive the night."
- 4-icon loop strip on the start screen: Scavenge → Craft → Build → Hide
- Night 1 story intro = tutorial (section 4)
- Show, don't list: the hours bar visibly drains, costs float up ("−2h"), noise rings pulse out of lures
- Guaranteed "???" circuit discovery on Night 1
- Journal shows "1 / 6 discovered" with silhouettes
- Result card teaser: "Tomorrow: Runners. 5 circuits left to discover."
- Pinned comment on the demo post: a short GIF + 3 bullets

## 12. Expansion (not in demo)

- **Items:** gate, metal spikes, spring blade, bottle chimes, lantern; more consumables (Main Hall reinforcement)
- **Systems:**
  - elements + reactions (oil + fire, water + electricity)
  - more triggers (timer, noise sensor)
  - more mechanisms
  - support buildings
  - survivors
  - weapons
  - more raid tap actions
- **Content:**
  - zombies: Crawler, Spitter, Screamer
  - more Mutations
  - more bosses, monthly Blood Moon
  - Dangerous sites (Hardware store, Power station)
- **Community:**
  - Mutation vote, flair
  - fort sharing, supply crates
  - ruins of fallen bases, a shared world map

## 13. Open questions

- **Flare:** keep it (free teleport after 6h), or drop it now that all travel is teleporting?
- **Being found** in your hiding spot: counts as the Fall, or a softer loss (e.g. lose a night's materials)?
- **Glass:** drop it from the demo (7 materials) or give it a demo use?
- **Fall:** 30% kept *and* a salvage item, or *either/or*?
- **Drain speed:** 1h per 20s okay?
- **Unique dailies:** which idea from section 5?
- **Narrator:** text only, or also voice / sound cues?
- **Name**
- **Stack** (decide later)
