# Magicraft wiki mirror

Mirror of the English Magicraft fan wiki, https://magicraft.fandom.com, used as the design reference for this clone (see `../PLAN.md` §0).

- **License:** Fandom community text is licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Attribution: contributors of https://magicraft.fandom.com. Derived files in this folder (`corpus.md`, `data/*.json`, `REFERENCE.md`) are under the same license.
- Magicraft and its in-game text belong to Wave Games / bilibili. None of this folder is shipped in the game build; only renamed stats and rewritten text reach `dist/`.
- **Refresh:** `python fetch_wiki.py` (needs `requests` and `mwparserfromhell`). It regenerates `raw/`, `corpus.md`, `data/` and `REFERENCE.md`.
