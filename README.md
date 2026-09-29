# Spellwright

A modular spell building roguelike top down bullet hell shooter game.

A clean-room web prototype of a top-down **wand-programming roguelike**: order your spells in a wand, break the mana
economy, clear bullet-hell rooms, beat the chapter bosses, spend what you find at camp, go again. Mechanics follow the
fan wiki for the game that inspired it (mirrored in `wiki/`); every name, description and asset is original.

**Stack:** Vite + TypeScript + PixiJS v8 (world) + a DOM overlay UI (`src/ui`, styled after
[shrimpsooup2/infinitetower](https://github.com/shrimpsooup2/infinitetower): Ubuntu Bold, outlined white text, two-tone
pastel buttons, translucent panels, pill counters). Art is pixel art from `assets/` (the single source of truth),
rendered ×4 with nearest-neighbour scaling. Hosted as a static site on GitHub Pages.

## Run it

```sh
npm ci
npm run dev        # http://localhost:5173 (builds public/data first)
npm test           # data build + vitest (logic, art paths, headless build simulation)
npm run build      # data build + typecheck + production bundle in dist/
npm run sim        # headless DPS table for the wiki community builds
npm run build:art  # regenerate assets/ (Python + Pillow, deterministic)
```

`public/data/*.json` is generated from `wiki/data/*.json` + `data/design.json` + `data/names.json` by
`scripts/build-data.ts` (`npm run dev`, `npm test` and `npm run build` all run it first).

### Controls

WASD move · mouse aim & fire · Q / wheel swap wand · E interact · Space set skill · 1–4 potions · Tab bag · Esc menu.

#### Test Mode (hidden)

Type `ayenbang0` anywhere (title screen, camp, in a run, over any menu; not while a text box has focus) to toggle Test
Mode; type it again to switch it off. A red `TEST MODE (F2)` badge shows while it is on. It is session-only: reloading the
page turns it off.

`F2` (or a click on the badge) opens the test panel: every spell (type filter, search, base / + / ++), every wand,
every relic (inert ones are marked), every enemy and boss (1 / 5 / 10 at a time, optionally elite; Demon Lord per
phase) plus god mode, infinite MP, healing, coins, keys and potions. Esc or F2 closes it.

Nothing is saved while Test Mode is on: writes to the browser save are blocked, and the save as it was when you
switched Test Mode on is restored when you switch it off. Switching it off also drops the current run and returns to a
fresh camp, so nothing earned under Test Mode can be banked.

## How a run works

Camp (portal, Vivian / Lyon / Lilian / Gina / Leah, training dummy) → chapter 1–3 (Hard and up add chapter 4 and a
chapter 5 boss rush ending with the Demon Lord; the Scribe easter egg hides behind chapter 4) → each chapter is 8 rooms with Hades-style door choices: spell, relic, gold, health, shop,
forge, fountain, elite, boss. Beat a boss without losing HP (shield loss is fine) to open the Crimson Room: epic relics
paid for in max HP.

The wand model: slots are read left → right; boosts change the spells to their **right**; trigger spells (Duet, Fuse,
Echo, Serial, Fireworks, Arcane Nova, Grimoire) carry the following spells as a payload; passives affect the whole wand;
post (charge) slots fire when energy fills. Damage follows the wiki's formula (`src/game/damage.ts`).

Every boost, trigger, spell, summon boost and passive has its own visible cue (overlay icons and a tinted aura on the
projectile, a rising icon per boost at the muzzle on each cast, and event effects such as arcs, rings and beams; see
`assets/AI_GUIDE.md` sections 4–5). The Bag shows each wand's repeating cast order, which boosts join which cast, and
flags boosts that never apply because no spell sits to their right.

## Layout

```
assets/            pixel art (generated), manifest.json (anims, timing), filelist.txt, AI_GUIDE.md
tools/             gen_art.py + art_*.py (Pillow generators), make_preview.py
wiki/              fan-wiki mirror (CC BY-SA), data extracted from it, fetch script
data/              design values (numbers the wiki lacks) and the clean-room rename map
scripts/           build-data.ts, headless sim (sim-builds.ts), playbot.js (browser playtest bot)
src/core/          art loader, input, rng, audio, math
src/data/          runtime content schema (types.ts)
src/game/          wand planner, damage, spells, projectiles, summons, enemies, bosses, relics, curses, potions, rooms, world, game
src/meta/          save file + camp progression tables
src/ui/            HUD, panels, style.css
tests/             vitest suites
PLAN.md            design plan, decisions and status (start here)
```

## Attribution

Game facts come from the community wiki at https://magicraft.fandom.com (CC BY-SA 3.0); see `wiki/README.md`. The
original game belongs to its developers; this project ships none of its assets, names or text.
