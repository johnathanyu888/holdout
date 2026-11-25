# Holdout — Game Design (demo scope)

Working name. Reddit Game of the Day hackathon (Devvit Web), due Dec 8, 2026.
This file covers the proof-of-concept demo. Bigger ideas are in **Expansion** (section 13).

---

## 1. Concept

- A daily zombie-defense puzzle on Reddit: read the briefing, build a machine, watch it work.
- Every day **everyone gets the same day**: the same city, the same zombie **Mutation** and the same **kit**. Strategy and builds can be compared and shared.
- You build a **Minecraft-redstone-style contraption** (sensors → wire → logic → killers) that **kills** every zombie before one reaches your survivor.
- **Kill, don't block:** walls only steer zombies; machines do the killing.
- **No:** guns, turrets, auto-aim, consumables, or character control. The survivor is never on screen; they hide in your **house**.

## 2. The day (~5 min)

| Phase | Time | What happens |
| --- | --- | --- |
| **Briefing** | 30s | Mutation card, City card, today's kit. Make a plan. |
| **Build** | 4:00 | Place your house, place parts, lay wire, spend seconds in the Time Shop. |
| **Raid** | 30s | Fully automatic. Playback at 1x / 2x / 4x. |
| **Result** | — | Score, the Mutation card, the Radio transmission. Stars arrive at the daily reset. |

- **No test run.** You learn by trying, failing and coming back tomorrow.
- Failing must feel fair: the replay shows exactly where and why a zombie got through.

## 3. What changes every day

A day is built from **five independent layers**, each rolled from the daily seed. Each pool is small; together they make a different puzzle every day.

### 3.1 Layout (an open map; the seed places what's on it)
- The map itself is a **clean, open floor** in the day's theme: no clutter, no lanes, no corridors.
- **Zombies can walk in from any edge tile, on all four sides.** There are no entry lanes, so you defend every direction.
- What the daily seed places on it:
  - **terrain zones** (per theme, section 11)
  - the **fixed structures** (3.3)
- **Demo:** one fixed day on the prebuilt wilderness map (`art/maps/wilderness_map.svg`). No seed generation; placements are hand-made.

### 3.1b Map size
- **16×16 tiles** (the demo; shrunk from 24×24 so each part you place matters on screen). Art is drawn at **64px a tile**, so the play area is 1024×1024px. The map file is 1536×1536 (24×24 tiles); the play area sits at x/y 256..1280 and the forest round it is scenery.
- On screen: a phone fits the whole lawn at ~22px a tile; you build zoomed in with pinch and pan. A laptop fits it at ~45px a tile.
- Zombies don't appear on the edge tiles: they walk out of the forest, starting ~3 tiles back in the trees, then path to the house.
- Why 16: from the middle to an edge is 8 tiles (plus the walk out of the trees), so Shamblers (~0.9 tiles/s) arrive in ~12s, Runners (~1.8) in ~6s, Brutes (~0.6) in ~18s. That still fits a ~30s raid, with room for a ring of traps and killing fields round the home.
- Home near a corner = zombies from the far side walk ~22 tiles; that's the player's trade-off (the outer 2-tile band is off-limits for the home).

### 3.2 Your house (you place it; it sets the zombies' goal)
- During Build you place your **house** (the survivor's hideout, **1×1 tile**) **anywhere on open ground**.
- Zombies **sense the survivor** and path toward the house. **You lose if any zombie reaches it.**
- Where you put it decides how far zombies walk and from which sides they reach you. Zombies come from every edge tile:

| | House in the middle | House near one edge |
| --- | --- | --- |
| Zombie walk | ~8 tiles from every side, all arriving about together | ~2 tiles from the near edge, ~14 from the far edge |
| Upside | Even ground on every side: one symmetric ring of traps can work | The far sides walk a long way, so you have lots of tiles to kill them on |
| Downside | Pressure from all four sides at once: you need defense everywhere | Zombies spawning on the near edge are on you almost immediately: that side needs a tight, fast killer |

- **Middle** = balanced but you guard 360°. **Near an edge** = the far sides are easy, the near side is a knife-edge.
- Placement also plays off the power inlet (3.3): a house near it makes powered defenses cheap to wire.

### 3.3 Fixed map features (you wire into them, can't move them)
- **Power inlet:** every map has exactly **one** spot where power comes up from underground. It's steady, but **weak and limited**:
  - **Strength 6** (sensors make 10), so it only reaches a few tiles and hits softly (section 4.1).
  - **Powers at most 3 action parts**: the 3 it reaches strongest (nearest), ties to the one placed first. A 4th part wired to it stays dark.
  - Chips (delays, latches) wired to it don't count, but any action they power does.
  - Everywhere else, power is **made by sensors**: a pressure plate, tripwire or motion sensor sends a pulse when it fires. Sensor power has no limit.
  - Where today's inlet sits (near the entries or far from them) is a big part of the puzzle.
- **Rocks:** boulders block zombies, parts and wire. Tap one to clear it for **0:30** of Build time. They bend the paths zombies take, and clearing one is a choice between time and space.
- **Salvage machines:** a broken crusher, a fuel tank (one big ignition), a live cable, a blast door. **One per day.**
- **Keep it sparse:** a day places only the power inlet, one salvage machine and one or two terrain pieces. The map should stay mostly open.
- **Terrain:** water (conducts electricity), pits, rubble (slows), doors (can be wired to open and shut).

### 3.4 Condition (the day's rule)
One global rule that changes how parts behave:

| Condition | Effect |
| --- | --- |
| Rain | Wet tiles carry Tesla charge; flame vents are weaker |
| Wind | Fire and noise drift one way |
| Blackout | Power cuts out for 5s mid-raid, so batteries matter |
| Rust | Every 6th wire tile is dead |
| Echo | Sirens are heard twice as far |
| Quake | Barricades start at half HP |
| Heatwave | Zombies are faster; flame vents reach further |

### 3.5 Mutation + kit
- **Mutation:** zombie stats (HP, speed, damage, count, wave timing) + one ability (section 5).
- **Kit:** a fixed parts list + raw materials (section 4).
- **Zombies never arrive all at once.** They trickle in over the raid in small groups from random edge tiles, a few every couple of seconds.
  - The Mutation sets the rhythm: a steady trickle, a few bursts, or a slow start with a surge near the end.
  - The seed can lean the pressure toward one or two sides (e.g. "most come from the north today"), shown in the Briefing.

**Why it works:** the layers interact. A Rain day with Insulated zombies and the inlet next to a pool of water plays nothing like a Wind day with Climbers and the inlet in a far corner. More content = adding to any one pool.

## 4. Building

### 4.1 How a circuit works (3 components)

Every circuit is the same three things in a row:

```
 1. TRIGGER / POWER   →   2. WIRE + SIGNAL STRENGTH   →   3. ACTION
 (inlet, sensors,         (wire tiles, chips;              (saw, spikes, flame,
  clock, battery)          strength drops per tile)         piston, lure, door…)
```

**1. Trigger / power: makes the signal.** Every signal is one of two kinds:

| Kind | What it is | Made by |
| --- | --- | --- |
| **Constant** | On for as long as the source is on. | Power inlet (all raid), pressure plate (while a zombie stands on it), motion sensor (while a zombie is in range), battery (while charged) |
| **Tick** | One short pulse: on for **0.5s**, then off. | Tripwire (each crossing), clock (every few seconds) |

- **No portable generator.** All power is either the map's inlet or a sensor that a zombie sets off. Chips never make power; they only route it.

**2. Wire + signal strength: carries it.**
- Each source sends its signal out at a **strength**: inlet 6, sensors and battery 10.
- Strength drops **1 per wire tile**. At 0 the signal stops.
- Each action part has a **minimum strength** it needs to work (the "Needs" column below). Long wire runs make power too weak for the heavy parts.
- **Strength is power:** a part's damage scales with the strength reaching it: **strength ÷ 9** (a sensor one tile away = 100%; the inlet one tile away = 56%).
- **Strength is wear:** every part has a **durability**. Each hit wears it by *damage × strength ÷ 9*, so wear grows with the square of the strength. Full power kills fast and burns the part out; weak power lasts all night but may not kill. A worn-out part stops for the rest of the raid.
- A **Delay** chip refreshes the signal back to 10: that's how you carry power across the map.
- Wire tiles can branch (tee, cross) without losing extra strength. Each branch keeps counting down from where it splits.
- Signals arrive instantly along the wire. Only a Delay adds time.
- The kind passes through untouched: a tick stays a tick, a constant stays a constant. Only a Battery turns ticks into constant power.

**3. Action: does the thing.** Every action part reacts differently to the two kinds:
- **Constant** = keeps running for as long as power holds. A saw blade spins and keeps cutting.
- **Tick** = runs once, briefly. A saw blade gives one 0.5s spin, then stops.
- Damage is listed **per second (DPS)** for parts that run continuously, and **per hit** for parts that fire once and then cool down.

**Reference zombies** (Mutations scale these): Shambler 100 HP at 0.9 tiles/s (~1.1s to cross a tile), Runner 60 HP at 1.8 tiles/s (~0.55s a tile), Brute 250 HP at 0.6 tiles/s (~1.7s a tile).

**Engine:** the raid runs at **10 sim steps per second**. Each step:
1. Read the sensors.
2. Flood-fill power out from every source along the wires, lowering strength 1 per tile and keeping the highest strength that reaches each tile.
3. Update the chips.
4. Run the action parts.
5. Move the zombies.

### 4.2 Parts: full specs
★ = in the demo's starting set. The rest unlock over time (section 8). Numbers are starting values for tuning. Every part is 1 tile unless noted. **Shop** = its Time Shop price in seconds off the Build clock.

#### 4.2a Triggers / power (component 1)

| Part | Output | Strength | When it fires | Re-arm / limits | Shop | Notes / engine |
| --- | --- | --- | --- | --- | --- | --- |
| Power inlet *(fixed, one per map)* | Constant | 6 | Always, all raid | Powers at most 3 action parts (the nearest) | — | Map feature, not a part. Can't be moved. |
| ★ Pressure plate | Constant | 10 | While ≥1 zombie stands on it (on for at least 0.5s) | None | 10s | Flush with the ground; zombies don't avoid it. Checks tile occupancy each step. |
| ★ Tripwire | Tick | 10 | Each time a zombie walks through it | Re-arms after 1s | 8s | Sits on a tile edge between two stakes. Fires on edge-crossing, not occupancy. |
| Motion sensor | Constant | 10 | While any zombie is within 2 tiles | 0.3s reaction delay | 15s | Radius check from the tile centre; sees through walls. |
| Clock | Tick | 10 | Every 2s from the raid's start (set to 1 / 2 / 3s while building) | — | 12s | Fires whether or not zombies are near. Good for timed killers (crusher, ball). |
| Battery | Constant | 10 | While it holds charge | Holds up to 8s of charge. Each tick in adds 2s; constant in adds 1s per second. Drains 1s per second while it outputs. | 15s | Turns ticks into constant power. Keeps working through a Blackout. Its charge is shown as bars on the sprite. |

#### 4.2b Wire + chips (component 2)

| Part | Pins | Behaviour | Strength out | Cost | Shop | Notes / engine |
| --- | --- | --- | --- | --- | --- | --- |
| ★ Wire tile | 4 edges | Carries power to every wire it touches | In − 1 | 1 Wire | — | Drawn by dragging a path. The sprite picks itself from its neighbours: straight / corner / tee / cross / end. Zombies walk over it and wear it down: **40 HP**, −1 HP per zombie per sim step on the tile (~4 Shambler crossings). At 0 it breaks for the rest of the raid and stops carrying power, cutting everything downstream. Glows when powered. |
| ★ Delay | In (left) → out (right) | Passes the signal on after 0.5s (set to 0.5 / 1 / 2s). Keeps the kind (tick or constant). | Refreshed to 10 | — | 8s | The only way to boost a weak signal. Queue the input with a timestamp. |
| NOT | Control (left), supply (bottom) → out (right) | Passes the supply through **except** while the control is on | Supply's | — | 10s | Needs a powered supply, so it can't make power from nothing. |
| AND | Input A (left), input B (bottom) → out (right) | Passes A through only while B is also on | A's | — | 10s | E.g. a plate AND a motion sensor = "only fire when two zombies are close". |
| ★ Latch | Set (back), reset (side) → out (front) | Power on Set switches it on; it stays on after Set goes quiet. Power on Reset switches it off (reset wins). While on, it sends steady power. | 10 | — | 12s | Memory: one plate can switch a trap on for the rest of the raid, and a second plate further in can switch it off. Its output counts as sensor power, unless the inlet set it. |

#### 4.2c Actions: killers (component 3)

| Part | Needs | On constant power | On a tick | Damage | Cooldown | Area | Shop | Countered by | Notes / engine |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ★ Saw blade | 1 | Spins non-stop | One 0.5s spin | **60 DPS** (~30 per tick) | None (0.2s spin-up) | Its tile | 20s | — | One saw doesn't quite kill a Shambler walking across. Two in a row does. Damage each step to zombies on its tile. |
| ★ Spike floor | 1 | Spikes stay up: 20 DPS and zombies on it slow 50% | Spikes punch up once | **45 per hit** (tick); 20 DPS (held up) | 1s between punches | Its tile | 15s | Jumper (leaps it) | Pair it with a pressure plate on the same tile for a self-triggering trap. |
| Flame vent | 4 | Fire jet in its facing direction | A 1s burst | **40 DPS** + burning 10 DPS for 3s | Overheats after 4s of non-stop fire, then 2s off | 2 tiles in front (3 in Heatwave) | 25s | Fireproof | Rain: half damage. Wind bends the jet 1 tile. Rotatable. |
| Tesla coil | 3 | Zaps automatically every 1.5s | One zap | **70 per zap** to the nearest zombie, then jumps to 1 more | 1.5s | 1.5 tiles round it; jumps across every connected wet tile | 30s | Insulated | Rain makes wet tiles carry the jump. Pick the nearest target each zap. |
| Trapdoor pit | 3 | Doors stay open: a pit that zombies path round | Doors drop open for 1.5s | **Instant kill** on anyone on the tile | 2s to reset | Its tile | 25s | Heavy (breaks the doors and walks on) | The pit holds 3 zombies, then it's full and acts as floor. A piston pushing zombies in is the classic combo. |
| Crusher | 5 | Slams every 3s | One slam (0.4s wind-up) | **150 per slam** | 3s | Its tile | 30s | Runners (often clear the wind-up) | Hits only what's on the tile when the slam lands. Clocks pair well with it. |
| Wrecking ball | 6 | Swings back and forth every 4s | One swing | **90 per hit** + knocks back 1 tile | 4s | 3-tile arc in front of the pivot | 35s | Heavy (no knock-back) | Hit each zombie at most once per swing. Rotatable. |
| Shredder *(2×2)* | 8 | Grinds non-stop | A 0.5s grind | **50 DPS** to everything on it, and slows 30% | None | Its 4 tiles | 45s | — | The strongest killer, but needs strength 8: put it near the inlet or behind a Delay. |

#### 4.2d Actions: steering + lures (component 3)

| Part | Needs | On constant power | On a tick | HP | Cooldown | Area | Cost / Shop | Countered by | Notes / engine |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ★ Wood barricade | — (no power) | — | — | **120** | — | A thin wall on the tile's centre line; blocks the tile for pathing | 3 Wood | Climber (climbs over) | Loses 4 HP per bump from a zombie (at most once per second per zombie). Deliberately bashed at 20 HP/s per zombie when no open route exists. |
| Stone barricade | — (no power) | — | — | **300** | — | Same as wood | 3 Stone | Climber | Same contact rules as wood. Quake: both kinds start at half HP. |
| ★ Piston | 1 | Pushes once when power arrives, then stays out | Pushes, then pulls back | Push into a wall or barricade: **20** to the zombie | 1s | The tile in front | 15s | Heavy (can't be pushed) | Pushes everything on the front tile 1 tile on. Into a pit, saw or shredder is the point. Rotatable. |
| Door control | 2 | Holds the linked map door open | Flips the door (open ↔ shut) | Door: 400 | 0.5s | One map door (linked during Build) | 10s | — | Only on maps with doors (themes, section 11). |
| Floodlight *(lure)* | 3 | Lit: pulls zombies within 4 tiles that can see it | Flashes for 2s | **80** | — | 4 tiles, line of sight | 15s | Blind | Zombies attack it when they reach it, then carry on (4.3). |
| Siren *(lure)* | 3 | Sounding: pulls zombies within 4 tiles, through walls | Wails for 2s | **60** | — | 4 tiles (8 in Echo) | 15s | Deaf | Noise ignores walls, so it pulls more zombies than a floodlight but breaks sooner. |

- **Walls are thin, not tile-sized blocks.** A wall is about **1/3 of a tile thick** and runs along the tile's centre line. Placing walls in neighbouring tiles joins them into one continuous wall.
  - **Pathing:** a wall tile is still blocked, so zombies route round it on the grid.
  - **Hitbox:** only the thin band. Zombies walking down the open tiles beside a wall graze it, and that's where contact damage comes from.
  - **Look:** the whole top of the wall is one texture: stone walls are brick courses, wood walls are rows of planks, laid edge to edge with no overlapping pieces.
  - **Sprites:** in `art/parts/walls/`. There are 16 pieces per material, one for every combination of neighbours, and 3 variants of each: `wall_<wood|stone>_<sides>_<a|b|c>.svg`. Sides are listed in n-e-s-w order (`ew` = east-west straight, `nesw` = cross, `post` = alone).
    - The engine picks the piece from the 4 neighbours, and the variant from the tile position, e.g. `(row*7 + col*13) % 3`.
    - Variants change the brick and plank layout. At corners and junctions they also change which direction runs straight through, so long walls don't repeat.
  - Walls **can't be rotated**: the strip of south face drawn under each wall must always be at the bottom.

- **Gears upgrade** one placed part: +25% damage, or +1 tile of range or area (player's pick). One upgrade per part.

### 4.3 Lures
- Lures **attract** zombies (never repel).
- They only work **while powered**, and only on zombies **within their radius** (~4 tiles). Farther away, zombies keep heading for the house.
- Zombies that reach a lure **attack it**: it has HP and breaks. Then they carry on to the house.
- **Purpose:** drag zombies off the shortest path into a kill zone, then let them go. Not a way to hold them all raid.
- **Can't be abused because:**
  - the radius is small
  - lures break
  - a lure on the always-on inlet pulls everything that passes, so it breaks early
  - sensor-driven lures only pulse when you design them to
  - Deaf and Blind Mutations ignore them

### 4.4 Walls and zombies
- Zombies take the shortest open route to the house, bent by lures.
- **Walls lose HP on contact:** whenever a zombie brushes or bumps a barricade's hitbox (squeezing past, being pushed into it, crowding), the barricade loses HP. Wall mazes wear down over the raid.
- Zombies only **deliberately attack** a wall when there's no route left without a wall in the way. Then they bash the weakest one.
- Walls steer but never win on their own. You have to kill.
- **Wire wears out under traffic:** zombies don't avoid or target wire, but every zombie standing on a wire tile wears it down (4.2b), and a worn-through tile breaks and cuts the power past it. Wire laid across the zombies' routes is a liability: route it away from their paths, or use walls to steer them off it.

### 4.5 Raw materials, Stockpile, Blueprints
- **Daily kit:** parts + a raw-material drop, the same for everyone.
- **Wire tiles cost Wire**; barricades cost Wood or Stone. Every working defense spends raw materials, so they always matter.

| Material | Use |
| --- | --- |
| Wire | Wire tiles (1 each) |
| Wood / Stone | Barricades (3 each) |
| Gears | Upgrade a part (+25% damage or +1 range) |
| Scrap | Discount in the Time Shop |

- **Stockpile:** unused raw materials carry over to tomorrow, up to a cap that grows with progression. Being frugal is a real choice.
- **Blueprints:** save a contraption, then print it on a later day in one go by paying its raw materials + a small fee. The Stockpile is what makes blueprints useful.

### 4.6 Time Shop
- Spend seconds from the 4:00 Build clock on extra parts (e.g. Saw = 20s). Scrap lowers prices.
- Trade-off: more tools, less time to place them.

## 5. Mutations

- Each day: base zombie + seeded stat rolls + **exactly one ability**, giving a name like "Insulated Runners".

| Ability | Effect |
| --- | --- |
| Climber | Climbs over barricades |
| Insulated | Immune to Tesla and water shocks |
| Fireproof | Immune to fire |
| Heavy | Can't be pushed; breaks trapdoors |
| Deaf | Ignores sirens |
| Blind | Ignores floodlights |
| Jumper | Leaps 1-tile floor traps |
| Splitter | Splits into 2 small zombies on death |

- The same ability never repeats within 3 days.
- A new ability gets one narrator line the first time it appears.

## 6. Scoring + stars

- **You must survive to score.** Score adds up:
  - raid clear speed
  - time left on the Build clock
  - unused kit parts
  - unused raw materials
  - wire efficiency
  - undamaged barricades
- Every term pulls against safety. A top score = a fast, cheap, near-perfect machine. **A perfect score should be close to impossible.**
- **Stars (max 3), revealed at the daily reset:**
  - 1★ survived
  - 2★ top half of the day's scores (needs everyone's results, hence the reset). **Demo:** ≥70% of the designer's score
  - 3★ beat the designer's own score for that day

## 7. Night 1: story intro + tutorial

- Whispered narrator, typewriter, one line at a time.
- A **Clash-of-Clans-style finger pointer** shows each feature as it's introduced.
- Can't be skipped the first time. Judges simply play Night 1.
- Script:
  1. *(black screen, distant groans)* "Shh. They're coming."
  2. "They can smell you. We need to hide you." → finger drags the house onto a highlighted open tile
  3. "Every night, they come back… different." → Mutation card slides in: "Shamblers. Slow. Hungry."
  4. "We can't fight them. But we can build." → finger on a pressure plate, then on an open tile between the house and the nearest edge
  5. "Something sharp. Right there." → finger drags a saw blade next to the plate
  6. "Wire them together. Plate… to blade." → finger traces the wire; the Wire counter ticks down ("Don't waste it.")
  7. "The clock's running. Every second counts." → the clock appears; finger on the Time Shop: buy a second saw for 20s
  8. "Now we wait. Trust the machine." → raid: the plate clicks, the saw spins, first kill
  9. "One's slipping past…" → a zombie comes in from another side, scrapes a barricade (it loses HP), dies on the second saw
  10. "You made it. One night." *(beat)* "Tomorrow… they climb." → result card; the first Radio transmission crackles
- Later first-time events (new part, new Condition, new ability, first boss) each get one line + the finger.

## 8. Progression (what you keep)

- **Part unlocks:** from total nights survived and total stars (not streak).
- **Blueprint library:** saved contraptions. Share as an image in the comments ("Build of the Day").
- **Mutation collection:** one card per day, framed by its stars.
- **Stockpile:** carried-over raw materials.
- **The Radio:** each night you survive plays one short transmission from other holdouts.
  - A serial story in the narrator's whispered voice.
  - Drops hints about upcoming Mutations and teases the weekly boss.
- **Rank titles:** from total stars.

## 9. Missed days

- **Nothing is lost:** Stockpile, unlocks, blueprints all kept.
- **You miss:**
  - that day's Mutation card (it can come back later only as a silver "Rerun")
  - that day's Radio transmission (plays later as static with fragments, so the gap shows)
  - your streak
- **Streak bonuses:** extra Stockpile at 3 / 7 / 14 / 30 days; optional Streak Shield every 7 days.

## 10. Weekly boss

- The boss card (stats + ability) is **public all week**; the Radio drips hints.
- **Boss day:**
  - pick any day you played this week; that day's map and saved defense load
  - get bonus materials and extra build time
  - build on top of your old defense, then fight the boss
  - played no other day this week? Use today's
- **Reward:** badge (bronze / silver / gold).

## 11. Themes

**Demo: Wilderness.** The prebuilt `art/maps/wilderness_map.svg`: an open mown lawn ringed by forest. No special terrain; zombies come out of the trees on all four sides. (Frozen Lake and Volcano are cut.)

**Future themes** (each brings its own terrain and fixed features):

| Theme | Signature feature |
| --- | --- |
| Subway platform | Live third rail, tunnel mouths |
| Suburban cul-de-sac | Garages, fences, a pool (water) |
| Shopping mall | Escalators as moving lanes, shutter doors |
| Hospital | Long corridors, generators |
| Shipping port | Containers as movable walls, a crane, seawater |
| Farmstead | Silos, a barn, fences, wind |
| Ski lodge | Ice that slides zombies, a chairlift |
| Prison | Cell doors on a switch, a yard |
| Theme park | A track that moves (carts), a carousel |
| Oil refinery | Fuel lines (fire chains), pipes |
| Lighthouse island | Tides flood tiles over the raid |
| Military bunker | Blast doors, a power core |
| Train yard | Switchable rails, a moving engine |

## 12. Art style

- io style with light shading: top-down, fixed camera, bright and friendly; scary through situation, not gore.
- Every object: chunky shape + thick `#25282C` outline + one shadow tone + one highlight + soft drop shadow (light from the top-left).
- Readable at phone size: shape and colour say what something is before detail does.
- **Circuit look:**
  - wire tiles: copper; pulse bright when powered
  - powered parts glow; unpowered ones are dull
  - logic gates: small chips with a clear symbol (NOT, AND, a clock face for Delay)
  - ghost preview while placing a part
- **Zombies:** top-down circle body, arms reaching forward. Each ability gets one visual tell (Climber = hooked hands, Insulated = rubber-grey skin, Fireproof = ash-black, etc.).
- **Effects:** damage numbers with an outline, white flash on hit, defeated zombies squash flat and fade, white arcs on swings, rings from sirens.
- The earlier map and region SVGs are not used; the base map is `art/maps/wilderness_map.svg`, with structures from `art/structures/` drawn on top.
- Maps are clean floors; everything placed on them (structures, terrain zones, the home) is a separate sprite. The red entry-edge overlay runs along all four edges.

## 13. Expansion (not in the demo)
- **Zombies that learn:** a zombie that sees another die on a tile avoids that tile for the rest of the raid, so the same trap can't farm a whole wave. Planned next, after the power rework.
- **Fog of war:** entry sides stay hidden until a sensor near an edge reveals them. Parked: it fights the "fair, readable failure" goal on a small screen.
- **Part trading:** a short daily list of fixed trades shared by everyone (e.g. 2 Saws → 1 Piston). Under consideration.

- Leaderboards (daily, weekly, boss), depending on what Devvit allows.
- Reclaim the world map: a % per day, plus what reclaiming gives you (to be decided).
- Procedural layouts (3.1), more themes (section 11).
- More logic parts (comparator, repeater with signal decay), crafting recipes from raw materials.
- Community blueprints showing up in other players' kits.

## 14. Open questions

- Score weights; how the designer's par is set each day for the demo.
- Stockpile cap and how fast it grows.
- Whether some tiles are off-limits for the house (e.g. right on an entry edge).
- Boss day: a fixed weekday, or any time in a 48h window.
- Name and tech stack.
