"""Build the single-file offline directory and the hosted (PWA) site from src/ + data/.

  python scripts/build.py                  # default site (Cairo & Giza)
  python scripts/build.py --site egypt     # all governorates
  python scripts/build.py --list-sites

Outputs
  dist/<slug>-medical-network.html   one self-contained file: open it on any device, works offline
  dist/site/                         the same page + manifest, service worker and icons (GitHub Pages)
"""
import argparse
import datetime
import hashlib
import html
import json
import os
import shutil
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DIST, FACILITIES, META, SRC, VENDOR, config, load_json  # noqa: E402
from enrich import enrich  # noqa: E402

REPO = "https://github.com/shawkyebrahim2514/cairo-giza-medical-network"


def read(*p):
    with open(os.path.join(*p), encoding="utf-8") as f:
        return f.read()


def js_str(s):
    """Escape for use inside a double-quoted JS/JSON string literal."""
    return json.dumps(s, ensure_ascii=False)[1:-1]


def subst(text, mapping):
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text


def snapshot_label(meta):
    try:
        return datetime.date.fromisoformat(meta["snapshot"]).strftime("%d %b %Y")
    except Exception:
        return "unknown date"


def build(site_name=None, quiet=False):
    regions = config("regions")
    site_name = site_name or regions["default_site"]
    if site_name not in regions["sites"]:
        raise SystemExit(f"Unknown site '{site_name}'. Choose one of: {', '.join(regions['sites'])}")
    site = regions["sites"][site_name]

    records = load_json(FACILITIES)
    if not records:
        raise SystemExit("data/facilities.json is missing or empty - run: python scripts/update.py")
    meta = load_json(META, {}) or {}
    rows = enrich(records, site["governorates"])

    types = dict(config("types")["types"])
    for r in rows:
        if r["t"] not in types:
            label = r["t"].replace("-", " ").title()
            types[r["t"]] = {"label": label, "plural": label}
    used = {r["t"] for r in rows}
    types = {k: v for k, v in types.items() if k in used}

    area, slug, snap = site["title"], site["slug"], snapshot_label(meta)
    common = {"__SNAPSHOT__": snap, "__REPO__": REPO, "__SLUG__": slug}
    html_map = dict(common, **{"__AREA__": html.escape(area)})
    js_map = dict(common, **{"__AREA__": js_str(area)})

    css = read(SRC, "styles.css")
    app = read(SRC, "app.js").replace("/* @@include pdf.js@@ */", read(SRC, "pdf.js"))
    app = subst(app, js_map)
    app = app.replace("__TYPES__", json.dumps(types, ensure_ascii=False)) \
             .replace("__ALIASES__", json.dumps(config("districts")["aliases"], ensure_ascii=False))
    page = subst(read(SRC, "index.html"), html_map)
    favicon = urllib.parse.quote(read(SRC, "icons", "icon.svg").strip(), safe=" =:/\"")
    page = page.replace("__FAVICON__", favicon.replace('"', "'"))

    for name, part in (("styles.css", css), ("app.js", app)):
        if "</script" in part.lower() or "</style" in part.lower():
            raise SystemExit(f"{name} must not contain a closing </script> or </style> tag")
    page = page.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>", 1)
    page = page.replace('<script src="app.js"></script>', "<script>\n" + app + "</script>", 1)

    lib = "\n".join(read(VENDOR, n) for n in ("jspdf.umd.min.js", "jspdf.plugin.autotable.min.js"))
    if "</script" in lib.lower():
        raise SystemExit("vendor library contains </script>")
    data = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    # data + library last, so their contents are never scanned for placeholders
    page = page.replace("__DATA__", data, 1).replace("__PDFLIB__", lib, 1)
    leftover = [p for p in ("__AREA__", "__SNAPSHOT__", "__REPO__", "__SLUG__", "__TYPES__", "__ALIASES__", "__FAVICON__") if p in page]
    if leftover:
        raise SystemExit(f"Unreplaced placeholders: {leftover}")

    os.makedirs(DIST, exist_ok=True)
    single = os.path.join(DIST, f"{slug}-medical-network.html")
    with open(single, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)

    site_dir = os.path.join(DIST, "site" if site_name == regions["default_site"] else f"site-{slug}")
    shutil.rmtree(site_dir, ignore_errors=True)
    os.makedirs(os.path.join(site_dir, "icons"))
    with open(os.path.join(site_dir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    version = hashlib.sha256(page.encode("utf-8")).hexdigest()[:12]
    for name, mapping in (("manifest.webmanifest", js_map), ("sw.js", {"__VERSION__": version})):
        with open(os.path.join(site_dir, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(subst(read(SRC, name), mapping))
    for n in os.listdir(os.path.join(SRC, "icons")):
        shutil.copy(os.path.join(SRC, "icons", n), os.path.join(site_dir, "icons", n))
    with open(os.path.join(site_dir, ".nojekyll"), "w") as f:
        f.write("")

    if not quiet:
        dists = len({r["d"] for r in rows})
        print(f"Built '{site_name}': {len(rows):,} facilities, {dists} districts, snapshot {snap}")
        print(f"  {single}  ({os.path.getsize(single) / 1024:,.0f} KB)")
        print(f"  {site_dir}{os.sep}")
    return single, site_dir


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", help="site to build (see config/regions.json)")
    ap.add_argument("--list-sites", action="store_true")
    a = ap.parse_args(argv)
    if a.list_sites:
        for k, v in config("regions")["sites"].items():
            print(f"{k:12} {v['title']}  ({v['governorates']})")
        return 0
    build(a.site)
    return 0


if __name__ == "__main__":
    sys.exit(main())
