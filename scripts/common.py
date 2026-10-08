"""Shared paths and small helpers for the build/update scripts (stdlib only)."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "config")
DATA = os.path.join(ROOT, "data")
SRC = os.path.join(ROOT, "src")
VENDOR = os.path.join(ROOT, "vendor")
DIST = os.path.join(ROOT, "dist")

FACILITIES = os.path.join(DATA, "facilities.json")
META = os.path.join(DATA, "meta.json")
OVERRIDES = os.path.join(DATA, "overrides.json")
CHANGELOG = os.path.join(ROOT, "CHANGELOG.md")


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8-sig") as f:  # tolerate a BOM added by Windows editors
        return json.load(f)


def save_json(path, obj, compact_rows=False):
    """Write JSON. With compact_rows, a list is written one object per line (small, diff-friendly)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        if compact_rows and isinstance(obj, list):
            f.write("[\n")
            f.write(",\n".join(json.dumps(o, ensure_ascii=False, separators=(", ", ": ")) for o in obj))
            f.write("\n]\n")
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")


def config(name):
    return load_json(os.path.join(CONFIG, name + ".json"))


def clean_ws(s):
    return re.sub(r"\s+", " ", (s or "").replace("\ufffd", "–")).strip()
