"""Item sprites keyed by the canonical ids in wiki/data/ids.json:

  wands/<id>.png            16x16, drawn diagonally: handle bottom-left -> head top-right (engine rotates it)
  icons/relics/<id>.png     16x16 object by name keyword, rarity-coloured glint ring
  icons/curses/<id>.png     16x16 dark sigil, distinct glyph + pip count per curse
  icons/potions/<id>.png    16x16 bottle shape x liquid colour, distinct per potion

Parametric by keyword + deterministic per-id variation (crc32), minimal 3-tone shading.
"""
import json
import os
import zlib

from art_core import (RAMP, hexc, new, ball, eball, disc, ellipse, ring, rect, line, poly, put,
                      outline, save, OUT, WHITE)

HERE = os.path.dirname(os.path.abspath(__file__))
IDS = os.path.join(HERE, "..", "wiki", "data", "ids.json")
GEMS = ["cyan", "void", "fire", "green", "gold", "ice", "blue", "red", "teal", "pink"]
RARITY = {"Normal": hexc("94a3b8"), "Rare": hexc("3b82f6"), "Epic": hexc("a855f7"), "Unique": hexc("fbbf24")}


def h(s):
    return zlib.crc32(s.encode("utf-8"))


def has(name, *words):
    n = name.lower()
    return any(w in n for w in words)


# =================================================================== WANDS
def shaft(im, ramp="wood", x0=2, y0=14, x1=11, y1=5):
    sh, b, hi = RAMP[ramp]
    line(im, x0, y0, x1, y1, b, 2)
    line(im, x0, y0 - 1, x1 - 1, y1 - 1, hi)
    line(im, x0 + 1, y0, x1, y1 + 1, sh)


def wand_sprite(wid, name):
    im = new()
    k = h(wid)
    gem = GEMS[k % len(GEMS)]
    wood = ["wood", "stone", "bone", "rust", "slate"][(k >> 4) % 5]
    if has(name, "dagger", "blade", "sword", "needle", "spellblade"):
        # blade
        line(im, 5, 11, 13, 3, RAMP["grey"][2], 2)
        line(im, 6, 11, 13, 4, RAMP["grey"][0])
        line(im, 3, 9, 7, 13, RAMP["gold"][1], 1)       # crossguard
        line(im, 2, 14, 5, 11, RAMP["wood"][1], 2)      # grip
        put(im, 1, 15, RAMP[gem][1])
    elif has(name, "book", "tome", "grimoire", "library", "fable", "satchel", "oath", "witness"):
        rect(im, 3, 3, 12, 13, RAMP[gem][0])
        rect(im, 4, 3, 12, 12, RAMP[gem][1])
        rect(im, 5, 4, 11, 11, RAMP["bone"][2])
        line(im, 6, 6, 10, 6, RAMP["bone"][0])
        line(im, 6, 8, 10, 8, RAMP["bone"][0])
        rect(im, 3, 3, 3, 13, RAMP[gem][2])
        disc(im, 8, 9.5, 1, RAMP[gem][1])
    elif has(name, "trident", "fork"):
        shaft(im, wood, 2, 14, 9, 7)
        sh, b, hi = RAMP["grey"]
        line(im, 8, 8, 12, 4, b, 2)
        line(im, 9, 3, 13, 7, hi)
        line(im, 13, 2, 13, 5, b)
        line(im, 10, 1, 14, 1, b)
        put(im, 11, 2, RAMP[gem][1])
    elif has(name, "flute", "whistle", "horn", "lute", "conch", "fork", "chord"):
        sh, b, hi = RAMP["gold" if has(name, "horn", "conch") else "wood"]
        line(im, 2, 13, 12, 3, b, 3)
        line(im, 2, 12, 11, 3, hi)
        for i in range(3):
            put(im, 5 + i * 2, 10 - i * 2, OUT)
        disc(im, 12.5, 3, 2, RAMP[gem][1])
    elif has(name, "broom"):
        shaft(im, "wood", 1, 15, 10, 6)
        poly(im, [(9, 5), (15, 1), (15, 5), (11, 8)], RAMP["gold"][1])
        line(im, 10, 5, 14, 2, RAMP["gold"][2])
    elif has(name, "banner"):
        shaft(im, "wood", 2, 15, 6, 2)
        poly(im, [(6, 2), (14, 3), (12, 6), (14, 9), (6, 8)], RAMP[gem][1])
        line(im, 7, 3, 13, 4, RAMP[gem][2])
    elif has(name, "bouquet"):
        shaft(im, "green", 3, 15, 8, 8)
        for i, (x, y) in enumerate(((9, 5), (12, 7), (11, 3), (7, 4))):
            disc(im, x, y, 1.5, RAMP[GEMS[(k + i) % len(GEMS)]][1])
            put(im, x, y, WHITE)
    elif has(name, "orb", "stone", "container", "reservoir", "heart", "embrace", "asteroid", "electroweb", "sphere", "convergence"):
        shaft(im, wood, 2, 14, 7, 9)
        ball(im, 10.5, 5.5, 4, gem)
        ring(im, 10.5, 5.5, 4, RAMP[gem][0])
        put(im, 9, 4, WHITE)
    else:
        # classic staff: shaft + head variant
        shaft(im, wood)
        variant = (k >> 8) % 4
        sh, b, hi = RAMP[gem]
        if variant == 0:          # orb
            ball(im, 12, 4, 2.5, gem)
            put(im, 11, 3, WHITE)
        elif variant == 1:        # crystal
            poly(im, [(12, 0), (15, 4), (12, 8), (9, 4)], b)
            poly(im, [(12, 0), (12, 8), (9, 4)], hi)
        elif variant == 2:        # crescent
            ring(im, 12, 4, 3, RAMP["grey"][1])
            disc(im, 12, 4, 1.5, b)
        else:                     # forked head with gem
            line(im, 10, 5, 14, 3, RAMP[wood][1])
            line(im, 11, 6, 13, 1, RAMP[wood][1])
            disc(im, 12.5, 3.5, 1.2, hi)
    return outline(im)


# =================================================================== RELICS
def relic_object(rid, name):
    im = new()
    k = h(rid)
    col = GEMS[k % len(GEMS)]
    if has(name, "boot"):
        poly(im, [(5, 3), (9, 3), (9, 10), (13, 11), (13, 13), (4, 13)], RAMP["rust"][1])
        rect(im, 5, 3, 9, 4, RAMP["rust"][2])
        rect(im, 4, 12, 13, 13, RAMP["rust"][0])
    elif has(name, "fang", "tooth"):
        poly(im, [(4, 3), (7, 3), (6, 13)], RAMP["bone"][1])
        poly(im, [(9, 3), (12, 3), (10, 11)], RAMP["bone"][1])
        line(im, 4, 3, 12, 3, RAMP["rust"][1], 2)
    elif has(name, "mask"):
        eball(im, 8, 8, 5.5, 6, RAMP[col])
        disc(im, 6, 7, 1.2, OUT)
        disc(im, 10, 7, 1.2, OUT)
        line(im, 6, 11, 10, 11, OUT)
    elif has(name, "key"):
        ring(im, 5, 5, 3, RAMP["gold"][1], 2)
        line(im, 7, 7, 13, 13, RAMP["gold"][1], 2)
        line(im, 11, 13, 13, 11, RAMP["gold"][0])
        line(im, 9, 11, 10, 10, RAMP["gold"][0])
        if has(name, "blood"):
            disc(im, 5, 5, 1, RAMP["red"][1])
    elif has(name, "crown", "circlet"):
        poly(im, [(2, 12), (2, 5), (5, 8), (8, 3), (11, 8), (14, 5), (14, 12)], RAMP["gold"][1])
        rect(im, 2, 11, 14, 12, RAMP["gold"][0])
        disc(im, 8, 9, 1.2, RAMP[col][1])
    elif has(name, "die"):
        rect(im, 3, 3, 12, 12, RAMP["bone"][1])
        rect(im, 3, 3, 12, 4, RAMP["bone"][2])
        for x, y in ((5, 6), (10, 6), (5, 10), (10, 10), (7.5, 8)):
            disc(im, x, y, 0.8, OUT)
    elif has(name, "glove", "hand", "seal"):
        rect(im, 4, 6, 11, 13, RAMP[col][1])
        for i in range(4):
            rect(im, 4 + i * 2, 2 + (i % 2), 5 + i * 2, 7, RAMP[col][1])
        rect(im, 11, 7, 13, 9, RAMP[col][1])
        rect(im, 4, 12, 11, 13, RAMP[col][0])
    elif has(name, "cloak", "robe", "mantle", "armor", "breastplate", "vest", "physique"):
        poly(im, [(5, 2), (11, 2), (14, 14), (2, 14)], RAMP[col][1])
        poly(im, [(8, 2), (11, 2), (14, 14), (9, 14)], RAMP[col][0])
        rect(im, 6, 2, 10, 3, RAMP["gold"][1])
    elif has(name, "earring", "ring"):
        ring(im, 8, 9, 4, RAMP["gold"][1], 2)
        poly(im, [(8, 2), (10, 5), (8, 7), (6, 5)], RAMP[col][1])
    elif has(name, "wing"):
        for s in (-1, 1):
            poly(im, [(8, 8), (8 + s * 7, 2), (8 + s * 6, 10), (8 + s * 3, 13)], RAMP["ice"][1])
            line(im, 8, 8, 8 + s * 6, 3, WHITE)
    elif has(name, "hat", "helm"):
        poly(im, [(8, 1), (13, 11), (3, 11)], RAMP[col][1])
        rect(im, 1, 11, 15, 13, RAMP[col][0])
        disc(im, 8, 8, 1, RAMP["gold"][1])
    elif has(name, "beard"):
        poly(im, [(3, 3), (13, 3), (11, 12), (8, 15), (5, 12)], RAMP["bone"][1])
        line(im, 6, 5, 7, 12, RAMP["bone"][0])
        line(im, 10, 5, 9, 12, RAMP["bone"][0])
    elif has(name, "skull", "reaper", "bone", "tail", "casket"):
        ball(im, 8, 7, 5, "bone")
        disc(im, 6, 7, 1.3, OUT)
        disc(im, 10, 7, 1.3, OUT)
        rect(im, 6, 11, 10, 13, RAMP["bone"][0])
        for x in (7, 9):
            put(im, x, 12, OUT)
    elif has(name, "hourglass", "time"):
        poly(im, [(4, 2), (12, 2), (8, 8)], RAMP["ice"][1])
        poly(im, [(4, 14), (12, 14), (8, 8)], RAMP["ice"][1])
        poly(im, [(6, 14), (10, 14), (8, 10)], RAMP["gold"][1])
        rect(im, 3, 1, 13, 2, RAMP["wood"][1])
        rect(im, 3, 14, 13, 15, RAMP["wood"][1])
    elif has(name, "clover"):
        for dx, dy in ((-2, -2), (2, -2), (-2, 2), (2, 2)):
            disc(im, 8 + dx, 7 + dy, 2.3, RAMP["green"][1])
        line(im, 8, 9, 10, 14, RAMP["green"][0])
    elif has(name, "box", "chest", "treasure"):
        rect(im, 2, 6, 13, 13, RAMP["wood"][1])
        rect(im, 2, 4, 13, 7, RAMP["wood"][2])
        rect(im, 7, 7, 8, 9, RAMP["gold"][1])
    elif has(name, "belt"):
        rect(im, 1, 6, 14, 9, RAMP["rust"][1])
        rect(im, 6, 5, 9, 10, RAMP["gold"][1])
        rect(im, 7, 6, 8, 9, RAMP["rust"][0])
    elif has(name, "glass", "lens", "observation", "talisman", "eye", "vision"):
        ring(im, 7, 7, 4, RAMP["gold"][1], 2)
        disc(im, 7, 7, 2.5, RAMP["ice"][1])
        put(im, 6, 6, WHITE)
        line(im, 10, 10, 14, 14, RAMP["wood"][1], 2)
    elif has(name, "compass"):
        disc(im, 8, 8, 6, RAMP["grey"][1])
        disc(im, 8, 8, 4.5, RAMP["bone"][2])
        poly(im, [(8, 3), (9, 8), (7, 8)], RAMP["red"][1])
        poly(im, [(8, 13), (9, 8), (7, 8)], RAMP["grey"][0])
    elif has(name, "horn"):
        poly(im, [(2, 13), (5, 13), (13, 3), (11, 2)], RAMP["bone"][1])
        line(im, 3, 12, 12, 3, RAMP["bone"][2])
    elif has(name, "heart", "ember"):
        disc(im, 6, 6, 3, RAMP["fire" if has(name, "ember") else "red"][1])
        disc(im, 10, 6, 3, RAMP["fire" if has(name, "ember") else "red"][1])
        poly(im, [(3, 7), (13, 7), (8, 13)], RAMP["fire" if has(name, "ember") else "red"][1])
        put(im, 5, 5, WHITE)
    elif has(name, "droplet", "elixir", "coolant", "cardiotonic"):
        poly(im, [(8, 2), (12, 9), (4, 9)], RAMP[col][1])
        disc(im, 8, 10, 4, RAMP[col][1])
        put(im, 6, 9, WHITE)
    elif has(name, "bell"):
        poly(im, [(8, 2), (12, 11), (4, 11)], RAMP["gold"][1])
        rect(im, 3, 11, 13, 12, RAMP["gold"][0])
        disc(im, 8, 13.5, 1, RAMP["gold"][2])
    elif has(name, "seed"):
        eball(im, 8, 9, 4, 5, RAMP["wood"])
        line(im, 8, 4, 10, 1, RAMP["green"][1], 2)
    elif has(name, "sprite", "guardian", "artifact"):
        ball(im, 8, 8, 3, col)
        for dx in (-5, 5):
            ellipse(im, 8 + dx, 6, 2, 3, RAMP["ice"][2])
    elif has(name, "ear"):
        eball(im, 5, 7, 2.5, 6, RAMP["pink"])
        eball(im, 11, 7, 2.5, 6, RAMP["pink"])
        line(im, 5, 4, 5, 10, RAMP["pink"][2])
        line(im, 11, 4, 11, 10, RAMP["pink"][2])
    elif has(name, "pickaxe", "drill"):
        line(im, 3, 14, 11, 6, RAMP["wood"][1], 2)
        poly(im, [(6, 3), (14, 1), (13, 3), (8, 6)], RAMP["grey"][1])
        poly(im, [(13, 3), (15, 9), (12, 8)], RAMP["grey"][1])
    elif has(name, "goblet", "cup"):
        poly(im, [(3, 2), (13, 2), (10, 8), (6, 8)], RAMP["gold"][1])
        rect(im, 7, 8, 8, 12, RAMP["gold"][0])
        rect(im, 4, 12, 11, 13, RAMP["gold"][1])
        rect(im, 4, 2, 12, 3, RAMP["red"][1])
    elif has(name, "pendant", "amulet", "charm", "mark"):
        line(im, 3, 2, 8, 7, RAMP["gold"][0])
        line(im, 13, 2, 8, 7, RAMP["gold"][0])
        poly(im, [(8, 6), (12, 10), (8, 14), (4, 10)], RAMP[col][1])
        put(im, 7, 9, WHITE)
    elif has(name, "pauldron", "shoulder"):
        eball(im, 5, 8, 4, 5, RAMP["grey"])
        eball(im, 11, 8, 4, 5, RAMP["grey"])
    elif has(name, "tentacle"):
        for i in range(3):
            line(im, 3 + i * 5, 14, 5 + i * 4, 3 + i, RAMP["purple"][1], 2)
    elif has(name, "berserk", "fury", "rage", "blade"):
        line(im, 3, 13, 13, 3, RAMP["grey"][2], 2)
        line(im, 3, 10, 6, 13, RAMP["red"][1], 2)
    elif has(name, "shape"):
        ball(im, 8, 9, 5, "pink")
        disc(im, 6, 8, 1, OUT)
        disc(im, 10, 8, 1, OUT)
    elif has(name, "piercer", "cloud"):
        ellipse(im, 8, 8, 6, 3, RAMP["ice"][1])
        line(im, 1, 13, 15, 3, RAMP["gold"][1], 1)
    else:
        poly(im, [(8, 2), (13, 8), (8, 14), (3, 8)], RAMP[col][1])
        poly(im, [(8, 2), (8, 14), (3, 8)], RAMP[col][2])
    return im


def relic_icon(rid, name, rarity):
    """Object sprite + rarity-coloured corner glints (more for Epic/Unique)."""
    im = outline(relic_object(rid, name))
    c = RARITY.get(rarity, RARITY["Normal"])
    for x, y in ((1, 1), (14, 1), (1, 14), (14, 14)):
        put(im, x, y, c)
    if rarity in ("Epic", "Unique"):
        for x, y in ((2, 1), (1, 2), (13, 1), (14, 2), (1, 13), (2, 14), (14, 13), (13, 14)):
            put(im, x, y, c)
    return im


# =================================================================== CURSES
def curse_icon(i):
    im = new()
    sh, b, hi = RAMP["void"]
    poly(im, [(8, 1), (14, 5), (14, 11), (8, 15), (2, 11), (2, 5)], sh)
    poly(im, [(8, 2), (13, 5), (13, 11), (8, 14), (3, 11), (3, 5)], hexc("2e1065"))
    g = hexc("e9d5ff")
    m = RAMP["magenta"][2]
    glyph = i % 12
    if glyph == 0:
        ring(im, 8, 8, 3, g)
    elif glyph == 1:
        line(im, 5, 5, 11, 11, g)
        line(im, 11, 5, 5, 11, g)
    elif glyph == 2:
        poly(im, [(8, 4), (11, 11), (5, 11)], g)
    elif glyph == 3:
        rect(im, 5, 7, 11, 9, g)
    elif glyph == 4:
        line(im, 8, 4, 8, 12, g)
        line(im, 5, 7, 11, 7, g)
    elif glyph == 5:
        disc(im, 8, 8, 2.5, g)
        disc(im, 8, 8, 1, hexc("2e1065"))
    elif glyph == 6:
        line(im, 5, 11, 8, 4, g)
        line(im, 8, 4, 11, 11, g)
        line(im, 6, 9, 10, 9, g)
    elif glyph == 7:
        for x in (5, 8, 11):
            line(im, x, 5, x, 11, g)
    elif glyph == 8:
        ellipse(im, 8, 8, 4, 2, g)
        disc(im, 8, 8, 1, m)
    elif glyph == 9:
        poly(im, [(8, 4), (12, 8), (8, 12), (4, 8)], g)
        disc(im, 8, 8, 1, hexc("2e1065"))
    elif glyph == 10:
        line(im, 4, 6, 12, 6, g)
        line(im, 4, 10, 12, 10, g)
        line(im, 8, 6, 8, 10, g)
    else:
        ball(im, 8, 7, 3, "bone")
        put(im, 7, 7, OUT)
        put(im, 9, 7, OUT)
    pips = i // 12 + 1
    for p in range(pips):
        put(im, 6 + p * 2, 13, m)
    return outline(im)


# =================================================================== POTIONS
POTION_COLS = ["red", "blue", "green", "gold", "void", "pink", "ice", "fire"]


def potion_icon(i):
    im = new()
    shape = i % 4
    liq = RAMP[POTION_COLS[(i // 4 + i) % len(POTION_COLS)]]
    glass = RAMP["ice"]
    if shape == 0:        # round flask
        disc(im, 8, 10, 5, glass[2])
        disc(im, 8, 10.5, 4, liq[1])
        rect(im, 4, 9, 12, 10, liq[2])
        rect(im, 7, 2, 9, 5, glass[2])
    elif shape == 1:      # tall vial
        rect(im, 5, 3, 10, 14, glass[2])
        rect(im, 6, 7, 9, 13, liq[1])
        rect(im, 6, 7, 9, 7, liq[2])
    elif shape == 2:      # square jar
        rect(im, 3, 5, 12, 14, glass[2])
        rect(im, 4, 8, 11, 13, liq[1])
        rect(im, 4, 8, 11, 8, liq[2])
        rect(im, 5, 3, 10, 5, glass[1])
    else:                 # heart flask
        disc(im, 6, 9, 3, liq[1])
        disc(im, 10, 9, 3, liq[1])
        poly(im, [(3, 10), (13, 10), (8, 15)], liq[1])
        rect(im, 7, 3, 9, 6, glass[2])
    rect(im, 7, 1, 9, 2, RAMP["wood"][1])
    put(im, 5 if shape != 1 else 6, 8, WHITE)
    return outline(im)


# =================================================================== BUILD
def build():
    with open(IDS, encoding="utf-8") as f:
        ids = json.load(f)
    data_dir = os.path.join(HERE, "..", "wiki", "data")
    for w in ids["wands"]:
        save(wand_sprite(w["id"], w["wikiName"]), f"wands/{w['id']}.png")
    with open(os.path.join(data_dir, "relics.json"), encoding="utf-8") as f:
        raw_relics = json.load(f)  # same order as ids.json relics
    for i, r in enumerate(ids["relics"]):
        rr = raw_relics[i]["Rarity"] if i < len(raw_relics) else "Normal"
        save(relic_icon(r["id"], r["wikiName"], rr or "Unique"), f"icons/relics/{r['id']}.png")
    for i, c in enumerate(ids["curses"]):
        save(curse_icon(i), f"icons/curses/{c['id']}.png")
    for i, p in enumerate(ids["potions"]):
        save(potion_icon(i), f"icons/potions/{p['id']}.png")
