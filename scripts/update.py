"""Update the facility data from the source, report what changed, and rebuild.

  python scripts/update.py                      # fetch the live feed (default)
  python scripts/update.py --html saved.html    # use a page section saved from the browser instead
  python scripts/update.py --dry-run            # only show the change report
  python scripts/update.py --no-build           # update data + CHANGELOG but don't rebuild dist/

Writes data/facilities.json, data/meta.json, prepends CHANGELOG.md, and (with --report FILE) a Markdown
report used as the pull-request body by the weekly GitHub Action.
Exit code: 0 = changes written, 3 = no changes, 1 = error.
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CHANGELOG, FACILITIES, META, load_json, save_json  # noqa: E402
from source import get_records  # noqa: E402

FIELDS = {"name": "Name", "type": "Type", "gov": "Governorate", "area": "Area", "addr": "Address", "tel": "Phone"}
FOCUS = {"Cairo", "Giza"}


def diff(old, new):
    o, n = {r["id"]: r for r in old}, {r["id"]: r for r in new}
    added = [n[i] for i in n if i not in o]
    removed = [o[i] for i in o if i not in n]
    changed = []
    for i in n:
        if i in o:
            ch = {k: (o[i].get(k, ""), n[i].get(k, "")) for k in FIELDS if o[i].get(k, "") != n[i].get(k, "")}
            if ch:
                changed.append((n[i], ch))
    return added, removed, changed


def md_escape(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def report(added, removed, changed, total, date, source):
    def scope(rows):
        cg = sum(1 for r in rows if (r[0] if isinstance(r, tuple) else r)["gov"] in FOCUS)
        return f"{len(rows)} ({cg} in Cairo & Giza)"

    lines = [f"## Data update – {date}", "",
             f"Source: {source} · **{total:,}** facilities in Egypt", "",
             "| | Count |", "|---|---|",
             f"| ➕ Added | {scope(added)} |", f"| ➖ Removed | {scope(removed)} |", f"| ✏️ Changed | {scope(changed)} |", ""]

    def table(title, rows):
        if not rows:
            return
        lines.extend([f"### {title}", "", "| Facility | Type | Governorate | Address | Phone |", "|---|---|---|---|---|"])
        for r in sorted(rows, key=lambda r: (r["gov"] not in FOCUS, r["gov"], r["name"])):
            lines.append(f"| {md_escape(r['name'])} | {r['type']} | {r['gov']} | {md_escape(r['addr'])} | {md_escape(r['tel'])} |")
        lines.append("")

    table("Added", added)
    table("Removed", removed)
    if changed:
        lines.extend(["### Changed", "", "| Facility | Governorate | What changed |", "|---|---|---|"])
        for r, ch in sorted(changed, key=lambda x: (x[0]["gov"] not in FOCUS, x[0]["gov"], x[0]["name"])):
            what = "<br>".join(f"**{FIELDS[k]}:** ~~{md_escape(a) or '–'}~~ → {md_escape(b) or '–'}" for k, (a, b) in ch.items())
            lines.append(f"| {md_escape(r['name'])} | {r['gov']} | {what} |")
        lines.append("")
    return "\n".join(lines)


def prepend_changelog(section):
    head = "# Changelog\n\nData updates of the facility list (newest first).\n\n"
    body = ""
    if os.path.exists(CHANGELOG):
        body = open(CHANGELOG, encoding="utf-8").read()
        body = body[len(head):] if body.startswith(head) else body
    with open(CHANGELOG, "w", encoding="utf-8", newline="\n") as f:
        f.write(head + section.rstrip() + "\n\n" + body.lstrip())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", help="HTML file saved from the facilities page (expanded country section)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--report", help="also write the Markdown change report to this file")
    ap.add_argument("--force", action="store_true", help="write files and rebuild even if nothing changed")
    a = ap.parse_args()

    source = f"saved page ({os.path.basename(a.html)})" if a.html else "live facilities feed"
    try:
        new = get_records(a.html)
    except Exception as e:  # network/format problems should fail loudly but cleanly
        print(f"ERROR: could not read the source: {e}", file=sys.stderr)
        return 1
    old = load_json(FACILITIES, [])
    added, removed, changed = diff(old, new)
    today = datetime.date.today().isoformat()
    rep = report(added, removed, changed, len(new), today, source)
    if not old:
        rep = f"## Initial import – {today}\n\nSource: {source} · **{len(new):,}** facilities in Egypt " \
              f"({sum(1 for r in new if r['gov'] in FOCUS):,} in Cairo & Giza).\n"
    print(rep)

    if not (added or removed or changed) and not a.force:
        print("\nNo changes.")
        return 3
    if a.dry_run:
        return 0
    if a.report:
        body = rep if len(rep) < 60000 else rep[:60000].rsplit("\n", 1)[0] + \
            "\n\n…report truncated – see the full list in CHANGELOG.md in this pull request.\n"
        with open(a.report, "w", encoding="utf-8", newline="\n") as f:
            f.write(body + "\n")

    save_json(FACILITIES, new, compact_rows=True)
    meta = load_json(META, {}) or {}
    meta.update({"snapshot": today, "source": source, "count": len(new)})
    save_json(META, meta)
    if added or removed or changed:
        prepend_changelog(rep)
    print(f"\nWrote {FACILITIES} ({len(new)} facilities)")
    if os.environ.get("GITHUB_OUTPUT"):  # lets the workflow build a PR title
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"summary={len(added)} added, {len(removed)} removed, {len(changed)} changed\ndate={today}\n")

    if not a.no_build:
        import build
        build.main([])
    return 0


if __name__ == "__main__":
    sys.exit(main())
