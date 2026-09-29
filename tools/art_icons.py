"""Item icons + wand sprites (16x16 RGBA): spells, relics, curses, potions, wands.

build() writes:
  icons/spells/<id>.png   framed glyph, frame colour by spell type
  icons/relics/<id>.png   object sprite + rarity sparkle
  icons/curses/<id>.png   dark sigil base + symbolic glyph
  icons/potions/<id>.png  bottle shape x liquid colour
  wands/<id>.png          diagonal wand, handle bottom-left -> head top-right
"""
import json, os, re, math

import art_core as C
from art_core import RAMP, hexc, OUT, new, outline, rect, line, poly, put, disc, ellipse, ring, ball

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "wiki", "data")

WHITE = hexc("ffffff")
FILL = hexc("141824")


def R(r):
    return RAMP[r] if isinstance(r, str) else r


def rp(a, b, c):
    return (hexc(a), hexc(b), hexc(c))


# local ramps
ROCK = rp("6b4f3a", "a07850", "d6b48a")
STEEL = rp("475569", "cbd5e1", "f8fafc")
DARKBLADE = rp("1e1033", "4c1d95", "a78bfa")
GLASS = rp("3b4a5e", "8fa6bf", "e2ecf5")
PAPER = rp("a8a29e", "f5f0e1", "ffffff")
BLUEPRINT = rp("1e3a8a", "2563eb", "bfdbfe")
LEAF = rp("166534", "22c55e", "86efac")
SIGIL = rp("1e1b4b", "2e2a6b", "4a4396")
NIGHT = rp("0f0a1f", "1e1b4b", "3b3480")


def mix(c1, c2, t):
    return tuple(int(round(c1[i] * (1 - t) + c2[i] * t)) for i in range(3)) + (255,)


def shade(im, ramp):
    """Auto 3-tone: base pixels on a top/left silhouette edge -> hi, bottom/right edge -> shadow."""
    sh, b, hi = R(ramp)
    w, h = im.size
    px = im.load()
    src = im.copy().load()

    def e(x, y):
        return not (0 <= x < w and 0 <= y < h) or src[x, y][3] == 0

    for y in range(h):
        for x in range(w):
            if src[x, y] != b:
                continue
            s = e(x, y - 1) + e(x - 1, y) - e(x, y + 1) - e(x + 1, y)
            if s > 0:
                px[x, y] = hi
            elif s < 0:
                px[x, y] = sh


def asc(rows, slots, w=16, h=16, ox=0, oy=0, auto=True):
    """ASCII glyph. slots: {'a': ramp,...}; 'a' base, 'A' shadow, '1'..'5' highlight of the
    1st..5th slot (alphabetical), 'w' white, 'o' outline colour, 'k' dark fill."""
    keys = sorted(slots)
    pal = {"w": WHITE, "o": OUT, "k": FILL}
    for i, k in enumerate(keys):
        sh, b, hi = R(slots[k])
        pal[k] = b
        pal[k.upper()] = sh
        pal[str(i + 1)] = hi
    im = C.ascii_img(rows, pal, w, h, ox, oy)
    if auto:
        for k in keys:
            shade(im, slots[k])
    return im


def centered(layer, box=12, W=16, H=16, oy=0):
    bb = layer.getbbox()
    assert bb, "empty glyph"
    g = layer.crop(bb)
    assert g.width <= box and g.height <= box, (g.size, box)
    c = new(W, H)
    c.alpha_composite(g, ((W - g.width) // 2, (H - g.height) // 2 + oy))
    return c


def L(im, x0, y0, x1, y1, c):
    line(im, x0, y0, x1, y1, c)


def pts(im, ps, c):
    for x, y in ps:
        put(im, x, y, c)


def sgn(v):
    return (v > 0) - (v < 0)


def arrow(im, x0, y0, x1, y1, shaft, head=None, hs=2, fletch=None):
    """Straight 8-direction arrow; head arms of length hs."""
    head = head or shaft
    L(im, x0, y0, x1, y1, shaft)
    dx, dy = sgn(x1 - x0), sgn(y1 - y0)
    bx, by = -dx, -dy
    arms = [(sgn(bx - by), sgn(bx + by)), (sgn(bx + by), sgn(-bx + by))]
    put(im, x1, y1, head)
    for ax, ay in arms:
        for k in range(1, hs + 1):
            put(im, x1 + ax * k, y1 + ay * k, head)
    if fletch:
        for ax, ay in arms:
            put(im, x0 + ax, y0 + ay, fletch)
            put(im, x0 + ax - dx, y0 + ay - dy, fletch)


def star4(im, cx, cy, r, c, core=WHITE, diag=None):
    for k in range(-r, r + 1):
        put(im, cx + k, cy, c)
        put(im, cx, cy + k, c)
    if diag:
        for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            put(im, cx + dx, cy + dy, diag)
    put(im, cx, cy, core)


def slug(s):
    s = s.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def load_ids():
    with open(os.path.join(DATA, "ids.json"), encoding="utf-8") as f:
        return json.load(f)


def load_list(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


# =================================================================== SPELLS
TYPE_RAMP = {"Projectiles": "cyan", "Summon": "purple", "Boost": "gold", "Passive": "green"}


def spell_frame(ramp):
    sh, b, hi = R(ramp)
    im = new()
    rect(im, 1, 0, 14, 15, OUT)
    rect(im, 0, 1, 15, 14, OUT)
    rect(im, 2, 1, 13, 14, b)
    rect(im, 1, 2, 14, 13, b)
    L(im, 2, 1, 13, 1, hi)
    L(im, 1, 2, 1, 12, hi)
    L(im, 2, 14, 13, 14, sh)
    L(im, 14, 3, 14, 13, sh)
    fill = mix(FILL, sh, 0.22)
    rect(im, 2, 2, 13, 13, fill)
    top = mix(FILL, sh, 0.38)
    L(im, 3, 2, 12, 2, top)
    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
        put(im, x, y, b)
    put(im, 2, 2, hi)
    put(im, 13, 13, sh)
    return im


# --- spell glyph painters (12x12 scratch canvas; auto-centred into a 10x10 box)
def g_magic_bullet(g):
    ball(g, 6.5, 4, 3, "cyan")
    put(g, 5, 2, WHITE)
    sh, b, hi = RAMP["cyan"]
    pts(g, [(3, 7), (2, 8), (1, 9), (4, 8), (3, 9), (2, 10)], sh)
    pts(g, [(3, 6), (1, 8)], b)


def g_laser(g):
    sh, b, hi = RAMP["red"]
    for x in range(12):
        for y in range(12):
            s = x + y
            if 1 <= x <= 8 and 2 <= y <= 10:
                if s == 11:
                    put(g, x, y, WHITE)
                elif s in (10, 12):
                    put(g, x, y, b)
    ball(g, 2, 9.5, 1.6, "red")
    star4(g, 9, 2, 2, RAMP["fire"][2], WHITE, RAMP["fire"][1])


def g_ray(g):
    sh, b, hi = RAMP["slime"]
    rect(g, 2, 4, 7, 6, b)
    L(g, 2, 5, 7, 5, WHITE)
    L(g, 3, 3, 6, 3, sh)
    L(g, 3, 7, 6, 7, sh)
    pts(g, [(8, 4), (8, 6), (9, 5), (10, 3), (10, 7), (11, 5)], hi)
    pts(g, [(8, 5)], WHITE)
    ball(g, 1, 5, 1.8, "slime")


def g_fuse(g):
    w_ = RAMP["wood"]
    pts(g, [(1, 10), (2, 10), (3, 9), (4, 9), (5, 8), (5, 7), (6, 6), (6, 5)], w_[1])
    pts(g, [(2, 11), (3, 10), (4, 10)], w_[0])
    f = RAMP["fire"]
    star4(g, 8, 3, 2, f[1], WHITE, f[2])
    pts(g, [(10, 1), (5, 2), (10, 6)], f[2])


def g_black_hole(g):
    v = RAMP["purple"]
    m = RAMP["magenta"]
    disc(g, 5.5, 5.5, 4, v[0])
    ring(g, 5.5, 5.5, 4, v[1])
    disc(g, 5.5, 5.5, 2, OUT)
    pts(g, [(3, 2), (2, 3), (4, 2)], v[2])
    # swirl tails
    pts(g, [(9, 1), (10, 2), (8, 1)], m[1])
    pts(g, [(1, 9), (2, 10), (3, 10)], m[1])
    pts(g, [(7, 3), (8, 4)], m[2])
    put(g, 5, 5, v[1])


def g_arcane_explosion(g):
    return asc([
        "....a....",
        ".a..a..a.",
        "..aaaaa..",
        "..abbba..",
        "aaabwbaaa",
        "..abbba..",
        "..aaaaa..",
        ".a..a..a.",
        "....a....",
    ], {"a": "magenta", "b": "yellow"}, 12, 12, 1, 1, auto=False)


def g_rainbow(g):
    cols = [RAMP["red"][1], RAMP["fire"][1], RAMP["yellow"][1], RAMP["green"][1], RAMP["blue"][1]]
    px = g.load()
    for y in range(12):
        for x in range(12):
            d = math.hypot(x - 5.5, y - 8.5)
            if y <= 8:
                k = int(5.5 - d)
                if 0 <= k < 5 and d >= 0.5:
                    px[x, y] = cols[k]
    for x, y in ((0, 9), (1, 9), (2, 9), (1, 8), (9, 9), (10, 9), (11, 9), (10, 8)):
        put(g, x, y, WHITE)


def g_meteor(g):
    f = RAMP["fire"]
    for i, (cx, cy, r) in enumerate([(10, 1, 0.6), (9, 2, 1), (8, 3, 1.5), (6.5, 4.5, 2)]):
        disc(g, cx, cy, r, f[0] if i < 2 else f[1])
    pts(g, [(7, 3), (8, 2), (6, 4)], f[2])
    ball(g, 4, 7, 2.6, ROCK)
    pts(g, [(5, 8), (6, 7)], ROCK[0])


def g_mine(g):
    gr = RAMP["grey"]
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        pts(g, [(5 + dx * 4, 5 + dy * 4), (5 + dx * 5, 5 + dy * 5)], gr[1])
    for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        put(g, 5 + dx * 3, 5 + dy * 3, gr[0])
    ball(g, 5, 5, 3, "slate")
    rect(g, 4, 4, 5, 5, RAMP["red"][1])
    put(g, 4, 4, RAMP["red"][2])
    put(g, 5, 5, RAMP["red"][0])


def g_nova(g):
    return asc([
        "B...a...B",
        "....a....",
        "...aaa...",
        "..aa1aa..",
        "aaa1w1aaa",
        "..aa1aa..",
        "...aaa...",
        "....a....",
        "B...a...B",
    ], {"a": "void", "b": "purple"}, 12, 12, 1, 1, auto=False)


def g_lightning_dash(g):
    y = RAMP["yellow"]
    return asc([
        "......aaaa",
        ".......aaa",
        ".....a.a.a",
        "....aaa..a",
        "...aa1a...",
        "..a..aa...",
        ".a...a....",
        "....a.....",
        "..........",
        "B.B.B.....",
    ], {"a": "yellow", "b": "fire"}, 12, 12, 1, 1)


def g_adava(g):
    return asc([
        ".....aaa.",
        "....aaa..",
        "...aaa...",
        "..aaaaaa.",
        "....aaa..",
        "...aaa...",
        "..aaa....",
        "..aa.....",
        "b.a..b...",
        ".bbbbb...",
    ], {"a": "poison", "b": "bone"}, 12, 12, 1, 1)


def g_thunderstorm(g):
    return asc([
        "...aaa....",
        ".aaaaaaa..",
        "aaaaaaaaa.",
        "aaaaaaaaaa",
        ".aaaaaaaa.",
        "...bb..c..",
        "..bb.....c",
        ".bbbb..c..",
        "...b......",
        "..b.......",
    ], {"a": "grey", "b": "yellow", "c": "blue"}, 12, 12, 1, 1)


def g_stream(g):
    b = RAMP["blue"]
    i = RAMP["ice"]
    rect(g, 1, 4, 7, 6, b[1])
    L(g, 1, 5, 8, 5, i[1])
    L(g, 2, 5, 6, 5, WHITE)
    L(g, 1, 7, 6, 7, b[0])
    L(g, 2, 3, 6, 3, b[2])
    pts(g, [(8, 4), (8, 6), (9, 5)], b[1])
    pts(g, [(10, 3), (10, 7), (11, 5), (9, 2), (9, 8)], i[1])


def g_coin(g):
    gd = RAMP["gold"]
    disc(g, 5, 5.5, 4, gd[0])
    disc(g, 4.5, 5, 3.6, gd[1])
    ring(g, 5, 5.5, 3, gd[0])
    pts(g, [(5, 3), (4, 5), (5, 5), (6, 5), (5, 7), (5, 4), (5, 6)], gd[2])
    pts(g, [(2, 3), (3, 2)], gd[2])
    star4(g, 10, 1, 1, gd[2], WHITE)


SWORD_DIAG = [
    "........1a",
    ".......1A.",
    "......1A..",
    ".....1A...",
    ".b..1A....",
    "..b1A.....",
    "...bA.....",
    "..c.b.....",
    ".c...b....",
    "d.........",
]


def g_evil_sword(g):
    return asc(SWORD_DIAG, {"a": DARKBLADE, "b": "red", "c": "wood", "d": "red"}, 12, 12, 1, 1, auto=False)


def g_boomerang(g):
    s = STEEL
    poly(g, [(1, 1), (3, 1), (5, 6), (10, 7), (10, 9), (3, 9), (1, 7)], s[1])
    poly(g, [(3, 3), (4, 7), (8, 8), (3, 8)], s[0])
    shade(g, s)
    pts(g, [(3, 4), (4, 7), (5, 7), (7, 8)], RAMP["cyan"][1])
    pts(g, [(8, 2), (9, 3), (10, 4)], RAMP["cyan"][0])


def g_judgement(g):
    return asc([
        "c...d...c",
        ".c..d..c.",
        "...bbb...",
        "..bbdbb..",
        "...a1a...",
        "...a1A...",
        "...a1A...",
        "...a1A...",
        "...a1A...",
        "....A....",
    ], {"a": "bone", "b": "gold", "c": "yellow", "d": "gold"}, 12, 12, 1, 1, auto=False)


def g_bubble(g):
    b = RAMP["blue"]
    i = RAMP["ice"]
    disc(g, 5, 5, 4, b[0])
    ring(g, 5, 5, 4, i[0])
    pts(g, [(3, 2), (2, 3), (4, 2), (2, 4)], WHITE)
    pts(g, [(7, 8), (8, 7)], i[1])
    disc(g, 10, 1, 1, i[0])
    put(g, 10, 1, WHITE)


def g_dragon(g):
    f = RAMP["fire"]
    for cx, cy, r, c in [(2, 6, 1.2, f[0]), (4, 5.5, 1.8, f[0]), (7, 5, 3, f[0])]:
        disc(g, cx, cy, r, c)
    for cx, cy, r in [(2, 6, 0.6), (4, 5.5, 1.2), (7, 5, 2.2)]:
        disc(g, cx, cy, r, f[1])
    disc(g, 7.5, 5, 1.2, f[2])
    pts(g, [(10, 2), (11, 4), (10, 8), (9, 1)], f[1])
    rp_ = RAMP["red"]
    pts(g, [(0, 4), (0, 5), (0, 6), (0, 7), (1, 4), (1, 7)], rp_[1])


def g_star_arrow(g):
    gd = RAMP["yellow"]
    arrow(g, 1, 10, 6, 5, RAMP["bone"][1], None, 0, RAMP["cyan"][1])
    s = asc([
        "..a..",
        "aa1aa",
        ".aaa.",
        ".a.a.",
    ], {"a": "yellow"}, 12, 12, 6, 1, auto=False)
    g.alpha_composite(s)
    pts(g, [(3, 4), (9, 8)], gd[2])


def g_pop(g):
    return asc([
        "..aaaaa..",
        ".a1aaaaa.",
        "a1aoaaoaa",
        "aaaoaaoaa",
        "abaaaaaba",
        "aaaoooaaa",
        ".aaaaaaa.",
        "..aaaaa..",
    ], {"a": "pink", "b": "magenta"}, 12, 12, 1, 2)


def g_skull_c(g):
    return asc([
        "..aaaaa..",
        ".a1aaaaa.",
        "a1aaaaaaa",
        "aooaaaooa",
        "aobaaaboa",
        ".aaaoaaa.",
        "..aAaAa..",
        ".c.c.c.c.",
        "c..c..c..",
    ], {"a": "bone", "b": "poison", "c": "teal"}, 12, 12, 1, 1)


def g_hand_c(g):
    return asc([
        "..b.b.b...",
        "..a.a.a.b.",
        ".ba.a.a.a.",
        ".aaaaaaaa.",
        ".aaaaaaaa.",
        ".aaaaaaaa.",
        "..aaaaaa..",
        "..aaaaaa..",
        "..AAAAAA..",
    ], {"a": "teal", "b": "bone"}, 12, 12, 1, 1)


def g_pillar(g):
    y = RAMP["yellow"]
    rect(g, 3, 0, 7, 8, y[1])
    rect(g, 4, 0, 6, 8, y[2])
    L(g, 5, 0, 5, 8, WHITE)
    ellipse(g, 5, 9.5, 5, 1.2, y[0])
    L(g, 2, 9, 8, 9, y[1])
    pts(g, [(1, 3), (9, 5), (0, 6), (10, 2)], y[2])


def g_grimoire(g):
    return asc([
        "aaaaaaa..",
        "a1111aAw.",
        "a1aaaaAw.",
        "a1abbaAw.",
        "a1abbaAw.",
        "a1aaaaAw.",
        "aAAAAAAw.",
        ".wwwwwww.",
        ".........",
        "..c.c.c..",
    ], {"a": "purple", "b": "yellow", "c": "void"}, 12, 12, 1, 1, auto=False)


def _arrows_right(g, ys, xs):
    bn = RAMP["bone"]
    for y, x0 in zip(ys, xs):
        arrow(g, x0, y, x0 + 7, y, bn[1], RAMP["gold"][2], 2, RAMP["red"][1])


def g_volley(g):
    _arrows_right(g, [1, 5, 9], [2, 0, 2])


def g_multi_shot(g):
    bn = RAMP["bone"][1]
    hd = RAMP["gold"][2]
    arrow(g, 5, 10, 5, 1, bn, hd)
    arrow(g, 5, 10, 10, 5, bn, hd)
    arrow(g, 5, 10, 0, 5, bn, hd)
    put(g, 5, 10, RAMP["red"][1])


def g_over_scatter(g):
    c = RAMP["cyan"]
    ox, oy = 5, 9
    for dx, dy in ((-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0)):
        for k in (2, 3):
            put(g, ox + dx * k, oy + dy * k, c[0])
        disc(g, ox + dx * 5, oy + dy * 5, 0.9, c[1])
        put(g, ox + dx * 5, oy + dy * 5, c[2])
    ball(g, ox, oy, 1.2, "gold")


CRYSTAL = [
    "...a......",
    "..a1a.....",
    ".a11aA....",
    ".a1aaA.a..",
    ".a1aaAa1a.",
    ".a1aaAa1A.",
    ".aaaAAaaA.",
    "..aaA..A..",
    "...A......",
]


def g_crystal(ramp):
    return lambda g: asc(CRYSTAL, {"a": ramp}, 12, 12, 1, 1, auto=False)


CORE = [
    "..bbbbb..",
    ".b.aaa.b.",
    "b.a11aa.b",
    "b.a1waA.b",
    "b.aaaAA.b",
    ".b.AAA.b.",
    "..bbbbb..",
]


def g_core(ramp):
    return lambda g: asc(CORE, {"a": ramp, "b": "grey"}, 12, 12, 1, 2, auto=False)


def g_penetration(g):
    s = RAMP["stone"]
    rect(g, 4, 0, 6, 10, s[1])
    shade(g, s)
    bn = RAMP["bone"]
    arrow(g, 0, 5, 10, 5, bn[1], RAMP["gold"][2], 2, RAMP["red"][1])
    pts(g, [(5, 4), (5, 6)], s[0])


def g_chain_lightning(g):
    gr = RAMP["grey"]
    for x0, y0, x1, y1 in ((0, 6, 3, 9), (3, 3, 6, 6), (6, 0, 9, 3)):
        rect(g, x0, y0, x1, y1, gr[1])
        rect(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, (0, 0, 0, 0))
    shade(g, gr)
    y = RAMP["yellow"]
    pts(g, [(10, 5), (9, 6), (8, 7), (9, 7), (10, 7), (9, 8), (8, 9), (7, 10)], y[1])
    pts(g, [(11, 4), (7, 11)], y[2])


def g_hover(g):
    ball(g, 5, 3, 2.6, "ice")
    c = RAMP["cyan"]
    L(g, 1, 7, 3, 7, c[1])
    L(g, 7, 7, 9, 7, c[1])
    L(g, 3, 9, 7, 9, c[0])
    ellipse(g, 5, 10.5, 2, 0.5, RAMP["slate"][2])


def g_orbit(g):
    bn = RAMP["bone"]
    px = g.load()
    for y in range(12):
        for x in range(12):
            d = ((x - 5) / 5.0) ** 2 + ((y - 5) / 3.0) ** 2
            if 0.72 <= d <= 1.18:
                px[x, y] = bn[0]
    ball(g, 5, 5, 1.8, "gold")
    ball(g, 9, 2.5, 1.3, "cyan")


def g_track(g):
    r = RAMP["red"]
    ring(g, 6, 5, 4, r[1])
    for x, y in ((6, 0), (6, 10), (1, 5), (11, 5), (6, 1), (6, 9), (2, 5), (10, 5)):
        put(g, x, y, r[2])
    put(g, 6, 5, WHITE)
    c = RAMP["cyan"]
    pts(g, [(0, 10), (1, 10), (2, 9), (3, 8)], c[0])
    arrow(g, 3, 8, 5, 6, c[1], c[2], 1)


def g_compass(g):
    gd = RAMP["gold"]
    disc(g, 5, 5, 4.5, gd[1])
    shade(g, gd)
    disc(g, 5, 5, 3.4, RAMP["slate"][1])
    r = RAMP["red"]
    pts(g, [(6, 4), (7, 3), (8, 2)], r[1])
    pts(g, [(4, 6), (3, 7), (2, 8)], RAMP["bone"][1])
    put(g, 5, 5, WHITE)
    for x, y in ((5, 1), (9, 5), (5, 9), (1, 5)):
        put(g, x, y, gd[2])


def g_rebound(g):
    s = RAMP["stone"]
    rect(g, 9, 0, 10, 10, s[1])
    shade(g, s)
    bn = RAMP["bone"][1]
    L(g, 1, 10, 8, 3, RAMP["cyan"][0])
    arrow(g, 8, 3, 5, 0, bn, RAMP["gold"][2], 2)
    put(g, 8, 3, WHITE)


def g_split(g):
    bn = RAMP["bone"][1]
    hd = RAMP["gold"][2]
    L(g, 5, 10, 5, 6, bn)
    arrow(g, 5, 6, 1, 2, bn, hd, 2)
    arrow(g, 5, 6, 9, 2, bn, hd, 2)
    put(g, 5, 6, RAMP["cyan"][1])


def g_parasite(g):
    return asc([
        "..c...c..",
        "...c.c...",
        "..aaaaa..",
        "c.aaaaa.c",
        ".caaaaac.",
        "..aAaAa..",
        "c.aaaaa.c",
        ".caaaaac.",
        "...aaa...",
    ], {"a": "flesh", "c": "slime"}, 12, 12, 1, 1)


def g_dmg(g):
    return asc([
        "..a....b..",
        ".a1a..bbb.",
        ".a1a.bbbbb",
        ".a1a...b..",
        ".a1a...b..",
        ".a1a...b..",
        "ccccc..b..",
        "..d.......",
        "..d.......",
        ".ccc......",
    ], {"a": "bone", "b": "red", "c": "gold", "d": "wood"}, 12, 12, 1, 1)


def g_clock(g):
    bn = RAMP["bone"]
    disc(g, 4.5, 5.5, 4, RAMP["gold"][1])
    shade(g, "gold")
    disc(g, 4.5, 5.5, 3, bn[1])
    L(g, 4, 3, 4, 5, OUT)
    L(g, 4, 5, 6, 5, OUT)
    gr = RAMP["green"]
    L(g, 9, 0, 9, 4, gr[1])
    L(g, 7, 2, 11, 2, gr[1])
    put(g, 9, 2, gr[2])


def g_energy_saving(g):
    return asc([
        ".......aa",
        ".....aa1a",
        "...aa11aa",
        "..a11aaaa",
        ".a1aaaaa.",
        ".aaaaaaA.",
        ".aaAAA...",
        "a........",
        "b........",
    ], {"a": LEAF, "b": "wood"}, 12, 12, 1, 1)


def g_precise(g):
    r = RAMP["red"]
    disc(g, 5, 6, 4.5, r[1])
    disc(g, 5, 6, 3.3, WHITE)
    disc(g, 5, 6, 2.1, r[1])
    disc(g, 5, 6, 0.8, WHITE)
    put(g, 5, 6, r[0])
    bn = RAMP["bone"]
    L(g, 6, 5, 10, 1, RAMP["wood"][2])
    pts(g, [(10, 0), (11, 1), (11, 0)], RAMP["cyan"][1])


def g_accel(g):
    return asc([
        "a...b...c.",
        "aa..bb..cc",
        ".aa..bb..c",
        "..aa..bb.c",
        ".aa..bb..c",
        "aa..bb..cc",
        "a...b...c.",
    ], {"a": "fire", "b": "yellow", "c": "bone"}, 12, 12, 1, 2)


def g_range(g):
    return asc([
        ".b......b.",
        "bb......bb",
        "bbbbbbbbbb",
        "bb......bb",
        ".b......b.",
        "..........",
        "aaaaaaaaaa",
        "a.a.a.a.a.",
    ], {"a": "wood", "b": "cyan"}, 12, 12, 1, 2)


def g_troll_serum(g):
    return asc([
        "...cc...",
        "...cc...",
        "..gggg..",
        "...gg...",
        "..g2g...",
        ".g2aaag.",
        ".gaaaag.",
        ".gaaaAg.",
        "..gggg..",
    ], {"a": "slime", "g": GLASS, "c": "wood"}, 12, 12, 2, 1, auto=False)


def g_cube(g):
    return asc([
        "....aa....",
        "..aa11aa..",
        "aa111111aa",
        "Aaa1111aaB",
        "AAAaaaaBBB",
        "AAAAaBBBBB",
        "AAAAaBBBBB",
        "AAAAaBBBBB",
        ".AAAaBBBB.",
        "...AaBB...",
    ], {"a": "teal", "b": "teal"}, 12, 12, 1, 1, auto=False)


def g_umbilical(g):
    f = RAMP["flesh"]
    path = [(5, 5), (6, 5), (6, 6), (5, 7), (4, 7), (3, 6), (3, 5), (3, 4), (4, 3), (5, 3), (6, 3),
            (7, 3), (8, 4), (8, 5), (8, 6), (8, 7), (7, 8), (6, 9), (5, 9), (4, 9), (3, 9), (2, 9),
            (1, 8), (1, 7)]
    for i, (x, y) in enumerate(path):
        put(g, x, y, f[1] if i % 3 else f[2])
    pts(g, [(1, 6), (0, 5)], f[0])
    ball(g, 9.5, 1.5, 1.3, "pink")


def g_magnet(g):
    return asc([
        "..aaaaa..",
        ".a1aaaaa.",
        "aa1...aaa",
        "aa.....aA",
        "aa.....aA",
        "bb.....bb",
        "bb.....bb",
        "..........",
        "c.......c",
        ".c.....c.",
    ], {"a": "red", "b": "grey", "c": "cyan"}, 12, 12, 1, 1, auto=False)


def g_fusion(g):
    ball(g, 3.5, 5, 3.3, "purple")
    ball(g, 7, 5, 3.3, "cyan")
    px = g.load()
    for y in range(12):
        for x in range(12):
            if math.hypot(x - 3.5, y - 5) <= 3.3 and math.hypot(x - 7, y - 5) <= 3.3:
                px[x, y] = RAMP["void"][2]
    put(g, 5, 5, WHITE)


SKULL = [
    "..aaaaa..",
    ".a1aaaaa.",
    "a1aaaaaaa",
    "aooaaaooa",
    "aooaaaooa",
    ".aaaoaaa.",
    "..aAaAa..",
    "..aaaaa..",
]


def g_cadaver(g):
    f = RAMP["fire"]
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        for k in (5,):
            put(g, 5 + dx * k, 5 + dy * k, f[1])
        put(g, 5 + dx * 4, 5 + dy * 4, f[0])
    disc(g, 5, 5, 3.5, f[1])
    s = asc(SKULL, {"a": "bone"}, 12, 12, 1, 1)
    g.alpha_composite(s)


def g_soul(g):
    return asc([
        "....a....",
        "...aa....",
        "...a1a.a.",
        "..a11aaa.",
        ".aa1waaa.",
        ".a1wwaaa.",
        ".aawwaaA.",
        ".aaaaaAA.",
        "..AaaAA..",
        "...AAA...",
    ], {"a": "ice"}, 12, 12, 1, 1, auto=False)


def g_reflection(g):
    return asc([
        "..bbbbb..",
        ".baaaaab.",
        "ba1waaaAb",
        "ba1aaaaAb",
        "baaaaaaAb",
        ".baaaAAb.",
        "..bbbbb..",
        "....b....",
        "....B....",
        "...BBB...",
    ], {"a": "ice", "b": "gold"}, 12, 12, 1, 1, auto=False)


SHIELD = [
    "bbbbbbbbb",
    "baa1aaaAb",
    "ba1aaaaAb",
    "ba1abaaAb",
    "baabbbaAb",
    "baaabaaAb",
    ".baaaaAb.",
    "..baaAb..",
    "...bAb...",
    "....b....",
]


def g_shield(g):
    return asc(SHIELD, {"a": "blue", "b": "gold"}, 12, 12, 1, 1, auto=False)


def g_duet(g):
    ball(g, 2.5, 7, 2.3, "magenta")
    ball(g, 8, 3, 2.3, "cyan")
    pts(g, [(4, 4), (5, 3), (6, 7), (5, 8)], RAMP["bone"][1])
    pts(g, [(4, 5), (6, 6)], RAMP["bone"][0])


def g_fireworks(g):
    cols = [RAMP["red"][1], RAMP["yellow"][1], RAMP["cyan"][1], RAMP["magenta"][1],
            RAMP["green"][1], RAMP["fire"][1], RAMP["blue"][2], RAMP["pink"][1]]
    dirs = ((0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1))
    for (dx, dy), c in zip(dirs, cols):
        put(g, 5 + dx * 2, 4 + dy * 2, c)
        put(g, 5 + dx * 4, 4 + dy * 4, c)
    star4(g, 5, 4, 1, RAMP["yellow"][2], WHITE)
    pts(g, [(5, 9), (5, 10)], RAMP["fire"][0])


def g_serial(g):
    c = RAMP["cyan"]
    L(g, 1, 8, 9, 2, c[0])
    ball(g, 1, 8, 1, "cyan", hi=False)
    ball(g, 4, 6, 1.3, "cyan")
    ball(g, 8, 3, 2.1, "cyan")
    put(g, 1, 8, c[2])


def g_echo(g):
    ball(g, 1.5, 5, 1.4, "yellow")
    c = RAMP["yellow"]
    px = g.load()
    for y in range(12):
        for x in range(3, 12):
            d = math.hypot(x - 1.5, y - 5)
            for r, col in ((4, c[1]), (6.5, c[0]), (9, c[0])):
                if abs(d - r) < 0.5 and abs(y - 5) <= r * 0.72:
                    px[x, y] = col
    put(g, 5, 5, c[2])


def g_reservoir(g):
    return asc([
        ".gggggg.",
        "g2gggggg",
        "g.....Gg",
        "gaaaaaAg",
        "ga1aaaAg",
        "gaaaaaAg",
        "gaaaaAAg",
        ".gGGGGg.",
    ], {"a": "blue", "g": "grey"}, 12, 12, 2, 2, auto=False)


def g_bloom(g):
    return asc([
        "...aaa....",
        "..a111a...",
        ".aa1aaaa..",
        "a1aabbaaa.",
        "aaaabbaaA.",
        ".aaaaaaA..",
        "..AAcAA...",
        "..d.c.....",
        "..ddc.....",
        "....c.....",
    ], {"a": "pink", "b": "yellow", "c": LEAF, "d": LEAF}, 12, 12, 1, 1, auto=False)


def g_charge(g):
    return asc([
        "...bb...",
        "aaaaaaaa",
        "a1..c..A",
        "a1.cc..A",
        "a1cccc.A",
        "a1..cc.A",
        "a1..c..A",
        "a1.....A",
        "aAAAAAAA",
    ], {"a": "grey", "b": "grey", "c": "yellow"}, 12, 12, 2, 1, auto=False)


def g_wand_spirit(g):
    return asc([
        "......c..",
        "..aaa.c..",
        ".a1aaa...",
        "a1aaaab..",
        "aaoaoab..",
        "aaaaaa...",
        "aaaaaa...",
        "aAaAaA...",
        "A.A.A....",
    ], {"a": "ice", "b": "wood", "c": "yellow"}, 12, 12, 1, 1)


def g_forced_cd(g):
    i = RAMP["ice"]
    for dx, dy in ((0, 1), (1, 0), (1, 1), (1, -1)):
        for k in range(-4, 5):
            put(g, 4 + dx * k, 4 + dy * k, i[1] if abs(k) < 4 else i[2])
    put(g, 4, 4, WHITE)
    disc(g, 8.5, 8.5, 2.5, RAMP["gold"][1])
    disc(g, 8.5, 8.5, 1.5, RAMP["bone"][1])
    pts(g, [(8, 7), (8, 8), (9, 8)], OUT)


def g_cap_stone(g):
    s = RAMP["stone"]
    ellipse(g, 4.5, 6.5, 4.2, 3.2, s[1])
    shade(g, s)
    pts(g, [(3, 6), (4, 7), (6, 6)], s[0])
    gr = RAMP["green"]
    L(g, 9, 0, 9, 4, gr[1])
    L(g, 7, 2, 11, 2, gr[1])
    put(g, 9, 2, gr[2])


def g_rune(g):
    s = RAMP["slate"]
    c = RAMP["cyan"]
    rect(g, 1, 0, 8, 10, s[1])
    rect(g, 0, 1, 9, 9, s[1])
    shade(g, s)
    L(g, 4, 2, 4, 8, c[1])
    L(g, 4, 3, 6, 5, c[1])
    L(g, 4, 6, 2, 4, c[1])
    put(g, 4, 2, c[2])


def g_barrier(g):
    return asc([
        "...aaaa...",
        "..a....a..",
        ".a..bb..a.",
        "a..b..b..a",
        "a..b..b..a",
        "a..b..b..a",
        ".a..bb..a.",
        "..a....a..",
        "...aaaa...",
    ], {"a": "cyan", "b": "void"}, 12, 12, 1, 1)


def g_bings_arrow(g):
    return asc([
        ".......aaa",
        "........aa",
        ".......a.a",
        "......b...",
        ".....b....",
        "....b.....",
        "...b......",
        "c.b.......",
        ".cc.......",
        "cc.c......",
    ], {"a": "cyan", "b": "wood", "c": "red"}, 12, 12, 1, 1, auto=False)


def g_flying_sword(g):
    return asc([
        "....b.....",
        "c...bb....",
        "..ddbaaaaa",
        "c...bAAAAA",
        "....b.....",
    ], {"a": "bone", "b": "gold", "c": "cyan", "d": "wood"}, 12, 12, 1, 4, auto=False)


def g_area(g):
    c = RAMP["green"]
    ring(g, 5, 5, 3, c[1])
    put(g, 5, 5, c[2])
    y = RAMP["yellow"]
    for (x0, y0, x1, y1) in ((5, 1, 5, 0), (5, 9, 5, 10), (1, 5, 0, 5), (9, 5, 10, 5)):
        pass
    for tip, arms in (((5, 0), ((4, 1), (6, 1))), ((5, 10), ((4, 9), (6, 9))),
                      ((0, 5), ((1, 4), (1, 6))), ((10, 5), ((9, 4), (9, 6)))):
        put(g, *tip, y[1])
        pts(g, arms, y[1])


def g_absorb(g):
    ball(g, 5, 5, 2.2, "blue")
    c = RAMP["cyan"]
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        tip = (5 + sx * 3, 5 + sy * 3)
        put(g, *tip, c[1])
        put(g, tip[0] + sx, tip[1], c[1])
        put(g, tip[0], tip[1] + sy, c[1])
        put(g, tip[0] + sx * 2, tip[1] + sy * 2, c[0])


def g_upgrade(g):
    return asc([
        "....a...c",
        "...aaa.ccc",
        "..a1aaa.c.",
        ".a1aaaaa..",
        "aaaaaaaaa.",
        "...aaa....",
        "...a1a....",
        "...a1a....",
        "...aAa....",
    ], {"a": "gold", "c": "bone"}, 12, 12, 1, 1)


def g_enlarge(g):
    return asc([
        "aaa....aaa",
        "a........a",
        "a........a",
        "....bb....",
        "...bbbb...",
        "...bbbb...",
        "....bb....",
        "a........a",
        "a........a",
        "aaa....aaa",
    ], {"a": "bone", "b": "cyan"}, 12, 12, 1, 1)


def g_fall(g):
    return asc([
        "...aaa...",
        "...a1a...",
        "...a1a...",
        "...a1a...",
        "aaaaaaaaa",
        ".aaaaaaa.",
        "..aaaaa..",
        "...aaa...",
        "....a....",
        "bbbbbbbbb",
    ], {"a": "fire", "b": "stone"}, 12, 12, 1, 1)


def g_vine(g):
    return asc([
        "......bb..",
        ".....b1b..",
        "..aa..bb..",
        ".a..a.a...",
        ".a...aa.bb",
        "..a..a.b1b",
        "bb.aa...b.",
        "b1b.a.....",
        ".b..a.....",
        "....a.....",
    ], {"a": "wood", "b": LEAF}, 12, 12, 1, 1, auto=False)


def g_prototype(g):
    return asc([
        ".cccccccc.",
        "cbbbbbbbbc",
        ".b2b2b2bb.",
        ".bbbbbbbb.",
        ".b2222bbb.",
        ".b2bb2b2b.",
        ".b2222bbb.",
        ".bbbbbbbb.",
        "cbbbbbbbbc",
        ".cccccccc.",
    ], {"b": BLUEPRINT, "c": PAPER}, 12, 12, 1, 1, auto=False)


def g_rock(g):
    return asc([
        "...aaaa...",
        ".aaaaaaaa.",
        ".aaaaaAaa.",
        "aaaaaaaAaa",
        "aaaaaAAaaa",
        "aaaaaaaaaa",
        "aAaaaaaaAa",
        ".aaAaaaaa.",
        "..aaaaaa..",
    ], {"a": ROCK}, 12, 12, 1, 1)


def g_butterfly(g):
    return asc([
        "...c..c...",
        "aaa.cc.aaa",
        "a11acca11a",
        "a1aaccaa1a",
        "aaaaccaaaa",
        ".aaaccaaa.",
        "..bbccbb..",
        ".bbbccbbb.",
        ".bbb..bbb.",
        "..b....b..",
    ], {"a": "magenta", "b": "pink", "c": "slate"}, 12, 12, 1, 1)


def g_wisp(g):
    return asc([
        ".....a....",
        "....aa....",
        "...aaa..a.",
        "..aaaaaaa.",
        ".aaaaaaaa.",
        ".aaoaaoaa.",
        ".aaoaaoaa.",
        ".aaaaaaaa.",
        "..aaaaaa..",
        "...AAAA...",
    ], {"a": "teal"}, 12, 12, 1, 1)


def g_serpent(g):
    return asc([
        "....aaaa.",
        "...aaaaba",
        "...aa..aa",
        "...aa....",
        "....aaa..",
        "......aa.",
        ".......aa",
        ".a....aa.",
        ".aaaaaa..",
        "..aaaa...",
    ], {"a": "purple", "b": "red"}, 12, 12, 1, 1)


SPELL_GLYPHS = {
    "magic_bullet": g_magic_bullet,
    "rock_n_ball": g_rock,
    "butterfly": g_butterfly,
    "laser": g_laser,
    "fuse": g_fuse,
    "floating_wisp": g_wisp,
    "black_hole": g_black_hole,
    "arcane_explosion": g_arcane_explosion,
    "shadow_serpent": g_serpent,
    "ray_of_disintegration": g_ray,
    "deceptive_mine": g_mine,
    "meteor": g_meteor,
    "rainbow": g_rainbow,
    "arcane_nova": g_nova,
    "lightning_dash": g_lightning_dash,
    "adava_keravda": g_adava,
    "thunderstorm": g_thunderstorm,
    "high_pressure_stream": g_stream,
    "enchanting_coin": g_coin,
    "evil_slayer_sword": g_evil_sword,
    "boomerang_blade": g_boomerang,
    "sword_of_judgement": g_judgement,
    "condensed_water_bubble": g_bubble,
    "fierce_dragon_breath": g_dragon,
    "shining_star_arrow": g_star_arrow,
    "pop": g_pop,
    "skull_of_the_cthulhu": g_skull_c,
    "hand_of_the_cthulhu": g_hand_c,
    "pillar_of_light": g_pillar,
    "autonomous_grimoire": g_grimoire,
    "volley": g_volley,
    "multi_shot": g_multi_shot,
    "over_scatter": g_over_scatter,
    "slime_crystal": g_crystal("slime"),
    "venom_crystal": g_crystal("poison"),
    "frost_crystal": g_crystal("ice"),
    "core_of_thunder": g_core("yellow"),
    "core_of_flame": g_core("fire"),
    "penetration": g_penetration,
    "chain_of_lightning": g_chain_lightning,
    "hover": g_hover,
    "orbit": g_orbit,
    "track": g_track,
    "automatic_navigate": g_compass,
    "rebound": g_rebound,
    "split": g_split,
    "parasite": g_parasite,
    "dmg_enhanced": g_dmg,
    "time_duration_enhanced": g_clock,
    "energy_saving_mode": g_energy_saving,
    "precise_shot": g_precise,
    "accelerator": g_accel,
    "range_enhanced": g_range,
    "troll_serum": g_troll_serum,
    "mimicry_cube": g_cube,
    "umbilical_cord": g_umbilical,
    "strong_traction": g_magnet,
    "fusion_summon": g_fusion,
    "cadaver_explosion": g_cadaver,
    "essence_of_soul": g_soul,
    "reflection": g_reflection,
    "indomitability": g_shield,
    "duet": g_duet,
    "dazzling_fireworks": g_fireworks,
    "serial": g_serial,
    "echo": g_echo,
    "magic_reservoir": g_reservoir,
    "tranquil_bloom": g_bloom,
    "charge_mode": g_charge,
    "wand_spirit": g_wand_spirit,
    "forced_cooldown": g_forced_cd,
    "capacity_expansion_stone": g_cap_stone,
    "resonance_rune": g_rune,
    "arcane_barrier": g_barrier,
    "bings_arrow": g_bings_arrow,
    "bian_flying_sword": g_flying_sword,
    "area_boost": g_area,
    "mana_absorption": g_absorb,
    "magic_upgrade": g_upgrade,
    "enlarge_spell": g_enlarge,
    "fall": g_fall,
    "magic_vine": g_vine,
    "spell_prototype": g_prototype,
}


def spell_icon(sid, stype):
    g = new(12, 12)
    res = SPELL_GLYPHS[sid](g)
    if res is not None:
        g = res
    layer = outline(centered(g))
    im = spell_frame(TYPE_RAMP[stype])
    im.alpha_composite(layer)
    return im


def build_spells(ids):
    out = {}
    for s in ids["spells"]:
        im = spell_icon(s["id"], s["type"])
        C.save(im, f"icons/spells/{s['id']}.png")
        out[s["id"]] = im
    return out


# =================================================================== BUILD
def build():
    ids = load_ids()
    build_spells(ids)
