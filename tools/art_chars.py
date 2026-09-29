"""Characters: player (24x24), NPCs (16x20), chapter enemies (16x16).

Sprites are ASCII maps; outline added by art_core.outline(). Frames are derived
by moving parts (head/body/feet), swapping limb maps and palette pulses.
"""
from art_core import (RAMP, hexc, new, ascii_img, outline, pad, shift, silhouette,
                      recolor, alpha_mul, over, save, save_anim, OUT, WHITE, MAGENTA,
                      squash, flip_h, disc, rotate90)

EYE_HOSTILE = MAGENTA
EYE_RED = hexc("ef4444")

# ============================================================== PLAYER
PL = {
    # hood / robe: deep indigo ramp
    "B": hexc("1b1f4a"), "b": hexc("2f3a8f"), "h": hexc("5a6fd6"),
    "D": hexc("0f1030"),                       # darkness inside hood
    "s": hexc("fcd9a8"), "S": hexc("c98a5e"),  # skin
    "e": hexc("0a0a10"), "w": WHITE,
    "c": hexc("22d3ee"), "C": hexc("0e7490"),  # cyan trim / sash
    "f": hexc("4a2f1d"), "F": hexc("2a1a10"),  # boots
    "g": hexc("cffafe"),                       # glow
}

P_HEAD = [
    "....BBh.......",
    "...Bbbhh......",
    "..Bbbbbhhh....",
    ".Bbbbbbbbbhh..",
    ".Bbbbbbbbbbbh.",
    "Bbbbbbbbbbbbbh",
    "BbbbbbDDDDDDbb",
    "BbbbbDssssssDb",
    "BbbbbDsewsewsb",
    "BbbbbDssssssSb",
    ".BbbbbDSSSSDb.",
    "..BBbbbbbbbb..",
]
# torso, 12 wide, attaches below head
P_BODY = [
    "..Bccccccc..",
    ".Bbbbbbbbbh.",
    ".Bbbbbbbbbhs",
    "BbbbbbbbbbbS",
    "Bbbbbbbbbbbh",
    "BBbbbbbbbbbh",
    "BCcccccccccc",
]
P_BODY_CAST = [
    "..Bccccccc....",
    ".Bbbbbbbbbbhh.",
    ".Bbbbbbbbbbbss",
    "Bbbbbbbbbbb.SS",
    "Bbbbbbbbbbbh..",
    "BBbbbbbbbbbh..",
    "BCcccccccccc..",
]
P_FOOT = ["ff", "FF"]


def _pl_img(head_dy=0, body_dy=0, feet=((0, 0), (0, 0)), cast=False, face=None,
            glow=0, tilt_tip=False):
    """Compose player on 24x24. feet = ((dx,lift) back foot, (dx,lift) front foot)."""
    im = new(24, 24)
    base_y = 22            # feet occupy rows 20-21, outline row 22
    # feet
    for i, (dx, lift) in enumerate(feet):
        fx = (8 if i == 0 else 12) + dx
        f = ascii_img(P_FOOT, PL)
        im.alpha_composite(f, (fx, base_y - 1 - lift))
    head_rows = list(P_HEAD)
    if face == "hurt":
        head_rows[8] = "BbbbbDsxssxs" + "Sb"
    if tilt_tip:
        head_rows[0] = "...BBh........"
        head_rows[1] = "..Bbbhh......."
    head = ascii_img(head_rows, dict(PL, x=hexc("0a0a10")))
    by = base_y - 1 - len(P_BODY) + body_dy
    im.alpha_composite(head, (5, by - len(P_HEAD) + head_dy))
    body = ascii_img(P_BODY_CAST if cast else P_BODY, PL)
    im.alpha_composite(body, (6, by))
    if glow:
        # cyan spark in front of the hand
        hx, hy = 19, by + 2
        g = hexc("22d3ee") if glow == 1 else hexc("cffafe")
        for (x, y) in [(hx + 1, hy), (hx + 2, hy - 1), (hx + 2, hy + 1), (hx + 3, hy)]:
            if glow == 2 or (x, y) != (hx + 3, hy):
                im.putpixel((min(23, x), y), g)
        im.putpixel((min(23, hx + 2), hy), WHITE)
    return outline(im)


def player():
    # breathing: settle down 1px, hood tip sways
    idle = [_pl_img(), _pl_img(head_dy=1), _pl_img(head_dy=1, body_dy=1, tilt_tip=True), _pl_img(head_dy=1)]
    save_anim("player/player_idle", idle, fps=6, loop=True, alias_size=(26, 26))
    walk_feet = [
        ((-2, 0), (2, 0)),
        ((-1, 1), (1, 0)),
        ((1, 1), (-1, 0)),
        ((2, 0), (-2, 0)),
        ((1, 0), (-1, 1)),
        ((-1, 0), (1, 1)),
    ]
    walk = []
    for i, ft in enumerate(walk_feet):
        up = -1 if i in (1, 2, 4, 5) else 0
        walk.append(_pl_img(head_dy=0, body_dy=up, feet=ft, tilt_tip=i in (2, 5)))
    save_anim("player/player_walk", walk, fps=12, loop=True)
    cast = [_pl_img(cast=True, glow=1), _pl_img(cast=True, glow=2), _pl_img(cast=True, head_dy=1)]
    save_anim("player/player_cast", cast, fps=10, loop=False, alias_size=(26, 26))
    hurt = _pl_img(face="hurt", head_dy=1, feet=((-1, 0), (1, 1)))
    hurt = recolor(hurt, {PL["b"]: hexc("b8405e"), PL["h"]: hexc("f08aa0"), PL["B"]: hexc("5a1530")})
    save(hurt, "player/player_hurt.png")
    # death: collapse into a robe pile, soul rises
    d0 = _pl_img(face="hurt", head_dy=1)
    d1 = _pl_img(face="hurt", head_dy=3, body_dy=1)
    d2 = squash(_pl_img(face="hurt", head_dy=3, body_dy=2), 5)
    pile = ascii_img([
        "......BBh.......",
        "....Bbbbbhh.....",
        "..BbbbbbbbbhC...",
        ".BbbbbbbbbbbbCh.",
        "BBBbbbbbbbbbbbbb",
    ], PL)
    def pile_frame(soul_y, fade):
        im = new(24, 24)
        im.alpha_composite(pile, (4, 16))
        im = outline(im)
        if soul_y is not None:
            s = ascii_img([".c.", "cgc", "cgc", ".c."], PL)
            s = outline(s.resize((3, 4)) if False else pad(s, 5, 6))
            im.alpha_composite(alpha_mul(s, fade), (10, soul_y))
        return im
    death = [d0, d1, d2, pile_frame(None, 1), pile_frame(10, 1.0), pile_frame(5, 0.5)]
    save_anim("player/player_death", death, fps=10, loop=False)
    # legacy walk stills (26x26 padded)
    save(pad(walk[0], 26, 26), "player/player_walk1.png")
    save(pad(walk[3], 26, 26), "player/player_walk2.png")
    ghost = recolor(silhouette(idle[0], hexc("22d3ee")), {})
    ghost = alpha_mul(ghost, 0.45)
    save(ghost, "player/dash_ghost.png")

# ============================================================== NPCS (16x20)
def _ramp3(chars, name):
    sh, b, hi = RAMP[name] if isinstance(name, str) else name
    return {chars[0]: sh, chars[1]: b, chars[2]: hi}


NPC_FACE = [
    "..AasssssssA..",
    "..Assssssssa..",
    "..Asewssewsa..",
    "..Assssssssa..",
    "...AssSSssA...",
]
NPC_BODY = [
    "....ssssss....",
    "...QqqqqqqqK..",
    "..QqqqqqqqqqK.",
    ".sQqqqkkqqqqKs",
    "..QqqqqqqqqqK.",
    "..QQqqqqqqqKK.",
    "..QQQqqqqqKKK.",
    "...ff....ff...",
]
NPCS = {
    # name: (hair ramp, cloth ramp, accent ramp, top rows, face mods, body mods)
    "vivian": dict(hair=("2a1b3d", "4a2f6b", "7c5aa6"), cloth="blue", acc="cyan", top=[
        ".......BBh....",
        "......Bbbbh...",
        ".....Bbbbbh...",
        "....BbbbccbH..",
        "..BBBBbbbbbbbH",
        "..AaaaaaaaaaA.",
    ], alt_top={0: "........BBh...", 1: ".......Bbbh..."}),
    "gina": dict(hair=("5b3a1e", "8b5a2b", "c08a4f"), cloth="green", acc="gold", top=[
        "..............",
        "....GggggggH..",
        "...GggggggggH.",
        "..AaaaaaaaaaAa",
        "..AaaaaaaaaaAaa",
        "..Aaaaaaaaaaa.a",
    ], face_extra={0: "..AasssssssAaa", 1: "..Assssssssa.a"}, alt_top={4: "..AaaaaaaaaaAa.", 5: "..Aaaaaaaaaaaaa"}),
    "lyon": dict(hair=("78716c", "d6d3d1", "fafaf9"), cloth="grey", acc="rust", skin=True, top=[
        "..............",
        "..............",
        ".....sssss....",
        "....ssssssss..",
        "...sssssssssS.",
        "..aAsssssssAa.",
    ], face=[
        "..aassssssssa.",
        "..asssssssssa.",
        "..asewssewssa.",
        "..aaaaaaaaaaa.",
        "...aaaaaaaaa..",
    ], body_extra={0: "....aaaaaa....", 1: "...QqaaaaqqqK.", 2: "..QqqqaaqqqqK."}),
    "lilian": dict(hair=("4c1d95", "8b5cf6", "c4b5fd"), cloth="pink", acc="void", top=[
        "..............",
        "....AaaaaaA...",
        "...Aaayyaaaa..",
        "..Aaaaaaaaaaa.",
        "..Aaaaaaaaaaa.",
        ".AaAaaaaaaaAaA",
    ], hair_sides=True),
    "leah": dict(hair=("9d174d", "ec4899", "fbcfe8"), cloth=("7c2d57", "d9467e", "fba4c8"), acc="gold", top=[
        ".AA........AA.",
        "AaaA.gggg.Aaa.",
        "AaaAggyggAaaA.",
        ".AAaaaaaaaAA..",
        "..Aaaaaaaaaaa.",
        "..AaaaaaaaaaA.",
    ]),
    "trainer": dict(hair=("3b2410", "6b4423", "a0703f"), cloth="gold", acc="red", skin_ramp=("9a5b32", "d9955f", "f1c08e"), top=[
        "..a.a..a.a....",
        "..aaaaaaaaa...",
        "..Aaaaaaaaaa..",
        "..Aaaaaaaaaaa.",
        "..GGGGGGGGGGG.",
        "..Aaaaaaaaaaa.",
    ], body_extra={1: "...sQqqqqqKs..", 3: "ssQqqqkkqqqqKs"}),
    "nimiao": dict(hair=("9a3412", "f97316", "fdba74"), cloth="teal", acc="gold", top=[
        "..A.......A...",
        "..aA.....Aa...",
        "..ayA...Aya...",
        "..aaaaaaaaaA..",
        "..Aaaaaaaaaaa.",
        "..Aaaaaaaaaaa.",
    ], cat_eyes=True, tail=True),
}


def npc_frames(name, d):
    hr = d["hair"]
    pal = {
        "A": hexc(hr[0]), "a": hexc(hr[1]), "y": hexc(hr[2]),
        "e": OUT, "w": WHITE, "f": hexc("2a1a10"),
    }
    sk = d.get("skin_ramp")
    pal.update(_ramp3("Ss_", (hexc(sk[0]), hexc(sk[1]), hexc(sk[2]))) if sk else {"S": RAMP["skin"][0], "s": RAMP["skin"][1]})
    pal.update(_ramp3("QqK", d["cloth"] if isinstance(d["cloth"], str) else tuple(hexc(c) for c in d["cloth"])))
    # Q = soft highlight (left), K = shadow (right)
    q_sh, q_b, q_hi = pal["Q"], pal["q"], pal["K"]
    pal["Q"] = tuple(int(q_b[i] * 0.6 + q_hi[i] * 0.4) for i in range(3)) + (255,)
    pal["K"] = q_sh
    pal.update(_ramp3("kGg", d["acc"]))
    pal.update({"B": RAMP[d["cloth"]][0] if isinstance(d["cloth"], str) else hexc(d["cloth"][0]),
                "b": q_b, "h": q_hi, "H": OUT, "c": RAMP[d["acc"]][1]})
    face = list(d.get("face", NPC_FACE))
    for k, v in d.get("face_extra", {}).items():
        face[k] = v
    if d.get("cat_eyes"):
        face[2] = "..AsGwssGwsa.."
    body = list(NPC_BODY)
    for k, v in d.get("body_extra", {}).items():
        body[k] = v

    def frame(dy, blink, alt):
        top = list(d["top"])
        if alt:
            for k, v in d.get("alt_top", {}).items():
                top[k] = v
        f = list(face)
        if blink:
            f[2] = f[2].replace("e", "S").replace("w", "S").replace("G", "S")
        head_rows = top + f
        im = new(16, 20)
        b = ascii_img(body, pal)
        im.alpha_composite(b, (1, 11))
        if d.get("hair_sides"):
            # long hair falling behind shoulders
            side = ascii_img(["Aa", "Aa", "aA" if alt else "Aa", "A."], pal)
            im.alpha_composite(side, (2, 11 + dy))
            im.alpha_composite(flip_h(side), (12, 11 + dy))
        if d.get("tail"):
            tail = ascii_img(["..a", ".a.", "a.."] if alt else ["a..", ".a.", ".aa"], pal)
            im.alpha_composite(tail, (12, 14))
        h = ascii_img(head_rows, pal)
        im.alpha_composite(h, (1, 1 + dy))
        return outline(im)

    return [frame(0, False, False), frame(1, False, False), frame(1, False, True), frame(0, True, False)]


def npcs():
    for name in sorted(NPCS):
        fr = npc_frames(name, NPCS[name])
        legacy = name != "nimiao"
        save_anim(f"npcs/{name}", fr, fps=6, loop=True, alias_size=(18, 22) if legacy else None)


# ============================================================== ENEMIES (16x16)
def R3(chars, sh, b, hi):
    return {chars[0]: hexc(sh), chars[1]: hexc(b), chars[2]: hexc(hi)}


def RR(chars, name):
    sh, b, hi = RAMP[name]
    return {chars[0]: sh, chars[1]: b, chars[2]: hi}


EYES = {"e": MAGENTA, "E": hexc("ff7ad9"), "r": EYE_RED, "w": WHITE, "p": OUT, "k": OUT}
BOB = [0, -1, -1, 0]

# Each enemy: pal, maps {key: rows}, seq [(key, dx, dy)], optional pulse {char: [c per frame]}
ENEMIES = {}


def enemy(ch, name, pal, maps, seq, pulse=None):
    ENEMIES[(ch, name)] = dict(pal=dict(EYES, **pal), maps=maps, seq=seq, pulse=pulse or {})


# ---------------- ch1: forest (browns / mossy greens)
SPIDER_A = [
    "..............",
    ".....Dddh.....",
    "....Dddddh....",
    "L..Dddhdddh..L",
    ".L.DddddddhL..",
    "..LDdeddeddL..",
    "LLLDDddddddLLL",
    "...LDDddddL...",
    "..L..DDDD..L..",
    ".L.L......L.L.",
    "L..........L..",
]
SPIDER_B = [
    "..............",
    ".....Dddh.....",
    "....Dddddh....",
    "...Dddhdddh...",
    "LL.DddddddhLL.",
    "..LDdeddeddL..",
    ".LLDDddddddLL.",
    "L..LDDddddL..L",
    "..L..DDDD..L..",
    "..L.......L...",
    ".L.........L..",
]
enemy("ch1", "spider", dict(R3("Ddh", "3b2410", "6b4423", "a0703f"), L=hexc("2a1a10")),
      {"A": SPIDER_A, "B": SPIDER_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])
enemy("ch1", "spider_red", dict(R3("Ddh", "5b0a0a", "b91c1c", "f87171"), L=hexc("3b0a0a"), e=hexc("fde047")),
      {"A": SPIDER_A, "B": SPIDER_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])
WORM = [
    ".........DDdh.",
    "..Ddh.DdhDdddh",
    ".DdddDdddDdedh",
    ".DdddDdddDdddh",
    ".DDddDDddDDddk",
    "..DD..DD..DDD.",
]
enemy("ch1", "worm", dict(R3("Ddh", "4d6b1f", "84a83a", "d4e89a")), {"A": WORM},
      [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)], pulse={"wave": (4, 2)})
EYE_SMALL_A = [
    "..............",
    ".....MMmm.....",
    "mn..MwwwwM..nm",
    "mmnMwwwwwwMnmm",
    ".mmMwweewwMmm.",
    "..mMwepewwM...",
    "...MwweewwM...",
    "....MwwwwM....",
    ".....MMMM.....",
]
EYE_SMALL_B = [
    "..............",
    ".....MMmm.....",
    "....MwwwwM....",
    "...MwwwwwwM...",
    "..nMwweewwMn..",
    ".mmMwepewwMmm.",
    "mmmMwweewwMmmm",
    "mm..MwwwwM..mm",
    ".....MMMM.....",
]
enemy("ch1", "eye_small", dict(R3("Mmn", "2f5a2a", "4f8a3c", "9fd07a"), w=hexc("f5f5f4")),
      {"A": EYE_SMALL_A, "B": EYE_SMALL_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, -1), ("B", 0, 0)])
EGG_A = [
    "....Dddh....",
    "...Dddhhh...",
    "..Dddddhhh..",
    "..Dddmdddh..",
    ".Ddmddddddh.",
    ".Ddddddmddh.",
    ".DdddkdddDd.",
    ".DddkekddDd.",
    "..DddkdDDd..",
    "...DDDDDD...",
]
enemy("ch1", "egg", dict(R3("Ddh", "5f7a45", "a7c48a", "e6f4d6"), m=hexc("5f7a45")),
      {"A": EGG_A}, [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)],
      pulse={"e": [MAGENTA, hexc("ff7ad9"), WHITE, hexc("ff7ad9")], "squash": [0, 0, 1, 0]})
SLIME = [
    "......hh......",
    "....Dddhhh....",
    "...Ddddddhh...",
    "..Dddddddddh..",
    ".Dddwddwdddh..",
    ".Dddeddeddddh.",
    ".DDdddddddddd.",
    "DDDDDDDDDDDDDD",
]
enemy("ch1", "slime", R3("Ddh", "3f7a1c", "74c13a", "c8f28a"), {"A": SLIME},
      [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)], pulse={"squash": [0, 1, 2, 1]})
FLY_A = [
    "..gg....gg....",
    ".gGGg..gGGg...",
    ".gGGGggGGGg...",
    "..gGGDdGGg....",
    "....DdddhD....",
    "...DdeddedD...",
    "...DddddddD...",
    "....DDddDD....",
    ".....k..k.....",
]
FLY_B = [
    "..............",
    "..............",
    "..............",
    "gggGGDdGGggg..",
    "gGGGDdddhDGGg.",
    ".gGDdeddedDGg.",
    "..gDddddddDg..",
    "....DDddDD....",
    ".....k..k.....",
]
enemy("ch1", "fly", dict(R3("Ddh", "1c2a1c", "2f4a2f", "5a7a4a"), g=hexc("cfe8e2"), G=hexc("8fb8b0")),
      {"A": FLY_A, "B": FLY_B}, [("A", 0, 0), ("B", 0, 0), ("A", 0, -1), ("B", 0, -1)])
MUSH_A = [
    "....MMmmnn....",
    "..MMmmwwmmnn..",
    ".MmmmmwwmmmwnM",
    "MmwwmmmmmmwwmM",
    "MMmmmmmmmmmmMM",
    ".MMMMMMMMMMMM.",
    "...Dddddddh...",
    "...Ddeddedh...",
    "...Dddddddh...",
    "...DDdddddh...",
    "...LL....LL...",
]
MUSH_B = list(MUSH_A[:10]) + ["....LL..LL...."]
enemy("ch1", "mushroom", dict(R3("Mmn", "7c2d12", "b45309", "f59e0b"), **R3("Ddh", "a8a29e", "e7dcc8", "fffbeb"),
                              w=hexc("fef3c7"), L=hexc("3b2410")),
      {"A": MUSH_A, "B": MUSH_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])

# ---------------- ch2: purgatory (stone greys / rust)
DECEIVER_A = [
    ".....MMmm.....",
    "....Mmmmmn....",
    "...MmwwwwwmM..",
    "...MwpwwpwmM..",
    "...MwwwwwwmM..",
    "...MwwkkkwmM..",
    "..MmMwwwwMmnM.",
    "..MmmMMMMmmnM.",
    ".MmmmmmmmmmmnM",
    ".MmmmmmmmmmmnM",
    ".MMmmmmmmmmMM.",
    "..M.M.M.M.M...",
]
DECEIVER_B = DECEIVER_A[:11] + ["...M.M.M.M.M.."]
enemy("ch2", "deceiver", dict(R3("Mmn", "4a1d0e", "8a3a1a", "c2410c"), w=hexc("e7e5e4"), p=MAGENTA),
      {"A": DECEIVER_A, "B": DECEIVER_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, -1), ("B", 0, 0)])
HATCHER_A = [
    "......oooO....",
    ".....oOOOoO...",
    "....oOoOOoO...",
    "...DddoOOoOD..",
    "..DdddddddddD.",
    ".Ddedddddddhd.",
    ".DddddddddddD.",
    ".DkwkwkddddDD.",
    "..DDdddddDDD..",
    "..L.L....L.L..",
]
HATCHER_B = HATCHER_A[:9] + ["...L.L..L.L..."]
enemy("ch2", "hatcher", dict(R3("Ddh", "3f3f46", "71717a", "a1a1aa"), o=hexc("fdba74"), O=hexc("c2410c"),
                             L=hexc("27272a")),
      {"A": HATCHER_A, "B": HATCHER_B}, [("A", 0, 0), ("B", 0, 0), ("A", 0, -1), ("B", 0, -1)])
MIND_A = [
    "....pPPPPp....",
    "...pPpPPpPp...",
    "...pPPpPPPp...",
    "...DppppppD...",
    "...DdeddedD...",
    "....DddddD....",
    "...MmMMMMmM...",
    "..MmmmmmmmnM..",
    ".sMmmmmmmmnMs.",
    "..MmmmmmmmnM..",
    "..MMmmmmmmMM..",
    "...MMMMMMMM...",
]
enemy("ch2", "mind_mage", dict(R3("Ddh", "71717a", "d4d4d8", "fafafa"), **R3("Mmn", "44403c", "78716c", "a8a29e"),
                               P=hexc("f9a8d4"), p=hexc("be185d"), s=hexc("d4d4d8")),
      {"A": MIND_A}, [("A", 0, 0), ("A", 0, -1), ("A", 0, -2), ("A", 0, -1)],
      pulse={"P": [hexc("f9a8d4"), hexc("fbcfe8"), hexc("fdf2f8"), hexc("fbcfe8")]})
CAGE = [
    "......LL......",
    ".....L..L.....",
    "...LLLLLLLL...",
    "..LlllllllL...",
    "..L.l..l.lL...",
    "..L.lEEl.lL...",
    "..L.EeeE.lL...",
    "..L.EweE.lL...",
    "..L.lEEl.lL...",
    "..L.l..l.lL...",
    "..LLLLLLLLLL..",
    "...L......L...",
]
enemy("ch2", "cage", dict(L=hexc("7c2d12"), l=hexc("c2410c")), {"A": CAGE},
      [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)],
      pulse={"E": [hexc("86198f"), MAGENTA, hexc("ff7ad9"), MAGENTA], "e": [MAGENTA, hexc("ff7ad9"), WHITE, hexc("ff7ad9")],
             "swing": [0, 1, 0, -1]})
PHANTOM_A = [
    "....Dddhh.....",
    "...Ddddhhh....",
    "..Ddddddhhh...",
    "..Ddpddpdhh...",
    "..Ddeddeddh...",
    "..DddddddddM..",
    ".MDdddkdddhmM.",
    "MmDddddddddmM.",
    ".MDDdddddddM..",
    "..DDdddddDd...",
    "..D.DdD.Dd....",
    "......D..D....",
]
PHANTOM_B = PHANTOM_A[:10] + ["...DdD.DdD....", "...D....D....."]
enemy("ch2", "phantom", dict(R3("Ddh", "9ca3af", "d1d5db", "f9fafb"), M=hexc("7c2d12"), m=hexc("c2410c"), p=MAGENTA, e=hexc("86198f")),
      {"A": PHANTOM_A, "B": PHANTOM_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, -2), ("B", 0, -1)])
ASPIDER_A = [
    "..............",
    "....MMmmnn....",
    "...MDddhdhnn..",
    "L.MDddhhddhnM.",
    ".LMDddddddhnM.",
    "..MDeddeddhML.",
    "LLLMDDddddMLLL",
    "...LMMMMMMmL..",
    "..L.......L...",
    ".L.L.....L.L..",
    "L..........L..",
]
ASPIDER_B = [
    "..............",
    "....MMmmnn....",
    "...MDddhdhnn..",
    "..MDddhhddhnM.",
    "LLMDddddddhnLL",
    "..MDeddeddhML.",
    ".LLMDDddddMLL.",
    "L..LMMMMMMmL.L",
    "..L.......L...",
    "..L.......L...",
    ".L.........L..",
]
enemy("ch2", "armor_spider", dict(R3("Ddh", "3f3f46", "71717a", "a1a1aa"), **R3("Mmn", "44150a", "9a3412", "ea580c"), L=hexc("27272a")),
      {"A": ASPIDER_A, "B": ASPIDER_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])
BAT_A = [
    "..............",
    "M...D..D....M.",
    "Mm..DddD...mM.",
    "MmmMDedeDMmmM.",
    "MmmmDdddDmmmM.",
    ".MmmmDdDmmmM..",
    "..M.m.D.m.M...",
]
BAT_B = [
    "..............",
    "....D..D......",
    "....DddD......",
    "..MMDedeDMM...",
    ".MmmDdddDmmM..",
    "MmmmmDdDmmmmM.",
    "Mm.M.....M.mM.",
    "M...........M.",
]
enemy("ch2", "bat", dict(R3("Ddh", "27272a", "52525b", "a1a1aa"), **R3("Mmn", "44150a", "7c2d12", "c2410c"), e=EYE_RED),
      {"A": BAT_A, "B": BAT_B}, [("A", 0, 0), ("B", 0, 1), ("A", 0, 0), ("B", 0, 1)])

# ---------------- ch3: void (purples)
IMP_A = [
    "...h......h...",
    "...Dh....Dh...",
    "...DdDddDdh...",
    "..DdddddddhD..",
    "..DdeddeddhD..",
    "..DddkkkddhD..",
    "WWwDDddddDDwWW",
    ".WwwDddddDwwW.",
    "..W.DdddddD.W.",
    "....DDddDD....",
    "....D....D....",
]
IMP_B = [
    "...h......h...",
    "...Dh....Dh...",
    "...DdDddDdh...",
    "..DdddddddhD..",
    "..DdeddeddhD..",
    "W.DddkkkddhD.W",
    "WwwDDddddDDwwW",
    ".WwwDddddDwwW.",
    "....DdddddD...",
    "....DDddDD....",
    ".....D..D.....",
]
enemy("ch3", "void_imp", dict(R3("Ddh", "4c1d95", "8b5cf6", "c4b5fd"), W=hexc("1e1b4b"), w=hexc("3b2a7a"), e=hexc("fde047")),
      {"A": IMP_A, "B": IMP_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, -1), ("B", 0, 0)])
SEEING = [
    "....DDddhh....",
    "...Dddddhhh...",
    "..DdwwwwwwhD..",
    "..DwwEEEEwwD..",
    "..DwEeppeEwD..",
    "..DwEeppeEwD..",
    "..DwwEEEEwwD..",
    "..DDwwwwwwDD..",
    "...DDddddDD...",
    ".....DddD.....",
    "....T.DD.T....",
    "...T..TT..T...",
]
enemy("ch3", "seeing_eye", dict(R3("Ddh", "3b1470", "7c3aed", "c4b5fd"), w=hexc("ede9fe"), T=hexc("5b21b6"),
                                E=hexc("86198f")), {"A": SEEING},
      [("A", 0, 0), ("A", 0, -1), ("A", 0, -1), ("A", 0, 0)],
      pulse={"e": [MAGENTA, hexc("ff7ad9"), MAGENTA, hexc("c026d3")], "look": [0, 1, 0, -1]})
ABSORB_A = [
    "....DDddhh....",
    "..DDddddhhhh..",
    ".Ddddddddhhhh.",
    ".DddeddddeddD.",
    ".DddddgggdddD.",
    ".DDDDDDDDDDDD.",
    "..T.T..T..T...",
    "..T..T.T.T....",
    ".T...T..T.T...",
    ".T..T...T..T..",
]
ABSORB_B = ABSORB_A[:6] + [
    "...T.T.T.T....",
    "..T..T..T.T...",
    "..T.T..T...T..",
    "...T...T...T..",
]
enemy("ch3", "absorber_flyer", dict(R3("Ddh", "4c1d95", "a855f7", "e9d5ff"), T=hexc("7e22ce"), g=hexc("22d3ee")),
      {"A": ABSORB_A, "B": ABSORB_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, -2), ("B", 0, -1)],
      pulse={"g": [hexc("0e7490"), hexc("22d3ee"), hexc("cffafe"), hexc("22d3ee")]})
ARCHER_A = [
    "....DDdh....L.",
    "...DDdddh..L..",
    "..DDddddhh.L..",
    "..DDkkkkdh..L.",
    "..DDkekeddhsLe",
    "..DDDddddhs.L.",
    "..DDdddddh..L.",
    ".DDDdddddhhL..",
    ".DDDdddddddhL.",
    ".DDDDDDDDDDD..",
    "...ff...ff....",
]
ARCHER_B = list(ARCHER_A)
ARCHER_B[4] = "..DDkekeddhs.e"
ARCHER_B[3] = "..DDkkkkdh.L.."
ARCHER_B[5] = "..DDDddddhsL.."
ARCHER_B[1] = "...DDdddh...L."
enemy("ch3", "void_archer", dict(R3("Ddh", "2e1065", "6d28d9", "a78bfa"), L=hexc("a16207"), s=hexc("d6d3d1"), f=hexc("1e1b4b")),
      {"A": ARCHER_A, "B": ARCHER_B}, [("A", 0, 0), ("A", 0, -1), ("B", 0, -1), ("B", 0, 0)])
CENTI_A = [
    "..............",
    "..............",
    ".L.L.L.L.L.L..",
    "DdhDdhDdhDddh.",
    "DddDddDddDdedh",
    "DDdDDdDDdDDddh",
    ".L.L.L.L.L.LL.",
]
CENTI_B = [
    "..............",
    "..............",
    "L.L.L.L.L.L.L.",
    "DdhDdhDdhDddh.",
    "DddDddDddDdedh",
    "DDdDDdDDdDDddh",
    "L.L.L.L.L.L.L.",
]
enemy("ch3", "centipede", dict(R3("Ddh", "3b0764", "9333ea", "d8b4fe"), L=hexc("1e1b4b")),
      {"A": CENTI_A, "B": CENTI_B}, [("A", 0, 0), ("B", 0, 0), ("A", 0, 0), ("B", 0, 0)], pulse={"wave": (3, 1)})

# ---------------- ch4: abyss (teal / bone)
SKEL_A = [
    "....Dddh......",
    "...Ddddhh.....",
    "...DrddrdS....",
    "...DdkkddS....",
    "....DddD..S...",
    ".TT.DdhdD.S...",
    "TtttDdkdDDsS..",
    "TtetDddhdhS...",
    "TtttDDddD.....",
    ".TT.D...D.....",
    "....DD..DD....",
]
SKEL_B = list(SKEL_A)
SKEL_B[9] = ".TT..D.D......"
SKEL_B[10] = ".....DD.DD...."
enemy("ch4", "skeletal_warrior", dict(R3("Ddh", "a8a29e", "e7e5e4", "ffffff"), T=hexc("134e4a"), t=hexc("14b8a6"),
                                      e=hexc("99f6e4"), S=hexc("94a3b8"), s=hexc("e2e8f0")),
      {"A": SKEL_A, "B": SKEL_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])
TENT = [
    "........TT....",
    ".......Ttn....",
    "......Tt.T....",
    "......Ttn.....",
    ".....TtT......",
    ".....Tten.....",
    ".....TttT.....",
    "....TTtenT....",
    "....TTtttT....",
    "..MMTTtttTMM..",
    ".MmmmmmmmmmmM.",
    "..MMMMMMMMMM..",
]
enemy("ch4", "abyss_tentacle", dict(R3("Ttn", "134e4a", "14b8a6", "99f6e4"), M=hexc("0b2e2c"), m=hexc("134e4a")),
      {"A": TENT}, [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)], pulse={"sway": [0, 2, 0, -2]})
CENT_A = [
    "......Ddh.....",
    ".....DrdhS....",
    ".....DddD.S...",
    "....DDdhD.S...",
    "....DkdkD.S...",
    "..DDDddhDDDd..",
    ".DdkdkdkddhdD.",
    "DTDddddddddDD.",
    ".T.DD....DD...",
    "...D.D..D.D...",
    "..D...DD...D..",
]
CENT_B = CENT_A[:8] + [
    "..DD.....DD...",
    "...D.D..D.D...",
    "...D.D..D.D...",
]
enemy("ch4", "centaur_minion", dict(R3("Ddh", "a8a29e", "e7e5e4", "ffffff"), T=hexc("14b8a6"), S=hexc("134e4a")),
      {"A": CENT_A, "B": CENT_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])
LEECH_A = [
    "..............",
    "...DDddhh.....",
    "..DdddddhhD...",
    ".DmMdddddddhD.",
    ".DMrMddedddhD.",
    ".DmMddddddddD.",
    "..DDDDDDDDDD..",
]
enemy("ch4", "leech", dict(R3("Ddh", "0b3b36", "0f766e", "5eead4"), m=hexc("fda4af"), M=hexc("7f1d1d")),
      {"A": LEECH_A}, [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)], pulse={"squash": [0, 1, 0, -1], "slide": [0, 1, 1, 0]})

# ---------------- ch5: throne (flesh / crimson)
FLESH = [
    "....DDddhh....",
    "..DDdddddhhh..",
    ".DdddwdddddhD.",
    ".DddwedddwddD.",
    "DddddddddwedhD",
    "DdddddddddddhD",
    "DdkwkwkwkddddD",
    "DDdkkkkkkddDDD",
    ".DDDddddddDDD.",
    "..DDDDDDDDDD..",
]
enemy("ch5", "flesh_mass", dict(R3("Ddh", "7f1d1d", "e11d48", "fda4af"), w=hexc("fff1dc"), e=hexc("fde047")),
      {"A": FLESH}, [("A", 0, 0), ("A", 0, 0), ("A", 0, 0), ("A", 0, 0)],
      pulse={"squash": [0, -1, 0, 1], "d": [hexc("e11d48"), hexc("f43f5e"), hexc("e11d48"), hexc("be123c")]})
KNIGHT_A = [
    ".....rR.......",
    "....rrR.......",
    "....DDdh......",
    "...DDdddh.....",
    "...DkeekdS....",
    "...DDdddh.S...",
    "..RDDddddhS...",
    ".RrDdddgdhS...",
    ".RrDddddddS...",
    ".RrDDdddddD...",
    "..R.DD..DD....",
    "....DD..DD....",
]
KNIGHT_B = KNIGHT_A[:10] + ["..R..DD.DD....", ".....DD..DD..."]
enemy("ch5", "throne_knight", dict(R3("Ddh", "1f1f2e", "3f3f5a", "7a7a9a"), R=hexc("7f1d1d"), r=hexc("dc2626"),
                                   e=hexc("ef4444"), g=hexc("fbbf24"), S=hexc("d4d4d8")),
      {"A": KNIGHT_A, "B": KNIGHT_B}, [("A", 0, 0), ("B", 0, -1), ("A", 0, 0), ("B", 0, -1)])


def _wave(im, t, seg, x0):
    """Travelling hump (worm/centipede crawl): segment t lifts 1px, moving tail -> head."""
    res = new(*im.size)
    for x in range(im.width):
        dy = -1 if x >= x0 and (x - x0) // seg == t else 0
        col = im.crop((x, 0, x + 1, im.height))
        res.paste(col, (x, dy), col)
    return res


def _sway(im, off):
    """Shift upper half horizontally by off (tentacles / cage swing)."""
    res = new(*im.size)
    h = im.height
    for y in range(h):
        dx = int(round(off * (1 - y / h) * 1.6))
        row = im.crop((0, y, im.width, y + 1))
        res.paste(row, (dx, y), row)
    return res


def enemy_frames(d):
    frames = []
    for i, (key, dx, dy) in enumerate(d["seq"]):
        pal = dict(d["pal"])
        for ch, vals in d["pulse"].items():
            if len(ch) == 1:
                pal[ch] = vals[i]
        rows = list(d["maps"][key])
        if "look" in d["pulse"] and d["pulse"]["look"][i]:
            s = d["pulse"]["look"][i]
            rows = [r.replace("Eep", "EEe").replace("peE", "epE") if s > 0 else r for r in rows]
        art = ascii_img(rows, pal)
        im = new(16, 16)
        im.alpha_composite(art, ((16 - art.width) // 2 + dx, 14 - art.height + dy))
        p = d["pulse"]
        if "squash" in p and p["squash"][i]:
            im = squash(im, p["squash"][i])
        if "wave" in p:
            im = _wave(im, i, *p["wave"])
        if "sway" in p:
            im = _sway(im, p["sway"][i])
        if "swing" in p and p["swing"][i]:
            im = _sway(im, p["swing"][i])
        if "slide" in p:
            im = shift(im, p["slide"][i], 0)
        frames.append(outline(im))
    return frames


ELITES = [("ch1", "spider"), ("ch3", "void_imp"), ("ch4", "skeletal_warrior"), ("ch5", "flesh_mass")]
LEGACY_ENEMIES = {"egg", "eye_small", "spider", "worm", "cage", "deceiver", "hatcher", "mind_mage",
                  "absorber_flyer", "seeing_eye", "void_imp", "abyss_tentacle", "centaur_minion",
                  "skeletal_warrior", "flesh_mass", "throne_knight"}


def enemies():
    firsts = {}
    for (ch, name) in sorted(ENEMIES):
        fr = enemy_frames(ENEMIES[(ch, name)])
        grp = f"enemies/{ch}/{name}"
        save_anim(grp, fr, fps=8, loop=True, alias_size=(18, 18) if name in LEGACY_ENEMIES else None)
        save(silhouette(fr[0]), f"{grp}_hit.png")
        firsts[(ch, name)] = fr[0]
    for ch, name in ELITES:
        base = firsts[(ch, name)]
        g = over(new(16, 16), base)
        # gold rim so elites pop, then crown on top
        g = recolor(g, {OUT: hexc("92400e")})
        g = outline(pad(g, 18, 18), color=OUT)
        crown = ascii_img([
            "g.g.g",
            "ggrgg",
            "GGGGG",
        ], {"g": RAMP["gold"][1], "G": RAMP["gold"][0], "r": EYE_RED})
        cr = outline(pad(crown, 7, 5))
        g.alpha_composite(cr, (5, 0))
        save(g, f"enemies/elite_{ch}/{name}.png")


def build():
    player()
    npcs()
    enemies()
