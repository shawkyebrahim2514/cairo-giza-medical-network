"""Get facility records from the source and normalise them.

Two sources produce the same normalised records:
  * fetch_api()        - the JSON feed the official facilities page loads its data from (default)
  * parse_saved_html() - an HTML file saved from the browser inspector (fallback if the feed changes)

Normalised record: {"id", "name", "type", "gov", "area", "addr", "tel"}
  gov  = canonical governorate (see config/regions.json)
  area = optional sub-area that came with the city field, e.g. "Mansoura" from "Dakahlia - Mansoura"
"""
import html
import json
import re
import urllib.request
from html.parser import HTMLParser

from common import clean_ws, config

API_URL = "https://www.bupaglobal.com/FacilitiesFinder/GetFacilityByCountry/{country}"
USER_AGENT = "cairo-giza-medical-network/1.0 (+https://github.com/shawkyebrahim2514/cairo-giza-medical-network)"


def _type_slug(t):
    return re.sub(r"\s+", "-", clean_ws(t).lower())


def _gov(city):
    """Return (governorate, area) for a raw city value."""
    regions = config("regions")
    aliases = {k.lower(): v for k, v in regions["governorate_aliases"].items()}
    raw = clean_ws(city)
    if raw.lower() in aliases:
        return aliases[raw.lower()], ""
    if " - " in raw:
        g, area = [p.strip() for p in raw.split(" - ", 1)]
        return aliases.get(g.lower(), g), area
    return raw, ""


def _record(fid, name, type_, city, addr, tel):
    gov, area = _gov(city)
    return {"id": fid.strip().lower(), "name": clean_ws(name), "type": _type_slug(type_), "gov": gov,
            "area": area, "addr": clean_ws(re.sub(r"\s+,", ",", addr)), "tel": clean_ws(tel)}


def fetch_api(country=None, timeout=60):
    country = country or config("regions")["country"]
    req = urllib.request.Request(API_URL.format(country=country), headers={
        "User-Agent": USER_AGENT, "Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        rows = json.loads(r.read().decode("utf-8"))
    if not isinstance(rows, list) or not rows or "ItemId" not in rows[0]:
        raise RuntimeError("Unexpected response format from the facilities feed")
    out = []
    for a in rows:
        parts = [a.get(k) for k in ("AddressOne", "AddressTwo", "AddressThree", "City", "PostCode", "CountryName")]
        addr = ", ".join(clean_ws(p) for p in parts if p and clean_ws(p))
        tel = " / ".join(clean_ws(t) for t in (a.get("Telephone"), a.get("AdditionalTelephone")) if t and clean_ws(t))
        out.append(_record(a["ItemId"], a.get("ProviderName") or a.get("ItemName") or "", a.get("ProviderType") or "",
                           a.get("City") or "", addr, tel))
    return out


class _SavedPageParser(HTMLParser):
    """Reads <div class="filter-city"><h2>City</h2> ... <div class="filter-type-x"> <li data-facility-id> ..."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.city, self.type, self.cur, self.field, self.in_h2 = [], "", "", None, None, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "h2":
            self.in_h2, self.city = True, ""
        m = re.search(r"\bfilter-type-([\w-]+)", cls)
        if tag == "div" and m:
            self.type = m.group(1)
        if tag == "li" and a.get("data-facility-id"):
            self.cur = {"id": a["data-facility-id"], "name": "", "addr": "", "tel": "", "type": self.type, "city": self.city}
        if self.cur is not None:
            if tag == "h4":
                self.field = "name"
            elif tag == "span" and "address" in cls:
                self.field = "addr"
            elif tag == "span" and "tel" in cls:
                self.field = "tel"

    def handle_endtag(self, tag):
        if tag == "h2":
            self.in_h2 = False
        if tag in ("h4", "span"):
            self.field = None
        if tag == "li" and self.cur is not None:
            self.rows.append(self.cur)
            self.cur = None

    def handle_data(self, data):
        if self.in_h2:
            self.city += data
        elif self.cur is not None and self.field:
            self.cur[self.field] += data


def parse_saved_html(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        p = _SavedPageParser()
        p.feed(f.read())
    out = []
    for r in p.rows:
        tel = re.sub(r"^\s*Tel\s*", "", html.unescape(r["tel"]))
        out.append(_record(r["id"], r["name"], r["type"].replace("-", " "), r["city"], r["addr"], tel))
    if not out:
        raise RuntimeError(f"No facilities found in {path} - is it the expanded country section?")
    return out


def get_records(html_path=None):
    recs = parse_saved_html(html_path) if html_path else fetch_api()
    seen, uniq = set(), []
    for r in recs:
        if r["id"] not in seen:
            seen.add(r["id"])
            uniq.append(r)
    return sorted(uniq, key=lambda r: (r["gov"], r["type"], r["name"].lower(), r["id"]))
