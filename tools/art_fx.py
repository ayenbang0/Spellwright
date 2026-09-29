"""Projectiles, projectile overlays and combat effects (minimalist pixel art).

Faction rules
- Player projectiles/effects: cyan ramp + white, dark #0a0a10 outline. Element is
  conveyed by overlays/, never by recolouring the base.
- Enemy projectiles: magenta ramp with a WHITE outline.
Projectiles point RIGHT (the engine rotates them by velocity); the two legacy
16x24 sprites (evil_sword, pillar_light) stay vertical like their originals.
"""
import math

from art_core import (RAMP, OUT, WHITE, hexc, new, ascii_img, outline, pad, shift,
                      alpha_mul, glow, disc, ellipse, ring, ball, rect, line, poly,
                      put, rim_shade, rotate90, squash, rng, save, save_anim)

CS, CB, CH = RAMP["cyan"]
DEEP = hexc("164e63")
NAVY = hexc("083344")
MS, MB, MH = RAMP["magenta"]

PAL = {"o": OUT, "D": CS, "d": CB, "h": CH, "w": WHITE, "k": DEEP, "n": NAVY}
FULL = 1.0


# ---------------------------------------------------------------- local helpers
def A(rows, pal=None, w=16, h=16):
    for r in rows:
        assert len(r) <= w, (len(r), r)
    assert len(rows) <= h, len(rows)
    p = dict(PAL)
    if pal:
        p.update(pal)
    return ascii_img(rows, p, w, h)


def fin(im):
    return outline(im)


def efin(im):
    return outline(im, WHITE)


def pts(im, coords, c):
    for x, y in coords:
        put(im, x, y, c)


def star4(im, cx, cy, rout, rin, ang, c):
    p = []
    for k in range(8):
        r = rout if k % 2 == 0 else rin
        a = ang + k * math.pi / 4
        p.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    poly(im, p, c)


def sparkle(im, x, y, c=WHITE, arm=1, core=None):
    put(im, x, y, core or c)
    for i in range(1, arm + 1):
        for dx, dy in ((i, 0), (-i, 0), (0, i), (0, -i)):
            put(im, x + dx, y + dy, c)


def fade(im, a):
    """Alpha multiply keeping integer pixels (used for ghosts / dissipating fx)."""
    return alpha_mul(im, a)


def arc_px(im, cx, cy, r, a0, a1, c, width=1):
    """Ring pixels restricted to angle range [a0,a1] (radians, screen coords)."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            d = math.hypot(x - cx, y - cy)
            if r - width + 0.5 <= d < r + 0.5:
                a = math.atan2(y - cy, x - cx)
                if _ang_in(a, a0, a1):
                    px[x, y] = c


def _ang_in(a, a0, a1):
    two = 2 * math.pi
    a = (a - a0) % two
    return a <= (a1 - a0) % two or (a1 - a0) >= two


def proj(name, frames, fps=8, size=(18, 18), alias=True, loop=True):
    save_anim("projectiles/" + name, [pad(f, *size) for f in frames], fps=fps, loop=loop,
              alias=alias)


def fx(name, frames, fps=12, loop=False, alias=True):
    save_anim("effects/" + name, frames, fps=fps, loop=loop, alias=alias)


def teardrop(im, f, head, R, tail, rt, amp=0.0, freq=1.3, speed=2.1, holes=False):
    """Comet/flame body: capsule from tail (radius rt) to head (radius R), heat-shaded
    (white-hot core toward the head, cyan shadow on the rim/bottom). Tail edge wobbles
    with frame f."""
    hx, hy = head
    tx, ty = tail
    vx, vy = hx - tx, hy - ty
    L2 = vx * vx + vy * vy
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            t = ((x - tx) * vx + (y - ty) * vy) / L2
            tc = min(1.0, max(0.0, t))
            cx, cy = tx + vx * tc, ty + vy * tc
            r = rt + (R - rt) * tc ** 0.8
            r += amp * math.sin(y * freq + x * 0.5 - f * speed) * (1 - tc)
            d = math.hypot(x - cx, y - cy)
            if r <= 0.3 or d > r:
                continue
            if holes and tc < 0.45 and (x * 7 + y * 3 + f) % 5 == 0:
                continue
            heat = (1 - d / r) * 0.7 + tc * 0.45 - (0.15 if y > cy else 0)
            px[x, y] = WHITE if heat > 0.8 else CH if heat > 0.55 else CB if heat > 0.3 else CS


# ================================================================ PROJECTILES
def p_magic_bullet():
    tails = [
        ["....",
         "....",
         "....",
         "....",
         "....",
         "....",
         "....dd",
         ".DDddd",
         ".DDddd",
         "....dd"],
        ["....",
         "....",
         "....",
         "....",
         "....",
         "....",
         "..D.dd",
         "..Dddd",
         "DD.ddd",
         "....dd"],
    ]
    fr = []
    for f in range(2):
        im = A(tails[f])
        ball(im, 9.5, 7.5, 4, "cyan")
        if f == 0:
            disc(im, 8.5, 6.5, 1.0, WHITE)
        else:
            sparkle(im, 8, 6, WHITE)
            put(im, 9, 7, CH)
        fr.append(fin(im))
    proj("magic_bullet", fr, fps=8)


def p_rock_ball():
    rows = [
        "................",
        "................",
        "......hhhhh.....",
        "....hhwwhddd....",
        "...hwwhhdddd....",
        "..hhhhddddddD...",
        "..hhdddddddDDD..",
        "..hddddddkDDDD..",
        "..hdddddkDDDDD..",
        "...ddddkDDDDDD..",
        "...DdddDDDDDD...",
        "....DDDDDDDD....",
        ".....DDDDDD.....",
        "................",
    ]
    im = A(rows)
    fr = [fin(im), fin(rotate90(im, -1))]
    proj("rock_ball", fr, fps=8)


def p_butterfly():
    top_open = [
        "................",
        "........hhhh....",
        "...hhh.hwwddh...",
        "..hwddhhwddddD..",
        "..hdddDhddddD...",
        "...DDDDhdddD....",
        ".....DDDDDD.....",
    ]
    top_closed = [
        "................",
        "................",
        "................",
        "................",
        "......hhhhh.....",
        ".....hwwdddD....",
        "......DDDDD.....",
    ]
    fr = []
    for top in (top_open, top_closed):
        rows = top + ["...kkkkkkkkk....", "...kkkkkkkkk...."] + list(reversed(top))
        im = A(rows)
        pts(im, [(12, 7), (12, 8)], NAVY)  # head
        pts(im, [(13, 6), (14, 5), (13, 9), (14, 10)], DEEP)  # antennae
        fr.append(fin(im))
    proj("butterfly", fr, fps=10)


def p_black_hole():
    fr = []
    for f in range(4):
        im = new()
        px = im.load()
        ph = f * math.pi / 4
        for y in range(16):
            for x in range(16):
                dx, dy = x - 7.5, y - 7.5
                r = math.hypot(dx, dy)
                if r > 6.6:
                    continue
                a = math.atan2(dy, dx)
                s = (a - r * 0.75 + ph) % math.pi
                if r < 2.3:
                    c = OUT
                elif s < 1.0:
                    c = WHITE if r < 3.6 else (CH if r < 5.0 else CB)
                else:
                    c = NAVY if r < 4.2 else CS
                px[x, y] = c
        fr.append(fin(im))
    proj("black_hole", fr, fps=10)


def p_meteor():
    tails = [
        ["................",
         "................",
         "................",
         "................",
         "......DDd.......",
         "..D.DDddd.......",
         ".DDdddhhh.......",
         "..DDddhhh.......",
         "...DDDddd.......",
         ".....DDd........"],
        ["................",
         "................",
         "................",
         "................",
         ".D....Ddd.......",
         "...DDDddd.......",
         "..DDddhhh.......",
         ".DDdddhhh.......",
         "....DDddd.......",
         "......Dd........"],
    ]
    fr = []
    for f in range(2):
        im = A(tails[f])
        ball(im, 10.5, 7.5, 3.5, "cyan")
        disc(im, 10, 7, 1.2, WHITE)
        put(im, 9, 5, WHITE)
        fr.append(fin(im))
    proj("meteor", fr, fps=10)


def p_arcane_nova():
    fr = []
    for f, (rot, rout) in enumerate(((0, 7.0), (1, 6.0), (0, 6.0), (1, 7.0))):
        im = new()
        a = rot * math.pi / 4
        star4(im, 7.5, 7.5, rout, 2.2, a, CS)
        star4(im, 7.2, 7.2, rout - 1, 1.7, a, CB)
        star4(im, 7.5, 7.5, rout - 3.2, 1.2, a, CH)
        disc(im, 7.5, 7.5, 0.8, WHITE)
        fr.append(fin(im))
    proj("arcane_nova", fr, fps=12)


def p_mana_absorb():
    fr = []
    for f in range(2):
        im = new()
        ball(im, 7.5, 7.5, 2.6, "cyan")
        disc(im, 7, 7, 0.6, WHITE)
        d = 6 - f
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            x, y = int(7.5 + sx * d + (0.5 if sx < 0 else 0)), int(7.5 + sy * d + (0.5 if sy < 0 else 0))
            put(im, x, y, WHITE)
            put(im, x - sx, y - sy, CB)
        for sx, sy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
            dd = 4 + f
            put(im, int(7.5 + sx * dd), int(7.5 + sy * dd), CH)
        fr.append(fin(im))
    proj("mana_absorb", fr, fps=6)


def p_serpent_head():
    rows = [
        "................",
        "................",
        "................",
        "................",
        "....hhh.........",
        "...hdddhh.......",
        ".hhdwodddhh.....",
        ".hddddddddkhh...",
        ".DdddddddddkD...",
        ".DDdwoddddDD....",
        "...DdddDD.......",
        "....DDD.........",
    ]
    im = A(rows)
    pts(im, [(13, 7), (13, 8), (14, 6), (14, 9)], WHITE)  # forked tongue
    proj("serpent_head", [fin(im)])


def p_serpent_body():
    im = new()
    ball(im, 7.5, 7.5, 4.2, "cyan")
    pts(im, [(6, 9), (7, 10), (8, 10), (9, 9)], CS)  # belly scale arc
    pts(im, [(5, 7), (6, 8), (9, 8), (10, 7)], CS)
    put(im, 5, 5, WHITE)
    proj("serpent_body", [fin(im)])


def p_thunder_bolt():
    v = [
        "................",
        ".......hhhh.....",
        "......hwwh......",
        ".....hwwh.......",
        "....hwwh........",
        "...hwwwwwwh.....",
        ".....hwwwh......",
        "......hwwh......",
        ".....hwwh.......",
        "....hwwh........",
        "...hwh..........",
        "..hh............",
        "................",
    ]
    im0 = rotate90(A(v), -1)  # tip points right
    im0 = shift(im0, 1, 0)
    swap = {CH: WHITE, WHITE: CH}
    im1 = im0.copy()
    px = im1.load()
    for y in range(16):
        for x in range(16):
            if px[x, y] in swap:
                px[x, y] = CB if px[x, y] == CH else CH
    fr = [fin(im0), fin(im1.transpose(1))]  # 1 = FLIP_TOP_BOTTOM
    proj("thunder_bolt", fr, fps=12)


def p_water_stream():
    im = new()
    poly(im, [(1, 7), (8, 5), (11, 4), (11, 11), (8, 10), (1, 8)], CB)
    ball(im, 10.5, 7.5, 3.5, "cyan")
    px = im.load()
    for x in range(1, 9):
        for y in range(16):
            if px[x, y] == CB and px[x, y + 1][3] and not px[x, y - 1][3]:
                px[x, y] = CH
            elif px[x, y] == CB and not px[x, y + 1][3]:
                px[x, y] = CS
    pts(im, [(9, 6), (10, 6), (9, 7)], WHITE)
    fr0 = im.copy()
    pts(fr0, [(3, 4), (5, 11)], CH)
    fr1 = im.copy()
    pts(fr1, [(2, 11), (4, 3)], CH)
    proj("water_stream", [fin(fr0), fin(fr1)], fps=8)


def p_enchant_coin():
    fr = []
    for f, rx in enumerate((5.5, 3.5, 1.0, 3.5)):
        im = new()
        if rx >= 2:
            ellipse(im, 7.5, 7.5, rx, 5.5, CS)
            ellipse(im, 7.0, 7.0, rx - 0.6, 5.0, CB)
            ellipse(im, 7.5, 7.5, max(0.6, rx - 2), 3.4, CS)
            ellipse(im, 7.5, 7.5, max(0.4, rx - 3), 2.4, CH if f else CB)
            if f == 0:
                pts(im, [(7, 5), (6, 7), (8, 7), (7, 9), (7, 7)], WHITE)
            put(im, int(7.5 - rx + 1), 4, WHITE)
        else:
            rect(im, 7, 2, 8, 13, CB)
            rect(im, 7, 2, 7, 13, CH)
            put(im, 7, 3, WHITE)
        fr.append(fin(im))
    proj("enchant_coin", fr, fps=10)


def p_evil_sword():
    blade = ["......hwkD......"] * 11
    rows = [
        "................",
        ".......h........",
        "......hwd.......",
        "......hwdD......",
    ] + blade + [
        "..h...hwkD...D..",
        "..hd..hwkD..Dd..",
        "...hdddddddddD..",
        "....DDDkkDDDD...",
        ".......kD.......",
        ".......kD.......",
        "......hdDD......",
        ".......DD.......",
        "................",
    ]
    fr = []
    for f in range(2):
        im = A(rows, h=24)
        if f == 1:
            pts(im, [(8, 5), (8, 6), (8, 7)], CH)
            sparkle(im, 5, 4, WHITE)
        fr.append(fin(im))
    proj("evil_sword", fr, fps=6, size=(18, 26))


def p_boomerang():
    rows = [
        "................",
        "................",
        "...hhhhhhh......",
        "..hwwddddddhh...",
        "..hwdddddddddD..",
        "..hddDDDDDDDD...",
        "..hddD..........",
        "..hddD..........",
        "..hddD..........",
        "..hddD..........",
        "...hdD..........",
        "...hdD..........",
        "....D...........",
        "................",
        "................",
        "................",
    ]
    base = A(rows)
    base = shift(base, 1, 1)
    fr = [fin(rotate90(base, -k)) for k in range(4)]
    proj("boomerang", fr, fps=14)


def p_judgement_sword():
    rows = [
        "................",
        "................",
        "................",
        ".....h..........",
        "....hd..........",
        "....hd..........",
        "....hdhhhhhhhh..",
        ".hkkhdwwwwwwwwh.",
        ".Dkkhddddddddd..",
        "....hD..DDDDDD..",
        "....dD..........",
        "....DD..........",
        ".....D..........",
    ]
    fr = []
    for f in range(2):
        im = A(rows)
        if f == 1:
            sparkle(im, 11, 4, WHITE)
        fr.append(fin(im))
    proj("judgement_sword", fr, fps=6)


def p_water_bubble():
    fr = []
    for f in range(2):
        im = new()
        ry = 5.5 if f == 0 else 5.0
        rx = 5.5 if f == 0 else 6.0
        ellipse(im, 7.5, 7.5 + (f * 0.5), rx, ry, CB)
        ellipse(im, 7.5, 7.5 + (f * 0.5), rx - 1, ry - 1, (*CB[:3], 90))
        pts(im, [(4, 5), (5, 4), (4, 6), (6, 4)], WHITE)
        put(im, 10, 10 + f, CH)
        fr.append(fin(im))
    proj("water_bubble", fr, fps=5)


def p_shining_arrow():
    rows = [
        "................",
        "................",
        "................",
        "................",
        "...........h....",
        "...........wh...",
        ".hh........wwh..",
        "..hhhwwwwwwwwwh.",
        "..DDDdddddddwD..",
        ".DD........wD...",
        "...........D....",
    ]
    fr = []
    for f in range(2):
        im = A(rows)
        if f == 0:
            sparkle(im, 7, 4, CH, core=WHITE)
        else:
            sparkle(im, 5, 11, CH, core=WHITE)
            sparkle(im, 13, 3, WHITE)
        fr.append(fin(im))
    proj("shining_arrow", fr, fps=8)


def p_bing_arrow():
    rows = [
        "................",
        "................",
        "................",
        "...........h....",
        "..........hwh...",
        "..h......hwwdh..",
        "...h....hwwddh..",
        "..hhhhhhwwwddDh.",
        "..DDDDDDddddDDD.",
        "...D....DddDDD..",
        "..D......DdDD...",
        "..........DDD...",
        "...........D....",
    ]
    fr = []
    for f in range(2):
        im = A(rows)
        if f == 1:
            pts(im, [(11, 5), (10, 6)], WHITE)
            sparkle(im, 6, 4, CH, core=WHITE)
        fr.append(fin(im))
    proj("bing_arrow", fr, fps=6)


def p_pop_minion():
    fr = []
    for f in range(2):
        im = new()
        ball(im, 7.5, 8.5, 5.2, "cyan")
        # eyes (facing right)
        for ex in (8, 11):
            pts(im, [(ex, 6), (ex, 7)], WHITE)
            put(im, ex + 1, 7, OUT) if ex == 8 else put(im, ex + 1, 7, OUT)
        if f == 0:
            pts(im, [(10, 10), (11, 10), (12, 10)], OUT)
        else:
            rect(im, 10, 9, 12, 11, OUT)
            put(im, 11, 11, CH)
        if f == 1:
            im = squash(im, 1)
        fr.append(fin(im))
    proj("pop_minion", fr, fps=6)


def p_pop_shot():
    fr = []
    for f in range(2):
        im = new()
        ball(im, 8, 7.5, 2.5 if f == 0 else 2.0, "cyan")
        put(im, 7, 6, WHITE)
        put(im, 4 + f, 7, CS)
        fr.append(fin(im))
    proj("pop_shot", fr, fps=10)


def p_pillar_light():
    fr = []
    for f in range(2):
        im = new(16, 24)
        cols = [CS, CB, CH, WHITE, WHITE, CH, CB, CS] if f == 0 else [CB, CH, WHITE, WHITE, WHITE, WHITE, CH, CB]
        for i, c in enumerate(cols):
            x = 4 + i
            top = 3 + abs(i - 3.5) // 1
            rect(im, x, int(top), x, 19, c)
        ellipse(im, 7.5, 20, 6, 1.6, CS)
        ellipse(im, 7.5, 19.6, 4, 1.0, CH)
        rect(im, 6, 19, 9, 20, WHITE)
        for k, (x, y) in enumerate(((2, 8 + f * 3), (13, 13 - f * 3), (3, 16 - f * 2))):
            put(im, x, y, CH if k % 2 else WHITE)
        fr.append(fin(im))
    proj("pillar_light", fr, fps=6, size=(18, 26))


def p_grimoire():
    rows = [
        "................",
        "................",
        "................",
        "................",
        "..wwwww..wwwww..",
        ".whhhhwwwwhhhhw.",
        ".wwwwwwDDwwwwww.",
        ".whhhwwwDwhhhhw.",
        ".wwwwwwwDwwwwww.",
        ".whhhhwwDwhhhww.",
        ".dwwwwwwDwwwwwd.",
        ".ddddddwDwdddddd",
        "..DDDDDDDDDDDD..",
    ]
    rows[11] = ".ddddddwDwddddd."
    fr = []
    for f in range(2):
        im = A(rows)
        if f == 1:
            im = shift(im, 0, -1)
            sparkle(im, 12, 1, CH, core=WHITE)
        else:
            sparkle(im, 3, 2, CH, core=WHITE)
        fr.append(fin(im))
    proj("grimoire", fr, fps=4)


def p_cthulhu_hand():
    rows = [
        "................",
        "................",
        "......hhhd......",
        ".....hdDDDd.....",
        ".....hD...dD....",
        "..........hD....",
        ".........hdD....",
        "........hddD....",
        ".......hdwD.....",
        "......hdwdD.....",
        "......hdddD.....",
        ".....hdwddD.....",
        ".....hddddDD....",
        "...nnkkkkkkkn...",
        "....nnnnnnnn....",
    ]
    sway = [0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0]
    fr = []
    for f in range(2):
        im = new()
        src = A(rows)
        for y in range(16):
            dx = sway[y] if f == 1 and y < len(sway) else 0
            im.alpha_composite(src.crop((0, y, 16, y + 1)), (dx, y))
        fr.append(fin(im))
    proj("cthulhu_hand", fr, fps=4)


def p_fuse_spark():
    fr = []
    for f in range(2):
        im = new()
        if f == 0:
            for i in (2, 3, 4):
                pts(im, [(7 + i, 7), (7 - i, 7), (7, 7 + i), (7, 7 - i)], CH if i < 4 else CB)
            pts(im, [(4, 4), (10, 10), (10, 4), (4, 10)], CB)
        else:
            for i in (2, 3):
                pts(im, [(7 + i, 7 + i), (7 - i, 7 - i), (7 + i, 7 - i), (7 - i, 7 + i)], CH if i < 3 else CB)
            pts(im, [(12, 7), (2, 7), (7, 12), (7, 2)], CB)
        disc(im, 7, 7, 1.1, WHITE)
        fr.append(fin(im))
    proj("fuse_spark", fr, fps=12)


def p_legwire():
    fr = []
    for f in range(2):
        im = new()
        prev = None
        for x in range(3, 13):
            y = int(round(7.5 + 2.5 * math.sin((x - 3) * 1.1 + f * math.pi)))
            if prev is not None:
                line(im, x - 1, prev, x, y, CB)
            prev = y
        px = im.load()
        for y in range(16):
            for x in range(16):
                if px[x, y] == CB and (y == 0 or px[x, y - 1][3] == 0) and x % 2 == f:
                    px[x, y] = CH
        ball(im, 2.5, 7.5, 1.6, "cyan")
        ball(im, 13, 7.5, 1.6, "cyan")
        put(im, 13, 7, WHITE)
        put(im, 2, 7, WHITE)
        fr.append(fin(im))
    proj("legwire", fr, fps=8)


def p_supernova_orb():
    fr = []
    for f in range(2):
        im = new()
        ball(im, 7.5, 7.5, 5.2, "cyan")
        disc(im, 7, 7, 2.6 - f * 0.8, CH)
        disc(im, 7, 7, 1.3 - f * 0.4, WHITE)
        rays = ((1, 1), (-1, -1), (1, -1), (-1, 1)) if f == 0 else ((1, 0), (-1, 0), (0, 1), (0, -1))
        for sx, sy in rays:
            d = 7 if (sx and sy) is False else 6
            put(im, int(7.5 + sx * 6.5), int(7.5 + sy * 6.5), WHITE)
        fr.append(fin(im))
    proj("supernova_orb", fr, fps=6)


def p_laser():
    fr = []
    for f in range(2):
        im = new(32, 8)
        rows = [CS, CB, CH, WHITE, WHITE, CH, CB, CS] if f == 0 else [None, CS, CB, WHITE, WHITE, CB, CS, None]
        for y, c in enumerate(rows[1:7], start=1):
            if c:
                rect(im, 0, y, 31, y, c)
        for x in range(f * 4, 32, 8):
            pts(im, [(x, 2), (x + 1, 2)] if f == 0 else [(x, 3), (x + 1, 4)], WHITE if f == 0 else CH)
        fr.append(pad(fin(im), 34, 10))
    save_anim("projectiles/laser", fr, fps=12, alias=False)


def p_ray():
    fr = []
    for f in range(2):
        im = new(32, 8)
        rect(im, 0, 3, 31, 4, CB)
        for x in range(32):
            ph = (x + f * 4) % 8
            if ph < 4:
                put(im, x, 3, WHITE)
            else:
                put(im, x, 4, CH)
            if ph == 2:
                put(im, x, 2, CB)
            if ph == 6:
                put(im, x, 5, CS)
        fr.append(fin(im))
    save_anim("projectiles/ray", fr, fps=12)


def p_wisp():
    fr = []
    for f in range(4):
        im = new()
        teardrop(im, f, (10.5, 7.5), 3.2, (1.5, 7.5), 0.7, amp=1.1, freq=0.9, speed=math.pi / 2)
        put(im, 10, 7, WHITE)
        fr.append(fin(im))
    save_anim("projectiles/wisp", fr, fps=10)


def p_mine():
    fr = []
    for f in range(2):
        im = new()
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            for i in (5, 6):
                put(im, int(7.5 + sx * i + (0.5 if sx < 0 else 0)), int(7.5 + sy * i + (0.5 if sy < 0 else 0)), CS)
        for sx, sy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
            put(im, int(7.5 + sx * 4.3 + (0.5 if sx < 0 else 0)), int(7.5 + sy * 4.3 + (0.5 if sy < 0 else 0)), CS)
        ball(im, 7.5, 7.5, 4, "cyan")
        if f == 0:
            disc(im, 7.5, 7.5, 1.3, WHITE)
            pts(im, [(7, 5), (5, 7)], CH)
        else:
            disc(im, 7.5, 7.5, 1.3, NAVY)
        fr.append(fin(im))
    save_anim("projectiles/mine", fr, fps=4)


def p_rainbow_shot():
    im = new()
    ball(im, 8.5, 7.5, 4.5, "cyan")
    tint = [hexc("f9a8d4"), hexc("fde68a"), hexc("86efac"), hexc("c4b5fd")]
    pts(im, [(7, 6)], tint[0])
    pts(im, [(8, 6)], tint[1])
    pts(im, [(8, 7)], tint[2])
    pts(im, [(7, 7)], tint[3])
    pts(im, [(6, 5), (9, 8)], WHITE)
    pts(im, [(3, 7), (2, 8), (4, 8)], CB)
    save_anim("projectiles/rainbow_shot", [fin(im)], fps=1)


def p_flame():
    cfg = [((9, 7.5), 3.0, (5, 7.5), 1.4, 0.5, False),
           ((10, 7.5), 3.9, (3, 7.5), 1.6, 0.9, False),
           ((10.5, 7.5), 4.3, (1.5, 7.5), 1.4, 1.2, True)]
    fr = []
    for f, (head, R, tail, rt, amp, holes) in enumerate(cfg):
        im = new()
        teardrop(im, f, head, R, tail, rt, amp=amp, holes=holes)
        fr.append(fin(im))
    save_anim("projectiles/flame", fr, fps=10)


def p_lightning_ball():
    fr = []
    for f in range(4):
        im = new()
        ball(im, 7.5, 7.5, 4, "cyan")
        disc(im, 7, 7, 1.4, WHITE)
        for k in range(3):
            a = f * math.pi / 6 + k * 2 * math.pi / 3
            x1, y1 = 7.5 + 4.5 * math.cos(a), 7.5 + 4.5 * math.sin(a)
            x2, y2 = 7.5 + 6.3 * math.cos(a + 0.35), 7.5 + 6.3 * math.sin(a + 0.35)
            put(im, int(round(x1)), int(round(y1)), CH)
            put(im, int(round(x2)), int(round(y2)), WHITE)
            mx, my = 7.5 + 5.4 * math.cos(a - 0.2), 7.5 + 5.4 * math.sin(a - 0.2)
            put(im, int(round(mx)), int(round(my)), CH)
        fr.append(fin(im))
    save_anim("projectiles/lightning_ball", fr, fps=12)


def p_adava_bolt():
    fr = []
    for f in range(3):
        r = rng(f"adava{min(f, 1)}")  # f2 = flash of the f1 strike
        core = new(16, 32)
        x, y = 8, 1
        pts_ = [(x, y)]
        while y < 28:
            y = min(28, y + r.choice((3, 4)))
            x = max(4, min(11, x + r.choice((-3, -2, 2, 3))))
            pts_.append((x, y))
        for (x0, y0), (x1, y1) in zip(pts_, pts_[1:]):
            line(core, x0, y0, x1, y1, WHITE)
        bx, by = pts_[3]
        s = 1 if f % 2 else -1
        line(core, bx, by, bx + 3 * s, by + 3, WHITE)
        im = glow(core, CH, 1)
        if f == 2:
            im = glow(im, CB, 1)
        ellipse(im, 8, 29.5, 4.5 if f else 3, 1.2, CH)
        rect(im, 6, 29, 9, 29, WHITE)
        fr.append(fin(im))
    save_anim("projectiles/adava_bolt", fr, fps=12)


def p_skull_minion():
    skull = [
        "................",
        "................",
        ".....hhhhhh.....",
        "....hwwwwwwh....",
        "...hwwwwwwhhD...",
        "...hwkkwkkhhD...",
        "...hwkdhkdhhD...",
        "...hhhhkhhhhD...",
        "....DhhhhhhD....",
        ".....hwhwhD.....",
        ".....DDDDDD.....",
        "................",
    ]
    jaw_open = [
        ".....hwhwhD.....",
        "................",
        ".....hDhDhD.....",
    ]
    fr = []
    for f, dy in enumerate((0, -1, 0, 1)):
        im = A(skull)
        if f in (1, 2):
            im2 = A(skull[:9] + jaw_open)
            im = im2
        eye = CB if f % 2 == 0 else CH
        pts(im, [(6, 6), (9, 6)], eye)
        fr.append(fin(shift(im, 0, dy + 2)))
    save_anim("projectiles/skull_minion", fr, fps=8)


def p_enemy():
    # enemy bullet 12x12 (alias padded to legacy 14x14)
    fr = []
    for f in range(2):
        im = new(12, 12)
        ball(im, 5.5, 5.5, 3.6, "magenta")
        disc(im, 5, 5, 1.0 if f == 0 else 1.6, WHITE)
        fr.append(efin(im))
    save_anim("projectiles/enemy_bullet", fr, fps=8, alias_size=(14, 14))
    fr = []
    for f in range(2):
        im = new(12, 12)
        w = 4.6 if f == 0 else 3.0
        poly(im, [(5.5, 1), (5.5 + w, 5.5), (5.5, 10), (5.5 - w, 5.5)], MB)
        rim_shade(im, MB, "magenta")
        pts(im, [(5, 4), (5, 5), (6, 5)] if f == 0 else [(5, 4), (5, 5)], WHITE)
        fr.append(efin(im))
    save_anim("projectiles/enemy_diamond", fr, fps=6, alias_size=(14, 14))
    fr = []
    for f in range(2):
        im = new()
        ball(im, 7.5, 7.5, 5.8 - f * 0.4, "magenta")
        disc(im, 7.5, 7.5, 2.4 - f * 0.6, MH)
        disc(im, 6.5, 6.5, 1.0, WHITE)
        fr.append(efin(im))
    save_anim("projectiles/enemy_orb", fr, fps=6)


# ================================================================ OVERLAYS
FS, FB, FH = RAMP["fire"]
IS, IB, IH = RAMP["ice"]
VS, VB, VH = RAMP["poison"]
YS, YB, YH = RAMP["yellow"]
GS, GB, GH = RAMP["green"]
RED = RAMP["red"][1]


def ov(name, im):
    save(fin(im), f"overlays/{name}.png")


def o_fire():
    rows = [
        "................",
        "....y.....y.....",
        "...yf..y..fy....",
        "...fr.yf..rf....",
        ".y.fr.fr..r.....",
        "yf..r.r.........",
        "fr..............",
        "fr..............",
        ".r..............",
        "y...............",
        "f...............",
        "r...............",
    ]
    im = A(rows, {"y": FH, "f": FB, "r": RED})
    ov("ov_fire", shift(im, 1, 0))


def o_frost():
    im = new()
    for cx, cy in ((3, 3), (12, 3), (3, 12), (12, 12)):
        for i in (1, 2):
            pts(im, [(cx + i, cy), (cx - i, cy), (cx, cy + i), (cx, cy - i)], IB if i == 1 else IS)
        put(im, cx, cy, WHITE)
    ov("ov_frost", im)


def o_venom():
    im = new()
    for cx, cy, r in ((4.5, 3.5, 1.6), (9.5, 2.5, 1.2), (12.5, 4.5, 0.8)):
        disc(im, cx, cy, r, VS)
        disc(im, cx - 0.4, cy - 0.4, max(0.3, r - 0.8), VB)
        put(im, int(cx - 0.5), int(cy - 0.5), VH)
    put(im, 2, 6, VB)
    ov("ov_venom", im)


def o_thunder():
    rows = [
        "................",
        "..........y.....",
        ".........yY.....",
        "........yYYYy...",
        "..........Yy....",
        "..........y.....",
        "................",
        "................",
        "................",
        "................",
        "..y.............",
        ".yY.............",
        "yYYYy...........",
        "..Yy............",
        "..y.............",
        "................",
    ]
    im = A(rows, {"y": YB, "Y": YH})
    pts(im, [(2, 3), (13, 12)], YB)
    ov("ov_thunder", shift(im, 1, 0))


def o_homing():
    im = new()
    for x0 in (10, 12):
        for i in range(3):
            put(im, x0 + i, 1 + i, CB if x0 == 10 else CH)
            put(im, x0 + i, 5 - i, CB if x0 == 10 else CH)
            put(im, x0 + i, 10 + i, CB if x0 == 10 else CH)
            put(im, x0 + i, 14 - i, CB if x0 == 10 else CH)
    ov("ov_homing", im)


def o_rebound():
    im = new()
    rect(im, 3, 13, 12, 13, GB)
    rect(im, 3, 12, 12, 12, GH)
    for i in range(1, 3):
        pts(im, [(3 + i, 12 - i), (3 + i, 13 + i), (12 - i, 12 - i), (12 - i, 13 + i)], GB)
    put(im, 2, 12, GH)
    put(im, 2, 13, GB)
    put(im, 13, 12, GH)
    put(im, 13, 13, GB)
    ov("ov_rebound", im)


def o_pierce():
    im = new()
    rect(im, 1, 8, 11, 8, WHITE)
    for i in range(4):
        rect(im, 11 + i, 8 - (3 - i), 11 + i, 8 + (3 - i), WHITE if i else CH)
    ov("ov_pierce", im)


def _ghost(im, cx, cy, r, a):
    g = new()
    ring(g, cx, cy, r, CB)
    put(g, int(cx - 0.5), int(cy - 0.5), CH)
    im.alpha_composite(fade(fin(g), a))


def o_multishot():
    im = new()
    _ghost(im, 3.5, 3.5, 2.2, 0.7)
    _ghost(im, 3.5, 12.5, 2.2, 0.7)
    base = new()
    for y in (10, 12, 14):
        pass
    # fan pips (top-right) : 3 pips on a diagonal
    for i, (x, y) in enumerate(((12, 2), (13, 4), (14, 6))):
        put(base, x - 1, y, WHITE)
    im.alpha_composite(fin(base))
    save(im, "overlays/ov_multishot.png")


def o_volley():
    im = new()
    _ghost(im, 3.5, 7.5, 2.2, 0.75)
    _ghost(im, 0.5, 7.5, 1.6, 0.45)
    base = new()
    for x in (6, 8, 10):
        put(base, x, 14, CH)
        put(base, x - 1 + 1, 13, WHITE) if False else None
    for x in (6, 8, 10):
        put(base, x, 13, WHITE)
    im.alpha_composite(fin(base))
    save(im, "overlays/ov_volley.png")


def o_echo():
    im = new()
    for r, a in ((6.5, 1.0), (4.5, 0.55)):
        g = new()
        arc_px(g, 11.5 - (6.5 - r) * 0.0 + (r - 6.5), 7.5, r, math.radians(120), math.radians(240), CH)
        im.alpha_composite(fade(fin(g), a))
    save(im, "overlays/ov_echo.png")


def o_duet():
    gs, gb, gh = RAMP["grey"]
    im = new()
    for cx, cy in ((10.5, 12.5), (13, 11)):
        pass
    rows = [
        "..........aa....",
        ".........a..a...",
        "........aHb.b...",
        "........a.b.bb..",
        ".........bbH..b.",
        "..........b..b..",
        "...........bb...",
    ]
    im = A(rows, {"a": gb, "b": gs, "H": gh})
    pts(im, [(10, 0), (11, 0)], gh)
    ov("ov_duet", shift(im, 0, 8))


def o_orbit():
    im = new()
    px = im.load()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if 6.0 <= d < 7.0:
                a = math.degrees(math.atan2(y - 7.5, x - 7.5)) % 360
                if int(a // 30) % 2 == 0:
                    px[x, y] = CB if y > 7 else CH
    ov("ov_orbit", im)


def o_enlarge():
    im = new()
    for sx, sy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        x = 1 if sx == 0 else 14
        y = 1 if sy == 0 else 14
        dx = 1 if sx == 0 else -1
        dy = 1 if sy == 0 else -1
        pts(im, [(x, y), (x + dx, y), (x + 2 * dx, y), (x, y + dy), (x, y + 2 * dy)], WHITE)
        put(im, x + dx, y + dy, CH)
    ov("ov_enlarge", im)


def o_fall():
    im = new()
    sh = new()
    ellipse(sh, 7.5, 13.5, 5.0, 1.3, (*OUT[:3], 90))
    ellipse(sh, 7.5, 13.5, 3.0, 0.7, (*OUT[:3], 160))
    arrow = new()
    rect(arrow, 12, 1, 13, 4, WHITE)
    rect(arrow, 10, 5, 15, 5, WHITE)
    rect(arrow, 11, 6, 14, 6, WHITE)
    rect(arrow, 12, 7, 13, 7, CH)
    arrow = fin(shift(arrow, -1, 0))
    im.alpha_composite(sh)
    im.alpha_composite(arrow)
    save(im, "overlays/ov_fall.png")


# ================================================================ EFFECTS
def e_status():
    rows = [
        "................",
        "................",
        "...........y....",
        "....y.....yf....",
        "...yf.....ff....",
        "...ff....yfr....",
        "..yfr...yffr..y.",
        "..ffr...yffr.yf.",
        "..ffrr.yfyfr.ffr",
        ".yfyfr.ffyfrrffr",
        ".ffyfr.ffyyfrfyr",
        ".fyyfrrfyyyfrfyr",
        ".ryyyrrryyyrrryr",
        "..rrrr..rrrr.rr.",
        "................",
    ]
    im = A(rows, {"y": FH, "f": FB, "r": RED})
    save(fin(shift(im, 0, 0).crop((0, 0, 16, 16)) if False else fin(_trim_edge(im))), "effects/burn_flames.png")

    im = new()
    for pts_, c in (([(3, 13), (4, 7), (6, 13)], IS), ([(6, 13), (8, 2), (10, 13)], IB),
                    ([(10, 13), (12, 6), (13, 13)], IS)):
        poly(im, pts_, c)
    poly(im, [(7, 12), (8, 3), (8, 12)], IH)
    poly(im, [(4, 12), (4, 8), (5, 12)], IB)
    poly(im, [(11, 12), (12, 7), (12, 12)], IB)
    put(im, 8, 4, WHITE)
    save(fin(im), "effects/freeze_crystals.png")

    im = new()
    rect(im, 6, 2, 9, 13, GB)
    rect(im, 2, 6, 13, 9, GB)
    rect(im, 6, 2, 6, 5, GH)
    rect(im, 2, 6, 5, 6, GH)
    rect(im, 7, 6, 7, 6, GH)
    rect(im, 9, 10, 9, 13, GS)
    rect(im, 10, 9, 13, 9, GS)
    rect(im, 6, 13, 8, 13, GS)
    rect(im, 13, 6, 13, 8, GS)
    save(fin(im), "effects/heal_cross.png")

    im = new()
    for cx, cy, r in ((5, 9.5, 2.6), (10.5, 6, 2.0), (9.5, 12, 1.4), (4, 3.5, 1.0)):
        disc(im, cx, cy, r, VS)
        disc(im, cx - 0.4, cy - 0.4, r - 0.8, VB)
        put(im, int(round(cx - r / 2)), int(round(cy - r / 2)), VH)
    save(fin(im), "effects/poison_bubbles.png")

    im = new()
    hexp = [(7.5, 1), (13.5, 4.5), (13.5, 10.5), (7.5, 14), (1.5, 10.5), (1.5, 4.5)]
    poly(im, hexp, (*CB[:3], 80))
    for i in range(6):
        a, b = hexp[i], hexp[(i + 1) % 6]
        line(im, round(a[0]), round(a[1]), round(b[0]), round(b[1]), CH if i in (4, 5) else CB)
    pts(im, [(4, 5), (4, 6), (5, 4)], WHITE)
    save(fin(im), "effects/shield_hex.png")

    im = new()
    star4(im, 7.5, 7.5, 7.0, 2.0, 0, hexc("e2e8f0"))
    star4(im, 7.5, 7.5, 4.0, 1.5, math.pi / 4, WHITE)
    disc(im, 7.5, 7.5, 1.8, WHITE)
    save(fin(im), "effects/windup_flash.png")


def _trim_edge(im):
    # keep a 1px margin on the right/bottom for the outline
    c = new(16, 16)
    c.alpha_composite(im.crop((0, 0, 15, 15)), (0, 0))
    return c


def e_impacts():
    for name, R in (("small", 6), ("medium", 10), ("large", 14)):
        fr = []
        for f in range(3):
            im = new(32, 32)
            c = 15.5
            if f == 0:
                r = R * 0.55
                disc(im, c, c, r + 1, CB)
                disc(im, c, c, r, CH)
                disc(im, c, c, max(1, r - 1.5), WHITE)
                for k in range(4):
                    a = k * math.pi / 2 + math.pi / 4
                    line(im, round(c + (r + 1) * math.cos(a)), round(c + (r + 1) * math.sin(a)),
                         round(c + (R - 0.5) * math.cos(a)), round(c + (R - 0.5) * math.sin(a)), WHITE)
                fr.append(fin(im))
            elif f == 1:
                r = R * 0.85
                ring(im, c, c, r, CB, width=max(2, R // 4))
                ring(im, c, c, r - max(2, R // 4) + 1, CH, width=1)
                disc(im, c, c, max(0.6, R * 0.2), WHITE)
                for k in range(8):
                    a = k * math.pi / 4 + math.pi / 8
                    put(im, round(c + (r + 1.5) * math.cos(a)), round(c + (r + 1.5) * math.sin(a)), WHITE)
                fr.append(fin(im))
            else:
                r = R
                g = new(32, 32)
                px = g.load()
                for y in range(32):
                    for x in range(32):
                        d = math.hypot(x - c, y - c)
                        if r - 0.5 <= d < r + 0.5:
                            a = math.degrees(math.atan2(y - c, x - c)) % 360
                            if int(a // 30) % 2 == 0:
                                px[x, y] = CB
                for k in range(8):
                    a = k * math.pi / 4
                    put(g, round(c + r * 0.6 * math.cos(a)), round(c + r * 0.6 * math.sin(a)), CH)
                fr.append(fade(fin(g), 0.75))
        fx(f"impact_{name}", fr, fps=12, loop=False, alias=False)


def e_telegraph():
    im = new(32, 32)
    rs, rb, rh = RAMP["red"]
    disc(im, 15.5, 15.5, 13, (*rb[:3], 45))
    ring(im, 15.5, 15.5, 14, rb, width=2)
    ring(im, 15.5, 15.5, 12, (*rs[:3], 200), width=1)
    for k in range(4):
        a = k * math.pi / 2
        put(im, round(15.5 + 9 * math.cos(a)), round(15.5 + 9 * math.sin(a)), rh)
    save(im, "effects/telegraph_circle.png")

    im = new(32, 8)
    rect(im, 0, 2, 31, 5, (*rb[:3], 55))
    rect(im, 0, 1, 31, 1, rb)
    rect(im, 0, 6, 31, 6, rb)
    for x0 in range(2, 32, 8):
        pts(im, [(x0, 2), (x0 + 1, 3), (x0 + 1, 4), (x0, 5)], rh)
        pts(im, [(x0 + 2, 3), (x0 + 2, 4)], rh)
    save(im, "effects/telegraph_line.png")


def e_trails():
    for nm, ramp in (("trail_cyan", "cyan"), ("trail_fire", "fire"), ("trail_venom", "poison"),
                     ("trail_void", "void")):
        s, b, h = RAMP[ramp]
        im = new(8, 8)
        disc(im, 3.5, 3.5, 3, (*b[:3], 110))
        disc(im, 3.5, 3.5, 2, b)
        disc(im, 3, 3, 0.8, h)
        save(im, f"effects/{nm}.png")


def e_new():
    # muzzle flash
    fr = []
    for f in range(3):
        im = new()
        if f == 0:
            star4(im, 7.5, 7.5, 4, 1.4, 0, CH)
            disc(im, 7.5, 7.5, 1.2, WHITE)
        elif f == 1:
            star4(im, 7.5, 7.5, 7, 1.8, 0, CB)
            star4(im, 7.5, 7.5, 4.5, 1.2, 0, CH)
            star4(im, 7.5, 7.5, 3.5, 1.2, math.pi / 4, WHITE)
        else:
            ring(im, 7.5, 7.5, 6, CB)
            for k in range(4):
                a = k * math.pi / 2 + math.pi / 4
                put(im, round(7.5 + 3.5 * math.cos(a)), round(7.5 + 3.5 * math.sin(a)), CH)
        fr.append(fin(im) if f < 2 else fade(fin(im), 0.7))
    fx("muzzle", fr)

    # hit spark
    fr = []
    for f in range(3):
        im = new()
        if f == 0:
            sparkle(im, 7, 7, CH, arm=2, core=WHITE)
        elif f == 1:
            for i in range(1, 6):
                c = WHITE if i < 4 else CH
                pts(im, [(7 + i, 7 + i), (7 - i, 7 - i), (7 + i, 7 - i), (7 - i, 7 + i)], c)
            sparkle(im, 7, 7, WHITE, arm=1)
        else:
            for x, y in ((13, 13), (1, 1), (13, 1), (1, 13), (7, 2), (12, 7)):
                put(im, x, y, CH)
        fr.append(fin(im))
    fx("hit_spark", fr)

    # death puff
    gs, gb, gh = RAMP["grey"]
    fr = []
    cfg = [
        [(7.5, 8.5, 3.0)],
        [(6, 8, 3.2), (10, 7.5, 3.0), (8, 10.5, 2.6)],
        [(4.5, 7.5, 3.0), (11, 6.5, 3.0), (8, 11, 3.0), (7.5, 4.5, 2.2)],
        [(3.5, 6, 2.0), (12, 5, 2.0), (8, 12.5, 1.8), (7.5, 2.5, 1.5)],
    ]
    for f, cl in enumerate(cfg):
        im = new()
        for cx, cy, r in cl:
            disc(im, cx, cy, r, gs)
        for cx, cy, r in cl:
            disc(im, cx - 0.5, cy - 0.5, r - 0.9, gb)
        for cx, cy, r in cl:
            disc(im, cx - 1, cy - 1, max(0.4, r - 2.2), gh)
        im = fin(im)
        fr.append(fade(im, (1.0, 1.0, 0.85, 0.55)[f]))
    fx("death_puff", fr)

    # spawn sigil (enemy, magenta, loops)
    fr = []
    for f in range(4):
        im = new()
        ring(im, 7.5, 7.5, 6.5, MB)
        ring(im, 7.5, 7.5, 5.5, MS)
        for k in range(4):
            a = f * math.pi / 8 + k * math.pi / 2
            put(im, round(7.5 + 6 * math.cos(a)), round(7.5 + 6 * math.sin(a)), WHITE)
            put(im, round(7.5 + 3 * math.cos(a + math.pi / 4)), round(7.5 + 3 * math.sin(a + math.pi / 4)),
                MB)
        s = 1 + (f % 2)
        pts(im, [(7, 7 - s), (8, 7 - s), (7, 8 + s), (8, 8 + s), (7 - s, 7), (7 - s, 8), (8 + s, 7), (8 + s, 8)],
            MH)
        rect(im, 7, 7, 8, 8, MB if f % 2 else MH)
        fr.append(fin(im))
    fx("spawn", fr, fps=8, loop=True)

    # arcane ring shockwave
    fr = []
    for f, (r, w) in enumerate(((5, 3), (9, 3), (12, 2), (14, 1))):
        im = new(32, 32)
        ring(im, 15.5, 15.5, r, CB, width=w)
        ring(im, 15.5, 15.5, r - w + 1, WHITE if f < 2 else CH, width=1)
        if f == 3:
            px = im.load()
            for y in range(32):
                for x in range(32):
                    a = math.degrees(math.atan2(y - 15.5, x - 15.5)) % 360
                    if px[x, y][3] and int(a // 22.5) % 2:
                        px[x, y] = (0, 0, 0, 0)
        im = fin(im)
        fr.append(im if f < 3 else fade(im, 0.7))
    fx("arcane_ring", fr)

    # slash arc (swings from top to bottom on the right side)
    fr = []
    spans = ((-80, -10), (-85, 85), (-20, 85))
    for f, (a0, a1) in enumerate(spans):
        im = new(32, 32)
        px = im.load()
        for y in range(32):
            for x in range(32):
                d = math.hypot(x - 12, y - 15.5)
                a = math.degrees(math.atan2(y - 15.5, x - 12))
                if not (a0 <= a <= a1):
                    continue
                t = (a - a0) / (a1 - a0)
                thick = 1 + 3.5 * math.sin(t * math.pi) if f != 2 else 1 + 2 * math.sin(t * math.pi)
                if 14 - thick <= d < 14.5:
                    px[x, y] = WHITE if d >= 14 - thick * 0.45 else (CH if d >= 14 - thick * 0.8 else CB)
        im = fin(im)
        fr.append(im if f < 2 else fade(im, 0.75))
    fx("slash", fr)

    # level up sparkles
    fr = []
    spots = [(3, 11), (12, 12), (7, 9), (10, 5), (4, 4)]
    for f in range(4):
        im = new()
        for i, (x, y) in enumerate(spots):
            yy = y - f * 2 - (i % 2)
            if yy < 1:
                continue
            big = (i + f) % 2 == 0
            if big:
                sparkle(im, x, yy, CH, arm=1, core=WHITE)
            else:
                put(im, x, yy, CB if f < 3 else CH)
        # rising arrow
        ay = 9 - f * 2
        pts(im, [(7, ay), (6, ay + 1), (8, ay + 1), (7, ay + 1), (7, ay + 2)], WHITE)
        im = fin(im)
        fr.append(im if f < 3 else fade(im, 0.7))
    fx("level_up", fr)

    # soft shadow (2 alpha steps, no blur)
    im = new(16, 8)
    ellipse(im, 7.5, 3.5, 7.0, 2.9, (*OUT[:3], 60))
    ellipse(im, 7.5, 3.5, 5.0, 1.9, (*OUT[:3], 110))
    save(im, "effects/shadow.png")

    # crit star 8x8
    ys, yb, yh = RAMP["yellow"]
    im = new(8, 8)
    star4(im, 3.5, 3.5, 3.0, 1.1, 0, yb)
    put(im, 3, 3, WHITE)
    put(im, 3, 2, yh)
    put(im, 2, 3, yh)
    save(fin(im), "effects/crit_star.png")


# ================================================================ entry
def build():
    for fn in (p_magic_bullet, p_rock_ball, p_butterfly, p_black_hole, p_meteor, p_arcane_nova,
               p_mana_absorb, p_serpent_head, p_serpent_body, p_thunder_bolt, p_water_stream,
               p_enchant_coin, p_evil_sword, p_boomerang, p_judgement_sword, p_water_bubble,
               p_shining_arrow, p_bing_arrow, p_pop_minion, p_pop_shot, p_pillar_light, p_grimoire,
               p_cthulhu_hand, p_fuse_spark, p_legwire, p_supernova_orb, p_laser, p_ray, p_wisp,
               p_mine, p_rainbow_shot, p_flame, p_lightning_ball, p_adava_bolt, p_skull_minion,
               p_enemy):
        fn()
    for fn in (o_fire, o_frost, o_venom, o_thunder, o_homing, o_rebound, o_pierce, o_multishot,
               o_volley, o_echo, o_duet, o_orbit, o_enlarge, o_fall):
        fn()
    e_status()
    e_impacts()
    e_telegraph()
    e_trails()
    e_new()
