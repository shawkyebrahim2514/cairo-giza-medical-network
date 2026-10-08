# Data & configuration reference

- [Data files](#data-files) – `facilities.json`, `meta.json`, `overrides.json`, `raw/`
- [Config files](#config-files) – `districts.json`, `brands.json`, `types.json`, `regions.json`
- [In the browser](#in-the-browser) – saved personal data, backup file, shareable links, CSV columns

All files are UTF-8 JSON. Keys starting with `_` (like `_doc`) are comments and are ignored.

---

## Data files

### `data/facilities.json`
The facility list for **all of Egypt**, written by `update.py` – **don't edit by hand** (put fixes in
`overrides.json`). One facility per line, sorted by governorate, type and name, so Git diffs show exactly what changed.

| Field | Example | Notes |
|---|---|---|
| `id` | `31772f4b-c0e2-…` | Unique and stable id from the source – used to match facilities between updates and for your favourites/notes |
| `name` | `Al Borg Lab (Helmiat Al Zeiton)` | |
| `type` | `laboratory` | Slug of the source type – see `config/types.json` |
| `gov` | `Cairo` | Governorate after spelling fixes from `config/regions.json` |
| `area` | `Mansoura` | Only when the source city was like `Dakahlia - Mansoura`; usually empty |
| `addr` | `115 Selim Al Awal Street, Ain Shams, Cairo, Egypt` | |
| `tel` | `+20 11 1777 2814 / +20 19911` | Original text; split into dialable links at build time |

### `data/meta.json`
```json
{ "snapshot": "2026-10-08", "source": "live facilities feed", "count": 1685 }
```
`snapshot` is shown in the page, PDF and release name. Written by `update.py`.

### `data/overrides.json`
Your manual corrections, applied on top of the automatic detection at build time. **Never overwritten by updates.**
Keyed by facility `id` – find it by searching the facility name in `data/facilities.json`
(see [RECIPES → fix one facility](RECIPES.md#fix-one-facility)).

| Field | Overrides | Example |
|---|---|---|
| `d` | district | `"New Cairo"` |
| `r` | governorate | `"Giza"` |
| `b` | brand (`""` = independent) | `"Al Borg Lab"` |
| `n` | name | `"Cleopatra Hospital"` |
| `a` | address | `"…"` |
| `tel` | phone text (re-split into links) | `"+20 2 1234 5678 / 19xxx"` |
| `t` | type slug | `"hospital"` |

```json
{
  "_doc": "…",
  "31772f4b-c0e2-4142-a00e-3fb442bf9f69": { "d": "New Cairo" },
  "0b5c…": { "b": "", "tel": "+20 2 2345 6789" }
}
```

If the source later fixes the facility itself, simply delete your override. If a facility disappears from the
source, its override is ignored.

### `data/raw/`
Place for HTML pages you saved from the official site (for `update.py --html`). Git-ignored – these copies of the
original page are kept on your computer only.

---

## Config files

### `config/districts.json`
How facilities are put into districts, and extra search words.

```json
{
  "groups": [{
    "governorates": ["Cairo", "Giza"],
    "strong": [["maadi|merag city|saqr quraish", "Maadi", null], …],
    "weak":   [["hegaz|military college|baron", "Heliopolis", "Cairo"], …],
    "district_gov": { "Maadi": "Cairo", "Sheikh Zayed": "Giza", … }
  }],
  "aliases": { "New Cairo": "tagamoa tagamo3 fifth settlement 5th settlement …" }
}
```

| Part | Meaning |
|---|---|
| `governorates` | Facilities in these governorates use this group's rules |
| `strong` | `[regex, district, only-for-governorate]` – explicit area names. Tried on the **address**, then the **name** |
| `weak` | Same format – streets and landmarks. Tried on the address only, and only if no strong rule matched |
| 3rd value | Restricts the rule to facilities listed under that governorate (`null` = any) – e.g. a street name that exists in both Cairo and Giza |
| `district_gov` | The real governorate of each district; fixes facilities the source filed under the wrong one |
| `aliases` | Extra words that find a district in search (nicknames, Arabic transliterations, common misspellings) |

Regexes are case-insensitive Python/JavaScript-compatible patterns. **When several rules match, the one that
ends latest in the text wins** – addresses usually end with the area, so *"… Street, Nasr City, Cairo"* picks
Nasr City even if the street name also matched something. No match → *Other Cairo* / *Other Giza*.

### `config/brands.json`
```json
{ "brands": [ ["Al Mokhtabar", "^al ?mokhtabar"], … ] }
```
`[display name, regex tested against the facility name]`. The **first** match wins, so put specific names before
generic ones. Facilities without a match are *Independent*.

### `config/types.json`
```json
{ "types": { "hospital": { "label": "Hospital", "plural": "Hospitals" }, … } }
```
Keys are type slugs. The **order** here is the display order of filters, the type strip and *Group by type*.
Colours and icons per type live in `src/styles.css` / `src/app.js`. New types from the source appear automatically
with a generated label – add them here to name and order them properly.

### `config/regions.json`
```json
{
  "country": "EG",
  "governorate_aliases": { "cairoq": "Cairo", "helwan": "Cairo", … },
  "sites": {
    "cairo-giza": { "title": "Cairo & Giza", "slug": "cairo-giza", "governorates": ["Cairo", "Giza"] },
    "egypt":      { "title": "Egypt",        "slug": "egypt",      "governorates": "all" }
  },
  "default_site": "cairo-giza"
}
```

| Part | Meaning |
|---|---|
| `country` | Country code passed to the feed |
| `governorate_aliases` | Raw `City` value from the source (any case) → governorate. The source has many spellings; add new ones here when an update shows an odd governorate |
| `sites` | Each site = a build: `title` (shown in the page/PDF), `slug` (file names), `governorates` (list or `"all"`) |
| `default_site` | Built by `python scripts/build.py` with no options and deployed to GitHub Pages |

---

## In the browser

### Saved personal data
Stored in the browser's `localStorage` with the prefix `cgmn.` – it never leaves the device.

| Key | Contents |
|---|---|
| `cgmn.favs` | list of favourite facility ids |
| `cgmn.notes` | `{id: "note text"}` |
| `cgmn.tags` | `{id: ["tag", …]}` |
| `cgmn.recent` | recently called/mapped/copied facilities with time |
| `cgmn.theme`, `cgmn.view`, `cgmn.group`, `cgmn.fontSize`, `cgmn.scroll` | display preferences |
| `cgmn.noticeSeen` | snapshot date when the notice was dismissed (it shows again after a data update) |

Data saved by older versions (prefix `bupaCG.`) is migrated automatically on first load.

> The live site (and installed app) and the single file **don't share** favourites – and copies of the file may
> not either, depending on the browser. Use **Backup** in one and **Restore** in the other.

### Backup file
`medical-network-cairo-giza-my-data.json` – `{ "favs": [...], "notes": {...}, "tags": {...}, "recent": [...] }`
plus the export time. *Restore* merges it into the current browser (nothing is deleted).

### Shareable links (*Share view*)
The address bar always reflects the current view, so any link reproduces it:

| Parameter | Example | Meaning |
|---|---|---|
| `q` | `q=maadi` | search text |
| `type` | `type=hospital\|laboratory` | facility types (slugs, `\|`-separated) |
| `gov`, `dist`, `brand`, `tag` | `dist=Maadi\|Zamalek` | governorates, districts, brands, your tags |
| `show` | `show=fav` | `fav`, `notes` or `recent` |
| `group` | `group=type` | `district` (default), `type`, `brand`, `gov`, `az`, `none` |
| `sort` | `sort=name-desc` | `name` (default), `name-desc`, `type`, `fav` |

Example: `…/?q=lab&dist=Maadi&group=brand`

### CSV export columns
`Name, Type, District, Governorate, Brand, Address, Phone, Favourite, My tags, My note, Google Maps` – UTF-8 with
BOM so Excel shows Arabic and symbols correctly.
