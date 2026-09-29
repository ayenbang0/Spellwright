"""Mirror magicraft.fandom.com (English) via the MediaWiki API and extract structured data.

The HTML site returns 403 to non-browser clients; api.php does not.
Outputs (relative to this file):
  raw/articles|templates|categories/*.wiki  raw wikitext per page
  raw/all.json                              wikitext + timestamps + categories
  corpus.md                                 every article as plain text (tables flattened to `a | b` rows)
  data/*.json                               spells, wands, relics, relic_series, curses, potions, bosses, monsters

Usage: python fetch_wiki.py   (requires: requests, mwparserfromhell)
"""
import json
import re
from pathlib import Path

import mwparserfromhell as mw
import requests

API = "https://magicraft.fandom.com/api.php"
ROOT = Path(__file__).resolve().parent
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"
HUBS = {"Spells", "Relics", "Wands", "Monsters & Bosses", "Potions", "Curses"}


def all_pages(ns):
    out, params = [], {"action": "query", "list": "allpages", "aplimit": 500, "format": "json", "apnamespace": ns}
    while True:
        r = S.get(API, params=params, timeout=30).json()
        out += [p["title"] for p in r["query"]["allpages"]]
        if "continue" not in r:
            return out
        params.update(r["continue"])


def fetch(titles):
    res = {}
    for i in range(0, len(titles), 50):
        r = S.get(API, timeout=60, params={
            "action": "query", "prop": "revisions|categories", "rvprop": "content|timestamp", "rvslots": "main",
            "titles": "|".join(titles[i:i + 50]), "format": "json", "formatversion": 2, "cllimit": "max",
        }).json()
        for pg in r["query"]["pages"]:
            rv = pg.get("revisions", [{}])[0]
            res[pg["title"]] = {
                "text": rv.get("slots", {}).get("main", {}).get("content", ""),
                "ts": rv.get("timestamp"),
                "cats": [c["title"] for c in pg.get("categories", [])],
            }
    return res


def clean(s):
    s = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[Category:[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", s)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"<br\s*/?>", "; ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return s.strip()


def split_attr(cell):
    m = re.match(r"^([^|\[]*=[^|\[]*)\|(?!\|)(.*)$", cell, re.S)
    return (m.group(1), m.group(2)) if m else ("", cell)


def parse_tables(text):
    """Return each wikitable as a list of rows of cleaned cell strings, with rowspans expanded."""
    tables, cur, row = [], None, None
    for ln in text.split("\n"):
        s = ln.strip()
        if s.startswith("{|"):
            cur, row = [], None
            continue
        if cur is None:
            continue
        if s.startswith("|}"):
            if row is not None:
                cur.append(row)
            tables.append(cur)
            cur = None
            continue
        if s.startswith("|+"):
            continue
        if s.startswith("|-"):
            if row is not None:
                cur.append(row)
            row = []
            continue
        if s.startswith(("!", "|")):
            row = [] if row is None else row
            for c in s[1:].split("!!" if s.startswith("!") else "||"):
                attr, content = split_attr(c)
                row.append({"attr": attr, "raw": content})
        elif row:
            row[-1]["raw"] += "\n" + ln
    out = []
    for t in tables:
        grid, pending = [], {}
        for r in t:
            new, ci, cells = [], 0, list(r)
            while cells or ci in pending:
                if ci in pending:
                    val, n = pending[ci]
                    new.append(val)
                    if n > 1:
                        pending[ci] = (val, n - 1)
                    else:
                        del pending[ci]
                else:
                    c = cells.pop(0)
                    val = clean(c["raw"])
                    new.append(val)
                    m = re.search(r'rowspan="?(\d+)', c["attr"])
                    if m and int(m.group(1)) > 1:
                        pending[ci] = (val, int(m.group(1)) - 1)
                ci += 1
            if new:
                grid.append(new)
        out.append(grid)
    return out


def plain(text):
    tables, i = parse_tables(text), [0]

    def rep(_):
        g = tables[i[0]] if i[0] < len(tables) else []
        i[0] += 1
        return "\n" + "\n".join(" | ".join(c.replace("\n", "; ") for c in r) for r in g) + "\n"

    text = re.sub(r"\{\|.*?\n\|\}", rep, text, flags=re.S)
    text = text.replace("{{PAGENAME}}", "(this)")
    return re.sub(r"\n{3,}", "\n\n", clean(text))


def rows(grid):
    return [dict(zip(grid[0], r)) for r in grid[1:]]


def kv(s):
    return {k.strip(): v.strip() for k, v in (ln.split(":", 1) for ln in s.split("\n") if ":" in ln)}


def main():
    pages = {ns: all_pages(ns) for ns in (0, 10, 14)}
    arts, tmpl, cats = fetch(pages[0]), fetch(pages[10]), fetch(pages[14])
    safe = lambda t: re.sub(r'[\\/:*?"<>|]', "_", t)
    for d, name in ((arts, "articles"), (tmpl, "templates"), (cats, "categories")):
        folder = ROOT / "raw" / name
        folder.mkdir(parents=True, exist_ok=True)
        for t, v in d.items():
            (folder / f"{safe(t)}.wiki").write_text(
                f"<!-- title: {t} | updated: {v['ts']} | cats: {', '.join(v['cats'])} -->\n{v['text']}", encoding="utf-8")
    (ROOT / "raw" / "all.json").write_text(
        json.dumps({"articles": arts, "templates": tmpl, "categories": cats}, ensure_ascii=False), encoding="utf-8")

    corpus = [f"### {t}  [{', '.join(c[9:] for c in v['cats'])}] ({(v['ts'] or '')[:10]})\n{plain(v['text'])}\n"
              for t, v in sorted(arts.items())]
    (ROOT / "corpus.md").write_text("\n".join(corpus), encoding="utf-8")

    T = {t: parse_tables(arts[t]["text"]) for t in HUBS}
    wands = [{"name": r["Name"], **kv(r["Attribute"]), "passive": r["Passive"]} for r in rows(T["Wands"][0])]
    spells = {}
    for r in rows(T["Spells"][0]):
        s = spells.setdefault(r["Name"], {"name": r["Name"], "rarity": r["Rarity level"], "tips": r["Tips"], "levels": {}})
        s["levels"][r["level"]] = r["Describe"]
    for title, v in arts.items():
        for tp in mw.parse(v["text"]).filter_templates(recursive=False):
            if str(tp.name).strip().replace("_", " ") != "Spell InfoBox":
                continue
            ib = {str(p.name).strip(): clean(str(p.value)) for p in tp.params if str(p.value).strip()}
            s = spells.setdefault(title, {"name": title, "levels": {}})
            s["infobox"] = ib
            s.setdefault("rarity", ib.get("rarity"))
            s["type"] = ib.get("type")
    for n, s in spells.items():
        if n in arts:
            code = mw.parse(arts[n]["text"])
            for tp in code.filter_templates(recursive=False):
                code.remove(tp)
            s["page"] = clean(str(code).replace("{{PAGENAME}}", n))
    listed = re.findall(r"^\*\s*\[\[File:[^\]]*\]\]\s*\[\[([^\]|]+)", arts["Spells"]["text"], re.M)
    data = {
        "spells": list(spells.values()), "wands": wands,
        "relics": rows(T["Relics"][0]), "relic_series": rows(T["Relics"][1]),
        "bosses": rows(T["Monsters & Bosses"][0]), "monsters": rows(T["Monsters & Bosses"][1]),
        "potions": rows(T["Potions"][0]), "curses": rows(T["Curses"][0]),
        "spells_without_data": [n for n in listed if n not in spells],
    }
    (ROOT / "data").mkdir(exist_ok=True)
    for name, obj in data.items():
        (ROOT / "data" / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "REFERENCE.md").write_text(render_reference(data), encoding="utf-8")
    print({"articles": len(arts), "templates": len(tmpl), "categories": len(cats), **{k: len(v) for k, v in data.items()}})


def _esc(s):
    return re.sub(r"\s+", " ", str(s or "")).replace("|", "/").strip()


def _lv3(ib, key):
    vals = [ib.get(f"{key}{i}") for i in (1, 2, 3)]
    return "/".join(v or "–" for v in vals) if any(vals) else ""


_EXTRA = ("spell_flight_speed", "spell_penetration", "spell_rebound_count", "spell_duration", "cd", "scatter",
          "crit_rate", "effect_radius", "spell_effect_radius", "spell_damage", "mp_cost", "spell_slots",
          "number_of_shots", "simultaneous_firing", "hp", "summon_limit")
_TYPE_ORDER = {"Spell Projectiles": 0, "Spell Summon": 1, "Spell Boost": 2, "Spell Passive": 3}


def _spell_effect(s):
    ib, lv = s.get("infobox", {}), s["levels"]
    text = next((lv[k] for k in ("3", "2", "1") if lv.get(k)), "") or " ; ".join(
        ib[k] for k in ("misc_a_3", "misc_b_3", "misc_c_3", "misc_a_1", "misc_b_1", "misc_c_1", "desc") if ib.get(k))
    extra = [f"{k}={_lv3(ib, k)}" for k in _EXTRA if _lv3(ib, k)]
    return _esc(text)[:260] + (f" [{'; '.join(extra)}]" if extra else "")


def render_reference(d):
    """Flat lookup tables for PLAN.md; regenerated on every fetch. Wiki text is CC BY-SA (fandom)."""
    out = ["# Magicraft wiki reference (generated by `fetch_wiki.py` — do not hand-edit)", "",
           "Source: https://magicraft.fandom.com (EN, community-maintained, CC BY-SA). Values are wiki claims, "
           "not verified in-game. `int1`/`float1` are unresolved game-localization placeholders. "
           "Full per-spell text, level tables, and notes: `data/spells.json`; every page as text: `corpus.md`.", ""]
    out += ["## Spells", "", "| Spell | Type | Rarity | MP L1/L2/L3 | DMG L1/L2/L3 | Effect (highest documented level) [stats L1/L2/L3] |",
            "|---|---|---|---|---|---|"]
    for s in sorted(d["spells"], key=lambda s: (_TYPE_ORDER.get(s.get("type"), 9), s["name"])):
        ib = s.get("infobox", {})
        out.append(f"| {s['name']} | {(s.get('type') or '?').replace('Spell ', '')} | {s.get('rarity') or '?'} | "
                   f"{_esc(_lv3(ib, 'mana_cost'))} | {_esc(_lv3(ib, 'dmg'))} | {_spell_effect(s)} |")
    out += ["", f"Listed on the Spells hub but no data on the wiki: {', '.join(d['spells_without_data'])}.", ""]
    out += ["## Wands", "", "| Wand | MP | Cast interval (s) | MP regen/s | CD (s) | Passive |", "|---|---|---|---|---|---|"]
    out += [f"| {w['name']} | {w.get('MP')} | {w.get('Cast Interval')} | {_esc(w.get('MP Regen', '')).replace('/s', '')} | "
            f"{w.get('CD')} | {_esc(w['passive'])} |" for w in d["wands"]]
    out += ["", "## Relics", "", "| Relic | Rarity | Max Lv | Effect |", "|---|---|---|---|"]
    out += [f"| {_esc(r['Relic Name']).replace('-', '')} | {r['Rarity'] or '—'} | {r['Max Level']} | {_esc(r['Effect'])} |"
            for r in d["relics"]]
    out += ["", "### Relic series", "", "| Series | Set bonus | Parts |", "|---|---|---|"]
    out += [f"| {r['Series Name']} | {_esc(r['Series Effect'])} | "
            f"{', '.join(p.strip().replace('-', '') for p in r['Series Parts'].split('*') if p.strip())} |"
            for r in d["relic_series"]]
    out += ["", "## Curses", "", "| Curse | Rarity | Effect |", "|---|---|---|"]
    out += [f"| {c['Name']} | {c['Rarity level']} | {_esc(c['Curse description'])} |" for c in d["curses"]]
    out += ["", "## Potions", "", "| Potion | Effect |", "|---|---|"]
    out += [f"| {p['Name']} | {_esc(p['Effect'])} |" for p in d["potions"]]
    out += ["", "## Bosses", "", "| Chapter | Boss | HP | Notes |", "|---|---|---|---|"]
    out += [f"| {b['chapter']} | {b['name']} | {b['HP']} | {_esc(b['describe'])} {_esc(b['Information'])} |"
            for b in d["bosses"]]
    out += ["", "## Monsters", "", "| Monster | HP | Description |", "|---|---|---|"]
    out += [f"| {m['name']} | {m['HP']} | {_esc(m['describe'])} |" for m in d["monsters"]]
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    main()
