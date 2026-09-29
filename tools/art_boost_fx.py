"""Boost overlays (one compact icon per boost tag) and the aura disc under boosted projectiles.

Each icon is drawn small, centred on the 16x16 canvas and outlined; the engine parks the icon in a slot beside the
projectile (see boostfx.ts GLYPH_SLOTS), so several boosts stay readable. Colour = family (assets/AI_GUIDE.md, section
"Boost visuals"): damage red, speed white/cyan, time violet, area teal, aim white, control blue, economy green.
"""
from art_core import RAMP, WHITE, hexc, new, ascii_img, outline, save
from art_fx import fin

RS, RB, RH = RAMP["red"]
BS, BB, BH = RAMP["blue"]
CS, CB, CH = RAMP["cyan"]
PS, PB, PH = RAMP["purple"]
TS, TB, TH = RAMP["teal"]
GS, GB, GH = RAMP["green"]
YS, YB, YH = RAMP["yellow"]
OS, OB, OH = RAMP["gold"]
LS, LB, LH = RAMP["slime"]
KS, KB, KH = RAMP["grey"]
VS, VB, VH = RAMP["void"]

# name -> (rows, palette); '.' is transparent
GLYPHS = {
    "dmg": ([
        "....b....",
        "...bab...",
        "..baaab..",
        ".baaaaab.",
        "...aca...",
        "...aca...",
        "...aca...",
        "...aca...",
        "...ccc...",
    ], {"a": RB, "b": RH, "c": RS}),
    "saving": ([
        "....b....",
        "...bab...",
        "..baaab..",
        ".baaaaac.",
        ".baaaaac.",
        ".baaaaac.",
        "..baaac..",
        "...ccc...",
    ], {"a": GB, "b": GH, "c": GS}),
    "accel": ([
        "bb..cc...",
        ".bb..cc..",
        "..bb..cc.",
        "...bb..cc",
        "..bb..cc.",
        ".bb..cc..",
        "bb..cc...",
    ], {"b": WHITE, "c": CB}),
    "duration": ([
        "aaaaaaa",
        "abbbbba",
        ".abbba.",
        "..aba..",
        "..ada..",
        ".adddda",
        "addddda",
        "aaaaaaa",
    ], {"a": PB, "b": PH, "d": hexc("c4b5fd")}),
    "range": ([
        "....b....",
        "..aaaaa..",
        ".aa...aa.",
        ".a.....a.",
        "ba..b..ab",
        ".a.....a.",
        ".aa...aa.",
        "..aaaaa..",
        "....b....",
    ], {"a": TB, "b": TH}),
    "precise": ([
        "....w....",
        "....w....",
        ".........",
        ".........",
        "ww..c..ww",
        ".........",
        ".........",
        "....w....",
        "....w....",
    ], {"w": WHITE, "c": CB}),
    "traction": ([
        ".....bb..",
        ".....ba..",
        ".....ba..",
        ".....ba..",
        ".b...ba..",
        ".ba..ba..",
        "..babba..",
        "...bba...",
    ], {"a": KB, "b": KH}),
    "track": ([
        "a......",
        "aa.....",
        "aba....",
        "abba...",
        "abbba..",
        "abbbba.",
        "abbaaa.",
        "abaa...",
        "aa.....",
    ], {"a": BB, "b": BH}),
    "reflect": ([
        "bbbbbbb",
        ".....ba",
        "....ba.",
        "...ba..",
        "..ba...",
        ".ba....",
        "bbbbbbb",
    ], {"a": BB, "b": BH}),
    "hover": ([
        "baa.baa",
        "baa.baa",
        "baa.baa",
        "baa.baa",
        "baa.baa",
        "baa.baa",
        "baa.baa",
    ], {"a": BB, "b": BH}),
    "split": ([
        "bb.....bb",
        ".bb...bb.",
        "..bb.bb..",
        "...bbb...",
        "....a....",
        "....a....",
        "....a....",
    ], {"a": BB, "b": BH}),
    "scatter": ([
        "a...b...a",
        ".........",
        ".a..b..a.",
        ".........",
        "..a.b.a..",
        ".........",
        "....b....",
    ], {"a": YB, "b": YH}),
    "chain": ([
        "bbb......",
        "bab......",
        "bbb......",
        "...aa....",
        "....aa...",
        ".....aa..",
        "......bbb",
        "......bab",
        "......bbb",
    ], {"a": YB, "b": YH}),
    "upgrade": ([
        "....b....",
        "...aba...",
        "..aa.aa..",
        ".aa...aa.",
        "....b....",
        "...aba...",
        "..aa.aa..",
        ".aa...aa.",
    ], {"a": OB, "b": OH}),
    "mimic": ([
        "....a....",
        "...abc...",
        "..abbcc..",
        ".abbwbcc.",
        "abbbwbccc",
        ".abbbccc.",
        "..abbcc..",
        "...abc...",
        "....a....",
    ], {"a": VB, "b": PH, "c": hexc("f0abfc"), "w": WHITE}),
    "serial": ([
        "b..c...",
        "b..cc..",
        "b..ccc.",
        "b..cccc",
        "b..ccc.",
        "b..cc..",
        "b..c...",
    ], {"b": WHITE, "c": CB}),
    "fireworks": ([
        "a...b...a",
        ".a..b..a.",
        "..a.b.a..",
        "...aba...",
        "bbbbwbbbb",
        "...aba...",
        "..a.b.a..",
        ".a..b..a.",
        "a...b...a",
    ], {"a": OB, "b": OH, "w": WHITE}),
    "slime": ([
        "...ccc...",
        ".ccaaacc.",
        "ccaaaaacc",
        "caabbaaac",
        "caabaaaac",
        "ccaaaaacc",
        ".c.ccc.c.",
        ".a..a..a.",
    ], {"a": LB, "b": LH, "c": LS}),
}


def glyph(rows, pal):
    """Rows -> icon centred on a 16x16 canvas with the standard dark outline."""
    w = max(len(r) for r in rows)
    h = len(rows)
    assert w <= 12 and h <= 12, (w, h)
    im = ascii_img(rows, pal, w, h)
    canvas = new()
    canvas.alpha_composite(im, ((16 - w) // 2, (16 - h) // 2))
    return fin(canvas)


def aura():
    """Soft two-tone disc drawn under a boosted projectile; tinted with the boost family colour at runtime."""
    im = new()
    px = im.load()
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if d <= 4.6:
                px[x, y] = (255, 255, 255, 235)
            elif d <= 6.6:
                px[x, y] = (255, 255, 255, 120)
    save(im, "effects/boost_aura.png")


def build() -> None:
    for name, (rows, pal) in GLYPHS.items():
        save(glyph(rows, pal), f"overlays/ov_{name}.png")
    aura()
