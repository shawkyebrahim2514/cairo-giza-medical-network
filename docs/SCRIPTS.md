# Scripts reference

All scripts are plain **Python 3.10+** with **no third-party packages**, except the tests and the screenshot script,
which use Playwright (and PyMuPDF for PDF checks). Run them from the repository root.

```bash
python scripts/update.py [options]      # get new data
python scripts/build.py  [options]      # make the single file + website
python scripts/screenshots.py           # refresh README images
python scripts/enrich.py [-u] [--all]   # audit district detection
python tests/ui_test.py                 # browser tests
python tests/pdf_test.py
```

- [update.py](#updatepy) – fetch, compare, report, save
- [build.py](#buildpy) – bundle into one file + website
- [screenshots.py](#screenshotspy) – README images
- [source.py](#sourcepy) – read the live feed / a saved page
- [enrich.py](#enrichpy) – districts, brands, phones, overrides
- [common.py](#commonpy) – shared paths and JSON helpers
- [Tests](#tests) – `ui_test.py`, `pdf_test.py`
- [Workflows](#workflows) – what the GitHub Actions run

---

## update.py

Fetches the current facility list, compares it with `data/facilities.json`, prints a Markdown change report and,
if something changed, saves the new data, updates `data/meta.json`, adds the report to the top of `CHANGELOG.md`
and rebuilds. If nothing changed, it only records today as the `checked` date in `data/meta.json`.

```bash
python scripts/update.py                         # live feed → compare → save → rebuild
python scripts/update.py --dry-run               # only print the report, write nothing
python scripts/update.py --html data/raw/eg.html # use a page saved from the browser instead of the feed
python scripts/update.py --no-build              # save data + CHANGELOG, don't rebuild dist/
python scripts/update.py --report report.md      # also write the report to a file (PR body)
python scripts/update.py --force                 # save + rebuild even if nothing changed
```

| Option | Meaning |
|---|---|
| `--html FILE` | Read a saved HTML page instead of the live feed (see [RECIPES → feed blocked](RECIPES.md#the-live-feed-is-blocked--fails)). |
| `--dry-run` | Show what would change; don't touch any file. |
| `--no-build` | Skip the rebuild (the GitHub Action uses this; the deploy workflow builds after merge). |
| `--report FILE` | Write the change report to `FILE`. Reports over 60,000 characters are truncated (GitHub's PR body limit); the full one is still in `CHANGELOG.md`. |
| `--force` | Write files and rebuild even with no changes (e.g. to move the data date to today). |

**Compared fields:** name, type, governorate, area, address, phone – matched by the facility's unique id.
A facility that is renamed keeps its id, so it shows as *Changed*, not *Removed + Added*.

**Report:** a summary table (Added / Removed / Changed, each with how many are in Cairo & Giza), then a table per
category. Cairo & Giza rows are listed first. *Changed* rows show ~~old~~ → new per field.

**Writes:** `data/facilities.json` (sorted by governorate, type, name; one record per line), `data/meta.json`
(`snapshot` and `checked` = today, `source`, `count`), `CHANGELOG.md` (newest first), `dist/…` unless `--no-build`.
With no changes (and no `--dry-run`) it writes only `checked` = today in `data/meta.json`.
When running inside GitHub Actions it also writes `summary=` and `date=` to `$GITHUB_OUTPUT` for the PR title.

| Exit code | Meaning |
|---|---|
| `0` | Changes found and written (or `--dry-run` with changes) |
| `3` | No changes – only the `checked` date is written |
| `1` | Could not read the source (network blocked, format changed, empty page) |

---

## build.py

Builds the page from `src/` + `data/` + `config/` + `vendor/`.

```bash
python scripts/build.py                 # default site (Cairo & Giza)
python scripts/build.py --site egypt    # another site defined in config/regions.json
python scripts/build.py --list-sites    # show available sites
```

**Outputs** (for site slug `cairo-giza`):

| Path | What |
|---|---|
| `dist/cairo-giza-medical-network.html` | **The single file.** Everything inlined: CSS, JS, PDF library, data (~0.9 MB). Works offline from anywhere. |
| `dist/site/` | The website for GitHub Pages: `index.html` (same page), `manifest.webmanifest`, `sw.js`, `icons/`, `.nojekyll`. |

Non-default sites go to `dist/<slug>-medical-network.html` and `dist/site-<slug>/`.

**Steps:**
1. Load the facilities and enrich them for the site's governorates ([enrich.py](#enrichpy)).
2. Fill placeholders in the source files:

   | Placeholder | Becomes |
   |---|---|
   | `__AREA__` | site title, e.g. *Cairo & Giza* (HTML- or JS-escaped as needed) |
   | `__SNAPSHOT__` | data date (last time the list changed), e.g. *08 Oct 2026* |
   | `__CHECKED__` | last date the list was confirmed as current (never earlier than the data date) |
   | `__BUILT__` | build date |
   | `__SLUG__` | site slug, used in file names of exports |
   | `__REPO__` | GitHub repo URL |
   | `__TYPES__` | facility types from `config/types.json` (only those present) |
   | `__ALIASES__` | district search nicknames from `config/districts.json` |
   | `__FAVICON__` | `src/icons/icon.svg` as a data URL |
   | `__DATA__`, `__PDFLIB__` | facility rows, jsPDF libraries |
   | `__VERSION__` (sw.js) | hash of the page – a new build makes browsers refresh their offline copy |

3. Insert `src/pdf.js` into `app.js` at `/* @@include pdf.js@@ */`, then inline `styles.css` and `app.js`.
4. Safety checks: fails if a placeholder is left over or if CSS/JS contains a closing `</script>`/`</style>` tag.

Unknown facility types found in the data are added automatically with a title-cased label.

---

## screenshots.py

Re-creates the images in `docs/screenshots/` used by the README, from the built single file, with a clean browser
profile (none of your favourites or notes).

```bash
python scripts/build.py
python scripts/screenshots.py
```

Creates `desktop-light.png`, `desktop-dark-list.png`, `pdf-dialog.png`, `mobile.png`, and (with PyMuPDF installed)
`pdf-cover.png`, `pdf-page.png`. Needs the dev requirements – see [Tests](#tests).

---

## source.py

Library used by `update.py`. Produces the same **normalised records** from either source:

```json
{"id": "…uuid…", "name": "Al Borg Lab (Helmiat Al Zeiton)", "type": "laboratory", "gov": "Cairo",
 "area": "", "addr": "115 Selim Al Awal Street, Ain Shams, Cairo, Egypt", "tel": "+20 11 1777 2814 / +20 19911"}
```

| Function | Purpose |
|---|---|
| `fetch_api(country="EG")` | GET `https://www.bupaglobal.com/FacilitiesFinder/GetFacilityByCountry/EG` – the JSON the official page loads when you expand a country. Sends an honest User-Agent with the repo URL. Raises if the response isn't the expected list. |
| `parse_saved_html(path)` | Fallback: reads an HTML file of the expanded country section (`li[data-facility-id]` items with `h4` name, `span.address`, `span.tel`, grouped under `h2` city and `div.filter-type-*`). |
| `get_records(html_path=None)` | Picks the source, removes duplicate ids, sorts. |

Normalisation: whitespace cleaned; type → slug (`"Physical Therapy Centre"` → `physical-therapy-centre`);
city → governorate via `config/regions.json` → `governorate_aliases` (case-insensitive). An unlisted value like
`"Dakahlia - Mansoura"` is split into governorate *Dakahlia* and area *Mansoura*.

---

## enrich.py

Library used by `build.py`; turns records into **display rows** for the page:

```json
{"id": "…", "n": "name", "t": "type", "r": "governorate", "d": "district", "b": "brand",
 "a": "address", "tel": "phone text", "p": [{"label": "+20 11 1777 2814", "href": "+201117772814"}]}
```

1. **District** – using the rule group in `config/districts.json` for the governorate: *strong* rules on the address,
   then the name; otherwise *weak* rules on the address. The match that ends **latest** in the text wins (addresses
   usually go street → area → city). No match → `Other <governorate>`. Governorates without rules use the source
   area, or the governorate itself. `district_gov` can move a district to its real governorate.
2. **Brand** – first matching pattern in `config/brands.json` (empty = independent).
3. **Overrides** – fields from `data/overrides.json` replace the computed ones.
4. **Phones** – split on `/`, `,`, ` - `, ` or ` and before `+`; normalised to dialable `+20…` links
   (handles `002…`, `0…`, bare `1xxxxxxxxx`, and mobiles written with a landline prefix like `(02) 011…`).

Run it directly to audit district detection:

```bash
python scripts/enrich.py          # facilities per district, Cairo & Giza
python scripts/enrich.py -u       # … plus every facility that landed in "Other Cairo/Giza"
python scripts/enrich.py --all    # all governorates
```

---

## common.py

Shared constants and helpers: paths (`ROOT`, `DATA`, `CONFIG`, `SRC`, `VENDOR`, `DIST`, `FACILITIES`, `META`,
`OVERRIDES`, `CHANGELOG`), `load_json` (accepts files saved with a BOM by Windows editors), `save_json`
(`compact_rows=True` = one object per line), `config(name)` and `clean_ws`.

---

## Tests

```bash
pip install -r requirements-dev.txt          # playwright, pymupdf
python -m playwright install chromium        # once
python scripts/build.py
python tests/ui_test.py
python tests/pdf_test.py
```

| Test | Checks |
|---|---|
| `ui_test.py` | Title/subtitle/disclaimer · notice dismiss persists · old saved data migrates · search incl. nicknames and empty state · menu, copy, tags, tag filter, notes · recent · list view + persistence · dark mode · backup/CSV file names and contents · no sideways scroll at 360 px · website: manifest, service worker, icons, **works offline** · no JavaScript errors |
| `pdf_test.py` | Downloads 3 PDF variants (all/table/portrait, all/cards/landscape, favourites/cards/portrait) · file names · cover wording · clickable links · empty result disables download · no JavaScript errors |

Both print `ok` / `FAIL` per check and exit `1` if anything failed.

| Environment variable | Effect |
|---|---|
| `SHOTS=folder` | Save screenshots and rendered PDF pages there for a visual review |
| `PW_CHANNEL=msedge` / `chrome` / *(empty)* | Browser to use. Default: Edge on Windows, Playwright's Chromium elsewhere |

---

## Workflows

### `.github/workflows/update-data.yml` – Check for data updates
- **Runs:** Mondays 06:00 UTC, or *Run workflow* by hand.
- **Does:** `python scripts/update.py --no-build --report $RUNNER_TEMP/report.md`
  - exit `3` → if `data/meta.json` got a new `checked` date, commit it to `main` (*Data checked YYYY-MM-DD: no
    changes*) and start *Build & deploy* with `gh workflow run` (a push made with `GITHUB_TOKEN` doesn't trigger
    other workflows by itself). The site, the release file and the README badge then show the new *last checked* date;
  - exit `0` → [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request) opens or updates
    the PR from branch `data-update`, title *Data update YYYY-MM-DD: N added, N removed, N changed*, body = report,
    label `data-update`;
  - exit `1` → the run fails with a hint to update locally.
- **Needs:** *Allow GitHub Actions to create and approve pull requests* (Settings → Actions → General).

### `.github/workflows/deploy.yml` – Build & deploy
- **Runs:** push to `main` touching `src/ data/ config/ scripts/ vendor/ tests/` or the workflow; pull requests; by hand.
- **Jobs:**
  1. `build` – build, install Playwright, run both tests, upload the website and the single file as artifacts.
  2. `deploy` (main only) – publish `dist/site` to GitHub Pages.
  3. `release` (main only) – create release `data-<snapshot date>`, or update it if that tag already exists:
     the notes (data date, last checked, build time, commit) and the attached `cairo-giza-medical-network.html` are
     replaced, and the tag stays on the commit where it was first created. A new tag is made only when the data changes.
- **Needs:** Settings → Pages → Source: *GitHub Actions*.

### `.github/dependabot.yml` – Keep the Actions up to date
- **Runs:** monthly. Opens one grouped PR (label `dependencies`) bumping the actions used by the workflows; the
  *Build & deploy* checks run on it – merge when green.

### `.github/ISSUE_TEMPLATE/wrong-info.yml` – Report wrong facility info
- An issue form (label `wrong-info`) linked from the page footer. Fix confirmed reports in `data/overrides.json`
  ([recipe](RECIPES.md#fix-one-facility)).
