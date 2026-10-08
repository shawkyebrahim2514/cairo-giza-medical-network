"""UI regression test for the built single file + hosted site.  Run:  python tests/ui_test.py
(build first with: python scripts/build.py).  Set SHOTS=<folder> to save screenshots."""
import json
import re
import sys

from playwright.sync_api import sync_playwright

from helpers import SINGLE, SITE, check, file_url, finish, launch, serve, shot

URL = file_url(SINGLE)

with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={"width": 1400, "height": 950}, permissions=["clipboard-read", "clipboard-write"])
    errs = []
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))

    # data saved by an older version (old key prefix) must be migrated
    pg.goto(URL)
    first_id = pg.evaluate("JSON.parse(document.getElementById('data').textContent)[0].id")
    pg.evaluate(f"localStorage.clear(); localStorage.setItem('bupaCG.favs', JSON.stringify(['{first_id}']))")
    pg.reload(); pg.wait_for_timeout(600)
    print("load + branding")
    check(pg.evaluate("localStorage.getItem('cgmn.favs')") == json.dumps([first_id]), "old favourites migrated to new storage key")
    check(pg.inner_text("#favCount").strip() in ("(1)", "1"), f"favourite count after migration: {pg.inner_text('#favCount')!r}")
    count = pg.inner_text("#count")
    check(re.search(r"1,1\d\d", count) is not None, f"facility count shown: {count!r}")
    check("Cairo & Giza" in pg.title() and "Bupa" not in pg.title(), f"title de-branded: {pg.title()!r}")
    check(pg.inner_text(".brand h1").startswith("Cairo & Giza Medical Network"), "header title")
    check(pg.is_visible("#notice"), "unofficial notice visible on first visit")
    check("not affiliated" in pg.inner_text(".foot .disclaimer"), "footer disclaimer present")
    check("Bupa" not in pg.inner_text(".brand"), "no Bupa name in the header")
    shot(pg, "01-cards")
    pg.click("#noticeClose"); pg.reload(); pg.wait_for_timeout(400)
    check(not pg.is_visible("#notice"), "notice stays dismissed after reload")

    print("search")
    for q, expect in (("maadi", "Maadi"), ("mohandeseen", "Mohandessin"), ("tagamoa", "New Cairo")):
        pg.fill("#q", q); pg.wait_for_timeout(350)
        groups = pg.locator("#results details.group summary h2").all_inner_texts()
        check(any(expect in g for g in groups), f"search {q!r} finds group {expect!r}")
    pg.fill("#q", "xqxqxqv"); pg.wait_for_timeout(300)
    check(pg.locator("#results .empty").count() == 1, "nonsense search shows empty state")
    pg.fill("#q", ""); pg.wait_for_timeout(300)

    print("card menu, copy, tags, notes")
    card = pg.locator("#results .card").first
    card.locator("[data-act=more]").click(); pg.wait_for_timeout(150)
    check(pg.is_visible("#cardMenu"), "More menu opens")
    check(pg.locator("#cardMenu [data-mact=src]").get_attribute("href") == "https://www.bupaglobal.com/", "menu links only to the insurer homepage")
    pg.keyboard.press("Escape"); check(not pg.is_visible("#cardMenu"), "Esc closes menu")
    card.locator("[data-act=more]").click(); pg.click("[data-mact=copy]"); pg.wait_for_timeout(250)
    check(len(pg.evaluate("navigator.clipboard.readText()")) > 20, "copy details puts text on clipboard")
    card.locator("[data-act=more]").click(); pg.click("[data-mact=tag]"); pg.wait_for_timeout(150)
    pg.keyboard.type("my lab"); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    check("my lab" in (pg.evaluate("localStorage.getItem('cgmn.tags')") or ""), "tag saved")
    pg.locator("#f-tag input").first.check(); pg.wait_for_timeout(300)
    check(pg.inner_text("#count").startswith("Showing 1 "), f"tag filter: {pg.inner_text('#count')!r}")
    pg.click("#clearAll2"); pg.wait_for_timeout(300)
    card = pg.locator("#results .card").first
    card.locator("[data-act=more]").click(); pg.click("[data-mact=note]"); pg.keyboard.type("Good service"); pg.wait_for_timeout(700)
    check("1" in pg.inner_text("#noteCount"), "note saved")

    print("recent + list view + theme")
    pg.evaluate("document.addEventListener('click', e => { if (e.target.closest('a[data-track], a[href^=\"tel:\"]')) e.preventDefault(); }, true)")
    pg.locator("#results .card").nth(3).locator("a.act.call").click()
    pg.locator("#results .card").nth(5).locator("a[data-track=map]").click(); pg.wait_for_timeout(150)
    check("3" in pg.inner_text("#recentCount"), f"recent count: {pg.inner_text('#recentCount')!r}")
    pg.click("[data-view=list]"); pg.wait_for_timeout(300)
    first = pg.locator("#results .card").first
    first.locator("h3").click(); pg.wait_for_timeout(150)
    check("open" in first.get_attribute("class"), "list row expands")
    pg.click("#themeBtn"); pg.wait_for_timeout(200); shot(pg, "02-list-dark"); pg.click("#themeBtn")
    pg.reload(); pg.wait_for_timeout(500)
    check("list-view" in (pg.get_attribute("#results", "class") or ""), "view mode persisted")
    pg.click("[data-view=cards]")

    print("exports")
    with pg.expect_download() as d:
        pg.click("#exportData")
    check(d.value.suggested_filename == "medical-network-cairo-giza-my-data.json", f"backup name {d.value.suggested_filename}")
    check(set(json.load(open(d.value.path(), encoding="utf-8"))) >= {"favs", "notes", "tags", "recent"}, "backup has all keys")
    with pg.expect_download() as d:
        pg.click("#exportCsv")
    check(d.value.suggested_filename.startswith("medical-network-cairo-giza-"), f"CSV name {d.value.suggested_filename}")
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(200); shot(pg, "03-footer")
    check(not pg.is_visible("#installBtn"), "no install button when opened as a local file")

    print("mobile")
    m = ctx.new_page(); m.set_viewport_size({"width": 360, "height": 780})
    m.on("pageerror", lambda e: errs.append("mobile: " + str(e)))
    m.goto(URL); m.wait_for_timeout(500)
    check(m.evaluate("document.documentElement.scrollWidth") <= 360, "no horizontal scroll at 360px (cards)")
    shot(m, "04-mobile")
    m.click("[data-view=list]"); m.wait_for_timeout(250)
    check(m.evaluate("document.documentElement.scrollWidth") <= 360, "no horizontal scroll at 360px (list)")

    print("hosted site (PWA)")
    url, stop = serve(SITE)
    s = ctx.new_page(); s.on("pageerror", lambda e: errs.append("site: " + str(e)))
    s.goto(url); s.wait_for_timeout(800)
    check(s.evaluate("!!document.querySelector('link[rel=manifest]')"), "manifest linked when served over http")
    check(s.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)"), "service worker active")
    man = s.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    check(man["name"] == "Cairo & Giza Medical Network" and len(man["icons"]) >= 3, "manifest content")
    check(s.evaluate("fetch('icons/icon-512.png').then(r => r.ok)"), "icons served")
    ctx.set_offline(True); s.reload(); s.wait_for_timeout(600)
    check(s.locator("#results .card").count() > 0, "site works offline after first visit")
    ctx.set_offline(False); stop()

    check(not errs, f"no JS errors ({errs[:3]})")
    b.close()

sys.exit(finish())
