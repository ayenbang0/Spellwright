"""Shared pixel-art helpers for tools/gen_art.py (Pillow only, deterministic).

Conventions
- Sprites are authored as ASCII maps (one char per pixel) + a palette dict.
  '.' and ' ' are transparent. Outline is usually added with `outline()`
  (1px dark ring into transparent pixels, sprite must leave a 1px margin).
- 3-tone ramps: (shadow, base, highlight), light from the top-left.
- Every file written goes through `save()` so gen_art can emit filelist.txt;
  every animation goes through `save_anim()` so manifest.json gets `anims`.
"""
from PIL import Image, ImageDraw
import os, math, random, zlib

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets"))

WRITTEN = set()   # rel paths of PNGs written this run
ANIMS = {}        # group -> {frames,fps,loop,w,h}

T = (0, 0, 0, 0)


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


OUT = hexc("0a0a10")          # universal dark outline
WHITE = hexc("ffffff")

# element / faction colours (ART_DIRECTION.md) + 3-tone ramps (shadow, base, highlight)
RAMP = {
    "cyan":    (hexc("0e7490"), hexc("22d3ee"), hexc("cffafe")),
    "ice":     (hexc("38bdf8"), hexc("a5f3fc"), hexc("f0fdff")),
    "fire":    (hexc("b91c1c"), hexc("f97316"), hexc("fde047")),
    "red":     (hexc("7f1d1d"), hexc("dc2626"), hexc("f87171")),
    "blood":   (hexc("5b0a0a"), hexc("dc2626"), hexc("fb7185")),
    "yellow":  (hexc("a16207"), hexc("facc15"), hexc("fef9c3")),
    "gold":    (hexc("92400e"), hexc("fbbf24"), hexc("fef3c7")),
    "green":   (hexc("166534"), hexc("4ade80"), hexc("dcfce7")),
    "poison":  (hexc("166534"), hexc("4ade80"), hexc("bbf7d0")),
    "void":    (hexc("1e1b4b"), hexc("a855f7"), hexc("e9d5ff")),
    "purple":  (hexc("4c1d95"), hexc("8b5cf6"), hexc("ddd6fe")),
    "magenta": (hexc("86198f"), hexc("f03cb4"), hexc("fbcfe8")),
    "bone":    (hexc("78716c"), hexc("e7e5e4"), hexc("ffffff")),
    "grey":    (hexc("475569"), hexc("94a3b8"), hexc("e2e8f0")),
    "stone":   (hexc("3f3f46"), hexc("71717a"), hexc("a1a1aa")),
    "wood":    (hexc("5b3a1e"), hexc("8b5a2b"), hexc("c08a4f")),
    "blue":    (hexc("1e3a8a"), hexc("3b82f6"), hexc("bfdbfe")),
    "skin":    (hexc("c98a5e"), hexc("fcd9a8"), hexc("fff1dc")),
    "pink":    (hexc("be185d"), hexc("f9a8d4"), hexc("fdf2f8")),
    "slime":   (hexc("4d7c0f"), hexc("a3e635"), hexc("ecfccb")),
    "rust":    (hexc("7c2d12"), hexc("c2410c"), hexc("fdba74")),
    "teal":    (hexc("134e4a"), hexc("14b8a6"), hexc("99f6e4")),
    "flesh":   (hexc("7f1d1d"), hexc("e11d48"), hexc("fda4af")),
    "slate":   (hexc("0f172a"), hexc("334155"), hexc("64748b")),
    "black":   (hexc("0a0a10"), hexc("1f2937"), hexc("4b5563")),
}

MAGENTA = RAMP["magenta"][1]
CYAN = RAMP["cyan"][1]


def seed_for(name):
    """Deterministic per-name RNG seed (stable across Python runs)."""
    return zlib.crc32(name.encode("utf-8"))


def rng(name):
    return random.Random(seed_for(name))


# ---------------------------------------------------------------- canvas
def new(w=16, h=16):
    return Image.new("RGBA", (w, h), T)


def ascii_img(rows, pal, w=None, h=None, ox=0, oy=0):
    """Build an image from an ASCII map. Unknown chars raise (catches typos)."""
    rows = [r for r in rows]
    W = w or max(len(r) for r in rows)
    H = h or len(rows)
    im = new(W, H)
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in ". ":
                continue
            if ch not in pal:
                raise KeyError(f"palette missing {ch!r}")
            c = pal[ch]
            if c is None:
                continue
            xx, yy = x + ox, y + oy
            if 0 <= xx < W and 0 <= yy < H:
                px[xx, yy] = c
    return im


def ramp_pal(**ramps):
    """ramp_pal(Ddh='cyan') -> {'D': shadow, 'd': base, 'h': highlight}.
    Key is a 3-char string (shadow, base, highlight chars)."""
    pal = {}
    for k, name in ramps.items():
        sh, b, hi = RAMP[name] if isinstance(name, str) else name
        pal[k[0]], pal[k[1]], pal[k[2]] = sh, b, hi
    return pal


def outline(im, color=OUT, diag=False):
    """1px outline into transparent pixels around opaque ones (same size)."""
    w, h = im.size
    src = im.load()
    res = im.copy()
    dst = res.load()
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diag:
        nb += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
    for y in range(h):
        for x in range(w):
            if src[x, y][3] > 0:
                continue
            for dx, dy in nb:
                xx, yy = x + dx, y + dy
                if 0 <= xx < w and 0 <= yy < h and src[xx, yy][3] > 40:
                    dst[x, y] = color
                    break
    return res


def pad(im, w, h):
    """Center im on a w x h transparent canvas (integer offset)."""
    if im.size == (w, h):
        return im.copy()
    c = new(w, h)
    c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c


def shift(im, dx, dy):
    c = new(*im.size)
    c.paste(im, (dx, dy), im)
    return c


def silhouette(im, color=WHITE):
    """Solid-colour silhouette (hit flash)."""
    a = im.split()[3].point(lambda v: 255 if v > 0 else 0)
    s = Image.new("RGBA", im.size, color)
    out = new(*im.size)
    out.paste(s, (0, 0), a)
    return out


def recolor(im, mapping):
    """Exact colour replacement {rgba: rgba}."""
    res = im.copy()
    px = res.load()
    for y in range(res.height):
        for x in range(res.width):
            c = px[x, y]
            if c in mapping:
                px[x, y] = mapping[c]
    return res


def alpha_mul(im, f):
    res = im.copy()
    px = res.load()
    for y in range(res.height):
        for x in range(res.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r, g, b, int(a * f))
    return res


def over(*layers):
    base = layers[0].copy()
    for l in layers[1:]:
        base.alpha_composite(l)
    return base


def glow(im, color, radius=1):
    """Hard-edged glow ring (no blur): dilate silhouette `radius` times behind im."""
    w, h = im.size
    mask = [[im.getpixel((x, y))[3] > 0 for x in range(w)] for y in range(h)]
    for _ in range(radius):
        m2 = [row[:] for row in mask]
        for y in range(h):
            for x in range(w):
                if mask[y][x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < w and 0 <= yy < h and mask[yy][xx]:
                        m2[y][x] = True
                        break
        mask = m2
    g = new(w, h)
    gp = g.load()
    for y in range(h):
        for x in range(w):
            if mask[y][x]:
                gp[x, y] = color
    g.alpha_composite(im)
    return g


# ---------------------------------------------------------------- primitives
def disc(im, cx, cy, r, c):
    """Pixel disc; cx,cy may be .5 for even diameters."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.8:
                px[x, y] = c


def ellipse(im, cx, cy, rx, ry, c):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if rx > 0 and ry > 0 and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0 + 0.6 / max(rx, ry):
                px[x, y] = c


def ring(im, cx, cy, r, c, width=1):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            d = math.hypot(x - cx, y - cy)
            if r - width + 0.5 <= d + 0.0 < r + 0.5:
                px[x, y] = c


def ball(im, cx, cy, r, ramp, hi=True):
    """3-tone shaded sphere lit from the top-left."""
    sh, b, h = RAMP[ramp] if isinstance(ramp, str) else ramp
    disc(im, cx, cy, r, sh)
    disc(im, cx - max(1, r // 4), cy - max(1, r // 4), r - max(1, r // 4), b)
    if hi:
        rr = max(0.6, r / 3.2)
        disc(im, cx - r / 2.2, cy - r / 2.2, rr, h)


def eball(im, cx, cy, rx, ry, ramp):
    sh, b, h = RAMP[ramp] if isinstance(ramp, str) else ramp
    ellipse(im, cx, cy, rx, ry, sh)
    o = max(1, min(rx, ry) // 4)
    ellipse(im, cx - o, cy - o, rx - o, ry - o, b)
    ellipse(im, cx - rx / 2.2, cy - ry / 2.2, max(0.8, rx / 3.5), max(0.8, ry / 3.5), h)


def rect(im, x0, y0, x1, y1, c):
    ImageDraw.Draw(im).rectangle([x0, y0, x1, y1], fill=c)


def line(im, x0, y0, x1, y1, c, w=1):
    ImageDraw.Draw(im).line([x0, y0, x1, y1], fill=c, width=w)


def poly(im, pts, c):
    ImageDraw.Draw(im).polygon(pts, fill=c)


def put(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((x, y), c)


def rim_shade(im, base, ramp):
    """For all pixels == base: top-left edge -> highlight, bottom-right edge -> shadow."""
    sh, _, hi = RAMP[ramp] if isinstance(ramp, str) else ramp
    px = im.load()
    w, h = im.size
    src = im.copy().load()

    def same(x, y):
        return 0 <= x < w and 0 <= y < h and src[x, y][3] > 0

    for y in range(h):
        for x in range(w):
            if src[x, y] != base:
                continue
            if not same(x + 1, y) or not same(x, y + 1) or not same(x + 1, y + 1):
                px[x, y] = sh
            elif not same(x - 1, y) or not same(x, y - 1):
                px[x, y] = hi


def rotate90(im, k=1):
    return im.rotate(90 * k, expand=True)


def flip_h(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def scale_nn(im, f):
    return im.resize((im.width * f, im.height * f), Image.NEAREST)


def squash(im, dy):
    """Vertical squash (dy>0 = shorter/wider feel) keeping feet on the bottom row."""
    w, h = im.size
    box = im.getbbox()
    if not box or dy == 0:
        return im.copy()
    x0, y0, x1, y1 = box
    sub = im.crop(box)
    nh = max(1, (y1 - y0) - dy)
    nw = (x1 - x0) + (1 if dy > 0 else (-1 if dy < 0 else 0)) * (0 if (x1 - x0) < 6 else 2)
    nw = max(1, nw)
    sub = sub.resize((nw, nh), Image.NEAREST)
    c = new(w, h)
    c.paste(sub, (x0 + ((x1 - x0) - nw) // 2, y1 - nh), sub)
    return c


# ---------------------------------------------------------------- output
def _abs(rel):
    return os.path.join(ROOT, *rel.split("/"))


def save(im, rel):
    p = _abs(rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    assert im.mode == "RGBA", rel
    im.save(p, optimize=False)
    WRITTEN.add(rel)
    return rel


def save_anim(group, frames, fps=10, loop=True, alias=True, alias_size=None):
    """Write group_f0..fN (+ alias group.png = f0, optionally padded to alias_size)."""
    w, h = frames[0].size
    for i, f in enumerate(frames):
        assert f.size == (w, h), (group, i, f.size)
        save(f, f"{group}_f{i}.png")
    if alias:
        a = frames[0] if alias_size is None else pad(frames[0], *alias_size)
        save(a, f"{group}.png")
    ANIMS[group] = {"frames": len(frames), "fps": fps, "loop": loop, "w": w, "h": h}
