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
  - **terrain zones** (for the Frozen Lake: slick-ice patches and pressure ridges, section 11)
  - the **fixed structures** (3.3)
- **Demo:** the placements are hand-made, not generated.

### 3.1b Map size
- **24×24 tiles.** Art is drawn at **64px a tile**, so a full map is 1536×1536px.
- On screen: a phone shows the whole map at ~16px a tile (overview); you build zoomed in at 2–3× with pinch and pan. Desktop fits it at 32px a tile.
- Why 24: from the middle to an edge is 12 tiles, so Shamblers (~0.9 tiles/s) arrive in ~13s, Runners (~1.8) in ~7s, Brutes (~0.6) in ~20s. That fits a ~30s raid. A full ring defense round the home takes ~13×13, leaving room for killing fields on every side.
- Home in a corner = zombies from the far side walk ~34 tiles; that's the player's trade-off (or the outer 2-tile band can be off-limits for the home).

### 3.2 Your house (you place it; it sets the zombies' goal)
- During Build you place your **house** (the survivor's hideout, **1×1 tile**) **anywhere on open ground**.
- Zombies **sense the survivor** and path toward the house. **You lose if any zombie reaches it.**
- Where you put it decides how far zombies walk and from which sides they reach you. Zombies come from every edge tile:

| | House in the middle | House near one edge |
| --- | --- | --- |
| Zombie walk | ~12 tiles from every side, all arriving about together | ~3 tiles from the near edge, ~21 from the far edge |
| Upside | Even ground on every side: one symmetric ring of traps can work | The far sides walk a long way, so you have lots of tiles to kill them on |
| Downside | Pressure from all four sides at once: you need defense everywhere | Zombies spawning on the near edge are on you almost immediately: that side needs a tight, fast killer |

- **Middle** = balanced but you guard 360°. **Near an edge** = the far sides are easy, the near side is a knife-edge.- Placement also plays off the power inlet (3.3): a house near it makes powered defenses cheap to wire.

### 3.3 Fixed map features (you wire into them, can't move them)
- **Power inlet:** every map has exactly **one** spot where power comes up from underground. Anything wired to it is **always on**.
  - Everywhere else, power is **made by sensors**: a pressure plate, tripwire or motion sensor sends a pulse when it fires.
  - Where today's inlet sits (near the entries or far from them) is a big part of the puzzle.
- **Salvage machines:** a broken crusher, a fuel tank (one big ignition), a live cable, a blast door. **One per day.**
- **Keep it sparse:** a day places only the power inlet, one salvage machine and one or two terrain pieces (e.g. one slick-ice patch and one pressure ridge). The map should stay mostly open.
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

**Why it works:** the layers interact. A Rain day with Insulated zombies and the inlet next to a slick-ice patch plays nothing like a Wind day with Climbers and the inlet in a far corner. More content = adding to any one pool.

## 4. Building

### 4.1 Parts (redstone-like)
★ = in the demo's starting set. The rest unlock over time (section 8).

| Group | Parts |
| --- | --- |
| Power | The map's power inlet (always on, not a part), Battery (stores pulses from sensors) |
| Signal | ★ Wire tile, ★ Delay, NOT, AND, Latch |
| Sensors (each makes its own pulse) | ★ Pressure plate, ★ Tripwire, Motion sensor, Clock |
| Killers | ★ Saw blade, ★ Spike floor, Flame vent, Tesla coil, Trapdoor pit, Crusher, Wrecking ball (swings a 3-tile arc), Shredder (2×2 grinding floor) |
| Steering | Piston (push 1 tile), ★ Barricade (Wood / Stone), Door control |
| Lures | Floodlight (light), Siren (noise) |

- **No portable generator.** Power is the inlet (always on) or a sensor's pulse when a zombie triggers it. A Battery can save up pulses.

### 4.2 Lures
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

### 4.3 Walls and zombies
- Zombies take the shortest open route to the house, bent by lures.
- **Walls lose HP on contact:** whenever a zombie brushes or bumps a barricade's hitbox (squeezing past, being pushed into it, crowding), the barricade loses HP. Wall mazes wear down over the raid.
- Zombies only **deliberately attack** a wall when there's no route left without a wall in the way. Then they bash the weakest one.
- Walls steer but never win on their own. You have to kill.

### 4.4 Raw materials, Stockpile, Blueprints
- **Daily kit:** parts + a raw-material drop, the same for everyone.
- **Wire tiles cost Wire**; barricades cost Wood or Stone. Every working defense spends raw materials, so they always matter.

| Material | Use |
| --- | --- |
| Wire | Wire tiles |
| Wood / Stone | Barricades |
| Gears | Upgrade a part (+damage or +range) |
| Scrap | Discount in the Time Shop |

- **Stockpile:** unused raw materials carry over to tomorrow, up to a cap that grows with progression. Being frugal is a real choice.
- **Blueprints:** save a contraption, then print it on a later day in one go by paying its raw materials + a small fee. The Stockpile is what makes blueprints useful.

### 4.5 Time Shop
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
  4. "We can't fight them. But we can build." → finger on a pressure plate, then on a lane tile
  5. "Something sharp. Right there." → finger drags a saw blade next to the plate
  6. "Wire them together. Plate… to blade." → finger traces the wire; the Wire counter ticks down ("Don't waste it.")
  7. "The clock's running. Every second counts." → the clock appears; finger on the Time Shop: buy a second saw for 20s
  8. "Now we wait. Trust the machine." → raid: the plate clicks, the saw spins, first kill
  9. "One's slipping past…" → a zombie takes the other lane, scrapes a barricade (it loses HP), dies on the second saw
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

**Demo: Frozen Lake.** A clean sheet of blue ice with a snowy shoreline; zombies come out of the snow along the shore. Its terrain:
- **Slick ice** (patches of tiles): zombies on it move faster and slide, keeping straight and turning slowly.
- **Pressure ridges** (2×1, pointed one way): a zombie that hits one at speed is **launched ~3 tiles** in its direction, flying over whatever's below (traps, walls).
- So the ice cuts both ways: slide zombies straight into a saw line, or watch a ridge fling them over your defenses.
- The home is an ice-fishing shack.

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
