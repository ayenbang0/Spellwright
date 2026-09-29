"""Per-spell impact/spawn effects, trails and passive/summon glyphs (see assets/AI_GUIDE.md section 5).

Every spell ends in its own 3-frame impact (`effects/sx_*`), summons spawn with their own 4-frame effect
(`effects/sx_spawn_*`), a few spells own a tinted trail (`effects/sx_trail_*`) and passive/summon cues are small
glyph sprites (`effects/px_*`). Player art stays cyan/white with a dark outline; elemental spells use the element
ramps from art_core (same rule as the overlays).
"""
import math

from art_core import (RAMP, OUT, WHITE, hexc, new, outline, alpha_mul, disc, ellipse, ring, rect, line, poly,
                      put, rng, save, save_anim)

C = 15.5
GOLD_S, GOLD_B, GOLD_H = RAMP["gold"]


# ---------------------------------------------------------------- helpers
def _a(c, alpha):
    return (c[0], c[1], c[2], alpha)


def _polar(cx, cy, r, ang):
    return (cx + r * math.cos(ang), cy + r * math.sin(ang))


def _diamond(im, cx, cy, ang, length, half, c):
    tip = _polar(cx, cy, length, ang)
    tail = _polar(cx, cy, length * 0.35, ang)
    side = ang + math.pi / 2
    a = _polar(*_polar(cx, cy, length * 0.6, ang), half, side)
    b = _polar(*_polar(cx, cy, length * 0.6, ang), half, side + math.pi)
    poly(im, [tail, a, tip, b], c)


def _spark_plus(im, x, y, c, arm=1):
    put(im, x, y, c)
    for i in range(1, arm + 1):
        for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
            put(im, x + dx, y + dy, c)


def _star4(im, cx, cy, rout, rin, ang, c):
    pts = []
    for k in range(8):
        r = rout if k % 2 == 0 else rin
        a = ang + k * math.pi / 4
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    poly(im, pts, c)


def _fx3(name, frames, fades=(1.0, 1.0, 0.75), fps=12):
    out = []
    for f, im in enumerate(frames):
        im = outline(im)
        out.append(alpha_mul(im, fades[f]) if fades[f] < 1 else im)
    save_anim("effects/sx_" + name, out, fps=fps, loop=False, alias=False)


# ---------------------------------------------------------------- impact families (32x32, 3 frames, play once)
def flame(name, ramp="fire"):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    disc(im, C, 17, 5, s)
    disc(im, C, 17, 4, b)
    disc(im, C, 16, 2.5, h)
    disc(im, C, 16, 1, WHITE)
    fr.append(im)
    im = new(32, 32)
    ellipse(im, C, 19, 9, 7, s)
    ellipse(im, C, 18, 7, 6, b)
    for tx, top, bx in ((9, 8, 12), (14, 3, 17), (19, 6, 22), (22, 12, 24)):
        poly(im, [(tx, 17), (bx + 1, top + 5), (bx - 1, 17)], b)
        poly(im, [(tx + 2, 17), (bx + 1, top + 8), (bx, 17)], h)
    ellipse(im, C, 17, 4.5, 4, h)
    disc(im, C, 17, 1.5, WHITE)
    fr.append(im)
    im = new(32, 32)
    ellipse(im, C, 21, 6, 3, s)
    r = rng("flame_f2" + ramp)
    for _ in range(9):
        put(im, r.randint(8, 23), r.randint(4, 18), b if r.random() < 0.6 else h)
    for tx in (11, 16, 21):
        poly(im, [(tx - 2, 21), (tx, 9 + (tx % 5)), (tx + 2, 21)], b)
    fr.append(im)
    _fx3(name, fr)


def splash(name):
    s, b, h = RAMP["blue"][1], RAMP["ice"][1], WHITE
    fr = []
    im = new(32, 32)
    ellipse(im, C, 21, 6, 2.6, s)
    ellipse(im, C, 21, 4, 1.5, b)
    poly(im, [(14, 20), (15.5, 11), (17, 20)], b)
    fr.append(im)
    im = new(32, 32)
    ellipse(im, C, 22, 10, 4, s)
    ellipse(im, C, 22, 8, 3, b)
    for k in range(-4, 5):
        a = -math.pi / 2 + k * 0.32
        x, y = _polar(C, 21, 11 - abs(k) * 0.4, a)
        disc(im, x, y, 1.2, b)
        put(im, round(x), round(y), h)
    disc(im, C, 12, 2, h)
    fr.append(im)
    im = new(32, 32)
    ring(im, C, 22, 11, _a(b, 180), width=1)
    ellipse(im, C, 22, 11, 4, _a(s, 90))
    r = rng("splash_f2")
    for k in range(-3, 4):
        x, y = _polar(C, 21, 9, -math.pi / 2 + k * 0.42)
        put(im, round(x), round(y) + 4, b)
        put(im, round(x) + r.randint(-1, 1), round(y) + 6, h)
    fr.append(im)
    _fx3(name, fr)


def rays(name, ramp="gold", n=8, long=14):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    disc(im, C, C, 5, b)
    disc(im, C, C, 3.5, h)
    disc(im, C, C, 2, WHITE)
    fr.append(im)
    im = new(32, 32)
    for k in range(n):
        _diamond(im, C, C, k * 2 * math.pi / n, long, 1.6 if k % 2 == 0 else 1.1, b if k % 2 == 0 else s)
    disc(im, C, C, 4, h)
    disc(im, C, C, 2.5, WHITE)
    fr.append(im)
    im = new(32, 32)
    for k in range(n):
        a = k * 2 * math.pi / n + math.pi / n
        x0, y0 = _polar(C, C, long * 0.55, a)
        x1, y1 = _polar(C, C, long, a)
        line(im, round(x0), round(y0), round(x1), round(y1), h if k % 2 else b)
    ring(im, C, C, long * 0.45, _a(b, 200))
    fr.append(im)
    _fx3(name, fr)


def bolt(name, ramp="yellow"):
    s, b, h = RAMP[ramp]
    zig = [(17, 0), (13, 6), (18, 10), (14, 16)]
    fr = []
    im = new(32, 32)
    line(im, *zig[0], *zig[1], b, 2)
    line(im, *zig[1], *zig[2], b, 2)
    line(im, *zig[2], *zig[3], b, 2)
    line(im, *zig[0], *zig[1], WHITE)
    line(im, *zig[1], *zig[2], WHITE)
    line(im, *zig[2], *zig[3], WHITE)
    disc(im, 14, 17, 3.5, h)
    disc(im, 14, 17, 2, WHITE)
    fr.append(im)
    im = new(32, 32)
    line(im, 17, 0, 13, 6, b, 2)
    line(im, 13, 6, 18, 10, b, 2)
    line(im, 18, 10, 15, 16, b, 2)
    _star4(im, 15.5, 17, 14, 3.5, math.pi / 4, s)
    _star4(im, 15.5, 17, 11, 2.5, 0, b)
    _star4(im, 15.5, 17, 7, 2, math.pi / 4, h)
    disc(im, 15.5, 17, 2.5, WHITE)
    for a in (0.5, 2.2, 3.9, 5.4):
        x, y = _polar(15.5, 17, 13, a)
        line(im, round(x), round(y), round(x + 3 * math.cos(a + 1)), round(y + 3 * math.sin(a + 1)), h)
    fr.append(im)
    im = new(32, 32)
    for a in (0.3, 1.6, 2.9, 4.2, 5.5):
        x0, y0 = _polar(15.5, 17, 6, a)
        x1, y1 = _polar(15.5, 17, 11, a)
        line(im, round(x0), round(y0), round((x0 + x1) / 2 + 2), round((y0 + y1) / 2 - 2), b)
        line(im, round((x0 + x1) / 2 + 2), round((y0 + y1) / 2 - 2), round(x1), round(y1), h)
    ring(im, 15.5, 17, 5, _a(b, 200))
    fr.append(im)
    _fx3(name, fr)


def implode(name, ramp="void"):
    s, b, h = RAMP[ramp]
    fr = []
    for f, (R, aa) in enumerate(((13, 0.0), (8, 0.9), (3.5, 1.8))):
        im = new(32, 32)
        ring(im, C, C, R, b, width=2)
        ring(im, C, C, R - 2, _a(s, 200), width=1)
        for arm in range(3):
            for t in range(4):
                a = aa + arm * 2 * math.pi / 3 + t * 0.35
                x, y = _polar(C, C, R * (0.35 + 0.2 * t), a)
                put(im, round(x), round(y), h if t == 3 else b)
        if f == 2:
            disc(im, C, C, 2, WHITE)
            disc(im, C, C, 3, h)
            disc(im, C, C, 1, WHITE)
        fr.append(im)
    _fx3(name, fr)


def shard(name, ramp="ice", n=6):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    _star4(im, C, C, 5, 2, math.pi / 4, b)
    disc(im, C, C, 2, WHITE)
    fr.append(im)
    for r0, ln, hf in ((9, 8, 1.6), (13, 6, 1.2)):
        im = new(32, 32)
        for k in range(n):
            _diamond(im, C, C, k * 2 * math.pi / n + 0.3, r0 + ln * 0.4, hf, b)
            x, y = _polar(C, C, r0 + 1, k * 2 * math.pi / n + 0.3)
            put(im, round(x), round(y), h)
        if r0 < 10:
            disc(im, C, C, 2.5, h)
        fr.append(im)
    _fx3(name, fr)


def cross_slash(name, ramp="cyan"):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    line(im, 9, 22, 20, 9, b, 2)
    line(im, 9, 22, 20, 9, WHITE)
    fr.append(im)
    im = new(32, 32)
    for (x0, y0, x1, y1) in ((4, 27, 27, 4), (4, 4, 27, 27)):
        line(im, x0, y0, x1, y1, b, 3)
        line(im, x0, y0, x1, y1, WHITE, 1)
    disc(im, C, C, 3, h)
    disc(im, C, C, 1.5, WHITE)
    fr.append(im)
    im = new(32, 32)
    for (x0, y0, x1, y1) in ((7, 24, 13, 18), (18, 13, 24, 7), (7, 7, 13, 13), (18, 18, 24, 24)):
        line(im, x0, y0, x1, y1, b)
    _spark_plus(im, 15, 15, h)
    fr.append(im)
    _fx3(name, fr)


def star(name, ramp="gold", ringed=False):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    _star4(im, C, C, 7, 2.2, 0, b)
    disc(im, C, C, 2, WHITE)
    fr.append(im)
    im = new(32, 32)
    if ringed:
        ring(im, C, C, 13, b, width=2)
        ring(im, C, C, 11, _a(h, 200))
    _star4(im, C, C, 14 if not ringed else 11, 3, 0, s)
    _star4(im, C, C, 11 if not ringed else 9, 2.4, math.pi / 4, b)
    _star4(im, C, C, 8 if not ringed else 7, 2, 0, h)
    disc(im, C, C, 2.5, WHITE)
    fr.append(im)
    im = new(32, 32)
    _star4(im, C, C, 10, 1.4, 0, b)
    for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        x, y = _polar(C, C, 11, a)
        _spark_plus(im, round(x), round(y), h)
    fr.append(im)
    _fx3(name, fr)


def debris(name):
    s, b, h = RAMP["stone"]
    r = rng("debris")
    fr = []
    im = new(32, 32)
    disc(im, C, C, 4, s)
    disc(im, C, C - 1, 3, b)
    fr.append(im)
    for R, size in ((8, 3), (12, 2)):
        im = new(32, 32)
        for k in range(7):
            a = k * 2 * math.pi / 7 + r.random() * 0.4
            x, y = _polar(C, C, R + r.randint(-1, 1), a)
            rect(im, round(x) - 1, round(y) - 1, round(x) - 2 + size, round(y) - 2 + size, b)
            put(im, round(x) - 1, round(y) - 1, h)
            put(im, round(x) - 2 + size, round(y) - 2 + size, s)
        ring(im, C, C, R - 3, _a(b, 110))
        fr.append(im)
    _fx3(name, fr)


def dust(name, ramp="pink"):
    s, b, h = RAMP[ramp]
    r = rng("dust" + ramp)
    fr = []
    for cnt, R, arm in ((3, 4, 1), (7, 9, 1), (5, 12, 0)):
        im = new(32, 32)
        for k in range(cnt):
            a = k * 2 * math.pi / cnt + r.random() * 0.6
            x, y = _polar(C, C, R * (0.6 + 0.4 * r.random()), a)
            _spark_plus(im, round(x), round(y), b if k % 2 else h, arm)
            put(im, round(x), round(y), WHITE)
        fr.append(im)
    _fx3(name, fr)


def wisp(name, ramp="teal"):
    s, b, h = RAMP[ramp]
    fr = []
    for f, (n, top) in enumerate(((2, 13), (5, 6), (4, 2))):
        im = new(32, 32)
        for k in range(n):
            t = k / max(1, n - 1)
            y = 22 - t * (22 - top)
            x = C + math.sin(t * 5 + f) * 3
            rad = 3.4 - t * 2 + (0.6 if f == 0 else 0)
            disc(im, x, y, rad, s)
            disc(im, x - 0.4, y - 0.4, max(0.8, rad - 1), b)
        disc(im, C + math.sin(f) * 2, top + 1, 1.2, h)
        fr.append(im)
    _fx3(name, fr)


def coin(name):
    fr = []
    im = new(32, 32)
    disc(im, C, C, 4, GOLD_S)
    disc(im, C, C, 3, GOLD_B)
    disc(im, C - 1, C - 1, 1.2, GOLD_H)
    fr.append(im)
    im = new(32, 32)
    for k in range(4):
        a = k * math.pi / 2 + 0.6
        x, y = _polar(C, C, 9, a)
        disc(im, x, y, 2.6, GOLD_S)
        disc(im, x, y, 1.8, GOLD_B)
        put(im, round(x) - 1, round(y) - 1, WHITE)
    _spark_plus(im, 16, 16, GOLD_H, 2)
    fr.append(im)
    im = new(32, 32)
    for k in range(6):
        x, y = _polar(C, C, 11, k * math.pi / 3 + 0.2)
        _spark_plus(im, round(x), round(y), GOLD_B if k % 2 else GOLD_H)
    fr.append(im)
    _fx3(name, fr)


def blast(name, ramp="fire"):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    disc(im, C, C, 8, b)
    disc(im, C, C, 6, h)
    disc(im, C, C, 3.5, WHITE)
    fr.append(im)
    im = new(32, 32)
    disc(im, C, C, 12, _a(s, 110))
    ring(im, C, C, 13, b, width=3)
    ring(im, C, C, 10, h, width=1)
    disc(im, C, C, 4, WHITE)
    fr.append(im)
    im = new(32, 32)
    ring(im, C, C, 15, _a(b, 200), width=2)
    for k in range(12):
        a = k * math.pi / 6
        x0, y0 = _polar(C, C, 9, a)
        x1, y1 = _polar(C, C, 13, a)
        line(im, round(x0), round(y0), round(x1), round(y1), h if k % 2 else s)
    fr.append(im)
    _fx3(name, fr, fades=(1.0, 1.0, 0.8))


def plus(name, ramp="cyan"):
    s, b, h = RAMP[ramp]
    fr = []
    for arm, w in ((13, 2), (8, 3), (4, 2)):
        im = new(32, 32)
        line(im, int(C) - arm, int(C), int(C) + arm + 1, int(C), b, w)
        line(im, int(C), int(C) - arm, int(C), int(C) + arm + 1, b, w)
        line(im, int(C) - arm, int(C), int(C) + arm + 1, int(C), h)
        line(im, int(C), int(C) - arm, int(C), int(C) + arm + 1, h)
        disc(im, C, C, 2.2, h)
        disc(im, C, C, 1, WHITE)
        fr.append(im)
    _fx3(name, fr)


def spark(name):
    """White pinpoint flash: tint it in code (Rainbow shots, Laser, Fuse)."""
    g = RAMP["grey"]
    fr = []
    im = new(32, 32)
    _star4(im, C, C, 5, 1.8, 0, WHITE)
    fr.append(im)
    im = new(32, 32)
    _star4(im, C, C, 10, 2, math.pi / 4, g[2])
    _star4(im, C, C, 8, 1.6, 0, WHITE)
    disc(im, C, C, 2, WHITE)
    fr.append(im)
    im = new(32, 32)
    for k in range(4):
        x, y = _polar(C, C, 9, k * math.pi / 2 + math.pi / 4)
        put(im, round(x), round(y), WHITE)
        put(im, round(x * 0 + C + (x - C) * 1.25), round(C + (y - C) * 1.25), g[1])
    fr.append(im)
    _fx3(name, fr)


def bubble(name, ramp="pink"):
    s, b, h = RAMP[ramp]
    fr = []
    im = new(32, 32)
    ring(im, C, C, 4, b, width=1)
    put(im, 13, 13, WHITE)
    fr.append(im)
    im = new(32, 32)
    ring(im, C, C, 9, b, width=2)
    ring(im, C, C, 7, _a(h, 160), width=1)
    for k in range(6):
        x, y = _polar(C, C, 6, k * math.pi / 3)
        put(im, round(x), round(y), WHITE)
    fr.append(im)
    im = new(32, 32)
    for k in range(8):
        x, y = _polar(C, C, 12, k * math.pi / 4 + 0.2)
        disc(im, x, y, 1, b)
        put(im, round(x), round(y), h)
    fr.append(im)
    _fx3(name, fr)


def crack(name, ramp="void"):
    s, b, h = RAMP[ramp]
    r = rng("crack" + ramp)
    fr = []
    im = new(32, 32)
    disc(im, C, C, 4, s)
    disc(im, C, C, 2.5, b)
    fr.append(im)
    im = new(32, 32)
    disc(im, C, C, 6, _a(s, 200))
    for k in range(7):
        a = k * 2 * math.pi / 7 + 0.2
        x, y = C, C
        for t in range(3):
            nx, ny = _polar(x, y, 4.5, a + r.uniform(-0.5, 0.5))
            line(im, round(x), round(y), round(nx), round(ny), b, 2)
            line(im, round(x), round(y), round(nx), round(ny), h)
            x, y = nx, ny
    disc(im, C, C, 2.5, h)
    fr.append(im)
    im = new(32, 32)
    ring(im, C, C, 12, _a(b, 200))
    for k in range(7):
        x, y = _polar(C, C, 9 + (k % 3), k * 2 * math.pi / 7 + 0.2)
        put(im, round(x), round(y), h)
        put(im, round(x) + 1, round(y), b)
    fr.append(im)
    _fx3(name, fr)


def impacts():
    flame("flame")
    splash("splash")
    rays("rays")
    rays("rays_thin", "cyan", n=12, long=12)
    bolt("bolt")
    bolt("bolt_green", "poison")
    implode("implode")
    shard("shard")
    cross_slash("cross")
    star("star")
    star("nova", "cyan", ringed=True)
    debris("debris")
    dust("dust")
    wisp("wisp")
    wisp("smoke", "void")
    coin("coin")
    blast("blast")
    blast("blast_red", "blood")
    plus("plus")
    spark("spark")
    bubble("bubble")
    crack("crack")


# ---------------------------------------------------------------- summon spawn effects (32x32, 4 frames)
def _fx4(name, frames, fps=10):
    save_anim("effects/sx_spawn_" + name, [outline(f) for f in frames], fps=fps, loop=False, alias=False)


def spawn_pop():
    s, b, h = RAMP["pink"]
    fr = []
    for f in range(4):
        im = new(32, 32)
        ring(im, C, C, 3 + f * 3, b, width=2 if f < 3 else 1)
        for k in range(5):
            x, y = _polar(C, C, 2 + f * 3.5, k * 2 * math.pi / 5 + f * 0.4)
            disc(im, x, y, 1, h)
        if f == 0:
            disc(im, C, C, 2, WHITE)
        fr.append(im if f < 3 else alpha_mul(im, 0.7))
    _fx4("pop", fr)


def spawn_skull():
    s, b, h = RAMP["bone"]
    vs, vb, vh = RAMP["void"]
    fr = []
    for f in range(4):
        im = new(32, 32)
        R = 12 - f * 2.5
        for k in range(4):
            a = k * math.pi / 2 + f * 0.7
            x, y = _polar(C, C, R, a)
            disc(im, x, y, 3 - f * 0.4, vb if k % 2 else s)
            disc(im, x - 0.5, y - 0.5, max(0.8, 2 - f * 0.4), h if k % 2 == 0 else vh)
        if f >= 2:
            disc(im, C, C, 2 + (f - 2), b)
            put(im, 14, 15, OUT)
            put(im, 17, 15, OUT)
        fr.append(im)
    _fx4("skull", fr)


def spawn_hand():
    vs, vb, vh = RAMP["void"]
    fr = []
    for f in range(4):
        im = new(32, 32)
        R = 4 + f * 3
        ring(im, C, C + 2, R, vb, width=2)
        ellipse(im, C, C + 3, R - 1, (R - 1) * 0.5, _a(vs, 160))
        for k in range(4):
            a = -math.pi / 2 + (k - 1.5) * 0.5
            x0, y0 = _polar(C, C + 3, 2, a)
            x1, y1 = _polar(C, C + 3, 4 + f * 3, a + math.sin(f + k) * 0.25)
            line(im, round(x0), round(y0), round(x1), round(y1), vh if k % 2 else vb, 2)
        fr.append(im if f < 3 else alpha_mul(im, 0.7))
    _fx4("hand", fr)


def spawn_pillar():
    fr = []
    for f in range(4):
        im = new(32, 32)
        half = (6, 4, 3, 1)[f]
        top = (0, 2, 5, 10)[f]
        rect(im, int(C) - half, top, int(C) + half + 1, 28, GOLD_S)
        rect(im, int(C) - max(0, half - 1), top, int(C) + max(0, half - 1) + 1, 28, GOLD_B)
        rect(im, int(C), top, int(C) + 1, 28, WHITE)
        ellipse(im, C, 28, 7 - f, 2, GOLD_H)
        for k in range(4):
            put(im, int(C) + (k - 2) * 3, 8 + ((k * 5 + f * 3) % 14), GOLD_H)
        fr.append(im if f < 3 else alpha_mul(im, 0.6))
    _fx4("pillar", fr)


def spawn_grimoire():
    fr = []
    for f in range(4):
        im = new(32, 32)
        for k in range(6):
            a = k * math.pi / 3 + f * 0.6
            x, y = _polar(C, C, 5 + f * 2.5, a)
            rect(im, round(x) - 1, round(y) - 1, round(x) + 1, round(y), GOLD_B if k % 2 else WHITE)
            put(im, round(x), round(y) - 1, GOLD_H)
        if f < 2:
            disc(im, C, C, 3 - f, GOLD_H)
        fr.append(im if f < 3 else alpha_mul(im, 0.7))
    _fx4("grimoire", fr)


def spawns():
    spawn_pop()
    spawn_skull()
    spawn_hand()
    spawn_pillar()
    spawn_grimoire()


# ---------------------------------------------------------------- trails (8x8, same recipe as effects/trail_*)
def trails():
    for nm, ramp in (("gold", "gold"), ("blue", "blue"), ("pink", "pink"), ("stone", "stone"), ("teal", "teal"),
                     ("yellow", "yellow"), ("white", "grey"), ("void", "purple")):
        s, b, h = RAMP[ramp]
        im = new(8, 8)
        disc(im, 3.5, 3.5, 3, _a(b, 110))
        disc(im, 3.5, 3.5, 2, b)
        disc(im, 3, 3, 0.8, WHITE if ramp in ("grey", "blue") else h)
        save(im, f"effects/sx_trail_{nm}.png")


# ---------------------------------------------------------------- passive / summon glyphs
def glyph(name, im):
    save(outline(im), f"effects/px_{name}.png")


def glyphs():
    bs, bb, bh = RAMP["blue"]
    im = new(5, 5)
    disc(im, 2, 2, 1.5, bb)
    put(im, 1, 1, bh)
    glyph("mote", im)

    ps, pb, ph = RAMP["pink"]
    gs, gb, gh = RAMP["green"]
    im = new(6, 6)
    poly(im, [(0, 5), (1, 1), (4, 0), (5, 4), (2, 5)], gb)
    poly(im, [(1, 4), (2, 2), (4, 1), (4, 3)], ph)
    put(im, 2, 2, WHITE)
    glyph("petal", im)

    ls, lb, lh = RAMP["slime"]
    im = new(8, 12)
    for y in range(11, 1, -1):
        x = 3 + round(math.sin(y * 0.7) * 1.6)
        put(im, x, y, lb)
        put(im, x + 1, y, ls)
    poly(im, [(2, 1), (5, 0), (6, 3), (4, 3)], lh)
    put(im, 6, 5, lb)
    put(im, 1, 7, lb)
    glyph("vine", im)

    fs, fb, fh = RAMP["fire"]
    im = new(5, 5)
    rect(im, 2, 0, 2, 4, fb)
    rect(im, 1, 0, 3, 1, fh)
    put(im, 2, 0, WHITE)
    glyph("tick", im)

    ss, sb, sh = RAMP["stone"]
    im = new(7, 7)
    poly(im, [(3, 0), (6, 2), (5, 6), (1, 6), (0, 2)], sb)
    poly(im, [(3, 0), (0, 2), (2, 3)], sh)
    poly(im, [(5, 6), (1, 6), (3, 4), (6, 2)], ss)
    glyph("facet", im)

    vs, vb, vh = RAMP["void"]
    im = new(9, 9)
    _star4(im, 4, 4, 4.4, 1.2, 0, WHITE)
    _star4(im, 4, 4, 3, 0.9, math.pi / 4, vh)
    put(im, 4, 4, WHITE)
    glyph("wild", im)

    cs, cb, ch = RAMP["cyan"]
    im = new(10, 10)
    line(im, 1, 8, 8, 1, cb, 2)
    line(im, 2, 7, 8, 1, WHITE)
    line(im, 1, 5, 4, 8, ch)
    put(im, 0, 9, cs)
    glyph("blade", im)

    ys, yb, yh = RAMP["yellow"]
    im = new(5, 5)
    poly(im, [(2, 0), (4, 2), (2, 4), (0, 2)], yb)
    put(im, 2, 1, yh)
    put(im, 2, 2, WHITE)
    glyph("pip", im)

    ts, tb, th = RAMP["teal"]
    im = new(16, 16)
    ellipse(im, 6, 10, 4, 3, _a(tb, 220))
    for k in range(4):
        rect(im, 3 + k * 2, 5 - (k % 2) * 2, 4 + k * 2, 8, _a(tb, 220))
    rect(im, 3, 9, 9, 10, _a(th, 230))
    line(im, 9, 12, 14, 2, _a(WHITE, 230), 1)
    line(im, 8, 12, 13, 2, _a(tb, 200), 1)
    put(im, 14, 1, WHITE)
    put(im, 12, 3, th)
    glyph("spirit", im)

    im = new(9, 9)
    line(im, 4, 0, 4, 8, vb)
    line(im, 1, 3, 4, 5, vb)
    line(im, 7, 3, 4, 5, vb)
    line(im, 2, 8, 6, 8, vh)
    put(im, 4, 2, WHITE)
    glyph("rune", im)

    halo = new(14, 6)
    for x in range(14):
        for y in range(6):
            d = ((x - 6.5) / 6.0) ** 2 + ((y - 2.5) / 2.4) ** 2
            if 0.3 <= d <= 1.0:
                halo.putpixel((x, y), GOLD_H if y < 3 else GOLD_B)
    glyph("halo", halo)

    im = new(11, 7)
    poly(im, [(0, 6), (0, 1), (3, 4), (5, 0), (7, 4), (10, 1), (10, 6)], GOLD_B)
    rect(im, 0, 5, 10, 6, GOLD_S)
    for x in (0, 5, 10):
        put(im, x, 0 if x == 5 else 1, GOLD_H)
    put(im, 5, 3, WHITE)
    glyph("crown", im)

    im = new(3, 5)
    rect(im, 1, 0, 1, 1, lb)
    rect(im, 0, 2, 2, 3, lb)
    put(im, 1, 4, ls)
    put(im, 1, 2, lh)
    glyph("drop", im)

    im = new(9, 9)
    _star4(im, 4, 4, 4.4, 1.1, 0, GOLD_H)
    put(im, 4, 4, WHITE)
    for x, y in ((1, 1), (7, 1), (1, 7), (7, 7)):
        put(im, x, y, GOLD_B)
    glyph("glint", im)


def build() -> None:
    impacts()
    spawns()
    trails()
    glyphs()
