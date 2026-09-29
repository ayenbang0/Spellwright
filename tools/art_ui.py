"""UI art: bitmap font, 9-slice frames, wand slots, cursor, HUD pips/icons,
door-type badges and the elite crown overlay. Everything is hand-authored as
ASCII maps (deterministic, no RNG). Entry point: build()."""
import art_core as A
from art_core import hexc, OUT, RAMP

WHITE = (255, 255, 255, 255)


def mix(a, b, t):
    """Integer blend a->b by t (0..1)."""
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


# =================================================================== font
# 5x7 glyphs in a 6x8 cell; rows are space separated, '#' = ink. An optional
# 8th row is the descender row (g j p q y only).
FONT = {
    " ": "..... ..... ..... ..... ..... ..... .....",
    "!": "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
    '"': ".#.#. .#.#. .#.#. ..... ..... ..... .....",
    "#": ".#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.",
    "$": "..#.. .#### #.#.. .###. ..#.# ####. ..#..",
    "%": "##... ##..# ...#. ..#.. .#... #..## ...##",
    "&": ".##.. #..#. #.#.. .#... #.#.# #..#. .##.#",
    "'": "..#.. ..#.. .#... ..... ..... ..... .....",
    "(": "...#. ..#.. .#... .#... .#... ..#.. ...#.",
    ")": ".#... ..#.. ...#. ...#. ...#. ..#.. .#...",
    "*": "..... ..#.. #.#.# .###. #.#.# ..#.. .....",
    "+": "..... ..#.. ..#.. ##### ..#.. ..#.. .....",
    ",": "..... ..... ..... ..... ..#.. ..#.. .#...",
    "-": "..... ..... ..... ##### ..... ..... .....",
    ".": "..... ..... ..... ..... ..... .##.. .##..",
    "/": "..... ....# ...#. ..#.. .#... #.... .....",
    "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
    "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
    "2": ".###. #...# ....# ...#. ..#.. .#... #####",
    "3": "####. ....# ....# .###. ....# ....# ####.",
    "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
    "5": "##### #.... ####. ....# ....# #...# .###.",
    "6": "..##. .#... #.... ####. #...# #...# .###.",
    "7": "##### ....# ...#. ..#.. .#... .#... .#...",
    "8": ".###. #...# #...# .###. #...# #...# .###.",
    "9": ".###. #...# #...# .#### ....# ...#. .##..",
    ":": "..... .##.. .##.. ..... .##.. .##.. .....",
    ";": "..... .##.. .##.. ..... .##.. ..#.. .#...",
    "<": "...#. ..#.. .#... #.... .#... ..#.. ...#.",
    "=": "..... ..... ##### ..... ##### ..... .....",
    ">": ".#... ..#.. ...#. ....# ...#. ..#.. .#...",
    "?": ".###. #...# ....# ...#. ..#.. ..... ..#..",
    "@": ".###. #...# #.### #.#.# #.### #.... .####",
    "A": ".###. #...# #...# ##### #...# #...# #...#",
    "B": "####. #...# #...# ####. #...# #...# ####.",
    "C": ".###. #...# #.... #.... #.... #...# .###.",
    "D": "###.. #..#. #...# #...# #...# #..#. ###..",
    "E": "##### #.... #.... ####. #.... #.... #####",
    "F": "##### #.... #.... ####. #.... #.... #....",
    "G": ".###. #...# #.... #.### #...# #...# .####",
    "H": "#...# #...# #...# ##### #...# #...# #...#",
    "I": ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
    "J": "..### ...#. ...#. ...#. ...#. #..#. .##..",
    "K": "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
    "L": "#.... #.... #.... #.... #.... #.... #####",
    "M": "#...# ##.## #.#.# #.#.# #...# #...# #...#",
    "N": "#...# #...# ##..# #.#.# #..## #...# #...#",
    "O": ".###. #...# #...# #...# #...# #...# .###.",
    "P": "####. #...# #...# ####. #.... #.... #....",
    "Q": ".###. #...# #...# #...# #.#.# #..#. .##.#",
    "R": "####. #...# #...# ####. #.#.. #..#. #...#",
    "S": ".#### #.... #.... .###. ....# ....# ####.",
    "T": "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    "U": "#...# #...# #...# #...# #...# #...# .###.",
    "V": "#...# #...# #...# #...# #...# .#.#. ..#..",
    "W": "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
    "X": "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
    "Y": "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
    "Z": "##### ....# ...#. ..#.. .#... #.... #####",
    "[": ".###. .#... .#... .#... .#... .#... .###.",
    "\\": "..... #.... .#... ..#.. ...#. ....# .....",
    "]": ".###. ...#. ...#. ...#. ...#. ...#. .###.",
    "^": "..#.. .#.#. #...# ..... ..... ..... .....",
    "_": "..... ..... ..... ..... ..... ..... #####",
    "`": ".#... ..#.. ...#. ..... ..... ..... .....",
    "a": "..... ..... .###. ....# .#### #...# .####",
    "b": "#.... #.... ####. #...# #...# #...# ####.",
    "c": "..... ..... .###. #.... #.... #...# .###.",
    "d": "....# ....# .#### #...# #...# #...# .####",
    "e": "..... ..... .###. #...# ##### #.... .###.",
    "f": "..##. .#..# .#... ###.. .#... .#... .#...",
    "g": "..... ..... .#### #...# #...# .#### ....# .###.",
    "h": "#.... #.... ####. #...# #...# #...# #...#",
    "i": "..#.. ..... .##.. ..#.. ..#.. ..#.. .###.",
    "j": "...#. ..... ..##. ...#. ...#. ...#. #..#. .##..",
    "k": "#.... #.... #..#. #.#.. ##... #.#.. #..#.",
    "l": ".##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
    "m": "..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#",
    "n": "..... ..... ####. #...# #...# #...# #...#",
    "o": "..... ..... .###. #...# #...# #...# .###.",
    "p": "..... ..... ####. #...# #...# ####. #.... #....",
    "q": "..... ..... .#### #...# #...# .#### ....# ....#",
    "r": "..... ..... #.##. ##..# #.... #.... #....",
    "s": "..... ..... .#### #.... .###. ....# ####.",
    "t": ".#... .#... ###.. .#... .#... .#..# ..##.",
    "u": "..... ..... #...# #...# #...# #..## .##.#",
    "v": "..... ..... #...# #...# #...# .#.#. ..#..",
    "w": "..... ..... #...# #...# #.#.# #.#.# .#.#.",
    "x": "..... ..... #...# .#.#. ..#.. .#.#. #...#",
    "y": "..... ..... #...# #...# #...# .#### ....# .###.",
    "z": "..... ..... ##### ...#. ..#.. .#... #####",
    "{": "...## ..#.. ..#.. .#... ..#.. ..#.. ...##",
    "|": "..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    "}": "##... ..#.. ..#.. ...#. ..#.. ..#.. ##...",
    "~": "..... ..... .#... #.#.# ...#. ..... .....",
    "\x7f": "..... .###. .###. .###. .###. .###. .....",
}


def build_font():
    im = A.new(96, 48)
    px = im.load()
    for i in range(96):
        ch = chr(32 + i)
        rows = FONT[ch].split()
        assert len(rows) in (7, 8) and all(len(r) == 5 for r in rows), repr(ch)
        assert len(rows) == 7 or ch in "gjpqy", repr(ch)
        cx, cy = (i % 16) * 6, (i // 16) * 8
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c == "#":
                    px[cx + x, cy + y] = WHITE
                elif c != ".":
                    raise ValueError(f"bad font pixel {c!r} in {ch!r}")
    A.save(im, "ui/font.png")
    return im


# =================================================================== 9-slice
PANEL = [
    ".OOOOOOOOOO.",
    "OHHHHHHHHHMO",
    "OHcffffffcSO",
    "OHffffffffSO",
    "OHffffffffSO",
    "OHffffffffSO",
    "OHffffffffSO",
    "OHffffffffSO",
    "OHffffffffSO",
    "OHcffffffcSO",
    "OMSSSSSSSSSO",
    ".OOOOOOOOOO.",
]
PANEL_PAL = {"O": OUT, "H": hexc("334155"), "M": hexc("252d3d"), "S": hexc("1e2433"),
             "c": hexc("262e40"), "f": hexc("141824")}

BUTTON = [
    ".OOOOOOOOOO.",
    "OWhhhhhhhhhO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OhbbbbbbbbsO",
    "OsssssssssSO",
    "OSSSSSSSSSSO",
    ".OOOOOOOOOO.",
]
BUTTON_PAL = {"O": OUT, "W": hexc("94a3b8"), "h": hexc("64748b"), "b": hexc("334155"),
              "s": hexc("1e293b"), "S": hexc("0f172a")}
BUTTON_HI_PAL = {"O": OUT, "W": hexc("cffafe"), "h": hexc("22d3ee"), "b": hexc("3b4a63"),
                 "s": hexc("0e7490"), "S": hexc("164e63")}


# =================================================================== slots 18x18
def slot_base(ring_tl, ring_br, inner_sh, fill, corner=None):
    """Inset slot: outline, 1px frame (reverse bevel), inner shadow, fill."""
    rows = []
    for y in range(18):
        r = []
        for x in range(18):
            edge = x in (0, 17) or y in (0, 17)
            if edge:
                r.append("." if (x in (0, 17) and y in (0, 17)) else "O")
            elif x in (1, 16) or y in (1, 16):
                r.append("t" if (x == 1 or y == 1) and not (x == 16 or y == 16) else "b")
            elif x == 2 or y == 2:
                r.append("i")
            else:
                r.append("f")
        rows.append("".join(r))
    pal = {"O": OUT, "t": ring_tl, "b": ring_br, "i": inner_sh, "f": fill}
    im = A.ascii_img(rows, pal)
    if corner:
        for x, y in ((1, 1), (16, 1), (1, 16), (16, 16)):
            A.put(im, x, y, corner)
    return im


PADLOCK = [
    "..DDD..",
    ".D...D.",
    ".D...D.",
    "hdddddD",
    "hddOddD",
    "hddOddD",
    "DDDDDDD",
]

POST_NOTCH = [  # amber corner tab with a small arrow, placed top-right inside
    "yyyyy",
    ".yggg",
    "..ygg",
    "...yg",
    "....g",
]


def build_slots():
    fill = hexc("111522")
    A.save(slot_base(hexc("0b0e16"), hexc("3d4a60"), hexc("0b0e16"), fill), "ui/slot.png")

    hi = slot_base(hexc("22d3ee"), hexc("0e7490"), hexc("164e63"), hexc("12202e"),
                   corner=hexc("cffafe"))
    A.save(hi, "ui/slot_hi.png")

    lk = slot_base(hexc("0a0c12"), hexc("232a38"), hexc("0a0c12"), hexc("0d1017"))
    lock = A.ascii_img(PADLOCK, dict(A.ramp_pal(Ddh="stone"), O=OUT))
    lk.paste(lock, (5, 5), lock)
    A.save(lk, "ui/slot_locked.png")

    post = slot_base(hexc("fbbf24"), hexc("92400e"), hexc("3a2508"), hexc("16140f"),
                     corner=hexc("fef3c7"))
    notch = A.ascii_img(POST_NOTCH, {"y": hexc("fef3c7"), "g": hexc("fbbf24")})
    post.paste(notch, (11, 2), notch)
    A.save(post, "ui/slot_post.png")


# =================================================================== cursor
CURSOR = [
    "................",
    ".......h........",
    ".......c........",
    "......hcc.......",
    "....hh...cc.....",
    "....h.....c.....",
    "...h.......c....",
    ".hcc.......ccc..",
    "...c.......c....",
    "....c.....c.....",
    "....cc...cc.....",
    "......ccc.......",
    ".......c........",
    ".......c........",
    "................",
    "................",
]


def build_cursor():
    im = A.ascii_img(CURSOR, {"c": RAMP["cyan"][1], "h": RAMP["cyan"][2]})
    im = A.outline(im)
    im.putpixel((7, 7), A.T)
    A.save(im, "ui/cursor.png")


# =================================================================== 8x8 pips / icons
def icon8(rows, pal, name):
    im = A.outline(A.ascii_img(rows, pal))
    assert im.size == (8, 8), name
    A.save(im, f"ui/{name}.png")


HEART8 = [
    "........",
    "........",
    ".wh..rr.",
    ".hrrrrD.",
    ".rrrrDD.",
    "..rrDD..",
    "...DD...",
    "........",
]
HEART8_EMPTY = [
    "........",
    "........",
    ".ee..ee.",
    ".euueue.",
    ".euuuue.",
    "..euue..",
    "...ee...",
    "........",
]
SHIELD8 = [
    "........",
    ".hhhhbD.",
    ".hbbbbD.",
    ".hbwbbD.",
    ".bbbbDD.",
    "..bbDD..",
    "...DD...",
    "........",
]
DIAMOND8 = [
    "........",
    "...hb...",
    "..hhbb..",
    ".hhbbbD.",
    ".hbbbDD.",
    "..bbDD..",
    "...DD...",
    "........",
]
DROP8 = [
    "........",
    "...b....",
    "..hbD...",
    "..hbD...",
    ".hwbbD..",
    ".hbbbD..",
    "..bDD...",
    "........",
]
COIN8 = [
    "........",
    "..hhbb..",
    ".hbbbbD.",
    ".hbDbbD.",
    ".bbDbbD.",
    ".bbbbDD.",
    "..bDDD..",
    "........",
]
KEY8 = [
    "........",
    "........",
    ".hhb....",
    ".h.bhbbD",
    ".bbD.D.D",
    "........",
    "........",
    "........",
]
CRYSTAL8 = [
    "........",
    "...hb...",
    "..hhbD..",
    ".hhbbDD.",
    ".hbbbDD.",
    "..hbDD..",
    "...bD...",
    "........",
]


def build_icons8():
    red = A.ramp_pal(Dbh="red")
    icon8(HEART8, {"D": red["D"], "r": red["b"], "h": red["h"], "w": hexc("fee2e2")}, "heart_full")
    icon8(HEART8_EMPTY, {"e": hexc("5b1a24"), "u": hexc("1c1218")}, "heart_empty")
    icon8(SHIELD8, dict(A.ramp_pal(Dbh="blue"), w=hexc("f0fdff")), "shield_pip")
    icon8(DIAMOND8, A.ramp_pal(Dbh="cyan"), "mana_pip")
    icon8(COIN8, A.ramp_pal(Dbh="gold"), "coin_small")
    icon8(KEY8, A.ramp_pal(Dbh="yellow"), "key_small")
    icon8(CRYSTAL8, {"D": RAMP["purple"][0], "b": RAMP["void"][1], "h": RAMP["cyan"][2]},
          "crystal_small")
    icon8(DROP8, dict(A.ramp_pal(Dbh="blood"), w=hexc("fecdd3")), "blood_small")


# =================================================================== door badges 16x16
BADGE = [
    "................",
    ".....######.....",
    "...##########...",
    "..############..",
    "..############..",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    "..############..",
    "..############..",
    "...##########...",
    ".....######.....",
    "................",
]
BG = hexc("0f1320")


def badge(ramp):
    sh, base, hi = RAMP[ramp]
    im = A.ascii_img(BADGE, {"#": base})
    px = im.load()
    src = im.copy().load()
    fill = mix(sh, BG, 0.72)
    inner = mix(sh, BG, 0.5)
    for y in range(16):
        for x in range(16):
            if src[x, y][3] == 0:
                continue
            border = any(src[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if not border:
                px[x, y] = fill
    # soft inner lower-right gradient band (1 step), purely stepped
    for y in range(16):
        for x in range(16):
            if px[x, y] == fill and x + y >= 20:
                px[x, y] = inner
    A.rim_shade(im, base, ramp)
    return A.outline(im)


# 10x10 glyphs placed at (3,3); each gets its own dark outline.
GLYPHS = {
    "combat": ([
        "..........",
        ".hb....bh.",
        "..hb..bh..",
        "...hbbh...",
        "....hh....",
        "...bhhb...",
        "..Gh..hG..",
        "..GG..GG..",
        ".w......w.",
        "G........G",
    ], {"h": RAMP["grey"][2], "b": RAMP["grey"][1], "G": RAMP["gold"][1], "w": RAMP["wood"][1]}),
    "spell": ([
        "hbbbbbbbbD",
        ".DDDDDDDD.",
        ".pppppppP.",
        ".pccccp.P.",
        ".pppppppP.",
        ".pcccccpP.",
        ".pppppppP.",
        ".pcc.ccpP.",
        "hbbbbbbbbD",
        ".DDDDDDDD.",
    ], {"h": RAMP["bone"][2], "b": RAMP["bone"][1], "D": RAMP["bone"][0],
        "p": hexc("d6cfc4"), "P": RAMP["bone"][0], "c": RAMP["cyan"][1]}),
    "relic": ([
        "c........c",
        ".c......c.",
        "..c....c..",
        "...yggG...",
        "..yqppPG..",
        "..gpppPG..",
        "..gppPPG..",
        "..GpPPPG..",
        "...GGGG...",
        "..........",
    ], {"c": RAMP["gold"][1], "y": RAMP["gold"][2], "g": RAMP["gold"][1], "G": RAMP["gold"][0],
        "p": RAMP["void"][1], "P": RAMP["purple"][0], "q": RAMP["void"][2]}),
    "gold": ([
        "..........",
        ".yyyy.....",
        "yggggG....",
        "GGGGGG....",
        "yggggGyyg.",
        "GGGGOyyggG",
        "yggOyyGggG",
        "GGGOygGggG",
        "yggOygggGG",
        "GGGG.GGGG.",
    ], A.ramp_pal(Ggy="gold") | {"O": OUT}),
    "health": ([
        "..........",
        ".hrr..rrr.",
        "hwrrrrrrrD",
        "hrrrrrrrrD",
        "rrrrrrrrDD",
        ".rrrrrrDD.",
        "..rrrrDD..",
        "...rrDD...",
        "....DD....",
        "..........",
    ], dict(A.ramp_pal(Drh="red"), w=hexc("fee2e2"))),
    "shop": ([
        "..........",
        "...h..D...",
        "...hbbD...",
        "....GG....",
        "...hbbD...",
        "..hbbbbD..",
        ".hbbyygbD.",
        ".hbbygGbD.",
        ".bbbbGGbD.",
        "..bbbbDD..",
    ], {"h": RAMP["wood"][2], "b": RAMP["wood"][1], "D": RAMP["wood"][0],
        "G": RAMP["gold"][0], "g": RAMP["gold"][1], "y": RAMP["gold"][2]}),
    "forge": ([
        "..........",
        "....fFy...",
        "hhhhhhhhh.",
        ".bbbbbbbbD",
        "...bbbbD..",
        "...bbbDD..",
        "..bbbbbD..",
        ".bbbbbbbD.",
        ".DDDDDDDD.",
        "..........",
    ], {"h": RAMP["grey"][2], "b": RAMP["grey"][1], "D": RAMP["grey"][0],
        "f": RAMP["fire"][0], "F": RAMP["fire"][1], "y": RAMP["fire"][2]}),
    "elite": ([
        ".y..yy..y.",
        ".yy.yy.yG.",
        ".yyyrryyG.",
        "..hbbbbD..",
        ".hbbbbbbD.",
        ".hOObbOOD.",
        ".bOObbOOD.",
        "..bbbObD..",
        "..bDbDbD..",
        "..........",
    ], {"y": RAMP["gold"][1], "G": RAMP["gold"][0], "r": RAMP["red"][1],
        "h": RAMP["bone"][2], "b": RAMP["bone"][1], "D": RAMP["bone"][0], "O": OUT}),
    "boss": ([
        "h........h",
        "hb......bD",
        ".hb.rr.bD.",
        "..rrrrrrD.",
        ".rrrrrrrrD",
        ".rOerrOerD",
        ".rOOrrOOrD",
        "..rrrOrrD.",
        "..rDrDrD..",
        "...DDDD...",
    ], {"h": RAMP["bone"][2], "b": RAMP["bone"][1], "D": RAMP["red"][0],
        "r": RAMP["red"][1], "O": OUT, "e": RAMP["fire"][2]}),
    "fountain": ([
        "....hb....",
        "....hb....",
        "...hbbD...",
        "...hbbD...",
        "..hwbbbD..",
        ".hwbbbbbD.",
        ".hbbbbbbD.",
        ".hbbbbbDD.",
        "..bbbbDD..",
        "...DDDD...",
    ], {"h": RAMP["ice"][1], "w": RAMP["ice"][2], "b": RAMP["ice"][0], "D": RAMP["blue"][1]}),
    "crimson": ([
        "..........",
        "..........",
        "..wffrRw..",
        ".wwfOORww.",
        "wwwrOORwwS",
        ".SwrrRRwS.",
        "..SSRRSS..",
        "..........",
        "..........",
        "..........",
    ], {"w": hexc("fde2e4"), "S": hexc("b89aa0"), "f": RAMP["blood"][2], "r": RAMP["blood"][1],
        "R": RAMP["blood"][0], "O": OUT}),
    "unknown": ([
        "...hhhh...",
        "..hbbbbD..",
        "..bD..bD..",
        "......bD..",
        ".....bD...",
        "....bD....",
        "....bD....",
        "..........",
        "....bD....",
        "..........",
    ], A.ramp_pal(Dbh="bone")),
}
DOOR_RAMP = {
    "combat": "grey", "spell": "cyan", "relic": "purple", "gold": "gold",
    "health": "green", "shop": "teal", "forge": "rust", "elite": "magenta",
    "boss": "red", "fountain": "blue", "crimson": "flesh", "unknown": "slate",
}


def build_doors():
    for name in sorted(GLYPHS):
        rows, pal = GLYPHS[name]
        assert len(rows) == 10 and all(len(r) == 10 for r in rows), name
        g = A.new(16, 16)
        gl = A.ascii_img(rows, pal)
        g.paste(gl, (3, 3), gl)
        g = A.outline(g)
        im = badge(DOOR_RAMP[name])
        im.paste(g, (0, 0), g)
        A.save(im, f"ui/door_icon_{name}.png")


# =================================================================== elite crown
CROWN = [
    "................",
    "....y..yy..y....",
    "....yy.yy.yy....",
    "....ghgrRggg....",
    "....GGGGGGGG....",
    "................",
]


def build_crown():
    pal = {"y": RAMP["gold"][2], "g": RAMP["gold"][1], "G": RAMP["gold"][0],
           "h": RAMP["gold"][2], "r": RAMP["red"][2], "R": RAMP["red"][1]}
    im = A.ascii_img(CROWN, pal, w=16, h=16)
    A.save(A.outline(im), "ui/elite_crown.png")


# =================================================================== entry
def build():
    build_font()
    A.save(A.ascii_img(PANEL, PANEL_PAL), "ui/panel.png")
    A.save(A.ascii_img(BUTTON, BUTTON_PAL), "ui/button.png")
    A.save(A.ascii_img(BUTTON, BUTTON_HI_PAL), "ui/button_hi.png")
    build_slots()
    build_cursor()
    build_icons8()
    build_doors()
    build_crown()
