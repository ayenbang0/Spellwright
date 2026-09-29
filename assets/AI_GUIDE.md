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
