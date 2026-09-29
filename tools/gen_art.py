#!/usr/bin/env python3
"""Magicraft clone pixel-art generator (Pillow only, deterministic).

    python tools/gen_art.py

Wipes every PNG under assets/ and regenerates all art, then writes
assets/filelist.txt (every PNG, sorted) and assets/manifest.json (incl. `anims`).
Sprite code lives in sibling modules:
  art_core    shared palette/ramps, ASCII sprite + outline/shading helpers, save/save_anim
  art_chars   player, npcs, chapter enemies (+ elite variants)
  art_bosses  48x48 bosses (+ _hit, _telegraph)
  art_world   floor/wall/decor tiles, props, pickups
  art_fx      projectiles, overlays, effects
  art_ui      bitmap font, 9-slice panels, slots, HUD icons, door icons, elite crown
  art_icons   spell icons (ids from wiki/data/ids.json)
  art_items   wand sprites + relic/curse/potion icons (ids from wiki/data/ids.json)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import art_core  # noqa: E402
import art_chars, art_bosses, art_world, art_fx, art_boost_fx, art_spell_fx, art_ui, art_icons, art_items  # noqa: E402,E401

ROOT = art_core.ROOT


def wipe_pngs():
    for dp, _, fns in os.walk(ROOT):
        for fn in fns:
            if fn.lower().endswith(".png"):
                os.remove(os.path.join(dp, fn))
    # drop now-empty dirs (deterministic tree)
    for dp, dns, fns in sorted(os.walk(ROOT), key=lambda t: -len(t[0])):
        if dp != ROOT and not os.listdir(dp):
            os.rmdir(dp)


def manifest():
    m = {
        "tile": 16,
        "scaleDisplay": 4,
        "enemyBullets": "magenta",
        "playerBullets": "cyan",
        "visualStacking": {
            "order": ["base", "elementTint", "behaviorIcon", "countPips", "trail"],
            "elements": {
                "fire": "ov_fire+flame fringe+trail_fire",
                "frost": "ov_frost+snow corners",
                "venom": "ov_venom+bubbles+trail_venom",
                "thunder": "ov_thunder+sparks",
                "homing": "ov_homing+curved trail",
                "rebound": "ov_rebound",
                "pierce": "ov_pierce+white line",
                "multishot": "ov_multishot+ghost copies",
                "volley": "ov_volley+pips",
                "orbit": "ov_orbit+dashed ring",
                "duet": "ov_duet+chain",
                "echo": "ov_echo+faded copy",
                "enlarge": "ov_enlarge+swell ring at cast",
                "fall": "ov_fall+falling arrow+landing ring",
                "slime": "ov_slime+olive tint on foes",
                "scatter": "ov_scatter+ragged spray at cast",
                "chain": "ov_chain+tether to muzzle+bolt along damage segment",
                "hover": "ov_hover+countdown ring+end pop",
                "track": "ov_track+cursor line",
                "reflect": "ov_reflect+beam to next foe",
                "split": "ov_split+fan burst",
                "dmg": "ov_dmg+red aura",
                "duration": "ov_duration+dashed life ring",
                "saving": "ov_saving+green aura",
                "precise": "ov_precise+aim line at cast",
                "accel": "ov_accel+streaks+dense trail",
                "range": "ov_range+teal ring on impact",
                "traction": "ov_traction+beam to yanked foes",
                "upgrade": "ov_upgrade+level-up glint",
                "mimic": "ov_mimic+prism ring",
                "serial": "ov_serial+relay ring+beam",
                "fireworks": "ov_fireworks+radial burst",
                "aura": "effects/boost_aura tinted by family colour under every boosted shot",
            },
        },
        "attackTiming": {"telegraph": 0.3, "windup": 0.1, "impactFrames": 3},
        "chapters": list(art_world.CHAPTERS),
        "font": {"path": "ui/font.png", "cellW": 6, "cellH": 8, "cols": 16, "first": 32},
        "nineSlice": {"ui/panel.png": 4, "ui/button.png": 4, "ui/button_hi.png": 4},
        "eliteOverlay": "ui/elite_crown.png",
        "anims": {k: art_core.ANIMS[k] for k in sorted(art_core.ANIMS)},
    }
    with open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(m, f, indent=2)
        f.write("\n")


def filelist():
    on_disk = sorted(
        os.path.relpath(os.path.join(dp, fn), ROOT).replace(os.sep, "/")
        for dp, _, fns in os.walk(ROOT) for fn in fns if fn.lower().endswith(".png"))
    assert on_disk == sorted(art_core.WRITTEN), "untracked PNG write"
    with open(os.path.join(ROOT, "filelist.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(on_disk) + "\n")
    return on_disk


def main():
    os.makedirs(ROOT, exist_ok=True)
    wipe_pngs()
    for mod in (art_chars, art_bosses, art_world, art_fx, art_boost_fx, art_spell_fx, art_ui, art_icons, art_items):
        mod.build()
    manifest()
    files = filelist()
    print(f"done -> {ROOT} ({len(files)} png, {len(art_core.ANIMS)} anim groups)")


if __name__ == "__main__":
    main()
