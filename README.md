# Cairo & Giza Medical Network

An **unofficial**, fast, offline-friendly directory of the hospitals, clinics, labs, pharmacies and other medical
facilities in **Cairo & Giza** that are part of the **Bupa Global** network (from its public facility list) – so you can
search, filter and locate them easily.

**🌐 Live site:** https://shawkyebrahim2514.github.io/cairo-giza-medical-network/
**📄 Offline single file:** grab `cairo-giza-medical-network.html` from the
[latest release](https://github.com/shawkyebrahim2514/cairo-giza-medical-network/releases/latest) and open it in any
browser – no internet or install needed.

> ⚠️ Not affiliated with or endorsed by any insurer. Data is a periodic snapshot and may be out of date or wrong –
> **always confirm your cover with your insurer before treatment.** See [DISCLAIMER.md](DISCLAIMER.md).

## Features

- **Smart search** – typo-tolerant, understands area nicknames (*tagamoa* → New Cairo, *mohandeseen* → Mohandessin) and phone numbers
- **Filters** – governorate, district, facility type, brand/chain, your tags; shareable links of any filtered view
- **Grouped results** by district, type or brand with a jump bar; cards or compact list view
- **One-tap actions** – call, open in Google Maps, copy details, share
- **Personal data (stays in your browser)** – favourites ★, private notes, custom tags, recently used
- **Exports** – designed PDF (preview first; table or cards, portrait or landscape, cover & contents), CSV for Excel, backup/restore of your personal data
- **Comfort** – dark mode, text size, keyboard shortcuts (`/` search, `?` help), mobile-friendly
- **Installable app (PWA)** from the live site – works offline after the first visit

## How it works

```
live facility feed ──► scripts/update.py ──► data/facilities.json  (all of Egypt, committed)
                                                   │
                     config/*.json (districts, brands, types, regions) + data/overrides.json
                                                   ▼
          src/ (HTML, CSS, JS) ──► scripts/build.py ──► dist/cairo-giza-medical-network.html  (one offline file)
                                                    └─► dist/site/  (GitHub Pages + PWA)
```

- **Weekly**, a GitHub Action (`update-data.yml`) fetches the list. If anything changed it opens a pull request with a
  readable report (added / removed / changed, Cairo & Giza first) and a `CHANGELOG.md` entry.
- **Merging** to `main` triggers `deploy.yml`: build → browser tests → GitHub Pages → a Release (`data-YYYY-MM-DD`) with
  the single offline file attached.

## Working locally

Requirements: Python 3.10+ (no packages needed for building).

```bash
python scripts/build.py                # → dist/cairo-giza-medical-network.html + dist/site/
python scripts/update.py --dry-run     # fetch the live list and show what changed (writes nothing)
python scripts/update.py               # update data/, CHANGELOG.md and rebuild
```

If the live feed is ever blocked, save the facilities page yourself (expand the country section, then in DevTools
*Copy element* / save the page) and use it instead:

```bash
python scripts/update.py --html path/to/saved-page.html
```

`update.py` exit codes: `0` changes written, `3` no changes, `1` error.
Saved pages belong in `data/raw/` (git-ignored).

### Tests

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium
python tests/ui_test.py        # search, filters, notes/tags, exports, mobile layout, PWA/offline
python tests/pdf_test.py       # PDF variants (needs pymupdf for content checks)
```

Set `SHOTS=some/folder` to save screenshots / rendered PDF pages for a visual check.
On Windows the tests use Microsoft Edge; set `PW_CHANNEL=` (empty) to use Playwright's Chromium instead.

## Customising

| I want to… | Edit |
|---|---|
| Change the page, styles or behaviour | `src/index.html`, `src/styles.css`, `src/app.js`, `src/pdf.js` (PDF export) |
| Fix one facility's district, name, phone… | `data/overrides.json` – e.g. `{"<facility id>": {"d": "New Cairo"}}` (survives data updates) |
| Teach a new neighbourhood name | `config/districts.json` (see below) |
| Detect a new chain/brand | `config/brands.json` – `["Brand name", "regex matched against the facility name"]` |
| Fix a misspelt city from the source | `config/regions.json` → `governorate_aliases` |

### Districts

`config/districts.json` has `groups`, one per set of governorates:

- `strong` rules – `[regex, district, only-for-governorate or null]` – checked against the address and then the name.
- `weak` rules – same format, checked against the address only (used when no strong rule matched).
- When several rules match, the one matching **latest** in the text wins. If none match, the facility goes to "Other <governorate>".
- `district_gov` maps each district to its governorate.
- `aliases` adds extra search words for a district (`"New Cairo": "tagamoa fifth settlement …"`).

### Other regions

`data/facilities.json` always contains **all of Egypt**. The hosted site shows Cairo & Giza. To build another region:

```bash
python scripts/build.py --list-sites
python scripts/build.py --site egypt   # → dist/egypt-medical-network.html + dist/site-egypt/
```

Add your own site to `config/regions.json` → `sites`, e.g.
`"alex": {"title": "Alexandria", "slug": "alexandria", "governorates": ["Alexandria"]}`.
Governorates without district rules are grouped by the city/area given in the source. Add a `groups` entry in
`config/districts.json` to get proper districts.

## Setting up the GitHub repo (one time)

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Actions → General → Workflow permissions:** tick *Allow GitHub Actions to create and approve pull requests*.
3. Run **Actions → Check for data updates → Run workflow** once to confirm the feed is reachable from GitHub.
   If it's blocked there, run `python scripts/update.py` locally and push.

Pull requests opened by the bot don't trigger checks themselves (GitHub's rule for its own token), but merging runs the full build, tests and deploy.

## Repository layout

```
src/            page source: index.html, styles.css, app.js, pdf.js, manifest, service worker, icons
data/           facilities.json (snapshot, all Egypt), meta.json, overrides.json, raw/ (local only)
config/         districts, brands, facility types, regions/sites
scripts/        update.py (fetch + diff), build.py (bundle), enrich.py, source.py, common.py
tests/          Playwright UI + PDF tests
vendor/         jsPDF + AutoTable (MIT), inlined into the build
dist/           build output (git-ignored)
```

## Credits & licence

Made by [Shawky Ebrahim](https://github.com/shawkyebrahim2514), built with GitHub Copilot CLI.
Code: [MIT](LICENSE). The facility data is **not** covered by the MIT licence – see [DISCLAIMER.md](DISCLAIMER.md).
PDF export uses [jsPDF](https://github.com/parallax/jsPDF) and [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) (MIT).
