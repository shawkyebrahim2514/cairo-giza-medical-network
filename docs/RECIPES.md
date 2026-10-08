# Recipes & troubleshooting

Step-by-step instructions for common jobs. Commands run from the repository root. After any change:
`python scripts/build.py`, open `dist/cairo-giza-medical-network.html` to check, then commit and push – the site
and release update automatically.

**Recipes**
- [Update the data yourself](#update-the-data-yourself)
- [Review a data-update pull request](#review-a-data-update-pull-request)
- [Fix one facility](#fix-one-facility)
- [A facility is in "Other Cairo" / wrong district](#a-facility-is-in-other-cairo--wrong-district)
- [Add a search nickname for a district](#add-a-search-nickname-for-a-district)
- [Add or fix a brand / chain](#add-or-fix-a-brand--chain)
- [A strange governorate appears after an update](#a-strange-governorate-appears-after-an-update)
- [Build another region](#build-another-region)
- [Change colours, logo or wording](#change-colours-logo-or-wording)
- [Make a release by hand](#make-a-release-by-hand)
- [Upgrade the PDF libraries](#upgrade-the-pdf-libraries)

**Troubleshooting**
- [The live feed is blocked / fails](#the-live-feed-is-blocked--fails)
- [The site still shows old data](#the-site-still-shows-old-data)
- [My favourites / notes are missing](#my-favourites--notes-are-missing)
- [The build fails](#the-build-fails)
- [GitHub: no weekly pull request / Pages 404 / tests fail](#github-no-weekly-pull-request--pages-404--tests-fail)

---

## Update the data yourself

```bash
python scripts/update.py --dry-run     # read the report first
python scripts/update.py               # save + CHANGELOG + rebuild
git add -A
git commit -m "Data update $(date +%F)"
git push
```

## Review a data-update pull request

The weekly bot opens a PR titled *Data update YYYY-MM-DD: N added, N removed, N changed*.

1. Read the report in the PR description – Cairo & Giza rows are listed first.
2. Optional but useful: check where new facilities landed. Locally:
   ```bash
   git fetch origin data-update && git switch data-update
   python scripts/enrich.py -u          # lists facilities in "Other Cairo/Giza"
   ```
   Fix any with the recipes below and push to the same branch.
3. **Merge.** The deploy workflow builds, tests and publishes. Delete the branch if GitHub asks.

## Fix one facility

Wrong district, a typo in the name, a bad phone number – fix it in `data/overrides.json` so it survives updates.

1. Find the facility id:
   ```bash
   python -c "import json; [print(r['id'], '|', r['name'], '|', r['addr']) for r in json.load(open('data/facilities.json', encoding='utf-8')) if 'zamalek' in (r['name'] + r['addr']).lower()]"
   ```
   (or search the name in `data/facilities.json` with your editor).
2. Add an entry – only the fields you want to change ([field list](DATA.md#dataoverridesjson)):
   ```json
   {
     "_doc": "…",
     "31772f4b-c0e2-4142-a00e-3fb442bf9f69": { "d": "Zamalek", "tel": "+20 2 2735 0000" }
   }
   ```
3. `python scripts/build.py` and check the facility in the page.

## A facility is in "Other Cairo" / wrong district

Districts come from keywords in the address. If a whole area is missing, teach it once in `config/districts.json`
instead of overriding facilities one by one.

1. See what isn't matched:
   ```bash
   python scripts/enrich.py -u
   ```
2. Add a rule to the right list in `groups[0]`:
   - an **area name** (*"Rehab"*, *"Sheraton"*) → `strong`: `["rehab( city)?", "New Cairo", null]`
   - a **street or landmark** (*"Mostafa El Nahas"*) → `weak`: `["mostafa el nahh?as", "Nasr City", "Cairo"]`
   - a **new district** → also add it to `district_gov`: `"Rehab": "Cairo"`
3. Run `python scripts/enrich.py -u` again – the facility should have moved – then rebuild.

Tips: regexes are case-insensitive; allow spelling variants (`mohandess?[ei]n`); keep the third value `null`
unless the same name exists in both governorates. When several rules match, the one **later** in the address wins.

## Add a search nickname for a district

In `config/districts.json` → `aliases`, add words separated by spaces:
```json
"New Cairo": "tagamoa tagamo3 fifth settlement 5th settlement katameya 90 street"
```
Searching any of these now finds the district's facilities.

## Add or fix a brand / chain

In `config/brands.json` add `["Display name", "regex on the facility name"]` **above** more generic patterns:
```json
["Cleopatra Hospitals", "^cleopatra|cairo specialized hospital|nile badrawi"]
```
Rebuild and check the *Brand* filter.

## A strange governorate appears after an update

The source sometimes misspells cities (*"Cairoq"*, *"Ismalia"*). The report shows them in the *Governorate* column.
Add the raw value to `config/regions.json` → `governorate_aliases` (lower-case):
```json
"giza governorate": "Giza"
```
then run `python scripts/update.py` – the affected facilities show up as *Changed* (new governorate) and are saved.

## Build another region

The data already holds all of Egypt.

```bash
python scripts/build.py --list-sites
python scripts/build.py --site egypt          # whole country → dist/egypt-medical-network.html
```

To add a site, e.g. Alexandria, in `config/regions.json` → `sites`:
```json
"alexandria": { "title": "Alexandria", "slug": "alexandria", "governorates": ["Alexandria"] }
```
```bash
python scripts/build.py --site alexandria     # → dist/alexandria-medical-network.html + dist/site-alexandria/
```
Without district rules, facilities are grouped by the area given in the source (or the governorate). For proper
districts, add a group to `config/districts.json`:
```json
{ "governorates": ["Alexandria"], "strong": [["smouha", "Smouha", null], ["sidi gaber", "Sidi Gaber", null]],
  "weak": [], "district_gov": { "Smouha": "Alexandria", "Sidi Gaber": "Alexandria" } }
```
The hosted website stays Cairo & Giza (the `default_site`); share other regions as single files.

## Change colours, logo or wording

| What | Where |
|---|---|
| Page colours (light + dark) | `src/styles.css` → variables at the top: `:root{--brand:…; --slate:…}` and `[data-theme="dark"]{…}` |
| PDF colours | `src/pdf.js` → the `C` colour object |
| Browser/app bar colour | `src/index.html` `<meta name="theme-color">` and `src/manifest.webmanifest` |
| Logo | `src/icons/icon.svg` (also used as favicon) and the `i-logo` symbol in `src/index.html`. Re-export `icon-192.png` / `icon-512.png` from the SVG with any SVG→PNG tool |
| Texts, notice, footer | `src/index.html` (header, notice, footer), `src/pdf.js` (cover, footer) |
| Facility type colours/icons | Colours: `--t-<type>` variables in `src/styles.css` (light + dark) and `TYPE_HEX` in `src/pdf.js`. Icons: `<symbol id="i-<type>">` in `src/index.html` |

Run `python tests/ui_test.py` after bigger changes, and `python scripts/screenshots.py` to refresh the README images.

## Make a release by hand

Actions → **Build & deploy** → **Run workflow** on `main`. It rebuilds, publishes and updates the release for the
current snapshot date. Or locally: `python scripts/build.py`, then create a release on GitHub and attach
`dist/cairo-giza-medical-network.html`.

## Upgrade the PDF libraries

```bash
curl -L -o vendor/jspdf.umd.min.js https://cdn.jsdelivr.net/npm/jspdf@latest/dist/jspdf.umd.min.js
curl -L -o vendor/jspdf.plugin.autotable.min.js https://cdn.jsdelivr.net/npm/jspdf-autotable@latest/dist/jspdf.plugin.autotable.min.js
python scripts/build.py
python tests/pdf_test.py
```
Pin a version instead of `@latest` if a new major release breaks the PDF.

---

## The live feed is blocked / fails

`update.py` exits with code 1 and *"could not read the source"*. Use the manual method (the original way the data
was collected):

1. Open the [official facilities page](https://www.bupaglobal.com/en/facilities/full-list) in your browser.
2. Expand **Egypt** and wait until the list has loaded.
3. Right-click the Egypt section → **Inspect**. In DevTools, right-click the highlighted element →
   **Copy → Copy outerHTML**, paste it into a new file `data/raw/egypt.html` and save as UTF-8.
   (*File → Save page as → Web page, complete* also works.)
4. Run:
   ```bash
   python scripts/update.py --html data/raw/egypt.html --dry-run
   python scripts/update.py --html data/raw/egypt.html
   ```

If GitHub's servers are blocked but your computer isn't, just run `python scripts/update.py` locally and push.
If the feed's format changed, `source.py` → `fetch_api()` is the only place to adapt.

## The site still shows old data

The website keeps an offline copy. When online it always tries the network first, so a normal **reload** shows
the new version. An installed app may need to be closed and reopened. Check the snapshot date in the footer.
The single file never updates itself – download the new one from the latest release.

## My favourites / notes are missing

Personal data lives in the browser where you created it. The live site and the installed app have their own
storage, separate from the single file; copies of the file may or may not share storage depending on the browser.
Use **Backup** (footer) where the data is and **Restore** where you want it. Clearing browsing data or using a
private/incognito window deletes it. Data from the old `bupa-cairo-giza.html` is migrated automatically when the
new file is opened in the same browser (Chrome/Edge).

## The build fails

| Message | Fix |
|---|---|
| `data/facilities.json is missing or empty` | Run `python scripts/update.py` |
| `Unknown site '…'` | Check the name with `--list-sites` |
| `Unreplaced placeholders: [...]` | A placeholder in `src/` is misspelt, or a new one isn't handled in `build.py` |
| `… must not contain a closing </script>` | Write `<\/script>` inside JavaScript strings |
| `json.decoder.JSONDecodeError …` | Syntax error in a config/override file – check commas/quotes: `python -m json.tool data/overrides.json` |

## GitHub: no weekly pull request / Pages 404 / tests fail

- **No PR, run says "could not fetch"** → the feed is blocked from GitHub; update locally ([above](#the-live-feed-is-blocked--fails)).
- **No PR, run says "not permitted to create pull requests"** → Settings → Actions → General → tick
  *Allow GitHub Actions to create and approve pull requests*.
- **No PR, run green** → nothing changed that week (exit code 3).
- **Pages shows 404** → Settings → Pages → Source must be *GitHub Actions*; then re-run *Build & deploy*.
- **Tests fail in Actions** → open the run log; each failed check is listed as `FAIL …`. Reproduce locally with
  `SHOTS=shots python tests/ui_test.py` and look at the screenshots. Nothing is deployed while tests fail.
