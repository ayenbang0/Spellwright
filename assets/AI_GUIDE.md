# Assets — AI Handoff Guide (Magicraft Pixel Clone)

This folder is the **single source of truth** for all graphics: Pillow-generated, minimalist pixel art with transparency
(1px dark outline, 3-tone shading lit from the top-left, shared palette in `tools/art_core.py`).

Regenerate any time: `python tools/gen_art.py && python tools/make_preview.py` — wipes and rewrites every PNG
deterministically, plus `filelist.txt` and `manifest.json`. Art rules: `assets-src/ART_DIRECTION.md`.
Generator modules: `art_core` (palette/helpers), `art_chars` (player, NPCs, enemies), `art_bosses`, `art_world`
(tiles, props, pickups), `art_fx` (projectiles, overlays, effects), `art_ui` (font, panels, HUD), `art_icons`
(spell icons), `art_items` (wands, relic/curse/potion icons).

## 1. Folder map (relative to `assets/`)

```
player/      player_idle_f0-3, player_walk_f0-5, player_cast_f0-2, player_death_f0-5, player_hurt (24x24, faces RIGHT)
             legacy: player_idle|walk1|walk2|cast.png, dash_ghost.png
npcs/        vivian|gina|lyon|lilian|leah|trainer|nimiao + _f0-3 idle (16x20)
enemies/chN/ <name>.png + _f0-3 move loop + _hit.png (white flash), 16x16
             ch1 spider spider_red worm eye_small egg slime fly mushroom · ch2 deceiver hatcher mind_mage cage phantom
             armor_spider bat · ch3 void_imp seeing_eye absorber_flyer void_archer centipede · ch4 skeletal_warrior
             abyss_tentacle centaur_minion leech · ch5 flesh_mass throne_knight
enemies/elite_chN/<name>.png  gold-crown elites (others: base sprite + ui/elite_crown.png)
bosses/      boss_<name>.png + _f0-3 idle + _hit.png + _telegraph.png (48x48; legacy aliases are 50x50 centred)
             giant_spider wandering_worm deceiver irate_eye chaotic_wreckage spider_egg deceiver2 hatcher master_mind
             cage void_imp all_seeing_eye indescribable skeletal_centaur abyssal_lord demon_lord_p1-3 producer author
projectiles/ player shots are CYAN/white; enemy_bullet|enemy_diamond (12x12) and enemy_orb (16x16) are MAGENTA
overlays/    ov_fire|frost|venom|thunder|homing|rebound|pierce|multishot|volley|echo|duet|orbit|enlarge|fall (16x16)
effects/     telegraph_circle (32x32), telegraph_line (32x8), windup_flash, impact_small|medium|large_f0-2 (32x32, once),
             trail_cyan|fire|venom|void, muzzle_f0-2, hit_spark_f0-2, death_puff_f0-3, spawn_f0-3, arcane_ring_f0-3,
             slash_f0-2, level_up_f0-3, shadow (16x8), crit_star (8x8), heal_cross, shield_hex, poison_bubbles,
             burn_flames, freeze_crystals
tiles/       per chapter (camp forest purgatory void abyss throne): floor_<ch>[_v1-3], wall_<ch>, wallface_<ch>,
             decor_<ch>_0-3; door_open|closed, portal_f0-3, fountain_f0-3, pedestal, pit, spikes, breakable_pot,
             dummy, forge, shop_mat
pickups/     coin_f0-3, diamond_f0-3, crystal_meta_f0-3, blood_drop_f0-1, heart_f0-1, key, shield_cell,
             chest_locked|cursed|spike|open, potion_red|blue|green
ui/          font.png (6x8 cells, 16 cols, ASCII 32..127), panel|button|button_hi (12x12 9-slice, 4px),
             slot|slot_hi|slot_locked|slot_post (18x18), cursor, heart_full|empty, shield_pip, mana_pip,
             coin|key|crystal|blood_small (8x8), door_icon_<combat|spell|relic|gold|health|shop|forge|elite|boss|
             fountain|crimson|unknown>, elite_crown
icons/       spells/<id>.png (frame colour = type), relics/<id>.png (corner glints = rarity), curses/<id>.png,
             potions/<id>.png — ids from wiki/data/ids.json
wands/       <id>.png — drawn diagonally, handle bottom-left → head top-right (rotate by aim + 45°)
manifest.json  tile, scaleDisplay, attackTiming, visualStacking, anims{group:{frames,fps,loop,w,h}}, font, nineSlice,
               chapters, eliteOverlay
filelist.txt   every PNG path — loaders read this, never guess
preview.html   open in a browser: everything at x4, animated groups animate
```

## 2. How to use

1. **Load by relative path from `filelist.txt`.** Never guess names.
2. **Display scale:** render x4 (`manifest.scaleDisplay`), nearest-neighbour (`image-rendering: pixelated`,
   `imageSmoothingEnabled = false`), integer scale only. Anchor sprites by their CENTRE (legacy aliases are padded).
3. **Animation:** `manifest.anims[group]` gives frame count/fps/loop; frames are `<group>_f0..fN`. Impacts, deaths
   and level-ups play once. `<group>.png` is a static alias of f0.
4. **Attack readability (mandatory):** `effects/telegraph_*` 0.3 s → `effects/windup_flash` 0.1 s →
   projectile + overlays + trail → `effects/impact_*_f0-2`. Bosses swap to `boss_<name>_telegraph.png` while telegraphing.
5. **Faction colours — never mix:** player = cyan/white, enemy = magenta.
6. **Spell stacking:** base → element overlay → behaviour overlay → count pips → trail
   (e.g. Fire Homing Meteor = `meteor_f0` + `ov_fire` + `ov_homing` + `trail_fire`).
7. **Hit flash:** swap to `<name>_hit.png` for ~0.08 s.
8. **Do not:** recolour enemy bullets cyan, stretch, smooth, or add element colours outside the palette.

## 3. Missing sprite?

Check `filelist.txt` → compose (base + overlay + trail) → only then edit the matching `tools/art_*.py` module and rerun.

## 4. Boost visuals

Every non-summon Boost owns one behaviour tag (`TAG_BY_SPELL` in `src/game/wand.ts`, id-keyed) and one
`overlays/ov_<tag>.png`. A shot that carries a boost always shows (a) an aura disc `effects/boost_aura.png` tinted with the
first tag's family colour, a light base tint and a size bump (`boostLook` in `src/game/boostfx.ts`), (b) its overlays,
and (c) at cast time each distinct tag pops from the muzzle (`castCues` in `src/game/spells.ts`). Glyph overlays (new,
compact, centred 16x16) are parked in slots around the sprite; legacy full-frame overlays (fire, frost, venom, thunder,
homing, rebound, pierce, multishot, volley, echo, duet, orbit, enlarge, fall) stay centred. Family colours: damage
red/orange, speed white/cyan, time violet, area teal, aim white, control blue, economy green, elements keep theirs.

| id | tag / overlay | dynamic cue (all guarded by `w.vis`) |
| --- | --- | --- |
| volley | `ov_volley` | cyan even fan of rays across the real spread at cast (`castCues`) |
| multi_shot | `ov_multishot` | row of white pips = copies at cast (`castCues`) |
| over_scatter | `ov_scatter` | ragged gold spray of random rays at cast (`castCues`) |
| slime_crystal | `ov_slime` | olive goo tint on slowed foes (`Enemy.sync`) |
| venom_crystal | `ov_venom` | green tint + `poison_bubbles` on poisoned foes (`Enemy.sync`) |
| frost_crystal | `ov_frost` | icy tint + `freeze_crystals` on frozen foes (`Enemy.sync`) |
| core_of_flame | `ov_fire` | orange tint + `burn_flames` on burning foes (`Enemy.sync`) |
| core_of_thunder | `ov_thunder` | bolts from the struck foe to every shocked foe + ring at the true `SpellDef.radius` (`World.applyElement`) |
| penetration | `ov_pierce` | white spark burst each time a pierce is consumed (`Proj.hitEnemies`) |
| chain_of_lightning | `ov_chain` | jagged tether muzzle -> projectile (`ProjFx.drawLink`), bolt along the real 6 m damage segment + spark per foe (`chainLightning`) |
| hover | `ov_hover` | countdown ring while hovering + pop when it ends (`ProjFx.drawHover`, `hoverPop`) |
| orbit | `ov_orbit` | dashed ring at the orbit radius around the player (`ProjFx`) |
| track | `ov_track` | pulsing dashed line + crosshair at the cursor (`ProjFx.drawTrack`) |
| automatic_navigate | `ov_homing` | lock-on brackets on the current target (`ProjFx.drawLock`) |
| rebound | `ov_rebound` | green ring at the bounce point (`Proj.update`) |
| reflection | `ov_reflect` | beam from the hit foe to the next target (`Proj.hitEnemies`) |
| split | `ov_split` | fan burst at the split point (`completeProj`) |
| dmg_enhanced | `ov_dmg` | red aura + warm tint |
| time_duration_enhanced | `ov_duration` | violet dashed life ring shrinking with remaining life (`ProjFx.drawLife`) |
| energy_saving_mode | `ov_saving` | green aura + tint |
| precise_shot | `ov_precise` | thin aim line along the real (tightened) direction at cast (`castGroup`) |
| accelerator | `ov_accel` | white streak lines behind the shot + twice as dense trail (`ProjFx`) |
| range_enhanced | `ov_range` | teal ring at the boosted impact/landing radius (`completeProj`, `fall`) |
| strong_traction | `ov_traction` | beam from each yanked foe to the crit target (`Proj.applyHit`) |
| enlarge_spell | `ov_enlarge` | swelling white ring at cast (`castCues`) |
| fall | `ov_fall` | falling arrow onto the telegraph, column + ring on landing (`fall`) |
| magic_upgrade | `ov_upgrade` | gold `level_up` glint at the muzzle on upgraded spells (`castCues`, `CastItem.via`) |
| mimicry_cube | `ov_mimic` | purple prism ring + burst on the copied spell (`castCues`, `CastItem.via`) |
| duet | `ov_duet` | link beam from the cast origin to the end point + ring (`completeProj`) |
| dazzling_fireworks | `ov_fireworks` | radial burst + 4 outward beams at the release point (`completeProj`) |
| serial | `ov_serial` | relay ring mid-flight + beam back to the muzzle (`wireEchoSerial`) |
| echo | `ov_echo` | relay ring on the struck foe + beam back to the muzzle (`wireEchoSerial`) |

New files written by `tools/art_boost_fx.py`: `effects/boost_aura.png`, `overlays/ov_{accel,chain,dmg,duration,fireworks,
hover,mimic,precise,range,reflect,saving,scatter,serial,slime,split,track,traction,upgrade}.png`.

## 5. Spell visuals

Code: `src/game/spellfx.ts` (cast flash `castFlash`, impact `spellImpact`, channel emitters, `RingAura`, summon
spawn/fusion/cadaver bursts), `src/game/wandfx.ts` (passive auras, charge/channel glow at the wand tip),
`src/game/summons.ts` (`Summon.decorate`: per-kind auras and boost cues), handlers in `src/game/spells.ts`.
Rules: everything is visual only (`w.vis` guarded, `Math.random`, never `w.rng`/`w.after`); areas are drawn at the
radius that is actually used for damage (`Visuals.zone` telegraph before, `areaRing`/`RingAura` after).

| id | cast | flight | impact / end |
|---|---|---|---|
| magic_bullet | cyan `muzzle` | `magic_bullet` + cyan trail | `impact_small` (the neutral default) |
| rock_n_ball | grey chunk burst | `rock_ball` + `sx_trail_stone` | `sx_debris` |
| butterfly | pink dust burst + ring | `butterfly` + `sx_trail_pink` | `sx_dust` |
| laser | straight white-cyan flare | `laser` + `sx_trail_white` | `sx_rays_thin` |
| fuse | orange sparks | `fuse_spark` + `sx_trail_yellow` | orange-tinted `sx_spark` |
| floating_wisp | teal ring | `wisp` + `sx_trail_teal` | `sx_wisp` |
| black_hole | violet inward ring | `black_hole` spinning, dashed pull ring + damage ring, motes falling in (`RingAura`) | `sx_implode` |
| arcane_explosion | cyan ring | - | `arcane_ring` + ring at the blast radius |
| shadow_serpent | violet burst | dark-blue body with travelling pulse | `sx_smoke` |
| ray_of_disintegration | flare + inward ring; white core + ring at the wand tip while held | pulsing `ray` beam, sparks at the wall hit | tip glow ends with release |
| deceptive_mine | yellow ring | `mine`; dashed blast-radius ring once at rest | `sx_blast` + ring at radius |
| meteor | orange burst | zone telegraph at the radius, `meteor` with `trail_fire` | `sx_flame` + fire ring at radius |
| rainbow | 5-colour burst stack | `rainbow_shot` tinted per ray | white `sx_spark` tinted with the ray colour |
| arcane_nova | double cyan ring | `arcane_nova` + a ring pulse per release | `sx_nova` |
| lightning_dash | yellow bolts | `lightning_ball` + crackle around the dashing player | `sx_bolt` (+ blast at radius) |
| adava_keravda | green bolts + ring | sky beam onto the target | `sx_bolt_green` + ring at radius |
| thunderstorm | yellow bolts | dashed zone ring at radius, random sky flickers, chain beams between struck foes | - |
| high_pressure_stream | blue fan; blue disc at the wand tip while held; spray droplets | `water_stream` | `sx_splash` |
| fierce_dragon_breath | orange fan; orange ball growing with hold time; embers | `flame` cone, growing | `sx_flame` |
| enchanting_coin | gold burst + ring | `enchant_coin` + `sx_trail_gold` | `sx_coin` |
| evil_slayer_sword | white burst | `slash` + fan of rays at the sweep radius | - |
| boomerang_blade | cyan ring | spinning `boomerang` + `sx_trail_white` | `sx_cross` (catch) |
| sword_of_judgement | gold rays | orbiting `judgement_sword` + `sx_trail_gold` | `sx_rays` |
| condensed_water_bubble | ice ring | growing `water_bubble`, dashed ring at the burst radius | `sx_splash` + ring at radius |
| shining_star_arrow | gold burst scaled by charge; gold disc + rays growing while charging (`WandFx`) | `shining_arrow` scaled by charge + `sx_trail_gold` | `sx_star` |
| bings_arrow | ice rays | `bing_arrow` + `sx_trail_white` (every 50th: gold, big) | `sx_shard` |
| mana_absorption | cyan plus | `mana_absorb` | `sx_plus` + beam back to the wand on refund |
| pop | pink ring | `pop_minion` | spawn `sx_spawn_pop`; shots pink trail + `sx_bubble` |
| skull_of_the_cthulhu | bone inward ring | `skull_minion`, dashed drain-radius ring | spawn `sx_spawn_skull`; beams from foes, heal cross |
| hand_of_the_cthulhu | violet inward ring | `cthulhu_hand` | spawn `sx_spawn_hand`; zone at radius, `sx_crack` + ring |
| pillar_of_light | gold plus | `pillar_light` (blinks the last 2 s) | spawn `sx_spawn_pillar`; `sx_rays` on each burn tick |
| autonomous_grimoire | yellow burst | `grimoire` + 2 orbiting pages (brightness = MP) | spawn `sx_spawn_grimoire`; ring + beam on each cast |

Summon boosts (`Summon.decorate`, driven by `CastItem.mods`): parasite = sickly green tint, drips (`px_drop`),
green ring + bubbles on death; troll_serum = 1.2x scale, green tint, ring + heal cross on each regen pulse;
umbilical_cord = jagged tether (`Summon.drawTether`) that flares gold with a spark on the foe when it damages;
fusion_summon = beam + `level_up` + ring at the merge, merged summon 1.3x with `px_crown`; cadaver_explosion = red
pulse and dashed ring at the 2.5 m radius as HP nears the threshold, `sx_blast_red` + ring on burst;
essence_of_soul = `px_halo` above; indomitability = translucent blue ghost with a shrinking countdown arc, flickers in
the last second.

Passives (`WandFx`, carried in any wand = dim, in the wand in hand = bright): magic_reservoir blue motes (brightness =
MP fill), tranquil_bloom falling petals, magic_vine one tendril per stack, forced_cooldown orange ticks that spin
faster while recharging + flick at recharge start, capacity_expansion_stone orbiting facets, spell_prototype hue-cycling
wildcards, arcane_barrier `shield_hex` aura (flares + ring at the 4 m blast on absorb), wand_spirit ghost hand on the
side it last fired, resonance_rune rune + violet arc to the echo (white-gold ring on a free cast), charge_mode pips
around the tip + burst on release, bian_flying_sword one orbiting blade per sword still on the wand, area_boost
glint above the head + gold burst when a copied spell leads the cast.

New files written by `tools/art_spell_fx.py`:
- `effects/sx_<name>_f0-2` (impacts, 32x32, once): blast, blast_red, bolt, bolt_green, bubble, coin, crack, cross,
  debris, dust, flame, implode, nova, plus, rays, rays_thin, shard, smoke, spark, splash, star, wisp.
- `effects/sx_spawn_<pop|skull|hand|pillar|grimoire>_f0-3` (summon spawn, 32x32, once).
- `effects/sx_trail_<gold|blue|pink|stone|teal|yellow|white|void>.png` (8x8 trail puffs).
- `effects/px_<mote|petal|vine|tick|facet|wild|blade|pip|spirit|rune|halo|crown|drop|glint>.png` (small glyphs for
  passive auras and summon boosts).
