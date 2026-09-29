"""Write assets/preview.html: every PNG at 4x (pixelated); anim groups animate in place.

    python tools/make_preview.py
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "assets"


def main():
    files = sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*.png"))
    anims = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8")).get("anims", {})
    frame_re = re.compile(r"^(.*)_f\d+\.png$")
    shown = set()
    entries = []  # (section, html)
    for f in files:
        m = frame_re.match(f)
        group = m.group(1) if m else f[:-4]
        if group in anims:
            if group in shown:
                continue
            shown.add(group)
            a = anims[group]
            frames = [f"{group}_f{i}.png" for i in range(a["frames"])]
            label = f"{group.split('/')[-1]} &middot; {a['frames']}f {a['fps']}fps{'' if a['loop'] else ' once'}"
            tag = (f"<img class=a src='{frames[0]}' width={a['w'] * 4} height={a['h'] * 4} "
                   f"data-frames='{json.dumps(frames)}' data-fps={a['fps']} data-loop={int(a['loop'])}>")
        else:
            label = html.escape(f.split("/")[-1])
            tag = f"<img src='{f}' onload='this.width=this.naturalWidth*4'>"
        sec = "/".join(f.split("/")[:2]) if f.startswith(("icons/", "enemies/")) else f.split("/")[0]
        entries.append((sec, f"<figure>{tag}<figcaption>{label}</figcaption></figure>"))

    parts = [
        "<!doctype html><html><head><meta charset=utf-8><title>Magicraft assets preview</title><style>"
        "body{background:#1b1e27;color:#e5e7eb;font:12px monospace;margin:16px}"
        "img{image-rendering:pixelated;background:#2a2f3c;display:block;margin:auto}"
        "h2{color:#22d3ee;margin:18px 0 6px}.grid{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end}"
        "figure{margin:0;text-align:center;max-width:220px}figcaption{font-size:10px;color:#94a3b8;word-break:break-all}"
        "</style></head><body>",
        f"<h1>Magicraft assets &mdash; {len(files)} PNG, {len(anims)} animations</h1>",
    ]
    cur = None
    for sec, h in entries:
        if sec != cur:
            if cur is not None:
                parts.append("</div>")
            parts.append(f"<h2>{html.escape(sec)}</h2><div class=grid>")
            cur = sec
        parts.append(h)
    parts.append("</div>")
    parts.append(
        "<script>for(const im of document.querySelectorAll('img.a')){const fr=JSON.parse(im.dataset.frames);"
        "const n=fr.length,loop=im.dataset.loop==='1';let t=0;setInterval(()=>{t++;"
        "const i=loop?t%n:Math.min(t%(n+6),n-1);im.src=fr[i]},1000/im.dataset.fps)}</script></body></html>")


if __name__ == "__main__":
    main()
