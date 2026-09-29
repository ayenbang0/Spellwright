"""48x48 bosses: idle loop _f0..f3, _hit (white silhouette), _telegraph (red warning glow).

Each boss is drawn from shaded primitives by a function draw(im, t) where t = frame 0..3.
Silhouettes are distinct per boss; hostile accents are magenta/red eyes.
Legacy aliases (bosses that existed before the revamp) keep their original 50x50 size (centred).
"""
import math

from art_core import (RAMP, hexc, new, ball, eball, disc, ellipse, ring, rect, line, poly, put,
                      outline, glow, silhouette, save, save_anim, OUT, WHITE)

S = 48
EYE = RAMP["magenta"]
RED_GLOW = hexc("ef4444")
LEGACY = {"giant_spider", "wandering_worm", "deceiver2", "hatcher", "master_mind", "void_imp", "all_seeing_eye",
          "indescribable", "skeletal_centaur", "abyssal_lord", "demon_lord_p1", "demon_lord_p2", "demon_lord_p3", "producer"}


def eye(im, x, y, r=2, look=(0, 0)):
    disc(im, x, y, r, WHITE)
    disc(im, x + look[0], y + look[1], max(0.8, r * 0.55), EYE[1])
    put(im, int(x + look[0]), int(y + look[1]), EYE[0])


def bob(t, amp=1):
    return [0, -amp, 0, amp][t % 4]


# ---------------------------------------------------------------- chapter 1
def giant_spider(im, t):
    dy = bob(t)
    sh, b, h = RAMP["black"]
    for side in (-1, 1):
        for i in range(4):
            phase = (t + i) % 4
            kx = 24 + side * (10 + i * 2)
            ky = 20 + i * 5 + dy
            fx = 24 + side * (19 + (1 if phase < 2 else -1))
            fy = 16 + i * 8 + (1 if phase % 2 else 0)
            line(im, 24 + side * 6, 22 + i * 2 + dy, kx, ky - 6, RAMP["slate"][1], 2)
            line(im, kx, ky - 6, fx, fy + 8, RAMP["slate"][0], 2)
    eball(im, 24, 30 + dy, 11, 9, RAMP["black"])
    eball(im, 24, 18 + dy, 8, 7, RAMP["slate"])
    for x, y in ((20, 16), (28, 16), (22, 20), (26, 20)):
        eye(im, x, y + dy, 1.5)
    rect(im, 21, 24 + dy, 22, 26 + dy, RAMP["bone"][1])
    rect(im, 26, 24 + dy, 27, 26 + dy, RAMP["bone"][1])
    ellipse(im, 24, 33 + dy, 4, 2, EYE[0])


def wandering_worm(im, t):
    segs = 6
    for i in reversed(range(segs)):
        a = i * 0.9 + t * 0.5
        x = 10 + i * 5.5
        y = 26 + math.sin(a) * 6
        r = 7 - i * 0.5
        ball(im, x, y, r, "rust")
        ring(im, x, y, r, RAMP["rust"][0])
    hx, hy = 10, 26 + math.sin(t * 0.5) * 6
    ball(im, hx, hy, 8, "flesh")
    ring(im, hx, hy, 4, OUT, 2)
    for k in range(6):
        ang = k * math.pi / 3 + t * 0.3
        put(im, int(hx + math.cos(ang) * 3), int(hy + math.sin(ang) * 3), RAMP["bone"][2])
    eye(im, hx + 3, hy - 6, 1.5)


def deceiver(im, t, ramp="purple", horns=False):
    dy = bob(t)
    poly(im, [(24, 8 + dy), (10, 42), (38, 42)], RAMP[ramp][0])
    poly(im, [(24, 8 + dy), (14, 40), (34, 40)], RAMP[ramp][1])
    poly(im, [(24, 10 + dy), (19, 30), (24, 38)], RAMP[ramp][2])
    ball(im, 24, 16 + dy, 6, "bone")
    # mask with a false smile
    rect(im, 20, 19 + dy, 28, 19 + dy, OUT)
    put(im, 19, 18 + dy, OUT)
    put(im, 29, 18 + dy, OUT)
    eye(im, 21, 14 + dy, 1.2, (1 if t % 2 else 0, 0))
    eye(im, 27, 14 + dy, 1.2, (1 if t % 2 else 0, 0))
    for side in (-1, 1):
        line(im, 24 + side * 8, 26 + dy, 24 + side * (15 + t % 2), 32 + dy, RAMP[ramp][1], 2)
        disc(im, 24 + side * (15 + t % 2), 33 + dy, 2, RAMP["bone"][1])
    if horns:
        for side in (-1, 1):
            poly(im, [(24 + side * 4, 11 + dy), (24 + side * 10, 3 + dy), (24 + side * 7, 12 + dy)], RAMP["red"][1])


def irate_eye(im, t):
    dy = [0, -3, -4, -2][t]
    ball(im, 24, 24 + dy, 15, "bone")
    for k in range(7):
        a = k * 0.9
        line(im, 24 + math.cos(a) * 14, 24 + dy + math.sin(a) * 14, 24 + math.cos(a) * 8, 24 + dy + math.sin(a) * 8, RAMP["red"][1])
    ball(im, 26, 25 + dy, 7, "magenta")
    disc(im, 27, 25 + dy, 3, OUT)
    put(im, 25, 23 + dy, WHITE)
    # angry brow
    line(im, 12, 10 + dy, 32, 15 + dy, RAMP["red"][0], 3)


def chaotic_wreckage(im, t):
    dy = bob(t)
    ball(im, 24, 25 + dy, 17, "flesh")
    for k in range(9):
        a = k * 0.7 + t * 0.15
        r = 12 + (k % 3)
        disc(im, 24 + math.cos(a) * r, 25 + dy + math.sin(a) * r, 3 + k % 2, RAMP["flesh"][0 if k % 2 else 2])
    for x, y in ((18, 20), (30, 22), (24, 31)):
        eye(im, x, y + dy, 2, (1, 0) if t % 2 else (0, 1))
    line(im, 14, 34 + dy, 34, 36 + dy, RAMP["blood"][0], 2)


def spider_egg(im, t):
    pulse = [0, 1, 2, 1][t]
    eball(im, 24, 27, 14 + pulse, 16 + pulse, RAMP["poison"])
    for k in range(5):
        a = k * 1.3
        disc(im, 24 + math.cos(a) * 8, 27 + math.sin(a) * 9, 3, RAMP["slime"][2])
        disc(im, 24 + math.cos(a) * 8, 27 + math.sin(a) * 9, 1.5, OUT)
    for k in range(4):
        line(im, 10 + k * 9, 12, 12 + k * 8, 20, RAMP["bone"][1])
    disc(im, 24, 27, 4, EYE[1])
    disc(im, 24, 27, 2, OUT)


# ---------------------------------------------------------------- chapter 2
def hatcher(im, t):
    dy = bob(t)
    eball(im, 24, 30 + dy, 18, 13, RAMP["rust"])
    for k in range(5):
        x = 10 + k * 7
        h = 6 + (k + t) % 3
        eball(im, x, 18 + dy - h / 2, 3, h / 2 + 1, RAMP["flesh"])
        disc(im, x, 14 + dy - h / 2, 1.5, EYE[1])
    rect(im, 14, 34 + dy, 34, 37 + dy, OUT)
    for x in range(15, 34, 3):
        put(im, x, 34 + dy, RAMP["bone"][2])
    eye(im, 18, 27 + dy, 2)
    eye(im, 30, 27 + dy, 2)


def master_mind(im, t):
    dy = bob(t)
    ball(im, 24, 18 + dy, 13, "pink")
    for k in range(5):
        line(im, 14 + k * 5, 10 + dy, 15 + k * 5, 22 + dy, RAMP["pink"][0])
    for k in range(6):
        a = k * math.pi / 3 + t * 0.4
        x = 24 + math.cos(a) * 18
        y = 26 + math.sin(a) * 10
        disc(im, x, y, 2, RAMP["cyan"][1] if k % 2 else EYE[1])
    poly(im, [(16, 28 + dy), (32, 28 + dy), (28, 42 + dy), (20, 42 + dy)], RAMP["purple"][1])
    eye(im, 19, 22 + dy, 1.5)
    eye(im, 29, 22 + dy, 1.5)


def cage(im, t):
    rect(im, 8, 8, 40, 42, RAMP["stone"][0])
    rect(im, 10, 10, 38, 40, hexc("140f24"))
    # spirit
    dy = bob(t, 2)
    ball(im, 24, 24 + dy, 7, "void")
    eye(im, 21, 23 + dy, 1.2)
    eye(im, 27, 23 + dy, 1.2)
    for x in range(10, 40, 6):
        rect(im, x, 8, x + 1, 42, RAMP["grey"][1])
        put(im, x, 8, RAMP["grey"][2])
    rect(im, 6, 6, 42, 9, RAMP["rust"][1])
    rect(im, 6, 41, 42, 44, RAMP["rust"][0])
    for x in (6, 42):
        rect(im, x - 1, 5, x, 45, RAMP["rust"][0])


def deceiver2(im, t):
    deceiver(im, t, "red", horns=True)


# ---------------------------------------------------------------- chapter 3
def void_imp(im, t):
    dy = bob(t, 2)
    for side in (-1, 1):
        poly(im, [(24 + side * 6, 20 + dy), (24 + side * (21 - t % 2), 8 + dy), (24 + side * 18, 28 + dy)], RAMP["void"][0])
    ball(im, 24, 26 + dy, 11, "void")
    for side in (-1, 1):
        poly(im, [(24 + side * 5, 17 + dy), (24 + side * 9, 7 + dy), (24 + side * 9, 18 + dy)], RAMP["void"][2])
    eye(im, 20, 24 + dy, 2)
    eye(im, 28, 24 + dy, 2)
    rect(im, 19, 31 + dy, 29, 32 + dy, OUT)
    for x in (20, 23, 26):
        put(im, x, 33 + dy, WHITE)
    line(im, 24, 37 + dy, 24 + [2, 4, 2, 0][t], 45, RAMP["void"][1], 2)


def all_seeing_eye(im, t):
    ball(im, 24, 24, 13, "void")
    for k in range(8):
        a = k * math.pi / 4 + t * 0.2
        x = 24 + math.cos(a) * 18
        y = 24 + math.sin(a) * 18
        line(im, 24 + math.cos(a) * 12, 24 + math.sin(a) * 12, x, y, RAMP["purple"][0])
        eye(im, x, y, 2, (1 if t % 2 else -1, 0))
    ball(im, 24, 24, 8, "bone")
    disc(im, 24 + [0, 2, 0, -2][t], 24, 4, EYE[1])
    disc(im, 24 + [0, 2, 0, -2][t], 24, 2, OUT)


def indescribable(im, t):
    for k in range(6):
        base = 8 + k * 6.5
        sway = math.sin(t * math.pi / 2 + k) * 3
        line(im, base, 44, base + sway, 30, RAMP["purple"][0], 3)
        disc(im, base + sway, 30, 2, RAMP["purple"][1])
    ball(im, 24, 22, 14, "purple")
    for k in range(5):
        a = k * 1.25
        eye(im, 24 + math.cos(a) * 7, 21 + math.sin(a) * 6, 2 if k else 3, (1, 0) if t % 2 else (0, 1))
    rect(im, 18, 31, 30, 33, OUT)
    for x in range(19, 30, 2):
        put(im, x, 31, WHITE)


# ---------------------------------------------------------------- chapter 4
def skeletal_centaur(im, t):
    step = [0, 1, 0, -1][t]
    rect(im, 12, 28, 38, 33, RAMP["bone"][0])
    for i, x in enumerate((14, 20, 30, 36)):
        o = step if i % 2 else -step
        line(im, x, 32, x + o, 44, RAMP["bone"][1], 2)
    for x in range(14, 38, 3):
        line(im, x, 28, x, 33, RAMP["bone"][2])
    rect(im, 26, 12, 31, 30, RAMP["bone"][1])
    for y in range(14, 28, 3):
        line(im, 24, y, 33, y, RAMP["bone"][2])
    ball(im, 29, 9, 5, "bone")
    eye(im, 28, 9, 1.2)
    eye(im, 31, 9, 1.2)
    # scythe arm
    line(im, 32, 16, 42, 4 + step, RAMP["grey"][1], 2)
    poly(im, [(42, 4 + step), (46, 10 + step), (38, 6 + step)], RAMP["cyan"][2])


def abyssal_lord(im, t):
    for k in range(5):
        x = 8 + k * 8
        sway = math.sin(t * math.pi / 2 + k * 1.3) * 3
        line(im, x, 46, x + sway, 30, RAMP["teal"][0], 3)
    eball(im, 24, 22, 17, 14, RAMP["teal"])
    for k in range(4):
        disc(im, 12 + k * 8, 30, 2, RAMP["teal"][2])
    # jaw
    poly(im, [(12, 26), (36, 26), (32, 34), (16, 34)], OUT)
    for x in range(14, 34, 3):
        poly(im, [(x, 26), (x + 2, 26), (x + 1, 29)], WHITE)
    eye(im, 17, 17, 2.5)
    eye(im, 31, 17, 2.5)
    for side in (-1, 1):
        poly(im, [(24 + side * 12, 10), (24 + side * 20, 2), (24 + side * 16, 12)], RAMP["bone"][1])


# ---------------------------------------------------------------- finale / easter egg
def demon_lord(im, t, phase):
    dy = bob(t)
    ramp = ["red", "flesh", "void"][phase]
    for side in (-1, 1):
        poly(im, [(24 + side * 6, 18 + dy), (24 + side * 22, 6 + dy + phase * 2), (24 + side * 18, 30 + dy)], RAMP[ramp][0])
    poly(im, [(24, 12 + dy), (12, 44), (36, 44)], RAMP[ramp][1])
    ball(im, 24, 16 + dy, 7, ramp)
    for side in (-1, 1):
        poly(im, [(24 + side * 4, 11 + dy), (24 + side * 9, 1 + dy), (24 + side * 8, 12 + dy)], RAMP["bone"][2])
    eye(im, 21, 15 + dy, 1.5)
    eye(im, 27, 15 + dy, 1.5)
    if phase >= 1:
        ring(im, 24, 28 + dy, 8, RAMP["gold"][1])
    if phase >= 2:
        for k in range(6):
            a = k * math.pi / 3 + t * 0.4
            disc(im, 24 + math.cos(a) * 16, 28 + math.sin(a) * 16, 2, EYE[1])


def author(im, t, glasses=False):
    """A smug grinning mask on a little cloak — the 'author' easter-egg boss."""
    dy = bob(t)
    poly(im, [(24, 20 + dy), (10, 44), (38, 44)], RAMP["slate"][1])
    ball(im, 24, 20 + dy, 15, "bone")
    # grin
    poly(im, [(12, 22 + dy), (36, 22 + dy), (30, 31 + dy), (18, 31 + dy)], OUT)
    for x in range(14, 34, 3):
        rect(im, x, 23 + dy, x + 1, 24 + dy, WHITE)
    # squint eyes + brows
    line(im, 15, 14 + dy, 21, 16 + dy, OUT, 2)
    line(im, 27, 16 + dy, 33, 14 + dy, OUT, 2)
    put(im, 18, 17 + dy, EYE[1])
    put(im, 30, 17 + dy, EYE[1])
    if glasses:
        ring(im, 18, 16 + dy, 4, OUT)
        ring(im, 30, 16 + dy, 4, OUT)
        line(im, 22, 16 + dy, 26, 16 + dy, OUT)
    ellipse(im, 12, 22 + dy, 2, 1, RAMP["pink"][1])
    ellipse(im, 36, 22 + dy, 2, 1, RAMP["pink"][1])


BOSSES = {
    "giant_spider": giant_spider,
    "wandering_worm": wandering_worm,
    "deceiver": lambda im, t: deceiver(im, t),
    "irate_eye": irate_eye,
    "chaotic_wreckage": chaotic_wreckage,
    "spider_egg": spider_egg,
    "deceiver2": deceiver2,
    "hatcher": hatcher,
    "master_mind": master_mind,
    "cage": cage,
    "void_imp": void_imp,
    "all_seeing_eye": all_seeing_eye,
    "indescribable": indescribable,
    "skeletal_centaur": skeletal_centaur,
    "abyssal_lord": abyssal_lord,
    "demon_lord_p1": lambda im, t: demon_lord(im, t, 0),
    "demon_lord_p2": lambda im, t: demon_lord(im, t, 1),
    "demon_lord_p3": lambda im, t: demon_lord(im, t, 2),
    "producer": lambda im, t: author(im, t, glasses=True),
    "author": author,
}


def frame(fn, t):
    im = new(S, S)
    fn(im, t)
    # keep a 2px margin for the outline/glow
    crop = new(S, S)
    crop.paste(im.crop((2, 2, S - 2, S - 2)), (2, 2))
    return outline(crop)


def build():
    for name, fn in BOSSES.items():
        frames = [frame(fn, t) for t in range(4)]
        group = f"bosses/boss_{name}"
        save_anim(group, frames, fps=8, loop=True, alias_size=(50, 50) if name in LEGACY else None)
        save(silhouette(frames[0]), f"{group}_hit.png")
        warn = glow(glow(frames[0], hexc("7f1d1d"), 1), RED_GLOW, 1)
        ring(warn, 24, 24, 23, RED_GLOW)
        save(warn, f"{group}_telegraph.png")
