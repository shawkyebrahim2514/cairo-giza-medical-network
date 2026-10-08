"""Turn normalised source records into display rows: infer district + brand, split phones, apply overrides.

Display row: {"id", "n" name, "t" type, "r" governorate, "d" district, "b" brand, "a" address, "tel", "p" [{label, href}]}
"""
import re

from common import OVERRIDES, config, load_json


def _compile(rules):
    return [(re.compile(p, re.I), d, g) for p, d, g in rules]


def _last_match(text, rules, gov):
    best, pos = None, -1
    for rx, d, only in rules:
        if only and only != gov:
            continue
        for m in rx.finditer(text):
            if m.end() > pos:
                best, pos = d, m.end()
    return best


def split_phones(tel):
    out = []
    for part in re.split(r"\s*/\s*|\s*,\s*|\s+-\s+|\s+or\s+|\s+(?=\+\d)", tel or ""):
        part = part.strip()
        digits = re.sub(r"[^\d+]", "", part)
        if len(re.sub(r"\D", "", digits)) < 4:
            continue
        if digits.startswith("(002)") or digits.startswith("002"):
            digits = "+2" + digits[3:]
        if digits.startswith("00"):
            digits = "+" + digits[2:]
        if not digits.startswith("+") and digits.startswith("0"):
            digits = "+2" + digits
        elif not digits.startswith("+") and len(digits) == 10 and digits[0] == "1":
            digits = "+20" + digits
        # Egyptian mobile numbers written with a landline prefix, e.g. "(02) 01152618555"
        m = re.fullmatch(r"(?:20)?2?0?(1[0125]\d{8})", re.sub(r"\D", "", digits))
        if m:
            digits = "+20" + m.group(1)
        out.append({"label": part, "href": digits})
    return out


class Enricher:
    def __init__(self):
        cfg = config("districts")
        self.groups = []
        for g in cfg["groups"]:
            self.groups.append({"govs": set(g["governorates"]), "strong": _compile(g["strong"]),
                                "weak": _compile(g["weak"]), "district_gov": g["district_gov"]})
        self.brands = [(b, re.compile(p, re.I)) for b, p in config("brands")["brands"]]
        self.overrides = {k: v for k, v in (load_json(OVERRIDES, {}) or {}).items() if not k.startswith("_")}

    def district(self, rec):
        gov = rec["gov"]
        grp = next((g for g in self.groups if gov in g["govs"]), None)
        if grp is None:
            # no district rules for this governorate yet: use the sub-area from the source, else the governorate
            return (rec["area"] or gov), gov
        addr = re.sub(r",?\s*(" + "|".join(map(re.escape, grp["govs"])) + r")\s*,\s*egypt\s*$", "", rec["addr"], flags=re.I)
        d = (_last_match(addr, grp["strong"], gov) or _last_match(rec["name"], grp["strong"], gov)
             or _last_match(addr, grp["weak"], gov))
        if d is None:
            return f"Other {gov}", gov
        return d, grp["district_gov"].get(d, gov)

    def row(self, rec):
        d, gov = self.district(rec)
        brand = next((b for b, rx in self.brands if rx.search(rec["name"])), "")
        row = {"id": rec["id"], "n": rec["name"], "t": rec["type"], "r": gov, "d": d, "b": brand,
               "a": rec["addr"], "tel": rec["tel"]}
        row.update(self.overrides.get(rec["id"], {}))
        row["p"] = split_phones(row["tel"])
        return row


def enrich(records, governorates=None):
    """governorates: None/'all' for everything, or a list of governorate names to keep (after correction)."""
    e = Enricher()
    rows = [e.row(r) for r in records]
    if governorates and governorates != "all":
        keep = set(governorates)
        rows = [r for r in rows if r["r"] in keep]
    return rows


if __name__ == "__main__":
    import collections
    import sys
    from common import FACILITIES
    rows = enrich(load_json(FACILITIES, []), None if "--all" in sys.argv else ["Cairo", "Giza"])
    for k, v in sorted(collections.Counter(r["d"] for r in rows).items(), key=lambda x: -x[1]):
        print(f"{v:5} {k}")
    if "-u" in sys.argv:
        for r in rows:
            if r["d"].startswith("Other"):
                print("  ", r["r"], "|", r["n"], "|", r["a"])
