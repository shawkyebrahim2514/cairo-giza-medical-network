"""PDF export test: builds several variants, downloads them and checks pages/links.  Run: python tests/pdf_test.py
Optional: pip install pymupdf  -> also inspects the PDFs (text, links, page count) and renders previews if SHOTS is set."""
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

from helpers import SHOTS, SINGLE, check, file_url, finish, launch

URL = file_url(SINGLE)
OUT = SHOTS or tempfile.mkdtemp(prefix="cgmn-pdf-")
try:
    import pymupdf
except ImportError:
    pymupdf = None


def ready(pg):
    pg.wait_for_function("document.querySelector('#pdfInfo').textContent.includes('page')", timeout=90000)


def inspect(path, name):
    if not pymupdf:
        return
    d = pymupdf.open(path)
    text = d[0].get_text() + (d[1].get_text() if d.page_count > 1 else "")
    cover = d[0].get_text()
    check("BUPA GLOBAL NETWORK" in cover and "UNOFFICIAL" in cover, f"{name}: cover names the network and says unofficial")
    check("Unofficial" in text or "UNOFFICIAL" in text, f"{name}: unofficial notice in PDF")
    links = sum(len(p.get_links()) for p in d)
    check(links > 0, f"{name}: has clickable links ({links})")
    if SHOTS:
        for i in sorted({0, 1, 2, min(3, d.page_count - 1)}):
            if i < d.page_count:
                d[i].get_pixmap(dpi=70).save(os.path.join(OUT, f"{name}-p{i + 1}.png"))


with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    errs = []
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.evaluate("""() => { const ids = JSON.parse(document.getElementById('data').textContent).slice(0, 40).map(f => f.id);
      localStorage.setItem('cgmn.favs', JSON.stringify(ids.slice(0, 6)));
      localStorage.setItem('cgmn.notes', JSON.stringify({[ids[0]]: 'Ask for reception → great service ★'}));
      localStorage.setItem('cgmn.tags', JSON.stringify({[ids[0]]: ['my lab', 'kids']})); }""")
    pg.reload()
    pg.click("#pdfBtn"); ready(pg); pg.wait_for_timeout(800)
    if SHOTS:
        pg.screenshot(path=os.path.join(OUT, "pdf-dialog.png"))
    for name, scope, layout, orient in (("all-table-portrait", "all", "table", "portrait"),
                                        ("all-cards-landscape", "all", "cards", "landscape"),
                                        ("fav-cards-portrait", "fav", "cards", "portrait")):
        for n, v in (("pscope", scope), ("playout", layout), ("porient", orient)):
            pg.check(f"input[name={n}][value={v}]", force=True)
        pg.wait_for_timeout(150); ready(pg)
        info = pg.inner_text("#pdfInfo")
        with pg.expect_download() as d:
            pg.click("#pdfDownload")
        path = os.path.join(OUT, name + ".pdf"); d.value.save_as(path)
        check(d.value.suggested_filename.startswith("medical-network-cairo-giza-"), f"{name}: file name {d.value.suggested_filename}")
        check(os.path.getsize(path) > 5000, f"{name}: {info}")
        inspect(path, name)
    pg.goto(URL + "?q=xqxqxqv"); pg.click("#pdfBtn"); ready(pg)
    check(pg.is_disabled("#pdfDownload"), "empty result: download disabled")
    check(not errs, f"no JS errors ({errs[:3]})")
    b.close()

if not SHOTS:
    import shutil
    shutil.rmtree(OUT, ignore_errors=True)
sys.exit(finish())
