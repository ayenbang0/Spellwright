# Magicraft Clone — PLAN.md

> **Target:** `Magicraft` by Wave Games, published by bilibili — Steam AppID `2103140` (Steam store)
> **Genre:** Top-down twin-stick magic roguelike / bullet-hell; wand "programming" by ordering spells in slots
> **Original engine:** Unity — Windows, single-player, Steam Deck Verified `[X]`
> **Releases:** Early Access Nov 1 2023 → 1.0 Nov 1 2024 (Steam store)
> **NOT:** `MagicCraft` MOBA (AppID 2395760) — different game, ignore.
> **Decisions (Sep 28 2026):** Stack = web game (Vite + TypeScript + **PixiJS v8**) · Hosting = **GitHub Pages** · Scope = full 1:1 mechanics clone · Art = custom AI-assisted, original · Goal = learning prototype (clean-room; rename every name/asset).
> **Workspace:** `C:\Users\welov\Desktop\Projects\Magicraft` — see §14 for what exists and what is still open.

**Source tags used below.** `[W]` = stated on https://magicraft.fandom.com (mirrored in `wiki/`). `[X]` = not on the wiki (Steam page, community knowledge, or the earlier draft of this plan); verify in-game before relying on it. `[D]` = our own design decision for the clone. Untagged = plan/process text.

---

## 0. Source of Truth — the wiki mirror

The fandom HTML site blocks scripted clients (HTTP 403); `api.php` works. `wiki/fetch_wiki.py` mirrors everything and regenerates all derived files:

| Path | Contents |
|---|---|
| `wiki/raw/articles/*.wiki` | Raw wikitext of all 165 articles (+101 templates, 27 categories), with last-edit timestamps |
| `wiki/corpus.md` | Every article as plain text (tables flattened) — read this for mechanics prose |
| `wiki/data/spells.json` | 84 spells: infobox stats per level (MP, DMG, crit, radius, CD, scatter, slots…), level descriptions, tips, page notes |
| `wiki/data/wands.json` | 97 wands: MP, cast interval, MP regen, CD, passive text |
| `wiki/data/relics.json`, `relic_series.json` | 85 relics (rarity, max level, effect), 5 series bonuses |
| `wiki/data/curses.json`, `potions.json` | 46 curses, 31 potions |
| `wiki/data/bosses.json`, `monsters.json` | 16 bosses (chapter, HP), 194 regular monsters (HP, description) |
| `wiki/REFERENCE.md` | Generated lookup tables of all of the above (never hand-edit; rerun the script) |

Refresh: `cd wiki && python fetch_wiki.py` (needs `requests`, `mwparserfromhell`). The wiki is community-maintained, partly stale (many pages last edited 2024), and has gaps/contradictions — see §13. When the wiki and this plan disagree, the wiki wins unless the item is tagged `[D]`.

**Content scale the wiki documents** (the Steam page advertises more; unlisted items need in-game research): 99 spells listed (84 with stats; 16 names only), 97 wands, 85 relics + 5 series, 46 curses, 31 potions (list marked complete as of 2024-07-29), 194 monsters + 16 bosses, 4 chapters + Author easter egg, 9 sets, 15 achievements, 7 camp NPCs.

---

## 1. High-Level Vision

Core loop: **enter procedurally chosen rooms from the camp portal → collect spells/wands/relics → slot spells into wands left-to-right → break the mana economy → clear bullet-hell rooms → beat the chapter boss (flawless = Crimson/Scarlet epic relic room) → die or win → spend meta currency at camp → run again.** Spells, relics, and potions are lost on death `[W]`.

Must-have pillars:

1. **Modular wand programming** `[W]` — slot order matters; boosts modify spells, trigger spells carry "payloads", passives modify the whole wand, some wands have a charge-driven post/secondary slot.
2. **Crafting** — 3 identical spells → next level (+, then ++; max ++) `[W]`; Spell Prototype acts as a same-level wildcard `[W]`; Reforge (reroll) via Reforge Furnace / Reforge Potion `[W]` (exact forge rules `[X]`, §4.5).
3. **Relic / curse / potion triangle** `[W]` — passive build-shapers, debuffs that some relics reward (Mask of the Hexer), consumables that manipulate the run.
4. **Room choice + loot + broken combos** — door icons show room reward (hidden by Gate of Mist) `[W]`.
5. **Flawless boss → Crimson/Scarlet relic room** `[W]` — defeat a boss without losing HP (shield loss is fine) to get 3 Epic relics, each costing Max HP.
6. **Camp meta** `[W]` — 7 NPCs (talents, research, spell activation, spell disabling, sets, training ground), 9 sets.
7. **Dark-parody tone** `[X]` — intro gag "Magic: An Otherworldly Life from the Toilet?"; rewrite for the clean-room version.

---

## 2. Scope — LOCKED: full 1:1 mechanics clone, built as vertical slices

Full scope is locked, so slices are an ordering tool, not a cut line. Every slice ends playable.

### Slice 1 — vertical slice (camp → Ch1 → boss → death → meta spend)
- [ ] Twin-stick movement + aim, wand swap, interact, potion hotkeys; casting slows movement `[W]`; recoil `[W]`.
- [ ] Wand executor with full stat set (§4.2) incl. post-slot energy.
- [ ] 20 spells (all have wiki stats): Magic Bullet, Laser, Rock 'n' Ball, Butterfly, Rainbow, Fuse, Arcane Explosion, Black Hole, Meteor, Shadow Serpent, Floating Wisp, Thunderstorm, Boomerang Blade, Sword of Judgement, Arcane Nova, Mana Absorption, Shining Star Arrow (charged), High-pressure Stream (continuous), Pop, Pillar of Light.
- [ ] 16 boosts: Volley, Multi-Shot, Split, Track, Automatic Navigate, Penetration, Rebound, Reflection, Duet, Echo, Serial, Dazzling Fireworks, DMG Enhanced, Energy Saving Mode, Venom Crystal, Frost Crystal.
- [ ] 8 passives: Magic Reservoir, Tranquil Bloom, Magic Vine, Forced Cooldown, Capacity Expansion Stone, Charge Mode, Resonance Rune, Wand Spirit.
- [ ] 12 wands: Old Wand, Arcane Staff, Swiftcaster Wand, Shattered Scepter, 777, Defiant Nature, Trident, Wand of Focus, Clearwater Resonance, Omen of Doom, Shard of Time, Novice's Grimoire.
- [ ] 20 relics incl. Prospector's Pickaxe/Vest, Endless Chest, Replica Gloves, Soulbone Mantle, Hourglass of Time, Drill, Merchant's Bauble, Beast Fangs, Demon Mask, Blade of Fury.
- [ ] 10 curses + 10 potions; cursed/locked/spike chests; keys; coins.
- [ ] Rooms: first room, combat, Spell, Relic, Gold, Health, Fountain, Shop, crafting; Ch1 enemies (spiders, slimes, flies, mushrooms) + 6 Ch1 bosses; Crimson room.
- [ ] Camp with Vivian (talents) + training ground dummy; Crystals + Blood of the Old Gods.
- [ ] Sets: Original, Magician, Summoner.

### Slices 2–5 (to parity)
- Slice 2: Ch2 + Ch3 bosses/enemies, elites, side rooms, Carrion Eater/Wormhole unique spells, remaining trigger spells (Autonomous Grimoire, Twine), summon boosts.
- Slice 3: all NPCs (Lyon, Lilian, Gina, Leah), all 9 sets, difficulties Easy→Nightmare 3, achievements.
- Slice 4: Ch4 (Hard+), Author easter egg, remaining spells/wands/relics/curses/potions, Chapter 5 content `[X]`.
- Slice 5: polish — balance, perf, localization, controller, skins.

---

## 3. Tech Decisions (LOCKED: web)

- **Stack (LOCKED):** Vite + TypeScript + **PixiJS v8** (WebGL batching for thousands of projectiles; `ParticleContainer` for bullets/VFX). Custom circle collision + spatial hash; no physics engine.
- **Architecture:** fixed-timestep simulation (60 Hz) decoupled from rendering; plain ECS-style arrays for projectiles/enemies with object pooling. Deterministic seeded RNG per run (room gen, loot, crits) so bugs and builds are reproducible.
- **Data pipeline `[D]`:** `wiki/data/*.json` (raw, original names) → `scripts/build-data.ts` normalizes into typed defs (§10), applies `data/names.json` (original → clean-room display names), validates with zod → `public/data/*.json`. Game code never reads wiki files directly.
- **Input:** KB+M first (WASD, mouse aim/fire, wheel/Q swap wand, E interact, Space set-skill, 1–4 potions); Gamepad API twin-stick second.
- **Hosting (LOCKED): GitHub Pages**, static build only.
  - Vite `base: '/<repo-name>/'` (or `'/'` if the repo is `<user>.github.io`). Load runtime data with `` `${import.meta.env.BASE_URL}data/spells.json` ``, never absolute `/data/...` paths — they 404 under a project-page subpath.
  - Deploy with `.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm run build:data` → `npm run build` → `actions/upload-pages-artifact` (`dist/`) → `actions/deploy-pages`. Repo Settings → Pages → Source: GitHub Actions.
  - Single page, no client routing → no 404.html SPA hack needed.
  - `localStorage` is shared by every project page on `<user>.github.io`: prefix all keys (`mc-clone:v1:*`) and version the save schema.
  - Limits: published site ≤ 1 GB, ~100 GB/month soft bandwidth — keep atlases compressed (WebP) and avoid shipping audio masters.
  - Free-plan Pages needs a public repo, so `wiki/` becomes public: keep CC BY-SA attribution (`wiki/README.md` with source URL + license); only renamed stats and rewritten text reach `dist/`.
- **Persistence:** meta progress in `localStorage` (versioned schema); run snapshot saved on room entry (the original saves only after the first choice room `[W]`, Reboot Key note).
- **Test harness:** headless simulation of a wand vs. training dummies to reproduce wiki DPS ranges (§4.6).

```
wiki/                         # mirror + fetch script (source of truth)
scripts/build-data.ts
data/names.json               # clean-room rename map
public/data/{spells,wands,relics,curses,potions,enemies,rooms,sets,npcs}.json
src/core/{Game,Loop,Rng,Pool,SpatialHash}.ts
src/run/{RunManager,RoomGen,Loot,Shop,Crafting}.ts
src/combat/{WandController,SpellChainExecutor,Payload,DamageFormula,TickRate,StatusEffects}.ts
src/combat/spells/*.ts        # one behaviour per spell id
src/meta/{Camp,Vivian,Lyon,Lilian,Gina,Leah,Sets,Achievements}.ts
src/ui/{Hud,WandEditor,Backpack,RelicPanel,Tooltips}.ts
```

---

## 4. Core Mechanics Spec

### 4.1 Movement & combat
- Top-down twin-stick; casting reduces movement speed (Elven Ears removes it) `[W]`; spells produce recoil (Titan's Pauldrons −33%, Book of Tranquility none while standing, Restless Heart reversed, Unstable Balance curse +) `[W]`.
- Hazards `[W]`: ground spikes and venom (Knight's Boots immune), pits (flight immune: Sprite Wings, Levitation Potion, Soul Set, Witch's Broomstick), poison/slow puddles, traps, destructible objects (hide coins/chests; Thunderstorm won't target them).
- **Indiscriminate damage** `[W]` (Adava Keravda, Deceptive Mine, Meteor) hurts the player; Knight's Helm reduces it, Sacrificial Dagger cuts self-damage to 1%. Venom pools on the ground hurt the player and summons.
- Invincibility sources `[W]`: Lightning Dash while casting, Dashing Ear (0.8 s on hit), Knight series (8 s per room), Invincibility Potion (8 s), Swordsman Cloak sprint.
- **No generic dodge-roll** `[X]` — Space is a set-relic skill (Bi'an recall, Swordsman Cloak sprint, Original Shape butt slam) `[W]`. Default for sets without a skill: none `[D]`.

### 4.2 Wand model `[W]` (ranges from `wiki/data/wands.json`)
| Stat | Range on wiki | Notes |
|---|---|---|
| Max MP | 40 (Featherweight) – 350 (Omen of Doom) | Separate pool per wand. Exceptions: Energized Orb lends its 250 MP when others run dry; Arcane Barrier wands share MP; Warlock's Satchel / Collector's Staff list 0 (special, unknown) |
| MP regen/s | 1 (The Sourceless), otherwise 6–23 | Global modifiers: Natural Convergence +3, Sorcerer's Oath +5, Shard of Time +8 for all wands; held/unheld multipliers (Swiftshot Staff ×20%/×150%, Restless Fey ×30%/×180%, Wand of Focus ×150%/×50%) |
| Cast interval | 0.05 – 1.5 s (Energized Orb 0) | Delay between cast groups |
| CD (recharge) | 0.05 – 1.5 s | After the last group; Forced Cooldown ×60/30/15%; Over Scatter −0.15/−0.25/−0.4 s; Laser −0.1 s |
| Scatter | −360° (Defiant Nature: always cast in reverse) … +140° | Precise Shot −30/−60/−100° |
| Simultaneous firing/casting | 1 – 5 | Harmonic Resonance 5, Stellar Drift 5, Trident/Siegemaker/Soul-Devouring Orb/Trichord Lute 3, Sourceless 3 |
| Final DMG | ×30% (Clearwater) – ×120% (Rusty Blaster, Wand of Focus) | Multiplicative "final" bucket (§4.4) |
| MP cost mult | ×30% (Clearwater) – ×200% (Stellar Drift) | Microcosmic Embrace: all wands ×80% |
| CRIT rate | +15% Legion Banner, +20% Stellar Drift, +70% Shapeshifter | |
| Spell slots | **not on the wiki** | Must be measured or designed per wand `[D]`; Drill +1–5 per wand, Capacity Expansion Stone +3/4/6 |

**Post slot (secondary slot)** `[W]` charges energy from a trigger; Infusion Hand Seal raises charge efficiency 20%/level. Triggers seen on the wiki:
per spell cast (Featherweight 3, Frenzy Enchanter 4, Handy Wand 3, Clearwater 1.5) · per enemy hit (777 1.7, Double Flute 2.2, The Lightless 3.3) · per kill (Festive 20, Soul-Devouring Orb 30, Dormant Whisker 90, The Faultless 130) · per meter moved (Time Stasis 2, Conch Whistle 3, The Shadeless 5, Omen of Doom 7.5) · per second (Legacy of Ancestors 15, Kingdom's Guardian 35, The Wordless 66) · per second standing still (Book of Tranquility 20) · per hit taken (Vow of Honor 33, The Formless 100) · per 45 damage dealt (Rusty Blaster 20, Voltage Stone 22).
Energy threshold and what the post slot casts are `[X]`: working assumption — when full (100 energy `[D]`), it casts the spells right of the post-slot divider without MP/interval/CD.

**Execution loop `[D]`** (matches wiki behaviour, exact edge cases `[X]`):
1. Read slots left→right; a cast group takes `simultaneous` castable spells, pulling boosts/triggers into the group they modify.
2. Spell MP cost is paid per group; if MP is insufficient the group waits `[X]`.
3. After a group: wait cast interval. After the last group: wait CD, restart at slot 1.
4. Passives apply to the whole wand regardless of position.
5. Wand Spirit wands auto-fire and cannot be fired manually `[W]`; Resonance Rune casts this wand when another wand fires (25/50/100%, 20/30/40% free), and resonance cannot chain `[W]`.

### 4.3 Spell categories & chaining `[W]`
- **Types:** Projectile (incl. continuous-casting: Fierce Dragon Breath, High-pressure Stream, Lightning Dash, Ray of Disintegration; charged: Shining Star Arrow; indiscriminate: Adava Keravda, Deceptive Mine, Meteor), Summon, Boost, Passive.
- **Multi-slot spells:** Condensed Water Bubble 2, Core of Flame 2, Essence of Soul 2, Fusion Summon 2, Arcane Barrier 3, Area Boost 4.
- **Trigger spells** (build a payload): Duet, Fuse, Echo, Serial, Dazzling Fireworks, Twine, Arcane Nova, Autonomous Grimoire. The payload takes as many spells as the current simultaneous-cast count; Multi-Shot and Duet bonuses do not cross payload boundaries.
  - Fuse: rune flies to impact/range end, then casts the first projectile to its right at ×90/80/70% MP (turns Arcane Explosion into artillery).
  - Duet: casts right spell when left spell completes; right inherits 30/60/120% of left's damage.
  - Echo: on left hit, casts right at 80/65/50% MP, min interval 0.3/0.2/0.1 s.
  - Serial: casts right while left is flying at 70/55/40% MP.
  - Dazzling Fireworks: on left completion casts right 4× at 35/45/60% damage (4× MP).
  - Arcane Nova: spinning star casts first right spell 20× at ×500% MP, −50% damage.
  - Autonomous Grimoire: summon (limit 3) that casts the first right spell; regen = 50/75/110% of summoning wand. Grimoires can summon grimoires (Grimoire→Grimoire→Pop = 45 Pops). Stacking a 4th Grimoire reportedly crashes the original — cap depth `[D]`.
- **Trajectory boosts** (Track → cursor, Automatic Navigate → homing 12/22/38°/m, Orbit → circle caster) override earlier trajectories.
- **Elemental boosts** (Venom, Frost, Slime, Core of Flame, Core of Thunder): all effects apply; appearance picks one randomly.
- **Penetration vs Reflection:** Reflection wins when both exist. Penetrating spells only re-hit a target after leaving its hitbox, except Lightning Dash/Boomerang Blade (3 hits/s while inside).
- **Volley:** simultaneous +2/+3/+4; each extra simultaneous spell multiplies MP cost ×78/73/68% and adds +10/15/20° scatter (Full Salvo page example: 2 extra → ×0.8²).
- **Multi-Shot:** ×150% MP, +1/+2/+4 casts. **Split:** ×150% MP, 3/5/8 copies at 33% dmg on completion (net 200/267/367%). **Over Scatter:** simultaneous 5/8/12, +60/90/150° scatter.
- **Mimicry Cube** copies the right spell capped at its own level; **Area Boost** copies the right spell into the leftmost locked slot of every held wand; **Magic Upgrade** +1 level to the first spell on each side (cap ++).
- **Mana Absorption** refunds the casting wand's spent MP on first hit, divided across released projectiles — net-positive only when several sources release it (Arcane Nova + Mana Absorption, Dazzling Fireworks + Mana Absorption, Multi-Shot + projectile + trigger + Mana Absorption).
- **Tick rates (hits/s):** Skull of the Cthulhu 3, Lightning Dash 3, Boomerang Blade 3, Thunderstorm 4, Black Hole 4, Shadow Serpent 4, Ray of Disintegration 20, Fierce Dragon Breath 22, High-pressure Stream 30. Fusion Summon multiplies Skull tick rate (2×, 3×…).
- **Summons:** Summon Limit setting (on = stop at cap; off = oldest replaced). Summon boosts: Troll Serum, Parasite, Indomitability, Cadaver Explosion, Umbilical Cord, Essence of Soul (per-summon new ability), Fusion Summon (merge two, +100% stats). Merlin's Beard doubles summon cap.

### 4.4 Damage formula `[W]` (Damage Calculation page — implement exactly)
```
dmg = ( ( (Base + BaseIncrease) × SpellDmgMult + Mirrored )
        × FinalMult × ConditionalFinalMult
        + BubbleGrowth )
      × Crit × EnemyDamageTakenDebuff

BaseIncrease        : Enchanting Coin (+10%/coin), Fierce Dragon Breath ramp, Supernova charge, Blast Surge (radius spells), Dimension Walker (current MP)
SpellDmgMult        : ADDITIVE — relics, curses, DMG Enhanced (+25/50/100%), Overload, Energizer Wand; MULTIPLICATIVE — Reflection (×80/85/90%), Energy Saving Mode (×75/75/80%)
Mirrored            : Duet payload damage (DPS spells spread it over ticks, see duetFactor)
FinalMult           : Capacity Expansion Stone (×75/80/85%), wand Final DMG, Thunderstorm single-target (+130/160%)
ConditionalFinalMult: Shining Star Arrow crit threshold (×150/170/200%), Skull of the Cthulhu 1 + MaxMP×0.001/0.002 (+/++); unlike Final, it carries into Duet
BubbleGrowth        : Condensed Water Bubble lifetime_s × 0.2/0.25/0.35 × 100/170/290 × SpellDmgMult (without Energy Saving)
Crit                : ×2 default; Blade of Fury 250–450%
EnemyDebuff         : Magic Bullet+ ×1.5 (4 s), ++ ×2 (8 s)

DuetMirror = (((Base + BaseIncrease) × SpellDmgMult) + Mirrored + BubbleGrowth) × ConditionalFinalMult × 0.3/0.6/1.2
duetFactor : normal 1, Boomerang 1, Lightning Dash 1, Skull 1.7 (text elsewhere says 1.75), Thunderstorm/Black Hole/Shadow Serpent 0.25,
             Ray of Disintegration 0.05, Fierce Dragon Breath 0.045, High-pressure Stream 0.033
Rounding    : the original rounds after nearly every operation; order matters — use integer rounding per step `[D]`
```
- **Poison (Venom Crystal):** 1/2/4 stacks per hit lasting 3/4/5 s; stack DPS ignores all damage multipliers and cannot crit → favour hit rate. Reaper set ×2 stacks and no stack cap (1.0).
- **Burn (Core of Flame):** +100% spell damage; burn listed as 5% max HP/s (0.3% bosses) for 3 s — the infobox says 220 dmg/s for 2 s (conflict, §13).
- **Core of Thunder:** 15/30/40% chance on completion for +100/150/200% damage in 2.2/2.4/2.8 m; multiple cores take the highest chance and add damage.
- Other damage sources: Chain of Lightning 9/18/36 between simultaneous spells, Umbilical Cord 25/50/100 DPS along summon links, Strong Traction (crit pulls 1/2/4 enemies for equal damage), Electrified Crown, Ember-heart, Druid's Horn, Casket of Souls (65).

### 4.5 Crafting, reforging, upgrades
- **Craft** `[W]`: 3 identical spells → next level (Lv1 → + → ++). Example Magic Bullet dmg 10/13/16, MP 3/4/5. Reaper set auto-crafts backpack spells on door entry.
- **Spell Prototype** `[W]`: wildcard for Normal and Rare crafts; its level must match the target's level.
- **Uncraftable** `[W]`: Adava Keravda (levels from kills: 120 → +, 240 → ++), Mana Absorption, Enchanting Coin (also not reforgeable).
- **Reforge** `[W]`: Reforge Potion rerolls all backpack spells (not wand-slotted); Pandora's Box rerolls first 1/2/3 backpack slots per room; Reset Potion resets a chosen relic.
- **Forge room rules** `[X]`: 4 spells of one rarity → 1 random spell of that rarity, gold cost scaling; Reforge Furnace durability improved by Lyon's Reinforcement Module `[W]`. Design final rules `[D]` once measured.

### 4.6 Balance reference — community builds `[W]` (Builds page; training ground, Standardization wand `[X]`)
| Slots | Build | Base DPS |
|---|---|---|
| 2 | Shadow Serpent + Track | 120–150 |
| 2 | Arcane Nova + Mana Absorption | 400–1300+ (3 dummies) |
| 3 | Track + Fuse + Lightning Dash | 120–357 |
| 3 | Shadow Serpent + Echo + Mana Absorption | 400–520 |
| 3 | Autonomous Grimoire + Energy Saving Mode + Mana Absorption | 5800–6000 |
| 4 | Shadow Serpent + Track + Echo + Mana Absorption | 3000–3150 |
| 5 | Frost/Slime Crystal + Autonomous Grimoire + Butterfly + Serial + Hand of the Cthulhu | 340 (crowd-control spread) |
| 5 | Venom Crystal + Umbilical Cord + Laser + Dazzling Fireworks + Pillar of Light | 1100–3700 (1 dummy), 5000–11700 (2) |
| 5 | Resonance Rune + Orbit + Umbilical Cord + Pillar of Light | 200–205 |
| 6 | Track + Frost Crystal + Multi-Shot + Arcane Nova + Multi-Shot + Boomerang Blade | 350–1700 (1), 900–3300 (3) |
| 6 | Automatic Navigate + Arcane Nova ×2 + Mana Absorption + Echo + Black Hole | 10,000 (3) |
| 6 | Venom Crystal + Autonomous Grimoire ×3 + Fuse + Black Hole | 5500–8400 (3) |
| 6 | Venom Crystal + Autonomous Grimoire ×3 + Reflection + Laser | 5400–13700 (3) |

Acceptance for the combat engine: the headless harness reproduces each row within ±25% `[D]`. Achievement "Dominant firepower theory" = 100,000 DPS `[W]`.

---

## 5. Content (implement as data; full tables in `wiki/REFERENCE.md`)

### 5.1 Spells `[W]` — 99 listed, 84 with stats
- **Projectiles (21 + 4 continuous + 3 indiscriminate):** Arcane Explosion, Arcane Nova, Bing's Arrow, Black Hole, Boomerang Blade, Butterfly (3/4/5 homing shots), Condensed Water Bubble, Enchanting Coin, Evil Slayer Sword, Floating Wisp, Fuse, Laser, Magic Bullet, Mana Absorption, Rainbow (7 shots, 1 penetration), Rock 'n' Ball, Shadow Serpent, Shining Star Arrow, Supernova, Sword of Judgement, Thunderstorm · Fierce Dragon Breath, High-pressure Stream, Lightning Dash, Ray of Disintegration · Adava Keravda, Deceptive Mine, Meteor.
- **Summons (6):** Autonomous Grimoire, Giant Troll, Hand of the Cthulhu, Pillar of Light, Pop, Skull of the Cthulhu.
- **Boosts (46):** Accelerator, Automatic Navigate, Blast Surge, Cadaver Explosion, Chain of Lightning, Collapse Crystal, Core of Flame, Core of Thunder, Dazzling Fireworks, DMG Enhanced, Duet, Echo, End Teleport, Energy Saving Mode, Enlarge Spell, Essence of Soul, Fall, Free Revolution, Frost Crystal, Fusion Summon, Hover, Indomitability, Magic Upgrade, Mimicry Cube, Multi-Shot, Orbit, Over Scatter, Overload, Parasite, Penetration, Precise Shot, Range Enhanced, Rebound, Reflection, Self Tracking, Serial, Slime Crystal, Split, Strong Traction, Time Duration Enhanced, Track, Troll Serum, Twine, Umbilical Cord, Venom Crystal, Volley.
- **Passives (19):** Arcane Barrier, Area Boost, Bi'an Flying Sword, Boundary Stone (Cast/Move/Stand/Time), Capacity Expansion Stone, Charge Mode, Forced Cooldown, Magic Reservoir, Magic Vine, Prism Core, Resonance Rune, Rune Hammer, Spell Prototype, Tranquil Bloom, Uniform Scattering, Wand Spirit.
- **No wiki data (need in-game research):** Supernova, Giant Troll, Collapse Crystal, Blast Surge, End Teleport, Free Revolution, Overload, Self Tracking, Twine, Boundary Stone ×4, Prism Core, Rune Hammer, Uniform Scattering (+ Dimension Walker, mentioned only in formulas).
- **Rarity & acquisition** `[W]`: Normal/Rare/Epic/Unique. All obtainable from chests, side rooms, starting wands, shops — except Epic (never in shops/starting wands) and Unique (Enchanting Coin from the "Vines" armor-spider in Ch2/Eternal Fortress; Blast Surge, Self Tracking, End Teleport, Free Revolution, Enlarge Spell, Uniform Scattering from the Carrion Eater/Wormhole in Ch3; Bi'an Flying Sword and Bing's Arrow via sets). Epic chance per Spell room: 1% base; with Lilian's Spell Focus 0.66% per option, Focus+ 0.5%; ×1.5 on Nightmare 1–2, ×2 on Nightmare 3.
- Optional numeric IDs from the original's data (1001+ projectiles, 2001+ summons, 3001+ boosts, 4001+ passives) `[X]` — use string slugs as primary keys `[D]`.

### 5.2 Wands `[W]` — 97
Stats in `wiki/data/wands.json`. Notable passives: Microcosmic Embrace (all wands MP ×80%), Natural Convergence / Sorcerer's Oath / Shard of Time (all wands regen +3/+5/+8), Expanding Container (all wands Max MP ×130%, simultaneous 2), Deed Witness (all wands radius +50%), Energized Orb (MP backup for other wands), Novice's Grimoire (summon MP ×90%), Shamanic Dagger (MP ×70%, final ×70%), Quadruple Staff (4 directions, MP ×150%, final ×50%), Witch's Broomstick (flight while held), Conch Whistle (+20% move), Swift Spellblade (+40% move), Sacrificial Dagger (self-damage 1%), Tricolor Scepter / Radiant Bouquet (random colors), Ripple Wand (5% instant MP refill). Sources `[W]`: elite and boss drops, shops. **Slot counts missing** (§4.2).

### 5.3 Relics `[W]` — 85 + 5 series
Rarities Normal / Rare / Epic / Unique (set relics); max level 1–10; leveled by duplicates, Dusty Treasure, Relic Potion; a relic when every common/rare/epic is maxed becomes **Mystical Artifact** (+1 Max HP per level). Relic rooms offer 1 of 3 (Fortune Earrings +1/2 options, Profanity curse −N, Hexagonal Die rerolls). Epic relic chance 1% on Nightmare 2, 1.6% on Nightmare 3.
**Crimson/Scarlet room Max-HP costs:** Blood Key 25 (forces the room after the final chapter boss), Replica Gloves 28, Prospector's Vest 32, Hourglass of Time 35, Sprite Wings 42, Silver Key 58, Octagonal Die 66, Silver Compass 68, Soulbone Mantle 99 (others unknown).
**Series** (all parts owned): Knight (Boots, Breastplate, Helm) — 8 s invincibility per room · Soul Bone (Casket of Souls, Soulbone Armor/Mantle/Crown) — 20% of temp shield becomes permanent per room · Gold Rush (Prospector's Gloves/Pickaxe/Vest/Goblet) — non-boss units touching you become 1 coin · Merlin (Beard, Boots, Hat, Robe) — Max MP +300 · Tree Spirit (Pendant, Treant Shoulderguards/Robe/Circlet) — Max HP +100.

### 5.4 Curses `[W]` — 46 (28 Normal, 18 Rare)
Sources: cursed chests (curse previewed unless hidden), certain key rooms, Vanished self-removes. Removal: Holy Water (1 random), Purification Potion (all; lose coins/keys/shield), Tears of the Goddess (all, if 5 different curse symbols), Ward Charm (33%/room), Lockpick Potion opens cursed chests curse-free. Magnitudes are `int1`/`float1` placeholders on the wiki → every curse value is `[D]` until measured. Wiki trivia also names "Brutal Reproduction" (doubles non-boss spawns, even the Author) and "Minefield" (bombs break metal boxes) — likely old names of Savage Proliferation / Explosive Pursuit `[X]`. Achievement "Kingdom come" = 15 curses at once.

### 5.5 Potions `[W]` — 31
One potion slot at start; Lyon's Potion Bandolier +1/+2/+3 (6/18/56 Blood); Bird Beak Mask relic +1 and a potion every 2 battles. Sources: enemy/chest/boss drops, Shop, Potion Shop side room. Notable: Serpent's Blood heals 1–25; Agility +0.6 move speed (permanent); Crystal +1 regen (permanent); Unstable Red/Blue −5 or +15 Max HP/MP; Midas turns non-boss enemies to coins (works on Author phase 1); Duplication doubles room pickups (pairs with Enchanting Coin); Petrification 30 s immunity, no firing. Potions the earlier draft listed but the wiki does not (Power, Crit, Chaos, Limit, Proliferation) are `[X]` post-2024 additions.

### 5.6 Currencies `[W]`
- **In-run (lost on death):** gold coins (1000 held = "Small target"), keys (Complex Locks = 2 per lock), HP, shield / temporary shield, diamonds (Depleted Diamonds turns them to coins).
- **Meta:** Crystals (enemy/boss/chest drops) → Vivian upgrades, Gina, Leah set upgrades. Blood of the Old Gods / "Ancient Blood" (boss drops) → Vivian talent unlocks, Lyon research, Gina. Chaotic Core → Lilian packs (source `[X]`).

---

## 6. World, Chapters, Rooms

**Chapters `[W]`** (names partly inferred from NPC text):
| Chapter | Access | Bosses (HP) | Notes |
|---|---|---|---|
| Camp | spawn | — | Portal, NPC row, training ground |
| 1 — Relic Forest? | camp portal | Giant Spider 650 (slowing webs), Wandering Worm 650 (charges), Deceiver 650 (mimics, turns invisible), Irate/Raging Eye 650 (bouncing, tracking rock'n'ball), Chaotic Wreckage/Disordered Remains 1700 (charges), Venomous Spider Egg 1500 (homing poison boulders) | Spiders, slimes, flies, mushrooms |
| 2 — Eternal Fortress? | beat Ch1 boss | Deceiver Type II 3000, Hatcher 3300, Master of Mind 3200 (captures your bullets), Cage 6000 | Vines (2100 HP) armor-spider drops Enchanting Coin |
| 3 | beat Ch2 boss | Void Imp 17,000, All-Seeing/Providence Eye 19,000 (chain nodes), The Indescribable/Unspeakable Thing 40,000 (face attacks inflict curses) | Carrion Eater "hole of rotting tongues" (unlocked via Lyon) trades a dropped spell for a Unique |
| 4 — Abyss of the Old | beat Ch3 on Hard | Skeletal Centaur 150,000, Abyssal Lord 290,000 | Hardmode also raises HP and changes patterns |
| Easter egg | Patch 0119, "ancient throne" | Author 1,000,000 (table) / 25,000,000 (page) | Five at once; phase 1 trollface is not a boss (Midas works); phase 2 bullet hell sees through invisibility; once per run, ends the run. Achievement "There's still time to cry" |
| 5 — Ancient Throne `[X]` | beat the chapter 4 boss on Hard+ | 3-room boss rush: two 1.5× rematches, then the Demon Lord (600k, 3 phases: `boss_demon_lord_p1-3`) `[D]` | Not documented on the wiki; implemented as our own design |

**Rooms `[W]`:** first room, Spell, Gold, Relic, Fountain, Health (Max-HP), Shop, crafting ("Proccess"), elite, boss, Crimson relic room (flawless boss), fountain/spring (Lyon's Secret Pathway: 50%/80% heal). Door icons reveal room type unless Gate of Mist. Explorer's Hat +1 door; Silver Compass guarantees chest/statue; Merchant's Bauble adds a special room at shops/crafting.
**Side rooms `[W]`:** combat-area (locked; key or event): cursed chest rooms, spinning fire wheels, assault courses, dark-room assault courses, button puzzles, memory sequences. Shop/WitchWorks side rooms: Potion Shop, Rune Circle. Boss-area: secret Blood rooms (flawless boss).
**Chests `[W]`:** Locked (key), Cursed (accept curse), Spike (10 HP, can kill), Unlocked (rare, hidden); Endless Chest 30% extra chest; Silver Key opens everything; Treasure Potion spawns one.
**Shop `[W]`:** items purchasable; Black Mark makes one free; Discount Potion; Refresh Potion; Lyon's Shop Refill 2/4/6/8 refreshes; Lethargic Shop curse −items. Exact inventory rules `[X]`.

---

## 7. Camp NPCs, Sets, Difficulty, Achievements `[W]`

| NPC | Function | Costs |
|---|---|---|
| Vivian | Talents: wand slots +1/+2/+3 (1/200/900 Crystals), inventory +1…+10 (6→168), healing on entry, then Blood-gated tiers (5/20/40/60 Blood): Max HP +5…+60, HP room +3…+15, initial coin +7…+84, coin room +10…+60%, relic/spell room rare ×125…×200%, Max MP +10…+100, MP regen +1…+5 | Crystals per level (table in `corpus.md`) |
| Lyon | Research: Secret Pathway (springs 50/80%), Encyclopedia, Potion Bandolier +1/2/3, Shop Refill ×2/4/6/8, Reinforcement Module (reforge durability), Keychain +1/2/3 keys, Berry Bush (Relic Forest), Treasure Vault (Eternal Fortress), Carrion Eater | Blood 1–72 |
| Lilian | Spell activation packs: Spell Focus (choose 1 of 3), Elemental (High-pressure Stream, Core of Thunder, Core of Flame), Supply (Evil Slayer Sword, Boomerang Blade, Capacity Expansion Stone), Triggered (Duet, Dazzling Fireworks, Serial, Echo), Relic (Lucky Bunny Ear, Octagonal Die), Channeling (Shining Star Arrow, Condensed Water Bubble, Fierce Dragon Breath), Master Summoner (Cadaver Explosion, Indomitability, Essence of Soul, Fusion Summon), Inspiration (Reflection, Sword of Judgement, Arcane Barrier) | Chaotic Core 1–4 |
| Gina | Disable up to 20 spells for runs; 5 free, the n-th extra costs 10n Crystals or n Blood | |
| Leah | Sets (starting loadouts) + set upgrades | Crystals (Soul Set 60/120) |
| Training ground NPC | Try any seen spell/wand, DPS test | free |
| Nimiao | Listed, no function documented | — |

Clone deviation `[D]`: Lilian packs expand the loot pool permanently in the original `[X]`; add a per-pack toggle.
Older wiki page "Upgrade Window" (blue girl; wand slots 551, backpack 195, coins 370, HP 425 Crystals; full 48 Blood + 3051 Crystals) describes a pre-Vivian version — use Vivian's table.

**Sets (9)** — each usually carries a unique, non-reforgeable relic:
| Set | Unlock | Kit |
|---|---|---|
| Original | default | Magic Bullet wand |
| Magician | rescue Leah | Magician's Robe (cast up to 5 m away, radius −30%) + Arcane Explosion |
| Summoner | complete Ch2 | Summon damage/heal aura (likely Druid's Horn relic `[X]`) |
| Dash | complete Ch3 on Hard | Lightning Dash, no relic |
| Soul | hold 3 wands with Wand Spirit | Mirror of Vision: flight, +1/2/3 wand slots, every wand gets a locked Wand Spirit+, starts with Ethereal Wands + Butterfly; immune to pits, puddles, Timid/Unstable Balance/Stiffened/Toppling Balance |
| Melee Mage | 300 kills with Evil Slayer Sword | Swordsman Cloak: Space sprint (invincible, free cast, 2 s CD, 1–3 charges), sword MP ×90% |
| Bi'an (Warm Snow crossover) | kill any boss with Sword of Judgement | The Nameless wand + Sword of Judgement + Bi'an Flying Sword; Space recalls swords (5 s CD); 1 sword per 25 wand Max MP |
| Reaper (Backpack Battles crossover) | 1500 venom stacks (not on the scarecrow) | Reaper relic: poison stacks ×2/×3, auto-craft backpack on door entry; Shadow Serpent + Venom Crystal |
| Bing | unlock 6 sets | Bow with 3 Bing's Arrow (big-arrow volley every 50 casts); Original Shape: butt slam 50% max HP (10% bosses) in 3 m, 10 s CD (Leah page: 9/8 s), resets on kill; gong SFX on hit |

**Difficulties:** Easy, Normal, Hard (unlock: beat the Unspeakable Thing on Normal), Nightmare 1–3.
**Achievements (15):** Magicraft (launch), Kingdom come (15 curses), Bingo (two-star spell), SSR! (epic spell), What's this? (special spell), Is that all? ×6 (finish Easy/Normal/Hard/NM/NM2/NM3), Small target (1000 coins), Dominant firepower theory (100k DPS), Try and die (die to indiscriminate damage), There's still time to cry (kill the Author).
**Skins/DLC `[X]`:** Halloween, Spring Festival, Summer packs; DAVE THE DIVER crossover — stub only.

---

## 8. Art / Audio / UI / Perf

- **Art (LOCKED: `assets/` is the single source of truth):** minimalist Pillow-generated pixel art (`tools/gen_art.py` → `assets/`, ~1000 PNGs, 112 animation groups, deterministic). 16 px sprites, 24 px player, 48 px bosses, rendered ×4 (integer scale, nearest-neighbour). Every attack is `effects/telegraph_*` 0.3 s → `windup_flash` 0.1 s → projectile (`projectiles/<base>_f*` + `overlays/ov_*` + `effects/trail_*`) → `impact_*_f0-2`; player = cyan, enemy = magenta, never mixed; boss telegraph variants `*_telegraph.png`. Conventions: `assets/AI_GUIDE.md`, `assets-src/ART_DIRECTION.md`.
- **Audio:** procedural WebAudio SFX (`src/core/audio.ts`), no audio files; music not implemented.
- **UI (LOCKED: diep-style DOM overlay, modelled on shrimpsooup2/infinitetower):** a `#ui` layer over the canvas — Ubuntu Bold, white text with a dark outline, two-tone pastel buttons (`.btn` blue/red/green/gold/purple/grey), translucent dark panels, pill counters (HP, shield, coins, keys, crystals, blood, cores, room), rounded MP bars **per wand** (MP belongs to wands, not the character), toasts, banners, rarity-bordered spell/relic cards with tooltips, modal panels (Bag, Forge, Depart, NPCs, Pause, End). Sprites in the UI are `assets/` icons (`icons/**`, `wands/**`, `ui/door_icon_*`); the chrome is CSS (`src/ui/style.css`). World background is the reference's flat grey with a faint grid.
- **Perf targets `[D]`:** 60 fps with 5,000 live projectiles on a mid laptop; pooling, spatial hash, off-screen culling, particle budget, damage-number aggregation. Hard caps on nesting (Grimoire depth, payload recursion) to avoid the original's crash cases.
- **Localization `[D]`:** English first; string tables keyed by id so the rename map and future languages are data-only.

---

## 9. Milestones (each ends with a demo + acceptance check)

| # | Weeks | Deliverable | Done when |
|---|---|---|---|
| P0 | 1 | Vite+TS+PixiJS scaffold, fixed-step loop, input, pooling, `scripts/build-data.ts` generating typed JSON from `wiki/data`, GitHub Pages deploy workflow | `npm run dev` shows player moving/aiming; data build validates all 84 spells/97 wands/85 relics; push to `main` publishes a working build at `https://<user>.github.io/<repo>/` |
| P1 | 2–4 | Wand executor, payload/trigger system, damage formula, tick rates, training dummies + headless DPS harness | Slice-1 spells behave per §4.3; §4.6 builds reproduce within ±25% |
| P2 | 5–7 | Rooms/doors, Ch1 enemies + 6 bosses, chests/keys/coins, relics/curses/potions (slice-1 lists), shop, crafting, Crimson room | Full Ch1 run from camp to boss and back |
| P3 | 8–10 | Camp: Vivian, training ground, Crystals/Blood, saves, Original/Magician/Summoner sets | Meta upgrades persist across reloads and change the next run |
| P4 | 11–18 | Ch2–Ch4, elites, side rooms, remaining NPCs/sets/content, difficulties, achievements, Author | Content counts match §0 wiki counts; Hard/Nightmare scaling works |
| P5 | 19–24 | Research-gap content (§13), balance, perf pass, controller, skins stub, localization plumbing | Perf target met; no `[D]` placeholder values left untracked |

---

## 10. Data Models (targets of `scripts/build-data.ts`)

```ts
type Rarity = 'Normal' | 'Rare' | 'Epic' | 'Unique';
type Lv3<T> = [T, T, T];                       // levels 1 / + / ++
type Src = 'wiki' | 'external' | 'design';    // provenance of every tunable number

interface SpellDef {
  id: string; wikiName: string; name: string;  // name = clean-room display name
  type: 'Projectile' | 'Summon' | 'Boost' | 'Passive';
  rarity: Rarity; slots: number;                // 1 unless multi-slot
  castMode?: 'instant' | 'continuous' | 'charged';
  mana?: Lv3<number | string>; damage?: Lv3<number>; dps?: boolean; tickRate?: number; duetFactor?: number;
  critRate?: Lv3<number>; radius?: Lv3<number>; cd?: Lv3<number>; scatter?: Lv3<number>; shots?: Lv3<number>;
  hp?: Lv3<number>; summonLimit?: Lv3<number>;
  trigger?: 'duet' | 'fuse' | 'echo' | 'serial' | 'fireworks' | 'twine' | 'nova' | 'grimoire';
  indiscriminate?: boolean;
  upgrade: 'craft' | 'kills' | 'none';          // Adava Keravda = kills (120/240)
  levels: Lv3<string>;                          // rewritten effect text
  src: Src;
}
interface WandDef {
  id: string; wikiName: string; name: string;
  mp: number; regen: number; interval: number; cd: number; slots: number;   // slots: design until measured
  scatter?: number; simultaneous?: number; finalDmg?: number; mpCostMult?: number; crit?: number;
  global?: Partial<{ mpCostMult: number; regenAdd: number; maxMpMult: number; radiusMult: number }>;
  heldRegenMult?: [held: number, stowed: number];
  postSlot?: { on: 'cast' | 'hit' | 'kill' | 'meter' | 'second' | 'stillSecond' | 'damaged' | 'dealt45'; energy: number };
  flags?: Array<'reverse' | 'flight' | 'quad' | 'randomColor' | 'selfDmg1pct' | 'mpBackup'>;
  src: Src;
}
interface RelicDef {
  id: string; wikiName: string; name: string; rarity: Rarity; maxLevel: number;
  levels: string[]; series?: 'Knight' | 'SoulBone' | 'GoldRush' | 'Merlin' | 'TreeSpirit';
  crimsonCostMaxHp?: number; setRelic?: string; activeCooldown?: number; src: Src;
}
interface CurseDef { id: string; wikiName: string; name: string; rarity: 'Normal' | 'Rare'; params: number[]; selfRemoving?: boolean; src: Src }
interface PotionDef { id: string; wikiName: string; name: string; duration: 'instant' | 'timed' | 'untilDoor' | 'permanentRun'; seconds?: number; src: Src }
interface EnemyDef { id: string; wikiName: string; name: string; hp: number | null; chapter?: number; boss?: boolean; src: Src }
interface SetDef { id: string; unlock: string; startingWands: string[]; startingSpells: string[]; relic?: string; skill?: string }
```

---

## 11. Risks

- **Scope (full 1:1):** 99 spells × 97 wands × 85 relics interaction matrix. Mitigation: one behaviour module per spell + the headless harness as regression suite; slices keep a playable build.
- **Unknown numbers:** wand slot counts, curse magnitudes, post-slot thresholds, forge rules, 16 undocumented spells, `???` monster HP. Mitigation: every value carries `src`; `design` values are listed in a tuning sheet and replaced when measured.
- **Wiki accuracy:** community wiki, often stale (1.0 changes after 2024 edits). Mitigation: §13 conflict log; prefer later-edited pages; verify in-game for anything balance-critical.
- **Broken economy:** Arcane Nova/Mana Absorption/Echo loops are intended fun — keep them, but cap recursion depth and projectile counts for stability.
- **Performance:** pooling, spatial hash, culling, budgets (§8).
- **Legal/licensing:** clone mechanics only. Rename every spell/wand/relic/NPC/set (e.g. Rock 'n' Ball → "Boulder Chorus", Adava Keravda → "Final Verdict"); original art, audio, lore. Wiki text is CC BY-SA and the in-game flavor text is the developer's — rewrite all descriptions, never ship copied text; keep `wiki/` out of any published build.

---

## 12. Open Questions

- [x] Q1 Engine → web game (TypeScript + Vite)
- [x] Q2 Scope → full 1:1 mechanics clone
- [x] Q3 Art → custom AI-assisted, original
- [x] Q4 Goal → learning prototype, clean-room, rename everything
- [x] Q5 Renderer → PixiJS v8
- [x] Q6 Hosting → GitHub Pages (Actions deploy, §3)

---

## 13. Wiki Gaps & Conflicts (research backlog)

**Missing entirely:** wand slot counts; post-slot energy threshold/behaviour; forge/crafting-room rules and prices; shop inventory rules; room generation odds; Chapter 5 and final boss; stats for the 16 name-only spells; curse magnitudes (`int1`/`float1`); `???` HP for centipedes, bone worms, poison sacs, abyssal peepers; Chaotic Core source; Nimiao's role; Scarlet costs of several epics.

**Conflicts (wiki vs wiki):**
- Core of Flame burn: 5% max HP/s (0.3% bosses) for 3 s vs 220 dmg/s for 2 s.
- Author HP: 1,000,000 (boss table) vs 25,000,000 / 5,000,000 (Author page).
- Skull of the Cthulhu Duet factor: ×1.75 (text) vs ×1.7 (table).
- Rarity labels: page prose says Normal/Common for Core of Thunder, Reflection, Ray of Disintegration, Pillar of Light; infobox says Rare for the first three; Skull prose says Rare, infobox Normal. Use the infobox.
- Butterfly shots: infobox 3/4/5 vs prose "4".
- Boomerang Blade penetration at ++: 11 (level text) vs 12 (infobox).
- Bing set butt-slam cooldown: 10 s (relic) vs 9/8 s (Leah page).
- Meta upgrades: Upgrade Window (blue girl, older) vs Vivian tables — use Vivian.
- Boss names differ between list and table (Irate Eye/Raging Eye, Chaotic Wreckage/Disordered Remains, Venomous Spider Egg/Poisonous Spider's Egg, Psychic Master/Master of Mind, Providence Eye/All-Seeing Eye, Unspeakable thing/The Indescribable) — treat as aliases.

**Earlier-draft claims the wiki contradicts (fixed above):** Knight series 1 s → 8 s; Swiftcaster "all wands ×80%" is Microcosmic Embrace; 777 "+20% move" is Conch Whistle (777 charges 1.7 energy per hit); Serpent's Blood 1–40 → 1–25; Agility +10% → +0.6 speed; Arcane Barrier "30 MP = 1 dmg" → 3% of Max MP per damage point; Butterfly 3 → 3/4/5; "Producer" boss → the Author; "Leg Wire" spell does not exist on the wiki; P0 "Unity/Godot" contradicted the locked web stack.


---

## 14. Implementation status (Sep 28 2026)

Playable end to end: title → camp → run (chapters 1–3 on Normal; chapters 1–4 plus the Ancient Throne boss rush on Hard+;
the Scribe secret behind chapter 4) → death/victory → camp, with saves. Verified by `npm test` (41 tests), `npm run build`,
and browser runs (a god-mode bot walked chapter 1 into chapter 2; every boss was spawned and fought for runtime errors;
victory, death, crimson-room, shop, forge, NPC panels and the chapter 5 rush with all three Demon Lord phases were exercised).

**Done**
- Engine: fixed-step world, seeded RNG, pooled trails, enemy separation, projectiles breaking pots, integer-scaled view, fractional damage-over-time accumulation.
- Wand model per §4.2–4.3: groups, Volley/Over Scatter, Multi-Shot, Split, triggers (Duet, Fuse, Echo, Serial, Fireworks, Arcane Nova, Grimoire) whose payloads inherit every boost to their left except Multi-Shot (wiki rule), passives (Reservoir, Vine, Tranquil Bloom, Cooldown, Capacity Stone, Charge Mode, Resonance, Wand Spirit, Barrier, Area Boost, Bi'an sword), deck-rewriting boosts (Mimicry Cube, Magic Upgrade), Fall, Strong Traction, Fusion Summon, post-slot energy for all eight triggers, wiki damage formula.
- 83 spells with behaviours (projectiles, channels, charged, indiscriminate, summons), 97 wands, 85 relics (Reboot Key, Hunter's Talisman and Mystical Artifact are not offered), 46 curses, 31 potions — all with implementations, checked by tests.
- Content pipeline: wiki → `data/design.json` + `data/names.json` → validated `public/data` (original names and descriptions for everything).
- Rooms and rewards: doors with icons, spell/relic/gold/health/elite/boss/shop/forge/fountain/crimson rooms, chests (locked/spike/cursed), keys, potions, dice rerolls, restocks, discounts.
- Enemies: 26 archetypes over 4 chapters + elites; 17 bosses (15 wiki bosses, the Scribe, the Demon Lord) with telegraph → windup → fire sequences, `*_telegraph.png` swaps and multi-phase support; chapter 5 boss rush (design).
- Camp: Vivian (all 11 talents, 5 tiers), Lyon (8 researches), Lilian (8 packs, toggles — deviation: packs can be switched off), Gina (bans, 5 free), Leah (9 sets with unlock rules, Soul upgrades), training dummy + arsenal, achievements (15), difficulties Easy → Nightmare 3.
- UI: diep-style DOM overlay (HUD, Bag with click-to-place slots and tooltips, Forge, Depart, NPC panels, Pause/Settings, End screen, Title).
- Audio: procedural SFX and a small generative music track per chapter/boss (mutes with the Sound setting). Gamepad: sticks move/aim, RT/RB fire, A skill, X interact, Y bag, LB swap wand, Start menu.
- Visual identity for every ability: each projectile boost and trigger has its own overlay tag (`TAG_BY_SPELL`, covered by `tests/assets.test.ts`), a tinted aura on the boosted projectile and a rising icon per boost at the muzzle; event effects (chain arcs, hover countdown ring, thunder bolts at the true radius, echo/serial/duet/fireworks links, orbit/track/lock-on guides, status tints on enemies); every spell has its own cast flash, flight look and impact; summons, summon boosts and passives have auras/cues (`boostfx.ts`, `spellfx.ts`, `wandfx.ts`, `assets/AI_GUIDE.md` §4–5). All visuals are guarded by `vis` and never touch the simulation.
- Bag cast-order preview (`previewCasts` in `wand.ts`): shows the wand's repeating casts, which boosts join which cast, and boosts that never apply (nothing to their right). With simul 1 a boost only reaches the spell(s) of its own cast — the wiki's group rule.
- Test Mode: type `ayenbang0` (badge + F2 panel) for every spell, wand, relic, enemy and boss, god mode/infinite MP; nothing is saved while it is on (`src/core/cheat.ts`, `src/game/testmode.ts`, `src/ui/testpanel.ts`).
- Movement feel: recoil may only cancel a quarter of the walking speed and the casting slowdown is eased and held while fire is held, so walking and firing forward no longer stalls between casts (`Player.update`, covered by `tests/logic.test.ts`). Firing along the walking direction still slows you to 65% (wiki), it just no longer stops you.
- Smooth motion at any refresh rate: `World.renderFrame(alpha)` (called every rendered frame from `Game.frame`) draws the player and camera between the last two 60 Hz step positions, snapped to whole screen pixels. Before this the player froze for a frame and lurched (0 or 2 steps per frame, e.g. `4 8 4 4 8 0 12 0 12` screen px per frame, now `5 5 6`). Enemies and projectiles are still drawn at their step positions.

**Headless build check** (`npm run sim`; `STANDARD_WAND` in `scripts/sim-builds.ts` is a grid-fitted stand-in for the wiki's undocumented
"Standardization wand": 250 MP, 25 regen/s, cast interval 0.02 s, CD 0.2 s). "Sustained" = second half of a 20 s run, "peak" = best 1 s window.

| Build | Sustained / peak | Wiki | In band (±25%)? |
|---|---|---|---|
| Track + Shadow Serpent | 202 / 397 | 120–150 | no (too strong) |
| Arcane Nova + Mana Absorption (3 dummies) | 1629 / 1860 | 400–1300+ | yes (open-ended top) |
| Track + Fuse + Lightning Dash | 22 / 141 | 120–357 | no (peak only) |
| Shadow Serpent + Echo + Mana Absorption | 286 / 552 | 400–520 | yes (mid 419) |
| Track + Serpent + Echo + Mana Absorption | 1256 / 1389 | 3000–3150 | no |
| Autonomous Grimoire + Energy Saving + Mana Absorption | 4516 / 5490 | 5800–6000 | yes (78–95%) |
| Venom + Umbilical + Laser + Fireworks + Pillar | 9 / 25 | 1100–3700 | no |

4 of 7 builds are in or near the published band, so the §9/P1 acceptance ("all rows ±25%") is **not** met. The wiki gives no
poison damage per stack (we use 1 per second, `POISON_DPS_PER_STACK`), no Pillar/Umbilical geometry, and no test-wand stats;
the tests (`tests/sim.test.ts`) pin only the bands that hold.

**Not implemented / open** (also see §13): the 16 spells that have no wiki data (Supernova, Giant Troll, Collapse Crystal, Blast
Surge, End Teleport, Free Revolution, Overload, Self Tracking, Twine stats, Boundary Stones, Prism Core, Rune Hammer,
Uniform Scattering) and the Carrion Eater / Wormhole unique-spell trades that would hand them out; side rooms (fire wheels,
assault courses, puzzles), statues, Potion Shop, encyclopedia, Nimiao's function; skins/DLC; localization (English only);
reroll for Reboot Key; a proper rebalance pass. Wand slot counts, curse magnitudes, forge prices, shop stock, enemy stats beyond
the wiki HP column, chapter 5 and room odds are `[D]` design values. Chapter 4 on Normal is locked (opens on Hard+), so Normal
ends after chapter 3.
