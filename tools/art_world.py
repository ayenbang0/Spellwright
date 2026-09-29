"""World art: floor/wall tiles per chapter, props, interactables and pickups."""
import math
from art_core import (RAMP, hexc, new, ascii_img, outline, pad, shift, silhouette, recolor,
                      alpha_mul, over, save, save_anim, OUT, WHITE, MAGENTA, rng, disc, ring,
                      rect, line, put, ball, flip_h, ellipse)

CHAPTERS = ["camp", "forest", "purgatory", "void", "abyss", "throne"]

# floor (dark, mid, light, accent) — low contrast so bullets pop
FLOOR = {
    "camp":      ("4a3f2e", "5a4d38", "6b5c43", "5f7a3a"),
    "forest":    ("1f3a24", "27472c", "305535", "3f6b3a"),
    "purgatory": ("35343a", "403f45", "4c4a50", "5a3a2a"),
    "void":      ("15122e", "1c1840", "241f4f", "4c2a8a"),
    "abyss":     ("0f2a2c", "143538", "1a4145", "2a6b66"),
    "throne":    ("2e1418", "3a1a1f", "472228", "6b4a1e"),
}
# wall (shadow, base, light, top)
WALL = {
    "camp":      ("3b2a1a", "6b4a2b", "8f6a40", "a07a4a"),
    "forest":    ("1f2a1c", "3b4a2e", "566b3e", "6f8a4a"),
    "purgatory": ("27272a", "52525b", "71717a", "8a8a93"),
    "void":      ("120f2a", "2e2360", "46368a", "6b52b8"),
    "abyss":     ("0b2224", "1d4a4c", "2a6666", "3f8a84"),
    "throne":    ("2a0d10", "5c1a20", "7f2a2e", "a8443c"),
}


def C(s):
    return hexc(s)


# ---------------------------------------------------------------- floors
def floor_tile(ch, var):
    dk, md, lt, ac = (C(x) for x in FLOOR[ch])
    r = rng(f"floor:{ch}:{var}")
    im = new(16, 16)
    rect(im, 0, 0, 15, 15, md)
    px = im.load()
    if ch in ("purgatory", "throne", "abyss", "void"):
        # flagstones: seams on the top row / left column so tiles form a grid; offset split
        for x in range(16):
            px[x, 0] = dk
        for y in range(16):
            px[0, y] = dk
        split = 8
        for x in range(1, 16):
            px[x, split] = dk
        sx = 7 if var % 2 == 0 else 10
        for y in range(1, split):
            px[sx, y] = dk
        for y in range(split + 1, 16):
            px[(sx + 5) % 15 + 1, y] = dk
        # bevel highlight under seams
        for x in range(1, 16):
            if px[x, 1] == md:
                px[x, 1] = lt
            if px[x, split + 1] == md:
                px[x, split + 1] = lt
    # speckle
    n = {0: 6, 1: 9, 2: 7, 3: 11}[var]
    for _ in range(n):
        x, y = r.randrange(1, 15), r.randrange(1, 15)
        if px[x, y] == md:
            px[x, y] = dk if r.random() < 0.55 else lt
    if ch in ("camp", "forest"):
        # grass blades / pebbles
        for _ in range(3 + var):
            x, y = r.randrange(1, 15), r.randrange(2, 15)
            px[x, y] = ac
            px[x, y - 1] = ac if ch == "forest" else lt
    if var == 1 and ch not in ("camp", "forest"):
        # small crack
        x, y = r.randrange(3, 12), r.randrange(3, 12)
        for i in range(4):
            if 0 < x < 15 and 0 < y < 15:
                px[x, y] = dk
            x += 1
            y += r.choice((-1, 0, 1))
    if var == 2:
        # accent patch (moss / rune dust / gold fleck)
        x, y = r.randrange(3, 12), r.randrange(3, 12)
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            px[x + dx, y + dy] = ac
    if var == 3 and ch in ("void",):
        px[8, 5], px[7, 6], px[9, 6], px[8, 7] = ac, ac, ac, ac
    return im


def wall_top(ch):
    sh, b, lt, top = (C(x) for x in WALL[ch])
    im = new(16, 16)
    rect(im, 0, 0, 15, 15, b)
    px = im.load()
    # brick seams seen from above
    for x in range(16):
        px[x, 0] = sh
        px[x, 8] = sh
    for y in range(1, 8):
        px[4, y] = sh
        px[12, y] = sh
    for y in range(9, 16):
        px[0, y] = sh
        px[8, y] = sh
    for x in range(16):
        if px[x, 1] == b:
            px[x, 1] = top
        if px[x, 9] == b:
            px[x, 9] = top
    r = rng("walltop:" + ch)
    for _ in range(5):
        x, y = r.randrange(1, 15), r.randrange(2, 15)
        if px[x, y] == b:
            px[x, y] = lt
    return im


def wall_face(ch):
    sh, b, lt, top = (C(x) for x in WALL[ch])
    im = new(16, 16)
    rect(im, 0, 0, 15, 15, b)
    px = im.load()
    for x in range(16):
        px[x, 0] = top          # lit top lip
        px[x, 1] = lt
        px[x, 6] = sh
        px[x, 11] = sh
        px[x, 15] = OUT         # contact shadow line
        px[x, 14] = sh
    for y in range(2, 6):
        px[5, y] = sh
        px[13, y] = sh
    for y in range(7, 11):
        px[1, y] = sh
        px[9, y] = sh
    for y in range(12, 14):
        px[5, y] = sh
        px[13, y] = sh
    for y in (7, 12, 2):
        for x in range(16):
            if px[x, y] == b and px[x - 1 if x else 0, y] != sh:
                px[x, y] = lt if y == 2 else px[x, y]
    return im


# ---------------------------------------------------------------- decor
def _pal(**kw):
    return {k: (C(v) if isinstance(v, str) else v) for k, v in kw.items()}


GRASS = ["......", "..g...", "g.gg.g", ".gGgg.", "GgGGgG"]
DECOR = {
    "camp": [
        (GRASS, _pal(g="6b8a3a", G="4a6326")),
        (["..r..", ".rwr.", "..r..", "..g..", ".gg.."], _pal(r="f472b6", w="fef08a", g="4a6326")),
        (["..ddh..", ".dddhh.", "Dddddd.", "DDDDdd."], _pal(D="44403c", d="78716c", h="a8a29e")),
        (["...y...", "..yYy..", "..LwL..", "..LwL..", "..LLL..", "...L..."], _pal(y="fde047", Y="f97316", L="3f3f46", w="fef3c7")),
    ],
    "forest": [
        (GRASS, _pal(g="3f6b3a", G="27472c")),
        ([".MMm..", "MMmmn.", "..s.Mm", "..sMmn", "..s.s."], _pal(M="7c2d12", m="c2410c", n="fdba74", s="e7dcc8")),
        (["g...g.", ".g.g..", "g.gg.g", ".ggg..", "..g..."], _pal(g="4ade80")),
        (["..ll...", ".lLLl..", "lLllLl.", ".lLLl..", "..l...."], _pal(l="a16207", L="713f12")),
    ],
    "purgatory": [
        (["..b...b.", ".bbb.bb.", "..bBbb..", ".bb.Bbb."], _pal(b="d6d3d1", B="a8a29e")),
        (["..y..", "..Y..", ".www.", ".wWw.", ".wWw.", "sssss"], _pal(y="fde047", Y="f97316", w="f5f5f4", W="d6d3d1", s="57534e")),
        (["...dd...", ".ddDd.d.", "dDdddDd.", "DDdDDdDd"], _pal(D="3f3f46", d="71717a")),
        ([".c.c.c.", "c.c.c.c", ".c.c.c."], _pal(c="9a3412")),
    ],
    "void": [
        (["..h..", ".hCh.", ".CcC.", ".CcC.", "CccCC", ".CCC."], _pal(h="f5d0fe", c="a855f7", C="6b21a8")),
        (["..g..", ".gGg.", "gGwGg", ".gGg.", "..g.."], _pal(g="7c3aed", G="c084fc", w="22d3ee")),
        (["..p.p..", ".pPpPp.", "..pPp..", "...s...", "..ss..."], _pal(p="c026d3", P="f0abfc", s="4c1d95")),
        (["..o..", ".oOo.", ".oOo.", ".oOo.", "ooOoo"], _pal(o="2e2360", O="6b52b8")),
    ],
    "abyss": [
        (["c...c.", "cc.cc.", ".ccc.c", "..cCcc", "..CC.."], _pal(c="fb7185", C="be123c")),
        (["..sss.", ".sSsss", "sSsSss", ".sssS."], _pal(s="fde68a", S="d97706")),
        (["..bbb..", ".bkbkb.", ".bbbbb.", "..bkb.."], _pal(b="e7e5e4", k=OUT)),
        (["t.t...", "t.t.t.", ".tt.t.", ".t.tt.", ".tt.t.", "..tt.."], _pal(t="14b8a6")),
    ],
    "throne": [
        (["..y..", "..Y..", ".rrr.", ".rRr.", ".rRr.", "ggggg"], _pal(y="fde047", Y="f97316", r="7f1d1d", R="dc2626", g="a16207")),
        (["..bb....", ".bkkb.b.", ".bbbbbkb", "bkbbkbbb"], _pal(b="e7e5e4", k=OUT)),
        (["rrrr", "rRRr", "rrrr", "r.r.", "r..."], _pal(r="991b1b", R="fbbf24")),
        (["..RR...", ".RrrR..", "RrrrrRR", ".RRrR.."], _pal(R="7f1d1d", r="b91c1c")),
    ],
}


def decor(ch, i):
    rows, pal = DECOR[ch][i]
    art = ascii_img(rows, pal)
    im = new(16, 16)
    im.alpha_composite(art, ((16 - art.width) // 2, 14 - art.height))
    return outline(im)


# ---------------------------------------------------------------- props / interactables
def door(open_):
    sh, b, lt, top = (C(x) for x in WALL["purgatory"])
    im = wall_face("purgatory")
    rows = [
        "....oooooo....",
        "...oIIIIIIo...",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
        "..oIIIIIIIIo..",
    ]
    if open_:
        pal = {"o": lt, "I": C("08070d")}
    else:
        rows = [r.replace("I", "w") for r in rows]
        rows[4] = "..owwwwwwwwo.."
        rows[5] = "..oiiiiiiiio.."
        rows[9] = "..oiiiiiiiio.."
        rows[7] = "..owwwwwwgwo.."
        pal = {"o": lt, "w": C("6b4423"), "i": C("3f3f46"), "g": C("fbbf24")}
    art = ascii_img(rows, pal)
    im.alpha_composite(art, (1, 2))
    if open_:
        # soft light spill inside
        for y in range(12, 15):
            for x in range(5, 11):
                im.putpixel((x, y), C("1a1830"))
    return im


def portal_frames():
    frames = []
    for f in range(4):
        im = new(16, 16)
        disc(im, 7.5, 7.5, 6.5, C("1e1b4b"))
        disc(im, 7.5, 7.5, 5, C("2e1065"))
        for arm in range(3):
            for k in range(14):
                t = k / 13.0
                a = arm * 2 * math.pi / 3 + f * math.pi / 6 + t * 2.4
                rr = 1 + t * 5.2
                x, y = int(round(7.5 + rr * math.cos(a))), int(round(7.5 + rr * math.sin(a)))
                col = WHITE if t < 0.25 else (RAMP["cyan"][1] if t < 0.6 else RAMP["void"][1])
                put(im, x, y, col)
        put(im, 7, 7, WHITE)
        put(im, 8, 8, WHITE)
        frames.append(outline(im))
    return frames


def fountain_frames():
    frames = []
    st = _pal(S="3f3f46", s="71717a", h="a1a1aa")
    for f in range(4):
        rows = [
            "......ss......",
            ".....sHhs.....",
            "......ss......",
            "......ss......",
            ".SsshhhhhhhssS",
            "SsWWWWWWWWWWsS",
            "SsWwWWWwWWWWsS",
            "SSsssssssssSSS",
            ".SSSSSSSSSSSS.",
        ]
        pal = dict(st, H=C("a1a1aa"), W=RAMP["cyan"][0], w=RAMP["ice"][1])
        # ripple moves
        rows[6] = "Ss" + "".join("w" if (i + f) % 4 == 0 else "W" for i in range(10)) + "sS"
        art = ascii_img(rows, pal)
        im = new(16, 16)
        im.alpha_composite(art, (1, 5))
        # water jet with droplets cycling
        jet = [(7, 3), (8, 3), (7, 2), (8, 2)]
        for (x, y) in jet:
            put(im, x, y, RAMP["ice"][1])
        drops = [(5, 3 + (f % 2)), (10, 3 + ((f + 1) % 2)), (4 + (f % 2), 5), (11 - (f % 2), 5)]
        for (x, y) in drops:
            put(im, x, y, RAMP["cyan"][1])
        put(im, 7, 1, WHITE if f % 2 == 0 else RAMP["ice"][1])
        put(im, 8, 1, RAMP["ice"][1] if f % 2 == 0 else WHITE)
        frames.append(outline(im))
    return frames


def pedestal():
    rows = [
        "HhhhhhhhhhhhhS",
        "hssssssssssssS",
        ".SSSSSSSSSSSS.",
        "....hsssSS....",
        "....hsgsSS....",
        "....hsssSS....",
        "....hsgsSS....",
        "....hsssSS....",
        "...hhssssSS...",
        "..hsssssssSS..",
        ".SSSSSSSSSSSS.",
    ]
    art = ascii_img(rows, _pal(S="3f3f46", s="71717a", h="a1a1aa", H="d4d4d8", g="fbbf24"))
    im = new(16, 16)
    im.alpha_composite(art, (1, 3))
    return outline(im)


def pit():
    im = new(16, 16)
    rect(im, 0, 0, 15, 15, C("050409"))
    px = im.load()
    for x in range(16):
        px[x, 0] = C("3f3f46")
        px[x, 1] = C("27272a")
        px[x, 2] = C("141418")
    for y in range(16):
        px[0, y] = px[0, y] if y < 3 else C("141418")
        px[15, y] = px[15, y] if y < 3 else C("141418")
    return im


def spikes():
    rows = [
        "..h....h....h..",
        ".hS...hS...hS..",
        ".hs...hs...hs..",
        "hssS.hssS.hssS.",
        "..h....h....h..",
        ".hS...hS...hS..",
        "hssS.hssS.hssS.",
        "PPPPPPPPPPPPPPP",
    ]
    art = ascii_img(rows, _pal(h="e5e7eb", s="94a3b8", S="475569", P="3f3f46"))
    im = new(16, 16)
    im.alpha_composite(art, (0, 6))
    return pad(outline(im), 18, 18)


def breakable_pot():
    rows = [
        "...DddhD...",
        "....Ddh....",
        "..DddddhD..",
        ".DddrrrdhD.",
        ".DdrddddhD.",
        ".DddrrrddD.",
        ".DDddddddD.",
        "..DDdddDD..",
        "...DDDDD...",
    ]
    art = ascii_img(rows, _pal(D="7c2d12", d="c2410c", h="fdba74", r="fbbf24"))
    im = new(16, 16)
    im.alpha_composite(art, (2, 5))
    return outline(im)


def dummy():
    rows = [
        "....hhh....",
        "...dhhhd...",
        "...ddrdd...",
        "...ddddd...",
        "....DDD....",
        "WWwwwddwwWW",
        "....ddd....",
        "...drrrd...",
        "...ddddd...",
        "....DDD....",
        ".....W.....",
        ".....W.....",
        "...WWWWW...",
    ]
    art = ascii_img(rows, _pal(D="a16207", d="d6b16a", h="f5e3b3", r="dc2626", W="6b4423", w="8b5a2b"))
    im = new(16, 16)
    im.alpha_composite(art, (2, 1))
    return outline(im)


def forge():
    rows = [
        "..............",
        "..SsssssssS...",
        ".SsssssssssS..",
        "SSsshhhhhssSS.",
        "..SSssssSS....",
        "...SsssS......",
        "..SSssssSS....",
        ".fFfFfFfFfF...",
        ".FrfFrFfrFf...",
    ]
    art = ascii_img(rows, _pal(S="27272a", s="52525b", h="a1a1aa", f="f97316", F="dc2626", r="fde047"))
    im = new(16, 16)
    im.alpha_composite(art, (1, 4))
    return outline(im)


def shop_mat():
    im = new(16, 16)
    rect(im, 1, 3, 14, 12, C("7f1d1d"))
    rect(im, 2, 4, 13, 11, C("b91c1c"))
    rect(im, 3, 5, 12, 10, C("7f1d1d"))
    rect(im, 4, 6, 11, 9, C("b91c1c"))
    for x in (1, 14):
        for y in range(4, 12, 2):
            put(im, x, y, C("fbbf24"))
    put(im, 7, 7, C("fbbf24"))
    put(im, 8, 8, C("fbbf24"))
    put(im, 8, 7, C("fef3c7"))
    put(im, 7, 8, C("fbbf24"))
    return outline(im)


# ---------------------------------------------------------------- pickups
def coin_frames():
    widths = [
        [".DDdd.", "Ddhhdd", "DdhDdd", "DdhDdd", "Ddddhd", ".DDdd."],
        ["DDd.", "Ddhd", "DdDd", "DdDd", "Dddd", "DDd."],
        ["Dd", "Dh", "Dd", "Dd", "Dd", "Dd"],
        [".DDd", "dhdD", "dDdD", "dDdD", "dddD", ".dDD"],
    ]
    pal = _pal(D="92400e", d="fbbf24", h="fef3c7")
    out = []
    for i, rows in enumerate(widths):
        art = ascii_img(rows, pal)
        im = new(16, 16)
        im.alpha_composite(art, ((16 - art.width) // 2, 5))
        out.append(outline(im))
    return out


def gem_frames(kind):
    if kind == "diamond":
        rows = [
            "..hhhh..",
            ".hBhhBh.",
            "hBbbbbBb",
            ".BbbbbB.",
            "..BbbB..",
            "...BB...",
        ]
        pal = _pal(h="e0f2fe", b="38bdf8", B="0369a1")
        y0 = 5
    else:
        rows = [
            "..h..",
            ".hbB.",
            ".hbB.",
            "hbbbB",
            "hbbbB",
            ".bbB.",
            "..B..",
        ]
        pal = _pal(h="f5d0fe", b="c084fc", B="7e22ce")
        y0 = 4
    out = []
    for f in range(4):
        art = ascii_img(rows, pal)
        im = new(16, 16)
        dy = [0, -1, -1, 0][f] if kind != "diamond" else 0
        im.alpha_composite(art, ((16 - art.width) // 2, y0 + dy))
        im = outline(im)
        # travelling glint
        gx = [(5, 5), (7, 5), (9, 6), None][f] if kind == "diamond" else [(7, 5), (7, 6), None, (6, 7)][f]
        if gx:
            put(im, gx[0], gx[1] + dy, WHITE)
        if f == 1:
            for (x, y) in ((12, 3), (12, 5), (11, 4), (13, 4)):
                put(im, x, y, WHITE if (x, y) == (12, 3) else RAMP["ice"][1])
        out.append(im)
    return out


def drop_frames():
    rows = ["..r..", "..r..", ".rrr.", "rrhrr", "rhrrR", "rrrRR", ".RRR."]
    out = []
    for f in range(2):
        art = ascii_img(rows, _pal(r="dc2626", R="7f1d1d", h="fecaca"))
        im = new(16, 16)
        im.alpha_composite(art, (6, 4 + f))
        out.append(outline(im))
    return out


HEART = [".rr.rr.", "rhrrrrR", "rhrrrrR", "rrrrrRR", ".rrrRR.", "..rRR..", "...R..."]


def heart_frames():
    art = ascii_img(HEART, _pal(r="ef4444", R="991b1b", h="fecaca"))
    a = new(16, 16)
    a.alpha_composite(art, (4, 5))
    big = art.resize((9, 8), resample=0)
    b = new(16, 16)
    b.alpha_composite(ascii_img([".rr..rr..", "rhhrrrrR.", "rhrrrrrrR", "rrrrrrrRR", ".rrrrrRR.", "..rrrRR..", "...rRR...", "....R...."],
                                _pal(r="ef4444", R="991b1b", h="fecaca")), (3, 4))
    return [outline(a), outline(b)]


def chest(kind):
    if kind == "open":
        rows = [
            "..LLLLLLLLLL..",
            ".LkkkkkkkkkkL.",
            ".LkyyyyyyyykL.",
            "gWwwwwwwwwwwWg",
            "gWwwwwggwwwwWg",
            "gWwwwwgGwwwwWg",
            "gWwwwwwwwwwwWg",
            "gWWWWWWWWWWWWg",
        ]
    else:
        rows = [
            "..WwwwwwwwwW..",
            ".WwwwwwwwwwwW.",
            "gWwwwwwwwwwwWg",
            "gggggggggggggg",
            "gWwwwwggwwwwWg",
            "gWwwwwgGwwwwWg",
            "gWwwwwwwwwwwWg",
            "gWWWWWWWWWWWWg",
        ]
    pal = _pal(W="5b3a1e", w="8b5a2b", g="fbbf24", G="92400e", L="5b3a1e", k=C("1a1008"), y="fef08a")
    if kind == "cursed":
        pal.update(_pal(W="2e1065", w="5b21b6", g="a855f7", G="f03cb4"))
    if kind == "spike":
        pal.update(_pal(W="3f3f46", w="71717a", g="d4d4d8", G="dc2626"))
    art = ascii_img(rows, pal)
    im = new(16, 16)
    im.alpha_composite(art, (1, 6))
    if kind == "spike":
        for x in (2, 5, 8, 11, 14):
            put(im, x, 5, C("e5e7eb"))
            put(im, x, 4, C("e5e7eb"))
    if kind == "cursed":
        for (x, y) in ((6, 10), (8, 10)):
            put(im, x, y, MAGENTA)
    if kind == "open":
        for (x, y) in ((5, 4), (8, 3), (11, 4)):
            put(im, x, y, C("fef08a"))
    return outline(im)


def key():
    rows = [
        ".ggg.......",
        "gGhGg......",
        "gh.Gggggggg",
        "gGGGg...gGg",
        ".ggg....g.g",
    ]
    art = ascii_img(rows, _pal(g="fbbf24", G="92400e", h="fef3c7"))
    im = new(16, 16)
    im.alpha_composite(art, (2, 6))
    return outline(im)


def potion(liq):
    sh, b, hi = RAMP[liq]
    rows = [
        "...cc...",
        "...cc...",
        "..gGGg..",
        "..g..g..",
        ".g....g.",
        "gwLLLLLg",
        "gwLLLLDg",
        "gLLLLLDg",
        ".gDDDDg.",
    ]
    art = ascii_img(rows, {"c": C("a16207"), "g": C("cbd5e1"), "G": C("94a3b8"), "w": WHITE, "L": b, "D": sh})
    im = new(16, 16)
    im.alpha_composite(art, (4, 4))
    return outline(im)


def shield_cell():
    rows = [
        ".bbbbbbb.",
        "bhhbbbbbB",
        "bhbbbbbbB",
        "bhbbwbbbB",
        ".bbbbbbB.",
        "..bbbbB..",
        "...bBB...",
    ]
    art = ascii_img(rows, _pal(b="3b82f6", B="1e3a8a", h="bfdbfe", w=WHITE))
    im = new(16, 16)
    im.alpha_composite(art, (3, 4))
    return outline(im)


# ---------------------------------------------------------------- build
def tiles():
    for ch in CHAPTERS:
        save(floor_tile(ch, 0), f"tiles/floor_{ch}.png")
        for v in (1, 2, 3):
            save(floor_tile(ch, v), f"tiles/floor_{ch}_v{v}.png")
        save(wall_top(ch), f"tiles/wall_{ch}.png")
        save(wall_face(ch), f"tiles/wallface_{ch}.png")
        for i in range(4):
            save(decor(ch, i), f"tiles/decor_{ch}_{i}.png")
    save(wall_top("purgatory"), "tiles/wall.png")
    save(door(False), "tiles/door_closed.png")
    save(door(True), "tiles/door_open.png")
    save_anim("tiles/portal", portal_frames(), fps=10, loop=True, alias_size=(18, 18))
    save_anim("tiles/fountain", fountain_frames(), fps=8, loop=True)
    save(pedestal(), "tiles/pedestal.png")
    save(pit(), "tiles/pit.png")
    save(spikes(), "tiles/spikes.png")
    save(pad(breakable_pot(), 18, 18), "tiles/breakable_pot.png")
    save(pad(dummy(), 18, 18), "tiles/dummy.png")
    save(pad(forge(), 18, 18), "tiles/forge.png")
    save(pad(shop_mat(), 18, 18), "tiles/shop_mat.png")


def pickups():
    P = (18, 18)
    save_anim("pickups/coin", coin_frames(), fps=10, loop=True, alias_size=P)
    save_anim("pickups/diamond", gem_frames("diamond"), fps=8, loop=True, alias_size=P)
    save_anim("pickups/crystal_meta", gem_frames("crystal"), fps=8, loop=True, alias_size=P)
    save_anim("pickups/blood_drop", drop_frames(), fps=6, loop=True, alias_size=P)
    save_anim("pickups/heart", heart_frames(), fps=4, loop=True, alias_size=P)
    save(chest("open"), "pickups/chest_open.png")
    save(pad(chest("locked"), *P), "pickups/chest_locked.png")
    save(pad(chest("cursed"), *P), "pickups/chest_cursed.png")
    save(pad(chest("spike"), *P), "pickups/chest_spike.png")
    save(pad(key(), *P), "pickups/key.png")
    save(pad(potion("red"), *P), "pickups/potion_red.png")
    save(pad(potion("blue"), *P), "pickups/potion_blue.png")
    save(pad(potion("green"), *P), "pickups/potion_green.png")
    save(pad(shield_cell(), *P), "pickups/shield_cell.png")


def build():
    tiles()
    pickups()
